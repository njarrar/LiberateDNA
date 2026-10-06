import gzip, random, json
from pyliftover import LiftOver
lo = LiftOver('grch37_to_grch38.over.chain.gz')
rs = {}
for l in gzip.open('gsa_rsid_map.txt.gz','rt'):
    n, r = l.rstrip('\n').split('\t')
    if r.startswith('rs') and r[2:].isdigit(): rs[n] = r
cand = []; auto={str(i) for i in range(1,23)}
for l in gzip.open('gsa_chrpos_map.txt.gz','rt'):
    f = l.rstrip('\n').split('\t')
    if f[0] not in rs or f[1] not in auto: continue
    r = rs[f[0]]
    if int(r[2:]) > 100_000_000: continue
    cand.append((f[1], int(f[2]), r))
print('common-ish autosomal GSA', len(cand))
seen=set(); c2=[]
for x in cand:
    if x[2] in seen: continue
    seen.add(x[2]); c2.append(x)
random.seed(1); random.shuffle(c2)
out=[]
for c,p,r in c2:
    m = lo.convert_coordinate(c, p-1)
    if not m or len(m)!=1 or m[0][0]!='chr'+c or m[0][2]!='+': continue
    out.append((c,p,m[0][1]+1,r))
    if len(out)>=32000: break
out.sort(key=lambda x:(int(x[0]),x[1]))
json.dump(out, open('cand.json','w'))
print(len(out), out[:3])
