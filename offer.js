/* Paid ladder shared by the library home page and the research note.
   Book a review goes through /api/pay so the Stripe link stays in env.
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

  window.trackOffer = function (name) {
    window.plausible = window.plausible || function () {
      (window.plausible.q = window.plausible.q || []).push(arguments);
    };
    try { window.plausible(name); } catch (e) {}
  };

  window.renderOffer = function (medium) {
    var m = medium === 'research' ? 'research' : 'home';
    return '<section class="maker" id="review">'
      + '<p class="maker-q">“I’ve spent thirteen years designing products. These are the things I look for first when I review one.”</p>'
      + '<p class="maker-by"><b>Pavithra Lamahewa</b> · Principal UX Architect, <a href="https://precious.studio/" target="_blank" rel="noopener">Precious Studio</a> · Author of Slop Patterns and The Same Page</p>'
      + '<h2 class="maker-h">Get a review from the designer behind this research</h2>'
      + '<div class="offers">'
      + row('First look', 'Free',
          'Three notes from Pavithra on your page, by email. Five a week.',
          '<button type="button" class="of-btn ghost" data-offer="ask" aria-expanded="false">Ask for a first look</button>',
          '<form class="of-form" hidden novalidate>'
            + '<label>Page<input name="url" type="text" inputmode="url" required placeholder="yoursite.com" autocomplete="url"></label>'
            + '<label>Email<input name="email" type="email" required placeholder="you@company.com" autocomplete="email"></label>'
            + '<label class="wide">What are you launching? <em>Optional</em><input name="note" type="text" maxlength="300" placeholder="A sentence is plenty"></label>'
            + '<input name="company" type="text" tabindex="-1" autocomplete="off" class="of-hp" aria-hidden="true">'
            + '<div class="of-send"><button type="submit" class="of-btn">Send</button><p class="of-note" role="status"></p></div>'
          + '</form>')
      + row('Design review', '$349',
          'One page of your website, reviewed by hand: what to change first, and why. It comes off a Feel Pack or a subscription if you start one within 30 days.',
          '<a class="of-btn" data-cta="review" href="' + pay('review', m) + '">Book a review</a>')
      + row('Feel Pack', '$2,500 · 5 days',
          'We fix the worst of it for you: the top issues on your key flow, designed and handed off in 5 days. Your $349 review counts toward it.',
          '<a class="of-btn" data-cta="feelpack" href="' + cal('feelpack', m) + '">Book a 15-minute call</a>')
      + row('Design subscription', 'from $4,500/mo',
          'A dedicated senior designer on your product, without hiring or a long commitment. AI does the heavy lift; a designer locks taste. <button type="button" class="of-more" data-offer="more" aria-expanded="false">How it works</button>',
          '<a class="of-btn ghost" data-cta="subscription" href="' + cal('subscription', m) + '">Book a 15-minute call</a>',
          how())
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

    var ask = e.target.closest && e.target.closest('[data-offer="ask"]');
    if (ask) {
      e.preventDefault();
      var form = ask.closest('.of-row').querySelector('.of-form');
      var open = form.hasAttribute('hidden');
      if (open) { form.removeAttribute('hidden'); ask.textContent = 'Close'; }
      else { form.setAttribute('hidden', ''); ask.textContent = 'Ask for a first look'; }
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
    var f = e.target.closest ? e.target.closest('.of-form') : null;
    if (!f) return;
    e.preventDefault();
    var note = f.querySelector('.of-note');
    var btn = f.querySelector('button[type="submit"]');
    var email = (f.querySelector('[name=email]').value || '').trim();
    var url = (f.querySelector('[name=url]').value || '').trim();
    if (!url) { note.textContent = 'Add the page you want looked at.'; note.className = 'of-note err'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      note.textContent = 'That does not look like an email address.'; note.className = 'of-note err'; return;
    }
    window.trackOffer('cta_firstlook');
    btn.disabled = true;
    note.className = 'of-note';
    note.textContent = 'Sending…';
    var body = {};
    new FormData(f).forEach(function (v, k) { body[k] = v; });
    fetch('/score/api/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; });
    }).then(function (x) {
      btn.disabled = false;
      if (x.ok) {
        f.setAttribute('hidden', '');
        var act = f.parentNode.querySelector('.of-act');
        act.innerHTML = '<span class="of-ok">Got it. Your notes will come by email.</span>';
        return;
      }
      note.className = 'of-note err';
      if (x.status === 429) note.textContent = (x.j && x.j.error) || 'This week’s five are taken. The paid review has no wait.';
      else note.textContent = (x.j && x.j.error) || 'That did not go through. Try again in a minute.';
    }).catch(function () {
      btn.disabled = false;
      note.className = 'of-note err';
      note.textContent = 'That did not go through. Try again in a minute.';
    });
  });
})();
