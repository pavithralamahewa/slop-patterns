const { sql, configured } = require('./_db.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
  if(!configured()) return res.status(200).json({ ready: false, checks: 0, rules: [] });
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query && req.query.days, 10) || 30));
    const totals = await sql(
      'select coalesce(sum(checks),0)::int as checks, coalesce(sum(clean),0)::int as clean '
      + 'from check_totals where day > current_date - $1::int', [days]);
    const rules = await sql(
      'select rule_code, sum(hits)::int as hits from rule_hits '
      + 'where day > current_date - $1::int group by rule_code order by hits desc limit 40', [days]);
    const checks = (totals[0] && totals[0].checks) || 0;
    return res.status(200).json({
      ready: checks > 0, days, checks, clean: (totals[0] && totals[0].clean) || 0,
      rules: rules.map(r => ({ code: r.rule_code, hits: r.hits,
        share: checks ? +(r.hits / checks * 100).toFixed(1) : 0 }))
    });
  } catch(e){
    return res.status(200).json({ ready: false, checks: 0, rules: [], error: 'unavailable' });
  }
};
