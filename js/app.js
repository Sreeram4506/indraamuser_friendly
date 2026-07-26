/* ==========================================================================
   Indraam landing page — behaviour
   Vanilla ES2019+. No build step, no dependencies.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Config — point these at your backend to switch the two AI surfaces
     (hero agent + gap finder) from "offline" to live. See README.md for
     the request/response contract. Leave null to run without a backend:
     the UI degrades to the same copy the prototype shows on failure.
     ------------------------------------------------------------------ */
  window.INDRAAM_CONFIG = window.INDRAAM_CONFIG || {};
  var CONFIG = Object.assign({
    agentEndpoint: null,   // e.g. '/api/agent'
    gapEndpoint: null,     // e.g. '/api/gaps'
    contactEndpoint: null  // e.g. '/api/contact'
  }, window.INDRAAM_CONFIG);

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* Per-tab id so the admin view can group turns into one conversation. It
     identifies the browser tab, not the person: it lives in sessionStorage,
     so it dies when the tab closes and never follows anyone between visits. */
  var SESSION_ID = (function () {
    try {
      var k = 'indraam.sid';
      var v = sessionStorage.getItem(k);
      if (!v) {
        v = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem(k, v);
      }
      return v;
    } catch (err) {
      return null; // private mode / storage blocked — logging just degrades
    }
  })();

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MOTION = !REDUCED;
  var MOBILE_Q = window.matchMedia('(max-width: 819px)');

  /* ==================================================================
     Content
     ================================================================== */

  var SERVICES = [
    {
      name: 'Agentic AI', tag: 'Autonomous systems',
      what: 'Agents that read your data, decide, and take action across your tools — the ring at the center reasons, the nodes are the systems it drives. Every step runs behind guardrails and an audit trail.',
      deliver: ['Multi-step agents wired to your APIs, CRM and inbox', 'Guardrails, evals and human sign-off gates', 'A decision audit log for every action taken']
    },
    {
      name: 'Automation', tag: 'Workflow pipelines',
      what: 'The repetitive work mapped, then removed — watch a task flow through trigger, route, process and log without a person touching it. CRM, ops and back-office flows, handled.',
      deliver: ['Trigger → route → process → log pipelines', 'Exception handling with escalation rules', 'Full run logs and status dashboards']
    },
    {
      name: 'Web & mobile', tag: 'Full-stack build',
      what: 'Full product engineering on a modern stack — the frame assembles the UI, the API and the data layer, block by block. React, Node, Python, your cloud, handed over clean.',
      deliver: ['Web and mobile apps on your stack', 'API and data layer built to scale', 'Clean handover: code, docs, infra']
    },
    {
      name: 'Product & UI/UX', tag: 'Design to ship',
      what: 'Interfaces designed like instruments — watch a wireframe resolve into a shipped, hi-fi product. Fast, legible, and measured against how people actually use them.',
      deliver: ['Wireframes → hi-fi design system', 'Prototypes tested against real tasks', 'Production-ready, componentized front end']
    },
    {
      name: 'Voice & chat', tag: 'Conversational agents',
      what: 'Low-latency voice and RAG-grounded chat — the mic listens, the waveform responds, the reply lands. Persona, tone and evals, shipped into customer-facing production.',
      deliver: ['Voice agents that book, re-book and answer', 'RAG chat grounded in your knowledge base', 'Persona, tone and safety evals']
    },
    {
      name: 'Data & analytics', tag: 'The foundation',
      what: 'The plumbing under the AI — the scan line reads your sources, the bars are live throughput. Multi-source ingest, warehouse modeling and self-updating dashboards.',
      deliver: ['Multi-source ingest and warehouse modeling', 'Self-updating operational dashboards', 'AI-ready, clean data foundation']
    }
  ];

  var INDUSTRIES = [
    { name: 'Healthcare', tag: 'HIPAA-aware', body: 'Clinical and operational software where privacy and audit trails are non-negotiable — built to survive a compliance review, not just a demo.', plays: ['Intake, scheduling and no-show automation', 'RAG assistants grounded in your protocols', 'HIPAA-aware data pipelines and dashboards'] },
    { name: 'Finance', tag: 'Auditable', body: 'Decision systems with every step logged. Agents that reconcile, flag and draft — with a human sign-off gate wherever money moves.', plays: ['Reconciliation and exception routing', 'Document extraction from statements and forms', 'Reporting that writes its own commentary'] },
    { name: 'Retail & ecommerce', tag: 'Revenue-facing', body: 'From competitor-price intelligence to support deflection — AI wired into merchandising and the customer conversation.', plays: ['Competitor pricing and assortment intel', 'Product-question chat trained on your catalog', 'Returns and refund triage'] },
    { name: 'Logistics', tag: 'Operational', body: 'The back office that keeps freight moving — orders, exceptions and status chase handled before a human is needed.', plays: ['Order and exception automation', 'Track-and-trace status agents', 'Carrier and invoice reconciliation'] },
    { name: 'PropTech', tag: 'Document-heavy', body: 'Leases, listings and maintenance turned from PDF piles into structured, queryable, action-ready data.', plays: ['Lease and document extraction', 'Listing generation on your tone', 'Maintenance-request triage and routing'] },
    { name: 'EdTech', tag: 'Content-scale', body: 'Academic operations at scale — question papers, dashboards and one warehouse behind fragmented systems.', plays: ['Question-paper and content generation', 'PowerBI / Fabric operational dashboards', 'Unified academic data warehouse'] },
    { name: 'Manufacturing', tag: 'Edge + cloud', body: 'Vision and data systems on the floor — quality QA at the line, and the pipelines that turn machine data into decisions.', plays: ['Vision QA at the line', 'Downtime and yield analytics', 'Maintenance and supply-chain automation'] },
    { name: 'Travel', tag: 'Customer-facing', body: 'The itinerary, the inbox and the front desk — voice and chat agents that book, re-book and answer around the clock.', plays: ['Booking and re-booking voice agents', 'Multilingual support chat', 'Itinerary and ops automation'] }
  ];

  var JOURNEYS = [
    { title: 'From idea to a working prototype in weeks', body: 'You have the use case and the buy-in. We scope tightly, choose the right model and architecture, and put a working prototype in your hands fast.', cta: 'Start with discovery', steps: ['Discovery workshop — surface the data, metric and constraints', 'Architecture decision doc — model, infra, eval strategy', 'Working prototype on real data, measured against your metric', 'A roadmap to production with dates you can defend'] },
    { title: 'Take a proof-of-concept to production scale', body: 'It works in the notebook — now it needs to survive real load, real data and real users. We harden, evaluate and deploy it properly.', cta: 'Scope the scale-up', steps: ['Audit the current model, data and failure modes', 'Add evals, guardrails and monitoring', 'Re-architect serving for latency and cost', 'Roll out behind flags and measure against SLOs'] },
    { title: 'Ship an AI feature without breaking what works', body: 'You have a product and users. We slot AI in as a feature — designed, evaluated and reversible — not a risky rewrite.', cta: 'Plan the feature', steps: ['Map the highest-leverage feature and its guardrails', 'Prototype inside your existing stack', 'A/B and eval before it reaches everyone', 'Instrument, document and hand over'] },
    { title: 'Unblock a stalled AI project and get it live', body: 'The demo impressed, then it stalled. We find what’s actually blocking it — data, evals, infra or scope — and get it to production.', cta: 'Get unblocked', steps: ['Rapid diagnostic on what’s blocking release', 'Cut scope to a shippable v1', 'Fix the eval, data or infra gap', 'Ship, measure, then extend'] }
  ];

  var CHAT_SCRIPT = [
    { q: 'Do you build AI chatbots for customer support?', a: 'Yes — RAG-grounded chat and voice agents, trained on your own docs and shipped with guardrails. Most go live in about two weeks.' },
    { q: 'Can you automate our invoice and email workflows?', a: 'That’s our automation service: trigger → route → process → log, no human in the loop. We map it in discovery, then build it.' },
    { q: 'What does a project cost, and who owns the code?', a: 'Fixed-scope builds are priced from the spec — and you own all code, docs and infra on handover. Book a call and we’ll scope yours.' }
  ];

  var OFFLINE_REPLY = 'I’m offline right now — but a human isn’t. Use "Book a call" above and the team will answer directly.';

  var TICK_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-300)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ==================================================================
     Boot curtain
     ================================================================== */

  (function boot() {
    var el = $('#boot');
    if (!el) return;
    if (!MOTION) { el.style.display = 'none'; return; }
    setTimeout(function () { el.style.display = 'none'; }, 2000);
  })();

  /* ==================================================================
     Scroll reveal
     ================================================================== */

  (function reveal() {
    var els = $$('[data-reveal]');
    if (!els.length) return;

    var show = function (el) { el.classList.add('is-in'); };

    if (!MOTION || !('IntersectionObserver' in window)) {
      els.forEach(show);
      return;
    }

    var pending = new Set(els);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        show(en.target);
        pending.delete(en.target);
        io.unobserve(en.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    els.forEach(function (el) { io.observe(el); });

    // Safety net: anything already within a screen of the fold reveals even
    // if the observer misses it (Safari occasionally does on first paint).
    var check = function () {
      var vh = window.innerHeight || document.documentElement.clientHeight;
      Array.from(pending).forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < vh * 0.94 && r.bottom > 0) { show(el); pending.delete(el); io.unobserve(el); }
      });
      if (!pending.size) {
        window.removeEventListener('scroll', check);
        window.removeEventListener('resize', check);
      }
    };
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    setTimeout(check, 350);
    setTimeout(check, 1000);
  })();

  /* ==================================================================
     Scroll progress bar + hero arc parallax
     ================================================================== */

  (function scrollFx() {
    var bar = $('#navProgress');
    var arc = $('#heroArc');
    if (!bar && !arc) return;

    var ticking = false;
    var apply = function () {
      ticking = false;
      var el = document.scrollingElement || document.documentElement;
      var top = el.scrollTop || window.scrollY || 0;
      var max = (el.scrollHeight - el.clientHeight) || 1;
      if (bar) bar.style.width = Math.min(100, Math.max(0, (top / max) * 100)) + '%';
      if (arc && MOTION) arc.style.transform = 'translate3d(0,' + (top * 0.14) + 'px,0)';
    };
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    };

    document.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    apply();
  })();

  /* ==================================================================
     Hero stat counters
     ================================================================== */

  (function stats() {
    var nodes = $$('[data-stat-end]');
    if (!nodes.length) return;

    var targets = nodes.map(function (n) {
      return { el: n, end: parseFloat(n.getAttribute('data-stat-end')) || 0, suffix: n.getAttribute('data-stat-suffix') || '' };
    });

    if (!MOTION) return; // markup already carries the final values

    targets.forEach(function (t) { t.el.textContent = '0' + t.suffix; });

    var dur = 1100;
    var t0 = performance.now();
    var tick = function (now) {
      var p = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      targets.forEach(function (t) { t.el.textContent = Math.round(t.end * e) + t.suffix; });
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })();

  /* ==================================================================
     Hero crosshair (fine pointers only)
     ================================================================== */

  (function crosshair() {
    var hero = $('#hero');
    var wrap = $('#heroCross');
    if (!hero || !wrap || !MOTION) return;
    if (!window.matchMedia('(pointer:fine)').matches) return;

    var v = $('#crossV'), h = $('#crossH'), dot = $('#crossDot'), lab = $('#crossLabel');
    var pad = function (n) { return String(n).padStart(3, '0'); };

    hero.addEventListener('mousemove', function (e) {
      var r = hero.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      v.style.left = x + 'px';
      h.style.top = y + 'px';
      dot.style.left = x + 'px'; dot.style.top = y + 'px';
      lab.style.left = x + 'px'; lab.style.top = y + 'px';
      lab.textContent = 'X ' + pad(Math.round(x)) + ' · Y ' + pad(Math.round(y));
    });
    hero.addEventListener('mouseenter', function () { wrap.style.opacity = '1'; });
    hero.addEventListener('mouseleave', function () { wrap.style.opacity = '0'; });
  })();

  /* ==================================================================
     Mobile navigation
     ================================================================== */

  (function nav() {
    var toggle = $('#navToggle');
    var drawer = $('#navDrawer');
    if (!toggle || !drawer) return;

    var setOpen = function (open) {
      drawer.classList.toggle('u-hidden', !open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    toggle.addEventListener('click', function () {
      setOpen(drawer.classList.contains('u-hidden'));
    });
    $$('a', drawer).forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });
    var onBreakpoint = function (e) { if (!e.matches) setOpen(false); };
    if (MOBILE_Q.addEventListener) MOBILE_Q.addEventListener('change', onBreakpoint);
    else if (MOBILE_Q.addListener) MOBILE_Q.addListener(onBreakpoint);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  })();

  /* ==================================================================
     Hero agent chat — scripted demo, then live takeover
     ================================================================== */

  (function chat() {
    var log = $('#chatLog');
    var form = $('#chatForm');
    var input = $('#chatInput');
    var ghost = $('#chatGhost');
    var takeoverBtn = $('#chatTakeover');
    if (!log || !form || !input) return;

    var demoRunning = true;   // scripted loop owns the panel
    var demoAlive = true;     // set false the moment the visitor takes over
    var busy = false;         // an live request is in flight
    var history = [];
    var typingEl = null;

    function bubble(role, text) {
      var row = document.createElement('div');
      row.className = 'msg msg--' + (role === 'u' ? 'user' : 'agent');
      var b = document.createElement('div');
      b.className = 'msg__bubble';
      b.textContent = text;
      row.appendChild(b);
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
      return b;
    }

    function clearLog() { log.innerHTML = ''; typingEl = null; }

    function setTyping(on) {
      if (on) {
        if (typingEl) return;
        typingEl = document.createElement('div');
        typingEl.className = 'typing';
        typingEl.innerHTML = '<div class="typing__dots"><span></span><span></span><span></span></div>';
        log.appendChild(typingEl);
        log.scrollTop = log.scrollHeight;
      } else if (typingEl) {
        typingEl.remove();
        typingEl = null;
      }
    }

    function setGhost(text) {
      if (!ghost) return;
      if (!text) { ghost.innerHTML = ''; return; }
      ghost.innerHTML = esc(text) + '<span class="chatcard__caret"></span>';
    }

    /* --- scripted demo loop --- */
    async function runDemo() {
      while (demoAlive) {
        clearLog();
        setGhost('');
        await sleep(1200);
        for (var i = 0; i < CHAT_SCRIPT.length; i++) {
          var qa = CHAT_SCRIPT[i];
          if (!demoAlive) return;
          for (var c = 1; c <= qa.q.length; c++) {
            if (!demoAlive) return;
            setGhost(qa.q.slice(0, c));
            await sleep(26);
          }
          await sleep(400);
          if (!demoAlive) return;
          setGhost('');
          bubble('u', qa.q);
          setTyping(true);
          await sleep(1100);
          if (!demoAlive) return;
          setTyping(false);
          var el = bubble('a', '');
          for (var k = 2; k <= qa.a.length; k += 2) {
            if (!demoAlive) return;
            el.textContent = qa.a.slice(0, k);
            log.scrollTop = log.scrollHeight;
            await sleep(18);
          }
          el.textContent = qa.a;
          await sleep(2600);
        }
        await sleep(2000);
      }
    }

    function renderStatic() {
      clearLog();
      CHAT_SCRIPT.forEach(function (qa) { bubble('u', qa.q); bubble('a', qa.a); });
    }

    /* --- live takeover --- */
    function takeOver() {
      if (!demoRunning) { input.focus(); return; }
      demoRunning = false;
      demoAlive = false;
      clearLog();
      setGhost('');
      input.placeholder = 'Have a question? Type here…';
      if (takeoverBtn) takeoverBtn.classList.add('u-hidden');
      setTimeout(function () { input.focus(); }, 30);
    }

    async function askAgent(question) {
      history.push({ role: 'user', content: question });
      if (!CONFIG.agentEndpoint) return OFFLINE_REPLY;
      try {
        var res = await fetch(CONFIG.agentEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history.slice(-12), sessionId: SESSION_ID })
        });
        if (!res.ok) throw new Error('http ' + res.status);
        var data = await res.json();
        var reply = (data && (data.reply || data.text || data.content)) || '';
        if (!reply) throw new Error('empty');
        return reply;
      } catch (err) {
        return OFFLINE_REPLY;
      }
    }

    async function ask(question) {
      busy = true;
      bubble('u', question);
      input.value = '';
      setTyping(true);

      var answer = await askAgent(question);
      history.push({ role: 'assistant', content: answer });

      setTyping(false);
      var el = bubble('a', '');
      if (MOTION) {
        for (var i = 3; i <= answer.length; i += 3) {
          el.textContent = answer.slice(0, i);
          log.scrollTop = log.scrollHeight;
          await sleep(12);
        }
      }
      el.textContent = answer;
      log.scrollTop = log.scrollHeight;
      busy = false;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (demoRunning) takeOver();
      var q = input.value.trim();
      if (!q || busy) return;
      ask(q);
    });
    input.addEventListener('focus', takeOver);
    input.addEventListener('input', function () { if (demoRunning) takeOver(); });
    if (takeoverBtn) takeoverBtn.addEventListener('click', takeOver);

    if (MOTION) runDemo();
    else { demoAlive = false; renderStatic(); }
  })();

  /* ==================================================================
     Services — chips, auto-advance, panel swap
     ================================================================== */

  (function services() {
    var chips = $$('#serviceChips .chip');
    var panel = $('#servicePanel');
    var segs = $$('#serviceSegs .panel__seg');
    var vizzes = $$('#serviceStage .viz');
    var elStep = $('#serviceStep');
    var elTag = $('#serviceTag');
    var elName = $('#serviceName');
    var elWhat = $('#serviceWhat');
    var elDeliver = $('#serviceDeliver');
    if (!chips.length || !panel) return;

    var current = 0;
    var interacted = false;
    var timer = null;

    function render(i) {
      var d = SERVICES[i];
      chips.forEach(function (c, n) {
        c.setAttribute('aria-pressed', n === i ? 'true' : 'false');
        c.setAttribute('aria-selected', n === i ? 'true' : 'false');
      });
      segs.forEach(function (s, n) { s.classList.toggle('is-on', n === i); });
      vizzes.forEach(function (v, n) { v.classList.toggle('is-on', n === i); });
      elStep.textContent = '0' + (i + 1) + ' / 06';
      elTag.textContent = d.tag;
      elName.textContent = d.name;
      elWhat.textContent = d.what;
      elDeliver.innerHTML = d.deliver.map(function (t) {
        return '<div class="tick">' + TICK_SVG + '<span>' + esc(t) + '</span></div>';
      }).join('');
    }

    function goto(i) {
      if (i === current) return;
      current = i;
      render(i);
      if (!MOTION) return;
      panel.style.animation = 'none';
      void panel.offsetWidth;
      panel.style.animation = 'riseIn .55s cubic-bezier(.22,.7,.25,1) both';
    }

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        interacted = true;
        if (timer) { clearInterval(timer); timer = null; }
        goto(parseInt(chip.getAttribute('data-index'), 10) || 0);
      });
    });

    render(0);

    if (MOTION) {
      timer = setInterval(function () {
        if (interacted) return;
        goto((current + 1) % SERVICES.length);
      }, 6000);
    }
  })();

  /* ==================================================================
     Industries
     ================================================================== */

  (function industries() {
    var chips = $$('#industryChips .chip');
    var elTag = $('#industryTag');
    var elName = $('#industryName');
    var elBody = $('#industryBody');
    var elPlays = $('#industryPlays');
    if (!chips.length || !elPlays) return;

    function render(i) {
      var d = INDUSTRIES[i];
      chips.forEach(function (c, n) {
        c.setAttribute('aria-pressed', n === i ? 'true' : 'false');
        c.setAttribute('aria-selected', n === i ? 'true' : 'false');
      });
      elTag.textContent = d.tag;
      elName.textContent = d.name;
      elBody.textContent = d.body;
      elPlays.innerHTML = d.plays.map(function (t) {
        return '<div class="tick tick--bare">' + TICK_SVG + '<span>' + esc(t) + '</span></div>';
      }).join('');
    }

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        render(parseInt(chip.getAttribute('data-index'), 10) || 0);
      });
    });
  })();

  /* ==================================================================
     AI journey
     ================================================================== */

  (function journey() {
    var chips = $$('#journeyChips .chip');
    var elTitle = $('#journeyTitle');
    var elBody = $('#journeyBody');
    var elCta = $('#journeyCta');
    var elSteps = $('#journeySteps');
    if (!chips.length || !elSteps) return;

    function render(i) {
      var d = JOURNEYS[i];
      chips.forEach(function (c, n) {
        c.setAttribute('aria-pressed', n === i ? 'true' : 'false');
        c.setAttribute('aria-selected', n === i ? 'true' : 'false');
      });
      elTitle.textContent = d.title;
      elBody.textContent = d.body;
      elCta.textContent = d.cta;
      elSteps.innerHTML = d.steps.map(function (t, n) {
        return '<div class="numstep"><span class="numstep__n">' + (n + 1) + '</span><span class="numstep__t">' + esc(t) + '</span></div>';
      }).join('');
    }

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        render(parseInt(chip.getAttribute('data-index'), 10) || 0);
      });
    });
  })();

  /* ==================================================================
     AI gap finder
     ================================================================== */

  (function gaps() {
    var form = $('#gapForm');
    var input = $('#gapInput');
    var cta = $('#gapCta');
    var errEl = $('#gapErr');
    var out = $('#gapResults');
    if (!form || !input) return;

    var busy = false;
    var FALLBACK_ERR = 'Couldn’t map that one automatically — book a call and we’ll do it with you, live.';

    $$('#gapExamples .gapform__example').forEach(function (b) {
      b.addEventListener('click', function () {
        input.value = b.textContent.trim();
        input.focus();
      });
    });

    function showErr(msg) {
      errEl.textContent = msg;
      errEl.classList.toggle('u-hidden', !msg);
    }

    function showResults(list) {
      if (!list || !list.length) { out.classList.add('u-hidden'); out.innerHTML = ''; return; }
      out.innerHTML = list.slice(0, 3).map(function (g) {
        return '<div class="blueprint gapcard">' +
          '<i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>' +
          '<div class="gapcard__saving">' + esc(g.saving || '') + '</div>' +
          '<h4>' + esc(g.title || '') + '</h4>' +
          '<p>' + esc(g.how || '') + '</p>' +
          '</div>';
      }).join('');
      out.classList.remove('u-hidden');
    }

    function setBusy(on) {
      busy = on;
      cta.disabled = on;
      cta.textContent = on ? 'Mapping…' : 'Find my AI gaps';
    }

    async function run(description) {
      setBusy(true);
      showErr('');
      showResults(null);

      if (!CONFIG.gapEndpoint) {
        await sleep(600);
        setBusy(false);
        showErr(FALLBACK_ERR);
        return;
      }

      try {
        var res = await fetch(CONFIG.gapEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: description, sessionId: SESSION_ID })
        });
        if (!res.ok) throw new Error('http ' + res.status);
        var data = await res.json();
        var list = Array.isArray(data) ? data : (data && data.gaps);
        list = (list || []).filter(function (g) { return g && g.title; });
        if (!list.length) throw new Error('empty');
        setBusy(false);
        showResults(list);
      } catch (err) {
        setBusy(false);
        showErr(FALLBACK_ERR);
      }
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      var d = input.value.trim();
      if (d.length < 12) {
        showResults(null);
        showErr('Add a sentence or two about the team or workflow.');
        return;
      }
      run(d);
    });
  })();

  /* ==================================================================
     FAQ accordion
     ================================================================== */

  (function faq() {
    var items = $$('#faqList .faq__item');
    if (!items.length) return;

    items.forEach(function (item) {
      var btn = $('.faq__q', item);
      var sym = $('.faq__sym', item);
      btn.addEventListener('click', function () {
        var willOpen = !item.classList.contains('is-open');
        items.forEach(function (other) {
          other.classList.remove('is-open');
          $('.faq__q', other).setAttribute('aria-expanded', 'false');
          $('.faq__sym', other).textContent = '+';
        });
        if (willOpen) {
          item.classList.add('is-open');
          btn.setAttribute('aria-expanded', 'true');
          sym.textContent = '−';
        }
      });
    });
  })();

  /* ==================================================================
     Contact form
     ================================================================== */

  (function contact() {
    var form = $('#contactForm');
    var done = $('#contactDone');
    var errEl = $('#cErr');
    if (!form || !done) return;

    var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

    function showErr(msg) {
      errEl.textContent = msg;
      errEl.classList.toggle('u-hidden', !msg);
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var name = $('#cName').value.trim();
      var email = $('#cEmail').value.trim();
      var note = $('#cNote').value.trim();

      if (!name) { showErr('Add your name so we know who to reply to.'); return; }
      if (!EMAIL.test(email)) { showErr('Enter a valid work email.'); return; }
      showErr('');

      if (CONFIG.contactEndpoint) {
        try {
          await fetch(CONFIG.contactEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, email: email, note: note, sessionId: SESSION_ID })
          });
        } catch (err) {
          showErr('That didn’t send — email us at hello@indraam.com and we’ll pick it up.');
          return;
        }
      }

      form.classList.add('u-hidden');
      done.classList.remove('u-hidden');
    });
  })();

})();
