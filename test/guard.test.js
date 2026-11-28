const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers');

delete process.env.MONGODB_URI;
delete process.env.ALLOWED_ORIGINS;
const guard = require('../api/_lib/guard');

async function call(name, opts) {
  const res = mockRes();
  const blocked = await guard.reject(mockReq(opts), res, name);
  return { blocked, res };
}

test('GET is refused', async () => {
  const { blocked, res } = await call('contact', { method: 'GET' });
  assert.equal(blocked, true);
  assert.equal(res.statusCode, 405);
});

test('contact allows 2 per minute per IP, then returns 429 with Retry-After', async () => {
  const ip = '203.0.113.7';
  assert.equal((await call('contact', { ip })).blocked, false);
  assert.equal((await call('contact', { ip })).blocked, false);
  const third = await call('contact', { ip });
  assert.equal(third.blocked, true);
  assert.equal(third.res.statusCode, 429);
  assert.ok(Number(third.res.headers['retry-after']) > 0);
});

test('another IP is unaffected', async () => {
  assert.equal((await call('contact', { ip: '203.0.113.8' })).blocked, false);
});

test('agent allows a normal burst (8 per minute) but not more', async () => {
  const ip = '203.0.113.9';
  for (let i = 0; i < 8; i += 1) assert.equal((await call('agent', { ip })).blocked, false, `request ${i + 1}`);
  assert.equal((await call('agent', { ip })).blocked, true);
});

test('oversized bodies are rejected before anything else', async () => {
  const { blocked, res } = await call('agent', { headers: { 'content-length': String(64 * 1024) } });
  assert.equal(blocked, true);
  assert.equal(res.statusCode, 413);
});

test('a configured origin list blocks other sites', async () => {
  process.env.ALLOWED_ORIGINS = 'https://www.indraam.com';
  const bad = await call('agent', { headers: { origin: 'https://evil.example' } });
  assert.equal(bad.res.statusCode, 403);
  const none = await call('agent', {});
  assert.equal(none.res.statusCode, 403);
  const good = await call('agent', { headers: { origin: 'https://www.indraam.com' } });
  assert.equal(good.blocked, false);
  delete process.env.ALLOWED_ORIGINS;
});

test('on Vercel the client IP is the platform header, not a caller-written x-forwarded-for', () => {
  assert.equal(guard.clientIp({ headers: { 'x-vercel-forwarded-for': '1.1.1.1', 'x-forwarded-for': '9.9.9.9' } }), '1.1.1.1');
});

test('off Vercel, x-forwarded-for is ignored unless TRUST_PROXY is set', () => {
  const saved = { VERCEL: process.env.VERCEL, NETLIFY: process.env.NETLIFY, TRUST_PROXY: process.env.TRUST_PROXY };
  delete process.env.VERCEL; delete process.env.NETLIFY; delete process.env.TRUST_PROXY;
  try {
    const req = { headers: { 'x-forwarded-for': '2.2.2.2, 3.3.3.3', 'x-nf-client-connection-ip': '5.5.5.5' }, socket: { remoteAddress: '4.4.4.4' } };
    assert.equal(guard.clientIp(req), '4.4.4.4');
    process.env.TRUST_PROXY = '1';
    assert.equal(guard.clientIp(req), '2.2.2.2');
    delete process.env.TRUST_PROXY;
    process.env.NETLIFY = 'true';
    assert.equal(guard.clientIp(req), '5.5.5.5');
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test('rotating x-forwarded-for does not give a fresh budget off Vercel', async () => {
  const saved = process.env.VERCEL;
  delete process.env.VERCEL;
  try {
    const hits = [];
    for (let i = 0; i < 4; i += 1) {
      const res = mockRes();
      const req = { method: 'POST', body: {}, headers: { 'x-forwarded-for': `198.18.0.${i}` }, socket: { remoteAddress: '198.18.99.99' } };
      hits.push(await guard.reject(req, res, 'contact'));
    }
    assert.deepEqual(hits, [false, false, true, true], 'all four calls share the one real address');
  } finally {
    process.env.VERCEL = saved;
  }
});

test('ipKey leaves IPv4 alone and unwraps IPv4-mapped IPv6', () => {
  assert.equal(guard.ipKey('203.0.113.7'), '203.0.113.7');
  assert.equal(guard.ipKey('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(guard.ipKey(''), 'unknown');
  assert.equal(guard.ipKey(undefined), 'unknown');
});

test('ipKey collapses IPv6 to the /64, however it is written', () => {
  const a = guard.ipKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
  assert.equal(a, '2001:db8:1:2::/64');
  assert.equal(guard.ipKey('2001:0db8:0001:0002::1'), a);
  assert.equal(guard.ipKey('2001:DB8:1:2:ffff:ffff:ffff:ffff%eth0'), a);
  assert.notEqual(guard.ipKey('2001:db8:1:3::1'), a);
  assert.equal(guard.ipKey('::1'), '0:0:0:0::/64');
});

test('ipKey caps hostile input length', () => {
  assert.ok(guard.ipKey('9'.repeat(5000)).length <= 70);
});
