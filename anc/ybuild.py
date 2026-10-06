import re, json, gzip
# Major-clade topology (ISOGG 2016), from the published tree.
nwk=open('yhaplo/yhaplo/data/tree/y.tree.primary.2016.01.04.nwk').read().strip().rstrip(';')
parent={}; aliases={}
def parse(s,i,par):
    # returns (label,end)
    kids=[]
    if s[i]=='(':
        i+=1
        while True:
            lab,i=parse(s,i,None); kids.append(lab)
            if s[i]==',': i+=1; continue
            if s[i]==')': i+=1; break
    j=i
    while j<len(s) and s[j] not in ',()': j+=1
    lab=s[i:j]; name=lab.split('/')[0]
    for a in lab.split('/'): aliases[a]=name
    for k in kids: parent[k]=name
    return name,j
root,_=parse(nwk,0,None)
majors=set(parent)|{root}
rows=[]
gsaY=set()
for l in gzip.open('gsa_chrpos_map.txt.gz','rt'):
    f=l.split('\t')
    if f[1]=='Y': gsaY.add(int(f[2]))
for l in open('yhaplo/yhaplo/data/variants/isogg.2016.01.04.txt', encoding='latin-1'):
    f=[x.strip() for x in l.rstrip('\n').split('\t')]
    if len(f)<6 or f[0]=='SNP': continue
    snp,hg,other,rs,pos,mut=f[:6]
    hg=hg.split(' ')[0]
    if '~' in hg or not re.match(r'^[A-Z]',hg) or not pos.isdigit(): continue
    m=re.match(r'^([ACGT])->([ACGT])$',mut)
    if not m: continue
    rows.append((int(pos),m.group(1),m.group(2),hg,snp))
def par(n):
    if n==root: return None
    if n in parent: return parent[n]
    if n in aliases and aliases[n]!=n: return aliases[n]
    m=re.match(r'^(.*?)(\d+|[a-z]+)$',n)
    if m and m.group(1): return m.group(1)
    return None
nodes={}
def add(n):
    if n in nodes: return
    p=par(n)
    if p and p!=n: add(p)
    nodes[n]=p
for r in rows: add(r[3])
for n in majors: add(n)
# drop positions that appear with contradictory alleles
from collections import Counter
cnt=Counter(r[0] for r in rows)
print('isogg snps',len(rows),'nodes',len(nodes),'in GSA',sum(1 for r in rows if r[0] in gsaY))
json.dump({'nodes':nodes,'rows':rows,'gsa':[r[0] for r in rows if r[0] in gsaY]},open('ytree.json','w'))
unk=[n for n,p in nodes.items() if p is None]; print('roots',unk[:20])
print([ (n,nodes[n]) for n in ['J1a2b','J1','J','IJ','R1b1a2','R','P','E1b1b1','T1a','L1','Q1','G2a'] if n in nodes])
