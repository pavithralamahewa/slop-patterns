/* Paid ladder shared by the library home page and the research note.
   Book a review goes through /api/pay. That sends people to the live
   $349 Payment Link unless REVIEW_PAY_URL overrides it.
   Calls go to the 15-minute slot. UTMs identify the page and the tier. */
(function () {
  var CAL = 'https://cal.com/precious-studio/15min';

  function q(tier, medium) {
    return new URLSearchParams({
      utm_source: 'sloppatterns',
      utm_medium: medium === 'research' ? 'research' : 'home',
      utm_campaign: 'launch',
      utm_content: tier,
      tier: tier
    }).toString();
  }
  function cal(tier, medium) { return CAL + '?' + q(tier, medium); }
  function pay(tier, medium) { return '/api/pay?' + q(tier, medium); }

  window.trackOffer = window.trackOffer || function () {};

  var REVIEW_TURNAROUND = '2 business days';

  window.renderOffer = function (medium) {
    var m = medium === 'research' ? 'research' : 'home';
    return '<section class="maker" id="review">'
      + '<div class="who" id="who">'
      + '<p class="who-k">Who made this</p>'
      + '<p class="who-name"><b>Pavithra Lamahewa</b>, Co-founder and UX Director at <a href="https://precious.studio/" target="_blank" rel="noopener">Precious Studio</a>. 13 years designing products.</p>'
      + '<p class="who-body">Slop Patterns is built from 4,725 archived Show HN launch pages and 235 documented patterns, each with its sources. The nine rules counted in the research were checked by hand before anything was counted.</p>'
      + '<p class="who-links"><a href="/#p0" data-go="p0">How the library is made</a><a href="/research/the-same-page#audit">Research method</a><a href="https://www.linkedin.com/in/pavithralamahewa/" target="_blank" rel="noopener">LinkedIn</a><a href="https://precious.studio/" target="_blank" rel="noopener">precious.studio</a></p>'
      + '<figure class="who-sample" data-slot="sample-review"><a href="/review-sample.jpg" target="_blank" rel="noopener"><img src="/review-sample.jpg" width="1200" height="760" loading="lazy" alt="A sample design review of our demo page, Plotline: three changes circled in red pen, listed in order of impact with the time each takes."></a><figcaption>What a review looks like. A sample, on our demo page.</figcaption></figure>'
      + '</div>'
      + '<h2 class="maker-h">Reviews and design help from Precious Studio</h2>'
      + '<div class="offers">'
      + row('Design review', '$349',
          'Starts from a Slop Score scan of your page. A senior designer reviews it by hand, ranks your tells, and shows the fix for each: your three highest-impact changes, annotated, within ' + REVIEW_TURNAROUND + '. If they are not worth making, you get a full refund. The $349 comes off a Feel Pack or subscription started within 30 days.',
          '<a class="of-btn" data-cta="review" href="' + pay('review', m) + '">Book a review</a>')
      + row('Feel Pack', '$2,500 · 5 days',
          '<b class="of-lead">Your landing page, redesigned in 5 days.</b> Or up to 3 screens on one key flow. Kickoff call, Figma files, one round of revisions, and a dev-ready handoff. Your $349 review counts toward this.',
          '<a class="of-btn ghost" data-cta="feelpack" href="' + cal('feelpack', m) + '">Start a Feel Pack</a>')
      + row('Design subscription', 'from $4,500/mo',
          'A dedicated senior designer from Precious Studio on your product, without hiring or a long commitment. The same named person every month, inside your tools. <button type="button" class="of-more" data-offer="more" aria-expanded="false">How it works</button>',
          '<a class="of-btn ghost" data-cta="subscription" href="' + cal('subscription', m) + '">Book a 15-minute call</a>',
          how())
      + row('Newsletter', 'Free · monthly',
          'Not ready yet? One email a month: the AI tells we saw most, and how to fix them.',
          '<button type="button" class="of-btn ghost" data-offer="news" aria-expanded="false">Subscribe</button>',
          '<form class="of-form of-news" hidden novalidate>'
            + '<label>Email<input name="email" type="email" required placeholder="you@company.com" autocomplete="email"></label>'
            + '<input name="website" type="text" tabindex="-1" autocomplete="off" class="of-hp" aria-hidden="true">'
            + '<div class="of-send"><button type="submit" class="of-btn">Subscribe</button><p class="of-note" role="status"></p></div>'
          + '</form>')
      + '</div></section>';
  };

  function row(name, price, what, act, extra) {
    return '<div class="of-row"><div class="of-name"><b>' + name + '</b><span class="of-price">' + price + '</span></div>'
      + '<p class="of-what">' + what + '</p><div class="of-act">' + act + '</div>' + (extra || '') + '</div>';
  }

  function how() {
    return '<div class="of-sub" hidden>'
      + '<div class="of-lanes">'
      + '<div><b>1 lane · $4,500/mo</b><span>One active request at a time. When it ships, the next one starts.</span></div>'
      + '<div><b>2 lanes · $7,500/mo</b><span>Two requests moving in parallel, for teams shipping on more than one front.</span></div>'
      + '</div>'
      + '<ul class="of-facts">'
      + '<li><b>Specialists included.</b> Motion and illustration join on demand and share your lanes.</li>'
      + '<li><b>Month to month.</b> Pause or cancel any time.</li>'
      + '<li><b>Instead of hiring.</b> No recruiting, no ramp. Senior design from the first week.</li>'
      + '</ul>'
      + '<ol class="of-steps">'
      + '<li>Book a call. We talk through what you are building.</li>'
      + '<li>You get a shared request board.</li>'
      + '<li>Your first request starts within days.</li>'
      + '<li>Updates come async, so your team keeps moving.</li>'
      + '</ol>'
      + '<p class="of-fits"><span>Good fits:</span> product UI, dashboards, landing pages, design systems, brand and key pages, ongoing feature design. <span class="of-proof">4.9 / 5 on Clutch · 15 reviews</span></p>'
      + '</div>';
  }

  document.addEventListener('click', function (e) {
    var score = e.target.closest && e.target.closest('a[href="/score"], a[href^="/score?"], a[href^="/score#"]');
    if (score) window.trackOffer('outbound_score');

    var cta = e.target.closest && e.target.closest('[data-cta]');
    if (cta) {
      var name = { review: 'cta_review', feelpack: 'cta_feelpack', subscription: 'cta_subscription' }[cta.getAttribute('data-cta')];
      if (name) window.trackOffer(name);
    }

    var ask = e.target.closest && e.target.closest('[data-offer="news"]');
    if (ask) {
      e.preventDefault();
      var form = ask.closest('.of-row').querySelector('.of-form');
      var open = form.hasAttribute('hidden');
      if (open) { form.removeAttribute('hidden'); ask.textContent = 'Close'; var em = form.querySelector('[name=email]'); if (em) em.focus(); }
      else { form.setAttribute('hidden', ''); ask.textContent = 'Subscribe'; }
      ask.setAttribute('aria-expanded', open ? 'true' : 'false');
      return;
    }

    var more = e.target.closest && e.target.closest('[data-offer="more"]');
    if (more) {
      e.preventDefault();
      var sub = more.closest('.of-row').querySelector('.of-sub');
      var open = sub.hasAttribute('hidden');
      if (open) sub.removeAttribute('hidden'); else sub.setAttribute('hidden', '');
      more.textContent = open ? 'Less' : 'How it works';
      more.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  });

  document.addEventListener('submit', function (e) {
    var f = e.target.closest ? e.target.closest('.of-news') : null;
    if (!f) return;
    e.preventDefault();
    var note = f.querySelector('.of-note');
    var btn = f.querySelector('button[type="submit"]');
    var email = (f.querySelector('[name=email]').value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      note.textContent = 'That does not look like an email address.'; note.className = 'of-note err'; return;
    }
    btn.disabled = true;
    note.className = 'of-note';
    note.textContent = 'Sending…';
    fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email, website: f.querySelector('[name=website]').value })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; });
    }).then(function (x) {
      btn.disabled = false;
      if (x.ok) {
        f.setAttribute('hidden', '');
        f.parentNode.querySelector('.of-act').innerHTML = '<span class="of-ok">Check your inbox. One click to confirm.</span>';
        window.trackOffer('newsletter_signup');
        return;
      }
      note.className = 'of-note err';
      note.textContent = (x.j && x.j.error) || 'That did not go through. Try again in a minute.';
    }).catch(function () {
      btn.disabled = false;
      note.className = 'of-note err';
      note.textContent = 'That did not go through. Try again in a minute.';
    });
  });
})();
