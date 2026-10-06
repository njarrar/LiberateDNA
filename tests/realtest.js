const { chromium } = require('playwright');
const TF = 'files/';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 1800 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const up = async f => { await p.goto('http://localhost:8765/?theme=lab'); await p.setInputFiles('#locus-file', TF + f); };
  const txt = async () => (await p.innerText('[data-locus-root]')).replace(/\s+/g, ' ');
  // 1. real zip
  await up('genome_Full_test.zip');
  await p.waitForSelector('text=What was in your file', { timeout: 20000 });
  let t = await txt();
  console.log('ZIP overview:', /Genotypes read ([\d,]+)/.exec(t)[1], /Call rate ([\d.]+%)/.exec(t)[1], /Inferred sex (\w+)/.exec(t)[1], /File type (\w+)/.exec(t)[1], /Chip and build (\S+)/.exec(t)[1]);
  await p.screenshot({ path: '../shots/real-overview.png' });
  await p.click('nav >> text=Health'); await p.waitForTimeout(200);
  await p.screenshot({ path: '../shots/real-health.png' });
  await p.click('text=Show this result >> nth=0'); await p.waitForTimeout(200);
  t = await txt(); console.log('APOE:', /Alzheimer's disease APOE, ([^]+?) (Elevated|Typical)/.exec(t)?.[1]);
  await p.click('text=Show this result'); await p.waitForTimeout(200);
  t = await txt(); console.log('BRCA:', /BRCA1, BRCA2, ([^]+?) (Possible variant|Not detected)/.exec(t)?.[0]);
  await p.click('text=Scan my file'); await p.waitForTimeout(2600);
  await p.screenshot({ path: '../shots/real-health2.png' });
  await p.click('text=Drug response'); await p.waitForTimeout(200); await p.screenshot({ path: '../shots/real-drugs.png' });
  await p.click('text=Carrier status'); await p.waitForTimeout(200); await p.screenshot({ path: '../shots/real-carrier.png' });
  await p.click('nav >> text=Traits'); await p.waitForTimeout(200); await p.screenshot({ path: '../shots/real-traits.png' });
  await p.click('nav >> text=Heritage'); await p.waitForTimeout(200); await p.screenshot({ path: '../shots/real-heritage.png' });
  await p.click('nav >> text=Explorer'); await p.fill('input[type=search]', 'rs10012'); await p.waitForTimeout(600);
  t = await txt(); console.log('Explorer:', /\d+ of \d+ curated markers shown[^.]*/.exec(t)[0]);
  await p.screenshot({ path: '../shots/real-explorer.png' });
  // 2. txt phased XX
  await up('phased_genotype_test.txt'); await p.waitForSelector('text=What was in your file', { timeout: 20000 });
  t = await txt(); console.log('Phased txt:', /Inferred sex (\w+)/.exec(t)[1], /File type (\w+)/.exec(t)[1], /Genotypes read ([\d,]+) (.+?) Called/.exec(t).slice(1).join(' / '));
  // 3. password
  await up('genome_Full_secret.zip'); await p.waitForSelector('text=This zip is password-protected');
  await p.click('text=Unlock and read'); console.log('empty pw msg:', await p.isVisible('text=Enter the password to continue'));
  await p.fill('input[type=password]', 'wrong'); await p.click('text=Unlock and read'); await p.waitForSelector("text=That password didn't open the file", { timeout: 15000 }); console.log('wrong pw ok');
  await p.fill('input[type=password]', 'hunter2'); await p.click('text=Unlock and read'); await p.waitForSelector('text=What was in your file', { timeout: 20000 }); console.log('right pw ok');
  // 4. vendor, corrupt, empty
  await up('dna_export.zip'); await p.waitForSelector('[role=alert]'); console.log('vendor:', (await p.innerText('[role=alert]')).split('\n')[0]);
  await up('genome_Full_cut.txt'); await p.waitForSelector('[role=alert]'); console.log('cut:', (await p.innerText('[role=alert]')).split('\n')[0]);
  await up('genome_Full_empty.zip'); await p.waitForSelector('[role=alert]'); console.log('empty:', (await p.innerText('[role=alert]')).split('\n')[0]);
  // 5. saved report
  await p.goto('http://localhost:8765/'); console.log('saved banner:', await p.isVisible('text=Saved on this device'));
  await p.click('text=Open report'); await p.waitForSelector('text=What was in your file'); t = await txt(); console.log('reopened:', /Genotypes read ([\d,]+)/.exec(t)[1]);
  // 6. attach phased to full sample
  await p.goto('http://localhost:8765/?start=dashboard&sample=full&tab=heritage'); await p.click('text=Add phased file').catch(()=>{});
  await p.setInputFiles('#locus-file', TF + 'phased_genotype_test.zip'); await p.waitForSelector('text=Phased file added', { timeout: 15000 }); console.log('attach ok');
  await p.click('.seg >> nth=3'); console.log('seg callout:', (await txt()).match(/Chromosome 1, copy \d: [^.]+\.\d? ?[^.]*\./)?.[0]);
  console.log('errors:', errs);
  await b.close();
})();
