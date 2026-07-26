/* ==========================================================================
   GET   /api/admin/data?resource=stats
   GET   /api/admin/data?resource=chats|gaps|contacts&q=&page=&limit=&status=
   PATCH /api/admin/data  { resource:'contacts', id, status }

   Every branch is behind requireAuth.
   ========================================================================== */

const { requireAuth } = require('../_lib/auth');
const { readBody } = require('../_lib/guard');
const { getDb, configured, COLLECTIONS } = require('../_lib/db');

const PAGE_MAX = 50;
const STATUSES = ['new', 'read', 'replied', 'archived'];

/** Escape user input before it reaches a $regex. */
function rx(term) {
  return new RegExp(String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function int(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function stats(db) {
  const dayAgo = new Date(Date.now() - 86400000);
  const weekAgo = new Date(Date.now() - 7 * 86400000);

  const [chats, gaps, contacts, newContacts, chats7, gaps7, turnAgg] = await Promise.all([
    db.collection(COLLECTIONS.chats).countDocuments(),
    db.collection(COLLECTIONS.gaps).countDocuments(),
    db.collection(COLLECTIONS.contacts).countDocuments(),
    db.collection(COLLECTIONS.contacts).countDocuments({ status: 'new' }),
    db.collection(COLLECTIONS.chats).countDocuments({ updatedAt: { $gte: weekAgo } }),
    db.collection(COLLECTIONS.gaps).countDocuments({ createdAt: { $gte: weekAgo } }),
    db.collection(COLLECTIONS.chats).aggregate([{ $group: { _id: null, turns: { $sum: '$turns' } } }]).toArray(),
  ]);

  const contacts24 = await db.collection(COLLECTIONS.contacts).countDocuments({ createdAt: { $gte: dayAgo } });

  return {
    chats, gaps, contacts, newContacts, chats7, gaps7, contacts24,
    questions: (turnAgg[0] && turnAgg[0].turns) || 0,
  };
}

async function list(db, resource, query) {
  const page = int(query.page, 1, 1, 10000);
  const limit = int(query.limit, 20, 1, PAGE_MAX);
  const skip = (page - 1) * limit;
  const q = (query.q || '').trim().slice(0, 120);

  let coll;
  let filter = {};
  let sort = { createdAt: -1 };

  if (resource === 'chats') {
    coll = COLLECTIONS.chats;
    sort = { updatedAt: -1 };
    if (q) filter = { $or: [{ 'messages.question': rx(q) }, { 'messages.answer': rx(q) }, { sessionId: rx(q) }] };
  } else if (resource === 'gaps') {
    coll = COLLECTIONS.gaps;
    if (q) filter = { $or: [{ description: rx(q) }, { 'gaps.title': rx(q) }] };
  } else if (resource === 'contacts') {
    coll = COLLECTIONS.contacts;
    if (q) filter = { $or: [{ name: rx(q) }, { email: rx(q) }, { note: rx(q) }] };
    if (query.status && STATUSES.includes(query.status)) filter.status = query.status;
  } else {
    return null;
  }

  const [items, total] = await Promise.all([
    db.collection(coll).find(filter).sort(sort).skip(skip).limit(limit).toArray(),
    db.collection(coll).countDocuments(filter),
  ]);

  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

module.exports = async function handler(req, res) {
  if (requireAuth(req, res)) return;

  if (!configured()) {
    res.status(503).json({ error: 'MONGODB_URI is not set — nothing is being recorded yet.' });
    return;
  }

  let db;
  try {
    db = await getDb();
  } catch (err) {
    console.error('[indraam admin] db connect failed', err.message);
    res.status(503).json({ error: 'Could not reach the database.' });
    return;
  }

  try {
    if (req.method === 'PATCH') {
      const body = readBody(req);
      if (body.resource !== 'contacts' || !STATUSES.includes(body.status)) {
        res.status(400).json({ error: 'Bad update' });
        return;
      }
      const { ObjectId } = require('mongodb');
      let id;
      try { id = new ObjectId(String(body.id)); } catch { res.status(400).json({ error: 'Bad id' }); return; }
      await db.collection(COLLECTIONS.contacts).updateOne({ _id: id }, { $set: { status: body.status } });
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const query = req.query || {};
    const resource = query.resource || 'stats';

    if (resource === 'stats') {
      res.status(200).json(await stats(db));
      return;
    }

    const result = await list(db, resource, query);
    if (!result) { res.status(400).json({ error: 'Unknown resource' }); return; }
    res.status(200).json(result);
  } catch (err) {
    console.error('[indraam admin] query failed', err.message);
    res.status(500).json({ error: 'Query failed.' });
  }
};
