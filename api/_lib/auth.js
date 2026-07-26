/* ==========================================================================
   Admin session auth.

   One shared password (ADMIN_PASSWORD) exchanged for a signed cookie. The
   cookie carries no secret — just an expiry and an HMAC over it — so a stolen
   cookie can't be extended and a forged one can't be signed without
   SESSION_SECRET.

   Deliberately simple. It protects a single-operator dashboard, not a
   multi-tenant product. If more than one person needs access, or you need to
   revoke individual sessions, move to real accounts.
   ========================================================================== */

const crypto = require('crypto');

const COOKIE = 'indraam_admin';
const TTL_MS = Number(process.env.ADMIN_SESSION_HOURS || 168) * 3600 * 1000; // 7 days

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) return null;
  return s;
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

/** Constant-time compare that doesn't leak length through early return. */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) {
    // Still burn a comparison so timing doesn't reveal the length mismatch.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

function configured() {
  return Boolean(process.env.ADMIN_PASSWORD && secret());
}

function checkPassword(candidate) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof candidate !== 'string') return false;
  return safeEqual(candidate, expected);
}

/* --- token --------------------------------------------------------------- */

function issue() {
  const expires = Date.now() + TTL_MS;
  const payload = `admin.${expires}`;
  return `${payload}.${sign(payload)}`;
}

function verify(token) {
  if (!token || !secret()) return false;
  const parts = String(token).split('.');
  if (parts.length !== 3) return false;
  const [subject, expires, mac] = parts;
  const payload = `${subject}.${expires}`;
  if (!safeEqual(mac, sign(payload))) return false;
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  return subject === 'admin';
}

/* --- cookies ------------------------------------------------------------- */

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  String(header).split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function cookieHeader(token, maxAgeSeconds) {
  const bits = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',                 // unreadable from JavaScript — blunts XSS token theft
    'SameSite=Strict',          // not sent on cross-site requests — blunts CSRF
    `Max-Age=${maxAgeSeconds}`,
  ];
  // Secure would break http://localhost during development.
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL || process.env.NETLIFY) {
    bits.push('Secure');
  }
  return bits.join('; ');
}

const setCookie = () => cookieHeader(issue(), Math.floor(TTL_MS / 1000));
const clearCookie = () => cookieHeader('', 0);

/** Read the session from a Node-style request. */
function isAuthed(req) {
  const cookies = parseCookies(req.headers && (req.headers.cookie || req.headers.Cookie));
  return verify(cookies[COOKIE]);
}

/**
 * Gate for every admin data route. Returns true when the request has been
 * handled and the caller should stop.
 */
function requireAuth(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  if (!configured()) {
    res.status(503).json({ error: 'Admin is not configured. Set ADMIN_PASSWORD and SESSION_SECRET.' });
    return true;
  }
  if (!isAuthed(req)) {
    res.status(401).json({ error: 'Not signed in' });
    return true;
  }
  return false;
}

module.exports = { COOKIE, TTL_MS, configured, checkPassword, issue, verify, isAuthed, requireAuth, setCookie, clearCookie, parseCookies };
