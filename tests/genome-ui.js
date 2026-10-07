/* Browser check of the whole-genome cards, using files from node tests/genome.js.
   Serve the repository root on port 8765, then run from inside tests/. */
const { chromium } = require('playwright');
const G = '../shots/genome/';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 1600 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const txt = async () => (await p.innerText('[data-locus-root]')).replace(/\s+/g, ' ');
  const open = async f => { await p.goto('http://localhost:8765/?theme=lab'); await p.setInputFiles('#locus-file', G + f); await p.waitForSelector('text=What was in your file', { timeout: 120000 }); await p.click('nav >> text=Heritage'); await p.waitForTimeout(300); };
  const fails = []; const check = (ok, msg) => { console.log(ok ? 'PASS' : 'FAIL', msg); if (!ok) fails.push(msg); };

  await open('genome_cousins.txt');
  let t = await txt();
  check(/second cousins|first cousins/.test(t) && /Matching stretches/.test(t), 'cousin parents: ' + (/Your parents[^.]+\./.exec(t) || ['no verdict'])[0]);
  const el = await p.$('h2:has-text("Matching stretches")'); await el.scrollIntoViewIfNeeded(); await p.screenshot({ path: '../shots/genome-roh.png' });

  await open('genome_mom.txt');
  await p.click('text=Add their file');
  await p.setInputFiles('#locus-file', G + 'genome_kid.txt');
  await p.waitForSelector('text=Most likely relationship', { timeout: 120000 });
  t = await txt();
  check(/Parent and child/.test(t), 'compare: ' + (/Most likely relationship (.+?) DNA shared/.exec(t) || [, '?'])[1]);
  check(/Recessive conditions you both carry/.test(t), 'carrier match section shown');
  await (await p.$('h2:has-text("Compare with")')).scrollIntoViewIfNeeded(); await p.screenshot({ path: '../shots/genome-compare.png' });

  await open('genome_mix.txt');
  await p.click('text=Add phased file');
  await p.setInputFiles('#locus-file', G + 'phased_genotype_mix.txt');
  await p.waitForSelector('text=Each copy is now painted on its own', { timeout: 120000 });
  t = await txt();
  check(/each copy is painted on its own/.test(t), 'phased file repaints each copy');
  await (await p.$('h2:has-text("Chromosome painting")')).scrollIntoViewIfNeeded(); await p.screenshot({ path: '../shots/genome-phased.png' });
  check(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
