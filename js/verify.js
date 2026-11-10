/* ==========================================================================
   Public certificate verification.

   Reads the certificate ID from ?id=... (what the printed QR code carries) or
   from /verify/<ID>, asks /api/verify, and shows the result. Every value from
   the server is escaped before it touches the DOM.
   ========================================================================== */
(function () {
  'use strict';

  var form = document.getElementById('vForm');
  var input = document.getElementById('vId');
  var go = document.getElementById('vGo');
  var out = document.getElementById('vResult');
  var ID_RE = /^IND-\d{4}-[A-Z2-9]{8}$/;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  }

  function card(kind, icon, headline, sub, body) {
    return '<section class="vcard vcard--' + kind + '">' +
      '<div class="vcard__status"><span class="vcard__icon" aria-hidden="true">' + icon + '</span>' +
      '<div><h2 class="vcard__headline">' + esc(headline) + '</h2>' + (sub ? '<p class="vcard__sub">' + esc(sub) + '</p>' : '') + '</div></div>' +
      (body || '') + '</section>';
  }

  function row(label, value, cls) {
    if (!value) return '';
    return '<dt>' + esc(label) + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(value) + '</dd>';
  }

  function render(data) {
    var duration = '';
    if (data.startDate && data.endDate) duration = fmtDate(data.startDate) + ' – ' + fmtDate(data.endDate);
    else if (data.startDate) duration = 'From ' + fmtDate(data.startDate);
    else if (data.endDate) duration = 'Until ' + fmtDate(data.endDate);

    var details = '<dl class="vdl">' +
      row('Awarded to', data.name, 'vname') +
      row('Program', data.program) +
      row('Duration', duration) +
      row('Issued on', fmtDate(data.issuedOn)) +
      row('Certificate ID', data.certId, 'vmono') +
      '</dl>';

    if (data.status === 'revoked') {
      out.innerHTML = card('revoked', '!', 'Certificate revoked',
        'This certificate was issued by Indraam but is no longer valid.', details);
      return;
    }

    var fileUrl = '/api/verify?id=' + encodeURIComponent(data.certId) + '&file=1';
    var cert = '';
    if (data.hasFile) {
      var preview = data.fileType === 'application/pdf'
        ? '<iframe class="vcert__pdf" src="' + fileUrl + '" title="Certificate for ' + esc(data.name) + '"></iframe>'
        : '<img class="vcert__img" src="' + fileUrl + '" alt="Certificate issued to ' + esc(data.name) + '">';
      cert = '<div class="vcert"><p class="vcert__label">Certificate</p>' + preview +
        '<div class="vcert__actions"><a class="btn btn-secondary" href="' + fileUrl + '" target="_blank" rel="noopener">Open full size</a></div></div>';
    } else {
      cert = '<div class="vcert"><p class="vcert__note">The certificate record is confirmed. A copy of the certificate is not available online.</p></div>';
    }

    out.innerHTML = card('valid', '&#10003;', 'Certificate verified',
      'This certificate was issued by Indraam.', details + cert);
  }

  function renderMissing() {
    out.innerHTML = card('missing', '&#10005;', 'No certificate found',
      'We could not find a certificate with that ID. Check the ID and try again, or contact Indraam if you believe this is a mistake.');
  }

  function renderError(msg) {
    out.innerHTML = card('error', '!', 'Could not verify right now', msg || 'Please try again in a moment.');
  }

  async function check(id) {
    out.innerHTML = '<p class="vloading">Checking…</p>';
    go.disabled = true;
    try {
      var res = await fetch('/api/verify?id=' + encodeURIComponent(id), { headers: { Accept: 'application/json' } });
      var data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (res.status === 404) { renderMissing(); return; }
      if (res.status === 429) { renderError('Too many checks in a short time. Please wait a minute and try again.'); return; }
      if (!res.ok || !data) { renderError((data && data.error) || null); return; }
      render(data);
    } catch (e) {
      renderError('Network problem. Check your connection and try again.');
    } finally {
      go.disabled = false;
    }
  }

  function normalize(v) { return String(v || '').trim().toUpperCase(); }

  function fromLocation() {
    var q = new URLSearchParams(window.location.search).get('id');
    if (q) return normalize(q);
    var m = /^\/verify\/([^/]+)\/?$/.exec(window.location.pathname);
    return m ? normalize(decodeURIComponent(m[1])) : '';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = normalize(input.value);
    input.value = id;
    if (!ID_RE.test(id)) {
      out.innerHTML = card('missing', '&#10005;', 'Check the ID',
        'A certificate ID looks like IND-2026-XXXXXXXX.');
      input.focus();
      return;
    }
    // Keep the address bar shareable and reload-safe.
    history.replaceState(null, '', '/verify?id=' + encodeURIComponent(id));
    check(id);
  });

  var initial = fromLocation();
  if (initial) {
    input.value = initial;
    if (ID_RE.test(initial)) check(initial); else renderMissing();
  } else {
    input.focus();
  }
})();
