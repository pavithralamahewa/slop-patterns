/* Book a review. Stripe lives in env so the link is never invented in the repo.
   REVIEW_PAY_URL or NEXT_PUBLIC_REVIEW_PAY_URL: https payment link.
   If neither is set, the visitor lands on the scanner offer, which is where
   "Book a review" goes today.
   Feel Pack and the subscription are calls, not charges. */
const CAL = 'https://cal.com/precious-studio/15min';

function httpsUrl(raw) {
  if (!raw) return '';
  try {
    const u = new URL(String(raw).trim());
    if (u.protocol !== 'https:') return '';
    return u;
  } catch (e) {
    return '';
  }
}

function mediumOf(q) {
  const m = q.get('utm_medium') || q.get('medium') || 'home';
  return m === 'research' ? 'research' : 'home';
}

function tierOf(q) {
  const t = q.get('tier') || q.get('utm_content') || 'review';
  if (t === 'feelpack' || t === 'subscription' || t === 'review' || t === 'firstlook') return t;
  return 'review';
}

function withUtm(target, medium, tier) {
  const u = new URL(target);
  u.searchParams.set('utm_source', 'sloppatterns');
  u.searchParams.set('utm_medium', medium);
  u.searchParams.set('utm_campaign', 'launch');
  u.searchParams.set('utm_content', tier);
  u.searchParams.set('tier', tier);
  return u.toString();
}

function buildLocation(env, search) {
  const q = new URLSearchParams(search || '');
  const medium = mediumOf(q);
  const tier = tierOf(q);
  if (tier === 'feelpack' || tier === 'subscription') {
    return withUtm(CAL, medium, tier);
  }
  const stripe = httpsUrl(env && (env.REVIEW_PAY_URL || env.NEXT_PUBLIC_REVIEW_PAY_URL));
  if (stripe) return withUtm(stripe, medium, 'review');
  const back = new URL('https://sloppatterns.com/score');
  back.searchParams.set('utm_source', 'sloppatterns');
  back.searchParams.set('utm_medium', medium);
  back.searchParams.set('utm_campaign', 'launch');
  back.searchParams.set('utm_content', 'review');
  back.searchParams.set('tier', 'review');
  back.hash = 'maker';
  return back.pathname + back.search + back.hash;
}

module.exports = function pay(req, res) {
  const host = (req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || 'sloppatterns.com';
  const incoming = new URL(req.url, 'https://' + host);
  const location = buildLocation(process.env, incoming.searchParams.toString());
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
};

module.exports.buildLocation = buildLocation;
module.exports.withUtm = withUtm;
