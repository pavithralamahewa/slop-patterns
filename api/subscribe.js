const { sign, signReady } = require('./_sign.js');
const { send, mailReady } = require('./_mail.js');

const OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SITE = 'https://sloppatterns.com';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(204).end();
  if(req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = req.body;
  if(typeof body === 'string'){ try { body = JSON.parse(body); } catch(e){ body = {}; } }
  body = body || {};

  if(body.website) return res.status(200).json({ ok: true });      // honeypot
  const email = String(body.email || '').trim().toLowerCase();
  if(!OK.test(email) || email.length > 200)
    return res.status(400).json({ error: 'That does not look like an email address.' });

  if(!signReady() || !mailReady())
    return res.status(503).json({ error: 'Signups are not switched on yet.' });

  const link = SITE + '/api/confirm?t=' + encodeURIComponent(sign(email));
  try {
    await send(email, 'Confirm your Slop Patterns subscription', `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#141414;max-width:520px">
  <p>One click and you're on the list.</p>
  <p><a href="${link}" style="display:inline-block;background:#141414;color:#fff;text-decoration:none;padding:11px 18px;border-radius:7px;font-weight:600">Confirm subscription</a></p>
  <p style="color:#717171;font-size:14px">Monthly. What got added to the library, what the most common AI design failures were, and nothing else. Unsubscribe in one click, any time.</p>
  <p style="color:#ADADAD;font-size:13px">If you didn't ask for this, ignore it — nothing happens without that click.</p>
  <p style="color:#ADADAD;font-size:13px">Slop Patterns · Pavithra Lamahewa · Precious Studio</p>
</div>`);
    return res.status(200).json({ ok: true });
  } catch(e){
    return res.status(500).json({ error: 'Could not send the confirmation email.' });
  }
};
