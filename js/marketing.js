/* ==========================================================================
   Indraam — Digital Marketing division behaviour.
   Vanilla ES2019+, no dependencies. Each block self-guards so the same file
   serves the landing page and the thank-you page.
   Shared helpers (window.indraamTrack, attribution) come from js/app.js.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var track = function (name, params) { if (window.indraamTrack) window.indraamTrack(name, params); };
  var THANKS_URL = '/digital-marketing/thank-you/';
  var SERVICE_LABELS = {
    'seo': 'SEO',
    'local-seo': 'Local SEO',
    'ai-search': 'AI Search Visibility',
    'google-ads': 'Google Ads',
    'meta-ads': 'Meta Advertising',
    'social': 'Social Media',
    'content': 'Content Marketing',
    'video': 'Video Marketing',
    'branding': 'Branding',
    'automation': 'Marketing Automation'
  };

  /* ------------------------------------------------------------------
     Services filter
     ------------------------------------------------------------------ */
  (function filters() {
    var chips = $$('#dmFilters .chip');
    var rows = $$('#dmServices .dm-svc');
    if (!chips.length || !rows.length) return;

    function apply(cat) {
      chips.forEach(function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-cat') === cat ? 'true' : 'false'); });
      rows.forEach(function (r) { r.hidden = cat !== 'all' && r.getAttribute('data-cat') !== cat; });
    }
    chips.forEach(function (c) {
      c.addEventListener('click', function () { apply(c.getAttribute('data-cat')); });
    });

    // A deep link (#seo from the nav menu) must never land on a hidden row.
    function reveal() {
      var t = location.hash && $(location.hash);
      if (t && t.classList && t.classList.contains('dm-svc') && t.hidden) apply('all');
    }
    window.addEventListener('hashchange', reveal);
    reveal();
  })();

  /* ------------------------------------------------------------------
     Consultation form
     ------------------------------------------------------------------ */
  (function form() {
    var form = $('#dmForm');
    if (!form) return;

    var submitBtn = $('#dmSubmit');
    var formErr = $('#dmFormErr');
    var services = $$('input[name="services"]', form);
    var started = false;
    var busy = false;
    var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

    function val(name) { var el = form.elements[name]; return el ? String(el.value || '').trim() : ''; }

    function setErr(name, msg) {
      var el = form.elements[name];
      var out = $('#err-' + name);
      if (out) out.textContent = msg || '';
      if (el && el.setAttribute) {
        if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
      }
    }

    function checkService(label, on) {
      services.forEach(function (cb) { if (cb.value === label) cb.checked = on; });
    }
    function exclusiveNotSure(changed) {
      if (!changed.checked) return;
      var notSure = changed.hasAttribute('data-exclusive');
      services.forEach(function (cb) {
        if (cb === changed) return;
        if (notSure) cb.checked = false;
        else if (cb.hasAttribute('data-exclusive')) cb.checked = false;
      });
    }
    services.forEach(function (cb) { cb.addEventListener('change', function () { exclusiveNotSure(cb); }); });

    // "Discuss SEO" / "Contact Guntur Team" buttons pre-fill the form.
    $$('[data-service]').forEach(function (a) {
      a.addEventListener('click', function () {
        var label = SERVICE_LABELS[a.getAttribute('data-service')];
        if (!label) return;
        checkService('Not Sure', false);
        checkService(label, true);
      });
    });
    $$('[data-office]').forEach(function (a) {
      a.addEventListener('click', function () {
        var team = a.getAttribute('data-office');
        $$('input[name="team"]', form).forEach(function (r) { r.checked = r.value === team; });
      });
    });

    // Landing on /digital-marketing/?service=seo#consultation works too.
    var qs = new URLSearchParams(location.search);
    var pre = SERVICE_LABELS[qs.get('service')];
    if (pre) checkService(pre, true);

    // On a pointer device, move focus to the first field after the scroll.
    $$('a[href="#consultation"]').forEach(function (a) {
      a.addEventListener('click', function () {
        if (!window.matchMedia('(pointer: fine)').matches) return;
        setTimeout(function () { var n = $('#dmName'); if (n) n.focus({ preventScroll: true }); }, 650);
      });
    });

    form.addEventListener('focusin', function () {
      if (started) return;
      started = true;
      track('form_start', { form: 'digital_marketing_consultation' });
    });

    form.addEventListener('input', function (e) {
      var t = e.target;
      if (t && t.name && $('#err-' + t.name) && $('#err-' + t.name).textContent) setErr(t.name, '');
    });

    function normalizeSite(v) {
      if (!v) return '';
      return /^https?:\/\//i.test(v) ? v : 'https://' + v;
    }

    function validate() {
      var first = null;
      function bad(name, msg) { setErr(name, msg); if (!first) first = form.elements[name]; }
      ['name', 'company', 'email', 'phone', 'website'].forEach(function (n) { setErr(n, ''); });

      if (val('name').length < 2) bad('name', 'Please enter your full name.');
      if (val('company').length < 2) bad('company', 'Please enter your company name.');
      if (!EMAIL.test(val('email'))) bad('email', 'Enter a valid business email, like name@company.com.');
      var phone = val('phone');
      if (phone && !/^[+()\-.\s\d]{7,24}$/.test(phone)) bad('phone', 'Enter a valid phone number, or leave it blank.');
      var site = val('website');
      if (site && !/^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i.test(site)) bad('website', 'Enter a website like yourcompany.com, or leave it blank.');
      return first;
    }

    function showFormErr(msg) {
      formErr.textContent = msg || '';
      formErr.classList.toggle('u-hidden', !msg);
    }

    function setBusy(on) {
      busy = on;
      submitBtn.disabled = on;
      submitBtn.textContent = on ? 'Sending…' : 'Request My Free Consultation';
    }

    function readAttribution() {
      var a = {};
      try { a = JSON.parse(sessionStorage.getItem('indraam.attr') || '{}') || {}; } catch (e) { a = {}; }
      a.page = location.pathname;
      return a;
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (busy) return;
      showFormErr('');

      var firstBad = validate();
      if (firstBad) { firstBad.focus(); return; }

      var checked = services.filter(function (cb) { return cb.checked; }).map(function (cb) { return cb.value; });
      var sid = null;
      try { sid = sessionStorage.getItem('indraam.sid'); } catch (err) { sid = null; }

      var payload = {
        name: val('name'),
        email: val('email'),
        note: val('message'),
        hp: val('hp'),
        sessionId: sid,
        lead: {
          company: val('company'),
          phone: val('phone'),
          website: normalizeSite(val('website')),
          location: val('location'),
          preferredTeam: (form.querySelector('input[name="team"]:checked') || {}).value || '',
          services: checked,
          budget: (form.querySelector('input[name="budget"]:checked') || {}).value || '',
          goal: val('goal'),
          attribution: readAttribution()
        }
      };

      var endpoint = (window.INDRAAM_CONFIG && window.INDRAAM_CONFIG.contactEndpoint) || '/api/contact';
      setBusy(true);
      try {
        var res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('http ' + res.status);
      } catch (err) {
        setBusy(false);
        showFormErr('That didn’t go through. Please try again, or email us at hello@indraam.com and we’ll pick it up.');
        return;
      }

      track('form_submit', { form: 'digital_marketing_consultation' });
      try {
        // Lets the thank-you page count a conversion only after a real,
        // accepted submission — never from someone loading the URL directly.
        sessionStorage.setItem('indraam.lead_ok', JSON.stringify({ at: Date.now(), services: checked.length }));
        sessionStorage.setItem('indraam.lead_name', val('name').split(/\s+/)[0]);
      } catch (err) { /* storage blocked — the redirect still happens */ }
      location.assign(THANKS_URL);
    });
  })();

  /* ------------------------------------------------------------------
     Sticky mobile CTA: only while the hero and the form are off-screen
     ------------------------------------------------------------------ */
  (function sticky() {
    var bar = $('#dmSticky');
    var hero = $('#dmHero');
    var formSec = $('#consultation');
    if (!bar || !hero || !('IntersectionObserver' in window)) return;
    var heroIn = true, formIn = false;
    function update() { bar.classList.toggle('is-on', !heroIn && !formIn); }
    new IntersectionObserver(function (en) { heroIn = en[0].isIntersecting; update(); }, { threshold: 0.05 }).observe(hero);
    if (formSec) new IntersectionObserver(function (en) { formIn = en[0].isIntersecting; update(); }, { threshold: 0.05 }).observe(formSec);
  })();

  /* ------------------------------------------------------------------
     Thank-you page: the conversion event
     ------------------------------------------------------------------ */
  (function thanks() {
    if (!$('[data-thanks]')) return;
    var ok = null;
    try {
      ok = sessionStorage.getItem('indraam.lead_ok');
      sessionStorage.removeItem('indraam.lead_ok');
    } catch (err) { ok = null; }
    if (ok) track('generate_lead', { lead_type: 'digital_marketing_consultation' });

    var slot = $('#thanksName');
    var name = '';
    try { name = sessionStorage.getItem('indraam.lead_name') || ''; sessionStorage.removeItem('indraam.lead_name'); } catch (err) { name = ''; }
    if (slot && name && ok) slot.textContent = 'Thanks, ' + name + '. ';
  })();
})();
