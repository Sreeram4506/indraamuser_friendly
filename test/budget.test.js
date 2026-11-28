const test = require('node:test');
const assert = require('node:assert/strict');

// Set before the module loads: the limit is read once at start-up.
process.env.OPENAI_API_KEY = 'test-key-never-sent';
process.env.AI_DAILY_LIMIT = '2';
delete process.env.MONGODB_URI;

const core = require('../api/_lib/core');

test('the daily AI budget is spent after AI_DAILY_LIMIT calls', async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await core._internal.aiBudgetSpent(), false);
    assert.equal(await core._internal.aiBudgetSpent(), false);
    assert.equal(await core._internal.aiBudgetSpent(), true);
    assert.equal(await core._internal.aiBudgetSpent(), true);
  } finally {
    console.warn = warn;
  }
});

test('once spent, the agent answers 503 without calling the AI provider', async () => {
  const realFetch = global.fetch;
  let called = false;
  global.fetch = () => { called = true; throw new Error('must not be called'); };
  try {
    const res = await core.runAgent({ messages: [{ role: 'user', content: 'Do you build chatbots?' }] }, {});
    assert.equal(res.status, 503);
    assert.equal(called, false);
    const gaps = await core.runGaps({ description: 'A six-person ops team handling invoices' }, {});
    assert.equal(gaps.status, 503);
    assert.equal(called, false);
  } finally {
    global.fetch = realFetch;
  }
});
