/* ==========================================================================
   Indraam admin — certificates.

   Same signed HttpOnly cookie as the main dashboard: if you are not signed
   in there, this page sends you to sign in. Everything the server returns is
   escaped before it reaches the DOM.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var gate = $('#gateView');
  var app = $('#appView');
  var state = { q: '', page: 1, pages: 1, total: 0 };
  var timer = null;
  var MAX_BYTES = 3 * 1024 * 1024;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function corners() { return '<i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>'; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function fmt(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  function notice(msg, kind) {
    var el = $('#notice');
    el.textContent = msg || '';
    el.classList.toggle('u-hidden', !msg);
    el.dataset.kind = kind || '';
    if (msg) { clearTimeout(notice.t); notice.t = setTimeout(function () { el.classList.add('u-hidden'); }, 6000); }
  }

  async function api(path, options) {
    var res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' }, options || {}));
    if (res.status === 401) { showGate(); throw new Error('Please sign in again.'); }
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
    return data;
  }

  function showGate(msg) {
    app.hidden = true; gate.hidden = false;
    if (msg) $('#gateText').textContent = msg;
  }
  function showApp() {
    gate.hidden = true; app.hidden = false;
    $('#fIssued').value = today();
    load();
  }

  /* -------------------------------------------------------------- list */

  function qrUrl(id, fmt2) { return '/api/admin/certificates?id=' + encodeURIComponent(id) + '&qr=' + fmt2; }

  function recHtml(c) {
    var status = c.status === 'revoked' ? 'revoked' : 'valid';
    var dates = (c.startDate || c.endDate) ? [fmt(c.startDate), fmt(c.endDate)].filter(Boolean).join(' – ') : '';
    var facts = [dates, c.issuedOn ? 'Issued ' + fmt(c.issuedOn) : '', c.email].filter(Boolean).join(' · ');
    return '<article class="blueprint rec cert-rec" data-id="' + esc(c.certId) + '">' + corners() +
      '<img class="cert-rec__qr" src="' + qrUrl(c.certId, 'png') + '" alt="QR code for ' + esc(c.certId) + '" width="148" height="148" loading="lazy">' +
      '<div>' +
        '<div class="rec__head"><span class="rec__title">' + esc(c.name) + '</span>' +
          '<span class="pill pill--' + status + '">' + (status === 'revoked' ? 'Revoked' : 'Valid') + '</span>' +
          (c.hasFile ? '' : '<span class="pill pill--nofile">No file yet</span>') + '</div>' +
        '<p class="cert-rec__sub">' + esc(c.program) + '</p>' +
        '<p class="cert-rec__id">' + esc(c.certId) + '</p>' +
        (facts ? '<p class="cert-rec__facts">' + esc(facts) + '</p>' : '') +
        (c.note ? '<p class="cert-rec__facts">Note: ' + esc(c.note) + '</p>' : '') +
        '<div class="cert-rec__actions">' +
          '<a class="btn btn-secondary" href="' + qrUrl(c.certId, 'png') + '" download>QR (PNG)</a>' +
          '<a class="btn btn-secondary" href="' + qrUrl(c.certId, 'svg') + '" download>QR (SVG)</a>' +
          '<button type="button" class="btn btn-secondary" data-act="copy" data-url="' + esc(c.verifyUrl) + '">Copy link</button>' +
          '<a class="btn btn-secondary" href="verify?id=' + encodeURIComponent(c.certId) + '" target="_blank" rel="noopener">Open verify page</a>' +
          '<label class="btn btn-secondary" style="cursor:pointer">' + (c.hasFile ? 'Replace file' : 'Upload certificate') +
            '<input type="file" accept="image/png,image/jpeg,application/pdf" data-act="upload"></label>' +
          (c.hasFile ? '<button type="button" class="statusbtn" data-act="removeFile">Remove file</button>' : '') +
          '<button type="button" class="statusbtn" data-act="' + (status === 'revoked' ? 'reinstate' : 'revoke') + '">' + (status === 'revoked' ? 'Reinstate' : 'Revoke') + '</button>' +
          '<button type="button" class="statusbtn" data-act="delete">Delete</button>' +
        '</div>' +
      '</div></article>';
  }

  async function load() {
    var box = $('#records');
    try {
      var data = await api('/api/admin/certificates?page=' + state.page + '&q=' + encodeURIComponent(state.q));
      state.pages = data.pages; state.total = data.total;
      $('#countLabel').textContent = data.total + (data.total === 1 ? ' certificate' : ' certificates');
      box.innerHTML = data.items.length ? data.items.map(recHtml).join('') :
        '<div class="empty"><div class="empty__title">' + (state.q ? 'Nothing matches' : 'No certificates yet') + '</div><div class="empty__body">' +
        (state.q ? 'Try a different search.' : 'Create the first one with the form above.') + '</div></div>';
      $('#pager').classList.toggle('u-hidden', data.pages <= 1);
      $('#pagerLabel').textContent = 'Page ' + data.page + ' of ' + data.pages;
      $('#prevBtn').disabled = data.page <= 1;
      $('#nextBtn').disabled = data.page >= data.pages;
    } catch (e) {
      if (e.message !== 'Please sign in again.') { box.innerHTML = ''; notice(e.message, 'error'); }
    }
  }

  /* ------------------------------------------------------------ create */

  $('#certForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var err = $('#formErr'), btn = $('#formGo');
    err.classList.add('u-hidden');
    var body = {
      action: 'create',
      name: $('#fName').value, program: $('#fProgram').value,
      startDate: $('#fStart').value, endDate: $('#fEnd').value, issuedOn: $('#fIssued').value,
      email: $('#fEmail').value, note: $('#fNote').value,
    };
    btn.disabled = true; btn.textContent = 'Creating…';
    try {
      var c = await api('/api/admin/certificates', { method: 'POST', body: JSON.stringify(body) });
      $('#certForm').reset(); $('#fIssued').value = today();
      state.q = ''; state.page = 1; $('#search').value = '';
      notice('Created ' + c.certId + '. Download its QR code below, place it on the certificate, then upload the finished file.', 'ok');
      await load();
      var first = $('#records .cert-rec'); if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e2) {
      err.textContent = e2.message; err.classList.remove('u-hidden');
    } finally { btn.disabled = false; btn.textContent = 'Create certificate and QR code'; }
  });

  /* ----------------------------------------------------------- actions */

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { reject(new Error('Could not read that file.')); };
      r.readAsDataURL(file);
    });
  }

  $('#records').addEventListener('change', async function (e) {
    var inp = e.target.closest('input[data-act="upload"]');
    if (!inp || !inp.files.length) return;
    var id = inp.closest('.cert-rec').dataset.id, file = inp.files[0];
    if (file.size > MAX_BYTES) { notice('That file is larger than 3 MB. Export a smaller PNG, JPG or PDF.', 'error'); inp.value = ''; return; }
    try {
      notice('Uploading…');
      await api('/api/admin/certificates', { method: 'POST', body: JSON.stringify({ action: 'upload', certId: id, filename: file.name, dataBase64: await readFile(file) }) });
      notice('Certificate file saved for ' + id + '. Scanning the QR code now shows it.', 'ok');
      load();
    } catch (err) { notice(err.message, 'error'); inp.value = ''; }
  });

  $('#records').addEventListener('click', async function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn || btn.tagName === 'INPUT') return;
    var rec = btn.closest('.cert-rec'); var id = rec && rec.dataset.id; var act = btn.dataset.act;
    try {
      if (act === 'copy') {
        await navigator.clipboard.writeText(btn.dataset.url);
        notice('Verification link copied.', 'ok');
      } else if (act === 'revoke') {
        if (!confirm('Revoke ' + id + '? Anyone who scans its QR code will see it is no longer valid.')) return;
        await api('/api/admin/certificates', { method: 'PATCH', body: JSON.stringify({ certId: id, status: 'revoked' }) });
        notice(id + ' revoked.', 'ok'); load();
      } else if (act === 'reinstate') {
        await api('/api/admin/certificates', { method: 'PATCH', body: JSON.stringify({ certId: id, status: 'valid' }) });
        notice(id + ' is valid again.', 'ok'); load();
      } else if (act === 'removeFile') {
        if (!confirm('Remove the uploaded file for ' + id + '? The QR code will still verify the record.')) return;
        await api('/api/admin/certificates', { method: 'POST', body: JSON.stringify({ action: 'removeFile', certId: id }) });
        notice('File removed.', 'ok'); load();
      } else if (act === 'delete') {
        if (!confirm('Permanently delete ' + id + '? Its QR code will stop working. This cannot be undone.')) return;
        await api('/api/admin/certificates?id=' + encodeURIComponent(id), { method: 'DELETE' });
        notice(id + ' deleted.', 'ok'); load();
      }
    } catch (err) { notice(err.message, 'error'); }
  });

  $('#search').addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { state.q = $('#search').value.trim(); state.page = 1; load(); }, 250);
  });
  $('#refreshBtn').addEventListener('click', load);
  $('#prevBtn').addEventListener('click', function () { if (state.page > 1) { state.page -= 1; load(); } });
  $('#nextBtn').addEventListener('click', function () { if (state.page < state.pages) { state.page += 1; load(); } });

  /* -------------------------------------------------------------- boot */

  (async function boot() {
    try {
      var res = await fetch('/api/admin/login', { credentials: 'same-origin' });
      var data = await res.json();
      if (!data.configured) { showGate('Admin is not configured yet. Set ADMIN_PASSWORD and SESSION_SECRET, then reload.'); return; }
      if (data.authed) showApp(); else showGate();
    } catch (e) { showGate('Could not reach the server. Is the dev server running?'); }
  })();
})();
