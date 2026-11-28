/* ==========================================================================
   Shared rate limiting.

   The old limiter lived in each function instance's memory, so every cold
   start reset it and concurrent instances didn't share it. This one counts in
   MongoDB (one atomic update per call), so the budget holds across instances.
   When the database isn't configured, or errors, general limits fall back to
   memory so a limiter problem never takes the site down.

   Three tools:

   - consume(key, max, windowMs)   general rate limit, fixed clock windows.
   - strike(key, {max, windowMs})  failure counter for logins. Counts BEFORE
                                   the check, so parallel requests can't slip
                                   through, and the lockout runs for a full
                                   window from the failure that tripped it.
   - claim(key, ttlMs)             "first one wins" marker, e.g. a TOTP code
                                   that must only be used once.

   `strict: true` on strike/claim means: if the database is configured but
   unreachable, throw LimiterUnavailableError instead of quietly falling back
   to a per-instance memory counter. Use it where degrading would weaken
   security (the admin login).
   ========================================================================== */

const { getDb, configured, COLLECTIONS } = require('./db');

const memory = new Map(); // id -> { count, expires, resetAt? }
const MEMORY_CAP = 5000;
const MEMORY_LOW_WATER = Math.floor(MEMORY_CAP * 0.9);
const EXPIRY_GRACE_MS = 60000; // keep documents a little past their window so TTL cleanup never races a read
let warned = false;

class LimiterUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LimiterUnavailableError';
  }
}

/* ------------------------------------------------------------------ memory */

/** Store an entry, keeping the map bounded: drop expired ones, then the oldest, down to 90% of the cap. */
function remember(id, entry) {
  memory.set(id, entry);
  if (memory.size <= MEMORY_CAP) return;
  const now = Date.now();
  for (const [k, v] of memory) if (now > v.expires) memory.delete(k);
  while (memory.size > MEMORY_LOW_WATER) memory.delete(memory.keys().next().value);
}

function memoryBump(id, expires) {
  const now = Date.now();
  const hit = memory.get(id);
  if (!hit || now > hit.expires) {
    remember(id, { count: 1, expires });
    return 1;
  }
  hit.count += 1;
  return hit.count;
}

function memoryPeek(id) {
  const hit = memory.get(id);
  return hit && Date.now() <= hit.expires ? hit.count : 0;
}

function degrade(err) {
  if (!warned) {
    warned = true;
    console.warn('[indraam limits] database limiter unavailable, using memory:', err.message);
  }
}

/** Run a database operation. Strict callers get a LimiterUnavailableError; others get null (use memory). */
async function withDb(strict, fn) {
  if (!configured()) return null;
  try {
    return await fn((await getDb()).collection(COLLECTIONS.rateLimits));
  } catch (err) {
    if (strict) throw new LimiterUnavailableError(err.message);
    degrade(err);
    return null;
  }
}

/* ----------------------------------------------------------------- consume */

function bucketOf(windowMs) { return Math.floor(Date.now() / windowMs); }

/**
 * Count one event against `key` and report whether the caller is now over
 * `max` for the current clock window.
 * @returns {Promise<{count:number, limited:boolean}>}
 */
async function consume(key, max, windowMs) {
  const bucket = bucketOf(windowMs);
  const id = `${key}:${bucket}`;
  const expires = (bucket + 1) * windowMs;

  const fromDb = await withDb(false, async (coll) => {
    const update = { $inc: { count: 1 }, $setOnInsert: { expireAt: new Date(expires + EXPIRY_GRACE_MS) } };
    let doc;
    try {
      doc = await coll.findOneAndUpdate({ _id: id }, update, { upsert: true, returnDocument: 'after' });
    } catch (err) {
      if (err && err.code === 11000) doc = await coll.findOneAndUpdate({ _id: id }, update, { returnDocument: 'after' });
      else throw err;
    }
    return (doc && doc.count) || 1;
  });

  const total = fromDb === null ? memoryBump(id, expires) : fromDb;
  return { count: total, limited: total > max };
}

/** Read the current count of a clock window without adding to it. */
async function count(key, windowMs) {
  const id = `${key}:${bucketOf(windowMs)}`;
  const fromDb = await withDb(false, async (coll) => {
    const doc = await coll.findOne({ _id: id }, { projection: { count: 1 } });
    return (doc && doc.count) || 0;
  });
  return fromDb === null ? memoryPeek(id) : fromDb;
}

/**
 * Check several windows at once (e.g. per minute AND per hour AND per day).
 * Every window is counted even if an earlier one is already over, so a
 * hammering client stays blocked rather than slipping through on the next one.
 * Returns the first limited window, or null.
 */
async function consumeAll(key, rules) {
  let blocked = null;
  for (const r of rules) {
    const res = await consume(`${key}:${r.windowMs}`, r.max, r.windowMs);
    if (res.limited && !blocked) blocked = { windowMs: r.windowMs, max: r.max, count: res.count };
  }
  return blocked;
}

/* ------------------------------------------------------------------ strike */

/**
 * Record one attempt and say whether the caller is over the limit.
 *
 * The window starts at the first attempt. When the count reaches `max`, the
 * window restarts from that moment, so a lockout lasts a full `windowMs` from
 * the attempt that tripped it (not until some clock boundary). Attempts past
 * `max` are `limited`. Call this BEFORE checking the secret, and `release()`
 * on success: counting first is what stops a burst of parallel guesses from
 * all passing a "check, then count" gate.
 *
 * @returns {Promise<{count:number, limited:boolean, retryAfterMs:number}>}
 */
async function strike(key, { max, windowMs, strict = false }) {
  const now = Date.now();

  const doc = await withDb(strict, async (coll) => {
    const pipeline = [
      { $set: { _fresh: { $lte: [{ $ifNull: ['$resetAt', 0] }, now] } } },
      {
        $set: {
          count: { $cond: ['$_fresh', 1, { $add: [{ $ifNull: ['$count', 0] }, 1] }] },
          resetAt: { $cond: ['$_fresh', now + windowMs, '$resetAt'] },
        },
      },
      { $set: { resetAt: { $cond: [{ $eq: ['$count', max] }, now + windowMs, '$resetAt'] } } },
      { $set: { expireAt: { $toDate: { $add: ['$resetAt', EXPIRY_GRACE_MS] } } } },
      { $unset: '_fresh' },
    ];
    try {
      return await coll.findOneAndUpdate({ _id: key }, pipeline, { upsert: true, returnDocument: 'after' });
    } catch (err) {
      if (err && err.code === 11000) return coll.findOneAndUpdate({ _id: key }, pipeline, { returnDocument: 'after' });
      throw err;
    }
  });

  if (doc) return { count: doc.count, limited: doc.count > max, retryAfterMs: Math.max(0, doc.resetAt - now) };

  let entry = memory.get(key);
  if (!entry || now >= entry.resetAt) entry = { count: 0, resetAt: now + windowMs, expires: now + windowMs + EXPIRY_GRACE_MS };
  entry.count += 1;
  if (entry.count === max) {
    entry.resetAt = now + windowMs;
    entry.expires = entry.resetAt + EXPIRY_GRACE_MS;
  }
  remember(key, entry);
  return { count: entry.count, limited: entry.count > max, retryAfterMs: Math.max(0, entry.resetAt - now) };
}

/** Undo one strike, e.g. after a successful login. Never throws. */
async function release(key) {
  const done = await withDb(false, async (coll) => {
    await coll.updateOne({ _id: key, count: { $gt: 0 } }, { $inc: { count: -1 } });
    return true;
  });
  if (done) return;
  const entry = memory.get(key);
  if (entry && entry.count > 0) entry.count -= 1;
}

/* ------------------------------------------------------------------- claim */

/**
 * Atomically claim `key` for `ttlMs`. True for the first caller, false for
 * anyone who asks again before it expires.
 */
async function claim(key, ttlMs, { strict = false } = {}) {
  const fresh = await withDb(strict, async (coll) => {
    try {
      const res = await coll.updateOne({ _id: key }, { $setOnInsert: { expireAt: new Date(Date.now() + ttlMs) } }, { upsert: true });
      return res.upsertedCount === 1;
    } catch (err) {
      if (err && err.code === 11000) return false;
      throw err;
    }
  });
  if (fresh !== null) return fresh;

  const now = Date.now();
  const hit = memory.get(key);
  if (hit && now <= hit.expires) return false;
  remember(key, { count: 1, expires: now + ttlMs });
  return true;
}

/** Test hooks. */
function _reset() { memory.clear(); warned = false; }
function _memorySize() { return memory.size; }

module.exports = { consume, count, consumeAll, strike, release, claim, LimiterUnavailableError, _reset, _memorySize };
