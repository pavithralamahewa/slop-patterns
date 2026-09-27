/* Resend, via plain fetch. */
const KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.MAIL_FROM || 'Slop Patterns <hello@precious.studio>';

async function send(to, subject, html, opts = {}){
  if(!KEY) throw new Error('RESEND_API_KEY is not set');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ from: FROM, to: [to], subject, html }, opts))
  });
  if(!r.ok) throw new Error('resend ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}
async function addContact(email){
  const aud = process.env.RESEND_AUDIENCE_ID;
  if(!aud) return null;
  const r = await fetch('https://api.resend.com/audiences/' + aud + '/contacts', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, unsubscribed: false })
  });
  return r.ok ? r.json() : null;
}
const mailReady = () => !!KEY;
module.exports = { send, addContact, mailReady, FROM };
