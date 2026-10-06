const fs = require('fs'); const here = __dirname + '/../src/';
let src = fs.readFileSync(here + 'ref.js', 'utf8');
const R = new Function(src + fs.readFileSync(here + 'anc.js', 'utf8') + ';return {REF_PANEL,locusAnc};')();
const P = R.REF_PANEL, E = R.locusAnc(), U = E.unpack(P);
const H = JSON.parse(fs.readFileSync(__dirname + '/heldout.json'));
const ppl = Object.entries(H.people);
const pick = pop => ppl.filter(([s, x]) => x.pop === pop).map(([s, x]) => x.g);
const mixg = (a, b) => a.map((d, i) => (d < 0 || b[i] < 0) ? -1 : ((d === 2 ? 1 : d === 0 ? 0 : (i * 7919 % 2)) + (b[i] === 2 ? 1 : b[i] === 0 ? 0 : (i * 104729 % 3 === 0 ? 1 : 0))));
const cases = [['TSI', 'Palestinian'], ['CEU', 'Bedouin'], ['YRI', 'CEU'], ['CHB', 'Pathan'], ['Palestinian', 'Palestinian'], ['Bedouin', 'Mozabite']];
const regOf = {}; P.groups.forEach(g => g.src.forEach(s => regOf[s] = g.region));
const src0 = E.paint.toString();
for (const [W, pw] of [[120, 0.3], [150, 0.3], [150, 0.15], [200, 0.2]]) {
  const f = new Function('P', 'g', 'regionPct', 'unpack', src0.replace(/^function paint\(P, g, regionPct\) \{/, '').replace(/\}$/, '').replace(/30/g, String(W)).replace(/w \+ 30/g, 'w + ' + W).replace('Math.log(Math.max(p, 0.5) / 100)', `${pw} * Math.log(Math.max(p, 0.5) / 100)`).replace('w + ' + W + ' >= idx.length - 9', 'w + ' + W + ' >= idx.length - 9'));
  let line = `W${W} p${pw}: `;
  for (const [a, b] of cases) {
    const g = Int8Array.from(mixg(pick(a)[0], pick(b)[1] || pick(b)[0]));
    const an = E.ancestry(P, g);
    const pt = f(P, g, an.regions.map(r => r.pct), E.unpack);
    const tot = {}; let all = 0; pt.forEach(c => c.forEach(cp => cp.forEach(x => { tot[x.pop] = (tot[x.pop] || 0) + (x.e - x.s); all += x.e - x.s; })));
    const want = [regOf[a], regOf[b]];
    line += `${a}+${b}=${Object.entries(tot).filter(([k, v]) => v / all > 0.03).map(([k, v]) => k + Math.round(v / all * 100)).join('/')} (${want.join('+')})  `;
  }
  console.log(line);
}
