// Runs the heritage engine on people held out of the reference counts.
const fs = require('fs');
global.atob = s => Buffer.from(s, 'base64').toString('binary');
const dir = __dirname + '/../src/';
eval(fs.readFileSync(dir + 'ref.js', 'utf8') + fs.readFileSync(dir + 'anc.js', 'utf8') + ';global.R={REF_PANEL,REF_MT,REF_Y,REF_SAMPLE,locusAnc}');
const E = R.locusAnc(), P = R.REF_PANEL;
const H = JSON.parse(fs.readFileSync(__dirname + '/heldout.json'));
const grpOf = {}; P.groups.forEach(g => g.src.forEach(s => grpOf[s] = g));
let top = 0, topReg = 0, n = 0; const rows = [];
const t0 = Date.now();
for (const [s, x] of Object.entries(H.people)) {
  const g = Int8Array.from(x.g);
  const a = E.ancestry(P, g); if (a.tooFew) continue;
  const truth = grpOf[x.pop]; if (!truth) continue;
  const best = a.groups.slice().sort((p, q) => q.pct - p.pct)[0];
  const bestR = a.regions.slice().sort((p, q) => q.pct - p.pct)[0];
  const own = a.groups.find(q => q.id === truth.id).pct, ownR = a.regions.find(q => q.id === truth.region).pct;
  n++; if (best.id === truth.id) top++; if (bestR.id === truth.region) topReg++;
  rows.push([x.pop, truth.id, best.id, Math.round(best.pct), Math.round(own), Math.round(ownR), a.closest[0].id]);
}
console.log('people', n, 'top group right', top, 'top region right', topReg, 'ms each', Math.round((Date.now() - t0) / n));
const by = {}; rows.forEach(r => { (by[r[0]] = by[r[0]] || []).push(r); });
for (const [p, rs] of Object.entries(by)) console.log(p.padEnd(12), rs.map(r => `${r[2]}:${r[3]} own${r[4]} reg${r[5]} cl:${r[6]}`).join(' | '));
// sample
const S = R.REF_SAMPLE, u = Uint8Array.from(Buffer.from(S.g, 'base64'));
const sg = new Int8Array(P.n); for (let i = 0; i < P.n; i++) { const d = (u[i >> 2] >> ((i & 3) * 2)) & 3; sg[i] = d === 3 ? -1 : d; }
const sa = E.ancestry(P, sg);
console.log('sample', sa.groups.filter(x => x.pct > 2).map(x => `${x.id} ${x.pct.toFixed(1)} (${x.lo.toFixed(0)}-${x.hi.toFixed(0)})`).join(', '), '| regions', sa.regions.filter(x => x.pct > 1).map(x => `${x.id} ${x.pct.toFixed(0)}`).join(' '));
console.log('mt', JSON.stringify(E.mtPlace(R.REF_MT, S.mt)).slice(0, 200));
console.log('y', JSON.stringify(E.yPlace(R.REF_Y, S.y)).slice(0, 300));
const pt = E.paint(P, sg, sa.regions.map(r => r.pct)); console.log('paint chr1', JSON.stringify(pt[0]).slice(0, 300));
