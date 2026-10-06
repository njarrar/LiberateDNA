/* Translations.
   Every lang/*.xml file is bundled into the page at build time (LANG_XML). Each file maps
   English source text to a translation. Text in the html`` templates is translated as it
   is rendered: a run of text with values in it, such as "Compared with ${n} people", is
   looked up as "Compared with {0} people", so a translation can move the values around.
   Text built in plain JavaScript goes through t(). Anything not translated stays English. */
const I18N = (() => {
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  const packs = {};
  let cur = null, seen = null;

  function parse(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const L = doc.documentElement;
    if (!L || L.nodeName !== 'language' || doc.getElementsByTagName('parsererror').length) throw new Error('This is not a LiberateDNA language file.');
    const code = (L.getAttribute('code') || '').trim();
    if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(code)) throw new Error('The language file needs a code, such as "fr".');
    const map = new Map();
    for (const e of L.getElementsByTagName('entry')) {
      const s = e.getElementsByTagName('source')[0], t = e.getElementsByTagName('translation')[0];
      if (s && t && t.textContent.trim()) map.set(norm(s.textContent), t.textContent.trim());
    }
    return { code, sep: L.getAttribute('list-separator') || ', ', name: L.getAttribute('name') || code, english: L.getAttribute('english-name') || '', dir: L.getAttribute('dir') === 'rtl' ? 'rtl' : 'ltr', locale: L.getAttribute('locale') || code, font: L.getAttribute('font') || '', map };
  }

  const tr = s => {
    if (typeof s !== 'string') return s;
    const k = norm(s);
    if (!k || !/[A-Za-z]/.test(k)) return s;
    if (seen) seen.add(k);
    const r = cur && cur.map.get(k);
    if (r == null) return s;
    const lead = /^\s/.test(s) ? ' ' : '', trail = /\s$/.test(s) ? ' ' : '';
    return lead + r + trail;
  };
  const fill = (txt, args) => txt.replace(/\{(\d+)\}/g, (m, i) => i < args.length ? val(args[i]) : m);
  const val = v => typeof v === 'number' ? fmtNum(v) : typeof v === 'string' ? tr(v) : String(v);
  const fmtNum = v => String(v);

  /* A run of text and values inside one element. */
  function run(items) {
    const vals = [];
    let key = '';
    for (const it of items) { if (it instanceof Mk) { key += '{' + vals.length + '}'; vals.push(it.v); } else key += it; }
    if (!vals.length) return tr(key);
    const k = norm(key);
    if (/[A-Za-z]/.test(k.replace(/\{\d+\}/g, ''))) {
      if (seen) seen.add(k);
      const r = cur && cur.map.get(k);
      if (r != null) { const lead = /^\s/.test(key) ? ' ' : '', trail = /\s$/.test(key) ? ' ' : ''; return lead + fill(r, vals) + trail; }
    }
    for (const v of vals) if (seen && typeof v === 'string') seen.add(norm(v));
    return items.map(it => it instanceof Mk ? val(it.v) : tr(it)).join('');
  }

  function t(key, ...args) {
    const k = norm(key);
    if (seen) seen.add(k);
    const r = cur && cur.map.get(k);
    return fill(r != null ? r : key, args);
  }

  /* Join names with the language's own comma; with last=true the final pair is joined by "and". */
  function join(arr, last) {
    const a = arr.map(x => tr(String(x))), sep = cur ? cur.sep : ', ';
    if (!last || a.length < 2) return a.join(sep);
    return a.slice(0, -1).join(sep) + ' ' + t('and') + ' ' + a[a.length - 1];
  }
  function load(code) {
    if (code === 'en' || !packs[code]) { cur = null; return 'en'; }
    cur = packs[code]; return code;
  }
  function add(xml) { const p = parse(xml); packs[p.code] = p; return p; }
  for (const x of Object.values(typeof LANG_XML === 'object' ? LANG_XML : {})) { try { add(x); } catch (e) { console.warn(e); } }

  return {
    tr, t, run, load, add, parse, join,
    get code() { return cur ? cur.code : 'en'; },
    get dir() { return cur ? cur.dir : 'ltr'; },
    get locale() { return cur ? cur.locale : 'en-US'; },
    get fontName() { return cur ? cur.font : ''; },
    get font() { return cur && cur.font ? `'${cur.font}'` : ''; },
    get on() { return !!(cur || seen); },
    list() { return [{ code: 'en', name: 'English', english: 'English', dir: 'ltr' }].concat(Object.values(packs).filter(p => p.code !== 'en').map(p => ({ code: p.code, name: p.name, english: p.english, dir: p.dir, size: p.map.size }))); },
    collect() { seen = seen || new Set(); return seen; }
  };
})();
const t = I18N.t;

/* Values placed between pieces of text are wrapped, so a run can be looked up as a whole. */
class Mk { constructor(v) { this.v = v; } toString() { return String(this.v); } }

const html = (() => {
  const raw = htmPreact.html, h = htmPreact.h, pos = new WeakMap(), MINE = Symbol('tr');
  const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
  // For each value in a template, is it in text position (true) or inside a tag (false)?
  const where = strings => {
    const out = []; let inTag = false, q = '';
    for (let i = 0; i < strings.length; i++) {
      const s = strings[i];
      for (let j = 0; j < s.length; j++) {
        const c = s[j];
        if (inTag) { if (q) { if (c === q) q = ''; } else if (c === '"' || c === "'") q = c; else if (c === '>') inTag = false; }
        else if (c === '<' && /[A-Za-z/$!]/.test(s[j + 1] || '$')) inTag = true;
      }
      if (i < strings.length - 1) out.push(!inTag);
    }
    return out;
  };
  const kids = k => {
    const arr = Array.isArray(k) ? k : [k], out = []; let run = [];
    const flush = () => { if (run.length) { out.push(I18N.run(run)); run = []; } };
    for (const c of arr) {
      if (typeof c === 'string' || c instanceof Mk) run.push(c);
      else { flush(); out.push(Array.isArray(c) ? kids(c) : node(c)); }
    }
    flush();
    return Array.isArray(k) ? out : out[0];
  };
  const node = v => {
    if (!v || typeof v !== 'object' || !('props' in v) || v[MINE]) return v;
    const p = Object.assign({}, v.props);
    for (const a of ATTRS) if (typeof p[a] === 'string') p[a] = I18N.tr(p[a]);
    if (p.children != null) p.children = kids(p.children);
    if (v.key != null) p.key = v.key;
    if (v.ref != null) p.ref = v.ref;
    const n = h(v.type, p); n[MINE] = 1; return n;
  };
  const tag = (strings, ...vals) => {
    if (!I18N.on) return raw(strings, ...vals);
    let w = pos.get(strings); if (!w) { w = where(strings); pos.set(strings, w); }
    const v2 = vals.map((v, i) => w[i] && (typeof v === 'string' || typeof v === 'number') ? new Mk(v) : v);
    const r = raw(strings, ...v2);
    return Array.isArray(r) ? r.map(node) : node(r);
  };
  // Text that must stay as written, such as a language's own name.
  tag.keep = text => { const n = h('bdi', null, text); n[MINE] = 1; return n; };
  return tag;
})();
try { if (/[?&]i18n=collect\b/.test(location.search)) I18N.collect(); self.I18N = I18N; } catch (e) {}
