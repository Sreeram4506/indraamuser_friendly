/* ==========================================================================
   Netlify Functions v2 adapter.

   Netlify hands you a Web `Request` and expects a `Response`, where Vercel
   uses Node's (req, res). This wraps the same core logic and re-implements
   the guards against Request headers. Only needed if you deploy to Netlify —
   on Vercel the files in /api are used directly and this is dead weight.
   ========================================================================== */

const { hit } = require('./guard');

function allowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS;
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : null;
}

function cors(origin) {
  const list = allowedOrigins();
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (origin && (!list || list.includes(origin))) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return headers;
}

function json(payload, status, headers) {
  return new Response(JSON.stringify(payload), { status, headers });
}

/** @param {(body:object)=>Promise<{status:number,payload:object}>} run */
function toNetlify(run) {
  return async function handler(req) {
    const origin = req.headers.get('origin');
    const headers = cors(origin);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);

    const list = allowedOrigins();
    if (list && (!origin || !list.includes(origin))) {
      return json({ error: 'Forbidden' }, 403, headers);
    }

    const ip = (req.headers.get('x-nf-client-connection-ip')
      || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
      || 'unknown');
    if (hit(ip)) return json({ error: 'Too many requests — give it a minute.' }, 429, headers);

    let body = {};
    try { body = await req.json(); } catch { body = {}; }

    const reqHeaders = Object.fromEntries(req.headers.entries());
    const { status, payload } = await run(body, reqHeaders);
    return json(payload, status, headers);
  };
}

module.exports = { toNetlify };
