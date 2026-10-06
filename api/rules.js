/* Slop Patterns — detection rules.
   Each rule: {code, id, name, fix, test(ctx) -> null | {evidence:[string]}}
   ctx = { text, css, html, isFullDoc }
   Rules are deliberately conservative: a miss is better than a false accusation. */

const hexToHsl = h => {
  h = h.replace('#','');
  if (h.length === 3) h = h.split('').map(c=>c+c).join('');
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0,2),16)/255, g = parseInt(h.slice(2,4),16)/255, b = parseInt(h.slice(4,6),16)/255;
  const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx-mn;
  let hue = 0;
  if (d) {
    if (mx===r) hue = ((g-b)/d) % 6;
    else if (mx===g) hue = (b-r)/d + 2;
    else hue = (r-g)/d + 4;
    hue *= 60; if (hue<0) hue += 360;
  }
  const l = (mx+mn)/2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2*l - 1));
  return {h:hue, s:s*100, l:l*100};
};
const lum = h => { const c = hexToHsl(h); return c ? c.l : null; };
const all = (re, s) => { const out=[]; let m; const r=new RegExp(re.source, re.flags.includes('g')?re.flags:re.flags+'g');
  while ((m = r.exec(s)) !== null) { out.push(m); if (m.index === r.lastIndex) r.lastIndex++; } return out; };

/* ---- helpers added in v1.1.0 ---- */
let _rulesKey = null, _rulesVal = null;
const rules = css => {
  // linear scan: innermost "selector { declarations }" blocks. A regex here goes quadratic on large minified pages.
  css = String(css);
  if (css === _rulesKey) return _rulesVal;
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = []; let lastBrace = 0, selStart = 0, open = -1;
  for (let i = 0; i < src.length; i++) {
    const ch = src.charCodeAt(i);
    if (ch === 123) { selStart = lastBrace; open = i; lastBrace = i + 1; }          // {
    else if (ch === 125) {                                                          // }
      if (open >= 0) {
        const sel = src.slice(selStart, open).split(/[;\n]/).pop().trim();
        const body = src.slice(open + 1, i);
        if (sel && sel.length < 300 && !/^@/.test(sel) && /:/.test(body) && !/<\/?\w/.test(sel)) out.push({ sel, body });
      }
      open = -1; lastBrace = i + 1;
    }
  }
  _rulesKey = css; _rulesVal = out; return out;
};
const parts = sel => sel.split(',').map(x=>x.trim().toLowerCase());
const BASE_TEXT = /^(html|body|p|main p|article p|article|\.prose|\.prose p|\.content p|\.post p|\.entry-content p|\.markdown-body|\.markdown-body p)$/;
const isBase = sel => parts(sel).some(p => BASE_TEXT.test(p));
const classAttrs = html => all(/\bclass(?:Name)?\s*=\s*["'{`]([^"'`}]+)["'`}]/g, html).map(m=>m[1]);
const HEAD_SEL = /(^|[\s,>+~.#-])(h[1-6]|heading|title|headline|display|hero-title|eyebrow|label|kicker|badge|btn|button|nav)\b/i;
const sizePx = body => {
  const m = /(?:^|;|\s)font-size\s*:\s*([\d.]+)(px|rem|em)\b/i.exec(body);
  if (!m) return null;
  return m[2] === 'px' ? +m[1] : +m[1] * 16;
};
const trackEm = body => {
  const m = /letter-spacing\s*:\s*(-?[\d.]+)(em|px|rem)\b/i.exec(body);
  if (!m) return null;
  if (m[2] === 'em') return +m[1];
  const fs = sizePx(body) || 16;
  return m[2] === 'rem' ? +m[1]*16/fs : +m[1]/fs;
};
const NAMED = { white:[255,255,255], black:[0,0,0], red:[255,0,0], gray:[128,128,128], grey:[128,128,128], silver:[192,192,192] };
const parseColor = s => {
  if (!s) return null; s = String(s).trim().toLowerCase();
  let m;
  if ((m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s))) { let h = m[1]; if (h.length===3) h = h.split('').map(x=>x+x).join('');
    return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)); }
  if ((m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/.exec(s))) {
    if (m[4] !== undefined && parseFloat(m[4]) < (m[4].endsWith('%') ? 100 : 1)) return null;  // translucent: real colour unknown
    return [+m[1],+m[2],+m[3]]; }
  return NAMED[s] || null;
};
const declColor = (body, prop) => {
  const m = new RegExp('(?:^|;|\\s)'+prop+'\\s*:\\s*(#[0-9a-f]{3,6}\\b|rgba?\\([^)]*\\)|[a-z]+)\\s*(?:!important\\s*)?(?:;|$)','i').exec(body);
  return m ? parseColor(m[1]) : null;
};
const rgbToHsl = ([r,g,b]) => hexToHsl('#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''));
const hex = rgb => '#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
const relLum = rgb => { const [r,g,b] = rgb.map(v => { v/=255; return v <= 0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
  return 0.2126*r + 0.7152*g + 0.0722*b; };
const contrast = (a,b) => { const [x,y] = [relLum(a), relLum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };

/* Direct children of every element whose class satisfies pick(cls). Returns [[{tag, cls, inner}]]. */
const VOIDTAG = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
function childrenOf(html, pick){
  const stack = [], out = [];
  for (const m of all(/<(\/?)([a-z][\w-]*)\b([^<>]*)>/gi, html)) {
    const tag = m[2].toLowerCase();
    if (!m[1] && (VOIDTAG.test(tag) || /\/\s*$/.test(m[3]))) { if (stack.length) stack[stack.length-1].kids.push({tag, cls:'', start:m.index, end:m.index + m[0].length}); continue; }
    if (m[1]) {
      const node = stack.pop(); if (!node) continue;
      node.end = m.index;
      if (node.parent) node.parent.kidEnd(node, m.index + m[0].length);
      if (node.watch) out.push(node.kids.map(k => ({ tag:k.tag, cls:k.cls, inner: html.slice(k.start, k.end) })));
      continue;
    }
    const cls = (/class=["']([^"']*)["']/i.exec(m[3])||[])[1] || '';
    const parent = stack[stack.length-1];
    const node = { tag, cls, start:m.index, kids:[], watch: pick(cls, tag), parent,
      kidEnd(k, e){ const rec = this.kids.find(x => x.node === k); if (rec) rec.end = e; } };
    if (parent) parent.kids.push({ tag, cls, start:m.index, end:m.index, node });
    stack.push(node);
  }
  return out;
}

const RULES = [
{ code:'A1', id:'the-unchosen-gradient', name:'The Unchosen Gradient',
  fix:'One brand colour chosen for a reason, or a gradient someone actually picked.',
  test(c){
    // v1.2: an indigo/violet gradient counts only where the pattern lives: the hero ground, the headline
    // or a primary button. Badges, icon tiles, logo chips, data bars and hover-only layers are not it.
    const ev = [];
    // custom properties, resolved one level deep at a time (a gradient often lives in --grad on :root)
    const vars = {};
    for (const r of rules(c.css)) for (const m of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) if (!(m[1] in vars)) vars[m[1]] = m[2];
    const resolve = (s, d=0) => d > 4 ? s : s.replace(/var\(\s*(--[\w-]+)\s*(?:,([^()]*))?\)/g, (_, n, fb) => n in vars ? resolve(vars[n], d+1) : (fb || ''));
    // a stop is violet when hue 232-300, clearly saturated, and neither near-black nor pastel
    const stopCols = g => [
      ...(g.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi)||[]).map(hexToHsl),
      ...all(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)/gi, g)
          .filter(x => x[4] === undefined || parseFloat(x[4]) / (x[4].endsWith('%') ? 100 : 1) >= 0.3)
          .map(x => rgbToHsl([+x[1],+x[2],+x[3]]))].filter(Boolean);
    const violetGrad = val => {
      // colour mixed mostly into transparent is a tint, not a stop
      val = val.replace(/color-mix\(\s*in \w+\s*,\s*([^,()]+(?:\([^()]*\))?)\s+(\d+)%\s*,\s*transparent\s*\)/gi, (x, col, pct) => +pct >= 30 ? col : 'transparent');
      // all gradient layers of one background together: a violet glow over an indigo wash is one gradient to the eye
      const gs = all(/(?:linear|radial|conic)-gradient\(((?:[^()]|\([^()]*\))*)\)/gi, val);
      const chromatic = gs.flatMap(m => stopCols(m[1])).filter(s => s.s>35 && s.l>=30 && s.l<=80);
      const v = chromatic.filter(s => s.h>=232 && s.h<=300);  // indigo-500 #6366F1 sits at 239.6
      // v1.3: the violet stops must carry the gradient; a rainbow that passes through violet is another choice
      return v.length >= 2 && v.length * 2 >= chromatic.length ? gs.map(m => m[0]).join(', ').slice(0,90).replace(/\s+/g,' ') : null;
    };
    // v1.3: the element tree, so a hit can be checked against what renders (display:none ancestors) and where
    // it sits (inside the h1). Built only for whole pages.
    const tree = [];
    if (c.isFullDoc) {
      const stack = [];
      for (const m of all(/<(\/?)([a-z][\w-]*)\b([^<>]*)>/gi, c.html)) {
        const tag = m[2].toLowerCase();
        if (m[1]) { for (let k = stack.length - 1; k >= 0; k--) if (stack[k].tag === tag) { stack[k].end = m.index; stack.length = k; break; } continue; }
        const e = { tag, start: m.index, end: c.html.length, parent: stack[stack.length-1] || null,
          cls: ((/\bclass(?:Name)?\s*=\s*["']([^"']*)["']/i.exec(m[3])||[])[1] || '').split(/\s+/).filter(Boolean),
          id: (/\bid\s*=\s*["']([^"']*)["']/i.exec(m[3])||[])[1] || null };
        tree.push(e);
        if (!VOIDTAG.test(tag) && !/\/\s*$/.test(m[3])) stack.push(e);
      }
    }
    const compOf = s => { const bare = s.replace(/(?<!\\)::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g, '').replace(/(?<!\\)\[[^\]]*?(?<!\\)\]/g, '');
      return { tag: ((/^[a-z][\w-]*/i.exec(bare)||[])[0]||'').toLowerCase(), cls: all(/\.((?:\\.|[\w-])+)/g, bare).map(m => unesc(m[1])),
        id: ((/#((?:\\.|[\w-])+)/.exec(bare)||[])[1]) || null }; };
    const fits = (p, e) => (p.tag || p.cls.length || p.id) && (!p.tag || p.tag === e.tag) && p.cls.every(k => e.cls.includes(k)) && (!p.id || p.id === e.id);
    // elements a plain rule (no state, no ancestor context) removes with display:none
    const gone = new Set();
    for (const r of rules(c.css)) if (/(?:^|[;\s])display\s*:\s*none/i.test(r.body))
      for (const part of r.sel.split(/(?<!\\),/)) { const t = part.trim();
        if (!t || /[\s>+~:\[]/.test(t.replace(/\\./g, ''))) continue;
        const p = compOf(t); for (const e of tree) if (fits(p, e)) gone.add(e); }
    const shown = e => { for (let x = e; x; x = x.parent) if (gone.has(x) || x.cls.some(k => /^(?:hidden|invisible|sr-only)$/.test(k))) return false; return true; };
    const inH1 = e => { for (let x = e; x; x = x.parent) if (x.tag === 'h1') return true; return false; };
    const NEG = /badge|pill|chip|swatch|\btag\b|icon|logo|avatar|brandmark|\bdot\b|bar\b|bars\b|progress|meter|gauge|seal|scrollbar|thumb|track|tab\b|tabs\b|toggle|switch|selection|placeholder|ribbon|label/i;
    const POS = /\b(h1|hero|headline|masthead|jumbotron|btn|button|cta|primary|header|body|html|main)\b/i;
    // CSS rules: judge the element the last compound of each selector paints
    for (const r of rules(c.css)) {
      if (!/gradient\(|var\(/.test(r.body) || /(?:^|;|\s)opacity\s*:\s*0(?:[;\s]|$)/i.test(r.body)) continue;
      // inline styles are judged below with their element; a blurred layer is a decorative glow (A6), not a fill
      if (c.isFullDoc && /^\[inline-style\]/.test(r.sel)) continue;
      if (/(?:^|[;\s])(?:-webkit-)?filter\s*:[^;]*blur\(\s*(?:[1-9]\d*(?:\.\d+)?)(?:px|rem)/i.test(r.body)) continue;
      const bg = /(?:^|;|\s)background(?:-image)?\s*:\s*([^;]+)/i.exec(r.body); if (!bg) continue;
      const g = violetGrad(resolve(bg[1])); if (!g) continue;
      const textClip = /background-clip\s*:\s*text/i.test(r.body);
      const hit = r.sel.split(',').some(p => {
        const comps = p.trim().split(/\s*[\s>+~]\s*/).filter(Boolean), last = comps[comps.length-1] || '';
        if (NEG.test(last) || /brand/i.test(last) || /:hover|:focus|:active|::selection|:disabled/i.test(p)) return false;
        if (!c.isFullDoc) return POS.test(last) || textClip || !/^\[inline-style\]$/.test(last);
        // whole page: the element must be on the page and not removed by display:none
        const els = tree.filter(e => fits(compOf(last), e));
        if (els.length && !els.some(shown)) return false;
        if (POS.test(last)) return true;
        // gradient text counts as the headline gradient only in the headline (h1 or a hero/headline selector)
        return textClip && (comps.some(x => /\b(?:h1|hero|headline)\b/i.test(x)) || els.some(e => shown(e) && inH1(e)));
      });
      if (hit) ev.push(r.sel.trim().slice(0,30) + ': ' + g);
    }
    // markup: inline styles and Tailwind gradient utilities, judged by the element that carries them
    const h1s = all(/<h1\b[\s\S]*?<\/h1>/gi, c.html).map(m => [m.index, m.index + m[0].length]);
    const TWV = '(?:indigo|violet|purple|fuchsia)-(?:[2-7]00|800)(?![\\d/])';
    for (const m of all(/<([a-z][\w-]*)\b([^>]*)>/gi, c.html)) {
      const tag = m[1].toLowerCase(), a = m[2];
      const cls = (/\bclass(?:Name)?\s*=\s*["']([^"']*)["']/i.exec(a)||[])[1] || '';
      const sty = (/\bstyle\s*=\s*["']([^"']*)["']/i.exec(a)||[])[1] || '';
      let g = null;
      if (/gradient\(|var\(/.test(sty)) g = violetGrad(resolve(sty));
      if (!g && new RegExp('(?:^|\\s)from-'+TWV).test(cls) && new RegExp('(?:^|\\s)to-'+TWV).test(cls)) g = (cls.match(new RegExp('(?:^|\\s)(?:from|via|to)-'+TWV,'g'))||[]).join('').trim();
      if (!g) continue;
      // not what a visitor sees on load, or too small to be a ground or a button
      if (/(?:^|\s)opacity-0(?:\s|$)|(?:^|\s)(?:invisible|sr-only)(?:\s|$)/.test(cls) || /opacity\s*:\s*0(?:[;\s]|$)/i.test(sty)) continue;
      const sz = k => { const x = new RegExp('(?:^|\\s)'+k+'-(\\d+(?:\\.5)?|px)(?:\\s|$)').exec(cls); return x ? (x[1]==='px' ? 0.25 : +x[1]) : null; };
      const w = sz('w'), hh = sz('h'), s = sz('size');
      if ((s !== null && s <= 16) || (w !== null && w <= 16 && hh !== null && hh <= 16) || (hh !== null && hh <= 1)) continue;
      if (NEG.test(cls) || /(?:^|\s)text-(?:xs|\[1[0-2]px\])(?:\s|$)/.test(cls) || /(?:^|\s)rounded-full(?:\s|$)[\s\S]*(?:^|\s)py-(?:0|0\.5|1)(?:\s|$)/.test(cls)) continue;
      if (/^(a|button)$/.test(tag)) {   // a button is a CTA only if it says something (colour swatches and icon buttons do not)
        const close = c.html.indexOf('</'+tag, m.index);
        if (close < 0 || !/[a-z]{2}/i.test(c.html.slice(m.index + m[0].length, close).replace(/<[^>]*>/g, ' '))) continue;
      }
      const inH1 = h1s.some(([s0,e0]) => m.index >= s0 && m.index < e0);
      if (c.isFullDoc) { const e = tree.find(x => x.start === m.index); if (e && !shown(e)) continue; }
      const ok = !c.isFullDoc || inH1 || /^(h1|a|button|header|body|main)$/.test(tag) || POS.test(cls.replace(/[\w-]+:[\w-\/\[\].]+/g,''));
      if (ok) ev.push('<'+tag+(cls?' class="'+cls.slice(0,40)+'…"':'')+'> '+g);
    }
    return ev.length ? {evidence:[...new Set(ev)]} : null; } },

{ code:'A2', id:'inter-for-everything', name:'Inter For Everything',
  fix:'Choose a typeface with a reason you can say out loud.',
  test(c){
    const ev = [];
    const first = f => (f||'').split(',')[0].trim().replace(/^["']|["']$/g,'');
    let base = null; const heads = [];
    for (const r of rules(c.css)) {
      const m = /(?:^|;|\s)font-family\s*:\s*([^;]+)/i.exec(r.body); if (!m) continue;
      const p = parts(r.sel);
      if (p.some(x => /^(html|body|:root|p)$/.test(x))) base = m[1];
      if (p.some(x => /^(h1|h2|h3)$|title|headline|heading|display|hero/.test(x))) heads.push(first(m[1]));
    }
    if (c.isFullDoc) {
      // v1.1 on whole pages: Inter is the base face AND no heading is set in anything else.
      if (!base || !/^(Inter|Inter var|InterVariable|Inter Display)$/i.test(first(base))) return null;
      const loaded = /fonts\.googleapis\.com[^"']*family=Inter\b|rsms\.me\/inter|__Inter_|fonts\.bunny\.net[^"']*inter|@fontsource\/inter/i.test(c.text) || /@font-face\s*\{[^}]*font-family\s*:\s*["']?Inter/i.test(c.css);
      if (!loaded) return null;   // named in CSS but never loaded: a system font renders
      if (heads.some(h => h && !/^(Inter|Inter var|InterVariable|Inter Display|inherit)$/i.test(h) && !/^var\(/.test(h))) return null;
      return {evidence:['body in '+first(base)+', and no heading set in another face']};
    }
    for (const m of all(/font-family\s*:\s*[^;{}]*\bInter\b[^;{}]*/gi, c.css)) ev.push(m[0].replace(/\s+/g,' ').slice(0,80));
    if (/fonts\.googleapis\.com[^"']*family=Inter\b/i.test(c.text)) ev.push('Google Fonts import: family=Inter');
    return ev.length ? {evidence:ev} : null; } },

{ code:'A3', id:'three-identical-feature-cards', name:'Three Identical Feature Cards',
  fix:'Let the content decide the count, and rank them — the most important one is not the same size as the others.',
  test(c){
    // v1.2 of this entry: a 3-column grid holding exactly three same-class cards, each a visible card surface with a
    // small icon, a title and a line of text. Stat rows, pricing plans, logo, image, video and screenshot grids, and
    // rows where one card carries a modifier (--highlight, featured) are other patterns or none.
    const grid3 = new Set();
    for (const r of rules(c.css)) if (/grid-template-columns\s*:\s*repeat\(\s*3\s*,|grid-template-columns\s*:\s*(?:[\d.]+fr\s+){2}[\d.]+fr\s*(?:;|$)/i.test(r.body))
      for (const m of all(/\.((?:\\.|[\w-])+)/g, r.sel.split(/[\s>+~]/).pop())) grid3.add(unesc(m[1]));
    const isGrid3 = cls => cls.split(/\s+/).some(k => grid3.has(k) || /^(?:(?:sm|md|lg|xl):)?grid-cols-3$/.test(k));
    // classes that CSS gives a surface (background, border, shadow or radius)
    const surfCls = new Set();
    for (const r of rules(c.css)) if (/(?:^|;|\s)(?:background(?:-color)?\s*:\s*(?!\s*(?:none|transparent|inherit)\b)|border(?:-width)?\s*:\s*(?!\s*(?:none|0)\b)|box-shadow\s*:\s*(?!\s*none\b)|border-radius\s*:\s*[1-9])/i.test(r.body))
      for (const m of all(/\.((?:\\.|[\w-])+)/g, r.sel.split(/[\s>+~]/).pop())) surfCls.add(unesc(m[1]));
    const TWSURF = /^(?:[\w-]+:)*(?:border(?:-[2-8]|-\[[^\]]+\])?|border-(?!0\b|none\b|transparent\b|[blrtxy]\b|[blrtxy]-)[\w\[\]#\/.-]+|bg-(?!transparent\b|none\b|clip|gradient|cover|center|no-repeat|fixed)[\w\[\]#\/.-]+|shadow(?:-(?!none\b)[\w\[\]#\/.-]+)?|ring(?:-[\w\[\]#\/.-]+)?|rounded(?:-[\w\[\]]+)?)$/;
    const hasSurface = cls => cls.split(/\s+/).some(k => k && (TWSURF.test(k) || surfCls.has(k) || /card|panel|tile|box\b/i.test(k)));
    // a card's surface may sit on a single wrapper inside it (Tailwind UI: <div class="pt-6"><div class="rounded-lg bg-gray-50">)
    const onlyChildCls = inner => {
      const body = inner.replace(/^<[^>]*>/, '').replace(/<\/[a-z][\w-]*>\s*$/i, '');
      let depth = 0, tops = 0, cls = '';
      for (const m of all(/<(\/?)([a-z][\w-]*)\b([^<>]*)>/gi, body)) {
        if (VOIDTAG.test(m[2]) || /\/\s*$/.test(m[3])) { if (!depth) tops++; continue; }
        if (m[1]) { depth--; continue; }
        if (!depth) { tops++; cls = (/class=["']([^"']*)["']/i.exec(m[3]) || [,''])[1]; }
        depth++;
      }
      return tops === 1 ? cls : '';
    };
    // large media: screenshots, thumbnails, video, phone frames
    const bigMedia = inner => /<(?:video|iframe|picture|canvas)\b|\baspect-(?:video|square|\[)|aspect-ratio\s*:|data-nimg=["']fill/i.test(inner)
      || all(/<img\b[^>]*>/gi, inner).some(m => { const t = m[0];
        const w = /\swidth=["']?(\d+)/i.exec(t), h = /\sheight=["']?(\d+)/i.exec(t);
        return (w && +w[1] > 96) || (h && +h[1] > 96) || /class=["'][^"']*\b(?:w-full|h-full|object-cover|inset-0)\b/i.test(t); });
    const words = s => s.replace(/<(script|style)[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').split(/\s+/).filter(w => /[a-z]/i.test(w)).length;
    const MOD = /(?:^|\s)(?:[\w-]*[a-z0-9]--[a-z][\w-]*|is-(?:active|selected|featured|highlighted)|featured|highlight(?:ed)?|popular|recommended)(?=\s|$)/i;
    const ev = [];
    for (const kids of childrenOf(c.html, isGrid3)) {
      if (kids.length !== 3 || !kids.every(k => /^(div|article|li|section|figure|a)$/.test(k.tag))) continue;
      const first = kids.map(k => k.cls.split(/\s+/)[0]);
      if (!first[0] || !first.every(f => f === first[0])) continue;
      // one card marked as a variant (--highlight, featured): the row is deliberately ranked
      const mods = kids.map(k => (MOD.exec(k.cls) || [''])[0].trim());
      if (mods.some(m => m && !mods.every(x => x === m))) continue;
      const cardish = k => /<h[2-5]\b|<strong\b|<b\b|font-(semibold|bold|medium)/i.test(k.inner) && /<p\b|<span\b/i.test(k.inner)
        && !/\$\s?\d|\/mo\b|per month|\/month/i.test(k.inner.replace(/<[^>]+>/g,' ')) && words(k.inner) >= 5;
      const icon = k => /<svg\b|<img\b|<i\b|class=["'][^"']*icon|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/iu.test(k.inner);
      const plain = k => !bigMedia(k.inner);
      const surface = k => hasSurface(k.cls) || hasSurface(onlyChildCls(k.inner));
      if (kids.every(cardish) && (!c.isFullDoc || (kids.every(icon) && kids.every(plain) && kids.every(surface))))
        ev.push('3-column grid holding exactly three .'+first[0]+' cards (icon, title, text)');
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,2)} : null; } },

{ code:'A6', id:'aurora-blob-backdrop', name:'Aurora Blob Backdrop',
  fix:'If the background is decoration, let it be quiet. If it means something, make it mean something.',
  test(c){
    // v1.2: a blob is a blurred (>= 30px), round, absolutely/fixed positioned shape that actually paints a
    // saturated colour (var() resolved; undefined vars paint nothing). It counts as the pattern when two or
    // more sit together (one element's ::before + ::after, or sibling shapes in one section), or when one sits
    // behind the hero / as a fixed page backdrop. A lone glow behind a mid-page screenshot is not it.
    const vars = {};
    for (const r of rules(c.css)) for (const m of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) if (!(m[1] in vars)) vars[m[1]] = m[2];
    const resolve = (s, d=0) => d > 4 ? s : s.replace(/var\(\s*(--[\w-]+)\s*(?:,((?:[^()]|\([^()]*\))*))?\)/g, (_, n, fb) => n in vars ? resolve(vars[n], d+1) : (fb ? resolve(fb, d+1) : ' none '));
    const chroma = rgb => { const h = rgbToHsl(rgb); return h && h.s >= 30 && h.l >= 20 && h.l <= 85; };
    // v1.3: how strongly a value paints: the highest alpha of its saturated colours (0 when none). Blobs at
    // 3-6% alpha change a dark ground by a few levels and are not seen, so a blob must reach 7% after opacity.
    const MIN_A = 0.07;
    const glow = val => {
      val = resolve(val).replace(/color-mix\(\s*in \w+\s*,\s*([^,()]+(?:\([^()]*\))?)\s*([\d.]+%)?\s*,\s*transparent\s*\)/gi,
        (x, col, pct) => pct ? col.replace(/^#([0-9a-f]{6})$/i, (y, h) => 'rgba(' + [0,2,4].map(k => parseInt(h.slice(k,k+2),16)).join(',') + ',' + parseFloat(pct)/100 + ')') : col);
      let best = 0;
      for (const m of all(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi, val)) { let h = m[1]; if (h.length <= 4) h = h.split('').map(x=>x+x).join('');
        const a = parseInt(h.slice(6,8)||'ff',16) / 255; if (a > best && chroma([0,2,4].map(i=>parseInt(h.slice(i,i+2),16)))) best = a; }
      for (const m of all(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)/gi, val)) {
        const a = m[4] === undefined ? 1 : +m[4] / (m[5] ? 100 : 1); if (a > best && chroma([+m[1],+m[2],+m[3]])) best = a; }
      return best;
    };
    const colourful = val => glow(val) > 0;
    const twOpacity = cls => cls.split(/\s+/).reduce((p, k) => { const m = /^opacity-(?:(\d+)|\[([\d.]+)(%?)\])$/.exec(k);
      return m ? p * (m[1] ? +m[1]/100 : +m[2] / (m[3] || +m[2] > 1 ? 100 : 1)) : p; }, 1);
    const twAlpha = sfx => !sfx ? 1 : sfx[0] === '[' ? parseFloat(sfx.slice(1)) / (/%/.test(sfx) || parseFloat(sfx.slice(1)) > 1 ? 100 : 1) : +sfx / 100;
    // the ground under an element: its own or an ancestor's colour, or an earlier full-cover layer (absolute inset-0)
    // of an ancestor; then the page ground. true = dark, false = light, null = unknown
    const TWSHADE = { black: 0, white: 100 };
    const lightOf = (cls, style) => {
      const base = cls.replace(/(?:^|\s)[\w-]+:[^\s]+/g, ' ');
      let m = /(?:^|\s)(?:bg|from)-(black|white)(?:\s|$)/.exec(base); if (m) return TWSHADE[m[1]];
      if ((m = /(?:^|\s)(?:bg|from)-[a-z]+-(50|[1-9]00|950)(?:\s|$)/.exec(base))) return +m[1] >= 800 ? 10 : +m[1] <= 300 ? 90 : 50;
      if ((m = /(?:^|\s)(?:bg|from)-\[(#[0-9a-f]{3,6})\](?:\s|$)/i.exec(base))) { const x = parseColor(m[1]); return x ? rgbToHsl(x).l : null; }
      if ((m = /(?:^|;|\s)background(?:-color)?\s*:\s*(#[0-9a-f]{3,6}\b|rgb\([^)]*\)|black|white)/i.exec(style))) { const x = parseColor(m[1]); return x ? rgbToHsl(x).l : null; }
      return null;
    };
    const tree = [], byStart = new Map();
    if (c.isFullDoc) {
      const stack = [];
      for (const m of all(/<(\/?)([a-z][\w-]*)\b([^<>]*)>/gi, c.html)) {
        const tag = m[2].toLowerCase();
        if (m[1]) { for (let k = stack.length - 1; k >= 0; k--) if (stack[k].tag === tag) { stack.length = k; break; } continue; }
        const parent = stack[stack.length-1] || null;
        const t = { tag, start: m.index, parent, kids: [], cls: (/\bclass(?:Name)?\s*=\s*["']([^"']*)["']/i.exec(m[3])||[])[1] || '',
          style: (/\bstyle\s*=\s*["']([^"']*)["']/i.exec(m[3])||[])[1] || '' };
        if (parent) parent.kids.push(t);
        tree.push(t); byStart.set(m.index, t);
        if (!VOIDTAG.test(tag) && !/\/\s*$/.test(m[3])) stack.push(t);
      }
    }
    let pageL = null;
    for (const r of rules(c.css)) if (r.sel.split(',').some(p => /^(?:html|body|:root)$/i.test(p.trim()))) {
      const m = /(?:^|;|\s)background(?:-color)?\s*:\s*(#[0-9a-f]{3,6}\b|rgb\([^)]*\)|black|white)/i.exec(resolve(r.body)); if (m) { const x = parseColor(m[1]); if (x) pageL = rgbToHsl(x).l; } }
    const groundDark = i => {
      const t = byStart.get(i); if (!t) return null;
      for (let x = t; x; x = x.parent) {
        if (x !== t) { const l = lightOf(x.cls, x.style); if (l !== null) return l < 25; }
        const p = x.parent; if (!p) break;
        for (const sib of p.kids) { if (sib === x) break;
          if (/(?:^|\s)(?:absolute|fixed)(?:\s|$)/.test(sib.cls) && /(?:^|\s)inset-0(?:\s|$)/.test(sib.cls)) { const l = lightOf(sib.cls, sib.style); if (l !== null) return l < 25; } }
      }
      const b = tree.find(x => x.tag === 'body'); const bl = b ? lightOf(b.cls, b.style) : null;
      return bl !== null ? bl < 25 : pageL !== null ? pageL < 25 : null;
    };
    // multiply/darken can only darken: on a dark ground the blob paints nothing
    const blendsAway = (body, cls, i) => (/mix-blend-mode\s*:\s*(?:multiply|darken)/i.test(body) || /(?:^|\s)mix-blend-(?:multiply|darken)(?:\s|$)/.test(cls)) && groundDark(i) === true;
    const TW_HUE = /(?:^|\s)(?:bg|from|via|to)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:[3-9]00|950)\b/i;   // 50-200 shades are pastel tints, not coloured light
    // elements
    const els = all(/<([a-z][\w-]*)\b([^>]*)>/gi, c.html).map(m => {
      const a = m[2];
      return { i: m.index, tag: m[1].toLowerCase(), clsRaw: (/\bclass(?:Name)?\s*=\s*["']([^"']*)["']/i.exec(a)||[])[1] || '',
        id: (/\bid\s*=\s*["']([^"']*)["']/i.exec(a)||[])[1] || null, style: (/\bstyle\s*=\s*["']([^"']*)["']/i.exec(a)||[])[1] || '' };
    });
    for (const e of els) e.cls = new Set(e.clsRaw.split(/\s+/).filter(Boolean));
    const parseComp = comp => {
      const pseudo = ((/::?(before|after)\b/i.exec(comp)||[])[1]||'').toLowerCase();
      const bare = comp.replace(/::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g, '');
      return { pseudo, tag: ((/^[a-z][\w-]*/i.exec(bare)||[])[0]||'').toLowerCase(),
        cls: all(/\.((?:\\.|[\w-])+)/g, bare).map(m => m[1].replace(/\\/g,'')), id: (/#([\w-]+)/.exec(bare)||[])[1] || null,
        sub: all(/\[class\*=["']?([\w-]+)["']?\]/g, bare).map(m => m[1]) };
    };
    const matches = (p, e) => (p.tag ? p.tag === e.tag : true) && p.cls.every(k => e.cls.has(k)) && (!p.id || p.id === e.id)
      && p.sub.every(s => e.clsRaw.includes(s)) && (p.tag || p.cls.length || p.id || p.sub.length);
    const parsed = rules(c.css).filter(r => !/^\[inline-style\]/.test(r.sel)).flatMap(r => r.sel.split(',').map(part => {
      const comps = part.trim().split(/\s*[\s>+~]\s*/).filter(Boolean);
      return { r, last: parseComp(comps[comps.length-1] || ''), ctx: comps.length > 1 };
    }));
    const blurPx = b => { const m = /(?:^|[;\s{])filter\s*:[^;]*?\bblur\(\s*([\d.]+)(px|rem)/i.exec(b); return m ? (m[2]==='rem' ? +m[1]*16 : +m[1]) : 0; };
    // hero region: before the first headline closes, or inside a hero/masthead container or <header>
    const h1end = (/<\/h1>/i.exec(c.html)||{index:-1}).index;
    const heroRanges = els.filter(e => e.tag === 'header' || /(?:^|[\s_-])(?:hero|masthead|jumbotron)(?:$|[\s_-])/i.test(e.clsRaw + ' ' + (e.id||''))).map(e => {
      const re = new RegExp('<(/?)' + e.tag + '\\b[^>]*>', 'gi'); re.lastIndex = e.i + 1; let d = 1, x;
      while (d && (x = re.exec(c.html))) d += x[1] ? -1 : 1;
      return [e.i, d ? c.html.length : x.index];
    });
    const inHero = i => (h1end >= 0 && i < h1end) || heroRanges.some(([a,b]) => i >= a && i < b);
    const inst = [];   // {i, pseudo, fixed}
    const seen = new Set();
    for (const s of parsed) {
      const px = blurPx(s.r.body); if (px < 30 || !s.last.pseudo && !s.last.cls.length && !s.last.id && !s.last.sub.length) continue;
      // a CSS-only snippet has no markup to place the shape in: judge the rule on its own
      const pool = (!c.isFullDoc && !els.some(e => matches(s.last, e))) ? [{ i: -1 - parsed.indexOf(s), tag: s.last.tag, cls: new Set(s.last.cls), clsRaw: s.last.cls.join(' ') + ' ' + s.last.sub.join(' '), id: s.last.id, style: '', snippet: true }] : els;
      for (const e of pool) {
        if (!e.snippet && !matches(s.last, e) || seen.has(e.snippet ? s.r.sel + s.r.body : e.i + s.last.pseudo)) continue;
        if (e.snippet) seen.add(s.r.sel + s.r.body);
        // everything that paints this element (or its pseudo) from rules without ancestor context, in source order
        const mine = e.snippet ? [s] : parsed.filter(q => q.last.pseudo === s.last.pseudo && matches(q.last, e) && (!q.ctx || q === s));
        const body = mine.map(q => q.r.body).join(';') + ';' + (s.last.pseudo ? '' : e.style);
        const disp = all(/(?:^|[;\s])display\s*:\s*([\w-]+)/gi, body).map(m => m[1]).pop();
        if (disp === 'none') continue;
        if (!/border-radius\s*:\s*(?:50%|100%|\d{3,}px|\d+(?:\.\d+)?rem|9999px)\s*(?:!important\s*)?(?:;|$)/im.test(body.replace(/;/g, ';\n'))) continue;
        const pos = all(/(?:^|[;\s])position\s*:\s*(absolute|fixed)/gi, body).map(m => m[1].toLowerCase());
        if (!pos.length) continue;
        const bgs = all(/(?:^|[;\s])background(?:-color|-image)?\s*:\s*([^;]+)/gi, body).map(m => m[1]);
        const op = all(/(?:^|[;\s])opacity\s*:\s*([\d.]+)(%?)/gi, body).map(m => +m[1] / (m[2] ? 100 : 1)).pop();
        const a = Math.max(0, ...bgs.map(glow)) * (op !== undefined ? op : s.last.pseudo ? 1 : twOpacity(e.clsRaw));
        if (a < MIN_A || !e.snippet && blendsAway(body, e.clsRaw, e.i)) continue;
        seen.add(e.i + s.last.pseudo);
        inst.push({ i: e.i, el: e.i, pseudo: s.last.pseudo, fixed: pos.includes('fixed') || !!e.snippet, what: (s.r.sel.split(',').find(p => p) || '').trim().slice(0,40) + ' blur(' + px + 'px)' });
      }
    }
    // Tailwind form: absolute rounded-full blur-2xl/3xl/[>=30px] with a chromatic colour utility
    for (const e of els) {
      if (!/(?:^|\s)(absolute|fixed)(?:\s|$)/.test(e.clsRaw) || !/(?:^|\s)rounded-full(?:\s|$)/.test(e.clsRaw)) continue;
      const b = /(?:^|\s)blur-(2xl|3xl|\[(\d+)px\])(?:\s|$)/.exec(e.clsRaw); if (!b) continue;
      if (b[2] && +b[2] < 30) continue;
      if (/(?:^|\s)(?:opacity-0|hidden|invisible)(?:\s|$)/.test(e.clsRaw)) continue;
      const base = e.clsRaw.replace(/(?:^|\s)[\w-]+:[^\s]+/g, ' ');   // variants (hover:, dark:) are not the load state
      const arb = /(?:^|\s)(?:bg|from|via|to)-\[(#[0-9a-f]{3,6})\]/i.exec(base);
      if (!TW_HUE.test(base) && !(arb && colourful(arb[1])) && !colourful(e.style)) continue;
      // strongest colour utility (bg-blue-500/20, from-[#c8ff00]/[0.04]) or inline colour, times opacity-*
      let a = glow(e.style);
      for (const m of all(/(?:^|\s)(?:bg|from|via|to)-(?:([a-z]+-(?:[3-9]00|950))|\[(#[0-9a-f]{3,6})\])(?:\/(\d+|\[[\d.]+%?\]))?(?=\s|$)/gi, base)) {
        if (m[1] ? !TW_HUE.test(' bg-' + m[1]) : !colourful(m[2])) continue;
        a = Math.max(a, twAlpha(m[3]));
      }
      if (a * twOpacity(base) < MIN_A || blendsAway('', base, e.i)) continue;
      const w = /(?:^|\s)w-(\d+)(?:\s|$)/.exec(base);
      if (w && +w[1] < 48) continue;   // under 192px: a dot of light, not a backdrop
      inst.push({ i: e.i, el: e.i, pseudo: '', fixed: /(?:^|\s)fixed(?:\s|$)/.test(e.clsRaw), what: 'rounded-full ' + b[0].trim() + ' blob' });
    }
    if (!inst.length) return null;
    inst.sort((a,b) => a.i - b.i);
    const ev = [];
    for (const x of inst) if (x.fixed || inHero(x.i)) ev.push(x.what + (x.fixed ? (x.i < 0 ? '' : ' (fixed backdrop)') : ' behind the hero'));
    // two or more together: same element (::before + ::after) or no section boundary between them
    for (let k = 1; k < inst.length; k++) {
      const a = inst[k-1], b = inst[k];
      if (a.el === b.el || !/<\/?section\b/i.test(c.html.slice(a.i, b.i))) ev.push(a.what + ' + ' + b.what);
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A7', id:'permanent-midnight', name:'Permanent Midnight',
  fix:'Ship a light theme, or respect prefers-color-scheme. Dark by decree is a choice made for the user.',
  test(c){
    // v1.2: the page's own ground (unscoped html/body/:root, or a bg utility on <body>) is near-black, the
    // copy is mid-grey, and the page offers no light theme at all: no prefers-color-scheme, no class/data-attribute
    // theme (Tailwind dark:, Bootstrap data-bs-theme, data-theme), no theme toggle.
    if (!c.isFullDoc) return null;              // needs the whole document to be fair
    if (/prefers-color-scheme/i.test(c.css)) return null;
    const R = rules(c.css);
    // any theme mechanism means a light theme exists (or the dark one is opt-in)
    if (R.some(r => /\[data-(?:bs-)?(?:theme|mode|color-scheme|color-mode)\b|\[theme=|(?:^|[\s,(])(?:html|body|:root)?\.(?:light|dark|theme-[\w-]+|light-mode|dark-mode)\b/i.test(r.sel))) return null;
    if (/(?:^|\s)dark:[\w-]/m.test(c.classes)) return null;
    if (/<(?:button|a|input|label|div|span)\b[^>]*(?:aria-label|title|id|class|data-[\w-]+)\s*=\s*["'][^"']*(?:theme[-_ ]?(?:toggle|switch|switcher|picker|button)|toggle[-_ ]?theme|dark[-_ ]?mode|light[-_ ]?mode|colou?r[-_ ]?(?:scheme|mode))/i.test(c.html)) return null;
    if (/<script\b[^>]*>[\s\S]*?(?:classList\.(?:toggle|add|remove)\(\s*["'](?:dark|light)["']|setAttribute\(\s*["']data-(?:bs-)?theme|dataset\.theme|localStorage\.(?:get|set)Item\(\s*["'][^"']*theme)/i.test(c.text)) return null;
    // custom properties from unscoped roots only (a [data-theme] block is another theme, not the default)
    const vars = {};
    const ROOT = /^(?::root|html|body|html\s*>?\s*body)$/i;
    for (const r of R) if (r.sel.split(',').some(p => ROOT.test(p.trim()))) for (const m of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) vars[m[1]] = m[2];
    const resolve = (s, d=0) => d > 4 ? s : s.replace(/var\(\s*(--[\w-]+)\s*(?:,([^()]*))?\)/g, (_, n, fb) => n in vars ? resolve(vars[n], d+1) : (fb || ''));
    const firstCol = v => { const m = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([^)]*\)|\b(?:black|white)\b/i.exec(resolve(v)); return m ? parseColor(m[0]) : null; };
    let bg = null, fg = null, bgSrc = '';
    for (const r of R) {
      if (!r.sel.split(',').some(p => ROOT.test(p.trim()))) continue;
      const b = all(/(?:^|[;\s])background(?:-color)?\s*:\s*([^;]+)/gi, r.body).map(m => firstCol(m[1])).filter(Boolean).pop();
      if (b) { bg = b; bgSrc = r.sel.trim(); }
      const f = all(/(?:^|[;\s])color\s*:\s*([^;]+)/gi, r.body).map(m => firstCol(m[1])).filter(Boolean).pop();
      if (f) fg = f;
    }
    // Tailwind: a dark bg utility on <body> (or the first full-height wrapper)
    const bodyCls = (/<body\b[^>]*\bclass\s*=\s*["']([^"']*)["']/i.exec(c.html)||[])[1] || '';
    const TWDARK = { black:[0,0,0], 'gray-950':[3,7,18], 'gray-900':[17,24,39], 'zinc-950':[9,9,11], 'zinc-900':[24,24,27], 'slate-950':[2,6,23], 'slate-900':[15,23,42], 'neutral-950':[10,10,10], 'neutral-900':[23,23,23], 'stone-950':[12,10,9], 'stone-900':[28,25,23] };
    const tw = /(?:^|\s)bg-(black|(?:gray|zinc|slate|neutral|stone)-9[05]0|\[(#[0-9a-f]{3,6})\])(?:\s|$)/i.exec(bodyCls);
    if (tw) { bg = tw[2] ? parseColor(tw[2]) : TWDARK[tw[1].toLowerCase()]; bgSrc = 'body.bg-' + tw[1]; }
    if (!bg) return null;
    const bl = rgbToHsl(bg); if (!bl || bl.l >= 20) return null;
    // "every section the same dark slab": a light section, band or page wrapper means the page is not dark-only
    const lightSurf = v => { const x = firstCol(v); const h = x && rgbToHsl(x); return h && h.l >= 70; };
    for (const r of R) {
      const last = r.sel.split(',').map(p => p.trim().split(/\s*[\s>+~]\s*/).pop() || '');
      if (!last.some(l => /^(?:section|main|article)\b|(?:^|[.#_-])(?:section|main|wrapper|page|content|band|layout|global)(?:$|[\s_.:-])/i.test(l) && !/:(?:hover|focus|active|disabled)|card|btn|button|input/i.test(l))) continue;
      if (all(/(?:^|[;\s])background(?:-color)?\s*:\s*([^;]+)/gi, r.body).some(m => lightSurf(m[1]))) return null;
    }
    if (/<(?:section|main|article)\b[^>]*\bclass\s*=\s*["'](?:[^"']*\s)?bg-(?:white|(?:gray|zinc|slate|neutral|stone)-(?:50|100))(?:\s|["'])/i.test(c.html)) return null;
    // grey copy: body/paragraph text in a low-saturation mid tone (not white, not a brand colour).
    // Translucent white text over the ground is grey too.
    const col = v => {
      v = resolve(v);
      const m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*[,/]\s*([\d.]+)(%?)\s*\)/i.exec(v);
      if (m) { const al = +m[4] / (m[5] ? 100 : 1); return al > 0 ? [1,2,3].map((k,j) => Math.round(+m[k]*al + bg[j]*(1-al))) : null; }
      return firstCol(v);
    };
    const grey = x => { const h = x && rgbToHsl(x); return h && h.s < 30 && h.l >= 35 && h.l <= 78; };
    const greys = [];
    if (fg && grey(fg)) greys.push(hex(fg));
    const textCls = new Set();
    for (const m of all(/<(?:p|li)\b[^>]*\bclass\s*=\s*["']([^"']*)["']/gi, c.html)) for (const k of m[1].split(/\s+/)) if (k) textCls.add(k);
    for (const r of R) {
      const last = r.sel.split(',').map(p => p.trim().split(/\s*[\s>+~]\s*/).pop() || '');
      if (!last.some(l => /^p$|^p[.:]/i.test(l) || /(?:^|[.-])(?:muted|secondary|subtle|lead|subtitle|tagline|body-text|text-body)\b/i.test(l)
        || all(/\.((?:\\.|[\w-])+)/g, l).some(k => textCls.has(k[1].replace(/\\/g,''))))) continue;
      const f = all(/(?:^|[;\s])color\s*:\s*([^;]+)/gi, r.body).map(m => col(m[1])).filter(Boolean).pop();
      if (grey(f)) greys.push(hex(f));
    }
    const TWG = '\\btext-(?:(?:gray|zinc|slate|neutral|stone)-[3-5]00|white\\/(?:[3-7]\\d|\\[0?\\.[3-7]\\d?\\]))(?![\\w/-])';
    const twP = all(new RegExp('<(?:p|li)\\b[^>]*\\bclass\\s*=\\s*["\'][^"\']*' + TWG, 'gi'), c.html).length;
    const twS = all(new RegExp('<(?:span|div)\\b[^>]*\\bclass\\s*=\\s*["\'][^"\']*' + TWG, 'gi'), c.html).length;
    if (twP || twS >= 3) greys.push((twP + twS) + ' text elements in Tailwind grey');
    if (!greys.length) return null;
    return {evidence:['page ground ' + hex(bg) + ' (' + bgSrc.slice(0,30) + '), grey copy ' + greys.slice(0,2).join(', ') + ', and no light theme, toggle or prefers-color-scheme']}; } },

{ code:'A8', id:'frosted-glass-cards', name:'Frosted Glass Cards',
  fix:'Glass is a material, not a default. Use it where depth is real, and check the contrast of text sitting on it.',
  test(c){
    // v1.2 of this entry: glass on CARDS. A blurred sticky header or a modal scrim is a different, defensible use, and so is
    // glass on controls (buttons, inputs, close/arrow handles, badges), on product mockups that imitate OS material, and on
    // overlays sitting over live media (video, canvas, viewers) where the blur does a job.
    const ev=[];
    const skip = /nav|header|menu|toolbar|topbar|appbar|modal|overlay|backdrop|dialog|drawer|sheet|popover|tooltip|dropdown|scrim|sticky|fixed|btn|button|input|link|close|badge|pill|chip|tag\b|arrow|handle|icon|legend|toast|cookie|consent|dock|hud|control|toggle|caption|label|scroll/i;
    const MOCK = /mock|phone|iphone|ipad|device|lock-?screen|simulator|viewer|canvas|player|video|webgl|visuali[sz]er|three|xr\b/i;
        // ---- b2 local helper: a light element tree (tag, classes, id, attrs, ancestors, visible text length) ----
    const T = c._b2tree || (c._b2tree = (html => {
      const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
      const root = { tag:'#root', cls:[], attrs:'', parent:null, text:0, kids:[] }, list = []; let cur = root;
      const re = /<(\/?)([a-z][\w-]*)\b([^<>]*)>|([^<]+)/gi; let m;
      while ((m = re.exec(html))) {
        if (m[4] !== undefined) { cur.text += m[4].replace(/&[#\w]+;/g,'x').replace(/\s+/g,'').length; continue; }
        const tag = m[2].toLowerCase();
        if (m[1]) { let n = cur; while (n !== root && n.tag !== tag) n = n.parent; if (n === root) continue;
          while (cur !== n) { cur.parent.text += cur.text; cur = cur.parent; } cur.parent.text += cur.text; cur = cur.parent; continue; }
        const a = m[3];
        const node = { tag, attrs:a, parent:cur, text:0, kids:[],
          cls: ((/\bclass\s*=\s*["']([^"']*)["']/i.exec(a)||[])[1]||'').split(/\s+/).filter(Boolean),
          id: (/\bid\s*=\s*["']([^"']*)["']/i.exec(a)||[])[1] || null,
          style: (/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(a)||[]).slice(1).find(x=>x!==undefined) || '' };
        cur.kids.push(node); list.push(node);
        if (!VOID.test(tag) && !/\/\s*$/.test(a) && !/^(script|style)$/.test(tag)) cur = node;
      }
      while (cur !== root) { cur.parent.text += cur.text; cur = cur.parent; }
      const byCls = new Map(); for (const n of list) for (const k of n.cls) { if (!byCls.has(k)) byCls.set(k, []); byCls.get(k).push(n); }
      return { root, list, byCls };
    })(c.html));
    // elements matching the last compound of one selector part (".a .b.c", "main.app", "#x")
    const matchEls = part => {
      const last = part.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g,'').replace(/::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g,'').replace(/\[[^\]]*\]/g,'').trim().split(/\s*[\s>+~]\s*/).pop() || '';
      const tag = ((/^[a-z][\w-]*/i.exec(last)||[])[0]||'').toLowerCase();
      const cs = all(/\.((?:\\.|[\w-])+)/g, last).map(x => x[1].replace(/\\(.)/g,'$1'));
      const id = (/#((?:\\.|[\w-])+)/.exec(last)||[])[1];
      const pool = cs.length ? (T.byCls.get(cs[0]) || []) : T.list;
      if (!cs.length && !id && !tag) return [];
      return pool.filter(n => (!tag || n.tag === tag) && cs.every(k => n.cls.includes(k)) && (!id || n.id === id));
    };
    const ancestors = n => { const out = []; for (let p = n.parent; p && p.tag !== '#root'; p = p.parent) out.push(p); return out; };
    // custom properties, so var(--glass-bg) can be judged
    const vars = {}; for (const r of rules(c.css)) for (const v of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) if (!(v[1] in vars)) vars[v[1]] = v[2].trim();
    const resolve = s => { for (let i = 0; i < 4 && /var\(/.test(s); i++) s = s.replace(/var\(\s*(--[\w-]+)\s*(?:,([^()]*))?\)/g, (_, k, d) => vars[k] || d || ''); return s; };
    // the most opaque layer of a background: <= 0.6 is translucent. A colour with no alpha is opaque.
    const maxAlpha = bg => {
      bg = resolve(bg); let mx = 0, any = false;
      for (const m of all(/(?:rgba?|hsla?)\(((?:[^()]|\([^()]*\))*)\)|#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\btransparent\b|\b(white|black)\b/gi, bg)) {
        any = true; let a = 1;
        if (m[1] !== undefined) { const p = /(?:,|\/)\s*([\d.]+)(%?)\s*$/.exec(m[1].trim()); if (p && (p[2] || (m[1].split(',').length === 4 || /\//.test(m[1])))) a = p[2] ? +p[1]/100 : +p[1]; }
        else if (m[2] !== undefined) a = m[2].length === 8 ? parseInt(m[2].slice(6),16)/255 : m[2].length === 4 ? parseInt(m[2][3]+m[2][3],16)/255 : 1;
        else if (/transparent/i.test(m[0])) a = 0;
        mx = Math.max(mx, a);
      }
      return any ? mx : null;   // null: no colour we can read (an image or an unresolved variable)
    };
    const glassBody = body => {
      const m = /(?:-webkit-)?backdrop-filter\s*:\s*[^;]*blur\(\s*([\d.]+)/i.exec(body); if (!m || +m[1] < 4) return null;
      if (/position\s*:\s*(fixed|sticky)/i.test(body)) return null;
      const bg = /background(?:-color)?\s*:\s*([^;]+)/i.exec(body);
      const a = bg ? maxAlpha(bg[1]) : 0;
      if (a !== null ? a > 0.6 : bg && /url\(/i.test(bg[1])) return null;
      if (!/border-(?:[\w-]*-)?radius\s*:\s*(?:[1-9]|var\()/i.test(body)) return null;
      return Math.round(+m[1]);
    };
    // a card: a block element that holds a passage of text, is not a control, and is not part of a mockup or media overlay
    const CTRL = /^(a|button|input|select|textarea|label|span|img|svg|i|summary|option|video|canvas|iframe)$/;
    // r3: things that are glass for a reason, recognised by structure rather than by class name
    const FRAME = /(?:^|[-_\s])(?:frame|screenshot|preview|browser|window|chrome)s?(?:[-_\s]|$)/i;   // named screenshot/app frames
    const desc = (n, out = []) => { for (const k of n.kids) { out.push(k); desc(k, out); } return out; };
    // a nav bar without a nav class: two or more links/buttons hold nearly all of its words (logo + Features + Talk to Us)
    const linkBar = n => { const ls = desc(n).filter(k => /^(a|button)$/.test(k.tag) && !k.kids.some(x => /^(p|h[1-6]|li)$/.test(x.tag)));
      const top = ls.filter(k => !ancestors(k).some(a => ls.includes(a)));
      return top.length >= 2 && top.reduce((s, k) => s + k.text, 0) >= 0.75 * n.text; };
    // a working tool: code editor, configurator, playground (text areas, sliders, pickers, selects, code output)
    const toolPanel = n => desc(n).some(k => /^(textarea|select)$/.test(k.tag) || (k.tag === 'input' && /\btype\s*=\s*["']?(range|color|checkbox|radio|number)/i.test(k.attrs)));
    // a browser/app window mockup: traffic-light dots (three empty sibling leaves) near the top, or a URL in its title bar
    // traffic lights: three empty leaves, alike except for their colour (skeleton bars of different widths are not dots)
    const look = x => x.tag + '|' + x.cls.filter(k => !/^(?:[\w-]+:)?bg-/.test(k)).sort().join(' ') + '|' + x.style.replace(/background(?:-color)?\s*:[^;]*;?/gi, '').replace(/\s+/g, '');
    const dotLeaf = (x, first) => !x.kids.length && x.text === 0 && look(x) === look(first) && !/^(img|svg|br|hr|input|source)$/.test(x.tag);
    const windowChrome = n => desc(n).slice(0, 14).some(k => k.kids.length >= 3 && !/^(svg|g|defs|mask|clippath|symbol|pattern|select|ul|ol)$/i.test(k.tag) && k.kids.slice(0, 3).every(x => dotLeaf(x, k.kids[0])) && !(k.kids[3] && dotLeaf(k.kids[3], k.kids[0])));
    // an interactive diagram/visualiser: a drawn <svg> layer beside the parts, with labels but no prose
    const diagram = n => n.kids.some(k => k.tag === 'svg' && desc(k).some(x => /^(path|line|polyline)$/.test(x.tag)) && !/(^|\s)(?:icon|w-\d|h-\d|size-\d)/.test(k.cls.join(' ')))
      && !desc(n).some(k => /^(p|h[1-6]|li|blockquote)$/.test(k.tag) && k.text >= 20);
    // a frame around a picture: the image is the content, the words are at most a caption
    const mediaFrame = n => desc(n).some(k => /^(img|picture|figure|video)$/.test(k.tag) && (k.parent.text === 0 || /^(figure|picture)$/.test(k.parent.tag))) && n.text < 40 && !desc(n).some(k => /^h[1-6]$/.test(k.tag));
    const isCard = n => {
      if (CTRL.test(n.tag) && !(n.tag === 'a' && n.kids.some(k => /^(div|p|h[1-6]|blockquote|figure|section|article)$/.test(k.tag)))) return false;
      if (n.text < 8) return false;
      if (/\brole\s*=\s*["'](?:button|dialog|listbox|tooltip|menu|status|alert)/i.test(n.attrs)) return false;
      const chain = [n, ...ancestors(n)];
      if (chain.some(p => MOCK.test(p.cls.join(' ') + ' ' + (p.id||'')) || /^(video|canvas)$/.test(p.tag))) return false;
      if (n.parent && n.parent.kids.some(k => /^(video|canvas|iframe)$/.test(k.tag))) return false;   // sits over live media
      if (FRAME.test(n.cls.join(' ')) || linkBar(n) || toolPanel(n) || windowChrome(n) || diagram(n) || mediaFrame(n)) return false;
      return true;
    };
    for (const r of rules(c.css)) {
      if (r.sel === '[inline-style]') continue;    // inline styles are judged on their element below
      if (/::/.test(r.sel) || skip.test(r.sel)) continue;
      const px = glassBody(r.body); if (px === null) continue;
      if (c.isFullDoc || T.list.length) {
        const els = r.sel.split(',').flatMap(matchEls);
        if (c.isFullDoc && !els.some(isCard)) continue;
        if (!c.isFullDoc && els.length && !els.some(isCard)) continue;
      }
      ev.push(r.sel.trim().slice(0,30)+': rounded, translucent card with backdrop-filter blur('+px+'px)');
    }
    for (const n of T.list) {
      if (!/backdrop-filter/i.test(n.style) || skip.test(n.cls.join(' '))) continue;
      const px = glassBody(n.style); if (px !== null && isCard(n)) ev.push('<'+n.tag+'> inline style: rounded, translucent card with backdrop-filter blur('+px+'px)');
    }
    // Tailwind: alpha of the background utility (bg-white/10, bg-[#111]/40, bg-black/[0.3]); a bg without one is opaque
    const twAlpha = cls => { let a = 0;
      for (const x of cls) { if (/^(?:[\w-]+:)/.test(x)) continue; const m = /^bg-(?!clip|gradient|linear|radial|none|cover|contain|center|fixed|no-repeat|origin|blend)(.+?)(?:\/(\d+|\[[\d.]+%?\]))?$/.exec(x); if (!m) continue;
        if (/^(?:transparent)$/.test(m[1])) continue;
        const v = m[2] === undefined ? 1 : /^\[/.test(m[2]) ? (/%/.test(m[2]) ? parseFloat(m[2].slice(1))/100 : parseFloat(m[2].slice(1))) : +m[2]/100;
        a = Math.max(a, v); }
      return a; };
    const cards = T.list.filter(n => { const k = n.cls.join(' ');
      return /\bbackdrop-blur(-\w+)?\b/.test(k) && /(?:^|\s)rounded-(?:lg|xl|2xl|3xl|\[[\d.]+(?:px|rem)\])(?:\s|$)/.test(k) && twAlpha(n.cls) <= 0.6 && !/\b(fixed|sticky)\b/.test(k) && !skip.test(n.cls.filter(x => !/^(?:[\w-]+:)?(?:backdrop|bg|rounded|border|shadow|ring|text|p[xytblr]?|m[xytblr]?)-/.test(x)).join(' ')) && isCard(n); });
    if (cards.length >= 2) ev.push(cards.length+' rounded cards with backdrop-blur');
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A10', id:'gradient-text-headline', name:'Gradient Text Headline',
  fix:'Let the words carry the emphasis. Gradient text fails at small sizes, in high contrast mode, and when copied.',
  test(c){
    // v1.2: the gradient must land on visible headline text: an h1/h2 (or text inside one), a 48px+ display line,
    // or a 32px+ stat number. Logos/wordmarks (inside a link, nav, footer or a logo/brand box), small inline
    // labels, pseudo-element decorations and one-colour "gradients" (currentColor texture clips) do not count.
    const html = c.html;
    // ---- one-colour gradients: every stop is currentColor or the same RGB (alpha ignored) ----
    const multiColour = body => {
      for (const g of all(/(?:linear|radial|conic)-gradient\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/gi, body)) {
        const cols = all(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|var\(--[\w-]+\)|\bcurrentColor\b|\b(?:white|black|transparent|red|blue|green|purple|pink|orange|yellow|cyan|magenta|violet|indigo|teal|gold|silver|gray|grey)\b/gi, g[1])
          .map(m => m[0].toLowerCase().replace(/\s+/g, '')).filter(x => x !== 'transparent');
        if (cols.every(x => x === 'currentcolor')) continue;
        if (new Set(cols).size >= 2 || cols.some(x => /^var\(/.test(x))) return true;
      }
      return false;
    };
    const vars = {};
    for (const r of rules(c.css)) for (const m of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) if (!(m[1] in vars)) vars[m[1]] = m[2];
    const resolve = body => body.replace(/var\((--[\w-]+)[^)]*\)/g, (s, v) => (vars[v] && /gradient\(/i.test(vars[v])) ? vars[v] : s);
    const isGradText = body => /background-clip\s*:\s*text/i.test(body) && /gradient\(/i.test(body = resolve(body)) && multiColour(body);
    // ---- light DOM: open tags with parent links and close positions ----
    const nodes = [], stack = [];
    for (const m of all(/<(\/?)([a-z][\w-]*)\b([^<>]*)>/gi, html)) {
      const tag = m[2].toLowerCase();
      if (m[1]) { for (let k = stack.length - 1; k >= 0 && k >= stack.length - 6; k--) if (stack[k].tag === tag) { stack[k].end = m.index; stack.length = k; break; } continue; }
      const n = { tag, attrs: m[3], start: m.index, open: m.index + m[0].length, end: -1, parent: stack[stack.length - 1] || null };
      n.cls = ' ' + ((/\bclass(?:Name)?\s*=\s*["']([^"']*)["']/i.exec(m[3]) || [])[1] || '') + ' ';
      n.id = (/\bid\s*=\s*["']([^"']*)["']/i.exec(m[3]) || [])[1] || '';
      nodes.push(n);
      if (!VOIDTAG.test(tag) && !/\/\s*$/.test(m[3])) stack.push(n);
    }
    const textOf = n => n.end < 0 ? '' : html.slice(n.open, n.end).replace(/<[^>]+>/g, ' ').replace(/&\w+;|&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
    const up = n => { const a = []; for (let p = n.parent; p && a.length < 40; p = p.parent) a.push(p); return a; };
    const BRAND = /(?:^|[-_])(?:logo|logotype|brand|branding|wordmark|navbar|sitename|site-name|site-title)(?:$|[-_])/i;
    const isBrand = n => [n, ...up(n)].some((p, i) => (i > 0 && /^(a|nav|footer|button)$/.test(p.tag)) || (i < 4 && (p.cls + ' ' + p.id).split(/\s+/).some(k => !/[[(]/.test(k) && BRAND.test(k))));
    // font size from matching rules / inline style / tailwind classes
    const pxOf = v => { const m = /([\d.]+)(px|rem|em)\b/.exec(v); return m ? (m[2] === 'px' ? +m[1] : +m[1] * 16) : 0; };
    const fsBody = b => { const m = /(?:^|[;\s{])font-size\s*:\s*([^;]+)/i.exec(b); if (!m) return 0;
      const v = m[1]; if (/clamp\(|max\(|min\(/.test(v)) { const xs = all(/[\d.]+(?:px|rem|em)\b/g, v).map(x => pxOf(x[0])); return xs.length ? Math.max(...xs) : 0; } return pxOf(v); };
    const TW = { '3xl':30, '4xl':36, '5xl':48, '6xl':60, '7xl':72, '8xl':96, '9xl':128 };
    const compMatch = (comp, n) => {
      const t = /^([a-z][\w-]*|\*)?/i.exec(comp)[0].toLowerCase();
      if (t && t !== '*' && t !== n.tag) return false;
      const cl = all(/\.([\w-]+)/g, comp).map(x => x[1]), id = (/#([\w-]+)/.exec(comp) || [])[1];
      if (!t && !cl.length && !id) return false;
      return cl.every(k => n.cls.includes(' ' + k + ' ')) && (!id || n.id === id);
    };
    const sizeRules = rules(c.css).filter(r => /font-size/i.test(r.body) && !/\[inline-style\]/.test(r.sel));
    const fontPx = n => {
      let px = fsBody((/\bstyle\s*=\s*["']([^"']*)["']/i.exec(n.attrs) || [])[1] || '');
      for (const m of all(/(?:^|\s)(?:[a-z]+:)?text-(\d?xl)\b/g, n.cls)) px = Math.max(px, TW[m[1]] || 0);
      for (const m of all(/(?:^|\s)(?:[a-z]+:)?text-\[([\d.]+(?:px|rem))\]/g, n.cls)) px = Math.max(px, pxOf(m[1]));
      for (const r of sizeRules) for (const p of r.sel.split(',')) {
        const last = p.trim().split(/\s*[\s>+~]\s*/).pop().replace(/:(?:hover|focus|active|visited|first-child|last-child)\b/g, '');
        if (!/::?(?:before|after)/.test(last) && compMatch(last, n)) { px = Math.max(px, fsBody(r.body)); break; }
      }
      return px;
    };
    const headline = n => {
      const t = textOf(n); if (!/[\p{L}\p{N}]{2}/u.test(t)) return null;
      if (isBrand(n)) return null;
      const chain = [n, ...up(n)];
      if (chain.some(p => /^h[12]$/.test(p.tag))) return t;
      // text-sized by itself or by its nearest block
      const px = Math.max(fontPx(n), n.parent && /^(span|em|strong|b|i|mark)$/.test(n.tag) ? fontPx(n.parent) : 0);
      if (px >= 48 || (px >= 32 && chain.some(p => /^h[3-4]$/.test(p.tag)))) return t;
      if (px >= 32 && t.length <= 10 && /\d/.test(t)) return t;
      return null;
    };
    const ev = [];
    const push = (what, n, t) => ev.push(what + ' on <' + n.tag + '> "' + t.slice(0, 50) + '"');
    // CSS rules
    for (const r of rules(c.css)) {
      if (!isGradText(r.body)) continue;
      if (/\[inline-style\]/.test(r.sel)) continue;
      for (const p of r.sel.split(',')) {
        const sel = p.trim();
        if (/::|:(?:before|after)\b|&/.test(sel) || /logo|brand|wordmark|skeleton|nav|menu|footer/i.test(sel)) continue;
        const comps = sel.split(/\s*[\s>+~]\s*/);
        const last = comps.pop().replace(/:[\w-]+(\([^)]*\))?/g, '').replace(/\[[^\]]*\]/g, '');
        // ancestors in the selector must also be present on the element's chain
        const anc = comps.map(x => x.replace(/:[\w-]+(\([^)]*\))?/g, '').replace(/\[[^\]]*\]/g, '')).filter(Boolean);
        for (const n of nodes) {
          if (!compMatch(last, n)) continue;
          const chain = up(n); if (!anc.every(a => chain.some(q => compMatch(a, q)))) continue;
          const t = headline(n); if (t) { push(sel.slice(0, 30) + ': background-clip:text gradient', n, t); break; }
        }
        if (ev.length) break;
      }
      if (ev.length >= 2) break;
    }
    // inline styles and tailwind utilities on the element itself
    for (const n of nodes) {
      if (ev.length >= 2) break;
      const st = (/\bstyle\s*=\s*["']([^"']*)["']/i.exec(n.attrs) || [])[1] || '';
      const inl = st && isGradText(st);
      const tw = /\sbg-clip-text\s/.test(n.cls) && /\s(?:[a-z]+:)?(?:bg-gradient-to-|bg-linear-to-|bg-\[linear-gradient|from-)/.test(n.cls) && !/logo|brand|nav/i.test(n.cls);
      if (!inl && !tw) continue;
      const t = headline(n); if (t) push(inl ? 'inline background-clip:text gradient' : 'tailwind bg-clip-text gradient', n, t);
    }
    if (!c.isFullDoc && !ev.length) {
      // snippets may be partial markup: keep the plain CSS signal on a headline-looking selector
      for (const r of rules(c.css)) if (isGradText(r.body) && /(^|[\s,>.#-])(h[12]|hero|headline|title|display)\b/i.test(r.sel) && !/logo|brand|nav/i.test(r.sel)) { ev.push(r.sel.trim().slice(0,30)+': background-clip:text over a gradient'); break; }
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,2)} : null; } },

{ code:'A12', id:'the-bento-reflex', name:'The Bento Reflex',
  fix:'Vary the spans by importance, or use a plain grid. Rhythm is not a ranking.',
  test(c){
    if (!c.isFullDoc) {
      const spans = all(/grid-(?:column|row)\s*:\s*span\s*\d/gi, c.css).length + all(/\b(?:col|row)-span-\d\b/g, c.text).length;
      const grid = /grid-template-columns|grid-cols-\d/i.test(c.text);
      return (grid && spans >= 3) ? {evidence:[spans+' explicit span declarations inside one grid']} : null;
    }
    // v1.1 on whole pages: one grid whose rounded tiles use at least two different spans.
    const kidsOf = childrenOf(c.html, cls => /(^|\s)grid(\s|$)/.test(cls));
    for (const kids of kidsOf) {
      if (kids.length < 4) continue;
      const spans = kids.map(k => (/(?:^|\s)(?:(?:sm|md|lg|xl):)?(col|row)-span-(\d)/.exec(k.cls) || [])[0]).filter(Boolean);
      const rounded = kids.filter(k => /\brounded-(?:lg|xl|2xl|3xl)\b/.test(k.cls)).length;
      if (spans.length >= 2 && new Set(spans.map(s=>s.trim())).size >= 2 && rounded >= 3)
        return {evidence:['grid of '+kids.length+' rounded tiles with mixed spans ('+[...new Set(spans.map(s=>s.trim()))].slice(0,3).join(', ')+')']};
    }
    return null; } },

{ code:'A15', id:'emoji-as-icons', name:'Emoji As Icons',
  fix:'One real icon set, consistent stroke and grid, with text labels rather than icon-only meaning.',
  test(c){
    // v1.1 of this entry: a system of emoji icons (three or more labelled uses), not one emoji on a page.
    // v1.3: user content and simulated product UI are not the page's icon system. Removed before matching:
    // code and terminal output (pre/code/kbd/samp and terminal/console windows), quotes and reviews, and chat
    // transcripts, found by name (chat, message, bot, assistant, slack, bubble...) or by structure (a header row
    // holding a sender name and a clock time such as "12:35 PM"). Emoji that are the whole content of a button
    // (emoji pickers, reactions) and emoji in the middle of a sentence are not icons leading a label. A system means
    // three different emoji, or two used six or more times (a check/cross comparison list), not a repeated heart.
    let html = c.html;
    // element tree with source offsets, so whole elements can be removed
    const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
    const tree = h => { const root = { tag:'#root', kids:[], cls:'', start:0, end:h.length, own:'' }; let cur = root; const list = [];
      const re = /<(\/?)([a-z][\w-]*)\b([^<>]*)>|([^<]+)/gi; let m;
      while ((m = re.exec(h))) {
        if (m[4] !== undefined) { cur.own += m[4]; continue; }
        const tag = m[2].toLowerCase();
        if (m[1]) { let n = cur; while (n !== root && n.tag !== tag) n = n.parent; if (n === root) continue;
          while (cur !== n) { cur.end = m.index; cur = cur.parent; } n.end = m.index + m[0].length; cur = n.parent; continue; }
        const node = { tag, attrs:m[3], cls:((/\b(?:class|id)\s*=\s*["']([^"']*)["']/i.exec(m[3])||[])[1]||'') + ' ' + ((/\bid\s*=\s*["']([^"']*)["']/i.exec(m[3])||[])[1]||''),
          parent:cur, kids:[], start:m.index, end:h.length, own:'' };
        cur.kids.push(node); list.push(node);
        if (!VOID.test(tag) && !/\/\s*$/.test(m[3])) cur = node; else node.end = m.index + m[0].length;
      }
      return list; };
    const USER = /(?:^|[\s_-])(?:testimonials?|tweets?|reviews?|comments?|quotes?|chats?|messages?|msgs?|bots?|assistants?|slack|discord|transcripts?|conversations?|bubbles?|replies|reply|terminal|console|shell)(?=$|[\s_-])/i;
    const TIME = /^\s*\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?\s*$/i;
    const cut = [];
    const list = tree(html);
    for (const n of list) {
      if (/^(pre|code|kbd|samp|blockquote|q|footer|nav|select|menu|textarea)$/.test(n.tag) || USER.test(n.cls)) { cut.push([n.start, n.end]); continue; }
      // a chat message header: a clock time next to a short sender name; the message is the header's parent
      if (TIME.test(n.own) && !n.kids.length && n.parent && n.parent.kids.length >= 2 && n.parent.kids.length <= 5) {
        const msg = n.parent.parent; if (msg && msg.tag !== '#root') cut.push([msg.start, msg.end]); }
    }
    cut.sort((a, b) => a[0] - b[0]);
    let own = '', at = 0; for (const [s, e] of cut) { if (s < at) { at = Math.max(at, e); continue; } own += html.slice(at, s) + ' '; at = e; } own += html.slice(at);
    let n = 0; const seen = new Set();
    for (const m of all(/(<\/?([a-z][\w-]*)\b[^>]*>)\s*([\u{1F300}-\u{1FAFF}\u{2600}-\u{2712}\u{2718}-\u{27BF}\u{2B00}-\u{2BFF}][\u{FE0F}]?)\s*((?:<[^>]+>\s*)*)[A-Za-z]/gu, own)) {
      const e = m[3];
      if (/[\u{2713}-\u{2717}]/u.test(e)) continue;
      if (!/\p{Emoji_Presentation}/u.test(e) && !/\u{FE0F}/u.test(e)) continue;
      // mid-sentence: the emoji follows the close of an inline run ("click the <b>Plus</b> ➕ icon")
      if (/^<\/(?:strong|b|em|i|u|span|a|mark|small|font|code)>$/i.test(m[1]) || /^<br\b/i.test(m[1])) continue;
      // the whole content of a button or option (a picker or reaction), not an icon beside a label
      if (/<\/(?:button|option)>/i.test(m[4])) continue;
      n++; seen.add(e); }
    return (n >= 3 && (seen.size >= 3 || (seen.size >= 2 && n >= 6))) ? {evidence:[n+' labels led by emoji: '+[...seen].slice(0,6).join(' ')]} : null; } },

{ code:'A16', id:'sparkles-means-magic', name:'Sparkles Means Magic',
  fix:'Name the capability. "Summarise", "Draft", "Find" tell the user what happens; a sparkle does not.',
  test(c){
    // A sparkle counts only when it marks an AI feature: the label it sits in (same block, or the first text after it)
    // names AI. A sparkle on a FAQ item, an empty state, a "clean output" pane or a category list is decoration.
    const AI = /(?<![.\w/-])AI(?![.\w])|\b(?:artificial intelligence|apple intelligence|generat(?:e|es|ed|ive|ion|or)|copilot|assistant|chat ?bot|GPT|LLMs?|smart (?:reply|compose|suggest\w*|write|search)|magic (?:write|edit|compose|fill)|auto-?(?:complete|generate|write|draft|summar\w+)|summari[sz]e|write (?:this|it|that) for you|machine learning)\b/i;
    const BLOCK = /^(div|li|p|button|a|h[1-6]|td|th|section|article|label|figcaption|dt|dd|summary|header|footer|nav|ul|ol|main|aside|form|tr|table|blockquote)$/i;
    const html = c.html.replace(/<(pre|code|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi, m => ' '.repeat(m.length));
    const clean = s => s.replace(/&\w+;/g, ' ').replace(/\s+/g, ' ').trim();
    // text of the label holding position [s, e): same-block text before it, plus text after it up to the block that closes once text has been seen
    const label = (s, e) => {
      let before = '';
      for (let i = s - 1, n = 0; i >= 0 && n < 3000; i--, n++) {
        if (html[i] === '>') { const o = html.lastIndexOf('<', i); const t = /^<\/?([a-z][\w-]*)/i.exec(html.slice(o, i + 1));
          if (t && BLOCK.test(t[1])) break; i = o; continue; }
        before = html[i] + before;
      }
      let after = '', re = /<(\/?)([a-z][\w-]*)\b[^>]*>|[^<]+/gi; re.lastIndex = e; let m;
      while ((m = re.exec(html)) && re.lastIndex - e < 4000) {
        if (m[2]) { if (BLOCK.test(m[2]) && /\S{2}/.test(after.replace(/\s/g, ''))) break; continue; }
        after += m[0]; if (after.length > 200) break;
      }
      return clean(before).slice(-80) + ' | ' + clean(after).slice(0, 120);
    };
    const ev = [];
    const hit = (what, s, e) => { const t = label(s, e), w = AI.exec(t); if (w) ev.push(what + ' labelling "' + w[0] + '": ' + t.slice(0, 140)); return !!w; };
    // the emoji as page text
    for (const m of all(/\u{2728}\u{FE0F}?/gu, html)) {
      if (html.lastIndexOf('<', m.index) > html.lastIndexOf('>', m.index)) continue;   // inside a tag (attribute value)
      if (hit('✨', m.index, m.index + m[0].length)) break;
    }
    // icon references: class, data-lucide/data-icon/name/icon attributes, image file names or alt text, JSX components, Material "auto_awesome"
    const ICON = /(?:\b(?:class(?:Name)?|data-lucide|data-icon|icon|name|src|alt)\s*=\s*["'{][^"'}>]*?\b(?:lucide-)?(sparkles?|wand-sparkles|magic-?wand|auto[-_]awesome|sparkle(?:%20|[-_ ])wand)\b)|<(Sparkles|WandSparkles|MagicWand|AutoAwesome)\b|>\s*(auto_awesome)\s*</gi;
    for (const m of all(ICON, html)) {
      const nm = m[1] || m[2] || m[3];
      const s = m[3] ? m.index + 1 : html.lastIndexOf('<', m.index);
      let e = m[3] ? m.index + m[0].length - 1 : html.indexOf('>', m.index) + 1;
      if (/^<svg\b/i.test(html.slice(s, s + 4))) { const z = html.indexOf('</svg>', e); if (z > 0) e = z + 6; }
      if (hit('sparkle icon "' + nm + '"', s, e)) break;
    }
    return ev.length ? {evidence:[...new Set(ev)]} : null; } },

{ code:'A18', id:'the-builder-s-watermark', name:"The Builder's Watermark",
  fix:'Remove it, or own it. A badge nobody chose tells visitors the product was assembled, not made.',
  test(c){
    // A watermark is a credit line, not a sentence: either the builder's name links to the builder's site
    // ("Powered by <a href=webflow.com>Webflow</a>") or the phrase is a short stand-alone badge.
    // Prose that mentions a builder ("components generated by v0.dev", a listing titled "built with v0")
    // is not a watermark, nor is the builder's own site crediting itself ("Made by Lovable").
    const DOM = { lovable:'lovable\\.(?:dev|app)|gptengineer\\.app', bolt:'bolt\\.new|stackblitz\\.com', v0:'v0\\.(?:dev|app)|vercel\\.com', replit:'replit\\.(?:com|app|dev)',
      framer:'framer\\.(?:com|website)', webflow:'webflow\\.(?:com|io)', bubble:'bubble\\.io', softr:'softr\\.(?:io|app)', durable:'durable\\.co' };
    const own = ((/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)/i.exec(c.html) || /<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)/i.exec(c.html) || [])[1] || '');
    const host = (/^https?:\/\/([^\/]+)/i.exec(own) || [])[1] || '';
    const BLOCK = /^(div|li|p|button|a|h[1-6]|td|th|section|article|label|figcaption|span|small|footer|header|nav|ul|ol)$/i;
    const html = c.html;
    const gap = '(?:\\s|&nbsp;|<[^>]*>)+';
    const RE = new RegExp('\\b(Made|Built|Created|Generated|Powered|Edit|Hosted)' + gap + '(with|by|in|on)' + gap + '(Lovable|Bolt|v0|Replit|Framer|Webflow|Bubble|Softr|Durable)(?![\\w-])', 'gi');
    const blockText = (s, e) => {               // text of the smallest block element around [s, e)
      let a = s, depth = 0;
      for (let i = s; i > Math.max(0, s - 2000); i--) {
        if (html[i] !== '<') continue; const t = /^<(\/?)([a-z][\w-]*)/i.exec(html.slice(i, i + 40)); if (!t || !BLOCK.test(t[2])) continue;
        if (t[1]) depth++; else if (depth) depth--; else { a = i; break; }
      }
      let b = e; depth = 0;
      const re = /<(\/?)([a-z][\w-]*)\b[^>]*>/gi; re.lastIndex = e; let m;
      while ((m = re.exec(html)) && m.index < e + 2000) { if (!BLOCK.test(m[2])) continue; if (!m[1]) depth++; else if (depth) depth--; else { b = m.index; break; } }
      return html.slice(a, b).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    };
    const ev = [];
    for (const m of all(RE, html)) {
      if (/^(made|built|created)$/i.test(m[1]) && /^by$/i.test(m[2])) continue;          // authorship credit, not a tool badge
      const b = m[3].toLowerCase(), dom = new RegExp(DOM[b], 'i');
      if (host && dom.test(host) && !/webflow\.io$/i.test(host)) continue;               // the builder's own site
      if (c.isFullDoc && html.lastIndexOf('<', m.index) > html.lastIndexOf('>', m.index)) continue;   // inside an attribute
      const tail = m[0].slice(m[0].search(new RegExp(m[2] + '(?:\\s|&nbsp;|<)', 'i')));
      const linked = new RegExp('<a\\b[^>]*href=["\'][^"\']*(?:' + DOM[b] + ')', 'i').test(tail);
      const text = blockText(m.index, m.index + m[0].length);
      if (linked || text.length <= 40 || !c.isFullDoc) ev.push(text.length <= 80 ? text : m[0].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
    }
    return ev.length ? {evidence:[...new Set(ev)]} : null; } },

{ code:'A19', id:'leftover-lorem', name:'Leftover Lorem',
  fix:'Write the real sentence, or leave the space visibly empty so it gets filled.',
  test(c){
    // Leftover filler is a run of the Latin itself ("Lorem ipsum dolor sit amet", "Lorem Ipsum is simply dummy text"),
    // in page text a visitor can reach. Not: the words "Lorem Ipsum" as a subject (a generator tool), sample values in
    // code blocks, specimen text on a page that presents itself as a theme, template, demo, library, CSS framework or
    // style guide, or filler inside an element that never renders (display:none with no way to reveal it).
    const title = ((/<title[^>]*>([^<]*)/i.exec(c.html) || [])[1] || '') + ' ' + ((/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(c.html) || [])[1] || '').replace(/<[^>]*>/g, ' ');
    if (c.isFullDoc && /\b(themes?|templates?|demo|design system|ui kit|components?|library|plugin|framework|style ?guide|typography|specimen|ipsum|placeholder|filler|dummy text|css|\w+\.?js)\b/i.test(title)) return null;
    const body = (/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(c.html) || [, c.html])[1]
      .replace(/<(pre|code|textarea|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<meta\b[^>]*>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    // Classes a stylesheet sets to display:none. A compound (".quiz-link._3erd") hides an element carrying all its
    // classes, unless another rule with at least as many of the element's classes gives it a display again
    // (".d-none.d-md-block", ".infobox.is-open", a breakpoint that shows it): that is toggled or responsive, not dead.
    const hide = [], show = [];
    for (const r of rules(c.css)) {
      if (r.sel === '[inline-style]') continue;
      const d = /(?:^|;|\s)display\s*:\s*([\w-]+)/i.exec(r.body); if (!d) continue;
      for (const p of r.sel.split(',')) {
        const comp = p.trim().split(/[\s>+~]+/).pop() || '';
        if (/[:\[#]/.test(comp.replace(/^[a-z][\w-]*/i, ''))) continue;          // states, attributes, ids: not a plain class rule
        const cs = all(/\.((?:\\.|[\w-])+)/g, comp).map(m => m[1].replace(/\\(.)/g, '$1'));
        if (!cs.length) continue;
        // a component's own rule, not a bulk hide list (print sheets) or a breakpoint/utility helper
        const own = !/[\s>+~]/.test(p.trim()) && r.sel.split(',').length <= 2 &&
          !cs.some(k => /(?:^|[-_])(?:xs|sm|md|lg|xl|xxl|mobile|desktop|destop|tablet|phone|print|landscape|portrait|hide|hidden|none|invisible)(?:$|[-_])/i.test(k));
        if (d[1].toLowerCase() !== 'none') show.push(cs); else if (own) hide.push(cs);
      }
    }
    const classHidden = cls => hide.some(h => h.every(k => cls.includes(k)) &&
      !show.some(s => s.length >= h.length && s.every(k => cls.includes(k))));
    // display:none is also how accordions, FAQ answers, menus, tabs, info panels and form-success screens wait for a
    // click; those are reachable. Elsewhere hidden markup is dead.
    const REVEAL = /\b[\w-]*(?:faq|accordion|collaps|expand|toggle|drop|menu|answer|tab-?pane|tabpanel|infobox|tooltip|popover|popup|modal|dialog|details?|more|inactive|success|done|thank)[\w-]*\b|\sdata-w-id\b|\saria-controls\b/i;
    const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr|path|circle|rect|line|polygon|use)$/i;
    const stack = []; let text = '', last = 0;
    for (const m of all(/<(\/?)([a-z][\w-]*)\b([^<>]*)>/gi, body)) {
      const top = stack[stack.length - 1];
      if (!top || !top.hidden) text += ' ' + body.slice(last, m.index);
      last = m.index + m[0].length;
      const tag = m[2].toLowerCase();
      if (m[1]) { const i = stack.map(x => x.tag).lastIndexOf(tag); if (i >= 0) stack.length = i; continue; }
      if (VOID.test(tag) || /\/\s*$/.test(m[3])) continue;
      const a = m[3], cls = ((/\bclass\s*=\s*["']([^"']*)["']/i.exec(a) || [])[1] || '').split(/\s+/).filter(Boolean);
      const rv = REVEAL.test(a) ? 3 : (top ? top.rv - 1 : 0);
      const inlineNone = /\bstyle\s*=\s*["'][^"']*display\s*:\s*none/i.test(a);
      const hidden = (top && top.hidden) || (rv <= 0 && (inlineNone || (cls.length > 0 && classHidden(cls))));
      stack.push({ tag, hidden, rv });
    }
    if (!(stack.length && stack[stack.length - 1].hidden)) text += ' ' + body.slice(last);
    text = text.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    // a product or item knowingly named "Lorem Ipsum <Noun>" marks the lorem around it as deliberate sample data
    if (/(?:^|[>\s])Lorem Ipsum (?!Dolor|Is\b|Generator)[A-Z][a-z]{2,}\s*</.test(body)) return null;
    const ev = all(/\bLorem\s+ipsum\s+(?:dolor\s+sit|is\s+simply\s+dummy)\b[^<"']{0,50}/gi, text).map(m => m[0].trim().slice(0, 70));
    return ev.length ? {evidence:[...new Set(ev)]} : null; } },

{ code:'B31', id:'the-clickable-div', name:'The Clickable Div',
  fix:'Use a <button>. If it must be a div, it needs role="button", tabIndex={0} and a keydown handler.',
  test(c){
    const ev=[];
    // Not the pattern: (1) a modal/menu backdrop that closes on outside click — Esc and a close button are the
    // keyboard path, and the backdrop itself should not be a tab stop; (2) a handler that only scrolls the page,
    // whose effect a keyboard user already gets by scrolling.
    const isBackdrop = (attrs, handler) =>
      /\b(?:event|e|ev|evt)\.target\s*={2,3}\s*(?:this|\w+\.currentTarget)|\b(?:this|\w+\.currentTarget)\s*={2,3}\s*(?:event|e|ev|evt)\.target/.test(handler) ||
      (/\b(?:id|class)\s*=\s*["'][^"']*(?:backdrop|overlay|scrim|-bd\b|\bbd\b|modal|mask|lightbox)/i.test(attrs) && /\b(?:close|hide|dismiss)/i.test(handler));
    const scrollOnly = handler => /scroll(?:IntoView|To|By)?\s*\(/.test(handler) &&
      !/\b(?:play|toggle|open|show|submit|fetch|location|classList|style|src)\b/i.test(handler.replace(/scroll\w*\s*\([^)]*\)|\{[^}]*\}|querySelector\([^)]*\)|getElementById\([^)]*\)/g, ''));
    for (const m of all(/<(div|span)\b([^>]*\son(?:C|c)lick\s*=[^>]*)>/gi, c.html)) {
      const attrs = m[2];
      if (/\brole\s*=/.test(attrs) || /\btab(?:I|i)ndex\s*=/.test(attrs)) continue;
      const h = (/\son(?:C|c)lick\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/.exec(attrs) || []).slice(1).find(x => x !== undefined) || '';
      const handler = h.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      if (isBackdrop(attrs, handler) || scrollOnly(handler)) continue;
      ev.push('<'+m[1]+'> with onClick, no role and no tabindex');
    }
    return ev.length ? {evidence:[...new Set(ev)]} : null; } },

{ code:'B32', id:'nowhere-to-focus', name:'Nowhere To Focus',
  fix:'Removing the default ring is fine. Replacing it is mandatory — :focus-visible with a visible indicator.',
  test(c){
    if (!/outline\s*:\s*(?:none|0)\b/i.test(c.css)) return null;
    // v1.3: a Wayback Machine redirect interstitial is archive.org's page, not the site's
    if (/Got an HTTP 30\d response at crawl time|<[^>]+\bid=["']wm-ipp|class=["'][^"']*\bia-topnav/i.test(c.text || c.html)) return null;
    // Elements on the page, with what decides whether they take keyboard focus.
    const els = [];
    for (const m of all(/<([a-z][\w-]*)\b([^<>]*)>/gi, c.html)) {
      const tag = m[1].toLowerCase(), a = m[2];
      if (/^(html|head|body|meta|link|script|style|title|br|hr|path|svg|g|use|defs|source|option)$/.test(tag)) continue;
      const at = n => { const r = new RegExp('(?:^|\\s)'+n+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|\\{["\'`]?([^"\'`}]*)|([^\\s>]+))','i').exec(a); return r ? (r[1]??r[2]??r[3]??r[4]??'') : null; };
      const cls = new Set(((at('class') ?? at('className')) || '').split(/\s+/).filter(Boolean));
      const type = (at('type') || 'text').toLowerCase(), ti = at('tabindex') ?? at('tabIndex');
      // v1.3: tabindex alone makes a control only on a custom element or an element with a widget role.
      // Builders put tabindex=0 on text blocks and terminals; composite containers (tablist, menubar,
      // toolbar ...) forward focus to their items, which carry the ring.
      const role = (at('role') || '').toLowerCase();
      const WIDGET = /^(?:button|link|tab|checkbox|radio|switch|slider|spinbutton|menuitem\w*|option|combobox|textbox|searchbox|treeitem|scrollbar)$/;
      if (/^(?:tablist|menubar|menu|toolbar|listbox|radiogroup|tree|treegrid|grid|tabpanel)$/.test(role) && !/^(a|button|input|select|textarea|summary)$/.test(tag)) continue;
      const focusable = (tag === 'a' && at('href') !== null) || /^(button|select|textarea|summary)$/.test(tag) ||
        (tag === 'input' && type !== 'hidden') || (ti !== null && +ti >= 0 && (tag.includes('-') || WIDGET.test(role))) || /\scontenteditable\b/i.test(a);
      // iframes pass focus into their own document; elements made unfocusable by tabindex=-1 are skipped
      // a text field still shows its blinking caret when focused; losing the ring there is not "nowhere to focus"
      const textEntry = tag === 'textarea' || /\scontenteditable\b/i.test(a) || (tag === 'input' && /^(text|email|search|password|tel|url|number)$/.test(type));
      if (ti !== null && +ti < 0) continue;
      els.push({ tag, cls, id: at('id'), a, type, focusable, textEntry, style: at('style') || '' });
    }
    // Split a selector into compounds, ignoring combinators inside brackets/parens.
    const compounds = sel => { let depth = 0, last = 0; const out = [];
      for (let i = 0; i < sel.length; i++) { const ch = sel[i];
        if (ch === '[' || ch === '(') depth++; else if (ch === ']' || ch === ')') depth--;
        else if (!depth && /[\s>+~]/.test(ch)) { if (i > last) out.push(sel.slice(last, i)); last = i + 1; } }
      out.push(sel.slice(last)); return out.map(x => x.trim()).filter(Boolean); };
    const subject = sel => compounds(sel).pop() || '';
    const matcher = comp => {
      if (/::/.test(comp)) return null;                                     // pseudo-element: not the control's own outline
      // a rule scoped to :hover/:active/etc. (and not to focus) leaves the focus ring alone
      if (/:(?:hover|active|visited|checked|disabled|invalid|placeholder-shown|target)\b/i.test(comp) && !/:focus/i.test(comp)) return null;
      const bare = comp.replace(/:not\([^()]*\)|:[\w-]+(\([^()]*\))?/g, '');
      if (!bare && !/^\*?(?::focus(?:-visible|-within)?)?$/i.test(comp)) return null;  // :root, :host, ...
      const tag = (/^([a-z][\w-]*|\*)/i.exec(bare) || [])[1];
      const cs = all(/\.((?:\\.|[\w-])+)/g, bare).map(m => unesc(m[1]));
      const id = (/#((?:\\.|[\w-])+)/.exec(bare) || [])[1];
      const ats = all(/\[\s*([\w-]+)\s*(?:[~|^$*]?=\s*["']?([^"'\]]*)["']?)?\s*\]/g, bare).map(m => [m[1].toLowerCase(), m[2]]);
      return e => (!tag || tag === '*' || e.tag === tag.toLowerCase()) && cs.every(k => e.cls.has(k)) && (!id || e.id === unesc(id)) &&
        ats.every(([n, v]) => n === 'type' ? (v === undefined || e.type === v.toLowerCase()) : new RegExp('(?:^|\\s)'+n+'(?:\\s*=\\s*["\']?([^"\'\\s>]*))?','i').test(e.a) && (v === undefined || e.a.includes(v)));
    };
    const RESTORE = /(?:box-shadow\s*:\s*(?!none)|outline\s*:\s*(?!none|0\b)|outline-(?:color|style|width)\s*:|border(?:-[a-z-]+)?\s*:\s*(?!none|0\b)|background(?:-color)?\s*:|text-decoration\s*:\s*underline|--tw-ring)/i;
    const FOCUS_SEL = /:focus(?:-visible|-within)?\b|\.Mui-focusVisible\b|\.focus-visible\b|\[data-focus-visible|\.focused\b|\[data-focused/i;
    const restored = new Set(), killed = new Map();
    for (const r of rules(c.css)) {
      if (r.sel === '[inline-style]') continue;
      const isKill = /outline\s*:\s*(?:none|0)\b/i.test(r.body);
      for (const p of r.sel.split(',').map(x => x.trim())) {
        const comp = subject(p); const match = matcher(comp); if (!match) continue;
        if (FOCUS_SEL.test(p) && RESTORE.test(r.body.replace(/outline\s*:\s*(?:none|0)\b[^;]*/gi, ''))) {
          // the focused element is the compound carrying the focus state (".card:focus-visible .frame" restores .card)
          const fc = compounds(p).filter(x => FOCUS_SEL.test(x)).pop(); const fm = fc && matcher(fc.replace(/:hover|:active/g, ''));
          if (fm) for (const e of els) if (fm(e)) restored.add(e);
          continue; }
        // :focus:not(:focus-visible) and the .focus-visible polyfill form are the recommended pattern, not a removal
        if (!isKill || /:not\(\s*(?::focus-visible|\.focus-visible|\[data-focus-visible[^\]]*\])\s*\)/i.test(p)) continue;
        let hit = 0;
        for (const e of els) if (match(e)) { hit++; if (!killed.has(e)) killed.set(e, p); }
        if (!hit && !c.isFullDoc && /\b(?:a|button|input|select|textarea)\b|\*|^:focus/i.test(comp)) killed.set({ tag:'?', cls:new Set(), focusable:true, textEntry:false, style:'' }, p);
      }
    }
    for (const e of els) if (/outline\s*:\s*(?:none|0)\b/i.test(e.style) && !killed.has(e)) killed.set(e, 'inline style on <'+e.tag+'>');
    // v1.3: controls that are never seen cannot show a ring: display:none / visibility:hidden by a plain
    // one-compound rule (and never shown by another), the hidden attribute, or visually hidden native
    // inputs (clip:rect(0) / 1px sr-only / opacity:0) inside a custom widget that draws its own state.
    const HIDE = /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i;
    const VHIDE = b => /clip\s*:\s*rect\(\s*0|clip-path\s*:\s*inset\(\s*50%/i.test(b) || (/(?:^|;)\s*width\s*:\s*1px/i.test(b) && /(?:^|;)\s*height\s*:\s*1px/i.test(b));
    const OPAQ0 = b => /(?:^|;)\s*opacity\s*:\s*0(?:\.0+)?\s*(?:;|$|!)/i.test(b);   // only for native inputs: fade-in classes on buttons are not 'hidden'
    const hidRules = [], showRules = [];
    for (const r of rules(c.css)) { if (r.sel === '[inline-style]') continue;
      const hide = HIDE.test(r.body), vh = VHIDE(r.body), op = OPAQ0(r.body), show = /(?:^|;)\s*display\s*:\s*(?!none)[a-z]/i.test(r.body);
      if (!hide && !vh && !op && !show) continue;
      for (const p of r.sel.split(',').map(x => x.trim())) {
        if (!/^[a-z*.#\[]/i.test(p) || /^(?:from|to)$/i.test(p)) continue;          // keyframe steps (0%, from, to)
        if (/:(?:hover|active|focus|checked|not|has|is|where|nth|first|last|only|empty|target)|::/i.test(p)) continue;
        const cs = compounds(p); const m = matcher(cs[cs.length - 1]); if (!m) continue;
        if (show) showRules.push(m);
        if ((hide && cs.length === 1) || vh) hidRules.push(m);
        if (op) hidRules.push(e => e.tag === 'input' && m(e)); } }
    const unseen = e => /\shidden(?:\s|=|$)/i.test(' ' + e.a.replace(/"[^"]*"|'[^']*'/g, '""')) || HIDE.test(e.style) || VHIDE(e.style) || (e.tag === 'input' && OPAQ0(e.style)) ||
      (hidRules.some(m => m(e)) && !showRules.some(m => m(e)));
    const bad = [];
    for (const [e, why] of killed) {
      if (!e.focusable || e.textEntry || restored.has(e) || unseen(e)) continue;
      const k = [...e.cls].join(' ');
      if (/\b(?:focus|focus-visible|focus-within):(?:ring|outline|border|shadow|bg)\b/.test(k)) continue;   // utility restores it (CSS may be external)
      if (/Mui\w*ButtonBase|\bMui-focusVisible\b/.test(k)) continue;   // MUI applies .Mui-focusVisible from JS
      bad.push(why);
    }
    return bad.length
      ? {evidence:[bad.length+' focusable control(s) lose the outline with no :focus style restoring one (e.g. '+bad[0].slice(0,60)+')']} : null; } },

{ code:'B34', id:'the-980px-phone', name:'The 980px Phone',
  fix:'A max-width, a fluid grid, and one test at 390px before it ships.',
  test(c){
    const ev=[];
    if (c.isFullDoc && /<html/i.test(c.html) && !/name=["']viewport["']/i.test(c.html))
      ev.push('no <meta name="viewport"> — mobile browsers will render at ~980px and zoom out');
    // A fixed layout width wider than any phone. Only "width:" itself — max-width/min-width containers are the cure,
    // not the problem. Inline style attributes are skipped (often computed by JS: scrollbars, RN-Web), as are
    // absolutely/fixed positioned boxes (decorative blobs that sit inside overflow:hidden).
    const rs = rules(c.css).filter(r => r.sel !== '[inline-style]');
    const hasMedia = /@media/i.test(c.css);
    // classes that some rule positions absolutely/fixed, or styles as a blurred/round decoration
    const deco = new Set();
    for (const o of rs) if (/(?:^|[;\s])position\s*:\s*(?:absolute|fixed)|filter\s*:\s*blur|pointer-events\s*:\s*none/i.test(o.body))
      for (const m of all(/\.((?:\\.|[\w-])+)/g, o.sel.split(/[\s>+~]/).pop())) deco.add(unesc(m[1]));
    const px = body => { const m = /(?:^|[;{\s])width\s*:\s*(\d{3,4})px\s*(?:!important)?\s*(?:;|$)/i.exec(body); return m ? +m[1] : null; };
    for (const r of rs) {
      const w = px(r.body);
      if (w === null || w < 600) continue;
      if (/(?:^|[;\s])position\s*:\s*(?:absolute|fixed)/i.test(r.body)) continue;
      if (/(?:^|[;\s])max-width\s*:\s*(?:\d{1,3}(?:\.\d+)?(?:%|vw)|calc|min\()/i.test(r.body)) continue;   // capped to the viewport
      if (/::|:hover|:focus|:active|:has\(/.test(r.sel)) continue;
      if (/filter\s*:\s*blur|pointer-events\s*:\s*none|border-radius\s*:\s*50%/i.test(r.body)) continue;
      const subj = r.sel.split(',').map(x => x.trim().split(/[\s>+~]+/).pop());
      if (subj.every(sj => all(/\.((?:\\.|[\w-])+)/g, sj).some(m => deco.has(unesc(m[1]))))) continue;
      // The flattened stylesheet no longer says which rules sit inside @media blocks. When the page has media
      // queries, only the page shell itself (html/body/main) being fixed-width is clear enough to report.
      if (hasMedia && !subj.every(sj => /^(?:html|body|main)$/i.test(sj))) continue;
      // overridden elsewhere (typically inside an @media block) for the same selector?
      const sels = r.sel.split(',').map(x => x.trim());
      const over = rs.some(o => o !== r && o.sel.split(',').some(x => sels.includes(x.trim())) &&
        (/(?:^|[;\s])(?:max-)?width\s*:\s*(?:auto|\d+(?:\.\d+)?(?:%|vw)|calc|min\(|clamp|fit-content)/i.test(o.body) || (px(o.body) !== null && px(o.body) < w)));
      if (over) continue;
      ev.push('fixed width:'+w+'px on '+r.sel.slice(0,40)+(hasMedia ? ' with no narrower override' : ' and no @media query in the stylesheet')+' — wider than a phone');
      break;
    }
    return ev.length ? {evidence:ev} : null; } },

/* ---- expansion: 25 more mechanical tells ---- */
{ code:'A20', id:'neon-glow-on-everything', name:'Neon Glow On Everything',
  fix:'Reserve glow for at most one element per screen. Elevation through neutral shadow, emphasis through weight.',
  test(c){
    // v1.2 of this entry: count glowing ELEMENTS at rest, not shadow strings. A glow is a non-inset box-shadow layer with a wide
    // blur in a saturated colour that is actually visible (alpha >= 0.2). Keyframe steps, hover/focus states, and small
    // indicator marks (dots, LEDs, logo rings, status lights) are not counted. The pattern needs glow on several things.
        // ---- b2 local helper: a light element tree (tag, classes, id, attrs, ancestors, visible text length) ----
    const T = c._b2tree || (c._b2tree = (html => {
      const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
      const root = { tag:'#root', cls:[], attrs:'', parent:null, text:0, kids:[] }, list = []; let cur = root;
      const re = /<(\/?)([a-z][\w-]*)\b([^<>]*)>|([^<]+)/gi; let m;
      while ((m = re.exec(html))) {
        if (m[4] !== undefined) { cur.text += m[4].replace(/&[#\w]+;/g,'x').replace(/\s+/g,'').length; continue; }
        const tag = m[2].toLowerCase();
        if (m[1]) { let n = cur; while (n !== root && n.tag !== tag) n = n.parent; if (n === root) continue;
          while (cur !== n) { cur.parent.text += cur.text; cur = cur.parent; } cur.parent.text += cur.text; cur = cur.parent; continue; }
        const a = m[3];
        const node = { tag, attrs:a, parent:cur, text:0, kids:[],
          cls: ((/\bclass\s*=\s*["']([^"']*)["']/i.exec(a)||[])[1]||'').split(/\s+/).filter(Boolean),
          id: (/\bid\s*=\s*["']([^"']*)["']/i.exec(a)||[])[1] || null,
          style: (/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(a)||[]).slice(1).find(x=>x!==undefined) || '' };
        cur.kids.push(node); list.push(node);
        if (!VOID.test(tag) && !/\/\s*$/.test(a) && !/^(script|style)$/.test(tag)) cur = node;
      }
      while (cur !== root) { cur.parent.text += cur.text; cur = cur.parent; }
      const byCls = new Map(); for (const n of list) for (const k of n.cls) { if (!byCls.has(k)) byCls.set(k, []); byCls.get(k).push(n); }
      return { root, list, byCls };
    })(c.html));
    // elements matching the last compound of one selector part (".a .b.c", "main.app", "#x")
    const matchEls = part => {
      const last = part.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g,'').replace(/::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g,'').replace(/\[[^\]]*\]/g,'').trim().split(/\s*[\s>+~]\s*/).pop() || '';
      const tag = ((/^[a-z][\w-]*/i.exec(last)||[])[0]||'').toLowerCase();
      const cs = all(/\.((?:\\.|[\w-])+)/g, last).map(x => x[1].replace(/\\(.)/g,'$1'));
      const id = (/#((?:\\.|[\w-])+)/.exec(last)||[])[1];
      const pool = cs.length ? (T.byCls.get(cs[0]) || []) : T.list;
      if (!cs.length && !id && !tag) return [];
      return pool.filter(n => (!tag || n.tag === tag) && cs.every(k => n.cls.includes(k)) && (!id || n.id === id));
    };
    const ancestors = n => { const out = []; for (let p = n.parent; p && p.tag !== '#root'; p = p.parent) out.push(p); return out; };
    // r3: hidden at render (inline opacity:0 / visibility:hidden / display:none, or a class whose resting rule sets opacity:0
    // with nothing to animate it in): its glow is not on screen
    // A scroll-reveal class (opacity:0 with a transition or animation) is shown as the visitor scrolls, so it is not hidden.
    const hiddenCls = new Set();
    for (const r of rules(c.css)) if (/(?:^|;|\s)opacity\s*:\s*0(?:\.0+)?\s*(?:!important\s*)?(?:;|$)/i.test(r.body) && !/transition|animation/i.test(r.body) && !/:(hover|focus|active|checked|not)|::/.test(r.sel))
      for (const p of r.sel.split(',')) { const m = /^\.((?:\\.|[\w-])+)$/.exec(p.trim()); if (m) hiddenCls.add(m[1]); }
    const hidden = n => [n, ...ancestors(n)].some(p => /(?:^|;|\s)(?:opacity\s*:\s*0(?:\.0+)?\s*(?:;|$)|visibility\s*:\s*hidden|display\s*:\s*none)/i.test(p.style) || p.cls.some(k => hiddenCls.has(k)));
    const vars = {}; for (const r of rules(c.css)) for (const v of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) if (!(v[1] in vars) && !/var\(--tw-/.test(v[2])) vars[v[1]] = v[2].trim();
    const resolve = s => { for (let i = 0; i < 4 && /var\(/.test(s); i++) s = s.replace(/var\(\s*(--[\w-]+)\s*(?:,((?:[^()]|\([^()]*\))*))?\)/g, (_, k, d) => vars[k] || d || ''); return s; };
    const minBlur = c.isFullDoc ? 16 : 8;
    // r3: the page's ground. A coloured shadow reads as neon on a dark ground; on a light one an offset tinted shadow is
    // coloured elevation. 'dark' | 'light' | null (unknown) from html/body/:root/app-root CSS, body/html classes and inline style.
    const tone = (() => {
      const toL = v => { v = resolve(String(v));
        const h = /hsla?\(\s*[\d.]+(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*(?:[,/]\s*([\d.]+%?))?\s*\)/i.exec(v);
        if (h && (!h[3] || parseFloat(h[3]) >= (/%/.test(h[3]) ? 90 : 0.9))) { const l = +h[2]/100; return l < 0.2 ? l*l : l > 0.8 ? l : l*l; }
        const m = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b/i.exec(v); if (!m) return null;
        let x = m[0]; if (/^#[0-9a-f]{8}$/i.test(x)) x = x.slice(0,7); if (/^#[0-9a-f]{4}$/i.test(x)) x = x.slice(0,4);
        x = x.replace(/^rgba\(([^,]+),([^,]+),([^,)]+),\s*(?:1|1\.0|0?\.9\d*)\s*\)$/i, 'rgb($1,$2,$3)');
        const rgb = parseColor(x); return rgb ? relLum(rgb) : null; };
      const ROOTSEL = /^(?:html|body|:root|main|#root|#app|#__next|#__nuxt|\.app|\.page|\.site|\.wrapper|body\s*>\s*div)$/i;
      // the cascade: later rules win, a body rule beats html/:root; dark-mode media blocks are an alternative theme, not the default
      const base = String(c.css).replace(/@media[^{]*(?:prefers-color-scheme\s*:\s*dark|\bprint\b)[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/gi, '');
      let bgL = null, fgL = null, scheme = null, bgRank = -1, fgRank = -1;
      const rank = sel => parts(sel).reduce((m, p) => Math.max(m, /^body$/.test(p) ? 3 : /^(html|:root)$/.test(p) ? 1 : ROOTSEL.test(p) ? 2 : -1), -1);
      for (const m of all(/([^{}]+)\{([^{}]*)\}/g, base)) {
        const sel = m[1].trim().split(/[;\n]/).pop().trim(), body = m[2];
        // a bare colour-only override (body{background:#fff;color:#000}) is usually a print or dark-mode variant whose
        // @media wrapper the pruned CSS no longer shows: it ranks below the page's own body rule
        const decls = body.split(';').filter(d => /:/.test(d)), colourOnly = decls.length <= 2 && decls.every(d => /^\s*(?:background(?:-color)?|color)\s*:/i.test(d));
        let rk = rank(sel); if (rk < 0) continue; if (colourOnly) rk -= 0.5;
        const b = /(?:^|;|\s)background(?:-color)?\s*:\s*([^;]+)/i.exec(body); if (b && rk >= bgRank) { const L = toL(b[1]); if (L !== null) { bgL = L; bgRank = rk; } }
        const f = /(?:^|;|\s)color\s*:\s*([^;]+)/i.exec(body); if (f && rk >= fgRank) { const L = toL(f[1]); if (L !== null) { fgL = L; fgRank = rk; } }
        const cs = /color-scheme\s*:\s*(dark|light)\b/i.exec(body); if (cs) scheme = cs[1].toLowerCase();
      }
      const top = T.list.filter(n => /^(html|body|main)$/.test(n.tag) || (n.parent && /^(body)$/.test(n.parent.tag) && n.tag === 'div')).slice(0, 6);
      for (const n of top) {
        const k = ' '+n.cls.join(' ')+' ';
        if (bgL === null && n.style) { const b = /background(?:-color)?\s*:\s*([^;]+)/i.exec(n.style); if (b) bgL = toL(b[1]); }
        if (bgL === null) {
          if (/ bg-(?:black|(?:gray|slate|zinc|neutral|stone|[a-z]+)-(?:8|9)\d0) /.test(k)) bgL = 0.02;
          else if (/ bg-(?:white|(?:gray|slate|zinc|neutral|stone|[a-z]+)-(?:50|100|200)) /.test(k)) bgL = 0.9;
          else { const a = / bg-\[(#[0-9a-f]{3,6})\] /i.exec(k); if (a) bgL = toL(a[1]); }
        }
        if (n.tag === 'html' && / dark /.test(k) && bgL === null) scheme = scheme || 'dark';
        if (fgL === null && / text-(?:white|(?:gray|slate|zinc|neutral|stone)-(?:50|100|200)) /.test(k)) fgL = 0.9;
      }
      if (bgL !== null) return bgL < 0.18 ? 'dark' : bgL > 0.4 ? 'light' : null;
      if (scheme) return scheme;
      if (fgL !== null) return fgL > 0.5 ? 'dark' : fgL < 0.1 ? 'light' : null;
      return null;
    })();
    const colourOf = L => {
      let m = /(?:rgba?|hsla?)\(((?:[^()]|\([^()]*\))*)\)/i.exec(L), rgb = null, a = 1;
      if (m) {
        const nums = m[1].split(/[\s,/]+/).filter(Boolean);
        if (/^hsl/i.test(m[0])) return null;
        if (nums.length < 3) return null;
        rgb = nums.slice(0,3).map(Number); if (rgb.some(isNaN)) return null;
        if (nums[3] !== undefined) a = /%$/.test(nums[3]) ? parseFloat(nums[3])/100 : parseFloat(nums[3]);
      } else if ((m = /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(L))) {
        let h = m[1]; if (h.length === 3) h = h.split('').map(x=>x+x).join('');
        rgb = [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)); if (h.length === 8) a = parseInt(h.slice(6),16)/255;
      } else if ((m = /\b(gold|cyan|magenta|lime|orange|red|blue|aqua|fuchsia|yellow|violet|purple|deeppink|hotpink)\b/i.exec(L))) {
        rgb = {gold:[255,215,0],cyan:[0,255,255],aqua:[0,255,255],magenta:[255,0,255],fuchsia:[255,0,255],lime:[0,255,0],orange:[255,165,0],red:[255,0,0],blue:[0,0,255],yellow:[255,255,0],violet:[238,130,238],purple:[128,0,128],deeppink:[255,20,147],hotpink:[255,105,180]}[m[1].toLowerCase()];
      } else return null;
      const h = rgbToHsl(rgb.map(v => Math.max(0, Math.min(255, Math.round(v)))));
      return { a, sat: h && h.s > 45 && h.l > 25 && h.l < 88 };
    };
    // one shadow value -> a short description of its first glowing layer, or null
    const glowOf = val => {
      val = resolve(val);
      for (const L of val.split(/,(?![^(]*\))/)) {
        if (/inset/i.test(L)) continue;
        const col = colourOf(L); if (!col || !col.sat || col.a < 0.2) continue;
        const n = all(/(?:^|\s)(-?[\d.]+(?:px|rem|em)?)(?=\s|$)/g, L.replace(/(?:rgba?|hsla?)\((?:[^()]|\([^()]*\))*\)|#[0-9a-f]{3,8}\b/gi,' ')).map(m => m[1]);
        if (n.length < 3) continue;
        const px = v => /rem|em/.test(v) ? parseFloat(v)*16 : parseFloat(v);
        // a negative spread tucks the blur under the box (an underglow), so judge the blur that shows
        const blur = px(n[2]) + 2*Math.min(0, n[3] ? px(n[3]) : 0);
        if (blur < minBlur) continue;
        // r3: off a dark ground, only a centred halo (offsets small against the blur) or a strong wide bloom reads as glow;
        // an offset tinted shadow under a button on a light page (0 8px 24px at 0.3) is coloured elevation
        const centred = Math.abs(px(n[0])) <= Math.max(2, 0.15*px(n[2])) && Math.abs(px(n[1])) <= Math.max(2, 0.15*px(n[2]));
        if (c.isFullDoc && tone !== 'dark' && !centred && !(col.a >= 0.45 && blur >= 32)) continue;
        return L.trim().replace(/\s+/g,' ').slice(0,60);
      }
      return null;
    };
    const SMALL = /(^|[-_\s.#])(dot|dots|led|leds|indicator|status|live|logo|brand|pulse|ping|ring|spinner|loader|cursor|caret|knob|thumb|handle|marker|pin|blink|beacon|signal|lamp|light|orb)s?([-_\s.:\[]|$)/i;
    const KEYSTEP = /^\s*(?:from|to|[\d.]+%)(?:\s*,\s*(?:from|to|[\d.]+%))*\s*$/i;
    const tiny = body => { const w = /(?:^|;|\s)(?:width|height)\s*:\s*([\d.]+)(px|rem)/i.exec(body); return w && (w[2]==='rem' ? +w[1]*16 : +w[1]) <= 16; };
    const glowing = new Map();   // selector or element description -> evidence
    const els = new Set();
    for (const r of rules(c.css)) {
      if (KEYSTEP.test(r.sel) || /:(hover|focus|active|focus-visible|focus-within|checked)/i.test(r.sel)) continue;
      if (SMALL.test(r.sel) || tiny(r.body)) continue;
      const decls = all(/(?:^|;|\s)(box-shadow|--tw-shadow)\s*:\s*([^;]+)/gi, r.body).map(m => m[2]);
      let g = null; for (const d of decls) if ((g = glowOf(d))) break;
      if (!g) continue;
      if (r.sel === '[inline-style]') { if (!c.isFullDoc) { glowing.set('inline:'+glowing.size, 'inline box-shadow: '+g); } continue; }   // full pages: judged on the element below
      if (c.isFullDoc) {
        const hit = r.sel.split(',').flatMap(matchEls).filter(n => !hidden(n));
        if (!hit.length) continue;
        hit.forEach(n => els.add(n));
      }
      glowing.set(r.sel.trim(), r.sel.trim().slice(0,30)+' glows: '+g);
    }
    if (c.isFullDoc) for (const n of T.list) {
      if (!/box-shadow/i.test(n.style) || SMALL.test(n.cls.join(' ')) || tiny(n.style) || hidden(n)) continue;
      const g = glowOf((/box-shadow\s*:\s*([^;]+)/i.exec(n.style)||[])[1] || ''); if (!g) continue;
      els.add(n); glowing.set('inline:'+glowing.size, 'inline box-shadow: '+g);
    }
    // Tailwind: coloured shadow utilities (shadow-cyan-500/50 with shadow-lg+) and arbitrary glows shadow-[0_0_20px_...]
    for (const n of T.list) {
      const k = n.cls.join(' '); if (!/\bshadow-/.test(k) || SMALL.test(k)) continue;
      let g = null;
      const arb = /(?:^|\s)shadow-\[([^\]]+)\]/.exec(k);
      if (arb) g = glowOf(arb[1].replace(/_/g,' '));
      const tint = /(?:^|\s)shadow-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[3-7]00(?:\/(\d+))?(?=\s|$)/.exec(k);
      // the shadow-lg/xl/2xl utilities are offset drop shadows: tinted, they glow only on a dark ground
      if (!g && tint && /(?:^|\s)shadow-(?:lg|xl|2xl)(?=\s|$)/.test(k) && (!tint[1] || +tint[1] >= 20) && (!c.isFullDoc || tone === 'dark')) g = tint[0].trim();
      if (g && c.isFullDoc && hidden(n)) continue;
      if (g) { els.add(n); glowing.set('tw:'+k, '<'+n.tag+'> '+g); }
    }
    const ev = [...new Set(glowing.values())];
    if (c.isFullDoc) {
      // r3: count distinct components, not DOM nodes: an element inside another glowing element is part of it, and
      // repeated instances of one component (same class list) count once
      const nodes = [...els].filter(n => typeof n === 'object');
      const set = new Set(nodes);
      const tops = nodes.filter(n => !ancestors(n).some(a => set.has(a)));
      const keys = new Set(tops
        .map(n => n.tag + '.' + n.cls.filter(k => !/^(?:active|is-|show|visible|in-view|animated|aos-|reveal|selected|current)/.test(k)).sort().join('.')));
      return (keys.size >= 2 && tops.length >= 3) ? {evidence:[tops.length+' glowing elements at rest ('+keys.size+' distinct components)', ...ev].slice(0,3)} : null;
    }
    return ev.length >= 2 ? {evidence:ev.slice(0,3)} : null; } },

{ code:'A22', id:'crushed-headline-tracking', name:'Crushed Headline Tracking',
  fix:'Set tracking per typeface and size. Most display faces need no more than -0.02em; check it at mobile size.',
  test(c){
    // v1.2: only display headlines (the selector's subject is a heading, or a Tailwind headline at 48px+ at
    // some breakpoint), using the site's own --tracking-tighter value. Monospace faces count only at
    // weight 800+: their fixed advance widths keep letters apart unless the strokes are heavy enough to fill the cell.
    const ev=[];
    const R = rules(c.css);
    const vars = {};
    for (const r of R) for (const m of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) vars[m[1]] = m[2].trim();
    const resolve = (v, d=0) => d > 4 ? v : v.replace(/var\(\s*(--[\w-]+)\s*(?:,([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, n, f) => vars[n] !== undefined ? resolve(vars[n], d+1) : (f || ''));
    const isMono = fam => { const s = resolve(fam || '').split(',')[0] || ''; return /mono|courier|consolas|menlo|monaco|monospace/i.test(s); };
    let baseFam = null;
    for (const r of R) if (parts(r.sel).some(p => /^(html|body|:root)$/.test(p))) { const m = /(?:^|;|\s)font-family\s*:\s*([^;]+)/i.exec(r.body); if (m) baseFam = m[1]; }
    const rootCls = all(/<(?:html|body)\b[^>]*class=["']([^"']*)["']/gi, c.html).map(m => m[1]).join(' ');
    const baseMono = /\bfont-mono\b/.test(rootCls) || (!/\bfont-(sans|serif)\b/.test(rootCls) && isMono(baseFam));
    const subjectIsHead = sel => parts(sel).some(p => { const last = p.split(/\s*[\s>+~]\s*/).filter(Boolean).pop() || '';
      return /^h[12]\b|^&?\s*h[12]$|title|headline|heading|display/i.test(last.replace(/^&\s*/, '')) && !/subtitle|number|stat|count|label|eyebrow/i.test(last); });
    for (const r of R) {
      if (c.isFullDoc && !subjectIsHead(r.sel)) continue;
      const m = /letter-spacing\s*:\s*(-?[\d.]+)em/i.exec(r.body);
      if (!m || +m[1] > -0.045) continue;
      const fam = /(?:^|;|\s)font-family\s*:\s*([^;]+)/i.exec(r.body);
      const fw = /font-weight\s*:\s*(\d+|bold|bolder)/i.exec(r.body);
      const heavy = fw && /^\d+$/.test(fw[1]) && +fw[1] >= 800;
      if ((fam ? isMono(fam[1]) : baseMono) && !heavy) continue;
      ev.push(r.sel.trim().slice(0,24)+' letter-spacing: '+m[1]+'em');
    }
    // Tailwind: tracking-tighter is -0.05em unless the theme redefines --tracking-tighter (last definition wins)
    let tt = -0.05;
    for (const r of R) { const m = /--tracking-tighter\s*:\s*(-?[\d.]+)em/i.exec(r.body); if (m) tt = +m[1]; }
    const twPx = k => {
      const SZ = { '5xl':48, '6xl':60, '7xl':72, '8xl':96, '9xl':128 };
      let mx = 0;
      for (const m of all(/(?:^|\s)(?:[\w-]+:)*text-(5xl|6xl|7xl|8xl|9xl)\b/g, k)) mx = Math.max(mx, SZ[m[1]]);
      for (const m of all(/(?:^|\s)(?:[\w-]+:)*text-\[([^\]]+)\]/g, k)) {
        for (const n of all(/([\d.]+)(px|rem)/g, m[1])) mx = Math.max(mx, n[2] === 'rem' ? +n[1]*16 : +n[1]);
      }
      return mx;
    };
    if (tt <= -0.045) {
      if (c.isFullDoc) {
        for (const m of all(/<h[12]\b[^>]*class=["']([^"']*\btracking-tighter\b[^"']*)["']/gi, c.html)) {
          const k = m[1];
          const heavy = /\bfont-(extrabold|black)\b|\bfont-\[(8|9)\d\d\]|\bfont-\[1000\]/.test(k);
          if ((/\bfont-mono\b/.test(k) || (baseMono && !/(?:^|\s)font-(?!mono\b|thin\b|extralight\b|light\b|normal\b|medium\b|semibold\b|bold\b|extrabold\b|black\b|\[)[a-z][\w-]*/.test(k))) && !heavy) continue;
          if (twPx(k) < 48) continue;
          ev.push('tailwind tracking-tighter on a display headline'); break;
        }
      }
      else if (/\btracking-tighter\b/.test(c.text)) ev.push('tailwind tracking-tighter (-0.05em)');
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A25', id:'the-accent-stripe', name:'The Accent Stripe',
  fix:'Reserve edge stripes for genuine status. Distinguish cards by their content.',
  test(c){
    // v1.2 of this entry: a coloured LEFT stripe on a repeated CARD. Required: a 2-6px solid left border in a strong, saturated
    // colour (not a hairline divider); the box is card-like (its own background or a border/shadow on the other sides, plus
    // padding); and, on whole pages, at least three such boxes holding text. Top rules on bands, text rules beside paragraphs,
    // and the long-standing conventions (quotes, code, nav tabs, tables, callouts, chat/terminal transcripts, editorial
    // mastheads) are left alone.
    const ev=[];
    const SKIP = /blockquote|\bq\b|quote|\bpre\b|\bcode\b|\bhr\b|nav|\btabs?\b|tab-|menu|active|current|selected|input|\bth\b|\btd\b|table|toc|sidebar|alert|callout|\bnote|warning|admonition|error|success|\binfo\b|danger|caution|\btip\b|msg|message|chat|bubble|\bterm\b|terminal|console|(?:^|[^a-z])logs?\b|summary|tldr|tl-dr|tagline|mast|header|heading|label|\btags?\b|footer|faq|answer|annotation|aside|caption|figure|chart|legend|\bsteps?\b|step-|timeline|\bdiff|highlight|\bmark\b|testimonial|review|clone|::/i;
        // ---- b2 local helper: a light element tree (tag, classes, id, attrs, ancestors, visible text length) ----
    const T = c._a25tree || (c._a25tree = (html => {
      const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
      const root = { tag:'#root', cls:[], attrs:'', parent:null, text:0, kids:[] }, list = []; let cur = root;
      const re = /<(\/?)([a-z][\w-]*)\b([^<>]*)>|([^<]+)/gi; let m;
      while ((m = re.exec(html))) {
        if (m[4] !== undefined) { cur.text += m[4].replace(/&[#\w]+;/g,'x').replace(/\s+/g,'').length; for (let q = cur; q && q.tag !== '#root'; q = q.parent) if ((q.raw = (q.raw||'') + m[4]).length > 400) break; continue; }
        const tag = m[2].toLowerCase();
        if (m[1]) { let n = cur; while (n !== root && n.tag !== tag) n = n.parent; if (n === root) continue;
          while (cur !== n) { cur.parent.text += cur.text; cur = cur.parent; } cur.parent.text += cur.text; cur = cur.parent; continue; }
        const a = m[3];
        const node = { tag, attrs:a, parent:cur, text:0, kids:[],
          cls: ((/\bclass\s*=\s*["']([^"']*)["']/i.exec(a)||[])[1]||'').split(/\s+/).filter(Boolean),
          id: (/\bid\s*=\s*["']([^"']*)["']/i.exec(a)||[])[1] || null,
          style: (/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(a)||[]).slice(1).find(x=>x!==undefined) || '' };
        cur.kids.push(node); list.push(node);
        if (!VOID.test(tag) && !/\/\s*$/.test(a) && !/^(script|style)$/.test(tag)) cur = node;
      }
      while (cur !== root) { cur.parent.text += cur.text; cur = cur.parent; }
      const byCls = new Map(); for (const n of list) for (const k of n.cls) { if (!byCls.has(k)) byCls.set(k, []); byCls.get(k).push(n); }
      return { root, list, byCls };
    })(c.html));
    // elements matching the last compound of one selector part (".a .b.c", "main.app", "#x")
    // v1.3: the whole selector must match, not only its last compound ("#toast > div" is not every div)
    const strip = p => p.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g,'').replace(/::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g,'').replace(/\[[^\]]*\]/g,'').trim();
    const compound = (n, comp) => { const tag = ((/^[a-z][\w-]*/i.exec(comp)||[])[0]||'').toLowerCase();
      const cs = all(/\.((?:\\.|[\w-])+)/g, comp).map(x => x[1].replace(/\\(.)/g,'$1')); const id = (/#((?:\\.|[\w-])+)/.exec(comp)||[])[1];
      return (!tag || tag === '*' || n.tag === tag) && cs.every(k => n.cls.includes(k)) && (!id || n.id === id); };
    const qualified = (n, part) => {
      const toks = strip(part).split(/\s*([>+~])\s*|\s+/).filter(x => x !== undefined && x !== '');
      let node = n; let i = toks.length - 2;
      while (i >= 0) {
        let comb = ' '; if (/^[>+~]$/.test(toks[i])) { comb = toks[i]; i--; } if (i < 0) break;
        const comp = toks[i];
        if (comb === '+' || comb === '~') { i--; continue; }        // sibling qualifiers: not checked
        if (comb === '>') { node = node.parent; if (!node || node.tag === '#root' || !compound(node, comp)) return false; }
        else { let p = node.parent; while (p && p.tag !== '#root' && !compound(p, comp)) p = p.parent; if (!p || p.tag === '#root') return /^(html|body|:root)$/i.test(comp); node = p; }
        i--;
      }
      return true; };
    const matchEls = part => matchLast(part).filter(n => qualified(n, part));
    const matchLast = part => {
      const last = part.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g,'').replace(/::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g,'').replace(/\[[^\]]*\]/g,'').trim().split(/\s*[\s>+~]\s*/).pop() || '';
      const tag = ((/^[a-z][\w-]*/i.exec(last)||[])[0]||'').toLowerCase();
      const cs = all(/\.((?:\\.|[\w-])+)/g, last).map(x => x[1].replace(/\\(.)/g,'$1'));
      const id = (/#((?:\\.|[\w-])+)/.exec(last)||[])[1];
      const pool = cs.length ? (T.byCls.get(cs[0]) || []) : T.list;
      if (!cs.length && !id && !tag) return [];
      return pool.filter(n => (!tag || n.tag === tag) && cs.every(k => n.cls.includes(k)) && (!id || n.id === id));
    };
    const ancestors = n => { const out = []; for (let p = n.parent; p && p.tag !== '#root'; p = p.parent) out.push(p); return out; };
    const vars = {}; for (const r of rules(c.css)) for (const v of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) if (!(v[1] in vars)) vars[v[1]] = v[2].trim();
    const resolve = s => { for (let i = 0; i < 4 && /var\(/.test(s); i++) s = s.replace(/var\(\s*(--[\w-]+)\s*(?:,((?:[^()]|\([^()]*\))*))?\)/g, (_, k, d) => vars[k] || d || ''); return s; };
    // strong colour: saturated and at least half opaque
    const strong = col => {
      col = resolve(col).trim(); let rgb = null, a = 1, m;
      if ((m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(col))) { let h = m[1]; if (h.length === 3) h = h.split('').map(x=>x+x).join('');
        rgb = [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)); if (h.length === 8) a = parseInt(h.slice(6),16)/255; }
      else if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/i.exec(col))) { rgb = [+m[1],+m[2],+m[3]].map(Math.round); if (m[4] !== undefined) a = m[5] ? +m[4]/100 : +m[4]; }
      else return false;
      const h = rgbToHsl(rgb); return a >= 0.5 && h && h.s > 30 && h.l > 15 && h.l < 85;
    };
    const stripe = body => {
      const m = /border-left\s*:\s*([2-6])px\s+solid\s+(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|var\((?:[^()]|\([^()]*\))*\))/i.exec(body)
        || (/border-left-width\s*:\s*([2-6])px/i.test(body) && /border-left-style\s*:\s*solid/i.test(body) && /border-left-color\s*:\s*(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|var\((?:[^()]|\([^()]*\))*\))/i.exec(body)
            && [null, /border-left-width\s*:\s*([2-6])px/i.exec(body)[1], /border-left-color\s*:\s*(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|var\((?:[^()]|\([^()]*\))*\))/i.exec(body)[1]]);
      if (!m || !strong(m[2])) return null;
      return m;
    };
    // only the left edge is heavy: no other side carries a border of 2px or more
    const leftOnly = body => { const w = {top:0,right:0,bottom:0};
      for (const d of body.split(';')) { const m = /^\s*(border(?:-(top|right|bottom))?(?:-width)?)\s*:\s*(.*)$/i.exec(d); if (!m) continue;
        const nums = all(/([\d.]+)px/g, m[3]).map(x => +x[1]); const none = /\b(none|hidden)\b/i.test(m[3]);
        if (/^border$/i.test(m[1])) { const v = none ? 0 : (nums[0]||0); w.top = w.right = w.bottom = v; }
        else if (/^border-width$/i.test(m[1])) { const v = nums.length===1?[nums[0],nums[0],nums[0]]:nums.length===2?[nums[0],nums[1],nums[0]]:[nums[0],nums[1],nums[2]]; w.top=v[0]||0; w.right=v[1]||0; w.bottom=v[2]||0; }
        else if (m[2]) w[m[2].toLowerCase()] = none ? 0 : (nums[0]||0); }
      return Math.max(w.top, w.right, w.bottom) < 2; };
    const cardBody = body => /padding/i.test(body) && !/white-space\s*:\s*pre|font-family\s*:[^;]*mono/i.test(body) && (
      /(?:^|;|\s)background(?:-color)?\s*:\s*(?!transparent|none|inherit|initial)/i.test(body) || /box-shadow\s*:\s*(?!none)/i.test(body)
      || /(?:^|;|\s)border(?:-(?:right|top|bottom))?\s*:\s*1px/i.test(body));
    // hidden by CSS: a single-compound selector whose only display value is none (not a responsive toggle)
    const disp = new Map(); for (const r of rules(c.css)) for (const p of r.sel.split(',').map(x=>x.trim())) { const d = /(?:^|;|\s)display\s*:\s*([\w-]+)/i.exec(r.body); if (d && /^[#.][\w-]+$/.test(p)) { if (!disp.has(p)) disp.set(p, new Set()); disp.get(p).add(d[1].toLowerCase()); } }
    const cssHidden = n => (n.id && (disp.get('#'+n.id)||new Set()).has('none') && disp.get('#'+n.id).size === 1) || n.cls.some(k => { const d = disp.get('.'+k); return d && d.has('none') && d.size === 1; });
    const hidden = n => [n, ...ancestors(n)].some(p => /display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.style) || /\s(?:hidden|aria-hidden\s*=\s*["']true["'])(?=[\s=>\/]|$)/i.test(' '+p.attrs) || p.cls.some(k => /^(hidden|invisible|sr-only|opacity-0)$/.test(k) || /clone/i.test(k)) || cssHidden(p));
    const CODEISH = /^(pre|code|kbd|samp)$/;
    const codeDesc = n => n.kids.some(k => CODEISH.test(k.tag) || codeDesc(k));
    const codeAnc = n => ancestors(n).some(p => CODEISH.test(p.tag) || p.cls.some(k => /^font-mono$|code|diff|mono|terminal|console|editor|syntax|highlight/i.test(k)));
    const textOf = n => n.kids.map(k => k.txt || '').join(' ');
    const quoted = n => { const t = (n.raw || '').trim(); return /^["\u201c\u2018\u00ab]/.test(t) && /["\u201d\u2019\u00bb]$/.test(t); };
    const holdsText = n => n.text >= 20 && !hidden(n) && !codeDesc(n) && !codeAnc(n) && !quoted(n) && !/^(p|span|a|li|h[1-6]|label|small|em|strong|dd|dt)$/.test(n.tag) && !ancestors(n).some(p => /^(blockquote|pre|code|aside|figure|nav|header|footer|table)$/.test(p.tag));
    for (const r of rules(c.css)) {
      if (r.sel === '[inline-style]' || SKIP.test(r.sel)) continue;
      const m = stripe(r.body); if (!m || !cardBody(r.body) || !leftOnly(r.body)) continue;
      if (/(?:^|;|\s)border\s*:\s*[1-9]/i.test(r.body) && !/border-left\s*:/i.test(r.body.split(/(?:^|;|\s)border\s*:/i).pop())) continue;  // a later full border overrides the stripe
      const say = r.sel.trim().slice(0,30)+': border-left '+m[1]+'px solid '+String(m[2]).slice(0,22);
      if (!c.isFullDoc) { const els = r.sel.split(',').flatMap(matchEls); if (!els.length || els.some(holdsText)) ev.push(say); continue; }
      const els = r.sel.split(',').flatMap(matchEls).filter(holdsText);
      if (els.length >= 3) ev.push(say+' on '+els.length+' cards');
    }
    // inline styles: three or more siblings carrying the same stripe
    const groups = new Map();
    for (const n of T.list) { if (!/border-left/i.test(n.style) || SKIP.test(n.cls.join(' '))) continue;
      const m = stripe(n.style); if (!m || !cardBody(n.style) || !leftOnly(n.style) || !holdsText(n)) continue;
      const key = n.parent; groups.set(key, (groups.get(key) || 0) + 1); }
    for (const [, k] of groups) if (k >= 3) { ev.push(k+' sibling cards with an inline coloured left stripe'); break; }
    // Tailwind: border-l-4 border-{colour}-500 on three or more boxes
    const tw = T.list.filter(n => { const k = ' '+n.cls.join(' ')+' ';
      return / border-l-(?:2|4|\[[2-6]px\]) /.test(k) && !/ (?:[a-z]+:)?border(?:-[trbxy])?-[2-8] /.test(k) && / border-(?:l-)?(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[4-7]00 /.test(k)
        && / (?:rounded[\w-]*|bg-[\w-]+|shadow[\w-]*|p-\d+|px-\d+) /.test(k) && !SKIP.test(k.replace(/ (?:border|bg|text|shadow|rounded|p[xytblr]?|m[xytblr]?)-[\w\/.\[\]-]+/g,' ')) && holdsText(n); });
    if (tw.length >= 3) ev.push(tw.length+' boxes with tailwind '+((/ (border-l-(?:2|4|\[[2-6]px\])) /.exec(' '+tw[0].cls.join(' ')+' ')||[])[1]||'border-l')+' in an accent colour');
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A36', id:'the-pulsing-dot', name:'The Pulsing Dot',
  fix:'Bind the indicator to real state and leave it still unless something just changed.',
  test(c){
    // v1.2 of this entry: a small round element looping forever beside a short text label that nothing updates.
    // Skeleton loaders and spinners are not dots; particles with no label are decoration, not status;
    // a dot or label with an id, inside an aria-live region or a client-side island is bound to script state.
    const ev=[];
    const dot = k => /\b(rounded-full)\b/.test(k) && /\b(?:w|h|size)-(?:1\.5|2|2\.5|3|3\.5|\[[4-9]px\]|\[1[0-4]px\])\b/.test(k);
    const cssHits = [];
    for (const r of rules(c.css)) {
      if (/typing|loader|loading|spinner|skeleton|record/i.test(r.sel) || /display\s*:\s*none/i.test(r.body)) continue;
      const a = /animation(?:-name)?\s*:[^;]*\b(ping|pulse|blink|glow|breath\w*)\b[^;]*/i.exec(r.body); if (!a) continue;
      if (!/infinite/i.test(r.body)) continue;
      const round = /border-radius\s*:\s*(50%|9999px|999px|100%)/i.test(r.body);
      const w = /(?:^|;|\s)width\s*:\s*(\d+(?:\.\d+)?)px/i.exec(r.body);
      if (round && (!w || +w[1] <= 16)) cssHits.push({ sel: r.sel.trim(), name: a[1] });
    }
    if (!c.isFullDoc) {
      // snippets: no page to check the markup against
      for (const k of classAttrs(c.html)) { const a = /\banimate-(ping|pulse)\b/.exec(k); if (a && dot(k)) { ev.push('tailwind animate-'+a[1]+' on a small round dot'); break; } }
      for (const h of cssHits) ev.push(h.sel.slice(0,30)+': round element, animation '+h.name+' infinite');
      return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null;
    }
    // light element tree of the page
    const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
    const root = { tag:'#root', attrs:'', kids:[], start:0, openEnd:0, end:c.html.length }; const st = [root]; const nodes = [];
    for (const m of all(/<(\/?)([a-z][\w-]*)\b([^<>]*)>/gi, c.html)) {
      const tag = m[2].toLowerCase();
      if (m[1]) { for (let i = st.length-1; i > 0; i--) if (st[i].tag === tag) { while (st.length > i) st.pop().end = m.index; break; } continue; }
      const n = { tag, attrs:m[3], cls:(/\bclass\s*=\s*["']([^"']*)["']/i.exec(m[3])||[,''])[1], start:m.index, openEnd:m.index+m[0].length, end:null, kids:[], parent:st[st.length-1] };
      n.parent.kids.push(n); nodes.push(n);
      if (VOID.test(tag) || /\/\s*$/.test(m[3])) n.end = n.openEnd; else st.push(n);
    }
    for (const n of nodes) if (n.end === null) n.end = n.parent.end === null ? c.html.length : n.parent.end;
    const text = n => c.html.slice(n.openEnd, n.end).replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#\d+;|&\w+;/g,' ').replace(/\s+/g,' ').trim();
    const hasId = n => /\sid\s*=\s*["'][^"']+["']/i.test(' '+n.attrs);
    const inside = (a, n) => { for (let p = n; p; p = p.parent) if (p === a) return true; return false; };
    // the label: text in the nearest of the dot's three closest ancestors that has any (Tailwind wraps a ping dot in a span pair)
    const labelOf = n => { for (let a = n.parent, i = 0; a && a !== root && i < 3; a = a.parent, i++) {
      const t = text(a); if (!/[a-z0-9]{2}/i.test(t)) continue;
      return t.length <= 120 ? { a, t } : null; } return null; };
    const bound = (n, lab) => {
      // a script handle (id) on the dot, its siblings or the label element, or a live region / client island around it
      if (hasId(n) || n.parent.kids.some(hasId) || lab.a.kids.some(k => !inside(k, n) && (hasId(k) || k.kids.some(hasId)))) return true;
      return islandOrLive(n);
    };
    function islandOrLive(n){ for (let p = n.parent; p; p = p.parent) if (/\baria-live\s*=/i.test(p.attrs || '') || p.tag === 'astro-island') return true; return false; }
    for (const n of nodes) {
      const a = /\banimate-(ping|pulse)\b/.exec(n.cls); if (!a || !dot(n.cls)) continue;
      const kind = a[1], lab = labelOf(n);
      if (lab && !bound(n, lab)) { ev.push('tailwind animate-'+kind+' on a small round dot beside "'+lab.t.slice(0,40)+'"'); break; }
    }
    for (const h of cssHits) {
      // the element the rule styles: classes of the last compound (or the inline style itself);
      // a ::before/::after dot is labelled by its host's own text
      const parts = h.sel === '[inline-style]' ? [null] : h.sel.split(',');
      for (const part of parts) {
        let pseudo = false, match;
        if (part === null) {
          const nm = new RegExp('animation(?:-name)?\\s*:[^;"\']*\\b' + h.name + '\\b', 'i');
          match = n => /\bstyle\s*=/i.test(n.attrs) && nm.test(n.attrs) && /border-radius\s*:\s*(50%|9999px|999px|100%)/i.test(n.attrs);
        } else {
          const last = part.trim().split(/[\s>+~]+/).pop();
          pseudo = /::?(before|after)\b/i.test(last);
          const cs = all(/\.((?:\\.|[\w-])+)/g, last.replace(/::?[\w-]+(\([^)]*\))?/g,'')).map(m => unesc(m[1]));
          if (!cs.length) continue;
          match = n => { const k = ' '+n.cls+' '; return cs.every(x => k.includes(' '+x+' ')); };
        }
        let found = null;
        for (const n of nodes) {
          if (!match(n)) continue;
          const t = pseudo ? text(n) : '';
          if (pseudo && /[a-z0-9]{2}/i.test(t)) {
            // the host element is the label: only its own ids count as a script handle
            if (t.length <= 120 && !hasId(n) && !n.kids.some(hasId) && !islandOrLive(n)) { found = t; break; } }
          else { const lab = labelOf(n); if (lab && !bound(n, lab)) { found = lab.t; break; } }
        }
        if (found) { ev.push((part === null ? 'inline style' : h.sel.slice(0,30))+': round element, animation '+h.name+' infinite, beside "'+found.slice(0,40)+'"'); break; }
      }
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A37', id:'bounce-on-hover', name:'Bounce On Hover',
  fix:'A colour or shadow change at 120-200ms ease-out. Springs only where they are earned.',
  test(c){
    // v1.2 of this entry: cards that grow on hover. The hovered element itself must be the card (not an icon, badge,
    // play button, ::after blob or image inside a static card), the card must hold text, and there must be at least
    // three of them on the page. Logos, badges and single buttons that scale are a different, minor thing.
    const ev=[]; const skip = /logo|badge|btn|button|icon|img|image|avatar|social|store|emoji|link|nav|menu|thumb|play/i;
    const CARD = /card|tile|feature|item|box|panel|project|post|product|plan|member/i;
    // elements of the page: class list and the words they hold
    const els = [];
    if (c.isFullDoc) {
      const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i; const st = [];
      for (const m of all(/<(\/?)([a-z][\w-]*)\b([^<>]*)>/gi, c.html)) {
        const tag = m[2].toLowerCase();
        if (m[1]) { for (let i = st.length-1; i >= 0; i--) if (st[i].tag === tag) { while (st.length > i) { const n = st.pop(); n.end = m.index; } break; } continue; }
        const n = { tag, cls:(/\bclass\s*=\s*["']([^"']*)["']/i.exec(m[3])||[,''])[1], start:m.index + m[0].length, end:null };
        els.push(n); if (!VOID.test(tag) && !/\/\s*$/.test(m[3])) st.push(n); else n.end = n.start;
      }
      for (const n of els) { if (n.end === null) n.end = n.start;
        const inner = c.html.slice(n.start, n.end);
        n.letters = (inner.replace(/<[^>]+>/g,' ').match(/[a-z]/gi) || []).length;
        // content blocks inside, or a stacked tile of an image over its own caption (flex-col link tiles)
        n.block = /<(?:div|p|h[1-6]|article|section|ul|ol|li|figure|blockquote|header|footer)\b/i.test(inner)
          || (/<(?:img|picture)\b/i.test(inner) && /<(?:span|small|strong)\b/i.test(inner) && /(?:^|\s)flex-col(?:\s|$)/.test(n.cls)); }
    }
    const hasAll = (n, cs) => { const k = ' '+n.cls+' '; return cs.every(x => k.includes(' '+x+' ')); };
    // holds a title or a line of text, not just an icon or a number. A link or button whose content is only a label
    // ("Get Started", "Apple Podcasts") is a control, however its class is named; a clickable card wraps blocks of content.
    const textCard = n => n.letters >= 8 && !(/^(a|button|input|label|summary)$/.test(n.tag) && !n.block);
    // CSS: the scale must sit on the card selector itself (".card:hover", not ".card:hover .icon" or ".card:hover::after")
    for (const r of rules(c.css)) {
      const sc = /transform\s*:\s*[^;]*scale\(\s*([\d.]+)/i.exec(r.body) || /(?:^|;|\s)scale\s*:\s*([\d.]+)/i.exec(r.body);
      if (!sc || +sc[1] < 1.05) continue;   // the definition's overshoot starts at 1.05; 1.02-1.04 is a subtle lift
      for (const part of r.sel.split(',')) {
        const last = part.trim().split(/[\s>+~]+/).pop();
        if (!/:hover/i.test(last) || /::?(before|after)\b/i.test(last) || skip.test(last) || !CARD.test(last)) continue;
        const cs = all(/\.((?:\\.|[\w-])+)/g, last.replace(/::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g,'')).map(m => unesc(m[1]));
        if (c.isFullDoc) {
          // the classes must be used together in the markup, on at least three elements that hold text
          if (!cs.length) continue;
          const anc = part.trim().split(/[\s>+~]+/).slice(0,-1).map(p => all(/\.((?:\\.|[\w-])+)/g, p.replace(/::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g,'')).map(m => unesc(m[1])));
          if (anc.some(a => a.length && !els.some(n => hasAll(n, a)))) continue;
          if (els.filter(n => hasAll(n, cs) && textCard(n)).length < 3) continue;
        }
        ev.push(part.trim().slice(0,30)+' scale('+sc[1]+')'); break;
      }
    }
    // Tailwind: hover:scale-105+ on the card element itself (group-hover:scale on a child is not the card moving)
    const own = k => k.split(/\s+/).some(t => /^(?:(?:sm|md|lg|xl|2xl|dark|motion-safe):)*hover:scale-(?:10[5-9]|1[1-9]\d)$/.test(t));
    const small = k => /(?:^|\s)(?:[\w-]+:)?(?:w|h|size)-(?:[1-9]|1[0-6]|\d\.5|\[(?:[1-5]?\d|6[0-4])px\])(?=\s|$)/.test(k);
    const tw = c.isFullDoc
      ? els.filter(n => own(n.cls) && /\brounded-(?:lg|xl|2xl|3xl|\[\d+px\])\b/.test(n.cls) && !skip.test(n.cls) && !small(n.cls) && textCard(n)).map(n => n.cls)
      : classAttrs(c.html).filter(k => own(k) && /\brounded-(?:lg|xl|2xl|3xl)\b/.test(k) && !skip.test(k));
    if (tw.length >= 3) ev.push(tw.length+' rounded cards with hover:scale-105 or more');
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A40', id:'verb-cosplay', name:'Verb Cosplay',
  fix:'A concrete verb and a concrete object. Keep the banned-word list in the design system.',
  test(c){
    // v1.2: the page's own copy only, and dense. Code samples, third-party listings (three or more <article>s, or
    // ten or more same-class siblings such as repo, job or book rows) are not the page's copy. Four distinct words,
    // at least 3 per 1,000 words of copy, and either one of them in a short title-like line (heading, card title,
    // CTA) or a density of 6 per 1,000: four words spread once each through long prose is not the pattern.
    const WORDS = /\b(unlock|elevate|empower|streamline|supercharge|seamless(?:ly)?|robust|delve|leverage|revolutioni[sz]e|effortless(?:ly)?|cutting-edge|game-chang(?:er|ing)|unleash)\b/gi;
    let body = (/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(c.html) || [, c.html])[1]
      .replace(/<(script|style|pre|code|svg|textarea|template|noscript)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    if ((body.match(/<article\b/gi) || []).length >= 3) body = body.replace(/<article\b[\s\S]*?<\/article>/gi, ' ');
    // repeated rows: ten or more siblings sharing one class are a feed or catalogue
    const cut = [];
    for (const kids of childrenOf(body, () => true)) {
      if (kids.length < 10) continue;
      const by = {}; for (const k of kids) if (k.cls) (by[k.tag + '.' + k.cls] = by[k.tag + '.' + k.cls] || []).push(k);
      for (const g of Object.values(by)) if (g.length >= 10) for (const k of g) cut.push(k.inner);
    }
    for (const s of cut) if (s.length > 40) body = body.split(s).join(' ');
    const blocks = body.split(/<\/?(?:p|li|h[1-6]|div|td|th|tr|dt|dd|blockquote|figcaption|section|article|header|footer|nav|ul|ol|br|button|label|option|table|main|aside|summary|details|a)\b[^>]*>/i)
      .map(b => b.replace(/<[^>]*>/g, ' ').replace(/&[#\w]+;/g, ' ').replace(/\s+/g, ' ').trim()).filter(b => /[A-Za-z]/.test(b));
    let words = 0, hits = 0; const uniq = new Set(), titled = new Set();
    for (const b of blocks) {
      const wn = (b.match(/[A-Za-z][\w'’-]*/g) || []).length; words += wn;
      for (const m of all(WORDS, b)) { const w = m[1].toLowerCase().replace(/ly$/, ''); uniq.add(w); hits++; if (wn <= 12) titled.add(w); }
    }
    if (uniq.size < 4 || !words) return null;
    const per1k = hits * 1000 / words;
    if (per1k < 3 || (!titled.size && per1k < 6)) return null;
    return {evidence:[[...uniq].slice(0,8).join(', ') + ' (' + hits + ' uses, ' + per1k.toFixed(1) + ' per 1,000 words)']}; } },

{ code:'A43', id:'em-dash-cadence', name:'Em Dash Cadence',
  fix:'Rewrite most dashes as full stops or commas. At most one per screen of copy, none in buttons.',
  test(c){
    // Count dashes in prose only: per block of body text (p, li, heading, cell, div), a dash between words, in a block
    // of at least four words. Not counted: a lone "—" placeholder cell or value, "Name — Tagline" / "Outlet — Section"
    // label separators, the <title> and meta tags. Sentences are full stops in those blocks, plus one for a dashed line that has none.
    const body = (/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(c.html) || [, c.html])[1]
      .replace(/<(script|style|pre|code|svg|textarea)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    const blocks = body.split(/<\/?(?:p|li|h[1-6]|div|td|th|tr|dt|dd|blockquote|figcaption|section|article|header|footer|nav|ul|ol|br|button|label|option|table|main|aside|summary|details)\b[^>]*>/i)
      .map(b => b.replace(/<[^>]*>/g, ' ').replace(/&mdash;|&#8212;|&#x2014;/gi, '—').replace(/&nbsp;|&#160;/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim())
      .filter(b => /[A-Za-z]/.test(b));
    const isTitleCase = s => { const w = s.match(/[A-Za-z][\w'’&.-]*/g) || []; if (!w.length) return false;
      const cap = w.filter(x => /^[A-Z0-9]/.test(x) || /^(of|and|for|the|a|an|to|in|on|with|by|&)$/i.test(x)).length; return cap / w.length >= 0.8 && !/[.!?]$/.test(s); };
    let dashes = 0, sentences = 0; const samples = [];
    for (const b of blocks) {
      const words = (b.match(/[A-Za-z][\w'’-]*/g) || []).length;
      if (words < 4) continue;
      const ends = (b.match(/[.!?](?:\s|$)/g) || []).length, before = dashes;
      for (const m of all(/([A-Za-z0-9%)'"’][^—]{0,80}?)\s?—\s?(?=([^—]{0,80}))/g, b)) {
        const left = b.slice(0, m.index + m[1].length).split(/[.!?:;|•·]\s/).pop().trim(), right = m[2].split(/[.!?:;|•·—]\s?/)[0].trim();
        if (!/[A-Za-z]/.test(right) || !/[A-Za-z]/.test(left)) continue;
        const lw = (left.match(/[A-Za-z][\w'’-]*/g) || []).length;
        if (lw <= 4 && isTitleCase(left) && isTitleCase(right)) continue;     // "Product — Tagline", "Outlet — Section"
        dashes++; if (samples.length < 2) samples.push((left.slice(-40) + ' — ' + right.slice(0, 40)).trim());
      }
      sentences += ends || (dashes > before ? 1 : 0);   // a card line without a full stop is still one sentence
    }
    // with placeholders, separators and chrome removed, one dash per three prose sentences is already several times human web copy
    if (dashes >= 5 && sentences && dashes / sentences > 1/3)
      return {evidence:[dashes+' em dashes in prose across roughly '+sentences+' sentences, more than one in every three', ...samples.map(s => '"' + s + '"')]};
    return null; } },

{ code:'A44', id:'emoji-bullets', name:'Emoji Bullets',
  fix:'Strip the leading emoji and the exclamation marks. A bold lead-in does the scanning.',
  test(c){
    // Only characters that render as emoji: U+1F300+ pictographs, the U+2600-27BF symbols whose default
    // presentation is emoji, or any U+2600-27BF symbol forced to emoji with U+FE0F. Plain text dingbats
    // (U+2713 check, U+2022) are ordinary typographic bullets, not the pattern.
    const DEFAULT_EMOJI = /[☔☕♈-♓♿⚓⚡⚪⚫⚽⚾⛄⛅⛎⛔⛪⛲⛳⛵⛺⛽✅✊✋✨❌❎❓-❕❗➕-➗➰➿]/u;
    const lead = /<li[^>]*>\s*(?:<(?:span|strong|b|em|i)\b[^>]*>\s*)?([\u{1F300}-\u{1FAFF}](?:\u{FE0F})?|[\u{2600}-\u{27BF}]\u{FE0F}?)/gu;
    const isEmoji = e => e.codePointAt(0) >= 0x1F300 || /️/.test(e) || DEFAULT_EMOJI.test(e);
    // A list whose marks include both a yes and a no symbol is a status key or comparison, where the emoji carry meaning.
    const POS = /^(✅|✔️|☑️|\u{1F7E2})$/u, NEG = /^(❌|❎|✖️|\u{1F534}|⛔|\u{1F6AB}|⚠️?)$/u;
    const lists = all(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/(?:ul|ol)>/gi, c.html).map(m => m[2]);
    if (!lists.length) lists.push(c.html);
    let total = 0, best = 0;
    for (const l of lists) {
      const em = all(lead, l).map(m => m[1]).filter(isEmoji);
      if (em.length < 2) continue;
      if (em.some(e => POS.test(e)) && em.some(e => NEG.test(e))) continue;
      total += em.length; best = Math.max(best, em.length);
    }
    if (best >= 2) return {evidence:[total+' list items opening with an emoji']};
    return null; } },

{ code:'A45', id:'get-started-learn-more', name:'Get Started / Learn More',
  fix:'Label the button with the action and its outcome. Vary it per page.',
  test(c){
    // The pattern is a CTA pair: a "Get Started" button or link beside a "Learn More" one in the same group,
    // with nothing but markup (or a word like "or") between them. The two phrases elsewhere on the page
    // (a tagline, pricing copy, a docs sidebar heading, a card link far from the hero button) are not the pair.
    const html = c.html;
    const ctl = [];
    for (const m of all(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi, html)) {
      const t = m[2].replace(/<[^>]*>/g, ' ').replace(/-*(?:>|&gt;)|[→›»↗]/g, ' ').replace(/&[#\w]+;/g, ' ').replace(/\s+/g, ' ').trim();
      const kind = /^get started(?: (?:now|free|for free|today))?$/i.test(t) ? 'G' : /^learn more$/i.test(t) ? 'L' : null;
      if (kind) ctl.push({ kind, s: m.index, e: m.index + m[0].length });
    }
    for (let i = 0; i + 1 < ctl.length; i++) {
      const a = ctl[i], b = ctl[i + 1];
      if (a.kind === b.kind || b.s - a.e > 1500) continue;
      const between = html.slice(a.e, b.s).replace(/<[^>]*>/g, ' ').replace(/&[#\w]+;/g, ' ').replace(/\s+/g, ' ').trim();
      if (between.length <= 12) return {evidence:['"Get Started" and "Learn More" as the button pair']};
    }
    return null; } },

{ code:'A46', id:'built-with-love-footer', name:"Built With Love Footer",
  fix:'A footer that links only to pages that exist, with a correct year and real contact details.',
  test(c){
    const ev = all(/(Made|Built|Crafted|Designed)\s+with\s+(❤️|❤|love|♥)/gi, c.visible).map(m=>m[0]);
    return ev.length ? {evidence:[...new Set(ev)]} : null; } },

{ code:'A47', id:'blank-tab-blank-preview', name:'Blank Tab, Blank Preview',
  fix:'A real favicon set, a 1200x630 OG image, and title and description written for the page.',
  test(c){
    // v1.2: the tab must look blank (no/generic title, framework or empty favicon, or no favicon at all)
    // AND the shared link must lack an image. Missing OG tags alone on a page with a real title and
    // its own favicon is a weak SEO gap, not this pattern.
    if (!c.isFullDoc) return null;
    const h = c.html;
    // Archive interstitials and parked-domain pages are not the product's own head.
    if (/Got an HTTP \d{3} response at crawl time/i.test(c.visible || '')) return null;
    const title = (h.match(/<title[^>]*>([^<]*)<\/title>/i)||[])[1];
    const t = title ? title.trim() : '';
    if (/^(parking page|domain (?:for sale|parked)|this domain is for sale)\b/i.test(t)) return null;
    const tab=[], preview=[];
    if (!t || /^(my app|react app|vite|vite \+ react(?: \+ ts)?|next\.?js|create next app|document|untitled|home|new project|index)\s*$/i.test(t))
      tab.push(t ? 'title is "'+t+'"' : 'no <title>');
    const icons = all(/<link\b[^>]*\brel\s*=\s*["'][^"']*\bicon\b[^"']*["'][^>]*>/gi, h)
      .map(m => (/\bhref\s*=\s*["']([^"']*)["']/i.exec(m[0])||[])[1]).filter(x => x !== undefined);
    if (icons.some(u => /\/(vite|next|favicon-lovable|lovable)\.svg(?:[?#]|$)|\/react\.svg(?:[?#]|$)/i.test(u))) tab.push('framework default favicon');
    else if (icons.length && icons.every(u => !u.trim() || /^data:,?\s*$/i.test(u.trim()))) tab.push('blank favicon (href="'+icons[0]+'")');
    else if (!icons.length) tab.push('no favicon link');
    if (!/property=["']og:image["']|name=["']twitter:image["']/i.test(h)) preview.push('no og:image');
    if (!/name=["']description["']|property=["']og:description["']/i.test(h)) preview.push('no description for the preview');
    if (!tab.length || !preview.includes('no og:image')) return null;
    // "no favicon link" is the weakest tab cue (the server may still serve /favicon.ico): require a fully bare preview with it.
    if (tab.length === 1 && tab[0] === 'no favicon link' && preview.length < 2) return null;
    return {evidence:tab.concat(preview)}; } },

{ code:'A48', id:'blueprint-grid-wallpaper', name:'Blueprint Grid Wallpaper',
  fix:'A ground that belongs to the product, and a grid aligned to the real layout if used at all.',
  test(c){
    // v1.2: a grid (two perpendicular hairline sets) or dot lattice, tiled every 12-80px, that a visitor can
    // actually see: line/dot alpha x the opacity of the element that carries it must reach ~0.02 for lines and
    // 0.03 for dots. A utility class counts only when its definition is in the page. On whole pages it must sit
    // behind the hero (before the headline, in a hero/header block) or be page-wide (html/body/main, fixed).
    // Hatching, scanlines and dashed rules are not grids.
    const R = rules(c.css);
    const vars = {};
    for (const r of R) for (const m of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) if (!(m[1] in vars)) vars[m[1]] = m[2];
    const resolve = (s, d=0) => d > 4 ? s : s.replace(/var\(\s*(--[\w-]+)\s*(?:,((?:[^()]|\([^()]*\))*))?\)/g, (_, n, fb) => n in vars ? resolve(vars[n], d+1) : (fb ? resolve(fb, d+1) : 'transparent'));
    const alphaOf = s => {    // alpha of the first colour in s (1 when opaque, 0 when transparent/unknown)
      s = s.trim(); let m, k = 1;
      if ((m = /^color-mix\(\s*in [\w-]+\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)/i.exec(s))) { k = +m[2]/100; s = m[1]; }
      if ((m = /^#([0-9a-f]{8}|[0-9a-f]{4})\b/i.exec(s))) { const h = m[1]; return k * (h.length === 8 ? parseInt(h.slice(6),16) : parseInt(h[3]+h[3],16)) / 255; }
      if (/^#[0-9a-f]{3,6}\b/i.test(s)) return k;
      if ((m = /^(?:rgba?|hsla?|oklch|oklab|lab|lch)\(([^)]*)\)/i.exec(s))) {
        const a = /(?:,|\/)\s*([\d.]+)(%?)\s*$/.exec(m[1]); const parts = m[1].split(/[\s,\/]+/).filter(Boolean);
        return k * (a && (parts.length >= 4) ? +a[1] / (a[2] ? 100 : 1) : 1);
      }
      if (/^transparent\b/i.test(s)) return 0;
      return /^[a-z]+\b/i.test(s) ? k : 0;
    };
    // what lattice does a background-image value draw? {kind, alpha, tile}
    const lattice = val => {
      val = resolve(val);
      const svg = /url\(\s*(["']?)data:image\/svg\+xml[^,]*,([\s\S]*?)\1\s*\)/i.exec(val);
      if (svg) {
        let x = svg[2]; try { x = decodeURIComponent(x); } catch (e) {}
        const w = /\bwidth=["']?([\d.]+)/i.exec(x); const tile = w ? +w[1] : null;
        // a grid cell needs both directions (rect stroke, or H and V segments); one direction is stripes or an icon
        const ds = all(/\bd=["']([^"']*)["']/gi, x).map(m => m[1]).join(' ');
        const dots = /<circle\b/i.test(x) || /<rect\b[^>]*fill=["'](?!none)/i.test(x) && !/stroke/i.test(x);
        const lines = /stroke/i.test(x) && (/<rect\b/i.test(x) || /[Hh]/.test(ds) && /[Vv]/.test(ds) || /<line\b[^>]*x1=["']?([\d.]+)["']?[^>]*x2=["']?\1\b/i.test(x) && /<line\b[^>]*y1=["']?([\d.]+)["']?[^>]*y2=["']?\1\b/i.test(x));
        if (!dots && !lines) return null;
        const colAttr = (/(?:stroke|fill)=["']((?:rgba?|hsla?)\([^)]*\)|#[0-9a-f]{3,8}|[a-z]+)["']/i.exec(x.replace(/fill=["']none["']/gi, ''))||[])[1] || '#000';
        const op = all(/(?:stroke-opacity|fill-opacity|opacity)=["']([\d.]+)["']/gi, x).reduce((p, m) => p * +m[1], 1);
        return { kind: dots && !lines ? 'dot' : 'line', alpha: alphaOf(colAttr) * op, tile };
      }
      const gs = all(/(repeating-)?(linear|radial)-gradient\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/gi, val);
      let h = 0, v = 0, dotA = null, lineA = [];
      for (const g of gs) {
        const args = g[3].split(/,(?![^()]*\))/).map(x => x.trim());
        const hard = args.some(a => /(?:\s|\))(?:0?\.\d+|[0-2](?:\.\d+)?)px$/.test(a));   // a 1-2px hard stop draws a hairline or a dot
        if (!hard) continue;
        if (g[2].toLowerCase() === 'radial') { const col = args.find(a => !/^(?:circle|ellipse|closest|farthest|at\b)/i.test(a)); if (col) dotA = Math.max(dotA || 0, alphaOf(col)); continue; }
        const dir = /^(?:to\s+\w+|-?[\d.]+deg|-?[\d.]+turn)$/i.test(args[0]) ? args.shift().toLowerCase() : 'to bottom';
        const deg = /^to (?:right|left)$/.test(dir) ? 90 : /^to (?:top|bottom)$/.test(dir) ? 0 : /deg$/.test(dir) ? ((parseFloat(dir) % 180) + 180) % 180 : -1;
        if (deg === 90) h++; else if (deg === 0) v++; else continue;
        lineA.push(Math.max(...args.map(alphaOf)));
      }
      const tile = (/background-size\s*:\s*([\d.]+)px/i.exec(val)||[])[1];
      if (h && v) return { kind: 'line', alpha: Math.max(...lineA), tile: tile ? +tile : null };
      if (dotA !== null) return { kind: 'dot', alpha: dotA, tile: tile ? +tile : null };
      return null;
    };
    const els = c.isFullDoc ? all(/<([a-z][\w-]*)\b([^>]*)>/gi, c.html).map(m => ({ i: m.index, tag: m[1].toLowerCase(),
      cls: ((/\bclass(?:Name)?\s*=\s*["']([^"']*)["']/i.exec(m[2])||[])[1] || '').split(/\s+/).filter(Boolean),
      id: (/\bid\s*=\s*["']([^"']*)["']/i.exec(m[2])||[])[1] || null, style: (/\bstyle\s*=\s*["']([^"']*)["']/i.exec(m[2])||[])[1] || '' })) : [];
    const h1end = (/<\/h1>/i.exec(c.html)||{index:-1}).index;
    const heroRanges = els.filter(e => e.tag === 'header' || /(?:^|[\s_-])(?:hero|masthead|jumbotron)(?:$|[\s_-])/i.test(e.cls.join(' ') + ' ' + (e.id||''))).map(e => {
      const re = new RegExp('<(/?)' + e.tag + '\\b[^>]*>', 'gi'); re.lastIndex = e.i + 1; let d = 1, x;
      while (d && (x = re.exec(c.html))) d += x[1] ? -1 : 1;
      return [e.i, d ? c.html.length : x.index];
    });
    const comp = s => { const bare = s.replace(/(?<!\\)::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g, '').replace(/(?<!\\)\[[^\]]*?(?<!\\)\]/g, '');
      return { pseudo: ((/::?(before|after)\b/i.exec(s)||[])[1]||'').toLowerCase(), tag: ((/^[a-z][\w-]*/i.exec(bare)||[])[0]||'').toLowerCase(),
        cls: all(/\.((?:\\.|[\w-])+)/g, bare).map(m => unesc(m[1])), id: (/#((?:\\.|[\w-])+)/.exec(bare)||[])[1] || null }; };
    const hits = (p, e) => (!p.tag || p.tag === e.tag) && p.cls.every(k => e.cls.includes(k)) && (!p.id || e.id === p.id) && (p.tag || p.cls.length || p.id);
    const parsed = R.filter(r => !/^\[inline-style\]/.test(r.sel)).flatMap(r => r.sel.split(/(?<!\\),/).map(part => {
      const cs = part.trim().split(/\s*(?<!\\)[\s>+~]\s*/).filter(Boolean); return { r, p: comp(cs[cs.length-1] || ''), part: part.trim() }; }));
    const twOpacity = cls => cls.filter(k => !/:/.test(k)).reduce((p, k) => { const m = /^opacity-(?:(\d+)|\[([\d.]+)(%?)\])$/.exec(k);
      return m ? p * (m[1] ? +m[1]/100 : +m[2] / (m[3] ? 100 : 1)) : p; }, 1);
    const twSize = cls => { for (const k of cls) { const m = /^(?:bg-\[size:|\[background-size:)([\d.]+)px/.exec(k); if (m) return +m[1]; } return null; };
    // v1.3: a page-level ground (html/body/main) is only seen where the content above it is transparent. When the
    // headline's own section (any wrapper between the ground and the h1) paints an opaque background, the hero hides it.
    const opaqueVal = v => { v = resolve(v).trim();
      if (!v || /^(?:none|transparent|inherit|initial|unset|currentcolor)\b/i.test(v)) return false;
      if (/url\(/i.test(v)) return true;
      if (/gradient\(/i.test(v)) { const cols = all(/#[0-9a-f]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)|\btransparent\b/gi, v).map(m => alphaOf(m[0]));
        return cols.length > 0 && cols.every(x => x >= 0.9); }
      return alphaOf(v) >= 0.9; };
    const TWBG = /^bg-(?!transparent$|none$|gradient|clip|cover|contain|center|no-repeat|repeat|fixed|local|scroll|origin|blend|bottom|top|left|right|\[(?:size|url|length|position|image))[\w\[\]#.-]+$/;
    const paints = e => e.cls.some(k => !/[:\/]/.test(k) && TWBG.test(k)) || opaqueVal((/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(e.style)||[])[1] || '')
      || parsed.some(q => !q.p.pseudo && !/:(?:hover|focus|active)/i.test(q.part) && hits(q.p, e)
        && all(/(?:^|[;\s])background(?:-color)?\s*:\s*([^;]+)/gi, q.r.body).some(m => opaqueVal(m[1].replace(/\s*!important\s*$/, ''))));
    let heroChain = null;   // ancestors of the first h1, outermost first
    if (c.isFullDoc && h1end >= 0) {
      const stack = [];
      for (const m of all(/<(\/?)([a-z][\w-]*)\b([^<>]*)>/gi, c.html)) {
        const tag = m[2].toLowerCase();
        if (m[1]) { for (let k = stack.length - 1; k >= 0; k--) if (stack[k].tag === tag) { stack.length = k; break; } continue; }
        if (tag === 'h1') { heroChain = stack.map(x => els.find(e => e.i === x.i)).filter(Boolean); break; }
        if (!VOIDTAG.test(tag) && !/\/\s*$/.test(m[3])) stack.push({ tag, i: m.index });
      }
    }
    const hidden = (e, pseudo, body) => {
      if (!heroChain || !/^(?:html|body|main)$/.test(e.tag)) return false;
      // a positioned pseudo-element without a negative z-index paints above the static content
      if (pseudo && /position\s*:\s*(?:fixed|absolute)/i.test(body) && !/z-index\s*:\s*-/i.test(body)) return false;
      // a max-width container leaves the ground showing in the gutters, so only full-width layers cover it
      const narrow = a => a.cls.some(k => /^(?:container|(?:[\w-]+:)?max-w-(?!none$|full$|screen$|\[100%\]$).+)$/.test(k))
        || parsed.some(q => !q.p.pseudo && hits(q.p, a) && /(?:^|[;\s])max-width\s*:\s*(?:min\()?[\d.]+(?:px|rem|em|ch)/i.test(q.r.body));
      return heroChain.some(a => a.i > e.i && !/^(?:html|body)$/.test(a.tag) && paints(a) && !narrow(a)
        && !heroChain.some(o => o.i > e.i && o.i < a.i && narrow(o)));
    };
    const ev = [];
    const judge = (lat, op, where, label) => {
      if (!lat || !lat.tile || lat.tile < 12 || lat.tile > 80) return;
      const eff = lat.alpha * op;
      // v1.3: a 1px dot covers far fewer pixels than a hairline, so dots need more alpha to be seen (4% dots vanish)
      if (eff < (lat.kind === 'dot' ? 0.05 : 0.02)) return;
      if (where) ev.push(label + ': ' + lat.kind + ' lattice every ' + lat.tile + 'px');
    };
    for (const s of parsed) {
      if (/background-repeat\s*:\s*no-repeat/i.test(s.r.body) || /icon|toggler|btn|button|logo|arrow|caret|chevron|check|select/i.test(s.part.split(/\s+/).pop())) continue;
      const bg = all(/(?:^|[;\s])background(?:-image)?\s*:\s*([^;]+)/gi, s.r.body).map(m => m[1]).join(', ');
      if (!/gradient\(|data:image\/svg/i.test(bg)) continue;
      const size = (/background-size\s*:\s*([\d.]+)px/i.exec(s.r.body)||[])[1];
      const lat0 = lattice(bg + (size ? '; background-size:' + size + 'px' : '')); if (!lat0) continue;
      const ruleOp = (/(?:^|[;\s])opacity\s*:\s*([\d.]+)/i.exec(s.r.body)||[,1])[1];
      if (!c.isFullDoc) { judge(lat0, +ruleOp, true, s.part.slice(0,30)); continue; }
      const pageWide = /^(?:html|body|main|:root)$/.test(s.p.tag) && !s.p.cls.length;
      const targets = pageWide ? [els.find(e => e.tag === s.p.tag) || { i: 0, tag: s.p.tag, cls: [], id: null }] : els.filter(e => hits(s.p, e));
      for (const e of targets) {
        // everything else that applies to this element (same pseudo): size, opacity, position
        const mine = parsed.filter(q => q.p.pseudo === s.p.pseudo && (q === s || hits(q.p, e)));
        const host = s.p.pseudo ? parsed.filter(q => !q.p.pseudo && hits(q.p, e)) : [];
        const body = mine.map(q => q.r.body).join(';');
        // the cascade: a later rule for the same element that sets another background replaces this one
        const bgRules = mine.filter(q => /(?:^|[;\s])background(?:-image)?\s*:/i.test(q.r.body));
        if (bgRules.length && bgRules[bgRules.length-1].r !== s.r) continue;
        if (s.p.pseudo && /(?:^|[;\s])content\s*:\s*none/i.test(body)) continue;   // .hero.has-water::after{content:none}
        if (hidden(e, s.p.pseudo, body)) continue;
        const sz = all(/background-size\s*:\s*([\d.]+)px/gi, body).map(m => +m[1]).pop() || twSize(e.cls) || lat0.tile;
        const lat = { ...lat0, tile: sz };
        // opacity from the CSS that reaches the element (Tailwind's own opacity-* rules included when inlined);
        // the utility classes are read directly only when their CSS is not in the page
        const opOf = txt => all(/(?:^|[;\s])opacity\s*:\s*([\d.]+)/gi, txt).map(m => +m[1]).pop();
        let op = opOf(body);
        const hostOp = host.length ? opOf(host.map(q => q.r.body).join(';')) : undefined;
        if (s.p.pseudo) op = (op === undefined ? 1 : op) * (hostOp === undefined ? twOpacity(e.cls) : hostOp);
        else if (op === undefined) op = twOpacity(e.cls);
        const fixed = /position\s*:\s*fixed/i.test(body) || e.cls.includes('fixed');
        const where = pageWide || fixed || (h1end >= 0 && e.i < h1end) || heroRanges.some(([a,b]) => e.i >= a && e.i < b);
        judge(lat, op, where, s.part.slice(0,30));
      }
    }
    // inline-style lattices on elements
    for (const e of els) if (/gradient\(|data:image\/svg/i.test(e.style)) {
      const lat = lattice(e.style); if (!lat) continue;
      const where = (h1end >= 0 && e.i < h1end) || heroRanges.some(([a,b]) => e.i >= a && e.i < b) || /position\s*:\s*fixed/i.test(e.style);
      const o = /(?:^|[;\s])opacity\s*:\s*([\d.]+)/i.exec(e.style);
      judge(lat, (o ? +o[1] : 1) * twOpacity(e.cls), where, '<' + e.tag + ' style>');
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,2)} : null; } },

{ code:'B118', id:'hidden-on-small-screens', name:'Hidden On Small Screens',
  fix:'Reflow instead of removing: stack rows into cards, or scroll with a visible affordance.',
  test(c){
    // v1.2: flag only real content (text or a table) that disappears below a breakpoint and is not
    // available anywhere else on the page. Responsive <br>s, decorative svgs/divs, mockups with a
    // mobile twin, and a short desktop nav that collapses into a mobile menu toggle are not the pattern.
    const src = String(c.text || c.html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    const outer = (s, at, tag) => {          // the element starting at `at`, matched by depth
      const re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi'); re.lastIndex = at; let d = 0, e;
      while ((e = re.exec(s))) { if (/\/\s*>$/.test(e[0])) continue; d += e[1] ? -1 : 1; if (!d) return s.slice(at, re.lastIndex); }
      return s.slice(at, at + 4000);
    };
    const textOf = h => h.replace(/<(svg|script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    const words = t => (t.toLowerCase().match(/[a-zÀ-￿]{3,}/g) || []);
    const OPEN = /<([a-z][\w-]*)\b[^>]*\bclass=["'](?:[^"']*\s)?hidden\s+(?:[^"']*\s)?((?:sm|md|lg|xl|2xl):(?:block|flex|grid|table|inline-flex))\b[^"']*["'][^>]*>/gi;
    const found = []; const spans = [];
    for (const m of all(OPEN, src)) {
      const tag = m[1].toLowerCase();
      if (/^(br|hr|img|svg|path|span|i|video|picture|canvas|iframe|button)$/.test(tag)) continue;
      if (spans.some(([a, b]) => m.index > a && m.index < b)) continue;      // nested inside one already taken
      const el = outer(src, m.index, tag); spans.push([m.index, m.index + el.length]);
      const t = textOf(el);
      if (t.length < 40 && !/<table\b/i.test(el)) continue;                  // decorative or a few words
      found.push({ tag, bp: m[2], el, t, at: m.index });
    }
    if (!found.length) return null;
    // v1.3: what phones get instead. Elements hidden from a breakpoint up (`lg:hidden`, `max-lg:block`)
    // are the small-screen side. A twin covers hidden content when it is shown at least as far up
    // as the content is hidden (an `md:hidden` menu does not cover an `lg:block` sidebar between md and lg).
    const RANK = { sm: 1, md: 2, lg: 3, xl: 4, '2xl': 5 };
    const twins = [];
    for (const m of all(/<([a-z][\w-]*)\b([^>]*\bclass=["'](?:[^"']*\s)?(sm|md|lg|xl|2xl):hidden\b[^>]*)>/gi, src)) {
      const tag = m[1].toLowerCase(); if (/^(svg|path|img|br|hr|span|i|picture|video)$/.test(tag)) continue;
      const el = /^(input|img|br|hr)$/.test(tag) ? m[0] : outer(src, m.index, tag);
      const head = el.slice(0, 1500);
      const toggle = tag === 'button' || /<button\b|aria-expanded|aria-controls|@click|x-on:click|\bonclick\s*=|data-(?:bs-)?toggle|aria-label=["'][^"']*(?:menu|navigation|sidebar|drawer)|\b(?:id|class)=["'][^"']*(?:hamburger|mobile-?(?:menu|nav)|drawer|menu-toggle|nav-toggle)/i.test(head);
      const links = (el.match(/<a\b/gi) || []).length;
      const block = textOf(el).length >= 40 || links >= 3 || /\b(?:class|id|x-ref)=["'][^"']*\b[\w-]*(?:card|list|mobile|items|grid|table|feed)/i.test(m[2]);
      twins.push({ at: m.index, end: m.index + el.length, rank: RANK[m[3]], toggle, block });
    }
    const coveredBy = (f, navLike) => twins.some(t => t.rank >= RANK[f.bp.split(':')[0]] && (
      (navLike && (t.toggle || t.block)) ||                     // a menu toggle or a mobile nav/tab bar
      (t.block && (Math.abs(t.at - (f.at + f.el.length)) < 4000 || Math.abs(f.at - t.end) < 4000))));   // a nearby block of the same role
    const ev = [];
    for (const f of found) {
      const rest = textOf(src.slice(0, f.at) + ' ' + src.slice(f.at + f.el.length));
      const restWords = new Set(words(rest));
      const w = [...new Set(words(f.t))];
      const covered = w.length ? w.filter(x => restWords.has(x)).length / w.length : 1;
      if (covered >= 0.6) continue;                                            // the same content exists elsewhere (mobile twin)
      // Narrowed to the recognisable core: a data table, a long link list (docs sidebar, table of contents),
      // or copy hidden directly (a paragraph, heading or list item). Mixed <div> blocks on landing pages are
      // nearly always illustrative mockups (chat demos, terminals, dashboards) and are not judged.
      const links = (f.el.match(/<a\b/gi) || []).length;
      const isTable = /<table\b|role=["'](table|grid)["']/i.test(f.el);
      const isLinkList = links > 10;
      // v1.3: a trimmed tagline or second description line is copy editing, not lost content. Copy counts
      // when it is a list item, a paragraph of two sentences or more (120+ chars, longer than a tagline), or carries a link found nowhere else.
      const hrefs = all(/<a\b[^>]*\bhref=["']([^"'#][^"']*)["']/gi, f.el).map(m => m[1]);
      const restSrc = src.slice(0, f.at) + src.slice(f.at + f.el.length);
      const uniqueLink = hrefs.some(h => !restSrc.includes('"' + h + '"') && !restSrc.includes("'" + h + "'"));
      const isCopy = (/^(li|dl)$/.test(f.tag) && f.t.length >= 40) || (/^(p|h[1-6]|blockquote)$/.test(f.tag) && (f.t.length >= 120 || uniqueLink));
      if (!isTable && !isLinkList && !isCopy) continue;
      if (coveredBy(f, isLinkList && !isTable)) continue;
      if (/\baria-hidden=["']true["']/i.test(f.el.slice(0, 400))) continue;
      ev.push('<' + f.tag + ' class="hidden ' + f.bp + '"> "' + f.t.slice(0, 50) + '…" has no small-screen version');
    }
    return ev.length ? {evidence: ev.slice(0, 3)} : null; } },

{ code:'B122', id:'all-buttons-are-primary', name:'All Buttons Are Primary',
  fix:'One primary action per view. Secondary outlined, destructive styled and placed apart.',
  test(c){
    // v1.2: the group must be distinct actions (not tabs, chips, pagers or repeated Copy/Close), and the
    // shared style must be a filled primary: a solid background with contrasting text.
    const btns = all(/<button\b([^>]*)>([\s\S]{0,200}?)<\/button>/gi, c.html).map(m => {
      const cls = (/\bclass(?:Name)?\s*=\s*["']([^"']+)["']/i.exec(m[1]) || [])[1];
      return cls && { at: m.index, attrs: m[1], cls: cls.trim().replace(/\s+/g, ' '), label: m[2].replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim() };
    }).filter(Boolean);
    if (btns.length < 3) return null;
    const CONTROL = /\brole\s*=\s*["'](tab|switch|menuitem|option|radio|checkbox)["']|\baria-(selected|pressed|checked|haspopup|expanded)\s*=/i;
    // actions are verbs; prompt suggestions, filter values and topic chips are nouns
    const VERB = /^(save|cancel|delete|remove|discard|export|import|download|upload|share|send|submit|apply|reset|restore|clear|edit|update|create|add|new|start|stop|run|try|get|buy|book|join|sign|log|learn|view|see|read|open|close|continue|next|back|confirm|approve|reject|copy|generate|connect|install|deploy|publish|subscribe|contact|request|schedule|watch|explore|launch|upgrade|retry|refresh|preview|print)\b/i;
    const NOT_WORDS = /^(tabs?|chips?|filters?|pills?|toggle|segment|segmented|close|dismiss|copy|icon|ghost|outline|outlined|secondary|tertiary|link|text|nav|navbar|pager|pagination|page|prev|next|menu|dropdown|accordion|faq|suggestion|tag)$/i;
    const notPrimary = cls => cls.split(' ').some(t => !/:/.test(t) && !/^text-/.test(t)
      && (/^(bg-transparent|bg-white|border)$/.test(t) || /^variant-(ghost|outline|link)$/.test(t) || t.split(/[-_]+/).some(w => NOT_WORDS.test(w))));
    const groups = {};
    for (const b of btns) { if (CONTROL.test(b.attrs) || !b.label) continue; (groups[b.cls] = groups[b.cls] || []).push(b); }
    const filled = cls => {
      const toks = cls.split(' ');
      if (toks.some(t => /^(btn|button)[-_]{1,2}primary$|^(btn|button)[-_]{1,2}(solid|filled|cta)$/i.test(t))) return 'primary class';
      // Tailwind: a saturated or dark background with white/foreground text
      const bg = toks.find(t => /^bg-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[5-9]00|black|primary|accent|brand)$/.test(t));
      if (bg && toks.some(t => /^text-(white|primary-foreground|accent-foreground|brand-foreground)$/.test(t))) return bg;
      // own CSS: a rule for one of these classes with a solid background and contrasting text
      for (const r of rules(c.css)) {
        const sel = parts(r.sel).find(p => toks.some(t => p === '.' + t.toLowerCase()));
        if (!sel) continue;
        const bgv = (/(?:^|;|\s)background(?:-color)?\s*:\s*(#[0-9a-f]{3,6}\b|rgba?\([^)]*\))/i.exec(r.body) || [])[1];
        const fg = declColor(r.body, 'color');
        const b = parseColor(bgv);
        if (b && fg && Math.max(...b) - Math.min(...b) + (255 - Math.max(...b)) > 40 && contrast(b, fg) >= 3) return sel + ' background ' + hex(b);
      }
      return null;
    };
    for (let [cls, g] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
      if (g.length < 3 || notPrimary(cls)) continue;
      // one view: three distinct actions side by side (a toolbar or a card footer), not the one primary
      // button of each separate form or dialog on the page
      let best = [];
      for (let i = 0; i < g.length; i++) {
        const near = g.filter(b => b.at >= g[i].at && b.at - g[i].at < 1500 && !/<\/(form|dialog)>|role=["']dialog/i.test(c.html.slice(g[i].at, b.at)));
        if (near.length > best.length) best = near;
      }
      const labels = [...new Set(best.map(b => b.label.toLowerCase()))];
      if (labels.length < 3) continue;                       // the same action repeated per row is consistent, not flat
      if (labels.filter(l => VERB.test(l)).length < 2) continue;
      g = best;
      const why = filled(cls); if (!why) continue;
      const shown = [...new Set(g.map(b => b.label))].slice(0, 5).join(', ');
      const destr = g.find(b => /^(delete|remove|discard|cancel)\b/i.test(b.label));
      return {evidence:[g.length + ' filled buttons share one style (' + why + '): ' + shown + (destr ? ', including "' + destr.label + '"' : '')]};
    }
    return null; } },

{ code:'B123', id:'coming-soon-navigation', name:'Coming Soon Navigation',
  fix:'Remove links to pages that do not exist. Real anchors, and a 404 with a route home.',
  test(c){
    // v1.2: only site navigation counts (nav, header, footer, or their landmark roles). href="#" on JS
    // controls (tabs, dropdown toggles, role=button) is a control, not a dead link; links in product
    // mockups and demo bubbles are illustrations; 'Coming soon' on roadmap or feature cards is not nav.
    const outer = (s, at, tag) => {
      const re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi'); re.lastIndex = at; let d = 0, e;
      while ((e = re.exec(s))) { d += e[1] ? -1 : 1; if (!d) return s.slice(at, re.lastIndex); }
      return s.slice(at, at + 20000);
    };
    const regions = []; let lastEnd = -1;
    for (const m of all(/<(nav|header|footer)\b[^>]*>|<([a-z][\w-]*)\b[^>]*\brole=["'](navigation|banner|contentinfo)["'][^>]*>/gi, c.html)) {
      if (m.index < lastEnd) continue;                                   // nested in a region already taken
      const el = outer(c.html, m.index, (m[1] || m[2]).toLowerCase());
      lastEnd = m.index + el.length; regions.push(el);
    }
    if (!regions.length) return null;
    const nav = regions.join('\n');
    const JS_CONTROL = /\brole\s*=|\bdata-(?:bs-)?toggle\s*=|\baria-(?:controls|expanded|haspopup)\s*=|\son[a-z]+\s*=|\s(?:@click|x-on:|v-on:|data-action)\b/i;
    const ILLUSTRATION = /class=["'][^"']*\b[\w-]*(?:demo|mock|preview|example|sample)[\w-]*\b/i;
    // v1.3: attributes a plain link carries. Anything else on an href="#" anchor (open-signup, data-w-id,
    // data-modal ...) is a hook a script binds to, so the anchor is a control, not a dead link.
    const PLAIN_ATTR = /^(?:href|class|id|title|target|rel|style|lang|dir|hreflang|type|download|name|tabindex|itemprop|aria-label|aria-current|aria-hidden|data-(?:testid|test-id|framer-name|astro-cid-[\w-]+|v-[\w-]+|svelte-h|discover|text))$/i;
    const hasHook = a => all(/([^\s=\/"']+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g, a).some(m => !PLAIN_ATTR.test(m[1]));
    // Brand and site-title links: href="#" means 'top of this one-page site'. Same for 'Back to top'.
    const BRAND = /(?:class|title|id|aria-label)\s*=\s*["'][^"']*\b(?:[\w-]*(?:brand|logo)[\w-]*|site-?title|home)\b/i;
    const regionStarts = []; { let at = 0; for (const r of regions) { regionStarts.push(at); at += r.length + 1; } }
    const firstLinkAt = new Set(regionStarts.map(st => { const re = /<a\b/gi; re.lastIndex = st; const f = re.exec(nav); return f ? f.index : -1; }));
    const isHeaderStart = i => { const k = regionStarts.filter(st => st <= i).pop(); return k != null && /^<(?:nav|header)\b|^<[^>]*role=["'](?:navigation|banner)/i.test(nav.slice(k, k + 300)); };
    // Dropdown parents: the link is followed, inside the same list item, by a submenu.
    const isMenuParent = m => {
      const after = nav.slice(m.index + m[0].length, m.index + m[0].length + 600);
      const upto = after.split(/<\/li>|<li\b/i)[0];
      if (/<(?:ul|ol)\b|class=["'][^"']*\b(?:sub-?menu|dropdown|mega-?menu)[\w-]*/i.test(upto)) return true;
      const before = nav.slice(Math.max(0, m.index - 400), m.index); const li = before.lastIndexOf('<li');
      return li >= 0 && !/<\/li>|<a\b/i.test(before.slice(li + 3)) && /<li\b[^>]*class=["'][^"']*\b(?:menu-item-has-children|has-?(?:sub-?menu|dropdown|children)|dropdown)\b/i.test(before.slice(li));
    };
    const dead = all(/<a\b([^>]*?)\bhref\s*=\s*["'](?:#|javascript:(?:void\(0\);?|;)?)["']([^>]*)>([\s\S]{0,200}?)<\/a>/gi, nav)
      .filter(m => !JS_CONTROL.test(m[1] + ' ' + m[2]) && !ILLUSTRATION.test(m[1] + ' ' + m[2]))
      .filter(m => !hasHook(m[1] + ' ' + m[2]) && !BRAND.test(m[1] + ' ' + m[2]) && !isMenuParent(m))
      .filter(m => !(firstLinkAt.has(m.index) && isHeaderStart(m.index)))
      .map(m => m[3].replace(/<span[^>]*sr-only[^>]*>([^<]*)<\/span>/gi, ' $1 ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim())
      .filter(t => t && !/^(?:back to top|to top|scroll to top|top)\b/i.test(t));
    const uniq = [...new Set(dead.map(t => t.toLowerCase()))];   // responsive duplicate menus count once
    // 'Coming soon' on a nav link itself. A plain-text 'Android: coming soon' list item is an honest label.
    const soon = all(/<(a)\b[^>]*>((?:(?!<\/a>)[\s\S]){0,300}?)<\/a>/gi, nav)
      .map(m => m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(t => /\bcoming soon\b/i.test(t) && t.length <= 50).length;
    const ev=[];
    if (uniq.length >= 2) ev.push(uniq.length+' navigation links with href="#": '+[...new Set(dead)].slice(0,4).join(', '));
    if (soon) ev.push(soon+' navigation item(s) marked "Coming soon"');
    return ev.length ? {evidence:ev} : null; } },

{ code:'B115', id:'landmark-free-page', name:'Landmark-Free Page',
  fix:'header, nav, main and footer as elements, one h1, and a heading order that matches the page.',
  test(c){
    // v1.1 of this entry: no landmarks at all, not merely a missing <main> or <nav>.
    if (!c.isFullDoc) return null;
    const has = t => new RegExp('<'+t+'[\\s>]','i').test(c.html);
    const role = r => new RegExp('role=["\']'+r+'["\']','i').test(c.html);
    if (has('main') || has('nav') || has('header') || has('footer') || has('aside') || role('main') || role('navigation') || role('banner') || role('contentinfo')) return null;
    if ((c.visible || '').length < 400) return null;          // too little page to judge (captcha, redirect, parked)
    return {evidence:['no main, nav, header, footer or aside, and no landmark roles']}; } },

{ code:'B117', id:'errors-nobody-announces', name:'Errors Nobody Announces',
  fix:'aria-invalid on the field, the message tied by aria-describedby, focus moved to the first error.',
  test(c){
    // v1.2: needs a text-entry field the site owns AND a custom error message element. Red text that is
    // not an error (icons, stats, legend swatches), native `required` validation, search boxes, selects,
    // Tailwind `aria-invalid:` variants and third-party widgets (reCAPTCHA, injected toolbars) do not count.
    const THIRD = /\bstyle-scope\b|\bg-?recaptcha|\bwm-ipp|\bwb-|\bcf-turnstile|\bhcaptcha/i;
    // v1.3: an archive.org capture page (redirect notice, 'not archived') is not the site
    if (/<title[^>]*>\s*Wayback Machine|Got an HTTP 30\d response at crawl time|Wayback Machine has not archived/i.test(c.text || c.html)) return null;
    const fields = all(/<(input|textarea)\b([^>]*)>/gi, c.html).filter(m => {
      const a = m[2];
      if (THIRD.test(a)) return false;
      if (/\s(?:disabled|readonly)(?:\s|=|\/|$)/i.test(' ' + a.replace(/"[^"]*"|'[^']*'/g, '""'))) return false;   // v1.3: a field nobody can type in has no errors
      if (m[1].toLowerCase() === 'input') {
        const t = ((/\btype\s*=\s*["']?([\w-]+)/i.exec(a) || [])[1] || 'text').toLowerCase();
        if (!/^(text|email|password|tel|number|url|date|datetime-local|month|time|week|file)$/.test(t)) return false;
      }
      return !/\brole\s*=\s*["']searchbox|\b(name|id)\s*=\s*["'](q|s|query|search[\w-]*)["']|placeholder\s*=\s*["']\s*search/i.test(a);
    });
    if (!fields.length) return null;
    const ERR_TOKEN = /^(?:[\w]+[-_]+)*(?:error|errors|err|invalid|is-invalid|field-error|helper-error)(?:[-_]+[\w]+)*$/i;
    const MSG = /\b(invalid|required|please (enter|provide|fill|choose|select)|must (be|contain|include)|incorrect|too (short|long)|failed|error|not (valid|match))\b/i;
    // v1.3: the message must sit with a field (inside the same <form>, or within a short stretch of markup
    // of one), must not announce itself already (role=alert / aria-live on the element), and must be a
    // field error, not a form-level submission notice (Webflow .w-form-fail 'Oops! Something went wrong').
    const fieldAt = fields.map(m => m.index);
    const forms = all(/<form\b[^>]*>[\s\S]*?<\/form>/gi, c.html).map(m => [m.index, m.index + m[0].length]);
    const nearField = i => forms.some(([s0, e0]) => i > s0 && i < e0 && fieldAt.some(f => f > s0 && f < e0)) || fieldAt.some(f => Math.abs(f - i) < 1500);
    const SUBMIT_NOTICE = /\bw-form-(?:fail|done)\b|\bform-(?:fail|failure|success|done)\b/i;
    const textAfter = i => c.html.slice(i, i + 400).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    let errEl = null;
    for (const m of all(/<([a-z][\w-]*)\b([^>]*)>/gi, c.html)) {
      const a = m[2]; if (THIRD.test(a) || /^(input|textarea|select|form|body|html|script|link|meta)$/i.test(m[1])) continue;
      if (!/\b(?:class|id)\s*=/i.test(a)) continue;
      if (/\brole\s*=\s*["'](?:alert|status)["']|\saria-live\s*=\s*["'](?:polite|assertive)/i.test(a)) continue;
      if (SUBMIT_NOTICE.test(a) || /^(?:oops|something went wrong while submitting|please try again)/i.test(textAfter(m.index + m[0].length))) continue;
      if (!nearField(m.index)) continue;
      const cls = ((/\bclass\s*=\s*["']([^"']*)["']/i.exec(a) || [])[1] || '').split(/\s+/)
        .filter(t => t && !/:/.test(t) && !/^(bg|text|border|ring|fill|stroke|outline|from|via|to|shadow|decoration|placeholder|caret|accent|divide)-/.test(t));   // colour utilities name a palette, not a message
      const id = (/\bid\s*=\s*["']([^"']*)["']/i.exec(a) || [])[1] || '';
      const named = cls.find(t => ERR_TOKEN.test(t)) || (ERR_TOKEN.test(id) && '#' + id);
      if (named && !/^(error-?page|error-?boundary|not-?found)$/i.test(named)) { errEl = named; break; }
      // red text counts only when what it says is an error message
      if (cls.some(t => /^text-red-[5-7]00$/.test(t))) {
        const txt = c.html.slice(m.index + m[0].length, m.index + m[0].length + 200).split('<')[0];
        if (MSG.test(txt) && txt.length < 160) { errEl = 'red "' + txt.trim().slice(0, 40) + '"'; break; }
      }
    }
    if (!errEl) return null;
    const ev=['error message element ' + errEl + ' beside ' + fields.length + ' text field(s)'];
    const miss=[];
    if (!/\saria-invalid\s*=/i.test(c.html)) miss.push('no aria-invalid on any field');
    if (!/\saria-describedby\s*=/i.test(c.html)) miss.push('no aria-describedby linking the message to the input');
    if (!/role=["']alert["']|aria-live/i.test(c.html)) miss.push('no role="alert" or aria-live region');
    return miss.length >= 2 ? {evidence:ev.concat(miss)} : null; } },

{ code:'B119', id:'lorem-ipsum-in-production', name:'Lorem Ipsum In Production',
  fix:'Treat placeholder text as a build error. Grep for filler in CI and require real copy before publish.',
  test(c){
    // Scaffold leftovers: a framework-default tab title, or a placeholder name/slot that stands on its own as a
    // page element ("John Doe" under a testimonial, "Your logo here"). Not: sample data in code blocks, API
    // examples and product demos, template/sample sites, or instructions that merely contain the words.
    const ev = [];
    const title = ((/<title[^>]*>([^<]*)<\/title>/i.exec(c.html) || [])[1] || '').trim();
    const t0 = /^(Vite \+ React(?: \+ TS)?|Vite App|Create Next App|React App|Next\.js App)$/i.exec(title);
    if (t0) ev.push('tab title "' + t0[1] + '"');
    if (c.isFullDoc && /\b(templates?|samples?|examples?|demos?|ui kit|components?|playground|docs|documentation|api|sdk)\b/i.test(title)) return ev.length ? {evidence:ev} : null;
    const html = c.html.replace(/<(pre|code|textarea|script|kbd|samp)\b[^>]*>[\s\S]*?<\/\1>/gi, m => ' '.repeat(m.length));
    const CONTAINER = /\b(demo|mock|example|sample|preview|snippet|code|playground|showcase|editor|terminal|chat|message|email|inbox|invoice|output|result)/i;
    const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr|path|circle|rect|line|polyline|polygon|use|stop)$/i;
    const insideDemo = idx => {            // does any open ancestor at idx carry a demo/mock/example class or id?
      const stack = [];
      for (const m of all(/<(\/?)([a-z][\w-]*)\b([^<>]*)>/gi, html.slice(0, idx))) {
        const tag = m[2].toLowerCase();
        if (m[1]) { const k = stack.map(s => s.tag).lastIndexOf(tag); if (k >= 0) stack.length = k; continue; }
        if (VOID.test(tag) || /\/\s*$/.test(m[3])) continue;
        stack.push({ tag, attrs: m[3] });
      }
      return stack.some(s => /^(pre|code|figure)$/.test(s.tag) || CONTAINER.test((/\b(?:class|id|data-[\w-]+)\s*=\s*["']([^"']*)/i.exec(s.attrs) || [])[1] || ''));
    };
    const RE = /\b(John Doe|Jane Doe|Acme Corp(?:oration)?|Example Inc|Your Company(?: Name)?|Your (?:text|logo|testimonial|name|title|headline) here|Lorem Company)\b/gi;
    for (const m of all(/>([^<>]+)</g, html)) {
      const seg = m[1].replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
      if (!seg || seg.length > 40) continue;                         // a standalone label, not a sentence that mentions it
      const p = RE.exec(seg); RE.lastIndex = 0;
      if (!p) continue;
      if (/^your\b/i.test(p[1]) && !/^[\W\d]*your\b[^.]*here\W*$/i.test(seg) && !/^[\W\d]*(?:©|\(c\)|copyright)?\s*[\d\s]*your company/i.test(seg)) continue;
      if (/^your company/i.test(p[1]) && !/©|\(c\)|copyright|\d{4}/i.test(seg)) continue;
      if (c.isFullDoc && insideDemo(m.index)) continue;
      ev.push('"' + seg + '"');
      if (ev.length >= 4) break;
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,4)} : null; } },

{ code:'B124', id:'the-inert-button', name:'The Inert Button',
  fix:'Remove controls that do nothing, or disable them with a reason.',
  test(c){
    // A whole rendered page attaches handlers from script, which markup cannot show. Snippets only.
    if (c.isFullDoc) return null;
    const ev=[];
    for (const m of all(/<button\b((?:(?!>)[\s\S])*)>([\s\S]{0,40}?)<\/button>/gi, c.html)) {
      const attrs = m[1];
      // inline handler, submit, disabled, or a data-* hook used by a delegated listener
      if (/\son[A-Za-z]+\s*=|\btype\s*=\s*["']submit["']|\bdisabled\b|\bformaction\b|\sdata-[\w-]+\s*=|\baria-controls\b|\bpopovertarget\b/.test(attrs)) continue;
      const label = m[2].replace(/<[^>]+>/g,'').trim();
      if (label) ev.push('<button> "'+label+'" with no handler, no type=submit and not disabled');
    }
    return ev.length >= 2 ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'B134', id:'the-megabyte-bundle', name:'The Megabyte Bundle',
  fix:'Named imports, route-level code splitting, and a size budget enforced in CI.',
  test(c){
    const ev=[];
    if (/import\s+_\s+from\s+['"]lodash['"]|require\(['"]lodash['"]\)/.test(c.text)) ev.push("whole-library import: lodash");
    if (/from\s+['"]moment['"]/.test(c.text)) ev.push('moment imported (ships every locale)');
    if (/import\s+\*\s+as\s+\w+\s+from\s+['"](?:react-icons|@mui\/icons-material|lucide-react)['"]/.test(c.text))
      ev.push('entire icon set imported with import * as');
    return ev.length ? {evidence:ev} : null; } },

{ code:'B135', id:'unsized-images-shifting-layout', name:'Unsized Images Shifting Layout',
  fix:'width and height or aspect-ratio on every image, responsive sources, and reserved space.',
  test(c){
    // Walk the markup keeping the ancestor chain, so CSS like ".hero__bg img {height:100%}" or a fixed-size
    // frame around the image can be credited, not only classes on the <img> itself.
    const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
    const attr = (a, n) => { const r = new RegExp('(?:^|\\s)'+n+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|\\{["\'`]?([^"\'`}]*)|([^\\s>]+))','i').exec(a); return r ? (r[1]??r[2]??r[3]??r[4]??'') : null; };
    const node = (tag, a) => ({ tag, a, cls: new Set(((attr(a,'class') ?? attr(a,'className')) || '').split(/\s+/).filter(Boolean)), id: attr(a,'id'), style: attr(a,'style') || '' });
    const imgs = [], stack = [];
    for (const m of all(/<(\/?)([a-z][\w-]*)\b((?:(?!>)[\s\S])*)>/gi, c.html)) {
      const tag = m[2].toLowerCase();
      if (m[1]) { const i = stack.map(x => x.tag).lastIndexOf(tag); if (i >= 0) stack.length = i; continue; }
      const n = node(tag, m[3]);
      if (tag === 'img') { imgs.push({ el: n, raw: m[3], anc: stack.slice().reverse() }); continue; }
      if (VOID.test(tag) || /\/\s*$/.test(m[3])) continue;
      stack.push(n);
    }
    // compound matcher on one element
    const compMatch = (comp, e) => {
      const bare = comp.replace(/:not\([^()]*\)|::?[\w-]+(\([^()]*\))?/g, '');
      const tag = (/^([a-z][\w-]*|\*)/i.exec(bare) || [])[1];
      const cs = all(/\.((?:\\.|[\w-])+)/g, bare).map(m => unesc(m[1]));
      const id = (/#((?:\\.|[\w-])+)/.exec(bare) || [])[1];
      if (!tag && !cs.length && !id) return false;
      return (!tag || tag === '*' || e.tag === tag.toLowerCase()) && cs.every(k => e.cls.has(k)) && (!id || e.id === unesc(id));
    };
    // selector part applies to element with given ancestors (descendant semantics, order-insensitive)
    const applies = (part, e, anc) => {
      const comps = part.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, '').trim().split(/\s*[\s>+~]\s*/).filter(Boolean);
      if (!comps.length || !compMatch(comps[comps.length-1], e)) return false;
      return comps.slice(0, -1).every(cp => anc.some(a => compMatch(cp, a)));
    };
    const rs = rules(c.css).filter(r => r.sel !== '[inline-style]' && /height|aspect-ratio|position/i.test(r.body));
    const memo = new Map();
    const decls = (e, anc) => { const key = e.tag+'.'+[...e.cls].join('.')+'#'+e.id+'|'+anc.map(a => a.tag+'.'+[...a.cls].join('.')+'#'+a.id).join(' ');
      if (!memo.has(key)) memo.set(key, rs.filter(r => r.sel.split(',').some(p => applies(p.trim(), e, anc))).map(r => r.body).join(';'));
      return memo.get(key) + ';' + e.style; };
    const LEN = '\\d+(?:\\.\\d+)?(?:px|rem|em|vh|svh|dvh)';
    // the image's own box is fixed: explicit height / aspect-ratio, a small max-height, or it fills an absolutely placed box
    const imgFixed = d => new RegExp('(?:^|[;\\s{])(?:height\\s*:\\s*(?:'+LEN+'|100%|calc|var)|aspect-ratio\\s*:\\s*[\\d.]|max-height\\s*:\\s*(?:[1-9]\\d?|100)px)', 'i').test(d) ||
      /(?:^|[;\s])position\s*:\s*(?:absolute|fixed)/i.test(d);     // out of flow: cannot push anything
    // a frame with a fixed height or aspect-ratio: the image can only move things inside it
    const frameFixed = (e, d) => new RegExp('(?:^|[;\\s{])(?:height\\s*:\\s*'+LEN+'|aspect-ratio\\s*:\\s*[\\d.])', 'i').test(d) ||
      [...e.cls].some(k => /^(?:h|size)-(?:\d|\[)|^aspect-(?:\w|\[)/.test(k) ||
        /^(?:\[&(?:amp;)?[_>]?img\]|\*):(?:[\w-]+:)*(?:size|h|aspect)-/.test(k));   // Tailwind child variants: [&_img]:size-4, *:h-8
    const unsized = imgs.filter(({ el, raw, anc }) => {
      if (/\bwidth\s*=/.test(raw) || /aspect-ratio/.test(raw) || /\bstyle=["'][^"']*(width|height|aspect-ratio)/.test(raw)) return false;
      if ([...el.cls].some(k => /^(?:w|h|size)-(?:\d|\[)|^(?:absolute|fixed)$/.test(k))) return false;
      if (imgFixed(decls(el, anc))) return false;
      for (let i = 0; i < Math.min(3, anc.length); i++) {          // nearest 3 wrappers
        const a = anc[i]; if (/^(body|main|html|section|article)$/.test(a.tag)) break;
        if (frameFixed(a, decls(a, anc.slice(i + 1)))) return false;
      }
      return true;
    });
    return unsized.length >= 2
      ? {evidence:[unsized.length+' of '+imgs.length+' <img> elements with no width/height or aspect-ratio']} : null; } },

{ code:'B137', id:'console-confetti', name:'Console Confetti',
  fix:'Fail the build on console errors, strip console.* in production, and audit logs for secrets.',
  test(c){
    // v1.2. What a static scan can see is only the source half of this pattern: debug logging left in
    // first-party inline scripts, and secret-format keys shipped to the browser. The runtime half
    // (hydration and key warnings, failed fetches) needs a real browser and is not judged here.
    const ev=[];
    const src = String(c.text || c.html);
    const scripts = c.isFullDoc ? all(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, src).filter(m => !/\bsrc\s*=|type\s*=\s*["'](?:application\/(?:ld\+)?json|text\/template)/i.test(m[1])).map(m => m[2]) : [src];
    // vendor snippets (tag managers, analytics, chat widgets) are not the site's own debug output
    const VENDOR = /zaraz|hubspot|hs-scripts|googletagmanager|gtag\(|fbq\(|hotjar|intercom|clarity\.ms|posthog|mixpanel|segment\.com|sentry|datadog|amplitude|crisp|tawk|drift|onetrust|cookiebot|cloudflare|vercel web analytics|_vercel\/|vercel-insights/i;
    // v1.3: read code, not text. Comments are blanked (commented-out logs do not run) and string contents
    // are blanked for locating calls (console.log inside a string, JSON or RSC payload is data). Same
    // length is kept so positions line up with the comment-free source.
    const lex = s => { let nc = '', code = '', i = 0; const n = s.length;
      while (i < n) { const ch = s[i], nx = s[i + 1];
        if (ch === '/' && nx === '/') { const e = s.indexOf('\n', i); const j = e < 0 ? n : e; nc += ' '.repeat(j - i); code += ' '.repeat(j - i); i = j; continue; }
        if (ch === '/' && nx === '*') { const e = s.indexOf('*/', i + 2); const j = e < 0 ? n : e + 2; const blank = s.slice(i, j).replace(/[^\n]/g, ' '); nc += blank; code += blank; i = j; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { let j = i + 1; while (j < n && s[j] !== ch) { if (s[j] === '\\') j++; else if (ch !== '`' && s[j] === '\n') break; j++; }
          j = Math.min(n, j + 1); nc += s.slice(i, j); code += ch + ' '.repeat(Math.max(0, j - i - 2)) + (j - i > 1 ? s[j - 1] : ''); i = j; continue; }
        nc += ch; code += ch; i++; }
      return [nc, code]; };
    // the block a call sits in: the text just before its nearest unclosed '{'
    const blockHead = (code, at) => { let d = 0; for (let k = at - 1; k >= 0 && k > at - 20000; k--) { const ch = code[k];
        if (ch === '}') d++; else if (ch === '{') { if (!d) return code.slice(Math.max(0, k - 120), k); d--; } } return ''; };
    const GATE = /\bcatch\b|\bdebug\w*|\bverbose\b|\bDEV\b|NODE_ENV|isDev|location\.(?:hash|search)|URLSearchParams|localStorage\.getItem/i;
    const ERR_HEAD = /(?:\berror|\bfail(?:ure|ed)?|\bonerror|\bcatch|\breject\w*)\s*(?:[:=(]|\)\s*(?:=>)?|\s*=>)?\s*(?:function\b[^{]*|\([^)]*\)\s*=>\s*|\w+\s*=>\s*|\([^)]*\)\s*)?$/i;
    const seen = new Set();
    for (const raw of scripts) {
      if (VENDOR.test(raw)) continue;
      const [s, code] = lex(raw);
      for (const m of all(/console\.(log|debug|info|trace|table|dir)\s*\(/g, code)) {
        const before = s.slice(Math.max(0, m.index - 160), m.index);
        if (GATE.test(before)) continue;                     // error reporting or a debug-gated log
        const head = blockHead(code, m.index);
        if (GATE.test(head) || ERR_HEAD.test(head.trim())) continue;   // inside a debug gate or a failure handler
        const call = s.slice(m.index, m.index + 80).replace(/\\+/g, '').replace(/\s+/g, ' ');
        if (/^console\.\w+\(\s*[`'"](?:\[[^\]]*\]\s*)?(?:failed|error|could ?n[o']t|unable|warning)/i.test(call)) continue;   // failure reporting
        seen.add(call.slice(0, 60));                         // the same call serialised again counts once
      }
    }
    if (seen.size >= 2) ev.push(seen.size + ' unconditional console.' + 'log/debug calls in first-party inline scripts, e.g. ' + [...seen][0].slice(0, 40));
    // secret formats only: publishable keys (Stripe/Clerk pk_live_) are public by design
    for (const m of all(/\b(sk_live_[A-Za-z0-9]{8,}|rk_live_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|xox[bpa]-[A-Za-z0-9-]{10,}|sk-(?:proj-|ant-)[A-Za-z0-9_-]{20,})/g, src))
      ev.push('what looks like a live secret key in client code: '+m[1].slice(0, 8)+'…');
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'B131', id:'password-theatre', name:'Password Theatre',
  fix:'Length and breach-list checks rather than composition rules, with a vetted hash behind them.',
  test(c){
    // v1.2: an account password field (not an API key, token or recovery phrase) AND visible evidence of
    // composition rules: a literal lookahead regex for upper/digit/symbol classes, per-class tests in
    // script, or rule text naming at least two of uppercase / number / symbol. Short minlength is a weak
    // policy, the opposite problem, and no longer counts.
    const NOT_ACCOUNT = /api[\s_-]?key|token|secret|mnemonic|seed|phrase|recovery|passphrase|wallet|private[\s_-]?key|license|decrypt/i;
    const pw = all(/<input\b((?:(?!>)[\s\S])*)>/gi, c.html)
      .filter(m => /type\s*=\s*["']password["']/i.test(m[1]) && !NOT_ACCOUNT.test(m[1]));
    if (!pw.length) return null;
    const src = String(c.text || c.html);
    const ev = [];
    // literal lookaheads in source text, e.g. /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/
    const look = new Set(all(/\(\?=\.\*(\[A-Z\]|\[a-z\]|\\d|\[0-9\]|\[[^\]]*[!@#$%^&*][^\]]*\]|\[\^A-Za-z0-9\]|\\W)\)/g, src)
      .map(m => /A-Z/.test(m[1]) && !/\^/.test(m[1]) ? 'upper' : /a-z/.test(m[1]) && !/\^/.test(m[1]) ? 'lower' : /\\d|0-9/.test(m[1]) && !/\^/.test(m[1]) ? 'digit' : 'symbol'));
    if (look.size >= 2) ev.push('composition-rule regex in the page (' + [...look].join(' + ') + ')');
    // per-class tests in script: /[A-Z]/.test(pw) && /[0-9]/.test(pw) ...
    const tests = new Set(all(/\/\[(A-Z|a-z|0-9|\\d|\^A-Za-z0-9|!@#\$%\^&\*[^\]]*)\]\/\.test\(/g, src).map(m => m[1].slice(0, 3)));
    if (tests.size >= 2 && /password|pwd|passw/i.test(src)) ev.push('per-character-class checks on the password in script');
    // rule text the user sees: two or more composition demands
    const vis = String(c.visible || c.html.replace(/<[^>]+>/g, ' '));
    const asks = [/\b(one|1|an?|at least one)\s+(upper\s?case|capital)/i, /\b(one|1|a|at least one)\s+(number|digit|numeral)/i, /\b(one|1|a|at least one)\s+(special|symbol)/i, /\b(one|1|a|at least one)\s+lower\s?case/i]
      .filter(r => r.test(vis)).length;
    if (asks >= 2) ev.push('password rules shown to the user demand ' + asks + ' character classes');
    return ev.length ? {evidence:ev} : null; } },

{ code:'B133', id:'banner-without-consent', name:'Banner Without Consent',
  fix:'Remove non-essential trackers, or block the scripts until a choice is made.',
  test(c){
    if (!c.isFullDoc) return null;
    const hasBanner = /cookie|consent/i.test(c.html.replace(/<[^>]+>/g,' '));
    if (!hasBanner) return null;
    const ev=[];
    for (const m of all(/<script[^>]*src=["']([^"']*(?:googletagmanager|google-analytics|gtag\/js|hotjar|segment\.com|facebook\.net)[^"']*)["'][^>]*>/gi, c.html)) {
      if (!/type=["']text\/plain["']|data-(?:cookieconsent|consent)/i.test(m[0]))
        ev.push('tracker loads unconditionally: '+m[1].replace(/^https?:\/\//,'').slice(0,50));
    }
    return ev.length ? {evidence:ev.slice(0,3)} : null; } },

{ code:'A32', id:'icon-in-a-tinted-tile', name:'Icon In A Tinted Tile',
  fix:'Drop the tile, or drop the icon. Keep icons only where they distinguish the items.',
  test(c){
    // Core of the pattern: a square, rounded tile (about 36px or larger) in a pale CHROMATIC tint.
    // Neutral greys (gray/slate/zinc/neutral/stone) are UI chrome — step numbers, nav chips — not accent tiles.
    const NEUTRAL = /^(?:gray|grey|slate|zinc|neutral|stone|white|black)$/;
    let n = 0;
    const lists = /\bclass(?:Name)?\s*=/.test(c.classes) ? classAttrs(c.classes) : c.classes.split('\n');   // snippets carry raw markup
    for (const cls of lists) {
      const toks = cls.split(/\s+/).filter(t => !/:/.test(t));          // ignore hover:/group-hover:/dark: variants
      const w = toks.map(t => /^(w|size)-(\d{1,2})$/.exec(t)).find(Boolean);
      if (!w || +w[2] < 9 || +w[2] > 20 || (w[1] === 'w' && !toks.includes('h-'+w[2]))) continue;   // 36-80px squares
      if (!toks.some(t => /^rounded-(?:lg|xl|2xl)$/.test(t))) continue;
      if (toks.some(t => { const m = /^bg-([a-z]+)-(?:50|100)(?:\/\d+)?$/.exec(t); return m && !NEUTRAL.test(m[1]); })) n++;
    }
    return n >= 3 ? {evidence:[n+' equal-sided rounded tiles (36px+) with a pale accent tint']} : null; } },

/* ---- v1.1.0 (2026-09-22): parity rules. Same principle as above: a miss beats a false accusation. ---- */

{ code:'A23', id:'shouting-section-labels', name:'Shouting Section Labels',
  fix:'Delete the label, or make it carry information the heading does not.',
  test(c){
    // v1.2: an eyebrow is a small uppercase tracked label with word text sitting directly above a section heading
    // (h1/h2). Card tags, category pills and index numbers (01/02) are not section labels: labels whose text repeats
    // on the page, labels without letters, labels above repeated card headings and labels the CSS hides are skipped.
    const labelCls = new Set(), hiddenCls = new Set();
    for (const r of rules(c.css)) {
      for (const p of r.sel.split(',')) {
        const m = /^\.([\w-]+)$/.exec(p.trim());
        if (m && /(?:^|[;\s])display\s*:\s*none/i.test(r.body)) hiddenCls.add(m[1]);
      }
      if (!/text-transform\s*:\s*uppercase/i.test(r.body)) continue;
      const ls = trackEm(r.body); const fs = sizePx(r.body);
      if (ls !== null && ls >= 0.06 && (fs === null || fs <= 15))
        for (const p of r.sel.split(',')) { const last = p.trim().split(/\s*[\s>+~]\s*/).pop();
          if (/::?(?:before|after)|:hover|:focus/.test(last)) continue;
          for (const m of all(/\.([\w-]+)/g, last)) labelCls.add(m[1]); }
    }
    const tw = /\buppercase\b/; const twTrack = /\btracking-(?:wide|wider|widest|\[0?\.\d+em\])\b/; const twSmall = /\btext-(?:xs|sm|\[1[0-4]px\])\b/;
    // the element that closes right before position i (may hold inline markup such as a dot or a number)
    // -> [_, tag, attrsBeforeClass, class, attrsAfterClass, text]
    const prevEl = i => {
      const w = c.html.slice(Math.max(0, i - 600), i), base = Math.max(0, i - 600);
      const cm = /<\/([a-z][\w-]*)>\s*$/i.exec(w); if (!cm) return null;
      const tag = cm[1].toLowerCase(); if (/^(div|section|header|ul|ol|li|p|h\d|a|button|figure|svg|article)$/.test(tag) && tag !== 'p' && tag !== 'div') return null;
      let depth = 0, pos = cm.index;
      const tags = all(new RegExp('<(/?)' + tag + '\\b([^<>]*)>', 'gi'), w.slice(0, cm.index));
      for (let k = tags.length - 1; k >= 0; k--) {
        if (tags[k][1]) { depth++; continue; }
        if (depth) { depth--; continue; }
        const a = tags[k][2], inner = w.slice(tags[k].index + tags[k][0].length, pos);
        if (/<(?:div|p|h\d|ul|ol|li|section|img|button)\b/i.test(inner)) return null;
        const cm2 = /^([^<>]*?)class=["']([^"']+)["']([^<>]*)$/i.exec(a); if (!cm2) return null;
        const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (!text || text.length > 60) return null;
        return [null, tag, cm2[1], cm2[2], cm2[3], text];
      }
      return null;
    };
    const found = [];
    for (const h of all(/<(h[1-3])\b([^<>]*)>/gi, c.html)) {
      const m = prevEl(h.index);
      if (!m) continue;
      const cls = m[3].split(/\s+/);
      if (!((tw.test(m[3]) && twTrack.test(m[3]) && twSmall.test(m[3])) || cls.some(k => labelCls.has(k)))) continue;
      if (cls.some(k => hiddenCls.has(k)) || /\bhidden\b(?![-:])/.test(m[3]) && !/\b(?:sm|md|lg|xl):(?:block|inline|flex)/.test(m[3])) continue;   // hidden by CSS
      if (/\b(?:hidden|aria-hidden=["']true)/i.test(m[2] + m[4]) && /\shidden(?:\s|=|$)/i.test(' ' + m[2] + m[4])) continue;
      const text = m[5].replace(/&[#\w]+;/g, ' ').replace(/\s+/g, ' ').trim();
      if (!/[A-Za-z]{3}/.test(text)) continue;                                     // "01", "02", "★"
      if (/^(?:new|beta|alpha|preview|free|live|now live|soon|coming soon|available now|now available|limited time|open source)[!. ]*$/i.test(text)) continue;   // status pill, not a section label
      const hcls = (/class=["']([^"']*)["']/i.exec(h[2]) || [])[1] || '';
      found.push({ text: text.toLowerCase(), tag: h[1].toLowerCase(), hcls, lcls: m[3] });
    }
    // card repetition: the same heading tag + class preceded by the same label class three or more times is a card grid,
    // unless it is the page's section-heading style (h1/h2)
    const key = f => f.tag + '|' + f.hcls + '|' + f.lcls;
    const reps = {}; for (const f of found) reps[key(f)] = (reps[key(f)] || 0) + 1;
    const texts = {}; for (const f of found) texts[f.text] = (texts[f.text] || 0) + 1;
    const keep = found.filter(f => texts[f.text] === 1 && (f.tag !== 'h3' || reps[key(f)] < 3));
    // section-level: at least two labels over h1/h2, or h3 used as the page's section heading (no h2 on the page)
    const hasH2 = /<h2\b/i.test(c.html);
    const sec = keep.filter(f => f.tag !== 'h3' || !hasH2);
    return sec.length >= 2 ? {evidence:[sec.length+' small uppercase tracked labels above section headings: '+sec.slice(0,5).map(f => '"'+f.text+'"').join(', ')]} : null; } },

{ code:'A24', id:'cards-inside-cards', name:'Cards Inside Cards',
  fix:'One container per idea. Inside it, separate with space and type, not another bordered box.',
  test(c){
    // v1.2 of this entry: a "card" is an element that carries every class of one compound selector that draws a border or
    // shadow plus a radius (".ui.card" needs both classes; ".home .x" makes only .x a card; ".ai-cta-text code" makes nothing).
    // Containers the CSS collapses or hides, controls, and drawings (device/TV/browser mockups, illustrations, diagrams)
    // are not walked. Three cards nested inside each other is the pattern.
        // ---- b2 local helper: a light element tree (tag, classes, id, attrs, ancestors, visible text length) ----
    const T = c._a24tree || (c._a24tree = (html => {
      const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
      const root = { tag:'#root', cls:[], attrs:'', parent:null, text:0, kids:[] }, list = []; let cur = root;
      const re = /<(\/?)([a-z][\w-]*)\b([^<>]*)>|([^<]+)/gi; let m;
      while ((m = re.exec(html))) {
        if (m[4] !== undefined) { cur.text += m[4].replace(/&[#\w]+;/g,'x').replace(/\s+/g,'').length; continue; }
        const tag = m[2].toLowerCase();
        if (m[1]) { let n = cur; while (n !== root && n.tag !== tag) n = n.parent; if (n === root) continue;
          while (cur !== n) { cur.parent.text += cur.text; cur = cur.parent; } cur.parent.text += cur.text; cur = cur.parent; continue; }
        const a = m[3];
        const node = { tag, attrs:a, parent:cur, text:0, kids:[],
          cls: ((/\bclass\s*=\s*["']([^"']*)["']/i.exec(a)||[])[1]||'').split(/\s+/).filter(Boolean),
          id: (/\bid\s*=\s*["']([^"']*)["']/i.exec(a)||[])[1] || null,
          style: (/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(a)||[]).slice(1).find(x=>x!==undefined) || '' };
        cur.kids.push(node); list.push(node);
        if (!VOID.test(tag) && !/\/\s*$/.test(a) && !/^(script|style)$/.test(tag)) cur = node;
      }
      while (cur !== root) { cur.parent.text += cur.text; cur = cur.parent; }
      const byCls = new Map(); for (const n of list) for (const k of n.cls) { if (!byCls.has(k)) byCls.set(k, []); byCls.get(k).push(n); }
      return { root, list, byCls };
    })(c.html));
    // elements matching the last compound of one selector part (".a .b.c", "main.app", "#x")
    const matchEls = part => {
      const last = part.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g,'').replace(/::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g,'').replace(/\[[^\]]*\]/g,'').trim().split(/\s*[\s>+~]\s*/).pop() || '';
      const tag = ((/^[a-z][\w-]*/i.exec(last)||[])[0]||'').toLowerCase();
      const cs = all(/\.((?:\\.|[\w-])+)/g, last).map(x => x[1].replace(/\\(.)/g,'$1'));
      const id = (/#((?:\\.|[\w-])+)/.exec(last)||[])[1];
      const pool = cs.length ? (T.byCls.get(cs[0]) || []) : T.list;
      if (!cs.length && !id && !tag) return [];
      return pool.filter(n => (!tag || n.tag === tag) && cs.every(k => n.cls.includes(k)) && (!id || n.id === id));
    };
    const ancestors = n => { const out = []; for (let p = n.parent; p && p.tag !== '#root'; p = p.parent) out.push(p); return out; };
    // v1.3: a card selector counts only where its ancestor qualifiers also match (".x-9839341 > .widget" is not every .widget)
    const compound = (n, comp) => { const tag = ((/^[a-z][\w-]*/i.exec(comp)||[])[0]||'').toLowerCase();
      const cs = all(/\.((?:\\.|[\w-])+)/g, comp).map(x => x[1].replace(/\\(.)/g,'$1')); const id = (/#((?:\\.|[\w-])+)/.exec(comp)||[])[1];
      return (!tag || tag === '*' || n.tag === tag) && cs.every(k => n.cls.includes(k)) && (!id || n.id === id); };
    const qualified = (n, part) => {
      const toks = part.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g,'').replace(/::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g,'').replace(/\[[^\]]*\]/g,'').trim()
        .split(/\s*([>+~])\s*|\s+/).filter(x => x !== undefined && x !== '');
      let node = n, i = toks.length - 2;
      while (i >= 0) {
        let comb = ' '; if (/^[>+~]$/.test(toks[i])) { comb = toks[i]; i--; } if (i < 0) break;
        const comp = toks[i];
        if (comb === '+' || comb === '~') { i--; continue; }
        if (/^(html|body|:root|\*)$/i.test(comp)) { i--; continue; }
        if (comb === '>') { node = node.parent; if (!node || node.tag === '#root' || !compound(node, comp)) return false; }
        else { let q = node.parent; while (q && q.tag !== '#root' && !compound(q, comp)) q = q.parent; if (!q || q.tag === '#root') return false; node = q; }
        i--;
      }
      return true; };
    const cardComps = [], hiddenComps = [];
    const lastComp = part => { const p = part.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g,'').trim().split(/\s*[\s>+~]\s*/).pop() || '';
      if (/::|:(?:hover|focus|active|checked|focus-within|focus-visible|disabled|invalid)/i.test(p)) return null;   // states and pseudo-elements
      const bare = p.replace(/:[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g,'').replace(/\[[^\]]*\]/g,'');
      const cs = all(/\.((?:\\.|[\w-])+)/g, bare).map(m => m[1].replace(/\\(.)/g,'$1'));
      if (!(cs.length && /^[a-z]*(?:[.#][\w\\:\/\[\].-]+)*$/i.test(bare))) return null;
      cs.tag = ((/^[a-z][\w-]*/i.exec(bare)||[])[0]||'').toLowerCase(); return cs; };
    for (const r of rules(c.css)) {
      const rad = /border-radius\s*:\s*(\d+)/i.exec(r.body);
      const edge = /(?:^|;|\s)border\s*:\s*[1-9]|box-shadow\s*:\s*(?!none)/i.test(r.body);
      // collapsed or removed (an opacity:0 start state is usually a scroll reveal, so it is not treated as hidden)
      const gone = /max-height\s*:\s*0(?:px)?\s*(?:;|$|!)|display\s*:\s*none|visibility\s*:\s*hidden/i.test(r.body);
      for (const part of r.sel.split(',')) { const cs = lastComp(part); if (!cs) continue;
        if (rad && +rad[1] >= 6 && edge && !/pointer-events\s*:\s*none/i.test(r.body)) cardComps.push(Object.assign(cs, { part: part.trim() }));
        if (gone && !/\.(?:is-|has-)?(?:open|active|show|visible|expanded)\b/i.test(r.sel)) hiddenComps.push(cs); }
    }
    const has = (n, list) => list.some(cs => (!cs.tag || cs.tag === n.tag) && cs.every(k => n.cls.includes(k)) && (!cs.part || qualified(n, cs.part)));
    const CTRL = /input|field|chip|badge|tag|btn|button|control|select|toggle|switch|knob|track|pill|avatar|video|player|code|kbd/i;
    const DRAWING = /mock|phone|iphone|device|laptop|monitor|bezel|(?:^|[-_])tv(?:[-_]|$)|illustration|illo|diagram|orbit|artwork|skeuo|screenshot|demo|preview|iframe|url-?bar|browser|console|terminal|chat|bubble|transcript|widget-demo/i;
    // product-UI chrome: a header row of three empty dots (window traffic lights) marks a drawn app window
    const leafEmpty = k => !k.text && !k.kids.length && /^(span|div|i|b)$/.test(k.tag);
    const dots = n => { if (n.kids.length < 3 || n.kids.length > 6) return false; let run = 0, best = 0;
      for (const k of n.kids) { run = leafEmpty(k) ? run + 1 : 0; best = Math.max(best, run); } return best >= 3 && best <= 4; };
    const windowChrome = n => /^(div|section|article|figure|aside)$/.test(n.tag) && n.kids.slice(0, 2).some(k => dots(k) || k.kids.slice(0, 2).some(dots));
    // a short label with no block content is a button, badge, numbered circle or icon, not a container
    const BLOCK = /^(div|section|article|aside|p|ul|ol|li|h[1-6]|img|picture|table|form|figure|header|footer|blockquote|pre)$/;
    const hasBlock = n => n.kids.some(k => BLOCK.test(k.tag) || (k.kids.length && hasBlock(k)));
    const labelLike = n => n.text <= 40 && !hasBlock(n);
    // hidden at desktop: hidden with no desktop display class, or lg:/md:/xl:hidden
    const hiddenDesk = n => n.cls.some(k => /^(?:md|lg|xl):hidden$/.test(k)) || (n.cls.includes('hidden') && !n.cls.some(k => /^(?:sm|md|lg|xl):(?:block|flex|grid|inline-flex|inline-block|table)$/.test(k)))
      || /\s(?:hidden|aria-hidden\s*=\s*["']true["'])(?=[\s=>\/]|$)/i.test(' '+n.attrs);
    const isCard = n => { const k = n.cls.join(' ');
      if (!/^(div|section|article|li|aside|form|a)$/.test(n.tag) || CTRL.test(k)) return false;
      if (!n.text && !n.kids.length) return false;   // an empty decorative layer (ring, glow, frame overlay) is not a container
      if (n.tag === 'a' && n.text <= 60) return false;   // a call-to-action link styled as a button
      // a message bubble: a box sitting next to a round avatar in a row is a chat transcript, not a layout card
      if (n.parent && n.parent.kids.some(k => k !== n && ((k.cls.includes('rounded-full') && k.cls.some(x => /^(?:[a-z]+:)?[wh]-(?:[1-9]|1[0-2])$/.test(x))) || /avatar/i.test(k.cls.join(' '))) && k.text <= 3)) return false;
      if (labelLike(n) || n.cls.some(k => /^inline-(?:flex|block)$/.test(k)) && n.text <= 40) return false;
      if (has(n, cardComps)) return true;
      return n.cls.some(x => /^rounded(-(md|lg|xl|2xl|3xl))?$/.test(x)) && n.cls.some(x => /^(border|shadow(-(sm|md|lg|xl|2xl))?)$/.test(x)); };
    const blocked = n => has(n, hiddenComps) || DRAWING.test(n.cls.join(' ') + ' ' + (n.id||'')) || /\brole\s*=\s*["'](?:img|presentation|switch|dialog|menu)/i.test(n.attrs)
      || /(?:^|;)\s*(?:display\s*:\s*none|max-height\s*:\s*0(?:px)?\s*(?:;|$))/i.test(n.style) || /^(nav|header|dialog|svg|button)$/.test(n.tag)
      || hiddenDesk(n) || windowChrome(n);
    let best = null;
    const walk = (n, chain) => {
      if (n.tag !== '#root' && blocked(n)) return;
      // a wrapper with one child and no text of its own is the same box as that child: count it once
      const same = chain.length && chain[chain.length-1] === n.parent && n.parent.kids.length === 1 && n.parent.text === n.text;
      const ch = n.tag !== '#root' && isCard(n) && !same ? chain.concat(n) : chain;
      if (ch.length >= 3 && (!best || ch.length > best.length)) best = ch;
      for (const k of n.kids) walk(k, ch);
    };
    walk(T.root, []);
    if (!best) return null;
    const name = n => n.tag + (n.cls.length ? '.' + n.cls.filter(k => !/^(?:[\w-]+:)/.test(k)).slice(0,2).join('.') : '');
    return {evidence:['bordered, rounded containers nested '+best.length+' deep: '+best.slice(0,4).map(name).join(' > ').slice(0,120)]}; } },

{ code:'A38', id:'uniform-section-rhythm', name:'Uniform Section Rhythm',
  fix:'Group by meaning: related things close, separate ideas far apart. Let spacing say which is which.',
  test(c){
    const pys = all(/<section\b[^>]*class=["'][^"']*\bpy-(\d+)\b[^"']*["']/gi, c.html).map(m=>m[1]);
    if (pys.length >= 4 && new Set(pys).size === 1) return {evidence:['all '+pys.length+' sections use py-'+pys[0]]};
    return null; } },

{ code:'A49', id:'the-endless-marquee', name:'The Endless Marquee',
  fix:'Stop it, or give it a pause control and honour prefers-reduced-motion.',
  test(c){
    // v1.2 of this entry: a keyframe whose only change is a sideways slide to -50%/-100% (a centring translate inside a
    // scale or opacity ripple is not a marquee), looping forever on an element no CSS rule pauses on hover or focus.
    const ev=[];
    if (/<marquee\b/i.test(c.html)) ev.push('<marquee> element');
    const clsOf = sel => all(/\.((?:\\.|[\w-])+)/g, sel.replace(/::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g,'')).map(m => unesc(m[1]));
    const pauseSels = rules(c.css).filter(r => /animation-play-state\s*:\s*paused/i.test(r.body)).map(r => clsOf(r.sel));
    const attrs = classAttrs(c.html);
    // paused when a pause rule names one of the animated element's classes, or the element carries a pause utility
    const paused = cs => pauseSels.some(p => p.some(k => cs.includes(k)))
      || attrs.some(a => { const t = a.split(/\s+/); return cs.some(k => t.includes(k)) && /animation-play-state:paused|\bpause(?:-on-hover)?\b|hover:pause/i.test(a); });
    const pureSlide = body => {
      if (!/translate(?:X|3d)?\(\s*-\s*(?:50|100|33\.3+)%/i.test(body)) return false;
      for (const d of all(/([\w-]+)\s*:\s*([^;{}]+)/g, body.replace(/(?:^|\})\s*(?:from|to|[\d.]+%)(?:\s*,\s*(?:from|to|[\d.]+%))*\s*\{/gi, ';'))) {
        const prop = d[1].toLowerCase(), val = d[2];
        if (/^(?:will-change|animation-timing-function)$/.test(prop)) continue;
        if (prop !== 'transform' && prop !== '-webkit-transform' && prop !== 'translate') return false;
        if (/scale|rotate|skew|matrix|perspective/i.test(val)) return false;
        if (/translateY\(\s*-?[1-9]|translate\(\s*[^,()]+,\s*-?[1-9]|translate3d\(\s*[^,()]+,\s*-?[1-9]/i.test(val)) return false;
      }
      return true;
    };
    const loops = new Set();
    for (const m of all(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?\})\s*\}/gi, c.css)) if (pureSlide(m[2])) loops.add(m[1]);
    const rm = /prefers-reduced-motion/i.test(c.css);
    for (const name of loops) {
      const re = new RegExp('animation(?:-name)?\\s*:[^;{}]*\\b'+name.replace(/[-]/g,'\\-')+'\\b[^;{}]*', 'i');
      const users = rules(c.css).filter(r => re.test(r.body) && /infinite/i.test(r.body));
      if (!users.length && !(re.test(c.css) && /infinite/i.test((re.exec(c.css)||[''])[0]))) continue;
      const cs = [...new Set(users.flatMap(r => r.sel.split(',').map(p => clsOf(p.trim().split(/[\s>+~]+/).pop())).flat()))];
      if (!rm && !(cs.length && paused(cs)) && !(!cs.length && pauseSels.length))
        ev.push('infinite horizontal loop "'+name+'" with no pause state and no reduced-motion rule');
    }
    for (const m of all(/\banimate-(?:marquee|scroll|infinite-scroll)[\w-]*/g, c.classes)) {
      const k = m[0];
      if (/motion-reduce:|motion-safe:/.test(c.classes) || paused([k])) continue;
      ev.push('marquee animation utility .'+k+' with no motion-reduce or pause'); break;
    }
    return ev.length ? {evidence:[...new Set(ev)]} : null; } },

{ code:'A50', id:'grey-on-colour', name:'Grey On Colour',
  fix:'On a coloured ground, use a lighter or darker shade of that same hue for secondary text, not neutral grey.',
  test(c){
    const ev=[];
    const STATE = /:(hover|active|focus|focus-within|focus-visible|visited|checked|disabled|target)|\.(active|is-active|current|selected|open|show|hover)\b|\[aria-|::?(before|after|placeholder|selection)/i;
    const greyOn = (fg, bg) => { const f = rgbToHsl(fg), b = rgbToHsl(bg); return f.s < 15 && f.l > 30 && f.l < 75 && b.s > 45 && b.l > 20 && b.l < 70; };
    const css = rules(c.css).filter(r => r.sel !== '[inline-style]');
    const cands = css.map((r, i) => ({ r, i, fg: declColor(r.body, 'color'), bg: declColor(r.body, 'background(?:-color)?') }))
      .filter(x => x.fg && x.bg && greyOn(x.fg, x.bg));
    if (!cands.length) return null;
    const hasMarkup = /<[a-z][\w-]*\b[^>]*>/i.test(c.html.replace(/<style[\s\S]*?<\/style>/gi, ''));
    if (!c.isFullDoc && !hasMarkup) {
      for (const x of cands) if (!x.r.sel.split(',').every(p => STATE.test(p))) ev.push(x.r.sel.trim().slice(0,40)+': grey '+hex(x.fg)+' on '+hex(x.bg));
      return ev.length ? {evidence:ev.slice(0,3)} : null;
    }
    // Minimal DOM: each element with tag, classes, id, inline style and its ancestor chain.
    const els = [], stack = [];
    const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/;
    for (const m of all(/<(\/?)([a-z][\w-]*)\b([^<>]*)>/gi, c.html)) {
      const tag = m[2].toLowerCase();
      if (m[1]) { const k = stack.map(e => e.tag).lastIndexOf(tag); if (k >= 0) stack.length = k; continue; }
      const a = m[3];
      const e = { tag, cls: new Set(((/\bclass\s*=\s*["']([^"']*)["']/i.exec(a) || [])[1] || '').split(/\s+/).filter(Boolean)),
        id: (/\bid\s*=\s*["']([^"']*)["']/i.exec(a) || [])[1] || null, style: (/\bstyle\s*=\s*["']([^"']*)["']/i.exec(a) || [])[1] || '',
        anc: stack.slice() };
      els.push(e);
      if (!VOID.test(tag) && !/\/\s*$/.test(a)) stack.push(e);
    }
    const parseComp = comp => {
      const bare = comp.replace(/::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g, '').replace(/\[[^\]]*\]/g, '');
      return { tag: ((/^[a-z][\w-]*/i.exec(bare) || [''])[0]).toLowerCase(), cls: all(/\.([\w-]+)/g, bare).map(m => m[1]), id: (/#([\w-]+)/.exec(bare) || [])[1] };
    };
    const compOk = (cp, e) => (!cp.tag || cp.tag === '*' || cp.tag === e.tag) && cp.cls.every(k => e.cls.has(k)) && (!cp.id || cp.id === e.id);
    const spec = part => { const b = part.replace(/:(?:not|is|where)\(/g, ' ');
      return (b.match(/#[\w-]+/g) || []).length * 10000 + (b.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) || []).length * 100 + (b.match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length; };
    // does selector part match element e? (descendant/child combinators both treated as "inside")
    const partMatch = (part, e) => {
      const comps = part.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, '').trim().split(/\s*[\s>+~]\s*/).filter(Boolean).map(parseComp);
      if (!comps.length || !compOk(comps[comps.length - 1], e)) return false;
      let j = comps.length - 2;
      for (let k = e.anc.length - 1; k >= 0 && j >= 0; k--) if (compOk(comps[j], e.anc[k])) j--;
      return j < 0;
    };
    const setters = css.map((r, i) => ({ r, i, parts: r.sel.split(',').map(x => x.trim()).filter(p => p && !STATE.test(p)) }))
      .filter(x => x.parts.length && /(?:^|;|\s)(color|background(?:-color)?)\s*:/i.test(x.r.body));
    const winner = (e, prop) => {
      const inl = declColor(e.style, prop); if (inl) return inl;
      let best = null, bk = -1;
      for (const x of setters) {
        const v = new RegExp('(?:^|;|\\s)' + prop + '\\s*:', 'i').test(x.r.body); if (!v) continue;
        const ps = x.parts.filter(p => partMatch(p, e)); if (!ps.length) continue;
        const key = Math.max(...ps.map(spec)) * 1e5 + x.i;
        if (key > bk) { bk = key; best = x; }
      }
      // a winning declaration we cannot read (gradient, translucent, var()) means we do not know the colour
      return best ? declColor(best.r.body, prop) : null;
    };
    for (const x of cands) {
      const parts = x.r.sel.split(',').map(p => p.trim()).filter(p => p && !STATE.test(p));
      if (!parts.length) continue;
      const hit = els.find(e => parts.some(p => partMatch(p, e)) && (() => {
        const fg = winner(e, 'color'), bg = winner(e, 'background(?:-color)?');
        return fg && bg && greyOn(fg, bg);
      })());
      if (hit) ev.push(x.r.sel.trim().slice(0,40)+': grey '+hex(x.fg)+' on '+hex(x.bg));
    }
    return ev.length ? {evidence:ev.slice(0,3)} : null; } },

{ code:'A51', id:'wide-tracked-body', name:'Wide-Tracked Body Text',
  fix:'Leave lowercase body text at the typeface’s default spacing. Track only short runs of caps.',
  test(c){
    // v1.2: the tracked text must be running text. A base rule (html/body/p) counts only when the page has
    // a sentence-case paragraph (60+ chars, 6+ lowercase words) and no other rule sets that selector to
    // uppercase (tracked caps are A54's territory). A Tailwind <p> counts only when it holds 40+ chars of sentence text.
    const ev=[];
    const plain = s => s.replace(/<[^>]+>/g,' ').replace(/&[#\w]+;/g,' ').replace(/\s+/g,' ').trim();
    const sentence = (t, n, w) => t.length >= n && (t.match(/\b[a-z]{2,}\b/g)||[]).length >= w;
    const R = rules(c.css);
    const upperSel = new Set();
    for (const r of R) if (/text-transform\s*:\s*uppercase/i.test(r.body)) for (const p of parts(r.sel)) upperSel.add(p);
    for (const r of R) if (/text-transform\s*:\s*(none|lowercase|capitalize)/i.test(r.body)) for (const p of parts(r.sel)) upperSel.delete(p);
    const hasBody = !c.isFullDoc || all(/<(p|li|dd|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi, c.html).some(m => sentence(plain(m[2]), 60, 6));
    if (hasBody) for (const r of R) {
      if (!isBase(r.sel)) continue;
      if (/text-transform\s*:\s*uppercase/i.test(r.body)) continue;
      if (parts(r.sel).filter(p => BASE_TEXT.test(p)).every(p => upperSel.has(p))) continue;
      const ls = trackEm(r.body);
      if (ls !== null && ls >= 0.05) ev.push(r.sel.trim().slice(0,30)+' { letter-spacing: '+ls.toFixed(2)+'em }');
    }
    for (const m of all(/<p\b[^>]*class=["']([^"']*)["'][^>]*>([\s\S]*?)<\/p>/gi, c.html)) {
      const t = /\btracking-(wider|widest)\b/.exec(m[1]);
      if (t && !/\buppercase\b/.test(m[1]) && sentence(plain(m[2]), 40, 5)) ev.push('<p> with tracking-'+t[1]);
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A52', id:'torn-edge-mask', name:'Torn-Edge Mask',
  fix:'Use a clean crop, or a prepared cut-out asset if the ragged edge is actually the point.',
  test(c){
    const ev=[];
    // The pattern is a photo or image cut to a ragged/blob outline. The mask must land on an image:
    // an img/picture/video, an element painting a background-image url(), or a frame that holds only an image.
    // Decorative shapes (blurred glow blobs, empty pebble divs, 9px sparkle particles) are not the pattern.
    const css = rules(c.css);
    const hasMarkup = /<[a-z][\w-]*\b[^>]*>/i.test(c.html.replace(/<style[\s\S]*?<\/style>/gi, ''));
    const OPEN = /<([a-z][\w-]*)\b([^>]*)>/gi;
    const content = m => { const t = m[1].toLowerCase(); if (/^(img|video|source|input)$/.test(t)) return '';
      const re = new RegExp('<(/?)' + t + '\\b[^>]*>', 'gi'); re.lastIndex = m.index + m[0].length; let d = 1, e;
      while (d && (e = re.exec(c.html))) d += e[1] ? -1 : 1;
      return c.html.slice(m.index + m[0].length, d ? c.html.length : e.index); };
    const SMALL = /(^|[-_.#])(particles?|sparkles?|sparks?|stars?|icons?|dots?|bullets?|confetti)($|[-_.:\s])/i;
    const lastComp = part => part.replace(/:(?:is|where|not|has)\((?:[^()]|\([^()]*\))*\)/g, '').trim().split(/\s*[\s>+~]\s*/).pop();
    const onImage = (sel, body) => {
      if (/filter\s*:\s*blur\(/i.test(body)) return false;                                          // a soft glow, not a cut-out
      const w = /(?:^|;|\s)(?:width|height)\s*:\s*([\d.]+)px/i.exec(body); if (w && +w[1] < 100) return false;
      return sel.split(',').some(part => {
        if (/::?(before|after)/i.test(part)) return false;
        const comp = lastComp(part);
        if (SMALL.test(comp)) return false;
        const tag = ((/^[a-z][\w-]*/i.exec(comp) || [''])[0]).toLowerCase();
        if (/^(img|picture|video)$/.test(tag)) return !c.isFullDoc || new RegExp('<' + tag + '\\b', 'i').test(c.html);
        const bgUrl = /background(?:-image)?\s*:[^;]*url\(/i.test(body);
        if (!c.isFullDoc && !hasMarkup) return bgUrl || /img|image|photo|picture|avatar|portrait|thumb|cover/i.test(comp);
        const cls = all(/\.([\w-]+)/g, comp).map(m => m[1]); const id = (/#([\w-]+)/.exec(comp) || [])[1];
        if (!cls.length && !id) return false;
        return all(OPEN, c.html).some(m => {
          const k = ' ' + ((/\bclass\s*=\s*["']([^"']*)["']/i.exec(m[2]) || [])[1] || '') + ' ';
          if (!cls.every(x => k.includes(' ' + x + ' '))) return false;
          if (id && (/\bid\s*=\s*["']([^"']*)["']/i.exec(m[2]) || [])[1] !== id) return false;
          if (/^(img|picture|video)$/i.test(m[1]) || bgUrl || /background(?:-image)?\s*:[^;"']*url\(/i.test(m[2])) return true;
          const h = content(m);
          return /<(img|picture|video)\b/i.test(h) && h.replace(/<[^>]+>/g, '').replace(/&[#\w]+;/g, '').replace(/\s+/g, ' ').trim().length <= 40;
        });
      });
    };
    const blob = str => all(/border-radius\s*:\s*((?:[\d.]+%\s*){4})\/\s*((?:[\d.]+%\s*){4})/gi, str).find(m => new Set((m[1]+' '+m[2]).trim().split(/\s+/)).size >= 5);
    const blobKf = new Set();
    for (const m of all(/@(?:-webkit-)?keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g, c.css)) if (blob(m[2])) blobKf.add(m[1]);
    for (const r of css) {
      const m = /clip-path\s*:\s*polygon\(([^;{}]*)\)/i.exec(r.body);
      if (m && m[1].split(',').length >= 10 && /img|image|photo|picture|figure|avatar|media|hero|cover|thumb/i.test(r.sel) && onImage(r.sel, r.body))
        ev.push(r.sel.trim().slice(0,30)+': clip-path polygon with '+m[1].split(',').length+' points');
      const b = blob(r.body);
      const anim = all(/animation(?:-name)?\s*:\s*([^;]+)/gi, r.body).some(a => a[1].split(/[\s,]+/).some(w => blobKf.has(w)));
      if ((b || anim) && onImage(r.sel, r.body))
        ev.push(r.sel.trim().slice(0,30)+': blob border-radius'+(b ? ' '+b[0].replace(/\s+/g,' ').slice(15,70) : ' (animated)'));
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,2)} : null; } },

{ code:'A53', id:'cramped-body-leading', name:'Cramped Body Leading',
  fix:'Body copy at 1.4–1.6 line-height. Tight leading belongs to headlines, not paragraphs.',
  test(c){
    // v1.3: judge the leading the paragraph actually gets. On whole pages each wrapping <p> (80+ chars of sentence
    // text) is resolved through a small cascade: matching rules by specificity and order, inline styles, and
    // inheritance of font-size and line-height from ancestors. A reset (p{line-height:1}) that a later or more
    // specific rule overrides is not the page's leading. Display-size text (24px+) is correctly set tight.
    // Tailwind <p class="leading-tight">: a responsive text-* utility re-sets line-height at that breakpoint.
    const ev=[];
    const plain = s => s.replace(/<[^>]+>/g,' ').replace(/&[#\w]+;/g,' ').replace(/\s+/g,' ').trim();
    const prose = t => t.length >= 80 && (t.match(/\b[a-z]{2,}\b/g)||[]).length >= 8;
    const display = k => /(?:^|\s)(?:[\w-]+:)*text-([2-9]xl)\b/.test(k) || /(?:^|\s)(?:[\w-]+:)*text-\[(?:clamp|[\d.]+(?:px|rem))/.test(k) && (() => {
      let mx = 0; for (const m of all(/text-\[([^\]]+)\]/g, k)) for (const n of all(/([\d.]+)(px|rem)/g, m[1])) mx = Math.max(mx, n[2]==='rem' ? +n[1]*16 : +n[1]); return mx >= 24; })();
    // line-height and font-size declared in a block (longhands, or the font shorthand "16px/1.2 ...")
    const decl = body => {
      const o = {}; const imp = {};
      for (const m of all(/(?:^|;|\{|\s)(line-height|font-size|font)\s*:\s*([^;]+)/gi, body)) {
        const p = m[1].toLowerCase(), v = m[2].trim(), im = /!important/i.test(v), val = v.replace(/!important/i, '').trim();
        if (p === 'font') { const f = /(?:^|\s)([\d.]+(?:px|rem|em|%))\s*(?:\/\s*([\d.]+(?:px|rem|em|%)?|normal))?(?:\s|$)/i.exec(val);
          if (f) { o.fs = f[1]; imp.fs = im; o.lh = f[2] || 'normal'; imp.lh = im; } continue; }
        const k = p === 'font-size' ? 'fs' : 'lh'; o[k] = val; imp[k] = im;
      }
      return { o, imp };
    };
    const lhRatio = (v, fsPx) => { const m = /^([\d.]+)(%|px|rem|em)?$/i.exec(v || ''); if (!m) return null;
      const n = +m[1]; return !m[2] ? n : m[2] === '%' ? n/100 : m[2] === 'em' ? n : m[2] === 'rem' ? n*16/fsPx : n/fsPx; };
    if (!c.isFullDoc) {
      // a snippet: judge the paragraph rules as written
      for (const r of rules(c.css)) {
        if (!parts(r.sel).some(p => /^(p|main p|article p|\.prose p|\.prose|\.content p|\.post p|\.entry-content p|\.markdown-body p)$/.test(p))) continue;
        const { o } = decl(r.body); if (!o.lh) continue;
        const fs = sizePx(r.body);
        if (fs !== null && fs >= 24) continue;
        if (/px|rem$/.test(o.lh) && !fs) continue;
        const v = lhRatio(o.lh, fs || 16);
        if (v > 0 && v < 1.26) ev.push(r.sel.trim().slice(0,30)+' { line-height: '+o.lh+' } ≈ '+v.toFixed(2));
      }
    } else {
      // index rules that set leading or size by the subject compound's id, class or tag
      const idx = new Map(); let order = 0;
      const add = (k, x) => { if (!idx.has(k)) idx.set(k, []); idx.get(k).push(x); };
      const parseComp = comp => {
        if (/::|:(?:hover|focus|active|visited|checked|disabled|target|placeholder|empty|before|after|first-line|first-letter|is|where|has)\b/i.test(comp)) return null;
        if (/^:root$/i.test(comp)) comp = 'html';
        const bare = comp.replace(/:(?:not|is|where)\((?:[^()]|\([^()]*\))*\)/gi, '').replace(/:[\w-]+(\([^()]*\))?/g, '');
        const attrs = all(/\[\s*([\w-]+)\s*(?:[~|^$*]?=\s*["']?([^"'\]]*)["']?)?\s*\]/g, bare).map(m => [m[1].toLowerCase(), m[2]]);
        const b = bare.replace(/\[[^\]]*\]/g, '');
        if (/[^\w.#*\\-]/.test(b.replace(/\\./g, ''))) return null;
        return { tag: ((/^([a-z][\w-]*|\*)/i.exec(b) || [])[1] || '').toLowerCase(), cls: all(/\.((?:\\.|[\w-])+)/g, b).map(m => m[1].replace(/\\(.)/g, '$1')),
          id: ((/#((?:\\.|[\w-])+)/.exec(b) || [])[1] || '').replace(/\\(.)/g, '$1'), attrs };
      };
      const cm = (q, e) => (!q.tag || q.tag === '*' || q.tag === e.tag) && q.cls.every(k => e.cls.includes(k)) && (!q.id || q.id === e.id) &&
        q.attrs.every(([n, v]) => n in e.at && (v === undefined || e.at[n].includes(v)));
      for (const r of rules(c.css)) {
        if (r.sel === '[inline-style]' || !/line-height|font/i.test(r.body)) continue;
        const d = decl(r.body); if (!d.o.lh && !d.o.fs) continue;
        for (const p of r.sel.split(/,(?![^(]*\))/)) {
          const comps = p.trim().split(/\s*[\s>+~]\s*/).filter(Boolean).map(parseComp);
          if (!comps.length || comps.some(x => !x)) continue;
          const subj = comps.pop();
          const spec = (subj.id ? 10000 : 0) + comps.reduce((s, q) => s + (q.id ? 10000 : 0) + (q.cls.length + q.attrs.length) * 100 + (q.tag && q.tag !== '*' ? 1 : 0), 0) +
            (subj.cls.length + subj.attrs.length) * 100 + (subj.tag && subj.tag !== '*' ? 1 : 0);
          const x = { subj, anc: comps, spec, order: order++, d, sel: p.trim() };
          if (subj.id) add('#' + subj.id, x); else if (subj.cls.length) add('.' + subj.cls[0], x); else add(subj.tag || '*', x);
        }
      }
      // walk the markup keeping each element's ancestry
      const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
      const body = (/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(c.html) || [, c.html])[1];
      const root = { tag: 'html', cls: [], id: '', at: {}, parent: null }, bodyEl = { tag: 'body', cls: [], id: '', at: {}, parent: root };
      const stack = [bodyEl], paras = [];
      for (const m of all(/<(\/?)([a-z][\w-]*)\b([^<>]*)>/gi, body)) {
        const tag = m[2].toLowerCase();
        if (m[1]) { const i = stack.map(x => x.tag).lastIndexOf(tag); if (i > 0) { const e = stack[i]; stack.length = i; if (e.p) e.p.end = m.index; } continue; }
        if (VOID.test(tag) || /\/\s*$/.test(m[3])) continue;
        if (tag === 'p' && stack[stack.length - 1].tag === 'p') stack.pop();
        const at = {}; for (const a of all(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, m[3])) at[a[1].toLowerCase()] = a[2] ?? a[3];
        const e = { tag, cls: (at['class'] || '').split(/\s+/).filter(Boolean), id: at.id || '', at, parent: stack[stack.length - 1] };
        if (tag === 'p') { e.p = { start: m.index + m[0].length, end: -1 }; paras.push(e); }
        stack.push(e);
      }
      const ancMatch = (anc, e) => { let p = e.parent; for (let i = anc.length - 1; i >= 0; i--) { while (p && !cm(anc[i], p)) p = p.parent; if (!p) return false; p = p.parent; } return true; };
      const memo = new Map();
      const own = e => {   // the winning declared line-height and font-size on one element
        if (memo.has(e)) return memo.get(e);
        const cand = [...(idx.get(e.tag) || []), ...(idx.get('*') || []), ...(e.id ? idx.get('#' + e.id) || [] : []), ...e.cls.flatMap(k => idx.get('.' + k) || [])];
        const win = {};
        for (const x of new Set(cand)) {
          if (!cm(x.subj, e) || (x.anc.length && !ancMatch(x.anc, e))) continue;
          for (const k of ['lh', 'fs']) if (x.d.o[k]) { const w = win[k], rank = (x.d.imp[k] ? 1e7 : 0) + x.spec;
            if (!w || rank > w.rank || (rank === w.rank && x.order > w.order)) win[k] = { v: x.d.o[k], rank, order: x.order, sel: x.sel, alts: [] }; }
        }
        // The same selector declared again with another value is almost always a breakpoint variant (media query
        // wrappers are not visible here): keep every variant so leading is judged at its most generous.
        for (const x of new Set(cand)) for (const k of ['lh', 'fs']) if (win[k] && x.d.o[k] && x.sel === win[k].sel && x.d.o[k] !== win[k].v) {
          if (cm(x.subj, e) && (!x.anc.length || ancMatch(x.anc, e))) win[k].alts.push(x.d.o[k]);
        }
        if (e.at.style) { const d = decl(e.at.style); for (const k of ['lh', 'fs']) if (d.o[k]) win[k] = { v: d.o[k], sel: 'inline style' }; }
        memo.set(e, win); return win;
      };
      const resolve = e => {   // computed font-size (px) and line-height (ratio or px), by inheritance
        const chain = []; for (let p = e; p; p = p.parent) chain.unshift(p);
        let fs = 16, lh = { ratio: null }, src = '';
        for (const el of chain) {
          const w = own(el);
          // normalize.css puts line-height:1.15 on html; site CSS (often external) always replaces it
          if (el === root && w.lh) delete w.lh;
          if (w.fs) { const m = /^([\d.]+)(px|rem|em|%)$/i.exec(w.fs.v); if (!m) return null;
            fs = m[2] === 'px' ? +m[1] : m[2] === 'rem' ? +m[1]*16 : m[2] === 'em' ? +m[1]*fs : +m[1]/100*fs; }
          if (w.lh) { src = w.lh.sel; let best = null;
            for (const v of [w.lh.v, ...(w.lh.alts || [])]) { const m = /^([\d.]+)(%|px|rem|em)?$/i.exec(v);
              const cur = !m ? null                                // normal, var(), calc(): unknown
                : !m[2] ? { ratio: +m[1] }                         // unitless: inherited as a ratio
                : { px: m[2] === 'px' ? +m[1] : m[2] === 'rem' ? +m[1]*16 : m[2] === '%' ? +m[1]/100*fs : +m[1]*fs };
              if (!cur) { best = null; break; }
              const rr = cur.px ? cur.px / fs : cur.ratio; if (!best || rr > best.rr) best = { ...cur, rr }; }
            lh = best || { ratio: null }; }
        }
        const ratio = lh.px ? lh.px / fs : lh.ratio;
        return ratio ? { fs, ratio, src } : null;
      };
      let n = 0, tight = 0;
      for (const e of paras) {
        if (e.p.end < 0 || !prose(plain(body.slice(e.p.start, e.p.end)))) continue;
        const k = e.cls.join(' ');
        if (/\b(truncate|whitespace-nowrap|text-nowrap|line-clamp-1)\b/.test(k)) continue;
        // breakpoint utilities (md:text-base, lg:leading-relaxed) re-set leading in CSS this check cannot see
        if (/(?:^|\s)(?:sm|md|lg|xl|2xl):(?:text-(?:xs|sm|base|lg|xl)|leading-(?!none|tight))/.test(k)) continue;
        n++;
        const r = resolve(e); if (!r || r.fs >= 24 || r.fs < 11) continue;   // under 11px: size not resolvable here
        if (r.ratio > 0 && r.ratio < 1.26) { tight++; ev.push(r.src.slice(0,40)+' gives '+Math.round(r.fs)+'px text '+r.ratio.toFixed(2)+' leading'); }
      }
      // cramped body copy is a page trait: most wrapping paragraphs, not one stray block
      if (!n || tight / n < 0.5) ev.length = 0;
    }
    for (const m of all(/<p\b[^>]*class=["']([^"']*\bleading-(none|tight)\b[^"']*)["'][^>]*>([\s\S]*?)<\/p>/gi, c.html)) {
      const k = m[1];
      if (/\b(truncate|whitespace-nowrap|text-nowrap|line-clamp-1)\b/.test(k) || display(k)) continue;
      // Tailwind's text-* sizes carry their own line-height; a breakpoint text-* after leading-tight resets it there
      if (/(?:^|\s)(?:sm|md|lg|xl|2xl):text-(?:xs|sm|base|lg|xl)\b/.test(k) && !/(?:^|\s)(?:sm|md|lg|xl|2xl):leading-(?:none|tight|\[)/.test(k)) continue;
      if (!prose(plain(m[3]))) continue;
      ev.push('<p> with leading-'+m[2]+' on a wrapping paragraph');
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A54', id:'all-caps-paragraphs', name:'All-Caps Paragraphs',
  fix:'Keep caps for labels under a line long. Paragraphs go in sentence case.',
  test(c){
    // v1.2: verify on real paragraphs. A base rule (p {uppercase}) counts only if some paragraph of 80+ chars
    // is not reset by a more specific rule on its id/class or an inline style. A Tailwind uppercase <p> must run
    // to more than one line: 80+ chars at body size, 160+ at text-xs or smaller, and not truncate/nowrap.
    const ev=[];
    const plain = s => s.replace(/<[^>]+>/g,' ').replace(/&[#\w]+;/g,' ').replace(/\s+/g,' ').trim();
    const R = rules(c.css);
    const resetSel = [];
    for (const r of R) if (/text-transform\s*:\s*(none|lowercase|capitalize)/i.test(r.body)) for (const p of parts(r.sel)) {
      const last = p.split(/\s*[\s>+~]\s*/).filter(Boolean).pop() || '';
      resetSel.push({ id: (/#([\w-]+)/.exec(last)||[])[1], cls: all(/\.([\w-]+)/g, last).map(m=>m[1]), tag: (/^[a-z]+/.exec(last)||[])[0] });
    }
    const paras = all(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, c.html).map(m => ({ attrs: m[1], text: plain(m[2]) })).filter(p => p.text.length >= 80);
    const isReset = a => {
      if (/style\s*=\s*["'][^"']*text-transform\s*:\s*(none|lowercase|capitalize)/i.test(a)) return true;
      const id = (/\bid\s*=\s*["']([^"']*)["']/i.exec(a)||[])[1];
      const cls = ((/\bclass\s*=\s*["']([^"']*)["']/i.exec(a)||[])[1]||'').split(/\s+/);
      if (/\b(normal-case|lowercase|capitalize)\b/.test(cls.join(' '))) return true;
      return resetSel.some(s => (s.id || s.cls.length) && (!s.id || s.id === id) && s.cls.every(k => cls.includes(k)) && (!s.tag || s.tag === 'p'));
    };
    for (const r of R)
      if (isBase(r.sel) && /text-transform\s*:\s*uppercase/i.test(r.body)) {
        if (c.isFullDoc && !paras.some(p => !isReset(p.attrs))) continue;
        ev.push(r.sel.trim().slice(0,30)+' { text-transform: uppercase }');
      }
    for (const m of all(/<p\b[^>]*class=["']([^"']*\buppercase\b[^"']*)["'][^>]*>([\s\S]*?)<\/p>/gi, c.html)) {
      const k = m[1], t = plain(m[2]);
      if (/\b(truncate|whitespace-nowrap|text-nowrap|line-clamp-1)\b/.test(k)) continue;
      let px = 16; const tw = /(?:^|\s)text-(xs|sm|base|lg|xl|\[(\d+(?:\.\d+)?)px\])(?=\s|$)/.exec(k);
      if (tw) px = tw[2] ? +tw[2] : { xs:12, sm:14, base:16, lg:18, xl:20 }[tw[1]];
      if (t.length >= (px <= 12 ? 160 : 80)) ev.push('uppercase paragraph of '+t.length+' characters');
    }
    return ev.length ? {evidence:ev.slice(0,3)} : null; } },

{ code:'A55', id:'skipped-heading-level', name:'Skipped Heading Level',
  fix:'Nest headings in order: an h2 under the h1, an h3 under an h2. Style size separately from level.',
  test(c){
    const lv = all(/<h([1-6])\b/gi, c.html).map(m=>+m[1]);
    if (lv.length < 2) return null;
    const ev=[];
    for (let i=1;i<lv.length;i++) if (lv[i] > lv[i-1] + 1) ev.push('h'+lv[i-1]+' followed directly by h'+lv[i]);
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A56', id:'stripes-for-texture', name:'Stripes For Texture',
  fix:'Remove it. If a surface needs to read as disabled or hazardous, say so in words as well.',
  test(c){
    const ev=[];
    // Narrowed to the recognisable core: diagonal (about 30-60 or 120-150 deg) stripe bands that are close
    // together and visible, painted as the background or border of a surface (not a 10px drawn object) that is on
    // the page and not entirely covered by an image. v1.3: var() is resolved first (an undefined variable paints
    // nothing); stripes whose colours differ by less than ~10 levels cannot be seen; crossed or stacked diagonal
    // layers (checkerboards, argyle, crosshatch) and multi-layer foil sheens are textures of another kind; the
    // hatch a site builder paints into an empty image slot is a placeholder, not decoration.
    const unesc = x => x.replace(/\\(.)/g, '$1');
    const vars = {};
    for (const r of rules(c.css)) for (const m of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) if (!(m[1] in vars)) vars[m[1]] = m[2].trim();
    const resolve = (s, d = 0) => d > 5 ? s : s.replace(/var\(\s*(--[\w-]+)\s*(?:,((?:[^()]|\([^()]*\))*))?\)/g,
      (_, n, fb) => n in vars ? resolve(vars[n], d + 1) : fb !== undefined ? resolve(fb.trim(), d + 1) : '\u0000');
    const elsWith = cls => all(/<([a-z][\w-]*)\b([^>]*)>/gi, c.html).filter(m => {
      const k = ' ' + ((/\bclass\s*=\s*["']([^"']*)["']/i.exec(m[2]) || [])[1] || '') + ' ';
      return cls.every(x => k.includes(' ' + x + ' '));
    });
    const content = m => { const t = m[1].toLowerCase();
      const re = new RegExp('<(/?)' + t + '\\b[^>]*>', 'gi'); re.lastIndex = m.index + m[0].length; let d = 1, e;
      while (d && (e = re.exec(c.html))) d += e[1] ? -1 : 1;
      return c.html.slice(m.index + m[0].length, d ? c.html.length : e.index); };
    // an image frame: holds an img/picture/video and at most a short badge or caption overlay
    const imageOnly = h => /<(img|picture|video)\b/i.test(h) && h.replace(/<[^>]+>/g, '').replace(/&[#\w]+;/g, '').replace(/\s+/g, ' ').trim().length <= 40;
    // colour -> [r,g,b,a], or null when it cannot be known here (color-mix, currentColor, keywords)
    const rgba = col => { col = col.trim().toLowerCase(); let m;
      if (col === 'transparent') return [0,0,0,0];
      if ((m = /^#([0-9a-f]{3,8})$/.exec(col))) { let h = m[1]; if (h.length <= 4) h = h.split('').map(x => x + x).join('');
        return [0,2,4].map(i => parseInt(h.slice(i, i+2), 16)).concat(h.length === 8 ? parseInt(h.slice(6), 16)/255 : 1); }
      if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(col)))
        return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : m[5] ? m[4]/100 : +m[4]];
      if ((m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(col))) {
        const h = +m[1] / 360, s = m[2] / 100, l = m[3] / 100;
        const f = n => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
        return [f(0), f(8), f(4), m[4] === undefined ? 1 : m[5] ? m[4]/100 : +m[4]]; }
      const n = NAMED[col]; return n ? [...n, 1] : null; };
    const alpha = col => { const v = rgba(col); if (v) return v[3];
      const mix = /color-mix\([^)]*?(\d+)%/i.exec(col); if (mix) return +mix[1] / 100;
      return 1; };
    const args = str => { const out = []; let d = 0, cur = '';
      for (const ch of str) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; }
      out.push(cur.trim()); return out; };
    const GRAD = /repeating-linear-gradient\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/gi;
    // attribute selectors must match a value on the page ([data-rarity*="radiant"] for a card that is not there)
    const attrLive = part => all(/\[\s*([\w-]+)\s*([~|^$*]?=)\s*["']?([^"'\]]*)["']?\s*\]/g, part).every(([, n, op, v]) => {
      const vals = all(new RegExp('\\s' + n + '\\s*=\\s*["\']([^"\']*)["\']', 'gi'), c.html).map(m => m[1]);
      return vals.some(x => op === '=' ? x === v : op === '*=' ? x.includes(v) : op === '^=' ? x.startsWith(v) : op === '$=' ? x.endsWith(v)
        : op === '~=' ? x.split(/\s+/).includes(v) : x === v || x.startsWith(v + '-')); });
    // what a selector part does elsewhere in the sheet: display:none with no rule showing it again, or a 3D transform
    // (rotateY, translateZ: a drawn object such as a book page, not a flat UI surface)
    const norm = x => x.replace(/\s*([>+~])\s*/g, '$1').replace(/\s+/g, ' ').trim();
    const last = x => norm(x).split(/[ >+~]/).pop();
    const partInfo = {};
    for (const r of rules(c.css)) { if (r.sel === '[inline-style]') continue;
      const none = /(?:^|;|\s)display\s*:\s*none/i.test(r.body), shown = /(?:^|;|\s)display\s*:\s*(?!none)\w/i.test(r.body),
        threeD = /(?:^|;|\s)transform\s*:[^;]*(?:rotate[XY3]|translateZ|translate3d|perspective)/i.test(r.body);
      for (const p of r.sel.split(/(?<!\\),/)) { const k = norm(p), l = last(p);
        const o = partInfo[k] = partInfo[k] || {}; if (none) o.none = true;
        const q = partInfo['>' + l] = partInfo['>' + l] || {}; if (shown) q.shown = true; if (threeD) q.threeD = true; } }
    const deadPart = p => { const o = partInfo[norm(p)] || {}, q = partInfo['>' + last(p)] || {}; return (o.none && !q.shown) || q.threeD; };
    const blended = attrs => /mix-blend|bg-blend|blend-mode\s*:\s*(?!normal)/i.test(attrs);
    // declarations that paint a background or border image: [where, value, the whole block, element attrs if inline]
    const decls = [];
    const take = (where, body, attrs) => { for (const m of all(/(?:^|;|\s)(background(?:-image)?|border-image(?:-source)?)\s*:\s*((?:[^;()]|\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\))+)/gi, body))
      decls.push({ where, val: m[2], body, attrs }); };
    for (const r of rules(c.css)) if (!(c.isFullDoc && r.sel === '[inline-style]')) take(r.sel, r.body, null);
    if (c.isFullDoc) for (const m of all(/<([a-z][\w-]*)\b([^>]*\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*)>/gi, c.html))
      if (/gradient|var\(/i.test(m[3] ?? m[4])) take('[inline-style]', (m[3] ?? m[4]).replace(/&quot;/g, '"'), m[2]);
    for (const dcl of decls) {
      const val = resolve(dcl.val);
      if (!/repeating-linear-gradient/i.test(val)) continue;
      // several stripe sets woven together (checkerboard, argyle, tartan, crosshatch) or a blended foil sheen is not a stripe band
      const diag = all(GRAD, val).filter(g => { const a = /^(-?[\d.]+)deg$/i.exec(args(g[1])[0]); if (!a) return false;
        const t = ((+a[1] % 180) + 180) % 180; return (t >= 30 && t <= 60) || (t >= 120 && t <= 150); });
      if (all(GRAD, val).length >= 2 || blended(dcl.body) || (dcl.attrs && blended(dcl.attrs))) continue;
      // site builders (Framer) paint a 16px grey hatch into an image slot that has no image yet
      if (/rgba\(\s*180\s*,\s*180\s*,\s*180/.test(val) && /background-size\s*:\s*16px/i.test(dcl.body) ||
          (dcl.attrs && /data-framer-background-image-wrapper/i.test(dcl.attrs))) continue;
      const bg = rgba(((/(?:^|;|\s)background-color\s*:\s*([^;]+)/i.exec(dcl.body) || [])[1] ||
        (/\)\s*((?:#[0-9a-f]{3,8}|rgba?\([^)]*\)|[a-z]+))\s*$/i.exec(val.trim()) || [])[1] || '').trim());
      for (const g of diag) {
        if (g[0].includes('\u0000')) continue;                                         // undefined variable: renders nothing
        const a = args(g[1]); const ang = /^(-?[\d.]+)deg$/i.exec(a[0]);
        const stops = a.slice(1);
        const cols = stops.map(x => x.replace(/\s+(?:-?[\d.]+(px|%|em|rem)?|calc\([^)]*\))(\s+(?:-?[\d.]+(px|%|em|rem)?|calc\([^)]*\)))?$/i, '').trim());
        if (cols.length && cols.every(x => alpha(x) < 0.04)) continue;               // invisible
        // the stripes must differ from each other by more than a couple of levels, after any translucency over the surface colour
        const known = cols.map(rgba);
        if (known.length >= 2 && known.every(Boolean) && (bg || known.every(k => k[3] === 1))) {
          const base = bg || [255,255,255,1];
          const flat = known.map(k => k.slice(0, 3).map((v, i) => v * k[3] + base[i] * (1 - k[3])));
          let diff = 0; for (const p of flat) for (const q of flat) diff = Math.max(diff, ...p.map((v, i) => Math.abs(v - q[i])));
          if (diff < 3) continue;
        }
        const px = all(/(-?[\d.]+)px\b/g, stops.join(' ')).map(m => +m[1]);
        if (px.length && Math.max(...px) > 48) continue;                              // lines far apart: a lattice, not stripes
        const w = /(?:^|;|\s)(?:width|height)\s*:\s*([\d.]+)px/i.exec(dcl.body);
        if (w && +w[1] <= 24) continue;                                               // a drawn object (a straw, a tag), not a surface
        if (c.isFullDoc && dcl.where !== '[inline-style]') {
          const live = dcl.where.split(/(?<!\\),/).some(part => {
            if (/:(hover|focus|active)/i.test(part) || !attrLive(part) || deadPart(part)) return false;
            const comp = part.replace(/(?<!\\):(?:is|where|not|has)\((?:[^()]|\([^()]*\))*\)/g, '').trim()
              .split(/\s+(?![^\[]*\])|\s*[>+~]\s*/).pop().replace(/::?(before|after)$/i, '');
            const cls = all(/\.((?:\\.|[^\s.#:\[\\>+~,])+)/g, comp).map(m => unesc(m[1]));
            if (!cls.length) return true;
            const hits = elsWith(cls);
            return hits.length && !hits.every(m => imageOnly(content(m)) || blended(m[2]));   // covered by an image, or a blended sheen
          });
          if (!live) continue;
        }
        ev.push('diagonal repeating-linear-gradient at '+ang[1]+'deg');
      }
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,2)} : null; } },

{ code:'A57', id:'small-body-text', name:'Small Body Text',
  fix:'Body text at 16px or more; form inputs at 16px or more so phones do not zoom on focus.',
  // Computed-size measurement shared with A59 (Flat Type Hierarchy). Cached on the ctx.
  measure(c){
    // v1.2: measure the paragraphs and inputs the page actually has, through a small cascade: rules whose subject
    // matches the element (tag/class/id, ancestors checked as descendant context, specificity then source order),
    // custom properties (var(), calc(), clamp() as on a 1280px screen), inline styles and Tailwind size classes,
    // inheritance, and the real root size (html{font-size:62.5%|112.5%}).
    // Limits: @media is not visible here, so the last matching rule (usually the widest breakpoint) wins;
    // nested CSS and JS-rendered text are not seen.
    if (c._typeMeasure) return c._typeMeasure;
    const R = rules(c.css);
    const unesc = s => s.replace(/\\(.)/g, '$1');
    const TW = { xs:12, sm:14, base:16, lg:18, xl:20, '2xl':24, '3xl':30, '4xl':36, '5xl':48, '6xl':60, '7xl':72, '8xl':96, '9xl':128 };
    const UA = { h1:2, h2:1.5, h3:1.17, small:0.83 };
    const VW = 12.8;
    const compound = s => {
      s = s.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, '').replace(/(^|[^\\])\[[^\]]*\]/g, '$1');
      return { tag: ((/^[a-z][\w-]*/i.exec(s) || [])[0] || '').toLowerCase(),
        cls: all(/\.((?:\\.|[\w-])+)/g, s).map(m => unesc(m[1])), id: ((/#((?:\\.|[\w-])+)/.exec(s) || [])[1]) };
    };
    const byKey = new Map(); let order = 0, rootVal = null;
    const add = (k, v) => { if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(v); };
    for (const r of R) {
      const fm = /(?:^|;|\s)font-size\s*:\s*([^;!]+)/i.exec(r.body) || /(?:^|;|\s)font\s*:\s*(inherit)\b/i.exec(r.body);
      const vars = {}; for (const m of all(/(?:^|;|\s)(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) vars[m[1]] = m[2].trim();
      if (!fm && !Object.keys(vars).length) continue;
      order++;
      // split on top-level, unescaped commas (Tailwind arbitrary values like .text-\[clamp\(1rem\,5vw\,3rem\)\] contain them)
      const sels = []; { let d = 0, cur = '';
        for (let i = 0; i < r.sel.length; i++) { const ch = r.sel[i];
          if (ch === '\\') { cur += ch + (r.sel[i+1] || ''); i++; continue; }
          if (ch === '(') d++; else if (ch === ')') d--;
          if (ch === ',' && d === 0) { sels.push(cur.trim()); cur = ''; } else cur += ch; }
        sels.push(cur.trim()); }
      for (const p of sels) {
        const q = p.replace(/:(?:is|where)\(([^(),]*)\)/g, '$1').replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, '');
        if (/::|:(?!root\b)[\w-]/.test(q.replace(/\\./g, ''))) continue;      // :hover, ::placeholder, :first-child …
        const comps = q.split(/\s*(?<!\\)[\s>+~]\s*/).filter(Boolean);
        const last = comps.pop() || '';
        if (/^(html|:root)$/i.test(last) && !comps.length) { if (fm) rootVal = fm[1].trim(); if (/^:root$/i.test(last)) add('*root', { vars, order }); continue; }
        const sub = compound(last); if (!sub.tag && !sub.cls.length && !sub.id) continue;
        const rec = { ...sub, id: sub.id && unesc(sub.id), anc: comps.filter(x => !/^(html|body|:root|\*)$/i.test(x)).map(compound),
          spec: [sub, ...comps.map(compound)].reduce((t, x) => t + (x.id ? 100 : 0) + x.cls.length * 10 + (x.tag ? 1 : 0), 0)
            + (fm && /font-size\s*:[^;]*!important/i.test(r.body) ? 10000 : 0), order, val: fm && fm[1].trim(), vars };
        add(rec.id ? '#'+rec.id : rec.cls.length ? '.'+rec.cls[0] : rec.tag, rec);
      }
    }
    const rootVars = {}; for (const r of byKey.get('*root') || []) Object.assign(rootVars, r.vars);
    // classes/ids a rule hides visually (display:none, visibility:hidden, the 1px clip "sr-only" idiom)
    const hiddenKeys = new Set();
    for (const r of R) if (/(?:^|;|\s)display\s*:\s*none|visibility\s*:\s*hidden|clip\s*:\s*rect\(\s*0|clip-path\s*:\s*inset\(\s*50%/i.test(r.body))
      for (const p of r.sel.split(',')) { const m = /^\s*([.#])((?:\\.|[\w-])+)\s*$/.exec(p); if (m) hiddenKeys.add(m[1] + unesc(m[2])); }
    const evalLen = (val, parentPx, vars, rootPx) => {
      let v = val, guard = 0;
      while (/var\(/.test(v) && guard++ < 10)
        v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,((?:[^()]|\((?:[^()]|\([^()]*\))*\))*))?\)/g, (_, n, f) => vars[n] !== undefined ? vars[n] : (f !== undefined ? f.trim() : 'NaN'));
      if (/^inherit$/i.test(v.trim())) return parentPx;
      const kw = ({ 'x-small':10, small:13, medium:16, large:18, 'x-large':24 })[v.trim().toLowerCase()];
      if (kw) return kw;
      v = v.replace(/(-?[\d.]+)(px|rem|em|%|vw|vh|vmin|vmax)(?![\w-])/gi, (_, n, u) => { u = u.toLowerCase();
        return '(' + (u === 'px' ? +n : u === 'rem' ? n * rootPx : u === 'em' ? n * parentPx : u === '%' ? n * parentPx / 100 : u === 'vw' || u === 'vmin' || u === 'vmax' ? n * VW : n * 8) + ')'; });
      v = v.replace(/\bcalc\(/g, '(').replace(/\bclamp\(/g, 'C(').replace(/\bmin\(/g, 'm(').replace(/\bmax\(/g, 'M(');
      if (!/^[\d.\s()+\-*/,CmM]*$/.test(v) || !/\d/.test(v)) return null;
      try { const out = Function('C','m','M', 'return (' + v + ')')((a,b,d) => Math.min(Math.max(a,b),d), Math.min, Math.max);
        return isFinite(out) && out > 0 ? out : null; } catch (e) { return null; }
    };
    let rootPx = 16; if (rootVal) rootPx = evalLen(rootVal, 16, rootVars, 16) || 16;
    const matches = (r, el, stack) => {
      if (r.tag && r.tag !== el.tag) return false;
      if (r.id && r.id !== el.id) return false;
      if (!r.cls.every(k => el.cls.includes(k))) return false;
      return r.anc.every(a => stack.some(s => s.tag !== '#root' && (!a.tag || a.tag === s.tag) && (!a.id || s.id === unesc(a.id)) && a.cls.every(k => s.cls.includes(k))));
    };
    const compute = (el, parent, stack) => {
      const cands = [...(byKey.get(el.tag) || []), ...(el.id ? byKey.get('#'+el.id) || [] : []), ...el.cls.flatMap(k => byKey.get('.'+k) || [])]
        .filter(r => matches(r, el, stack)).sort((a, b) => a.spec - b.spec || a.order - b.order);
      const vars = { ...parent.vars };
      let val = null;
      let vspec = -1;
      for (const r of cands) { Object.assign(vars, r.vars); if (r.val) { val = r.val; vspec = r.spec; } }
      const st = el.style || '';
      for (const m of all(/(--[\w-]+)\s*:\s*([^;]+)/g, st)) vars[m[1]] = m[2].trim();
      const sm = /(?:^|;)\s*font-size\s*:\s*([^;]+)/i.exec(st); if (sm) { val = sm[1].trim(); vspec = 1000; }
      let px = val ? evalLen(val, parent.px, vars, rootPx) : null;
      // a utility class beats a tag-level rule (preflight's h1{font-size:inherit}), also when Tailwind runs from the CDN with no compiled CSS
      if (!val || px === null || vspec < 10) for (const k of el.cls) { const m = /^(?:[\w-]+:)*text-(xs|sm|base|lg|xl|[2-9]xl|\[([^\]]+)\])(?:\/[\w.\[\]-]+)?$/.exec(k);
        if (!m) continue;
        const v = m[2] !== undefined ? evalLen(m[2].replace(/_/g, ' '), parent.px, vars, rootPx) : TW[m[1]] * rootPx / 16;
        if (v) px = v; }
      const explicit = px !== null;
      if (px === null && UA[el.tag]) px = UA[el.tag] * parent.px;
      return { vars, px, explicit };
    };
    const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
    const stack = [{ tag:'#root', cls:[], px: rootPx, vars: rootVars }];
    const inputs = []; let bodyPx = rootPx;
    if (!/<body\b/i.test(c.html)) {   // snippet: body rules still apply to everything in it
      const b = { tag:'body', cls:[], id:undefined, style:'' }; const cs = compute(b, stack[0], stack);
      b.vars = cs.vars; b.px = cs.px || rootPx; bodyPx = b.px; stack.push(b);
    }
    // text is credited to its nearest block ancestor, at the size of the innermost element holding it
    const INLINE = /^(a|span|strong|em|b|i|u|s|code|small|sup|sub|mark|abbr|cite|q|time|label|font|kbd|var|bdi|bdo|wbr|br)$/;
    const blocks = [], heads = []; let seq = 0;
    for (const m of all(/<(\/?)([a-z][\w-]*)\b([^<>]*)>|([^<]+)/gi, c.html)) {
      if (m[4] !== undefined) {
        const t = m[4]; if (!/\S/.test(t)) continue;
        const hd = stack.find(x => x.head); if (hd) { hd.htext += t; const k = +stack[stack.length-1].px.toFixed(1); hd.hchars[k] = (hd.hchars[k] || 0) + t.trim().length; continue; }
        if (stack.some(x => x.skip)) continue;
        const inner = stack[stack.length-1];
        let i = stack.length - 1; while (i > 0 && INLINE.test(stack[i].tag)) i--;
        const blk = stack[i]; if (blk.tag === '#root') continue;
        if (!blk.chars) { blk.chars = {}; blk.text = ''; blk.seq = seq++; blocks.push(blk); }
        blk.text += t; const k = +inner.px.toFixed(1); blk.chars[k] = (blk.chars[k] || 0) + t.length;
        continue;
      }
      const tag = m[2].toLowerCase();
      if (m[1]) {
        let i = stack.length - 1; while (i > 0 && stack[i].tag !== tag) i--;
        if (i > 0) stack.length = i;
        continue;
      }
      const a = m[3];
      const el = { tag, cls: ((/\bclass\s*=\s*["']([^"']*)["']/i.exec(a) || [])[1] || '').split(/\s+/).filter(Boolean),
        id: (/\bid\s*=\s*["']([^"']*)["']/i.exec(a) || [])[1], style: (/\bstyle\s*=\s*"([^"]*)"|\bstyle\s*=\s*'([^']*)'/i.exec(a) || []).slice(1).join('') };
      const parent = stack[stack.length-1];
      const cs = compute(el, parent, stack);
      el.vars = cs.vars; el.px = cs.px || parent.px;
      if (tag === 'body') bodyPx = el.px;
      if (tag === 'input' || tag === 'select' || tag === 'textarea') {
        const type = ((/\btype\s*=\s*["']?([\w-]+)/i.exec(a) || [])[1] || 'text').toLowerCase();
        // form controls do not inherit by default: only an explicit rule (or font:inherit) tells us their size
        if ((tag !== 'input' || /^(text|email|search|password|tel|url|number)$/.test(type)) && cs.explicit) inputs.push(el);
      }
      const srOnly = el.cls.some(k => /^(sr-only|visually-hidden|visuallyhidden|screen-reader-text)$/.test(k) || hiddenKeys.has('.'+k)) || (el.id && hiddenKeys.has('#'+el.id));
      if (srOnly && !VOID.test(tag) && !/\/\s*$/.test(a)) { stack.push(Object.assign(el, { skip: true })); continue; }
      if (VOID.test(tag) || /\/\s*$/.test(a) || /^(head|title|script|style|svg|button|nav|header|footer|textarea|select|option|pre|code|h[1-6])$/.test(tag)) {
        if (!VOID.test(tag) && !/\/\s*$/.test(a)) { // skip the whole subtree of non-prose containers
          if (/^h[1-6]$/.test(tag) && !stack.some(x => x.skip)) { el.head = true; el.htext = ''; el.hchars = {}; el.seq = seq++; heads.push(el); }
          stack.push(Object.assign(el, { tag, skip: true }));
        }
        continue;
      }
      stack.push(el);
    }
    const sentence = t => { t = t.replace(/&[#\w]+;/g, ' ').replace(/\s+/g, ' ').trim(); return t.length >= 60 && (t.match(/\b[a-z]{2,}\b/g) || []).length >= 6; };
    for (const b of blocks) { b.prose = sentence(b.text); b.main = +Object.entries(b.chars).sort((x, y) => y[1] - x[1])[0][0]; b.n = b.text.replace(/\s+/g, ' ').trim().length; }
    for (const h of heads) { h.htext = h.htext.replace(/&[#\w]+;/g, ' ').replace(/\s+/g, ' ').trim();
      const e = Object.entries(h.hchars).sort((x, y) => y[1] - x[1])[0]; if (e) h.px = +e[0]; }
    return (c._typeMeasure = { R, rootPx, bodyPx, blocks, heads, inputs });
  },
  test(c){
    // v1.2: body copy = text blocks of 60+ chars of sentence text, at their computed size (see measure). Flagged
    // when most of the running text (by characters) renders under 15px and the page's base size is small too
    // (or 90%+ of it is small). A page with no such text (a canvas or dashboard) makes no body-copy claim.
    // Inputs: a visible text input/select/textarea whose size is set (rule, utility or font:inherit) under 16px.
    const ev=[];
    const { R, bodyPx, blocks, inputs } = this.measure(c);
    // weigh by characters: a page whose lead copy is 18px and whose card captions are 14px is not "small body text"
    const body = blocks.filter(b => b.prose).map(b => ({ px: b.main, n: b.n }));
    const total = body.reduce((s, b) => s + b.n, 0);
    if (body.length >= 2 && total >= 120) {   // a stray sentence on a canvas/dashboard is not body copy
      const small = body.filter(p => p.px < 15 - 0.01), smallN = small.reduce((s, b) => s + b.n, 0);
      // the page's own base size must be small too, or nearly all running text must be: text-sm card captions under 18px lead copy are a component choice, not small body text
      if (smallN * 2 > total && (bodyPx < 15 - 0.01 || smallN >= 0.9 * total && body.length >= 4)) {
        const sizes = [...new Set(small.map(p => p.px))].sort((x, y) => x - y).slice(0, 3);
        ev.push(Math.round(100 * smallN / total)+'% of running text ('+small.length+' of '+body.length+' blocks) renders at '+sizes.join('/')+'px');
      }
    } else if (!c.isFullDoc) {
      for (const r of R) { const fs = sizePx(r.body); if (fs !== null && parts(r.sel).some(p => p === 'p' || p === 'body') && fs < 15) ev.push(r.sel.trim().slice(0,24)+' font-size '+fs+'px'); }
    }
    const smallIn = inputs.filter(i => i.px < 16 - 0.01);
    if (smallIn.length) ev.push(smallIn[0].tag+' renders at '+(+smallIn[0].px.toFixed(1))+'px (iOS zooms on focus)');
    if (!c.isFullDoc && !inputs.length) for (const r of R) { const fs = sizePx(r.body);
      if (fs !== null && parts(r.sel).some(p => /^(input|select|textarea)$/.test(p)) && fs < 16) ev.push(r.sel.trim().slice(0,24)+' font-size '+fs+'px (iOS zooms on focus)'); }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A58', id:'justified-without-hyphens', name:'Justified Without Hyphens',
  fix:'Align body text to the start. If you must justify, turn on hyphens: auto and set lang.',
  test(c){
    if (/hyphens\s*:\s*auto/i.test(c.css)) return null;
    const ev=[];
    // Justify only stretches word gaps in text that wraps: require a run of 100+ characters and 12+ words
    // uninterrupted by block elements. Image wrappers, single-line link titles and empty widgets do not qualify.
    // Link text and headings do not count: a list of long link titles is navigation, not running text.
    const INLINE = /<\/?(span|strong|em|b|i|u|code|small|sup|sub|abbr|mark|q|cite|time|kbd|s|del|ins|font|br)\b[^>]*>/gi;
    const prose = h => h.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(INLINE, ' ').replace(/<a\b[^>]*>[^<]*<\/a>/gi, ' ').replace(/<(h[1-6])\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').split(/<[^>]+>/)
      .some(t => { t = t.replace(/&[#\w]+;/g, ' ').replace(/\s+/g, ' ').trim(); return t.length >= 100 && t.split(' ').length >= 12; });
    const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr|svg|picture|video|iframe)$/;
    const contentOf = (m) => {
      const t = m[1].toLowerCase(); if (VOID.test(t)) return '';
      const re = new RegExp('<(/?)' + t + '\\b[^>]*>', 'gi'); re.lastIndex = m.index + m[0].length; let d = 1, e;
      while (d && (e = re.exec(c.html))) d += e[1] ? -1 : 1;
      return c.html.slice(m.index + m[0].length, d ? c.html.length : e.index);
    };
    const OPEN = /<([a-z][\w-]*)\b([^>]*)>/gi;
    const matches = comp => {
      const tag = ((/^[a-z][\w-]*/i.exec(comp) || [''])[0]).toLowerCase();
      const cls = all(/\.([\w-]+)/g, comp).map(m => m[1]); const id = (/#([\w-]+)/.exec(comp) || [])[1];
      if (!tag && !cls.length && !id) return [];
      return all(OPEN, c.html).filter(m => {
        if (tag && tag !== m[1].toLowerCase()) return false;
        const k = ' ' + ((/\bclass\s*=\s*["']([^"']*)["']/i.exec(m[2]) || [])[1] || '') + ' ';
        return cls.every(x => k.includes(' ' + x + ' ')) && (!id || (/\bid\s*=\s*["']([^"']*)["']/i.exec(m[2]) || [])[1] === id);
      });
    };
    const hasMarkup = /<[a-z][\w-]*\b[^>]*>/i.test(c.html.replace(/<style[\s\S]*?<\/style>/gi, ''));
    for (const r of rules(c.css)) {
      if (!/text-align\s*:\s*justify\b/i.test(r.body)) continue;
      if (r.sel === '[inline-style]') continue;   // inline styles are checked on their own elements below
      if (!c.isFullDoc && !hasMarkup) { ev.push(r.sel.trim().slice(0,30)+' { text-align: justify } with no hyphens: auto'); continue; }
      const ok = r.sel.split(',').some(part => {
        if (/:(hover|focus|active)|::?(before|after|placeholder)/i.test(part)) return false;
        const comp = part.trim().split(/\s*[\s>+~]\s*/).pop().replace(/::?[\w-]+(\([^)]*\))?/g, '').replace(/\[[^\]]*\]/g, '');
        return matches(comp).some(m => prose(contentOf(m)));
      });
      if (ok) ev.push(r.sel.trim().slice(0,30)+' { text-align: justify } with no hyphens: auto');
    }
    let inl = 0, tw = 0;
    for (const m of all(OPEN, c.html)) {
      if (/style\s*=\s*["'][^"']*text-align\s*:\s*justify/i.test(m[2]) && prose(contentOf(m))) inl++;
      if (/\bclass\s*=\s*["'](?:[^"']*\s)?text-justify(?:\s[^"']*)?["']/i.test(m[2]) && !/\bhyphens-auto\b/.test(m[2]) && prose(contentOf(m))) tw++;
    }
    if (inl) ev.push(inl+' element(s) with inline text-align: justify on running text');
    if (tw && !classAttrs(c.html).some(k => /(^|\s)hyphens-auto(\s|$)/.test(k))) ev.push('text-justify class on running text with no hyphens-auto');
    return ev.length ? {evidence:[...new Set(ev)]} : null; } },

{ code:'A59', id:'flat-type-hierarchy', name:'Flat Type Hierarchy',
  fix:'Make the heading clearly bigger or heavier than the text under it. One confident step beats three timid ones.',
  test(c){
    const one = s => s.size === 1 ? [...s][0] : null;
    if (!c.isFullDoc && !/<h[12]\b/i.test(c.html)) {
      // CSS-only snippets: only unambiguous, single-selector declarations; a reset rule like "h1,h2,p{font-size:100%}"
      // is not a hierarchy. rem resolves against the snippet's own html size, em on headings against the body.
      let root = 16;
      for (const r of rules(c.css)) if (parts(r.sel).length === 1 && /^(html|:root)$/.test(parts(r.sel)[0])) {
        const m = /(?:^|;|\s)font-size\s*:\s*([\d.]+)(px|%|rem|em)/i.exec(r.body); if (m) root = m[2] === 'px' ? +m[1] : m[2] === '%' ? 16 * m[1] / 100 : 16 * m[1]; }
      const raw = { body:new Set(), h1:new Set(), h2:new Set() };
      for (const r of rules(c.css)) {
        const m = /(?:^|;|\s)font-size\s*:\s*([\d.]+)(px|rem|em)\b/i.exec(r.body); if (!m) continue;
        const p = parts(r.sel); if (p.length !== 1) continue;
        const k = p[0] === 'body' || p[0] === 'p' ? 'body' : p[0];
        if (raw[k]) raw[k].add(m[1] + m[2]);
      }
      const px = (v, base) => { const m = /^([\d.]+)(px|rem|em)$/.exec(v); return m[2] === 'px' ? +m[1] : m[2] === 'rem' ? m[1] * root : m[1] * base; };
      const b = one(raw.body); if (!b) return null;
      const body = px(b, root), h1v = one(raw.h1), h2v = one(raw.h2);
      const h1 = h1v && px(h1v, body), h2 = h2v && px(h2v, body);
      const ev=[];
      if (h1 && h1/body < 1.3) ev.push('h1 '+h1+'px vs body '+body+'px (ratio '+(h1/body).toFixed(2)+')');
      if (h2 && h2/body < 1.1) ev.push('h2 '+h2+'px vs body '+body+'px (ratio '+(h2/body).toFixed(2)+')');
      return ev.length ? {evidence:ev} : null;
    }
    // v1.3 on whole pages: compare the headings a visitor sees with the running text under them, using A57's
    // computed sizes (real root size, em inheritance, class-sized headings, hidden modals already removed).
    // An h2 counts as a section heading only when running text follows it before the next heading, so price
    // labels, tool-panel labels and modal titles are not read as the page hierarchy.
    // Not flat: a page whose largest heading clearly leads (1.5x the running text or more). Then a small h1 is a
    // wordmark or a mockup label, and small h2s styled as labels (uppercase, tracked, muted) are eyebrows under it.
    // Also not section headings: an h2 straight after the h1 (a tagline or byline), sentence-length h2s, and
    // headings marked as the logo. Nested CSS (&-selectors) is not resolved by the size cascade: no claim.
    if (rules(c.css).some(r => /(?:^|[\s,(])&/.test(r.sel))) return null;
    const M = RULES.find(r => r.code === 'A57').measure(c);
    // body = character-weighted median size of the running text (sentence blocks; short text blocks if a page has
    // fewer than two sentences). A page with almost no text makes no hierarchy claim.
    let pool = M.blocks.filter(b => b.prose);
    if (pool.length < 2) pool = M.blocks.filter(b => b.n >= 40 && !/^(title|button|label|option)$/.test(b.tag));
    if (pool.length < 2) return null;
    const wmed = arr => { const s = arr.slice().sort((x, y) => x[0] - y[0]); const half = s.reduce((t, x) => t + x[1], 0) / 2;
      let acc = 0; for (const [v, n] of s) { acc += n; if (acc >= half) return v; } return s[s.length-1][0]; };
    const body = wmed(pool.map(b => [b.main, b.n]));
    const logo = h => /logo|brand|wordmark|site-?(?:title|name)/i.test(h.cls.join(' ') + ' ' + (h.id || ''));
    const heads = M.heads.filter(h => h.px && /[a-z]{2}/i.test(h.htext) && !logo(h));
    // an h1 the size cascade skipped (inside <header>) is still the page's title and may lead;
    // estimate its size from the last rule on its tag or classes (UA default 2em when none)
    const h1Size = attrs => { const cls = ((/\bclass\s*=\s*["']([^"']*)["']/i.exec(attrs) || [])[1] || '').split(/\s+/).filter(Boolean);
      let px = 2 * M.rootPx;
      for (const r of rules(c.css)) { const fs = /(?:^|;|\s)font-size\s*:\s*([\d.]+)(px|rem|em|%)\s*(?:!important)?\s*(?:;|$)/i.exec(r.body); if (!fs) continue;
        if (!r.sel.split(',').some(p => { const comp = p.trim().split(/[\s>+~]+/).pop(); if (/:/.test(comp)) return false;
          const tag = (/^([a-z][\w-]*)/i.exec(comp) || [])[1], cs = all(/\.((?:\\.|[\w-])+)/g, comp).map(m => m[1]);
          return (tag || cs.length) && (!tag || tag.toLowerCase() === 'h1') && cs.every(x => cls.includes(x)); })) continue;
        px = fs[2] === 'px' ? +fs[1] : fs[2] === '%' ? fs[1] * M.rootPx / 100 : fs[1] * M.rootPx; }
      for (const k of cls) { const m = /^(?:[\w-]+:)*text-(xs|sm|base|lg|xl|[2-9]xl)$/.exec(k); if (m) px = ({ xs:12, sm:14, base:16, lg:18, xl:20, '2xl':24, '3xl':30, '4xl':36, '5xl':48, '6xl':60, '7xl':72, '8xl':96, '9xl':128 })[m[1]]; }
      return px; };
    const hiddenH1 = !M.heads.some(h => h.tag === 'h1') && all(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi, c.html).some(m => /[a-z]{2}/i.test(m[2].replace(/<[^>]+>/g, '')) &&
      !/logo|brand|wordmark|site-?(?:title|name)/i.test(m[1]) && h1Size(m[1]) >= 1.5 * body);
    const lead = hiddenH1 || heads.some(h => /^h[1-3]$/.test(h.tag) && h.px >= 1.5 * body);
    // headings styled as labels: uppercase or tracked type, or a muted colour, by utility class or by a CSS rule on their class/tag
    const labelRules = rules(c.css).filter(r => /text-transform\s*:\s*uppercase|letter-spacing\s*:\s*(?:0?\.0[4-9]|0?\.[1-9]|[1-9])\d*(?:em|px|rem)/i.test(r.body));
    const isLabel = h => { const k = h.cls.join(' ');
      if (/(?:^|\s)(?:uppercase|tracking-(?:wide|wider|widest|\[)|text-muted[\w-]*|eyebrow|kicker|overline|label|subhead|section-head|small-caps)/i.test(k)) return true;
      if (h.htext === h.htext.toUpperCase() && /[A-Z]{3}/.test(h.htext)) return true;
      return labelRules.some(r => r.sel.split(',').some(p => { const comp = p.trim().split(/[\s>+~]+/).pop();
        if (/:/.test(comp)) return false;
        const tag = (/^([a-z][\w-]*)/i.exec(comp) || [])[1], cs = all(/\.((?:\\.|[\w-])+)/g, comp).map(m => m[1]);
        return (tag || cs.length) && (!tag || tag.toLowerCase() === h.tag) && cs.every(x => h.cls.includes(x)); })); };
    // Flat = within about 10% of the running text. Headings clearly SMALLER than the text are styled as labels or
    // eyebrows (tool panels, small tracked caps); whether that hierarchy works is a judgement call left to a person.
    const ev=[];
    const fmt = v => +v.toFixed(1);
    const h1s = heads.filter(h => h.tag === 'h1');
    if (h1s.length && !lead) { const h1 = Math.max(...h1s.map(h => h.px));
      if (h1 / body < 1.2 && h1 / body >= 0.9) ev.push('h1 '+fmt(h1)+'px vs running text '+fmt(body)+'px (ratio '+(h1/body).toFixed(2)+')'); }
    const firstH1 = h1s.length ? Math.min(...h1s.map(h => h.seq)) : -1;
    const h2s = heads.filter(h => h.tag === 'h2' && /[a-z]{3}/i.test(h.htext) && h.htext.split(' ').length >= 2 &&
      h.seq !== firstH1 + 1 && h.htext.split(' ').length < 9 && !(lead && isLabel(h)) &&
      !/accordion|faq|question|toggle|collaps|summary/i.test(h.cls.join(' ')));       // FAQ toggles are controls, not sections
    if (h2s.length) { const h2 = wmed(h2s.map(h => [h.px, 1]));
      if (h2 / body < 1.1 && h2 / body >= 0.9) ev.push('h2 '+fmt(h2)+'px vs running text '+fmt(body)+'px (ratio '+(h2/body).toFixed(2)+', '+h2s.length+' h2s)'); }
    return ev.length ? {evidence:ev} : null; } },

{ code:'A60', id:'stripe-on-a-rounded-corner', name:'Stripe On A Rounded Corner',
  fix:'Drop the stripe, or square the corner it sits on. A single-side border cannot follow a curve cleanly.',
  test(c){
    // v1.3: a stripe is exactly one side with a visible border once border, border-width, border-style and
    // the side longhands are combined; the corners next to that side must be rounded; controls (buttons,
    // inputs, tabs, pagination, spinners) and code blocks are not cards.
    const ev=[];
    const SIDES=['top','right','bottom','left'];
    const px = v => { v=String(v).trim().toLowerCase(); if (v==='thin') return 1; if (v==='medium') return 3; if (v==='thick') return 5;
      const m=/^(-?[\d.]+)(px|rem|em)?$/.exec(v); if (!m) return null; return m[2]==='rem'||m[2]==='em' ? +m[1]*16 : +m[1]; };
    const four = vals => { const v=vals.slice(0,4); if (v.length===1) return [v[0],v[0],v[0],v[0]]; if (v.length===2) return [v[0],v[1],v[0],v[1]];
      if (v.length===3) return [v[0],v[1],v[2],v[1]]; return v; };
    const shorthand = val => { // width/style/colour of a border shorthand
      const out={w:null,s:null,transparent:false};
      for (const t of val.replace(/\([^)]*\)/g,m=>m.replace(/\s+/g,'')).split(/\s+/).filter(Boolean)) {
        if (/^(none|hidden)$/i.test(t)) out.s='none';
        else if (/^(solid|dashed|dotted|double|groove|ridge|inset|outset)$/i.test(t)) out.s=t.toLowerCase();
        else if (px(t)!==null) out.w=px(t);
        else if (/^transparent$/i.test(t) || /^rgba\([^)]*,0(\.0+)?\)$/i.test(t)) out.transparent=true;
      }
      if (out.s===null && out.w!==null && out.w>0) out.s='none';      // no style keyword: no border is drawn
      if (out.s && out.s!=='none' && out.w===null) out.w=3;          // style without width: medium
      return out; };
    const sides = body => {
      const S=SIDES.map(()=>({w:0,s:'none',t:false}));
      for (const d of body.split(';')) {
        const m=/^\s*([\w-]+)\s*:\s*(.*?)\s*(?:!important)?\s*$/i.exec(d); if (!m) continue;
        const p=m[1].toLowerCase(), v=m[2];
        let k;
        if (p==='border') { const s=shorthand(v); S.forEach(x=>{x.w=s.w||0; x.s=s.s||'none'; x.t=s.transparent;}); }
        else if (p==='border-width') { const w=four(v.split(/\s+/).map(px)); S.forEach((x,i)=>{ if (w[i]!==null) x.w=w[i]; }); }
        else if (p==='border-style') { const s=four(v.split(/\s+/)); S.forEach((x,i)=>{ x.s=/none|hidden/i.test(s[i])?'none':s[i]; }); }
        else if (p==='border-color') { const cs=four(v.replace(/\([^)]*\)/g,mm=>mm.replace(/\s+/g,'')).split(/\s+/)); S.forEach((x,i)=>{ x.t=/^transparent$/i.test(cs[i]); }); }
        else if ((m2 => m2 && (k=SIDES.indexOf(m2[1]))>=0)(/^border-(top|right|bottom|left)$/.exec(p))) { const s=shorthand(v); S[k]={w:s.w||0,s:s.s||'none',t:s.transparent}; }
        else if ((m2 => m2 && (k=SIDES.indexOf(m2[1]))>=0)(/^border-(top|right|bottom|left)-width$/.exec(p))) { const w=px(v); if (w!==null) S[k].w=w; }
        else if ((m2 => m2 && (k=SIDES.indexOf(m2[1]))>=0)(/^border-(top|right|bottom|left)-style$/.exec(p))) S[k].s=/none|hidden/i.test(v)?'none':v;
        else if ((m2 => m2 && (k=SIDES.indexOf(m2[1]))>=0)(/^border-(top|right|bottom|left)-color$/.exec(p))) S[k].t=/^transparent$/i.test(v);
        else if (p==='border-inline-start' || p==='border-inline-end' || p==='border-block-start' || p==='border-block-end') {
          const s=shorthand(v); k={ 'border-inline-start':3,'border-inline-end':1,'border-block-start':0,'border-block-end':2 }[p]; S[k]={w:s.w||0,s:s.s||'none',t:s.transparent}; }
      }
      return S.map(x => x.s!=='none' && !x.t && x.w>0 ? x.w : 0); };
    const radii = body => { const m=/(?:^|;|\s)border-radius\s*:\s*([^;!]+)/i.exec(body); let r=[0,0,0,0];
      if (m) { const v=four(m[1].split('/')[0].trim().split(/\s+/).map(t=>/%$/.test(t)?parseFloat(t)>=5?99:0:(px(t)||0))); r=v.map(x=>x||0); }
      for (const [i,n] of [[0,'top-left'],[1,'top-right'],[2,'bottom-right'],[3,'bottom-left']]) { const mm=new RegExp('border-'+n+'-radius\\s*:\\s*([\\d.]+)(px|rem)','i').exec(body); if (mm) r[i]=mm[2]==='rem'?+mm[1]*16:+mm[1]; }
      return r; };  // tl tr br bl
    const ADJ = [[0,1],[1,2],[2,3],[3,0]];            // corners touching top/right/bottom/left
    const CONTROL = /(^|[\s>+~,(])(button|input|select|textarea|a|option|summary)(?=$|[\s.#:\[>+~,)])|[.#][\w-]*(btn|button|tab|tabs|nav|pagination|page-link|page-item|spinner|loader|loading|spin|input|field|form-control|select|toggle|switch|chip|badge|pill|code|highlight|sourcecode|syntax|hljs|prism)\b|[.#](pre|code)\b|(^|[\s>+~])(pre|code|kbd)\b/i;
    for (const r of rules(c.css)) {
      if (!/border-(left|top|right|bottom|inline|block)/i.test(r.body) || !/radius/i.test(r.body)) continue;
      if (/(?:^|;|\s)(?:opacity\s*:\s*0(?:[;\s]|$)|display\s*:\s*none|visibility\s*:\s*hidden)/i.test(r.body)) continue;
      const w = sides(r.body), on = w.map((x,i)=>x>0?i:-1).filter(i=>i>=0);
      if (on.length!==1) continue;
      const side=on[0]; if (w[side]<2 || w[side]>8) continue;
      const rad=radii(r.body), corner=Math.max(...ADJ[side].map(i=>rad[i]));
      if (corner<6) continue;
      const sels = r.sel.split(',').map(s=>s.trim()).filter(s => s && !CONTROL.test(s) && !/:(hover|focus|active|focus-visible|focus-within|checked|disabled)\b|::?(before|after|placeholder|-webkit)/i.test(s));
      // on a whole page, the element the selector paints must exist in the markup
      const inMarkup = s => { if (!c.isFullDoc) return true; const last=s.split(/[\s>+~]+/).pop();
        return (last.match(/[.#][\w-]+/g)||[]).every(t => new RegExp((t[0]==='#'?'\\bid':'\\bclass')+'\\s*=\\s*["\'](?:[^"\']*\\s)?'+t.slice(1).replace(/[-]/g,'\\-')+'(?=[\\s"\'])','i').test(c.html)); };
      // ...and hold some text: an empty shell filled by script (a toast, a message box) is not a visible card
      const innerOf = (html, at) => { let d=0; const re=/<(\/?)([a-z][\w-]*)\b[^>]*?(\/?)>/gi; re.lastIndex=at;
        let m; while ((m=re.exec(html))) { if (/^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i.test(m[2]) || m[3]) continue;
          d += m[1] ? -1 : 1; if (d===0) return html.slice(at, m.index); if (re.lastIndex-at > 60000) break; } return html.slice(at, at+3000); };
      const hasText = s => { if (!c.isFullDoc) return true; const last=s.split(/[\s>+~]+/).pop(); const t=(last.match(/[.#][\w-]+/g)||[])[0];
        if (!t) return true;
        const re=new RegExp('<[a-z][\\w-]*\\b[^>]*\\b'+(t[0]==='#'?'id':'class')+'\\s*=\\s*["\'](?:[^"\']*\\s)?'+t.slice(1).replace(/-/g,'\\-')+'(?=[\\s"\'])','gi');
        let m, n=0; while ((m=re.exec(c.html)) && n++<20) { const txt=innerOf(c.html, m.index).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi,'').replace(/<[^>]+>/g,' ');
          if ((txt.match(/\p{L}/gu)||[]).length>=3) return true; }
        return false; };
      const used = sels.filter(inMarkup).filter(hasText);
      if (!used.length) continue;
      ev.push(used[0].slice(0,40)+': border-'+SIDES[side]+' '+w[side]+'px on radius '+corner+'px');
    }
    // Tailwind: border-l-N on a rounded card with no other border width, a visible colour, and not a control
    for (const m of all(/<([a-z][\w-]*)\b[^>]*?\bclass(?:Name)?\s*=\s*["'{`]([^"'`}]+)["'`}]/gi, c.html)) {
      const tag=m[1].toLowerCase(), k=' '+m[2]+' ';
      const st=/\s(?:[a-z]+:)*border-(?:l|s)-([2-8])\s/.exec(k); if (!st) continue;
      if (!/\s(?:[a-z]+:)*rounded(?:-(?:l|s|tl|bl|ss|es))?-(?:md|lg|xl|2xl|3xl|\[\d+px\])\s/.test(k)) continue;
      if (/\s(?:[a-z]+:)*border(?:-[xytrbe])?(?:-(?:0|2|4|8|\[[^\]]+\]))?\s/.test(k.replace(/\s(?:[a-z]+:)*border-[trbe]-0\s/g,' ')) ) continue;  // another side carries a border
      if (/\s(?:[a-z]+:)*border-(?:l-|s-)?transparent\s|\sopacity-0\s|\s(hidden|invisible|sr-only)\s/.test(k)) continue;
      if (/^(button|input|select|textarea|a|pre|code)$/.test(tag) || /\b(btn|button|tab|spinner|loader)\b/i.test(k)) continue;
      ev.push('border-l-'+st[1]+' on a rounded card ('+tag+')');
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A61', id:'radial-halo-ground', name:'Radial Halo Ground',
  fix:'A flat ground, or light that comes from something on the page. Not a glow behind nothing.',
  test(c){
    // v1.2: a translucent, saturated radial-gradient painted as a page/section ground. The rule must reach an
    // element in the markup, that element must not be a control or a card (judged by its whole class list),
    // must not be hidden or hover-only, and the glow must be big enough to be a ground (>= 200px when sized).
    const ev=[];
    const els = c.isFullDoc ? all(/<([a-z][\w-]*)\b([^>]*)>/gi, c.html).map(m => ({ tag: m[1].toLowerCase(),
      cls: ((/\bclass(?:Name)?\s*=\s*["']([^"']*)["']/i.exec(m[2])||[])[1] || '').split(/\s+/).filter(Boolean),
      id: (/\bid\s*=\s*["']([^"']*)["']/i.exec(m[2])||[])[1] || null })) : [];
    const NEG = /btn|button|\bcta\b|cta-(?!section|band)|cursor|icon|logo|avatar|badge|link|nav|card|toggle|switch|chip|pill|thumb|tooltip|dropdown|menu|input|ripple|hover|spinner|loader|dot\b/i;
    const R = rules(c.css);
    const defined = new Set(); for (const r of R) for (const m of all(/(--[\w-]+)\s*:/g, r.body)) defined.add(m[1]);
    // v1.3 helpers: custom properties, the ground a glow is painted onto, and whether the hero hides a page-level glow
    const vars = {}; for (const r of R) for (const m of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) if (!(m[1] in vars)) vars[m[1]] = m[2];
    const resolve = (v, d=0) => d > 4 ? v : v.replace(/var\(\s*(--[\w-]+)\s*(?:,((?:[^()]|\([^()]*\))*))?\)/g, (_, n, fb) => n in vars ? resolve(vars[n], d+1) : (fb ? resolve(fb, d+1) : ' '));
    const opaqueCols = v => [...all(/#([0-9a-f]{6}|[0-9a-f]{3})\b(?![0-9a-f])/gi, v).map(m => parseColor('#'+m[1])),
      ...all(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)/gi, v).filter(m => m[4] === undefined || +m[4] / (m[5] ? 100 : 1) >= 0.9).map(m => [+m[1],+m[2],+m[3]])].filter(Boolean);
    const chromaOf = rgb => Math.max(...rgb) - Math.min(...rgb);
    const tree = [];
    if (c.isFullDoc) { const stack = [];
      for (const m of all(/<(\/?)([a-z][\w-]*)\b([^<>]*)>/gi, c.html)) { const tg = m[2].toLowerCase();
        if (m[1]) { for (let k = stack.length - 1; k >= 0; k--) if (stack[k].tag === tg) { stack.length = k; break; } continue; }
        const t = { tag: tg, i: m.index, parent: stack[stack.length-1] || null, kids: [], cls: ((/\bclass(?:Name)?\s*=\s*["']([^"']*)["']/i.exec(m[3])||[])[1] || '').split(/\s+/).filter(Boolean),
          style: (/\bstyle\s*=\s*["']([^"']*)["']/i.exec(m[3])||[])[1] || '' };
        if (t.parent) t.parent.kids.push(t); tree.push(t);
        if (!VOIDTAG.test(tg) && !/\/\s*$/.test(m[3])) stack.push(t); } }
    const rulesFor = t => R.filter(q => q.sel.split(/(?<!\\),/).some(x => { x = x.trim(); if (/::?(?:before|after)|:(?:hover|focus|active)/i.test(x)) return false;
      const lst = x.split(/\s*(?<!\\)[\s>+~]\s*/).filter(Boolean).pop() || ''; const br = lst.replace(/(?<!\\)\[[^\]]*?(?<!\\)\]/g, '');
      const tg = ((/^[a-z][\w-]*/i.exec(br)||[])[0]||'').toLowerCase(), cs = all(/\.((?:\\.|[\w-])+)/g, br).map(m => unesc(m[1])), id = (/#((?:\\.|[\w-])+)/.exec(br)||[])[1];
      return (tg || cs.length) && !id && (!tg || tg === t.tag) && cs.every(k => t.cls.includes(k)); }));
    const narrow = t => t.cls.some(k => /^(?:container|(?:[\w-]+:)?max-w-(?!none$|full$|screen$).+)$/.test(k)) || rulesFor(t).some(q => /(?:^|[;\s])max-width\s*:\s*(?:min\()?[\d.]+(?:px|rem|em|ch)/i.test(q.body));
    const paintsOver = t => t.cls.some(k => /^bg-(?!transparent$|none$|gradient|clip|cover|contain|center|no-repeat|fixed|\[(?:size|position))[\w\[\]#.-]+$/.test(k))
      || rulesFor(t).some(q => all(/(?:^|[;\s])background(?:-color|-image)?\s*:\s*([^;]+)/gi, q.body).some(m => { const v = resolve(m[1]);
        return /url\(/i.test(v) || !/transparent|rgba\([^)]*,\s*0?\.\d+\s*\)|\/\s*0?\.\d+|none/i.test(v) && opaqueCols(v).length > 0; }));
    // full-cover media: an img/video/picture laid over the whole box (absolute + inset 0, or object-fit cover at 100%)
    const coverMedia = t => t.kids.some(k => /^(?:img|video|picture)$/.test(k.tag) && (k.cls.includes('inset-0') && k.cls.includes('absolute') || k.cls.includes('object-cover') && k.cls.includes('w-full') && k.cls.includes('h-full')
      || rulesFor(k).some(q => /position\s*:\s*absolute/i.test(q.body) && /(?:^|[;\s])inset\s*:\s*0/i.test(q.body) || /object-fit\s*:\s*cover/i.test(q.body) && /(?:^|[;\s])width\s*:\s*100%/i.test(q.body) && /(?:^|[;\s])height\s*:\s*100%/i.test(q.body))));
    let heroHides = false;
    { const h1 = tree.find(t => t.tag === 'h1');
      const chain = []; for (let x = h1 && h1.parent; x; x = x.parent) if (!/^(?:html|body|main|head)$/.test(x.tag)) chain.push(x);
      heroHides = chain.some(x => !narrow(x) && (paintsOver(x) || coverMedia(x))); }
    for (const r of R) {
      for (const part of r.sel.split(/(?<!\\),/)) {
        const p = part.trim();
        if (!p || /^\[inline-style\]/.test(p) || /:(?:hover|focus|focus-within|focus-visible|active)\b/i.test(p)) continue;
        if (!/(^|[\s,.#-])(html|body|main|hero|section|page|bg|backdrop|wrapper)|::?before|::?after/i.test(p)) continue;
        const last = p.split(/\s*(?<!\\)[\s>+~]\s*/).filter(Boolean).pop() || '';
        if (NEG.test(last) && !/section|band|hero|banner/i.test(last) || /opacity\s*:\s*0(?:[;\s]|$)|scale\(0\)|display\s*:\s*none/i.test(r.body)) continue;
        // v1.3: a bordered, rounded box is a card or panel, not a ground
        if (!/hero|banner/i.test(last) && /(?:^|[;\s])border(?:-width)?\s*:\s*[\d.]+px/i.test(r.body) && /border-radius\s*:\s*(?:[89]|[1-9]\d)(?:\.\d+)?px|border-radius\s*:\s*(?:0?\.[5-9]|[1-9])(?:\.\d+)?rem/i.test(r.body)) continue;
        // v1.3: a page-level glow (html/body/main or their pseudo-elements) behind a hero that paints over it is never seen
        if (c.isFullDoc && heroHides && /^(?:html|body|main|:root)(?:::?(?:before|after))?$/i.test(last)) continue;
        const bgDecl = all(/(?:^|[;\s])background(?:-image)?\s*:\s*([^;]+)/gi, r.body).map(m => m[1]).join(' ');
        const grads = all(/radial-gradient\(((?:[^()]|\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\))*)\)/gi, bgDecl).map(m => m[1]);
        if (!grads.length) continue;
        // a tiled dot lattice (small background-size, or hard stops a few px wide) is a pattern (A48), not a halo
        const tile = /background-size\s*:\s*([\d.]+)(px|rem|em)/i.exec(r.body);
        if (tile && (tile[2] === 'px' ? +tile[1] : +tile[1]*16) < 120) continue;
        if (grads.every(g => /(?:\)|transparent|#[0-9a-f]{3,8})\s+[0-4](?:\.\d+)?px/i.test(g))) continue;
        // placed by runtime variables nobody defines in CSS (--x/--y set from the pointer): a cursor glow, not a ground
        const placed = all(/(?:^|[;\s])(?:left|top|transform)\s*:[^;]*var\(\s*(--[\w-]+)/gi, r.body).map(m => m[1]);
        if (placed.some(n => !defined.has(n))) continue;
        // size, when the rule gives one (custom properties set in the same rule are resolved)
        const local = {}; for (const m of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) local[m[1]] = m[2];
        const dim = prop => { const m = new RegExp('(?:^|[;\\s])' + prop + '\\s*:\\s*([^;]+)', 'i').exec(r.body); if (!m) return null;
          const v = m[1].replace(/var\(\s*(--[\w-]+)\s*\)/g, (x, n) => local[n] || x); const u = /^\s*([\d.]+)(px|em|rem)\s*$/.exec(v);
          return u ? (u[2] === 'px' ? +u[1] : +u[1] * 16) : null; };
        const w = dim('width'), h = dim('height');
        if ((w !== null && w < 200) || (h !== null && h < 200)) continue;
        // the element the rule paints must exist and must not be a control/card or start hidden
        const bare = last.replace(/(?<!\\)::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g, '').replace(/(?<!\\)\[[^\]]*?(?<!\\)\]/g, '');
        const cs = all(/\.((?:\\.|[\w-])+)/g, bare).map(m => unesc(m[1]));
        const id = (/#((?:\\.|[\w-])+)/.exec(bare)||[])[1];
        const tag = ((/^[a-z][\w-]*/i.exec(bare)||[])[0]||'').toLowerCase();
        if (c.isFullDoc && (cs.length || id)) {
          const hits = els.filter(e => cs.every(k => e.cls.includes(k)) && (!id || e.id === unesc(id)) && (!tag || e.tag === tag));
          if (!hits.length) continue;
          if (hits.every(e => NEG.test(e.cls.join(' ')) || e.cls.some(k => /^(?:opacity-0|invisible|hidden)$/.test(k)))) continue;
          // host hidden until hover: a rule for the same element (no pseudo) with opacity 0
          const host = bare.trim();
          // host hidden until hover (opacity 0), or the host is a control (cursor: pointer): not a ground
          if (R.some(q => q.sel.split(/(?<!\\),/).some(x => x.trim() === host) && /(?:^|[;\s])(?:opacity\s*:\s*0(?:[;\s]|$)|cursor\s*:\s*pointer)/i.test(q.body))) continue;
        }
        // colour: a stop inside this radial-gradient that is saturated, mid-light and visibly opaque, with a fade to transparent
        for (const body of grads) {
        const soft = /transparent|rgba\([^)]*,\s*0?\.\d+\)|#[0-9a-f]{8}\b|\/\s*0?\.\d+\)|,\s*0\)/i.test(body);
        const stops = [
          ...all(/#([0-9a-f]{6})([0-9a-f]{2})?\b/gi, body).map(m => ({ rgb: parseColor('#'+m[1]), a: m[2] ? parseInt(m[2],16)/255 : 1 })),
          ...all(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)/gi, body).map(m => ({ rgb: [+m[1],+m[2],+m[3]], a: m[4] === undefined ? 1 : +m[4] / (m[5] ? 100 : 1) })),
          // alpha computed at runtime (calc/var): unknown, treat as visible
          ...all(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*[,/]\s*(?:calc|var)\(/gi, body).map(m => ({ rgb: [+m[1],+m[2],+m[3]], a: 0.5 }))];
        // v1.3: compare the glow with the ground it is painted on (the opaque layers under it in the same background,
        // or its background-color). A pastel tint on a pale ground is a tonal wash; a same-hue highlight on a saturated
        // ground is shading. On dark grounds any saturated glow reads as a halo.
        const under = resolve(bgDecl.slice(bgDecl.indexOf(body) + body.length) + ' ' + ((/(?:^|[;\s])background-color\s*:\s*([^;]+)/i.exec(r.body)||[])[1] || ''));
        const ground = opaqueCols(under.replace(/radial-gradient\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/gi, ' ')).map(rgb => ({ rgb, h: rgbToHsl(rgb) }));
        const gL = ground.length ? Math.min(...ground.map(g => g.h.l)) : null;
        const gS = ground.length ? Math.min(...ground.map(g => g.h.s)) : 0;
        const halo = s => { if (!ground.length) return true; const x = rgbToHsl(s.rgb);
          if (gL >= 70 && chromaOf(s.rgb) < 100) return false;
          if (gS > 40 && gL >= 30 && gL < 70 && ground.every(g => { const d = Math.abs(g.h.h - x.h) % 360; return Math.min(d, 360 - d) < 35; })) return false;
          return true; };
        const ok = stops.some(s => { const x = s.rgb && rgbToHsl(s.rgb); return x && x.s > 40 && x.l >= 25 && x.l <= 85 && s.a >= 0.1 && halo(s); });
        const soft2 = soft || /calc\(|var\(/.test(body) && /transparent/i.test(body);
        if (soft2 && ok) { ev.push(p.slice(0,30) + ': soft coloured radial-gradient ground'); break; }
        }
      }
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,2)} : null; } },

{ code:'A62', id:'bounce-easing-in-the-interface', name:'Bounce Easing In The Interface',
  fix:'ease-out for things arriving, ease-in for things leaving. Save overshoot for illustration and play.',
  test(c){
    // v1.2 of this entry: an overshooting curve that is actually applied (a token like --ease-spring counts only where
    // var(--ease-spring) is used) to an interface element: a control, menu, panel, dialog or card. Overshoot on
    // illustration, particles and celebration is what the entry allows.
    const ev=[];
    const BEZ = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/gi;
    const over = m => { const y1 = +m[2], y2 = +m[4]; return y1 < -0.15 || y2 > 1.15 || y1 > 1.15 || y2 < -0.15; };
    // CSS linear() springs: an output stop above 1.05 or below -0.05 overshoots
    const LIN = /linear\(([^()]*)\)/gi;
    const linOver = m => m[1].split(',').some(st => { const v = parseFloat(st); return v > 1.05 || v < -0.05; });
    const curves = v => [...all(BEZ, v).filter(over), ...all(LIN, v).filter(linOver)].map(m => m[0].replace(/\s+/g,'').slice(0,60));
    const UI = /(?:^|[^a-z])(?:btn|button|toggle|switch|slider|menu|dropdown|nav|modal|dialog|drawer|panel|popover|popup|tooltip|toast|sheet|card|tab|accordion|input|select|check|radio|badge|chip|pill|icon|link|key|cta|control|tile|item|form|field|search|sidebar|header|dock|fab)|(?:^|[\s>+~,(])(?:button|a|input|select|summary|details|dialog|nav|li|label)(?=$|[\s.:#\[>+~,)])/i;
    const DECO = /svg|path|circle|leaf|flower|petal|plant|illustrat|confetti|burst|spark|particle|celebrat|mascot|blob|deco|ornament|(?:^|[-_.])(?:art|ring|orb|stars?)(?=$|[-_:\s.\[])|emoji|hero-?bg|doodle|sticker|globe|planet/i;
    const target = sel => { const last = sel.split(',').map(p => p.trim().split(/[\s>+~]+/).pop()); return last; };
    const uiSel = sel => target(sel).some(t => UI.test(t) && !DECO.test(t)) && !DECO.test(sel.replace(/:not\([^)]*\)/g,''));
    const tokens = new Map();     // --name -> curve
    const uses = [];              // {sel, curve}
    for (const r of rules(c.css)) {
      for (const d of all(/(?:^|;|\s)(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) for (const cv of curves(d[2])) tokens.set(d[1], cv);
      for (const d of all(/(?:^|;|\s)((?:-webkit-)?(?:transition|animation)(?:-timing-function)?)\s*:\s*([^;]+)/gi, r.body)) {
        for (const cv of curves(d[2])) uses.push({ sel:r.sel, curve:cv });
        for (const v of all(/var\(\s*(--[\w-]+)/g, d[2])) uses.push({ sel:r.sel, token:v[1] });
      }
    }
    for (const u of uses) {
      const curve = u.curve || tokens.get(u.token); if (!curve) continue;
      if (c.isFullDoc ? (u.sel === '[inline-style]' || !uiSel(u.sel)) : DECO.test(u.sel)) continue;
      ev.push(curve + ' on ' + u.sel.slice(0,40));
    }
    // named overshoot easings passed to an animation library
    for (const m of all(/\b(?:ease|easing|timingFunction)\s*[:=]\s*["'`]?(ease(?:In)?Out(?:Back|Elastic|Bounce)|easeIn(?:Back|Elastic|Bounce)|back\.out|elastic\.out|bounce\.out|backOut|elasticOut|bounceOut)\b/g, c.text)) ev.push(m[1]);
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A63', id:'same-words-twice', name:'Same Words Twice',
  fix:'Let the heading name it and the text below add something. If they say the same thing, delete one.',
  test(c){
    const STOP = new Set('the and for with you your our are was were this that these those from into onto over than then them they their its it\'s has have had not but all any can will just also out who what when where which how why let lets let\'s use using via per about more most very each every own get got'.split(' '));
    const decode = s => s.replace(/&(?:nbsp|#160|#xa0);/gi, ' ').replace(/&amp;/gi, '&').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&[a-z]+;/gi, ' ');
    const plain = s => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    const words = s => plain(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(w => (w.length > 2 || /\d/.test(w)) && !STOP.has(w));
    const stem = w => w.replace(/(ing|ed|es|s)$/, '');
    const PAD = new Set(('app tool free online instant instantly quick quickly fast easy easily simple simply just now today help want need take make '
      + 'mak good great best better enough new available find discover beauty simplicity together click tap try before after along while '
      + 'able anyone everyone everything anything thing way time start ever really actually always never only well also even here there '
      + 'allow let lets able one ones some many much other another same like').split(' ').map(stem));
    let n = 0; const ex=[];
    for (const m of all(/<h([2-4])\b[^>]*>([\s\S]{3,120}?)<\/h\1>\s*<p\b[^>]*>([\s\S]{3,240}?)<\/p>\s*(<\w+)?/gi, c.html)) {
      const body = plain(m[3]);
      // a lead-in to code, a list or a table ("Let's create our first program:") introduces content; it is not a description
      if (/:$/.test(body) || /^<(pre|code|ul|ol|table|dl)$/i.test(m[4] || '')) continue;
      const a = words(m[2]), b = words(m[3]); if (a.length < 3) continue;
      const bs = new Set(b.map(stem)), as = new Set(a.map(stem));
      const hit = a.filter(w => bs.has(stem(w))).length / a.length;
      if (hit < 0.9 || b.length > a.length * 2) continue;
      // the body must add next to nothing: no new figure, and new content words at most half the heading's (min 3)
      const added = [...new Set(b.map(stem))].filter(w => !as.has(w));
      if (added.length > Math.max(3, a.length / 2) || added.some(w => /\d/.test(w))) continue;
      // v1.2: weigh what was added. Padding (generic verbs, adjectives and connectives) adds nothing; a new mechanism,
      // channel, object or condition ("with our Chrome extension", "that will be triggered if...") is the detail the
      // reader came for. At most one such word for a three-word heading, half the heading's words for longer ones.
      const info = added.filter(w => !PAD.has(w));
      if (info.length > Math.max(1, Math.floor(a.length / 2)) || added.some(w => /^(?:one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand)$/.test(w))) continue;
      n++; ex.push(plain(m[2]).slice(0,40));
    }
    return n ? {evidence:ex.map(e=>'heading and text repeat each other: "'+e+'"').slice(0,2)} : null; } },

{ code:'A64', id:'contrast-below-the-floor', name:'Contrast Below The Floor',
  fix:'4.5:1 for normal text, 3:1 for large text (24px, or 18.66px bold). Check the actual pair, not the palette.',
  test(c){
    // v1.2: a pair counts only where it renders: on an element that holds real text (letters or digits,
    // not an icon glyph), carrying every class of the selector, and not re-coloured by a more specific
    // or later rule. A body/html pair is skipped when the page paints its own content surfaces or text colour.
    const ev=[];
    const textOf = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, 'x');
    const holdsText = s => /[\p{L}\p{N}]/u.test(textOf(s));
    const PSEUDO = /:(hover|focus|active|visited|disabled|checked|focus-within|focus-visible)|::?(selection|placeholder|before|after|marker)|\[disabled\]|sr-only|visually-hidden/i;
    // simple compounds: optional tag + classes only
    const compound = sel => { const m = /^([a-z][\w-]*)?((?:\.[\w-]+)*)$/i.exec(sel.trim()); if (!m || (!m[1] && !m[2])) return null;
      return { tag: (m[1]||'').toLowerCase(), cls: m[2].split('.').filter(Boolean) }; };
    const matches = (k, e) => (!k.tag || k.tag === e.tag) && k.cls.every(x => e.cls.has(x));
    const spec = k => k.cls.length * 10 + (k.tag ? 1 : 0);
    const R = rules(c.css);
    const collect = re => { const out = []; R.forEach((r, i) => { if (!re.test(r.body)) return;
      for (const p of r.sel.split(',')) { if (PSEUDO.test(p)) continue; const k = compound(p); if (k) out.push({ k, i, body: r.body }); } }); return out; };
    const painters = collect(/(?:^|;|\s)(color|background(?:-color)?)\s*:/i);   // simple compounds that set colour or background
    const displayers = collect(/(?:^|;|\s)(display|visibility)\s*:/i);
    const beats = (o, k, i) => spec(o.k) > spec(k) || (spec(o.k) === spec(k) && o.i > i);
    const overridden = (k, i, e) => painters.some(o => o.i !== i && matches(o.k, e) && beats(o, k, i));
    const HIDE = /display\s*:\s*none|visibility\s*:\s*hidden/i;
    // hidden on load: inline display:none, or a class rule display:none / visibility:hidden that nothing more specific undoes
    const hiddenBy = e => {
      if (e.style && HIDE.test(e.style)) return true;
      if ([...e.cls].some(x => /^(?:sm|md|lg|xl|2xl):/.test(x))) return false;
      return displayers.some(o => o.k.cls.length && matches(o.k, e) && HIDE.test(o.body)
        && !displayers.some(q => q !== o && matches(q.k, e) && beats(q, o.k, o.i) && !HIDE.test(q.body)));
    };
    // elements: tag, class set, inline style, whether they hold text, whether they or an ancestor are hidden
    const els = [], stack = [];
    for (const m of all(/<(\/?)([a-z][\w-]*)\b([^<>]*)>/gi, c.html)) {
      const tag = m[2].toLowerCase();
      if (m[1]) { for (let j = stack.length - 1; j >= 0; j--) if (stack[j].tag === tag) { stack.length = j; break; } continue; }
      if (VOIDTAG.test(tag)) continue;
      const a = m[3];
      const cl = /\bclass\s*=\s*["']([^"']*)["']/i.exec(a);
      const st = /\bstyle\s*=\s*["']([^"']*)["']/i.exec(a);
      const from = m.index + m[0].length;
      let to = c.html.indexOf('</' + tag, from); if (to < 0 || to - from > 3000) to = Math.min(c.html.length, from + 3000);
      const e = { tag, cls: new Set(cl ? cl[1].split(/\s+/).filter(Boolean) : []), style: st ? st[1] : null, text: holdsText(c.html.slice(from, to)) };
      const id = (/\bid\s*=\s*["']([^"']*)["']/i.exec(a)||[])[1] || '';
      e.hidden = !!((stack.length && stack[stack.length-1].hidden) || hiddenBy(e)
        || [...e.cls, id].some(x => /(^|[-_])(modal|drawer|offcanvas|popup|popover|dialog|lightbox|toast|tooltip)([-_]|$)/i.test(x)));   // closed on load
      els.push(e);
      if (!/\/\s*$/.test(a)) stack.push(e);
    }
    const check = (sel, body) => {
      const fg = declColor(body, 'color'); const bg = declColor(body, 'background(?:-color)?');
      if (!fg || !bg) return;
      const ratio = contrast(fg, bg); const fs = sizePx(body);
      const bold = /font-weight\s*:\s*(bold|[6-9]00)/i.test(body);
      const large = fs !== null && (fs >= 24 || (fs >= 18.66 && bold));
      const floor = large ? 3 : 4.5;
      if (ratio >= 1.1 && ratio < floor) ev.push(sel.trim().slice(0,30)+': '+hex(fg)+' on '+hex(bg)+' = '+ratio.toFixed(2)+':1 (needs '+floor+':1)');
    };
    // a page that paints its own reading surfaces or text colour does not show text in the bare body pair
    const ownSurface = R.some(r => !/^\s*(html|body|:root)\s*$/i.test(r.sel) && !PSEUDO.test(r.sel)
      && /(^|[\s,>.#-])(main|article|section|p|\.?container|wrapper|content|post|entry|card|page|layout|blog|outer|inner|panel|text)\b/i.test(r.sel)
      && /(?:^|;|\s)(color|background(?:-color)?)\s*:/i.test(r.body));
    R.forEach((r, i) => {
      if (parts(r.sel).length !== 1 || PSEUDO.test(r.sel)) return;
      const k = compound(r.sel); if (!k) return;
      if (!k.cls.length && /^(html|body)$/.test(k.tag)) { if (c.isFullDoc && ownSurface) return; check(r.sel, r.body); return; }
      if (!c.isFullDoc && !els.length) { check(r.sel, r.body); return; }      // bare CSS snippet: nothing to match against
      if (els.some(e => e.text && !e.hidden && matches(k, e) && !overridden(k, i, e))) check(r.sel, r.body);
    });
    for (const e of els) if (e.style && e.text && !e.hidden) check('inline style', e.style);
    return ev.length ? {evidence:[...new Set(ev)].slice(0,4)} : null; } },

{ code:'A65', id:'ghost-card', name:'Ghost Card',
  fix:'Pick one edge: a visible border or a real shadow. A faint line plus a wide blur is two half-decisions.',
  test(c){
    // v1.2 of this entry: a resting CARD that holds content. Floating layers (menus, popovers, dialogs, lightboxes, cookie banners,
    // bottom sheets, fixed docks), form controls, and image/screenshot frames may legitimately carry both edges and are not counted.
    const ev=[];
    const SKIP = /pop|menu|dropdown|tooltip|modal|dialog|toast|overlay|sheet|command|combobox|listbox|select|cookie|consent|banner|lightbox|\blb-|drawer|dock|rail|search|input|field|btn|button|screenshot|screen-|image|img|photo|picture|icon|logo|avatar|thumb|figure|media|video|placeholder/i;
        // ---- b2 local helper: a light element tree (tag, classes, id, attrs, ancestors, visible text length) ----
    const T = c._b2tree || (c._b2tree = (html => {
      const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
      const root = { tag:'#root', cls:[], attrs:'', parent:null, text:0, kids:[] }, list = []; let cur = root;
      const re = /<(\/?)([a-z][\w-]*)\b([^<>]*)>|([^<]+)/gi; let m;
      while ((m = re.exec(html))) {
        if (m[4] !== undefined) { cur.text += m[4].replace(/&[#\w]+;/g,'x').replace(/\s+/g,'').length; continue; }
        const tag = m[2].toLowerCase();
        if (m[1]) { let n = cur; while (n !== root && n.tag !== tag) n = n.parent; if (n === root) continue;
          while (cur !== n) { cur.parent.text += cur.text; cur = cur.parent; } cur.parent.text += cur.text; cur = cur.parent; continue; }
        const a = m[3];
        const node = { tag, attrs:a, parent:cur, text:0, kids:[],
          cls: ((/\bclass\s*=\s*["']([^"']*)["']/i.exec(a)||[])[1]||'').split(/\s+/).filter(Boolean),
          id: (/\bid\s*=\s*["']([^"']*)["']/i.exec(a)||[])[1] || null,
          style: (/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(a)||[]).slice(1).find(x=>x!==undefined) || '' };
        cur.kids.push(node); list.push(node);
        if (!VOID.test(tag) && !/\/\s*$/.test(a) && !/^(script|style)$/.test(tag)) cur = node;
      }
      while (cur !== root) { cur.parent.text += cur.text; cur = cur.parent; }
      const byCls = new Map(); for (const n of list) for (const k of n.cls) { if (!byCls.has(k)) byCls.set(k, []); byCls.get(k).push(n); }
      return { root, list, byCls };
    })(c.html));
    // elements matching the last compound of one selector part (".a .b.c", "main.app", "#x")
    const matchEls = part => {
      const last = part.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g,'').replace(/::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g,'').replace(/\[[^\]]*\]/g,'').trim().split(/\s*[\s>+~]\s*/).pop() || '';
      const tag = ((/^[a-z][\w-]*/i.exec(last)||[])[0]||'').toLowerCase();
      const cs = all(/\.((?:\\.|[\w-])+)/g, last).map(x => x[1].replace(/\\(.)/g,'$1'));
      const id = (/#((?:\\.|[\w-])+)/.exec(last)||[])[1];
      const pool = cs.length ? (T.byCls.get(cs[0]) || []) : T.list;
      if (!cs.length && !id && !tag) return [];
      return pool.filter(n => (!tag || n.tag === tag) && cs.every(k => n.cls.includes(k)) && (!id || n.id === id));
    };
    const ancestors = n => { const out = []; for (let p = n.parent; p && p.tag !== '#root'; p = p.parent) out.push(p); return out; };
    const FLOAT = /position\s*:\s*(fixed|sticky)|translate[XY]?\(\s*-?100%|(?:^|;|\s)opacity\s*:\s*0\s*(?:;|$)|visibility\s*:\s*hidden/i;
    const imgOnly = n => n.text < 8 && (/^(img|picture|video|canvas|svg|figure|iframe)$/.test(n.tag) || n.kids.length && n.kids.every(k => /^(img|picture|video|source|canvas|svg|iframe)$/.test(k.tag) || imgOnly(k)));
    // classes and ids the page's CSS pins in place (position: fixed) — anything inside them is a floating layer
    const pinned = new Set(); for (const r of rules(c.css)) if (/position\s*:\s*fixed/i.test(r.body)) for (const p of r.sel.split(',')) { const last = p.trim().split(/[\s>+~]+/).pop(); const m = /^[a-z]*([.#])((?:\\.|[\w-])+)$/i.exec(last.replace(/:[\w-]+(\([^)]*\))?/g,'')); if (m) pinned.add(m[1]+m[2]); }
    const isPinned = p => (p.id && pinned.has('#'+p.id)) || p.cls.some(k => pinned.has('.'+k));
    // r3 structure checks
    // screenshot-style frames named as such (word-bounded so Framer's "framer-" classes do not match)
    const FRAMEISH = /(?:^|[^a-z])(?:frame|preview|window|viewer|mock|mockup|browser|terminal)s?(?![a-z])/i;
    const desc = (n, out = []) => { for (const k of n.kids) { out.push(k); desc(k, out); } return out; };
    // an app/browser window: three empty sibling leaves (traffic-light dots) near the top
    // traffic lights: three empty leaves, alike except for their colour (skeleton bars of different widths are not dots)
    const look = x => x.tag + '|' + x.cls.filter(k => !/^(?:[\w-]+:)?bg-/.test(k)).sort().join(' ') + '|' + x.style.replace(/background(?:-color)?\s*:[^;]*;?/gi, '').replace(/\s+/g, '');
    const dotLeaf = (x, first) => !x.kids.length && x.text === 0 && look(x) === look(first) && !/^(img|svg|br|hr|input|source)$/.test(x.tag);
    const windowChrome = n => desc(n).slice(0, 14).some(k => k.kids.length >= 3 && !/^(svg|g|defs|mask|clippath|symbol|pattern|select|ul|ol)$/i.test(k.tag) && k.kids.slice(0, 3).every(x => dotLeaf(x, k.kids[0])) && !(k.kids[3] && dotLeaf(k.kids[3], k.kids[0])));
    // overlapping illustration stack: siblings placed in the same explicit grid cell
    const gridArea = x => (/grid-area\s*:\s*([^;]+)/i.exec(x.style) || [])[1];
    const stacked = n => { const g = gridArea(n); return !!g && !!n.parent && n.parent.kids.some(k => k !== n && gridArea(k) === g); };
    // a control bar: holds a select/input/button and little else (install-command pill with OS dropdown + copy button)
    const controlBar = n => desc(n).some(k => /^(select|input|button|textarea)$/.test(k.tag)) && n.text < 80 && !desc(n).some(k => /^(p|h[1-6]|li)$/.test(k.tag) && k.text >= 20);
    // placed like a diagram node or an overlapping illustration stack: absolutely positioned
    const placed = p => /position\s*:\s*absolute/i.test(p.style) || p.cls.some(k => absCls.has(k)) || / absolute /.test(' '+p.cls.join(' ')+' ');
    const absCls = new Set(); for (const r of rules(c.css)) if (/position\s*:\s*absolute/i.test(r.body) && !/:hover|::/.test(r.sel)) for (const p of r.sel.split(',')) { const m = /\.((?:\\.|[\w-])+)$/.exec(p.trim()); if (m) absCls.add(m[1]); }
    const isCard = n => {
      if (/^(img|picture|figure|video|canvas|iframe|input|button|select|textarea|a|span|svg)$/.test(n.tag) && !(n.tag === 'a' && n.text >= 20)) return false;
      if (imgOnly(n) || n.text < 8) return false;
      if (FRAMEISH.test(n.cls.join(' ') + ' ' + (n.id||'')) || windowChrome(n) || controlBar(n) || placed(n) || stacked(n)) return false;
      const chain = [n, ...ancestors(n)];
      for (const p of chain) {
        if (/\brole\s*=\s*["'](?:listbox|dialog|menu|tooltip|alertdialog)/i.test(p.attrs) || /^(dialog|figure)$/.test(p.tag)) return false;
        const k = ' '+p.cls.join(' ')+' ';
        if (p.tag === 'nav' || /\brole\s*=\s*["']navigation/i.test(p.attrs) || isPinned(p) || / top-full /.test(k)) return false;
        if (FLOAT.test(p.style) || / fixed | invisible /.test(k) || / opacity-0 /.test(k) && / pointer-events-none /.test(k)) return false;
        if (p.parent && p.parent.kids.some(k => /^(canvas|video|iframe)$/.test(k.tag)) && p === n) return false;   // overlay on live media
        if (p !== n && /lightbox|modal|cookie|consent|popover|dropdown|placeholder/i.test(p.cls.join(' ') + ' ' + (p.id||''))) return false;
      }
      return true;
    };
    // a barely-visible hairline: 0.5-1px solid at alpha <= 0.15, or an opaque near-white grey (#eee, rgb(230,230,230))
    const hairBorder = body => { const m = /(?:^|;|\s)border\s*:\s*(?:0\.5|1)px\s+solid\s+(rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}\b)/i.exec(body); if (!m) return false;
      const v = m[1]; let a = null;
      const fn = /^(?:rgba?|hsla?)\(([^)]*)\)$/i.exec(v);
      if (fn) { const p = fn[1].split(/[\s,/]+/).filter(Boolean); if (p.length >= 4) a = /%$/.test(p[3]) ? parseFloat(p[3])/100 : parseFloat(p[3]); }
      else if (/^#[0-9a-f]{8}$/i.test(v)) a = parseInt(v.slice(7), 16)/255;
      else if (/^#[0-9a-f]{4}$/i.test(v)) a = parseInt(v[4]+v[4], 16)/255;
      if (a !== null) return a <= 0.15;
      return /^#(?:e[0-9a-f]|f[0-9a-f]){3}$|^#[ef][0-9a-f][ef][0-9a-f][ef][0-9a-f]$|^#[ef]{3}$/i.test(v) || /^rgb\(\s*2[2-5]\d\s*,\s*2[2-5]\d\s*,\s*2[2-5]\d\s*\)$/i.test(v); };
    // a strong accent edge (2px+ solid side border that is not itself faint) already defines the card
    const accentEdge = body => all(/(?:^|;|\s)border-(?:left|top|right|bottom)\s*:\s*([2-9]|\d{2,})px\s+solid\s+([^;]+)/gi, body).some(m => !/transparent|rgba?\([^)]*[,/]\s*0?\.[0-1]\d*\s*\)/i.test(m[2]));
    // widest blur among the non-inset shadow layers (offset-x offset-y blur [spread], colour first or last)
    // r3: the blur that shows (a negative spread tucks it under the box); a hard offset layer (14px 14px 0) is a solid
    // edge of its own, so a rule carrying one is a deliberate edge, not a ghost
    const bigShadow = body => { const d = /box-shadow\s*:\s*([^;]+)/i.exec(body); if (!d) return null; let mx = 0;
      for (const L of d[1].split(/,(?![^(]*\))/)) { if (/inset/i.test(L)) continue;
        const n = all(/(?:^|\s)(-?[\d.]+)(px|rem)?(?=\s|$)/g, L.replace(/(?:rgba?|hsla?)\((?:[^()]|\([^()]*\))*\)|#[0-9a-f]{3,8}\b/gi,' ')).map(m => m[2]==='rem' ? +m[1]*16 : +m[1]);
        if (n.length >= 3 && n[2] === 0 && (Math.abs(n[0]) >= 2 || Math.abs(n[1]) >= 2)) return null;
        if (n.length >= 3 && n[2] >= 24 && n[2] + 2*Math.min(0, n[3] || 0) >= 16) mx = Math.max(mx, n[2]); }
      return mx >= 24 ? Math.round(mx) : null; };
    for (const r of rules(c.css)) {
      if (r.sel === '[inline-style]' || SKIP.test(r.sel) || /::/.test(r.sel)) continue;
      if (FLOAT.test(r.body) || !hairBorder(r.body) || accentEdge(r.body) || /position\s*:\s*absolute/i.test(r.body)) continue;
      const blur = bigShadow(r.body); if (!blur) continue;
      if (c.isFullDoc) { if (!r.sel.split(',').flatMap(matchEls).some(isCard)) continue; }
      else { const els = r.sel.split(',').flatMap(matchEls); if (els.length && !els.some(isCard)) continue; }
      ev.push(r.sel.trim().slice(0,30)+': 1px faint border + '+blur+'px shadow blur');
    }
    for (const n of T.list) {
      if (!/box-shadow/i.test(n.style) || SKIP.test(n.cls.join(' '))) continue;
      const blur = hairBorder(n.style) && !FLOAT.test(n.style) && !accentEdge(n.style) && bigShadow(n.style);
      if (blur && isCard(n)) ev.push('<'+n.tag+'> inline style: 1px faint border + '+blur+'px shadow blur');
    }
    // Tailwind: the bare utilities at rest (hover:shadow-xl is a state, not the card's edge)
    const tw = T.list.filter(n => { const k = ' '+n.cls.join(' ')+' ';
      return / border /.test(k) && / border-(?:gray|slate|zinc|neutral|stone)-(?:100|200)(?:\/\d+)? /.test(k) && / shadow-(?:xl|2xl) /.test(k) && / rounded(?:-[\w]+)? /.test(k)
        && !SKIP.test(k.replace(/ (?:border|shadow|rounded|bg|text|p[xytblr]?|m[xytblr]?)-[\w\/.-]+/g,' ')) && isCard(n); });
    if (tw.length >= (c.isFullDoc ? 1 : 2)) ev.push(tw.length+' card'+(tw.length>1?'s':'')+' with border-gray-100/200 and shadow-xl');
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A66', id:'animating-layout-properties', name:'Animating Layout Properties',
  fix:'Animate transform and opacity. Fake size changes with scale; move things with translate.',
  test(c){
    // v1.2: on whole pages, judge rule by rule. A rule keyed on an attribute the markup never carries
    // (library CSS such as [data-sonner-toast]) is dead; a skip link sliding in from off-screen on keyboard
    // focus is accessibility plumbing, not layout animation; archive interstitials are not the site.
    const ev=[];
    const LAYOUT = /^(width|height|top|left|right|bottom|margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|max-height|min-height|max-width|min-width)$/i;
    const badOf = v => v.split(',').map(s=>s.trim().split(/\s+/)[0]).filter(p => LAYOUT.test(p));
    if (!c.isFullDoc) {
      for (const m of all(/transition(?:-property)?\s*:\s*([^;{}]*)/gi, c.css)) { const bad = badOf(m[1]); if (bad.length) ev.push('transition on '+bad.join(', ')); }
    } else {
      if (/Got an HTTP \d{3} response at crawl time/i.test(c.visible || '')) return null;
      const attrLive = sel => all(/\[\s*([\w:-]+)/g, sel).every(m => new RegExp('\\s' + m[1].replace(/[-:]/g, '\\$&') + '(?:\\s*=|[\\s/>])', 'i').test(c.html));
      const liveSel = sel => sel === '[inline-style]' || sel.split(',').some(p => attrLive(p));
      for (const r of rules(c.css)) {
        if (!liveSel(r.sel)) continue;
        for (const m of all(/transition(?:-property)?\s*:\s*([^;{}]*)/gi, r.body)) {
          let bad = badOf(m[1]);
          // off-screen element revealed by sliding its offset in (skip links): top:-40px; transition: top
          if (/skip/i.test(r.sel)) bad = bad.filter(p => !/^(top|left|right|bottom)$/i.test(p));
          bad = bad.filter(p => !(/^(top|left|right|bottom)$/i.test(p) && new RegExp('(?:^|;|\\s)' + p + '\\s*:\\s*-\\d', 'i').test(r.body)));
          if (bad.length) ev.push('transition on '+bad.join(', ') + (r.sel === '[inline-style]' ? ' (inline style)' : ''));
        }
      }
    }
    const liveAnims = new Set();
    for (const r of rules(c.css)) { if (c.isFullDoc && !(r.sel === '[inline-style]' || r.sel.split(',').some(p => all(/\[\s*([\w:-]+)/g, p).every(m => c.html.includes(m[1]))))) continue;
      for (const m of all(/animation(?:-name)?\s*:\s*([^;]+)/gi, r.body)) for (const w of m[1].split(/[\s,]+/)) liveAnims.add(w); }
    for (const m of all(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?\})\s*\}/gi, c.css))
      if ((!c.isFullDoc || liveAnims.has(m[1])) && /\{[^}]*\b(width|height|top|left|margin-\w+|padding-\w+)\s*:/i.test(m[2])) ev.push('@keyframes '+m[1]+' animates a layout property');
    if (/\btransition-\[(?:width|height|margin|padding)/.test(c.classes)) ev.push('tailwind transition on a layout property');
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A69', id:'broken-or-placeholder-image', name:'Broken Or Placeholder Image',
  fix:'Ship the real asset, or remove the image. Check every img resolves before release.',
  test(c){
    // v1.3: an empty src is only a broken image when nothing else will fill it and someone can see it.
    // Skipped: lazy-loaders (any data-*src attribute on the img or an ancestor, data-image-info, srcset), images
    // inside hidden containers (inline display:none, visibility:hidden, opacity:0), and JS-filled viewer templates
    // (lightbox, modal, overlay, popup, zoom, enlarged preview). The src attribute must be exactly "src" with its
    // own matching quotes: Vue/Angular bindings (:src="'/i/' + x") are expressions, not URLs.
    // A placeholder-service image is intended on that service's own site and on CSS-framework docs or demos.
    const ev=[];
    const VIEWER = /lightbox|modal|overlay|popup|dialog|zoom|enlarge|viewer|preview|tobi|\blb-|fancybox|photoswipe|pswp|glightbox|mfp-/i;
    const HIDE = /display\s*:\s*none|visibility\s*:\s*hidden|(?:^|;|\s)opacity\s*:\s*0(?:\.0+)?\s*(?:;|$)/i;
    const LOADER = /(?:^|\s)data-[\w-]*src[\w-]*\s*=|(?:^|\s)data-(?:lazy|original|url|image-info|bg)\s*=/i;
    const attr = (a, n) => { const m = new RegExp('(?:^|\\s)' + n + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i').exec(' ' + a); return m ? (m[1] ?? m[2]) : null; };
    const shut = a => { const st = attr(a, 'style') || '';
      const named = (attr(a, 'class') || '') + ' ' + (attr(a, 'id') || '');
      return HIDE.test(st) || VIEWER.test(named); };
    const SERVICE = /(via\.placeholder\.com|placeholder\.com|placehold\.(?:co|it)|picsum\.photos|placekitten\.com|dummyimage\.com|fakeimg\.pl|loremflickr\.com|source\.unsplash\.com\/random)/i;
    // the page's own host (canonical or og:url) and whether it presents itself as framework docs or a demo
    const own = ((/<link\b[^>]*rel=["']canonical["'][^>]*href=["']https?:\/\/([^\/"']+)/i.exec(c.html) || /<meta\b[^>]*og:url["'][^>]*content=["']https?:\/\/([^\/"']+)/i.exec(c.html) || [])[1] || '').toLowerCase().replace(/^www\./, '');
    const title = ((/<title[^>]*>([^<]*)/i.exec(c.html) || [])[1] || '');
    const demo = c.isFullDoc && /\b(css|docs|documentation|demo|examples?|playground|starter)\b/i.test(title);
    const stack = [];
    for (const m of all(/<(\/?)([a-z][\w-]*)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi, c.html)) {
      const tag = m[2].toLowerCase(), a = m[3];
      if (m[1]) { for (let j = stack.length - 1; j >= 0; j--) if (stack[j].tag === tag) { stack.length = j; break; } continue; }
      const up = stack.length ? stack[stack.length-1] : null;
      if (tag !== 'img') { if (!VOIDTAG.test(tag) && !/\/\s*$/.test(a)) stack.push({ tag, shut: (up && up.shut) || shut(a), loader: LOADER.test(a) ? 3 : up ? up.loader - 1 : 0 }); continue; }
      const src = attr(a, 'src');
      if (src === null) continue;   // lazy loaders fill src from data-src; absence alone proves nothing
      const svc = SERVICE.exec(src);
      if (svc) { if (!demo && !(own && svc[1].toLowerCase().startsWith(own))) ev.push('placeholder service: '+svc[1]); continue; }
      if (src.trim() && src !== '#') continue;
      if (LOADER.test(a) || /(?:^|\s)srcset\s*=\s*["'][^"'\s]/i.test(a) || (up && up.loader > 0)) continue;   // filled by a loader (on the img or its wrapper)
      if (shut(a) || (up && up.shut)) continue;
      ev.push('<img src="'+src+'">');
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A71', id:'lines-too-long-to-read', name:'Lines Too Long To Read',
  fix:'Cap running text at roughly 45–75 characters: max-width: 65ch on the text, not the page.',
  test(c){
    const ev=[];
    for (const r of rules(c.css)) {
      if (!/(^|[\s,.])(p|article|prose|content|body-copy|text)\b/i.test(r.sel)) continue;
      const w = /max-width\s*:\s*(\d+)ch/i.exec(r.body);
      if (w && +w[1] > 90) ev.push(r.sel.trim().slice(0,30)+' { max-width: '+w[1]+'ch }');
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,2)} : null; } },

{ code:'A9', id:'the-italic-serif-wink', name:'The Italic Serif Wink',
  fix:'Give the serif a real job across the page (all headlines or all body) or drop it; let the words carry the emphasis, not a one-word font swap.',
  test(c){
    const D = (c => {
      // d1 helper: tiny DOM tree + per-element CSS lookup (class/tag selectors only, no states). Cached on ctx.
      if (c._d1) return c._d1;
      const html = c.html, nodes = [], root = { tag:'#root', a:'', cls:[], kids:[], parent:null, s:0, e:html.length };
      const stack = [root];
      for (const m of all(/<(\/?)([a-z][\w-]*)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi, html)) {
        const tag = m[2].toLowerCase();
        if (m[1]) { for (let j = stack.length - 1; j > 0; j--) if (stack[j].tag === tag) { for (let k = stack.length - 1; k >= j; k--) stack[k].e = m.index + m[0].length, stack[k].ie = stack[k].ie || m.index; stack.length = j; break; } continue; }
        const up = stack[stack.length - 1];
        const cm = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[3]);
        const n = { tag, a:m[3], cls: cm ? (cm[1] || cm[2] || '').split(/\s+/).filter(Boolean) : [], kids:[], parent:up, s:m.index, is:m.index + m[0].length, e:html.length };
        up.kids.push(n); nodes.push(n);
        if (/^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/.test(tag) || /\/\s*$/.test(m[3])) { n.e = n.is; n.ie = n.is; continue; }
        stack.push(n);
      }
      for (const n of nodes) if (!n.ie) n.ie = n.e;
      const ent = s => s.replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&[a-z]+;|&#\d+;/gi, ' ');
      const inner = n => html.slice(n.is, n.ie);
      const text = n => ent(inner(n).replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      const words = s => s.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
      // bodies of rules that only apply below a max-width breakpoint (mobile overrides): ignored for a 1280px view
      const mobile = new Set();
      { const src = String(c.css).replace(/\/\*[\s\S]*?\*\//g, ''); const st = []; let last = 0;
        for (let i = 0; i < src.length; i++) { const ch = src[i];
          if (ch === '{') { st.push(src.slice(last, i).split(/[;}]/).pop().trim()); last = i + 1; }
          else if (ch === '}') { const pre = st.pop() || ''; if (!/^@/.test(pre) && st.some(q => /^@media[^{]*max-width\s*:\s*(\d+)/i.test(q) && +/max-width\s*:\s*(\d+)/i.exec(q)[1] < 1200 && !/min-width/i.test(q))) mobile.add(src.slice(last, i).trim()); last = i + 1; } } }
      // CSS index: last compound of each selector -> {tag, classes, id}
      const un = s => s.replace(/\\([^0-9a-f])/gi, '$1');
      const idx = [];
      for (const r of rules(c.css)) for (const p of r.sel.split(/(?<!\\),/)) {
        const last = p.trim().split(/\s*(?<!\\)[\s>+~]\s*/).pop();
        if (!last || /:(?:hover|focus|active|visited|focus-within|focus-visible|checked|disabled|placeholder|first-letter|first-line|selection|before|after|marker|-webkit|-moz)/i.test(last)) continue;
        const bare = last.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, '').replace(/::?[\w-]+(?:\([^)]*\))?/g, '').replace(/\[[^\]]*\]/g, '');
        const tag = ((/^[a-z][\w-]*/i.exec(bare) || [''])[0]).toLowerCase();
        const cs = all(/\.((?:\\.|[\w-])+)/g, bare).map(x => un(x[1]));
        const id = (/#((?:\\.|[\w-])+)/.exec(bare) || [])[1];
        if (!tag && !cs.length && !id) continue;
        if (mobile.has(r.body.trim())) continue;
        idx.push({ tag, cs, id: id ? un(id) : null, body: r.body, ctx: p.trim() !== last });
      }
      const vars = {};
      for (const r of rules(c.css)) for (const v of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) if (!vars[v[1]]) vars[v[1]] = v[2].trim();
      const resolve = v => { for (let i = 0; i < 4 && /var\(/.test(v); i++) v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_, k, d) => vars[k] || d || ''); return v; };
      const byTag = {}, byCls = {}, byId = {};
      for (const x of idx) { const k = x.cs[0]; if (k) (byCls[k] = byCls[k] || []).push(x); else if (x.id) (byId[x.id] = byId[x.id] || []).push(x); else (byTag[x.tag] = byTag[x.tag] || []).push(x); }
      const idOf = n => (/\bid\s*=\s*["']([^"']*)["']/i.exec(n.a) || [])[1];
      const bodies = n => {
        if (n._b !== undefined) return n._b;
        const set = new Set(n.cls), out = [], id = idOf(n);
        for (const x of (byTag[n.tag] || [])) out.push(x.body);
        for (const k of n.cls) for (const x of (byCls[k] || [])) if ((!x.tag || x.tag === n.tag) && x.cs.every(q => set.has(q)) && (!x.id || x.id === id)) out.push(x.body);
        if (id) for (const x of (byId[id] || [])) if (!x.tag || x.tag === n.tag) out.push(x.body);
        const st = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(n.a); if (st) out.push(ent(st[1] || st[2] || ''));
        return (n._b = out.join(';'));
      };
      const prop = (n, p) => { let v = null; for (const m of all(new RegExp('(?:^|[;{\\s])' + p + '\\s*:\\s*([^;}]+)', 'gi'), bodies(n))) v = m[1].trim(); return v === null ? null : resolve(v).replace(/\s*!important/, ''); };
      const inh = (n, p, f) => { for (let x = n; x && x.tag !== '#root'; x = x.parent) { const tw = f && f(x); if (tw) return tw; const v = prop(x, p); if (v && !/^(inherit|unset|initial)$/.test(v)) return v; }
        for (const t of ['body', 'html']) { const v = prop({ tag:t, cls:[], a:'', kids:[] }, p); if (v && !/^(inherit|unset|initial)$/.test(v)) return v; } return null; };
      const has = (n, re) => n.cls.some(k => re.test(k));
      const desc = (n, f, out = []) => { for (const k of n.kids) { if (f(k)) out.push(k); desc(k, f, out); } return out; };
      const elKids = n => n.kids;
      const prevEl = n => { const s = n.parent ? n.parent.kids : []; const i = s.indexOf(n); return i > 0 ? s[i - 1] : null; };
      const px = v => { if (!v) return null; let best = null; for (const m of all(/(-?[\d.]+)(px|rem|em|%)?/g, v)) { const u = m[2] || ''; const x = u === 'px' ? +m[1] : (u === 'rem' || u === 'em') ? +m[1] * 16 : null; if (x !== null && (best === null || x > best)) best = x; } return best; };
      const body = nodes.find(n => n.tag === 'body') || root;
      const aos = /\[data-aos/.test(c.css);
      // hidden at load: stripped/aria-hidden markup, or faded to opacity 0 (scroll-reveal that never runs without JS)
      const hid1 = x => { if (x._h !== undefined) return x._h; return (x._h = /data-sp-hidden|aria-hidden\s*=\s*["']true/i.test(x.a) || /^(script|template|noscript|style)$/.test(x.tag)
        || x.cls.includes('opacity-0') || (aos && /\sdata-aos\s*=/i.test(' ' + x.a) && !x.cls.includes('aos-animate')) || /^0(?:\.0+)?$/.test((prop(x, 'opacity') || '').trim()) || /^(?:none)$/.test((prop(x, 'display') || '').trim()) && !x.cls.some(k => /^(?:sm|md|lg|xl|2xl):(?:block|flex|grid|inline|inline-block|inline-flex|table)$/.test(k))); };
      const hidden = n => { for (let x = n; x && x.tag !== '#root'; x = x.parent) if (hid1(x)) return true; return false; };
      return (c._d1 = { html, nodes, root, body, inner, text, words, bodies, prop, inh, has, desc, elKids, prevEl, px, hidden, resolve });
    })(c);
    const SERIF = /serif|playfair|fraunces|newsreader|lora\b|cormorant|garamond|baskerville|georgia|times|crimson|spectral|merriweather|literata|bodoni|didot|canela|sectra|tiempos|editorial|gloock|caslon|cardo|libre_?\s?caslon|young_?\s?serif|instrument_?\s?serif|domine|alegreya(?!\s?sans)|noto_?\s?serif|ibm_?\s?plex_?\s?serif|gelasio|prata|eb_?\s?garamond|petrona|bitter|zilla|roboto_?\s?slab|source_?\s?serif|pt_?\s?serif|dm_?\s?serif|reckless|lyon|ogg\b|gt_?\s?super|signifier/i;
    const famOf = n => D.inh(n, 'font-family', x => x.cls.includes('font-serif') ? 'serif' : x.cls.some(k => /^font-(sans|mono)$/.test(k)) ? 'sans-serif' : null);
    const first = f => f ? f.split(',')[0].replace(/["']/g, '').trim() : '';
    const isSerif = f => { if (!f) return false; const a = first(f); if (/sans|mono|grotesk|grotesque|inter\b|system-ui|-apple-system/i.test(a)) return false; return SERIF.test(a) || (/^serif$/i.test(a)); };
    const italic = n => { const fs = D.prop(n, 'font-style'); if (fs) return /italic|oblique/i.test(fs); return n.cls.includes('italic') || ((n.tag === 'em' || n.tag === 'i') && !n.cls.includes('not-italic')); };
    const ev = [];
    const h1s = D.nodes.filter(n => n.tag === 'h1' && !D.hidden(n)).slice(0, 2);
    for (const h of h1s) {
      const hf = famOf(h);
      if (!hf || isSerif(hf)) continue;                       // heading must be a sans (unset = browser serif)
      const ht = D.text(h); if (D.words(ht) < 2) continue;
      const winks = D.desc(h, n => /^(em|i|span|strong|b|mark|u)$/.test(n.tag)).filter(n => {
        const t = D.text(n); if (!t || t.length >= ht.length * 0.7) return false;
        if (!italic(n)) return false;
        const f = famOf(n); return f && isSerif(f) && f !== hf;
      });
      // one wink: the outermost matched span(s) covering a single word or short phrase
      const outer = winks.filter(n => !winks.some(o => o !== n && o.s <= n.s && o.e >= n.e));
      if (outer.length !== 1) continue;
      const w = outer[0], wt = D.text(w);
      if (D.words(wt) > 4) continue;
      ev.push('h1 "' + ht.slice(0, 50) + '": <' + w.tag + '> "' + wt.slice(0, 30) + '" in italic ' + first(famOf(w)).slice(0, 30) + ' vs heading ' + first(hf).slice(0, 30));
    }
    return ev.length ? {evidence:ev.slice(0,2)} : null; } },

{ code:'A26', id:'pill-above-the-headline', name:'Pill Above The Headline',
  fix:'Use a badge only when there is real news with a link; otherwise remove it and let the headline own the top of the page.',
  test(c){
    const D = (c => {
      // d1 helper: tiny DOM tree + per-element CSS lookup (class/tag selectors only, no states). Cached on ctx.
      if (c._d1) return c._d1;
      const html = c.html, nodes = [], root = { tag:'#root', a:'', cls:[], kids:[], parent:null, s:0, e:html.length };
      const stack = [root];
      for (const m of all(/<(\/?)([a-z][\w-]*)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi, html)) {
        const tag = m[2].toLowerCase();
        if (m[1]) { for (let j = stack.length - 1; j > 0; j--) if (stack[j].tag === tag) { for (let k = stack.length - 1; k >= j; k--) stack[k].e = m.index + m[0].length, stack[k].ie = stack[k].ie || m.index; stack.length = j; break; } continue; }
        const up = stack[stack.length - 1];
        const cm = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[3]);
        const n = { tag, a:m[3], cls: cm ? (cm[1] || cm[2] || '').split(/\s+/).filter(Boolean) : [], kids:[], parent:up, s:m.index, is:m.index + m[0].length, e:html.length };
        up.kids.push(n); nodes.push(n);
        if (/^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/.test(tag) || /\/\s*$/.test(m[3])) { n.e = n.is; n.ie = n.is; continue; }
        stack.push(n);
      }
      for (const n of nodes) if (!n.ie) n.ie = n.e;
      const ent = s => s.replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&[a-z]+;|&#\d+;/gi, ' ');
      const inner = n => html.slice(n.is, n.ie);
      const text = n => ent(inner(n).replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      const words = s => s.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
      // bodies of rules that only apply below a max-width breakpoint (mobile overrides): ignored for a 1280px view
      const mobile = new Set();
      { const src = String(c.css).replace(/\/\*[\s\S]*?\*\//g, ''); const st = []; let last = 0;
        for (let i = 0; i < src.length; i++) { const ch = src[i];
          if (ch === '{') { st.push(src.slice(last, i).split(/[;}]/).pop().trim()); last = i + 1; }
          else if (ch === '}') { const pre = st.pop() || ''; if (!/^@/.test(pre) && st.some(q => /^@media[^{]*max-width\s*:\s*(\d+)/i.test(q) && +/max-width\s*:\s*(\d+)/i.exec(q)[1] < 1200 && !/min-width/i.test(q))) mobile.add(src.slice(last, i).trim()); last = i + 1; } } }
      // CSS index: last compound of each selector -> {tag, classes, id}
      const un = s => s.replace(/\\([^0-9a-f])/gi, '$1');
      const idx = [];
      for (const r of rules(c.css)) for (const p of r.sel.split(/(?<!\\),/)) {
        const last = p.trim().split(/\s*(?<!\\)[\s>+~]\s*/).pop();
        if (!last || /:(?:hover|focus|active|visited|focus-within|focus-visible|checked|disabled|placeholder|first-letter|first-line|selection|before|after|marker|-webkit|-moz)/i.test(last)) continue;
        const bare = last.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, '').replace(/::?[\w-]+(?:\([^)]*\))?/g, '').replace(/\[[^\]]*\]/g, '');
        const tag = ((/^[a-z][\w-]*/i.exec(bare) || [''])[0]).toLowerCase();
        const cs = all(/\.((?:\\.|[\w-])+)/g, bare).map(x => un(x[1]));
        const id = (/#((?:\\.|[\w-])+)/.exec(bare) || [])[1];
        if (!tag && !cs.length && !id) continue;
        if (mobile.has(r.body.trim())) continue;
        idx.push({ tag, cs, id: id ? un(id) : null, body: r.body, ctx: p.trim() !== last });
      }
      const vars = {};
      for (const r of rules(c.css)) for (const v of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) if (!vars[v[1]]) vars[v[1]] = v[2].trim();
      const resolve = v => { for (let i = 0; i < 4 && /var\(/.test(v); i++) v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_, k, d) => vars[k] || d || ''); return v; };
      const byTag = {}, byCls = {}, byId = {};
      for (const x of idx) { const k = x.cs[0]; if (k) (byCls[k] = byCls[k] || []).push(x); else if (x.id) (byId[x.id] = byId[x.id] || []).push(x); else (byTag[x.tag] = byTag[x.tag] || []).push(x); }
      const idOf = n => (/\bid\s*=\s*["']([^"']*)["']/i.exec(n.a) || [])[1];
      const bodies = n => {
        if (n._b !== undefined) return n._b;
        const set = new Set(n.cls), out = [], id = idOf(n);
        for (const x of (byTag[n.tag] || [])) out.push(x.body);
        for (const k of n.cls) for (const x of (byCls[k] || [])) if ((!x.tag || x.tag === n.tag) && x.cs.every(q => set.has(q)) && (!x.id || x.id === id)) out.push(x.body);
        if (id) for (const x of (byId[id] || [])) if (!x.tag || x.tag === n.tag) out.push(x.body);
        const st = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(n.a); if (st) out.push(ent(st[1] || st[2] || ''));
        return (n._b = out.join(';'));
      };
      const prop = (n, p) => { let v = null; for (const m of all(new RegExp('(?:^|[;{\\s])' + p + '\\s*:\\s*([^;}]+)', 'gi'), bodies(n))) v = m[1].trim(); return v === null ? null : resolve(v).replace(/\s*!important/, ''); };
      const inh = (n, p, f) => { for (let x = n; x && x.tag !== '#root'; x = x.parent) { const tw = f && f(x); if (tw) return tw; const v = prop(x, p); if (v && !/^(inherit|unset|initial)$/.test(v)) return v; }
        for (const t of ['body', 'html']) { const v = prop({ tag:t, cls:[], a:'', kids:[] }, p); if (v && !/^(inherit|unset|initial)$/.test(v)) return v; } return null; };
      const has = (n, re) => n.cls.some(k => re.test(k));
      const desc = (n, f, out = []) => { for (const k of n.kids) { if (f(k)) out.push(k); desc(k, f, out); } return out; };
      const elKids = n => n.kids;
      const prevEl = n => { const s = n.parent ? n.parent.kids : []; const i = s.indexOf(n); return i > 0 ? s[i - 1] : null; };
      const px = v => { if (!v) return null; let best = null; for (const m of all(/(-?[\d.]+)(px|rem|em|%)?/g, v)) { const u = m[2] || ''; const x = u === 'px' ? +m[1] : (u === 'rem' || u === 'em') ? +m[1] * 16 : null; if (x !== null && (best === null || x > best)) best = x; } return best; };
      const body = nodes.find(n => n.tag === 'body') || root;
      const aos = /\[data-aos/.test(c.css);
      // hidden at load: stripped/aria-hidden markup, or faded to opacity 0 (scroll-reveal that never runs without JS)
      const hid1 = x => { if (x._h !== undefined) return x._h; return (x._h = /data-sp-hidden|aria-hidden\s*=\s*["']true/i.test(x.a) || /^(script|template|noscript|style)$/.test(x.tag)
        || x.cls.includes('opacity-0') || (aos && /\sdata-aos\s*=/i.test(' ' + x.a) && !x.cls.includes('aos-animate')) || /^0(?:\.0+)?$/.test((prop(x, 'opacity') || '').trim()) || /^(?:none)$/.test((prop(x, 'display') || '').trim()) && !x.cls.some(k => /^(?:sm|md|lg|xl|2xl):(?:block|flex|grid|inline|inline-block|inline-flex|table)$/.test(k))); };
      const hidden = n => { for (let x = n; x && x.tag !== '#root'; x = x.parent) if (hid1(x)) return true; return false; };
      return (c._d1 = { html, nodes, root, body, inner, text, words, bodies, prop, inh, has, desc, elKids, prevEl, px, hidden, resolve });
    })(c);
    const TW = { xs:12, sm:14, base:16, lg:18, xl:20, '2xl':24, '3xl':30, '4xl':36, '5xl':48 };
    const sizeOf = n => { let tw = null; for (const k of n.cls) { const m = /^(?:[\w-]+:)*text-(xs|sm|base|lg|xl|[2-5]xl)$/.exec(k) || /^(?:[\w-]+:)*text-\[([\d.]+)(px|rem)\]$/.exec(k);
        if (m) { const v = m[2] ? (m[2] === 'px' ? +m[1] : m[1] * 16) : TW[m[1]]; tw = tw === null ? v : Math.max(tw, v); } }
      if (tw !== null) return tw; return D.px(D.prop(n, 'font-size')); };
    const fsz = n => { for (let x = n; x && x.tag !== '#root'; x = x.parent) { const s = sizeOf(x); if (s) return s; if (/^h[1-6]$/.test(x.tag)) return 24; } return 16; };
    const radius = n => { if (!c.isFullDoc && n.cls.some(k => /^(?:[\w-]+:)*rounded-(?:full|\[(?:9999|999|100|50)[\w%]*\])$/.test(k))) return 'rounded-full';
      const r = D.prop(n, 'border-radius'); if (!r) return null;
      if (/infinity/i.test(r)) return n.cls.includes('rounded-full') ? 'rounded-full' : 'border-radius: ' + r.slice(0, 24);
      const m = /([\d.]+(?:e\+?\d+)?)(px|rem|em|%)/i.exec(r); if (!m) return null;
      const v = m[2] === '%' ? 0 : m[2] === 'px' ? +m[1] : m[1] * 16; return v >= 99 ? (n.cls.includes('rounded-full') ? 'rounded-full' : 'border-radius: ' + r.slice(0, 20)) : null; };
    const surface = n => !c.isFullDoc && n.cls.some(k => /^(?:[\w-]+:)*(?:bg-(?!transparent|none|clip|cover|center|no-repeat|fixed|gradient)[\w\[\]#\/.-]+|border(?:-[\w\[\]#\/.-]+)?|ring(?:-[\w\[\]#\/.-]+)?|shadow(?:-[\w\[\]#\/.-]+)?)$/.test(k) && !/^border-(?:0|none|transparent|t|b|l|r|x|y|solid|dashed)$/.test(k))
      || /(?:^|[;{\s])(?:background(?:-color|-image)?\s*:\s*(?!\s*(?:none|transparent|inherit|initial|unset)\s*(?:;|$))|border(?:-width)?\s*:\s*(?!\s*(?:none|0|0px)\s*(?:;|$))\S|box-shadow\s*:\s*(?!\s*none)\S)/i.test(D.bodies(n));
    const pillIn = (n, depth) => {
      if (!n || depth > 3 || /^(img|svg|picture|video|nav|ul|ol|form|input|button|h1|h2|h3|br|hr)$/.test(n.tag) || D.hidden(n) || n.cls.some(k => /nav|menu|logo|brand/i.test(k)) || D.desc(n, x => x.tag === 'a').length > 1) return null;
      const t = D.text(n), w = D.words(t);
      if (!t || w < 1 || w > 6 || t.length > 60) return null;
      const r = radius(n);
      if (r && surface(n) && fsz(n) <= 14.5) return { n, t, r };
      const ks = n.kids.filter(k => k.tag !== 'br');
      if (ks.length === 1) return pillIn(ks[0], depth + 1);
      return null;
    };
    const ev = [];
    const h1 = D.nodes.find(n => n.tag === 'h1' && !D.hidden(n) && D.text(n));
    if (!h1) return null;
    let x = h1, prev = D.prevEl(h1);
    for (let i = 0; !prev && i < 3 && x.parent && x.parent.tag !== '#root' && x.parent.tag !== 'body'; i++) { x = x.parent; prev = D.prevEl(x); }
    const p = pillIn(prev, 0);
    if (p) {
      const cls = p.n.cls.slice(0, 2).join('.');
      ev.push('<' + p.n.tag + (cls ? ' .' + cls : '') + '> "' + p.t.slice(0, 40) + '" (' + p.r + ', ' + fsz(p.n) + 'px text) directly above h1 "' + D.text(h1).slice(0, 40) + '"');
    }
    return ev.length ? {evidence:ev} : null; } },

{ code:'A11', id:'centred-hero-one-button', name:'Centred Hero, One Button',
  fix:'Anchor the hero with a real product surface, screenshot or diagram, and let the text sit beside or over it instead of floating alone in the middle.',
  test(c){
    const D = (c => {
      // d1 helper: tiny DOM tree + per-element CSS lookup (class/tag selectors only, no states). Cached on ctx.
      if (c._d1) return c._d1;
      const html = c.html, nodes = [], root = { tag:'#root', a:'', cls:[], kids:[], parent:null, s:0, e:html.length };
      const stack = [root];
      for (const m of all(/<(\/?)([a-z][\w-]*)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi, html)) {
        const tag = m[2].toLowerCase();
        if (m[1]) { for (let j = stack.length - 1; j > 0; j--) if (stack[j].tag === tag) { for (let k = stack.length - 1; k >= j; k--) stack[k].e = m.index + m[0].length, stack[k].ie = stack[k].ie || m.index; stack.length = j; break; } continue; }
        const up = stack[stack.length - 1];
        const cm = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[3]);
        const n = { tag, a:m[3], cls: cm ? (cm[1] || cm[2] || '').split(/\s+/).filter(Boolean) : [], kids:[], parent:up, s:m.index, is:m.index + m[0].length, e:html.length };
        up.kids.push(n); nodes.push(n);
        if (/^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/.test(tag) || /\/\s*$/.test(m[3])) { n.e = n.is; n.ie = n.is; continue; }
        stack.push(n);
      }
      for (const n of nodes) if (!n.ie) n.ie = n.e;
      const ent = s => s.replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&[a-z]+;|&#\d+;/gi, ' ');
      const inner = n => html.slice(n.is, n.ie);
      const text = n => ent(inner(n).replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      const words = s => s.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
      // bodies of rules that only apply below a max-width breakpoint (mobile overrides): ignored for a 1280px view
      const mobile = new Set();
      { const src = String(c.css).replace(/\/\*[\s\S]*?\*\//g, ''); const st = []; let last = 0;
        for (let i = 0; i < src.length; i++) { const ch = src[i];
          if (ch === '{') { st.push(src.slice(last, i).split(/[;}]/).pop().trim()); last = i + 1; }
          else if (ch === '}') { const pre = st.pop() || ''; if (!/^@/.test(pre) && st.some(q => /^@media[^{]*max-width\s*:\s*(\d+)/i.test(q) && +/max-width\s*:\s*(\d+)/i.exec(q)[1] < 1200 && !/min-width/i.test(q))) mobile.add(src.slice(last, i).trim()); last = i + 1; } } }
      // CSS index: last compound of each selector -> {tag, classes, id}
      const un = s => s.replace(/\\([^0-9a-f])/gi, '$1');
      const idx = [];
      for (const r of rules(c.css)) for (const p of r.sel.split(/(?<!\\),/)) {
        const last = p.trim().split(/\s*(?<!\\)[\s>+~]\s*/).pop();
        if (!last || /:(?:hover|focus|active|visited|focus-within|focus-visible|checked|disabled|placeholder|first-letter|first-line|selection|before|after|marker|-webkit|-moz)/i.test(last)) continue;
        const bare = last.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, '').replace(/::?[\w-]+(?:\([^)]*\))?/g, '').replace(/\[[^\]]*\]/g, '');
        const tag = ((/^[a-z][\w-]*/i.exec(bare) || [''])[0]).toLowerCase();
        const cs = all(/\.((?:\\.|[\w-])+)/g, bare).map(x => un(x[1]));
        const id = (/#((?:\\.|[\w-])+)/.exec(bare) || [])[1];
        if (!tag && !cs.length && !id) continue;
        if (mobile.has(r.body.trim())) continue;
        idx.push({ tag, cs, id: id ? un(id) : null, body: r.body, ctx: p.trim() !== last });
      }
      const vars = {};
      for (const r of rules(c.css)) for (const v of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) if (!vars[v[1]]) vars[v[1]] = v[2].trim();
      const resolve = v => { for (let i = 0; i < 4 && /var\(/.test(v); i++) v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_, k, d) => vars[k] || d || ''); return v; };
      const byTag = {}, byCls = {}, byId = {};
      for (const x of idx) { const k = x.cs[0]; if (k) (byCls[k] = byCls[k] || []).push(x); else if (x.id) (byId[x.id] = byId[x.id] || []).push(x); else (byTag[x.tag] = byTag[x.tag] || []).push(x); }
      const idOf = n => (/\bid\s*=\s*["']([^"']*)["']/i.exec(n.a) || [])[1];
      const bodies = n => {
        if (n._b !== undefined) return n._b;
        const set = new Set(n.cls), out = [], id = idOf(n);
        for (const x of (byTag[n.tag] || [])) out.push(x.body);
        for (const k of n.cls) for (const x of (byCls[k] || [])) if ((!x.tag || x.tag === n.tag) && x.cs.every(q => set.has(q)) && (!x.id || x.id === id)) out.push(x.body);
        if (id) for (const x of (byId[id] || [])) if (!x.tag || x.tag === n.tag) out.push(x.body);
        const st = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(n.a); if (st) out.push(ent(st[1] || st[2] || ''));
        return (n._b = out.join(';'));
      };
      const prop = (n, p) => { let v = null; for (const m of all(new RegExp('(?:^|[;{\\s])' + p + '\\s*:\\s*([^;}]+)', 'gi'), bodies(n))) v = m[1].trim(); return v === null ? null : resolve(v).replace(/\s*!important/, ''); };
      const inh = (n, p, f) => { for (let x = n; x && x.tag !== '#root'; x = x.parent) { const tw = f && f(x); if (tw) return tw; const v = prop(x, p); if (v && !/^(inherit|unset|initial)$/.test(v)) return v; }
        for (const t of ['body', 'html']) { const v = prop({ tag:t, cls:[], a:'', kids:[] }, p); if (v && !/^(inherit|unset|initial)$/.test(v)) return v; } return null; };
      const has = (n, re) => n.cls.some(k => re.test(k));
      const desc = (n, f, out = []) => { for (const k of n.kids) { if (f(k)) out.push(k); desc(k, f, out); } return out; };
      const elKids = n => n.kids;
      const prevEl = n => { const s = n.parent ? n.parent.kids : []; const i = s.indexOf(n); return i > 0 ? s[i - 1] : null; };
      const px = v => { if (!v) return null; let best = null; for (const m of all(/(-?[\d.]+)(px|rem|em|%)?/g, v)) { const u = m[2] || ''; const x = u === 'px' ? +m[1] : (u === 'rem' || u === 'em') ? +m[1] * 16 : null; if (x !== null && (best === null || x > best)) best = x; } return best; };
      const body = nodes.find(n => n.tag === 'body') || root;
      const aos = /\[data-aos/.test(c.css);
      // hidden at load: stripped/aria-hidden markup, or faded to opacity 0 (scroll-reveal that never runs without JS)
      const hid1 = x => { if (x._h !== undefined) return x._h; return (x._h = /data-sp-hidden|aria-hidden\s*=\s*["']true/i.test(x.a) || /^(script|template|noscript|style)$/.test(x.tag)
        || x.cls.includes('opacity-0') || (aos && /\sdata-aos\s*=/i.test(' ' + x.a) && !x.cls.includes('aos-animate')) || /^0(?:\.0+)?$/.test((prop(x, 'opacity') || '').trim()) || /^(?:none)$/.test((prop(x, 'display') || '').trim()) && !x.cls.some(k => /^(?:sm|md|lg|xl|2xl):(?:block|flex|grid|inline|inline-block|inline-flex|table)$/.test(k))); };
      const hidden = n => { for (let x = n; x && x.tag !== '#root'; x = x.parent) if (hid1(x)) return true; return false; };
      return (c._d1 = { html, nodes, root, body, inner, text, words, bodies, prop, inh, has, desc, elKids, prevEl, px, hidden, resolve });
    })(c);
    const TW = { '4xl':36, '5xl':48, '6xl':60, '7xl':72, '8xl':96, '9xl':128, '3xl':30, '2xl':24, xl:20, lg:18 };
    const h1 = D.nodes.find(n => n.tag === 'h1' && !D.hidden(n) && D.text(n));
    if (!h1) return null;
    // size: largest declared size on the h1 (Tailwind text-*xl or CSS font-size, clamp() max)
    let size = null;
    for (const k of h1.cls) { const m = /^(?:[\w-]+:)*text-([2-9]xl|xl|lg)$/.exec(k) || /^(?:[\w-]+:)*text-\[(?:clamp\([^\]]*?)?([\d.]+)(px|rem)\)?\]$/.exec(k);
      if (m) { const v = m[2] ? (m[2] === 'px' ? +m[1] : m[1] * 16) : TW[m[1]]; if (v && (size === null || v > size)) size = v; } }
    if (size === null) size = D.px(D.prop(h1, 'font-size'));
    if (!size || size < 40) return null;
    // centred: text-align resolved up the tree, not overridden to left at a breakpoint
    // centred: text-align resolved up the tree, not overridden to left at a breakpoint, and not ambiguous
    // (mobile overrides lose their @media wrapper in the pruned CSS, so two different values on one element = unknown)
    let ta = null;
    for (let x = h1; x && x.tag !== '#root' && !ta; x = x.parent) {
      if (x.cls.some(k => /^(?:sm|md|lg|xl|2xl):text-(?:left|start|right)$/.test(k))) return null;
      if (!c.isFullDoc && x.cls.includes('text-center')) { ta = 'center'; break; }
      const vals = new Set(all(/(?:^|[;{\s])text-align\s*:\s*([a-z-]+)/gi, D.bodies(x)).map(m => m[1].toLowerCase()).filter(v => !/^(inherit|unset|initial)$/.test(v)));
      if (vals.size > 1) return null;
      if (vals.size === 1) ta = [...vals][0];
    }
    if (ta !== 'center') return null;
    // hero container: nearest section/header ancestor, else the outermost hero-named ancestor
    let sec = null, heroish = null;
    for (let x = h1.parent, i = 0; x && x.tag !== '#root' && i < 8; x = x.parent, i++) {
      if (/^(body|main)$/.test(x.tag)) break;
      if (/^(section|header)$/.test(x.tag)) { sec = x; break; }
      if (x.cls.some(k => /hero|banner|jumbotron|masthead/i.test(k))) heroish = x;
    }
    sec = sec || heroish;
    if (!sec) return null;
    // split layouts: an ancestor grid/flex row where a sibling column holds other content
    for (let x = h1.parent; x && x !== sec.parent; x = x.parent) {
      // every declared column template counts (a mobile 1fr override must not hide a desktop two-column grid)
      const colsAll = all(/grid-template-columns\s*:\s*([^;}]+)/gi, D.bodies(x)).map(m => D.resolve(m[1]).trim());
      if (x.cls.some(k => /^(?:[\w-]+:)*grid-cols-[2-9]$/.test(k)) || colsAll.some(v => /^repeat\(\s*[2-9]/.test(v) || (!/^repeat/.test(v) && /\S+\s+\S+/.test(v.replace(/\([^)]*\)/g, ''))))) return null;
    }
    const inSec = D.desc(sec, () => true).filter(n => !D.hidden(n));
    const after = inSec.filter(n => n.s > h1.s);
    // a supporting paragraph after the h1
    if (!after.some(n => /^(p|div|span)$/.test(n.tag) && !n.kids.some(k => /^(p|div|h\d|ul|section)$/.test(k.tag)) && D.words(D.text(n)) >= 4 && !/^h\d$/.test(n.parent.tag))) return null;
    // CTA row: a container whose element children are exactly two buttons/links (each may be wrapped once)
    // a button: <button>, or a link styled as one (btn/button class, or padding plus a fill or border)
    const styled = x => x.tag === 'button' || x.cls.some(k => /btn|button|cta/i.test(k)) || x.kids.some(k => k.tag === 'button')
      || (x.cls.some(k => /^(?:[\w-]+:)*(?:px|py|p)-/.test(k)) && x.cls.some(k => /^(?:[\w-]+:)*(?:bg-(?!transparent)|border|rounded|ring)/.test(k)))
      || (/(?:^|[;{\s])padding(?:-[a-z]+)?\s*:\s*[1-9]/i.test(D.bodies(x)) && /(?:^|[;{\s])(?:background(?:-color)?\s*:\s*(?!\s*(?:none|transparent))|border(?:-width)?\s*:\s*(?!\s*(?:none|0)))/i.test(D.bodies(x)));
    const btn = n => { let x = n; for (let i = 0; i < 2 && x && !/^(a|button)$/.test(x.tag); i++) x = x.kids.length === 1 ? x.kids[0] : null;
      if (!x || !/^(a|button)$/.test(x.tag) || !(styled(x) || styled(n))) return null; const t = D.text(x); return t && D.words(t) <= 6 && t.length <= 40 ? x : null; };
    const vk = n => n.kids.filter(k => !D.hidden(k) && !(k.tag === 'div' && !k.kids.length && !D.text(k)));
    const rows = after.filter(n => !/^(a|button|nav|ul|ol)$/.test(n.tag) && vk(n).length === 2 && vk(n).every(btn) && !D.desc(n, k => k.tag === 'input').length);
    if (!rows.length || after.indexOf(rows[0]) > 40) return null;
    if (inSec.filter(n => /^h[23]$/.test(n.tag)).length > 1 || D.desc(sec, n => n.tag === 'footer').length) return null;   // not a hero block
    // no other buttons/links of substance after the h1 besides the row, and no forms/inputs
    if (after.some(n => /^(input|textarea|select|form)$/.test(n.tag))) return null;
    // nothing else: no product media in the hero
    const MEDIA = /^(img|video|canvas|iframe|picture|pre|table|object|embed)$/;
    const big = n => {
      if (/^(video|canvas|iframe|picture|pre|table|object|embed)$/.test(n.tag)) return true;
      if (n.tag === 'img' || n.tag === 'svg') { const w = +((/\bwidth\s*=\s*["']?([\d.]+)/i.exec(n.a) || [])[1] || 0), h = +((/\bheight\s*=\s*["']?([\d.]+)/i.exec(n.a) || [])[1] || 0);
        if (n.tag === 'svg') return w > 200 || h > 200; return !(w && w <= 80 && (!h || h <= 80)) || /object-cover|w-full|screenshot|hero|product|preview|demo/i.test(n.a); }
      return n.cls.some(k => /screenshot|mockup|terminal|browser-?frame|window|preview|demo|device|phone|laptop|code-?block/i.test(k));
    };
    // div-built product mocks: a window chrome with three dots, or a large raised card with a lot inside
    const dots = n => n.kids.length >= 3 && n.kids.slice(0, 3).every(k => !D.text(k) && !k.kids.length && (k.cls.some(q => /rounded-full|dot|circle/.test(q)) || /border-radius\s*:\s*(?:50%|9{3,}|\d+px)/i.test(D.bodies(k))));
    const raised = n => (n.cls.some(k => /^shadow-(?:xl|2xl|\[)/.test(k)) || /box-shadow\s*:[^;]*\b(?:[3-9]\d|\d{3})px/i.test(D.bodies(n))) && D.desc(n, () => true).length >= 12;
    const mock = n => dots(n) || raised(n);
    const media = inSec.filter(n => (big(n) || (n.s > rows[0].s && mock(n))) && !D.desc(rows[0], () => true).includes(n));
    if (media.length) return null;
    // the fold: unless the hero fills the screen, the next block must open with a heading or a logo strip, not a product view
    const full = n => n.cls.some(k => /^(?:[\w-]+:)*(?:min-)?h-(?:screen|svh|dvh|\[(?:100|9\d)[sd]?vh\])$/.test(k)) || /(?:min-)?height\s*:\s*(?:100|9\d|8\d)[sdl]?vh/i.test(D.bodies(n));
    if (!full(sec)) {
      const nextNodes = D.nodes.filter(n => n.s >= sec.e && !D.hidden(n)).slice(0, 120);
      let ok = false, leaves = 0;
      for (const n of nextNodes) {
        if (/^(footer)$/.test(n.tag)) { ok = true; break; }
        if (big(n) || mock(n) || /^svg$/.test(n.tag) && /\bwidth\s*=\s*["']?(?:[3-9]\d\d|\d{4})/.test(n.a)) break;
        if (/^(input|select|textarea|form)$/.test(n.tag)) break;
        if (/^h[2-4]$/.test(n.tag) && D.text(n)) { ok = leaves === 0 || (leaves === 1 && !n.parent.cls.some(k => /card|item|sample|tile/i.test(k)) && !D.desc(n.parent.parent || n.parent, x => /^(article|li)$/.test(x.tag)).length); break; }
        const own = D.html.slice(n.is, n.kids.length ? n.kids[0].s : n.ie).replace(/<[^>]+>/g, ' ').trim();
        if (own && /[a-z]{2}/i.test(own)) { if (/trusted|used by|backed by|loved by|as seen|featured in|works with|integrat/i.test(own)) { ok = true; break; } if (++leaves >= 3) break; }
      }
      if (!ok) return null;
    }
    const bt = vk(rows[0]).map(k => '"' + D.text(btn(k)).slice(0, 24) + '"').join(' + ');
    return {evidence:['centred h1 "' + D.text(h1).slice(0, 50) + '" (' + Math.round(size) + 'px, text-align:center), one paragraph and a two-button row ' + bt + '; no image, video or code in the <' + sec.tag + (sec.cls[0] ? ' .' + sec.cls[0] : '') + '>']}; } },

{ code:'A27', id:'one-two-three-steps', name:'One Two Three Steps',
  fix:'Show the actual first-run flow with screenshots, however many steps it really has; if it is three, show the screens, not numerals.',
  test(c){
    const D = (c => {
      // d1 helper: tiny DOM tree + per-element CSS lookup (class/tag selectors only, no states). Cached on ctx.
      if (c._d1) return c._d1;
      const html = c.html, nodes = [], root = { tag:'#root', a:'', cls:[], kids:[], parent:null, s:0, e:html.length };
      const stack = [root];
      for (const m of all(/<(\/?)([a-z][\w-]*)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi, html)) {
        const tag = m[2].toLowerCase();
        if (m[1]) { for (let j = stack.length - 1; j > 0; j--) if (stack[j].tag === tag) { for (let k = stack.length - 1; k >= j; k--) stack[k].e = m.index + m[0].length, stack[k].ie = stack[k].ie || m.index; stack.length = j; break; } continue; }
        const up = stack[stack.length - 1];
        const cm = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[3]);
        const n = { tag, a:m[3], cls: cm ? (cm[1] || cm[2] || '').split(/\s+/).filter(Boolean) : [], kids:[], parent:up, s:m.index, is:m.index + m[0].length, e:html.length };
        up.kids.push(n); nodes.push(n);
        if (/^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/.test(tag) || /\/\s*$/.test(m[3])) { n.e = n.is; n.ie = n.is; continue; }
        stack.push(n);
      }
      for (const n of nodes) if (!n.ie) n.ie = n.e;
      const ent = s => s.replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&[a-z]+;|&#\d+;/gi, ' ');
      const inner = n => html.slice(n.is, n.ie);
      const text = n => ent(inner(n).replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      const words = s => s.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
      // bodies of rules that only apply below a max-width breakpoint (mobile overrides): ignored for a 1280px view
      const mobile = new Set();
      { const src = String(c.css).replace(/\/\*[\s\S]*?\*\//g, ''); const st = []; let last = 0;
        for (let i = 0; i < src.length; i++) { const ch = src[i];
          if (ch === '{') { st.push(src.slice(last, i).split(/[;}]/).pop().trim()); last = i + 1; }
          else if (ch === '}') { const pre = st.pop() || ''; if (!/^@/.test(pre) && st.some(q => /^@media[^{]*max-width\s*:\s*(\d+)/i.test(q) && +/max-width\s*:\s*(\d+)/i.exec(q)[1] < 1200 && !/min-width/i.test(q))) mobile.add(src.slice(last, i).trim()); last = i + 1; } } }
      // CSS index: last compound of each selector -> {tag, classes, id}
      const un = s => s.replace(/\\([^0-9a-f])/gi, '$1');
      const idx = [];
      for (const r of rules(c.css)) for (const p of r.sel.split(/(?<!\\),/)) {
        const last = p.trim().split(/\s*(?<!\\)[\s>+~]\s*/).pop();
        if (!last || /:(?:hover|focus|active|visited|focus-within|focus-visible|checked|disabled|placeholder|first-letter|first-line|selection|before|after|marker|-webkit|-moz)/i.test(last)) continue;
        const bare = last.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, '').replace(/::?[\w-]+(?:\([^)]*\))?/g, '').replace(/\[[^\]]*\]/g, '');
        const tag = ((/^[a-z][\w-]*/i.exec(bare) || [''])[0]).toLowerCase();
        const cs = all(/\.((?:\\.|[\w-])+)/g, bare).map(x => un(x[1]));
        const id = (/#((?:\\.|[\w-])+)/.exec(bare) || [])[1];
        if (!tag && !cs.length && !id) continue;
        if (mobile.has(r.body.trim())) continue;
        idx.push({ tag, cs, id: id ? un(id) : null, body: r.body, ctx: p.trim() !== last });
      }
      const vars = {};
      for (const r of rules(c.css)) for (const v of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) if (!vars[v[1]]) vars[v[1]] = v[2].trim();
      const resolve = v => { for (let i = 0; i < 4 && /var\(/.test(v); i++) v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_, k, d) => vars[k] || d || ''); return v; };
      const byTag = {}, byCls = {}, byId = {};
      for (const x of idx) { const k = x.cs[0]; if (k) (byCls[k] = byCls[k] || []).push(x); else if (x.id) (byId[x.id] = byId[x.id] || []).push(x); else (byTag[x.tag] = byTag[x.tag] || []).push(x); }
      const idOf = n => (/\bid\s*=\s*["']([^"']*)["']/i.exec(n.a) || [])[1];
      const bodies = n => {
        if (n._b !== undefined) return n._b;
        const set = new Set(n.cls), out = [], id = idOf(n);
        for (const x of (byTag[n.tag] || [])) out.push(x.body);
        for (const k of n.cls) for (const x of (byCls[k] || [])) if ((!x.tag || x.tag === n.tag) && x.cs.every(q => set.has(q)) && (!x.id || x.id === id)) out.push(x.body);
        if (id) for (const x of (byId[id] || [])) if (!x.tag || x.tag === n.tag) out.push(x.body);
        const st = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(n.a); if (st) out.push(ent(st[1] || st[2] || ''));
        return (n._b = out.join(';'));
      };
      const prop = (n, p) => { let v = null; for (const m of all(new RegExp('(?:^|[;{\\s])' + p + '\\s*:\\s*([^;}]+)', 'gi'), bodies(n))) v = m[1].trim(); return v === null ? null : resolve(v).replace(/\s*!important/, ''); };
      const inh = (n, p, f) => { for (let x = n; x && x.tag !== '#root'; x = x.parent) { const tw = f && f(x); if (tw) return tw; const v = prop(x, p); if (v && !/^(inherit|unset|initial)$/.test(v)) return v; }
        for (const t of ['body', 'html']) { const v = prop({ tag:t, cls:[], a:'', kids:[] }, p); if (v && !/^(inherit|unset|initial)$/.test(v)) return v; } return null; };
      const has = (n, re) => n.cls.some(k => re.test(k));
      const desc = (n, f, out = []) => { for (const k of n.kids) { if (f(k)) out.push(k); desc(k, f, out); } return out; };
      const elKids = n => n.kids;
      const prevEl = n => { const s = n.parent ? n.parent.kids : []; const i = s.indexOf(n); return i > 0 ? s[i - 1] : null; };
      const px = v => { if (!v) return null; let best = null; for (const m of all(/(-?[\d.]+)(px|rem|em|%)?/g, v)) { const u = m[2] || ''; const x = u === 'px' ? +m[1] : (u === 'rem' || u === 'em') ? +m[1] * 16 : null; if (x !== null && (best === null || x > best)) best = x; } return best; };
      const body = nodes.find(n => n.tag === 'body') || root;
      const aos = /\[data-aos/.test(c.css);
      // hidden at load: stripped/aria-hidden markup, or faded to opacity 0 (scroll-reveal that never runs without JS)
      const hid1 = x => { if (x._h !== undefined) return x._h; return (x._h = /data-sp-hidden|aria-hidden\s*=\s*["']true/i.test(x.a) || /^(script|template|noscript|style)$/.test(x.tag)
        || x.cls.includes('opacity-0') || (aos && /\sdata-aos\s*=/i.test(' ' + x.a) && !x.cls.includes('aos-animate')) || /^0(?:\.0+)?$/.test((prop(x, 'opacity') || '').trim()) || /^(?:none)$/.test((prop(x, 'display') || '').trim()) && !x.cls.some(k => /^(?:sm|md|lg|xl|2xl):(?:block|flex|grid|inline|inline-block|inline-flex|table)$/.test(k))); };
      const hidden = n => { for (let x = n; x && x.tag !== '#root'; x = x.parent) if (hid1(x)) return true; return false; };
      return (c._d1 = { html, nodes, root, body, inner, text, words, bodies, prop, inh, has, desc, elKids, prevEl, px, hidden, resolve });
    })(c);
    const HEAD = /^(?:how (?:it|does it|this|they) works?\??|how .{1,25} works\??|(?:get )?started in (?:3|three) (?:easy |simple )?steps|(?:3|three) (?:easy |simple |quick )?steps\b.*|(?:in |just )?(?:3|three) (?:easy |simple |quick )?steps|(?:simple|easy) (?:as )?(?:1[,\s-]+2[,\s-]+3|one[,\s-]+two[,\s-]+three)|getting started)\W*$/i;
    const NUM = /^(?:step\s*)?0?([1-3])(?:[.):]|\s*[-–—/]|\s|$)/i;
    const ev = [];
    const heads = D.nodes.filter(n => /^h[1-4]$/.test(n.tag) && HEAD.test(D.text(n)) && !D.hidden(n));
    for (const h of heads) {
      // section: climb until the ancestor holds a 3-step container
      let sec = h.parent, hit = null;
      for (let i = 0; i < 4 && sec && sec.tag !== '#root' && !hit; i++, sec = sec.parent) {
        for (const box of D.desc(sec, n => n.s > h.s && n.kids.length >= 3)) {
          const ks = box.kids.filter(k => !/^(br|hr|script|style)$/.test(k.tag) && !D.hidden(k));
          const steps = ks.filter(k => D.words(D.text(k)) >= 2);
          if (steps.length !== 3 || ks.length > 5) continue;           // connectors/arrows between steps are allowed
          const lead = k => { const m = NUM.exec(D.text(k)); return m ? +m[1] : (box.tag === 'ol' ? 0 : null); };
          const nums = steps.map(lead);
          const ordered = nums.every((v, i) => v === i + 1);   // explicit numerals only (an <ol> may be styled without numbers)
          if (!ordered) continue;
          // each step: a short title + a line (not a one-line list item)
          if (!steps.every(k => D.words(D.text(k)) >= 4 && D.words(D.text(k)) <= 60)) continue;
          if (box.tag === 'ol' && !steps.every(k => D.desc(k, x => /^(h\d|strong|b|p)$/.test(x.tag)).length)) continue;
          hit = { box, steps, sec }; break;
        }
      }
      if (!hit) continue;
      // fourth step elsewhere (e.g. "4. ...") means it is not a three-step block
      const shots = hit.steps.filter(k => D.desc(k, x => /^(img|video|picture|canvas|iframe|pre)$/.test(x.tag) && !(/\bwidth\s*=\s*["']?([1-9]\d?)\b/.test(x.a) && +(/\bwidth\s*=\s*["']?(\d+)/.exec(x.a)[1]) <= 96)).length);
      if (shots.length) continue;
      // the section shows no screenshot or video of the product either
      const bigImg = x => /^(video|iframe|picture|canvas)$/.test(x.tag) || (x.tag === 'img' && !(+((/\bwidth\s*=\s*["']?(\d+)/i.exec(x.a) || [])[1] || 999) <= 96));
      if (D.desc(hit.sec, x => x.s > h.s && bigImg(x) && !D.hidden(x)).length) continue;
      ev.push('"' + D.text(h).slice(0, 40) + '" section: exactly 3 numbered steps: ' + hit.steps.map(k => '"' + D.text(k).slice(0, 26) + '"').join(', ') + ' (no screenshots)');
      break;
    }
    return ev.length ? {evidence:ev} : null; } },

{ code:'A28', id:'three-tiers-middle-glowing', name:'Three Tiers, Middle Glowing',
  fix:'Show only plans that exist, describe what changes between them in concrete limits, and highlight a plan only if data shows it is the right default.',
  test(c){
    const D = (c => {
      // d1 helper: tiny DOM tree + per-element CSS lookup (class/tag selectors only, no states). Cached on ctx.
      if (c._d1) return c._d1;
      const html = c.html, nodes = [], root = { tag:'#root', a:'', cls:[], kids:[], parent:null, s:0, e:html.length };
      const stack = [root];
      for (const m of all(/<(\/?)([a-z][\w-]*)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi, html)) {
        const tag = m[2].toLowerCase();
        if (m[1]) { for (let j = stack.length - 1; j > 0; j--) if (stack[j].tag === tag) { for (let k = stack.length - 1; k >= j; k--) stack[k].e = m.index + m[0].length, stack[k].ie = stack[k].ie || m.index; stack.length = j; break; } continue; }
        const up = stack[stack.length - 1];
        const cm = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[3]);
        const n = { tag, a:m[3], cls: cm ? (cm[1] || cm[2] || '').split(/\s+/).filter(Boolean) : [], kids:[], parent:up, s:m.index, is:m.index + m[0].length, e:html.length };
        up.kids.push(n); nodes.push(n);
        if (/^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/.test(tag) || /\/\s*$/.test(m[3])) { n.e = n.is; n.ie = n.is; continue; }
        stack.push(n);
      }
      for (const n of nodes) if (!n.ie) n.ie = n.e;
      const ent = s => s.replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&[a-z]+;|&#\d+;/gi, ' ');
      const inner = n => html.slice(n.is, n.ie);
      const text = n => ent(inner(n).replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      const words = s => s.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
      // bodies of rules that only apply below a max-width breakpoint (mobile overrides): ignored for a 1280px view
      const mobile = new Set();
      { const src = String(c.css).replace(/\/\*[\s\S]*?\*\//g, ''); const st = []; let last = 0;
        for (let i = 0; i < src.length; i++) { const ch = src[i];
          if (ch === '{') { st.push(src.slice(last, i).split(/[;}]/).pop().trim()); last = i + 1; }
          else if (ch === '}') { const pre = st.pop() || ''; if (!/^@/.test(pre) && st.some(q => /^@media[^{]*max-width\s*:\s*(\d+)/i.test(q) && +/max-width\s*:\s*(\d+)/i.exec(q)[1] < 1200 && !/min-width/i.test(q))) mobile.add(src.slice(last, i).trim()); last = i + 1; } } }
      // CSS index: last compound of each selector -> {tag, classes, id}
      const un = s => s.replace(/\\([^0-9a-f])/gi, '$1');
      const idx = [];
      for (const r of rules(c.css)) for (const p of r.sel.split(/(?<!\\),/)) {
        const last = p.trim().split(/\s*(?<!\\)[\s>+~]\s*/).pop();
        if (!last || /:(?:hover|focus|active|visited|focus-within|focus-visible|checked|disabled|placeholder|first-letter|first-line|selection|before|after|marker|-webkit|-moz)/i.test(last)) continue;
        const bare = last.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, '').replace(/::?[\w-]+(?:\([^)]*\))?/g, '').replace(/\[[^\]]*\]/g, '');
        const tag = ((/^[a-z][\w-]*/i.exec(bare) || [''])[0]).toLowerCase();
        const cs = all(/\.((?:\\.|[\w-])+)/g, bare).map(x => un(x[1]));
        const id = (/#((?:\\.|[\w-])+)/.exec(bare) || [])[1];
        if (!tag && !cs.length && !id) continue;
        if (mobile.has(r.body.trim())) continue;
        idx.push({ tag, cs, id: id ? un(id) : null, body: r.body, ctx: p.trim() !== last });
      }
      const vars = {};
      for (const r of rules(c.css)) for (const v of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) if (!vars[v[1]]) vars[v[1]] = v[2].trim();
      const resolve = v => { for (let i = 0; i < 4 && /var\(/.test(v); i++) v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_, k, d) => vars[k] || d || ''); return v; };
      const byTag = {}, byCls = {}, byId = {};
      for (const x of idx) { const k = x.cs[0]; if (k) (byCls[k] = byCls[k] || []).push(x); else if (x.id) (byId[x.id] = byId[x.id] || []).push(x); else (byTag[x.tag] = byTag[x.tag] || []).push(x); }
      const idOf = n => (/\bid\s*=\s*["']([^"']*)["']/i.exec(n.a) || [])[1];
      const bodies = n => {
        if (n._b !== undefined) return n._b;
        const set = new Set(n.cls), out = [], id = idOf(n);
        for (const x of (byTag[n.tag] || [])) out.push(x.body);
        for (const k of n.cls) for (const x of (byCls[k] || [])) if ((!x.tag || x.tag === n.tag) && x.cs.every(q => set.has(q)) && (!x.id || x.id === id)) out.push(x.body);
        if (id) for (const x of (byId[id] || [])) if (!x.tag || x.tag === n.tag) out.push(x.body);
        const st = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(n.a); if (st) out.push(ent(st[1] || st[2] || ''));
        return (n._b = out.join(';'));
      };
      const prop = (n, p) => { let v = null; for (const m of all(new RegExp('(?:^|[;{\\s])' + p + '\\s*:\\s*([^;}]+)', 'gi'), bodies(n))) v = m[1].trim(); return v === null ? null : resolve(v).replace(/\s*!important/, ''); };
      const inh = (n, p, f) => { for (let x = n; x && x.tag !== '#root'; x = x.parent) { const tw = f && f(x); if (tw) return tw; const v = prop(x, p); if (v && !/^(inherit|unset|initial)$/.test(v)) return v; }
        for (const t of ['body', 'html']) { const v = prop({ tag:t, cls:[], a:'', kids:[] }, p); if (v && !/^(inherit|unset|initial)$/.test(v)) return v; } return null; };
      const has = (n, re) => n.cls.some(k => re.test(k));
      const desc = (n, f, out = []) => { for (const k of n.kids) { if (f(k)) out.push(k); desc(k, f, out); } return out; };
      const elKids = n => n.kids;
      const prevEl = n => { const s = n.parent ? n.parent.kids : []; const i = s.indexOf(n); return i > 0 ? s[i - 1] : null; };
      const px = v => { if (!v) return null; let best = null; for (const m of all(/(-?[\d.]+)(px|rem|em|%)?/g, v)) { const u = m[2] || ''; const x = u === 'px' ? +m[1] : (u === 'rem' || u === 'em') ? +m[1] * 16 : null; if (x !== null && (best === null || x > best)) best = x; } return best; };
      const body = nodes.find(n => n.tag === 'body') || root;
      const aos = /\[data-aos/.test(c.css);
      // hidden at load: stripped/aria-hidden markup, or faded to opacity 0 (scroll-reveal that never runs without JS)
      const hid1 = x => { if (x._h !== undefined) return x._h; return (x._h = /data-sp-hidden|aria-hidden\s*=\s*["']true/i.test(x.a) || /^(script|template|noscript|style)$/.test(x.tag)
        || x.cls.includes('opacity-0') || (aos && /\sdata-aos\s*=/i.test(' ' + x.a) && !x.cls.includes('aos-animate')) || /^0(?:\.0+)?$/.test((prop(x, 'opacity') || '').trim()) || /^(?:none)$/.test((prop(x, 'display') || '').trim()) && !x.cls.some(k => /^(?:sm|md|lg|xl|2xl):(?:block|flex|grid|inline|inline-block|inline-flex|table)$/.test(k))); };
      const hidden = n => { for (let x = n; x && x.tag !== '#root'; x = x.parent) if (hid1(x)) return true; return false; };
      return (c._d1 = { html, nodes, root, body, inner, text, words, bodies, prop, inh, has, desc, elKids, prevEl, px, hidden, resolve });
    })(c);
    const PRICE = /(?:[$€£¥₹]\s?\d|\d(?:[.,]\d+)?\s?(?:[$€£]|usd|eur)\b|\bfree\b|contact (?:us|sales)|\bcustom\b|let'?s talk|get a quote)/i;
    const MONEY = /[$€£¥₹]\s?\d[\d,.]*(?:\s?[kK])?|\d[\d,.]*\s?(?:[$€£]|usd|eur)\b/i;
    const BADGE = /\b(?:most popular|popular|recommended|best value|best deal|most chosen|best choice|top pick|favou?rite)\b/i;
    const MOD = /(?:popular|featured|highlight|recommend|emphas|primary|best|selected|active|accent|pro\b|premium|glow|scale-1[01]\d|ring-2|ring-\w+-[4-6]00|border-(?:indigo|blue|violet|purple|sky|emerald|primary|brand|accent))/i;
    const items = k => D.desc(k, x => x.tag === 'li').length;
    const checks = k => D.desc(k, x => x.tag === 'svg' || /check|tick/i.test(x.cls.join(' '))).length + (D.text(k).match(/[✓✔✅]/g) || []).length;
    const ev = [];
    for (const box of D.nodes) {
      const ks = box.kids.filter(k => !/^(br|hr|script|style)$/.test(k.tag) && !D.hidden(k));
      if (ks.length !== 3 || D.hidden(box)) continue;
      const tx = ks.map(k => D.text(k));
      if (!tx.every(t => PRICE.test(t)) || tx.filter(t => MONEY.test(t)).length < 2) continue;
      if (!ks.every(k => items(k) >= 3 || checks(k) >= 3)) continue;
      if (tx.some(t => D.words(t) > 250)) continue;
      // nested match: prefer the innermost three-card row
      if (ks.some(k => D.desc(k, x => x.kids.length === 3 && x.kids.every(y => PRICE.test(D.text(y)))).length)) continue;
      const [a, m, b] = ks, why = [];
      const own = (k, others) => k.cls.filter(x => !others.some(o => o.cls.includes(x)));
      const own2 = (k, o) => own(k, o).filter(x => !/^(?:group-)?(?:hover|focus|active|focus-visible|focus-within|dark|motion-safe):/.test(x));
      const mOnly = own2(m, [a, b]);
      // a modifier class counts only when it visibly does something (on a whole page: CSS backs it)
      const VIS = /(?:^|[;{\s])(?:border(?:-color|-width|-top|-bottom|-left|-right)?|box-shadow|transform|scale|background(?:-color|-image)?|outline)\s*:/i;
      const backed = x => !c.isFullDoc || VIS.test(D.bodies({ tag:m.tag, cls:[x], a:'', kids:[] })) || VIS.test(D.bodies({ tag:m.tag, cls:m.cls, a:'', kids:[] }).replace(D.bodies({ tag:m.tag, cls:m.cls.filter(y => y !== x), a:'', kids:[] }), ''));
      const tag = mOnly.find(x => MOD.test(x) && !/^(?:active|selected)$/.test(x) && backed(x));
      if (tag && !own2(a, [m, b]).some(x => MOD.test(x)) && !own2(b, [a, m]).some(x => MOD.test(x))) why.push('.' + tag);
      const badge = BADGE.exec(tx[1]);
      if (badge && !BADGE.test(tx[0]) && !BADGE.test(tx[2])) why.push('"' + badge[0] + '" badge');
      // CSS difference: border/shadow/transform/background differ on the middle card only
      const look = k => ['border-color', 'box-shadow', 'transform', 'scale', 'background', 'background-color', 'outline', 'border'].map(p => p + '=' + (D.prop(k, p) || '')).join('|');
      const visual = mOnly.find(x => /^(?:(?:sm|md|lg|xl):)?(?:border|ring|shadow|scale|bg|from|outline)-/.test(x) || /(?:^|[;{\s])(?:border(?:-color|-width)?|box-shadow|transform|scale|background(?:-color)?|outline)\s*:/i.test(D.bodies({ tag:m.tag, cls:[x], a:'', kids:[] })));
      if (!why.length && visual && look(a) === look(b) && look(m) !== look(a)) why.push('middle card styled differently (.' + visual + ')');
      if (!why.length) continue;
      const price = t => ((MONEY.exec(t) || PRICE.exec(t) || [''])[0]).trim();
      ev.push('3 pricing cards (' + tx.map(price).join(' / ') + '), middle one singled out by ' + why.join(' + '));
      if (ev.length >= 2) break;
    }
    return ev.length ? {evidence:ev} : null; } },

{ code:'A29', id:'gradient-initial-avatars', name:'Gradient Initial Avatars',
  fix:'Use real photos with permission, or drop the avatars and cite each person by name, role, company and link.',
  test(c){
    const D = (c => {
      // d1 helper: tiny DOM tree + per-element CSS lookup (class/tag selectors only, no states). Cached on ctx.
      if (c._d1) return c._d1;
      const html = c.html, nodes = [], root = { tag:'#root', a:'', cls:[], kids:[], parent:null, s:0, e:html.length };
      const stack = [root];
      for (const m of all(/<(\/?)([a-z][\w-]*)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi, html)) {
        const tag = m[2].toLowerCase();
        if (m[1]) { for (let j = stack.length - 1; j > 0; j--) if (stack[j].tag === tag) { for (let k = stack.length - 1; k >= j; k--) stack[k].e = m.index + m[0].length, stack[k].ie = stack[k].ie || m.index; stack.length = j; break; } continue; }
        const up = stack[stack.length - 1];
        const cm = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[3]);
        const n = { tag, a:m[3], cls: cm ? (cm[1] || cm[2] || '').split(/\s+/).filter(Boolean) : [], kids:[], parent:up, s:m.index, is:m.index + m[0].length, e:html.length };
        up.kids.push(n); nodes.push(n);
        if (/^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/.test(tag) || /\/\s*$/.test(m[3])) { n.e = n.is; n.ie = n.is; continue; }
        stack.push(n);
      }
      for (const n of nodes) if (!n.ie) n.ie = n.e;
      const ent = s => s.replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&[a-z]+;|&#\d+;/gi, ' ');
      const inner = n => html.slice(n.is, n.ie);
      const text = n => ent(inner(n).replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      const words = s => s.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
      // bodies of rules that only apply below a max-width breakpoint (mobile overrides): ignored for a 1280px view
      const mobile = new Set();
      { const src = String(c.css).replace(/\/\*[\s\S]*?\*\//g, ''); const st = []; let last = 0;
        for (let i = 0; i < src.length; i++) { const ch = src[i];
          if (ch === '{') { st.push(src.slice(last, i).split(/[;}]/).pop().trim()); last = i + 1; }
          else if (ch === '}') { const pre = st.pop() || ''; if (!/^@/.test(pre) && st.some(q => /^@media[^{]*max-width\s*:\s*(\d+)/i.test(q) && +/max-width\s*:\s*(\d+)/i.exec(q)[1] < 1200 && !/min-width/i.test(q))) mobile.add(src.slice(last, i).trim()); last = i + 1; } } }
      // CSS index: last compound of each selector -> {tag, classes, id}
      const un = s => s.replace(/\\([^0-9a-f])/gi, '$1');
      const idx = [];
      for (const r of rules(c.css)) for (const p of r.sel.split(/(?<!\\),/)) {
        const last = p.trim().split(/\s*(?<!\\)[\s>+~]\s*/).pop();
        if (!last || /:(?:hover|focus|active|visited|focus-within|focus-visible|checked|disabled|placeholder|first-letter|first-line|selection|before|after|marker|-webkit|-moz)/i.test(last)) continue;
        const bare = last.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, '').replace(/::?[\w-]+(?:\([^)]*\))?/g, '').replace(/\[[^\]]*\]/g, '');
        const tag = ((/^[a-z][\w-]*/i.exec(bare) || [''])[0]).toLowerCase();
        const cs = all(/\.((?:\\.|[\w-])+)/g, bare).map(x => un(x[1]));
        const id = (/#((?:\\.|[\w-])+)/.exec(bare) || [])[1];
        if (!tag && !cs.length && !id) continue;
        if (mobile.has(r.body.trim())) continue;
        idx.push({ tag, cs, id: id ? un(id) : null, body: r.body, ctx: p.trim() !== last });
      }
      const vars = {};
      for (const r of rules(c.css)) for (const v of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) if (!vars[v[1]]) vars[v[1]] = v[2].trim();
      const resolve = v => { for (let i = 0; i < 4 && /var\(/.test(v); i++) v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_, k, d) => vars[k] || d || ''); return v; };
      const byTag = {}, byCls = {}, byId = {};
      for (const x of idx) { const k = x.cs[0]; if (k) (byCls[k] = byCls[k] || []).push(x); else if (x.id) (byId[x.id] = byId[x.id] || []).push(x); else (byTag[x.tag] = byTag[x.tag] || []).push(x); }
      const idOf = n => (/\bid\s*=\s*["']([^"']*)["']/i.exec(n.a) || [])[1];
      const bodies = n => {
        if (n._b !== undefined) return n._b;
        const set = new Set(n.cls), out = [], id = idOf(n);
        for (const x of (byTag[n.tag] || [])) out.push(x.body);
        for (const k of n.cls) for (const x of (byCls[k] || [])) if ((!x.tag || x.tag === n.tag) && x.cs.every(q => set.has(q)) && (!x.id || x.id === id)) out.push(x.body);
        if (id) for (const x of (byId[id] || [])) if (!x.tag || x.tag === n.tag) out.push(x.body);
        const st = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(n.a); if (st) out.push(ent(st[1] || st[2] || ''));
        return (n._b = out.join(';'));
      };
      const prop = (n, p) => { let v = null; for (const m of all(new RegExp('(?:^|[;{\\s])' + p + '\\s*:\\s*([^;}]+)', 'gi'), bodies(n))) v = m[1].trim(); return v === null ? null : resolve(v).replace(/\s*!important/, ''); };
      const inh = (n, p, f) => { for (let x = n; x && x.tag !== '#root'; x = x.parent) { const tw = f && f(x); if (tw) return tw; const v = prop(x, p); if (v && !/^(inherit|unset|initial)$/.test(v)) return v; }
        for (const t of ['body', 'html']) { const v = prop({ tag:t, cls:[], a:'', kids:[] }, p); if (v && !/^(inherit|unset|initial)$/.test(v)) return v; } return null; };
      const has = (n, re) => n.cls.some(k => re.test(k));
      const desc = (n, f, out = []) => { for (const k of n.kids) { if (f(k)) out.push(k); desc(k, f, out); } return out; };
      const elKids = n => n.kids;
      const prevEl = n => { const s = n.parent ? n.parent.kids : []; const i = s.indexOf(n); return i > 0 ? s[i - 1] : null; };
      const px = v => { if (!v) return null; let best = null; for (const m of all(/(-?[\d.]+)(px|rem|em|%)?/g, v)) { const u = m[2] || ''; const x = u === 'px' ? +m[1] : (u === 'rem' || u === 'em') ? +m[1] * 16 : null; if (x !== null && (best === null || x > best)) best = x; } return best; };
      const body = nodes.find(n => n.tag === 'body') || root;
      const aos = /\[data-aos/.test(c.css);
      // hidden at load: stripped/aria-hidden markup, or faded to opacity 0 (scroll-reveal that never runs without JS)
      const hid1 = x => { if (x._h !== undefined) return x._h; return (x._h = /data-sp-hidden|aria-hidden\s*=\s*["']true/i.test(x.a) || /^(script|template|noscript|style)$/.test(x.tag)
        || x.cls.includes('opacity-0') || (aos && /\sdata-aos\s*=/i.test(' ' + x.a) && !x.cls.includes('aos-animate')) || /^0(?:\.0+)?$/.test((prop(x, 'opacity') || '').trim()) || /^(?:none)$/.test((prop(x, 'display') || '').trim()) && !x.cls.some(k => /^(?:sm|md|lg|xl|2xl):(?:block|flex|grid|inline|inline-block|inline-flex|table)$/.test(k))); };
      const hidden = n => { for (let x = n; x && x.tag !== '#root'; x = x.parent) if (hid1(x)) return true; return false; };
      return (c._d1 = { html, nodes, root, body, inner, text, words, bodies, prop, inh, has, desc, elKids, prevEl, px, hidden, resolve });
    })(c);
    const ev = [];
    const GRAD = /gradient\(/i;
    const round = n => (!c.isFullDoc && n.cls.some(k => /^(?:[\w-]+:)*rounded-full$/.test(k))) || (() => { const r = D.prop(n, 'border-radius'); return r && /infinity|50%|100%|9{3,}|e\+/i.test(r); })();
    const grad = n => (!c.isFullDoc && n.cls.some(k => /^(?:[\w-]+:)*bg-(?:gradient|linear|radial|conic)-/.test(k))) || GRAD.test(D.prop(n, 'background-image') || '') || GRAD.test(D.prop(n, 'background') || '');
    const sizeOk = n => { const w = D.px(D.prop(n, 'width')) || D.px(D.prop(n, 'height')); if (w) return w >= 24 && w <= 72;
      const k = n.cls.map(x => /^(?:[\w-]+:)*(?:w|h|size)-(\d+)$/.exec(x)).find(Boolean); return k ? +k[1] >= 6 && +k[1] <= 18 : !c.isFullDoc; };
    const CTX = /testimonial|what (?:our |people |users |customers |developers |folks )?(?:are )?say|loved by|wall of love|reviews?\b|from (?:our )?(?:users|customers)/i;
    const cands = D.nodes.filter(n => !/^(a|button|li|ul|ol|p|h\d|svg|img)$/.test(n.tag) && /^[A-Z]{1,2}$/.test(D.text(n)) && !D.hidden(n)
      && !n.kids.some(k => k.kids.length) && !n.kids.some(k => /^(img|svg)$/.test(k.tag)));
    const hits = [];
    for (const n of cands) {
      if (!round(n) || !grad(n) || !sizeOk(n)) continue;
      // testimonial context: a quote or testimonial heading within a few levels up
      let ok = false;
      for (let x = n.parent, i = 0; x && x.tag !== '#root' && i < 7 && !ok; x = x.parent, i++)
        ok = D.desc(x, y => /^(blockquote|q)$/.test(y.tag)).length > 0 || x.cls.some(k => /testimonial|review|quote/i.test(k)) || (i >= 2 && CTX.test(D.text(x).slice(0, 400))) || /[“"][^”"]{25,}[”"]/.test(D.text(x));
      // the initials belong to a person named next to it ("S" beside "Sarah Chen")
      const ini = D.text(n);
      let named = false;
      for (let x = n.parent, i = 0; x && x.tag !== '#root' && i < 3 && !named; x = x.parent, i++)
        named = D.desc(x, y => !y.kids.length || y.kids.every(k => /^(br|span|strong|b)$/.test(k.tag))).some(y => { const t = D.text(y);
          const m = /^([A-Z][\p{Ll}'’-]+)(?:\s+[A-Z]\.?)?\s+([A-Z][\p{Ll}'’-]*\.?)(?:\s+[A-Z][\p{Ll}'’-]+)?(?:\s*[,·|—–-].*)?$/u.exec(t);
          return m && m[1][0] === ini[0] && (ini.length === 1 || m[2][0] === ini[1]); });
      if (ok && named) hits.push(n);
    }
    if (!hits.length) return null;
    return {evidence:[hits.length + ' initial avatar' + (hits.length > 1 ? 's' : '') + ' (' + hits.slice(0, 4).map(n => '"' + D.text(n) + '"').join(', ') + ') on gradient circles next to testimonials' + (hits[0].cls[0] ? ', e.g. .' + hits[0].cls.slice(0, 2).join('.') : '')]}; } },

{ code:'A30', id:'the-traffic-light-terminal', name:'The Traffic-Light Terminal',
  fix:'Show the real install command only if it works, or the real interface; do not dress a non-CLI product as a terminal.',
  test(c){
    // three window-chrome dots (red, yellow, green, in that order, within a few sibling tags) followed by a
    // shell command in the same mockup. Colours come from inline style, Tailwind bg-*/fill-* classes, SVG fill,
    // or a CSS rule on one of the dot's classes.
    const ev = [];
    const hue = rgb => { const h = rgbToHsl(rgb); return h; };
    const kind = rgb => { if (!rgb) return null; const h = hue(rgb); if (h.s < 45 || h.l < 35 || h.l > 80) return null;
      if (h.h >= 345 || h.h <= 12) return 'R'; if (h.h >= 36 && h.h <= 52) return 'Y'; if (h.h >= 95 && h.h <= 150) return 'G'; return null; };
    const TW = { red:'R', rose:'R', yellow:'Y', amber:'Y', green:'G', emerald:'G', lime:'G' };
    const clsColor = {};
    for (const r of rules(c.css)) {
      if (r.sel === '[inline-style]') continue;
      const col = declColor(r.body, 'background-color') || declColor(r.body, 'background') || declColor(r.body, 'fill');
      const k = kind(col); if (!k) continue;
      for (const p of parts(r.sel)) { const m = /\.([\w-]+)\s*$/.exec(p); if (m && !/:(hover|focus|active)/.test(p)) clsColor[m[1].toLowerCase()] = k; }
    }
    const attr = (a, n) => { const m = new RegExp('(?:^|\\s)' + n + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i').exec(' ' + a); return m ? (m[1] ?? m[2]) : null; };
    const tagKind = a => {
      const st = attr(a, 'style') || '';
      let k = kind(declColor(st, 'background-color') || declColor(st, 'background'));
      if (k) return k;
      const f = attr(a, 'fill'); if (f && (k = kind(parseColor(f)))) return k;
      const cls = (attr(a, 'class') || '').toLowerCase().split(/\s+/).filter(Boolean);
      for (const x of cls) {
        let m = /^(?:bg|fill)-(red|rose|yellow|amber|green|emerald|lime)-(\d{3})$/.exec(x);
        if (m && +m[2] >= 300 && +m[2] <= 600) return TW[m[1]];
        m = /^(?:bg|fill)-\[(#[0-9a-f]{3,6})\]$/.exec(x); if (m && (k = kind(parseColor(m[1])))) return k;
        if (clsColor[x]) return clsColor[x];
      }
      return null;
    };
    const tags = all(/<(\/?)([a-z][\w-]*)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi, c.html);
    const PROMPT = /^\s*[$>❯➜%]\s+[a-z][\w.-]*(?:\s|$)/;   // case-sensitive: commands are lower-case, output lines are not
    const CMD = /^\s*(?:(?:sudo\s+)?(?:npm|npx|pnpm|pnpx|yarn|bun|bunx|pip3?|pipx|uv|uvx|brew|curl|wget|cargo|go\s+(?:install|get|run)|docker|git\s+clone|gem|composer|deno|apt(?:-get)?|helm|kubectl|dotnet|conda|poetry)\b\s*\S)/i;
    let last = -1;
    for (let i = 0; i < tags.length; i++) {
      if (tags[i][1] || tags[i].index < last) continue;
      if (tagKind(tags[i][3]) !== 'R') continue;
      // the next coloured tags (within 12 tags and 900 chars) must be yellow then green
      const seq = [];
      for (let j = i + 1; j < tags.length && j <= i + 12 && tags[j].index - tags[i].index < 900; j++) {
        if (tags[j][1]) continue; const k = tagKind(tags[j][3]); if (k) seq.push(k); if (seq.length === 2) break; }
      if (seq.join('') !== 'YG') continue;
      // the terminal text: visible text in the next 4000 chars of markup, line by line (pre/code/div rows)
      // stop where the mockup ends: three levels up from the red dot (dot -> dot row -> title bar -> window)
      let depth = 0, stop = tags[i].index + 3000;
      for (let j = i; j < tags.length && tags[j].index < stop; j++) {
        const tg = tags[j][2].toLowerCase();
        if (tags[j][1]) { if (/^(path|circle|rect|line|polyline|polygon|ellipse|stop)$/.test(tg)) continue; if (--depth <= -3) { stop = tags[j].index; break; } }
        else if (!VOIDTAG.test(tg) && !/\/\s*$/.test(tags[j][3]) && !/^(path|circle|rect|line|polyline|polygon|ellipse|stop)$/.test(tg)) depth++;
      }
      const tail = c.html.slice(tags[i].index, stop).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ');
      const lines = tail.split(/<\/?(?:br|div|p|pre|code|li|tr|h\d)\b[^>]*>|\n/i).map(s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&gt;/g, '>').replace(/&#36;|&dollar;/g, '$').replace(/\s+/g, ' ').trim()).filter(Boolean);
      const cmd = lines.find(s => (CMD.test(s) || PROMPT.test(s)) && s.length < 160 && !/^\$\s*\d/.test(s));
      if (!cmd) continue;
      last = stop;
      const dc = (/\bclass\s*=\s*["']([^"']*)/i.exec(tags[i][3]) || [, ''])[1].trim().split(/\s+/).slice(-2).join('.');
      ev.push('red/yellow/green window dots (<' + tags[i][2] + (dc ? ' .' + dc : '') + '> …) over terminal line "' + cmd.slice(0, 60) + '"');
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,2)} : null; } },

{ code:'A35', id:'fade-up-on-everything', name:'Fade-Up On Everything',
  fix:'Animate at most one thing per screen with a reason; respect prefers-reduced-motion and never start essential content at opacity 0.',
  test(c){
    // elements that start hidden and shifted down, waiting for a scroll reveal: AOS fade-up, WOW/animate.css
    // fadeInUp, framer-motion style="opacity:0;transform:translateY(20px)", Tailwind animate-fade-up, or a page
    // class whose CSS rule sets opacity:0 plus a downward translate.
    const attr = (a, n) => { const m = new RegExp('(?:^|\\s)' + n + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i').exec(' ' + a); return m ? (m[1] ?? m[2]) : null; };
    const down = s => { let m = /translateY\(\s*(\d+(?:\.\d+)?)(px|%|rem|em)/i.exec(s) || /translate(?:3d)?\(\s*-?[\d.]+(?:px|%)?\s*,\s*(\d+(?:\.\d+)?)(px|%|rem|em)/i.exec(s);
      return m && +m[1] > 0; };
    const hiddenStart = s => /(?:^|;|\s)opacity\s*:\s*0(?:\.0\d*)?\s*(?:!important)?\s*(?:;|$)/i.test(s);
    // classes whose own rule hides and shifts (not :hover / .active variants)
    const revealCls = new Set();
    for (const r of rules(c.css)) {
      if (r.sel === '[inline-style]' || !hiddenStart(r.body) || !down(r.body)) continue;
      for (const p of parts(r.sel)) { const m = /^\.([\w-]+)$/.exec(p); if (m && !/menu|drop|modal|tooltip|popover|toast|nav|dialog|submenu|overlay|tab/i.test(m[1])) revealCls.add(m[1].toLowerCase()); }
    }
    let n = 0; const kinds = {};
    const add = k => { n++; kinds[k] = (kinds[k] || 0) + 1; };
    for (const m of all(/<([a-z][\w-]*)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi, c.html)) {
      const a = m[2];
      if (/aria-hidden\s*=\s*["']true/i.test(a)) continue;
      const aos = attr(a, 'data-aos') || attr(a, 'data-sal') || attr(a, 'data-animate') || attr(a, 'data-animation');
      if (aos && /fade-?up|fade-?in-?up|slide-?up|fadeInUp/i.test(aos)) { add('data-' + (attr(a, 'data-aos') ? 'aos' : attr(a,'data-sal') ? 'sal' : 'animate') + '="' + aos + '"'); continue; }
      const st = attr(a, 'style') || '';
      // word-by-word headline splits and absolutely placed diagram nodes are not section reveals
      if (hiddenStart(st) && down(st) && !/^(span|em|strong|b|i|a|tspan|g|path|rect|circle)$/i.test(m[1]) && !/inline-block/i.test(st) && !/(?:^|;)\s*(?:left|top)\s*:\s*-?\d/i.test(st)) { add('style="' + st.replace(/\s+/g, ' ').slice(0, 50) + '"'); continue; }
      const cls = (attr(a, 'class') || '').split(/\s+/).filter(Boolean);
      const hit = cls.find(x => /^(?:animate__)?fadeInUp$|^animate-fade-?(?:in-?)?up\b|^fade-?(?:in-?)?up$/i.test(x)) || cls.find(x => revealCls.has(x.toLowerCase()));
      if (hit) add('class "' + hit + '"');
    }
    if (n < 8) return null;
    const top = Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => v + '× ' + k).join(', ');
    const rm = /prefers-reduced-motion/i.test(c.text || c.css) || /motion-safe:|motion-reduce:/.test(c.classes);
    return {evidence:[n + ' elements start hidden and shifted down for a scroll reveal: ' + top, rm ? 'a prefers-reduced-motion rule exists' : 'no prefers-reduced-motion rule anywhere']}; } },

{ code:'A67', id:'content-stuck-waiting-to-appear', name:'Content Stuck Waiting To Appear',
  fix:'Make content visible by default and animate only as an enhancement; reveal anything on screen at load immediately.',
  test(c){
    // On a whole rendered page: the hero headline (first h1), which is on screen at load, still carries an
    // inline opacity of 0 (or an AOS hide without aos-animate) in the rendered DOM. Snippets cannot show this.
    // A snippet only counts when nothing in it could ever reveal the headline (no script, animation or observer).
    if (!c.isFullDoc && /<script|transition|animation|animate|initial\s*=|whileInView|data-aos|IntersectionObserver|@keyframes|\bmotion\./i.test(c.text)) return null;
    const body = (/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(c.html) || [, c.html])[1];
    const h1 = /<h1\b/i.exec(body); if (!h1) return null;
    const words = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    // ancestors of the h1 plus the h1 and its descendants
    const stack = []; let h1node = null;
    for (const m of all(/<(\/?)([a-z][\w-]*)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi, body)) {
      if (m.index > h1.index) break;
      const tag = m[2].toLowerCase();
      if (m[1]) { for (let j = stack.length - 1; j >= 0; j--) if (stack[j].tag === tag) { stack.length = j; break; } continue; }
      if (VOIDTAG.test(tag) || /\/\s*$/.test(m[3])) continue;
      stack.push({ tag, a: m[3], i: m.index });
    }
    const end = body.indexOf('</h1>', h1.index); if (end < 0) return null;
    const h1html = body.slice(h1.index, end);
    const text = h1html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (words(h1html) < 2) return null;
    const HIDE = /(?:^|;|\s)opacity\s*:\s*0(?:\.0\d*)?\s*(?:!important)?\s*(?:;|$)/i;
    const st = a => (/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(' ' + a) || [])[1] || '';
    // a running CSS/WAAPI animation overrides the inline opacity (animate-* classes, framer appear animations)
    const animCls = new Set();
    for (const r of rules(c.css)) if (r.sel !== '[inline-style]' && /(?:^|;|\s)animation(?:-name)?\s*:\s*(?!none)[\w-]/i.test(r.body))
      for (const p of parts(r.sel)) { const m = /\.([\w-]+)$/.exec(p); if (m) animCls.add(m[1].toLowerCase()); }
    const animated = a => /\sdata-framer-appear-id\s*=/i.test(' ' + a) || ((/\bclass\s*=\s*["']([^"']*)/i.exec(a) || [, ''])[1]).split(/\s+/).some(x => /^animate-/.test(x) || animCls.has(x.toLowerCase()));
    const chain = stack.slice(-8);  // h1 itself and its nearest ancestors (not <html>/<body> chrome)
    for (const n of chain) {
      if (/^(html|body)$/.test(n.tag)) continue;
      if (/aria-hidden\s*=\s*["']true|\bdata-sp-hidden\b/i.test(n.a)) return null;
      if (/(?:^|[\s"'])(?:modal|dialog|popup|drawer|menu|carousel|slide|swiper|tab-pane|marquee)/i.test(n.a)) return null;
      const s = st(n.a);
      if (HIDE.test(s) && animated(n.a)) return null;
      if (HIDE.test(s)) return {evidence:['<' + n.tag + (n.tag === 'h1' ? '' : '> wrapping the <h1') + '> "' + text.slice(0, 50) + '" still has inline ' + (/opacity\s*:\s*[\d.]+/i.exec(s)||['opacity:0'])[0] + ' after load']};
      if (/\sdata-aos\s*=/i.test(' ' + n.a) && /\baos-init\b/.test(n.a) && !/\baos-animate\b/.test(n.a)) return {evidence:['<' + n.tag + '> around the <h1> "' + text.slice(0, 50) + '" has data-aos but never got aos-animate after load']};
    }
    // descendants of the h1 carrying most of its words
    const tot = words(h1html); let hid = 0;
    for (const m of all(/<([a-z][\w-]*)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi, h1html)) {
      if (!HIDE.test(st(m[2])) || animated(m[2])) continue;
      const close = h1html.indexOf('</' + m[1], m.index); if (close < 0) continue;
      hid += words(h1html.slice(m.index, close));
    }
    // a word rotator hides the alternates; only flag when the hidden words are most of the headline
    if (tot >= 2 && hid * 10 >= tot * 8 && hid <= tot) return {evidence:[hid + ' of ' + tot + ' words of the <h1> "' + text.slice(0, 50) + '" sit in inline opacity:0 spans after load']};
    return null; } },

{ code:'A21', id:'reflex-cream', name:'Reflex Cream',
  fix:'Derive neutrals from the brand hue; choose warmth because the product calls for it, not as the default alternative to purple.',
  test(c){
    // page background is a warm cream (hue 25-55, near-white, a little chroma) AND the primary button or the
    // declared primary/accent colour is amber/orange/terracotta.
    const cream = rgb => { if (!rgb) return false; const h = rgbToHsl(rgb), ch = Math.max(...rgb) - Math.min(...rgb);
      return h.h >= 25 && h.h <= 55 && h.l >= 92 && ch >= 6 && ch <= 32 && rgb[2] < rgb[0]; };
    const amber = rgb => { if (!rgb) return false; const h = rgbToHsl(rgb); return h.h >= 12 && h.h <= 45 && h.s >= 55 && h.l >= 30 && h.l <= 62; };
    const vars = {};
    for (const r of rules(c.css)) for (const m of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) if (!(m[1] in vars)) vars[m[1]] = m[2].trim();
    const res = (v, d = 0) => { const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)$/.exec((v||'').trim()); return m && d < 4 ? res(vars[m[1]] ?? m[2], d + 1) : v; };
    const colOf = (body, prop) => { const m = new RegExp('(?:^|;|\\s)' + prop + '\\s*:\\s*([^;!]+)', 'i').exec(body); if (!m) return null;
      let v = res(m[1].trim()); if (!v) return null;
      if (/^[\d.]+\s+[\d.]+%\s+[\d.]+%$/.test(v.trim())) { const [hh, ss, ll] = v.trim().split(/\s+/).map(parseFloat); return hsl2rgb(hh, ss, ll); }
      const hm = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*\)$/i.exec(v.trim()); if (hm) return hsl2rgb(+hm[1], +hm[2], +hm[3]);
      return parseColor(v.trim()); };
    function hsl2rgb(h, s, l){ s/=100; l/=100; const k = n => (n + h/30) % 12, a = s * Math.min(l, 1-l);
      return [0,8,4].map(n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n)-3, 9-k(n), 1))))); }
    // 1. page background
    let bg = null, bgWhere = null;
    for (const r of rules(c.css)) {
      if (!parts(r.sel).some(p => /^(html|body|:root|main|#__next|#root|#app)$/.test(p))) continue;
      const v = colOf(r.body, 'background-color') || colOf(r.body, 'background');
      if (v) { bg = v; bgWhere = r.sel.slice(0, 20); }
    }
    const bodyTag = (/<body\b([^>]*)>/i.exec(c.html) || [, ''])[1];
    const twBg = /\bbg-\[(#[0-9a-f]{3,6})\]/i.exec(bodyTag);
    if (twBg) { bg = parseColor(twBg[1]); bgWhere = 'body class'; }
    const bst = /style\s*=\s*["'][^"']*background(?:-color)?\s*:\s*(#[0-9a-f]{3,6})/i.exec(bodyTag);
    if (bst) { bg = parseColor(bst[1]); bgWhere = 'body style'; }
    if (!cream(bg)) return null;
    // class -> background colour, from single-class rules
    const clsBg = {}, clsImg = new Set();
    for (const r of rules(c.css)) { const m = /^\.((?:[\w-]|\\.)+)$/.exec(r.sel.trim()); if (!m) continue; const k = m[1].replace(/\\/g, '');
      const v = colOf(r.body, 'background-color') || colOf(r.body, 'background'); if (v) clsBg[k] = v;
      if (/background(?:-image)?\s*:[^;]*(?:gradient|url)\(/i.test(r.body)) clsImg.add(k); }
    // 2. the first screen must actually sit on that cream: no ancestor of the h1 (or the top wrappers) paints another ground
    const light = rgb => cream(rgb) || (rgb && Math.min(...rgb) >= 242);
    { const body = (/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(c.html) || [, c.html])[1];
      const h1 = /<h1\b/i.exec(body); const lim = h1 ? h1.index + 1 : 4000; const stack = [];
      for (const m of all(/<(\/?)([a-z][\w-]*)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi, body)) {
        if (m.index >= lim) break; const tag = m[2].toLowerCase();
        if (m[1]) { for (let j = stack.length - 1; j >= 0; j--) if (stack[j].tag === tag) { stack.length = j; break; } continue; }
        if (VOIDTAG.test(tag) || /\/\s*$/.test(m[3])) continue; stack.push({ tag, a: m[3] }); }
      const chain = h1 ? stack : stack.slice(0, 4);
      for (const n of chain) {
        if (/^(nav|header|svg|a|button)$/.test(n.tag)) continue;
        const st = (/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(' ' + n.a) || [])[1] || '';
        if (/background(?:-image)?\s*:[^;]*(?:gradient|url)\(/i.test(st)) return null;
        const sc = colOf(st, 'background-color') || colOf(st, 'background'); if (sc && !light(sc)) return null;
        for (const x of ((/\bclass\s*=\s*["']([^"']*)/i.exec(n.a) || [, ''])[1]).split(/\s+/).filter(Boolean)) {
          if (clsImg.has(x) || /^bg-(?:gradient|\[url|\[linear|\[radial)/.test(x)) return null;
          const tb = /^bg-\[(#[0-9a-f]{3,6})\]$/i.exec(x); if (tb && !light(parseColor(tb[1]))) return null;
          if (clsBg[x] && !light(clsBg[x])) return null;
        } } }
    // 3. the accent: an amber/orange/terracotta colour the live CSS actually paints with (text, fill, border or button)
    let acc = null; const uses = [];
    for (const r of rules(c.css)) {
      if (/:(hover|focus|active|disabled|checked|visited)|::?(before|after|selection|placeholder|-webkit)/i.test(r.sel)) continue;
      for (const prop of ['background-color','background','color','border-color','fill']) {
        const v = colOf(r.body, prop); if (amber(v)) { uses.push(r.sel.trim().replace(/\s+/g, ' ').slice(0, 26) + ' ' + prop + ' ' + hex(v)); break; } }
    }
    for (const m of all(/\b(?:bg|text|border)-(orange|amber)-[567]00\b/g, c.classes)) uses.push(m[0]);
    const u = [...new Set(uses)]; if (u.length >= 2) acc = u.slice(0, 2).join('; ');
    if (!acc) return null;
    return {evidence:['cream page background ' + hex(bg) + ' (' + bgWhere + ')', 'amber/orange accent: ' + acc]}; } },

{ code:'A13', id:'the-conveyor-belt-page', name:'The Conveyor Belt Page',
  fix:'Write the argument first: order sections by what this buyer needs to believe, and cut blocks that exist only because templates have them.',
  test(c){
    // section headings (h2/h3) and section ids, outside nav/header/footer, classified into the template blocks;
    // flag when at least 5 of the 7 post-hero blocks appear in template order.
    const ORDER = ['logos','features','how','testimonials','pricing','faq','cta'];
    const K = {
      logos: /^(?:trusted|used|loved|relied on|backed|chosen) by\b|\bteams? at\b|\bcompanies (?:like|that)|\bas seen (?:on|in)\b|\bfeatured (?:in|on)\b|^our (?:customers|clients|partners)$/i,
      features: /^(?:features|key features|core features|all features|platform features|everything you need\b.*|why (?:choose|use)\b.*|what you get|capabilities|benefits)$/i,
      how: /^how (?:it|does it|this) works?\b|^how to (?:get started|use)\b|^(?:get started|up and running) in \w+ (?:simple |easy )?steps|^\w+ (?:simple |easy )?steps\b|^the process$/i,
      testimonials: /^(?:testimonials|don'?t (?:just )?take our word\b.*|what (?:our |people |users |customers |clients |developers |founders |teams )?(?:are )?(?:say(?:ing)?|think)\b.*|wall of love|loved by\b.*|reviews|customer stories|hear from\b.*)$/i,
      pricing: /^(?:pricing|plans|plans (?:&|and) pricing|simple(?:,)? (?:transparent )?pricing\b.*|transparent pricing|choose (?:your|a) plan|pricing plans)$/i,
      faq: /^(?:faqs?|frequently asked questions|questions\??|common questions|got questions\??|have questions\??)$/i,
      cta: /^(?:ready to\b.*|get started(?: today| now| for free)?[.!]?|start (?:your free trial|for free|building|today)\b.*|try it (?:now|free|today)\b.*|join (?:thousands|the waitlist|today)\b.*)$/i };
    const IDS = { logos:/^(?:logos?|logo-cloud|clients|customers|trusted-by|social-proof|brands)$/i, features:/^features$/i, how:/^how-it-works|^how$/i,
      testimonials:/^testimonials?$|^reviews$/i, pricing:/^pricing$/i, faq:/^faqs?$/i, cta:/^cta$|^get-started$/i };
    let body = (/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(c.html) || [, c.html])[1];
    body = body.replace(/<(nav|header|footer|aside|dialog)\b[\s\S]*?<\/\1>/gi, m => ' '.repeat(m.length));
    const h1 = /<h1\b/i.exec(body); const start = h1 ? h1.index : 0;
    const marks = [];
    for (const m of all(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi, body)) {
      if (m.index < start) continue;
      const t = m[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim().replace(/[.!?:]+$/, '');
      for (const k of ORDER) if (K[k].test(t)) { marks.push({ k, i: m.index, t }); break; }
    }
    // a short trust line above a logo row is usually a <p>, not a heading
    for (const m of all(/<(p|span|div)\b[^>]*>([^<]{6,60})<\/\1>/gi, body)) {
      if (m.index < start) continue; const t = m[2].replace(/\s+/g, ' ').trim().replace(/[.:]+$/, '');
      if (/^(?:trusted|used|loved|relied on|backed) by\b(?!.*\b(?:review|say)).{0,40}$|^(?:as seen|featured) (?:on|in)$/i.test(t)) marks.push({ k: 'logos', i: m.index, t });
    }
    for (const m of all(/<(?:section|div)\b[^>]*\bid\s*=\s*["']([^"']+)["']/gi, body)) {
      if (m.index < start) continue;
      for (const k of ORDER) if (IDS[k].test(m[1])) { marks.push({ k, i: m.index, t: '#' + m[1] }); break; }
    }
    // first occurrence of each block
    const first = {};
    for (const x of marks.sort((a, b) => a.i - b.i)) if (!(x.k in first)) first[x.k] = x;
    const seq = Object.values(first).sort((a, b) => a.i - b.i);
    // longest subsequence in template order
    const idx = seq.map(x => ORDER.indexOf(x.k)); const L = idx.map(() => 1), P = idx.map(() => -1);
    for (let i = 0; i < idx.length; i++) for (let j = 0; j < i; j++) if (idx[j] < idx[i] && L[j] + 1 > L[i]) { L[i] = L[j] + 1; P[i] = j; }
    let best = -1; for (let i = 0; i < L.length; i++) if (best < 0 || L[i] > L[best]) best = i;
    if (best < 0 || L[best] < 5) return null;
    const chain = []; for (let i = best; i >= 0; i = P[i]) chain.unshift(seq[i]);
    return {evidence:['hero, then ' + chain.map(x => '"' + x.t.slice(0, 24) + '"').join(' → '), (L[best] + 1) + ' of 8 template blocks in template order']}; } },

{ code:'A5', id:'the-invented-stat-row', name:'The Invented Stat Row',
  fix:'Publish only numbers you can defend, with a unit, a date and a source; if you have none yet, say something true instead.',
  test(c){
    // a container whose direct children (>= 3) each lead with a short big-number claim and a short label, where
    // at least two figures are round flattering claims (10K+, 1,000+, 99.9%, 4.9/5, 24/7, 10x) and nothing in the
    // row links to or cites a source.
    const NUM = /^(?:[$€£]?\d{1,3}(?:[,.]\d{3})*(?:\.\d+)?\s*[KkMBk]?\+?%?|\d(?:\.\d)?\s*\/\s*5|24\/7|\d+(?:\.\d+)?x|<\s*\d+\s*(?:ms|s|min)|\d+(?:\.\d+)?\s*(?:ms|s))$/;
    const ROUND = /^(?:\d{1,3}(?:,000)+\+|\d+(?:\.\d)?\s*[KkMB]\+|\d{2,3}0\+|\d{2,}%\+?|99(?:\.9+)?%|4\.[5-9]\s*\/\s*5|24\/7|\d+x)$/;
    const ev = [];
    const strip = s => s.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const BIG = /\btext-(?:[3-9]xl)\b|\b(?:display|stat|metric|number|counter|figure|big|huge|count)\b/i;
    // element tree as index ranges only (no copies of markup)
    const groups = [];
    { const stack = [{ kids: [] }];
      for (const m of all(/<(\/?)([a-z][\w-]*)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi, c.html)) {
        const tag = m[2].toLowerCase();
        if (m[1]) { for (let j = stack.length - 1; j > 0; j--) if (stack[j].tag === tag) { const n = stack[j]; n.end = m.index + m[0].length;
            for (let q = stack.length - 1; q >= j; q--) { const x = stack[q]; if (x.end == null) x.end = m.index; if (x.kids.length >= 3 && x.kids.length <= 8) groups.push(x.kids); }
            stack.length = j; break; } continue; }
        const node = { tag, start: m.index, end: null, kids: [] };
        stack[stack.length - 1].kids.push(node);
        if (!VOIDTAG.test(tag) && !/\/\s*$/.test(m[3])) stack.push(node); else node.end = m.index + m[0].length;
      } }
    for (const g of groups) { const kids = g.map(k => ({ tag: k.tag, get inner(){ return c.html.slice(k.start, k.end == null ? k.start : k.end); } }));
      const items = kids.filter(k => !/^(script|style|br|hr|img|svg|template)$/.test(k.tag));
      if (items.length < 3 || items.length > 6) continue;
      const stats = [];
      for (const k of items) {
        const lines = strip(k.inner); if (!lines.length || lines.length > 4) break;
        const n = lines.find(x => NUM.test(x));
        const label = lines.filter(x => x !== n).join(' ');
        if (!n || !label || label.split(' ').length > 8 || /^\$/.test(n)) break;
        stats.push({ n, label, big: BIG.test(k.inner) || /<(h[1-4]|strong|b)\b/i.test(k.inner), link: /<a\b|<sup\b|\*/.test(k.inner) });
      }
      if (stats.length !== items.length) continue;
      const round = stats.filter(s => ROUND.test(s.n.replace(/\s+/g, '')));
      if (round.length < 2 || stats.filter(s => s.big).length < stats.length - 1 || stats.some(s => s.link)) continue;
      ev.push(stats.map(s => s.n + ' ' + s.label.slice(0, 22)).join(' · '));
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,2)} : null; } },

{ code:'A41', id:'not-x-but-y', name:'Not X. But Y.',
  fix:'Cut the negative half and state the positive claim with evidence; if the contrast matters, name the real alternative.',
  test(c){
    // The negation pivot in the page's own copy: "Not just X, but Y", "It isn't X. It's Y.", "Not a tool. A teammate."
    // Counted per text block (heading, p, li, ...). Flag one in a heading or short block (<= 25 words), or two anywhere.
    const body = (/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(c.html) || [, c.html])[1]
      .replace(/<(script|style|pre|code|svg|textarea|template|noscript|blockquote)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    const parts = body.split(/(<\/?(?:p|li|h[1-6]|div|td|th|tr|dt|dd|figcaption|section|article|header|footer|nav|ul|ol|br|button|label|option|table|main|aside|summary|details)\b[^>]*>)/i);
    const dec = s => s.replace(/<[^>]*>/g, ' ').replace(/&(?:#8217|#x2019|rsquo|#39|apos);/gi, "'").replace(/&(?:mdash|#8212|#x2014|ndash|#8211);/gi, '—')
      .replace(/&(?:nbsp|#160);/gi, ' ').replace(/&amp;/gi, '&').replace(/&[#\w]+;/g, ' ').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
    const SUBJ = "(?:it|this|that|they|we|you|he|she|[A-Z][\\w.-]{1,24})";
    const COP = "(?:it'?s|it is|this is|that'?s|they'?re|they are|we'?re|we are|you'?re|he'?s|she'?s)";
    const RES = [
      // "not just/merely X, (but|it's) Y" (the correlative "not only X but also Y" is ordinary grammar and left out)
      new RegExp("\\bnot (?:just|merely|simply) (?:a |an |the |about |for |another )?[^.!?;:]{1,50}?(?:[,;:—–]\\s*|\\s+-\\s+|\\.\\s+|\\s+)(?:but|" + COP + ")\\b", 'i'),
      // "It isn't X. It's Y." / "This is not about X — it's about Y"
      new RegExp("(?:^|[.!?]\\s+)" + SUBJ + "(?:\\s+(?:is|are) not|'s not|'re not|\\s+(?:isn'?t|aren'?t)) (?:just |merely |really )?(?:a |an |the |about |another |for )?[^.!?;]{1,45}?(?:[.;—–]\\s*|,\\s*)" + COP + "\\b", ''),
      // "Not a feature. A platform."  /  "No X. Just Y."
      // "Content is not the goal. Revenue is."
      /(?:^|[.!?]\s+)[A-Z][\w' -]{1,30} (?:is|are) not [\w' -]{2,30}[.;—–]\s*[A-Z][\w' -]{1,30} (?:is|are)[.!]/,
      /(?:^|[.!?]\s+)Not (?:just )?(?:a|an|another|your) [\w' -]{2,30}[.,;—–]\s*(?:A|An|It'?s an?|It'?s your|Your) [\w' -]{2,40}[.!]?(?:\s|$)/i,
    ];
    let n = 0, strong = 0; const ex = [];
    let inHead = 0;
    for (const p of parts) {
      if (/^<h[1-3]\b/i.test(p)) { inHead = 1; continue; }
      if (/^<\/h[1-3]\b/i.test(p)) { inHead = 0; continue; }
      if (/^</.test(p)) continue;
      const t = dec(p); if (!/[a-z]/i.test(t)) continue;
      const words = (t.match(/[A-Za-z][\w'-]*/g) || []).length;
      for (const re of RES) {
        const m = re.exec(t); if (!m) continue;
        // "not just X but also Y" is the correlative; "..., it's not even Y" is a second negation, not a pivot
        const after = t.slice(m.index + m[0].length, m.index + m[0].length + 12);
        if (/^\s+also\b/i.test(after) || /^\s+(?:not|never|no)\b/i.test(after)) continue;
        // across a full stop, "We're / You're ..." starts a new thought ("not just another startup. We're hiring"), not the second half
        if (/\.\s+(?:we|you)(?:'re| are)\b/i.test(m[0])) continue;
        // status negations ("isn't there yet; it's coming", "is not available, it's ...") are not a contrast of identities
        const x = (/(?:isn'?t|aren'?t|is not|are not|not) (?:just |only |merely |really )?(\S+)/i.exec(m[0]) || [, ''])[1].toLowerCase();
        if (/^(there|here|yet|ready|available|done|out|in|on|up|over|possible|enough|working|supported|needed|required|perfect|finished|live|open|free|currently|always|ever|too|that|very|so|as)$/.test(x)) continue;
        // negated verbs ("does not just store X, it ...") are only the pattern in a slogan-length line
        n++; if (inHead || words <= 25) strong++;
        const st = m.index + (/^[.!?]\s+/.exec(m[0]) || [''])[0].length, tail = t.slice(m.index + m[0].length).search(/[.!?](?:\s|$)/);
        const sent = t.slice(st, tail < 0 ? t.length : m.index + m[0].length + tail + 1);
        if (ex.length < 3) ex.push('"' + (sent.length > 110 ? sent.slice(0, 107) + '...' : sent) + '"' + (inHead ? ' (heading)' : ''));
        break;
      }
    }
    if (!(strong >= 1 || n >= 2)) return null;
    return {evidence:[...new Set(ex)]}; } },

{ code:'A42', id:'tricolon-everything', name:'Tricolon Everything',
  fix:'List what is true, in whatever number it comes, and vary sentence length.',
  test(c){
    // The checkable form: a heading or short line that is exactly three one- or two-word sentences ("Fast. Simple. Secure.").
    const body = (/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(c.html) || [, c.html])[1]
      .replace(/<(script|style|pre|code|svg|textarea|template|noscript)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    const dec = s => s.replace(/<[^>]*>/g, ' ').replace(/&(?:#8217|#x2019|rsquo|#39|apos);/gi, "'").replace(/&(?:nbsp|#160);/gi, ' ')
      .replace(/&amp;/gi, '&').replace(/&[#\w]+;/g, ' ').replace(/\s+/g, ' ').trim();
    const W = "[A-Za-z][A-Za-z'’-]*";
    const TRI = new RegExp("^(?:" + W + "(?: " + W + ")?[.!] ){2}" + W + "(?: " + W + ")?[.!]$");
    const ex = []; let head = 0, n = 0;
    const seen = new Set();
    for (const m of all(/<(h[1-6]|p|div|span|li|strong|b|em)\b[^>]*>((?:(?!<\/?(?:h[1-6]|p|div|li|section|ul|ol)\b)[\s\S]){3,300}?)<\/\1>/gi, body)) {
      const t = dec(m[2]);
      if (!TRI.test(t)) continue;
      const toks = t.split(/[.!]\s*/).filter(Boolean).map(s => s.toLowerCase());
      // "Yes. No. Maybe." style answers and repeated words ("Go. Go. Go.") are not claims
      // initials and abbreviations ("Kenneth T. v. Andrea F.", "U.S. Inc.") are not three sentences
      if (/(?:^|\s)[A-Za-z][.!]/.test(t) || new Set(toks).size < 3 || toks.some(s => /^(yes|no|ok|okay|maybe|etc|inc|ltd|co|vs|dr|mr|mrs|ms|st)$/.test(s))) continue;
      const key = t.toLowerCase(); if (seen.has(key)) continue; seen.add(key);
      n++; if (/^h/i.test(m[1])) head++;
      if (ex.length < 3) ex.push('"' + t + '"' + (/^h/i.test(m[1]) ? ' in <' + m[1].toLowerCase() + '>' : ''));
    }
    if (head >= 1 || n >= 2) return {evidence:ex};
    return null; } },

{ code:'A14', id:'trusted-by-nobody', name:'Trusted By Nobody',
  fix:'Show logos only for real customers who agreed, link each to its story, or say something specific instead.',
  test(c){
    // The checkable form is the logo wall: a "trusted by / used by / backed by" line followed by >= 4 logo images
    // (img or svg) that are greyed out (grayscale filter or opacity <= 0.6, from a class rule or inline style) and not links.
    // Placeholder brand names in alt text or file names (Acme, Globex, Logoipsum ...) are flagged on their own.
    const html = c.html, ev = [];
    const PLACE = /\b(acme(?:\s*(?:corp|inc|co))?|globex|initech|umbrella\s*corp|hooli|logoipsum|placeholder[-_ ]?logo)\b/i;
    // greyed classes from CSS
    const grey = new Set();
    for (const r of rules(c.css)) {
      const g = /filter\s*:[^;]*grayscale\(\s*(?:1|100%|0?\.[6-9]\d*|[6-9]\d%)?\s*\)/i.test(r.body) && !/:hover|:focus/.test(r.sel);
      const op = /(?:^|;|\s)opacity\s*:\s*(0?\.\d+|0)\s*(?:!important)?\s*(?:;|$)/i.exec(r.body);
      if (!(g || (op && +op[1] > 0 && +op[1] <= 0.6)) || /:hover|:focus/.test(r.sel)) continue;
      for (const p of r.sel.split(',')) { const last = p.trim().split(/[\s>+~]+/).pop() || ''; for (const m of all(/\.([\w-]+)/g, last)) grey.add(m[1]); if (/^(img|svg)$/i.test(last)) { const ctx = all(/\.([\w-]+)/g, p).map(m => m[1]); if (ctx.length) grey.add('<' + last.toLowerCase() + ' ' + ctx.join(' ')); } }
    }
    const TWG = /(?:^|\s)(grayscale|opacity-(?:[1-5]\d|60|[1-9]0?)|brightness-0)(?=\s|$)/;
    let segCls = new Set();
    const isGrey = (tag, attrs) => {
      const cls = (/\bclass(?:Name)?\s*=\s*["']([^"']*)["']/i.exec(attrs) || [, ''])[1];
      const st = (/\bstyle\s*=\s*["']([^"']*)["']/i.exec(attrs) || [, ''])[1];
      if (/grayscale\(/i.test(st)) return 'grayscale (inline)';
      const o = /opacity\s*:\s*(0?\.\d+)/i.exec(st); if (o && +o[1] <= 0.6) return 'opacity ' + o[1] + ' (inline)';
      const tw = TWG.exec(cls); if (tw) return tw[1];
      for (const k of cls.split(/\s+/)) if (k && grey.has(k)) return '.' + k;
      for (const k of grey) { if (!k.startsWith('<' + tag + ' ')) continue; const hit = k.slice(tag.length + 2).split(' ').find(x => segCls.has(x)); if (hit) return '.' + hit + ' ' + tag; }
      return null;
    };
    const HEAD = /\b(trusted by|loved by|used by|backed by|relied on by|chosen by|powering|teams at|companies (?:like|that)|as seen (?:in|on)|featured (?:in|on)|^our (?:customers|clients|partners|investors)$)/i;
    for (const m of all(/>([^<]{0,120}?)</g, html)) {
      const label = m[1].replace(/&[#\w]+;/g, ' ').replace(/\s+/g, ' ').trim();
      // the label line itself: the phrase opens it ("Trusted by ...", "- trusted by ..."), at most ten words
      const hm = HEAD.exec(label);
      if (!hm || label.slice(0, hm.index).split(/\s+/).filter(w => /\w/.test(w)).length > 2 || label.split(/\s+/).length > 10) continue;
      const start = m.index + m[0].length - 1;
      const win = html.slice(start, start + 12000);
      // stop at the next heading or section boundary after the logos would start
      const stop = win.search(/<\/section>|<h[1-3]\b|<footer\b/i);
      const seg = stop > 0 ? win.slice(0, stop) : win;
      segCls = new Set(all(/\bclass\s*=\s*["']([^"']*)["']/gi, html.slice(Math.max(0, m.index - 3000), start + 12000)).flatMap(x => x[1].split(/\s+/)));
      const logos = []; let greyed = 0, linked = 0, why = null, place = null;
      // greyness may sit on a wrapper: track greyed open containers
      for (const t of all(/<(img|svg)\b([^>]*)>|<a\b[^>]*>|<\/a>/gi, seg)) {
        if (/^<a\b/i.test(t[0])) { linked++; continue; }
        if (/^<\/a>/i.test(t[0])) { linked = Math.max(0, linked - 1); continue; }
        const tag = t[1].toLowerCase(), attrs = t[2];
        if (tag === 'svg' && /\b(width|height)\s*=\s*["']?(1\d|[1-9])(?:px)?["'\s]/i.test(attrs) && !/\bviewBox="0 0 (?:[5-9]\d|\d{3,})/i.test(attrs)) continue; // tiny icons
        const g = isGrey(tag, attrs) || (() => { const before = seg.slice(Math.max(0, t.index - 600), t.index);
          const opens = all(/<(?:div|li|span|figure|ul)\b([^>]*)>/gi, before); const lastOpen = opens[opens.length - 1]; return lastOpen ? isGrey('div', lastOpen[1]) : null; })();
        const alt = (/\balt\s*=\s*["']([^"']*)["']/i.exec(attrs) || [, ''])[1], src = (/\bsrc\s*=\s*["']([^"']*)["']/i.exec(attrs) || [, ''])[1];
        if (PLACE.test(alt) || PLACE.test(src.split('/').pop())) place = place || (alt || src.split('/').pop());
        // people (testimonial headshots, avatars) are not logos
        if (/headshot|avatar|portrait|profile|photo of|\bface\b/i.test(alt + ' ' + attrs)) continue;
        logos.push({ g, linked: linked > 0 });
        if (g) { greyed++; why = why || g; }
      }
      if (place && logos.length >= 3) { ev.push('logo row under "' + label.slice(0, 40) + '" includes placeholder logo "' + place.slice(0, 30) + '"'); break; }
      const free = logos.filter(l => l.g && !l.linked).length;
      if (logos.length >= 4 && free >= 4 && free >= logos.length * 0.6) {
        ev.push(free + ' greyed, unlinked logos (' + why + ') under "' + label.slice(0, 40) + '"'); break;
      }
    }
    return ev.length ? {evidence:ev} : null; } },

{ code:'B89', id:'accuracy-number-nobody-tested', name:'Accuracy Number Nobody Tested',
  fix:'Put the benchmark, dataset, date and metric next to the accuracy figure, or drop the number.',
  test(c){
    // A precise accuracy/detection/precision figure in visible copy, with no methodology, benchmark,
    // dataset or source anywhere near it (same block of text, roughly one section either side).
    const ev = [];
    const body = (/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(c.html) || [, c.html])[1]
      .replace(/<(pre|code|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    // keep link hrefs visible to the proximity check
    const flat = body.replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>/gi, ' [href:$1] ').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    const CLAIM = /(?:\b(\d{2}(?:\.\d+)?)\s?%\s*(?:accura(?:te|cy)|precision|precise|detection(?: rate)?|recall)\b|\b(?:accuracy|precision|detection rate|recall)\s+(?:of|rate of|up to|over|above|at|:)?\s*(?:up to\s+|over\s+|>\s*)?(\d{2}(?:\.\d+)?)\s?%)/gi;
    const METHOD = /benchmark|trained|training|epochs?\b|validation|cross.valid|model achieves|methodolog|dataset|data set|evaluat|test set|tested (?:on|against|with)|validation set|ground truth|paper|arxiv|study|studies|peer.review|f1|auc|roc\b|confusion|leaderboard|according to|source:|measured (?:on|against|across)|compared (?:to|against|with)|vs\.? (?:human|gpt|baseline)|\[href:[^\]]*(?:arxiv|paper|benchmark|eval|method|research|doi\.org|github\.com|huggingface)/i;
    for (const m of all(CLAIM, flat)) {
      const v = parseFloat(m[1] || m[2]);
      if (!(v >= 90 && v <= 100)) continue;   // a weak number is not the confident-claim pattern
      const win = flat.slice(Math.max(0, m.index - 500), m.index + m[0].length + 500);
      if (METHOD.test(win)) continue;
      ev.push('"' + flat.slice(Math.max(0, m.index - 30), m.index + m[0].length + 10).trim() + '" with no benchmark or method nearby');
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,2)} : null; } },

{ code:'B104', id:'refusal-text-goes-live', name:'Refusal Text Goes Live',
  fix:'Lint generated copy before it ships: reject refusal phrases, "as an AI" disclaimers and unfilled [placeholder] slots.',
  test(c){
    // Leaked model output in copy a visitor reads: refusals, "as an AI language model", knowledge-cutoff
    // disclaimers, and unfilled prompt slots like [insert X] / [Product Name]. Code, pre, blockquote and
    // quoted text are skipped: pages about LLMs quote these phrases on purpose.
    const ev = [];
    const body = (/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(c.html) || [, c.html])[1]
      .replace(/<(pre|code|textarea|blockquote|kbd|samp|q)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    const flat = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&#39;|&#x27;|&rsquo;|’/g, "'").replace(/&quot;|&ldquo;|&rdquo;|[“”]/g, '"').replace(/\s+/g, ' ');
    const RE = /\bas an AI (?:language model|assistant|model)\b|\bI(?:'m| am) sorry,? but (?:I|as an AI) (?:can't|cannot|am unable|'m unable)\b|\bI (?:cannot|can't) (?:fulfill|fulfil|comply with|assist with) (?:this|that|your) request\b|\bgoes against (?:OpenAI|my) (?:use )?polic|\bmy (?:knowledge cutoff|training data (?:only )?goes up to|last (?:knowledge )?update)\b|\[(?:insert|add|enter) (?:your |the |a )?[a-z][a-z ]{2,30}\]|\[(?:product|company|brand|business|customer) name\]|\[(?:task|feature|benefit|product) \d\]/gi;
    for (const m of all(RE, flat)) {
      const before = flat.slice(Math.max(0, m.index - 80), m.index);
      // quoted or framed as an example of bad output ("responses like 'as an AI…'")
      if (/["'«]\s*[^"'«»]{0,40}$/.test(before) && /["'»]/.test(flat.slice(m.index + m[0].length, m.index + m[0].length + 60))) continue;
      if (/\b(?:no more|without|never|instead of|avoid|tired of|stop|filters?|detect|removes?|no)\b[^.]{0,40}$/i.test(before)) continue;
      ev.push('"' + flat.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20).trim() + '"');
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'B109', id:'prompt-as-alt-text', name:'Prompt as Alt Text',
  fix:'Write alt text that says what the image shows and why it is there; never paste the generation prompt.',
  test(c){
    // img alt text that reads as an image-generation prompt: several prompt-vocabulary terms
    // (8k, photorealistic, trending on artstation, octane render, --ar 16:9, cinematic lighting...).
    const ev = [];
    const TERMS = /\b(?:8k|4k|uhd|hdr|photorealistic|photo-?realistic|hyper-?realistic|ultra-?realistic|hyper-?detailed|highly detailed|ultra detailed|intricate details?|trending on (?:artstation|behance)|artstation|unreal engine|octane render|v-?ray|cinematic lighting|volumetric lighting|studio lighting|bokeh|depth of field|sharp focus|masterpiece|best quality|award.winning photo(?:graph)?|digital art|concept art|by greg rutkowski|midjourney|stable diffusion|dall-?e|--ar \d+:\d+|--v \d|--style \w+|--q \d)\b/gi;
    for (const m of all(/<img\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi, c.html)) {
      const a = /\salt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(' ' + m[1]);
      if (!a) continue;
      const alt = (a[1] ?? a[2]).replace(/&amp;/g, '&');
      const hits = new Set(all(TERMS, alt).map(x => x[0].toLowerCase()));
      // one unmistakable prompt modifier in a sentence-length alt also counts ("A hyper-realistic portrait of ...")
      const strong = /\b(?:photo-?realistic|hyper-?realistic|ultra-?realistic|hyper-?detailed|highly detailed|intricate details|trending on artstation|octane render|cinematic lighting|volumetric lighting|sharp focus|8k)\b/i.test(alt);
      const flag = /--(?:ar|v|style|q) \S/.test(alt) || hits.size >= 2 && alt.split(/,/).length >= 3 || hits.size >= 3 || strong && alt.length >= 40 && alt.split(/\s+/).length >= 6;
      if (flag) ev.push('img alt="' + alt.slice(0, 90) + (alt.length > 90 ? '…' : '') + '"');
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'B125', id:'sign-up-to-see-anything', name:'Sign Up To See Anything',
  fix:'Give the root URL a public page that says what the product does; put the login form behind a link.',
  test(c){
    // Whole pages only: the page's main content is a password form and almost nothing else says what
    // the product is. Snippets: a bare login form with a password field and no other copy.
    const ev = [];
    const body = (/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(c.html) || [, c.html])[1];
    const pw = /<input\b[^>]*type\s*=\s*["']?password/i.test(body);
    if (!pw) return null;
    // the password field must be in the page itself, not a dropdown, modal or collapsed menu
    const inPopup = all(/<input\b[^>]*type\s*=\s*["']?password[^>]*>/gi, body).every(m => {
      const before = body.slice(Math.max(0, m.index - 3000), m.index);
      const opens = all(/<[a-z][\w-]*\b[^>]*(?:class|id|role)\s*=\s*["'][^"']*\b(?:modal|dropdown|popover|popup|dialog|drawer|collapse|offcanvas|overlay|menu)\b[^"']*["'][^>]*>/gi, before);
      return opens.length > 0;
    });
    if (inPopup) return null;
    const main = body.replace(/<(nav|footer|header|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    const words = main.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').split(/\s+/).filter(w => /[a-z]{2,}/i.test(w));
    const all_ = body.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').split(/\s+/).filter(w => /[a-z]{2,}/i.test(w));
    const head = ((/<title[^>]*>([^<]*)/i.exec(c.html) || [])[1] || '') + ' ' + all(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi, body).map(m => m[1].replace(/<[^>]+>/g, ' ')).join(' ') + ' ' + all(/<button\b[^>]*>([\s\S]*?)<\/button>|<input\b[^>]*type=["']?submit[^>]*value=["']([^"']*)/gi, body).map(m => (m[1] || m[2] || '').replace(/<[^>]+>/g, ' ')).join(' ');
    if (!/\b(log ?in|sign ?in|login|signin|sign-in|log-in)\b/i.test(head)) return null;
    if (/\b(sign ?up|register|create (?:an |your )?account|get started)\b/i.test(head) && /<input\b[^>]*type\s*=\s*["']?password[\s\S]*<input\b[^>]*type\s*=\s*["']?password/i.test(body)) return null;   // a signup page, not the root wall
    if (all_.length < 70 && words.length < 30) ev.push('page is a sign-in form with ' + all_.length + ' words in total (' + all_.slice(0, 14).join(' ') + ')');
    return ev.length ? {evidence:ev} : null; } },

{ code:'B169', id:'markdown-showing-through', name:'Markdown Showing Through',
  fix:'Render markdown with a parser or strip it before saving; no literal ** or ## should reach the page.',
  test(c){
    // Literal markdown syntax in rendered text: **bold**, a block that starts with "## ", or [text](https://...).
    // Code, pre, textarea, kbd, inputs and editor/demo surfaces are skipped: markdown tools show syntax on purpose.
    const ev = [];
    const body = (/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(c.html) || [, c.html])[1]
      .replace(/<(pre|code|textarea|kbd|samp|script|style|svg|tt|a)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');   // link text: marketplace titles decorate with ** on purpose
    const visible = body.replace(/<[^>]+>/g, '\u0001').replace(/&nbsp;|&#160;/g, ' ').replace(/&#42;|&ast;/g, '*').replace(/&#35;/g, '#');
    // a page that is about markdown (editor, converter, notes app demo) shows syntax deliberately
    if (/\bmarkdown\b|\bmdx?\b|wysiwyg|rich.text|\bobsidian\b|\bnotion\b/i.test(visible.replace(/\u0001/g, ' '))) return null;
    const blocks = visible.split(/\u0001+/).map(s => s.trim()).filter(Boolean);
    for (const b of blocks) {
      let m;
      if ((m = /\*\*([A-Za-z][^*\u0001]{1,58}[^*\s])\*\*/.exec(b))) ev.push('literal **' + m[1].slice(0, 40) + '** in text');
      else if ((m = /^(#{2,4})\s+([A-Z][^#]{2,50})/.exec(b))) ev.push('text block starts with "' + m[1] + ' ' + m[2].slice(0, 40).trim() + '"');
      else if ((m = /\[([^\]\[]{2,50})\]\((https?:\/\/[^)\s]{4,80})\)/.exec(b))) ev.push('literal [' + m[1] + '](' + m[2].slice(0, 40) + ') in text');
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'B182', id:'wrong-page-language', name:'Wrong Page Language',
  fix:'Set <html lang> to the language the page is actually written in.',
  test(c){
    // <html lang="xx"> vs. the language of the body text, detected by script (CJK, Cyrillic, Arabic, Sinhala...)
    // or by stopword share among Latin-script languages. Needs >= 200 characters of prose and a clear winner.
    const tag = /<html\b[^>]*\slang\s*=\s*["']?([a-z]{2,3})(?:[-_][\w-]+)?/i.exec(c.html);
    if (!tag) return null;
    const declared = tag[1].toLowerCase();
    const body = (/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(c.html) || [, c.html])[1]
      .replace(/<(pre|code|script|style|svg|textarea|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*\slang\s*=\s*["'][^"']*["'][^>]*>[\s\S]*?<\/[a-z]+>/gi, ' ');   // marked-up foreign phrases
    const txt = body.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/\S+\.(?:com|org|net|io|dev|app|ai|co|xyz)\b\S*|\S*[\w-]+\/[\w.\/-]+/gi, ' ').replace(/\s+/g, ' ');
    const letters = (txt.match(/\p{L}/gu) || []).length;
    if (letters < 200) return null;
    const SCRIPTS = { zh:/\p{Script=Han}/gu, ja:/[\p{Script=Hiragana}\p{Script=Katakana}]/gu, ko:/\p{Script=Hangul}/gu, ru:/\p{Script=Cyrillic}/gu,
      ar:/\p{Script=Arabic}/gu, he:/\p{Script=Hebrew}/gu, el:/\p{Script=Greek}/gu, th:/\p{Script=Thai}/gu, hi:/\p{Script=Devanagari}/gu, si:/\p{Script=Sinhala}/gu, ta:/\p{Script=Tamil}/gu };
    const count = re => (txt.match(re) || []).length;
    const SCRIPT_OK = { zh:['zh','ja'], ja:['ja'], ko:['ko'], ru:['ru','uk','bg','sr','be','kk','mk','mn','ky','tg'], ar:['ar','fa','ur','ps','ku'], he:['he','iw','yi'],
      el:['el'], th:['th'], hi:['hi','mr','ne','sa'], si:['si'], ta:['ta'] };
    let detected = null, why = '';
    const latin = count(/\p{Script=Latin}/gu);
    const sc = Object.entries(SCRIPTS).map(([k, re]) => [k, count(re)]).sort((a, b) => b[1] - a[1]);
    const kana = count(SCRIPTS.ja);
    if (sc[0][1] > letters * 0.5) {
      detected = sc[0][0] === 'zh' && kana > sc[0][1] * 0.1 ? 'ja' : sc[0][0];
      if ((SCRIPT_OK[detected] || [detected]).includes(declared)) return null;
      why = Math.round(100 * sc[0][1] / letters) + '% of letters are ' + detected + ' script';
    } else if (latin > letters * 0.9) {
      const words = txt.toLowerCase().match(/\p{L}+/gu) || [];
      if (words.length < 60) return null;
      const SW = {
        en:'the and of to in is for that with on are this you it be as by your from or can an will we at not have more all',
        es:'el la de que en los las del se por con para una un es su al lo como más pero sus le ya este ha porque esta entre cuando muy sin sobre también nuestro',
        de:'der die und den von zu das mit sich des auf für ist im dem nicht ein eine als auch es werden aus er hat dass sie nach wird bei ihre unsere',
        fr:'le la les de des et en un une du est pour que dans qui sur pas par plus au avec ce il sont nous vous votre leur mais ou sa son aux',
        pt:'de que da em um para com não uma os se na por mais dos como mas ao ele das seu sua ou quando muito nos já está também você',
        it:'il di che la per un una non con del sono della le si da dei gli al alla ma come più anche nel questo lo delle ad nella tutti',
        nl:'de het een van en dat op te zijn met voor niet aan er die ook als bij om maar uit worden dan naar kan wordt jouw onze je',
        sv:'och att det som en på är av för med till den har de inte om ett var men så från kan vi ni din vår',
        pl:'na że nie się jest jak po co ale tak dla przez od za może jego już oraz które',
        id:'yang dan di untuk dengan ini dari dalam tidak akan pada adalah itu ke kami anda bisa juga atau lebih',
        tr:'ve bir bu için ile da de çok daha ne olarak gibi en her sizin ama veya olan',
      };
      const scores = Object.entries(SW).map(([k, s]) => { const set = new Set(s.split(' ')); return [k, words.filter(w => set.has(w)).length / words.length]; }).sort((a, b) => b[1] - a[1]);
      const [best, second] = scores;
      if (!(best[1] >= 0.15 && best[1] >= second[1] * 1.8)) return null;
      const bestSet = new Set(SW[best[0]].split(' '));
      if (new Set(words.filter(w => bestSet.has(w))).size < 6) return null;   // one word repeated is not a language
      detected = best[0];
      const share = scores.find(s => s[0] === declared);
      if (detected === declared || (share && share[1] >= best[1] * 0.6)) return null;
      if (detected === 'pt' && declared === 'gl' || detected === 'id' && declared === 'ms' || detected === 'sv' && /^(no|nb|nn|da)$/.test(declared)) return null;
      why = Math.round(100 * best[1]) + '% of words are ' + detected + ' stopwords' + (share ? ' vs ' + Math.round(100 * share[1]) + '% ' + declared : '');
    } else return null;
    return { evidence: ['<html lang="' + tag[0].split(/lang\s*=\s*["']?/i)[1] + '"> but body text is ' + detected + ' (' + why + ')'] }; } },

{ code:'A73', id:'the-lucide-house-style', name:'The Lucide House Style',
  fix:'Pick an icon set on purpose and tune its weight and size to the type, or drop icons that only restate the heading.',
  test(c){
    // Rendered Lucide icons carry class="lucide lucide-<name>" (lucide-react, lucide vanilla, shadcn). The pattern is the
    // whole page's icon language being stock Lucide: 4+ Lucide glyphs, 80%+ of the page's 24-grid icons, default 2px stroke.
    const cls = a => ((/\bclass\s*=\s*["']([^"']*)["']/i.exec(a) || [])[1] || '');
    const svgs = all(/<svg\b([^>]*)>/gi, c.html).map(m => m[1]);
    const isLuc = a => /(?:^|\s)lucide(?:\s|$)|(?:^|\s)lucide-[a-z]/.test(cls(a));
    const luc = svgs.filter(isLuc);
    if (luc.length < 4) return null;
    // every small square glyph counts as an icon (Heroicons 20/24, Phosphor 256 at w-5, Tabler...), plus icon-font glyphs
    const small = a => { const vb = /viewBox\s*=\s*["']\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(a); const w = /\bwidth\s*=\s*["']?([\d.]+)(?:px)?["']?(?:\s|$|\/)/i.exec(a);
      return vb && Math.abs(vb[1] - vb[2]) < 0.5 && (+vb[1] <= 32 || (w && +w[1] <= 32) || /(?:^|\s)(?:size|[wh])-(?:[2-8]|3\.5|2\.5)(?:\s|$)/.test(cls(a))); };
    const grid = svgs.filter(a => isLuc(a) || small(a));
    const fonts = all(/<(?:i|span)\b[^>]*class\s*=\s*["'][^"']*\b(?:fa[srlbd]?|fa-solid|fa-regular|fa-brands|material-icons|material-symbols-\w+|bi|ti|ri-[\w-]+|ph|icon-[\w-]+)\b[^>]*>/gi, c.html).length;
    if (luc.length < 0.8 * (grid.length + fonts)) return null;
    const stock = luc.filter(a => { const w = /stroke-width\s*=\s*["']([\d.]+)["']/i.exec(a); return !w || +w[1] === 2; });
    if (stock.length < 0.8 * luc.length) return null;
    const names = {};
    for (const a of luc) { const n = (/(?:^|\s)lucide-([a-z0-9-]+)/.exec(cls(a)) || [])[1]; if (n && !/^icon$/.test(n)) names[n] = (names[n] || 0) + 1; }
    const CHROME = /^(?:chevron|x$|menu|external-link|arrow|move-|copy|search|sun|moon|loader|github|twitter|linkedin|youtube|instagram|facebook|panel|ellipsis|more-|circle-x|square-arrow|log-in|log-out)/;
    const glyphs = Object.keys(names).filter(n => !CHROME.test(n));
    if (glyphs.length < 3) return null;
    const top = Object.entries(names).sort((x, y) => y[1] - x[1]).slice(0, 6).map(x => x[0]);
    return {evidence:[luc.length + ' of ' + (grid.length + fonts) + ' icons are Lucide svgs (class "lucide"), ' + stock.length + ' at the default stroke-width 2' + (top.length ? ': ' + top.join(', ') : '')]}; } },

{ code:'A74', id:'the-untouched-component-theme', name:'The Untouched Component Theme',
  fix:'Replace the generated theme tokens with a real palette: one brand primary and a neutral ramp tinted from it.',
  test(c){
    // shadcn/ui writes its starter tokens into :root. Fire when the light-theme --primary is still a starter neutral
    // (or the stock blue theme), the border token is the starter too, the primary is actually used, and the page
    // paints with almost no other colour of its own.
    const NORM = s => String(s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/\b0(\.\d)/g, '$1').replace(/ ?!important/, '');
    const PRIMARY = new Set(['240 5.9% 10%','0 0% 9%','222.2 47.4% 11.2%','24 9.8% 10%','220.9 39.3% 11%','221.2 83.2% 53.3%',
      'oklch(.205 0 0)','oklch(20.5% 0 0)','oklch(.21 .006 285.885)','oklch(21% .006 285.885)','oklch(.208 .042 265.755)','oklch(20.8% .042 265.755)',
      'oklch(.216 .006 56.043)','oklch(21.6% .006 56.043)','oklch(.21 .034 264.665)','oklch(21% .034 264.665)',
      'hsl(240 5.9% 10%)','hsl(0 0% 9%)','hsl(222.2 47.4% 11.2%)','hsl(240 5.9% 10%)']);
    const BORDER = new Set(['240 5.9% 90%','0 0% 89.8%','214.3 31.8% 91.4%','20 5.9% 90%','220 13% 91%',
      'oklch(.922 0 0)','oklch(92.2% 0 0)','oklch(.92 .004 286.32)','oklch(92% .004 286.32)','oklch(.929 .013 255.508)','oklch(92.9% .013 255.508)',
      'oklch(.923 .003 48.717)','oklch(92.3% .003 48.717)','oklch(.928 .006 264.531)','oklch(92.8% .006 264.531)',
      'hsl(240 5.9% 90%)','hsl(0 0% 89.8%)','hsl(214.3 31.8% 91.4%)']);
    const R = rules(c.css);
    const ROOT = /^(:root|html|:host|\[data-theme=["']?light["']?\]|\.light|:root\s*,\s*:host|:root\s*,\s*\.light)$/i;
    const vars = {};
    for (const r of R) { const s = r.sel.trim(); if (!s.split(',').some(p => ROOT.test(p.trim()))) continue;
      for (const m of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) vars[m[1]] = m[2]; }   // later :root wins, as in the cascade
    const p = vars['--primary'], b = vars['--border'];
    if (!p || !PRIMARY.has(NORM(p)) || !b || !BORDER.has(NORM(b))) return null;
    const used = /(?:^|[\s:"'])(?:bg|text|border|ring)-primary(?:[\s/"']|$)/m.test(c.classes) ||
      R.some(r => !/^:root|^html$/i.test(r.sel.trim()) && /(?:background|color)[\w-]*\s*:[^;]*var\(\s*--primary\s*\)/i.test(r.body) && /btn|button|primary|cta/i.test(r.sel));
    if (!used) return null;
    // colour the page paints with: property values (var() resolved), not token definitions
    const allVars = {}; for (const r of R) for (const m of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) if (!(m[1] in allVars)) allVars[m[1]] = m[2];
    const res = (s, d = 0) => d > 5 ? s : s.replace(/var\(\s*(--[\w-]+)\s*(?:,([^()]*))?\)/g, (_, n, fb) => n in allVars ? res(allVars[n], d + 1) : (fb || ''));
    // chromatic colours as {label, hue}; tinted greys (slate, zinc) stay out
    const chroma = v => {
      const out = [];
      const push = (lab, h, sat, l) => { if (sat > 28 && l > 20 && l < 88) out.push({ lab, h }); };
      for (const m of all(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi, v)) { const h = hexToHsl(m[0]); if (h) push(m[0].toLowerCase(), h.h, h.s, h.l); }
      for (const m of all(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/gi, v)) { const L = m[1].endsWith('%') ? parseFloat(m[1]) / 100 : +m[1];
        if (+m[2] > 0.06 && L > 0.3 && L < 0.92) out.push({ lab: 'oklch(' + m[1] + ' ' + m[2] + ' ' + Math.round(+m[3]) + ')', h: +m[3], ok: true }); }
      for (const m of all(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+%?))?\)/gi, v)) {
        if (m[4] !== undefined && parseFloat(m[4]) / (m[4].endsWith('%') ? 100 : 1) < 0.5) continue;
        const h = rgbToHsl([+m[1], +m[2], +m[3]]); push(hex([+m[1], +m[2], +m[3]]).toLowerCase(), h.h, h.s, h.l); }
      for (const m of all(/hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/gi, v)) push('hsl(' + m[1] + ' ' + m[2] + '% ' + m[3] + '%)', +m[1], +m[2], +m[3]);
      return out;
    };
    // colours a starter theme brings along: destructive red, success green, stock blue (hsl hue; oklch hue is shifted)
    const stockHue = x => x.ok ? (x.h < 40 || x.h > 340 || (x.h > 130 && x.h < 165) || (x.h > 250 && x.h < 268))
                               : (x.h < 12 || x.h > 348 || (x.h > 115 && x.h < 160) || (x.h > 210 && x.h < 228));
    const paint = new Set(), own = new Set(), fam = new Set();
    const family = x => { const h = x.h; return x.ok ? (h < 40 || h > 340 ? 'red' : h < 200 ? 'green' : 'blue') : (h < 30 || h > 330 ? 'red' : h < 180 ? 'green' : 'blue'); };
    for (const r of R) {
      if (/^(:root|html|:host)\b/i.test(r.sel.trim()) && !/^html$/i.test(r.sel.trim())) continue;
      for (const m of all(/(?:^|;|\s)(color|background(?:-color|-image)?|border(?:-[a-z]+)?-color|fill|stroke|--tw-gradient-(?:from|to|via))\s*:\s*([^;]+)/gi, r.body)) {
        if (/^--tw/.test(m[1]) && !/gradient/.test(m[1])) continue;
        for (const x of chroma(res(m[2]))) { if (!stockHue(x)) own.add(x.lab); paint.add(x.lab); fam.add(family(x)); }
      }
    }
    // Tailwind arbitrary colours (text-[#B07D5A]) live in class names; the pruned CSS cannot see them
    for (const m of all(/(?:^|[\s"'])(?:[a-z]+:)?(?:bg|text|from|to|via|border|fill|stroke|decoration|ring)-\[(#[0-9a-f]{3,6}|rgba?\([^\]]*\)|hsla?\([^\]]*\))\]/gim, c.classes))
      for (const x of chroma(m[1].replace(/_/g, ' '))) { if (!stockHue(x)) own.add(x.lab); paint.add(x.lab); fam.add(family(x)); }
    fam.delete('red');   // destructive red ships with every starter
    if ((own.size || paint.size > 3 || fam.size > 1)) return null;
    return {evidence:['shadcn starter tokens left in :root: --primary: ' + NORM(p) + ', --border: ' + NORM(b) + (paint.size ? '; only other colour painted: ' + [...paint].join(', ') : '; no other colour painted')]}; } },

{ code:'A76', id:'arrow-on-every-button', name:'Arrow On Every Button',
  fix:'Keep the arrow only where the action moves forward or leaves the site, on one level of the hierarchy.',
  test(c){
    // A button or link counts when its label is words (not an icon-only control) and it ends in an arrow:
    // a trailing → / -> glyph, or a right-arrow icon (Lucide arrow-right/move-right, Heroicons arrow-right, FA arrow-right).
    const ARROW_ICON = /<svg\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:lucide-(?:arrow-right|move-right)|arrow-right|icon-arrow-right|arrow-forward)\b|<i\b[^>]*class\s*=\s*["'][^"']*\bfa-(?:arrow-right|long-arrow-right|arrow-right-long)\b|<path\b[^>]*\bd\s*=\s*["'](?:M13\.5 4\.5 21 12m0 0-7\.5 7\.5M21 12H3|M17 8l4 4m0 0l-4 4m4-4H3|M14 5l7 7m0 0l-7 7m7-7H3|M5 12h14)/i;
    const GLYPH = /(?:→|->|⟶|➝|➔|➜|&rarr;)\s*$/;
    const labels = [];
    let ctas = 0, btnArrows = 0;
    // positions inside off-canvas menus, drawers, dropdowns and dialogs (closed until clicked)
    const SHUT = /off-?canvas|drawer|mobile-?(?:menu|nav)|dropdown|modal|dialog|popover|flyout|(?:^|[\s_-])menu(?:[\s_-]|$)|sidebar/i;
    const shutRanges = [];
    { const stack = [];
      for (const t of all(/<(\/?)([a-z][\w-]*)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi, c.html)) {
        const tag = t[2].toLowerCase();
        if (t[1]) { for (let j = stack.length - 1; j >= 0; j--) if (stack[j].tag === tag) { if (stack[j].shut) shutRanges.push([stack[j].at, t.index]); stack.length = j; break; } continue; }
        if (VOIDTAG.test(tag) || /\/\s*$/.test(t[3])) continue;
        const named = ((/\bclass\s*=\s*["']([^"']*)["']/i.exec(t[3]) || [])[1] || '') + ' ' + ((/\bid\s*=\s*["']([^"']*)["']/i.exec(t[3]) || [])[1] || '');
        stack.push({ tag, at: t.index, shut: SHUT.test(named) && !/^(a|button|span|svg|path)$/.test(tag) || /^(dialog|details)$/.test(tag) && !/\sopen\b/i.test(t[3]) });
      } }
    const shut = i => shutRanges.some(([a, b]) => i > a && i < b);
    for (const m of all(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi, c.html)) {
      if (shut(m.index) || /aria-expanded|accordion|faq|collaps|toggle/i.test(m[2])) continue;   // disclosure controls, not calls to action
      const inner = m[3];
      if (inner.length > 4000) continue;
      const text = inner.replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&rarr;/g, '→').replace(/\s+/g, ' ').trim();
      const words = text.replace(/(?:→|->|⟶|➝|➔|➜)\s*$/, '').trim();
      if (!/[a-z]{2}/i.test(words) || words.length > 40) continue;
      const btnish = m[1].toLowerCase() === 'button' || /\b(?:btn|button|cta)\b|(?:^|\s)(?:bg-|px-[3-9]|py-[2-4]|inline-flex)/i.test(m[2]);
      if (btnish) ctas++;
      const arrow = GLYPH.test(text) || (() => { const i = inner.search(ARROW_ICON); return i >= 0 && inner.slice(i).replace(/<svg\b[\s\S]*?<\/svg>|<i\b[^>]*>\s*<\/i>|<[^>]+>/gi, '').replace(/\s|&nbsp;/g, '') === ''; })();
      if (arrow) { labels.push(words + (GLYPH.test(text) ? ' →' : ' [arrow icon]')); if (btnish) btnArrows++; }
    }
    const distinct = [...new Set(labels.map(x => x.replace(/ (?:→|\[arrow icon\])$/, '').toLowerCase()))];
    if (distinct.length < 3 || !btnArrows) return null;
    return {evidence:[labels.length + ' buttons/links end in a right arrow: ' + [...new Set(labels)].slice(0, 5).map(x => '"' + x + '"').join(', ')]}; } },

{ code:'A77', id:'decorative-01-02-03', name:'Decorative 01 02 03',
  fix:'Number things only when the order matters; otherwise drop the numbers and let the headings work.',
  test(c){
    // Stand-alone zero-padded numbers ("01", "02.", "/03") as their own text node, 01-02-03 all present, not in an <ol>
    // or a carousel/pagination counter, and the block they label is not a procedure (steps, how it works).
    const html = c.html.replace(/<(pre|code|textarea|select|time|table)\b[^>]*>[\s\S]*?<\/\1>/gi, m => ' '.repeat(m.length));
    const hits = [];
    for (const m of all(/<([a-z][\w-]*)\b([^>]*)>\s*(?:\/\s*)?(0[1-9])\s*[.\/]?\s*<\//gi, html)) hits.push({ n: +m[3], i: m.index, tag: m[1], attrs: m[2] });
    if (hits.length < 3) return null;
    // group numbers that sit close together and count up 1, 2, 3
    const groups = []; let g = [];
    for (const h of hits) {
      if (g.length && (h.i - g[g.length-1].i > 6000 || h.n !== g[g.length-1].n + 1)) { if (g.length >= 3) groups.push(g); g = []; }
      if (!g.length && h.n !== 1) continue;
      g.push(h);
    }
    if (g.length >= 3) groups.push(g);
    const ev = [];
    const STEP = /\b(?:steps?|how (?:it|to|we|this|does)|process|workflow|getting started|get started in|onboarding|in \w+ (?:easy |simple )?(?:steps|minutes)|tutorial|guide|install|set ?up|setup|stage|phase|first,|then|roadmap|timeline|chapter|lesson|week|day \d|contents|table of contents|toc|picks|ranked|ranking|top \d+|leaderboard|agenda|pipeline|lifecycle|journey|flow)\b/i;
    const VERB = /^(?:upload|connect|install|sign|create|set|choose|pick|add|run|deploy|download|enter|describe|write|code|tell|share|get|start|define|import|select|configure|build|send|ask|review|publish|invite|link|drop|paste|record|generate|open|launch|plan|design|test|ship|before|after|first|next|finally|then|discover|explore|apply|submit|register|book|pay|wait|receive|track|analy[sz]e|capture|log|type|click|drag|import|clone|init|prompt|train|watch|learn|log ?in|login|sign ?up|sign ?in|go|visit|find|choose|get)\b/i;
    for (const gr of groups) {
      const s = gr[0].i, e = gr[gr.length-1].i + 400;
      const before = html.slice(Math.max(0, s - 1500), s);
      const opensOl = before.lastIndexOf('<ol') > before.lastIndexOf('</ol');
      if (opensOl) continue;
      if (/carousel|swiper|slick|slider|pagination|counter|page-?num|countdown|clock|timer|date|month|hour/i.test(gr.map(h => h.attrs).join(' ') + before.slice(-400))) continue;
      const txt = x => x.replace(/<[^>]+>/g, ' ').replace(/&\w+;/g, ' ').replace(/\s+/g, ' ');
      const head = txt(html.slice(Math.max(0, s - 8000), s)).slice(-300);
      const body = txt(html.slice(s, e));
      if (STEP.test(head) || /\b(?:steps?|how (?:it|to) works?|then)\b/i.test(body)) continue;
      // the first labelled item reads like an instruction or a stage ("Upload your video", "Before the call") or code
      const first = txt(html.slice(s, s + 600)).replace(/^\s*\/?\s*01\s*[.\/]?\s*/, '');
      if (VERB.test(first) || /^\S*[\w][._][a-z]\w*/i.test(first)) continue;
      // each number must label something: words between it and the next (line numbers, digit strips and counters have none)
      if (gr.slice(1).some((h, k) => !/[a-z]{3,}.*[a-z]{2,}/i.test(txt(html.slice(gr[k].i, h.i)).replace(/\b0\d\b/g, '')))) continue;
      if (/>\s*00\s*[.\/]?\s*<\/[a-z]+>\s*(?:<[^>]*>\s*)*$/i.test(html.slice(Math.max(0, s - 300), s))) continue;
      ev.push(gr.length + ' stand-alone labels ' + gr.map(h => String(h.n).padStart(2, '0')).join(' ') + ' on <' + gr[0].tag + (/(class\s*=\s*["'][^"']{0,40})/i.exec(gr[0].attrs) ? ' ' + /(class\s*=\s*["'][^"']{0,40})/i.exec(gr[0].attrs)[1] + '"' : '') + '>');
    }
    return ev.length ? {evidence:ev.slice(0, 2)} : null; } },

{ code:'A78', id:'cursor-on-a-page-you-cant-type-in', name:"Cursor On A Page You Can't Type In",
  fix:'Remove the fake caret. If the product really types, show the real product doing it.',
  test(c){
    // A caret element: class token named cursor/caret/blink (Tailwind cursor-* utilities and editor/terminal-emulator
    // carets excluded) holding a caret glyph or nothing, or a ::after/::before that draws a caret glyph with an
    // animation; and it does not sit in an input, textarea, contenteditable or a real editor.
    const ev = [];
    const CARET_TOK = /^(?:typed-cursor|cursor|caret|blink|blinking|blinker|blinking-cursor|blink-cursor|text-cursor|terminal-cursor|type-cursor|typing-cursor|typewriter-cursor|cursor-blink|caret-blink|animate-blink|animate-caret|animate-cursor|animate-cursor-blink|animate-caret-blink|[\w-]+(?:-|__)(?:cursor|caret))$/i;
    const TW_CURSOR = /^cursor-(?:pointer|default|text|move|grab|grabbing|not-allowed|wait|help|auto|none|crosshair|zoom-in|zoom-out|copy|progress|cell|alias|context-menu|vertical-text|no-drop|all-scroll|[\w-]*resize)$/i;
    const EDITOR = /\b(?:cm-|CodeMirror|monaco|ace_|xterm|ap-|asciinema|terminal-emulator|ProseMirror|ql-|tiptap|editor)/;
    const GLY = /^(?:\||▍|▌|▋|▊|▏|█|_|▮|&#124;|&#x7c;)?$/i;
    const stack = [];
    for (const m of all(/<(\/?)([a-z][\w-]*)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>([^<]*)/gi, c.html)) {
      const tag = m[2].toLowerCase(), a = m[3];
      if (m[1]) { for (let j = stack.length - 1; j >= 0; j--) if (stack[j].tag === tag) { stack.length = j; break; } continue; }
      const cls = ((/\bclass\s*=\s*["']([^"']*)["']/i.exec(a) || [])[1] || '');
      const edit = /^(input|textarea|select)$/.test(tag) || /contenteditable/i.test(a) || EDITOR.test(cls) || /(?:^|[\s_-])(?:loading|loader|preloader|splash)(?:[\s_-]|$)/i.test(cls);
      const inEdit = edit || stack.some(s => s.edit);
      if (!VOIDTAG.test(tag) && !/\/\s*$/.test(a)) stack.push({ tag, edit });
      if (inEdit || !/^(span|i|div|b|em|strong)$/.test(tag)) continue;
      const tok = cls.split(/\s+/).find(t => CARET_TOK.test(t) && !TW_CURSOR.test(t));
      if (!tok) continue;
      const own = m[4].trim();
      const next = c.html.slice(m.index + m[0].length, m.index + m[0].length + 12);
      if (!GLY.test(own) || (!own && !/^<\/(span|i|div|b|em|strong)>/i.test(next))) continue;
      if (!own && !/cursor|caret/i.test(tok)) continue;          // an empty "blink" element is usually a status dot
      if (/(?:^|\s)(?:rounded-full|dot|status-dot|pulse-dot)(?:\s|$)/.test(cls)) continue;
      // an empty caret is drawn by CSS: its class must carry an animation (or be an animate-* utility)
      if (!own && !/^animate-/.test(tok) && !rules(c.css).some(r => new RegExp('\\.' + tok.replace(/[-_]/g, '\\$&') + '(?![\\w-])').test(r.sel) && /animation/i.test(r.body))) continue;
      const ctx = stack.slice(0, -1).map(s => s.tag);
      ev.push('<' + tag + ' class="' + tok + '">' + (own || '') + '</' + tag + '>' + (ctx.some(t => /^h[1-3]$/.test(t)) ? ' inside the ' + ctx.find(t => /^h[1-3]$/.test(t)) : ''));
    }
    for (const r of rules(c.css)) {
      if (!/::?(?:after|before)/i.test(r.sel) || !/animation/i.test(r.body)) continue;
      if (EDITOR.test(r.sel) || /input|textarea|placeholder/i.test(r.sel)) continue;
      const ct = /content\s*:\s*["']([^"']*)["']/i.exec(r.body);
      if (!ct || !/^(?:\||▍|▌|▋|▊|▏|█|_|\\7c|\\258[89abcdef]|\\2588)$/i.test(ct[1].trim())) continue;
      ev.push(r.sel.trim().slice(0, 50) + ' { content: "' + ct[1] + '"; animated }');
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0, 3)} : null; } },
{ code:'A79', id:'the-billboard-headline', name:'The Billboard Headline',
  fix:'Size the headline to its length: cap a sentence-length H1 well below 72px (or shorten it) so the subhead and button stay in the first screen.',
  test(c){
    // An H1 of 40+ characters whose own font-size at a 1280px viewport resolves to 72px or more
    // (CSS rule matched through the cascade, inline style, or a Tailwind text-7xl/8xl/9xl/[..px] class).
    // ---- mini DOM + cascade (static; no media context: c.css has media blocks flattened) ----
    const VOIDT = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
    const parseDom = html => {
      const root = { tag:'#root', cls:new Set(), id:'', a:'', kids:[], parent:null, txt:'' };
      let cur = root, last = 0;
      // attribute-aware tag pattern: a stray apostrophe in text or an unquoted value must not swallow later tags
      const re = /<(\/?)([a-z][\w-]*)((?:\s+[^\s=>\/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?)*\s*\/?)\s*>|<!--[\s\S]*?-->/gi; let m;
      while ((m = re.exec(html))) {
        const t = html.slice(last, m.index); last = re.lastIndex;
        if (t.trim()) cur.kids.push({ tag:'#text', txt:t.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#?\w+;/g,'x'), parent:cur });
        if (!m[2]) continue;
        const tag = m[2].toLowerCase();
        if (m[1]) { let n = cur; while (n && n.tag !== tag) n = n.parent; if (n && n.parent) cur = n.parent; continue; }
        const a = m[3];
        const cm = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(a), im = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(a);
        const node = { tag, cls:new Set(cm ? (cm[1] ?? cm[2]).split(/\s+/).filter(Boolean) : []), id: im ? (im[1] ?? im[2]) : '', a, kids:[], parent:cur };
        cur.kids.push(node);
        if (!VOIDT.test(tag) && !/\/\s*$/.test(a)) cur = node;
        if (/^(script|style|template|noscript|svg)$/.test(tag)) { const e = html.toLowerCase().indexOf('</' + tag, re.lastIndex); if (e > 0) { re.lastIndex = e; last = e; } }
      }
      return root;
    };
    const textOf = n => n.tag === '#text' ? n.txt : /^(script|style|template|noscript|svg|select|button)$/.test(n.tag) ? '' : n.kids.map(textOf).join(' ');
    const clean = s => s.replace(/\s+/g, ' ').trim();
    const walk = (n, f) => { f(n); if (n.kids) for (const k of n.kids) walk(k, f); };
    const isHid = n => { for (let p = n; p; p = p.parent) { if (!p.a) continue;
      if (/data-sp-hidden|\saria-hidden\s*=\s*["']true|\shidden(\s|=|$)/i.test(p.a + ' ')) return true;
      if (/style\s*=\s*["'][^"']*(display\s*:\s*none|visibility\s*:\s*hidden)/i.test(p.a)) return true;
      if (p.cls.has('sr-only') || p.cls.has('visually-hidden') || p.cls.has('screen-reader-text')) return true; } return false; };
    const unesc = s => s.replace(/\\([0-9a-f]{1,6}\s?)/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\(.)/g, '$1');
    // tailwind variant prefixes that apply at a 1280px desktop viewport with no state
    const TWOK = /^(sm|md|lg|xl)$/;
    const variantOk = cls => { const p = cls.split(':'); p.pop(); return p.every(v => TWOK.test(v)); };
    const bpRank = cls => { const p = cls.split(':'); return p.length === 1 ? 0 : ({ sm:1, md:2, lg:3, xl:4 })[p[0]] || 0; };
    const parseCompound = s => {
      // returns {tag, cls[], id} or null when it has something we cannot evaluate statically
      s = s.replace(/:(?:where|is)\(\s*([^()]*?)\s*\)/g, (_, x) => /^[\w.#-]+$/.test(x) ? x : '\u0001')
           .replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '');
      if (/\u0001|\[|::?(?!root\b)[\w-]/.test(s.replace(/\\./g, 'x'))) return null;
      s = s.replace(/:root\b/, 'html');
      const tag = ((/^[a-z][\w-]*|^\*/i.exec(s) || [''])[0]).toLowerCase();
      const cls = all(/\.((?:\\.|[\w-])+)/g, s).map(m => unesc(m[1]));
      const id = ((/#((?:\\.|[\w-])+)/.exec(s) || [])[1]) || '';
      return { tag: tag === '*' ? '' : tag, cls, id: unesc(id) };
    };
    const matchComp = (n, k) => n && n.tag !== '#root' && (!k.tag || n.tag === k.tag) && (!k.id || n.id === k.id) && k.cls.every(x => n.cls.has(x) && (!x.includes(':') || variantOk(x)));
    const matchSel = (n, comps, combs, i) => {
      if (!matchComp(n, comps[i])) return false;
      if (i === 0) return true;
      if (combs[i - 1] === '>') return matchSel(n.parent, comps, combs, i - 1);
      for (let p = n.parent; p && p.tag !== '#root'; p = p.parent) if (matchSel(p, comps, combs, i - 1)) return true;
      return false;
    };
    const buildIndex = css => {
      const idx = new Map(); let order = 0;
      const put = (k, v) => { if (!idx.has(k)) idx.set(k, []); idx.get(k).push(v); };
      for (const r of rules(css)) {
        order++;
        for (const part of r.sel.split(/(?<!\\),/)) {
          const toks = part.trim().replace(/\s*([>+~])\s*/g, ' $1 ').split(/\s+/).filter(Boolean);
          const comps = [], combs = []; let bad = false;
          for (const t of toks) { if (t === '>' || t === '+' || t === '~') { if (t !== '>') bad = true; combs[comps.length - 1] = '>'; continue; }
            if (comps.length > combs.length) combs.push(' ');
            const k = parseCompound(t); if (!k) { bad = true; break; } comps.push(k); }
          if (bad || !comps.length) continue;
          const spec = comps.reduce((s, k) => s + (k.id ? 10000 : 0) + k.cls.length * 100 + (k.tag ? 1 : 0), 0);
          const last = comps[comps.length - 1];
          const rec = { comps, combs, body: r.body, spec, order, sel: part.trim() };
          put(last.id ? '#' + last.id : last.cls.length ? '.' + last.cls[0] : last.tag || '*', rec);
        }
      }
      return idx;
    };
    // all declarations of prop that match node n, best first: [{v, spec, order, sel, important}]
    const declsFor = (idx, n, prop) => {
      const cands = [...(idx.get('*') || []), ...(idx.get(n.tag) || []), ...(n.id ? idx.get('#' + n.id) || [] : [])];
      for (const k of n.cls) cands.push(...(idx.get('.' + k) || []));
      const re = new RegExp('(?:^|;|\\s|\\{)' + prop + '\\s*:\\s*([^;{}]+)', 'gi');
      const out = [];
      for (const r of new Set(cands)) { if (!matchSel(n, r.comps, r.combs, r.comps.length - 1)) continue;
        for (const m of all(re, r.body)) { const v = m[1].trim(); out.push({ v: v.replace(/\s*!important\s*$/i, ''), imp: /!important/i.test(v), spec: r.spec, order: r.order, sel: r.sel }); } }
      const st = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(n.a || '');
      if (st) for (const m of all(re, ';' + (st[1] ?? st[2]))) { const v = m[1].trim(); out.push({ v: v.replace(/\s*!important\s*$/i, ''), imp: /!important/i.test(v), spec: 1e6, order: 1e9, sel: 'style=""' }); }
      return out.sort((x, y) => (y.imp - x.imp) || (y.spec - x.spec) || (y.order - x.order));
    };
    // ---- end engine ----
    const vars = {};
    for (const r of rules(c.css)) for (const m of all(/(--[\w-]+)\s*:\s*([^;]+)/g, r.body)) if (!(m[1] in vars)) vars[m[1]] = m[2].trim();
    // root font size (html { font-size: 62.5% } makes 1rem = 10px)
    // (the first declaration: later ones are usually breakpoint variants flattened out of @media)
    let remPx = null;
    for (const r of rules(c.css)) if (remPx == null && /(^|,)\s*(html|:root)\s*(,|$)/.test(r.sel)) { const m = /(?:^|;)\s*font-size\s*:\s*([\d.]+)(px|%)\s*(?:;|$)/.exec(r.body); if (m) remPx = m[2] === '%' ? 16 * m[1] / 100 : +m[1]; }
    remPx = remPx || 16;
    const len = (v, d) => {
      // resolve a CSS length to px at a 1280x800 viewport; null when unknown
      if (d > 6 || v == null) return null; v = String(v).trim();
      let m;
      if ((m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(v))) return len(vars[m[1]] ?? m[2], d + 1);
      if ((m = /^clamp\((.*)\)$/i.exec(v))) { const a = splitArgs(m[1]).map(x => len(x, d + 1)); if (a.length !== 3 || a.some(x => x == null)) return null; return Math.min(Math.max(a[0], a[1]), a[2]); }
      if ((m = /^(min|max)\((.*)\)$/i.exec(v))) { const a = splitArgs(m[2]).map(x => len(x, d + 1)); if (a.some(x => x == null)) return null; return Math[m[1].toLowerCase()](...a); }
      if ((m = /^calc\((.*)\)$/i.exec(v))) { const t = m[1].replace(/\s+([+-])\s+/g, '\u0001$1').split('\u0001'); let s = 0;
        for (const x of t) { const neg = /^-/.test(x) && /^-\s*\D/.test(x) ? -1 : 1; const y = len(x.replace(/^[+]/, '').replace(/^-(?=\s*\D)/, '').trim(), d + 1); if (y == null) return null; s += neg * y; } return s; }
      if ((m = /^(-?[\d.]+)(px|rem|em|vw|vh|vmin|vmax|pt)?$/i.exec(v))) { const n = +m[1], u = (m[2] || 'px').toLowerCase();
        return n * ({ px:1, rem:remPx, em:remPx, vw:12.8, vh:8, vmin:8, vmax:12.8, pt:4/3 })[u]; }
      return null;
    };
    const splitArgs = s => { const out = []; let dep = 0, cur = ''; for (const ch of s) { if (ch === '(') dep++; if (ch === ')') dep--; if (ch === ',' && !dep) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(x => x.trim()); };
    const TW = { '7xl':72, '8xl':96, '9xl':128, '6xl':60, '5xl':48 };
    const twSize = n => { let best = null, rank = -1;
      for (const k of n.cls) { if (!variantOk(k) || !cssHas(k)) continue; const b = k.split(':').pop(); let px = null, m;
        if ((m = /^text-(\dxl)$/.exec(b))) px = TW[m[1]] ?? null;
        else if ((m = /^text-\[([\d.]+(?:px|rem))\]$/.exec(b))) px = len(m[1], 0);
        if (px != null && bpRank(k) >= rank) { best = px; rank = bpRank(k); } }
      return best; };
    const root = parseDom(c.html), idx = buildIndex(c.css);
    // in a whole page a Tailwind class only counts when the page's CSS defines it (otherwise it does nothing)
    const twOn = !c.isFullDoc || /--tw-[\w-]+\s*:/.test(c.css);   // Tailwind CSS really loaded (v4 nests responsive variants in @media, so those are not listed)
    const cssHas = k => twOn || c.css.includes('.' + k.replace(/([:\[\]\/.#%(),])/g, '\\$1') + '{') || c.css.includes('.' + k.replace(/([:\[\]\/.#%(),])/g, '\\$1') + ' {');
    // text a reader sees: skip screen-reader copies, invisible spacers and stacked rotating words
    const seen = n => n.tag === '#text' ? n.txt : /^(script|style|template|noscript|svg|button)$/.test(n.tag)
      || [...n.cls].some(k => /^(sr-only|visually-hidden|screen-reader-text|invisible|absolute|opacity-0|hidden)$/.test(k)) || isHid(n) || small(n) || n.tag !== 'h1' && (declsFor(idx, n, 'display')[0] || {}).v === 'none' ? '' : n.kids.map(seen).join(' ');
    // a tagline inside the h1 set at its own small size is not part of the billboard
    const small = n => { if (n.tag === 'h1') return false;
      if ([...n.cls].some(k => /^text-(xs|sm|base|lg|xl|2xl|3xl)$/.test(k.split(':').pop()) && variantOk(k))) return true;
      const d = declsFor(idx, n, 'font-size')[0]; if (!d) return false; const v = len(d.v, 0); return v != null && v < 48 || /^0?\.[0-6]\d*em$/.test(d.v); };
    const TWW = { sm:384, md:448, lg:512, xl:576, '2xl':672, '3xl':768, '4xl':896, '5xl':1024, '6xl':1152, '7xl':1280 };
    const widthOf = n => { let w = 1232;
      for (let p = n, d = 0; p && p.tag !== '#root' && d < 8; p = p.parent, d++) {
        for (const k of p.cls) { if (!variantOk(k) || !cssHas(k)) continue; const b = k.split(':').pop(); let m;
          if ((m = /^max-w-(\w+)$/.exec(b)) && TWW[m[1]]) w = Math.min(w, TWW[m[1]]);
          else if ((m = /^max-w-\[([\d.]+)(px|rem|ch)\]$/.exec(b))) w = Math.min(w, +m[1] * ({ px:1, rem:16, ch:0 })[m[2]] || w);
          // a multi-column grid at desktop splits the measure
          else if ((m = /^grid-cols-(\d+)$/.exec(b)) && d > 0) w = Math.min(w, 1232 / +m[1]);
          else if ((m = /^grid-cols-\[(.+)\]$/.exec(b)) && d > 0) { const tr = m[1].split('_').filter(x => !/^repeat/.test(x)).length; if (tr >= 2) w = Math.min(w, 1232 / tr); } }
        const d0 = declsFor(idx, p, 'max-width')[0]; if (d0) { const m = /^([\d.]+)(px|rem)$/.exec(d0.v); if (m) w = Math.min(w, +m[1] * (m[2] === 'rem' ? 16 : 1)); }
      }
      return w; };
    const ev = [];
    walk(root, n => {
      if (n.tag !== 'h1' || isHid(n)) return;
      const t = clean(seen(n));
      if (t.length < 40 || t.length > 200 || t.split(' ').length < 6) return;
      let px = null, src = '';
      const ds = [...declsFor(idx, n, 'font-size'), ...declsFor(idx, n, 'font').map(d => ({ ...d, v: ((/(?:^|\s)([\d.]+(?:px|rem|em|vw)|clamp\([^)]*\)[^\s/]*)(?=\s*\/|\s+[\w"'])/.exec(d.v) || [])[1]) || '' }))]
        .sort((x, y) => (y.imp - x.imp) || (y.spec - x.spec) || (y.order - x.order));
      // media blocks are flattened: tailwind breakpoint classes are ranked by breakpoint; for other CSS, when the
      // top-specificity rules disagree (responsive variants), the first-declared (base) value is used
      const tw = twSize(n);
      if (tw != null) { px = tw; src = [...n.cls].filter(k => /text-(\dxl|\[)/.test(k)).join(' '); }
      else if (ds.length) {
        const top = ds.filter(d => d.spec === ds[0].spec && d.imp === ds[0].imp && !/^\.(?:[\w-]+\\:)/.test(d.sel)).map(d => ({ d, px: len(d.v, 0) })).filter(x => x.px != null);
        if (top.length) { const b = top.reduce((a, x) => x.d.order < a.d.order ? x : a); px = b.px; src = b.d.sel + ' {font-size:' + b.d.v + '}'; }
      }
      if (px == null || px < 72) return;
      // it has to be a wall: estimated 3+ lines in its measure (average glyph ~0.5em)
      // forced breaks (<br>, block-level children) start new lines
      const segs = ['']; const seg = k => { if (k.tag === '#text') { segs[segs.length - 1] += k.txt; return; }
        if (k.tag === 'br') { segs.push(''); return; } if (!seen(k).trim()) return;
        const blk = /^(div|p|h\d)$/.test(k.tag) || [...k.cls].some(x => /^(block|flex|grid)$/.test(x.split(':').pop()) && variantOk(x));
        if (blk) segs.push(''); for (const z of k.kids || []) seg(z); if (blk) segs.push(''); };
      for (const z of n.kids) seg(z);
      const w = widthOf(n), lines = segs.map(clean).filter(Boolean).reduce((a, x) => a + Math.ceil(x.length * 0.5 * px / w), 0);
      if (lines < 3) return;
      ev.push('<h1> ' + Math.round(px) + 'px (' + src.slice(0, 60) + '), ' + t.length + ' chars, ~' + lines + ' lines: "' + t.slice(0, 60) + (t.length > 60 ? '…' : '') + '"');
    });
    return ev.length ? {evidence:ev.slice(0, 2)} : null; } },
{ code:'A81', id:'the-dimmed-hero-photo', name:'The Dimmed Hero Photo',
  fix:'Give the photo room (text beside or below it) or drop it for a solid colour; do not bury a stock image under a 50%+ black scrim.',
  test(c){
    // The block holding the page's first headline carries a photo (CSS url() raster background, or an <img> filling it)
    // AND a dark scrim at >= 50% opacity: a dark gradient layered over the url() in the same background, a dark
    // ::before/::after on the block, or an empty absolutely-positioned overlay child (bg-black/60, rgba(0,0,0,.6)...).
    // ---- mini DOM + cascade (static; no media context: c.css has media blocks flattened) ----
    const VOIDT = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
    const parseDom = html => {
      const root = { tag:'#root', cls:new Set(), id:'', a:'', kids:[], parent:null, txt:'' };
      let cur = root, last = 0;
      // attribute-aware tag pattern: a stray apostrophe in text or an unquoted value must not swallow later tags
      const re = /<(\/?)([a-z][\w-]*)((?:\s+[^\s=>\/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?)*\s*\/?)\s*>|<!--[\s\S]*?-->/gi; let m;
      while ((m = re.exec(html))) {
        const t = html.slice(last, m.index); last = re.lastIndex;
        if (t.trim()) cur.kids.push({ tag:'#text', txt:t.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#?\w+;/g,'x'), parent:cur });
        if (!m[2]) continue;
        const tag = m[2].toLowerCase();
        if (m[1]) { let n = cur; while (n && n.tag !== tag) n = n.parent; if (n && n.parent) cur = n.parent; continue; }
        const a = m[3];
        const cm = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(a), im = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(a);
        const node = { tag, cls:new Set(cm ? (cm[1] ?? cm[2]).split(/\s+/).filter(Boolean) : []), id: im ? (im[1] ?? im[2]) : '', a, kids:[], parent:cur };
        cur.kids.push(node);
        if (!VOIDT.test(tag) && !/\/\s*$/.test(a)) cur = node;
        if (/^(script|style|template|noscript|svg)$/.test(tag)) { const e = html.toLowerCase().indexOf('</' + tag, re.lastIndex); if (e > 0) { re.lastIndex = e; last = e; } }
      }
      return root;
    };
    const textOf = n => n.tag === '#text' ? n.txt : /^(script|style|template|noscript|svg|select|button)$/.test(n.tag) ? '' : n.kids.map(textOf).join(' ');
    const clean = s => s.replace(/\s+/g, ' ').trim();
    const walk = (n, f) => { f(n); if (n.kids) for (const k of n.kids) walk(k, f); };
    const isHid = n => { for (let p = n; p; p = p.parent) { if (!p.a) continue;
      if (/data-sp-hidden|\saria-hidden\s*=\s*["']true|\shidden(\s|=|$)/i.test(p.a + ' ')) return true;
      if (/style\s*=\s*["'][^"']*(display\s*:\s*none|visibility\s*:\s*hidden)/i.test(p.a)) return true;
      if (p.cls.has('sr-only') || p.cls.has('visually-hidden') || p.cls.has('screen-reader-text')) return true; } return false; };
    const unesc = s => s.replace(/\\([0-9a-f]{1,6}\s?)/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\(.)/g, '$1');
    // tailwind variant prefixes that apply at a 1280px desktop viewport with no state
    const TWOK = /^(sm|md|lg|xl)$/;
    const variantOk = cls => { const p = cls.split(':'); p.pop(); return p.every(v => TWOK.test(v)); };
    const bpRank = cls => { const p = cls.split(':'); return p.length === 1 ? 0 : ({ sm:1, md:2, lg:3, xl:4 })[p[0]] || 0; };
    const parseCompound = s => {
      // returns {tag, cls[], id} or null when it has something we cannot evaluate statically
      s = s.replace(/:(?:where|is)\(\s*([^()]*?)\s*\)/g, (_, x) => /^[\w.#-]+$/.test(x) ? x : '\u0001')
           .replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '');
      if (/\u0001|\[|::?(?!root\b)[\w-]/.test(s.replace(/\\./g, 'x'))) return null;
      s = s.replace(/:root\b/, 'html');
      const tag = ((/^[a-z][\w-]*|^\*/i.exec(s) || [''])[0]).toLowerCase();
      const cls = all(/\.((?:\\.|[\w-])+)/g, s).map(m => unesc(m[1]));
      const id = ((/#((?:\\.|[\w-])+)/.exec(s) || [])[1]) || '';
      return { tag: tag === '*' ? '' : tag, cls, id: unesc(id) };
    };
    const matchComp = (n, k) => n && n.tag !== '#root' && (!k.tag || n.tag === k.tag) && (!k.id || n.id === k.id) && k.cls.every(x => n.cls.has(x) && (!x.includes(':') || variantOk(x)));
    const matchSel = (n, comps, combs, i) => {
      if (!matchComp(n, comps[i])) return false;
      if (i === 0) return true;
      if (combs[i - 1] === '>') return matchSel(n.parent, comps, combs, i - 1);
      for (let p = n.parent; p && p.tag !== '#root'; p = p.parent) if (matchSel(p, comps, combs, i - 1)) return true;
      return false;
    };
    const buildIndex = css => {
      const idx = new Map(); let order = 0;
      const put = (k, v) => { if (!idx.has(k)) idx.set(k, []); idx.get(k).push(v); };
      for (const r of rules(css)) {
        order++;
        for (const part of r.sel.split(/(?<!\\),/)) {
          const toks = part.trim().replace(/\s*([>+~])\s*/g, ' $1 ').split(/\s+/).filter(Boolean);
          const comps = [], combs = []; let bad = false;
          for (const t of toks) { if (t === '>' || t === '+' || t === '~') { if (t !== '>') bad = true; combs[comps.length - 1] = '>'; continue; }
            if (comps.length > combs.length) combs.push(' ');
            const k = parseCompound(t); if (!k) { bad = true; break; } comps.push(k); }
          if (bad || !comps.length) continue;
          const spec = comps.reduce((s, k) => s + (k.id ? 10000 : 0) + k.cls.length * 100 + (k.tag ? 1 : 0), 0);
          const last = comps[comps.length - 1];
          const rec = { comps, combs, body: r.body, spec, order, sel: part.trim() };
          put(last.id ? '#' + last.id : last.cls.length ? '.' + last.cls[0] : last.tag || '*', rec);
        }
      }
      return idx;
    };
    // all declarations of prop that match node n, best first: [{v, spec, order, sel, important}]
    const declsFor = (idx, n, prop) => {
      const cands = [...(idx.get('*') || []), ...(idx.get(n.tag) || []), ...(n.id ? idx.get('#' + n.id) || [] : [])];
      for (const k of n.cls) cands.push(...(idx.get('.' + k) || []));
      const re = new RegExp('(?:^|;|\\s|\\{)' + prop + '\\s*:\\s*([^;{}]+)', 'gi');
      const out = [];
      for (const r of new Set(cands)) { if (!matchSel(n, r.comps, r.combs, r.comps.length - 1)) continue;
        for (const m of all(re, r.body)) { const v = m[1].trim(); out.push({ v: v.replace(/\s*!important\s*$/i, ''), imp: /!important/i.test(v), spec: r.spec, order: r.order, sel: r.sel }); } }
      const st = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(n.a || '');
      if (st) for (const m of all(re, ';' + (st[1] ?? st[2]))) { const v = m[1].trim(); out.push({ v: v.replace(/\s*!important\s*$/i, ''), imp: /!important/i.test(v), spec: 1e6, order: 1e9, sel: 'style=""' }); }
      return out.sort((x, y) => (y.imp - x.imp) || (y.spec - x.spec) || (y.order - x.order));
    };
    // ---- end engine ----
    const root = parseDom(c.html), idx = buildIndex(c.css);
    let h = null;
    walk(root, n => { if (!h && /^h[12]$/.test(n.tag) && !isHid(n) && clean(textOf(n)).length >= 3) h = n; });
    if (!h) return null;
    const PHOTO = /url\(\s*["']?([^"')]*?(?:\.(?:jpe?g|png|webp|avif)|images\.unsplash\.com|images\.pexels\.com)[^"')]*)["']?\s*\)/i;
    const isPhotoUrl = u => !/\.svg|data:image\/svg|pattern|noise|grain|texture|dots|grid|logo|icon/i.test(u);
    // alpha of a dark colour token, null when not dark
    const darkA = s => { let m;
      if ((m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)/i.exec(s))) {
        if (Math.max(+m[1], +m[2], +m[3]) > 70) return null;   // near-black only: a brand-colour wash is a different look
        return m[4] === undefined ? 1 : m[5] ? m[4] / 100 : +m[4]; }
      const nb = v => Math.max(parseInt(v.slice(0,2),16), parseInt(v.slice(2,4),16), parseInt(v.slice(4,6),16)) <= 70;
      if ((m = /#([0-9a-f]{8})\b/i.exec(s))) { const v = m[1]; return nb(v) ? parseInt(v.slice(6), 16) / 255 : null; }
      if ((m = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(s))) { let v = m[1]; if (v.length === 3) v = v.split('').map(x => x + x).join(''); return nb(v) ? 1 : null; }
      if (/\bblack\b/i.test(s)) return 1;
      return null; };
    // a gradient whose every stop is dark with alpha >= .5 (a fade to transparent does not dim the whole photo)
    const darkGrad = s => { const g = /(?:linear|radial)-gradient\(((?:[^()]|\([^()]*\))*)\)/i.exec(s); if (!g) return null;
      const stops = all(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|\b(?:black|transparent|white)\b/gi, g[1]).map(m => m[0]);
      if (stops.length < 2) return null;
      const as = stops.map(darkA); if (as.some(a => a == null || a < 0.5)) return null;
      return Math.min(...as); };
    const tw = n => { // tailwind overlay classes -> alpha
      let a = null;
      for (const k of n.cls) { if (!variantOk(k)) continue; const b = k.split(':').pop(); let m;
        if ((m = /^bg-(?:black|(?:gray|slate|zinc|neutral|stone)-(?:9\d\d))(?:\/(\d+))?$/.exec(b))) a = m[1] ? m[1] / 100 : 1;
        else if ((m = /^bg-\[rgba?\(([^\]]*)\)\]$/.exec(b))) a = darkA('rgba(' + m[1].replace(/_/g, ' ') + ')'); }
      if (a === 1) for (const k of n.cls) { const m = /^(?:bg-)?opacity-(\d+)$/.exec(k.split(':').pop()); if (m && variantOk(k)) a = m[1] / 100; }
      return a; };
    const bgDecls = n => [...declsFor(idx, n, 'background'), ...declsFor(idx, n, 'background-image'), ...declsFor(idx, n, 'background-color')];
    const absolute = n => n.cls.has('absolute') || n.cls.has('fixed') || n.cls.has('inset-0') || declsFor(idx, n, 'position').some(d => /absolute|fixed/.test(d.v));
    const empty = n => !clean(textOf(n)) && !(n.kids || []).some(k => /^(img|video|picture|svg|canvas|iframe)$/.test(k.tag));
    const overlayAlpha = n => { const t = tw(n); if (t != null) return t;
      for (const d of bgDecls(n)) { if (PHOTO.test(d.v)) continue; const g = darkGrad(d.v); if (g != null) return g; if (!/gradient/i.test(d.v)) { const a = darkA(d.v); if (a != null) {
        const op = declsFor(idx, n, 'opacity')[0]; return op && /^[\d.]+$/.test(op.v) ? a * +op.v : a; } } }
      return null; };
    // pseudo-element scrims: rules whose selector ends in ::before/::after on this block
    const pseudoAlpha = n => { const got = { before: {}, after: {} };
      for (const r of rules(c.css)) for (const part of r.sel.split(/(?<!\\),/)) { const m = /^(.*?)::?(before|after)\s*$/.exec(part.trim()); if (!m) continue;
        const k = parseCompound(m[1].trim().split(/\s+/).pop()); if (!k || !matchComp(n, k)) continue;
        // full selector must still match (ancestors)
        const toks = m[1].trim().split(/\s+/); if (toks.length > 1) { const up = parseCompound(toks[0]); let ok = false; for (let p = n.parent; p; p = p.parent) if (up && matchComp(p, up)) ok = true; if (!ok) continue; }
        const g = got[m[2]];
        const bg = (/(?:^|;)\s*background(?:-color|-image)?\s*:\s*([^;]+)/i.exec(r.body) || [])[1];
        if (bg) { let a = darkGrad(bg); if (a == null && !/gradient/i.test(bg)) a = darkA(bg); g.a = a; }
        const op = (/(?:^|;)\s*opacity\s*:\s*([\d.]+)/i.exec(r.body) || [])[1]; if (op) g.op = +op; }
      // colour and opacity often come from different rules (.overlay::before + .overlay-50::before)
      for (const g of Object.values(got)) if (g.a != null) return g.a * (g.op ?? 1);
      return null; };
    const ev = [];
    const name = n => '<' + n.tag + (n.cls.size ? ' class="' + [...n.cls].slice(0, 3).join(' ') + '"' : '') + '>';
    let x = h.parent;
    for (let up = 0; x && x.tag !== '#root' && x.tag !== 'body' && x.tag !== 'html' && up < 7; up++, x = x.parent) {
      let photo = null, scrim = null;
      for (const d of bgDecls(x)) { const p = PHOTO.exec(d.v); if (!p || !isPhotoUrl(p[1])) continue; photo = 'background ' + p[1].split('/').pop().slice(0, 40);
        const g = darkGrad(d.v.slice(0, p.index)); if (g != null) scrim = 'gradient ' + Math.round(g * 100) + '% over the image (' + d.sel.slice(0, 30) + ')'; }
      // an <img>/<picture> child (or grandchild) that does not hold the headline, positioned to fill the block
      const kids = (x.kids || []).filter(k => k.tag !== '#text');
      if (!photo) for (const k of kids) { const im = k.tag === 'img' ? k : (k.tag === 'picture' || k.tag === 'div' || k.tag === 'figure') && !clean(textOf(k)) ? (k.kids || []).find(z => z.tag === 'img') || ((k.kids || []).find(z => z.tag === 'picture') || {}).kids?.find(z => z.tag === 'img') : null;
        if (!im) continue; const src = (/\ssrc\s*=\s*["']([^"']+)/i.exec(im.a) || [])[1] || '';
        if (!src || !/\.(?:jpe?g|webp|avif)\b|images\.unsplash\.com|images\.pexels\.com/i.test(src) || /logo|icon|avatar/i.test(src)) continue;   // photos, not PNG/SVG artwork
        const fill = [im, k].some(z => absolute(z) || z.cls.has('object-cover') || declsFor(idx, z, 'object-fit').some(d => d.v === 'cover'));
        if (fill) { photo = '<img> ' + src.split('?')[0].split('/').pop().slice(0, 40); break; } }
      if (!photo) continue;
      if (!scrim) { const a = pseudoAlpha(x); if (a != null && a >= 0.5 && a <= 0.85) scrim = '::before/::after scrim ' + Math.round(a * 100) + '%'; }
      if (!scrim) for (const k of kids) { if (!empty(k) || !absolute(k)) continue; const a = overlayAlpha(k); if (a != null && a >= 0.5 && a <= 0.85) { scrim = name(k) + ' overlay ' + Math.round(a * 100) + '%'; break; } }
      if (scrim) { ev.push(name(x) + ' photo (' + photo + ') under ' + scrim + ', headline "' + clean(textOf(h)).slice(0, 50) + '"'); break; }
    }
    return ev.length ? {evidence:ev} : null; } },
{ code:'A82', id:'the-memorised-stock-photo', name:'The Memorised Stock Photo',
  fix:'Use your own product screenshots or photos; if stock is unavoidable, pick it by hand, host it yourself and check it shows what the section says.',
  test(c){
    // A visible <img>/<source>/background image hotlinked from images.unsplash.com/photo-<id> (or source.unsplash.com,
    // images.pexels.com/photos). Meta/link tags (og:image) are not on the page. Unsplash/Pexels' own sites are skipped.
    const own = ((/<link\b[^>]*rel=["']canonical["'][^>]*href=["']https?:\/\/([^\/"']+)/i.exec(c.html) || /<meta\b[^>]*og:url["'][^>]*content=["']https?:\/\/([^\/"']+)/i.exec(c.html) || [])[1] || '').toLowerCase();
    if (/(^|\.)(unsplash|pexels)\.com$/.test(own)) return null;
    const STOCK = /(?:https?:)?\/\/(images\.unsplash\.com\/(?:photo-[\w-]+|[\w-]{8,}(?=[?"'\s)]))|plus\.unsplash\.com\/premium_photo-[\w-]+|source\.unsplash\.com\/[\w\/-]+|images\.pexels\.com\/photos\/\d+)/i;
    const ev = [], seen = new Set();
    const body = c.isFullDoc ? ((/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(c.html) || [, c.html])[1]) : c.html;
    const add = (where, m) => { const k = m[1].replace(/[?].*$/, ''); if (seen.has(k)) return; seen.add(k); ev.push(where + ' ' + k.slice(0, 70)); };
    for (const m of all(/<(img|source|div|section|header|figure|a|span|picture)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi, body)) {
      const a = m[2];
      if (/data-sp-hidden/.test(a)) continue;
      for (const att of all(/\s(src|srcset|data-src|style)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi, a)) {
        let v = att[2] ?? att[3];
        if (att[1].toLowerCase() === 'style') {   // only a real background declaration paints (a typo like background-i2mage does not)
          v = all(/(?:^|;)\s*background(?:-image)?\s*:([^;]*)/gi, v).map(x => x[1]).join(' ');
          if (!/url\(/i.test(v)) continue; }
        const s = STOCK.exec(v);
        if (s) { add('<' + m[1].toLowerCase() + '>', s); break; }
      }
    }
    const bgDecl = b => all(/(?:^|;)\s*background(?:-image)?\s*:([^;]*)/gi, b).map(x => x[1]).join(' ');
    const used = c.css + ' ' + all(/\sstyle\s*=\s*"([^"]*)"/gi, body).map(m => m[1]).join(' ');
    for (const r of rules(c.css)) {
      let s = STOCK.exec(bgDecl(r.body));
      if (s) { add('background on ' + r.sel.slice(0, 40), s); continue; }
      // a custom property holding the photo counts when a background uses it
      for (const m of all(/(--[\w-]+)\s*:\s*([^;]*)/g, r.body)) { s = STOCK.exec(m[2]);
        if (s && new RegExp('background(?:-image)?\\s*:[^;]*var\\(\\s*' + m[1] + '\\b').test(used)) add('background via ' + m[1].slice(0, 40), s); }
    }
    return ev.length ? {evidence:ev.slice(0, 4)} : null; } },
{ code:'A83', id:'centred-paragraphs', name:'Centred Paragraphs',
  fix:'Left-align any text longer than two lines; keep centring for short, single-line moments.',
  test(c){
    // Running-text paragraphs (<p> of 100+ characters: 2+ lines in a centred column, 3+ in a card) whose text-align
    // resolves to center through the cascade (own or inherited: CSS rules, inline style, Tailwind text-center,
    // align="center"): 4+ of them over 3+ page sections, and at least half of all such paragraphs.
    // ---- mini DOM + cascade (static; no media context: c.css has media blocks flattened) ----
    const VOIDT = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
    const parseDom = html => {
      const root = { tag:'#root', cls:new Set(), id:'', a:'', kids:[], parent:null, txt:'' };
      let cur = root, last = 0;
      // attribute-aware tag pattern: a stray apostrophe in text or an unquoted value must not swallow later tags
      const re = /<(\/?)([a-z][\w-]*)((?:\s+[^\s=>\/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?)*\s*\/?)\s*>|<!--[\s\S]*?-->/gi; let m;
      while ((m = re.exec(html))) {
        const t = html.slice(last, m.index); last = re.lastIndex;
        if (t.trim()) cur.kids.push({ tag:'#text', txt:t.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#?\w+;/g,'x'), parent:cur });
        if (!m[2]) continue;
        const tag = m[2].toLowerCase();
        if (m[1]) { let n = cur; while (n && n.tag !== tag) n = n.parent; if (n && n.parent) cur = n.parent; continue; }
        const a = m[3];
        const cm = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(a), im = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(a);
        const node = { tag, cls:new Set(cm ? (cm[1] ?? cm[2]).split(/\s+/).filter(Boolean) : []), id: im ? (im[1] ?? im[2]) : '', a, kids:[], parent:cur };
        cur.kids.push(node);
        if (!VOIDT.test(tag) && !/\/\s*$/.test(a)) cur = node;
        if (/^(script|style|template|noscript|svg)$/.test(tag)) { const e = html.toLowerCase().indexOf('</' + tag, re.lastIndex); if (e > 0) { re.lastIndex = e; last = e; } }
      }
      return root;
    };
    const textOf = n => n.tag === '#text' ? n.txt : /^(script|style|template|noscript|svg|select|button)$/.test(n.tag) ? '' : n.kids.map(textOf).join(' ');
    const clean = s => s.replace(/\s+/g, ' ').trim();
    const walk = (n, f) => { f(n); if (n.kids) for (const k of n.kids) walk(k, f); };
    const isHid = n => { for (let p = n; p; p = p.parent) { if (!p.a) continue;
      if (/data-sp-hidden|\saria-hidden\s*=\s*["']true|\shidden(\s|=|$)/i.test(p.a + ' ')) return true;
      if (/style\s*=\s*["'][^"']*(display\s*:\s*none|visibility\s*:\s*hidden)/i.test(p.a)) return true;
      if (p.cls.has('sr-only') || p.cls.has('visually-hidden') || p.cls.has('screen-reader-text')) return true; } return false; };
    const unesc = s => s.replace(/\\([0-9a-f]{1,6}\s?)/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\(.)/g, '$1');
    // tailwind variant prefixes that apply at a 1280px desktop viewport with no state
    const TWOK = /^(sm|md|lg|xl)$/;
    const variantOk = cls => { const p = cls.split(':'); p.pop(); return p.every(v => TWOK.test(v)); };
    const bpRank = cls => { const p = cls.split(':'); return p.length === 1 ? 0 : ({ sm:1, md:2, lg:3, xl:4 })[p[0]] || 0; };
    const parseCompound = s => {
      // returns {tag, cls[], id} or null when it has something we cannot evaluate statically
      s = s.replace(/:(?:where|is)\(\s*([^()]*?)\s*\)/g, (_, x) => /^[\w.#-]+$/.test(x) ? x : '\u0001')
           .replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '');
      if (/\u0001|\[|::?(?!root\b)[\w-]/.test(s.replace(/\\./g, 'x'))) return null;
      s = s.replace(/:root\b/, 'html');
      const tag = ((/^[a-z][\w-]*|^\*/i.exec(s) || [''])[0]).toLowerCase();
      const cls = all(/\.((?:\\.|[\w-])+)/g, s).map(m => unesc(m[1]));
      const id = ((/#((?:\\.|[\w-])+)/.exec(s) || [])[1]) || '';
      return { tag: tag === '*' ? '' : tag, cls, id: unesc(id) };
    };
    const matchComp = (n, k) => n && n.tag !== '#root' && (!k.tag || n.tag === k.tag) && (!k.id || n.id === k.id) && k.cls.every(x => n.cls.has(x) && (!x.includes(':') || variantOk(x)));
    const matchSel = (n, comps, combs, i) => {
      if (!matchComp(n, comps[i])) return false;
      if (i === 0) return true;
      if (combs[i - 1] === '>') return matchSel(n.parent, comps, combs, i - 1);
      for (let p = n.parent; p && p.tag !== '#root'; p = p.parent) if (matchSel(p, comps, combs, i - 1)) return true;
      return false;
    };
    const buildIndex = css => {
      const idx = new Map(); let order = 0;
      const put = (k, v) => { if (!idx.has(k)) idx.set(k, []); idx.get(k).push(v); };
      for (const r of rules(css)) {
        order++;
        for (const part of r.sel.split(/(?<!\\),/)) {
          const toks = part.trim().replace(/\s*([>+~])\s*/g, ' $1 ').split(/\s+/).filter(Boolean);
          const comps = [], combs = []; let bad = false;
          for (const t of toks) { if (t === '>' || t === '+' || t === '~') { if (t !== '>') bad = true; combs[comps.length - 1] = '>'; continue; }
            if (comps.length > combs.length) combs.push(' ');
            const k = parseCompound(t); if (!k) { bad = true; break; } comps.push(k); }
          if (bad || !comps.length) continue;
          const spec = comps.reduce((s, k) => s + (k.id ? 10000 : 0) + k.cls.length * 100 + (k.tag ? 1 : 0), 0);
          const last = comps[comps.length - 1];
          const rec = { comps, combs, body: r.body, spec, order, sel: part.trim() };
          put(last.id ? '#' + last.id : last.cls.length ? '.' + last.cls[0] : last.tag || '*', rec);
        }
      }
      return idx;
    };
    // all declarations of prop that match node n, best first: [{v, spec, order, sel, important}]
    const declsFor = (idx, n, prop) => {
      const cands = [...(idx.get('*') || []), ...(idx.get(n.tag) || []), ...(n.id ? idx.get('#' + n.id) || [] : [])];
      for (const k of n.cls) cands.push(...(idx.get('.' + k) || []));
      const re = new RegExp('(?:^|;|\\s|\\{)' + prop + '\\s*:\\s*([^;{}]+)', 'gi');
      const out = [];
      for (const r of new Set(cands)) { if (!matchSel(n, r.comps, r.combs, r.comps.length - 1)) continue;
        for (const m of all(re, r.body)) { const v = m[1].trim(); out.push({ v: v.replace(/\s*!important\s*$/i, ''), imp: /!important/i.test(v), spec: r.spec, order: r.order, sel: r.sel }); } }
      const st = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(n.a || '');
      if (st) for (const m of all(re, ';' + (st[1] ?? st[2]))) { const v = m[1].trim(); out.push({ v: v.replace(/\s*!important\s*$/i, ''), imp: /!important/i.test(v), spec: 1e6, order: 1e9, sel: 'style=""' }); }
      return out.sort((x, y) => (y.imp - x.imp) || (y.spec - x.spec) || (y.order - x.order));
    };
    // ---- end engine ----
    const root = parseDom(c.html), idx = buildIndex(c.css);
    const selFirst = new Map(), alignFirst = new Map(); { let o = 0; for (const r of rules(c.css)) { o++; for (const part of r.sel.split(/(?<!\\),/)) { const k = part.trim(); if (!selFirst.has(k)) selFirst.set(k, o);
      const ta = /(?:^|;)\s*text-align\s*:\s*([\w-]+)/i.exec(r.body); if (ta && !alignFirst.has(k)) alignFirst.set(k, [o, ta[1]]); } } }
    const twOn = !c.isFullDoc || /--tw-[\w-]+\s*:/.test(c.css);
    // classes the page's CSS defines are priced by the cascade below; Tailwind semantics only fill in classes with
    // no rule of their own (snippets, and v4 breakpoint variants nested inside @media, which c.css does not list)
    const defined = k => c.css.includes('.' + k.replace(/([:\[\]\/.#%(),])/g, '\\$1') + '{');
    const twAlign = n => { let best = null, rank = -1;
      for (const k of n.cls) { if (!variantOk(k) || !/text-(center|left|right|justify|start|end)$/.test(k) || !twOn || c.isFullDoc && defined(k)) continue; const m = /^text-(center|left|right|justify|start|end)$/.exec(k.split(':').pop());
        if (m && bpRank(k) >= rank) { best = m[1]; rank = bpRank(k); } } return best; };
    const alignOf = n => {
      for (let p = n, d = 0; p && p.tag !== '#root'; p = p.parent, d++) {
        const tw = twAlign(p); if (tw) return { v: tw, by: d ? '<' + p.tag + '.' + [...p.cls].find(k => /text-(center|left|right|justify|start|end)$/.test(k)) + '>' : 'text-' + tw };
        const ds = declsFor(idx, p, 'text-align').filter(x => /^(center|left|right|justify|start|end|-webkit-center|inherit)$/i.test(x.v));
        if (ds.length && ds[0].v !== 'inherit') {
          const v = ds[0].v.replace('-webkit-', '').toLowerCase();
          // media blocks are flattened in c.css: a centring rule whose selector first appeared without it (or left-aligned), or that an equal
          // matching rule contradicts, is probably a phone-only override, so it does not count
          if (v === 'center' && /(?:mobile|tablet|phone|small|(?:^|[-_.])xs)(?:[-_]|\b)/i.test(ds[0].sel)) return { v: 'unknown', by: '' };   // named as a small-screen rule
          if (v === 'center' && ds[0].spec < 1e6 && !/^\.(?:sm|md|lg|xl)\\:text-center$/.test(ds[0].sel) && (selFirst.get(ds[0].sel) < (alignFirst.get(ds[0].sel) || [0])[0] || !/center/i.test((alignFirst.get(ds[0].sel) || [0, 'center'])[1]) || ds.some(x => !/center/i.test(x.v) && x.spec === ds[0].spec))) return { v: 'unknown', by: '' };
          return { v, by: ds[0].sel.slice(0, 40) }; }
        const al = /\salign\s*=\s*["']?(center|left|right)/i.exec(p.a || ''); if (al) return { v: al[1].toLowerCase(), by: '<' + p.tag + ' align>' };
        if (p.tag === 'center') return { v: 'center', by: '<center>' };
      }
      return { v: 'start', by: '' }; };
    // the page section a node belongs to: nearest section/header/footer/article/aside or a direct child of main/body
    const sectionOf = n => { let last = n;
      for (let p = n.parent; p && p.tag !== '#root'; last = p, p = p.parent) {
        if (/^(section|header|footer|article|aside)$/.test(p.tag)) return p;
        if (/^(main|body)$/.test(p.tag)) return last; }
      return last; };
    const hits = [], secs = new Set(); let longP = 0;
    walk(root, n => {
      if (n.tag !== 'p' || isHid(n)) return;
      const t = clean(textOf(n)); if (t.length < 100) return;
      // skip text inside a footer, nav, form, blockquote/testimonial or figure caption: not body copy
      for (let p = n.parent; p; p = p.parent) if (/^(nav|footer|form|blockquote|figcaption|button|a|li|td|th|dialog)$/.test(p.tag)) return;
      // hidden by the page's CSS (display:none / visibility:hidden), or a stacked carousel slide (absolute layer)
      for (let p = n, d = 0; p && p.tag !== '#root'; p = p.parent, d++) {
        const dd = declsFor(idx, p, 'display')[0], vv = declsFor(idx, p, 'visibility')[0];
        if (dd && dd.v === 'none' || vv && vv.v === 'hidden') return;
        if (d < 4 && [...p.cls].some(k => /^(absolute|opacity-0|invisible)$/.test(k))) return;
        if ([...p.cls].some(k => /^(?:sm|md|lg|xl):hidden$|^hidden-(?:md|lg|xl)(?:-up)?$|^d-(?:md|lg|xl)-none$/.test(k))) return;   // the phone-only copy of a section
        if (/(?:^|[-_\s])(slide|carousel|swiper|marquee|ticker|tab-pane)(?:[-_\s]|$)/i.test([...p.cls].join(' '))) return; }
      longP++;
      const a = alignOf(n); if (a.v !== 'center') return;
      hits.push({ n, t, by: a.by }); secs.add(sectionOf(n));
    });
    // centring has to be the page's habit, not one centred hero and CTA: 4+ centred paragraphs over 3+ sections,
    // at least half of all paragraphs of this length
    if (hits.length < 4 || secs.size < 3 || hits.length < longP / 2) return null;
    return { evidence: ['' + hits.length + ' of ' + longP + ' paragraphs of 100+ chars centred across ' + secs.size + ' sections',
      ...hits.slice(0, 3).map(h => '<p> ' + h.t.length + ' chars centred by ' + h.by + ': "' + h.t.slice(0, 50) + '…"')] }; } },
{ code:'A88', id:'nameless-icon-buttons', name:'Nameless Icon Buttons',
  fix:'Give every icon-only button or link an accessible name, such as aria-label="Open menu" or visually hidden text.',
  test(c){
    const ev=[];
    // drop subtrees a screen reader never reaches: aria-hidden="true" and inert
    const drop = (html, test) => {
      const OPEN = /<([a-z][\w-]*)\b([^>]*)>/gi; let out = '', i = 0, m;
      while ((m = OPEN.exec(html))) {
        const tag = m[1].toLowerCase();
        if (/^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/.test(tag) || /\/\s*$/.test(m[2]) || !test(m[2])) continue;
        const re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi'); re.lastIndex = OPEN.lastIndex; let d = 1, e;
        while (d && (e = re.exec(html))) d += e[1] ? -1 : 1;
        const end = d ? OPEN.lastIndex : re.lastIndex;
        out += html.slice(i, m.index); i = end; OPEN.lastIndex = end;
      }
      return out + html.slice(i);
    };
    const html = drop(c.html, a => /\saria-hidden\s*=\s*["']?true|\sinert(?:[\s=>]|$)/i.test(' ' + a));
    const attr = (a, n) => { const m = new RegExp('\\s' + n + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(' ' + a); return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null; };
    const named = (a, inner) => {
      for (const n of ['aria-label', 'title']) { const v = attr(a, n); if (v && v.trim()) return true; }
      if (attr(a, 'aria-labelledby') !== null) return true;
      // text, img alt, svg <title>, aria-label on an inner element
      let s = inner.replace(/<(svg)\b[^>]*>(?:(?!<\/svg>)[\s\S])*?<title[^>]*>([^<]*)<\/title>[\s\S]*?<\/svg>/gi, ' $2 ');
      if (/<img\b[^>]*\salt\s*=\s*["']\s*[^"'\s][^"']*["']/i.test(s)) return true;
      if (/<img\b(?![^>]*\salt\s*=)[^>]*>/i.test(s)) return true;   // no alt at all: AT falls back to the file name; not this pattern
      if (/<[a-z][^>]*\saria-label\s*=\s*["']\s*[^"'\s]/i.test(s)) return true;
      if (/<(input|select|textarea|object|iframe|video|canvas)\b/i.test(s)) return true;
      s = s.replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;|&#x200b;|&zwnj;|&zwj;/gi, ' ');
      return /[\p{L}\p{N}]/u.test(s.replace(/&[a-z]+;|&#\d+;/gi, 'x'));
    };
    const ICON_CLS = /(^|[\s"'_-])(fa[srlbd]?|fa-[\w-]+|icon|icons?-[\w-]+|bi|bi-[\w-]+|ri-[\w-]+|ti|ti-[\w-]+|glyphicon|feather|lucide|octicon|mdi|iconify|ion-[\w-]+|la|la-[\w-]+|codicon)(?=[\s"'_-]|$)/i;
    const iconOnly = inner => /<svg\b/i.test(inner) || /<img\b[^>]*\salt\s*=\s*["']\s*["']/i.test(inner)
      || /<(i|span)\b[^>]*\sclass\s*=\s*["'][^"']*/i.test(inner) && all(/<(i|span)\b[^>]*\sclass\s*=\s*["']([^"']*)["']/gi, inner).some(m => ICON_CLS.test(' ' + m[2] + ' '));
    const desc = (tag, a, inner) => {
      const href = attr(a, 'href'); const cls = (attr(a, 'class') || '').trim().split(/\s+/).slice(0, 3).join('.');
      const what = /<svg\b/i.test(inner) ? '<svg>' : /<img\b/i.test(inner) ? '<img alt="">' : 'icon-font glyph';
      const who = tag === 'a' ? '<a href="' + String(href).slice(0, 40) + '">' : '<button' + (cls ? ' class="' + cls.slice(0, 30) + '"' : '') + '>';
      return who + ' holds only an ' + what + ', no text, aria-label or title';
    };
    for (const m of all(/<(button|a)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1\s*>/gi, html)) {
      const tag = m[1].toLowerCase(), a = m[2], inner = m[3];
      if (inner.length > 6000) continue;
      if (tag === 'a' && attr(a, 'href') === null) continue;
      if (/\srole\s*=\s*["']?(presentation|none)\b/i.test(' ' + a) || /\stabindex\s*=\s*["']?-1/i.test(' ' + a)) continue;
      if (/\stype\s*=\s*["']?hidden/i.test(' ' + a)) continue;
      if (!iconOnly(inner) || named(a, inner)) continue;
      ev.push(desc(tag, a, inner));
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,4)} : null; } },

{ code:'A90', id:'placeholder-as-label', name:'Placeholder As Label',
  fix:'Give every field a visible <label> tied to it with for/id; keep the placeholder for an example value only.',
  test(c){
    const ev=[];
    const html = c.html;
    const attr = (a, n) => { const m = new RegExp('\\s' + n + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(' ' + a); return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null; };
    const labelFor = new Set(all(/<label\b[^>]*\sfor\s*=\s*["']?([^"'\s>]+)[^>]*>([\s\S]*?)<\/label>/gi, html)
      .filter(m => /[\p{L}\p{N}]/u.test(m[2].replace(/<[^>]+>/g, ''))).map(m => m[1]));
    // spans of <label>...</label> that wrap a field
    const wraps = all(/<label\b[^>]*>[\s\S]*?<\/label>/gi, html).filter(m => m[0].length < 4000).map(m => [m.index, m.index + m[0].length]);
    const inWrap = i => wraps.some(([s, e]) => i > s && i < e);
    // fields inside a closed-on-load layer (modal, overlay, popup, drawer) are not on screen
    const layered = new Set(); { const st = [];
      for (const t of all(/<(\/?)([a-z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi, html)) {
        const tag = t[2].toLowerCase();
        if (t[1]) { for (let j = st.length - 1; j >= 0; j--) if (st[j].tag === tag) { st.length = j; break; } continue; }
        if (tag === 'input' || tag === 'textarea') { if (st.some(x => x.layer)) layered.add(t.index); continue; }
        if (/^(area|base|br|col|embed|hr|img|link|meta|source|track|wbr)$/.test(tag) || /\/\s*$/.test(t[3])) continue;
        const idc = ((/\s(?:id|class)\s*=\s*["']([^"']*)["']/gi.exec(' ' + t[3]) || [])[1] || '') + ' ' + ((/\sid\s*=\s*["']([^"']*)["']/i.exec(' ' + t[3]) || [])[1] || '');
        st.push({ tag, layer: tag === 'dialog' || /(^|[\s_-])(modal|overlay|popup|popover|dialog|drawer|lightbox|offcanvas|palette|cmdk|command-menu)([\s_-]|$)/i.test(idc) || /\srole\s*=\s*["']dialog/i.test(' ' + t[3]) });
      } }
    for (const m of all(/<(input|textarea)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi, html)) {
      const tag = m[1].toLowerCase(), a = m[2];
      if (layered.has(m.index)) continue;
      const ph = attr(a, 'placeholder'); if (!ph || !/[\p{L}]/u.test(ph)) continue;
      const type = (attr(a, 'type') || 'text').toLowerCase();
      if (tag === 'input' && !/^(text|email|password|tel|url|number|date|search)$/.test(type)) continue;
      if (/\s(?:aria-hidden\s*=\s*["']?true|disabled|readonly)\b/i.test(' ' + a)) continue;
      // an accessible name or a programmatic label means the field is labelled (the signal's definition)
      if ((attr(a, 'aria-label') || '').trim() || attr(a, 'aria-labelledby') !== null) continue;
      const id = attr(a, 'id'); if (id && labelFor.has(id)) continue;
      if (inWrap(m.index)) continue;
      // a visible caption written just before the field (an unassociated <label>, or a legend) still labels it on screen
      const before = html.slice(Math.max(0, m.index - 400), m.index);
      const lastField = Math.max(before.lastIndexOf('<input'), before.lastIndexOf('<textarea'), before.lastIndexOf('<select'), before.lastIndexOf('</form'));
      const lead = before.slice(lastField < 0 ? 0 : lastField);
      if (/<(label|legend)\b/i.test(lead)) continue;
      // ...or a short caption in plain markup right above it (<div>Website name</div><input>), not a sentence, heading or control
      const cap = /<(div|span|p|strong|b|small|dt|th|td)\b[^>]*>([^<>]*[\p{L}][^<>]*)<\/\1>((?:<(?!\/?(?:a|button)\b)[^>]*>|\s)*)$/u.exec(lead);
      if (cap && cap[3].length < 200) { const t = cap[2].trim(); if (t.split(/\s+/).length <= 5 && !/[.!?…]$/.test(t)) continue; }
      ev.push('<' + tag + (tag === 'input' ? ' type="' + type + '"' : '') + ' placeholder="' + ph.trim().slice(0, 40) + '"> has no <label> or aria-label');
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,4)} : null; } },

{ code:'A92', id:'the-floating-pill-navbar', name:'The Floating Pill Navbar',
  fix:'Use a normal full-width header; if the floating capsule stays, add scroll-margin-top to anchor targets and plan where extra links go.',
  test(c){
    const ev=[];
    // index the page's CSS by the last compound of each selector (simple compounds only, no state pseudo-classes)
    const idx = new Map(); const put = (k, v) => { if (!idx.has(k)) idx.set(k, []); idx.get(k).push(v); };
    // desktop screen view only: drop @media print, dark-scheme and max-width (small-screen) blocks before the cascade
    const screenCss = css => { let out = '', i = 0; const re = /@media\b([^{]*)\{/gi; let m;
      while ((m = re.exec(css))) { if (!/print|prefers-color-scheme\s*:\s*dark|max-width|hover\s*:\s*none/i.test(m[1]) || /min-width/i.test(m[1]) && !/max-width/i.test(m[1])) continue;
        let d = 1, j = re.lastIndex; while (j < css.length && d) { const ch = css[j++]; if (ch === '{') d++; else if (ch === '}') d--; }
        out += css.slice(i, m.index); i = j; re.lastIndex = j; }
      return out + css.slice(i); };
    rules(screenCss(c.css)).forEach((r, i) => {
      if (!/position|top|radius|backdrop|max-width|width|margin|padding|inset/i.test(r.body)) return;
      for (const p of r.sel.split(/(?<!\\),/)) {
        if (/:(hover|focus|active|visited|checked|disabled|focus-within|focus-visible)|::|\[data-(?:scrolled|state)|\.(?:scrolled|is-scrolled|sticky-active)\b/i.test(p)) continue;
        const last = p.trim().split(/\s*[\s>+~]\s*/).pop().replace(/:(?:not|is|where)\((?:[^()]|\([^()]*\))*\)|:[\w-]+/g, '');
        const m = /^([a-z][\w-]*)?((?:\.(?:\\.|[\w-])+|#(?:\\.|[\w-])+)*)$/i.exec(last); if (!m) continue;
        const cls = all(/\.((?:\\.|[\w-])+)/g, m[2]).map(x => unesc(x[1])); const id = (/#((?:\\.|[\w-])+)/.exec(m[2]) || [])[1];
        if (!m[1] && !cls.length && !id) continue;
        const k = { tag: (m[1] || '').toLowerCase(), cls, id: id ? unesc(id) : null, body: r.body, i, at: /^@|media/.test(r.sel) };
        put(cls.length ? '.' + cls[0] : id ? '#' + k.id : k.tag, k);
      }
    });
    const decls = e => {
      const hits = [];
      for (const key of [e.tag, ...e.cls.map(x => '.' + x), ...(e.id ? ['#' + e.id] : [])])
        for (const k of idx.get(key) || []) if ((!k.tag || k.tag === e.tag) && k.cls.every(x => e.cls.includes(x)) && (!k.id || k.id === e.id)) hits.push(k);
      hits.sort((a, b) => (a.cls.length * 10 + (a.id ? 100 : 0) + (a.tag ? 1 : 0)) - (b.cls.length * 10 + (b.id ? 100 : 0) + (b.tag ? 1 : 0)) || a.i - b.i);
      const out = {};
      for (const k of [...new Set(hits)].map(h => h.body).concat(e.style ? [e.style] : []))
        for (const d of k.split(';')) { const m = /^\s*([\w-]+)\s*:\s*(.+?)\s*(!important)?\s*$/.exec(d); if (m) out[m[1].toLowerCase()] = m[2]; }
      // Tailwind utilities read from the class names too (arbitrary values like rounded-[28px] are not in the pruned CSS)
      const MW = { sm:384, md:448, lg:512, xl:576, '2xl':672, '3xl':768, '4xl':896, '5xl':1024, '6xl':1152, '7xl':1280 };
      const RD = { full:'9999px', '3xl':'24px', '2xl':'16px', xl:'12px', lg:'8px', md:'6px', sm:'2px', none:'0px' };
      for (const raw of e.cls) {
        const m0 = /^(?:(sm|md|lg):)?(.+)$/.exec(raw); if (!m0 || /:/.test(m0[2])) continue; const u = m0[2]; let m;
        if (/^(fixed|sticky)$/.test(u)) out.position = u;
        else if (u === 'relative' || u === 'static' || u === 'absolute') out.position = u;
        else if ((m = /^top-(\d+(?:\.5)?|px|\[(\d+)(px|rem)\])$/.exec(u))) out.top = m[2] ? m[2] + m[3] : m[1] === 'px' ? '1px' : (+m[1] * 4) + 'px';
        else if ((m = /^rounded(?:-(full|3xl|2xl|xl|lg|md|sm|none)|-\[(\d+)px\])?$/.exec(u))) out['border-radius'] = m[2] ? m[2] + 'px' : RD[m[1] || 'sm'] || '4px';
        else if ((m = /^backdrop-blur(?:-(\w+|\[\d+px\]))?$/.exec(u))) out['backdrop-filter'] = m[1] === 'none' ? 'none' : 'blur(8px)';
        else if ((m = /^max-w-(\w+|\[(\d+)px\])$/.exec(u))) out['max-width'] = m[2] ? m[2] + 'px' : MW[m[1]] ? MW[m[1]] + 'px' : out['max-width'];
        else if ((m = /^w-(fit|auto|max|\[(\d+)px\]|\[min\((\d+)px)/.exec(u))) out.width = m[2] ? m[2] + 'px' : m[3] ? 'min(' + m[3] + 'px)' : m[1] === 'fit' || m[1] === 'max' ? 'fit-content' : 'auto';
        else if ((m = /^(?:mt|my|m)-(\d+(?:\.5)?)$/.exec(u))) out['margin-top'] = (+m[1] * 4) + 'px';
        else if ((m = /^(?:pt|py|p)-(\d+(?:\.5)?)$/.exec(u))) out['padding-top'] = (+m[1] * 4) + 'px';
        else if (/^(inline-flex|inline-block|flex|block|grid)$/.test(u)) out.display = u;
      }
      return out;
    };
    const px = v => { if (v == null) return null; v = String(v).trim();
      let m = /^(-?[\d.]+)(px|rem|em)?$/.exec(v); if (m) return +m[1] * (m[2] && m[2] !== 'px' ? 16 : 1);
      m = /^calc\(\s*var\(--spacing\)\s*\*\s*(-?[\d.]+)\s*\)$/.exec(v); if (m) return +m[1] * 4;
      m = /^min\(\s*([\d.]+)(px|rem)/.exec(v); if (m) return +m[1] * (m[2] === 'rem' ? 16 : 1);
      return null; };
    const first = v => v == null ? null : String(v).trim().split(/\s+/)[0];
    // element tree
    const nodes = [], st = [];
    for (const t of all(/<(\/?)([a-z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi, c.html)) {
      const tag = t[2].toLowerCase();
      if (t[1]) { for (let j = st.length - 1; j >= 0; j--) if (st[j].tag === tag) { st.length = j; break; } continue; }
      const a = t[3];
      const cls = ((/\sclass\s*=\s*["']([^"']*)["']/i.exec(' ' + a) || [])[1] || '').split(/\s+/).filter(Boolean);
      const n = { tag, cls, id: (/\sid\s*=\s*["']([^"']*)["']/i.exec(' ' + a) || [])[1] || null, style: (/\sstyle\s*=\s*["']([^"']*)["']/i.exec(' ' + a) || [])[1] || '',
        parent: st[st.length - 1] || null, kids: [], links: 0, start: t.index };
      if (n.parent) n.parent.kids.push(n);
      if (tag === 'a' || tag === 'button') for (const p of st) p.links++;
      nodes.push(n);
      if (!/^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/.test(tag) && !/\/\s*$/.test(a)) st.push(n);
    }
    const S = new Map(); const sty = n => { if (!S.has(n)) S.set(n, decls(n)); return S.get(n); };
    const centred = n => { const s = sty(n); return /flex/.test(s.display || '') && /center/.test(s['justify-content'] || '') || n.cls.includes('justify-center') && n.cls.some(x => /^(flex|inline-flex)$/.test(x)); };
    const pillOf = (n, d, shrink) => {
      const s = sty(n);
      const r = s['border-radius'] && /^(9999px|999px|50%|100px|100vmax)$/.test(s['border-radius'].trim()) ? 999 : px(first(s['border-radius']));
      const blur = /blur\(\s*[1-9]/.test(s['backdrop-filter'] || s['-webkit-backdrop-filter'] || '') || (/var\(--tw-backdrop-blur\)|var\(--tw-backdrop/.test(s['backdrop-filter'] || '') && n.cls.some(x => /^backdrop-blur/.test(x) && x !== 'backdrop-blur-none'));
      const mw = px(s['max-width']), w = s['width'] || '';
      const narrow = (mw != null && mw > 200 && mw <= 1100) || /^(fit-content|max-content|auto)$/.test(w.trim()) && /inline-flex|inline-block/.test(s['display'] || '') || (px(w) != null && px(w) > 200 && px(w) <= 1100) || /^min\(\s*(\d+)px/.test(w) && +/^min\(\s*(\d+)px/.exec(w)[1] <= 1100;
      // a capsule at full radius may run to max-w-7xl inside a padded bar; a shrink-wrapped child of a centred flex row is narrow too
      const wide = r >= 999 && mw != null && mw > 200 && mw <= 1280;
      const shrunk = shrink && !/100%|100vw/.test(w) && !n.cls.includes('w-full') && mw == null;
      if (r != null && r >= 24 && blur && (narrow || wide || shrunk) && n.links >= 2) return { n, r, mw: mw || w || 'shrink-to-fit' };
      if (d < 2) for (const k of n.kids) { const p = pillOf(k, d + 1, centred(n) || (shrink && !n.cls.includes('w-full') && !/100%/.test(w))); if (p) return p; }
      return null;
    };
    for (const n of nodes) {
      if (!/^(header|nav|div)$/.test(n.tag)) continue;
      const s = sty(n); if (!/^(fixed|sticky)$/.test((s.position || '').trim())) continue;
      if (n.tag === 'div' && !(n.kids.some(k => /^(nav|header)$/.test(k.tag) || k.kids.some(g => /^(nav|header)$/.test(g.tag))) || /nav|header|menu/i.test(n.cls.join(' ') + ' ' + (n.id || '')))) continue;
      const p = pillOf(n, 0, false); if (!p) continue;
      // the capsule must be the bar itself: it holds most of the bar's links and is not a separate floating widget
      if (p.n !== n && (p.n.links < n.links * 0.6 || /^(fixed|absolute)$/.test((sty(p.n).position || '').trim()))) continue;
      if (n.start > c.html.length * 0.5 && !/^(header|nav)$/.test(n.tag)) continue;
      const ps = sty(p.n);
      const gap = Math.max(px(s.top) || 0, px(first(s['padding-top'] || s.padding)) || 0, px(first(ps['margin-top'] || ps.margin)) || 0, p.n !== n && p.n.parent !== n ? px(first(sty(p.n.parent)['margin-top'] || sty(p.n.parent)['padding-top'])) || 0 : 0);
      if (gap <= 0) continue;
      const nm = '<' + p.n.tag + (p.n.cls.length ? ' class="' + p.n.cls.slice(0, 3).join(' ').slice(0, 40) + '"' : '') + '>';
      ev.push(nm + ' ' + (s.position || '').trim() + ' ' + gap + 'px from the top, border-radius ' + (p.r >= 999 ? 'full' : p.r + 'px') + ', backdrop blur, max width ' + String(p.mw).slice(0, 20));
      break;
    }
    return ev.length ? {evidence:ev} : null; } },

{ code:'B164', id:'title-case-every-heading', name:'Title Case Every Heading',
  fix:'Pick one case style, usually sentence case: capitalise only the first word and proper nouns in headings and buttons.',
  test(c){
    const ev=[];
    const SMALL = /^(a|an|the|and|but|or|nor|for|so|yet|as|at|by|in|of|on|to|up|via|vs|with|from|into|onto|over|per|than|that|this|your|our|its|is|are|be|it|you|we|my|no|not|all|just|more)$/i;
    const decode = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&#x27;/g, "'").replace(/&[a-z]+;|&#\d+;/gi, ' ').replace(/\s+/g, ' ').trim();
    const items = [];
    for (const m of all(/<(h[1-4]|button)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, c.html)) if (m[2].length < 600) items.push(decode(m[2]));
    // card titles: a leaf element whose class names it a title or heading
    for (const m of all(/<(div|span|p|strong)\b[^>]*\sclass\s*=\s*["'][^"']*(?:^|[\s_-])(?:card-?title|title|heading|headline)(?=[\s_"'-])[^"']*["'][^>]*>([^<>]{6,90})<\/\1>/gi, c.html)) items.push(decode(m[2]));
    let n = 0, t = 0, strong = 0; const shown = [];
    for (const s of items) {
      if (/[.!?]\s+\S/.test(s) || s.length > 90) continue;                       // a sentence, not a heading
      const words = s.split(/[\s\/–—:|]+/).map(w => w.replace(/^[^\p{L}]+|[^\p{L}\p{N}'’-]+$/gu, '')).filter(w => /^\p{L}/u.test(w));
      if (words.length < 3) continue;
      if (words.every(w => w === w.toUpperCase())) continue;                      // all caps: a different pattern
      const rest = words.slice(1).filter(w => !/^[\p{Lu}\d]{2,}$/u.test(w) && !/\p{Lu}.*\p{Lu}/u.test(w.slice(1)) && !/[\d.@]/.test(w)); // skip acronyms, camelCase names
      const content = rest.filter(w => !SMALL.test(w)), small = rest.filter(w => SMALL.test(w));
      if (content.length + small.length < 2) continue;
      n++;
      const up = w => /^\p{Lu}/u.test(w);
      const contentUp = content.every(up), smallUp = small.filter(up).length;
      // title case: every content word capitalised, and either a short function word capitalised too or several content words
      if (contentUp && (smallUp > 0 && smallUp === small.length || content.length >= 3 && !small.length || content.length >= 2 && small.length && smallUp === 0 && content.length >= 3)) {
        t++; if (smallUp) strong++; if (shown.length < 3) shown.push('"' + s.slice(0, 50) + '"');
      }
    }
    if (n >= 4 && t >= 3 && t / n >= 0.7 && strong >= 1) ev.push(t + ' of ' + n + ' headings and buttons in Title Case: ' + shown.join(', '));
    return ev.length ? {evidence:ev} : null; } },

{ code:'A89', id:'links-you-cant-see', name:"Links You Can't See",
  fix:'Underline links inside running text (text-decoration with an offset), or give them a colour 3:1 apart from the text plus a non-colour cue.',
  test(c){
    const ev=[];
    // ---- a small cascade: rules whose selector chain matches an element and its ancestors ----
    const splitTop = s => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(x => x.trim()).filter(Boolean); };
    const STATE = /:(hover|focus|active|visited|focus-visible|focus-within|target|checked|disabled|empty|placeholder-shown)\b|::?(before|after|selection|marker|placeholder|first-line|first-letter)/i;
    const parseComp = comp => {
      // inline :where(x) / :is(x) that hold one simple compound; drop other functional pseudos except :not([class])
      let s = comp, noClass = false;
      s = s.replace(/:(?:where|is)\(([^()]*)\)/g, (m, x) => /[\s,>+~]/.test(x.trim()) ? '' : x.trim());
      if (/:not\(\[class\]\)/.test(s)) noClass = true;
      s = s.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '').replace(/:(?:where|is|has)\((?:[^()]|\([^()]*\))*\)/g, '').replace(/:(?:link|any-link|first-child|last-child|only-child|nth-[\w-]+\([^)]*\)|first-of-type|last-of-type|root)/g, '');
      const attrs = all(/\[\s*([\w-]+)[^\]]*\]/g, s).map(m => m[1].toLowerCase()); s = s.replace(/\[[^\]]*\]/g, '');
      const m = /^(\*|[a-z][\w-]*)?((?:\.(?:\\.|[\w-])+|#(?:\\.|[\w-])+)*)$/i.exec(s); if (!m) return null;
      return { tag: m[1] && m[1] !== '*' ? m[1].toLowerCase() : '', cls: all(/\.((?:\\.|[\w-])+)/g, m[2]).map(x => unesc(x[1])), id: ((/#((?:\\.|[\w-])+)/.exec(m[2]) || [])[1] || null), attrs, noClass,
        spec: (/#/.test(m[2]) ? 100 : 0) + (all(/\./g, m[2]).length + attrs.length) * 10 + (m[1] && m[1] !== '*' ? 1 : 0) };
    };
    const compMatch = (k, e) => (!k.tag || k.tag === e.tag) && k.cls.every(x => e.cls.includes(x)) && (!k.id || k.id === e.id) && k.attrs.every(a => a === 'class' ? e.cls.length : a === 'href' ? e.tag === 'a' : a === 'target' || a === 'rel' ? true : e.attrs.includes(a)) && (!k.noClass || !e.cls.length);
    // desktop screen view only: drop @media print, dark-scheme and max-width (small-screen) blocks before the cascade
    const screenCss = css => { let out = '', i = 0; const re = /@media\b([^{]*)\{/gi; let m;
      while ((m = re.exec(css))) { if (!/print|prefers-color-scheme\s*:\s*dark|max-width|hover\s*:\s*none/i.test(m[1]) || /min-width/i.test(m[1]) && !/max-width/i.test(m[1])) continue;
        let d = 1, j = re.lastIndex; while (j < css.length && d) { const ch = css[j++]; if (ch === '{') d++; else if (ch === '}') d--; }
        out += css.slice(i, m.index); i = j; re.lastIndex = j; }
      return out + css.slice(i); };
    // nested CSS (".x { & a { ... } }") reaches us without its parent selector: links styled that way cannot be resolved
    // (any "&" selector means the page uses nesting, and an outer "& a { }" block may have been lost entirely)
    if (rules(c.css).some(r => /(^|[\s,(])&/.test(r.sel))) return null;
    const R = []; rules(screenCss(c.css)).forEach((r, i) => {
      if (!/color|text-decoration|border|background|box-shadow|font-weight|font-style/i.test(r.body)) return;
      for (const sel of splitTop(r.sel)) {
        if (STATE.test(sel) || /[+~]/.test(sel.replace(/\[[^\]]*\]/g, ''))) continue;
        const toks = []; { let d = 0, cur = ''; for (const ch of sel.replace(/\s*>\s*/g, ' ')) { if (ch === '(' || ch === '[') d++; if (ch === ')' || ch === ']') d--; if (/\s/.test(ch) && !d) { if (cur) toks.push(cur); cur = ''; } else cur += ch; } if (cur) toks.push(cur); }
        const comps = toks.map(parseComp); if (!comps.length || comps.some(x => !x)) continue;
        R.push({ comps, spec: comps.reduce((a, k) => a + k.spec, 0), i, body: r.body });
      }
    });
    const chainMatch = (comps, e, anc) => { if (!compMatch(comps[comps.length - 1], e)) return false; let j = anc.length - 1;
      for (let q = comps.length - 2; q >= 0; q--) { while (j >= 0 && !compMatch(comps[q], anc[j])) j--; if (j < 0) return false; j--; } return true; };
    const resolve = (e, anc) => {
      const hits = R.filter(r => chainMatch(r.comps, e, anc)).sort((a, b) => a.spec - b.spec || a.i - b.i);
      const out = {}, imp = {}, vals = {};
      for (const b of hits.map(h => h.body).concat(e.style ? [e.style] : []))
        for (const d of b.split(';')) { const m = /^\s*([\w-]+)\s*:\s*(.+?)\s*(!important)?\s*$/.exec(d); if (!m) continue; const p = m[1].toLowerCase();
          (vals[p] = vals[p] || new Set()).add(m[2].trim().toLowerCase()); if (imp[p] && !m[3]) continue; out[p] = m[2]; if (m[3]) imp[p] = 1; }
      // the page CSS arrives flattened (media blocks lost): a property set to different values by matching rules is undecidable
      out._mixed = p => vals[p] && vals[p].size > 1;
      return out;
    };
    // ---- walk the markup: links inside running text ----
    const st = [], seen = new Set();
    for (const t of all(/<(\/?)([a-z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi, c.html)) {
      const tag = t[2].toLowerCase();
      if (t[1]) { for (let j = st.length - 1; j >= 0; j--) if (st[j].tag === tag) { st.length = j; break; } continue; }
      if (/^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/.test(tag) || /\/\s*$/.test(t[3])) continue;
      const a = ' ' + t[3];
      const e = { tag, cls: ((/\sclass\s*=\s*["']([^"']*)["']/i.exec(a) || [])[1] || '').split(/\s+/).filter(Boolean), id: (/\sid\s*=\s*["']([^"']*)["']/i.exec(a) || [])[1] || null,
        style: (/\sstyle\s*=\s*["']([^"']*)["']/i.exec(a) || [])[1] || '', attrs: all(/\s([\w-]+)(?=\s*=|\s|$)/g, a.replace(/"[^"]*"|'[^']*'/g, '')).map(m => m[1].toLowerCase()), start: t.index, open: t.index + t[0].length };
      if (tag === 'a' && /\shref\s*=/i.test(a) && ev.length < 4) {
        const pi = st.map(x => x.tag).lastIndexOf('p'); const li = st.map(x => x.tag).lastIndexOf('li');
        const host = pi >= 0 ? st[pi] : li >= 0 ? st[li] : null;
        if (host && !seen.has(host) && !st.some(x => x.tag === 'details' && !/\sopen\b/i.test(x.attrs.join(' ')) && !x.attrs.includes('open')) && !st.some(x => /^(nav|header|footer|button|h[1-6]|figcaption|small|aside)$/.test(x.tag) || x.cls.some(k => /(^|[-_])(nav|menu|footer|breadcrumb|toc|tags?|btn|button)([-_]|$)/i.test(k)))) {
          const end = c.html.indexOf('</a', e.open); const inner = end > 0 ? c.html.slice(e.open, end) : '';
          const linkText = inner.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ').replace(/\s+/g, ' ').trim();
          const hEnd = c.html.indexOf('</' + host.tag, e.open);
          const hostText = (hEnd > 0 && hEnd - host.open < 4000 ? c.html.slice(host.open, hEnd) : '').replace(/<a\b[\s\S]*?<\/a>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ').replace(/\s+/g, ' ').trim();
          // running text: real words around a short, word-like link; the link carries no non-colour cue (bold, code, icon)
          // mid-sentence: some words of the paragraph come before the link
          const lead = c.html.slice(host.open, e.start).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ').trim();
          if (lead.split(/\s+/).filter(w => /\p{L}/u.test(w)).length >= 2 && /\p{L}{2}/u.test(linkText) && linkText.length <= 80 && hostText.split(' ').length >= 6 && !/<(img|svg|code|strong|b|em|i|kbd|u|mark|button)\b/i.test(inner) && !/underline|border-bottom|font-weight/i.test(inner.replace(/>[^<]*/g, '>'))
              && !st.some(x => /^(strong|b|code|em|u|i|mark|kbd|small|sup|sub)$/.test(x.tag) || /underline|border-bottom/i.test(x.style) || x.cls.includes('underline') || x.cls.some(k => /\[&[_>](?:p_)?a\]:|\[&_a\]|\[&>a\]/.test(k)))
              && !e.cls.some(k => /^(?:[\w-]+:)?(underline|decoration-|border-b|text-(?!xs|sm|base|lg|xl|\d|left|right|center|justify|wrap|nowrap|balance|pretty|inherit|current)|font-(?:medium|semibold|bold|extrabold|black)|bg-|btn|button)/.test(k))) {
            const anc = st.slice();
            // a wrapper between the paragraph and the link that sets its own colour or weight makes the link stand apart
            const hi = anc.indexOf(host);
            const wrapped = anc.slice(hi + 1).some((x, j) => x.cls.some(k => /^(?:[\w-]+:)?(text-(?!xs|sm|base|lg|xl|\d|left|right|center|justify)|font-(?:medium|semibold|bold|extrabold|black)|underline)/.test(k))
              || /color|font-weight|text-decoration/i.test(x.style) || (() => { const r = resolve(x, anc.slice(0, hi + 1 + j)); return r.color || r['font-weight'] || /underline/.test(r['text-decoration'] || r['text-decoration-line'] || ''); })());
            if (wrapped) { st.push(e); continue; }
            const s = resolve(e, anc);
            const deco = (s['text-decoration-line'] || s['text-decoration'] || '').trim().toLowerCase();
            const noDeco = /^(none|inherit|unset|initial)\b/.test(deco) || /^0\b/.test(deco);
            const cue = /^(bold|bolder|[6-9]00)$/.test((s['font-weight'] || '').trim()) || /italic/.test(s['font-style'] || '')
              || /(?:^|\s)(solid|dashed|dotted|double)\b/.test((s['border-bottom'] || '') + ' ' + (s['border-bottom-style'] || '') + ' ' + (s.border || '')) && !/^(0(px)?\s|none)/.test((s['border-bottom'] || s.border || '').trim() + ' ')
              || /inset|0\s+-?\d/.test(s['box-shadow'] || '') || /gradient|url\(/.test(s['background-image'] || s.background || '') || ((s['background-color'] || s.background) && !/transparent|none|inherit/.test(s['background-color'] || s.background));
            if (noDeco && !cue && !s._mixed('color') && !s._mixed('text-decoration') && !s._mixed('text-decoration-line')) {
              const lc = (s.color || '').trim().toLowerCase();
              let why = null;
              if (/^(inherit|currentcolor|unset)$/.test(lc)) why = 'color: ' + lc;
              else { const fg = parseColor(lc); let pc = null;
                for (let j = anc.length - 1; j >= 0 && !pc; j--) { const v = (resolve(anc[j], anc.slice(0, j)).color || '').trim().toLowerCase(); if (v) { pc = /^(inherit|currentcolor)$/.test(v) ? null : parseColor(v); if (!pc) break; } }
                if (fg && pc) { const r = contrast(fg, pc), dist = Math.hypot(fg[0] - pc[0], fg[1] - pc[1], fg[2] - pc[2]);
                  // near-same colour only: a blue link in grey text fails the 3:1 test but is plain to see
                  if (r < 3 && dist < 60) why = hex(fg) + ' on text ' + hex(pc) + ' = ' + r.toFixed(2) + ':1'; } }
              if (why) { seen.add(host); ev.push('<a> "' + linkText.slice(0, 30) + '" in a <' + host.tag + '>: text-decoration ' + (deco.split(/\s/)[0] || 'none') + ', ' + why); }
            }
          }
        }
      }
      st.push(e);
    }
    return ev.length ? {evidence:ev.slice(0,4)} : null; } },

{ code:'B166', id:'bold-label-bullets', name:'Bold-Label Bullets',
  fix:'Write list items as plain facts, or turn the labels into real headings; delete sentences that only restate the label.',
  test(c){
    // A ul/ol whose items open with <strong>/<b> "Label:" then a sentence. >=4 such items and >=60% of the list.
    const ev = [];
    const plain = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    // innermost lists only (no nested ul/ol inside) to keep item text clean
    for (const L of all(/<(ul|ol)\b[^>]*>((?:(?!<\/?(?:ul|ol)\b)[\s\S])*)<\/\1>/gi, c.html)) {
      const items = all(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, L[2]).map(m => m[1]);
      if (items.length < 4) continue;
      let hit = 0, ex = null;
      for (const it of items) {
        // first meaningful child is strong/b (optionally wrapped in p/span), label ends with ':' inside or right after
        const m = /^\s*(?:<(?:p|span|div)\b[^>]*>\s*)*<(strong|b)\b[^>]*>([\s\S]{1,60}?)<\/\1>\s*(:|\s[-–—]\s|[–—])?\s*([\s\S]*)$/i.exec(it);
        if (!m) continue;
        const label = plain(m[2]);
        if (!label || label.split(' ').length > 6 || !/[a-z]{3}/i.test(label)) continue;
        if (/^[\d$€£#]|\b(?:chapter|part|step|day|week|module|lesson|phase|level|round|q)\s*\d+\b/i.test(label) || /\b(?:19|20)\d\d\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d/i.test(label)) continue;   // numbered sequences, stats and timelines are not inline-header bullets
        if (!(/[:–—]$/.test(label) || m[3])) continue;
        const rest = plain(m[4]);
        if (rest.split(' ').length < 3) continue;           // a sentence must follow, not a value ("Price: $5")
        hit++; if (!ex) ex = label.replace(/\s*[:–—]$/, '') + ': ' + rest.slice(0, 40);
      }
      if (hit >= 4 && hit / items.length >= 0.6) ev.push(hit + ' of ' + items.length + ' list items open with a bold label, e.g. "' + ex + '"');
    }
    return ev.length ? {evidence:ev.slice(0,2)} : null; } },

{ code:'B168', id:'the-conclusion-heading', name:'The Conclusion Heading',
  fix:'End the article where the last useful point ends; put any summary at the top as a short answer.',
  test(c){
    const ev = [];
    const plain = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&#x27;/g, "'").replace(/\s+/g, ' ').trim();
    const hs = all(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi, c.html).map(m => ({ lv:+m[1], t: plain(m[2]), end: m.index + m[0].length }));
    if (hs.length < 3) return null;                            // an article skeleton, not a lone heading
    const END = /^(?:\d+\.?\s*)?(?:in conclusion|conclusions?|final thoughts|key takeaways|wrapping up)[.:!]?$/i;
    const lvl = hs.find(h => END.test(h.t));
    if (!lvl) return null;
    // it must close the article: the last h2/h3 at its level within the body text that follows has no further same-level heading
    const after = hs.filter(h => h.end > lvl.end && h.lv <= lvl.lv);
    const para = (/^\s*(?:<[^>]+>\s*)*?<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(c.html.slice(lvl.end, lvl.end + 3000)) || [])[1];
    const pt = para ? plain(para) : '';
    if (pt.length < 60) return null;                            // a real closing paragraph follows
    // trailing headings after it are allowed only if they look like site chrome (related posts, newsletter, comments)
    const CHROME = /related|more (?:posts|articles)|recent|newsletter|subscribe|comments?|share|about the author|leave a|read next|you may|tags|categories|footer|contact|follow/i;
    if (after.some(h => !CHROME.test(h.t))) return null;
    ev.push('closing h' + lvl.lv + ' "' + lvl.t + '"' + (/^in (?:conclusion|summary)/i.test(pt) ? ', paragraph opens "' + pt.slice(0, 30) + '"' : ''));
    return {evidence:ev}; } },

{ code:'B170', id:'the-rotating-noun-headline', name:'The Rotating Noun Headline',
  fix:'Pick the one noun that describes the product and write a static headline; any loop needs a pause and must stop under reduced motion.',
  test(c){
    // A slot inside the h1/h2 that cycles through a list of words. A typing effect that types one fixed sentence is
    // not it, so a word list must be found: in a data attribute, as stacked child spans, or as an array of short
    // strings in a script next to a reference to the slot's id or class.
    const ev = [];
    const plain = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const ROT = /(?:^|[\s_-])(typed|typewriter|type-?writer|typing|txt-rotate|text-rotate|word-?rotate|rotating(?:-\w+)?|rotator|rotate|word-?rotator|flip-?words?|word-?flip|word-?slider|word-?carousel|changing-?word|cycle-?words?|morphing|word-?swap|swap-?word)(?=$|[\s_-])/i;
    const scripts = c.isFullDoc ? all(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, c.text).map(m => m[1]).filter(x => x.length < 400000) : [c.text];
    const wordArr = src => {
      for (const m of all(/\[\s*((?:(["'`])[^"'`\n]{1,28}\2\s*,\s*){2,}(["'`])[^"'`\n]{1,28}\3)\s*,?\s*\]/g, src)) {
        const ws = all(/(["'`])([^"'`\n]{1,28})\1/g, m[1]).map(x => x[2].trim());
        if (ws.length >= 3 && ws.every(w => w && w.split(/\s+/).length <= 3 && !/[{}<>=;\/\\]|^[.#]|^\d+$/.test(w)) && new Set(ws).size === ws.length) return ws;
      }
      return null;
    };
    const near = (key) => {
      if (!key || key.length < 3) return null;
      const re = new RegExp('[\'"`#.]' + key.replace(/[^\w-]/g, '\\$&') + '[\'"`\\s\\])]');
      for (const sc of scripts) {
        const m = re.exec(sc); if (!m) continue;
        const w = wordArr(sc.slice(Math.max(0, m.index - 900), m.index + 900)); if (w) return w;
      }
      return null;
    };
    for (const H of all(/<(h1|h2)\b([^>]*)>([\s\S]*?)<\/\1>/gi, c.html)) {
      const inner = H[3];
      const t = plain(inner);
      if (!t || t.length > 200) continue;
      let why = null;
      for (const m of all(/\bdata-(?:rotate|type|words|period|typed|typewriter|strings|items)\s*=\s*["']([^"']{3,200})["']/gi, inner)) {
        const raw = m[1].replace(/&quot;/g, '"');
        const q = all(/"([^"]{1,40})"/g, raw).map(x => x[1].trim()).filter(w => !/^(strings|words|items|period|speed|loop|delay)$/i.test(w));
        const ws = (q.length ? q : raw.split(/[\[\],|]+/)).map(x => x.trim()).filter(w => /[a-z]{2}/i.test(w));
        if (ws.length >= 2) { why = 'word list "' + ws.slice(0, 4).join(' / ') + '" in a data attribute inside the ' + H[1]; break; }
      }
      if (!why) for (const m of all(/<([a-z][\w-]*)\b([^>]*)>/gi, inner)) {
        const id = (/\bid\s*=\s*["']([^"']+)["']/i.exec(m[2]) || [])[1];
        const cls = (/\bclass\s*=\s*["']([^"']+)["']/i.exec(m[2]) || [])[1] || '';
        const k = ROT.exec(cls);
        if (!id && !k) continue;
        // stacked child words (CSS-only rotation): >=3 direct one-to-three-word children
        if (k) {
          const rest = inner.slice(m.index + m[0].length);
          const kids = all(/^\s*<(span|b|i|em|strong|div|li)\b[^>]*>([^<]{1,30})<\/\1>/g, rest);
          let j = 0, kidsWords = []; let r2 = rest;
          for (let n = 0; n < 8; n++) { const q = /^\s*<(span|b|i|em|strong|div|li)\b[^>]*>([^<]{1,30})<\/\1>/.exec(r2); if (!q) break; kidsWords.push(q[2].trim()); r2 = r2.slice(q[0].length); }
          if (kidsWords.length >= 3 && kidsWords.every(w => w.split(/\s+/).length <= 3 && /[a-z]{2}/i.test(w)) && new Set(kidsWords).size === kidsWords.length) { why = '.' + k[1] + ' inside the ' + H[1] + ' stacks "' + kidsWords.slice(0, 4).join(' / ') + '"'; break; }
        }
        const named = k || ROT.exec(id || '');
        let ws = near(id) || (k ? cls.split(/\s+/).filter(x => ROT.test(x)).map(near).find(Boolean) : null);
        // an element with no rotation-style name counts only if the word it shows now is one of the list
        if (ws && !named) {
          const close = inner.indexOf('</', m.index + m[0].length);
          const cur = plain(inner.slice(m.index + m[0].length, close < 0 ? undefined : close)).toLowerCase();
          if (!cur || !ws.some(w => w.toLowerCase() === cur)) ws = null;
        }
        if (ws) { why = (k ? '.' + k[1] : '#' + id) + ' inside the ' + H[1] + ' cycles "' + ws.slice(0, 4).join(' / ') + '"'; break; }
      }
      if (why) ev.push(why + ' (headline: "' + t.slice(0, 50) + '")');
    }
    return ev.length ? {evidence:ev.slice(0,2)} : null; } },

{ code:'B179', id:'the-silent-disabled-button', name:'The Silent Disabled Button',
  fix:'Keep the submit button enabled, validate on submit, and show the error next to the field that caused it.',
  test(c){
    const ev = [];
    const plain = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    for (const F of all(/<form\b[^>]*>([\s\S]*?)<\/form>/gi, c.html)) {
      const f = F[1];
      // a form the user fills: at least two enabled fields, so "which field is wrong" is a real question
      // (a lone search or prompt box with a grey button explains itself)
      const DIS = a => /\sdisabled(?:\s|=|$|\/)/i.test(' ' + a + ' ');
      const all_ = all(/<(input|textarea|select)\b([^>]*)>/gi, f).filter(m => !/type\s*=\s*["']?(?:hidden|submit|button|reset|image|search)\b/i.test(m[2]) && !/aria-hidden\s*=\s*["']true|tabindex\s*=\s*["']-1|\shidden(?:\s|=|$)/i.test(' ' + m[2] + ' ') && !/readonly/i.test(m[2]));
      if (all_.some(m => DIS(m[2]))) continue;          // the whole form is locked (loading, signed out): a different state
      const fields = all_.filter(m => m[1].toLowerCase() !== 'input' || !/type\s*=\s*["']?(?:checkbox|radio|range|color|file)\b/i.test(m[2]));
      if (fields.length < 2) continue;
      let btn = null;
      for (const b of all(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi, f)) {
        const a = b[1];
        const type = (/\btype\s*=\s*["']?(\w+)/i.exec(a) || [, 'submit'])[1].toLowerCase();
        if (type !== 'submit' || /aria-hidden\s*=\s*["']true/i.test(a)) continue;
        if (/\sdisabled(?:\s|=|$|>)/i.test(' ' + a + ' ') || /aria-disabled\s*=\s*["']true/i.test(a)) { btn = plain(b[2]) || 'submit'; break; }
      }
      if (!btn) for (const i of all(/<input\b([^>]*)>/gi, f)) {
        if (/type\s*=\s*["']?submit/i.test(i[1]) && /\sdisabled(?:\s|=|$|\/)/i.test(' ' + i[1] + ' ')) { btn = (/value\s*=\s*["']([^"']*)/i.exec(i[1]) || [, 'submit'])[1]; break; }
      }
      if (!btn) continue;
      // another submit control in the form is enabled: the grey one is not the gate
      const enabledSubmit = all(/<button\b([^>]*)>/gi, f).some(b => (/\btype\s*=\s*["']?(\w+)/i.exec(b[1]) || [, 'submit'])[1].toLowerCase() === 'submit' && !DIS(b[1]) && !/aria-disabled\s*=\s*["']true|aria-hidden\s*=\s*["']true/i.test(b[1]))
        || all(/<input\b([^>]*)>/gi, f).some(i => /type\s*=\s*["']?submit/i.test(i[1]) && !DIS(i[1]));
      if (enabledSubmit) continue;
      // helper text in the form that tells the user what unlocks it
      const txt = plain(f.replace(/<button\b[\s\S]*?<\/button>/gi, ' ').replace(/<(?:label)\b[\s\S]*?<\/label>/gi, ' '));
      if (/\b(required|must|please (?:enter|fill|complete|select|accept|agree|check)|to continue|to enable|agree to|accept the|at least \d|minimum|invalid|error)\b/i.test(txt)) continue;
      if (/\*\s*$|\brequired\b/i.test(plain(all(/<label\b[\s\S]*?<\/label>/gi, f).map(m=>m[0]).join(' ')))) continue;
      if (/\baria-describedby\s*=/.test(f) && /role\s*=\s*["']alert/i.test(f)) continue;
      ev.push('form opens with its submit button "' + btn.slice(0, 30) + '" disabled and no text saying why');
    }
    return ev.length ? {evidence:ev.slice(0,2)} : null; } },

{ code:'B180', id:'button-inside-a-link', name:'Button Inside A Link',
  fix:'Give each card one target: a single link (stretched over the card if needed) or separate controls, never a button inside a link.',
  test(c){
    const ev = [];
    const INTER = t => t === 'a' || t === 'button';
    const stack = [];
    const html = c.html.replace(/<(script|style|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
    const name = (tag, attrs) => tag + ((/\bclass\s*=\s*["']([^"'\s]+)/i.exec(attrs) || [])[1] ? '.' + /\bclass\s*=\s*["']([^"'\s]+)/i.exec(attrs)[1] : '');
    const seen = new Set();
    for (const m of all(/<(\/?)([a-z][\w-]*)\b([^<>]*)>/gi, html)) {
      const tag = m[2].toLowerCase();
      if (/^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/.test(tag) || /\/\s*$/.test(m[3])) continue;
      if (m[1]) {
        // pop to the matching open tag (tolerate unclosed p/li etc.)
        for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
        continue;
      }
      const role = (/\brole\s*=\s*["'](\w+)/i.exec(m[3]) || [])[1];
      const isInter = (tag === 'a' && /\bhref\s*=/i.test(m[3])) || tag === 'button' || (role === 'button' && tag !== 'a' && tag !== 'button');
      // the outer control must be a real link or button; a widget with role=button holding menu items is another bug
      const outer = [...stack].reverse().find(s => s.inter && (s.tag === 'a' || s.tag === 'button'));
      if (isInter && outer) {
        const pair = outer.label + ' > ' + name(tag, m[3]) + (role === 'button' && tag !== 'button' ? '[role=button]' : '');
        if (!seen.has(pair)) {
          seen.add(pair);
          // text of the inner control for checkability
          const rest = html.slice(m.index + m[0].length, m.index + m[0].length + 300);
          const t = (/^([\s\S]*?)<\/(?:a|button|div|span)>/i.exec(rest) || [, ''])[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          ev.push('<' + pair.replace(' > ', '> contains <') + '>' + (t ? ' "' + t.slice(0, 30) + '"' : ''));
        }
      }
      stack.push({ tag, inter: isInter, label: name(tag, m[3]) + (role === 'button' && tag !== 'button' ? '[role=button]' : '') });
    }
    return ev.length ? {evidence:ev.slice(0,3)} : null; } },

{ code:'B181', id:'the-untitled-dialog', name:'The Untitled Dialog',
  fix:'Give every dialog and sheet a title (visually hidden if needed) and point aria-labelledby at it.',
  test(c){
    const ev = [];
    const plain = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const idText = id => {
      const m = new RegExp('<([a-z][\\w-]*)\\b[^>]*\\bid\\s*=\\s*["\']' + id.replace(/[^\w-]/g, '\\$&') + '["\'][^>]*>([\\s\\S]*?)</\\1>', 'i').exec(c.html);
      return m ? plain(m[2]) : (new RegExp('\\bid\\s*=\\s*["\']' + id.replace(/[^\w-]/g, '\\$&') + '["\']').test(c.html) ? '' : null);
    };
    for (const m of all(/<([a-z][\w-]*)\b([^>]*\brole\s*=\s*["'](?:alert)?dialog["'][^>]*)>/gi, c.html)) {
      const a = m[2];
      if (/aria-hidden\s*=\s*["']true|data-sp-hidden|\bhidden\b(?!-)/i.test(a)) continue;
      if (/style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(a)) continue;
      if (/data-state\s*=\s*["']closed/i.test(a)) continue;
      // an empty mount point (the dialog renders elsewhere) is not a dialog surface
      if (new RegExp('^\\s*</' + m[1] + '>', 'i').test(c.html.slice(m.index + m[0].length, m.index + m[0].length + 200))) continue;
      const lab = (/aria-label\s*=\s*["']([^"']*)["']/i.exec(a) || [])[1];
      if (lab && lab.trim()) continue;
      const by = (/aria-labelledby\s*=\s*["']([^"']*)["']/i.exec(a) || [])[1];
      // a target that exists but is empty is usually filled by script when the dialog opens: give it the benefit
      if (by && by.trim().split(/\s+/).some(id => idText(id) !== null)) continue;
      if (c.isFullDoc && /\btitle\s*=\s*["'][^"']+/i.test(a)) continue;
      const cls = (/\bclass\s*=\s*["']([^"'\s]+)/i.exec(a) || [])[1];
      ev.push('<' + m[1].toLowerCase() + (cls ? '.' + cls : '') + ' role="' + (/role\s*=\s*["'](\w+)/i.exec(a)[1]) + '"> has ' + (by ? 'aria-labelledby="' + by.slice(0, 30) + '" but no element has that id' : 'no aria-label or aria-labelledby'));
    }
    return ev.length ? {evidence:ev.slice(0,2)} : null; } },

];

/* v1.1.1: on a whole page, drop CSS rules whose selectors match nothing in the markup.
   Frameworks ship thousands of rules a page never uses (.text-justify, .collapsing, .blockquote);
   a pattern in dead CSS is not a pattern on the page. Snippets are never pruned. */
const unesc = s => s.replace(/\\([^0-9a-f])/gi, '$1');
function pruneCss(css, html){
  // Keep only CSS that can apply to this page. A selector is live when every compound in it
  // (".hero h1" -> ".hero" and "h1") matches some element, with all of a compound's classes on the
  // same element. Keyframes are kept only when a live rule names them.
  const els = [], tags = new Set();
  for (const m of all(/<([a-z][\w-]*)\b([^>]*)>/gi, html)) {
    const tag = m[1].toLowerCase(); tags.add(tag);
    const c = /\bclass\s*=\s*["']([^"']*)["']/i.exec(m[2]);
    const i = /\bid\s*=\s*["']([^"']*)["']/i.exec(m[2]);
    els.push({ tag, cls: new Set(c ? c[1].split(/\s+/).filter(Boolean) : []), id: i ? i[1] : null });
  }
  const byClass = new Map();
  for (const e of els) for (const k of e.cls) { if (!byClass.has(k)) byClass.set(k, []); byClass.get(k).push(e); }
  const attrs = new Set(all(/\s([a-z][\w:-]*)(?=\s*=|[\s>\/])/gi, html.replace(/"[^"]*"|'[^']*'/g, '""')).map(m => m[1].toLowerCase()));
  const compLive = comp => {
    for (const a of all(/(?<!\\)\[\s*([a-z][\w:-]*)/gi, comp)) if (!attrs.has(a[1].toLowerCase()) && !/^(class|id|type|href|role)$/i.test(a[1])) return false;
    const bare = comp.replace(/::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g, '').replace(/\[[^\]]*\]/g, '');
    const tag = ((/^[a-z][\w-]*/i.exec(bare) || [null])[0] || '').toLowerCase();
    const cs = all(/\.((?:\\.|[\w-])+)/g, bare).map(m => unesc(m[1]));
    const id = (/#((?:\\.|[\w-])+)/.exec(bare) || [])[1];
    if (!cs.length && !id) return !tag || tag === '*' || tags.has(tag) || /^(html|body|:root)$/.test(tag);
    const pool = cs.length ? (byClass.get(cs[0]) || []) : els;
    return pool.some(e => (!tag || tag === '*' || e.tag === tag) && cs.every(k => e.cls.has(k)) && (!id || e.id === unesc(id)));
  };
  const partLive = part => {
    // :not(...)/:is(...) contents are not requirements; drop them before splitting
    const p = part.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, '');
    const comps = p.trim().split(/\s*[\s>+~]\s*/).filter(Boolean);
    return comps.length > 0 && comps.every(compLive);
  };
  const src = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  const KF = /@(?:-webkit-)?keyframes\s+([\w-]+)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;
  const keep = [];
  for (const m of all(/@font-face\s*\{[^{}]*\}/g, src)) keep.push(m[0]);
  const noKf = src.replace(KF, '');
  for (const r of rules(noKf)) if (r.sel.split(/(?<!\\),/).some(partLive)) keep.push(r.sel + '{' + r.body + '}');
  const liveText = keep.join('\n') + '\n' + all(/\sstyle\s*=\s*["']([^"']*)["']/gi, html).map(m => m[1]).join('\n');
  for (const m of all(KF, src)) if (new RegExp('(?:animation(?:-name)?\\s*:[^;{}]*\\b)' + m[1].replace(/[-]/g, '\\-') + '\\b').test(liveText)) keep.push(m[0]);
  for (const k of ['prefers-color-scheme', 'prefers-reduced-motion']) if (src.includes(k)) keep.push('@media ('+k+'){}');
  if (/@media[^{]*(?:(?:max|min)-width|width\s*[<>])/i.test(src)) keep.push('@media (min-width:0px){}');   // responsive rules exist (B34 asks)
  return keep.join('\n');
}

/* Remove markup a visitor cannot see on load: elements with the hidden attribute, aria-hidden="true",
   inline display:none, closed <dialog>, and Tailwind's bare "hidden" class (no responsive variant). */
function stripHidden(html){
  const OPEN = /<([a-z][\w-]*)\b([^>]*)>/gi;
  const isHidden = (tag, a) => /\shidden(\s|=|$)/i.test(' ' + a)
    || /style\s*=\s*["'][^"']*display\s*:\s*none/i.test(a) && !/\sx-show|\sx-cloak|\sv-show/i.test(' ' + a) && /\b(?:modal|dialog|lightbox|popup|popover|drawer|dropdown|menu|tabpanel|toast|overlay)\b/i.test(a)
    || (tag === 'dialog' && !/\sopen\b/i.test(' ' + a))
    || /\bclass\s*=\s*["'](?:[^"']*\s)?hidden(?:\s[^"']*)?["']/i.test(a) && !/\b(?:sm|md|lg|xl|2xl):(?:block|flex|grid|inline|inline-block|inline-flex|table)\b/.test(a);
  const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/;
  let out = '', i = 0, m;
  OPEN.lastIndex = 0;
  while ((m = OPEN.exec(html))) {
    const tag = m[1].toLowerCase();
    if (VOID.test(tag) || /\/\s*$/.test(m[2]) || !isHidden(tag, m[2])) continue;
    // find the matching close tag by depth
    const re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi'); re.lastIndex = OPEN.lastIndex; let d = 1, e;
    while (d && (e = re.exec(html))) d += e[1] ? -1 : 1;
    const end = d ? OPEN.lastIndex : re.lastIndex;
    out += html.slice(i, m.index) + '<' + tag + ' data-sp-hidden></' + tag + '>'; i = end; OPEN.lastIndex = end;
  }
  return out + html.slice(i);
}

/* Rules whose hits held up at 80%+ on fresh pages in the Oct 5 2026 hand audit (rounds 3-4)
   (research note 01, "The Same Page"). Everything else is reported as "review" on whole pages. */
const AUDITED_FULL_PAGE = new Set(["A10", "A11", "A12", "A15", "A16", "A2", "A22", "A23", "A26", "A27", "A28", "A3", "A30", "A32", "A35", "A36", "A38", "A40", "A41", "A42", "A43", "A44", "A45", "A46", "A47", "A48", "A49", "A51", "A55", "A57", "A58", "A61", "A62", "A64", "A66", "A67", "A7", "A73", "A74", "A76", "A77", "A8", "A81", "A88", "A90", "B115", "B135", "B137", "B166", "B168", "B170", "B180", "B181", "B182", "B31", "B32", "B34"]);   // v1.1.5: >= 80% correct on 10-15 fresh pages (audit Oct 5 2026)

function checkDesign(input){
  const text = String(input||'');
  // split what looks like CSS from what looks like markup, but keep both searchable
  const styleBlocks = all(/<style[^>]*>([\s\S]*?)<\/style>/gi, String(input||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')).map(m=>m[1]).join('\n');
  const looksLikeCss = /[.#:@][\w-]+\s*\{/.test(text) && !/^\s*</.test(text.trim());
  const isFullDoc = /<html[\s>]/i.test(text);
  let ctx;
  if (isFullDoc) {
    // Whole page: judge what the page renders, not what it ships. Comments, script bodies and
    // templates are not markup a visitor sees; unused framework CSS is not the page's CSS.
    // strip <style> blocks that are real markup, not ones mentioned inside scripts
    const parked = []; const park = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, m => { parked.push(m); return '\u0000S' + (parked.length - 1) + '\u0000'; });
    const noStyle = park.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/\u0000S(\d+)\u0000/g, (_, i) => parked[+i]);
    const html = stripHidden(noStyle.replace(/<(script|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '<$1></$1>'));
    const inline = all(/\sstyle\s*=\s*"([^"]*)"|\sstyle\s*=\s*'([^']*)'/gi, html).map(m => '[inline-style]{' + (m[1]||m[2]) + '}').join('\n');
    const css = pruneCss(styleBlocks, html) + '\n' + inline;
    const body = (/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html) || [, html])[1];
    const visible = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    ctx = { text: noStyle, css, html, isFullDoc, classes: classAttrs(html).join('\n'), visible };
  } else {
    const css = styleBlocks + '\n' + (looksLikeCss ? text : '') + '\n' + text; // permissive for snippets
    ctx = { text, css, html: text, isFullDoc, classes: text, visible: text.replace(/<[^>]+>/g, ' ') };
  }
  const out = [];
  for (const r of RULES) {
    let res = null;
    try { res = r.test(ctx); } catch (e) { continue; }
    if (res) out.push({ code:r.code, id:r.id, name:r.name, fix:r.fix, evidence:[...new Set(res.evidence)].slice(0,4),
      // On whole pages only rules that passed a hand audit (>= 75% of hits correct) are reported as confirmed.
      confidence: (!isFullDoc || AUDITED_FULL_PAGE.has(r.code)) ? 'confirmed' : 'review' });
  }
  return out;
}

module.exports = { RULES, checkDesign, pruneCss, rules, AUDITED_FULL_PAGE };
