/* LiberateDNA parser. Runs in a Web Worker built from this function's source.
   It unzips and reads a 23andMe raw data file, keeps the full genotype table
   in memory for Explorer searches, and posts back a small summary. */
function locusWorker(self, postMessage) {
  const CHRS = ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','X','Y','MT'];
  const CHR_IX = {}; CHRS.forEach((c, i) => CHR_IX[c] = i);
  Object.assign(CHR_IX, { '23': 22, '24': 23, '25': 22, 'XY': 22, '26': 24, 'M': 24 });

  const isNoCall = g => !g || g === '00' || /^-+$/.test(g);
  let store = null, refs = null; // { ids: [], chr: Uint8Array, pos: Int32Array, geno: [], index: Map }

  const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  const crcByte = (crc, b) => (crc >>> 8) ^ CRC[(crc ^ b) & 0xff];

  class Fail extends Error { constructor(code, extra) { super(code); this.code = code; Object.assign(this, extra || {}); } }

  function readZip(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    // The spec'd quick check: general purpose flag bit 0 on the first local header.
    const firstEncrypted = (dv.getUint16(6, true) & 1) === 1;
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Fail('corrupt', { why: 'zip-end' });
    const count = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
    const entries = [];
    let p = cdOff;
    for (let i = 0; i < count; i++) {
      if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) throw new Fail('corrupt', { why: 'zip-dir' });
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), time = dv.getUint16(p + 12, true), crc = dv.getUint32(p + 16, true);
      const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
      entries.push({ flags, method, time, crc, csize, usize, name, lo });
      p += 46 + nl + xl + cl;
    }
    const pickOrder = [e => /genome|phased|23andme/i.test(e.name) && /\.(txt|csv|tsv)$/i.test(e.name), e => /\.(txt|csv|tsv)$/i.test(e.name)];
    let entry = null;
    for (const f of pickOrder) { entry = entries.find(e => !e.name.startsWith('__MACOSX') && f(e)); if (entry) break; }
    if (!entry) throw new Fail('corrupt', { why: 'no-txt' });
    if (entry.lo + 30 > u8.length || dv.getUint32(entry.lo, true) !== 0x04034b50) throw new Fail('corrupt', { why: 'zip-local' });
    const start = entry.lo + 30 + dv.getUint16(entry.lo + 26, true) + dv.getUint16(entry.lo + 28, true);
    if (start + entry.csize > u8.length) throw new Fail('corrupt', { why: 'zip-cut' });
    return { entry, data: u8.subarray(start, start + entry.csize), encrypted: firstEncrypted || (entry.flags & 1) === 1 };
  }

  // Traditional PKWARE (ZipCrypto) decryption.
  function zipDecrypt(data, pw, entry) {
    let k0 = 0x12345678, k1 = 0x23456789, k2 = 0x34567890;
    const upd = b => { k0 = crcByte(k0, b); k1 = (Math.imul((k1 + (k0 & 0xff)) >>> 0, 134775813) + 1) >>> 0; k2 = crcByte(k2, k1 >>> 24); };
    for (const b of new TextEncoder().encode(pw)) upd(b);
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) { const t = (k2 | 2) & 0xffff; const p = data[i] ^ ((Math.imul(t, t ^ 1) >>> 8) & 0xff); upd(p); out[i] = p; }
    const check = out[11], want = (entry.flags & 8) ? (entry.time >>> 8) & 0xff : (entry.crc >>> 24) & 0xff;
    if (check !== want) throw new Fail('password', { wrong: true });
    return out.subarray(12);
  }

  function textStream(bytes, method) {
    let s = new Blob([bytes]).stream();
    if (method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Fail('corrupt', { why: 'no-inflate' });
      s = s.pipeThrough(new DecompressionStream('deflate-raw'));
    } else if (method !== 0) throw new Fail(method === 99 ? 'password' : 'corrupt', { why: 'method', aes: method === 99 });
    return s.pipeThrough(new TextDecoderStream());
  }

  function sniffVendor(head) {
    if (/ancestrydna/i.test(head) || /^rsid\s+chromosome\s+position\s+allele1\s+allele2/im.test(head) || /rsid,chromosome,position,allele1,allele2/i.test(head)) return 'AncestryDNA';
    if (/myheritage/i.test(head)) return 'MyHeritage';
    if (/familytreedna|ftdna/i.test(head) || /^"?RSID"?,"?CHROMOSOME"?,"?POSITION"?,"?RESULT"?/im.test(head)) return 'FamilyTreeDNA';
    if (/living ?dna/i.test(head)) return 'LivingDNA';
    return '';
  }

  async function parse({ buf, name, pw, curated, coords, keep, heritage }) {
    const u8 = new Uint8Array(buf);
    if (!u8.length) throw new Fail('corrupt', { why: 'empty' });
    const isZip = u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04;
    let stream, usize = u8.length;
    if (isZip) {
      postMessage({ type: 'step', step: 0 });
      const z = readZip(u8);
      let data = z.data;
      if (z.encrypted) {
        if (z.entry.method === 99) throw new Fail('password', { aes: true });
        if (!pw) throw new Fail('password');
        data = zipDecrypt(data, pw, z.entry);
      }
      usize = z.entry.usize || data.length * 4;
      stream = textStream(data, z.entry.method);
    } else {
      if (!/\.(txt|tsv|csv)$/i.test(name || '')) throw new Fail('corrupt', { why: 'ext' });
      stream = textStream(u8, 0);
    }

    const ids = [], chr = [], pos = [], geno = [];
    const counts = CHRS.map(() => [0, 0]); // [rows, called]
    let rows = 0, head = '', headDone = false, rest = '', phasedMark = false, partial = false, lastPost = 0, est = Math.round(usize / 24);
    const reader = stream.getReader();
    postMessage({ type: 'step', step: 1, rows: 0, est });
    const handle = line => {
      if (!line) return;
      if (line.charCodeAt(0) === 35) { if (/phased/i.test(line)) phasedMark = true; return; }
      // Tab-separated as 23andMe writes it; comma-separated if a tool re-saved it as CSV.
      const f = (line.includes('\t') ? line.split('\t') : line.split(',')).map(x => x.trim().replace(/^"|"$/g, ''));
      if (f.length < 4) { if (/^"?rsid/i.test(line)) return; partial = true; return; }
      if (f[0].toLowerCase() === 'rsid') return;
      const ci = CHR_IX[f[1]];
      if (ci === undefined) return;
      let g = f[3];
      if (g.includes('|')) { phasedMark = true; g = g.replace('|', ''); } else if (g.includes('/')) g = g.replace('/', '');
      if (f.length >= 5 && f[4] && /^[ACGTID-]$/.test(f[4].trim()) && g.length === 1) g += f[4].trim();
      ids.push(f[0]); chr.push(ci); pos.push(+f[2] || 0); geno.push(g);
      counts[ci][0]++; if (!isNoCall(g)) counts[ci][1]++;
      rows++;
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      let text = rest + value;
      if (!headDone) {
        head += value;
        if (head.length >= 4096) { headDone = true; const v = sniffVendor(head.slice(0, 4096)); if (v) { reader.cancel(); throw new Fail('vendor', { vendor: v }); } }
      }
      const nl = text.lastIndexOf('\n');
      if (nl < 0) { rest = text; continue; }
      rest = text.slice(nl + 1);
      text = text.slice(0, nl);
      let i = 0;
      while (i < text.length) { let j = text.indexOf('\n', i); if (j < 0) j = text.length; let line = text.slice(i, j); if (line.endsWith('\r')) line = line.slice(0, -1); partial = false; handle(line); i = j + 1; }
      if (rows - lastPost >= 25000) { lastPost = rows; if (rows > est) est = Math.round(rows * 1.1); postMessage({ type: 'progress', rows, est }); }
    }
    if (!headDone && head) { const v = sniffVendor(head); if (v) throw new Fail('vendor', { vendor: v }); }
    if (rest.trim()) { partial = false; handle(rest.replace(/\r$/, '')); }
    if (rows < 1000) throw new Fail('corrupt', { why: 'few-rows', rows });
    if (partial) throw new Fail('corrupt', { why: 'cut-off', rows });

    const yCalled = counts[23][1];
    // A repeated probe never replaces a real call with a no-call.
    const index = new Map(), posIndex = new Map();
    for (let i = 0; i < ids.length; i++) {
      const prev = index.get(ids[i]);
      if (prev === undefined || (isNoCall(geno[prev]) && !isNoCall(geno[i]))) index.set(ids[i], i);
      const pk = CHRS[chr[i]] + ':' + pos[i], prevP = posIndex.get(pk);
      if (prevP === undefined || (isNoCall(geno[prevP]) && !isNoCall(geno[i]))) posIndex.set(pk, i);
    }
    const sex = yCalled > 500 ? 'XY' : 'XX';
    const ftype = phasedMark || /phased/i.test(name || '') ? 'phased' : 'full';
    const chip = index.has('rs4244285') || index.has('rs4149056') ? 'v5' : 'v4';
    const genos = {}, posMap = {};
    for (const id of curated) {
      let i = index.get(id);
      // Fall back to the position when the marker is missing, a no-call, or stored under another name.
      if ((i === undefined || isNoCall(geno[i])) && coords && coords[id]) { const j = posIndex.get(coords[id]); if (j !== undefined && (i === undefined || !isNoCall(geno[j]))) i = j; }
      if (i !== undefined) { genos[id] = geno[i]; posMap[id] = pos[i]; }
    }
    if (keep !== false) store = { ids, chr: Uint8Array.from(chr), pos: Int32Array.from(pos), geno, index };
    let her = null;
    if (heritage && refs) {
      postMessage({ type: 'step', step: 2 });
      const A = locusAnc();
      const g = A.dosages(refs.P, id => { const i = index.get(id); return i === undefined ? null : geno[i]; });
      const anc = A.ancestry(refs.P, g);
      const paint = anc.tooFew ? null : A.paint(refs.P, g, anc.regions.map(r => r.pct));
      const one = (c, x) => { const y = [], seen = new Set(); for (let i = 0; i < ids.length; i++) if (chr[i] === c && !seen.has(pos[i])) { const v = geno[i]; if (v && /^[ACGT]{1,2}$/.test(v) && (v.length === 1 || v[0] === v[1])) { y.push([pos[i], v[0]]); seen.add(pos[i]); } } return y; };
      her = { anc, paint, mt: A.mtPlace(refs.MT, one(24)), y: sex === 'XY' ? A.yPlace(refs.Y, one(23)) : null };
    }
    return { heritage: her, rows, counts: CHRS.map((c, i) => [c, counts[i][0], counts[i][1]]), sex, ftype, chip, genos, pos: posMap };
  }

  function search(q, limit) {
    if (!store) return [];
    q = q.trim().toLowerCase();
    const out = [];
    if (/^(rs|i)\d{2,}$/.test(q)) {
      const exact = store.index.get(q);
      if (exact !== undefined) out.push(exact);
      for (let i = 0; i < store.ids.length && out.length < limit; i++) { const id = store.ids[i]; if (id.length > q.length && id.startsWith(q)) out.push(i); }
    } else {
      const m = q.replace(/^chr/, '').toUpperCase();
      const ci = CHR_IX[m];
      if (ci !== undefined && m.length <= 2) for (let i = 0; i < store.ids.length && out.length < limit; i++) if (store.chr[i] === ci) out.push(i);
    }
    return out.map(i => [store.ids[i], CHRS[store.chr[i]], store.pos[i], store.geno[i]]);
  }

  self.onmessage = async e => {
    const m = e.data;
    if (m.type === 'parse') {
      try { const r = await parse(m); postMessage({ type: 'done', id: m.id, result: r }); }
      catch (err) { postMessage({ type: 'error', id: m.id, code: err.code || 'corrupt', vendor: err.vendor || '', wrong: !!err.wrong, aes: !!err.aes, why: err.why || String(err && err.message || err) }); }
    } else if (m.type === 'search') {
      postMessage({ type: 'search', id: m.id, q: m.q, rows: search(m.q, m.limit || 60), total: store ? store.ids.length : 0 });
    } else if (m.type === 'ref') refs = m.ref;
    else if (m.type === 'drop') store = null;
  };
}
