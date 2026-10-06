import xml.etree.ElementTree as ET, json, re
t=ET.parse('phylotree-rcrs-17/src/tree.xml').getroot()
ref=''.join(l.strip() for l in open('phylotree-rcrs-17/src/rcrs.fasta') if not l.startswith('>'))
W={}
for l in open('phylotree-rcrs-17/src/weights.txt'):
    f=l.split('\t'); W[f[0]]=float(f[1])
hot={'16519C','16182C','16183C','3107d','315.1C','309.1C','523d','524d'}
nodes=[]  # [name, parentIdx, [poly...]]
def walk(el,pi):
    for h in el.findall('haplogroup'):
        polys=[]
        d=h.find('details')
        if d is not None:
            for p in d.findall('poly'):
                s=p.text.strip()
                if s in hot: continue
                m=re.match(r'^(\d+)([ACGT])$',s)
                if m: polys.append([int(m.group(1)),m.group(2),W.get(s,1.0)])
        nodes.append([h.get('name'),pi,polys]); idx=len(nodes)-1
        walk(h,idx)
walk(t,-1)
print(len(nodes), nodes[0][:2], sum(len(n[2]) for n in nodes))
json.dump({'ref':ref,'nodes':nodes},open('mttree.json','w'))
names=[n[0] for n in nodes]; print([x for x in names if x.startswith('J1c')][:5], 'L0' in names, 'mt-MRCA' in names, names[:3])
