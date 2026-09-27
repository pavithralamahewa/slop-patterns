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
module.exports = { sql, configured };
