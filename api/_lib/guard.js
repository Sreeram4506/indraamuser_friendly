/* ==========================================================================
   Request guards for the public AI endpoints.

   These are unauthenticated routes that spend money on every call, so they
   need a floor of protection: only accept POSTs from your own origin, cap
   how often one IP can call, and cap how much text it can send.

   NOTE ON RATE LIMITING: the counter below lives in the function instance's
   memory. On serverless that means it resets on cold start and is not shared
   between concurrent instances — it stops casual hammering, not a determined
   attacker. Before you promote this to a page that gets real traffic, swap
   `hit()` for a shared store (Vercel KV, Upstash Redis) — the call signature
   is the same. See README.
   ========================================================================== */

const WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 60000);
const MAX_HITS = Number(process.env.RATE_MAX || 12);

const buckets = new Map();

/**
 * Best-effort per-IP counter. Returns true when the caller is over budget.
 * `max` and `windowMs` override the env defaults — the admin login passes its
 * own, much tighter budget so raising RATE_MAX for the chat endpoint can never
 * loosen brute-force protection on the password.
 */
function hit(key, max, windowMs) {
  const limit = Number.isFinite(max) ? max : MAX_HITS;
  const window = Number.isFinite(windowMs) ? windowMs : WINDOW_MS;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.reset) {
    buckets.set(key, { count: 1, reset: now + window });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
    }
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

/**
 * Only serve browsers on our own site. ALLOWED_ORIGINS is a comma-separated
 * list, e.g. "https://indraam.com,https://www.indraam.com". Unset = allow all
 * (fine for local development, set it before you go live).
 */
function originAllowed(req) {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return true;
  const origin = req.headers.origin;
  if (!origin) return false;
  return raw.split(',').map((s) => s.trim()).filter(Boolean).includes(origin);
}

function corsHeaders(req, res) {
  const origin = req.headers.origin;
  const raw = process.env.ALLOWED_ORIGINS;
  if (origin && (!raw || originAllowed(req))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Shared preamble for every endpoint. Returns true when the request has been
 * fully handled (and the caller should return immediately).
 */
function reject(req, res) {
  corsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return true;
  }
  if (!originAllowed(req)) {
    res.status(403).json({ error: 'Forbidden' });
    return true;
  }
  if (hit(clientIp(req))) {
    res.setHeader('Retry-After', Math.ceil(WINDOW_MS / 1000));
    res.status(429).json({ error: 'Too many requests — give it a minute.' });
    return true;
  }
  return false;
}

/** Body may arrive parsed (Vercel) or as a raw string. */
function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

module.exports = { reject, readBody, clientIp, hit };
