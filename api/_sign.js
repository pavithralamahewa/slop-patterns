const crypto = require('crypto');
const SECRET = process.env.SUBSCRIBE_SECRET || '';
const b64 = s => Buffer.from(s).toString('base64url');
const unb64 = s => Buffer.from(s, 'base64url').toString('utf8');

function sign(email){
  const payload = b64(JSON.stringify({ e: email, t: Date.now() }));
  const mac = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return payload + '.' + mac;
}
function verify(token, maxAgeMs = 1000 * 60 * 60 * 48){
  if(!SECRET || !token || token.indexOf('.') < 0) return null;
  const [payload, mac] = token.split('.');
  const want = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(want);
  if(a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let o; try { o = JSON.parse(unb64(payload)); } catch(e){ return null; }
  if(!o || !o.e || Date.now() - o.t > maxAgeMs) return null;
  return o.e;
}
const signReady = () => !!SECRET;
module.exports = { sign, verify, signReady };
