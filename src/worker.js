/* LiberateDNA parser. Runs in a Web Worker built from this function's source.
   It opens a raw DNA file from any common provider (zip, gzip or plain text;
   23andMe-style tables, AncestryDNA, MyHeritage, FamilyTreeDNA, Illumina reports,
   VCF and gVCF), works out the genome build, keeps the full genotype table in
   memory for Explorer searches, and posts back a small summary. */
function locusWorker(self, postMessage) {
  const CHRS = ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','X','Y','MT'];
  const CHR_IX = {}; CHRS.forEach((c, i) => CHR_IX[c] = i);
  // 23-26 as AncestryDNA and PLINK number them (25 is the X pseudoautosomal region).
  Object.assign(CHR_IX, { '23': 22, '24': 23, '25': 22, 'XY': 22, 'PAR': 22, '26': 24, 'M': 24 });
  const chrIx = c => CHR_IX[String(c).replace(/^chr/i, '').toUpperCase()];
  // Non-PAR X, where a man carries one copy. [start, end] for GRCh37 and GRCh38.
  const XNP = { 37: [2699521, 154931043], 38: [2781480, 155701382] };

  const isNoCall = g => !g || g === '--' || g === '00' || /^-+$/.test(g);
  let store = null, refs = null; // { ids: [], chr: Uint8Array, pos: Int32Array, geno: [], index: Map }

  const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  const crcByte = (crc, b) => (crc >>> 8) ^ CRC[(crc ^ b) & 0xff];

  class Fail extends Error { constructor(code, extra) { super(code); this.code = code; Object.assign(this, extra || {}); } }

  const bytes = async (blob, a, b) => new Uint8Array(await blob.slice(a, b).arrayBuffer());

  /* Reads the zip's directory from the end of the file, so only the entry we
     need is loaded. */
  async function readZip(file) {
    const size = file.size, tailStart = Math.max(0, size - 65557);
    const tail = await bytes(file, tailStart, size), tv = new DataView(tail.buffer);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (tv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Fail('corrupt', { why: 'zip-end' });
    const count = tv.getUint16(eocd + 10, true), cdSize = tv.getUint32(eocd + 12, true), cdOff = tv.getUint32(eocd + 16, true);
    if (cdOff === 0xffffffff || count === 0xffff) throw new Fail('unsupported', { kind: 'zip64' });
    if (cdOff + cdSize > size) throw new Fail('corrupt', { why: 'zip-dir' });
    const cd = await bytes(file, cdOff, cdOff + cdSize), dv = new DataView(cd.buffer);
    const entries = [];
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (p + 46 > cd.length || dv.getUint32(p, true) !== 0x02014b50) throw new Fail('corrupt', { why: 'zip-dir' });
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), time = dv.getUint16(p + 12, true), crc = dv.getUint32(p + 16, true);
      const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(cd.subarray(p + 46, p + 46 + nl));
      if (csize === 0xffffffff || lo === 0xffffffff) throw new Fail('unsupported', { kind: 'zip64' });
      entries.push({ flags, method, time, crc, csize, usize, name, lo });
      p += 46 + nl + xl + cl;
    }
    const ok = e => !e.name.startsWith('__MACOSX') && !e.name.endsWith('/') && !/(^|\/)\._/.test(e.name);
    const data = e => /\.(txt|csv|tsv|vcf|gvcf)(\.b?gz)?$/i.test(e.name);
    const pickOrder = [e => data(e) && /genome|phased|23andme|ancestry|myheritage|dna|raw|vcf/i.test(e.name), data];
    let entry = null;
    for (const f of pickOrder) {
      const c = entries.filter(e => ok(e) && f(e)).sort((a, b) => b.usize - a.usize);
      if (c.length) { entry = c[0]; break; }
    }
    if (!entry) {
      if (entries.some(e => /\.(bam|cram)$/i.test(e.name))) throw new Fail('unsupported', { kind: 'reads' });
      throw new Fail('corrupt', { why: 'no-txt' });
    }
    const lh = await bytes(file, entry.lo, entry.lo + 30), lv = new DataView(lh.buffer);
    if (lh.length < 30 || lv.getUint32(0, true) !== 0x04034b50) throw new Fail('corrupt', { why: 'zip-local' });
    const start = entry.lo + 30 + lv.getUint16(26, true) + lv.getUint16(28, true);
    if (start + entry.csize > size) throw new Fail('corrupt', { why: 'zip-cut' });
    return { entry, data: file.slice(start, start + entry.csize), encrypted: (entry.flags & 1) === 1 };
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

  /* gzip, including the many-part kind (bgzip) that browsers' own decoder stops at. */
  function gunzip(stream) {
    const ff = self.fflate || (typeof globalThis !== 'undefined' && globalThis.fflate);
    if (!ff) throw new Fail('corrupt', { why: 'no-gunzip' });
    let g;
    return stream.pipeThrough(new TransformStream({
      start(c) { g = new ff.Gunzip(d => { if (d.length) c.enqueue(d); }); },
      transform(chunk) { try { g.push(chunk); } catch (e) { throw new Fail('corrupt', { why: 'gzip' }); } },
      flush() { try { g.push(new Uint8Array(0), true); } catch (e) { throw new Fail('corrupt', { why: 'cut-off' }); } }
    }));
  }

  const isGz = h => h[0] === 0x1f && h[1] === 0x8b;
  function binaryKind(h, name) {
    const s = String.fromCharCode.apply(null, h.subarray(0, 8));
    if (s.startsWith('CRAM') || /\.(bam|cram|sam|fastq|fq|fasta|fa)(\.gz)?$/i.test(name || '')) return 'reads';
    if (s.startsWith('BZh') || s.startsWith('7z') || s.startsWith('Rar!') || (h[0] === 0xfd && s.slice(1, 5) === '7zXZ')) return 'archive';
    if (s.startsWith('%PDF')) return 'pdf';
    for (let i = 0; i < Math.min(h.length, 512); i++) if (h[i] === 0) return 'binary';
    return '';
  }

  /* Returns a stream of the file's text bytes, whatever it is wrapped in. */
  async function openFile(file, pw) {
    const h = await bytes(file, 0, 64), name = file.name || '';
    if (!h.length) throw new Fail('corrupt', { why: 'empty' });
    let usize = file.size, s, inner = name, wrap = 'text';
    if (h[0] === 0x50 && h[1] === 0x4b && h[2] === 0x03 && h[3] === 0x04) {
      postMessage({ type: 'step', step: 0 });
      const z = await readZip(file);
      let data = z.data;
      if (z.encrypted) {
        if (z.entry.method === 99) throw new Fail('password', { aes: true });
        if (!pw) throw new Fail('password');
        data = new Blob([zipDecrypt(new Uint8Array(await data.arrayBuffer()), pw, z.entry)]);
      }
      usize = z.entry.usize || data.size * 4; inner = z.entry.name; wrap = 'zip';
      s = data.stream();
      if (z.entry.method === 8) s = s.pipeThrough(new DecompressionStream('deflate-raw'));
      else if (z.entry.method !== 0) throw new Fail(z.entry.method === 99 ? 'password' : 'corrupt', { why: 'method', aes: z.entry.method === 99 });
      if (/\.b?gz$/i.test(inner)) { s = gunzip(s); usize *= 4; }
    } else if (isGz(h)) {
      postMessage({ type: 'step', step: 0 });
      // A BAM file is gzip too; its first block starts with "BAM\1".
      const peek = gunzip(file.slice(0, 1 << 16).stream()).getReader();
      let first = null; try { first = (await peek.read()).value; } catch (e) {} peek.cancel().catch(() => {});
      if (first && first[0] === 66 && first[1] === 65 && first[2] === 77 && first[3] === 1) throw new Fail('unsupported', { kind: 'reads' });
      if (first && binaryKind(first, '') === 'binary') throw new Fail('unsupported', { kind: 'binary' });
      s = gunzip(file.stream()); usize = file.size * 4; inner = name.replace(/\.b?gz$/i, ''); wrap = 'gzip';
    } else {
      const k = binaryKind(h, name);
      if (k) throw new Fail('unsupported', { kind: k });
      s = file.stream();
    }
    return { stream: s.pipeThrough(new TextDecoderStream()), usize, inner, wrap };
  }

  const VENDORS = [
    [/23andme/i, '23andMe'], [/ancestrydna|ancestry\.com/i, 'AncestryDNA'], [/myheritage/i, 'MyHeritage'],
    [/family ?tree ?dna|ftdna|famfinder|gene by gene/i, 'FamilyTreeDNA'], [/living ?dna/i, 'Living DNA'],
    [/tellmegen/i, 'tellmeGen'], [/genes for good/i, 'Genes for Good'], [/dna\.?land/i, 'DNA.Land'],
    [/selfdecode/i, 'SelfDecode'], [/23mofang/i, '23Mofang'], [/sano ?genetics|\bsano\b/i, 'Sano Genetics'],
    [/codigo ?46/i, 'Codigo46'], [/mapmygenome/i, 'Mapmygenome'], [/circle ?dna/i, 'CircleDNA'],
    [/nebula/i, 'Nebula Genomics'], [/dante/i, 'Dante Labs'], [/sequencing\.com/i, 'Sequencing.com'],
    [/24 ?genetics/i, '24Genetics'], [/full ?genomes/i, 'Full Genomes'], [/genera\b/i, 'Genera'], [/meugen/i, 'meuDNA']
  ];

  /* Column names, lower case with anything but letters and digits removed. */
  const COLS = {
    rs: ['rsid', 'rsids', 'rs', 'rsnumber', 'dbsnp', 'dbsnpid', 'rsname'],
    id: ['snpname', 'name', 'markername', 'marker', 'markerid', 'snpid', 'snp', 'id', 'variantid', 'probeid', 'locus'],
    chr: ['chromosome', 'chr', 'chrom', 'chromo', 'chromosomename'],
    pos: ['position', 'pos', 'bp', 'basepair', 'basepairposition', 'coordinate', 'physicalposition', 'mapinfo', 'start'],
    geno: ['genotype', 'result', 'call', 'gt', 'genotypes', 'yourgenotype', 'genotypeplus', 'alleles'],
    a1: ['allele1plus', 'allele1forward', 'allele1', 'allele1fwd'], a2: ['allele2plus', 'allele2forward', 'allele2', 'allele2fwd']
  };
  const colName = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const looksId = s => /^(rs|i|vg|kgp|gsa-?)\d|^\d+:\d+|^chr/i.test(s);
  const unq = s => s.replace(/"/g, '').trim();

  function normG(g) {
    g = g.replace(/[\s"/|]/g, '').toUpperCase();
    if (!g || g.length > 2 || /[^ACGTDI]/.test(g)) return '--';
    return g;
  }

  async function parse({ file, buf, name, pw, curated, coords, keep, heritage, compare }) {
    if (!file) file = new File([buf || new Uint8Array(0)], name || 'file.txt');
    const src = await openFile(file, pw);

    const ids = [], chr = [], pos = [], geno = [];
    let rows = 0, rest = '', phasedMark = false, partial = false, lastPost = 0, est = Math.round(src.usize / 24);
    const comments = [];
    let mode = null, sep = null, C = null, isVcf = false, illum = 0, hdrFirst = null;
    // VCF state
    const V = { gt: new Map(), contig: {}, blocks: 0, homRef: 0, variants: 0, samples: 0, cover: new Map(), filtered: 0, phased: 0, unphased: 0 };
    const tgt = refs && refs.T;

    const push = (id, ci, p, g) => { ids.push(id); chr.push(ci); pos.push(p); geno.push(g); rows++; };
    const split = line => (sep === 'ws' ? line.trim().split(/\s+/) : line.split(sep)).map(unq);

    function setHeader(f) {
      const n = f.map(colName), find = list => { for (const k of list) { const i = n.indexOf(k); if (i >= 0) return i; } return -1; };
      C = { rs: find(COLS.rs), id: find(COLS.id), chr: find(COLS.chr), pos: find(COLS.pos), geno: find(COLS.geno), a1: find(COLS.a1), a2: find(COLS.a2) };
      if (C.rs < 0) { C.rs = C.id; C.id = -1; }
      if (C.rs < 0 || (C.geno < 0 && (C.a1 < 0 || C.a2 < 0))) throw new Fail('format', { why: 'columns' });
      if (C.a1 >= 0 && C.a2 >= 0) C.geno = -1;
      C.need = Math.max(C.rs, C.chr, C.pos, C.geno, C.a1, C.a2) + 1;
      hdrFirst = n[0];
    }
    const looksHeader = f => !looksId(f[0]) && f.some(x => { const k = colName(x); return COLS.rs.includes(k) || COLS.chr.includes(k) || COLS.geno.includes(k); });

    function tableLine(line) {
      const f = split(line);
      if (f.length < C.need) { if (f.length > 1 || line.trim()) partial = true; return; }
      if (colName(f[0]) === hdrFirst) return; // a repeated header, as in joined FamilyTreeDNA files
      let id = f[C.rs];
      if ((!id || id === '.' || id === '--') && C.id >= 0) id = f[C.id];
      let ci, p = C.pos >= 0 ? +f[C.pos] || 0 : 0;
      if (C.chr >= 0) ci = chrIx(f[C.chr]);
      else {
        // No chromosome column (some Illumina reports): read it from a "1:12345" name, or from the marker tables.
        const m = /^(?:chr)?(\w{1,2}):(\d+)/i.exec(id), t = !m && tgt && tgt.byId.get(id);
        if (m) { ci = chrIx(m[1]); p = +m[2]; } else if (t) { ci = t.c; p = t.p37; }
      }
      if (ci === undefined) return;
      let raw = C.geno >= 0 ? f[C.geno] : f[C.a1] + f[C.a2];
      if (raw.includes('|')) phasedMark = true;
      if (C.geno < 0 && /^[0\-]$/.test(f[C.a1]) && /^[0\-]$/.test(f[C.a2])) raw = '--';
      if (!id || id === '.') id = CHRS[ci] + ':' + p;
      push(id, ci, p, normG(raw));
    }

    function detect(line) {
      sep = line.includes('\t') ? '\t' : line.includes(',') ? ',' : line.includes(';') ? ';' : 'ws';
      const f = split(line);
      if (looksHeader(f)) { setHeader(f); mode = 'table'; return; }
      // 23andMe and others put the column names in the last comment line.
      for (let i = comments.length - 1; i >= Math.max(0, comments.length - 3); i--) {
        const c = comments[i].replace(/^#+\s*/, '');
        const s0 = sep; sep = c.includes('\t') ? '\t' : c.includes(',') ? ',' : 'ws';
        const cf = split(c); sep = s0;
        if (looksHeader(cf) && Math.abs(cf.length - f.length) <= 1) { try { setHeader(cf); } catch (e) { continue; } mode = 'table'; tableLine(line); return; }
      }
      const n = f.length;
      if (n < 4) throw new Fail('format', { why: 'columns' });
      C = n >= 5 && f[3].length <= 1 && f[4].length <= 1 ? { rs: 0, id: -1, chr: 1, pos: 2, geno: -1, a1: 3, a2: 4, need: 5 } : { rs: 0, id: -1, chr: 1, pos: 2, geno: 3, a1: -1, a2: -1, need: 4 };
      mode = 'table'; tableLine(line);
    }

    // Marks reference blocks in a gVCF that cover a site we want, in either build.
    function cover(ci, s, e, gt) {
      const list = tgt && tgt.byChr[ci];
      if (!list) return;
      let lo = 0, hi = list.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (list[m] < s) lo = m + 1; else hi = m; }
      for (let i = lo; i < list.length && list[i] <= e; i++) V.cover.set(ci * 4e8 + list[i], gt.length);
    }

    function vcfLine(line) {
      const f = line.split('\t');
      if (f.length < 10) { if (f.length > 1) partial = true; return; }
      const ci = chrIx(f[0]);
      if (ci === undefined) return;
      if (ci === 24 && !V.mtOk) return;
      const p = +f[1], ref = f[3], alt = f[4];
      let fi = V.gt.get(f[8]);
      if (fi === undefined) { fi = f[8].split(':').indexOf('GT'); V.gt.set(f[8], fi); }
      if (fi < 0) return;
      const gt = f[9].split(':')[fi] || '.';
      const alts = alt === '.' ? [] : alt.split(',');
      const real = alts.filter(a => a[0] !== '<' && a !== '*');
      if (!real.length) {
        // A reference block (gVCF) or a site where you match the reference.
        if (/^0([\/|]0)?$/.test(gt)) {
          const m = /(?:^|;)END=(\d+)/.exec(f[7]), e = m ? +m[1] : p;
          if (m) V.blocks++; else V.homRef++;
          cover(ci, p, e, gt.replace(/[\/|]/g, ''));
          if (!m && ref.length === 1) { const id = /rs\d+/.exec(f[2]); push(id ? id[0] : CHRS[ci] + ':' + p, ci, p, gt.length > 1 ? ref + ref : ref); }
        }
        return;
      }
      const filt = f[6];
      const al = [ref].concat(alts.map(a => a[0] === '<' || a === '*' ? null : a));
      const lens = al.filter(Boolean).map(a => a.length), snv = lens.every(l => l === 1), maxL = Math.max.apply(null, lens);
      const letter = a => !a ? null : snv ? a : a.length === maxL ? 'I' : 'D';
      if (gt.includes('|')) V.phased++; else if (gt.includes('/')) V.unphased++;
      if (V.ps === undefined) V.ps = /(^|:)PS(:|$)/.test(f[8]);
      let g = '';
      for (const k of gt.split(/[\/|]/)) { const a = k === '.' ? null : letter(al[+k]); if (!a) { g = '--'; break; } g += a; }
      if (filt !== 'PASS' && filt !== '.' && filt !== '') { V.filtered++; g = '--'; }
      if (/^0([\/|]0)?$/.test(gt)) V.homRef++; else V.variants++;
      const id = /rs\d+/.exec(f[2]);
      push(id ? id[0] : CHRS[ci] + ':' + p, ci, p, normG(g));
    }

    function vcfMeta() {
      for (const c of comments) {
        const m = /^##contig=<.*?ID=([^,>]+).*?length=(\d+)/i.exec(c);
        if (m) V.contig[m[1].replace(/^chr/i, '').toUpperCase()] = { name: m[1], len: +m[2] };
      }
      const mt = V.contig.MT || V.contig.M;
      // hg19 calls its mitochondria chrM and uses an older sequence (16,571 bases); rCRS has 16,569.
      V.mtOk = !mt || mt.len === 16569;
    }

    const handle = line => {
      if (mode === 'vcf') return vcfLine(line);
      if (mode === 'table') return tableLine(line);
      if (illum === 1) { if (/^\[Data\]/i.test(line)) illum = 2; else comments.push(line); return; }
      if (illum === 2) { sep = line.includes('\t') ? '\t' : ','; setHeader(split(line)); mode = 'table'; return; }
      if (!line.trim()) return;
      if (line.charCodeAt(0) === 35) {
        if (comments.length < 400) comments.push(line);
        if (/^##fileformat=VCF/i.test(line)) isVcf = true;
        if (/phased/i.test(line) && !isVcf) phasedMark = true;
        if ((isVcf || /^#CHROM\tPOS/i.test(line)) && /^#CHROM/i.test(line)) { mode = 'vcf'; V.samples = line.split('\t').length - 9; vcfMeta(); }
        return;
      }
      if (/^\[Header\]/i.test(line)) { illum = 1; return; }
      if (isVcf) { mode = 'vcf'; vcfMeta(); return vcfLine(line); }
      detect(line);
    };

    const reader = src.stream.getReader();
    postMessage({ type: 'step', step: 1, rows: 0, est });
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        let text = rest + value;
        const nl = text.lastIndexOf('\n');
        if (nl < 0) { rest = text; continue; }
        rest = text.slice(nl + 1);
        text = text.slice(0, nl);
        let i = 0;
        while (i < text.length) { let j = text.indexOf('\n', i); if (j < 0) j = text.length; let line = text.slice(i, j); if (line.endsWith('\r')) line = line.slice(0, -1); partial = false; handle(line); i = j + 1; }
        if (rows - lastPost >= 25000) { lastPost = rows; if (rows > est) est = Math.round(rows * 1.1); postMessage({ type: 'progress', rows, est }); }
      }
    } catch (e) {
      reader.cancel().catch(() => {});
      if (e instanceof Fail) throw e;
      throw new Fail('corrupt', { why: 'cut-off', rows });
    }
    if (rest.trim()) { partial = false; handle(rest.replace(/\r$/, '')); }
    if (rows < 1000) throw new Fail(mode ? 'corrupt' : 'format', { why: 'few-rows', rows });
    if (partial) throw new Fail('corrupt', { why: 'cut-off', rows });

    // Who made it, and what kind of data it is.
    const head = comments.slice(0, 200).join('\n');
    let vendor = '';
    for (const [re, v] of VENDORS) if (re.test(head)) { vendor = v; break; }
    if (!vendor) for (const [re, v] of VENDORS) if (re.test(name || '') || re.test(src.inner || '')) { vendor = v; break; }
    if (!vendor && !comments.length && hdrFirst === 'rsid' && C && C.geno >= 0 && sep === ',') vendor = 'FamilyTreeDNA';
    const wgs = mode === 'vcf' && (V.blocks > 0 || (V.variants > 1e6 && V.homRef < V.variants * 0.1));
    const kind = mode !== 'vcf' ? 'chip' : V.blocks > 0 ? 'gvcf' : wgs ? 'wgs' : 'vcf';

    // Genome build: the positions of known markers decide, the header only breaks a tie.
    let hint = 0;
    const c1 = V.contig['1'];
    if (c1) hint = c1.len === 249250621 ? 37 : c1.len === 248956422 ? 38 : c1.len === 247249719 ? 36 : 0;
    if (!hint) { const hd = head.toLowerCase(); hint = /grch38|hg38|build ?38|\bb38\b|hs38/.test(hd) ? 38 : /grch37|hg19|build ?37|\bb37\b|hs37|human_g1k_v37/.test(hd) ? 37 : /build ?36|ncbi ?36|hg18/.test(hd) ? 36 : 0; }
    let build = hint || 37, v37 = 0, v38 = 0, vn = 0;
    if (tgt) {
      for (let i = 0; i < ids.length && vn < 20000; i++) {
        const t = tgt.byId.get(ids[i]);
        if (t && t.c === chr[i]) { vn++; if (pos[i] === t.p37) v37++; else if (pos[i] === t.p38) v38++; }
      }
      if (vn < 50) { // no marker names, as in many VCFs: count sites at known positions
        v37 = v38 = vn = 0;
        for (let i = 0; i < ids.length && vn < 200000; i++) if (chr[i] < 22) { vn++; const k = chr[i] * 4e8 + pos[i]; if (tgt.at37.has(k)) v37++; if (tgt.at38.has(k)) v38++; }
        if (v37 + v38 >= 30) build = v37 > v38 * 3 ? 37 : v38 > v37 * 3 ? 38 : build;
      } else build = v37 / vn > 0.6 ? 37 : v38 / vn > 0.6 ? 38 : (hint === 37 || hint === 38) && (v37 + v38) / vn > 0.3 ? hint : 36;
    }

    // Whole genome VCFs list only where you differ from the reference. Fill in the
    // reference letter at the sites LiberateDNA reads, where the file covers them.
    let filled = 0;
    const kept = new Set();
    if (tgt && (kind === 'gvcf' || kind === 'wgs')) {
      for (let i = 0; i < ids.length; i++) kept.add(chr[i] * 4e8 + pos[i]);
      const xRange = XNP[build] || XNP[37];
      let yN = 0; for (let i = 0; i < chr.length; i++) if (chr[i] === 23) yN++;
      const male = yN > 100;
      for (const t of tgt.list) {
        const p = build === 38 ? t.p38 : t.p37;
        if (!p || !t.ref || (t.c === 24 && !V.mtOk) || (t.c === 23 && !male)) continue;
        const k = t.c * 4e8 + p;
        if (kept.has(k)) continue;
        let n = 0;
        if (kind === 'gvcf') { n = V.cover.get(k) || 0; if (!n) continue; }
        else n = t.c === 24 || t.c === 23 || (t.c === 22 && male && p >= xRange[0] && p <= xRange[1]) ? 1 : 2;
        kept.add(k); push(t.id, t.c, p, n === 1 ? t.ref : t.ref + t.ref); filled++;
      }
    }

    // Positions on GRCh37, which the curated table and the haplogroup trees use.
    const p37 = new Int32Array(ids.length);
    if (build === 37) for (let i = 0; i < ids.length; i++) p37[i] = pos[i];
    else for (let i = 0; i < ids.length; i++) {
      if (chr[i] === 24) p37[i] = pos[i];
      else if (build === 38 && tgt) p37[i] = tgt.from38.get(chr[i] * 4e8 + pos[i]) || 0;
    }

    const counts = CHRS.map(() => [0, 0]); // [rows, called]
    let xHom = 0, xHet = 0;
    const xr = XNP[build] || XNP[37];
    for (let i = 0; i < ids.length; i++) {
      const g = geno[i], c = chr[i];
      counts[c][0]++; if (!isNoCall(g)) counts[c][1]++;
      if (c === 22 && g.length === 2 && g !== '--' && pos[i] >= xr[0] && pos[i] <= xr[1]) { if (g[0] === g[1]) xHom++; else xHet++; }
    }
    const yCalled = counts[23][1], xRate = xHom + xHet >= 100 ? xHet / (xHom + xHet) : null;
    const sex = yCalled > (mode === 'vcf' ? 100 : 500) && (xRate === null || xRate < 0.15) ? 'XY' : 'XX';
    // One copy is written as one letter, as 23andMe does: MT always, and X and Y in men.
    for (let i = 0; i < ids.length; i++) {
      const g = geno[i], c = chr[i];
      if (g.length === 2 && g[0] === g[1] && g !== '--' && (c === 24 || (sex === 'XY' && (c === 23 || (c === 22 && pos[i] >= xr[0] && pos[i] <= xr[1]))))) geno[i] = g[0];
    }

    // A repeated probe never replaces a real call with a no-call.
    const index = new Map(), posIndex = new Map();
    for (let i = 0; i < ids.length; i++) {
      const prev = index.get(ids[i]);
      if (prev === undefined || (isNoCall(geno[prev]) && !isNoCall(geno[i]))) index.set(ids[i], i);
      if (!p37[i]) continue;
      const pk = CHRS[chr[i]] + ':' + p37[i], prevP = posIndex.get(pk);
      if (prevP === undefined || (isNoCall(geno[prevP]) && !isNoCall(geno[i]))) posIndex.set(pk, i);
    }
    const ftype = mode !== 'vcf' && (phasedMark || /phased/i.test(name || '')) ? 'phased' : 'full';
    const chip = vendor === '23andMe' || (!vendor && index.has('i3000001')) ? (index.has('rs4244285') || index.has('rs4149056') ? 'v5' : 'v4') : '';
    const genos = {}, posMap = {};
    for (const id of curated) {
      let i = index.get(id);
      // Fall back to the position when the marker is missing, a no-call, or stored under another name.
      if ((i === undefined || isNoCall(geno[i])) && coords && coords[id]) { const j = posIndex.get(coords[id]); if (j !== undefined && (i === undefined || !isNoCall(geno[j]))) i = j; }
      if (i !== undefined) { genos[id] = geno[i]; posMap[id] = p37[i] || pos[i]; }
    }
    const roh = runsOfHomozygosity(chr, pos, geno, kind);
    let cmp = null;
    if (compare && store) cmp = kinship(store, ids, chr, geno, p37, index);
    if (keep !== false) store = { ids, chr: Uint8Array.from(chr), pos: Int32Array.from(pos), p37, geno, index, posIndex };
    // Phased files keep the letters in copy order. A VCF counts only when its phase is
    // statistical (whole chromosome), not read-backed blocks marked with PS.
    const phasedData = ftype === 'phased' || (mode === 'vcf' && V.phased > 0.9 * (V.phased + V.unphased) && !V.ps);
    let her = null;
    if (heritage && refs) {
      postMessage({ type: 'step', step: 2 });
      const A = locusAnc();
      const g = A.dosages(refs.P, (id, c, p) => { let i = index.get(id); if (i === undefined && p) i = posIndex.get(c + ':' + p); return i === undefined ? null : geno[i]; });
      const anc = A.ancestry(refs.P, g);
      let haps = null;
      if (phasedData) {
        const U = A.unpack(refs.P); haps = [new Int8Array(U.n).fill(-1), new Int8Array(U.n).fill(-1)];
        for (let i = 0; i < U.n; i++) { let j = index.get(U.ids[i]); if (j === undefined) j = posIndex.get(U.chr[i] + ':' + U.pos[i]); const x = j === undefined ? null : geno[j]; if (x && x.length === 2) for (let k = 0; k < 2; k++) haps[k][i] = x[k] === U.alt[i] ? 1 : x[k] === U.ref[i] ? 0 : -1; }
      }
      const paint = anc.tooFew ? null : A.paint(refs.P, g, anc.regions.map(r => r.pct), haps);
      const one = (c, ok) => { const y = [], seen = new Set(); if (!ok) return y; for (let i = 0; i < ids.length; i++) if (chr[i] === c && p37[i] && !seen.has(p37[i])) { const v = geno[i]; if (v && /^[ACGT]{1,2}$/.test(v) && (v.length === 1 || v[0] === v[1])) { y.push([p37[i], v[0]]); seen.add(p37[i]); } } return y; };
      her = { anc, paint, phasedPaint: !!(paint && haps), mt: A.mtPlace(refs.MT, one(24, mode !== 'vcf' || V.mtOk)), y: sex === 'XY' ? A.yPlace(refs.Y, one(23, build !== 36)) : null };
    }
    return { heritage: her, rows, counts: CHRS.map((c, i) => [c, counts[i][0], counts[i][1]]), sex, ftype, chip, genos, pos: posMap,
      vendor, build, kind, filled, wrap: src.wrap, samples: V.samples, roh, compare: cmp };
  }

  /* Runs of homozygosity: long stretches where both copies of a chromosome carry the
     same letters, a sign that the two copies share a recent common ancestor. A run
     needs at least 1.5 Mb and 80 markers, may hold one mixed call per 100 markers
     (chip errors), and stops at gaps over 1 Mb. */
  function runsOfHomozygosity(chr, pos, geno, kind) {
    const AUTO = 2881e6, segs = [];
    let called = 0, het = 0;
    for (let c = 0; c < 22; c++) {
      const idx = [];
      for (let i = 0; i < chr.length; i++) if (chr[i] === c && pos[i] > 0) { const g = geno[i]; if (g.length === 2 && g !== '--') idx.push(i); }
      idx.sort((a, b) => pos[a] - pos[b]);
      let start = -1, last = -1, n = 0, h = 0;
      const close = () => { if (start >= 0 && n >= 80 && pos[last] - pos[start] >= 1.5e6) segs.push([c + 1, pos[start], pos[last], n]); start = -1; n = 0; h = 0; };
      for (const i of idx) {
        const g = geno[i], isHet = g[0] !== g[1];
        called++; if (isHet) het++;
        if (last >= 0 && pos[i] - pos[last] > 1e6) close();
        if (isHet) { if (start >= 0 && (h + 1) * 100 <= n) { h++; n++; last = i; continue; } close(); continue; }
        if (start < 0) start = i;
        n++; last = i;
      }
      close();
    }
    const auto = called;
    if (kind === 'chip' && auto < 100000) return { tooFew: true, markers: auto };
    const len = s => (s[2] - s[1]) / 1e6;
    const total = segs.reduce((t, s) => t + len(s), 0), long = segs.filter(s => len(s) >= 8).reduce((t, s) => t + len(s), 0);
    return { markers: auto, het: kind === 'chip' || kind === 'vcf' ? het / Math.max(auto, 1) : null, n: segs.length, totalMb: total, longMb: long,
      f: total * 1e6 / AUTO, fLong: long * 1e6 / AUTO, longest: segs.reduce((m, s) => Math.max(m, len(s)), 0),
      segs: segs.sort((a, b) => (b[2] - b[1]) - (a[2] - a[1])).slice(0, 200).map(s => [s[0], s[1], s[2]]) };
  }

  /* How closely two people are related, from markers both files read (KING-robust
     kinship, Manichaikul et al. 2010), plus opposite-homozygote calls to tell a
     parent and child from siblings. */
  function kinship(A, ids, chr, geno, p37, index) {
    let n = 0, ibs0 = 0, ibs2 = 0, hetA = 0, hetB = 0, hetBoth = 0;
    for (let i = 0; i < ids.length; i++) {
      if (chr[i] > 21) continue;
      const b = geno[i]; if (b.length !== 2 || !/^[ACGT]{2}$/.test(b)) continue;
      let j = A.index.get(ids[i]);
      if (j === undefined && p37[i]) j = A.posIndex.get(CHRS[chr[i]] + ':' + p37[i]);
      if (j === undefined) continue;
      const a = A.geno[j]; if (a.length !== 2 || !/^[ACGT]{2}$/.test(a)) continue;
      if (new Set(a + b).size > 2) continue;
      n++;
      const ha = a[0] !== a[1], hb = b[0] !== b[1];
      if (ha) hetA++; if (hb) hetB++; if (ha && hb) hetBoth++;
      const sa = a[0] < a[1] ? a : a[1] + a[0], sb = b[0] < b[1] ? b : b[1] + b[0];
      if (sa === sb) ibs2++; else if (!ha && !hb) ibs0++;
    }
    if (n < 2000) return { tooFew: true, n };
    const phi = (hetBoth - 2 * ibs0) / Math.max(hetA + hetB, 1), ibs0r = ibs0 / n;
    let rel;
    if (phi > 0.354) rel = 'same';
    else if (phi > 0.177) rel = ibs0r < 0.002 ? 'parent' : 'sibling';
    else if (phi > 0.0884) rel = 'second';
    else if (phi > 0.0442) rel = 'third';
    else if (phi > 0.0221) rel = 'fourth';
    else rel = 'none';
    return { n, phi, ibs0: ibs0r, ibs2: ibs2 / n, rel, shared: Math.max(0, Math.min(1, 2 * phi)) };
  }

  /* Every site LiberateDNA reads, on both builds, so a file on either one can be used. */
  function targets(R, curated) {
    const A = locusAnc(), U = A.unpackPanel(R.P), B = R.B38;
    const runs = s => { const o = []; for (const t of s.split(',')) { const [v, n] = t.split('*'); for (let k = 0; k < (+n || 1); k++) o.push(v === 'x' ? null : +v); } return o; };
    const list = [], byId = new Map();
    const add = t => { list.push(t); if (t.id) byId.set(t.id, t); };
    if (B) {
      const off = runs(B.panel);
      for (let i = 0; i < U.n; i++) add({ id: U.ids[i], c: U.chr[i] - 1, p37: U.pos[i], p38: off[i] == null ? 0 : U.pos[i] + off[i], ref: U.ref[i] });
      if (curated) for (const id in curated.pos) {
        const [c, p] = curated.pos[id].split(':'), ci = chrIx(c), b = B.cur[id];
        if (ci === undefined || byId.has(id)) continue;
        add({ id, c: ci, p37: +p, p38: ci === 24 ? +p : b ? b[0] : 0, ref: ci === 24 ? R.MT.ref[+p - 1] : b ? b[1] : '' });
      }
      const yo = runs(B.y); let y = 0;
      R.Y.pos.split(',').forEach((d, i) => { y += +d; if (yo[i] != null) add({ id: '', c: 23, p37: y, p38: y + yo[i], ref: '' }); });
    }
    const seen = new Set();
    R.MT.nodes.forEach(n => n[2].forEach(x => { if (!seen.has(x[0])) { seen.add(x[0]); add({ id: '', c: 24, p37: x[0], p38: x[0], ref: R.MT.ref[x[0] - 1] }); } }));
    const byChr = {}, at37 = new Set(), at38 = new Set(), from38 = new Map();
    for (const t of list) {
      (byChr[t.c] = byChr[t.c] || []).push(t.p37); if (t.p38) byChr[t.c].push(t.p38);
      if (t.c < 22) { at37.add(t.c * 4e8 + t.p37); if (t.p38) at38.add(t.c * 4e8 + t.p38); }
      if (t.p38) from38.set(t.c * 4e8 + t.p38, t.p37);
    }
    for (const c in byChr) byChr[c] = Int32Array.from(new Set(byChr[c])).sort();
    return { list, byId, byChr, at37, at38, from38 };
  }

  function search(q, limit) {
    if (!store) return [];
    q = q.trim().toLowerCase();
    const out = [];
    let m;
    if (/^(rs|i)\d{2,}$/.test(q)) {
      const exact = store.index.get(q);
      if (exact !== undefined) out.push(exact);
      for (let i = 0; i < store.ids.length && out.length < limit; i++) { const id = store.ids[i]; if (id.length > q.length && id.startsWith(q)) out.push(i); }
    } else if ((m = /^(?:chr)?(\w{1,2})[:\s]+([\d,]+)$/.exec(q)) && chrIx(m[1]) !== undefined) {
      const ci = chrIx(m[1]), p = +m[2].replace(/,/g, '');
      for (let i = 0; i < store.ids.length && out.length < limit; i++) if (store.chr[i] === ci && store.pos[i] === p) out.push(i);
    } else {
      const c = q.replace(/^chr/, '').toUpperCase();
      const ci = CHR_IX[c];
      if (ci !== undefined && c.length <= 2) for (let i = 0; i < store.ids.length && out.length < limit; i++) if (store.chr[i] === ci) out.push(i);
    }
    return out.map(i => [store.ids[i], CHRS[store.chr[i]], store.pos[i], store.geno[i]]);
  }

  self.onmessage = async e => {
    const m = e.data;
    if (m.type === 'parse') {
      try { const r = await parse(m); postMessage({ type: 'done', id: m.id, result: r }); }
      catch (err) { postMessage({ type: 'error', id: m.id, code: err.code || 'corrupt', kind: err.kind || '', wrong: !!err.wrong, aes: !!err.aes, why: err.why || String(err && err.message || err) }); }
    } else if (m.type === 'search') {
      postMessage({ type: 'search', id: m.id, q: m.q, rows: search(m.q, m.limit || 60), total: store ? store.ids.length : 0 });
    } else if (m.type === 'ref') { refs = m.ref; try { refs.T = targets(refs, m.curated); } catch (err) { refs.T = null; } }
    else if (m.type === 'drop') store = null;
  };
}
