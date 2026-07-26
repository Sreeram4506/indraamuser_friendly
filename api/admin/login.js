/* POST /api/admin/login — exchange the admin password for a session cookie. */
const { readBody, hit, clientIp } = require('../_lib/guard');
const { configured, checkPassword, setCookie, clearCookie, isAuthed } = require('../_lib/auth');

const LOGIN_MAX = Number(process.env.ADMIN_LOGIN_MAX || 8);
const LOGIN_WINDOW_MS = Number(process.env.ADMIN_LOGIN_WINDOW_MS || 900000); // 15 min

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // GET is a cheap "am I still signed in?" probe for the dashboard.
  if (req.method === 'GET') {
    res.status(200).json({ authed: isAuthed(req), configured: configured() });
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
    res.status(503).json({ error: 'Admin is not configured. Set ADMIN_PASSWORD and SESSION_SECRET.' });
    return;
  }

  // Its own budget, deliberately independent of RATE_MAX: 8 attempts per 15
  // minutes per IP. This is the brute-force surface for the whole dashboard.
  if (hit('login:' + clientIp(req), LOGIN_MAX, LOGIN_WINDOW_MS)) {
    res.setHeader('Retry-After', String(LOGIN_WINDOW_MS / 1000));
    res.status(429).json({ error: 'Too many attempts. Try again later.' });
    return;
  }

  const body = readBody(req);
  if (!checkPassword(body && body.password)) {
    // Uniform message and no timing signal — don't confirm anything.
    res.status(401).json({ error: 'Incorrect password.' });
    return;
  }

  res.setHeader('Set-Cookie', setCookie());
  res.status(200).json({ ok: true });
};
