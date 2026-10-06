const { chromium } = require('playwright');
const themes = (process.env.THEMES || 'lab,dark,warm,poster').split(',');
const langs = (process.env.LANGS || 'en').split(',');
const vps = [{ n: 'd', width: 1280, height: 2600 }, { n: 'm', width: 390, height: 3400 }];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ ignoreHTTPSErrors: true });
  const out = [];
  for (const L of langs) for (const t0 of themes) for (const vp of vps) {
    const t = t0 + '&lang=' + L;
    const p = await ctx.newPage(); await p.setViewportSize({ width: vp.width, height: vp.height });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    const shot = async name => {
      await p.waitForTimeout(250);
      const ov = await p.evaluate(() => { const bad = []; document.querySelectorAll('[data-locus-root] *:not(svg *)').forEach(el => { const r = el.getBoundingClientRect(); if (r.width && !(el.tagName === 'INPUT' && el.type === 'file') && (r.right > window.innerWidth + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed') bad.push((el.tagName + ' ' + (el.textContent || '').slice(0, 30)).trim()); }); const m = document.querySelector('[data-main]'); return { bad: bad.slice(0, 4), mainOverflowX: m ? m.scrollWidth > m.clientWidth + 1 : false }; });
      if (ov.bad.length || ov.mainOverflowX) out.push(`${t}-${vp.n}-${name} OVERFLOW ${JSON.stringify(ov)}`);
      await p.screenshot({ path: `../shots/${L}-${t0}-${vp.n}-${name}.png` });
    };
    await p.goto(`http://localhost:8765/?theme=${t}`); await shot('upload');
    for (const d of ['password', 'vendor', 'corrupt']) { await p.goto(`http://localhost:8765/?theme=${t}&demo=${d}`); await shot('err-' + d); }
    await p.goto(`http://localhost:8765/?theme=${t}&start=dashboard`); await shot('overview');
    for (const tab of ['heritage', 'traits', 'explorer']) { await p.goto(`http://localhost:8765/?theme=${t}&start=dashboard&tab=${tab}`); await shot(tab); }
    await p.goto(`http://localhost:8765/?theme=${t}&start=dashboard&tab=health`);
    await p.click('[data-main] button[aria-expanded="false"] >> nth=0'); await shot('health');
    for (const sub of ['carrier', 'drugs']) { await p.goto(`http://localhost:8765/?theme=${t}&start=dashboard&tab=health&sub=${sub}`); await shot(sub); }
    if (errs.length) out.push(`${t}-${vp.n} ERR ${errs.join(' | ')}`);
    await p.close();
  }
  console.log(out.join('\n') || 'clean');
  await b.close();
})();
