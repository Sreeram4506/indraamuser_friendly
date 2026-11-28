const test = require('node:test');
const assert = require('node:assert/strict');
const totp = require('../api/_lib/totp');

// RFC 6238 appendix B: the shared secret is the ASCII string 12345678901234567890.
const RFC_SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const RFC_SECRET = Buffer.from('12345678901234567890');

test('base32 round-trips', () => {
  assert.equal(totp.base32Encode(RFC_SECRET), RFC_SECRET_BASE32);
  assert.deepEqual(totp.base32Decode(RFC_SECRET_BASE32), RFC_SECRET);
  assert.deepEqual(totp.base32Decode('gezd gnbv-gy3t qojq gezd gnbv gy3t qojq'), RFC_SECRET);
});

test('base32 decode rejects characters outside the alphabet', () => {
  assert.equal(totp.base32Decode('not base32 !'), null);
  assert.equal(totp.base32Decode(''), null);
});

test('hotp matches the RFC 6238 test vectors (last six digits)', () => {
  assert.equal(totp.hotp(RFC_SECRET, Math.floor(59 / 30)), '287082');
  assert.equal(totp.hotp(RFC_SECRET, Math.floor(1111111109 / 30)), '081804');
  assert.equal(totp.hotp(RFC_SECRET, Math.floor(1234567890 / 30)), '005924');
});

test('check accepts the current code and one step of drift, nothing further', () => {
  process.env.ADMIN_TOTP_SECRET = RFC_SECRET_BASE32;
  const now = 1234567890 * 1000;
  const step = Math.floor(now / 30000);
  assert.equal(totp.check('005924', now), step);
  assert.equal(totp.check(totp.hotp(RFC_SECRET, step - 1), now), step - 1);
  assert.equal(totp.check(totp.hotp(RFC_SECRET, step + 1), now), step + 1);
  assert.equal(totp.check(totp.hotp(RFC_SECRET, step - 2), now), null);
  assert.equal(totp.check(totp.hotp(RFC_SECRET, step + 2), now), null);
});

test('check rejects malformed input', () => {
  process.env.ADMIN_TOTP_SECRET = RFC_SECRET_BASE32;
  const now = 1234567890 * 1000;
  for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined, 123456, '00 59 24 x']) {
    assert.equal(totp.check(bad, now), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test('check tolerates spaces typed into the code', () => {
  process.env.ADMIN_TOTP_SECRET = RFC_SECRET_BASE32;
  const now = 1234567890 * 1000;
  assert.notEqual(totp.check('005 924', now), null);
});

test('enabled/requested reflect the environment, and a short secret is not usable', () => {
  delete process.env.ADMIN_TOTP_SECRET;
  assert.equal(totp.enabled(), false);
  assert.equal(totp.requested(), false);
  process.env.ADMIN_TOTP_SECRET = 'AAAA';
  assert.equal(totp.requested(), true);
  assert.equal(totp.enabled(), false);
  assert.equal(totp.check('123456'), null);
  delete process.env.ADMIN_TOTP_SECRET;
});

test('newSecret makes a usable secret and a scannable otpauth link', () => {
  const secret = totp.newSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);
  assert.ok(totp.base32Decode(secret).length >= 10);
  const url = totp.otpauthUrl(secret, 'admin', 'Indraam');
  assert.ok(url.startsWith('otpauth://totp/Indraam%3Aadmin?'));
  assert.ok(url.includes(`secret=${secret}`));
});
