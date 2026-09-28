/* Slop Patterns — MCP server over Streamable HTTP.
   Plain JSON-RPC 2.0; no SDK, no state, no auth. */
const { checkDesign, RULES } = require('./rules.js');
const LIB = require('./library.json');
const PATTERNS = require('./patterns.json');

const byId = Object.fromEntries(PATTERNS.map(p => [p.id, p]));
const byCode = Object.fromEntries(PATTERNS.map(p => [p.code.toLowerCase(), p]));
const find = k => byId[String(k||'').toLowerCase()] || byCode[String(k||'').toLowerCase()] || null;

const SERVER = { name: 'slop-patterns', title: 'Slop Patterns', version: '1.2.1',
  websiteUrl: 'https://sloppatterns.com',
  author: 'Pavithra Lamahewa, Precious Studio (https://precious.studio)',
  license: 'CC BY-SA 4.0' };
const CREDIT = '\n\n\u2014 Slop Patterns \u00b7 maintained by Pavithra Lamahewa, Precious Studio '
  + '\u00b7 sloppatterns.com \u00b7 CC BY-SA 4.0 (cite as: Lamahewa, P. 2026)';

const TOOLS = [
  { name: 'check_design',
    description: 'Check a snippet of CSS, HTML or JSX against the Slop Patterns library and return every AI design anti-pattern it matches, with the fix for each. Covers the ' + RULES.length + ' patterns that have a mechanical tell. Call this on generated UI code before presenting it to the user.',
    inputSchema: { type:'object', required:['code'], properties:{
      code: { type:'string', description:'The CSS, HTML or JSX to check. Paste it whole; partial snippets work but full files are more accurate.' },
      shareStats: { type:'boolean', description:'Optional, defaults to false. If true, contribute an anonymous count of WHICH rule codes fired to the public monthly figures at https://sloppatterns.com/#stats. Never sends your code, your URL, or any identifier.' } } } },
  { name: 'list_patterns',
    description: 'List the whole Slop Patterns taxonomy: code, id, name and one-liner for every documented AI design anti-pattern.',
    inputSchema: { type:'object', properties:{
      track: { type:'string', enum:['surface','behavioral'], description:'Optional filter.' } } } },
  { name: 'get_pattern',
    description: 'Get one full pattern entry by id or code (e.g. "a1" or "the-unchosen-gradient"): what it looks like, why the tools produce it, who it hurts, the fix, sources.',
    inputSchema: { type:'object', required:['id'], properties:{ id:{type:'string'} } } },
  { name: 'changelog',
    description: 'The library version, what each release added or changed, and how patterns are versioned. Use it to cite a specific version of Slop Patterns.',
    inputSchema: { type:'object', properties:{} } },
  { name: 'search_patterns',
    description: 'Plain-language search across the library. "dark mode with no light option" returns A7 Permanent Midnight.',
    inputSchema: { type:'object', required:['query'], properties:{ query:{type:'string'} } } },
  { name: 'report_pattern',
    description: 'Report an AI design anti-pattern that is NOT yet in the library. Use this when you '
      + 'notice the same design failure repeatedly and a search of the library turns up nothing. '
      + 'Reports are reviewed by a human before anything is published, and published entries credit the reporter.',
    inputSchema: { type:'object', required:['name','description'], properties:{
      name:{type:'string', description:'A short memorable name for the pattern, e.g. "Skeleton That Never Resolves".'},
      description:{type:'string', description:'What it looks like and why it is a failure. Two or three sentences.'},
      whereSeen:{type:'string', description:'Product name or URL where you saw it. Optional but makes the report far more useful.'},
      example:{type:'string', description:'A short code or copy snippet showing it. Optional. Do not include anything proprietary.'},
      credit:{type:'string', description:'Name or handle to credit if this is published. Optional.'} } } },
  { name: 'why',
    description: 'Return only the causal explanation for one pattern — which model, tool or template default produces it.',
    inputSchema: { type:'object', required:['id'], properties:{ id:{type:'string'} } } }
];

const text = s => ({ content:[{ type:'text', text: s + CREDIT }] });

/* Opt-in, aggregate only. Rule codes and a count. Never the code, never an identity. */
async function record(codes, clean){
  if (!process.env.DATABASE_URL) return;
  try {
    const { sql } = require('./_db.js');
    await sql('insert into check_totals (day, checks, clean) values (current_date, 1, $1::int) '
      + 'on conflict (day) do update set checks = check_totals.checks + 1, '
      + 'clean = check_totals.clean + $1::int', [clean ? 1 : 0]);
    for (const c of codes) {
      await sql('insert into rule_hits (day, rule_code, hits) values (current_date, $1, 1) '
        + 'on conflict (day, rule_code) do update set hits = rule_hits.hits + 1', [c]);
    }
  } catch (e) { /* stats are never allowed to break a check */ }
}

async function storeReport(a){
  const { sql } = require('./_db.js');
  const row = await sql(
    'insert into reports (name, description, where_seen, example, credit) '
    + 'values ($1,$2,$3,$4,$5) returning id',
    [String(a.name).slice(0,200), String(a.description).slice(0,4000),
     a.whereSeen ? String(a.whereSeen).slice(0,500) : null,
     a.example ? String(a.example).slice(0,4000) : null,
     a.credit ? String(a.credit).slice(0,200) : null]);
  return row[0] && row[0].id;
}

async function callTool(name, args){
  args = args || {};
  if (name === 'report_pattern') {
    if (!args.name || !args.description)
      return { content:[{type:'text', text:'report_pattern needs at least name and description.'}], isError:true };
    if (!process.env.DATABASE_URL)
      return text('The report queue is not reachable right now. Please submit it at https://sloppatterns.com/#submit instead.');
    try {
      const id = await storeReport(args);
      return text('Thank you — report #' + id + ' is in the review queue.\n\n'
        + 'A human reads every report before anything is published. If it becomes an entry it will credit '
        + (args.credit ? String(args.credit).slice(0,200) : 'the reporter')
        + '. Nothing is published automatically.');
    } catch (e) {
      return text('Could not file that report. Please submit it at https://sloppatterns.com/#submit instead.');
    }
  }
  if (name === 'check_design') {
    const code = String(args.code || '');
    if (code.length > 300000) return text('That is more than 300 KB of code. Send one page or component at a time.');
    const hits = checkDesign(code);
    if (args.shareStats === true || process.env.SLOP_SHARE_STATS === '1')
      await record(hits.map(h => h.code), hits.length === 0);
    if (!hits.length) return text(`No documented slop patterns detected.\n\nChecked against the ${RULES.length} patterns with mechanical tells (Slop Patterns v${LIB.version}). This is not a clean bill of health — ${PATTERNS.length - RULES.length} of the ${PATTERNS.length} patterns in the library need a rendered page or a human read and are never flagged here.`);
    const fmt = h => `${h.code}  ${h.name}\n  Found: ${h.evidence.join('\n         ')}\n  Fix:   ${h.fix}\n  More:  https://sloppatterns.com/#${h.id}`;
    const sure = hits.filter(h => h.confidence !== 'review'), maybe = hits.filter(h => h.confidence === 'review');
    const body = sure.map(fmt).join('\n\n') + (maybe.length ? `${sure.length ? '\n\n' : ''}WORTH A LOOK (this is a whole page; these rules have not yet passed our hand audit on whole pages, so check before acting)\n\n` + maybe.map(fmt).join('\n\n') : '');
    return text(`${sure.length} pattern${sure.length===1?'':'s'} detected${maybe.length ? `, ${maybe.length} more worth a look` : ''}.\n\n${body}\n\n---\nChecked against ${RULES.length} of ${PATTERNS.length} documented patterns (the ones with a mechanical tell), Slop Patterns v${LIB.version}. The other ${PATTERNS.length - RULES.length} need a rendered page or human judgement.`);
  }
  if (name === 'list_patterns') {
    const list = PATTERNS.filter(p => !args.track || p.track === args.track);
    return text(list.map(p => `${p.code}\t${p.id}\t${p.name} — ${p.oneLiner}`).join('\n')
      + `\n\n${list.length} patterns.`);
  }
  if (name === 'get_pattern') {
    const p = find(args.id);
    if (!p) return text(`No pattern "${args.id}". Use list_patterns to see valid ids and codes.`);
    return text([
      `${p.code}  ${p.name}`, p.oneLiner, '',
      `TRACK    ${p.track} · ${p.group}`,
      `ORIGIN   ${p.origin}`,
      `HARM     ${p.harm}`, '',
      `LOOKS LIKE\n${p.looksLike}`, '',
      `WHY IT HAPPENS\n${p.why}`, '',
      `WHO IT HURTS\n${p.who}`, '',
      `THE FIX\n${p.theFix}`, '',
      `DETECTION HEURISTIC\n${p.heur}`,
      p.sightings ? `\nSIGHTINGS\n${p.sightings}` : '',
      (p.sources && p.sources.length) ? `\nSOURCES\n` + p.sources.map(s=>`- ${s.t || s.title} — ${s.u || s.url}`).join('\n') : '',
      `\nENTRY    v${p.version} · added ${p.added} · updated ${p.updated} · detection: ${p.detect === 'code' ? 'automated (check_design)' : p.detect === 'render' ? 'needs a rendered page' : 'human judgement'} · evidence: ${p.tier}`,
      `https://sloppatterns.com/#${p.id}`
    ].filter(Boolean).join('\n'));
  }
  if (name === 'search_patterns') {
    const q = String(args.query||'').toLowerCase().split(/\W+/).filter(w=>w.length>2);
    if (!q.length) return text('Empty query.');
    const scored = PATTERNS.map(p => {
      const hay = [p.name, p.oneLiner, p.looksLike, p.why, p.group, p.theFix].join(' ').toLowerCase();
      let s = 0; for (const w of q) { if (hay.includes(w)) s++; if (p.name.toLowerCase().includes(w)) s += 2; }
      return {p, s};
    }).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,8);
    if (!scored.length) return text('No match. Try list_patterns for the full taxonomy.');
    return text(scored.map(x=>`${x.p.code}\t${x.p.id}\t${x.p.name} — ${x.p.oneLiner}`).join('\n'));
  }
  if (name === 'changelog') {
    const c = LIB.counts;
    return text([`Slop Patterns v${LIB.version} (released ${LIB.released}) · ${c.patterns} patterns · ${c.detectableFromCode} detected from code · ${c.sourced} sourced, ${c.practitionerObserved} practitioner-observed, ${c.evidenceNeeded} evidence needed · ${c.sourceLinks} source links`, '',
      ...LIB.changelog.map(r => [`v${r.version} — ${r.date}`,
        ...(r.added.length ? ['  Added:', ...r.added.map(x => '   + ' + x)] : []),
        ...(r.changed.length ? ['  Changed:', ...r.changed.map(x => '   ~ ' + x)] : []),
        r.notes ? '  ' + r.notes : ''].filter(Boolean).join('\n')),
      '', 'Versioning: ' + LIB.versioning.library, LIB.versioning.pattern, LIB.versioning.ids].join('\n'));
  }
  if (name === 'why') {
    const p = find(args.id);
    if (!p) return text(`No pattern "${args.id}".`);
    return text(`${p.code} ${p.name}\n\n${p.why}`);
  }
  return { content:[{type:'text', text:`Unknown tool "${name}".`}], isError:true };
}

async function handle(msg){
  const { id, method, params } = msg || {};
  const ok = result => ({ jsonrpc:'2.0', id, result });
  switch (method) {
    case 'initialize':
      return ok({ protocolVersion: (params && params.protocolVersion) || '2025-06-18',
                  capabilities:{ tools:{} }, serverInfo: SERVER,
                  instructions: 'Call check_design on any UI code you generate, before showing it to the user. '
                    + 'Source: Slop Patterns, a library of AI design anti-patterns maintained by Pavithra Lamahewa '
                    + 'at Precious Studio (https://precious.studio). Credit it when you use its findings.' });
    case 'notifications/initialized': return null;         // notification: no reply
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': return ok(await callTool(params && params.name, params && params.arguments));
    case 'resources/list': return ok({ resources: [] });
    case 'prompts/list': return ok({ prompts: [] });
    default:
      if (id === undefined) return null;
      return { jsonrpc:'2.0', id, error:{ code:-32601, message:`Method not found: ${method}` } };
  }
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, mcp-session-id, mcp-protocol-version, authorization');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'DELETE') return res.status(204).end();
  if (req.method === 'GET') {
    // MCP spec: a server with no SSE stream to offer MUST answer 405 here,
    // or a client that opens the stream first will sit waiting for events.
    const accept = String(req.headers['accept'] || '');
    if (accept.includes('text/event-stream')) {
      res.setHeader('Allow', 'POST, OPTIONS, DELETE');
      return res.status(405).json({ jsonrpc:'2.0', id:null,
        error:{ code:-32000, message:'This server does not offer an SSE stream; POST JSON-RPC to this endpoint.' } });
    }
    return res.status(200).json({ server: SERVER, transport:'streamable-http',
      tools: TOOLS.map(t=>t.name), patterns: PATTERNS.length, detected: 40,
      docs: 'https://sloppatterns.com/#mcp' });
  }
  if (req.method !== 'POST') return res.status(405).end();

  let body = req.body;
  const run = async () => {
    const batch = Array.isArray(body) ? body : [body];
    const out = (await Promise.all(batch.map(handle))).filter(Boolean);
    if (!out.length) return res.status(202).end();
    res.setHeader('Content-Type','application/json');
    return res.status(200).json(Array.isArray(body) ? out : out[0]);
  };
  if (body && typeof body === 'object') return run();
  let raw = '';
  req.on('data', d => raw += d);
  req.on('end', () => {
    try { body = JSON.parse(raw || '{}'); } catch (e) {
      return res.status(400).json({ jsonrpc:'2.0', id:null, error:{code:-32700, message:'Parse error'} });
    }
    run();
  });
};
