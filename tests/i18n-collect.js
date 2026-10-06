// Visits every screen with ?i18n=collect and writes all English text the app showed to
// lang/en.xml. Existing translation files get new entries added (empty) and stale ones
// kept but marked. Serve the repo root on port 8765 first.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), U = 'http://localhost:8765/?i18n=collect&';
const seen = new Set();
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  const cors = { 'access-control-allow-origin': '*' };
  await ctx.route('https://myvariant.info/**', r => r.fulfill({ headers: cors, json: { total: 1, hits: [{ _id: 'x', clinvar: { rcv: [{ clinical_significance: 'Pathogenic' }] }, gnomad_genome: { af: { af: 0.03 } } }] } }));
  await ctx.route('https://rest.ensembl.org/**', r => r.fulfill({ headers: cors, json: { name: 'rs1', MAF: 0.01, minor_allele: 'A', most_severe_consequence: 'missense_variant' } }));
  await ctx.route('https://grch37.rest.ensembl.org/**', r => r.fulfill({ headers: cors, json: { name: 'rs1', MAF: 0.01, minor_allele: 'A', most_severe_consequence: 'missense_variant' } }));
  await ctx.route('https://bots.snpedia.com/**', r => r.fulfill({ headers: cors, json: { query: { pages: { '1': { pageid: 1, title: 'Rs1' } } } } }));
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const grab = async () => { try { (await p.evaluate(() => Array.from(self.I18N.collect()))).forEach(k => seen.add(k)); } catch (e) {} };
  const open = async q => { await grab(); await p.goto(U + q); await p.waitForTimeout(500); };
  const clickAll = async sel => { for (let n = 0; n < 60; n++) { const el = await p.$(sel); if (!el) break; try { await el.click({ timeout: 1000 }); } catch (e) { break; } await p.waitForTimeout(60); } };
  const expandAll = async () => {
    await clickAll('[data-locus-root] button[aria-expanded="false"]:visible');
    for (const txt of ['Show this result', 'Show the example layout', 'Show']) { const els = await p.$$(`button:has-text("${txt}")`); for (const e of els) { try { await e.click({ timeout: 800 }); } catch (x) {} } }
    await p.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true)); await p.waitForTimeout(100);
  };
  const tabs = ['overview', 'heritage', 'health', 'traits', 'explorer'];
  // upload page and its states
  for (const d of ['', 'demo=password', 'demo=vendor', 'demo=corrupt', 'demo=offline']) await open('start=upload&' + d);
  await p.goto(U + 'demo=password'); await p.click('text=Choose file').catch(() => {});
  // dashboards
  for (const sample of ['phased', 'full', 'xx']) for (const demo of ['', 'oldchip']) for (const tab of tabs) {
    await open(`start=dashboard&sample=${sample}&tab=${tab}&${demo ? 'demo=' + demo : ''}`);
    if (tab === 'health') for (const sub of ['Carrier status', 'Drug response', 'Health risks']) { await p.click(`text=${sub}`).catch(() => {}); await expandAll(); await grab(); }
    else await expandAll();
    if (tab === 'heritage') { await p.click('text=Broad regions').catch(() => {}); await grab(); const seg = await p.$('.seg'); if (seg) { await seg.click().catch(() => {}); await grab(); } }
  }
  // explorer lookups
  for (const demo of ['', 'lookupfail', 'offline']) {
    await open('start=dashboard&sample=full&tab=explorer&' + (demo ? 'demo=' + demo : ''));
    for (const q of ['rs1800562', 'rs3918290', 'i4000377', 'zzz', 'rs4988235']) {
      await p.fill('input[type=search]', q); await p.waitForTimeout(300); await grab();
      const b2 = await p.$(`[data-rs="${q}"]`); if (b2) { await b2.click(); await p.waitForTimeout(200); }
      await grab();
    }
    await p.click('role=switch').catch(() => {}); await p.click('text=Look up this marker').catch(() => {}); await p.waitForTimeout(1500); await grab();
    await clickAll('button:has-text("Try again"):visible');
  }
  // look dialog, doctor summary, scan, mobile
  await open('start=dashboard&sample=full');
  await p.click('text=Look: ').catch(() => {}); await grab(); await p.keyboard.press('Escape');
  await p.click('text=Doctor summary').catch(() => {}); await p.waitForTimeout(300); await grab(); await p.keyboard.press('Escape');
  await open('start=dashboard&sample=full&tab=health'); await p.click('text=Scan all').catch(() => {}); await p.waitForTimeout(3500); await expandAll(); await grab();
  for (const th of ['poster', 'warm']) await open(`start=dashboard&sample=full&theme=${th}`);
  await p.setViewportSize({ width: 390, height: 844 });
  for (const tab of tabs) await open(`start=dashboard&sample=phased&tab=${tab}`);
  await p.setViewportSize({ width: 1280, height: 1000 });
  // real files
  for (const f of ['genome_Full_her.txt', 'genome_Full_me.txt', 'genome_Full_xxdash.txt', 'genome_Full_test.zip', 'genome_Full_cut.txt', 'genome_Full_empty.zip', 'dna_export.zip', 'genome_Full_secret.zip']) {
    await open('start=upload'); await p.setInputFiles('#locus-file', path.join(__dirname, 'files', f));
    await p.waitForTimeout(400); await grab();
    const ok = await p.waitForSelector('text=What was in your file', { timeout: 30000 }).catch(() => null);
    if (f.includes('secret')) { await p.fill('input[type=password]', 'wrong').catch(() => {}); await p.keyboard.press('Enter'); await p.waitForTimeout(800); await grab(); await p.fill('input[type=password]', 'hunter2').catch(() => {}); await p.keyboard.press('Enter'); await p.waitForSelector('text=What was in your file', { timeout: 30000 }).catch(() => {}); }
    if (!ok && !f.includes('secret')) { await grab(); continue; }
    for (const tab of tabs) { await p.click(`nav >> text=${tab[0].toUpperCase() + tab.slice(1)}`).catch(() => {}); await p.waitForTimeout(200); await expandAll(); await grab(); }
    if (f === 'genome_Full_test.zip') { await p.click('nav >> text=Heritage'); const add = await p.$('text=Add phased file'); if (add) { const [fc] = await Promise.all([p.waitForEvent('filechooser'), add.click()]); await fc.setFiles(path.join(__dirname, 'files', 'phased_genotype_test.zip')); await p.waitForTimeout(3000); await expandAll(); await grab(); } }
  }
  await open('start=upload'); await grab();
  await b.close();
  // static t('...') keys from the source
  for (const f of ['app.js', 'data.js', 'i18n.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
    for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) seen.add(m[1].replace(/\\'/g, "'").replace(/\s+/g, ' ').trim());
  }
  // prose and labels written in the data files, including ones this run did not reach
  const data = fs.readFileSync(path.join(ROOT, 'src', 'data.js'), 'utf8');
  for (const m of data.matchAll(/'((?:[^'\\\n]|\\.){4,})'/g)) { const v = m[1].replace(/\\'/g, "'"); if (/[A-Za-z]{2,} [A-Za-z]{2,}/.test(v) && !/=>|var\(|\dpx|^https?:/.test(v)) seen.add(v.replace(/\s+/g, ' ').trim()); }
  for (const m of data.matchAll(/eff: '([^']+)'/g)) seen.add(m[1]);
  const ref = fs.readFileSync(path.join(ROOT, 'src', 'ref.js'), 'utf8').split('\n').find(l => l.startsWith('const REF_PANEL'));
  for (const m of ref.matchAll(/"(?:name|sub)":"([^"]+)"/g)) seen.add(m[1]);
  const skip = k => /^(rs|i)\d+$/i.test(k) || /\.(zip|txt|csv|xml)$/i.test(k) || /^[A-Z0-9*\/\-+.,: ]+$/.test(k) || !/[a-z]{2}/.test(k) || /^https?:/.test(k) || /^[A-Za-z]+\d[\w-]*$/.test(k) || k.length > 2000;
  // Keep only text written in the source: values computed at run time are left out, since
  // their pieces are translated through their own patterns.
  const SRC = ['app.js', 'data.js', 'i18n.js', 'ref.js'].map(f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\s+/g, ' ');
  const inSrc = k => k.split(/\{\d+\}/).map(x => x.trim()).filter(Boolean).every(x => SRC.includes(x));
  if (process.env.SEEN) fs.writeFileSync(process.env.SEEN, JSON.stringify([...seen]));
  const keys = [...seen].filter(k => !skip(k) && inSrc(k)).sort((a, b) => a.localeCompare(b));
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const write = (file, head, tr) => fs.writeFileSync(file, '<?xml version="1.0" encoding="UTF-8"?>\n<!-- LiberateDNA language file. How to add or fix a translation: lang/README.md -->\n' + head + '\n' + keys.map(k => `  <entry>\n    <source>${esc(k)}</source>\n    <translation>${esc(tr(k) || '')}</translation>\n  </entry>`).join('\n') + '\n</language>\n');
  write(path.join(ROOT, 'lang', 'en.xml'), '<language code="en" name="English" english-name="English" dir="ltr" locale="en-US">', () => '');
  // keep other files in step: same entries, existing translations kept
  for (const f of fs.readdirSync(path.join(ROOT, 'lang')).filter(f => f.endsWith('.xml') && f !== 'en.xml')) {
    const x = fs.readFileSync(path.join(ROOT, 'lang', f), 'utf8'), head = x.match(/<language\b[^>]*>/)[0], old = new Map();
    const un = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    for (const m of x.matchAll(/<source>([\s\S]*?)<\/source>\s*<translation>([\s\S]*?)<\/translation>/g)) old.set(un(m[1]).replace(/\s+/g, ' ').trim(), un(m[2]).trim());
    write(path.join(ROOT, 'lang', f), head, k => old.get(k));
    const miss = keys.filter(k => !old.get(k)).length;
    console.log(f, 'missing', miss);
  }
  console.log('entries', keys.length, 'page errors', errs.length, errs.slice(0, 3));
})();
