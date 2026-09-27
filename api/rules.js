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
    const ev=[];
    for (const m of all(/(linear|radial|conic)-gradient\(([^()]{0,220})\)/gi, c.css)) {
      const stops = (m[2].match(/#[0-9a-f]{3,8}\b/gi)||[]).map(hexToHsl).filter(Boolean);
      const violet = stops.filter(s => s.h>=232 && s.h<=300 && s.s>35);  // indigo-500 #6366F1 sits at 239.6
      if (violet.length >= 2) ev.push(m[0].slice(0,90).replace(/\s+/g,' '));
    }
    // tailwind utility form
    for (const m of all(/from-(indigo|violet|purple|fuchsia)-\d{3}[^"'\n]*?to-(indigo|violet|purple|fuchsia|pink)-\d{3}/gi, c.classes))
      ev.push(m[0]);
    return ev.length ? {evidence:ev} : null; } },

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
    // v1.1 of this entry: a 3-column grid holding exactly three same-class cards, each with a title and a line of text
    // (and on whole pages, an icon). Stat rows, pricing plans, logo and image grids are other patterns or none.
    const grid3 = new Set();
    for (const r of rules(c.css)) if (/grid-template-columns\s*:\s*repeat\(\s*3\s*,|grid-template-columns\s*:\s*(?:[\d.]+fr\s+){2}[\d.]+fr\s*(?:;|$)/i.test(r.body))
      for (const m of all(/\.((?:\\.|[\w-])+)/g, r.sel.split(/[\s>+~]/).pop())) grid3.add(unesc(m[1]));
    const isGrid3 = cls => cls.split(/\s+/).some(k => grid3.has(k) || /^(?:(?:sm|md|lg|xl):)?grid-cols-3$/.test(k));
    const ev = [];
    for (const kids of childrenOf(c.html, isGrid3)) {
      if (kids.length !== 3 || !kids.every(k => /^(div|article|li|section|figure|a)$/.test(k.tag))) continue;
      const first = kids.map(k => k.cls.split(/\s+/)[0]);
      if (!first[0] || !first.every(f => f === first[0])) continue;
      const cardish = k => /<h[2-5]\b|<strong\b|<b\b|font-(semibold|bold|medium)/i.test(k.inner) && /<p\b|<span\b/i.test(k.inner)
        && !/\$\s?\d|\/mo\b|per month|\/month/i.test(k.inner.replace(/<[^>]+>/g,' '));
      const icon = k => /<svg\b|<img\b|<i\b|class=["'][^"']*icon|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/iu.test(k.inner);
      if (kids.every(cardish) && (!c.isFullDoc || kids.every(icon))) ev.push('3-column grid holding exactly three .'+first[0]+' cards (icon, title, text)');
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,2)} : null; } },

{ code:'A6', id:'aurora-blob-backdrop', name:'Aurora Blob Backdrop',
  fix:'If the background is decoration, let it be quiet. If it means something, make it mean something.',
  test(c){
    const ev=[];
    const blocks = c.css.split('}');
    for (const b of blocks) {
      const blur = b.match(/filter\s*:\s*blur\(\s*(\d+)(px|rem)/i);
      if (!blur) continue;
      const px = blur[2]==='rem' ? +blur[1]*16 : +blur[1];
      const round = /border-radius\s*:\s*(50%|9999px|999px)/i.test(b);
      const pos = /position\s*:\s*absolute/i.test(b);
      if (px >= 30 && round && pos) ev.push('absolutely positioned circle with blur('+px+'px)');
    }
    return ev.length ? {evidence:ev} : null; } },

{ code:'A7', id:'permanent-midnight', name:'Permanent Midnight',
  fix:'Ship a light theme, or respect prefers-color-scheme. Dark by decree is a choice made for the user.',
  test(c){
    if (!c.isFullDoc) return null;              // needs the whole document to be fair
    if (/prefers-color-scheme/i.test(c.css)) return null;
    const ev=[];
    for (const m of all(/\b(?:body|html|:root)\b[^{]*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-f]{3,6})/gi, c.css)) {
      const l = lum(m[1]);
      if (l !== null && l < 20) ev.push('body background '+m[1]+' with no prefers-color-scheme rule anywhere');
    }
    return ev.length ? {evidence:ev} : null; } },

{ code:'A8', id:'frosted-glass-cards', name:'Frosted Glass Cards',
  fix:'Glass is a material, not a default. Use it where depth is real, and check the contrast of text sitting on it.',
  test(c){
    // v1.1 of this entry: glass on CARDS. A blurred sticky header or a modal scrim is a different, defensible use.
    const ev=[]; const skip = /nav|header|menu|toolbar|topbar|appbar|modal|overlay|backdrop|dialog|drawer|sheet|popover|tooltip|dropdown|scrim|sticky|fixed/i;
    for (const r of rules(c.css)) {
      const m = /(?:-webkit-)?backdrop-filter\s*:\s*[^;]*blur\(\s*(\d+)/i.exec(r.body); if (!m || +m[1] < 4) continue;
      if (skip.test(r.sel) || /position\s*:\s*(fixed|sticky)/i.test(r.body)) continue;
      const bg = /background(?:-color)?\s*:\s*([^;]+)/i.exec(r.body);
      const translucent = !bg || /rgba?\([^)]*[,/]\s*0?\.[0-8]\d*\s*\)|hsla?\([^)]*[,/]\s*0?\.[0-8]\d*\s*\)|transparent|gradient/i.test(bg[1]);
      if (/border-radius\s*:\s*[1-9]/i.test(r.body) && translucent) ev.push(r.sel.trim().slice(0,30)+': rounded, translucent box with backdrop-filter blur('+m[1]+'px)');
    }
    const cards = classAttrs(c.html).filter(k => /\bbackdrop-blur(-\w+)?\b/.test(k) && /\brounded-(?:lg|xl|2xl|3xl)\b/.test(k) && (/\bbg-[\w-]+\/(?:[1-8]\d|[5-9])\b/.test(k) || !/(^|\s)bg-(?!clip|gradient|linear|none)[\w-]+(\s|$)/.test(k)) && !/\b(fixed|sticky)\b/.test(k) && !skip.test(k));
    if (cards.length >= 2) ev.push(cards.length+' rounded cards with backdrop-blur');
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A10', id:'gradient-text-headline', name:'Gradient Text Headline',
  fix:'Let the words carry the emphasis. Gradient text fails at small sizes, in high contrast mode, and when copied.',
  test(c){
    const ev=[];
    for (const r of rules(c.css))
      if (/background-clip\s*:\s*text/i.test(r.body) && /gradient\(/i.test(r.body) && !/logo|brand|icon|nav|wordmark|skeleton|menu|footer/i.test(r.sel))
        ev.push(r.sel.trim().slice(0,30)+': background-clip:text over a gradient');
    for (const m of all(/<(h1|h2|span|div|p)\b[^>]*class=["']([^"']*)["']/gi, c.html)) {
      const k = m[2];
      if (!/\bbg-clip-text\b/.test(k) || !/\b(bg-gradient-to-|bg-linear-to-|from-)/.test(k) || /logo|brand|nav/i.test(k)) continue;
      if (/^h[12]$/i.test(m[1]) || /\btext-(?:[3-9]xl)\b/.test(k)) { ev.push('tailwind bg-clip-text + gradient on a headline'); break; }
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
    let n = 0; const seen = new Set();
    // user content (quotes, tweets, chat, reviews) is not the page's icon system; check marks are text glyphs
    const own = c.html.replace(/<(blockquote|q)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<(\w+)\b[^>]*class=["'][^"']*(testimonial|tweet|review|comment|quote|chat|message)[^"']*["'][\s\S]*?<\/\1>/gi, ' ');
    for (const m of all(/>\s*([\u{1F300}-\u{1FAFF}\u{2600}-\u{2712}\u{2718}-\u{27BF}\u{2B00}-\u{2BFF}][\u{FE0F}]?)\s*(?:<[^>]+>\s*)*[A-Za-z]/gu, own)) {
      if (/[\u{2713}-\u{2717}]/u.test(m[1])) continue; n++; seen.add(m[1]); }
    return (n >= 3 && seen.size >= 2) ? {evidence:[n+' labels led by emoji: '+[...seen].slice(0,6).join(' ')]} : null; } },

{ code:'A16', id:'sparkles-means-magic', name:'Sparkles Means Magic',
  fix:'Name the capability. "Summarise", "Draft", "Find" tell the user what happens; a sparkle does not.',
  test(c){
    const ev=[];
    if (/[\u{2728}]/u.test(c.visible)) ev.push('✨ in the page text');
    for (const m of all(/\b(Sparkles?|MagicWand|WandSparkles|AutoAwesome)\b/g, c.isFullDoc ? c.html.replace(/<(script|template|noscript)><\/\1>/g,'') : c.text)) ev.push('icon named '+m[1]);
    return ev.length ? {evidence:[...new Set(ev)]} : null; } },

{ code:'A18', id:'the-builder-s-watermark', name:"The Builder's Watermark",
  fix:'Remove it, or own it. A badge nobody chose tells visitors the product was assembled, not made.',
  test(c){
    const ev = all(/(Made|Built|Created|Generated|Powered)\s+(with|by|in)\s+(Lovable|Bolt|v0|Replit|Framer|Webflow|Bubble|Softr|Durable)/gi, c.visible)
      .map(m=>m[0]);
    return ev.length ? {evidence:[...new Set(ev)]} : null; } },

{ code:'A19', id:'leftover-lorem', name:'Leftover Lorem',
  fix:'Write the real sentence, or leave the space visibly empty so it gets filled.',
  test(c){
    const ev = all(/\bLorem\s+ipsum\b[^<"']{0,60}/gi, c.visible).map(m=>m[0].trim().slice(0,70));
    return ev.length ? {evidence:[...new Set(ev)]} : null; } },

{ code:'B31', id:'the-clickable-div', name:'The Clickable Div',
  fix:'Use a <button>. If it must be a div, it needs role="button", tabIndex={0} and a keydown handler.',
  test(c){
    const ev=[];
    for (const m of all(/<(div|span)\b([^>]*\son(?:C|c)lick\s*=[^>]*)>/gi, c.html)) {
      const attrs = m[2];
      if (!/\brole\s*=/.test(attrs) && !/\btab(?:I|i)ndex\s*=/.test(attrs))
        ev.push('<'+m[1]+'> with onClick, no role and no tabindex');
    }
    return ev.length ? {evidence:[...new Set(ev)]} : null; } },

{ code:'B32', id:'nowhere-to-focus', name:'Nowhere To Focus',
  fix:'Removing the default ring is fine. Replacing it is mandatory — :focus-visible with a visible indicator.',
  test(c){
    const kills = all(/outline\s*:\s*(?:none|0)\b/gi, c.css).length;
    if (!kills) return null;
    // is a visible focus indicator provided anywhere?
    const restored = c.css.split('}').some(b =>
      /:focus(-visible|-within)?/i.test(b) &&
      /(box-shadow|outline\s*:\s*(?!none|0)|border-color|background)/i.test(b));
    return restored ? null
      : {evidence:[kills+' outline:none declaration(s) and no :focus rule restoring a visible indicator']}; } },

{ code:'B34', id:'the-980px-phone', name:'The 980px Phone',
  fix:'A max-width, a fluid grid, and one test at 390px before it ships.',
  test(c){
    const ev=[];
    if (c.isFullDoc && /<html/i.test(c.html) && !/name=["']viewport["']/i.test(c.html))
      ev.push('no <meta name="viewport"> — mobile browsers will render at ~980px and zoom out');
    if (!/@media/i.test(c.css) && c.css.length > 400) {
      for (const m of all(/\bwidth\s*:\s*(\d{3,4})px/gi, c.css)) {
        if (+m[1] >= 768) { ev.push('fixed width:'+m[1]+'px with no @media query in the stylesheet'); break; }
      }
    }
    return ev.length ? {evidence:ev} : null; } },

/* ---- expansion: 25 more mechanical tells ---- */
{ code:'A20', id:'neon-glow-on-everything', name:'Neon Glow On Everything',
  fix:'Reserve glow for at most one element per screen. Elevation through neutral shadow, emphasis through weight.',
  test(c){
    const ev=[]; const seen=new Set();
    const live = c.isFullDoc ? rules(c.css).filter(r => !/:(hover|focus|active|focus-visible|focus-within)/i.test(r.sel)).map(r => r.body).join(';') : c.css;
    for (const m of all(/box-shadow\s*:\s*[^;{}]*?(?:rgba?\([^)]*\)|#[0-9a-f]{3,8})[^;{}]*/gi, live)) {
      const d = m[0];
      if (/inset/i.test(d)) continue;
      // A layer with zero blur is a focus ring or outline, not a glow. Colour can come first or last (CSSOM puts it first).
      const layers = d.replace(/^box-shadow\s*:\s*/i,'').split(/,(?![^(]*\))/);
      const glowing = layers.some(L => { const n = (L.replace(/rgba?\([^)]*\)|#[0-9a-f]{3,8}|inset/gi,'').match(/-?[\d.]+(?:px|rem|em)?/g) || []);
        return n.length >= 3 && parseFloat(n[2]) >= (c.isFullDoc ? 20 : 8); });
      if (!glowing) continue;
      const hexes = (d.match(/#[0-9a-f]{6}\b/gi)||[]).map(hexToHsl).filter(Boolean);
      const rgbas = [...d.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi)]
        .map(x=>({r:+x[1],g:+x[2],b:+x[3]}))
        .filter(o=>Math.max(o.r,o.g,o.b)-Math.min(o.r,o.g,o.b) > 60);
      if (hexes.some(h=>h.s>45 && h.l>25) || rgbas.length) {
        const k=d.slice(0,60).replace(/\s+/g,' ');
        if(!seen.has(k)){seen.add(k); ev.push('coloured box-shadow: '+k);}
      }
    }
    return ev.length>=2 ? {evidence:ev.slice(0,3)} : null; } },

{ code:'A22', id:'crushed-headline-tracking', name:'Crushed Headline Tracking',
  fix:'Set tracking per typeface and size. Most display faces need no more than -0.02em; check it at mobile size.',
  test(c){
    const ev=[];
    for (const r of rules(c.css)) {
      if (c.isFullDoc && !/(^|[\s,>])h[12]\b|title|headline|heading|display|hero/i.test(r.sel)) continue;
      const m = /letter-spacing\s*:\s*(-?[\d.]+)em/i.exec(r.body);
      if (m && +m[1] <= -0.045) ev.push(r.sel.trim().slice(0,24)+' letter-spacing: '+m[1]+'em');
    }
    if (c.isFullDoc) { for (const m of all(/<h[12]\b[^>]*class=["'][^"']*\btracking-tighter\b/gi, c.html)) { ev.push('tailwind tracking-tighter on a headline'); break; } }
    else if (/\btracking-tighter\b/.test(c.text)) ev.push('tailwind tracking-tighter (-0.05em)');
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A25', id:'the-accent-stripe', name:'The Accent Stripe',
  fix:'Reserve edge stripes for genuine status. Distinguish cards by their content.',
  test(c){
    // v1.1 of this entry: a stripe on a card-like box, not the long-standing conventions
    // (blockquotes, code, active nav tabs, table rules) that use a side border for a reason.
    const ev=[];
    for (const r of rules(c.css)) {
      if (/blockquote|\bq\b|quote|pre|code|hr|nav|tab|menu|active|current|selected|input|th|td|table|toc|sidebar|alert|callout|note|warning|admonition|error|success|info/i.test(r.sel)) continue;
      const m = /border-(left|top)\s*:\s*([2-6])px\s+solid\s+(#[0-9a-f]{3,8}|rgba?\([^)]*\))/i.exec(r.body); if (!m) continue;
      if (/(?:^|;|\s)border\s*:\s*[1-9]/i.test(r.body)) continue;
      const cardish = /padding/i.test(r.body);
      if (!cardish) continue;
      const h = m[3].startsWith('#') ? hexToHsl(m[3]) : null;
      if (!h || h.s > 30) ev.push(r.sel.trim().slice(0,30)+': border-'+m[1]+' '+m[2]+'px solid '+m[3].slice(0,22));
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A36', id:'the-pulsing-dot', name:'The Pulsing Dot',
  fix:'Bind the indicator to real state and leave it still unless something just changed.',
  test(c){
    // v1.1 of this entry: a small round element looping forever. Skeleton loaders (animate-pulse on grey blocks) and spinners are not dots.
    const ev=[];
    const dot = k => /\b(rounded-full)\b/.test(k) && /\b(?:w|h|size)-(?:1\.5|2|2\.5|3|3\.5|\[[4-9]px\]|\[1[0-4]px\])\b/.test(k);
    for (const k of classAttrs(c.html)) if (/\banimate-(ping|pulse)\b/.test(k) && dot(k)) { ev.push('tailwind animate-'+RegExp.$1+' on a small round dot'); break; }
    for (const r of rules(c.css)) {
      if (/typing|loader|loading|spinner|skeleton|record/i.test(r.sel) || /display\s*:\s*none/i.test(r.body)) continue;
      const a = /animation(?:-name)?\s*:[^;]*\b(ping|pulse|blink|glow|breath\w*)\b[^;]*/i.exec(r.body); if (!a) continue;
      if (!/infinite/i.test(r.body)) continue;
      const round = /border-radius\s*:\s*(50%|9999px|999px|100%)/i.test(r.body);
      const w = /(?:^|;|\s)width\s*:\s*(\d+(?:\.\d+)?)px/i.exec(r.body);
      if (round && (!w || +w[1] <= 16)) ev.push(r.sel.trim().slice(0,30)+': round element, animation '+a[1]+' infinite');
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A37', id:'bounce-on-hover', name:'Bounce On Hover',
  fix:'A colour or shadow change at 120-200ms ease-out. Springs only where they are earned.',
  test(c){
    // v1.1 of this entry: cards that grow on hover. Logos, badges and single buttons that scale are a different, minor thing.
    const ev=[]; const skip = /logo|badge|btn|button|icon|img|image|avatar|social|store|emoji|link|nav|menu/i;
    for (const r of rules(c.css)) {
      if (!/:hover/i.test(r.sel) || skip.test(r.sel)) continue;
      if (!/card|tile|feature|item|box|panel|project|post|product|plan|member/i.test(r.sel)) continue;
      const sc = /transform\s*:\s*[^;]*scale\(\s*([\d.]+)/i.exec(r.body);
      if (sc && +sc[1] >= 1.03) ev.push(r.sel.trim().slice(0,30)+' scale('+sc[1]+')');
    }
    const tw = classAttrs(c.html).filter(k => /\bhover:scale-1(0[5-9]|1\d)\b/.test(k) && /\brounded-(?:lg|xl|2xl|3xl)\b/.test(k) && !skip.test(k));
    if (tw.length >= 3) ev.push(tw.length+' rounded cards with hover:scale-105 or more');
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A40', id:'verb-cosplay', name:'Verb Cosplay',
  fix:'A concrete verb and a concrete object. Keep the banned-word list in the design system.',
  test(c){
    // v1.1 of this entry: visible page text only (not meta tags or scripts), and four distinct words, not three.
    const WORDS = /\b(unlock|elevate|empower|streamline|supercharge|seamless(?:ly)?|robust|delve|leverage|revolutioni[sz]e|effortless(?:ly)?|cutting-edge|game-chang(?:er|ing)|unleash)\b/gi;
    const uniq = [...new Set(all(WORDS, c.visible).map(m=>m[1].toLowerCase().replace(/ly$/,'')))];
    return uniq.length >= 4 ? {evidence:[uniq.slice(0,8).join(', ')]} : null; } },

{ code:'A43', id:'em-dash-cadence', name:'Em Dash Cadence',
  fix:'Rewrite most dashes as full stops or commas. At most one per screen of copy, none in buttons.',
  test(c){
    const txt = c.html.replace(/<(script|style)[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ');
    const dashes = (txt.match(/\s—\s/g)||[]).length;
    const sentences = (txt.match(/[.!?]\s/g)||[]).length;
    if (dashes >= 4 && sentences && dashes / sentences > 0.5)
      return {evidence:[dashes+' em dashes across roughly '+sentences+' sentences — more than one in every two']};
    return null; } },

{ code:'A44', id:'emoji-bullets', name:'Emoji Bullets',
  fix:'Strip the leading emoji and the exclamation marks. A bold lead-in does the scanning.',
  test(c){
    const lines = all(/<li[^>]*>\s*([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}][\u{FE0F}]?)/gu, c.html);
    if (lines.length >= 2) return {evidence:[lines.length+' list items opening with an emoji']};
    return null; } },

{ code:'A45', id:'get-started-learn-more', name:'Get Started / Learn More',
  fix:'Label the button with the action and its outcome. Vary it per page.',
  test(c){
    const t = c.html.replace(/<[^>]+>/g,' ');
    const a = /\bGet Started\b/i.test(t), b = /\bLearn More\b/i.test(t);
    if (a && b) return {evidence:['"Get Started" and "Learn More" as the button pair']};
    return null; } },

{ code:'A46', id:'built-with-love-footer', name:"Built With Love Footer",
  fix:'A footer that links only to pages that exist, with a correct year and real contact details.',
  test(c){
    const ev = all(/(Made|Built|Crafted|Designed)\s+with\s+(❤️|❤|love|♥)/gi, c.visible).map(m=>m[0]);
    return ev.length ? {evidence:[...new Set(ev)]} : null; } },

{ code:'A47', id:'blank-tab-blank-preview', name:'Blank Tab, Blank Preview',
  fix:'A real favicon set, a 1200x630 OG image, and title and description written for the page.',
  test(c){
    // v1.1 of this entry: needs two of the four signals. A page with a written description still previews as text.
    if (!c.isFullDoc) return null;
    const ev=[];
    const title = (c.html.match(/<title[^>]*>([^<]*)<\/title>/i)||[])[1];
    if (!title || /^(my app|react app|vite|vite \+ react|next\.?js|create next app|document|untitled|home)\s*$/i.test(title.trim()))
      ev.push(title ? 'title is "'+title.trim()+'"' : 'no <title>');
    if (/href=["'][^"']*\/(vite|next)\.svg["']/i.test(c.html)) ev.push('framework default favicon');
    if (!/property=["']og:image["']|name=["']twitter:image["']/i.test(c.html)) ev.push('no og:image');
    if (!/name=["']description["']|property=["']og:description["']/i.test(c.html)) ev.push('no description for the preview');
    return ev.length >= 2 ? {evidence:ev} : null; } },

{ code:'A48', id:'blueprint-grid-wallpaper', name:'Blueprint Grid Wallpaper',
  fix:'A ground that belongs to the product, and a grid aligned to the real layout if used at all.',
  test(c){
    // v1.1 of this entry: a grid or dot lattice behind a page area. Hatching, scanlines and dashed rules are not grids.
    const ev=[];
    for (const r of rules(c.css)) {
      if (!/(^|[\s,.#-])(html|body|main|hero|section|page|bg|background|grid|pattern|backdrop|wrapper)|::?before|::?after/i.test(r.sel)) continue;
      const b = r.body;
      const lines = (b.match(/linear-gradient\(\s*(?:to (?:right|bottom|left|top)|0deg|90deg|180deg|270deg)/gi) || []).length;
      const dots = /radial-gradient\([^;]*(?:1|1\.5|2)px/i.test(b);
      const size = /background-size\s*:\s*(\d+)px/i.exec(b);
      if ((lines >= 2 || dots) && size && +size[1] >= 12 && +size[1] <= 80) ev.push(r.sel.trim().slice(0,30)+': '+(dots?'dot':'line')+' lattice every '+size[1]+'px');
    }
    if (/(^|\s)bg-(grid|dot)(-[\w\/\[\].]+)?(\s|$)|\bbg-dot-pattern\b/m.test(c.classes)) ev.push('grid/dot background utility class');
    return ev.length ? {evidence:[...new Set(ev)].slice(0,2)} : null; } },

{ code:'B118', id:'hidden-on-small-screens', name:'Hidden On Small Screens',
  fix:'Reflow instead of removing: stack rows into cards, or scroll with a visible affordance.',
  test(c){
    const ev = all(/(?:^|\s)hidden\s+(?:sm|md|lg|xl):(?:block|flex|grid|table|inline-flex)\b/gm, c.classes).map(m=>m[0].trim());
    return ev.length ? {evidence:[ev.length+' element(s) with '+[...new Set(ev)].join(', ')]} : null; } },

{ code:'B122', id:'all-buttons-are-primary', name:'All Buttons Are Primary',
  fix:'One primary action per view. Secondary outlined, destructive styled and placed apart.',
  test(c){
    const btns = all(/<button[^>]*class=["']([^"']+)["'][^>]*>([\s\S]{0,60}?)<\/button>/gi, c.html);
    if (btns.length < 3) return null;
    const groups = {};
    for (const b of btns) { const k=b[1].trim(); groups[k]=(groups[k]||0)+1; }
    const biggest = Object.entries(groups).sort((a,b)=>b[1]-a[1])[0];
    if (!biggest || biggest[1] < 3) return null;
    const labels = btns.filter(b=>b[1].trim()===biggest[0]).map(b=>b[2].replace(/<[^>]+>/g,'').trim()).filter(Boolean);
    if (labels.some(l=>/^(delete|remove|cancel|discard)$/i.test(l)) && labels.length>=3)
      return {evidence:[biggest[1]+' buttons share one class, including "'+labels.find(l=>/^(delete|remove|discard)$/i.test(l)||true)+'"']};
    return biggest[1] >= 4 ? {evidence:[biggest[1]+' buttons share a single style: '+labels.slice(0,5).join(', ')]} : null; } },

{ code:'B123', id:'coming-soon-navigation', name:'Coming Soon Navigation',
  fix:'Remove links to pages that do not exist. Real anchors, and a 404 with a route home.',
  test(c){
    const dead = all(/<a[^>]*href=["']#["'][^>]*>([\s\S]{0,40}?)<\/a>/gi, c.html)
      .map(m=>m[1].replace(/<[^>]+>/g,'').trim()).filter(Boolean);
    const soon = all(/>\s*(Coming soon)\s*</gi, c.html).length;
    const ev=[];
    if (dead.length >= 2) ev.push(dead.length+' links with href="#": '+dead.slice(0,4).join(', '));
    if (soon) ev.push(soon+' "Coming soon" label(s)');
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
    if (!/<(input|select|textarea)\b/i.test(c.html)) return null;     // no fields, nothing to announce
    const hasErrText = /class=["'][^"']*\b(error|err|invalid|is-invalid|field-error|helper-error)\b/i.test(c.html)
      || /\btext-red-[5-7]00\b/.test(c.classes);
    if (!hasErrText) return null;
    const ev=[];
    if (!/aria-invalid/i.test(c.html)) ev.push('error styling present, no aria-invalid on any field');
    if (!/aria-describedby/i.test(c.html)) ev.push('no aria-describedby linking the message to the input');
    if (!/role=["']alert["']|aria-live/i.test(c.html)) ev.push('no role="alert" or aria-live region');
    return ev.length >= 2 ? {evidence:ev} : null; } },

{ code:'B119', id:'lorem-ipsum-in-production', name:'Lorem Ipsum In Production',
  fix:'Treat placeholder text as a build error. Grep for filler in CI and require real copy before publish.',
  test(c){
    const t = c.html.replace(/<[^>]+>/g,' ');
    const ev=[];
    for (const m of all(/\b(John Doe|Jane Doe|Acme Corp|Example Inc|Your (?:text|logo|testimonial|name) here|Vite \+ React|Create Next App)\b/gi, t))
      ev.push('"'+m[1]+'"');
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
    const imgs = all(/<img\b((?:(?!>)[\s\S])*)>/gi, c.html);
    const sizedCls = new Set(); if (c.isFullDoc) for (const r of rules(c.css)) if (/(?:^|;|\s)(height|aspect-ratio)\s*:\s*[\d.]/i.test(r.body)) for (const m of all(/\.((?:\\\\.|[\w-])+)/g, r.sel)) sizedCls.add(unesc(m[1]));
    const unsized = imgs.filter(m => !/\bwidth\s*=/.test(m[1]) && !/aspect-ratio/.test(m[1]) && !/\bstyle=["'][^"']*(width|height|aspect-ratio)/.test(m[1])
      && !/class=["'][^"']*\b(?:w|h|size)-(?:\d|\[)/.test(m[1]) && !((/class=["']([^"']*)["']/.exec(m[1])||[,''])[1].split(/\s+/).some(k => sizedCls.has(k))));
    return unsized.length >= 2
      ? {evidence:[unsized.length+' of '+imgs.length+' <img> elements with no width/height or aspect-ratio']} : null; } },

{ code:'B137', id:'console-confetti', name:'Console Confetti',
  fix:'Fail the build on console errors, strip console.* in production, and audit logs for secrets.',
  test(c){
    const ev=[];
    const logs = all(/console\.(log|debug|warn|error)\s*\(/g, c.text).length;
    if (logs >= 3) ev.push(logs+' console.* calls left in the shipped code');
    for (const m of all(/\b(sk_live_|pk_live_|AKIA[0-9A-Z]{8,}|ghp_[A-Za-z0-9]{8,})/g, c.text))
      ev.push('what looks like a live credential in client code: '+m[1]+'…');
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'B131', id:'password-theatre', name:'Password Theatre',
  fix:'Length and breach-list checks rather than composition rules, with a vetted hash behind them.',
  test(c){
    // must be a real password field, not merely text that describes one
    const pw = all(/<input\b((?:(?!>)[\s\S])*)>/gi, c.html).filter(m=>/type\s*=\s*["']password["']/i.test(m[1]));
    if (!pw.length) return null;
    const ev=[];
    if (/\(\?=\.\*\[A-Z\]\)/.test(c.text) || /(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/.test(c.text))
      ev.push('composition-rule regex (uppercase + number + symbol) on the password field');
    for (const m of pw) { const n=(m[1].match(/\bminlength\s*=\s*["']?(\d+)/i)||[])[1];
      if (n && +n < 8) ev.push('password minlength='+n); }
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
    const ev=[];
    const tiles = all(/\bw-(\d{1,2})\s+h-\1\b[^"'\n]*\brounded-(?:lg|xl|2xl)\b[^"'\n]*\bbg-\w+-(?:50|100)\b/g, c.classes);
    if (tiles.length >= 3) ev.push(tiles.length+' equal-sided rounded tiles with a 50/100-weight tint');
    return ev.length ? {evidence:ev} : null; } },

/* ---- v1.1.0 (2026-09-22): parity rules. Same principle as above: a miss beats a false accusation. ---- */

{ code:'A23', id:'shouting-section-labels', name:'Shouting Section Labels',
  fix:'Delete the label, or make it carry information the heading does not.',
  test(c){
    // label-like classes: uppercase + tracked + small, defined in CSS
    const labelCls = new Set();
    for (const r of rules(c.css)) {
      if (!/text-transform\s*:\s*uppercase/i.test(r.body)) continue;
      const ls = trackEm(r.body); const fs = sizePx(r.body);
      if (ls !== null && ls >= 0.06 && (fs === null || fs <= 14))
        for (const m of all(/\.([\w-]+)/g, r.sel)) labelCls.add(m[1]);
    }
    const tw = /\buppercase\b/; const twTrack = /\btracking-(?:wide|wider|widest|\[0?\.\d+em\])\b/; const twSmall = /\btext-(?:xs|sm|\[1[0-4]px\])\b/;
    let n = 0;
    for (const h of all(/<h[1-3]\b/gi, c.html)) {
      const m = /<(\w+)\b[^<>]*class=["']([^"']+)["'][^<>]*>[^<]{1,40}<\/\1>\s*$/i.exec(c.html.slice(Math.max(0, h.index-400), h.index));
      if (!m) continue;
      const cls = m[2];
      if ((tw.test(cls) && twTrack.test(cls) && twSmall.test(cls)) || cls.split(/\s+/).some(k => labelCls.has(k))) n++;
    }
    return n >= 2 ? {evidence:[n+' small uppercase tracked labels sitting directly above headings']} : null; } },

{ code:'A24', id:'cards-inside-cards', name:'Cards Inside Cards',
  fix:'One container per idea. Inside it, separate with space and type, not another bordered box.',
  test(c){
    const cardCls = new Set();
    for (const r of rules(c.css)) {
      const rad = /border-radius\s*:\s*(\d+)/i.exec(r.body);
      const edge = /(?:^|;|\s)border\s*:\s*[1-9]|box-shadow\s*:\s*(?!none)/i.test(r.body);
      if (rad && +rad[1] >= 6 && edge) for (const m of all(/\.([\w-]+)/g, r.sel)) cardCls.add(m[1]);
    }
    const isCard = cls => { if (/input|field|chip|badge|tag|btn|button|control|select|toggle|pill|avatar|video|player/i.test(cls)) return false; const k = cls.split(/\s+/);
      if (k.some(x => cardCls.has(x))) return true;
      return k.some(x => /^rounded(-(md|lg|xl|2xl|3xl))?$/.test(x)) && k.some(x => /^(border|shadow(-(sm|md|lg|xl|2xl))?)$/.test(x)); };
    // walk containers with a stack; count card depth
    const stack = []; let open = 0, deepest = 0, nested = 0;
    for (const m of all(/<(\/?)(div|section|article|li|aside)\b([^<>]*)>/gi, c.html)) {
      if (m[1]) { if (stack.pop()) open--; continue; }
      if (/\/\s*$/.test(m[3])) continue;
      const cls = (/class=["']([^"']+)["']/i.exec(m[3])||[])[1] || '';
      const card = isCard(cls);
      if (card) { open++; if (open >= 2) nested++; deepest = Math.max(deepest, open); }
      stack.push(card);
    }
    // one card holding one boxed element is normal; two levels repeated, or three deep, is the pattern
    if (deepest >= 3) return {evidence:['bordered, rounded containers nested three deep']};
    return null; } },

{ code:'A38', id:'uniform-section-rhythm', name:'Uniform Section Rhythm',
  fix:'Group by meaning: related things close, separate ideas far apart. Let spacing say which is which.',
  test(c){
    const pys = all(/<section\b[^>]*class=["'][^"']*\bpy-(\d+)\b[^"']*["']/gi, c.html).map(m=>m[1]);
    if (pys.length >= 4 && new Set(pys).size === 1) return {evidence:['all '+pys.length+' sections use py-'+pys[0]]};
    return null; } },

{ code:'A49', id:'the-endless-marquee', name:'The Endless Marquee',
  fix:'Stop it, or give it a pause control and honour prefers-reduced-motion.',
  test(c){
    const ev=[];
    if (/<marquee\b/i.test(c.html)) ev.push('<marquee> element');
    const loops = new Set();
    for (const m of all(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?\})\s*\}/gi, c.css))
      if (/translate(?:X|3d)?\(\s*-\s*(?:50|100|33\.3+)%/i.test(m[2])) loops.add(m[1]);
    for (const name of loops) {
      const re = new RegExp('animation(?:-name)?\\s*:[^;{}]*\\b'+name.replace(/[-]/g,'\\-')+'\\b[^;{}]*', 'i');
      const a = re.exec(c.css);
      if (a && /infinite/i.test(a[0]) && !/animation-play-state\s*:\s*paused/i.test(c.css) && !/prefers-reduced-motion/i.test(c.css))
        ev.push('infinite horizontal loop "'+name+'" with no pause state and no reduced-motion rule');
    }
    if (/\banimate-(?:marquee|scroll|infinite-scroll)\b/.test(c.classes) && !/motion-reduce:|motion-safe:|hover:\[animation-play-state:paused\]/.test(c.classes))
      ev.push('marquee animation utility with no motion-reduce or pause');
    return ev.length ? {evidence:ev} : null; } },

{ code:'A50', id:'grey-on-colour', name:'Grey On Colour',
  fix:'On a coloured ground, use a lighter or darker shade of that same hue for secondary text, not neutral grey.',
  test(c){
    const ev=[];
    for (const r of rules(c.css)) {
      const fg = declColor(r.body, 'color'); const bg = declColor(r.body, 'background(?:-color)?');
      if (!fg || !bg) continue;
      const f = rgbToHsl(fg), b = rgbToHsl(bg);
      if (f.s < 15 && f.l > 30 && f.l < 75 && b.s > 45 && b.l > 20 && b.l < 70)
        ev.push(r.sel.trim().slice(0,40)+': grey '+hex(fg)+' on '+hex(bg));
    }
    return ev.length ? {evidence:ev.slice(0,3)} : null; } },

{ code:'A51', id:'wide-tracked-body', name:'Wide-Tracked Body Text',
  fix:'Leave lowercase body text at the typeface’s default spacing. Track only short runs of caps.',
  test(c){
    const ev=[];
    for (const r of rules(c.css)) {
      if (!isBase(r.sel)) continue;
      if (/text-transform\s*:\s*uppercase/i.test(r.body)) continue;
      const ls = trackEm(r.body);
      if (ls !== null && ls >= 0.05) ev.push(r.sel.trim().slice(0,30)+' { letter-spacing: '+ls.toFixed(2)+'em }');
    }
    for (const m of all(/<p\b[^>]*class=["']([^"']*)["']/gi, c.html)) {
      const t = /\btracking-(wider|widest)\b/.exec(m[1]);
      if (t && !/\buppercase\b/.test(m[1])) ev.push('<p> with tracking-'+t[1]);
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A52', id:'torn-edge-mask', name:'Torn-Edge Mask',
  fix:'Use a clean crop, or a prepared cut-out asset if the ragged edge is actually the point.',
  test(c){
    const ev=[];
    for (const r of rules(c.css)) {
      if (!/img|image|photo|picture|figure|avatar|media|hero|cover|thumb/i.test(r.sel)) continue;
      const m = /clip-path\s*:\s*polygon\(([^;{}]*)\)/i.exec(r.body); if (!m) continue;
      const pts = m[1].split(',').length;
      if (pts >= 10) ev.push(r.sel.trim().slice(0,30)+': clip-path polygon with '+pts+' points');
    }
    for (const m of all(/border-radius\s*:\s*((?:\d+%\s*){4})\/\s*((?:\d+%\s*){4})/gi, c.css)) {
      const v = (m[1]+' '+m[2]).trim().split(/\s+/);
      if (new Set(v).size >= 5) ev.push('blob border-radius '+m[0].replace(/\s+/g,' ').slice(15,70));
    }
    return ev.length ? {evidence:ev.slice(0,2)} : null; } },

{ code:'A53', id:'cramped-body-leading', name:'Cramped Body Leading',
  fix:'Body copy at 1.4–1.6 line-height. Tight leading belongs to headlines, not paragraphs.',
  test(c){
    const ev=[];
    for (const r of rules(c.css)) {
      if (!parts(r.sel).some(p => /^(p|main p|article p|\.prose p|\.prose|\.content p|\.post p|\.entry-content p|\.markdown-body p)$/.test(p))) continue;
      const lh = /line-height\s*:\s*([\d.]+)(%|px|rem|em)?\s*(?:;|$|!)/i.exec(r.body); if (!lh) continue;
      let v = +lh[1];
      if (lh[2] === '%') v = v/100;
      else if (lh[2] === 'px') { const fs = sizePx(r.body); if (!fs) continue; v = v/fs; }
      else if (lh[2] === 'rem') { const fs = sizePx(r.body); if (!fs) continue; v = v*16/fs; }
      if (v > 0 && v < 1.3) ev.push(r.sel.trim().slice(0,30)+' { line-height: '+lh[1]+(lh[2]||'')+' } ≈ '+v.toFixed(2));
    }
    for (const m of all(/<p\b[^>]*class=["'][^"']*\bleading-(none|tight)\b[^"']*["']/gi, c.html)) ev.push('<p> with leading-'+m[1]);
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A54', id:'all-caps-paragraphs', name:'All-Caps Paragraphs',
  fix:'Keep caps for labels under a line long. Paragraphs go in sentence case.',
  test(c){
    const ev=[];
    for (const r of rules(c.css))
      if (isBase(r.sel) && /text-transform\s*:\s*uppercase/i.test(r.body))
        ev.push(r.sel.trim().slice(0,30)+' { text-transform: uppercase }');
    for (const m of all(/<p\b[^>]*class=["'][^"']*\buppercase\b[^"']*["'][^>]*>([^<]{80,})</gi, c.html))
      ev.push('uppercase paragraph of '+m[1].trim().length+' characters');
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
    for (const m of all(/repeating-linear-gradient\(\s*(-?\d+)deg/gi, c.css))
      if (Math.abs(+m[1]) % 90 !== 0) ev.push('diagonal repeating-linear-gradient at '+m[1]+'deg');
    return ev.length ? {evidence:[...new Set(ev)].slice(0,2)} : null; } },

{ code:'A57', id:'small-body-text', name:'Small Body Text',
  fix:'Body text at 16px or more; form inputs at 16px or more so phones do not zoom on focus.',
  test(c){
    const ev=[];
    const pRule = rules(c.css).some(r => parts(r.sel).some(x => /^(p|main|article|div|\.[\w-]+ p)$/.test(x)) && sizePx(r.body) !== null) || /wix|framer/i.test(c.html.slice(0, 4000));
    for (const r of rules(c.css)) {
      const fs = sizePx(r.body); if (fs === null) continue;
      if (parts(r.sel).some(p => p === 'p' || (!pRule && p === 'body')) && fs < 15) ev.push(r.sel.trim().slice(0,24)+' font-size '+fs+'px');
      if (/<(input|select|textarea)\b/i.test(c.html) && parts(r.sel).some(p => /^(input|select|textarea|input\[type=["']?(text|email|search|password|tel|url|number)["']?\])$/.test(p)) && fs < 16) ev.push(r.sel.trim().slice(0,24)+' font-size '+fs+'px (iOS zooms on focus)');
    }
    if (/<body\b[^>]*class=["'][^"']*\btext-(xs|sm)\b/i.test(c.html)) ev.push('<body> set to text-sm or smaller');
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A58', id:'justified-without-hyphens', name:'Justified Without Hyphens',
  fix:'Align body text to the start. If you must justify, turn on hyphens: auto and set lang.',
  test(c){
    if (/hyphens\s*:\s*auto/i.test(c.css)) return null;
    const ev=[];
    for (const m of all(/text-align\s*:\s*justify\b/gi, c.css)) ev.push('text-align: justify with no hyphens: auto');
    const ca = classAttrs(c.html);
    if (ca.some(k => /(^|\s)text-justify(\s|$)/.test(k)) && !ca.some(k => /(^|\s)hyphens-auto(\s|$)/.test(k))) ev.push('text-justify class with no hyphens-auto');
    return ev.length ? {evidence:[...new Set(ev)]} : null; } },

{ code:'A59', id:'flat-type-hierarchy', name:'Flat Type Hierarchy',
  fix:'Make the heading clearly bigger or heavier than the text under it. One confident step beats three timid ones.',
  test(c){
    // only unambiguous, single-selector declarations; a reset rule like "h1,h2,p{font-size:100%}" is not a hierarchy
    const seen = { body:new Set(), h1:new Set(), h2:new Set() };
    for (const r of rules(c.css)) {
      const fs = sizePx(r.body); if (fs === null) continue;
      const p = parts(r.sel); if (p.length !== 1) continue;
      if (p[0] === 'body' || p[0] === 'p') seen.body.add(fs);
      if (p[0] === 'h1') seen.h1.add(fs);
      if (p[0] === 'h2') seen.h2.add(fs);
    }
    const one = s => s.size === 1 ? [...s][0] : null;
    const body = one(seen.body), h1 = one(seen.h1), h2 = one(seen.h2);
    if (!body) return null;
    const ev=[];
    if (h1 && h1/body < 1.3) ev.push('h1 '+h1+'px vs body '+body+'px (ratio '+(h1/body).toFixed(2)+')');
    if (h2 && h2/body < 1.1) ev.push('h2 '+h2+'px vs body '+body+'px (ratio '+(h2/body).toFixed(2)+')');
    return ev.length ? {evidence:ev} : null; } },

{ code:'A60', id:'stripe-on-a-rounded-corner', name:'Stripe On A Rounded Corner',
  fix:'Drop the stripe, or square the corner it sits on. A single-side border cannot follow a curve cleanly.',
  test(c){
    const ev=[];
    for (const r of rules(c.css)) {
      const side = /border-(left|top|right|bottom)\s*:\s*([2-8])px\s+solid/i.exec(r.body);
      const rad = /border-radius\s*:\s*(\d+)px/i.exec(r.body);
      const full = /(?:^|;|\s)border\s*:\s*[1-9]/i.test(r.body);
      if (side && rad && +rad[1] >= 6 && !full) ev.push(r.sel.trim().slice(0,30)+': border-'+side[1]+' '+side[2]+'px on radius '+rad[1]+'px');
    }
    if (classAttrs(c.html).some(k => /\bborder-l-[2-8]\b/.test(k) && /\brounded-(?:lg|xl|2xl)\b/.test(k) && !/\bborder\s/.test(k+' ')))
      ev.push('border-l-4 on a rounded-lg card');
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A61', id:'radial-halo-ground', name:'Radial Halo Ground',
  fix:'A flat ground, or light that comes from something on the page. Not a glow behind nothing.',
  test(c){
    const ev=[];
    for (const r of rules(c.css)) {
      if (!/(^|[\s,.#-])(html|body|main|hero|section|page|bg|backdrop|wrapper)|::?before|::?after/i.test(r.sel)) continue;
      if (/btn|button|cta|cursor|icon|logo|avatar|badge|link|nav|card/i.test(r.sel) || /opacity\s*:\s*0(?:[;\s]|$)|scale\(0\)/i.test(r.body)) continue;
      const g = /background(?:-image)?\s*:[^;]*radial-gradient\(([^;]*)/i.exec(r.body); if (!g) continue;
      const soft = /transparent|rgba\([^)]*,\s*0?\.\d+\)|#[0-9a-f]{8}\b|\/\s*0?\.\d+\)/i.test(g[1]);
      const cols = [...(g[1].match(/#[0-9a-f]{6}/gi)||[]).map(parseColor),
                    ...[...g[1].matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/gi)].map(x=>[+x[1],+x[2],+x[3]])].filter(Boolean).map(rgbToHsl);
      const alphas = [...g[1].matchAll(/rgba?\([^)]*[,/]\s*(0?\.\d+|1)\s*\)/gi)].map(x => +x[1]);
      const strong = !alphas.length || Math.max(...alphas) >= 0.15;
      if (soft && strong && cols.some(h => h.s > 40 && h.l >= 25 && h.l <= 85)) ev.push(r.sel.trim().slice(0,30)+': soft coloured radial-gradient ground');
    }
    return ev.length ? {evidence:[...new Set(ev)].slice(0,2)} : null; } },

{ code:'A62', id:'bounce-easing-in-the-interface', name:'Bounce Easing In The Interface',
  fix:'ease-out for things arriving, ease-in for things leaving. Save overshoot for illustration and play.',
  test(c){
    const ev=[];
    for (const m of all(/cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/gi, c.css)) {
      const y1 = +m[2], y2 = +m[4];
      if (y1 < -0.15 || y2 > 1.15 || y1 > 1.15 || y2 < -0.15) ev.push(m[0].replace(/\s+/g,''));
    }
    for (const m of all(/\b(ease(?:In)?Out(?:Back|Elastic|Bounce)|easeIn(?:Back|Elastic|Bounce)|back\.out|elastic\.out|bounce\.out)\b/g, c.text)) ev.push(m[1]);
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A63', id:'same-words-twice', name:'Same Words Twice',
  fix:'Let the heading name it and the text below add something. If they say the same thing, delete one.',
  test(c){
    const words = s => s.toLowerCase().replace(/<[^>]+>/g,' ').replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>2);
    let n = 0; const ex=[];
    for (const m of all(/<h([2-4])\b[^>]*>([\s\S]{3,120}?)<\/h\1>\s*<p\b[^>]*>([\s\S]{3,240}?)<\/p>/gi, c.html)) {
      const a = words(m[2]), b = words(m[3]); if (a.length < 3) continue;
      const bs = new Set(b); const hit = a.filter(w => bs.has(w)).length / a.length;
      if (hit >= 0.9 && b.length <= a.length * 2) { n++; ex.push(m[2].replace(/<[^>]+>/g,'').trim().slice(0,40)); }
    }
    return n ? {evidence:ex.map(e=>'heading and text repeat each other: "'+e+'"').slice(0,2)} : null; } },

{ code:'A64', id:'contrast-below-the-floor', name:'Contrast Below The Floor',
  fix:'4.5:1 for normal text, 3:1 for large text (24px, or 18.66px bold). Check the actual pair, not the palette.',
  test(c){
    const ev=[];
    const check = (sel, body) => {
      const fg = declColor(body, 'color'); const bg = declColor(body, 'background(?:-color)?');
      if (!fg || !bg) return;
      const ratio = contrast(fg, bg); const fs = sizePx(body);
      const bold = /font-weight\s*:\s*(bold|[6-9]00)/i.test(body);
      const large = fs !== null && (fs >= 24 || (fs >= 18.66 && bold));
      const floor = large ? 3 : 4.5;
      if (ratio >= 1.1 && ratio < floor) ev.push(sel.trim().slice(0,30)+': '+hex(fg)+' on '+hex(bg)+' = '+ratio.toFixed(2)+':1 (needs '+floor+':1)');
    };
    const usedSet = new Set();
    for (const m of all(/class=["']([^"']+)["'][^>]*>\s*[^<\s]{2}/gi, c.html)) for (const k of m[1].split(/\s+/)) usedSet.add(k);
    const used = cls => usedSet.has(cls);
    for (const r of rules(c.css)) if (parts(r.sel).length === 1 && /^[\w.-]+$/.test(r.sel) && (!/\./.test(r.sel) || used(r.sel.split('.').pop())) && !/:(hover|focus|active|visited|disabled)|::?(selection|placeholder)|\[disabled\]|sr-only|visually-hidden/i.test(r.sel)) check(r.sel, r.body);
    for (const m of all(/style=["']([^"']*)["']/gi, c.html)) check('inline style', m[1]);
    return ev.length ? {evidence:[...new Set(ev)].slice(0,4)} : null; } },

{ code:'A65', id:'ghost-card', name:'Ghost Card',
  fix:'Pick one edge: a visible border or a real shadow. A faint line plus a wide blur is two half-decisions.',
  test(c){
    const ev=[];
    for (const r of rules(c.css)) {
      if (/pop|menu|dropdown|tooltip|modal|dialog|toast|overlay|sheet|command|combobox|listbox|select/i.test(r.sel)) continue;
      const hair = /(?:^|;|\s)border\s*:\s*(?:0\.5|1)px\s+solid\s+(rgba\([^)]*,\s*0?\.[0-2]\d*\)|#[0-9a-f]{8}\b|#(?:e[0-9a-f]|f[0-9a-f]){3}\b|#(?:e|f)[0-9a-f](?:e|f)[0-9a-f](?:e|f)[0-9a-f]\b)/i.test(r.body);
      const sh = /box-shadow\s*:[^;]*?\s(\d{2,3})px\s+(-?\d+px\s+)?(rgba|#)/i.exec(r.body);
      if (hair && sh && +sh[1] >= 24) ev.push(r.sel.trim().slice(0,30)+': 1px faint border + '+sh[1]+'px shadow blur');
    }
    if (classAttrs(c.html).filter(k => /(^|\s)border(\s|$)/.test(k) && /\bborder-(?:gray|slate|zinc|neutral)-(?:100|200)\b/.test(k) && /\bshadow-(?:xl|2xl)\b/.test(k) && /\brounded/.test(k)).length >= 2)
      ev.push('cards with border-gray-100/200 and shadow-xl');
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A66', id:'animating-layout-properties', name:'Animating Layout Properties',
  fix:'Animate transform and opacity. Fake size changes with scale; move things with translate.',
  test(c){
    const ev=[];
    const LAYOUT = /^(width|height|top|left|right|bottom|margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|max-height|min-height|max-width|min-width)$/i;
    for (const m of all(/transition(?:-property)?\s*:\s*([^;{}]*)/gi, c.css)) {
      const props = m[1].split(',').map(s=>s.trim().split(/\s+/)[0]);
      const bad = props.filter(p => LAYOUT.test(p));
      if (bad.length) ev.push('transition on '+bad.join(', '));
    }
    const liveAnims = new Set(); for (const r of rules(c.css)) for (const m of all(/animation(?:-name)?\s*:\s*([^;]+)/gi, r.body)) for (const w of m[1].split(/[\s,]+/)) liveAnims.add(w);
    for (const m of all(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?\})\s*\}/gi, c.css))
      if ((!c.isFullDoc || liveAnims.has(m[1])) && /\{[^}]*\b(width|height|top|left|margin-\w+|padding-\w+)\s*:/i.test(m[2])) ev.push('@keyframes '+m[1]+' animates a layout property');
    if (/\btransition-\[(?:width|height|margin|padding)/.test(c.classes)) ev.push('tailwind transition on a layout property');
    return ev.length ? {evidence:[...new Set(ev)].slice(0,3)} : null; } },

{ code:'A69', id:'broken-or-placeholder-image', name:'Broken Or Placeholder Image',
  fix:'Ship the real asset, or remove the image. Check every img resolves before release.',
  test(c){
    const ev=[];
    for (const m of all(/<img\b([^>]*)>/gi, c.html)) {
      const src = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(m[1]);
      if (!src) continue;   // lazy loaders fill src from data-src; absence alone proves nothing
      if (!src[1].trim() || src[1] === '#') ev.push('<img src="'+src[1]+'">');
      else if (/(via\.placeholder\.com|placehold\.(?:co|it)|placeholder\.com|picsum\.photos|placekitten|dummyimage\.com|fakeimg\.pl|loremflickr|source\.unsplash\.com\/random)/i.test(src[1]))
        ev.push('placeholder service: '+RegExp.$1);
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

];

/* v1.1.1: on a whole page, drop CSS rules whose selectors match nothing in the markup.
   Frameworks ship thousands of rules a page never uses (.text-justify, .collapsing, .blockquote);
   a pattern in dead CSS is not a pattern on the page. Snippets are never pruned. */
const unesc = s => s.replace(/\\([^0-9a-f])/gi, '$1');
function pruneCss(css, html){
  const cls = new Set(), ids = new Set(), tags = new Set();
  for (const m of all(/<([a-z][\w-]*)\b([^>]*)>/gi, html)) {
    tags.add(m[1].toLowerCase());
    const c = /\bclass\s*=\s*["']([^"']*)["']/i.exec(m[2]); if (c) for (const k of c[1].split(/\s+/)) if (k) cls.add(k);
    const i = /\bid\s*=\s*["']([^"']*)["']/i.exec(m[2]); if (i) ids.add(i[1]);
  }
  const partLive = part => {
    const comp = part.trim().split(/\s*[\s>+~]\s*/).filter(Boolean).pop() || '';
    const bare = comp.replace(/::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g, '').replace(/\[[^\]]*\]/g, '');
    const tag = (/^[a-z][\w-]*/i.exec(bare) || [null])[0];
    if (tag && tag !== '*' && !tags.has(tag.toLowerCase())) return false;
    for (const m of all(/\.((?:\\.|[\w-])+)/g, bare)) if (!cls.has(unesc(m[1]))) return false;
    for (const m of all(/#((?:\\.|[\w-])+)/g, bare)) if (!ids.has(unesc(m[1]))) return false;
    return true;
  };
  const src = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  const keep = [];
  // keyframes are referenced by name, not by selector: keep them whole
  for (const m of all(/@(?:-webkit-)?keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, src)) keep.push(m[0]);
  for (const m of all(/@font-face\s*\{[^{}]*\}/g, src)) keep.push(m[0]);
  const noKf = src.replace(/@(?:-webkit-)?keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  for (const r of rules(noKf)) if (r.sel.split(',').some(partLive)) keep.push(r.sel + '{' + r.body + '}');
  for (const k of ['prefers-color-scheme', 'prefers-reduced-motion']) if (src.includes(k)) keep.push('@media ('+k+'){}');
  if (/@media[^{]*(?:max|min)-width/i.test(src)) keep.push('@media (min-width:0px){}');   // responsive rules exist (B34 asks)
  return keep.join('\n');
}

/* Rules whose hits held up at 75%+ in the 23 Sep 2026 hand audit of 874 archived launch pages
   (research note 01, "The Same Page"). Everything else is reported as "review" on whole pages. */
const AUDITED_FULL_PAGE = new Set(['A3','A10','A15','A22','A23','A36','A47','A55','B115']);

function checkDesign(input){
  const text = String(input||'');
  // split what looks like CSS from what looks like markup, but keep both searchable
  const styleBlocks = all(/<style[^>]*>([\s\S]*?)<\/style>/gi, text).map(m=>m[1]).join('\n');
  const looksLikeCss = /[.#:@][\w-]+\s*\{/.test(text) && !/^\s*</.test(text.trim());
  const isFullDoc = /<html[\s>]/i.test(text);
  let ctx;
  if (isFullDoc) {
    // Whole page: judge what the page renders, not what it ships. Comments, script bodies and
    // templates are not markup a visitor sees; unused framework CSS is not the page's CSS.
    const noStyle = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
    const html = noStyle.replace(/<(script|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '<$1></$1>');
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
