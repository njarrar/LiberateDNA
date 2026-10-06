/* LiberateDNA app shell and report views. */
const { render, Component } = htmPreact;
const APP_VERSION = '3.1.0';
const notr = html.keep;
/* Page language, direction and, for scripts the theme fonts lack, a matching web font. */
function applyLang() {
  const d = document.documentElement; d.lang = I18N.code; d.dir = I18N.dir;
  const fam = I18N.fontName;
  if (fam && !document.querySelector(`link[data-font="${fam}"]`)) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.font = fam;
    l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(fam).replace(/%20/g, '+') + ':wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
  }
}

const P = (() => { const o = {}; try { new URLSearchParams(location.search).forEach((v, k) => o[k] = v); } catch (e) {} return o; })();
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

const S = {
  card: 'background:var(--surface);border:var(--bw) solid var(--card);border-radius:var(--r);box-shadow:var(--sh)',
  btnP: 'min-height:44px;padding:0 18px;border:0;border-radius:var(--rc);background:var(--accent);color:var(--onaccent);font:inherit;font-size:14px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px',
  btnS: 'min-height:44px;padding:0 16px;border:var(--bw) solid var(--ctl);border-radius:var(--rc);background:var(--surface);color:var(--ink);font:inherit;font-size:14px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px',
  term: 'padding:0;border:0;background:transparent;font:inherit;color:var(--ink);text-decoration:underline dotted;text-underline-offset:3px;cursor:help',
  tip: 'padding:12px 14px;border-radius:var(--r);background:var(--soft);font-size:14px;line-height:1.55;max-width:70ch',
  h1: 'margin:0;font-size:var(--h1);font-weight:var(--h1w);letter-spacing:var(--h1t);font-stretch:var(--h1s);line-height:1.05',
  h2: 'margin:0;font-size:var(--h2);font-weight:var(--hw);letter-spacing:-0.01em',
  lead: 'margin:0;font-size:15px;line-height:1.6;color:var(--muted);max-width:66ch;text-wrap:pretty',
  tag: 'font-size:12px;font-weight:600;padding:4px 9px;border-radius:var(--rc);white-space:nowrap',
  note: 'display:flex;gap:12px;padding:14px 16px;border-radius:var(--r);background:var(--soft);font-size:14px;line-height:1.6',
  mono12: 'font-family:var(--mono);font-size:12px;color:var(--muted)'
};
const lv = l => { const k = l < 0 || l == null ? 'n' : l; return { fg: `var(--l${k}f)`, bg: `var(--l${k}b)` }; };
const Pips = n => html`<span aria-hidden="true" style="display:flex;gap:3px">${[0, 1].map(i => html`<span style="width:10px;height:10px;border-radius:var(--rc);background:${n != null && i < n ? 'var(--accent)' : 'transparent'};border:1.5px solid ${n != null && i < n ? 'var(--accent)' : 'var(--ctl)'}"></span>`)}</span>`;
const Copies = (n, eff) => html`<span style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink)">${Pips(n)}${n == null ? 'Not called in your file' : copiesLabel(n, eff)}</span>`;
const Rare = text => html`<span style="align-self:flex-start;display:flex;gap:6px;font-size:13px;line-height:1.5;font-weight:600;padding:6px 10px;border-radius:var(--r);color:var(--l2f);background:var(--l2b)"><i class="ph ph-seal-warning" style="flex:none;margin-top:2px"></i><span>${text}</span></span>`;
const ErrIcon = (icon, k) => html`<span style="flex:none;display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:var(--rc);color:var(--l${k}f);background:var(--l${k}b)"><i class=${'ph ' + icon} style="font-size:22px"></i></span>`;
const today = () => new Date().toLocaleDateString(I18N.locale, { month: 'short', day: 'numeric', year: 'numeric' });
const DB_LINKS = {
  ClinVar: id => `https://www.ncbi.nlm.nih.gov/snp/${id}`,
  SNPedia: id => `https://www.snpedia.com/index.php/${id[0].toUpperCase() + id.slice(1)}`,
  Ensembl: id => `https://grch37.ensembl.org/Homo_sapiens/Variation/Explore?v=${id}`,
  gnomAD: id => `https://gnomad.broadinstitute.org/variant/${id}?dataset=gnomad_r4`,
  PharmGKB: id => `https://www.pharmgkb.org/search?query=${id}`
};

/* Runs the parser in a Web Worker, or in this page if workers are blocked. */
function makeEngine(onMsg) {
  try {
    const url = URL.createObjectURL(new Blob([`${locusAnc.toString()}\n(${locusWorker.toString()})(self, postMessage.bind(self));`], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = e => onMsg(e.data);
    w.postMessage({ type: 'ref', ref: { P: REF_PANEL, MT: REF_MT, Y: REF_Y } });
    return { send: m => w.postMessage(m), kind: 'worker' };
  } catch (e) {
    const fake = {};
    locusWorker(fake, m => setTimeout(() => onMsg(m), 0));
    fake.onmessage({ data: { type: 'ref', ref: { P: REF_PANEL, MT: REF_MT, Y: REF_Y } } });
    return { send: m => setTimeout(() => fake.onmessage({ data: m }), 0), kind: 'inline' };
  }
}

async function fetchJSON(url, ms) {
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => ac && ac.abort(), ms || 6000);
  try { const r = await fetch(url, ac ? { signal: ac.signal } : {}); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

class LiberateDNA extends Component {
  constructor() {
    super();
    let theme = P.theme && THEMES[P.theme] ? P.theme : ls.get('locus-theme');
    if (!THEMES[theme]) theme = 'lab';
    let saved = null; try { saved = JSON.parse(ls.get('locus-saved') || 'null'); } catch (e) {}
    try { const x = ls.get('locus-lang-file'); if (x) I18N.add(x); } catch (e) { ls.del('locus-lang-file'); }
    const have = I18N.list().map(l => l.code), nav = ((navigator.languages || [navigator.language || 'en'])[0] || 'en').slice(0, 2).toLowerCase();
    let lang = [P.lang, ls.get('locus-lang'), nav].find(c => c && have.includes(c)) || 'en';
    lang = I18N.load(lang); applyLang();
    this.state = Object.assign({ theme, lang, langErr: '', saved, phase: 'upload', tab: P.tab || 'overview', sub: P.sub || 'risks', step: 0,
      err: null, errFile: '', vendor: '', errText: '', pw: '', pwErr: false, pwWrong: false, slow: false, q: '', live: false, sel: 'rs4988235', xsel: null, ask: null, lk: {}, lkData: {},
      open: null, rev: {}, fine: true, look: false, report: false, term: null, scan: 'idle', scanStep: 0, segSel: null, w: window.innerWidth, drag: false,
      real: null, rows: 0, est: 0, xrows: [], xtotal: 0, hasStore: false, attachErr: '' }, this.sample(P.sample || 'phased'));
    if (P.start === 'dashboard') this.state.phase = 'ready';
    else if (P.demo === 'password') Object.assign(this.state, { err: 'password', errFile: 'genome_Full_protected.zip' });
    else if (P.demo === 'vendor') Object.assign(this.state, { err: 'vendor', vendor: 'AncestryDNA', errFile: 'AncestryDNA_raw_data.zip' });
    else if (P.demo === 'corrupt') Object.assign(this.state, { err: 'corrupt', errFile: 'genome_Full_20240312.zip' });
    this.inputId = 'locus-file';
    this.dialogRef = null; this.reportRef = null;
  }
  componentDidMount() {
    this._rz = () => this.setState({ w: window.innerWidth });
    window.addEventListener('resize', this._rz);
    this._key = e => { if (e.key === 'Escape') { if (this.state.look) this.closeLook(); else if (this.state.report) this.closeReport(); } };
    window.addEventListener('keydown', this._key);
    this._net = () => this.forceUpdate();
    window.addEventListener('online', this._net); window.addEventListener('offline', this._net);
  }
  componentDidUpdate(pp, ps) {
    if (this.state.look && !ps.look) { const el = document.querySelector('[data-look-dialog] button[aria-pressed="true"]'); if (el) el.focus(); }
    if (this.state.report && !ps.report) { const el = document.querySelector('[data-print-root] button'); if (el) el.focus(); }
  }
  engine() {
    if (!this._eng) this._eng = makeEngine(m => this.onEngine(m));
    return this._eng;
  }
  sample(v) {
    const chip = P.demo === 'oldchip' ? 'v4' : 'v5';
    if (v === 'full') return { variant: v, file: 'genome_Full_20240312.zip', ftype: 'full', sex: 'XY', chip, real: null, file2: null };
    if (v === 'xx') return { variant: v, file: 'phased_genotype_20240312.zip', ftype: 'phased', sex: 'XX', chip, real: null, file2: null };
    return { variant: 'phased', file: 'phased_genotype_20240312.zip', ftype: 'phased', sex: 'XY', chip, real: null, file2: null };
  }

  /* ---------- Reading files ---------- */
  startSample(variant, fileName) {
    clearInterval(this._t); clearTimeout(this._slowT);
    const sm = this.sample(variant);
    if (fileName) sm.file = fileName;
    const slow = P.demo === 'slow';
    this.setState(Object.assign({ phase: 'parsing', step: 0, err: null, drag: false, slow, tab: P.tab || 'overview', report: false, look: false, segSel: null, rows: 0, est: 0, xrows: [], hasStore: false, scan: 'idle', lk: {}, lkData: {} }, sm));
    this._t = setInterval(() => {
      const k = this.state.step + 1;
      if (k >= 6) { clearInterval(this._t); this.setState({ phase: 'ready', step: 6 }); this.save(); }
      else this.setState({ step: k });
    }, slow ? 1500 : 600);
  }
  pickFile(f) {
    if (!f) return;
    const n = (f.name || '').toLowerCase();
    this.setState({ drag: false });
    if (P.demo === 'password' || /protect|locked|password/.test(n)) { this._pending = { file: f, fake: true }; this.setState({ phase: 'upload', err: 'password', errFile: f.name, pw: '', pwErr: false, pwWrong: false }); return; }
    if (P.demo === 'vendor' || /ancestry|myheritage|ftdna|familytreedna/.test(n)) { this.setState({ phase: 'upload', err: 'vendor', vendor: n.includes('myheritage') ? 'MyHeritage' : /ftdna|familytree/.test(n) ? 'FamilyTreeDNA' : 'AncestryDNA', errFile: f.name }); return; }
    if (P.demo === 'corrupt' || f.size === 0 || !/\.(zip|txt|csv|tsv)$/.test(n)) { this.setState({ phase: 'upload', err: 'corrupt', errFile: f.name, errText: '' }); return; }
    this.readReal(f, '');
  }
  async readReal(f, pw) {
    clearInterval(this._t); clearTimeout(this._slowT);
    let buf;
    try { buf = await f.arrayBuffer(); } catch (e) { this.setState({ phase: 'upload', err: 'corrupt', errFile: f.name, errText: '' }); return; }
    this._pending = { file: f };
    this._job = (this._job || 0) + 1;
    this._jobStart = Date.now();
    this.setState({ phase: 'parsing', step: 0, err: null, slow: P.demo === 'slow', file: f.name, file2: null, rows: 0, est: 0, report: false, look: false, segSel: null, xrows: [], scan: 'idle', lk: {}, lkData: {} });
    this._slowT = setTimeout(() => { if (this.state.phase === 'parsing') this.setState({ slow: true }); }, 8000);
    this.engine().send({ type: 'parse', id: this._job, buf, name: f.name, pw, curated: CURATED_IDS, coords: CURATED_POS, heritage: true });
  }
  attachReal(f) {
    this._attachJob = 'a' + Date.now();
    this.setState({ attachErr: '', attaching: true });
    f.arrayBuffer().then(buf => this.engine().send({ type: 'parse', id: this._attachJob, buf, name: f.name, pw: '', curated: [], keep: false, fname: f.name }));
    this._attachName = f.name;
  }
  onEngine(m) {
    if (m.type === 'search') { if (m.q === this.state.q.trim().toLowerCase()) this.setState({ xrows: m.rows, xtotal: m.total }); return; }
    if (m.id && m.id === this._attachJob) {
      if (m.type === 'done') { this.setState({ attaching: false }); this.attachPhased(this._attachName); }
      else if (m.type === 'error') this.setState({ attaching: false, attachErr: m.code === 'vendor' ? t('That looks like an {0} file. Add the phased file from 23andMe.', m.vendor) : "We couldn't read that file. Try the phased genotype zip from 23andMe." });
      return;
    }
    if (m.type === 'step') { if (this.state.phase === 'parsing') this.setState({ step: m.step, rows: m.rows != null ? m.rows : this.state.rows, est: m.est || this.state.est }); return; }
    if (m.type === 'progress') { if (this.state.phase === 'parsing') this.setState({ step: 1, rows: m.rows, est: m.est }); return; }
    if (m.id !== this._job) return;
    clearTimeout(this._slowT);
    if (m.type === 'error') {
      const f = this._pending && this._pending.file;
      const st = { phase: 'upload', errFile: f ? f.name : this.state.file, err: m.code, vendor: m.vendor, errText: '', pwErr: false, pwWrong: !!m.wrong };
      if (m.code === 'password' && m.aes) Object.assign(st, { err: 'corrupt', errText: "This zip uses AES encryption, which browsers can't open. Unzip it on your computer, then add the .txt file inside." });
      if (m.code === 'corrupt' && m.why === 'no-inflate') st.errText = "This browser can't unzip files. Unzip it on your computer, then add the .txt file inside.";
      if (m.code === 'corrupt' && m.why === 'no-txt') st.errText = "This zip doesn't contain a 23andMe .txt file. Download raw data again from 23andMe: Settings, then 23andMe Data, then Download raw data.";
      this.setState(st);
      return;
    }
    if (m.type === 'done') {
      const r = m.result;
      const called = r.counts.reduce((a, c) => a + c[2], 0);
      const real = { rows: r.rows, called, counts: r.counts, genos: r.genos, pos: r.pos, heritage: r.heritage };
      this.setState({ real, ftype: r.ftype, sex: r.sex, chip: r.chip, rows: r.rows, est: r.rows, step: 2, hasStore: true, variant: r.ftype === 'phased' ? 'phased' : 'full' });
      const tick = () => { const k = this.state.step + 1; if (k >= 6) { this.setState({ phase: 'ready', step: 6, slow: false }); this.save(); } else { this.setState({ step: k }); this._t = setTimeout(tick, P.demo === 'slow' ? 1200 : 380); } };
      this._t = setTimeout(tick, 380);
    }
  }
  attachPhased(name) { this.setState({ ftype: 'phased', file2: name || 'phased_genotype_20240312.zip', tab: 'heritage', segSel: null, attachErr: '' }); setTimeout(() => this.save(), 0); }
  save() {
    const s = this.state;
    const saved = { variant: s.file2 ? 'phased' : s.variant, file: s.file, file2: s.file2 || null, date: today() };
    if (s.real) Object.assign(saved, { real: s.real, sex: s.sex, chip: s.chip, ftype: s.ftype });
    if (!ls.set('locus-saved', JSON.stringify(saved))) { delete saved.real; }
    this.setState({ saved: ls.get('locus-saved') ? saved : null });
  }
  openSaved() {
    const sv = this.state.saved; if (!sv) return;
    if (sv.real) this.setState({ phase: 'ready', tab: 'overview', err: null, real: sv.real, file: sv.file, file2: sv.file2 || null, sex: sv.sex, chip: sv.chip, ftype: sv.ftype, variant: sv.variant, hasStore: false, xrows: [] });
    else this.setState(Object.assign({ phase: 'ready', tab: 'overview', err: null }, this.sample(sv.variant), { file: sv.file, file2: sv.file2 || null }, sv.file2 ? { ftype: 'phased' } : {}));
  }
  forget() {
    ls.del('locus-saved'); clearInterval(this._t); clearTimeout(this._t);
    if (this._eng) this._eng.send({ type: 'drop' });
    this._pending = null;
    this.setState(Object.assign({ saved: null, phase: 'upload', report: false, look: false, err: null, rev: {}, lk: {}, lkData: {}, scan: 'idle', q: '', xrows: [], hasStore: false, open: null }, this.sample('phased')));
  }
  setTheme(t) { ls.set('locus-theme', t); this.setState({ theme: t, look: false }); this._returnFocus(); }
  setLang(code) { const c = I18N.load(code); ls.set('locus-lang', c); applyLang(); this.setState({ lang: c, langErr: '' }); }
  loadLangFile(f) {
    if (!f) return;
    f.text().then(x => { const p = I18N.add(x); ls.set('locus-lang-file', x); this.setLang(p.code); })
      .catch(e => this.setState({ langErr: (e && e.message) || t('That file could not be read.') }));
  }
  langButtons() {
    const s = this.state;
    return html`<div style="display:flex;flex-wrap:wrap;gap:8px">
      ${I18N.list().map(l => { const on = l.code === s.lang; return html`<button onClick=${() => this.setLang(l.code)} aria-pressed=${on ? 'true' : 'false'} lang=${l.code} dir=${l.dir} style="min-height:44px;padding:0 14px;border:var(--bw) solid ${on ? 'var(--accent)' : 'var(--line)'};border-radius:var(--rc);background:var(--surface);color:var(--ink);font:inherit;font-size:14px;font-weight:600;cursor:pointer">${notr(l.name)}</button>`; })}
      <label style="min-height:44px;padding:0 12px;display:inline-flex;align-items:center;gap:6px;border:var(--bw) dashed var(--ctl);border-radius:var(--rc);font-size:13px;font-weight:600;color:var(--muted);cursor:pointer"><i class="ph ph-upload-simple" aria-hidden="true"></i>Load a translation file
        <input type="file" accept=".xml,text/xml,application/xml" onChange=${e => { this.loadLangFile(e.target.files && e.target.files[0]); e.target.value = ''; }} style="position:absolute;width:1px;height:1px;opacity:0" /></label>
    </div>
    ${s.langErr && html`<span role="alert" style="font-size:13px;font-weight:600;color:var(--l2f)">${s.langErr}</span>`}`;
  }

  closeLook() { this.setState({ look: false }); this._returnFocus(); }
  closeReport() { this.setState({ report: false }); this._returnFocus(); }
  _returnFocus() { const el = this._opener; this._opener = null; if (el && el.isConnected) setTimeout(() => el.focus(), 0); }

  /* ---------- Explorer lookups ---------- */
  onQuery(v) {
    this.setState({ q: v });
    clearTimeout(this._qt);
    const q = v.trim().toLowerCase();
    if (!this.state.hasStore || !q) { this.setState({ xrows: [] }); return; }
    this._qt = setTimeout(() => this.engine().send({ type: 'search', q, limit: 60 }), 150);
  }
  async lookup(rsid, retry) {
    const offline = P.demo === 'offline' || navigator.onLine === false;
    if (offline) return;
    const prev = (this.state.lkData[rsid] || {});
    this.setState({ lk: { ...this.state.lk, [rsid]: retry ? 'retrying' : 'loading' }, ask: null, live: true });
    const isRs = /^rs\d+$/.test(rsid);
    const want = retry ? Object.keys(prev).filter(k => prev[k].fail) : ['ClinVar', 'SNPedia', 'Ensembl', 'gnomAD', 'PharmGKB'];
    const res = { ...prev };
    const forceFail = P.demo === 'lookupfail' && !retry;
    const tasks = [];
    if (isRs && (want.includes('ClinVar') || want.includes('gnomAD'))) tasks.push(fetchJSON(`https://myvariant.info/v1/query?q=dbsnp.rsid:${rsid}&fields=clinvar,gnomad_genome,gnomad_exome&size=10`).then(j => {
      // A marker with several alternate alleles comes back as several hits; read them all.
      const hits = (j && j.hits) || [];
      if (want.includes('ClinVar')) {
        const rcv = hits.flatMap(h => h && h.clinvar ? [].concat(h.clinvar.rcv || []) : []);
        const sig = [...new Set(rcv.map(x => x.clinical_significance).filter(Boolean))];
        res.ClinVar = { live: true, val: sig.length ? sig.slice(0, 2).join('; ') : 'No ClinVar record', sub: sig.length ? t('{0} submission records', rcv.length) : 'Not classified in ClinVar' };
      }
      if (want.includes('gnomAD')) {
        const afOf = h => { const g = h && (h.gnomad_genome || h.gnomad_exome); return g && g.af && g.af.af; };
        const afs = hits.map(afOf).filter(x => x != null);
        res.gnomAD = { live: true, val: afs.length ? t('Allele frequency {0}', afs.map(x => Number(x).toPrecision(2)).join(', ')) : 'Not in gnomAD', sub: afs.length > 1 ? 'One value per alternate allele, all populations' : 'All populations combined' };
      }
    }).catch(() => { if (want.includes('ClinVar')) res.ClinVar = { fallback: true }; if (want.includes('gnomAD')) res.gnomAD = { fallback: true }; }));
    if (isRs && want.includes('Ensembl')) tasks.push(fetchJSON(`https://rest.ensembl.org/variation/human/${rsid}?content-type=application/json`).then(j => {
      res.Ensembl = { live: true, val: (j.most_severe_consequence || 'Unknown consequence').replace(/_/g, ' '), sub: j.MAF != null ? t('Minor allele {0}, frequency {1}', j.minor_allele, j.MAF) : 'Ensembl GRCh38 record' };
    }).catch(() => { res.Ensembl = { fallback: true }; }));
    if (isRs && want.includes('SNPedia')) tasks.push((forceFail ? new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 900)) : fetchJSON(`https://bots.snpedia.com/api.php?action=query&titles=${rsid[0].toUpperCase() + rsid.slice(1)}&format=json&origin=*`)).then(j => {
      const pages = j && j.query && j.query.pages ? Object.values(j.query.pages) : [];
      const found = pages.length && !('missing' in pages[0]);
      res.SNPedia = { live: true, val: found ? 'Page found' : 'No SNPedia page', sub: found ? 'Open the page for community notes' : 'Not described on SNPedia' };
    }).catch(() => { res.SNPedia = { fail: true }; }));
    if (!isRs) want.forEach(k => res[k] = { fallback: true });
    if (want.includes('PharmGKB')) res.PharmGKB = { fallback: true };
    await Promise.all(tasks);
    const anyFail = Object.values(res).some(x => x.fail);
    this.setState({ lkData: { ...this.state.lkData, [rsid]: res }, lk: { ...this.state.lk, [rsid]: anyFail ? 'partial' : 'done' }, lkTime: { ...(this.state.lkTime || {}), [rsid]: today() } });
  }
  runScan() {
    clearInterval(this._s); this.setState({ scan: 'running', scanStep: 0 });
    this._s = setInterval(() => { const k = this.state.scanStep + 1; if (k >= 3) { clearInterval(this._s); this.setState({ scan: 'done', scanStep: 3 }); } else this.setState({ scanStep: k }); }, 700);
  }

  /* ---------- Derived values ---------- */
  derive() {
    const s = this.state;
    const T = THEMES[s.theme] || THEMES.lab;
    const mobile = P.layout === 'mobile' ? true : P.layout === 'desktop' ? false : s.w < 760;
    const xx = s.sex === 'XX', phased = s.ftype === 'phased', v4 = s.chip === 'v4', rev = s.rev || {}, real = s.real;
    let G = real ? real.genos : { ...SAMPLE_GENOS };
    if (!real && xx) SNP_DEF.filter(r => r[1] === 'Y').forEach(r => delete G[r[0]]);
    if (!real && v4) ['rs4244285', 'rs4149056', 'rs12248560'].forEach(k => delete G[k]);

    let chr, total, called;
    if (real) {
      chr = real.counts.map(([n, , c]) => [n, (CHR.find(x => x[0] === n) || [n, 1])[1], c]);
      total = real.rows; called = real.called;
    } else {
      chr = CHR.map(c => (c[0] === 'Y' && xx) ? [c[0], c[1], 0] : c);
      total = chr.reduce((a, c) => a + c[2], 0); called = total - (xx ? 6611 : 6872);
    }
    const nocallN = total - called;
    const callRate = (called / Math.max(total, 1) * 100).toFixed(2) + '%';
    const ftypeLabel = s.file2 ? 'Full genome + phased' : phased ? 'Phased genotype' : 'Full genome';
    const chipLabel = t('23andMe {0} chip', s.chip);
    const yCalls = (chr.find(c => c[0] === 'Y') || [0, 0, 0])[2];

    const health = buildHealth(G, xx).map(h => { const hidden = !!h.sens && !rev[h.id]; return { ...h, hidden, shown: !hidden, ...lv(h.level) }; });
    const hiddenH = health.filter(h => h.hidden);
    const carrier = buildCarrier(G).map(c => ({ ...c, status: c.missing ? 'Not called' : c.affected ? 'Two copies' : c.carrier ? 'Carrier' : 'Not detected', ...lv(c.missing ? -1 : c.affected ? 2 : c.carrier ? 1 : 0) }))
      .sort((a, b) => (b.n || 0) - (a.n || 0));
    const carriers = carrier.filter(c => c.n >= 1);
    const drugs = buildDrugs(G).map(d => {
      if (!d.missing) return { ...d, ...lv(d.level) };
      const offChip = v4 && d.chipDep;
      return { ...d, diplo: 'Not called', pheno: offChip ? 'Not on your chip' : 'Not called', level: -1, ...lv(-1),
        note: offChip ? 'The marker for this gene is not on the v4 chip, so it cannot be called from your file.' : 'This marker is missing or was a no-call in your file.',
        next: 'Ask for clinical testing if a related drug is being considered.' };
    });
    const traits = buildTraits(G);
    const lineage = buildLineage(G, !xx);
    const her = this.herOf(real ? real.heritage : REF_SAMPLE_RESULT, xx, mobile);
    return { her, s, T, mobile, xx, phased, v4, rev, real, G, chr, total, called, nocallN, callRate, ftypeLabel, chipLabel, yCalls, health, hiddenH, carrier, carriers, drugs, traits, lineage };
  }

  go(tab, sub) {
    this.setState({ tab, sub: sub || this.state.sub, look: false });
    const m = document.querySelector('[data-main]'); if (m) m.scrollTop = 0;
  }
  term(t) { this.setState({ term: this.state.term === t ? null : t }); }
  openPicker(attach) { this._attach = !!attach; const el = document.getElementById(this.inputId); if (el) { el.value = ''; el.click(); } }

  render() {
    const D = this.derive(), s = this.state, T = D.T;
    const rootStyle = Object.assign({}, T.vars, I18N.font ? { '--font': `${I18N.font}, ${T.vars['--font'] || 'system-ui, sans-serif'}` } : {}, { position: 'fixed', inset: '0', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--bg)', overflow: 'hidden' });
    return html`<div data-locus-root="1" class=${'locus theme-' + s.theme} lang=${s.lang} dir=${I18N.dir} style=${rootStyle}>
      <input id=${this.inputId} type="file" accept=".zip,.txt" onChange=${e => { const f = e.target.files && e.target.files[0]; if (!f) return; if (this._attach) { this._attach = false; this.attachReal(f); } else this.pickFile(f); }} tabindex="-1" aria-hidden="true" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px" />
      <div class="locus-shell" style="flex:1;min-height:0;display:flex;flex-direction:column" inert=${s.look || s.report ? true : undefined} aria-hidden=${s.look || s.report ? 'true' : undefined}>
        ${s.phase === 'upload' && this.viewUpload(D)}
        ${s.phase === 'parsing' && this.viewParsing(D)}
        ${s.phase === 'ready' && this.viewReady(D)}
      </div>
      ${s.look && this.viewLook(D)}
      ${s.report && this.viewReport(D)}
    </div>`;
  }

  themeButtons(big) {
    const s = this.state;
    return ORDER.map(id => { const t = THEMES[id], on = id === s.theme, [swBg, swAccent, swInk, swLine] = t.sw;
      if (!big) return html`<button onClick=${() => this.setTheme(id)} aria-pressed=${on ? 'true' : 'false'} style="display:flex;align-items:center;gap:8px;min-height:44px;padding:6px 12px 6px 6px;border:var(--bw) solid ${on ? 'var(--accent)' : 'var(--line)'};border-radius:var(--rc);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;font-weight:600;cursor:pointer">
          <span style="width:30px;height:30px;border-radius:var(--rc);background:${swBg};border:1px solid ${swLine};display:flex;align-items:flex-end;padding:4px;gap:3px;overflow:hidden"><span style="flex:1;height:60%;background:${swAccent}"></span><span style="flex:1;height:35%;background:${swInk}"></span></span>
          ${t.name}</button>`;
      return html`<button onClick=${() => this.setTheme(id)} aria-pressed=${on ? 'true' : 'false'} style="display:grid;grid-template-columns:56px minmax(0,1fr) auto;gap:12px;align-items:center;padding:8px;border:var(--bw) solid ${on ? 'var(--accent)' : 'var(--line)'};border-radius:var(--r);background:var(--surface);color:var(--ink);font:inherit;text-align:start;cursor:pointer">
          <span style="width:56px;height:40px;border-radius:var(--rc);background:${swBg};border:1px solid ${swLine};display:flex;align-items:flex-end;padding:5px;gap:4px;overflow:hidden"><span style="flex:1;height:65%;background:${swAccent}"></span><span style="flex:1;height:40%;background:${swInk}"></span><span style="flex:1;height:25%;background:${swAccent};opacity:.5"></span></span>
          <span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:14px;font-weight:700">${t.name}</span><span style="font-size:12px;color:var(--muted)">${t.desc}</span></span>
          ${on ? html`<i class="ph ph-check" aria-hidden="true" style="font-size:18px;color:var(--accent)"></i>` : html`<span></span>`}</button>`; });
  }

  /* ---------- Upload ---------- */
  viewUpload(D) {
    const s = this.state;
    const unlock = () => {
      if (!s.pw) { this.setState({ pwErr: true }); return; }
      const pend = this._pending;
      if (pend && pend.file && !pend.fake) { this.readReal(pend.file, s.pw); return; }
      if (pend && pend.file && pend.fake) { this.readReal(pend.file, s.pw); return; }
      const f = s.errFile || 'genome_Full_protected.zip';
      this.startSample(f.toLowerCase().includes('phased') ? 'phased' : 'full', f);
    };
    const errCard = (icon, k, title, body) => html`<div role="alert" style="${S.card};padding:24px;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;gap:12px;align-items:flex-start">${ErrIcon(icon, k)}<div style="display:flex;flex-direction:column;gap:6px;min-width:0"><span style="font-size:18px;font-weight:700">${title}</span><span style="${S.mono12};word-break:break-all">${s.errFile}</span></div></div>
      ${body}</div>`;
    return html`<div style="flex:1;overflow:auto;display:flex">
      <div style="margin:auto;width:100%;max-width:1120px;padding:clamp(20px,5vw,56px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:clamp(28px,5vw,56px);align-items:center">
        <div style="display:flex;flex-direction:column;gap:20px">
          <div style="display:flex;align-items:center;gap:10px;font-weight:700;font-size:16px"><span style="width:13px;height:13px;border-radius:var(--rc);background:var(--accent)"></span>LiberateDNA</div>
          <h1 style="margin:0;font-size:var(--hero);line-height:1.04;letter-spacing:var(--h1t);font-weight:var(--h1w);font-stretch:var(--h1s);text-wrap:balance">Explore your DNA without sharing it</h1>
          <p style="margin:0;font-size:17px;line-height:1.55;color:var(--muted);max-width:44ch">For people who have had their genome read, or have taken their raw data back from 23andMe and similar services. Add your file to see your heritage, health, traits and drug response.</p>
          <section aria-label="Privacy" style="${S.card};padding:18px 20px;display:flex;flex-direction:column;gap:12px;max-width:50ch">
            <div style="display:flex;align-items:center;gap:10px;font-size:15px;font-weight:700"><i class="ph ph-lock-simple" aria-hidden="true" style="font-size:20px;color:var(--accent)"></i>Private by design</div>
            <ul style="margin:0;padding-inline-start:20px;display:flex;flex-direction:column;gap:6px;font-size:14px;line-height:1.5;color:var(--muted)">
              <li>Your file is read in this browser and stays on your machine. There is no server, no account and no upload.</li>
              <li>Nothing goes to any online service unless you choose to. Database lookups stay off until you turn them on, and then send only a marker name, never your genotypes.</li>
              <li>Your results are kept only in this browser so you can come back to them. Delete my data clears them at any time.</li>
            </ul>
            <p style="margin:0;font-size:13px;line-height:1.5;color:var(--muted)"><strong style="color:var(--ink)">Why it exists:</strong> most DNA tools ask you to upload your genome to their servers. LiberateDNA lets you explore it without handing it to anyone.</p>
          </section>
          <div role="group" aria-label="Language" style="display:flex;flex-direction:column;gap:10px;padding-top:6px">
            <span style="font-size:13px;font-weight:600"><i class="ph ph-translate" aria-hidden="true"></i> Language</span>
            ${this.langButtons()}
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <span style="font-size:13px;font-weight:600" id="look-label">Look</span>
            <div role="group" aria-label="Choose a look" style="display:flex;flex-wrap:wrap;gap:8px">${this.themeButtons(false)}</div>
          </div>
          <p style="margin:0;font-size:12px;line-height:1.5;color:var(--muted)">${t('Version {0}. Open source under the MIT license.', APP_VERSION)} <a href="https://github.com/njarrar/LiberateDNA" target="_blank" rel="noopener">${t('Code and translations on GitHub')}</a></p>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">
          ${s.saved && html`<div style="${S.card};padding:16px 18px;display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px">
            <i class="ph ph-floppy-disk" aria-hidden="true" style="font-size:22px;color:var(--accent)"></i>
            <div style="flex:1 1 200px;display:flex;flex-direction:column;gap:3px;min-width:0"><span style="font-size:15px;font-weight:600">Saved on this device</span><span style="${S.mono12};word-break:break-all">${s.saved.file}, ${s.saved.date}</span></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap"><button onClick=${() => this.openSaved()} style=${S.btnP}>Open report</button><button onClick=${() => this.forget()} style=${S.btnS}>Delete my data</button></div>
          </div>`}
          ${!s.err && html`<div role="button" tabindex="0" aria-label="Choose your 23andMe file, or drop it here" onClick=${() => this.openPicker()} onKeyDown=${e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.openPicker(); } }}
              onDragOver=${e => { e.preventDefault(); if (!s.drag) this.setState({ drag: true }); }} onDragLeave=${() => this.setState({ drag: false })}
              onDrop=${e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) this.pickFile(f); else this.setState({ drag: false }); }}
              style="min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:32px;text-align:center;cursor:pointer;border-radius:var(--r);border:2px dashed ${s.drag ? 'var(--accent)' : 'var(--ctl)'};background:${s.drag ? 'var(--soft)' : 'var(--surface)'};transition:background .2s,border-color .2s">
            <i class="ph ph-file-zip" aria-hidden="true" style="font-size:44px;color:var(--accent)"></i>
            <div style="font-size:19px;font-weight:700">Drop your 23andMe zip here</div>
            <div style="font-size:14px;color:var(--muted);line-height:1.6"><span style="font-family:var(--mono)">genome_Full_*.zip</span> or <span style="font-family:var(--mono)">phased_genotype*.zip</span><br />The extracted .txt file works too</div>
            <button class="press" tabindex="-1" onClick=${e => { e.stopPropagation(); this.openPicker(); }} style="${S.btnP};margin-top:4px;font-size:15px;padding:0 20px"><i class="ph ph-folder-open" aria-hidden="true"></i>Choose file</button>
          </div>`}
          ${s.err === 'password' && errCard('ph-lock-key', 1, 'This zip is password-protected', html`
            <p style="margin:0;font-size:14px;line-height:1.6;color:var(--muted)">Enter the password you set when downloading. It is only used to open the file on this device.</p>
            <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600">Zip password
              <input type="password" value=${s.pw} onInput=${e => this.setState({ pw: e.target.value, pwErr: false, pwWrong: false })} onKeyDown=${e => { if (e.key === 'Enter') unlock(); }} aria-invalid=${s.pwErr || s.pwWrong ? 'true' : 'false'} aria-describedby="pw-msg" style="height:44px;padding:0 12px;border:var(--bw) solid var(--ctl);border-radius:var(--rc);background:var(--surface);color:var(--ink);font:inherit;font-size:15px;font-weight:400" />
            </label>
            <span id="pw-msg" aria-live="polite">${(s.pwErr || s.pwWrong) && html`<span style="display:inline-block;font-size:13px;font-weight:600;padding:4px 9px;border-radius:var(--rc);color:var(--l2f);background:var(--l2b)">${s.pwWrong ? "That password didn't open the file. Try again." : 'Enter the password to continue'}</span>`}</span>
            <div style="display:flex;gap:8px;flex-wrap:wrap"><button onClick=${unlock} style=${S.btnP}>Unlock and read</button><button onClick=${() => { this.setState({ err: null }); this.openPicker(); }} style=${S.btnS}>Choose another file</button></div>`)}
          ${s.err === 'vendor' && errCard('ph-warning-circle', 1, t('This looks like an {0} file', s.vendor), html`
            <p style="margin:0;font-size:14px;line-height:1.6;color:var(--muted)">LiberateDNA reads 23andMe files for now. ${s.vendor} uses a different column layout and marker set, so the results would not be reliable.</p>
            <p style="margin:0;font-size:14px;line-height:1.6">To get your 23andMe file: Settings → 23andMe Data → Download raw data.</p>
            <button onClick=${() => { this.setState({ err: null }); this.openPicker(); }} style="${S.btnP};align-self:flex-start">Choose another file</button>`)}
          ${s.err === 'corrupt' && errCard('ph-file-x', 2, "We couldn't read this file", html`
            <p style="margin:0;font-size:14px;line-height:1.6;color:var(--muted)">${s.errText || 'The file is empty or ends partway through, which usually means the download was cut off. Download it again from 23andMe: Settings → 23andMe Data → Download raw data.'}</p>
            <button onClick=${() => { this.setState({ err: null }); this.openPicker(); }} style="${S.btnP};align-self:flex-start">Choose another file</button>`)}
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;font-size:14px;color:var(--muted)">
            <span style="margin-inline-end:4px">No file handy? Try a sample:</span>
            ${[['phased', 'Phased, XY'], ['full', 'Full genome'], ['xx', 'Phased, no Y data']].map(([v, label]) => html`<button class="hov-ink" onClick=${() => this.startSample(v)} style="min-height:40px;padding:0 14px;border:var(--bw) solid var(--ctl);border-radius:var(--rc);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;font-weight:600;cursor:pointer">${label}</button>`)}
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ---------- Parsing ---------- */
  viewParsing(D) {
    const s = this.state;
    const totalShown = s.real ? s.real.rows : D.total;
    const rows = s.real ? s.real.rows : s.est ? s.rows : Math.round(Math.min(s.step + 1, 6) / 6 * D.total);
    const est = s.real ? s.real.rows : s.est || D.total;
    const STEPS = [t('Unzipping {0}', s.file), (s.est && !s.real ? t('Reading about {0} genotype rows', fmt(est)) : t('Reading {0} genotype rows', s.real ? fmt(totalShown) : fmt(D.total))), t('Detected {0}, build GRCh37', D.chipLabel), (D.phased ? t('File type: phased genotype (parent of origin known)') : t('File type: full genome (unphased)')), 'Comparing with reference populations', 'Building your report'];
    const pct = s.est && s.step <= 1 && !s.real ? Math.min(30, 4 + s.rows / Math.max(est, 1) * 26) : Math.round(Math.min(s.step, 6) / 6 * 100);
    return html`<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto">
      <div role="status" aria-live="polite" style="width:100%;max-width:520px;display:flex;flex-direction:column;gap:20px">
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-family:var(--mono);font-size:13px;color:var(--muted);word-break:break-all">${s.file}</div>
          <h2 style="margin:0;font-size:28px;font-weight:var(--hw);letter-spacing:-0.01em">Reading your genome</h2>
        </div>
        <div style="height:6px;border-radius:var(--rc);background:var(--line);overflow:hidden" role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(pct)}><div class="bar" style="height:100%;width:${pct}%;background:var(--accent)"></div></div>
        <div style="font-family:var(--mono);font-size:13px;color:var(--muted)">${fmt(rows)} of ${s.est && !s.real ? 'about ' : ''}${fmt(est)} rows</div>
        <div style="display:flex;flex-direction:column;gap:12px">
          ${STEPS.map((l, i) => { const st = i < s.step ? 0 : i === s.step ? 1 : 2; return html`<div style="display:flex;align-items:center;gap:12px;font-size:15px;color:${['var(--ink)', 'var(--accent)', 'var(--muted)'][st]}"><i class=${'ph ' + ['ph-check', 'ph-circle-notch spin', 'ph-circle'][st]} aria-hidden="true" style="font-size:16px"></i><span>${!s.real && s.est && i >= 2 && i >= s.step ? l.replace(/Detected .*/, 'Detect chip and build').replace(/File type: .*/, 'Check file type') : l}</span></div>`; })}
        </div>
        ${s.slow && html`<div style="display:flex;gap:10px;padding:14px 16px;border-radius:var(--r);background:var(--soft);font-size:14px;line-height:1.55"><i class="ph ph-hourglass-medium" aria-hidden="true" style="font-size:18px;flex:none"></i><span>Large file on a slower device. This can take up to a minute. Keep this tab open; nothing is being uploaded.</span></div>`}
      </div>
    </div>`;
  }

  /* ---------- Report shell ---------- */
  viewReady(D) {
    const s = this.state, side = !D.mobile && D.T.nav === 'side', top = !D.mobile && D.T.nav === 'top';
    const flagged = D.health.filter(h => h.shown && h.level >= 1).length + D.carriers.length + D.drugs.filter(d => d.level >= 1).length;
    const NAV = [['overview', 'Overview', 'ph-squares-four'], ['heritage', 'Heritage', 'ph-globe-hemisphere-east'], ['health', 'Health', 'ph-heartbeat', flagged], ['traits', 'Traits', 'ph-eye'], ['explorer', 'Explorer', 'ph-magnifying-glass']];
    const opener = fn => e => { this._opener = e.currentTarget; fn(); };
    const openLook = opener(() => this.setState({ look: true }));
    const openReport = opener(() => this.setState({ report: true, look: false }));
    const reset = () => { clearInterval(this._t); clearTimeout(this._t); this.setState({ phase: 'upload', step: 0, err: null, report: false, look: false }); };
    const sideBtn = 'min-height:42px;padding:0 12px;border:var(--bw) solid var(--ctl);border-radius:var(--rc);background:var(--surface);color:var(--ink);font:inherit;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px';
    const topBtn = 'min-height:40px;padding:0 14px;border:var(--bw) solid var(--ctl);border-radius:var(--rc);background:transparent;color:var(--ink);font:inherit;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px';
    const pad = D.mobile ? '20px 16px 40px' : '32px clamp(20px,4vw,44px) 64px';
    return html`<div style="flex:1;min-height:0;display:flex;flex-direction:${side ? 'row' : 'column'}">
      ${side && html`<aside style="width:252px;flex:none;background:var(--sideBg);border-inline-end:var(--bw) solid var(--sideLine);display:flex;flex-direction:column;gap:20px;padding:22px 14px;overflow:auto">
        <div style="display:flex;align-items:center;gap:10px;padding:0 10px;font-weight:700;font-size:16px"><span style="width:13px;height:13px;border-radius:var(--rc);background:var(--accent)"></span>LiberateDNA</div>
        <div style="margin:0 4px;padding:12px;border:var(--bw) solid var(--line);border-radius:var(--r);background:var(--surface);display:flex;flex-direction:column;gap:6px">
          <div style="font-family:var(--mono);font-size:12px;word-break:break-all">${s.file}</div>
          ${s.file2 && html`<div style="font-family:var(--mono);font-size:12px;word-break:break-all">+ ${s.file2}</div>`}
          <div style="font-size:12px;color:var(--muted)">${D.ftypeLabel}, ${D.chipLabel}</div>
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)"><i class="ph ph-lock-simple" aria-hidden="true"></i>Read locally${s.saved ? ', saved on this device' : ''}</div>
        </div>
        <nav aria-label="Report sections" style="display:flex;flex-direction:column;gap:2px">
          ${NAV.map(([id, label, icon, badge]) => { const on = s.tab === id; return html`<button onClick=${() => this.go(id)} aria-current=${on ? 'page' : 'false'} style="display:flex;align-items:center;gap:11px;min-height:42px;padding:0 12px;border:0;border-radius:var(--rc);background:${on ? 'var(--navOnB)' : 'transparent'};color:${on ? 'var(--navOnF)' : 'var(--ink)'};font:inherit;font-size:15px;font-weight:${on ? 600 : 500};text-align:start;cursor:pointer">
            <i class=${'ph ' + icon} aria-hidden="true" style="font-size:18px"></i><span style="flex:1">${label}</span>
            ${badge ? html`<span aria-label=${t('{0} results to review', badge)} style="min-width:22px;padding:2px 7px;border-radius:var(--rc);font-family:var(--mono);font-size:12px;font-weight:600;text-align:center;color:var(--l1f);background:var(--l1b)">${badge}</span>` : null}</button>`; })}
        </nav>
        <div style="margin-top:auto;display:flex;flex-direction:column;gap:8px;padding:0 4px">
          <button onClick=${openLook} style=${sideBtn}><i class="ph ph-translate" aria-hidden="true"></i>${notr(I18N.list().find(l => l.code === s.lang).name)}</button>
          <button onClick=${openLook} style=${sideBtn}><i class="ph ph-palette" aria-hidden="true"></i>Look: ${D.T.name}</button>
          <button onClick=${openReport} style=${sideBtn}><i class="ph ph-file-text" aria-hidden="true"></i>Doctor summary</button>
          <button onClick=${reset} style=${sideBtn}><i class="ph ph-upload-simple" aria-hidden="true"></i>New file</button>
          <button onClick=${() => this.forget()} style="min-height:36px;padding:0 12px;border:0;background:transparent;color:var(--muted);font:inherit;font-size:13px;text-decoration:underline;cursor:pointer;text-align:start">Delete my data</button>
        </div>
      </aside>`}
      ${top && html`<header style="flex:none;background:var(--bg);border-bottom:var(--bw) solid var(--line)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px clamp(16px,3vw,32px);flex-wrap:wrap">
          <div style="display:flex;align-items:baseline;gap:16px;min-width:0;flex-wrap:wrap"><span style="font-weight:800;font-size:18px">LIBERATEDNA</span><span style="font-family:var(--mono);font-size:12px;word-break:break-all">${s.file}${s.file2 ? ' + ' + s.file2 : ''}</span><span style="font-size:12px">${D.ftypeLabel}, ${D.chipLabel}, read locally</span></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button onClick=${openLook} style=${topBtn}><i class="ph ph-translate" aria-hidden="true"></i>Language</button>
            <button onClick=${openLook} style=${topBtn}><i class="ph ph-palette" aria-hidden="true"></i>Look</button>
            <button onClick=${openReport} style=${topBtn}>Doctor summary</button>
            <button onClick=${reset} style=${topBtn}>New file</button>
            <button onClick=${() => this.forget()} style="min-height:40px;padding:0 10px;border:0;background:transparent;color:var(--ink);font:inherit;font-size:13px;text-decoration:underline;cursor:pointer">Delete my data</button>
          </div>
        </div>
        <nav aria-label="Report sections" style="display:flex;border-top:var(--bw) solid var(--line)">
          ${NAV.map(([id, label, , badge], ni) => { const on = s.tab === id; return html`<button onClick=${() => this.go(id)} aria-current=${on ? 'page' : 'false'} style="flex:1;min-height:52px;padding:0 18px;border:0;border-inline-end:${ni === NAV.length - 1 ? '0' : 'var(--bw) solid var(--line)'};background:${on ? 'var(--navOnB)' : 'transparent'};color:${on ? 'var(--navOnF)' : 'var(--ink)'};font:inherit;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">${label}${badge ? html`<span aria-label=${t('{0} results to review', badge)} style="font-family:var(--mono);font-size:13px;font-weight:500;padding:1px 7px;color:var(--l1f);background:var(--l1b)">${badge}</span>` : null}</button>`; })}
        </nav>
      </header>`}
      ${D.mobile && html`<header style="flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px 6px 16px;background:var(--sideBgM);border-bottom:var(--bw) solid var(--line)">
        <div style="display:flex;flex-direction:column;min-width:0"><span style="font-weight:700;font-size:16px">LiberateDNA</span><span style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${D.ftypeLabel}, read locally</span></div>
        <div style="display:flex;gap:2px">
          <button onClick=${openLook} aria-label="Language and look" style="width:44px;height:44px;border:0;background:transparent;color:var(--ink);font-size:20px;cursor:pointer"><i class="ph ph-palette" aria-hidden="true"></i></button>
          <button onClick=${openReport} aria-label="Doctor summary" style="width:44px;height:44px;border:0;background:transparent;color:var(--ink);font-size:20px;cursor:pointer"><i class="ph ph-file-text" aria-hidden="true"></i></button>
          <button onClick=${reset} aria-label="New file" style="width:44px;height:44px;border:0;background:transparent;color:var(--ink);font-size:20px;cursor:pointer"><i class="ph ph-upload-simple" aria-hidden="true"></i></button>
        </div>
      </header>`}
      <main data-main="1" style="flex:1;min-width:0;min-height:0;overflow:auto">
        <div style="max-width:1080px;margin:0 auto;padding:${pad};display:flex;flex-direction:column;gap:28px">
          ${s.tab === 'overview' && this.viewOverview(D)}
          ${s.tab === 'heritage' && this.viewHeritage(D)}
          ${s.tab === 'health' && this.viewHealth(D)}
          ${s.tab === 'traits' && this.viewTraits(D)}
          ${s.tab === 'explorer' && this.viewExplorer(D)}
        </div>
      </main>
      ${D.mobile && html`<nav aria-label="Report sections" style="flex:none;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));background:var(--sideBgM);border-top:var(--bw) solid var(--line);padding-bottom:env(safe-area-inset-bottom)">
        ${NAV.map(([id, label, icon, badge]) => { const on = s.tab === id; return html`<button onClick=${() => this.go(id)} aria-current=${on ? 'page' : 'false'} style="min-height:60px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:0;background:transparent;color:${on ? 'var(--accent)' : 'var(--muted)'};font:inherit;font-size:11px;font-weight:${on ? 700 : 500};cursor:pointer;position:relative">
          <i class=${'ph ' + icon} aria-hidden="true" style="font-size:22px"></i>${label}
          ${badge ? html`<span aria-label=${t('{0} results to review', badge)} style="position:absolute;top:6px;inset-inline-start:calc(50% + 6px);min-width:18px;height:18px;padding:0 5px;border-radius:9px;font-size:11px;font-weight:700;line-height:18px;color:var(--l1f);background:var(--l1b)">${badge}</span>` : null}</button>`; })}
      </nav>`}
    </div>`;
  }

  exampleNote(what) {
    return html`<div role="note" style="display:flex;gap:12px;padding:14px 16px;border-radius:var(--r);background:var(--l1b);color:var(--l1f);font-size:14px;line-height:1.55"><i class="ph ph-flask" aria-hidden="true" style="font-size:19px;flex:none;margin-top:1px"></i><span>${what}</span></div>`;
  }

  /* Turn engine output into display rows. Returns null when there is nothing computed. */
  herOf(H, xx, mobile) {
    if (!H || !H.anc || H.anc.tooFew) return null;
    const meta = {}; REF_PANEL.groups.forEach(g => meta[g.id] = g);
    const regMeta = {}; REF_PANEL.regions.forEach(r => regMeta[r.id] = r);
    const confOf = (lo, hi, pct) => { const w = hi - lo; if (pct < 4) return ['Small, may be noise', 1]; return w <= 6 ? ['High confidence', 0] : w <= 14 ? ['Medium confidence', -1] : ['Low confidence', 1]; };
    const row = (m, x) => { const c = confOf(x.lo, x.hi, x.pct), cc = lv(c[1]); const lo = Math.max(0, Math.floor(Math.min(x.lo, x.pct))), hi = Math.ceil(Math.max(x.hi, x.pct));
      return { ...m, pct: x.pct, lo, hi, pctLabel: Math.round(x.pct) + '%', range: lo === hi ? t('About {0}%', Math.round(x.pct)) : t('{0} to {1}%', lo, hi), hasConf: true, confLabel: c[0], confFg: cc.fg, confBg: cc.bg, w: x.pct + '%', big: x.pct >= (mobile ? 30 : 12) }; };
    const rows = (arr, m, subOf) => { const keep = arr.filter(x => x.pct >= 2).sort((a, b) => b.pct - a.pct).map(x => row({ ...m[x.id], sub: subOf(m[x.id]) }, x));
      const rest = 100 - keep.reduce((t, x) => t + x.pct, 0);
      if (rest >= 0.5) keep.push({ id: 'other', name: 'Other groups', sub: 'Each under 2%', color: '#9a9a9a', on: '#111111', pct: rest, pctLabel: Math.round(rest) + '%', range: t('About {0}%', Math.max(1, Math.round(rest))), hasConf: false, w: rest + '%', big: false });
      return keep; };
    const groups = rows(H.anc.groups, meta, g => g.sub);
    const regions = rows(H.anc.regions, regMeta, r => I18N.join(REF_PANEL.groups.filter(g => g.region === r.id).map(g => g.name).slice(0, 4)));
    const mat = H.mt && { hg: H.mt.hg, path: H.mt.path, via: 'mitochondrial DNA, from mother to every child', desc: lineInfo(MT_INFO, H.mt.hg), markers: t('Placed on PhyloTree from {0} mitochondrial markers. Match score {1}%.', fmt(H.mt.tested), Math.round(H.mt.score * 100)) };
    const pat = !xx && H.y && { hg: H.y.short || H.y.hg, alt: H.y.short ? `ISOGG 2016: ${H.y.hg}` : '', path: H.y.path.filter(n => n !== 'Root'), via: 'the Y chromosome, from father to son', desc: lineInfo(Y_INFO, H.y.hg), markers: t('Placed on the ISOGG tree from {0} Y-chromosome markers; {1} carry the branch mutations on your path.', fmt(H.y.tested), fmt(H.y.derived)) };
    return { groups, regions, closest: H.anc.closest.map(c => meta[c.id]), paint: H.paint, used: H.anc.used, refPeople: REF_PANEL.groups.reduce((t, g) => t + g.n, 0), lines: { mat, pat } };
  }

  ancestryRows(D) {
    if (D.her) return { regRows: D.her.regions, popRows: D.her.groups, list: this.state.fine ? D.her.groups : D.her.regions };
    const mobile = D.mobile, s = this.state;
    const confMap = { high: ['High confidence', 0], medium: ['Medium confidence', -1], low: ['Low confidence', 1] };
    const rowOf = p => { const c = confMap[p.conf]; const cc = lv(c ? c[1] : -1); return { ...p, pctLabel: Math.round(p.pct) + '%', range: p.lo != null ? t('{0} to {1}%', p.lo, p.hi) : t('About {0}%', Math.round(p.pct)), hasConf: !!c, confLabel: c ? c[0] : '', confFg: cc.fg, confBg: cc.bg, w: p.pct + '%', big: p.pct >= (mobile ? 30 : 12) }; };
    const regRows = REGIONS.map(rowOf), popRows = POPS.map(rowOf);
    return { regRows, popRows, list: s.fine ? popRows : regRows };
  }
  conic(arr) { let a = 0; return 'conic-gradient(' + arr.map(p => { const x = `${p.color} ${a}% ${a + p.pct}%`; a += p.pct; return x; }).join(', ') + ')'; }

  /* ---------- Overview ---------- */
  viewOverview(D) {
    const s = this.state, A = this.ancestryRows(D), RR = A.regRows.filter(r => r.id !== 'other' && r.id !== 'un'), r1 = RR[0], r2 = RR[1], p1 = D.her ? D.her.closest[0] : POPS[0], L = D.lineage;
    const aria = arr => I18N.join(arr.map(p => I18N.tr(p.name) + ' ' + p.range));
    const F = [];
    const apoe = D.health.find(h => h.id === 'apoe');
    if (D.rev.apoe && apoe.level === 2) F.push({ kind: 'Health', title: `APOE ${apoe.result.split(',')[0]}`, text: apoe.n === 2 ? "Two copies of ε4, linked to higher Alzheimer's risk" : "One copy of ε4, linked to higher Alzheimer's risk", level: 2, tab: 'health', sub: 'risks' });
    const brca = D.health.find(h => h.id === 'brca');
    if (D.rev.brca && brca.level === 2) F.push({ kind: 'Health', title: 'Possible BRCA variant', text: 'A mixed call at a BRCA founder variant needs a clinical test', level: 2, rare: true, tab: 'health', sub: 'risks' });
    D.health.filter(h => !h.sens && h.level === 2).forEach(h => F.push({ kind: 'Health', title: h.title, text: h.summary.split('.')[0], level: 2, tab: 'health', sub: 'risks' }));
    D.drugs.filter(d => d.level === 2).forEach(d => F.push({ kind: 'Drug response', title: `${d.gene} ${I18N.code === 'en' ? d.pheno.toLowerCase() : I18N.tr(d.pheno)}`, text: d.note.split('.')[0], level: 2, rare: !!d.rare, tab: 'health', sub: 'drugs' }));
    D.carriers.forEach(c => F.push({ kind: 'Carrier status', title: (c.affected ? t('{0} variant, two copies', c.cond) : t('{0} carrier', c.cond)), text: c.affected ? t('Two copies of {0} {1}. Talk to a doctor about this result.', c.gene, c.variant) : t('One copy of {0} {1}. Carriers usually have no symptoms.', c.gene, c.variant), level: c.affected ? 2 : 1, rare: c.rare, tab: 'health', sub: 'carrier' }));
    D.health.filter(h => !h.sens && h.level === 1).slice(0, 1).forEach(h => F.push({ kind: 'Health', title: h.title, text: h.summary.split(',')[0].split('.')[0], level: 1, tab: 'health', sub: 'risks' }));
    const hid = D.hiddenH;
    if (hid.length) F.push({ kind: 'Your choice', title: hid.length > 1 ? t('{0} sensitive results hidden', hid.length) : t('1 sensitive result hidden'), text: hid.length > 1 ? t('{0} stay hidden until you choose to see them.', I18N.join(hid.map(h => h.short), true)) : t('{0} stays hidden until you choose to see it.', hid[0].short), level: -1, tab: 'health', sub: 'risks' });
    const chr = D.chr, maxC = Math.max(...chr.map(c => c[2]), 1);
    const autos = chr.slice(0, 22), minA = autos.reduce((a, c) => c[2] < a[2] ? c : a), maxR = chr.reduce((a, c) => c[2] > a[2] ? c : a);
    const mt = chr.find(c => c[0] === 'MT') || ['MT', 0, 0];
    const present = chr.filter(c => c[2] > 0).map(c => c[0]);
    const extra = ['X', 'Y', 'MT'].filter(c => present.includes(c));
    const chromSummary = t('Most markers on chromosome {0} ({1}), fewest among numbered chromosomes on {2} ({3}).', maxR[0], fmt(maxR[2]), minA[0], fmt(minA[2])) + ' ' + (D.yCalls === 0 ? t('No Y-chromosome markers, as expected for an XX file.') + ' ' : '') + t('Mitochondrial DNA has {0} markers. X, Y and mitochondrial bars are shown in grey.', fmt(mt[2]));
    const stats = [
      { label: 'Genotypes read', value: fmt(D.real ? D.total : D.total), sub: t('{0} chromosomes incl. {1}', present.length, extra.length === 3 ? 'X, Y, MT' : I18N.join(extra, true)) },
      { label: 'Called', value: fmt(D.called), sub: t('{0} no-calls', fmt(D.nocallN)) },
      { label: 'Call rate', value: D.callRate, sub: 'Above 98% is good quality' },
      { label: 'Inferred sex', value: s.sex, sub: D.yCalls === 0 ? 'No Y-chromosome calls' : t('{0} Y-chromosome calls', fmt(D.yCalls)) },
      { label: 'File type', value: D.phased ? 'Phased' : 'Full', sub: D.phased ? 'Parent of origin known' : 'Unphased genotypes' },
      { label: 'Chip and build', value: s.chip + ' / GRCh37', sub: 'Detected from marker set' }
    ];
    return html`<section aria-labelledby="h-ov" style="display:flex;flex-direction:column;gap:26px">
      ${D.v4 && html`<div role="note" style="display:flex;gap:12px;padding:14px 16px;border-radius:var(--r);background:var(--l1b);color:var(--l1f);font-size:14px;line-height:1.55"><i class="ph ph-cpu" aria-hidden="true" style="font-size:19px;flex:none"></i><span>Older chip detected (23andMe v4). Two drug-response markers are not on this chip, so CYP2C19 and SLCO1B1 cannot be called.</span></div>`}
      ${D.real && !D.her ? html`<div style="${S.card};padding:clamp(20px,4vw,34px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:28px;align-items:center">
        <div style="display:flex;flex-direction:column;gap:14px">
          <h1 id="h-ov" style="margin:0;font-size:var(--hero);font-weight:var(--h1w);letter-spacing:var(--h1t);font-stretch:var(--h1s);line-height:1.06;text-wrap:balance">${L.mat || L.pat ? 'Your family lines, read from your file' : 'Your file, read in this browser'}</h1>
          <p style="margin:0;font-size:16px;line-height:1.6;color:var(--muted);max-width:52ch;text-wrap:pretty">LiberateDNA does not yet work out heritage percentages from a file, because that needs a reference panel it does not ship. Your maternal and paternal lines, and every health, drug and trait result below, come from your own calls.</p>
          <button class="press" onClick=${() => this.go('heritage')} style="${S.btnP};align-self:flex-start;font-size:15px">See your heritage<i class="ph ph-arrow-right" aria-hidden="true"></i></button>
        </div>
        <div style="display:flex;flex-direction:column;gap:var(--bw);background:var(--line);border:var(--bw) solid var(--line);border-radius:var(--r);overflow:hidden">
          ${[['Maternal line', L.mat ? L.mat.hg : 'Not placed'], ['Paternal line', D.xx ? 'No Y chromosome' : L.pat ? L.pat.hg : 'Not placed']].map(([k, v]) => html`<div style="background:var(--surface);padding:14px 16px;display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap"><span style="font-size:14px;color:var(--muted)">${k}</span><span style="font-size:22px;font-weight:var(--tw)">${v}</span></div>`)}
        </div>
      </div>` : html`      <div style="${S.card};padding:clamp(20px,4vw,34px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:28px;align-items:center">
        <div style="display:flex;flex-direction:column;gap:14px">
          <h1 id="h-ov" style="margin:0;font-size:var(--hero);font-weight:var(--h1w);letter-spacing:var(--h1t);font-stretch:var(--h1s);line-height:1.06;text-wrap:balance">${r2 && r2.pct >= 5 ? t('Mostly {0}, with {1} roots', r1.name, r2.name) : t('Mostly {0}', r1.name)}</h1>
          <p style="margin:0;font-size:16px;line-height:1.6;color:var(--muted);max-width:48ch;text-wrap:pretty">${D.her ? (r2 ? t('About {0}% {1} and {2}% {3}.', Math.round(r1.pct), r1.name, Math.round(r2.pct), r2.name) : t('About {0}% {1}.', Math.round(r1.pct), r1.name)) + ' ' + (D.real ? t('Your closest reference group is {0}.', p1.name) : t("The sample's closest reference group is {0}.", p1.name)) : t('About {0}% {1} and {2}% {3}.', Math.round(r1.pct), r1.name, Math.round(r2.pct), r2.name) + ' ' + t('Your largest single group is {0}, estimated at {1} to {2}%.', p1.name, p1.lo, p1.hi)}</p>
          <button class="press" onClick=${() => this.go('heritage')} style="${S.btnP};align-self:flex-start;font-size:15px">See your heritage<i class="ph ph-arrow-right" aria-hidden="true"></i></button>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px">
          ${D.T.ring && html`<div style="display:flex;justify-content:center"><div role="img" aria-label=${'Broad regions: ' + aria(A.regRows)} style="width:180px;height:180px;border-radius:50%;background:${this.conic(A.regRows)};display:flex;align-items:center;justify-content:center"><div style="width:112px;height:112px;border-radius:50%;background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center"><span style="font-size:26px;font-weight:700">${Math.round(r1.pct)}%</span><span style="font-size:12px;color:var(--muted)">${r1.name}</span></div></div></div>`}
          <div role="img" aria-label=${'Broad regions: ' + aria(A.regRows)} style="display:flex;height:var(--barS);gap:2px;border-radius:var(--rc);overflow:hidden">
            ${A.regRows.map(p => html`<div title=${I18N.tr(p.name) + ' ' + p.range} style="width:${p.w};background:${p.color}"></div>`)}
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${A.regRows.map(p => html`<div style="display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:10px;align-items:center;font-size:14px"><span style="width:12px;height:12px;border-radius:var(--rc);background:${p.color}"></span><span>${p.name}</span><span style="font-family:var(--mono);color:var(--muted);white-space:nowrap">${p.range}</span></div>`)}
          </div>
        </div>
      </div>`}
      <div style="display:flex;flex-direction:column;gap:14px">
        <h2 style=${S.h2}>Worth a closer look</h2>
        ${F.length ? html`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px">
          ${F.map(f => { const c = lv(f.level); return html`<button class="lift" onClick=${() => this.go(f.tab, f.sub)} style="display:flex;flex-direction:column;gap:10px;padding:18px;border:var(--bw) solid var(--card);border-radius:var(--r);background:var(--surface);box-shadow:var(--sh);font:inherit;color:inherit;text-align:start;cursor:pointer">
            <span style="align-self:flex-start;font-size:12px;font-weight:600;padding:4px 9px;border-radius:var(--rc);color:${c.fg};background:${c.bg}">${f.kind}</span>
            <span style="font-size:17px;font-weight:var(--tw);line-height:1.25">${f.title}</span>
            <span style="font-size:14px;line-height:1.5;color:var(--muted)">${f.text}</span>
            ${f.rare && Rare('Rare result: confirm with a clinical test')}
          </button>`; })}
        </div>` : html`<p style="margin:0;font-size:15px;color:var(--muted)">Nothing stands out. Every result is typical or not called.</p>`}
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <h2 style=${S.h2}>What was in your file</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--bw);background:var(--line);border:var(--bw) solid var(--line);border-radius:var(--r);overflow:hidden">
          ${stats.map(st => html`<div style="background:var(--surface);padding:14px 16px;display:flex;flex-direction:column;gap:5px"><span style="font-size:13px;color:var(--muted)">${st.label}</span><span style="font-family:var(--mono);font-size:19px;font-weight:500">${st.value}</span><span style="font-size:12px;color:var(--muted);line-height:1.4">${st.sub}</span></div>`)}
        </div>
        <div style="font-size:14px;line-height:1.55;color:var(--muted)">New to this? <button onClick=${() => this.term('call')} aria-expanded=${s.term === 'call' ? 'true' : 'false'} style=${S.term}>What is call rate?</button></div>
        ${s.term === 'call' && html`<div style=${S.tip}>Call rate is the share of markers the chip read successfully. Above 98% is good quality. A no-call means that position couldn't be read and is left out of every result.</div>`}
        <div style="${S.card};padding:18px;display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap"><h3 style="margin:0;font-size:15px;font-weight:600">Markers per chromosome</h3><span style="${S.mono12}">max ${fmt(maxC)}</span></div>
          <div aria-hidden="true" style="height:150px;display:flex;align-items:flex-end;gap:3px">
            ${chr.map(([name, , n]) => html`<div title=${t('Chromosome {0}: {1}', name, fmt(n))} style="flex:1;min-width:0;height:${(n / maxC * 100).toFixed(1)}%;background:${/^(X|Y|MT)$/.test(name) ? 'var(--muted)' : 'var(--accent)'};border-radius:var(--rbar)"></div>`)}
          </div>
          <div aria-hidden="true" style="display:flex;gap:3px;margin-top:-6px">
            ${chr.map(([name]) => html`<div style="flex:1;min-width:0;text-align:center;font-family:var(--mono);font-size:11px;color:var(--muted);overflow:hidden">${D.mobile && !/^(1|5|10|15|20|X|Y|MT)$/.test(name) ? '' : name === 'MT' ? 'M' : name}</div>`)}
          </div>
          <p style="margin:0;font-size:14px;line-height:1.55;color:var(--muted)">${chromSummary}</p>
        </div>
      </div>
    </section>`;
  }

  /* ---------- Heritage ---------- */
  viewHeritage(D) {
    const s = this.state, H = D.her;
    if (!H) return this.viewHeritageExample(D);
    const list = s.fine ? H.groups : H.regions;
    const aria = I18N.join(list.map(p => I18N.tr(p.name) + ' ' + p.range));
    const regById = {}; REF_PANEL.regions.forEach(r => regById[r.id] = r);
    const top = H.closest[0], top2 = H.closest[1];
    const who = D.real ? 'your file' : 'the sample';
    // Map: equirectangular, zoomed to the groups that matter.
    const X = lon => (lon + 170) / 350 * 1000, Y = lat => (78 - lat) / 134 * 383;
    const shown = H.groups.filter(g => g.id !== 'other' && g.pct >= 1);
    const pts = (shown.length ? shown : H.closest.slice(0, 3)).map(g => [X(g.lon), Y(g.lat)]);
    const minx = Math.max(0, Math.min(...pts.map(p => p[0])) - 90), maxx = Math.min(1000, Math.max(...pts.map(p => p[0])) + 90);
    const miny = Math.max(0, Math.min(...pts.map(p => p[1])) - 60), maxy = Math.min(383, Math.max(...pts.map(p => p[1])) + 60);
    let vw = Math.max(maxx - minx, 320), vh = Math.max(maxy - miny, vw * 0.5); vw = Math.max(vw, vh * 1.4);
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    const vb = [Math.max(0, Math.min(1000 - vw, cx - vw / 2)), Math.max(0, Math.min(383 - vh, cy - vh / 2)), Math.min(vw, 1000), Math.min(vh, 383)];
    const k = vb[2] / 1000;
    const dots = REF_PANEL.groups.map(g => { const r = H.groups.find(x => x.id === g.id); const pct = r ? r.pct : 0; return { ...g, pct, x: X(g.lon), y: Y(g.lat), r: (pct >= 1 ? 4 + Math.sqrt(pct) * 2.6 : 2.2) * k * 1.6 }; }).sort((a, b) => a.pct - b.pct);
    const map = html`<svg viewBox=${vb.join(' ')} role="img" aria-label=${t('Map of reference groups. Largest matches: {0}', I18N.join(shown.slice(0, 4).map(g => I18N.tr(g.name) + ' ' + g.pctLabel)))} style="width:100%;height:auto;display:block;border-radius:var(--r);background:var(--soft)">
      <path d=${WORLD_PATH} fill="var(--ctl)" fill-opacity="0.55" stroke="var(--muted)" stroke-opacity="0.35" stroke-width=${0.6 * k}></path>
      ${dots.map(d => html`<circle cx=${d.x} cy=${d.y} r=${d.r} fill=${d.pct >= 1 ? d.color : 'var(--muted)'} fill-opacity=${d.pct >= 1 ? 0.9 : 0.35} stroke=${d.pct >= 1 ? 'var(--surface)' : 'none'} stroke-width=${1.2 * k}><title>${d.name}${d.pct >= 1 ? ', ' + Math.round(d.pct) + '%' : ''}</title></circle>`)}
      ${shown.slice(0, 4).map(d => dots.find(x => x.id === d.id)).filter((dd, i, a) => a.slice(0, i).every(o => Math.abs(o.x - dd.x) > 60 * k || Math.abs(o.y - dd.y) > 14 * k)).slice(0, 3).map(dd => { const d = dd; return html`<text x=${dd.x + dd.r + 4 * k} y=${dd.y + 4 * k} font-size=${12 * k * 1.6} font-weight="600" fill="var(--ink)" stroke="var(--soft)" stroke-width=${3 * k} paint-order="stroke">${d.name}</text>`; })}
    </svg>`;
    // Painting
    const segName = id => regById[id].name, segCol = id => regById[id].color;
    const paint = (H.paint || []).map((cp2, ci) => { const name = String(ci + 1), len = CHR[ci][1]; let selText = '', selColor = '';
      const copies = cp2.map((segs, i) => ({ label: t('Chromosome {0}, copy {1}: {2}', name, i + 1, I18N.join([...new Set(segs.map(x => segName(x.pop)))])),
        segs: segs.map((x, j) => { const key = name + '|' + i + '|' + j, a = x.s / 1e6, b = x.e / 1e6, l = b - a, on = s.segSel === key;
          if (on) { selText = t('Chromosome {0}, copy {1}: {2} to {3} Mb ({4} Mb, {5}% of the chromosome). {6}.', name, i + 1, a.toFixed(1), b.toFixed(1), l.toFixed(1), Math.round(l / len * 100), segName(x.pop)); selColor = segCol(x.pop); }
          return { key, w: (l / len * 100).toFixed(2) + '%', color: segCol(x.pop), title: t('{0}, {1} to {2} Mb', segName(x.pop), a.toFixed(0), b.toFixed(0)), on }; }) }));
      return { name, w: (len / 249 * 100).toFixed(1) + '%', copies, selText, selColor }; });
    const paintRegions = REF_PANEL.regions.filter(r => (H.paint || []).some(c => c.some(cp => cp.some(x => x.pop === r.id))));
    const steps = arr => { const a = arr.length > 8 ? ['…'].concat(arr.slice(-7)) : arr; return a.map((n, i) => { const last = i === a.length - 1; return html`<span style="font-family:var(--mono);font-size:12px;padding:4px 8px;border-radius:var(--rc);background:${last ? 'var(--accent)' : 'var(--surface2)'};color:${last ? 'var(--onaccent)' : 'var(--ink)'}">${n}</span>`; }); };
    const lineCard = (label, icon, x) => html`<div style="${S.card};padding:22px;display:flex;flex-direction:column;gap:14px">
      <span aria-hidden="true" style="display:var(--iconDisp);width:52px;height:52px;border-radius:50%;background:var(--soft);align-items:center;justify-content:center"><i class=${'ph ' + icon} style="font-size:24px;color:var(--accent)"></i></span>
      <div style="display:flex;flex-direction:column;gap:4px"><span style="font-size:13px;font-weight:600;color:var(--muted)">${label}</span><span style="font-size:clamp(32px,4vw,44px);font-weight:var(--h1w);letter-spacing:-0.02em;font-stretch:var(--h1s);line-height:1;overflow-wrap:anywhere">${x.hg}</span>${x.alt && html`<span style="font-family:var(--mono);font-size:13px;color:var(--muted)">${x.alt}</span>`}<span style="font-size:13px;color:var(--muted)">Traced through ${x.via}</span></div>
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px" aria-label=${t('Path: {0}', x.path.join(', '))}>${steps(x.path)}</div>
      <p style="margin:0;font-size:15px;line-height:1.6;text-wrap:pretty">${x.desc}</p>
      ${x.desc2 && html`<p style="margin:0;font-size:14px;line-height:1.6;color:var(--muted);text-wrap:pretty">${x.desc2}</p>`}
      <span style="font-size:13px;color:var(--muted)">${x.markers}</span>
    </div>`;
    const emptyCard = (label, title, body) => html`<div style="border:2px dashed var(--ctl);border-radius:var(--r);padding:22px;display:flex;flex-direction:column;gap:10px">
      <span style="font-size:13px;font-weight:600;color:var(--muted)">${label}</span><span style="font-size:18px;font-weight:700">${title}</span><p style="margin:0;font-size:14px;line-height:1.6;color:var(--muted)">${body}</p></div>`;
    const L = H.lines, CK = REF_CHECK;
    return html`<section aria-labelledby="h-her" style="display:flex;flex-direction:column;gap:24px">
      <header style="display:flex;flex-direction:column;gap:10px">
        <h1 id="h-her" style=${S.h1}>Heritage</h1>
        <p style=${S.lead}>Compared with ${fmt(H.refPeople)} people in ${REF_PANEL.groups.length} reference groups from HGDP and 1000 Genomes, using ${fmt(H.used)} markers from ${who}. Ranges show how much the answer moves when the markers are resampled.</p>
      </header>
      ${!D.real && html`<div role="note" style="${S.note};max-width:80ch"><i class="ph ph-user-circle" aria-hidden="true" style="font-size:19px;flex:none;margin-top:1px"></i><span>The sample person is built from two real reference genomes held out of the panel: one parent from Tuscany and one Palestinian. Add your own file to see yours.</span></div>`}
      <div style="${S.card};padding:clamp(18px,3vw,26px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:24px;align-items:center">
        <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
          <span style="font-size:13px;font-weight:600;color:var(--muted)">Closest reference group</span>
          <span style="font-size:clamp(30px,4vw,44px);font-weight:var(--h1w);letter-spacing:-0.02em;font-stretch:var(--h1s);line-height:1.05">${top.name}</span>
          <p style="margin:0;font-size:15px;line-height:1.6;color:var(--muted);text-wrap:pretty">Of all ${REF_PANEL.groups.length} groups, ${who === 'your file' ? 'your DNA' : "the sample's DNA"} looks most like ${top.name} reference people (${top.sub}), then ${top2.name}. This compares the DNA with each group on its own. The breakdown below lets it come from several groups at once.</p>
          <ol style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px">
            ${H.closest.slice(0, 5).map((c, i) => html`<li style="display:grid;grid-template-columns:22px 12px minmax(0,1fr);gap:8px;align-items:center;font-size:14px"><span style="font-family:var(--mono);color:var(--muted)">${i + 1}</span><span style="width:12px;height:12px;border-radius:var(--rc);background:${c.color}"></span><span>${c.name} <span style="color:var(--muted)">· ${regById[c.region].name}</span></span></li>`)}
          </ol>
        </div>
        <div style="min-width:0">${map}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <h2 style=${S.h2}>Breakdown</h2>
        <div role="group" aria-label="Detail level" style="display:flex;gap:4px;padding:4px;align-self:flex-start;border:var(--bw) solid var(--line);border-radius:var(--rc);background:var(--surface)">
          ${[[true, 'Detailed'], [false, 'Broad regions']].map(([v, label]) => { const on = s.fine === v; return html`<button onClick=${() => this.setState({ fine: v })} aria-pressed=${on ? 'true' : 'false'} style="min-height:38px;padding:0 14px;border:0;border-radius:var(--rc);background:${on ? 'var(--navOnB)' : 'transparent'};color:${on ? 'var(--navOnF)' : 'var(--ink)'};font:inherit;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap">${label}</button>`; })}
        </div>
      </div>
      <div style="${S.card};padding:clamp(18px,3vw,26px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:24px;align-items:start">
        <div style="display:flex;flex-direction:column;gap:16px;grid-column:var(--chartSpan);min-width:0">
          ${D.T.ring && html`<div style="display:flex;justify-content:center"><div role="img" aria-label=${aria} style="width:min(240px,64vw);aspect-ratio:1;border-radius:50%;background:${this.conic(list)};display:flex;align-items:center;justify-content:center"><div style="width:62%;height:62%;border-radius:50%;background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:8px"><span style="font-size:28px;font-weight:700">${Math.round(list[0].pct)}%</span><span style="font-size:12px;color:var(--muted);line-height:1.3">${list[0].name}</span></div></div></div>`}
          <div role="img" aria-label=${aria} style="display:flex;height:var(--barH);gap:3px;border-radius:var(--rc);overflow:hidden">
            ${list.map(p => html`<div title=${I18N.tr(p.name) + ' ' + p.range} style="width:${p.w};min-width:0;background:${p.color};padding:${D.T.nav === 'top' ? '10px' : '0'};display:flex;flex-direction:column;justify-content:space-between;overflow:hidden">
              ${p.big && html`<span style="display:var(--barLbl);font-size:clamp(20px,3vw,36px);font-weight:800;letter-spacing:-0.03em;line-height:1;color:${p.on}">${p.pctLabel}</span><span style="display:var(--barLbl);font-size:12px;font-weight:700;line-height:1.2;color:${p.on}">${p.name}</span>`}
            </div>`)}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;grid-column:var(--chartSpan);min-width:0">
          ${list.map(p => html`<div style="display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:6px 12px;align-items:start;padding:10px 0;border-bottom:var(--row)">
            <span style="width:12px;height:12px;margin-top:5px;border-radius:var(--rc);background:${p.color}"></span>
            <div style="display:flex;flex-direction:column;gap:3px;min-width:0"><span style="font-size:15px;font-weight:600">${p.name}</span><span style="font-size:13px;color:var(--muted)">${p.sub}</span></div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><span style="font-family:var(--mono);font-size:14px;white-space:nowrap">${p.range}</span>${p.hasConf && html`<span style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:var(--rc);color:${p.confFg};background:${p.confBg};white-space:nowrap">${p.confLabel}</span>`}</div>
          </div>`)}
        </div>
      </div>
      <div role="note" style="${S.note};max-width:80ch"><i class="ph ph-info" aria-hidden="true" style="font-size:19px;flex:none;margin-top:1px"></i><span>Middle Eastern reference people in open data come from only three groups: Bedouin from the Negev, Palestinians and Druze. Mozabite Berbers stand in for North Africa and Circassians for the Caucasus. There are no open reference groups for the Gulf, Iraq, Iran, Turkey, Egypt or Yemen, so ancestry from those places shows up split across the nearest groups. Bedouin is the closest stand-in for Arabia.</span></div>

      <div style="${S.card};padding:clamp(18px,3vw,26px);display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;flex-direction:column;gap:6px">
          <h2 style=${S.h2}>Chromosome painting</h2>
          <p style="margin:0;font-size:14px;line-height:1.55;color:var(--muted);max-width:66ch">You have two copies of each chromosome, one from each parent. Each stretch of about 120 markers is matched to the closest pair of broad regions. Short pieces under a few percent can be noise, so treat this as a rough picture. <button onClick=${() => this.term('phased')} aria-expanded=${s.term === 'phased' ? 'true' : 'false'} style=${S.term}>Which copy is which?</button></p>
        </div>
        ${s.term === 'phased' && html`<div style=${S.tip}>The two rows are the two copies, but LiberateDNA does not yet know which came from which parent, even with the phased file. A stretch shown on the top row may come from either parent.</div>`}
        ${s.file2 && html`<div role="status" style="display:flex;gap:10px;padding:12px 14px;border-radius:var(--r);background:var(--l0b);color:var(--l0f);font-size:14px;line-height:1.5"><i class="ph ph-check-circle" aria-hidden="true" style="font-size:18px;flex:none"></i><span>Phased file added: ${s.file2}. Your results are unchanged.</span></div>`}
        <div style="font-size:14px;color:var(--muted)">Tap a segment to see its position, length and origin.</div>
        <div style="display:flex;flex-direction:column;gap:9px">
          ${paint.map(c => html`<div style="display:grid;grid-template-columns:26px minmax(0,1fr);gap:6px 10px;align-items:center">
            <span style="font-family:var(--mono);font-size:12px;color:var(--muted);text-align:end">${c.name}</span>
            <div style="width:${c.w};display:flex;flex-direction:column;gap:3px">
              ${c.copies.map(cp => html`<div role="group" dir="ltr" aria-label=${cp.label} style="display:flex;height:12px;border-radius:var(--rc);overflow:hidden">${cp.segs.map(sg => html`<button class="seg" aria-label=${sg.title} aria-pressed=${sg.on ? 'true' : 'false'} title=${sg.title} onClick=${() => this.setState({ segSel: this.state.segSel === sg.key ? null : sg.key })} style="width:${sg.w};flex:none;height:100%;padding:0;border:0;background:${sg.color};box-shadow:${sg.on ? 'inset 0 0 0 2px var(--ink), inset 0 0 0 4px var(--surface)' : 'none'};cursor:pointer"></button>`)}</div>`)}
            </div>
            ${c.selText && html`<div aria-live="polite" style="grid-column:2;display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:var(--r);background:var(--soft);font-size:13px;line-height:1.5"><span style="width:10px;height:10px;margin-top:4px;flex:none;border-radius:var(--rc);background:${c.selColor}"></span><span>${c.selText}</span></div>`}
          </div>`)}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px 18px;font-size:13px">
          ${paintRegions.map(p => html`<span style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:var(--rc);background:${p.color}"></span>${p.name}</span>`)}
        </div>
        ${!D.phased && html`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:14px;color:var(--muted)"><span>Have the phased file too?</span><button onClick=${() => this.openPicker(true)} style=${S.btnS}><i class="ph ph-plus" aria-hidden="true"></i>${s.attaching ? 'Reading…' : 'Add phased file'}</button>${!D.real && html`<button onClick=${() => this.attachPhased('phased_genotype_20240312.zip')} style=${S.btnS}>Use sample phased file</button>`}</div>`}
        ${s.attachErr && html`<span role="alert" style="align-self:flex-start;font-size:13px;font-weight:600;padding:4px 9px;border-radius:var(--rc);color:var(--l2f);background:var(--l2b)">${s.attachErr}</span>`}
      </div>

      <div style="display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;flex-direction:column;gap:6px">
          <h2 style=${S.h2}>Maternal and paternal lines</h2>
          <p style="margin:0;font-size:14px;line-height:1.55;color:var(--muted)">Each traces a single line of ancestors thousands of years back. <button onClick=${() => this.term('hap')} aria-expanded=${s.term === 'hap' ? 'true' : 'false'} style=${S.term}>What is a haplogroup?</button></p>
        </div>
        ${s.term === 'hap' && html`<div style=${S.tip}>A haplogroup is a branch on the human family tree, defined by mutations passed down one line only: mother to child through mitochondrial DNA, or father to son through the Y chromosome.</div>`}
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px">
          ${L.mat ? lineCard('Maternal line', 'ph-flower-lotus', L.mat) : emptyCard('Maternal line', 'Not placed', 'Too few mitochondrial markers were read to place this line.')}
          ${D.xx ? emptyCard('Paternal line', 'No Y chromosome in this file', "The paternal line is carried on the Y chromosome, passed from father to son. A father's, brother's or paternal uncle's 23andMe file can show this line for your family.")
            : L.pat ? lineCard('Paternal line', 'ph-tree', L.pat) : emptyCard('Paternal line', 'Not placed', 'Too few Y-chromosome markers were read to place this line.')}
        </div>
      </div>

      <details style="${S.card};padding:clamp(18px,3vw,26px)">
        <summary style="cursor:pointer;font-size:var(--h2);font-weight:var(--hw)">How this works and how sure it is</summary>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:14px;font-size:14px;line-height:1.6;max-width:72ch">
          <p style="margin:0">LiberateDNA checks ${fmt(REF_PANEL.n)} markers that vary between populations and are on the chip 23andMe uses. For each one it knows how common each letter is in every reference group. It then finds the mix of groups that best explains your letters, all inside this browser.</p>
          <p style="margin:0"><b>Tested on ${CK.people} people left out of the reference.</b> The top group was the right one for ${CK.topPct}% of them, and the top broad region was right for ${CK.regPct}%. It is weakest between close neighbors: ${CK.weak}.</p>
          <p style="margin:0">Sources: <a href="https://www.internationalgenome.org/" target="_blank" rel="noopener">1000 Genomes</a> and <a href="https://www.cephb.fr/en/hgdp_panel.php" target="_blank" rel="noopener">HGDP</a>, as released in <a href="https://gnomad.broadinstitute.org/" target="_blank" rel="noopener">gnomAD</a> v3.1.2. Maternal tree: <a href="https://www.phylotree.org/" target="_blank" rel="noopener">PhyloTree</a> Build 17, scored the way <a href="https://haplogrep.i-med.ac.at/" target="_blank" rel="noopener">HaploGrep</a> does. Paternal tree: the <a href="https://isogg.org/tree/" target="_blank" rel="noopener">ISOGG</a> Y-DNA tree, 2016 edition. Branch names in newer trees may differ.</p>
        </div>
      </details>
    </section>`;
  }

  viewHeritageExample(D) {
    const s = this.state, A = this.ancestryRows(D), list = A.list;
    const aria = I18N.join(list.map(p => I18N.tr(p.name) + ' ' + p.range));
    const popById = {}; POPS.forEach(p => popById[p.id] = p);
    const regById = {}; REGIONS.forEach(r => regById[r.id] = r);
    const segName = id => s.fine ? popById[id].name : regById[popById[id].region].name;
    const segCol = id => s.fine ? popById[id].color : regById[popById[id].region].color;
    const paint = PAINT.map(c => { let selText = '', selColor = '';
      const copies = c.copies.map((segs, i) => { let pos = 0;
        return { label: t('Chromosome {0}, copy {1}: {2}', c.name, i + 1, I18N.join([...new Set(segs.map(x => segName(x.pop)))])),
          segs: segs.map((x, j) => { const key = c.name + '|' + i + '|' + j, a = pos, b = pos + x.l; pos = b; const on = s.segSel === key;
            if (on) { selText = t('Chromosome {0}, copy {1}: {2} to {3} Mb ({4} Mb, {5}% of the chromosome). {6}.', c.name, i + 1, a.toFixed(1), b.toFixed(1), x.l.toFixed(1), Math.round(x.l / c.len * 100), segName(x.pop)); selColor = segCol(x.pop); }
            return { key, w: (x.l / c.len * 100).toFixed(2) + '%', color: segCol(x.pop), title: t('{0}, {1} to {2} Mb', segName(x.pop), a.toFixed(0), b.toFixed(0)), on }; }) }; });
      return { name: c.name, w: (c.len / 249 * 100).toFixed(1) + '%', copies, selText, selColor }; });
    const L = D.lineage;
    const steps = arr => arr.map((n, i) => { const last = i === arr.length - 1; return html`<span style="font-family:var(--mono);font-size:12px;padding:4px 8px;border-radius:var(--rc);background:${last ? 'var(--accent)' : 'var(--surface2)'};color:${last ? 'var(--onaccent)' : 'var(--ink)'}">${n}</span>`; });
    const lineCard = (label, icon, x) => html`<div style="${S.card};padding:22px;display:flex;flex-direction:column;gap:14px">
      <span aria-hidden="true" style="display:var(--iconDisp);width:52px;height:52px;border-radius:50%;background:var(--soft);align-items:center;justify-content:center"><i class=${'ph ' + icon} style="font-size:24px;color:var(--accent)"></i></span>
      <div style="display:flex;flex-direction:column;gap:4px"><span style="font-size:13px;font-weight:600;color:var(--muted)">${label}</span><span style="font-size:clamp(32px,4vw,44px);font-weight:var(--h1w);letter-spacing:-0.02em;font-stretch:var(--h1s);line-height:1">${x.hg}</span><span style="font-size:13px;color:var(--muted)">Traced through ${x.via}</span></div>
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">${steps(x.path)}</div>
      <p style="margin:0;font-size:15px;line-height:1.6;text-wrap:pretty">${x.desc}</p>
      <span style="font-size:13px;color:var(--muted)">${x.age}. Markers ${x.markers}.</span>
    </div>`;
    const emptyCard = (label, title, body) => html`<div style="border:2px dashed var(--ctl);border-radius:var(--r);padding:22px;display:flex;flex-direction:column;gap:10px">
      <span style="font-size:13px;font-weight:600;color:var(--muted)">${label}</span><span style="font-size:18px;font-weight:700">${title}</span><p style="margin:0;font-size:14px;line-height:1.6;color:var(--muted)">${body}</p></div>`;
    const lines = html`<div style="display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;flex-direction:column;gap:6px">
          <h2 style=${S.h2}>Maternal and paternal lines</h2>
          <p style="margin:0;font-size:14px;line-height:1.55;color:var(--muted)">Each traces a single line of ancestors thousands of years back. <button onClick=${() => this.term('hap')} aria-expanded=${s.term === 'hap' ? 'true' : 'false'} style=${S.term}>What is a haplogroup?</button></p>
        </div>
        ${s.term === 'hap' && html`<div style=${S.tip}>A haplogroup is a branch on the human family tree, defined by mutations passed down one line only: mother to child through mitochondrial DNA, or father to son through the Y chromosome.</div>`}
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px">
          ${L.mat ? lineCard('Maternal line', 'ph-flower-lotus', L.mat) : emptyCard('Maternal line', 'Not placed with these markers', 'LiberateDNA checks markers for H, HV, J, T and U. Your file did not match them, or they were not called. A fuller tree is planned.')}
          ${D.xx ? emptyCard('Paternal line', 'No Y chromosome in this file', "The paternal line is carried on the Y chromosome, passed from father to son. A father's, brother's or paternal uncle's 23andMe file can show this line for your family.")
            : L.pat ? lineCard('Paternal line', 'ph-tree', L.pat) : emptyCard('Paternal line', 'Not placed with these markers', 'LiberateDNA checks markers for R1b, R1a, J1, J2, E1b1b, G and I1. Your file did not match them, or they were not called. A fuller tree is planned.')}
        </div>
      </div>`;
    return html`<section aria-labelledby="h-her" style="display:flex;flex-direction:column;gap:24px">
      <header style="display:flex;flex-direction:column;gap:10px">
        <h1 id="h-her" style=${S.h1}>Heritage</h1>
        <p style=${S.lead}>${D.real ? 'Your maternal and paternal lines, read from your own markers.' : 'Estimated from 4,812 ancestry-informative markers, compared with reference people from 1000 Genomes, HGDP, SGDP and the Allen Ancient DNA Resource (AADR). Ranges show how certain each estimate is.'}</p>
      </header>
      ${D.real && lines}
      ${D.real && html`<div style="border:2px dashed var(--ctl);border-radius:var(--r);padding:22px;display:flex;flex-direction:column;gap:10px;align-items:flex-start">
        <span style="font-size:18px;font-weight:700">Heritage percentages are not worked out from your file yet</span>
        <p style="margin:0;font-size:14px;line-height:1.6;color:var(--muted);max-width:66ch">That needs a reference panel of people from many regions, which LiberateDNA does not ship. Rather than guess, it shows nothing here. You can still look at the layout with example numbers that are not yours.</p>
        <button onClick=${() => this.setState({ showEx: !s.showEx })} aria-expanded=${s.showEx ? 'true' : 'false'} style=${S.btnS}>${s.showEx ? 'Hide the example' : 'Show the example layout'}</button>
      </div>`}
      ${D.real && s.showEx && this.exampleNote('Example numbers below, not computed from your file.')}
${(!D.real || s.showEx) && html`      <div role="group" aria-label="Detail level" style="display:flex;gap:4px;padding:4px;align-self:flex-start;border:var(--bw) solid var(--line);border-radius:var(--rc);background:var(--surface)">
        ${[[true, 'Detailed'], [false, 'Broad regions']].map(([v, label]) => { const on = s.fine === v; return html`<button onClick=${() => this.setState({ fine: v })} aria-pressed=${on ? 'true' : 'false'} style="min-height:38px;padding:0 14px;border:0;border-radius:var(--rc);background:${on ? 'var(--navOnB)' : 'transparent'};color:${on ? 'var(--navOnF)' : 'var(--ink)'};font:inherit;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap">${label}</button>`; })}
      </div>
      <div style="${S.card};padding:clamp(18px,3vw,26px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:24px;align-items:start">
        <div style="display:flex;flex-direction:column;gap:16px;grid-column:var(--chartSpan);min-width:0">
          ${D.T.ring && html`<div style="display:flex;justify-content:center"><div role="img" aria-label=${aria} style="width:min(240px,64vw);aspect-ratio:1;border-radius:50%;background:${this.conic(list)};display:flex;align-items:center;justify-content:center"><div style="width:62%;height:62%;border-radius:50%;background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:8px"><span style="font-size:28px;font-weight:700">${Math.round(list[0].pct)}%</span><span style="font-size:12px;color:var(--muted);line-height:1.3">${list[0].name}</span></div></div></div>`}
          <div role="img" aria-label=${aria} style="display:flex;height:var(--barH);gap:3px;border-radius:var(--rc);overflow:hidden">
            ${list.map(p => html`<div title=${I18N.tr(p.name) + ' ' + p.range} style="width:${p.w};min-width:0;background:${p.color};padding:${D.T.nav === 'top' ? '10px' : '0'};display:flex;flex-direction:column;justify-content:space-between;overflow:hidden">
              ${p.big && html`<span style="display:var(--barLbl);font-size:clamp(20px,3vw,36px);font-weight:800;letter-spacing:-0.03em;line-height:1;color:${p.on}">${p.pctLabel}</span><span style="display:var(--barLbl);font-size:12px;font-weight:700;line-height:1.2;color:${p.on}">${p.name}</span>`}
            </div>`)}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;grid-column:var(--chartSpan);min-width:0">
          ${list.map(p => html`<div style="display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:6px 12px;align-items:start;padding:10px 0;border-bottom:var(--row)">
            <span style="width:12px;height:12px;margin-top:5px;border-radius:var(--rc);background:${p.color}"></span>
            <div style="display:flex;flex-direction:column;gap:3px;min-width:0"><span style="font-size:15px;font-weight:600">${p.name}</span><span style="font-size:13px;color:var(--muted)">${p.sub}</span></div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><span style="font-family:var(--mono);font-size:14px;white-space:nowrap">${p.range}</span>${p.hasConf && html`<span style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:var(--rc);color:${p.confFg};background:${p.confBg};white-space:nowrap">${p.confLabel}</span>`}</div>
          </div>`)}
        </div>
      </div>
      <div role="note" style="${S.note};max-width:80ch"><i class="ph ph-info" aria-hidden="true" style="font-size:19px;flex:none;margin-top:1px"></i><span>Middle Eastern and North African results have lower confidence. 1000 Genomes has no reference groups from this region, so LiberateDNA relies on a few HGDP groups (Bedouin, Druze, Palestinian, Mozabite) plus ancient DNA from the AADR. Expect these figures to shift as reference data grows.</span></div>

      <div style="${S.card};padding:clamp(18px,3vw,26px);display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;flex-direction:column;gap:6px">
          <h2 style=${S.h2}>Chromosome painting</h2>
          <p style="margin:0;font-size:14px;line-height:1.55;color:var(--muted);max-width:66ch">You have two copies of each chromosome, one from each parent. Colors show where each stretch most likely comes from. <button onClick=${() => this.term('phased')} aria-expanded=${s.term === 'phased' ? 'true' : 'false'} style=${S.term}>Why the phased file?</button></p>
        </div>
        ${s.term === 'phased' && html`<div style=${S.tip}>The full genome file lists both letters at each position but not which parent each came from. The phased file adds that, so each copy can be painted on its own.</div>`}
        ${D.phased ? html`
          ${s.file2 && html`<div role="status" style="display:flex;gap:10px;padding:12px 14px;border-radius:var(--r);background:var(--l0b);color:var(--l0f);font-size:14px;line-height:1.5"><i class="ph ph-check-circle" aria-hidden="true" style="font-size:18px;flex:none"></i><span>Phased file added: ${s.file2}. ${D.real ? 'Your other results are unchanged.' : 'Painting now uses it; your other results are unchanged.'}</span></div>`}
          <div style="font-size:14px;color:var(--muted)">Tap a segment to see its position, length and origin.</div>
          <div style="display:flex;flex-direction:column;gap:9px">
            ${paint.map(c => html`<div style="display:grid;grid-template-columns:26px minmax(0,1fr);gap:6px 10px;align-items:center">
              <span style="font-family:var(--mono);font-size:12px;color:var(--muted);text-align:end">${c.name}</span>
              <div style="width:${c.w};display:flex;flex-direction:column;gap:3px">
                ${c.copies.map(cp => html`<div role="group" dir="ltr" aria-label=${cp.label} style="display:flex;height:12px;border-radius:var(--rc);overflow:hidden">${cp.segs.map(sg => html`<button class="seg" aria-label=${sg.title} aria-pressed=${sg.on ? 'true' : 'false'} title=${sg.title} onClick=${() => this.setState({ segSel: this.state.segSel === sg.key ? null : sg.key })} style="width:${sg.w};flex:none;height:100%;padding:0;border:0;background:${sg.color};box-shadow:${sg.on ? 'inset 0 0 0 2px var(--ink), inset 0 0 0 4px var(--surface)' : 'none'};cursor:pointer"></button>`)}</div>`)}
              </div>
              ${c.selText && html`<div aria-live="polite" style="grid-column:2;display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:var(--r);background:var(--soft);font-size:13px;line-height:1.5"><span style="width:10px;height:10px;margin-top:4px;flex:none;border-radius:var(--rc);background:${c.selColor}"></span><span>${c.selText}</span></div>`}
            </div>`)}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px 18px;font-size:13px">
            ${list.map(p => html`<span style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:var(--rc);background:${p.color}"></span>${p.name}</span>`)}
          </div>` : html`
          <div style="padding:20px;border:2px dashed var(--ctl);border-radius:var(--r);display:flex;flex-direction:column;gap:10px;align-items:flex-start">
            <span style="font-size:17px;font-weight:700">Add your phased file to see this</span>
            <p style="margin:0;font-size:14px;line-height:1.6;color:var(--muted);max-width:62ch">You uploaded the full genome file, which can't tell which parent each piece came from. Your percentages above are still valid. In 23andMe go to Settings → 23andMe Data, and download Phased genotype.</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap"><button onClick=${() => this.openPicker(true)} style=${S.btnP}><i class="ph ph-plus" aria-hidden="true"></i>${s.attaching ? 'Reading…' : 'Add phased file'}</button><button onClick=${() => this.attachPhased('phased_genotype_20240312.zip')} style=${S.btnS}>Use sample phased file</button></div>
            ${s.attachErr && html`<span role="alert" style="font-size:13px;font-weight:600;padding:4px 9px;border-radius:var(--rc);color:var(--l2f);background:var(--l2b)">${s.attachErr}</span>`}
            <span style="font-size:12px;color:var(--muted)">Adds to this report. Nothing else is reset.</span>
          </div>`}
      </div>`}
      ${!D.real && lines}
    </section>`;
  }

  /* ---------- Health ---------- */
  viewHealth(D) {
    const s = this.state;
    const scanAll = scanClinvar(D.G);
    const scanHidden = scanAll.filter(x => x.sens && !D.rev[x.sens]).length;
    const scanResults = scanAll.filter(x => !(x.sens && !D.rev[x.sens]));
    const scanSteps = [t('Loading the ClinVar subset built into LiberateDNA ({0} variants)', CLINVAR.length), t('Matching {0} markers on this device', fmt(D.total)), 'Sorting by clinical significance'];
    const stepRow = (label, i, cur) => { const st = i < cur ? 0 : i === cur ? 1 : 2; return html`<div style="display:flex;align-items:center;gap:10px;font-size:14px;color:${['var(--ink)', 'var(--accent)', 'var(--muted)'][st]}"><i class=${'ph ' + ['ph-check', 'ph-circle-notch spin', 'ph-circle'][st]} aria-hidden="true"></i>${label}</div>`; };
    const rareText = 'Rare result. About 40% of rare variants in consumer chip data are false positives (Tandy-Connor et al., 2018). Confirm with a clinical test.';
    return html`<section aria-labelledby="h-hl" style="display:flex;flex-direction:column;gap:20px">
      <header style="display:flex;flex-direction:column;gap:10px">
        <h1 id="h-hl" style=${S.h1}>Health</h1>
        <p style=${S.lead}>Risk factors, conditions you could pass on, and how you may respond to some medications.</p>
      </header>
      <div role="group" aria-label="Health sections" style="display:flex;flex-wrap:wrap;gap:4px;padding:4px;align-self:flex-start;border:var(--bw) solid var(--line);border-radius:var(--rc);background:var(--surface);max-width:100%">
        ${[['risks', 'Health risks'], ['carrier', 'Carrier status'], ['drugs', 'Drug response']].map(([id, label]) => { const on = s.sub === id; return html`<button onClick=${() => this.setState({ sub: id })} aria-pressed=${on ? 'true' : 'false'} style="min-height:40px;padding:0 14px;border:0;border-radius:var(--rc);background:${on ? 'var(--navOnB)' : 'transparent'};color:${on ? 'var(--navOnF)' : 'var(--ink)'};font:inherit;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap">${label}</button>`; })}
      </div>
      <div role="note" style=${S.note}><i class="ph ph-info" aria-hidden="true" style="font-size:19px;flex:none;margin-top:1px"></i><span>These results come from a consumer genotyping chip, not sequencing, and they are not a diagnosis. Confirm anything important with a clinical test and talk it through with a doctor or genetic counselor.</span></div>

      ${s.sub === 'risks' && html`
        <div style="display:flex;flex-direction:column;gap:10px">
          ${D.health.map(h => h.hidden ? html`
            <div style="border:2px dashed var(--ctl);border-radius:var(--r);padding:18px 20px;display:flex;flex-direction:column;gap:10px;background:var(--surface)">
              <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><span style="font-size:16px;font-weight:var(--tw)">${h.title}</span><span style="${S.tag};color:var(--lnf);background:var(--lnb);display:flex;align-items:center;gap:5px"><i class="ph ph-eye-slash" aria-hidden="true"></i>Hidden by default</span></div>
              <span style="font-size:15px;font-weight:600">Do you want to see this result?</span>
              <p style="margin:0;font-size:14px;line-height:1.6;color:var(--muted);max-width:70ch;text-wrap:pretty">${h.why}</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap"><button onClick=${() => this.setState({ rev: { ...s.rev, [h.id]: true }, open: h.id })} style=${S.btnS}>Show this result</button></div>
            </div>` : html`
            <div style="${S.card};overflow:hidden">
              <button onClick=${() => this.setState({ open: s.open === h.id ? null : h.id })} aria-expanded=${s.open === h.id ? 'true' : 'false'} aria-controls=${'hd-' + h.id} style="width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:14px;align-items:center;padding:16px 18px;border:0;background:transparent;font:inherit;color:inherit;text-align:start;cursor:pointer">
                <div style="display:flex;flex-direction:column;gap:4px;min-width:0"><span style="font-size:16px;font-weight:var(--tw)">${h.title}</span><span style="${S.mono12}">${h.gene}, ${h.result}</span></div>
                <span style="${S.tag};color:${h.fg};background:${h.bg}">${h.tag}</span>
                <i class=${'ph ' + (s.open === h.id ? 'ph-caret-up' : 'ph-caret-down')} aria-hidden="true" style="color:var(--muted)"></i>
              </button>
              ${s.open === h.id && html`<div id=${'hd-' + h.id} style="padding:16px 18px 20px;border-top:var(--row);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:18px 28px">
                <div style="display:flex;flex-direction:column;gap:5px"><span style="font-size:12px;font-weight:700;color:var(--muted)">What we found</span><span style="font-size:15px;line-height:1.5">${h.result}</span>${Copies(h.n, h.eff)}<span style="${S.mono12}">${h.markers}</span><span style="font-size:13px;line-height:1.5;color:var(--muted)">${h.freq}</span></div>
                <div style="display:flex;flex-direction:column;gap:5px"><span style="font-size:12px;font-weight:700;color:var(--muted)">What it means</span><span style="font-size:15px;line-height:1.55;text-wrap:pretty">${h.summary}</span><span style="font-size:14px;line-height:1.55;color:var(--muted);text-wrap:pretty">${h.detail}</span></div>
                <div style="display:flex;flex-direction:column;gap:5px"><span style="font-size:12px;font-weight:700;color:var(--muted)">How sure we are</span><span style="font-size:15px;line-height:1.5">${h.evidence} evidence</span><span style="font-size:13px;color:var(--muted);line-height:1.5">Source: ${h.src}</span>${h.rare && Rare(rareText)}</div>
                <div style="display:flex;flex-direction:column;gap:5px"><span style="font-size:12px;font-weight:700;color:var(--muted)">What to do</span><span style="font-size:15px;line-height:1.55;text-wrap:pretty">${h.next}</span></div>
                ${h.sens && html`<button onClick=${() => this.setState({ rev: { ...s.rev, [h.id]: false }, open: null })} style="justify-self:start;align-self:end;min-height:36px;padding:0;border:0;background:transparent;color:var(--muted);font:inherit;font-size:13px;text-decoration:underline;cursor:pointer">Hide this result again</button>`}
              </div>`}
            </div>`)}
        </div>
        <div style="${S.card};padding:clamp(18px,3vw,24px);display:flex;flex-direction:column;gap:14px">
          <h2 style=${S.h2}>Scan your whole file against ClinVar</h2>
          ${s.scan === 'idle' && html`
            <p style="margin:0;font-size:14px;line-height:1.6;color:var(--muted);max-width:66ch">The results above cover markers LiberateDNA checks by default. A scan matches all ${fmt(D.total)} markers in your file against the ClinVar subset built into LiberateDNA (${CLINVAR.length} well-studied variants), right here on this device. No marker IDs leave your device.</p>
            <button class="press" onClick=${() => this.runScan()} style="${S.btnP};align-self:flex-start"><i class="ph ph-magnifying-glass" aria-hidden="true"></i>Scan my file</button>`}
          ${s.scan === 'running' && html`<div role="status" aria-live="polite" style="display:flex;flex-direction:column;gap:10px">${scanSteps.map((l, i) => stepRow(l, i, s.scanStep))}</div>`}
          ${s.scan === 'done' && html`
            <p style="margin:0;font-size:14px;line-height:1.6;color:var(--muted)" aria-live="polite">${scanAll.length === 1 ? t('1 marker in your file has a ClinVar classification in this subset.') : t('{0} markers in your file have a ClinVar classification in this subset.', scanAll.length)} ${t('No other pathogenic or likely pathogenic matches.')}${scanHidden ? ' ' + t('{0} match is hidden with your sensitive results.', scanHidden) : ''}</p>
            <div style="display:flex;flex-direction:column">
              ${scanResults.map(x => { const c = lv(x.level); return html`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:6px 18px;align-items:center;padding:12px 0;border-top:var(--row)">
                <div style="display:flex;flex-direction:column;gap:3px"><span style="font-size:15px;font-weight:600">${x.cond}</span><span style="${S.mono12}">${x.gene} ${x.rsid}</span></div>
                <span style="justify-self:start;${S.tag};color:${c.fg};background:${c.bg}">${x.cls}</span>
                ${x.rare && html`<div style="grid-column:1/-1;display:flex">${Rare(rareText)}</div>`}
              </div>`; })}
            </div>`}
        </div>`}

      ${s.sub === 'carrier' && html`
        <div style="display:flex;flex-direction:column;gap:14px">
          <div style="${S.card};padding:clamp(18px,3vw,24px);display:flex;flex-direction:column;gap:8px">
            <span style="font-size:clamp(20px,2.4vw,26px);font-weight:var(--hw);letter-spacing:-0.01em;line-height:1.2">${D.carriers.length ? t('Carrier for {0} of {1} conditions tested', D.carriers.length, D.carrier.length) : t('No carrier variants found in {0} conditions tested', D.carrier.length)}</span>
            <p style="margin:0;font-size:15px;line-height:1.6;color:var(--muted);max-width:72ch">${D.carriers.length ? `${I18N.join(D.carriers.map(c => c.affected ? t('{0} (two copies of {1} {2})', c.cond, c.gene, c.variant) : t('{0} (one copy of {1} {2})', c.cond, c.gene, c.variant)))}. ${t('Carriers usually have no symptoms.')} ${t('If a partner carries a variant in the same gene, each child has a 1 in 4 chance of the condition.')}` : 'This lowers, but does not rule out, the chance of being a carrier.'}</p>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:10px">
            ${D.carrier.map(c => html`<div style="${S.card};padding:16px 18px;display:flex;flex-direction:column;gap:8px">
              <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><span style="font-size:16px;font-weight:var(--tw);line-height:1.3">${c.cond}</span><span style="flex:none;${S.tag};color:${c.fg};background:${c.bg}">${c.status}</span></div>
              <span style="${S.mono12}">${c.gene} ${c.variant}, ${c.rsid} ${c.geno}</span>
              ${Copies(c.n, c.variant)}
              <span style="font-size:13px;line-height:1.5;color:var(--muted)">${c.freq}</span>
              ${c.rare && Rare('Rare result. About 40% of rare variants in consumer chip data are false positives (Tandy-Connor et al., 2018). Confirm with a clinical test before family planning decisions.')}
            </div>`)}
          </div>
          <p style="margin:0;font-size:13px;line-height:1.55;color:var(--muted);max-width:72ch">Chips test a few known variants per gene. Not detected lowers the chance you are a carrier but does not rule it out.</p>
        </div>`}

      ${s.sub === 'drugs' && html`
        <div style="display:flex;flex-direction:column;gap:12px">
          <p style="margin:0;font-size:14px;line-height:1.6;color:var(--muted);max-width:70ch">Based on CPIC and PharmGKB guidance. Share these with your doctor or pharmacist, and never change a medication on your own.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:12px">
            ${D.drugs.map(d => html`<div style="${S.card};padding:18px;display:flex;flex-direction:column;gap:10px">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap"><div style="display:flex;align-items:baseline;gap:10px"><span style="font-family:var(--mono);font-size:18px;font-weight:500">${d.gene}</span><span style="font-family:var(--mono);font-size:13px;color:var(--muted)">${d.diplo}</span></div><span style="${S.tag};color:${d.fg};background:${d.bg}">${d.pheno}</span></div>
              <span style="font-size:15px;font-weight:600">${d.drugs}</span>
              <p style="margin:0;font-size:14px;line-height:1.55;text-wrap:pretty">${d.note}</p>
              ${d.rare && Rare(rareText)}
              <div style="display:flex;gap:8px;font-size:14px;line-height:1.5;padding-top:10px;border-top:var(--row)"><i class="ph ph-arrow-right" aria-hidden="true" style="flex:none;margin-top:3px;color:var(--accent)"></i><span>${d.next}</span></div>
              <span style="${S.mono12}">${d.markers}</span>
            </div>`)}
          </div>
        </div>`}
    </section>`;
  }

  /* ---------- Traits ---------- */
  viewTraits(D) {
    return html`<section aria-labelledby="h-tr" style="display:flex;flex-direction:column;gap:20px">
      <header style="display:flex;flex-direction:column;gap:10px">
        <h1 id="h-tr" style=${S.h1}>Traits</h1>
        <p style=${S.lead}>Well-studied markers for appearance, taste and metabolism. Most traits come from many genes, so treat these as tendencies.</p>
      </header>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:12px">
        ${D.traits.map((t, ti) => { const c = lv(t.ev === 'Strong' ? 0 : t.ev === 'Moderate' ? -1 : 1); return html`<div style="${S.card};padding:18px;display:flex;flex-direction:column;gap:10px">
          <span aria-hidden="true" style="display:var(--iconDisp);width:40px;height:40px;border-radius:50%;background:oklch(0.94 0.04 ${(ti * 40 + 180) % 360});align-items:center;justify-content:center"><i class=${'ph ' + t.icon} style="font-size:20px;color:#262421"></i></span>
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span style="font-size:13px;color:var(--muted)">${t.name}</span><span style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:var(--rc);color:${c.fg};background:${c.bg};white-space:nowrap">${t.ev} evidence</span></div>
          <span style="font-size:18px;font-weight:var(--tw);line-height:1.3;text-wrap:pretty">${t.result}</span>
          <span style="font-size:13px;line-height:1.45;color:var(--muted);text-wrap:pretty">${t.freq}</span>
          <div style="margin-top:auto;padding-top:10px;border-top:var(--row);display:flex;flex-direction:column;gap:6px">${Copies(t.n, t.eff)}<span style="${S.mono12}">${t.gene} ${t.rsid} ${t.geno}</span></div>
        </div>`; })}
      </div>
    </section>`;
  }

  /* ---------- Explorer ---------- */
  viewExplorer(D) {
    const s = this.state, q = (s.q || '').trim().toLowerCase();
    const masked = r => (r.gene === 'APOE' && !D.rev.apoe) || (/^i400037[789]$/.test(r.rsid) && !D.rev.brca);
    const all = snpRows(D.G, D.real).filter(r => !(D.xx && r.chr === 'Y'));
    const cur = all.filter(r => !q || r.rsid.includes(q) || r.gene.toLowerCase().includes(q) || r.label.toLowerCase().includes(q) || r.chr.toLowerCase() === q.replace(/^chr/, ''));
    const seen = new Set(cur.map(r => r.rsid)), curIds = new Set(all.map(r => r.rsid));
    const extra = q ? s.xrows.filter(x => !seen.has(x[0]) && !curIds.has(x[0])).map(([rsid, chr, pos, g]) => ({ rsid, chr, pos, loc: `${chr}:${fmt(pos)}`, geno: showGeno(g), gene: '-', label: 'Not in the curated set. Look it up in public databases for more.', cat: 'none', cons: 'See Ensembl', maf: '', fromFile: true })) : [];
    const rows = cur.concat(extra);
    let sr = all.find(r => r.rsid === s.sel) || (s.xsel && s.xsel.rsid === s.sel ? s.xsel : null) || all.find(r => r.rsid === 'rs4988235');
    const sm = masked(sr);
    const CAT = { health: 'Health', carrier: 'Carrier status', drug: 'Drug response', trait: 'Traits', lineage: 'Heritage (lineage)', none: 'Not in curated set' };
    const CLIN = { health: 'Risk factor', carrier: 'Pathogenic (recessive)', drug: 'Drug response', trait: 'Benign', lineage: 'Not a clinical variant', none: 'No record in LiberateDNA notes' };
    const lk = s.lk[sr.rsid], data = s.lkData[sr.rsid] || {};
    const offline = P.demo === 'offline' || navigator.onLine === false;
    const builtIn = {
      ClinVar: { val: CLIN[sr.cat], sub: sr.cat === 'none' ? 'No submissions noted' : 'Criteria provided, multiple submitters' },
      SNPedia: { val: sm ? sr.rsid : `${sr.rsid}(${sr.geno.replace('/', ';')})`, sub: sm ? 'Summary hidden with your sensitive results' : sr.label },
      Ensembl: { val: sr.cons, sub: t('chr{0} on GRCh37', sr.loc) },
      gnomAD: { val: sr.maf ? t('Minor allele {0}, frequency {1}', sr.maf[0], sr.maf[1]) : 'No built-in figure', sub: sr.maf ? '1000 Genomes, all populations' : 'Look it up for gnomAD data' },
      PharmGKB: { val: sr.cat === 'drug' ? 'Level 1A clinical annotation' : 'No drug annotations', sub: sr.cat === 'drug' ? 'CPIC guideline available' : 'Not a pharmacogene marker' }
    };
    const fetched = t('Fetched {0}', (s.lkTime || {})[sr.rsid] || today());
    const results = ['ClinVar', 'SNPedia', 'Ensembl', 'gnomAD', 'PharmGKB'].map(db => {
      const d = data[db] || {};
      if (d.fail) return { db, failed: lk !== 'retrying', retrying: lk === 'retrying' };
      if (d.live) return { db, ok: true, val: d.val, sub: d.sub, src: fetched, live: true };
      return { db, ok: true, val: builtIn[db].val, sub: builtIn[db].sub, src: d.fallback && db !== 'PharmGKB' && /^rs/.test(sr.rsid) ? 'Built-in note (live source did not answer)' : 'Built-in note' };
    });
    const onLookup = () => { if (offline) return; if (!s.live) this.setState({ ask: sr.rsid }); else this.lookup(sr.rsid); };
    const select = r => this.setState({ sel: r.rsid, xsel: r.fromFile ? r : this.state.xsel, ask: null });
    const onListKey = e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const i = rows.findIndex(r => r.rsid === s.sel), n = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (n) { select(n); setTimeout(() => { const el = document.querySelector(`[data-rs="${n.rsid}"]`); if (el) { el.focus(); } }, 0); }
    };
    const cols = 'grid-template-columns:minmax(0,1.1fr) minmax(0,1.2fr) 60px minmax(0,0.9fr)';
    return html`<section aria-labelledby="h-ex" style="display:flex;flex-direction:column;gap:18px">
      <header style="display:flex;flex-direction:column;gap:10px">
        <h1 id="h-ex" style=${S.h1}>Explorer</h1>
        <p style=${S.lead}>Search markers in your file. Select one to see what it means and, if you choose, check public databases.</p>
      </header>
      <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;justify-content:space-between">
        <label style="flex:1 1 300px;display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600">Search by rsID, gene or chromosome
          <input type="search" value=${s.q} onInput=${e => this.onQuery(e.target.value)} placeholder="rs671, HFE or 19" style="height:46px;padding:0 14px;border:var(--bw) solid var(--ctl);border-radius:var(--rc);background:var(--surface);color:var(--ink);font-family:var(--mono);font-size:14px;font-weight:400;min-width:0" />
          <span style="font-size:12px;font-weight:400;color:var(--muted)" aria-live="polite">${extra.length ? t('{0} of {1} curated markers shown, plus {2} more from your file', cur.length, all.length, extra.length) : t('{0} of {1} curated markers shown', cur.length, all.length)}${s.hasStore ? '' : D.real ? ' ' + t('Reopen the file to search all of it.') : ''}</span>
        </label>
        <button onClick=${() => this.setState({ live: !s.live })} role="switch" aria-checked=${s.live ? 'true' : 'false'} style="min-height:46px;display:flex;align-items:center;gap:10px;padding:0 6px;border:0;background:transparent;font:inherit;font-size:14px;font-weight:500;color:var(--ink);cursor:pointer">
          <span style="width:38px;height:22px;padding:3px;border-radius:var(--rc);background:${s.live ? 'var(--accent)' : 'var(--ctl)'};transition:background .2s"><span class="knob" style="display:block;width:16px;height:16px;border-radius:var(--rc);background:${s.live ? 'var(--onaccent)' : '#ffffff'};transform:${s.live ? 'translateX(calc(var(--kx, 1) * 16px))' : 'translateX(0)'}"></span></span>
          Live database lookups
        </button>
      </div>
      ${offline && html`<div role="status" style="display:flex;gap:10px;padding:12px 14px;border-radius:var(--r);background:var(--l1b);color:var(--l1f);font-size:14px;line-height:1.5"><i class="ph ph-wifi-slash" aria-hidden="true" style="font-size:18px;flex:none"></i>You're offline. Your file and report still work; database lookups need a connection.</div>`}
      <div style="font-size:14px;color:var(--muted)">Terms: <button onClick=${() => this.term('rsid')} aria-expanded=${s.term === 'rsid' ? 'true' : 'false'} style=${S.term}>rsID</button> and <button onClick=${() => this.term('geno')} aria-expanded=${s.term === 'geno' ? 'true' : 'false'} style=${S.term}>genotype</button></div>
      ${s.term === 'rsid' && html`<div style=${S.tip}>An rsID is a reference number for one position in the genome where people commonly differ, like rs671. Every database uses the same numbers.</div>`}
      ${s.term === 'geno' && html`<div style=${S.tip}>Your genotype is the two letters you have at a position, one from each parent. A/G means one parent passed on A and the other passed on G.</div>`}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr));gap:18px;align-items:start">
        <div style="${S.card};overflow:hidden">
          <div aria-hidden="true" style="display:grid;${cols};gap:10px;padding:10px 16px;font-size:12px;font-weight:700;color:var(--muted);border-bottom:var(--row)"><span>rsID</span><span>Position</span><span>Call</span><span>Gene</span></div>
          <div role="listbox" aria-label="Markers" onKeyDown=${onListKey} style="max-height:440px;overflow:auto">
            ${rows.map(r => { const on = r.rsid === sr.rsid; return html`<button data-rs=${r.rsid} onClick=${() => select(r)} role="option" aria-selected=${on ? 'true' : 'false'} tabindex=${on ? '0' : '-1'} style="width:100%;display:grid;${cols};gap:10px;padding:10px 16px;border:0;border-bottom:1px solid var(--line2);background:${on ? 'var(--soft)' : 'transparent'};font-family:var(--mono);font-size:13px;color:var(--ink);text-align:start;cursor:pointer"><span style="overflow:hidden;text-overflow:ellipsis">${r.rsid}</span><span style="color:var(--muted);overflow:hidden;text-overflow:ellipsis">${r.loc}</span><span>${masked(r) ? 'Hidden' : r.geno}</span><span style="overflow:hidden;text-overflow:ellipsis">${r.gene}</span></button>`; })}
            ${rows.length === 0 && html`<div style="padding:32px 16px;text-align:center;font-size:14px;color:var(--muted);line-height:1.6">No markers match "${s.q}".<br />Try an rsID like rs671 or a gene like HFE.</div>`}
          </div>
        </div>
        <div style="${S.card};padding:20px;display:flex;flex-direction:column;gap:14px" aria-live="polite">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-family:var(--mono);font-size:22px;font-weight:500"><span>${sr.rsid}</span><span>${sm ? 'Hidden' : sr.geno}</span></div>
          <p style="margin:0;font-size:15px;line-height:1.55">${sm ? 'This APOE marker is part of a sensitive result you have not chosen to see.' : sr.label}</p>
          ${sm && html`<button onClick=${() => this.go('health', 'risks')} style="${S.btnS};align-self:flex-start;min-height:40px;font-size:13px">Choose whether to see it in Health</button>`}
          <dl style="margin:0;display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px 16px;font-size:13px">
            <dt style="color:var(--muted)">Gene</dt><dd style="margin:0;font-family:var(--mono)">${sr.gene}</dd>
            <dt style="color:var(--muted)">Location</dt><dd style="margin:0;font-family:var(--mono)">chr${sr.loc}, GRCh37</dd>
            <dt style="color:var(--muted)">In this report</dt><dd style="margin:0">${CAT[sr.cat]}</dd>
          </dl>
          <div style="border-top:var(--row);padding-top:14px;display:flex;flex-direction:column;gap:12px">
            <span style="font-size:13px;font-weight:700">Public databases</span>
            ${!lk && s.ask !== sr.rsid && html`
              <button class="press" onClick=${onLookup} disabled=${offline} style="${S.btnP};align-self:flex-start;${offline ? 'opacity:.5;cursor:not-allowed' : ''}"><i class="ph ph-globe-simple" aria-hidden="true"></i>Look up this marker</button>
              <span style="font-size:12px;color:var(--muted);line-height:1.5">Checks ClinVar, SNPedia, Ensembl, gnomAD and PharmGKB. Sends one rsID per request, never your genotype or file.</span>`}
            ${s.ask === sr.rsid && html`<div style="padding:16px;border-radius:var(--r);background:var(--soft);display:flex;flex-direction:column;gap:12px">
              <span style="font-size:15px;font-weight:700">Turn on live lookups?</span>
              <p style="margin:0;font-size:14px;line-height:1.55">LiberateDNA will send ${sr.rsid} to five public databases. Your genotypes stay on this device. You can turn lookups off at any time.</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap"><button onClick=${() => this.lookup(sr.rsid)} style="${S.btnP};min-height:42px">Allow lookups</button><button onClick=${() => this.setState({ ask: null })} style="${S.btnS};min-height:42px">Not now</button></div>
            </div>`}
            ${lk === 'loading' && html`<div role="status" aria-label="Looking up" style="display:flex;flex-direction:column;gap:8px">${[0, 1, 2].map(() => html`<div class="pulse" style="height:48px;border-radius:var(--r);background:var(--surface2)"></div>`)}</div>`}
            ${(lk === 'done' || lk === 'partial' || lk === 'retrying') && html`<div style="display:flex;flex-direction:column">
              ${results.map(x => html`<div style="display:grid;grid-template-columns:84px minmax(0,1fr);gap:12px;padding:10px 0;border-bottom:1px solid var(--line2);font-size:13px">
                <span style="font-weight:700">${DB_LINKS[x.db] && /^rs\d+$/.test(sr.rsid) ? html`<a href=${DB_LINKS[x.db](sr.rsid)} target="_blank" rel="noopener noreferrer" style="color:var(--ink)">${x.db}</a>` : x.db}</span>
                ${x.ok && html`<div style="display:flex;flex-direction:column;gap:2px;min-width:0"><span style="font-family:var(--mono);word-break:break-word">${x.val}</span><span style="color:var(--muted)">${x.sub}</span><span style="color:var(--muted);font-size:12px">${x.src}</span></div>`}
                ${x.failed && html`<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px"><span style="font-weight:600;padding:3px 8px;border-radius:var(--rc);color:var(--l2f);background:var(--l2b)">Couldn't reach ${x.db}. It timed out.</span><button onClick=${() => this.lookup(sr.rsid, true)} style="min-height:34px;padding:0 12px;border:var(--bw) solid var(--ctl);border-radius:var(--rc);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;font-weight:600;cursor:pointer">Retry</button></div>`}
                ${x.retrying && html`<span role="status" style="color:var(--muted)">Retrying ${x.db}</span>`}
              </div>`)}
              <span style="margin-top:10px;font-size:12px;color:var(--muted)">Live rows show the date fetched. Built-in notes come with LiberateDNA and work offline.</span>
            </div>`}
          </div>
        </div>
      </div>
    </section>`;
  }

  /* ---------- Look dialog ---------- */
  viewLook(D) {
    return html`<div>
      <div onClick=${() => this.closeLook()} style="position:absolute;inset:0;z-index:30;background:rgba(0,0,0,.45);backdrop-filter:blur(2px)"></div>
      <div data-look-dialog="1" role="dialog" aria-modal="true" aria-label="Language and look" style="position:absolute;z-index:31;top:64px;inset-inline-end:16px;width:min(340px,calc(100% - 32px));max-height:calc(100% - 80px);overflow:auto;background:var(--surface);color:var(--ink);border:var(--bw) solid var(--line);border-radius:var(--r);box-shadow:0 18px 50px rgba(10,12,14,.22);padding:16px;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:16px;font-weight:700">Language</span><button onClick=${() => this.closeLook()} aria-label="Close" style="width:40px;height:40px;border:0;background:transparent;color:var(--ink);font-size:18px;cursor:pointer"><i class="ph ph-x" aria-hidden="true"></i></button></div>
        ${this.langButtons()}
        <span style="font-size:16px;font-weight:700;padding-top:8px">Look</span>
        ${this.themeButtons(true)}
        <span style="font-size:12px;color:var(--muted)">Remembered on this device. Your place in the report stays the same.</span>
      </div>
    </div>`;
  }

  /* ---------- Doctor summary ---------- */
  viewReport(D) {
    const s = this.state;
    const repHealth = D.health.filter(h => h.shown && (h.level >= 1 || h.sens));
    const repDrugs = D.drugs.filter(d => d.level !== 0);
    const row = 'padding:8px 0;border-top:1px solid #dfe2e6;font-size:13px;line-height:1.5';
    return html`<div data-print-root="1" role="dialog" aria-modal="true" aria-label="Doctor summary" style="position:absolute;inset:0;z-index:40;background:var(--bg);overflow:auto">
      <div data-noprint="1" style="position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 16px;background:var(--surface);border-bottom:var(--bw) solid var(--line);flex-wrap:wrap">
        <span style="font-size:15px;font-weight:700">Doctor summary</span>
        <div style="display:flex;gap:8px"><button onClick=${() => window.print()} style="${S.btnP};min-height:42px"><i class="ph ph-printer" aria-hidden="true"></i>Print or save PDF</button><button onClick=${() => this.closeReport()} style="${S.btnS};min-height:42px">Close</button></div>
      </div>
      <article style="max-width:780px;margin:24px auto;padding:clamp(24px,5vw,48px);background:#ffffff;color:#16181b;font-family:'IBM Plex Sans',system-ui,sans-serif;display:flex;flex-direction:column;gap:22px;box-shadow:0 2px 12px rgba(10,12,14,.08)">
        <div style="display:flex;flex-direction:column;gap:6px;padding-bottom:16px;border-bottom:2px solid #16181b">
          <h1 style="margin:0;font-size:24px;font-weight:600">Genetic summary for your clinician</h1>
          <span style="font-size:13px;color:#4a5058">Consumer genotyping data (${D.chipLabel}, ${D.ftypeLabel}). Generated ${today()} by LiberateDNA. Call rate ${D.callRate}.</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <h2 style="margin:0;font-size:16px;font-weight:600">Health findings</h2>
          ${repHealth.length ? repHealth.map(x => html`<div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:4px 16px;${row}"><span style="font-weight:600">${x.title}</span><span style="font-family:'IBM Plex Mono',monospace;font-size:12px">${x.markers}</span><span>${x.result}</span><span style="color:#4a5058">${x.next}</span></div>`) : html`<span style="font-size:13px;color:#4a5058">No elevated findings among the markers checked.</span>`}
          ${D.hiddenH.length > 0 && html`<span style="font-size:13px;color:#4a5058">Not included: ${D.hiddenH.map(h => h.short).join(', ')}. The user chose not to view these results.</span>`}
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <h2 style="margin:0;font-size:16px;font-weight:600">Carrier status</h2>
          ${D.carriers.map(x => html`<div style=${row}><b>${x.cond}</b>: ${x.affected ? 'two copies' : 'one copy'} of ${x.gene} ${x.variant} (${x.rsid} ${x.geno}). Rare finding; clinical confirmation recommended.</div>`)}
          <span style="font-size:13px;color:#4a5058">${D.carriers.length ? t('{0} other conditions tested: not detected.', D.carrier.length - D.carriers.length) : t('None detected in {0} conditions tested.', D.carrier.length)}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <h2 style="margin:0;font-size:16px;font-weight:600">Pharmacogenomics</h2>
          ${repDrugs.map(x => html`<div style="display:grid;grid-template-columns:130px minmax(0,1fr);gap:4px 16px;${row}"><span style="font-family:'IBM Plex Mono',monospace;font-size:12px">${x.gene} ${x.diplo}</span><span><b>${x.pheno}</b>. ${x.drugs}. ${x.note}</span></div>`)}
        </div>
        <p style="margin:0;font-size:12px;line-height:1.6;color:#4a5058;border-top:2px solid #16181b;padding-top:14px">Array genotyping does not detect most rare variants, copy-number changes (including CYP2D6) or structural variants, and rare positive calls have a high false-positive rate. Findings should be confirmed with clinical-grade testing before medical decisions.</p>
      </article>
    </div>`;
  }
}

render(html`<${LiberateDNA} />`, document.getElementById('app'));
