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
      name: 'AI Assistants', tag: 'Works on its own',
      what: 'A smart assistant that looks at your information, makes a decision, and takes the next step for you — no one has to babysit it. Every action it takes is checked and written down, so you always know what happened and why.',
      deliver: ['An assistant connected to your inbox, tools and customer records', 'Safety checks — and a human approval step where it matters', 'A clear record of every action it takes']
    },
    {
      name: 'Automation', tag: 'Runs by itself',
      what: 'We find the repetitive, everyday tasks your team keeps doing by hand and make them happen automatically. Something comes in, the right thing gets done, and it gets logged — no person needed.',
      deliver: ['Repetitive tasks handled start to finish, automatically', 'Problems get flagged and sent to the right person', 'A simple dashboard showing what ran and what happened']
    },
    {
      name: 'Websites & Apps', tag: 'Built to last',
      what: "We design and build your website or app from the ground up — everything you see, and everything working behind the scenes to make it run. Built to grow as your business does, and it's fully yours when we hand it over.",
      deliver: ['A website or app that works on desktop and mobile', 'A solid setup that can handle more users and data over time', 'Everything handed over clean — the code, instructions and access']
    },
    {
      name: 'Design', tag: 'Easy to use',
      what: 'We design how your product looks and feels — starting as a simple sketch and turning it into a finished, polished design. Fast to use, easy to understand, and tested with real people doing real tasks.',
      deliver: ['A rough sketch turned into a full, ready-to-build design', 'Designs tested with real people before anything gets built', 'A finished look and feel, ready to hand to development']
    },
    {
      name: 'Voice & Chat', tag: 'Talks to your customers',
      what: 'A phone or chat assistant that answers your customers right away — it listens, understands what they need, and replies in a tone that sounds like your business, not a robot.',
      deliver: ['A phone or chat assistant that books, reschedules and answers questions', 'Answers based on your own information — not generic guesses', 'Tested for accuracy and tone before it ever talks to a customer']
    },
    {
      name: 'Data & Reports', tag: 'Everything in one place',
      what: "We pull your information together from wherever it lives, clean it up, and turn it into simple dashboards and reports that update on their own — so you always know what's going on without digging for it.",
      deliver: ['All your information brought together in one place', 'Dashboards and reports that update automatically', 'Clean, organized data that anything you build next can use']
    }
  ];

  var INDUSTRIES = [
    { name: 'Healthcare', tag: 'Keeps patient data private', body: 'Software for clinics and care teams where privacy and careful record-keeping really matter — built to pass a real compliance check, not just look good in a demo.', plays: ['Automatic appointment booking and no-show reminders', 'A chat assistant trained on your own procedures, so answers stay accurate', 'Dashboards and record-keeping that follow healthcare privacy rules'] },
    { name: 'Finance', tag: 'Every step logged', body: 'Tools that track every decision they make. Assistants that double-check numbers, flag anything unusual, and draft reports — with a person signing off wherever money moves.', plays: ['Automatic bookkeeping checks and error flagging', 'Pulling the key details out of statements and forms', 'Reports that write their own plain-English summary'] },
    { name: 'Retail & ecommerce', tag: 'Drives more sales', body: 'From watching competitor prices to answering customer questions instantly — AI built into how you sell and how you talk to customers.', plays: ['Tracking competitor prices and product selection automatically', 'A chat assistant that answers product questions using your own catalog', 'Faster handling of returns and refunds'] },
    { name: 'Logistics', tag: 'Keeps shipments moving', body: 'The behind-the-scenes work that keeps freight moving — orders, hiccups and status updates handled before anyone has to chase them down.', plays: ['Automatic order handling and exception alerts', 'Assistants that track shipments and answer "where is it" questions', 'Matching carrier invoices to what was actually shipped'] },
    { name: 'PropTech', tag: 'Handles the paperwork', body: 'Leases, listings and maintenance requests turned from stacks of PDFs into organized, searchable information you can actually use.', plays: ['Pulling key details out of leases and documents automatically', 'Generating property listings in your own voice', 'Sorting and routing maintenance requests to the right person'] },
    { name: 'EdTech', tag: 'Scales with more students', body: 'Academic operations that keep up as you grow — question papers, dashboards, and one clear picture instead of scattered spreadsheets and systems.', plays: ['Generating question papers and course content automatically', 'Easy-to-read dashboards for school or college operations', 'One combined view of all your academic data'] },
    { name: 'Manufacturing', tag: 'Watches the line', body: 'Camera and sensor-based tools on the factory floor — automatic quality checks on the line, and clear reports turning machine data into decisions.', plays: ['Automatic visual quality checks on the production line', 'Reports on downtime and output', 'Automated alerts for maintenance and supply needs'] },
    { name: 'Travel', tag: 'Available around the clock', body: 'The booking, the inbox and the front desk — voice and chat assistants that book, reschedule and answer questions any time of day.', plays: ['Voice assistants that book and reschedule trips', 'Support chat that works in multiple languages', 'Automatic itinerary updates and back-office tasks'] }
  ];

  var JOURNEYS = [
    { title: 'From idea to a working prototype in weeks', body: "You already know what you want to build and have the go-ahead. We keep the scope tight, pick the right approach, and put a working version in your hands fast.", cta: 'Start with discovery', steps: ['A discovery session to nail down what it needs to do and any limits we\'re working within', 'A short written plan covering our approach and what we\'ll test for', 'A working version built on real data, checked against what you actually need', 'A clear roadmap to full launch, with dates you can count on'] },
    { title: 'Take a working idea and make it production-ready', body: "It works as a demo — now it needs to hold up with real traffic, real data and real customers. We strengthen it, test it thoroughly, and launch it properly.", cta: 'Scope the scale-up', steps: ['Review what you have now and find where it could break', 'Add testing, safety checks and ongoing monitoring', 'Rebuild the parts that need to be faster or handle more load', 'Roll it out gradually and track how well it performs'] },
    { title: 'Add an AI feature without breaking what already works', body: 'You have a product and real users already. We add AI as one feature at a time — designed, tested, and easy to undo — not a risky overhaul of everything.', cta: 'Plan the feature', steps: ['Find the one feature that would help the most, and plan around it safely', 'Build a working version inside your existing product', 'Test it with a small group before rolling it out to everyone', 'Document everything and hand it over clean'] },
    { title: 'Get a stalled AI project moving again', body: "The demo looked great, then progress stopped. We find out what's actually holding it back — the data, the testing, the setup, or just too much scope — and get it launched.", cta: 'Get unblocked', steps: ['A quick review to find exactly what\'s blocking the launch', 'Trim the scope down to a version we can ship now', 'Fix whatever gap is actually holding it back', 'Launch it, measure the results, then keep improving it'] }
  ];

  var CHAT_SCRIPT = [
    { q: 'Do you build AI chatbots for customer support?', a: 'Yes — chat and voice assistants trained on your own documents, with safety checks built in. Most go live in about two weeks.' },
    { q: 'Can you automate our invoice and email workflows?', a: "That's our automation service: something comes in, gets handled, and gets logged — no person needed. We map it out during discovery, then build it." },
    { q: 'What does a project cost, and who owns the code?', a: 'Fixed-scope builds are priced from a written plan — and you own all the code, docs and setup once we hand it over. Book a call and we\'ll scope yours.' }
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
     EmailJS — best-effort extra notification for the contact form.
     The /api/contact backend already persists every lead to the admin
     dashboard regardless, so a failure here is logged and swallowed
     rather than shown to the visitor.
     ================================================================== */

  function sendWithEmailJs(formType, templateParams) {
    var cfg = window.INDRAAM_EMAILJS_CONFIG;
    var formCfg = cfg && cfg[formType];
    if (!cfg || !formCfg || !cfg.publicKey || !formCfg.serviceId || !formCfg.templateId || typeof emailjs === 'undefined') {
      return;
    }
    try {
      emailjs.init(cfg.publicKey);
      emailjs.send(formCfg.serviceId, formCfg.templateId, templateParams).catch(function (err) {
        console.error('EmailJS send failed:', err);
      });
    } catch (err) {
      console.error('EmailJS init failed:', err);
    }
  }

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

      sendWithEmailJs('contact', {
        form_type: 'Indraam Contact Form',
        submitted_at: new Date().toLocaleString(),
        name: name,
        email: email,
        subject: 'New message from indraam.com',
        message: note || 'No additional notes provided.',
        reply_to: email
      });

      form.classList.add('u-hidden');
      done.classList.remove('u-hidden');
    });
  })();

})();
