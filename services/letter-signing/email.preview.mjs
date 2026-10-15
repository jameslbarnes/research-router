// Isolated browser preview: in-memory DB, fixture registry, captured emails.
// No production credentials, database bindings or outbound email.
import {createServer} from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createApp,configFromEnv,parseLetter} from './app.mjs';
const origin='http://localhost:8876';
const root=resolve(fileURLToPath(new URL('../../site/letter/',import.meta.url)));
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
for(const file of readdirSync(new URL('./migrations/',import.meta.url)).sort())db.exec(readFileSync(new URL('./migrations/'+file,import.meta.url),'utf8'));
const mail=[];
const config=configFromEnv({APP_ORIGIN:origin,ORCID_ENV:'sandbox',EMAIL_SIGNIN_ENABLED:'true',EMAIL_FROM:'sign@example.org'});
const letter=parseLetter(readFileSync(resolve(root,'index.html'),'utf8'));
const app=createApp({config,db,letter,sendVerification:async message=>mail.push(message),fetchImpl:async url=>{
 if(new URL(url).hostname!=='api.ror.org')throw new Error('External services are disabled in this fixture preview.');
 return Response.json({number_of_results:1,items:[{id:'https://ror.org/013meh722',status:'active',types:['education'],domains:['cam.ac.uk'],names:[{types:['ror_display'],value:'University of Cambridge'}]}]});
}});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg'};
createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,origin);
  if(url.pathname==='/preview-inbox') {
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
   res.end('<h1>Local test inbox</h1><p>No emails were sent. Use researcher@cam.ac.uk on the signing page.</p><a href="/letter/sign/">Open signing preview</a>'+mail.map(m=>'<hr>'+m.html).join(''));return;
  }
  if(url.pathname.startsWith('/letter/api/')) {
   const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>8192){res.writeHead(413).end();return;}chunks.push(chunk);}
   const response=await app(new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),'preview');
   const headers=Object.fromEntries(response.headers);if(response.headers.getSetCookie().length)headers['set-cookie']=response.headers.getSetCookie();
   res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(!url.pathname.startsWith('/letter/')){res.writeHead(404).end();return;}
  const path=resolve(root,decodeURIComponent(url.pathname.slice('/letter/'.length))+(url.pathname.endsWith('/')?'index.html':''));
  if(!path.startsWith(root+sep)){res.writeHead(404).end();return;}
  if(!types[extname(path)]){res.writeHead(404).end();return;}
  let content=readFileSync(path);
  if(extname(path)==='.html')content=Buffer.from(content.toString().replace('</body>','<p style="position:fixed;bottom:0;left:0;background:#fff;padding:8px;z-index:999">Local preview · no email sent · <a href="/preview-inbox">Test inbox</a></p></body>'));
  res.writeHead(200,{'Content-Type':types[extname(path)],'Cache-Control':'no-store'});res.end(content);
 }catch {res.writeHead(404).end('Not found');}
}).listen(8876,'127.0.0.1',()=>console.log(origin+'/letter/sign/ (isolated fixture preview)'));
