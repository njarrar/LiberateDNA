/* LiberateDNA: reference data and genotype interpretation.
   Everything here runs on the user's device. Genotypes are read on the
   GRCh37 plus strand, which is what 23andMe exports. */

const fmt = n => Number(n).toLocaleString('en-US');

// [chromosome, length in Mb, marker count on a typical v5 file]
const CHR = [['1',249,49512],['2',243,47297],['3',198,39082],['4',191,34574],['5',181,34984],['6',171,38618],['7',159,32752],['8',146,30310],['9',141,26014],['10',136,29735],['11',135,28850],['12',134,28163],['13',115,21178],['14',107,18987],['15',102,18161],['16',90,19465],['17',81,18780],['18',78,16809],['19',59,14127],['20',63,14534],['21',48,8724],['22',51,8791],['X',155,22995],['Y',59,3733],['MT',0.02,4295]];
const CHR_NAMES = CHR.map(c => c[0]);

const POPS = [
  { id: 'seu', name: 'Southern European', sub: 'Italian, Sicilian', region: 'eu', pct: 38.4, lo: 34, hi: 43, conf: 'high', color: '#E69F00', on: '#111111' },
  { id: 'nwe', name: 'Northwestern European', sub: 'British and Irish', region: 'eu', pct: 21.7, lo: 17, hi: 26, conf: 'high', color: '#0072B2', on: '#ffffff' },
  { id: 'eeu', name: 'Eastern European', sub: 'Polish, Ukrainian', region: 'eu', pct: 12.9, lo: 9, hi: 17, conf: 'medium', color: '#56B4E9', on: '#111111' },
  { id: 'ash', name: 'Ashkenazi Jewish', sub: 'Central and Eastern Europe', region: 'eu', pct: 9.6, lo: 8, hi: 11, conf: 'high', color: '#CC79A7', on: '#111111' },
  { id: 'naf', name: 'North African', sub: 'Maghrebi', region: 'nawa', pct: 7.2, lo: 3, hi: 11, conf: 'low', color: '#D55E00', on: '#ffffff' },
  { id: 'lev', name: 'Levantine', sub: 'Lebanese, Syrian, Palestinian', region: 'nawa', pct: 5.1, lo: 2, hi: 9, conf: 'low', color: '#009E73', on: '#ffffff' },
  { id: 'was', name: 'Western Asian', sub: 'Anatolian, Caucasian', region: 'nawa', pct: 3.0, lo: 1, hi: 6, conf: 'low', color: '#F0E442', on: '#111111' },
  { id: 'una', name: 'Unassigned', sub: 'Segments too short to place', region: 'un', pct: 2.1, color: '#9a9a9a', on: '#111111' }
];
const REGIONS = [
  { id: 'eu', name: 'European', sub: 'Southern, Northwestern, Eastern, Ashkenazi', pct: 82.6, lo: 78, hi: 87, conf: 'high', color: '#0072B2', on: '#ffffff' },
  { id: 'nawa', name: 'North African and Western Asian', sub: 'Maghrebi, Levantine, Anatolian', pct: 15.3, lo: 11, hi: 20, conf: 'medium', color: '#D55E00', on: '#ffffff' },
  { id: 'un', name: 'Unassigned', sub: 'Segments too short to place', pct: 2.1, color: '#9a9a9a', on: '#111111' }
];

// Seeded painting so the picture stays the same between visits.
const PAINT = (() => {
  const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const r = rng(23);
  const pick = () => { let x = r() * 100, acc = 0; for (const p of POPS) { acc += p.pct; if (x <= acc) return p.id; } return 'una'; };
  return CHR.slice(0, 22).map(([name, len]) => ({ name, len, copies: [0, 1].map(() => {
    const segs = []; let pos = 0;
    while (pos < len - 0.5) { const l = Math.min(len - pos, len * (0.07 + r() * 0.3)), pop = pick(); if (segs.length && segs[segs.length - 1].pop === pop) segs[segs.length - 1].l += l; else segs.push({ pop, l }); pos += l; }
    return segs; }) }));
})();

/* Haplogroups LiberateDNA can place. Paths are simplified; ages are rough. */
const MAT = { via: 'mitochondrial DNA, from mother to every child' };
const PAT = { via: 'the Y chromosome, from father to son' };
const LINEAGE = {
  H1: { ...MAT, hg: 'H1', path: ['L3', 'N', 'R', 'R0', 'HV', 'H', 'H1'], desc: 'H is the most common maternal lineage in Europe and is also frequent in the Near East and the Caucasus. H1 is its largest branch.', age: 'H1 arose roughly 10,000 to 15,000 years ago', markers: 'mt 2706A, 7028C, 3010A' },
  H: { ...MAT, hg: 'H', path: ['L3', 'N', 'R', 'R0', 'HV', 'H'], desc: 'H is the most common maternal lineage in Europe and is also frequent in the Near East and the Caucasus. LiberateDNA does not test the markers for its branches beyond H1.', age: 'H arose roughly 20,000 years ago', markers: 'mt 2706A, 7028C' },
  R0: { ...MAT, hg: 'R0 or HV', path: ['L3', 'N', 'R', 'R0'], desc: 'R0 and its branch HV are found across the Near East, Arabia and the Caucasus. These markers cannot tell which branch you carry.', age: 'R0 arose roughly 25,000 years ago', markers: 'mt 11719G, 7028T' },
  J1: { ...MAT, hg: 'J1', path: ['L3', 'N', 'R', 'JT', 'J', 'J1'], desc: 'J is found across the Near East, Arabia and Europe. J1 is its larger branch.', age: 'J arose roughly 40,000 years ago', markers: 'mt 4216C, 15452A, 10398G, 3010A' },
  J: { ...MAT, hg: 'J', path: ['L3', 'N', 'R', 'JT', 'J'], desc: 'J is found across the Near East, Arabia and Europe.', age: 'J arose roughly 40,000 years ago', markers: 'mt 4216C, 15452A, 10398G' },
  T: { ...MAT, hg: 'T', path: ['L3', 'N', 'R', 'JT', 'T'], desc: 'T is found across the Near East, Europe and Central Asia.', age: 'T arose roughly 25,000 years ago', markers: 'mt 4216C, 15452A, 10398A' },
  U: { ...MAT, hg: 'U', path: ['L3', 'N', 'R', 'U'], desc: 'U is one of the oldest lineages outside Africa. Its branches, K among them, reach from Europe and North Africa to the Near East and South Asia.', age: 'U arose roughly 50,000 years ago', markers: 'mt 12308G' },
  'R-U152': { ...PAT, hg: 'R-U152', path: ['R', 'R1', 'R1b', 'R-M269', 'R-L51', 'R-P312', 'R-U152'], desc: 'R-M269 is the most common paternal lineage in Western Europe. The U152 branch is most common in northern Italy, Switzerland and eastern France.', age: 'U152 arose roughly 4,500 years ago', markers: 'Y M269, P312, U152' },
  'R-P312': { ...PAT, hg: 'R-P312', path: ['R', 'R1', 'R1b', 'R-M269', 'R-L51', 'R-P312'], desc: 'R-M269 is the most common paternal lineage in Western Europe. P312 is its largest western branch.', age: 'P312 arose roughly 4,500 to 5,000 years ago', markers: 'Y M269, P312' },
  'R-M269': { ...PAT, hg: 'R-M269', path: ['R', 'R1', 'R1b', 'R-M269'], desc: 'R-M269 is the most common paternal lineage in Western Europe and is also found in Anatolia, the Caucasus and the Near East.', age: 'M269 arose roughly 6,000 years ago', markers: 'Y M269' },
  R1a: { ...PAT, hg: 'R1a', path: ['R', 'R1', 'R1a'], desc: 'R1a is common in Eastern Europe, Central Asia and South Asia.', age: 'R1a arose roughly 20,000 years ago', markers: 'Y M420' },
  J1y: { ...PAT, hg: 'J-M267 (J1)', path: ['F', 'IJ', 'J', 'J1'], desc: 'J1 is the most common paternal lineage in Arabia and much of the Near East, and is frequent in the Caucasus and North Africa.', age: 'J1 arose roughly 20,000 years ago', markers: 'Y M267' },
  J2y: { ...PAT, hg: 'J-M172 (J2)', path: ['F', 'IJ', 'J', 'J2'], desc: 'J2 is common in the Fertile Crescent, Anatolia, the Caucasus, Iran and around the Mediterranean.', age: 'J2 arose roughly 25,000 years ago', markers: 'Y M172' },
  Jy: { ...PAT, hg: 'J-M304', path: ['F', 'IJ', 'J'], desc: 'J is the main paternal lineage of the Near East and Arabia. These markers could not tell J1 from J2.', age: 'J arose roughly 40,000 years ago', markers: 'Y M304' },
  E1b1b: { ...PAT, hg: 'E-M215 (E1b1b)', path: ['DE', 'E', 'E1', 'E1b1', 'E1b1b'], desc: 'E1b1b is common in North and East Africa, the Near East and southern Europe.', age: 'E1b1b arose roughly 30,000 years ago', markers: 'Y M215' },
  G: { ...PAT, hg: 'G-M201', path: ['F', 'GHIJK', 'G'], desc: 'G is most common in the Caucasus and is found across the Near East, Iran and southern Europe.', age: 'G arose roughly 45,000 years ago', markers: 'Y M201' },
  I1: { ...PAT, hg: 'I-M253 (I1)', path: ['F', 'IJ', 'I', 'I1'], desc: 'I1 is most common in Scandinavia and around the North Sea.', age: 'The men of I1 share an ancestor from roughly 4,500 years ago', markers: 'Y M253' }
};

/* Curated marker table: [rsid, chr, pos, gene, what it is, effect allele, report area, consequence].
   The effect allele is counted in the user's call to say "one copy", "two copies". */
const SNP_DEF = [
  ['rs4477212','1',82154,'','First marker in a 23andMe file',null,'none','intergenic variant'],
  ['rs1801133','1',11856378,'MTHFR','MTHFR C677T. Common and of little clinical significance','A','health','missense variant'],
  ['rs3918290','1',97915614,'DPYD','DPYD *2A','T','drug','splice donor variant'],
  ['rs76763715','1',155205634,'GBA','GBA N370S, the main Gaucher carrier variant','C','carrier','missense variant'],
  ['rs6025','1',169519049,'F5','Factor V Leiden','T','health','missense variant'],
  ['rs41380347','2',136608651,'MCM6','Lactase persistence (-13915G), the main form in Arabia','C','trait','intron variant'],
  ['rs4988235','2',136608646,'MCM6','Lactase persistence. Linked to lactose tolerance','A','trait','intron variant'],
  ['rs1799945','6',26091179,'HFE','HFE H63D','G','health','missense variant'],
  ['rs1800562','6',26093141,'HFE','HFE C282Y','A','health','missense variant'],
  ['rs2187668','6',32605884,'HLA-DQA1','Tags HLA-DQ2.5','T','health','intron variant'],
  ['rs3798220','6',160961137,'LPA','LPA I4399M, a high-Lp(a) allele','C','health','missense variant'],
  ['rs10455872','6',161010118,'LPA','High-Lp(a) allele','G','health','intron variant'],
  ['rs713598','7',141673345,'TAS2R38','Bitter taste receptor, taster allele','G','trait','missense variant'],
  ['rs12248560','10',96521657,'CYP2C19','CYP2C19 *17, faster metabolism','T','drug','upstream variant'],
  ['rs4986893','10',96540410,'CYP2C19','CYP2C19 *3 allele','A','drug','stop gained'],
  ['rs4244285','10',96541616,'CYP2C19','CYP2C19 *2 allele','A','drug','synonymous variant (splice defect)'],
  ['rs1799853','10',96702047,'CYP2C9','CYP2C9 *2','T','drug','missense variant'],
  ['rs1057910','10',96741053,'CYP2C9','CYP2C9 *3','C','drug','missense variant'],
  ['rs7903146','10',114758349,'TCF7L2','Type 2 diabetes risk allele','T','health','intron variant'],
  ['rs11549407','11',5248004,'HBB','Beta thalassemia, codon 39 (Q40X)','A','carrier','stop gained'],
  ['rs35004220','11',5248050,'HBB','Beta thalassemia, IVS1-110','T','carrier','splice variant'],
  ['rs334','11',5248232,'HBB','Sickle cell variant (HbS)','A','carrier','missense variant'],
  ['rs72921001','11',6889648,'OR6A2','Cilantro soapy-taste allele','C','trait','intergenic variant'],
  ['rs1799963','11',46761055,'F2','Prothrombin G20210A','A','health','3 prime UTR variant'],
  ['rs1815739','11',66328095,'ACTN3','ACTN3 R577X','T','trait','stop gained'],
  ['rs4149056','12',21331549,'SLCO1B1','SLCO1B1 *5 allele','C','drug','missense variant'],
  ['rs671','12',112241766,'ALDH2','Alcohol flush allele','A','trait','missense variant'],
  ['rs12913832','15',28365618,'HERC2','Main eye color switch, blue-eye allele','G','trait','intron variant'],
  ['rs762551','15',75041917,'CYP1A2','Slower caffeine allele','C','trait','intron variant'],
  ['rs9923231','16',31107689,'VKORC1','Warfarin sensitivity allele','T','drug','upstream variant'],
  ['rs28940579','16',3293310,'MEFV','Familial Mediterranean fever, V726A','G','carrier','missense variant'],
  ['rs28940578','16',3293405,'MEFV','Familial Mediterranean fever, M694I','T','carrier','missense variant'],
  ['rs61752717','16',3293407,'MEFV','Familial Mediterranean fever, M694V','C','carrier','missense variant'],
  ['rs28940580','16',3293447,'MEFV','Familial Mediterranean fever, M680I','G','carrier','missense variant'],
  ['rs17822931','16',48258198,'ABCC11','Dry earwax allele','T','trait','missense variant'],
  ['rs1805007','16',89986117,'MC1R','MC1R R151C','T','trait','missense variant'],
  ['rs429358','19',45411941,'APOE','Defines APOE ε4','C','health','missense variant'],
  ['rs7412','19',45412079,'APOE','Defines APOE ε2','T','health','missense variant'],
  ['rs1050828','X',153764217,'G6PD','G6PD A- (V68M)','T','health','missense variant'],
  ['rs5030868','X',153762634,'G6PD','G6PD Mediterranean (S188F)','A','health','missense variant'],
  ['rs9786153','Y',22739367,'Y-DNA','M269: marks haplogroup R-M269','C','lineage','Y-chromosome SNP'],
  ['rs34276300','Y',22157311,'Y-DNA','P312: marks R-P312, under M269','A','lineage','Y-chromosome SNP'],
  ['rs1236440','Y',15333149,'Y-DNA','U152: marks R-U152, under P312','T','lineage','Y-chromosome SNP'],
  ['rs17250535','Y',23473201,'Y-DNA','M420: marks haplogroup R1a','A','lineage','Y-chromosome SNP'],
  ['rs13447352','Y',22749853,'Y-DNA','M304: marks haplogroup J','C','lineage','Y-chromosome SNP'],
  ['rs9341313','Y',22741818,'Y-DNA','M267: marks haplogroup J1','G','lineage','Y-chromosome SNP'],
  ['rs2032604','Y',14969634,'Y-DNA','M172: marks haplogroup J2','G','lineage','Y-chromosome SNP'],
  ['rs2032654','Y',15467824,'Y-DNA','M215: marks haplogroup E1b1b','G','lineage','Y-chromosome SNP'],
  ['rs2032636','Y',15027529,'Y-DNA','M201: marks haplogroup G','T','lineage','Y-chromosome SNP'],
  ['rs9341296','Y',15022707,'Y-DNA','M253: marks haplogroup I1','T','lineage','Y-chromosome SNP'],
  ['rs2854128','MT',2706,'mtDNA','2706A: with 7028C, marks haplogroup H','A','lineage','mitochondrial rRNA variant'],
  ['rs2015062','MT',7028,'mtDNA','7028C: marks haplogroup H','C','lineage','mitochondrial synonymous variant'],
  ['rs3928306','MT',3010,'mtDNA','3010A: marks H1 on an H line, J1 on a J line','A','lineage','mitochondrial rRNA variant'],
  ['rs2853495','MT',11719,'mtDNA','11719G: shared by R0, HV and H','G','lineage','mitochondrial synonymous variant'],
  ['rs1599988','MT',4216,'mtDNA','4216C: with 15452A, marks haplogroup JT','C','lineage','mitochondrial missense variant'],
  ['rs193302994','MT',15452,'mtDNA','15452A: with 4216C, marks haplogroup JT','A','lineage','mitochondrial missense variant'],
  ['rs2853826','MT',10398,'mtDNA','10398G: marks J within JT','G','lineage','mitochondrial missense variant'],
  ['mt12308','MT',12308,'mtDNA','12308G: marks haplogroup U, K included','G','lineage','mitochondrial tRNA variant'],
];

// Markers read for reports but not listed in the table above (indels and rare variants).
const EXTRA_IDS = ['i4000377','i4000378','i4000379','rs113993960','rs387906309','rs113993962'];
const CURATED_IDS = SNP_DEF.map(r => r[0]).concat(EXTRA_IDS);
// GRCh37 positions, so a marker stored under another name (such as a 23andMe i-number) is still found.
const CURATED_POS = {}; SNP_DEF.forEach(r => { CURATED_POS[r[0]] = r[1] + ':' + r[2]; });

/* 1000 Genomes global minor allele and its frequency, from Ensembl (GRCh37).
   Markers without a value there are left out rather than guessed. */
const MAF = { rs1801133:['A',0.245], rs3918290:['T',0.003], rs76763715:['C',0.0006], rs4988235:['A',0.161], rs41380347:['C',0.0006],
  rs1799945:['G',0.073], rs1800562:['A',0.0126], rs2187668:['T',0.078], rs3798220:['C',0.051], rs10455872:['G',0.022], rs713598:['C',0.495],
  rs12248560:['T',0.153], rs4986893:['A',0.014], rs4244285:['A',0.221], rs1799853:['T',0.048], rs1057910:['C',0.049], rs7903146:['T',0.228],
  rs11549407:['A',0.0002], rs334:['A',0.027], rs72921001:['A',0.324], rs1799963:['A',0.0036], rs4149056:['C',0.088], rs671:['A',0.036],
  rs12913832:['G',0.177], rs762551:['C',0.370], rs28940579:['G',0.0002], rs61752717:['C',0.0002], rs9923231:['T',0.356], rs17822931:['T',0.301],
  rs1805007:['T',0.019], rs429358:['C',0.151], rs7412:['T',0.075], rs1050828:['T',0.038], rs5030868:['A',0.0008] };

// Calls for the built-in sample person.
const SAMPLE_GENOS = {
  rs4477212:'AA', rs1801133:'AG', rs3918290:'CC', rs76763715:'TC', rs6025:'CC', rs4988235:'AG', rs1799945:'CG', rs1800562:'GG',
  rs2187668:'CT', rs3798220:'TT', rs10455872:'AA', rs713598:'CG', rs12248560:'CC', rs4244285:'AG', rs1799853:'CC', rs1057910:'AA',
  rs7903146:'CT', rs334:'TT', rs72921001:'AC', rs1799963:'GG', rs1815739:'CT', rs4149056:'TC', rs671:'GG', rs12913832:'AG',
  rs762551:'AC', rs9923231:'CT', rs17822931:'CC', rs1805007:'CT', rs429358:'CT', rs7412:'CC',
  rs41380347:'AA', rs4986893:'GG', rs11549407:'GG', rs35004220:'CC', rs28940579:'AA', rs28940578:'CC', rs61752717:'TT', rs28940580:'CC', rs1050828:'C', rs5030868:'G',
  rs9786153:'C', rs34276300:'A', rs1236440:'T', rs17250535:'T', rs13447352:'A', rs9341313:'T', rs2032604:'T', rs2032654:'A', rs2032636:'G', rs9341296:'C',
  rs2854128:'A', rs2015062:'C', rs3928306:'A', rs2853495:'G', rs1599988:'T', rs193302994:'C', rs2853826:'A', mt12308:'A',
  i4000377:'II', i4000378:'DD', i4000379:'II', rs113993960:'II', rs387906309:'DD', rs113993962:'II'
};

const COMP = { A: 'T', T: 'A', C: 'G', G: 'C' };
const nocall = g => !g || g === '--' || g === '00' || /^-+$/.test(g);
const showGeno = g => nocall(g) ? 'No call' : g.length === 2 && !/[ID]/.test(g) ? g[0] + '/' + g[1] : g;

/* Count copies of `allele` in genotype `g`. Returns null when the marker is
   missing or a no-call. If neither the allele nor the other expected allele
   appears but their complements do, the call is read on the other strand. */
function copies(g, allele, other) {
  if (nocall(g) || !allele) return null;
  let n = 0; for (const ch of g) if (ch === allele) n++;
  if (n === 0 && other && !g.includes(other) && COMP[allele] && [...g].every(ch => ch === COMP[allele] || ch === COMP[other])) {
    for (const ch of g) if (ch === COMP[allele]) n++;
  }
  return Math.min(n, 2);
}
const OTHER = { rs1801133:'G', rs3918290:'C', rs76763715:'T', rs6025:'C', rs4988235:'G', rs1799945:'C', rs1800562:'G', rs2187668:'C', rs3798220:'T', rs10455872:'A', rs713598:'C', rs12248560:'C', rs4244285:'G', rs1799853:'C', rs1057910:'A', rs7903146:'C', rs334:'T', rs72921001:'A', rs1799963:'G', rs1815739:'C', rs4149056:'T', rs671:'G', rs12913832:'A', rs762551:'A', rs9923231:'C', rs17822931:'C', rs1805007:'C', rs429358:'T', rs7412:'C', rs35004220:'C', rs61752717:'T', rs41380347:'A', rs4986893:'G', rs11549407:'G', rs28940579:'A', rs28940578:'C', rs28940580:'C', rs1050828:'C', rs5030868:'G' };
const EFFECT = {}; SNP_DEF.forEach(r => { if (r[5]) EFFECT[r[0]] = r[5]; });

const word = n => n === 0 ? 'No copies' : n === 1 ? 'One copy' : 'Two copies';
const copiesLabel = (n, eff) => t('{0} of 2 copies of the {1} allele', n == null ? '?' : n, eff);

/* Indel markers (I/D calls). I is the longer allele and D the shorter, so a
   deletion variant shows as D and an insertion variant as I. A mixed call is
   one copy; the variant letter twice is two copies. Rare calls on consumer
   chips are often wrong, so any copy needs a clinical test. */
const INDEL_EFF = { i4000377: 'D', i4000378: 'I', i4000379: 'D', rs113993960: 'D', rs387906309: 'I' };
function indel(g, id) {
  if (nocall(g)) return null;
  if (g.length === 2 && g[0] !== g[1]) return 1;
  const eff = INDEL_EFF[id];
  return eff && g === eff + eff ? 2 : 0;
}

/* ---------- Health risks ---------- */
function buildHealth(G, xx) {
  const c = (id) => copies(G[id], EFFECT[id], OTHER[id]);
  const out = [];

  // APOE
  {
    const e4 = c('rs429358'), e2 = c('rs7412');
    const miss = e4 == null || e2 == null;
    const pairs = { '00': 'ε3/ε3', '10': 'ε3/ε4', '20': 'ε4/ε4', '01': 'ε2/ε3', '02': 'ε2/ε2', '11': 'ε2/ε4' };
    const geno = miss ? 'Not called' : (pairs[`${e4}${e2}`] || 'Unusual combination');
    const level = miss ? -1 : e4 >= 1 ? 2 : 0;
    out.push({ id: 'apoe', sens: true, short: "Alzheimer's risk (APOE)", title: "Late-onset Alzheimer's disease", gene: 'APOE', level,
      tag: miss ? 'Not called' : e4 === 2 ? 'Elevated' : e4 === 1 ? 'Elevated' : 'Typical',
      result: miss ? 'One or both APOE markers were not read' : e4 === 1 ? t('{0}, one copy of ε4', geno) : e4 === 2 ? t('{0}, two copies of ε4', geno) : t('{0}, no ε4', geno),
      markers: `rs429358 ${showGeno(G.rs429358)}, rs7412 ${showGeno(G.rs7412)}`, n: e4, eff: 'ε4', freq: 'About 1 in 4 people carry at least one ε4 copy.',
      why: "This shows whether you carry APOE ε4, which is linked to higher Alzheimer's risk. It can't tell you whether you will develop the disease, and no treatment changes the genetic risk, so some people prefer not to know.",
      summary: e4 === 2 ? "Two copies of APOE ε4 are associated with roughly 8 to 12 times the typical risk of late-onset Alzheimer's disease."
        : e4 === 1 ? "One copy of APOE ε4 is associated with about 2 to 3 times the typical risk of late-onset Alzheimer's disease."
        : e2 >= 1 ? "You have no ε4 copies. ε2 is linked to slightly lower Alzheimer's risk." : "You have no ε4 copies, the most common result.",
      detail: e4 >= 1 ? "Most people with one ε4 copy never develop Alzheimer's. Age, blood pressure, sleep, hearing and activity also contribute. ε4 is also linked to higher LDL cholesterol." : "Most Alzheimer's risk comes from age and other factors, not APOE alone.",
      evidence: 'Strong', src: 'ClinVar; Farrer et al., 1997',
      next: e4 >= 1 ? 'A genetic counselor can help you talk this through. Heart-healthy habits (blood pressure, exercise, sleep) are linked to lower dementia risk for everyone.' : 'No action needed. Heart-healthy habits help everyone.' });
  }
  // TCF7L2
  {
    const n = c('rs7903146');
    out.push({ id: 't2d', title: 'Type 2 diabetes', gene: 'TCF7L2', level: n == null ? -1 : n === 2 ? 2 : n,
      tag: n == null ? 'Not called' : n === 2 ? 'Elevated' : n === 1 ? 'Slightly elevated' : 'Typical',
      result: n == null ? 'Not called' : n === 0 ? 'No risk alleles' : n === 1 ? 'One risk allele' : 'Two risk alleles', markers: `rs7903146 ${showGeno(G.rs7903146)}`, n, eff: 'T risk',
      freq: 'About half of people of European ancestry carry at least one T.',
      summary: n === 0 ? 'You do not carry the T allele, the strongest common genetic signal for type 2 diabetes.' : 'This is the strongest common genetic signal for type 2 diabetes, raising risk by about 1.4 times per copy.',
      detail: 'Weight, diet and activity have a much larger effect than this variant.', evidence: 'Strong', src: 'GWAS Catalog',
      next: n >= 1 ? 'Ask for a fasting glucose or HbA1c test at your next checkup.' : 'No action needed beyond routine checkups.' });
  }
  // Celiac
  {
    const n = c('rs2187668');
    out.push({ id: 'celiac', title: 'Celiac disease', gene: 'HLA-DQ2.5', level: n == null ? -1 : n >= 1 ? 1 : 0,
      tag: n == null ? 'Not called' : n === 2 ? 'Elevated' : n === 1 ? 'Slightly elevated' : 'Typical',
      result: n == null ? 'Not called' : n === 0 ? 'No DQ2.5 tag' : n === 1 ? 'One DQ2.5 tag' : 'Two DQ2.5 tags', markers: `rs2187668 ${showGeno(G.rs2187668)}`, n, eff: 'DQ2.5',
      freq: 'About 1 in 4 people of European ancestry carry DQ2.5.',
      summary: n === 0 ? 'DQ2.5 was not found. Most celiac disease needs DQ2.5 or DQ8, so your risk is lower than average. DQ8 is not tested here.' : 'DQ2.5 is needed for most celiac disease, but about 1 in 3 people carry it and most never develop the condition.',
      detail: 'Diagnosis needs blood tests and a biopsy, not genotype.', evidence: 'Moderate', src: 'ClinVar, SNPedia',
      next: n >= 1 ? 'Only relevant if you have symptoms. Ask about a tTG-IgA blood test before cutting out gluten.' : 'No action needed.' });
  }
  // HFE
  {
    const cy = c('rs1800562'), h = c('rs1799945');
    const miss = cy == null && h == null;
    let level = 0, tag = 'Typical', result = 'C282Y and H63D not found', summary = 'Neither of the two main hemochromatosis variants was found.';
    if (miss) { level = -1; tag = 'Not called'; result = 'Not called'; summary = 'The HFE markers were not read in this file.'; }
    else if (cy === 2) { level = 2; tag = 'Elevated'; result = 'C282Y, two copies'; summary = 'Two copies of C282Y is the main genetic cause of iron overload. Many people with this result build up extra iron over time.'; }
    else if (cy === 1 && h >= 1) { level = 1; tag = 'Slightly elevated'; result = 'C282Y and H63D, one copy each'; summary = 'One copy each of C282Y and H63D slightly raises the chance of iron overload, though most people with it never develop symptoms.'; }
    else if (cy === 1) { result = 'C282Y, one copy'; summary = 'One copy of C282Y makes you a carrier. On its own it rarely causes iron overload.'; }
    else if (h === 2) { level = 1; tag = 'Slightly elevated'; result = 'H63D, two copies'; summary = 'Two copies of H63D can slightly raise iron levels but rarely cause disease.'; }
    else if (h === 1) { result = 'H63D, one copy'; summary = 'The main C282Y variant was not found. One copy of H63D on its own rarely causes iron overload.'; }
    const showC = cy > 0;
    out.push({ id: 'hfe', title: 'Hereditary hemochromatosis', gene: 'HFE', level, tag, result, markers: `rs1800562 ${showGeno(G.rs1800562)}, rs1799945 ${showGeno(G.rs1799945)}`,
      n: showC ? cy : h, eff: showC ? 'C282Y' : 'H63D', freq: showC ? 'About 1 in 10 people of Northern European ancestry carry C282Y.' : 'About 1 in 5 people of European ancestry carry H63D.',
      summary, detail: 'Iron build-up also depends on sex, age, diet and alcohol.', evidence: 'Strong', src: 'ClinVar',
      next: level >= 1 ? 'Ask for ferritin and transferrin saturation blood tests.' : 'No action needed. If you have fatigue or joint pain, ask for a ferritin test.' });
  }
  // Clotting
  {
    const f = c('rs6025'), p = c('rs1799963');
    const miss = f == null && p == null, n = (f || 0) + (p || 0);
    out.push({ id: 'f5', title: 'Inherited blood clotting risk', gene: 'F5, F2', level: miss ? -1 : n >= 1 ? 2 : 0,
      tag: miss ? 'Not called' : n >= 1 ? 'Elevated' : 'Typical',
      result: miss ? 'Not called' : n === 0 ? 'Not detected' : [f ? (f === 1 ? t('Factor V Leiden, one copy') : t('Factor V Leiden, two copies')) : '', p ? (p === 1 ? t('Prothrombin G20210A, one copy') : t('Prothrombin G20210A, two copies')) : ''].filter(Boolean).join('; '),
      markers: `rs6025 ${showGeno(G.rs6025)}, rs1799963 ${showGeno(G.rs1799963)}`, n: Math.min(n, 2), eff: 'risk', freq: 'About 1 in 20 people of European ancestry carry Factor V Leiden.',
      summary: n === 0 ? 'Factor V Leiden and prothrombin G20210A, the two most common inherited clotting variants, were not found.' : 'You carry an inherited clotting variant. One copy raises the chance of a deep vein clot several times, especially with estrogen, surgery or long travel.',
      detail: 'Other clotting variants exist that this chip does not test.', evidence: 'Strong', src: 'ClinVar',
      next: n >= 1 ? 'Tell your doctor before surgery, pregnancy, or starting estrogen-containing medicine.' : 'Tell your doctor if close relatives had blood clots, since other variants exist.' });
  }
  // LPA
  {
    const g = c('rs10455872'), i = c('rs3798220');
    const miss = g == null && i == null, n = (g || 0) + (i || 0);
    out.push({ id: 'lpa', title: 'Lipoprotein(a)', gene: 'LPA', level: miss ? -1 : n >= 2 ? 2 : n,
      tag: miss ? 'Not called' : n >= 2 ? 'Elevated' : n === 1 ? 'Slightly elevated' : 'Typical',
      result: miss ? 'Not called' : n === 0 ? 'No common high-Lp(a) variants' : (n === 1 ? t('One copy of a high-Lp(a) variant') : t('Two copies of a high-Lp(a) variant')), markers: `rs10455872 ${showGeno(G.rs10455872)}, rs3798220 ${showGeno(G.rs3798220)}`,
      n: Math.min(n, 2), eff: 'high-Lp(a)', freq: 'About 1 in 7 people of European ancestry carry rs10455872 G.',
      summary: n === 0 ? 'Neither of the two common variants linked to high Lp(a) was found.' : 'These variants are linked to high Lp(a), a lifelong heart risk factor that standard cholesterol tests miss.',
      detail: 'Lp(a) is mostly genetic but driven by many variants.', evidence: 'Moderate', src: 'GWAS Catalog',
      next: n >= 1 ? 'Ask for a one-time Lp(a) blood test.' : 'Consider a one-time Lp(a) blood test, especially with a family history of early heart disease.' });
  }
  // G6PD (X chromosome: one copy is enough in people with one X)
  {
    const a = c('rs1050828'), m = c('rs5030868');
    const miss = a == null && m == null, n = Math.min((a || 0) + (m || 0), 2);
    const oneX = !xx, hit = n >= 1;
    const level = miss ? -1 : !hit ? 0 : oneX || n === 2 ? 2 : 1;
    const which = [a ? 'G6PD A-' : '', m ? 'G6PD Mediterranean' : ''].filter(Boolean).join(' and ');
    out.push({ id: 'g6pd', title: 'G6PD deficiency (favism)', gene: 'G6PD', level,
      tag: miss ? 'Not called' : level === 2 ? 'Likely' : level === 1 ? 'Carrier' : 'Not detected',
      result: miss ? 'Not called' : !hit ? 'A- and Mediterranean variants not found' : oneX ? t('{0}, on your one X', which) : n === 2 ? t('{0}, on both X copies', which) : t('{0}, one copy', which),
      markers: `rs1050828 ${showGeno(G.rs1050828)}, rs5030868 ${showGeno(G.rs5030868)}`, n: oneX && hit ? 2 : n, eff: 'deficiency',
      freq: 'G6PD deficiency is common across the Middle East, the Mediterranean, Africa and South Asia.',
      summary: !hit ? 'Neither of the two most common G6PD deficiency variants was found.' : level === 2 ? 'This variant usually lowers G6PD enzyme levels. Fava beans, some antimalarials, some antibiotics and other oxidant drugs can then break down red blood cells.' : 'With one X copy carrying this variant, enzyme levels are often normal or mildly low.',
      detail: 'G6PD A- usually also needs a second change (376G) that this report does not check. Other G6PD variants exist.', evidence: 'Strong', src: 'ClinVar; CPIC',
      next: level >= 1 ? 'Ask for a G6PD enzyme blood test, and mention this before taking primaquine, dapsone or rasburicase.' : 'No action needed.' });
  }
  // BRCA
  {
    const ids = ['i4000377', 'i4000378', 'i4000379'];
    const v = ids.map(id => indel(G[id], id)), tested = v.filter(x => x != null).length, found = v.filter(x => x >= 1).length;
    const level = tested === 0 ? -1 : found ? 2 : 0;
    out.push({ id: 'brca', sens: true, short: 'BRCA1 and BRCA2', title: 'BRCA1 and BRCA2 (3 variants)', gene: 'BRCA1, BRCA2', level,
      tag: tested === 0 ? 'Not called' : found ? 'Possible variant' : 'Not detected',
      result: tested === 0 ? 'These markers were not read' : found ? t('{0} of {1} tested variants may be present', found, tested) : t('0 of {0} tested variants found', tested),
      markers: ids.map(id => `${id} ${showGeno(G[id])}`).join(', '), n: Math.min(found, 2), eff: 'harmful', rare: !!found,
      freq: 'About 1 in 40 Ashkenazi Jewish people carry one of these three.',
      why: 'This checks 3 of more than 1,000 known harmful BRCA variants. A positive result would mean a much higher risk of some cancers. A negative result does not rule one out.',
      summary: found ? 'Your file shows a call at a BRCA founder variant. Rare calls on consumer chips are often wrong, so this needs a clinical test before you act on it.' : 'The three founder variants most common in people with Ashkenazi Jewish ancestry were not found.',
      detail: 'Family history of breast, ovarian, prostate or pancreatic cancer matters more than this result.', evidence: 'Strong', src: 'ClinVar',
      next: found ? 'Ask your doctor for clinical BRCA testing and a genetic counselor referral.' : 'If close relatives had these cancers, ask your doctor about clinical BRCA testing.' });
  }
  return out;
}

/* ---------- Carrier status ---------- */
const CARRIER_DEF = [
  { cond: 'Gaucher disease type 1', gene: 'GBA', variant: 'N370S', rsid: 'rs76763715', freq: 'About 1 in 15 Ashkenazi Jewish people carry N370S.' },
  { cond: 'Cystic fibrosis', gene: 'CFTR', variant: 'F508del', rsid: 'rs113993960', indel: true, freq: 'About 1 in 25 people of European ancestry carry a CF variant.' },
  { cond: 'Tay-Sachs disease', gene: 'HEXA', variant: '1278insTATC', rsid: 'rs387906309', indel: true, freq: 'About 1 in 30 Ashkenazi Jewish people are carriers.' },
  { cond: 'Bloom syndrome', gene: 'BLM', variant: 'blmAsh', rsid: 'rs113993962', indel: true, freq: 'About 1 in 100 Ashkenazi Jewish people are carriers.' },
  { cond: 'Sickle cell anemia', gene: 'HBB', variant: 'E6V', rsid: 'rs334', freq: 'About 1 in 13 Black Americans carry sickle cell trait.' },
  { cond: 'Beta thalassemia', gene: 'HBB', variant: 'IVS1-110', rsid: 'rs35004220', freq: 'IVS1-110 is one of the most frequent beta thalassemia variants around the Mediterranean.' },
  { cond: 'Beta thalassemia', gene: 'HBB', variant: 'codon 39 (Q40X)', rsid: 'rs11549407', freq: 'Codon 39 is common in Sardinia, Italy and across the Mediterranean.' },
  { cond: 'Familial Mediterranean fever', gene: 'MEFV', variant: 'M694V', rsid: 'rs61752717', freq: 'Common in Armenian, Turkish, Arab and Jewish populations.' },
  { cond: 'Familial Mediterranean fever', gene: 'MEFV', variant: 'M694I', rsid: 'rs28940578', freq: 'Most common in Arab and North African populations.' },
  { cond: 'Familial Mediterranean fever', gene: 'MEFV', variant: 'M680I', rsid: 'rs28940580', freq: 'Common in Armenian, Turkish and Arab populations.' },
  { cond: 'Familial Mediterranean fever', gene: 'MEFV', variant: 'V726A', rsid: 'rs28940579', freq: 'Found in Armenian, Arab, Jewish and Druze populations.' }
];
function buildCarrier(G) {
  return CARRIER_DEF.map(d => {
    const g = G[d.rsid];
    const n = d.indel ? indel(g, d.rsid) : copies(g, EFFECT[d.rsid], OTHER[d.rsid]);
    return { ...d, geno: showGeno(g), n, carrier: n === 1, affected: n === 2, missing: n == null, rare: n >= 1 };
  });
}

/* ---------- Drug response ---------- */
function buildDrugs(G) {
  const c = id => copies(G[id], EFFECT[id], OTHER[id]);
  const out = [];
  {
    const s2r = c('rs4244285'), s3 = c('rs4986893') || 0, s17 = c('rs12248560');
    let d = { gene: 'CYP2C19', drugs: 'Clopidogrel, citalopram, omeprazole', markers: `rs4244285 ${showGeno(G.rs4244285)}` + (G.rs4986893 ? `, rs4986893 ${showGeno(G.rs4986893)}` : '') + (G.rs12248560 ? `, rs12248560 ${showGeno(G.rs12248560)}` : ''), chipDep: true };
    if (s2r == null) Object.assign(d, { missing: true });
    else {
      const s2 = Math.min(s2r + s3, 2), t17 = s17 || 0, a = [];
      for (let i = 0; i < Math.min(s2r, 2); i++) a.push('*2');
      for (let i = 0; i < s3 && a.length < 2; i++) a.push('*3');
      for (let i = 0; i < Math.min(t17, 2 - a.length); i++) a.push('*17');
      while (a.length < 2) a.unshift('*1');
      const rank = x => ['*1', '*2', '*3', '*17'].indexOf(x); a.sort((x, y) => rank(x) - rank(y));
      const diplo = a.join('/');
      if (s2 === 2) Object.assign(d, { diplo, pheno: 'Poor metabolizer', level: 2, note: 'Clopidogrel is unlikely to work well. CPIC guidance recommends a different antiplatelet drug.', next: 'Mention this before starting clopidogrel, an SSRI or a proton pump inhibitor.' });
      else if (s2 === 1) Object.assign(d, { diplo, pheno: 'Intermediate metabolizer', level: 2, note: 'Clopidogrel may be less effective. CPIC guidance suggests considering a different antiplatelet drug.', next: 'Mention this before starting clopidogrel or an SSRI.' });
      else if (t17 === 2) Object.assign(d, { diplo, pheno: 'Ultrarapid metabolizer', level: 1, note: 'Some SSRIs and proton pump inhibitors may clear faster and work less well at standard doses.', next: 'Mention this if an SSRI or acid reducer is prescribed.' });
      else if (t17 === 1) Object.assign(d, { diplo, pheno: 'Rapid metabolizer', level: 1, note: 'Some SSRIs and proton pump inhibitors may clear a little faster than usual.', next: 'Mention this if an SSRI or acid reducer is prescribed.' });
      else Object.assign(d, { diplo, pheno: 'Normal metabolizer', level: 0, note: 'Standard dosing applies.' + (G.rs12248560 ? '' : ' The *17 marker was not in your file.'), next: 'No action needed.' });
    }
    out.push(d);
  }
  {
    const n = c('rs4149056');
    const d = { gene: 'SLCO1B1', drugs: 'Simvastatin, atorvastatin', markers: `rs4149056 ${showGeno(G.rs4149056)}`, chipDep: true };
    if (n == null) d.missing = true;
    else if (n === 2) Object.assign(d, { diplo: '*5/*5', pheno: 'Poor function', level: 2, note: 'High chance of muscle pain on simvastatin. CPIC guidance suggests a different statin or a low dose.', next: 'If a statin is prescribed, ask which one fits this result.' });
    else if (n === 1) Object.assign(d, { diplo: '*1/*5', pheno: 'Decreased function', level: 2, note: 'Higher chance of muscle pain on high-dose simvastatin.', next: 'If a statin is prescribed, ask whether a lower dose or a different statin fits better.' });
    else Object.assign(d, { diplo: '*1/*1', pheno: 'Normal function', level: 0, note: 'Standard statin dosing applies.', next: 'No action needed.' });
    out.push(d);
  }
  {
    const n = c('rs9923231');
    const d = { gene: 'VKORC1', drugs: 'Warfarin', markers: `rs9923231 ${showGeno(G.rs9923231)}` };
    if (n == null) d.missing = true;
    else Object.assign(d, [
      { diplo: '-1639 G/G', pheno: 'Typical warfarin sensitivity', level: 0, note: 'Standard warfarin dosing applies.', next: 'No action needed.' },
      { diplo: '-1639 G/A', pheno: 'Moderate warfarin sensitivity', level: 1, note: 'May need a lower starting dose. Dosing calculators combine this with CYP2C9.', next: 'Share with whoever doses warfarin, if it is ever prescribed.' },
      { diplo: '-1639 A/A', pheno: 'High warfarin sensitivity', level: 2, note: 'Likely needs a much lower warfarin dose. Dosing calculators combine this with CYP2C9.', next: 'Share with whoever doses warfarin, if it is ever prescribed.' }][n]);
    out.push(d);
  }
  {
    const s2 = c('rs1799853'), s3 = c('rs1057910');
    const d = { gene: 'CYP2C9', drugs: 'Warfarin, ibuprofen, phenytoin', markers: `rs1799853 ${showGeno(G.rs1799853)}, rs1057910 ${showGeno(G.rs1057910)}` };
    if (s2 == null && s3 == null) d.missing = true;
    else {
      const a = []; for (let i = 0; i < (s2 || 0); i++) a.push('*2'); for (let i = 0; i < (s3 || 0) && a.length < 2; i++) a.push('*3'); while (a.length < 2) a.unshift('*1');
      const score = a.reduce((t, x) => t + (x === '*1' ? 1 : x === '*2' ? 0.5 : 0), 0);
      Object.assign(d, { diplo: a.join('/') },
        score >= 2 ? { pheno: 'Normal metabolizer', level: 0, note: 'Standard dosing applies.', next: 'No action needed.' }
        : score >= 1 ? { pheno: 'Intermediate metabolizer', level: 1, note: 'Some drugs, like warfarin and certain painkillers, may build up more than usual.', next: 'Mention this if warfarin, phenytoin or a long-term NSAID is prescribed.' }
        : { pheno: 'Poor metabolizer', level: 2, note: 'Warfarin, phenytoin and some NSAIDs can build up. CPIC guidance suggests lower doses or other drugs.', next: 'Mention this before starting warfarin, phenytoin or an NSAID.' });
    }
    out.push(d);
  }
  {
    const n = c('rs3918290');
    const d = { gene: 'DPYD', drugs: 'Fluorouracil, capecitabine', markers: `rs3918290 ${showGeno(G.rs3918290)}` };
    if (n == null) d.missing = true;
    else Object.assign(d, n === 0 ? { diplo: 'Normal', pheno: 'Normal function', level: 0, note: 'No reduced-function variants found among those tested.', next: 'No action needed.' }
      : { diplo: n === 1 ? '*1/*2A' : '*2A/*2A', pheno: n === 1 ? 'Intermediate function' : 'Poor function', level: 2, rare: true, note: 'Standard doses of fluorouracil or capecitabine could cause severe side effects. CPIC guidance calls for a reduced dose or a different drug.', next: 'Confirm with a clinical test and tell any oncologist before chemotherapy.' });
    out.push(d);
  }
  out.push({ gene: 'CYP2D6', diplo: 'Not called', pheno: 'Cannot be determined', level: -1, drugs: 'Codeine, tamoxifen, many antidepressants', markers: 'Chip limitation',
    note: 'CYP2D6 often has extra gene copies or deletions, which genotyping chips cannot see.', next: 'Ask for clinical CYP2D6 testing if one of these drugs is being considered.' });
  return out;
}

/* ---------- Traits ---------- */
const TRAIT_DEF = [
  { name: 'Eye color', gene: 'HERC2', rsid: 'rs12913832', ev: 'Moderate', icon: 'ph-eye', eff: 'blue-eye G', out: ['Likely brown', 'Likely hazel or green', 'Likely blue'], freq: 'Most people of Northern European ancestry carry at least one G.' },
  { name: 'Lactose tolerance', gene: 'MCM6', rsid: 'rs4988235', ev: 'Strong', icon: 'ph-drop', eff: 'lactase-persistence A', out: ['Likely intolerant as an adult', 'Likely tolerant as an adult', 'Likely tolerant as an adult'], freq: 'Most Northern Europeans carry this; it is rare in East Asia.' },
  { name: 'Caffeine metabolism', gene: 'CYP1A2', rsid: 'rs762551', ev: 'Moderate', icon: 'ph-coffee', eff: 'slow C', out: ['Fast metabolizer', 'Slower metabolizer', 'Slower metabolizer'], freq: 'About half of people carry at least one slow C.' },
  { name: 'Bitter taste', gene: 'TAS2R38', rsid: 'rs713598', ev: 'Strong', icon: 'ph-leaf', eff: 'taster', out: ['Less sensitive to bitter compounds', 'Can taste bitter compounds', 'Can taste bitter compounds strongly'], freq: 'About 3 in 4 people can taste PTC.' },
  { name: 'Earwax type', gene: 'ABCC11', rsid: 'rs17822931', ev: 'Strong', icon: 'ph-ear', eff: 'dry-earwax T', out: ['Wet earwax', 'Wet earwax', 'Dry earwax'], freq: 'Dry earwax is the norm in East Asia and rare in Europe.' },
  { name: 'Alcohol flush', gene: 'ALDH2', rsid: 'rs671', ev: 'Strong', icon: 'ph-wine', eff: 'flush A', out: ['No flush reaction expected', 'Likely flush after alcohol', 'Strong flush likely'], freq: 'The flush allele is common in East Asia (about 1 in 3) and rare elsewhere.' },
  { name: 'Freckling', gene: 'MC1R', rsid: 'rs1805007', ev: 'Moderate', icon: 'ph-sun', eff: 'R151C T', out: ['Typical freckling', 'More likely to freckle', 'Much more likely to freckle'], freq: 'About 1 in 10 people of European ancestry carry R151C.' },
  { name: 'Muscle composition', gene: 'ACTN3', rsid: 'rs1815739', ev: 'Limited', icon: 'ph-barbell', eff: 'X (T)', out: ['More power-type fibers', 'Mix of power and endurance fibers', 'More endurance-type fibers'], freq: 'About 1 in 5 people have two X copies.' },
  { name: 'Cilantro taste', gene: 'OR6A2', rsid: 'rs72921001', ev: 'Limited', icon: 'ph-plant', eff: 'soapy C', out: ['Likely tastes like an herb', 'Might taste soapy', 'More likely to taste soapy'], freq: 'Roughly 1 in 7 people of European ancestry find cilantro soapy.' }
];
function buildTraits(G) {
  return TRAIT_DEF.map(t => {
    if (t.rsid === 'rs4988235') {
      // Two separate lactase-persistence variants: -13910T (Europe) and -13915G (Arabia).
      const eu = copies(G.rs4988235, 'A', 'G'), ar = copies(G.rs41380347, 'C', 'A');
      const miss = eu == null && ar == null, n = miss ? null : Math.min((eu || 0) + (ar || 0), 2);
      return { ...t, n, eff: ar > 0 ? 'lactase-persistence' : t.eff, geno: showGeno(G.rs4988235) + (G.rs41380347 ? `, rs41380347 ${showGeno(G.rs41380347)}` : ''),
        freq: 'Checks the European variant and the Arabian one (rs41380347). Other variants exist in East Africa.', result: miss ? 'Not in your file' : t.out[n], missing: miss };
    }
    const n = copies(G[t.rsid], EFFECT[t.rsid], OTHER[t.rsid]);
    return { ...t, n, geno: showGeno(G[t.rsid]), result: n == null ? 'Not in your file' : t.out[n], missing: n == null }; });
}

/* ---------- Lineage ---------- */
function buildLineage(G, hasY) {
  const has = (id, a) => !nocall(G[id]) && G[id].includes(a);
  const lacks = (id, a) => !nocall(G[id]) && !G[id].includes(a);
  let mat = null;
  if (has('rs2015062', 'C') && has('rs2854128', 'A')) mat = has('rs3928306', 'A') ? LINEAGE.H1 : LINEAGE.H;
  else if (has('rs1599988', 'C') && has('rs193302994', 'A')) mat = has('rs2853826', 'G') ? (has('rs3928306', 'A') ? LINEAGE.J1 : LINEAGE.J) : LINEAGE.T;
  else if (has('rs2853495', 'G') && lacks('rs2015062', 'C')) mat = LINEAGE.R0;
  else if (has('mt12308', 'G')) mat = LINEAGE.U;
  let pat = null;
  if (hasY) {
    if (has('rs9786153', 'C')) pat = has('rs34276300', 'A') ? (has('rs1236440', 'T') ? LINEAGE['R-U152'] : LINEAGE['R-P312']) : LINEAGE['R-M269'];
    else if (has('rs17250535', 'A')) pat = LINEAGE.R1a;
    else if (has('rs9341313', 'G')) pat = LINEAGE.J1y;
    else if (has('rs2032604', 'G')) pat = LINEAGE.J2y;
    else if (has('rs13447352', 'C')) pat = LINEAGE.Jy;
    else if (has('rs2032654', 'G')) pat = LINEAGE.E1b1b;
    else if (has('rs2032636', 'T')) pat = LINEAGE.G;
    else if (has('rs9341296', 'T')) pat = LINEAGE.I1;
  }
  return { mat, pat };
}

/* ---------- ClinVar subset bundled with the app ---------- */
const CLINVAR = [
  { rsid: 'rs76763715', gene: 'GBA', cls: 'Pathogenic', cond: 'Gaucher disease', level: 1, rare: true },
  { rsid: 'rs4244285', gene: 'CYP2C19', cls: 'Drug response', cond: 'Clopidogrel response', level: 2 },
  { rsid: 'rs1799945', gene: 'HFE', cls: 'Pathogenic, low penetrance', cond: 'Hemochromatosis (H63D)', level: 0 },
  { rsid: 'rs1800562', gene: 'HFE', cls: 'Pathogenic', cond: 'Hemochromatosis (C282Y)', level: 1 },
  { rsid: 'rs429358', gene: 'APOE', cls: 'Risk factor', cond: "Alzheimer's disease", level: 2, sens: 'apoe' },
  { rsid: 'rs6025', gene: 'F5', cls: 'Pathogenic', cond: 'Factor V Leiden thrombophilia', level: 2 },
  { rsid: 'rs1799963', gene: 'F2', cls: 'Pathogenic', cond: 'Prothrombin thrombophilia', level: 2 },
  { rsid: 'rs334', gene: 'HBB', cls: 'Pathogenic', cond: 'Sickle cell anemia', level: 1, rare: true },
  { rsid: 'rs35004220', gene: 'HBB', cls: 'Pathogenic', cond: 'Beta thalassemia', level: 1, rare: true },
  { rsid: 'rs61752717', gene: 'MEFV', cls: 'Pathogenic', cond: 'Familial Mediterranean fever', level: 1, rare: true },
  { rsid: 'rs3918290', gene: 'DPYD', cls: 'Drug response', cond: 'Fluoropyrimidine toxicity', level: 2, rare: true },
  { rsid: 'rs4986893', gene: 'CYP2C19', cls: 'Drug response', cond: 'Clopidogrel response (*3)', level: 2 },
  { rsid: 'rs11549407', gene: 'HBB', cls: 'Pathogenic', cond: 'Beta thalassemia (codon 39)', level: 1, rare: true },
  { rsid: 'rs28940578', gene: 'MEFV', cls: 'Pathogenic', cond: 'Familial Mediterranean fever (M694I)', level: 1, rare: true },
  { rsid: 'rs28940580', gene: 'MEFV', cls: 'Pathogenic', cond: 'Familial Mediterranean fever (M680I)', level: 1, rare: true },
  { rsid: 'rs28940579', gene: 'MEFV', cls: 'Pathogenic', cond: 'Familial Mediterranean fever (V726A)', level: 1, rare: true },
  { rsid: 'rs5030868', gene: 'G6PD', cls: 'Pathogenic', cond: 'G6PD deficiency (Mediterranean)', level: 2 },
  { rsid: 'rs1050828', gene: 'G6PD', cls: 'Pathogenic', cond: 'G6PD deficiency (A-)', level: 2 }
];
function scanClinvar(G) {
  return CLINVAR.map(x => ({ ...x, n: copies(G[x.rsid], EFFECT[x.rsid], OTHER[x.rsid]) }))
    .filter(x => x.n >= 1)
    .map(x => ({ ...x, cond: x.n !== 1 ? t('{0}, two copies', x.cond) : x.level === 1 && x.cls === 'Pathogenic' ? t('{0}, one copy (carrier)', x.cond) : t('{0}, one copy', x.cond) }));
}

/* ---------- Explorer rows ---------- */
function snpRows(G, real) {
  return SNP_DEF.map(([rsid, chr, pos, gene, desc, eff, cat, cons], i) => {
    const g = G[rsid];
    const p = real && real.pos && real.pos[rsid] ? real.pos[rsid] : pos;
    let label = desc;
    if (eff && cat !== 'lineage' && !nocall(g)) { const n = copies(g, eff, OTHER[rsid]); if (n != null) label = n === 0 ? t('{0}: not present', desc) : n === 1 ? t('{0}: one copy', desc) : t('{0}: two copies', desc); }
    if (cat === 'lineage' && !nocall(g)) label = (g.includes(eff) ? desc : t('{0}. Not present', desc));
    return { rsid, chr, pos: p, loc: `${chr}:${fmt(p)}`, geno: g ? showGeno(g) : 'Not in file', gene: gene || '-', label, cat, cons, maf: MAF[rsid] || null, missing: !g };
  });
}

const THEME_BASE = { '--iconDisp': 'none', '--chartSpan': 'auto', '--font': "'IBM Plex Sans',system-ui,sans-serif", '--mono': "'IBM Plex Mono',ui-monospace,monospace", '--r': '2px', '--rc': '2px', '--rbar': '0px', '--h1': '30px', '--h1w': '600', '--h1t': '-0.015em', '--h1s': '100%', '--hero': 'clamp(28px,3.2vw,38px)', '--h2': '18px', '--hw': '600', '--tw': '600', '--sh': 'none', '--bw': '1px', '--barH': '30px', '--barS': '22px', '--barLbl': 'none' };
const THEMES = {
  lab: { name: 'Lab', desc: 'Clinical and precise', nav: 'side', ring: false, vars: { ...THEME_BASE, '--bg': '#f5f7f9', '--surface': '#ffffff', '--surface2': '#eef1f4', '--ink': '#15181c', '--muted': '#4f5761', '--line': '#e1e5ea', '--line2': '#eef0f3', '--card': '#e1e5ea', '--ctl': '#aeb6bf', '--accent': 'oklch(0.5 0.13 240)', '--onaccent': '#ffffff', '--soft': '#e8eff6', '--row': '1px solid #eef0f3', '--sideBg': '#ffffff', '--sideBgM': '#ffffff', '--sideLine': '#e1e5ea', '--l2f': '#9a3412', '--l2b': '#fdeee6', '--l1f': '#7a5200', '--l1b': '#fbf1d6', '--l0f': '#1d6a43', '--l0b': '#e5f3eb', '--lnf': '#3d444c', '--lnb': '#eceff2', '--navOnF': 'oklch(0.42 0.13 240)', '--navOnB': '#e8eff6' }, sw: ['#f5f7f9', 'oklch(0.5 0.13 240)', '#15181c', '#d5dae0'] },
  dark: { name: 'Lab dark', desc: 'Easier on the eyes at night', nav: 'side', ring: false, vars: { ...THEME_BASE, '--bg': '#0f1215', '--surface': '#161a1e', '--surface2': '#1f242a', '--ink': '#e6e9ec', '--muted': '#a3acb6', '--line': '#2b3138', '--line2': '#232930', '--card': '#2b3138', '--ctl': '#4f5862', '--accent': 'oklch(0.75 0.11 240)', '--onaccent': '#0f1215', '--soft': '#1b2733', '--row': '1px solid #232930', '--sideBg': '#13171a', '--sideBgM': '#13171a', '--sideLine': '#2b3138', '--l2f': '#ffb49a', '--l2b': '#3a1f17', '--l1f': '#f0d17a', '--l1b': '#332a12', '--l0f': '#9fdcb4', '--l0b': '#13281c', '--lnf': '#c3cad1', '--lnb': '#252b31', '--navOnF': 'oklch(0.82 0.1 240)', '--navOnB': '#1b2733' }, sw: ['#0f1215', 'oklch(0.75 0.11 240)', '#e6e9ec', '#2b3138'] },
  warm: { name: 'Warm', desc: 'Soft, friendly, personal', nav: 'side', ring: true, vars: { '--iconDisp': 'flex', '--chartSpan': 'auto', '--font': "'DM Sans',system-ui,sans-serif", '--mono': "'DM Mono',ui-monospace,monospace", '--r': '20px', '--rc': '999px', '--rbar': '3px', '--h1': '32px', '--h1w': '700', '--h1t': '-0.02em', '--h1s': '100%', '--hero': 'clamp(28px,3.4vw,40px)', '--h2': '20px', '--hw': '700', '--tw': '700', '--sh': '0 1px 2px rgba(70,50,30,.05), 0 10px 28px rgba(70,50,30,.06)', '--bw': '1px', '--barH': '16px', '--barS': '12px', '--barLbl': 'none',
    '--bg': '#f8f6f3', '--surface': '#ffffff', '--surface2': '#f3f0ec', '--ink': '#262421', '--muted': '#5c5750', '--line': '#e7e1d9', '--line2': '#efebe6', '--card': 'transparent', '--ctl': '#c9c1b7', '--accent': 'oklch(0.5 0.09 195)', '--onaccent': '#ffffff', '--soft': '#ebf5f3', '--row': '1px solid #efebe6', '--sideBg': 'transparent', '--sideBgM': '#f8f6f3', '--sideLine': 'transparent', '--l2f': '#9b3b1c', '--l2b': '#fbe5da', '--l1f': '#76570b', '--l1b': '#f7ebc9', '--l0f': '#22634d', '--l0b': '#e0f0e8', '--lnf': '#4a4641', '--lnb': '#efebe6', '--navOnF': '#ffffff', '--navOnB': 'oklch(0.5 0.09 195)' }, sw: ['#f8f6f3', 'oklch(0.5 0.09 195)', '#262421', '#e7e1d9'] },
  poster: { name: 'Poster', desc: 'Bold type, flat color', nav: 'top', ring: false, vars: { '--iconDisp': 'none', '--chartSpan': '1 / -1', '--font': "'Archivo',system-ui,sans-serif", '--mono': "'JetBrains Mono',ui-monospace,monospace", '--r': '0px', '--rc': '0px', '--rbar': '0px', '--h1': 'clamp(36px,5vw,60px)', '--h1w': '800', '--h1t': '-0.04em', '--h1s': '82%', '--hero': 'clamp(36px,5.4vw,68px)', '--h2': '24px', '--hw': '800', '--tw': '700', '--sh': 'none', '--bw': '2px', '--barH': '150px', '--barS': '26px', '--barLbl': 'flex',
    '--bg': '#f3f3f0', '--surface': '#ffffff', '--surface2': '#e6e6e1', '--ink': '#111111', '--muted': '#3d3d39', '--line': '#111111', '--line2': '#c4c4bf', '--card': '#111111', '--ctl': '#111111', '--accent': 'oklch(0.46 0.21 266)', '--onaccent': '#ffffff', '--soft': '#e3e6f7', '--row': '2px solid #111111', '--sideBg': '#f3f3f0', '--sideBgM': '#f3f3f0', '--sideLine': '#111111', '--l2f': '#ffffff', '--l2b': 'oklch(0.48 0.2 33)', '--l1f': '#111111', '--l1b': 'oklch(0.86 0.14 85)', '--l0f': '#111111', '--l0b': '#dcdcd6', '--lnf': '#111111', '--lnb': '#ebebe6', '--navOnF': '#ffffff', '--navOnB': '#111111' }, sw: ['#f3f3f0', 'oklch(0.46 0.21 266)', '#111111', '#111111'] }
};
const ORDER = ['lab', 'dark', 'warm', 'poster'];

/* ---------- Where each line is found today (matched by longest name prefix) ---------- */
const MT_INFO = [
  ['L0', 'One of the deepest maternal branches. Found mostly in southern and eastern Africa, including among the Khoisan.'],
  ['L1', 'An old African branch, most common in Central and West Africa.'],
  ['L2', 'The most common maternal line in West and Central Africa, and common among African Americans.'],
  ['L3', 'An African branch from which almost every lineage outside Africa descends. Common in East Africa.'],
  ['L4', 'Found mainly in East Africa.'], ['L5', 'A rare branch found in East Africa.'], ['L6', 'A rare branch found in Yemen and Ethiopia.'],
  ['M', 'One of the two branches that left Africa. Most common in South and East Asia.'],
  ['M1', 'Found in North and East Africa and the Middle East.'],
  ['C', 'Found in North and East Asia and among Indigenous Americans.'], ['D', 'Found across East Asia, Siberia and among Indigenous Americans.'],
  ['G', 'Found mainly in Northeast Asia.'], ['Z', 'Found in North Asia and among the Saami.'], ['E', 'Found in Island Southeast Asia.'], ['Q', 'Found in New Guinea and Melanesia.'],
  ['N', 'The second branch that left Africa, and the ancestor of most European and Middle Eastern lines.'],
  ['N1', 'Found at low levels across the Middle East, the Caucasus and Europe.'],
  ['A', 'Found in East Asia, Siberia and the Americas.'], ['Y', 'Found in East Asia, especially Japan and among the Nivkh.'],
  ['I', 'Found at low levels across Europe, the Middle East and Central Asia.'],
  ['W', 'Found at low levels from Europe to South Asia, most common in Pakistan and northern India.'],
  ['X', 'Rare and widespread: the Druze, the Near East, Europe, North Africa and some Indigenous North Americans.'],
  ['R', 'Descends from N and is the parent of most lineages in Europe, the Middle East and South Asia.'],
  ['R0', 'Found across the Middle East, Arabia and the Caucasus.'],
  ['R0a', 'Especially common in Arabia, Yemen and Socotra.'],
  ['HV', 'Found in the Near East, the Caucasus and Iran.'],
  ['H', 'The most common maternal line in Europe, about 40% of people there, and also common in the Near East and the Caucasus.'],
  ['V', 'Found in Western Europe, especially in Iberia and among the Saami.'],
  ['J', 'Arose in the Near East. Found across the Middle East, Europe and North Africa.'],
  ['J1b', 'Found in the Near East and Arabia, and at lower levels in Europe.'],
  ['J1c', 'The most common J branch in Europe.'],
  ['J2', 'Found mostly around the Mediterranean and in the Near East.'],
  ['T', 'Found across the Near East, Europe and Central Asia.'],
  ['T1', 'Found from the Near East and the Caucasus to Europe and Central Asia.'], ['T2', 'Common across Europe and the Near East.'],
  ['U', 'One of the oldest lineages outside Africa, with branches from Europe to South Asia.'],
  ['U1', 'Found in the Near East, the Caucasus and around the Black Sea.'], ['U2', 'Found mostly in South Asia; its U2e branch is European.'],
  ['U3', 'Found in the Near East, the Caucasus and Iran.'], ['U4', 'Found in Eastern Europe, Siberia and among the Kalash.'],
  ['U5', 'The oldest European branch, carried by Ice Age hunter-gatherers. Highest today in Finland and among the Saami.'],
  ['U6', 'Found mainly in North Africa, especially among Berbers.'], ['U7', 'Found from the Near East to Iran and South Asia.'],
  ['K', 'Found across Europe, the Near East and Central Asia, and common among Ashkenazi Jews.'],
  ['B', 'Found in East and Southeast Asia, Polynesia and the Americas.'], ['F', 'Found in East and Southeast Asia.'], ['P', 'Found in Oceania.']
];
const Y_INFO = [
  ['A', 'The deepest branches of the Y tree, found in Africa.'],
  ['B', 'An old African branch, found in Central and southern Africa.'],
  ['C', 'Found in East and Central Asia, Siberia, Oceania and among some Indigenous Americans.'],
  ['D', 'Found mainly in Tibet, Japan and the Andaman Islands.'],
  ['E', 'Found mostly in Africa, with branches in the Near East and southern Europe.'],
  ['E1b1a', 'The most common line in West and Central Africa and among Bantu speakers.'],
  ['E1b1b', 'Common in North and East Africa, the Near East and southern Europe.'],
  ['E1b1b1a1', 'Found in Egypt, Sudan, Ethiopia, Somalia and the Balkans.'],
  ['E1b1b1b1', 'The main paternal line of North African Berbers.'],
  ['E1b1b1b2', 'Found in the Levant, Arabia, Ethiopia and southern Europe.'],
  ['F', 'The ancestor of most lines outside Africa. F itself is rare.'],
  ['G', 'Most common in the Caucasus, and found across the Near East, Iran, Anatolia and southern Europe.'],
  ['G2a', 'The main G branch in Europe and the Caucasus, linked with the first farmers from Anatolia.'],
  ['H', 'Found mainly in South Asia.'],
  ['I', 'A European line carried by Ice Age hunter-gatherers.'],
  ['I1', 'Most common in Scandinavia and around the North Sea.'], ['I2', 'Common in the Balkans, Sardinia and Eastern Europe.'],
  ['J', 'The main paternal line of the Near East. It arose in western Asia.'],
  ['J1', 'Most common in Arabia, Yemen, the Levant and the Caucasus, and among many Jewish groups.'],
  ['J1a2b', 'The main branch in Arabia and among Arabic speakers. It spread widely with the Arab expansion.'],
  ['J2', 'Common in the Fertile Crescent, Anatolia, the Caucasus, Iran and around the Mediterranean.'],
  ['J2a', 'The larger J2 branch, centered on Anatolia, the Caucasus and Iran.'], ['J2b', 'Found in the Balkans, Anatolia and South Asia.'],
  ['K', 'The ancestor of many lines across Asia, Oceania and Europe.'],
  ['L', 'Found mainly in Pakistan and South Asia, with branches in the Near East and the Caucasus.'],
  ['M', 'Found mainly in New Guinea and Melanesia.'], ['N', 'Found across northern Eurasia, from Finland to Siberia.'],
  ['O', 'The most common line in East and Southeast Asia.'], ['P', 'The ancestor of lines Q and R.'],
  ['Q', 'Found in Siberia and Central Asia, and the main line among Indigenous Americans.'],
  ['R', 'Found across Europe and South and Central Asia.'],
  ['R1a', 'Common in Eastern Europe, Central Asia and South Asia.'],
  ['R1a1a1b2', 'The Asian branch of R1a, common in South and Central Asia and Iran.'],
  ['R1b', 'The most common line in Western Europe. Older branches are found in the Near East, the Caucasus and Central Africa.'],
  ['R1b1a2', 'The most common line in Western Europe, also found in Anatolia, the Caucasus and Iran.'],
  ['R1b1a2a2', 'The eastern branch of M269, found in the Caucasus, Anatolia, Iran and Eastern Europe.'],
  ['R1b1a2a1a1', 'Common around the North Sea: England, the Netherlands and Germany.'],
  ['R1b1a2a1a2', 'The largest western branch, common from Iberia to Germany.'],
  ['R1b1a2a1a2b', 'Concentrated in northern Italy, Switzerland and eastern France.'],
  ['R1b1a2a1a2c', 'The main line in Ireland, Scotland and Wales.'],
  ['R2', 'Found in South Asia.'], ['S', 'Found in New Guinea and Indonesia.'],
  ['T', 'Found at low levels across the Near East, East Africa, the Mediterranean and Europe.']
];
const lineInfo = (table, hg) => { let best = null; for (const [k, v] of table) if (hg.startsWith(k) && (!best || k.length > best[0].length)) best = [k, v]; return best ? best[1] : ''; };
