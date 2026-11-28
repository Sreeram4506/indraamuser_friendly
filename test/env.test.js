const test = require('node:test');
const assert = require('node:assert/strict');
const { intFromEnv } = require('../api/_lib/env');

test('intFromEnv returns the number when it is valid', () => {
  process.env.T_VAL = '12';
  assert.equal(intFromEnv('T_VAL', 5), 12);
  process.env.T_VAL = '7.9';
  assert.equal(intFromEnv('T_VAL', 5), 7);
});

test('a typo falls back to the default instead of becoming NaN', () => {
  for (const bad of ['abc', '5 attempts', 'NaN', 'Infinity', '-3', '0']) {
    process.env.T_VAL = bad;
    assert.equal(intFromEnv('T_VAL', 5), 5, bad);
  }
  process.env.T_VAL = '';
  assert.equal(intFromEnv('T_VAL', 5), 5);
  delete process.env.T_VAL;
  assert.equal(intFromEnv('T_VAL', 5), 5);
});

test('min can allow zero', () => {
  process.env.T_VAL = '0';
  assert.equal(intFromEnv('T_VAL', 400, { min: 0 }), 0);
  process.env.T_VAL = '-1';
  assert.equal(intFromEnv('T_VAL', 400, { min: 0 }), 400);
  delete process.env.T_VAL;
});
