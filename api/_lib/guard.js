/* ==========================================================================
   Request guards for the public endpoints.

   These are unauthenticated routes that spend money (the AI ones) or accept
   free text (the contact form), so they need a floor of protection: only
   accept POSTs from your own origin and cap how often one IP can call, per
   minute, per hour and per day.

   The per-IP counters live in MongoDB when it is configured (shared by every
   serverless instance, survives cold starts) and fall back to memory when it
   is not. See limits.js. `hit()` below is the older memory-only counter, still
   used by the small public certificate lookup.
   ========================================================================== */

const limits = require('./limits');
const { intFromEnv } = require('./env');

const MINUTE = 60000;
const HOUR = 3600000;
const DAY = 86400000;
const MAX_BODY_BYTES = 32 * 1024; // the largest legitimate body (a contact form with every field) is a few KB

/** Per-IP budgets for each public endpoint: a burst limit plus slower ceilings. */
const LIMITS = {
  agent: [{ windowMs: MINUTE, max: 8 }, { windowMs: HOUR, max: 40 }, { windowMs: DAY, max: 100 }],
  gaps: [{ windowMs: MINUTE, max: 3 }, { windowMs: HOUR, max: 10 }, { windowMs: DAY, max: 20 }],
  contact: [{ windowMs: MINUTE, max: 2 }, { windowMs: HOUR, max: 5 }, { windowMs: DAY, max: 15 }],
};

const WINDOW_MS = intFromEnv('RATE_WINDOW_MS', 60000);
const MAX_HITS = intFromEnv('RATE_MAX', 12);

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

const first = (value) => (typeof value === 'string' && value ? value.split(',')[0].trim() : '');

/**
 * Turn an address into the key we count against. IPv4 stays as is. An IPv6
 * address collapses to its /64 prefix, because one subscriber normally controls
 * a whole /64: keying on the full address would hand an attacker billions of
 * "different IPs". Capped in length so a header can't inflate our keys.
 */
function ipKey(raw) {
  let ip = String(raw || '').split('%')[0].trim().toLowerCase().slice(0, 64);
  if (!ip) return 'unknown';
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped) return mapped[1];
  if (!ip.includes(':')) return ip;

  const halves = ip.split('::');
  let groups = halves[0] ? halves[0].split(':') : [];
  if (halves.length > 1) {
    const tail = halves[1] ? halves[1].split(':') : [];
    groups = groups.concat(Array(Math.max(8 - groups.length - tail.length, 0)).fill('0'), tail);
  }
  const prefix = groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, ''));
  while (prefix.length < 4) prefix.push('0');
  return prefix.join(':') + '::/64';
}

/**
 * The caller's address. Only a header the hosting platform sets itself is
 * trusted: elsewhere a caller can write x-forwarded-for, and trusting it would
 * give every request a fresh rate-limit bucket. Behind your own reverse proxy,
 * set TRUST_PROXY=1 to use x-forwarded-for.
 */
function clientIp(req) {
  const h = req.headers || {};
  let raw = '';
  if (process.env.VERCEL) raw = first(h['x-vercel-forwarded-for']) || first(h['x-forwarded-for']);
  else if (process.env.NETLIFY) raw = first(h['x-nf-client-connection-ip']);
  else if (process.env.TRUST_PROXY) raw = first(h['x-forwarded-for']) || first(h['x-real-ip']);
  return ipKey(raw || (req.socket && req.socket.remoteAddress));
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

/** Budget check shared by the Vercel and Netlify adapters. Returns a Retry-After in seconds, or 0. */
async function overBudget(ip, name) {
  const rules = LIMITS[name];
  if (!rules) return 0;
  const blocked = await limits.consumeAll(`ip:${name}:${ip}`, rules);
  return blocked ? Math.ceil(Math.min(blocked.windowMs, HOUR) / 1000) : 0;
}

/**
 * Shared preamble for every endpoint. Returns true when the request has been
 * fully handled (and the caller should return immediately).
 * @param {string} name  Key into LIMITS: 'agent' | 'gaps' | 'contact'.
 */
async function reject(req, res, name) {
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
  const declared = Number(req.headers && req.headers['content-length']);
  if (declared > MAX_BODY_BYTES) {
    res.status(413).json({ error: 'Request too large' });
    return true;
  }
  const retryAfter = await overBudget(clientIp(req), name);
  if (retryAfter) {
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'Too many requests — try again later.' });
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

module.exports = { reject, overBudget, readBody, clientIp, ipKey, hit, LIMITS };
