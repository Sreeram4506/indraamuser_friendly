const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes, freshIp } = require('./helpers');

const PASSWORD = 'correct-horse-battery-staple';
const TOTP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

process.env.ADMIN_PASSWORD = PASSWORD;
process.env.SESSION_SECRET = 'x'.repeat(40);
process.env.ADMIN_LOGIN_FAIL_DELAY_MS = '0';
process.env.ADMIN_LOGIN_MAX = '5';
delete process.env.MONGODB_URI;
delete process.env.ADMIN_TOTP_SECRET;

const handler = require('../api/admin/login');
const totp = require('../api/_lib/totp');

async function post(body, ip) {
  const res = mockRes();
  await handler(mockReq({ body, ip }), res);
  return res;
}

function currentCode(offset = 0) {
  const step = Math.floor(Date.now() / totp.STEP_MS) + offset;
  return totp.hotp(totp.base32Decode(TOTP_SECRET), step);
}

test('right password signs in and sets an HttpOnly cookie', async () => {
  const res = await post({ password: PASSWORD });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['set-cookie'], /HttpOnly/);
  assert.match(res.headers['set-cookie'], /SameSite=Strict/);
});

test('wrong password is refused with a generic message', async () => {
  const res = await post({ password: 'nope' });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Incorrect password.');
  assert.equal(res.headers['set-cookie'], undefined);
});

test('after 5 failures that IP is locked out, even with the right password', async () => {
  const ip = freshIp();
  for (let i = 0; i < 5; i += 1) assert.equal((await post({ password: 'guess' + i }, ip)).statusCode, 401);
  const locked = await post({ password: PASSWORD }, ip);
  assert.equal(locked.statusCode, 429);
  assert.ok(Number(locked.headers['retry-after']) > 0);
  assert.equal(locked.headers['set-cookie'], undefined);
});

test('a lockout on one IP does not affect another', async () => {
  const bad = freshIp();
  for (let i = 0; i < 5; i += 1) await post({ password: 'guess' }, bad);
  assert.equal((await post({ password: PASSWORD }, freshIp())).statusCode, 200);
});

test('successful sign-ins do not count towards the lockout', async () => {
  const ip = freshIp();
  for (let i = 0; i < 8; i += 1) assert.equal((await post({ password: PASSWORD }, ip)).statusCode, 200);
});

test('GET reports whether a code is needed, and never flags the password to strangers', async () => {
  const res = mockRes();
  await handler(mockReq({ method: 'GET' }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { authed: false, configured: true, totp: false });
});

test('with TOTP on: password alone is not enough', async () => {
  process.env.ADMIN_TOTP_SECRET = TOTP_SECRET;
  const res = await post({ password: PASSWORD });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Incorrect password or login code.');
});

test('with TOTP on: right password and right code signs in', async () => {
  process.env.ADMIN_TOTP_SECRET = TOTP_SECRET;
  const res = await post({ password: PASSWORD, code: currentCode() });
  assert.equal(res.statusCode, 200);
});

test('with TOTP on: a code can only be used once', async () => {
  process.env.ADMIN_TOTP_SECRET = TOTP_SECRET;
  const code = currentCode(1); // a distinct step from the test above
  assert.equal((await post({ password: PASSWORD, code })).statusCode, 200);
  const replay = await post({ password: PASSWORD, code });
  assert.equal(replay.statusCode, 401);
});

test('with TOTP on: right code, wrong password gives the same message as the reverse', async () => {
  process.env.ADMIN_TOTP_SECRET = TOTP_SECRET;
  const a = await post({ password: 'wrong', code: currentCode(-1) });
  const b = await post({ password: PASSWORD, code: '000000' });
  assert.equal(a.statusCode, 401);
  assert.equal(b.statusCode, 401);
  assert.equal(a.body.error, b.body.error);
});

test('with TOTP on: failed codes also count towards the lockout', async () => {
  process.env.ADMIN_TOTP_SECRET = TOTP_SECRET;
  const ip = freshIp();
  for (let i = 0; i < 5; i += 1) await post({ password: PASSWORD, code: '000000' }, ip);
  assert.equal((await post({ password: PASSWORD, code: currentCode(-1) }, ip)).statusCode, 429);
});

test('with TOTP on: GET advertises it so the form can ask for a code', async () => {
  process.env.ADMIN_TOTP_SECRET = TOTP_SECRET;
  const res = mockRes();
  await handler(mockReq({ method: 'GET' }), res);
  assert.equal(res.body.totp, true);
});

test('an unusable ADMIN_TOTP_SECRET closes the admin instead of dropping the second factor', async () => {
  process.env.ADMIN_TOTP_SECRET = 'AAAA';
  const res = await post({ password: PASSWORD });
  assert.equal(res.statusCode, 503);
  delete process.env.ADMIN_TOTP_SECRET;
});

test('a short password is flagged to signed-in admins only', async () => {
  process.env.ADMIN_PASSWORD = 'short';
  const stranger = mockRes();
  await handler(mockReq({ method: 'GET' }), stranger);
  assert.equal(stranger.body.weakPassword, undefined);
  process.env.ADMIN_PASSWORD = PASSWORD;
});

test('a burst of parallel guesses cannot beat the lockout: only 5 are ever checked', async () => {
  const ip = freshIp();
  const results = await Promise.all(Array.from({ length: 60 }, (_, i) => post({ password: 'guess' + i }, ip)));
  assert.equal(results.filter((r) => r.statusCode === 401).length, 5, 'exactly 5 reached the password check');
  assert.equal(results.filter((r) => r.statusCode === 429).length, 55);
});

test('a parallel burst that includes the right password cannot win once the limit is spent', async () => {
  const ip = freshIp();
  for (let i = 0; i < 5; i += 1) await post({ password: 'wrong' }, ip);
  const burst = await Promise.all(Array.from({ length: 30 }, () => post({ password: PASSWORD }, ip)));
  assert.ok(burst.every((r) => r.statusCode === 429));
});

test('IPv6 addresses in the same /64 share one lockout', async () => {
  for (let i = 0; i < 5; i += 1) await post({ password: 'wrong' }, `2001:db8:abcd:12:${i}:${i}:${i}:${i}`);
  const sameSubnet = await post({ password: PASSWORD }, '2001:db8:abcd:12:ffff:ffff:ffff:ffff');
  assert.equal(sameSubnet.statusCode, 429);
  const elsewhere = await post({ password: PASSWORD }, '2001:db8:abcd:13::1');
  assert.equal(elsewhere.statusCode, 200);
});

test('a typo in ADMIN_LOGIN_MAX does not switch the lockout off', () => {
  // The handler reads its limit through intFromEnv, so a non-number falls back to 5.
  const { intFromEnv } = require('../api/_lib/env');
  process.env.ADMIN_LOGIN_MAX = 'five';
  assert.equal(intFromEnv('ADMIN_LOGIN_MAX', 5), 5);
  process.env.ADMIN_LOGIN_MAX = '5';
});
