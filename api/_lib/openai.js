/* ==========================================================================
   Thin OpenAI Chat Completions wrapper.

   The API key lives ONLY here, read from process.env on the server. It must
   never be sent to the browser, committed, or inlined in js/app.js.
   ========================================================================== */

const API_URL = 'https://api.openai.com/v1/chat/completions';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 20000);
const MOCK_ENABLED = process.env.OPENAI_API_KEY ? false : true; // auto-enable mock when no key

class UpstreamError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status || 502;
  }
}

/* =====================================================================
   Mock fallback — returns scripted agent/gap responses when no key is set
   so the site works fully without an OpenAI subscription during dev.
   ===================================================================== */

const MOCK_GAPS = JSON.stringify({
  gaps: [
    { saving: "~60% fewer manual tickets", title: "Support ticket triage", how: "Auto-classify, route and draft replies from your knowledge base." },
    { saving: "Hours → minutes on data entry", title: "Invoice & data extraction", how: "Parse incoming invoices, emails and forms into structured records." },
    { saving: "80% faster reporting", title: "Automated weekly reports", how: "Aggregate metrics from your tools and send a formatted report on schedule." }
  ]
});

const MOCK_REPLIES = [
  "We build exactly that — RAG-grounded chat and voice agents, trained on your own docs and shipped with guardrails. Most go live in about two weeks.",
  "Great question! That's our automation service: trigger → route → process → log, no human in the loop. We map it in discovery, then build it.",
  "We take fixed-scope builds priced from the spec — and you own all code, docs and infra on handover. Book a call and we'll scope yours.",
  "Short answer: yes. We wire agents into your existing stack — CRMs, help desks, spreadsheets, internal APIs — and hand over everything at the end.",
  "A working demo in about two weeks. We ship weekly from there — software you can click, not slideware.",
  "Two shapes: a fixed-scope build with a spec, a price and a date, or a monthly retainer for ongoing automation. Both start with a short discovery call.",
  "We build on the stack you already run — React, Node, Python, your cloud — and integrate with the tools you already use."
];

function getMockReply(userMessage) {
  const lower = (userMessage || '').toLowerCase();
  if (lower.includes('chat') || lower.includes('support') || lower.includes('customer')) return MOCK_REPLIES[0];
  if (lower.includes('invoice') || lower.includes('email') || lower.includes('workflow')) return MOCK_REPLIES[1];
  if (lower.includes('cost') || lower.includes('price') || lower.includes('own')) return MOCK_REPLIES[2];
  if (lower.includes('stack') || lower.includes('existing') || lower.includes('integrat')) return MOCK_REPLIES[3];
  if (lower.includes('fast') || lower.includes('demo') || lower.includes('timeline')) return MOCK_REPLIES[4];
  if (lower.includes('engagement') || lower.includes('retainer') || lower.includes('scope')) return MOCK_REPLIES[5];
  // Default: pick a reply based on message length to keep it deterministic
  return MOCK_REPLIES[userMessage.length % MOCK_REPLIES.length];
}

/**
 * Call OpenAI and return the assistant's text.
 * Falls back to mock responses when OPENAI_API_KEY is not set.
 *
 * @param {object}  opts
 * @param {string}  opts.system      System prompt.
 * @param {Array}   opts.messages    [{ role, content }] — user/assistant turns.
 * @param {number}  opts.maxTokens   Hard ceiling on the reply.
 * @param {boolean} opts.json        Force a JSON object response.
 * @returns {Promise<string>}
 */
async function chat({ system, messages, maxTokens = 300, json = false }) {
  const key = process.env.OPENAI_API_KEY;

  // --- Mock mode: return scripted responses when no key is set ---
  if (!key) {
    console.warn('[indraam mock] OPENAI_API_KEY not set — using mock responses');
    // Simulate a short network delay
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));

    if (json) {
      // Gap finder: return mock gaps
      return MOCK_GAPS;
    }

    // Agent chat: return a context-aware mock reply
    const lastUser = messages.filter(m => m.role === 'user').pop();
    const reply = getMockReply(lastUser ? lastUser.content : '');
    return reply;
  }

  // --- Real OpenAI call ---
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    temperature: json ? 0.4 : 0.6,
    messages: [{ role: 'system', content: system }, ...messages],
  };
  if (json) body.response_format = { type: 'json_object' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new UpstreamError(err.name === 'AbortError' ? 'OpenAI timed out' : 'OpenAI unreachable', 504);
  }
  clearTimeout(timer);

  if (!res.ok) {
    // Never surface the upstream body — it can echo request details.
    const status = res.status === 429 ? 429 : 502;
    throw new UpstreamError(`OpenAI returned ${res.status}`, status);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new UpstreamError('OpenAI returned an empty reply', 502);
  return text.trim();
}

module.exports = { chat, UpstreamError, MODEL };
