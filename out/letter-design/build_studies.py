"""Build local design alternatives from the current letter. Does not change it."""
from pathlib import Path
import hashlib
import re

root=Path(__file__).resolve().parents[2]
source=(root/'site/letter/index.html').read_text()
out=root/'site/letter/studies'
study_version=hashlib.sha256((out/'study.js').read_bytes()).hexdigest()[:10]
style_version=hashlib.sha256((out/'study.css').read_bytes()).hexdigest()[:10]
sign_style_version=hashlib.sha256((root/'site/letter/sign.css').read_bytes()).hexdigest()[:10]
sign_version=hashlib.sha256((root/'site/letter/sign.js').read_bytes()).hexdigest()[:10]
body=re.search(r'<div class="letter-body">([\s\S]*?)</div>',source).group(1)
body=re.sub(r'<!--[\s\S]*?-->','',body)
paragraphs=re.findall(r'<p([^>]*)>([\s\S]*?)</p>',body)
sections=[]
for match in re.finditer(r'<section class="story-step" id="([^"]+)">([\s\S]*?)</section>',source):
    key,chunk=match.groups()
    title=re.search(r'<h2>([\s\S]*?)</h2>',chunk).group(1)
    ps=re.findall(r'<p>([\s\S]*?)</p>',chunk)
    sections.append((key,title,ps))
assert len(paragraphs)==6 and len(sections)==6
paragraph_notes={1:(0,),2:(4,),3:(0,1),4:(2,),5:(3,4)}

masthead='''<header class="study-masthead"><span class="study-mark">A letter to the frontier labs</span><nav class="utility" aria-label="Resources and signing"><a href="../check/" target="_blank" rel="noopener">Learn how to disable sharing ↗</a><a href="../paper/" target="_blank" rel="noopener">Read the position paper ↗</a><a class="sign-action" href="../sign/" target="_blank" rel="noopener">Add your name ↗</a></nav></header>'''
left_actions='''<nav class="heading-actions" aria-label="Resources and signing"><a class="sign-action" href="../sign/" target="_blank" rel="noopener"><span>Add your name</span><span aria-hidden="true">↗</span></a><a href="../paper/" target="_blank" rel="noopener"><span>Read the position paper</span><span aria-hidden="true">↗</span></a><a href="../check/" target="_blank" rel="noopener"><span>Learn how to disable sharing</span><span aria-hidden="true">↗</span></a></nav>'''
art='''<div class="research-stage" aria-hidden="true"><picture class="research-poster"><source media="(max-aspect-ratio:1/1)" srcset="../assets/spatial-threads/journey-poster-mobile.jpg"><img src="../assets/spatial-threads/journey-poster-desktop.jpg" alt="" fetchpriority="high"></picture></div><div class="surface-wash" aria-hidden="true"></div><button class="motion-toggle" id="motion-toggle" type="button" aria-pressed="false" hidden>Pause motion</button>'''
signature='''<section class="signature-block" data-signatories aria-label="Signatories"><div class="signature-meta"><span>Signatories</span><span data-signatory-count>1 signature</span></div><div data-signatory-list><p class="signature-name">James Barnes</p><p class="signature-aff">Research Router Co-Op</p></div></section><section class="invitation"><p>Add your name to the letter.</p><a class="main-action" href="../sign/" target="_blank" rel="noopener">Add your name <span aria-hidden="true">↗</span></a></section>'''
resources='''<nav class="resource-links" aria-label="Further reading"><a href="../check/" target="_blank" rel="noopener">Learn how to disable sharing ↗</a><a href="../paper/" target="_blank" rel="noopener">Read the position paper ↗</a></nav>'''
support='<section class="support"><h2>About the agreement</h2>'+''.join('<details><summary>'+title+'</summary><div class="answer">'+''.join('<p>'+p+'</p>' for p in ps)+'</div></details>' for _,title,ps in sections)+'</section>'
for slug,theme,label in [('open-field','open-field','A · Open field'),('split-view','split-view','B · Split view'),('annotated-letter','annotated','C · Annotated letter')]:
    page_masthead='' if theme=='split-view' else masthead
    title='<h1 class="study-title"><span>Bargaining</span><span>For Our Minds</span></h1>'
    if theme=='split-view':title='<h1 class="study-title"><span>Bargaining</span><span>For Our</span><span>Minds</span></h1>'
    description='<p class="document-label">An open letter from scientists<br>to the frontier labs</p>'
    heading_lead='<div class="heading-lead">'+title+description+'</div>' if theme=='split-view' else title
    heading_footer='<div class="heading-footer">'+left_actions+'</div>' if theme=='split-view' else description
    heading='<header class="study-heading">'+heading_lead+heading_footer+'</header>'
    letter=''
    for i,(attrs,p) in enumerate(paragraphs):
        ref=''
        if theme=='annotated':
            for note_index in paragraph_notes.get(i,()):
                ref+=f'<button class="note-ref" type="button" data-note="{note_index}" aria-label="Read note {note_index+1}: {sections[note_index][1]}" aria-pressed="false">{note_index+1:02}</button>'
        classes='salute' if i==0 else 'story-step'
        letter+=f'<p class="{classes}" id="letter-paragraph-{i}">{p}{ref}</p>\n'
    letter='<div class="letter-copy">'+letter+'</div>'
    if theme=='annotated':
        notes=''
        for i,(_,t,ps) in enumerate(sections):
            notes+=f'<section class="annotation" id="annotation-{i}"'+(' hidden' if i else '')+f'><p class="annotation-index">NOTE {i+1:02}</p><h2>{t}</h2>'+''.join('<p>'+p+'</p>' for p in ps)+f'<button class="annotation-next" data-next="{(i+1)%6}" type="button">Next note →</button></section>'
        notes='<aside class="annotations" aria-label="Notes on the letter" aria-live="polite">'+notes+'<p class="annotation-hint">Select a number in the letter to read its explanation.</p></aside>'
        context='<section class="more-context"><p>Read a little further.</p><div class="context-buttons">'+''.join(f'<button data-note="{i}" type="button" aria-pressed="false">{name}</button>' for i,name in enumerate(['Our contribution','Why together','Scope','Value','Representation','Signing']))+'</div></section>'
        content=f'<section class="reading-surface" id="ideas" aria-label="The letter and its notes">{letter}{notes}<div class="after-letter">{signature}{context}{resources}</div></section>'
    else:
        page_signature=signature
        if theme=='split-view':
            heading=heading.replace('href="../sign/" target="_blank" rel="noopener"', 'href="#sign"').replace('<span>Add your name</span><span aria-hidden="true">↗</span>', '<span>Add your name</span><span aria-hidden="true">↓</span>')
            page_signature=re.sub(r'<section class="invitation">.*?</section>', '''<section class="inline-signing" id="sign" aria-labelledby="sign-heading"><h2 id="sign-heading">Add your name</h2><div data-signing aria-label="Sign the letter" aria-busy="true"><p>Loading ORCID sign-in…</p><noscript><p>Enable JavaScript to sign in with ORCID and add your name.</p></noscript></div></section>''', signature)
        content=f'<section class="reading-surface" id="ideas" aria-label="The letter and its context">{letter}{page_signature}{support}{resources}</section>'
    page_title='Bargaining For Our Minds' if theme=='split-view' else label+' · Bargaining For Our Minds'
    html=f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="same-origin"><title>{page_title}</title><link rel="stylesheet" href="../research-film.css?v=fec27c4a27"><link rel="stylesheet" href="study.css?v={style_version}"><link rel="stylesheet" href="../sign.css?v={sign_style_version}"></head>
<body class="{theme}">{art}{page_masthead}<main class="study-content">{heading}{content}</main><script src="study.js?v={study_version}"></script><script src="../hosting.js"></script><script src="../sign.js?v={sign_version}"></script></body></html>'''
    (out/f'{slug}.html').write_text(html)
print('Built three design studies using the unchanged letter and explanatory copy.')
