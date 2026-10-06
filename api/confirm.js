const { verify } = require('./_sign.js');
const { send, addContact } = require('./_mail.js');
const SITE = 'https://sloppatterns.com';

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title} — Slop Patterns</title><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400..700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;color:#141414;
font-family:"Instrument Sans",-apple-system,Helvetica,Arial,sans-serif;font-weight:456;padding:24px}
.b{max-width:520px}h1{font-weight:652;font-size:clamp(30px,5vw,46px);line-height:1.05;letter-spacing:-.01em;margin:0 0 16px}
p{font-size:17px;line-height:25px;color:#717171;margin:0 0 14px}
a.btn{display:inline-block;margin-top:14px;background:#141414;color:#fff;text-decoration:none;padding:11px 17px;border-radius:7px;font-weight:600}
@media(prefers-color-scheme:dark){body{background:#0B0B0C;color:#fff}p{color:#8C8C90}a.btn{background:#fff;color:#0B0B0C}}
</style></head><body><div class="b">${body}</div></body></html>`;

module.exports = async (req, res) => {
  const url = new URL(req.url, SITE);
  const email = verify(url.searchParams.get('t') || '');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if(!email) return res.status(400).send(page('Link expired',
    '<h1>That link has expired.</h1><p>Confirmation links are good for 48 hours. Sign up again and we will send a fresh one.</p><a class="btn" href="' + SITE + '/">Back to the library</a>'));

  try {
    await addContact(email);
    await send(email, 'You’re on the list', `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#141414;max-width:560px">
  <p>You're confirmed. Here's what's worth doing first.</p>
  <p><b>Put the library inside your coding agent.</b> It's a free MCP server, no account:</p>
  <pre style="background:#F3F3F3;border-radius:8px;padding:12px 14px;font-size:13px;overflow-x:auto">${SITE}/mcp</pre>
  <p>Your agent can then check the UI it writes against 272 documented anti-patterns before it shows you anything.</p>
  <p><b>Three worth reading today:</b></p>
  <ul style="padding-left:18px">
    <li><a href="${SITE}/#the-unchosen-gradient">A1 — The Unchosen Gradient</a></li>
    <li><a href="${SITE}/#inter-for-everything">A2 — Inter For Everything</a></li>
    <li><a href="${SITE}/#three-identical-feature-cards">A3 — Three Identical Feature Cards</a></li>
  </ul>
  <p>Seen something that isn't in there? <a href="${SITE}/#submit">Report it</a> — reported patterns ship with credit.</p>
  <p style="color:#717171;font-size:14px">Monthly from here. Unsubscribe any time.</p>
  <p style="color:#ADADAD;font-size:13px">Slop Patterns · Pavithra Lamahewa · Precious Studio</p>
</div>`);
  } catch(e){ /* confirmed either way; the welcome is best-effort */ }

  return res.status(200).send(page('Confirmed',
    '<h1>You’re on the list.</h1><p>A welcome email is on its way with the MCP install line and three patterns worth reading. Monthly from here — nothing else.</p><a class="btn" href="' + SITE + '/">Back to the library</a>'));
};
