// Checks the fixes from the source review on generated files (see testfiles/make_me.py).
const { chromium } = require('playwright');
const TF = 'files/';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 1800 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const txt = async () => (await p.innerText('[data-locus-root]')).replace(/\s+/g, ' ');
  const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) process.exitCode = 1; };
  for (const f of ['genome_Full_me.txt', 'genome_Full_me.csv']) {
    await p.goto('http://localhost:8765/?theme=lab'); await p.setInputFiles('#locus-file', TF + f);
    await p.waitForSelector('text=What was in your file', { timeout: 20000 });
    let t = await txt();
    check(f + ' sex XY', /Inferred sex XY/.test(t));
    check(f + ' hero has no example percentages', !/Mostly European/.test(t) && /Maternal line J1/.test(t) && /Paternal line J-M267 \(J1\)/.test(t));
    await p.click('nav >> text=Heritage'); await p.waitForTimeout(200); t = await txt();
    check(f + ' heritage hides example by default', /not worked out from your file yet/.test(t) && !/Chromosome painting/.test(t));
    if (f.endsWith('.txt')) await p.screenshot({ path: '../shots/me-heritage.png' });
    await p.click('text=Show the example layout'); await p.waitForTimeout(150); t = await txt();
    check(f + ' example opens on request', /Chromosome painting/.test(t) && /Example numbers below/.test(t));
    await p.click('nav >> text=Traits'); await p.waitForTimeout(150); t = await txt();
    check(f + ' Arabian lactase counted', /Lactose tolerance .*?Likely tolerant as an adult/.test(t));
    await p.click('nav >> text=Health'); await p.waitForTimeout(150); t = await txt();
    check(f + ' G6PD shown', /G6PD deficiency \(favism\)/.test(t) && /G6PD A-, on your one X/.test(t));
    await p.click('text=Drug response'); await p.waitForTimeout(150); t = await txt();
    check(f + ' CYP2C19 *3', /\*1\/\*3/.test(t));
    await p.click('text=Carrier status'); await p.waitForTimeout(150); t = await txt();
    check(f + ' MEFV M694V carrier', /Familial Mediterranean fever.*?M694V/.test(t));
  }
  // single-dash Y rows in an XX file must not make it XY
  await p.goto('http://localhost:8765/?theme=lab'); await p.setInputFiles('#locus-file', TF + 'genome_Full_xxdash.txt');
  await p.waitForSelector('text=What was in your file', { timeout: 20000 });
  let t = await txt();
  check('dash Y no-calls give XX', /Inferred sex XX/.test(t));
  check('mt H without 3010A is H, not H1c3', /Maternal line H /.test(t + ' ') && !/H1c3/.test(t));
  // sample keeps R-U152 and H1; BRCA hidden in Explorer search until shown
  await p.goto('http://localhost:8765/?start=dashboard&sample=full&tab=heritage'); t = await txt();
  check('sample lineage', /R-U152/.test(t) && /\bH1\b/.test(t));
  await p.goto('http://localhost:8765/?theme=lab'); await p.setInputFiles('#locus-file', TF + 'genome_Full_test.zip');
  await p.waitForSelector('text=What was in your file', { timeout: 20000 });
  await p.click('nav >> text=Explorer'); await p.fill('input[type=search]', 'i4000377'); await p.waitForTimeout(600);
  await p.click('[data-rs=i4000377]'); await p.waitForTimeout(150); t = await txt();
  check('BRCA masked in Explorer', /i4000377 Hidden/.test(t));
  await p.route(/myvariant|ensembl|snpedia/, r => r.abort());
  await p.fill('input[type=search]', 'rs3918290'); await p.waitForTimeout(400); await p.click('[data-rs=rs3918290]');
  await p.click('role=switch'); await p.click('text=Look up this marker'); await p.waitForSelector('text=PharmGKB'); await p.waitForTimeout(300); t = await txt();
  check('DPYD frequency is real', /Minor allele T, frequency 0.003/.test(t));
  // real heritage: a held-out Palestinian man, mt J1c, Y J-P58
  await p.goto('http://localhost:8765/?theme=lab'); await p.setInputFiles('#locus-file', TF + 'genome_Full_her.txt');
  await p.waitForSelector('text=What was in your file', { timeout: 30000 });
  t = await txt();
  check('her overview names Middle East', /Mostly Middle Eastern/.test(t));
  await p.click('nav >> text=Heritage'); await p.waitForTimeout(300); t = await txt();
  check('her closest group shown', /Closest reference group/.test(t) && /Palestinian|Druze|Bedouin/.test(t));
  check('her deep lines', /J1c/.test(t) && /J-P58/.test(t));
  check('her painting computed', /Chromosome painting/.test(t) && !/Example numbers below/.test(t));
  await p.screenshot({ path: '../shots/her-heritage.png', fullPage: true });
  console.log('errors:', errs);
  check('no page errors', errs.length === 0);
  await b.close();
})();
