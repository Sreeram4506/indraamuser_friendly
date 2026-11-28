const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CONTACT_GLOBAL_PER_HOUR = '2';
delete process.env.MONGODB_URI;
delete process.env.CONTACT_WEBHOOK_URL;

const core = require('../api/_lib/core');

test('past the site-wide hourly ceiling, new submissions get a 429', async () => {
  const log = console.log;
  console.log = () => {};
  try {
    const send = (n) => core.runContact({ name: 'Visitor ' + n, email: `visitor${n}@example.com`, note: 'unique message ' + n + Math.random() }, {});
    assert.equal((await send(1)).status, 200);
    assert.equal((await send(2)).status, 200);
    const third = await send(3);
    assert.equal(third.status, 429);
  } finally {
    console.log = log;
  }
});
