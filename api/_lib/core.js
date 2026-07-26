/* ==========================================================================
   Endpoint logic, kept separate from the hosting adapter so the same code
   runs behind a Vercel handler, a Netlify function or an Express route.

   Each function takes the parsed request body and resolves to
   { status, payload } — never throws for expected failure modes.
   ========================================================================== */

const { chat, UpstreamError } = require('./openai');
const { logChatTurn, logGapRun, logContact } = require('./db');

/* --- limits ------------------------------------------------------------- */
const MAX_TURNS = 12;        // conversation window sent upstream
const MAX_CHARS = 1200;      // per message
const MAX_DESC = 600;        // gap-finder description (matches the textarea)

/* --- prompts ------------------------------------------------------------ */

const AGENT_SYSTEM = [
  'You are the Indraam agent on indraam.com, the site of Indraam — a US-based creative and',
  'engineering studio that designs and ships agentic AI systems, automation workflows, web and',
  'mobile applications, UI/UX and premium digital products. Engagements: fixed-scope builds',
  '(spec, price, date) or monthly retainers; working demo in ~2 weeks; clients own everything',
  'handed over. Answer visitor questions briefly (2-3 sentences max), concretely and in a calm,',
  'technical voice. When relevant, suggest booking a call via the "Book a call" button. Stay on',
  'topic: Indraam services, automation, agentic AI, process. If asked something unrelated,',
  'politely steer back.',
].join(' ');

const GAP_SYSTEM = [
  'You are Indraam’s automation-scoping agent. Given a short description of a team or workflow,',
  'identify exactly three concrete, distinct places AI or automation could cut their workload.',
  'Respond ONLY with a JSON object of the form {"gaps":[...]} containing exactly 3 items, each:',
  '{"saving":"short outcome e.g. ~60% fewer tickets or Hours → minutes","title":"3-6 word name',
  'of the gap","how":"one sentence, max 24 words, on how Indraam would close it"}.',
  'No prose, no markdown, no code fences.',
].join(' ');

/* --- helpers ------------------------------------------------------------ */

function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return null;
  const out = raw
    .filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_CHARS) }))
    .filter((m) => m.content.length > 0);
  return out.length ? out : null;
}

function str(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function fail(err) {
  const status = err instanceof UpstreamError ? err.status : 500;
  if (!(err instanceof UpstreamError)) console.error('[indraam api]', err);
  else console.warn('[indraam api]', err.message);
  // The client shows its own offline copy on any non-2xx, so the message here
  // is for your logs and for anyone poking at the endpoint directly.
  return { status, payload: { error: 'The agent is unavailable right now.' } };
}

/* --- POST /api/agent ---------------------------------------------------- */

async function runAgent(body, headers) {
  const messages = sanitizeMessages(body && body.messages);
  if (!messages) return { status: 400, payload: { error: 'messages[] is required' } };

  const sessionId = str(body && body.sessionId, 64) || null;
  const question = messages[messages.length - 1].content;

  try {
    const reply = await chat({ system: AGENT_SYSTEM, messages, maxTokens: 300 });
    // Fire-and-forget: a logging failure must never cost the visitor a reply.
    if (sessionId) logChatTurn({ sessionId, question, answer: reply, ok: true, headers });
    return { status: 200, payload: { reply } };
  } catch (err) {
    if (sessionId) logChatTurn({ sessionId, question, answer: null, ok: false, headers });
    return fail(err);
  }
}

/* --- POST /api/gaps ----------------------------------------------------- */

async function runGaps(body, headers) {
  const description = str(body && body.description, MAX_DESC);
  const sessionId = str(body && body.sessionId, 64) || null;
  if (description.length < 12) {
    return { status: 400, payload: { error: 'description must be at least 12 characters' } };
  }

  try {
    const text = await chat({
      system: GAP_SYSTEM,
      messages: [{ role: 'user', content: description }],
      maxTokens: 700,
      json: true,
    });

    let parsed;
    try {
      parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim());
    } catch {
      logGapRun({ sessionId, description, gaps: [], ok: false, error: 'unparseable', headers });
      return { status: 502, payload: { error: 'Could not parse the model response.' } };
    }

    const list = (Array.isArray(parsed) ? parsed : parsed && parsed.gaps) || [];
    const gaps = list
      .filter((g) => g && typeof g.title === 'string' && g.title.trim())
      .slice(0, 3)
      .map((g) => ({
        saving: str(g.saving, 60),
        title: str(g.title, 80),
        how: str(g.how, 240),
      }));

    if (gaps.length < 1) {
      logGapRun({ sessionId, description, gaps: [], ok: false, error: 'empty', headers });
      return { status: 502, payload: { error: 'No gaps returned.' } };
    }

    logGapRun({ sessionId, description, gaps, ok: true, headers });
    return { status: 200, payload: { gaps } };
  } catch (err) {
    logGapRun({ sessionId, description, gaps: [], ok: false, error: err.message, headers });
    return fail(err);
  }
}

/* --- POST /api/contact -------------------------------------------------- */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function runContact(body, headers) {
  const name = str(body && body.name, 120);
  const email = str(body && body.email, 200);
  const note = str(body && body.note, 4000);
  const sessionId = str(body && body.sessionId, 64) || null;

  if (!name) return { status: 400, payload: { error: 'name is required' } };
  if (!EMAIL.test(email)) return { status: 400, payload: { error: 'a valid email is required' } };

  const hook = process.env.CONTACT_WEBHOOK_URL;
  let delivered = false;

  if (hook) {
    try {
      const res = await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, note, source: 'indraam.com', at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`webhook ${res.status}`);
      delivered = true;
    } catch (err) {
      console.error('[indraam contact] delivery failed', err.message);
    }
  }

  // The submission is persisted whether or not the webhook fired, so a broken
  // hook loses a notification, never the lead. It shows up in /admin either way.
  await logContact({ sessionId, name, email, note, delivered, headers });

  if (!hook) {
    console.log('[indraam contact]', JSON.stringify({ name, email, at: new Date().toISOString() }));
  }
  return { status: 200, payload: { ok: true, delivered } };
}

module.exports = { runAgent, runGaps, runContact };
