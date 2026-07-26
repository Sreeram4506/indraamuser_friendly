/* ==========================================================================
   Indraam admin dashboard.

   Talks to /api/admin/*. Auth is a signed HttpOnly cookie, so there is no
   token in JavaScript to steal — the browser attaches it automatically and a
   401 simply bounces us back to the sign-in view.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var loginView = $('#loginView');
  var appView = $('#appView');

  var state = { tab: 'contacts', q: '', status: '', page: 1, pages: 1, total: 0 };
  var searchTimer = null;

  /* ---------------------------------------------------------------- utils */

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function exact(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString();
  }

  function corners() {
    return '<i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>';
  }

  function notice(msg, show) {
    var el = $('#notice');
    el.textContent = msg || '';
    el.classList.toggle('u-hidden', !show);
  }

  /* ----------------------------------------------------------------- http */

  async function api(path, options) {
    var res = await fetch(path, Object.assign({
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    }, options || {}));

    if (res.status === 401) { showLogin(); throw new Error('unauthorized'); }

    var data = null;
    try { data = await res.json(); } catch (err) { data = null; }
    if (!res.ok) throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
    return data;
  }

  /* ------------------------------------------------------------------ auth */

  function showLogin() {
    loginView.hidden = false;
    appView.hidden = true;
    setTimeout(function () { $('#loginPassword').focus(); }, 30);
  }

  function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
    loadStats();
    loadRecords();
  }

  $('#loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var pw = $('#loginPassword');
    var btn = $('#loginSubmit');
    var err = $('#loginErr');

    btn.disabled = true;
    btn.textContent = 'Checking…';
    err.classList.add('u-hidden');

    try {
      var res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password: pw.value }),
      });
      var data = null;
      try { data = await res.json(); } catch (e2) { data = null; }

      if (!res.ok) {
        err.textContent = (data && data.error) || 'Could not sign in.';
        err.classList.remove('u-hidden');
        pw.select();
        return;
      }
      pw.value = '';
      showApp();
    } catch (e3) {
      err.textContent = 'Network error — is the dev server running?';
      err.classList.remove('u-hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });

  $('#logoutBtn').addEventListener('click', async function () {
    try { await fetch('/api/admin/login', { method: 'DELETE', credentials: 'same-origin' }); } catch (e) { /* ignore */ }
    showLogin();
  });

  /* ----------------------------------------------------------------- stats */

  async function loadStats() {
    try {
      var s = await api('/api/admin/data?resource=stats');
      $('#sQuestions').textContent = s.questions.toLocaleString();
      $('#sChats').textContent = s.chats.toLocaleString() + ' conversation' + (s.chats === 1 ? '' : 's');
      $('#sGaps').textContent = s.gaps.toLocaleString();
      $('#sGaps7').textContent = s.gaps7.toLocaleString() + ' in the last 7 days';
      $('#sContacts').textContent = s.contacts.toLocaleString();
      $('#sContacts24').textContent = s.contacts24.toLocaleString() + ' in the last 24 hours';
      $('#sNew').textContent = s.newContacts.toLocaleString();
    } catch (err) {
      if (err.message !== 'unauthorized') notice(err.message, true);
    }
  }

  /* --------------------------------------------------------------- renders */

  function renderContact(d) {
    var status = d.status || 'new';
    var buttons = ['new', 'read', 'replied', 'archived'].map(function (s) {
      return '<button type="button" class="statusbtn" data-id="' + esc(d._id) + '" data-status="' + s + '"'
        + ' aria-pressed="' + (status === s ? 'true' : 'false') + '">' + s + '</button>';
    }).join('');

    return '<article class="blueprint rec">' + corners()
      + '<div class="rec__head">'
        + '<span class="rec__title">' + esc(d.name) + '</span>'
        + '<span class="rec__email"><a href="mailto:' + esc(d.email) + '">' + esc(d.email) + '</a></span>'
        + '<span class="rec__spacer"></span>'
        + '<span class="pill pill--' + esc(status) + '">' + esc(status) + '</span>'
        + '<span class="rec__date" title="' + esc(exact(d.createdAt)) + '">' + esc(when(d.createdAt)) + '</span>'
      + '</div>'
      + (d.note ? '<p class="rec__note">' + esc(d.note) + '</p>' : '')
      + '<div class="rec__foot"><div class="statusbtns">' + buttons + '</div></div>'
      + '<div class="rec__meta">'
        + (d.meta && d.meta.country ? '<span>' + esc(d.meta.country) + '</span>' : '')
        + '<span>' + (d.delivered ? 'webhook delivered' : 'stored only') + '</span>'
        + (d.meta && d.meta.referrer ? '<span>from ' + esc(d.meta.referrer) + '</span>' : '')
      + '</div>'
      + '</article>';
  }

  function renderChat(d) {
    var turns = (d.messages || []).map(function (m) {
      return '<div class="turn">'
        + '<p class="turn__q">' + esc(m.question) + '</p>'
        + '<p class="turn__a' + (m.ok === false ? ' turn__a--fail' : '') + '">'
          + esc(m.ok === false ? '(the agent failed to answer)' : m.answer)
        + '</p>'
        + '</div>';
    }).join('');

    return '<article class="blueprint rec">' + corners()
      + '<div class="rec__head">'
        + '<span class="rec__title">' + (d.turns || 0) + ' question' + (d.turns === 1 ? '' : 's') + '</span>'
        + '<span class="rec__spacer"></span>'
        + (d.meta && d.meta.country ? '<span class="pill">' + esc(d.meta.country) + '</span>' : '')
        + '<span class="rec__date" title="' + esc(exact(d.updatedAt)) + '">' + esc(when(d.updatedAt)) + '</span>'
      + '</div>'
      + turns
      + '<div class="rec__meta"><span>session ' + esc(String(d.sessionId).slice(0, 8)) + '</span>'
        + '<span>started ' + esc(exact(d.createdAt)) + '</span></div>'
      + '</article>';
  }

  function renderGap(d) {
    var items = (d.gaps || []).map(function (g) {
      return '<div class="gapitem">'
        + '<div class="gapitem__saving">' + esc(g.saving) + '</div>'
        + '<div class="gapitem__title">' + esc(g.title) + '</div>'
        + '<p class="gapitem__how">' + esc(g.how) + '</p>'
        + '</div>';
    }).join('');

    return '<article class="blueprint rec">' + corners()
      + '<div class="rec__head">'
        + '<span class="rec__title">Gap run</span>'
        + '<span class="rec__spacer"></span>'
        + (d.ok === false ? '<span class="pill pill--fail">failed</span>' : '')
        + (d.meta && d.meta.country ? '<span class="pill">' + esc(d.meta.country) + '</span>' : '')
        + '<span class="rec__date" title="' + esc(exact(d.createdAt)) + '">' + esc(when(d.createdAt)) + '</span>'
      + '</div>'
      + '<p class="rec__note">' + esc(d.description) + '</p>'
      + (items ? '<div class="gaprow">' + items + '</div>' : '')
      + (d.error ? '<div class="rec__meta"><span>error: ' + esc(d.error) + '</span></div>' : '')
      + '</article>';
  }

  function emptyState() {
    var copy = {
      contacts: ['No leads yet', 'Submissions from the order-desk form land here the moment someone sends one.'],
      chats: ['No conversations yet', 'Every question a visitor asks the hero agent is recorded here, with the reply it gave.'],
      gaps: ['No gap runs yet', 'When someone describes their workflow in the AI gap finder, the run and its three results show up here.'],
    }[state.tab];
    return '<div class="empty"><div class="empty__title">' + copy[0] + '</div><p class="empty__body">' + copy[1] + '</p></div>';
  }

  /* --------------------------------------------------------------- records */

  async function loadRecords() {
    var box = $('#records');
    box.setAttribute('aria-busy', 'true');

    var params = new URLSearchParams({ resource: state.tab, page: String(state.page), limit: '20' });
    if (state.q) params.set('q', state.q);
    if (state.tab === 'contacts' && state.status) params.set('status', state.status);

    try {
      var data = await api('/api/admin/data?' + params.toString());
      notice('', false);

      state.pages = data.pages;
      state.total = data.total;

      if (!data.items.length) {
        box.innerHTML = emptyState();
      } else {
        var render = state.tab === 'contacts' ? renderContact : (state.tab === 'chats' ? renderChat : renderGap);
        box.innerHTML = data.items.map(render).join('');
      }

      var pager = $('#pager');
      pager.classList.toggle('u-hidden', data.pages <= 1);
      $('#pagerLabel').textContent = 'Page ' + data.page + ' of ' + data.pages + ' · ' + data.total + ' record' + (data.total === 1 ? '' : 's');
      $('#prevBtn').disabled = data.page <= 1;
      $('#nextBtn').disabled = data.page >= data.pages;
    } catch (err) {
      if (err.message === 'unauthorized') return;
      box.innerHTML = '';
      notice(err.message, true);
      $('#pager').classList.add('u-hidden');
    } finally {
      box.removeAttribute('aria-busy');
    }
  }

  /* ---------------------------------------------------------------- events */

  $$('#tabs .chip').forEach(function (tab) {
    tab.addEventListener('click', function () {
      $$('#tabs .chip').forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-pressed', on ? 'true' : 'false');
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      state.tab = tab.getAttribute('data-tab');
      state.page = 1;
      $('#statusFilter').classList.toggle('u-hidden', state.tab !== 'contacts');
      $('#exportBtn').href = '/api/admin/export?resource=' + state.tab;
      loadRecords();
    });
  });

  $('#search').addEventListener('input', function (e) {
    clearTimeout(searchTimer);
    var value = e.target.value;
    searchTimer = setTimeout(function () {
      state.q = value.trim();
      state.page = 1;
      loadRecords();
    }, 300);
  });

  $('#statusFilter').addEventListener('change', function (e) {
    state.status = e.target.value;
    state.page = 1;
    loadRecords();
  });

  $('#refreshBtn').addEventListener('click', function () { loadStats(); loadRecords(); });
  $('#prevBtn').addEventListener('click', function () { if (state.page > 1) { state.page--; loadRecords(); } });
  $('#nextBtn').addEventListener('click', function () { if (state.page < state.pages) { state.page++; loadRecords(); } });

  // Status buttons are re-rendered constantly, so listen on the container.
  $('#records').addEventListener('click', async function (e) {
    var btn = e.target.closest('.statusbtn');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    var status = btn.getAttribute('data-status');

    // Optimistic — the row updates immediately, then we reconcile.
    var group = btn.parentElement;
    $$('.statusbtn', group).forEach(function (b) {
      b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
    });

    try {
      await api('/api/admin/data', {
        method: 'PATCH',
        body: JSON.stringify({ resource: 'contacts', id: id, status: status }),
      });
      loadStats();
      loadRecords();
    } catch (err) {
      if (err.message !== 'unauthorized') { notice(err.message, true); loadRecords(); }
    }
  });

  /* ------------------------------------------------------------------ boot */

  (async function init() {
    $('#exportBtn').href = '/api/admin/export?resource=' + state.tab;
    try {
      var res = await fetch('/api/admin/login', { credentials: 'same-origin' });
      var data = await res.json();
      if (data && data.authed) showApp();
      else showLogin();
    } catch (err) {
      showLogin();
    }
  })();

})();
