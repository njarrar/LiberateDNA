"""Builds src/ref.js, the reference data LiberateDNA uses for heritage.

Inputs (in ../anc, fetched by tools in that folder):
  panel_raw.jsonl  per-marker allele counts by population, from the
                   gnomAD v3.1.2 HGDP + 1000 Genomes call set (GRCh38, matched
                   to Illumina GSA markers by position after liftover)
  held.json        people held out of the counts, used only for testing
  mttree.json      PhyloTree Build 17 (rCRS), from genepi/phylotree-rcrs-17
  ytree.json       ISOGG Y-DNA tree 2016, as distributed with 23andMe/yhaplo
"""
import json, base64, random, os, math
here = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(here, '..', 'anc')

REGIONS = [
    ('eu', 'European', '#0072B2'),
    ('cau', 'Caucasus', '#56B4E9'),
    ('me', 'Middle Eastern', '#009E73'),
    ('naf', 'North African', '#D55E00'),
    ('sas', 'South and Central Asian', '#E69F00'),
    ('eas', 'East and North Asian', '#CC79A7'),
    ('afr', 'Sub-Saharan African', '#7A5195'),
    ('amr', 'Indigenous American', '#B8860B'),
    ('oce', 'Oceanian', '#6B6B6B'),
]
# id, name, who is in it, region, source populations, lat, lon
GROUPS = [
    ('nwe', 'Northwestern European', 'British, Orcadian, Utah residents of NW European descent', 'eu', ['CEU', 'GBR', 'Orcadian'], 53, -3),
    ('fin', 'Finnish', 'Finland', 'eu', ['FIN'], 62, 25),
    ('rus', 'Eastern European', 'Russian', 'eu', ['Russian'], 56, 38),
    ('fra', 'French', 'France', 'eu', ['French'], 46.5, 2.5),
    ('ibe', 'Iberian and Basque', 'Spain, Basque Country', 'eu', ['IBS', 'Basque'], 41, -3.5),
    ('ita', 'Italian', 'Tuscany and Bergamo', 'eu', ['TSI', 'Tuscan', 'Italian'], 43.5, 11),
    ('sar', 'Sardinian', 'Sardinia', 'eu', ['Sardinian'], 40, 9),
    ('ady', 'Circassian', 'Adygei, North Caucasus', 'cau', ['Adygei'], 44.5, 40),
    ('bed', 'Bedouin', 'Negev Bedouin, the closest open sample to Arabian ancestry', 'me', ['Bedouin'], 31, 34.8),
    ('pal', 'Palestinian', 'Central Israel and the West Bank', 'me', ['Palestinian'], 32, 35.2),
    ('dru', 'Druze', 'Mount Carmel', 'me', ['Druze'], 32.7, 35.1),
    ('moz', 'Mozabite Berber', 'Mzab valley, Algeria', 'naf', ['Mozabite'], 32.5, 3.7),
    ('bal', 'Baloch and Brahui', 'Balochistan, Pakistan', 'sas', ['Balochi', 'Brahui'], 28.5, 65),
    ('mak', 'Makrani', 'Makran coast, Pakistan', 'sas', ['Makrani'], 25.5, 62.5),
    ('pat', 'Pashtun', 'Northwest Pakistan', 'sas', ['Pathan'], 33.5, 71),
    ('sin', 'Sindhi', 'Sindh, Pakistan', 'sas', ['Sindhi'], 25.5, 68.5),
    ('bur', 'Burusho', 'Hunza valley', 'sas', ['Burusho'], 36.5, 74.5),
    ('kal', 'Kalash', 'Chitral valleys', 'sas', ['Kalash'], 35.7, 71.7),
    ('pjl', 'Punjabi', 'Lahore', 'sas', ['PJL'], 31.5, 74.3),
    ('gih', 'Gujarati', 'Gujarat', 'sas', ['GIH'], 22.5, 72),
    ('beb', 'Bengali', 'Bangladesh', 'sas', ['BEB'], 23.7, 90.4),
    ('dra', 'Telugu and Tamil', 'South India, Sri Lanka', 'sas', ['ITU', 'STU'], 13, 80),
    ('han', 'Han Chinese', 'China', 'eas', ['CHB', 'CHS', 'Han'], 32, 115),
    ('jpn', 'Japanese', 'Japan', 'eas', ['JPT', 'Japanese'], 36, 138),
    ('sea', 'Southeast Asian', 'Kinh, Dai, Khmer', 'eas', ['KHV', 'CDX', 'Dai', 'Cambodian'], 16, 105),
    ('swc', 'Southern Chinese minorities', 'Yi, Naxi, Lahu, Miao, She, Tujia', 'eas', ['Yi', 'Naxi', 'Lahu', 'Miao', 'She', 'Tujia'], 26, 106),
    ('nas', 'North Asian', 'Yakut, Mongol, Daur, Hezhen, Oroqen, Xibo, Tu', 'eas', ['Yakut', 'Oroqen', 'Hezhen', 'Daur', 'Mongola', 'Xibo', 'Tu'], 50, 118),
    ('wafr', 'Nigerian', 'Yoruba, Esan', 'afr', ['YRI', 'Yoruba', 'ESN'], 7.5, 4.5),
    ('sen', 'Senegambian and Sierra Leonean', 'Gambia, Mandenka, Mende', 'afr', ['GWD', 'Mandenka', 'MSL'], 11, -13),
    ('eafr', 'East African', 'Luhya and Bantu speakers of Kenya', 'afr', ['LWK', 'BantuKenya'], 0.5, 35),
    ('safr', 'Southern African Bantu', 'South Africa', 'afr', ['BantuSouthAfrica'], -27, 28),
    ('chg', 'Central African forest peoples', 'Biaka, Mbuti', 'afr', ['BiakaPygmy', 'MbutiPygmy'], 2, 20),
    ('san', 'San', 'Southern Africa', 'afr', ['San'], -21, 21),
    ('mes', 'Mesoamerican Indigenous', 'Pima, Maya', 'amr', ['Pima', 'Maya'], 23, -102),
    ('ama', 'Amazonian Indigenous', 'Karitiana, Surui', 'amr', ['Karitiana', 'Surui'], -10, -63),
    ('pap', 'Papuan and Melanesian', 'New Guinea, Bougainville', 'oce', ['Papuan', 'Melanesian'], -6, 147),
]
K = len(GROUPS)

def shade(hexc, t):
    c = [int(hexc[i:i + 2], 16) for i in (1, 3, 5)]
    c = [round(x + (255 - x) * t) if t > 0 else round(x * (1 + t)) for x in c]
    return '#%02x%02x%02x' % tuple(c)

def main():
    held = json.load(open(os.path.join(A, 'held.json')))
    rows = [json.loads(l) for l in open(os.path.join(A, 'panel_raw.jsonl'))]
    seen = set(); uniq = []
    for r in rows:
        if r['rs'] in seen: continue
        seen.add(r['rs']); uniq.append(r)
    rows = uniq
    nsamp = {g[0]: 0 for g in GROUPS}
    keep = []
    for r in rows:
        f = []; ok = True
        for g in GROUPS:
            ac = sum(r['ac'].get(p, 0) for p in g[4]); an = sum(r['an'].get(p, 0) for p in g[4])
            if an < 8: ok = False; break
            f.append((ac + 0.5) / (an + 1))
            nsamp[g[0]] = max(nsamp[g[0]], an // 2)
        if not ok: continue
        m = sum(f) / K
        if m < 0.01 or m > 0.99: continue
        r['f'] = f; keep.append(r)
    keep.sort(key=lambda r: (int(r['c']), r['p']))
    n = len(keep)
    Fq = bytes(min(255, int(x * 256)) for r in keep for x in r['f'])
    dpos = []; lastc = None; last = 0
    for r in keep:
        if r['c'] != lastc: last = 0; lastc = r['c']
        dpos.append(str(r['p'] - last)); last = r['p']
    def b36(x):
        s = ''
        while True:
            x, d = divmod(x, 36); s = '0123456789abcdefghijklmnopqrstuvwxyz'[d] + s
            if not x: return s
    regions = []
    for i, (rid, name, col) in enumerate(REGIONS):
        regions.append({'id': rid, 'name': name, 'color': col, 'on': '#111111' if rid in ('cau', 'sas', 'amr') else '#ffffff'})
    groups = []
    for g in GROUPS:
        sib = [x for x in GROUPS if x[3] == g[3]]
        j = sib.index(g); col = dict((r[0], r[2]) for r in REGIONS)[g[3]]
        t = 0 if len(sib) == 1 else (-0.35 + 0.8 * j / (len(sib) - 1))
        c = shade(col, t)
        lum = sum(int(c[i:i + 2], 16) * w for i, w in ((1, .2126), (3, .7152), (5, .0722))) / 255
        groups.append({'id': g[0], 'name': g[1], 'sub': g[2], 'region': g[3], 'src': g[4], 'n': nsamp[g[0]], 'lat': g[5], 'lon': g[6], 'color': c, 'on': '#111111' if lum > 0.45 else '#ffffff'})
    P = {'n': n, 'groups': groups, 'regions': regions,
         'rs': ','.join(b36(int(r['rs'][2:])) for r in keep),
         'ref': ''.join(r['ref'] for r in keep), 'alt': ''.join(r['alt'] for r in keep),
         'chr': base64.b64encode(bytes(int(r['c']) for r in keep)).decode(),
         'dpos': ','.join(dpos), 'F': base64.b64encode(Fq).decode()}

    # Held-out people, for tests only (not shipped).
    test = {}
    for s in held['held']:
        test[s] = {'pop': held['pop'][s], 'g': [r['h'].get(s, -1) for r in keep]}
    json.dump({'rs': [r['rs'] for r in keep], 'ref': P['ref'], 'alt': P['alt'], 'people': test}, open(os.path.join(A, 'heldout.json'), 'w'))

    # Built-in sample person: one parent's alleles from a held-out Tuscan, the other's from a held-out Palestinian.
    random.seed(11)
    tsi = next(s for s in held['held'] if held['pop'][s] == 'TSI'); pal = next(s for s in held['held'] if held['pop'][s] == 'Palestinian')
    sg = []
    for r in keep:
        a, b = r['h'].get(tsi, -1), r['h'].get(pal, -1)
        if a < 0 or b < 0: sg.append(3); continue
        pick = lambda d: 1 if d == 2 else 0 if d == 0 else random.randint(0, 1)
        sg.append(pick(a) + pick(b))
    packed = bytearray((n + 3) // 4)
    for i, d in enumerate(sg): packed[i >> 2] |= d << ((i & 3) * 2)

    mt = json.load(open(os.path.join(A, 'mttree.json')))
    names = [x[0] for x in mt['nodes']]
    MT = {'ref': mt['ref'], 'nodes': [[x[0], x[1], [[p, a, round(w, 1)] for p, a, w in x[2]]] for x in mt['nodes']]}

    yt = json.load(open(os.path.join(A, 'ytree.json')))
    par = yt['nodes']
    def reach(nm):
        k = 0
        while nm and k < 200:
            if nm == 'Root': return True
            nm = par.get(nm); k += 1
        return False
    names = [nm for nm in par if reach(nm)]
    ix = {nm: i for i, nm in enumerate(names)}
    yrows = sorted([r for r in yt['rows'] if r[3] in ix], key=lambda r: r[0])
    # One row per position and branch, named by the most familiar SNP name.
    pref = ['M', 'P', 'L', 'U', 'Z', 'V', 'CTS', 'PF', 'FGC', 'Y', 'S', 'BY', 'F']
    def rank(nm):
        for i, x in enumerate(pref):
            if nm.startswith(x) and nm[len(x):len(x) + 1].isdigit(): return (i, len(nm))
        return (99, len(nm))
    best = {}
    for r in yrows:
        key = (r[0], r[3])
        if key not in best or rank(r[4]) < rank(best[key][4]): best[key] = r
    yr = sorted(best.values(), key=lambda r: r[0])
    lastp = 0; dp = []
    for r in yr: dp.append(str(r[0] - lastp)); lastp = r[0]
    Y = {'names': names, 'par': [ix.get(par[nm], -1) if par[nm] else -1 for nm in names],
         'pos': ','.join(dp), 'node': [ix[r[3]] for r in yr], 'alle': ''.join(r[1] + r[2] for r in yr), 'snp': [r[4] for r in yr]}

    # Sample lineage calls: H1c3 mother, R-U152 father, made from the trees.
    mtcalls = []
    prof = {}
    for i, (nm, pi, polys) in enumerate(mt['nodes']):
        d = dict(prof[pi]) if pi >= 0 else {}
        for p, a, w in polys:
            if a == mt['ref'][p - 1]: d.pop(p, None)
            else: d[p] = a
        prof[i] = d
        if nm == 'H1c3': target = d
    tpos = sorted({p for x in mt['nodes'] for p, a, w in x[2]})
    random.seed(3)
    for p in sorted(set(random.sample(tpos, 1400)) | set(target)): mtcalls.append([p, target.get(p, mt['ref'][p - 1])])
    path = set(); x = 'R1b1a2a1a2b'
    while x: path.add(x); x = par.get(x)
    ycalls = []
    random.seed(4)
    for r in sorted(set(map(tuple, random.sample(yr, 2600))) | {tuple(r) for r in yr if r[3] in path}):
        ycalls.append([r[0], r[2] if r[3] in path else r[1]])
    S = {'g': base64.b64encode(bytes(packed)).decode(), 'mt': mtcalls, 'y': sorted(ycalls)}

    # Test file for the browser checks: a held-out Palestinian man, mt J1c, Y J-P58. Not shipped.
    tp = next(s for s in held['held'][::-1] if held['pop'][s] == 'Palestinian')
    L = ['# This data file generated by 23andMe at: test', '# rsid\tchromosome\tposition\tgenotype']
    for r in keep:
        d = r['h'].get(tp, -1)
        L.append(f"{r['rs']}\t{r['c']}\t{r['p']}\t" + ('--' if d < 0 else r['ref'] * (2 - d) + r['alt'] * d))
    tg = None
    for i, (nm, pi, polys) in enumerate(mt['nodes']):
        if nm == 'J1c': tg = prof[i]
    random.seed(5)
    for p in sorted(set(random.sample(tpos, 1400)) | set(tg)): L.append(f"i70{p:05d}\tMT\t{p}\t{tg.get(p, mt['ref'][p - 1])}")
    path = set(); x = 'J1a2b'
    while x: path.add(x); x = par.get(x)
    for k, r in enumerate(sorted(set(map(tuple, random.sample(yr, 2600))) | {tuple(r) for r in yr if r[3] in path})):
        L.append(f"i80{k:05d}\tY\t{r[0]}\t{r[2] if r[3] in path else r[1]}")
    open(os.path.join(here, '..', 'tests', 'files', 'genome_Full_her.txt'), 'w').write('\n'.join(L) + '\n')

    out = ('/* Generated by refbuild.py. Sources: HGDP and 1000 Genomes via gnomAD v3.1.2 (allele frequencies),\n'
           '   Illumina GSA marker list, PhyloTree Build 17 (van Oven 2016, via genepi/phylotree-rcrs-17),\n'
           '   ISOGG Y-DNA tree 2016 (as distributed with 23andMe/yhaplo). */\n'
           'const REF_PANEL = ' + json.dumps(P, separators=(',', ':')) + ';\n'
           'const REF_MT = ' + json.dumps(MT, separators=(',', ':')) + ';\n'
           'const REF_Y = ' + json.dumps(Y, separators=(',', ':')) + ';\n'
           'const REF_SAMPLE = ' + json.dumps(S, separators=(',', ':')) + ';\n')
    open(os.path.join(here, 'ref.js'), 'w').write(out)
    print('panel', n, 'groups', K, 'ref.js', len(out), 'y rows', len(yr), 'y nodes', len(names), 'mt nodes', len(MT['nodes']))

main()
