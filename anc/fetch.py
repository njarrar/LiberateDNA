import pysam, json, gzip, sys, os, random, time
from multiprocessing import Pool
URL='https://storage.googleapis.com/gcp-public-data--gnomad/release/3.1.2/vcf/genomes/gnomad.genomes.v3.1.2.hgdp_tgp.chr{}.vcf.bgz'
HOLD = ['Bedouin','Palestinian','Druze','Mozabite','Adygei','Sardinian','TSI','CEU','IBS','Russian','Balochi','Brahui','Makrani','Pathan','PJL','YRI','CHB','JPT','French','FIN','LWK','GIH','Sindhi','Italian','Basque','Kalash','Burusho']
def meta():
    pop={}
    for l in gzip.open('meta.tsv.bgz','rt'):
        r=l.rstrip('\n').split('\t')
        if r[0]=='s': continue
        m=json.loads(r[10])
        if m.get('population') and r[11]=='true': pop[r[0]]=m['population']
    return pop
POP=meta()
random.seed(5)
held=set()
for p in HOLD:
    ss=sorted(s for s,q in POP.items() if q==p); random.shuffle(ss); held.update(ss[:4])
cache={}
def handle(c):
    if c not in cache: cache[c]=pysam.TabixFile(URL.format(c))
    return cache[c]
def work(chunk):
    out=[]
    for c,p37,p38,rs in chunk:
        for attempt in range(3):
            try:
                tb=handle(c); rows=[r.split('\t',9) for r in tb.fetch('chr'+c,p38-1,p38)]; break
            except Exception as e:
                cache.pop(c,None); time.sleep(2); rows=None
        if not rows: continue
        rows=[r for r in rows if int(r[1])==p38 and len(r[3])==1 and len(r[4])==1]
        if len(rows)!=1 or rows[0][6]!='PASS': continue
        r=rows[0]
        samples=handle.samples[c]
        gts=r[9].split('\t')
        ac={}; an={}; hg={}
        for s,g in zip(samples,gts):
            q=POP.get(s)
            if not q: continue
            a,b=g[0],g[2]
            if a=='.' or b=='.': continue
            d=(a=='1')+(b=='1')
            if s in held: hg[s]=d; continue
            ac[q]=ac.get(q,0)+d; an[q]=an.get(q,0)+2
        out.append({'c':c,'p':p37,'rs':rs,'ref':r[3],'alt':r[4],'ac':ac,'an':an,'h':hg})
    return out
handle.samples={}
def init():
    for c in range(1,23):
        pass
if __name__=='__main__':
    cand=json.load(open('cand2.json'))
    # sample names per chromosome file (same order everywhere, read once)
    tb=pysam.TabixFile(URL.format('21'))
    hdr=[l for l in tb.header][-1].split('\t')[9:]
    handle.samples={str(c):hdr for c in range(1,23)}
    json.dump({'held':sorted(held),'pop':{s:POP[s] for s in held}},open('held.json','w'))
    chunks=[cand[i:i+40] for i in range(0,len(cand),40)]
    random.shuffle(chunks)
    n=0
    with Pool(10) as pool, open('panel_raw.jsonl','a') as f:
        for res in pool.imap_unordered(work, chunks):
            for x in res: f.write(json.dumps(x)+'\n')
            n+=1
            f.flush()
            if n%10==0: print(n,len(chunks),flush=True)
