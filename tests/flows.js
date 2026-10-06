const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/?theme=lab&start=dashboard&tab=explorer');
  await p.fill('input[type=search]', 'HFE'); await p.click('text=rs1800562');
  await p.click('text=Look up this marker'); console.log('consent:', await p.isVisible('text=Turn on live lookups?'));
  await p.click('text=Allow lookups'); await p.waitForSelector('text=PharmGKB', { timeout: 15000 });
  console.log((await p.innerText('[aria-live=polite] >> nth=1')).replace(/\n+/g,' | ').slice(0, 700));
  await p.screenshot({ path: '../shots/flow-lookup.png' });
  // look switch keeps state
  await p.click('text=Look: Lab'); await p.keyboard.press('Escape'); console.log('esc closes:', !(await p.isVisible('[data-look-dialog]')));
  await p.click('text=Look: Lab'); await p.click('[data-look-dialog] >> text=Poster');
  console.log('after switch: q=', await p.inputValue('input[type=search]'), 'stored theme=', await p.evaluate(() => localStorage.getItem('locus-theme')), 'lookup still shown:', await p.isVisible('text=PharmGKB'));
  await p.screenshot({ path: '../shots/flow-poster-explorer.png' });
  // doctor summary + pdf
  await p.click('text=Doctor summary'); await p.waitForSelector('text=Genetic summary for your clinician');
  await p.screenshot({ path: '../shots/flow-report.png' });
  await p.emulateMedia({ media: 'print' }); await p.pdf({ path: '../shots/report.pdf' }); await p.emulateMedia({ media: 'screen' });
  // keyboard: tab focus visible
  await p.keyboard.press('Escape');
  await p.goto('http://localhost:8765/?theme=warm&start=dashboard&demo=oldchip&sample=xx');
  const t = (await p.innerText('[data-locus-root]')).replace(/\s+/g,' ');
  console.log('oldchip:', t.includes('Older chip detected'), '| xx:', /Genotypes read ([\d,]+) (.*?) Called/.exec(t).slice(1).join(' '));
  await p.goto('http://localhost:8765/?theme=lab&start=dashboard&tab=health&sub=drugs&demo=oldchip'); console.log('v4 drugs not on chip:', (await p.locator('text=Not on your chip').count()));
  await p.goto('http://localhost:8765/?start=dashboard&tab=explorer&demo=offline'); console.log('offline banner:', await p.isVisible("text=You're offline"));
  await p.goto('http://localhost:8765/?start=dashboard&tab=explorer&demo=lookupfail'); await p.click('role=switch'); await p.click('text=Look up this marker'); await p.waitForSelector("text=Couldn't reach SNPedia", {timeout:15000}); await p.click('text=Retry'); await p.waitForTimeout(8000); console.log('after retry failed shown:', await p.isVisible("text=Couldn't reach SNPedia"));
  await p.goto('http://localhost:8765/?theme=dark&start=upload&demo=slow'); await p.click('text=Full genome'); await p.waitForTimeout(1000); await p.screenshot({ path: '../shots/flow-parsing.png' });
  console.log('errors:', errs);
  await b.close();
})();
