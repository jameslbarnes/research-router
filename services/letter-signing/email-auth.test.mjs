import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {configFromEnv,createApp,parseLetter} from './app.mjs';
import {academicAddress,findInstitution} from './email-auth.mjs';

const institution={id:'https://ror.org/013meh722',status:'active',types:['education'],domains:['cam.ac.uk'],names:[{types:['ror_display'],value:'University of Cambridge'}]};
function setup(t,{enabled=true,deliveryFailure=false,lookupFailure=false,production=true}={}) {
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('./migrations/',import.meta.url)).sort())db.exec(readFileSync(new URL('./migrations/'+file,import.meta.url),'utf8'));
 t.after(()=>db.close());let clock=1000000;const mail=[],queries=[];
 const origin='https://sign.example.org',publicOrigin='https://letter.example.org';
 const config=configFromEnv({APP_ORIGIN:origin,ORCID_ENV:production?'production':'sandbox',ORCID_CLIENT_ID:'fixture',ORCID_CLIENT_SECRET:'fixture',TOKEN_ENCRYPTION_KEY:'ab'.repeat(32),PUBLIC_LETTER_URL:publicOrigin+'/science/',EMAIL_SIGNIN_ENABLED:String(enabled),EMAIL_FROM:'sign@letter.example.org'});
 const letter=parseLetter(readFileSync(new URL('../../site/letter/index.html',import.meta.url),'utf8'));
 const app=createApp({config,db,letter,now:()=>clock,fetchImpl:async url=>{
  queries.push(url);assert.equal(new URL(url).hostname,'api.ror.org','Email identities must not trigger ORCID/coauthor/citation lookups');
  if(lookupFailure)throw new Error('Provider unavailable');return Response.json({number_of_results:1,items:[institution]});
 },sendVerification:async message=>{if(deliveryFailure)throw new Error('private upstream error');mail.push(message);}});
 const call=(path,options={})=>app(new Request(origin+'/letter/api/'+path,options),'fixture-ip');
 const post=(path,data={},options={})=>call(path,{method:'POST',headers:{Origin:options.origin||origin,'X-Letter-Request':'1','Content-Type':'application/json',Cookie:options.cookie||'','X-CSRF-Token':options.csrf||'',...options.headers},body:JSON.stringify(data)});
 const start=(email='researcher@dept.cam.ac.uk',options={origin:publicOrigin})=>post('auth/email/start',{email},options);
 const token=()=>new URL(mail.at(-1).text.match(/https:\/\/\S+/)[0]).hash.slice('#email-token='.length);
 const verify=()=>post('auth/email/verify',{token:token()});
 const login=async()=>{
  const started=await start();assert.equal(started.status,200,await started.clone().text());
  const result=await verify();assert.equal(result.status,200,await result.clone().text());
  const cookie=result.headers.getSetCookie()[0].split(';')[0];const session=await(await call('session',{headers:{Cookie:cookie}})).json();
  return {cookie,csrf:session.csrf,session};
 };
 const payload={name:'Email Researcher',affiliation:'Example department',email:'spoofed@elsewhere.org',updates:false,consent:true,letterHash:letter.hash};
 return {db,config,origin,publicOrigin,call,post,start,verify,token,mail,queries,login,payload,advance:ms=>{clock+=ms;}};
}

test('institution checks require explicit domain boundaries and an active research organization',async()=>{
 assert.equal(academicAddress('x@cam.ac.uk\r\nBcc:a@b.edu'),null);
 assert.equal(academicAddress('x..y@cam.ac.uk'),null);
 assert.equal(academicAddress(' X@Dept.Cam.Ac.Uk ').email,'x@dept.cam.ac.uk');
 const provider=items=>async()=>({number_of_results:items.length,items});
 assert.equal((await findInstitution('dept.cam.ac.uk',provider([institution]),null)).id,institution.id);
 for(const domain of ['cam.ac.uk.attacker.org','evilcam.ac.uk','gmail.com'])assert.equal(await findInstitution(domain,provider([institution]),null),null);
 for(const entry of [{...institution,status:'inactive'},{...institution,types:['company']},{...institution,domains:['notcam.ac.uk']}])assert.equal(await findInstitution('cam.ac.uk',provider([entry]),null),null);
 assert.equal(await findInstitution('cam.ac.uk',provider([institution,{...institution,id:'https://ror.org/ambiguous'}]),null),null);
});

test('email link verifies privately without signing; signature requires current text, CSRF and explicit consent',async t=>{
 const x=setup(t);assert.equal((await x.post('signatures',x.payload)).status,401);
 const user=await x.login();
 assert.equal(user.session.user.method,'email');assert.equal(user.session.user.email,'researcher@dept.cam.ac.uk');
 assert.equal(x.db.prepare('SELECT count(*) AS n FROM signatures').get().n,0);
 assert.equal((await x.post('signatures',x.payload,{cookie:user.cookie})).status,403);
 assert.equal((await x.post('signatures',{...x.payload,consent:false},user)).status,400);
 assert.equal((await x.post('signatures',{...x.payload,letterHash:'old'},user)).status,409);
 assert.equal((await x.post('signatures',x.payload,user)).status,201);
 assert.equal(x.db.prepare('SELECT email FROM signatures').get().email,'researcher@dept.cam.ac.uk');
 const evidence=JSON.parse(x.db.prepare('SELECT evidence FROM signatures').get().evidence);
 assert.equal(evidence.publication.method,'academic-email-verification-v1');
 const result=await(await x.call('signatures')).json();
 assert.equal(result.length,1);assert.equal(result[0].orcid,null);
 assert.ok(!JSON.stringify(result).includes('@'));assert.ok(!JSON.stringify(result).includes('email:'));
 const network=await x.post('coauthors',{},user);assert.equal(network.status,200);assert.deepEqual((await network.json()).candidates,[]);
 assert.ok(x.queries.every(url=>!url.includes('researcher')));
});

test('confirmation links are opaque, single-use, origin-restricted, and cannot be consumed by GET previews',async t=>{
 const x=setup(t);const r=await x.start();assert.deepEqual(await r.json(),{ok:true,expiresIn:600});
 const token=x.token();assert.match(token,/^[\w-]{43}$/);const stored=JSON.stringify(x.db.prepare('SELECT * FROM email_challenges').get());assert.ok(!stored.includes(token));
 assert.ok(x.mail[0].html.includes('<a href="https://sign.example.org/letter/sign/#email-token='));
 assert.equal((await x.call('auth/email/verify?token='+token)).status,404);
 assert.equal((await x.post('auth/email/verify',{token},{origin:'https://evil.example'})).status,403);
 assert.equal((await x.post('auth/email/verify',{token},{origin:x.publicOrigin})).status,400);
 assert.equal((await x.verify()).status,200);assert.equal((await x.verify()).status,400);
 assert.equal(x.db.prepare('SELECT count(*) AS n FROM sessions').get().n,1);
});

test('expired links, disabled email, provider failures, and unknown institutions do not authenticate or publish',async t=>{
 const x=setup(t);await x.start();x.advance(600001);assert.equal((await x.verify()).status,400);
 assert.equal((await x.start('x@cam.ac.uk.attacker.org')).status,400);assert.equal(x.mail.length,1);
 for(const options of [{enabled:false},{deliveryFailure:true},{lookupFailure:true}]){
  const y=setup(t,options);const r=await y.start();assert.equal(r.status,503);assert.ok(!(await r.text()).includes('private upstream'));
  assert.equal(y.db.prepare('SELECT count(*) AS n FROM email_challenges').get().n,0);
  assert.equal(y.db.prepare('SELECT count(*) AS n FROM identities').get().n,0);
 }
});

test('email verification is rate limited and does not publish sandbox or resurrect withdrawn signatures',async t=>{
 const x=setup(t,{production:false});const user=await x.login();await x.post('signatures',x.payload,user);
 assert.deepEqual(await(await x.call('signatures')).json(),[]);
 x.db.prepare("UPDATE signatures SET status='withdrawn'").run();
 const again=await x.login();assert.equal(again.session.signature.status,'withdrawn');
 assert.equal((await(await x.post('signatures',x.payload,again)).json()).signature.status,'withdrawn');
 assert.equal(x.db.prepare('SELECT count(*) AS n FROM signatures').get().n,1);
 assert.equal((await x.start()).status,200);assert.equal((await x.start()).status,429);
});
