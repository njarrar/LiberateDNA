/* LiberateDNA heritage engine. Pure functions, so the same source runs in the
   parser's Web Worker and in this page. Reference data (REF_*) is built by
   tools/refbuild.py from HGDP + 1000 Genomes (gnomAD v3.1.2), PhyloTree 17
   and the ISOGG 2016 Y tree. */
function locusAnc() {
  const b64 = s => { const t = atob(s), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; };
  const unpack = P => {
    if (P._u) return P._u;
    const n = P.n, K = P.groups.length;
    const F = new Float32Array(n * K), q = b64(P.F);
    for (let i = 0; i < n * K; i++) F[i] = (q[i] + 0.5) / 256;
    const chr = b64(P.chr), dp = P.dpos.split(',').map(Number), pos = new Float64Array(n);
    let last = 0, lastC = -1;
    for (let i = 0; i < n; i++) { if (chr[i] !== lastC) { last = 0; lastC = chr[i]; } last += dp[i]; pos[i] = last; }
    // rsid numbers are stored in panel order as base-36 values
    const ids = P.rs.split(',').map(x => 'rs' + parseInt(x, 36));
    P._u = { n, K, F, chr, pos, ids, ref: P.ref, alt: P.alt };
    return P._u;
  };

  /* Alt-allele dosage for each panel marker, or -1 when missing or unreadable. */
  function dosages(P, lookup) {
    const U = unpack(P), g = new Int8Array(U.n);
    for (let i = 0; i < U.n; i++) {
      const c = lookup(U.ids[i], U.chr[i], U.pos[i]);
      g[i] = -1;
      if (!c || c.length !== 2) continue;
      const r = U.ref[i], a = U.alt[i];
      let d = 0, ok = true;
      for (const ch of c) { if (ch === a) d++; else if (ch !== r) { ok = false; break; } }
      if (ok) g[i] = d;
    }
    return g;
  }

  /* Supervised mixture: the share of each reference group that best explains
     the genotypes (EM, as in frappe / ADMIXTURE projection). */
  function mix(U, g, idx, iters, q0) {
    const K = U.K, F = U.F;
    let q = q0 ? Float64Array.from(q0) : new Float64Array(K).fill(1 / K);
    const acc = new Float64Array(K);
    for (let it = 0; it < iters; it++) {
      acc.fill(0); let tot = 0;
      for (const j of idx) {
        const d = g[j], o = j * K;
        let p = 0; for (let k = 0; k < K; k++) p += q[k] * F[o + k];
        p = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
        const a = d / p, b = (2 - d) / (1 - p);
        for (let k = 0; k < K; k++) acc[k] += q[k] * (F[o + k] * a + (1 - F[o + k]) * b);
        tot += 2;
      }
      for (let k = 0; k < K; k++) q[k] = acc[k] / tot;
    }
    return q;
  }

  function ancestry(P, g) {
    const U = unpack(P), K = U.K;
    const idx = []; for (let i = 0; i < U.n; i++) if (g[i] >= 0) idx.push(i);
    if (idx.length < 500) return { used: idx.length, tooFew: true };
    // Fit, drop groups under 2% (they mostly absorb noise), then refit.
    let q = mix(U, g, idx, 200);
    q = q.map(x => x < 0.02 ? 0 : x); const z = q.reduce((a, b) => a + b, 0); q = q.map(x => x / z);
    q = mix(U, g, idx, 80, q);
    // Bootstrap over blocks of neighboring markers for a range.
    const blocks = []; for (let i = 0; i < idx.length; i += 50) blocks.push(idx.slice(i, i + 50));
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const reps = [];
    for (let r = 0; r < 10; r++) {
      const s = []; for (let b = 0; b < blocks.length; b++) s.push(...blocks[Math.floor(rnd() * blocks.length)]);
      reps.push(mix(U, g, s, 40, q));
    }
    const groups = P.groups.map((G, k) => {
      const v = reps.map(x => x[k]).sort((a, b) => a - b);
      return { id: G.id, pct: q[k] * 100, lo: v[1] * 100, hi: v[v.length - 2] * 100 };
    });
    // Closest single group: average log-likelihood per marker.
    const ll = P.groups.map((G, k) => {
      let s = 0; for (const j of idx) { const f = U.F[j * K + k], d = g[j]; s += Math.log(d === 2 ? f * f : d === 1 ? 2 * f * (1 - f) : (1 - f) * (1 - f)); }
      return { id: G.id, ll: s / idx.length };
    }).sort((a, b) => b.ll - a.ll);
    const regions = P.regions.map(R => {
      const ks = P.groups.map((G, k) => G.region === R.id ? k : -1).filter(k => k >= 0);
      const sum = arr => ks.reduce((t, k) => t + arr[k], 0);
      const v = reps.map(sum).sort((a, b) => a - b);
      return { id: R.id, pct: sum(q) * 100, lo: v[1] * 100, hi: v[v.length - 2] * 100 };
    });
    return { used: idx.length, groups, regions, closest: ll.slice(0, 5) };
  }

  /* Rough chromosome painting: windows of markers, best pair of regions per
     window (one per chromosome copy), weighted by the overall result. */
  function paint(P, g, regionPct) {
    const U = unpack(P), K = U.K, R = P.regions.length;
    const rk = P.regions.map(r => P.groups.map((G, k) => G.region === r.id ? k : -1).filter(k => k >= 0));
    const wts = rk.map(ks => ks.map(k => P.groups[k].n));
    // A light pull toward the overall result; wide windows keep short noisy runs out.
    const W = 120, prior = regionPct.map(p => 0.3 * Math.log(Math.max(p, 0.5) / 100));
    const out = [];
    for (let c = 1; c <= 22; c++) {
      const idx = []; for (let i = 0; i < U.n; i++) if (U.chr[i] === c && g[i] >= 0) idx.push(i);
      const segs = [[], []];
      let prev = null;
      for (let w = 0; w < idx.length; w += W) {
        const win = idx.slice(w, w + W); if (win.length < 30) break;
        const rf = win.map(j => rk.map((ks, r) => { let s = 0, t = 0; ks.forEach((k, m) => { s += U.F[j * K + k] * wts[r][m]; t += wts[r][m]; }); return s / t; }));
        let best = -Infinity, bp = [0, 0];
        for (let a = 0; a < R; a++) for (let b = a; b < R; b++) {
          let s = prior[a] + prior[b];
          win.forEach((j, m) => { const fa = rf[m][a], fb = rf[m][b], d = g[j]; s += Math.log(d === 2 ? fa * fb : d === 1 ? fa * (1 - fb) + fb * (1 - fa) : (1 - fa) * (1 - fb)); });
          if (s > best) { best = s; bp = [a, b]; }
        }
        if (prev && (bp[0] === prev[1] || bp[1] === prev[0])) bp = [bp[1], bp[0]];
        prev = bp;
        const start = w === 0 ? 0 : (U.pos[win[0]] + U.pos[idx[w - 1]]) / 2;
        const end = w + W >= idx.length - 29 ? U.pos[idx[idx.length - 1]] : (U.pos[win[win.length - 1]] + U.pos[idx[w + W]]) / 2;
        [0, 1].forEach(cp => { const id = P.regions[bp[cp]].id, s = segs[cp]; if (s.length && s[s.length - 1].pop === id) s[s.length - 1].e = end; else s.push({ pop: id, s: start, e: end }); });
      }
      out.push(segs);
    }
    return out;
  }

  /* Maternal line: PhyloTree 17 placement scored as in HaploGrep
     (Kulczynski measure over the positions the chip tested). */
  function mtPlace(T, calls) {
    const ref = T.ref, nodes = T.nodes, tested = new Set();
    const user = {};
    for (const [p, a] of calls) if (/^[ACGT]$/.test(a)) { user[p] = a; tested.add(p); }
    if (tested.size < 50) return null;
    const treePos = new Set(); nodes.forEach(n => n[2].forEach(x => treePos.add(x[0])));
    let Sw = 0; const w = {};
    nodes.forEach(n => n[2].forEach(x => { w[x[0] + x[1]] = x[2]; }));
    for (const p of tested) if (treePos.has(p) && user[p] !== ref[p - 1]) Sw += w[p + user[p]] || 1;
    const prof = new Array(nodes.length);
    let best = null;
    nodes.forEach((n, i) => {
      const m = n[1] >= 0 ? new Map(prof[n[1]]) : new Map();
      n[2].forEach(([p, a, wt]) => { if (a === ref[p - 1]) m.delete(p); else m.set(p, [a, wt]); });
      prof[i] = m;
      let Ew = 0, fw = 0;
      for (const [p, [a, wt]] of m) if (tested.has(p)) { Ew += wt; if (user[p] === a) fw += wt; }
      const score = 0.5 * ((Ew ? fw / Ew : 1) + (Sw ? fw / Sw : 1));
      if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && Ew > best.Ew)) best = { i, score, Ew, fw };
    });
    // The tree is drawn from the rCRS sequence outward. Re-root it at the African base
    // so the path reads from the oldest branch to yours.
    const up = i => { const p = []; for (; i >= 0; i = nodes[i][1]) p.unshift(nodes[i][0]); return p; };
    const p = up(best.i), spine = up(nodes.findIndex(n => n[0] === "L1'2'3'4'5'6"));
    let k = 0; while (k < p.length && k < spine.length && p[k] === spine[k]) k++;
    const path = spine.slice(k - 1).reverse().concat(p.slice(k));
    return { hg: nodes[best.i][0], path, score: best.score, tested: tested.size };
  }

  /* Paternal line: ISOGG 2016 tree, deepest branch whose path is best supported. */
  function yPlace(T, calls) {
    const call = new Map();
    for (const [p, a] of calls) if (/^[ACGT]$/.test(a)) call.set(p, a);
    if (call.size < 50) return null;
    const N = T.names.length, der = new Int32Array(N), anc = new Int32Array(N), snp = new Array(N);
    const pos = T.pos.split(',').map(Number); let p0 = 0;
    for (let i = 0; i < T.node.length; i++) {
      p0 += pos[i]; const c = call.get(p0); if (!c) continue;
      const k = T.node[i], a = T.alle[2 * i], d = T.alle[2 * i + 1];
      if (c === d) { der[k]++; (snp[k] = snp[k] || []).push(T.snp[i]); } else if (c === a) anc[k]++;
    }
    let best = null;
    for (let k = 0; k < N; k++) {
      if (der[k] < 1 || der[k] < anc[k]) continue;
      let s = 0, depth = 0, bad = 0;
      for (let x = k; x >= 0; x = T.par[x]) { s += der[x] - anc[x]; depth++; if (anc[x] > der[x] && anc[x] >= 2) bad++; }
      if (bad) continue;
      if (!best || s > best.s || (s === best.s && depth > best.depth)) best = { k, s, depth };
    }
    if (!best) return null;
    const path = []; for (let x = best.k; x >= 0; x = T.par[x]) path.unshift(T.names[x]);
    const pref = ['M', 'P', 'L', 'U', 'Z', 'V', 'CTS', 'PF', 'FGC', 'Y', 'S', 'BY', 'F'];
    const nameOf = k => { const l = (snp[k] || []).slice().sort((a, b) => { const r = s => { const i = pref.findIndex(x => new RegExp('^' + x + '\\d').test(s)); return i < 0 ? 99 : i; }; return r(a) - r(b) || a.length - b.length; }); return l[0] || ''; };
    const lead = T.names[best.k].replace(/^([A-Z]+).*/, '$1');
    return { hg: T.names[best.k], snp: nameOf(best.k), short: `${lead}-${nameOf(best.k)}`, path, derived: path.reduce((t, n) => t + der[T.names.indexOf(n)], 0), tested: call.size };
  }

  return { dosages, ancestry, paint, mtPlace, yPlace, unpack, unpackPanel: unpack };
}
