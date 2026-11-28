const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers');

// A database that is configured but unreachable. The login must refuse, not count in memory.
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=1500&connectTimeoutMS=1500';
process.env.ADMIN_PASSWORD = 'correct-horse-battery-staple';
process.env.SESSION_SECRET = 'x'.repeat(40);
process.env.ADMIN_LOGIN_FAIL_DELAY_MS = '0';
delete process.env.ADMIN_TOTP_SECRET;

const handler = require('../api/admin/login');

test('with the database unreachable, sign-in is refused with 503 even for the right password', { timeout: 30000 }, async () => {
  const err = console.error;
  console.error = () => {};
  try {
    const res = mockRes();
    await handler(mockReq({ body: { password: process.env.ADMIN_PASSWORD } }), res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.headers['set-cookie'], undefined);
  } finally {
    console.error = err;
  }
});
