/* Retakes the README screenshots in docs/screenshots from the made-up person in
   files/genome_Full_mix.txt, so no real DNA appears in them. Serve the repository
   root on port 8765, then run from inside tests/: node screens.js */
const { chromium } = require('playwright');
const path = require('path');
const U = 'http://localhost:8765/', F = path.join(__dirname, 'files', 'genome_Full_mix.txt'), OUT = '../docs/screenshots/';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [];
  const page = async (lang, mobile) => {
    const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    p.open = async () => { await p.goto(`${U}?theme=lab&lang=${lang}`); await p.setInputFiles('#locus-file', F); await p.waitForSelector('[data-locus-root] h1', { timeout: 120000 }); await p.waitForTimeout(600); };
    const NAV = ['overview', 'heritage', 'health', 'traits', 'explorer'];
    p.tab = async t => { await p.locator('nav button').nth(NAV.indexOf(t)).click(); await p.waitForTimeout(900); await p.evaluate(() => window.scrollTo(0, 0)); };
    p.at = async sel => { await p.evaluate(s => { const el = [...document.querySelectorAll('h2')].find(h => h.textContent.includes(s)); if (el) el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -24); }, sel); await p.waitForTimeout(300); };
    p.shot = async name => { await p.screenshot({ path: OUT + name }); console.log('wrote', name); };
    return p;
  };
  // Home pages show no DNA.
  let p = await page('en'); await p.goto(`${U}?theme=lab&lang=en&start=upload`); await p.waitForTimeout(600); await p.shot('home.png');
  await p.goto(`${U}?theme=lab&lang=ar&start=upload`); await p.waitForTimeout(600); await p.shot('arabic-home.png');
  // Desktop pages from the made-up file.
  await p.open(); await p.shot('overview.png');
  await p.tab('heritage'); await p.shot('heritage.png');
  await p.at('Chromosome painting'); await p.shot('painting.png');
  await p.at('Maternal and paternal lines'); await p.shot('lineage.png');
  await p.tab('health'); await p.shot('health.png');
  await p.tab('traits'); await p.shot('traits.png');
  await p.context().close();
  p = await page('ar'); await p.open(); await p.tab('heritage'); await p.shot('arabic-heritage.png');
  await p.context().close();
  // Phone.
  p = await page('en', true); await p.goto(`${U}?theme=lab&lang=en&start=upload`); await p.waitForTimeout(600); await p.shot('mobile-home.png');
  await p.open(); await p.tab('heritage'); await p.shot('mobile-heritage.png');
  await p.context().close();
  p = await page('ar', true); await p.open(); await p.tab('health');
  await p.locator('button:has(i.ph-palette)').first().click(); await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + 'arabic-mobile-menu.png', scale: 'css' }); console.log('wrote arabic-mobile-menu.png');
  console.log(errs.length ? 'page errors: ' + errs.join(' | ') : 'no page errors');
  await b.close();
})();
