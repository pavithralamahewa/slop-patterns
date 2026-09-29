/* Neon over HTTP — no driver, no build step. */
const URL_ = process.env.DATABASE_URL || '';
const HOST = URL_ ? URL_.replace(/^.*@([^/]+)\/.*$/, '$1') : '';

async function sql(query, params = []){
  if(!URL_) throw new Error('DATABASE_URL is not set');
  const r = await fetch('https://' + HOST + '/sql', {
    method: 'POST',
    headers: { 'Neon-Connection-String': URL_, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, params })
  });
  if(!r.ok) throw new Error('db ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  return j.rows || [];
}
const configured = () => !!URL_;

/* Abuse limits: at most `max` actions of `kind` for `key` within `hours`. Records the attempt.
   Fails open (allows) if the database is unreachable, so a DB hiccup never blocks a real person. */
let ready = false;
async function allow(kind, key, max, hours){
  if(!URL_) return true;
  try {
    if(!ready){ await sql('create table if not exists hits (kind text not null, k text not null, at timestamptz not null default now())'); ready = true; }
    const r = await sql("select count(*)::int as n from hits where kind=$1 and k=$2 and at > now() - ($3 || ' hours')::interval", [kind, key, String(hours)]);
    if((r[0] && r[0].n) >= max) return false;
    await sql('insert into hits (kind, k) values ($1,$2)', [kind, key]);
    return true;
  } catch(e){ return true; }
}
module.exports = { sql, configured, allow };
