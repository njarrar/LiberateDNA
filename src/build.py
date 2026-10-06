import re, base64, os, sys
here=os.path.dirname(os.path.abspath(__file__))
deps=os.path.join(here,'..','deps')
src=lambda f: open(os.path.join(here,f)).read()
preact=open(os.path.join(deps,'htm-3.1.1/package/preact/standalone.umd.js')).read()
phcss=open(os.path.join(deps,'ph/package/src/regular/style.css')).read()
font=base64.b64encode(open(os.path.join(deps,'ph/package/src/regular/Phosphor.woff2'),'rb').read()).decode()
app=src('data.js')+'\nconst WORLD_PATH = "'+src('worldpath.txt').strip()+'";\n'+src('ref.js')+'\n'+src('anc.js')+'\n'+src('worker.js')+'\n'+src('app.js')
used=set(re.findall(r"ph-[a-z0-9-]+", app))
rules=[]
for m in re.finditer(r"\.ph\.(ph-[a-z0-9-]+):before \{\s*content: \"(\\[a-f0-9]+)\";\s*\}", phcss):
    if m.group(1) in used: rules.append('.ph.%s:before{content:"%s"}'%(m.group(1),m.group(2)))
missing=[u for u in used if not any(('.ph.'+u+':') in r for r in rules)]
print('icons',len(rules),'not found:',missing, file=sys.stderr)
base=phcss[phcss.index('.ph {'):phcss.index('}',phcss.index('.ph {'))+1]
ph='@font-face{font-family:"Phosphor";src:url(data:font/woff2;base64,%s) format("woff2");font-weight:normal;font-style:normal;font-display:block}\n%s\n%s'%(font,base,'\n'.join(rules))
shell=src('shell.html')
out=shell.replace('/*PHOSPHOR*/',ph).replace('/*PREACT*/',preact).replace('/*APP*/',app)
dst=sys.argv[1] if len(sys.argv)>1 else os.path.join(here,'..','dist','index.html')
os.makedirs(os.path.dirname(dst),exist_ok=True)
open(dst,'w').write(out); print(dst, len(out), file=sys.stderr)
