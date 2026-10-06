#!/usr/bin/env node
/* slop-patterns: check pages for the design patterns AI site builders keep shipping.
   check <file|folder>   run the rules on local HTML (and the CSS it links) — no network
   scan <url>            run the full scanner on a public page and print the report link
   list                  list every pattern in the taxonomy
   Options: --json  machine-readable output   --strict  exit 1 when a graded pattern is found */
const fs = require('fs');
const path = require('path');
const { checkDesign, RULES } = require('./rules.js');
const PATTERNS = require('./patterns.json');

const GRADED = ['A3', 'A10', 'A15', 'A23', 'A36'];          // the five hand-checked patterns that set the scanner's grade
const BY = new Map(PATTERNS.map((p) => [p.code, p]));
const plain = (s) => String(s || '').replace(/\s*[\u2014\u2013]\s*/g, ', ');
const link = (code) => { const p = BY.get(code); return p ? `https://sloppatterns.com/#${p.id}` : 'https://sloppatterns.com/'; };
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const pos = args.filter((a) => !a.startsWith('--'));
const out = (s = '') => process.stdout.write(s + '\n');

function htmlFiles(target) {
  const st = fs.statSync(target);
  if (st.isFile()) return [target];
  const found = [];
  const walk = (d) => { for (const n of fs.readdirSync(d)) { if (n === 'node_modules' || n.startsWith('.')) continue; const p = path.join(d, n); const s = fs.statSync(p); if (s.isDirectory()) walk(p); else if (/\.html?$/i.test(n)) found.push(p); } };
  walk(target);
  return found;
}

function withLinkedCss(file, html) {
  // Inline local stylesheets so the rules see the CSS the page really uses.
  return html.replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, (tag) => {
    const href = (/href=["']([^"']+)["']/i.exec(tag) || [])[1];
    if (!href || /^(https?:)?\/\//i.test(href)) return tag;
    const p = path.resolve(path.dirname(file), href.replace(/^\//, ''));
    try { return `<style>${fs.readFileSync(p, 'utf8')}</style>`; } catch { return tag; }
  });
}

function check(target) {
  const files = htmlFiles(target);
  if (!files.length) { out(`No .html files found in ${target}`); process.exit(2); }
  const results = files.map((f) => ({ file: f, hits: checkDesign(withLinkedCss(f, fs.readFileSync(f, 'utf8'))) }));
  if (flag('--json')) out(JSON.stringify(results.map((r) => ({ file: r.file, findings: r.hits.map((h) => ({ code: h.code, name: h.name, graded: GRADED.includes(h.code), fix: plain(h.fix), evidence: h.evidence, url: link(h.code) })) })), null, 2));
  else for (const r of results) {
    out(`\n${r.file}`);
    if (!r.hits.length) { out('  Nothing found by the code rules.'); continue; }
    for (const h of r.hits) {
      out(`  ${GRADED.includes(h.code) ? '●' : '○'} ${h.code} ${h.name}${GRADED.includes(h.code) ? '' : '  (worth a look)'}`);
      out(`    Fix: ${plain(h.fix)}`);
      if (h.evidence && h.evidence[0]) out(`    Seen: ${h.evidence[0]}`);
      out(`    ${link(h.code)}`);
    }
  }
  if (!flag('--json')) out(`\n● graded pattern  ○ worth a look. These are the ${RULES.length} code rules; a full scan also checks motion and phones: npx slop-patterns scan <url>`);
  const graded = results.some((r) => r.hits.some((h) => GRADED.includes(h.code)));
  process.exit(flag('--strict') && graded ? 1 : 0);
}

async function scan(url) {
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  if (!flag('--json')) out(`Scanning ${url} (this opens a real browser and takes about a minute)…`);
  const res = await fetch('https://sloppatterns.com/score/api/scan', { method: 'POST', headers: { 'content-type': 'application/json', 'x-client': 'slop-patterns-cli' }, body: JSON.stringify({ url }) });
  if (!res.ok || !res.body) { out(`The scanner answered ${res.status}. Try again in a minute, or open https://sloppatterns.com/score`); process.exit(2); }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; let done = null;
  for (;;) {
    const { value, done: end } = await reader.read(); if (end) break;
    buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.step && !flag('--json')) out(`  ${e.step}`);
      if (e.error) { out(`  ${e.error}`); process.exit(2); }
      if (e.queued) { out(`  Busy right now. You are number ${e.position} in line. Open https://sloppatterns.com/score to wait for it.`); process.exit(0); }
      if (e.done) done = e.done;
    }
  }
  if (!done) { out('The scan did not finish. Try again in a minute.'); process.exit(2); }
  const report = `https://sloppatterns.com/score/r/${done}`;
  if (flag('--json')) out(JSON.stringify({ report }));
  else out(`\nReport: ${report}`);
}

function list() {
  if (flag('--json')) return out(JSON.stringify(PATTERNS.map((p) => ({ code: p.code, id: p.id, name: p.name, category: p.category, url: link(p.code) })), null, 2));
  for (const p of PATTERNS) out(`${p.code.padEnd(5)} ${p.name}  (${p.category})`);
  out(`\n${PATTERNS.length} patterns. https://sloppatterns.com`);
}

const cmd = pos[0];
if (cmd === 'check' && pos[1]) check(pos[1]);
else if (cmd === 'scan' && pos[1]) scan(pos[1]).catch((e) => { out(String(e.message || e)); process.exit(2); });
else if (cmd === 'list') list();
else out(`slop-patterns: find the design patterns AI site builders keep shipping.

  npx slop-patterns check ./dist        check local HTML files (no network)
  npx slop-patterns scan example.com    full scan of a public page, with a report link
  npx slop-patterns list                every pattern in the taxonomy

  --json    machine-readable output
  --strict  exit 1 when one of the five graded patterns is found (for CI)

Same rules as the scanner at sloppatterns.com/score and the MCP server.`);
