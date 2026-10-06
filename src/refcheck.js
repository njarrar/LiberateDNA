// Finishes src/ref.js: tests the engine on held-out people, works out the
// built-in sample's results, and writes both in so the page shows them at once.
const fs = require('fs');
const here = __dirname, refPath = here + '/ref.js';
let src = fs.readFileSync(refPath, 'utf8').replace(/\nconst REF_SAMPLE_RESULT = .*;\n/, '\n').replace(/\nconst REF_CHECK = .*;\n/, '\n');
const R = new Function(src + fs.readFileSync(here + '/anc.js', 'utf8') + ';return {REF_PANEL,REF_MT,REF_Y,REF_SAMPLE,locusAnc};')();
const E = R.locusAnc(), P = R.REF_PANEL;
const H = JSON.parse(fs.readFileSync(here + '/../anc/heldout.json'));
const grpOf = {}; P.groups.forEach(g => g.src.forEach(s => grpOf[s] = g));
const name = id => P.groups.find(g => g.id === id).name;
let n = 0, top = 0, reg = 0; const miss = {};
for (const x of Object.values(H.people)) {
  const truth = grpOf[x.pop]; if (!truth) continue;
  const a = E.ancestry(P, Int8Array.from(x.g)); if (a.tooFew) continue;
  const best = a.groups.slice().sort((p, q) => q.pct - p.pct)[0], bestR = a.regions.slice().sort((p, q) => q.pct - p.pct)[0];
  n++; if (best.id === truth.id) top++; else { const k = [truth.id, best.id].sort().join('|'); miss[k] = (miss[k] || 0) + 1; }
  if (bestR.id === truth.region) reg++;
}
const weak = Object.entries(miss).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k.split('|').map(name).join(' vs ')).join('; ');
const CHECK = { people: n, topPct: Math.round(top / n * 100), regPct: Math.round(reg / n * 100), weak };
const S = R.REF_SAMPLE, u = Buffer.from(S.g, 'base64'), g = new Int8Array(P.n);
for (let i = 0; i < P.n; i++) { const d = (u[i >> 2] >> ((i & 3) * 2)) & 3; g[i] = d === 3 ? -1 : d; }
const anc = E.ancestry(P, g);
const round = o => JSON.parse(JSON.stringify(o, (k, v) => typeof v === 'number' ? Math.round(v * 100) / 100 : v));
const SAMPLE = round({ anc, paint: E.paint(P, g, anc.regions.map(r => r.pct)), mt: E.mtPlace(R.REF_MT, S.mt), y: E.yPlace(R.REF_Y, S.y) });
src = src.replace(/\nconst REF_SAMPLE = .*;\n/, '\n');
fs.writeFileSync(refPath, src + 'const REF_SAMPLE_RESULT = ' + JSON.stringify(SAMPLE) + ';\nconst REF_CHECK = ' + JSON.stringify(CHECK) + ';\n');
console.log(CHECK, 'sample top', anc.closest.slice(0, 3).map(c => c.id), SAMPLE.mt.hg, SAMPLE.y.short);
