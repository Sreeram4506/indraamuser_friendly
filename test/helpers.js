/* Shared test helpers: a minimal stand-in for the Node/Vercel request and response objects. */

// Tests simulate running on Vercel, which is where x-vercel-forwarded-for is trusted.
process.env.VERCEL = '1';

function mockRes() {
  const res = { statusCode: 0, body: null, headers: {}, ended: false };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => { res.ended = true; return res; };
  res.setHeader = (k, v) => { res.headers[String(k).toLowerCase()] = v; };
  return res;
}

let counter = 0;
/** A fresh IP every call, so tests never share a rate-limit bucket. */
function freshIp() {
  counter += 1;
  return `10.${(counter >> 16) & 255}.${(counter >> 8) & 255}.${counter & 255}`;
}

function mockReq({ method = 'POST', body = {}, ip = freshIp(), headers = {} } = {}) {
  return { method, body, headers: Object.assign({ 'x-vercel-forwarded-for': ip }, headers) };
}

module.exports = { mockRes, mockReq, freshIp };
