/* ==========================================================================
   MongoDB Atlas connection + logging.

   Two rules this file exists to enforce:

   1. The client is cached on globalThis. Serverless reuses a warm instance
      for many requests, and opening a new connection pool per invocation
      exhausts the Atlas connection limit fast.

   2. Logging NEVER breaks the site. Every write goes through `safeWrite`,
      which swallows its own errors. If Atlas is down, paused (free tier
      auto-pauses after inactivity) or misconfigured, visitors still get
      their answer — you just lose that log line.
   ========================================================================== */

const DB_NAME = process.env.MONGODB_DB || 'indraam';

const COLLECTIONS = {
  chats: 'chats',        // one doc per conversation, messages appended
  gaps: 'gap_runs',      // one doc per gap-finder run
  contacts: 'contacts',  // one doc per form submission
};

/* Cache across warm invocations. */
const cache = globalThis.__indraamMongo || (globalThis.__indraamMongo = { client: null, promise: null, indexed: false });

function configured() {
  return Boolean(process.env.MONGODB_URI);
}

async function getDb() {
  if (!configured()) return null;

  if (!cache.promise) {
    // Required lazily so the public endpoints still work if the package
    // isn't installed yet (e.g. someone deploys before `npm install`).
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
    });
    cache.promise = client.connect().then((c) => { cache.client = c; return c; });
  }

  const client = await cache.promise;
  const db = client.db(DB_NAME);

  if (!cache.indexed) {
    cache.indexed = true;
    ensureIndexes(db).catch((err) => console.warn('[indraam db] index setup skipped:', err.message));
  }
  return db;
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection(COLLECTIONS.chats).createIndex({ sessionId: 1 }, { unique: true }),
    db.collection(COLLECTIONS.chats).createIndex({ updatedAt: -1 }),
    db.collection(COLLECTIONS.gaps).createIndex({ createdAt: -1 }),
    db.collection(COLLECTIONS.contacts).createIndex({ createdAt: -1 }),
    db.collection(COLLECTIONS.contacts).createIndex({ status: 1, createdAt: -1 }),
  ]);
}

/** Run a write, absorbing every failure. Never await this on a hot path. */
function safeWrite(label, fn) {
  if (!configured()) return Promise.resolve(null);
  return (async () => {
    try {
      const db = await getDb();
      if (!db) return null;
      return await fn(db);
    } catch (err) {
      console.warn(`[indraam db] ${label} write failed:`, err.message);
      return null;
    }
  })();
}

/* --------------------------------------------------------------------------
   Request metadata — deliberately coarse.

   No IP address is stored. Vercel and Netlify both hand us an edge-resolved
   country header, which is enough to see where interest comes from without
   holding personal data.
   -------------------------------------------------------------------------- */
function meta(headers = {}) {
  const get = (k) => headers[k] || headers[k.toLowerCase()] || undefined;
  const ua = get('user-agent') || '';
  return {
    country: get('x-vercel-ip-country') || get('x-nf-geo-country') || get('cf-ipcountry') || null,
    referrer: (get('referer') || get('referrer') || null)?.slice(0, 300) || null,
    userAgent: ua.slice(0, 300) || null,
  };
}

/* --------------------------------------------------------------------------
   Writers
   -------------------------------------------------------------------------- */

/**
 * Append one question/answer turn to a conversation, creating it on first
 * contact. `sessionId` is generated in the browser and identifies the tab,
 * not the person.
 */
function logChatTurn({ sessionId, question, answer, ok, headers }) {
  return safeWrite('chat', async (db) => {
    const now = new Date();
    return db.collection(COLLECTIONS.chats).updateOne(
      { sessionId },
      {
        $setOnInsert: { sessionId, createdAt: now, meta: meta(headers) },
        $set: { updatedAt: now },
        $inc: { turns: 1 },
        $push: {
          messages: {
            $each: [{ at: now, question, answer, ok: ok !== false }],
            $slice: -60, // cap runaway conversations
          },
        },
      },
      { upsert: true }
    );
  });
}

function logGapRun({ sessionId, description, gaps, ok, error, headers }) {
  return safeWrite('gap', async (db) =>
    db.collection(COLLECTIONS.gaps).insertOne({
      sessionId: sessionId || null,
      description,
      gaps: gaps || [],
      ok: ok !== false,
      error: error || null,
      createdAt: new Date(),
      meta: meta(headers),
    })
  );
}

function logContact({ sessionId, name, email, note, delivered, headers }) {
  return safeWrite('contact', async (db) =>
    db.collection(COLLECTIONS.contacts).insertOne({
      sessionId: sessionId || null,
      name,
      email,
      note,
      delivered: Boolean(delivered),
      status: 'new', // new | read | replied | archived
      createdAt: new Date(),
      meta: meta(headers),
    })
  );
}

module.exports = { getDb, configured, safeWrite, COLLECTIONS, DB_NAME, logChatTurn, logGapRun, logContact, meta };
