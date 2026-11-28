const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.MONGODB_URI; // exercise the in-memory path
const limits = require('../api/_lib/limits');

test('consume allows up to max, then limits', async () => {
  const key = 'test:basic:' + Math.random();
  for (let i = 1; i <= 3; i += 1) {
    const r = await limits.consume(key, 3, 60000);
    assert.equal(r.limited, false, `call ${i} should pass`);
    assert.equal(r.count, i);
  }
  assert.equal((await limits.consume(key, 3, 60000)).limited, true);
});

test('keys are independent', async () => {
  const a = 'test:a:' + Math.random();
  const b = 'test:b:' + Math.random();
  await limits.consume(a, 1, 60000);
  assert.equal((await limits.consume(a, 1, 60000)).limited, true);
  assert.equal((await limits.consume(b, 1, 60000)).limited, false);
});

test('count reads without adding', async () => {
  const key = 'test:count:' + Math.random();
  assert.equal(await limits.count(key, 60000), 0);
  await limits.consume(key, 5, 60000);
  await limits.consume(key, 5, 60000);
  assert.equal(await limits.count(key, 60000), 2);
  assert.equal(await limits.count(key, 60000), 2);
});

test('consumeAll reports the tightest window that is over', async () => {
  const key = 'test:all:' + Math.random();
  const rules = [{ windowMs: 60000, max: 2 }, { windowMs: 3600000, max: 100 }];
  assert.equal(await limits.consumeAll(key, rules), null);
  assert.equal(await limits.consumeAll(key, rules), null);
  const blocked = await limits.consumeAll(key, rules);
  assert.ok(blocked);
  assert.equal(blocked.windowMs, 60000);
});

/* ------------------------------------------------------------ strike/release */

test('strike allows max attempts, then limits', async () => {
  const key = 'test:strike:' + Math.random();
  for (let i = 1; i <= 5; i += 1) {
    const r = await limits.strike(key, { max: 5, windowMs: 900000 });
    assert.equal(r.limited, false, `attempt ${i}`);
    assert.equal(r.count, i);
  }
  const sixth = await limits.strike(key, { max: 5, windowMs: 900000 });
  assert.equal(sixth.limited, true);
  assert.ok(sixth.retryAfterMs > 0 && sixth.retryAfterMs <= 900000);
});

test('parallel strikes cannot beat the limit: exactly max get through', async () => {
  const key = 'test:parallel:' + Math.random();
  const results = await Promise.all(Array.from({ length: 200 }, () => limits.strike(key, { max: 5, windowMs: 900000 })));
  assert.equal(results.filter((r) => !r.limited).length, 5);
  assert.equal(results.filter((r) => r.limited).length, 195);
});

test('release gives an attempt back', async () => {
  const key = 'test:release:' + Math.random();
  await limits.strike(key, { max: 2, windowMs: 60000 });
  await limits.release(key);
  assert.equal((await limits.strike(key, { max: 2, windowMs: 60000 })).count, 1);
  await limits.release(key);
  await limits.release(key);
  await limits.release(key); // never goes below zero
  assert.equal((await limits.strike(key, { max: 2, windowMs: 60000 })).count, 1);
});

test('the lockout runs a full window from the failure that tripped it', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000_000 });
  const key = 'test:sliding:' + Math.random();
  const W = 15 * 60000;
  for (let i = 0; i < 4; i += 1) await limits.strike(key, { max: 5, windowMs: W });
  t.mock.timers.tick(W - 1000);                      // 14:59 after the first failure
  assert.equal((await limits.strike(key, { max: 5, windowMs: W })).limited, false); // 5th failure
  t.mock.timers.tick(5 * 60000);                     // 20 minutes after the first, 5 after the 5th
  const stillLocked = await limits.strike(key, { max: 5, windowMs: W });
  assert.equal(stillLocked.limited, true, 'a clock-bucket limiter would have unlocked by now');
  assert.ok(stillLocked.retryAfterMs > 9 * 60000);
  t.mock.timers.tick(W);                             // a full window after the 5th failure
  assert.equal((await limits.strike(key, { max: 5, windowMs: W })).limited, false);
});

/* --------------------------------------------------------------------- claim */

test('claim is first-come: only one caller gets it', async () => {
  const key = 'test:claim:' + Math.random();
  const results = await Promise.all(Array.from({ length: 20 }, () => limits.claim(key, 60000)));
  assert.equal(results.filter(Boolean).length, 1);
});

test('a claim expires, and does not roll over at a clock boundary', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 86400000 - 5000 }); // 5 s before a day boundary
  const key = 'test:claim-expiry:' + Math.random();
  assert.equal(await limits.claim(key, 5 * 60000), true);
  t.mock.timers.tick(10000);                         // now past the boundary
  assert.equal(await limits.claim(key, 5 * 60000), false);
  t.mock.timers.tick(5 * 60000);
  assert.equal(await limits.claim(key, 5 * 60000), true);
});

/* ------------------------------------------------------------- memory bounds */

test('the in-memory fallback stays bounded under a flood of unique keys', async () => {
  limits._reset();
  for (let i = 0; i < 20000; i += 1) await limits.consume('flood:' + i, 10, 86400000);
  assert.ok(limits._memorySize() <= 5000, `size ${limits._memorySize()}`);
});
