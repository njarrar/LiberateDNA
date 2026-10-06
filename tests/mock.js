const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 1100 } })).newPage();
  const cors = { 'access-control-allow-origin': '*' };
  await p.route('https://myvariant.info/**', r => r.fulfill({ headers: cors, json: { total: 2, hits: [{ _id: 'chr6:g.26093141G>C' }, { _id: 'chr6:g.26093141G>A', clinvar: { rcv: [{ clinical_significance: 'Pathogenic' }, { clinical_significance: 'Pathogenic' }, { clinical_significance: 'risk factor' }] }, gnomad_genome: { af: { af: 0.0326 } } }] } }));
  await p.route('https://rest.ensembl.org/**', r => r.fulfill({ headers: cors, json: { name: 'rs1800562', MAF: 0.0124, minor_allele: 'A', most_severe_consequence: 'missense_variant' } }));
  await p.route('https://bots.snpedia.com/**', r => r.fulfill({ headers: cors, json: { query: { pages: { '123': { pageid: 123, title: 'Rs1800562' } } } } }));
  await p.goto('http://localhost:8765/?start=dashboard&tab=explorer');
  await p.fill('input[type=search]', 'rs1800562'); await p.click('button[data-rs=rs1800562]');
  await p.click('role=switch'); await p.click('text=Look up this marker'); await p.waitForSelector('text=PharmGKB');
  const out = (await p.innerText('[aria-live=polite] >> nth=1')).replace(/\n+/g, ' | ');
  console.log(out.slice(200, 900));
  console.log(/Pathogenic/.test(out) && /0\.033/.test(out) ? 'PASS second hit read' : 'FAIL second hit not read');
  await p.screenshot({ path: 'mock-lookup.png' });
  await b.close();
})();
