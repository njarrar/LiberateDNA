// Language checks: switching, right-to-left layout, leftover English, loading a custom file.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const U = 'http://localhost:8765/';
const un = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// English strings that the given language translates differently (names kept as they are do not count)
const changed = L => [...fs.readFileSync(path.join(__dirname, '..', 'lang', L + '.xml'), 'utf8').matchAll(/<source>([\s\S]*?)<\/source>\s*<translation>([\s\S]*?)<\/translation>/g)].filter(m => m[2].trim() && un(m[2]).trim() !== un(m[1]).trim()).map(m => un(m[1]));
let en = [];
const check = (name, ok, extra) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !extra ? '' : ' ' + extra)); if (!ok) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  // English text that has an entry but was left untranslated on screen
  const leftovers = () => p.evaluate(en => {
    const out = [], w = document.createTreeWalker(document.querySelector('[data-locus-root]'), NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) { const s = n.data.replace(/\s+/g, ' ').trim(); if (s.length > 2 && en.includes(s) && /[a-z]{3}/.test(s) && n.parentElement.closest('bdi,[translate=no]') == null) out.push(s); }
    return [...new Set(out)];
  }, en);
  await p.goto(U + '?start=upload');
  await p.click('button[lang=ar]'); await p.waitForTimeout(200);
  check('switch to Arabic sets rtl', await p.evaluate(() => document.documentElement.dir === 'rtl' && document.querySelector('[data-locus-root]').dir === 'rtl'));
  check('Arabic heading', /استكشف/.test(await p.innerText('h1')));
  await p.reload(); await p.waitForTimeout(200);
  check('Arabic remembered after reload', await p.evaluate(() => document.documentElement.lang === 'ar'));
  await p.click('button[lang=fr]'); await p.waitForTimeout(200);
  check('switch to French sets ltr', await p.evaluate(() => document.documentElement.dir === 'ltr' && document.documentElement.lang === 'fr'));
  await p.click('button[lang=en]');
  check('back to English', /Explore your DNA/.test(await p.innerText('h1')));
  for (const L of ['ar', 'fr']) {
    en = changed(L);
    const left = new Set();
    for (const q of ['?start=upload', '?demo=password', '?demo=reads', '?demo=format', '?demo=corrupt']) { await p.goto(U + q + '&lang=' + L); await p.waitForTimeout(150); (await leftovers()).forEach(x => left.add(x)); }
    for (const sample of ['phased', 'full', 'xx']) for (const tab of ['overview', 'heritage', 'health', 'traits', 'explorer']) {
      await p.goto(`${U}?start=dashboard&sample=${sample}&tab=${tab}&lang=${L}`); await p.waitForTimeout(150);
      for (const el of await p.$$('[data-locus-root] button[aria-expanded="false"]')) await el.click().catch(() => {});
      (await leftovers()).forEach(x => left.add(x));
      if (tab === 'health') for (let i = 1; i < 3; i++) { const subs = await p.$$('[role=tablist] button, [aria-label] > button[aria-pressed]'); }
    }
    await p.setInputFiles('#locus-file', path.join(__dirname, 'files', 'genome_Full_mix.txt')).catch(() => {});
    await p.goto(`${U}?start=upload&lang=${L}`); await p.setInputFiles('#locus-file', path.join(__dirname, 'files', 'genome_Full_mix.txt'));
    await p.waitForSelector('nav button[aria-current="page"]', { timeout: 30000 });
    for (const i of [0, 1, 2, 3, 4]) { const nb = (await p.$$('nav[aria-label] button'))[i]; if (nb) { await nb.click(); await p.waitForTimeout(200); (await leftovers()).forEach(x => left.add(x)); } }
    const lb = (await leftovers()).length;
    check(`${L}: no English left where a translation exists`, left.size === 0, JSON.stringify([...left].slice(0, 12)));
    // doctor summary
    await p.goto(`${U}?start=dashboard&sample=full&lang=${L}`);
    const ds = await p.$('aside button:has(.ph-file-text)'); if (ds) { await ds.click(); await p.waitForTimeout(300); }
    const dl = await leftovers(); check(`${L}: doctor summary translated`, dl.length === 0, JSON.stringify(dl.slice(0, 8)));
  }
  // right-to-left layout: sidebar on the right, no overflow at phone width
  await p.goto(U + '?start=dashboard&sample=full&lang=ar');
  const side = await p.evaluate(() => { const a = document.querySelector('aside'); return a && a.getBoundingClientRect().left > window.innerWidth / 2; });
  check('ar: sidebar sits on the right', side);
  await p.setViewportSize({ width: 390, height: 844 });
  for (const tab of ['overview', 'heritage', 'health', 'traits', 'explorer']) {
    await p.goto(`${U}?start=dashboard&sample=full&tab=${tab}&lang=ar`); await p.waitForTimeout(200);
    const ov = await p.evaluate(() => { const m = document.querySelector('[data-main]'); return m ? m.scrollWidth > m.clientWidth + 1 : false; });
    check(`ar phone ${tab}: no sideways scroll`, !ov);
    if (tab === 'heritage') await p.screenshot({ path: path.join(__dirname, '..', 'shots', 'ar-m-heritage.png') });
  }
  await p.setViewportSize({ width: 1280, height: 1000 });
  // chromosome painting keeps left-to-right positions
  await p.goto(U + '?start=dashboard&sample=phased&tab=heritage&lang=ar');
  check('ar: painting tracks stay left to right', await p.evaluate(() => [...document.querySelectorAll('[dir=ltr]')].length > 0));
  // a contributor's own file
  const xml = '<?xml version="1.0" encoding="UTF-8"?><language code="eo" name="Esperanto" english-name="Esperanto" dir="ltr"><entry><source>Explore your DNA without sharing it</source><translation>Esploru vian DNA sen dividi ĝin</translation></entry></language>';
  const f = path.join(require('os').tmpdir(), 'eo.xml'); fs.writeFileSync(f, xml);
  await p.goto(U + '?start=upload&lang=en'); await p.setInputFiles('input[accept*=".xml"]', f); await p.waitForTimeout(300);
  check('custom translation file loads', /Esploru/.test(await p.innerText('h1')) && !!(await p.$('button[lang=eo]')));
  fs.writeFileSync(f, '<nope/>'); await p.setInputFiles('input[accept*=".xml"]', f); await p.waitForTimeout(300);
  check('bad translation file shows an error', !!(await p.$('[role=alert]')));
  await p.evaluate(() => localStorage.clear());
  check('no page errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await b.close();
})();
