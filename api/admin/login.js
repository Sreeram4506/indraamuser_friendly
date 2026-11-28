/* ==========================================================================
   POST   /api/admin/login   { password, code? }  -> sets the session cookie
   GET    /api/admin/login                        -> { authed, configured, totp }
   DELETE /api/admin/login                        -> signs out

   Brute-force defence:
   - Every attempt is COUNTED FIRST, atomically, before the password is looked
     at, and a successful sign-in gives its count back. That ordering is what
     stops a burst of parallel guesses: only the first ADMIN_LOGIN_MAX (default
     5) requests from an address are ever allowed to try.
   - After that the address is refused outright, even with the right password,
     for a full ADMIN_LOGIN_WINDOW_MS (default 15 min) from the failure that
     tripped the limit.
   - The counter lives in MongoDB, shared by every serverless instance. If the
     database can't be reached the login says so and stays shut (the dashboard
     needs the database anyway) instead of counting in per-instance memory.
   - IPv6 callers are counted per /64, and only platform-set address headers
     are trusted (see guard.clientIp).
   - A failure costs the caller a short delay.
   - If ADMIN_TOTP_SECRET is set, a current authenticator code is required as
     well, and each code works once.
   - The error never says whether the password or the code was wrong.
   ========================================================================== */

const { readBody, clientIp } = require('../_lib/guard');
const { intFromEnv } = require('../_lib/env');
const limits = require('../_lib/limits');
const totp = require('../_lib/totp');
const { configured, checkPassword, passwordIsWeak, setCookie, clearCookie, isAuthed } = require('../_lib/auth');

const FAIL_MAX = intFromEnv('ADMIN_LOGIN_MAX', 5);
const FAIL_WINDOW_MS = intFromEnv('ADMIN_LOGIN_WINDOW_MS', 900000); // 15 min
const FAIL_DELAY_MS = intFromEnv('ADMIN_LOGIN_FAIL_DELAY_MS', 400, { min: 0 });

// A code is accepted for 90 seconds (one step either side), so remember it a bit longer than that.
const CODE_MEMORY_MS = 5 * 60000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const UNAVAILABLE = { error: 'Sign-in is temporarily unavailable. Please try again shortly.' };

async function refuse(res) {
  if (FAIL_DELAY_MS > 0) await sleep(FAIL_DELAY_MS);
  // Uniform message and no hint about which part was wrong.
  res.status(401).json({ error: totp.enabled() ? 'Incorrect password or login code.' : 'Incorrect password.' });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // GET is a cheap "am I still signed in?" probe for the dashboard. It also
  // tells the sign-in form whether to ask for a login code.
  if (req.method === 'GET') {
    const authed = isAuthed(req);
    const body = { authed, configured: configured(), totp: totp.enabled() };
    if (authed && passwordIsWeak()) body.weakPassword = true;
    res.status(200).json(body);
    return;
  }

  // DELETE signs out.
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearCookie());
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  if (!configured()) {
    res.status(503).json({ error: 'Admin is not configured. Set ADMIN_PASSWORD and SESSION_SECRET (and a valid ADMIN_TOTP_SECRET if you use login codes).' });
    return;
  }

  const strikeKey = 'login-strikes:' + clientIp(req);

  try {
    // Count this attempt before looking at anything the caller sent.
    const attempt = await limits.strike(strikeKey, { max: FAIL_MAX, windowMs: FAIL_WINDOW_MS, strict: true });
    if (attempt.limited) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(attempt.retryAfterMs / 1000))));
      res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
      return;
    }

    const body = readBody(req);
    const passwordOk = checkPassword(body && body.password);

    // Check the code even when the password is wrong, so the two cases take the same path.
    const step = totp.enabled() ? totp.check(body && body.code) : 0;
    const codeOk = step !== null;

    if (!passwordOk || !codeOk) { await refuse(res); return; }

    // A code is good once: a second use of the same 30-second step is refused.
    if (totp.enabled() && !(await limits.claim('totp-used:' + step, CODE_MEMORY_MS, { strict: true }))) {
      await refuse(res);
      return;
    }

    await limits.release(strikeKey); // a successful sign-in is not a failure
    res.setHeader('Set-Cookie', setCookie());
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof limits.LimiterUnavailableError) {
      console.error('[indraam login] limiter unavailable, refusing sign-in:', err.message);
      res.status(503).json(UNAVAILABLE);
      return;
    }
    throw err;
  }
};
