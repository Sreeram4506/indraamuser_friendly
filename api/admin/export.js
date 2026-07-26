/* GET /api/admin/export?resource=chats|gaps|contacts — CSV download. */

const { requireAuth } = require('../_lib/auth');
const { getDb, configured, COLLECTIONS } = require('../_lib/db');

const LIMIT = 5000;

function cell(value) {
  if (value === null || value === undefined) return '';
  const s = value instanceof Date ? value.toISOString() : String(value);
  // Leading =, +, - or @ makes Excel treat a cell as a formula. Prefix with a
  // quote so an exported note can't execute in someone's spreadsheet.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCsv(headers, rows) {
  return [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n');
}

module.exports = async function handler(req, res) {
  if (requireAuth(req, res)) return;
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!configured()) { res.status(503).json({ error: 'MONGODB_URI is not set.' }); return; }

  const resource = (req.query && req.query.resource) || 'contacts';
  let db;
  try { db = await getDb(); } catch { res.status(503).json({ error: 'Could not reach the database.' }); return; }

  let headers;
  let rows;

  try {
    if (resource === 'contacts') {
      const docs = await db.collection(COLLECTIONS.contacts).find({}).sort({ createdAt: -1 }).limit(LIMIT).toArray();
      headers = ['Date', 'Name', 'Email', 'Note', 'Status', 'Delivered', 'Country'];
      rows = docs.map((d) => [d.createdAt, d.name, d.email, d.note, d.status, d.delivered, d.meta?.country]);
    } else if (resource === 'gaps') {
      const docs = await db.collection(COLLECTIONS.gaps).find({}).sort({ createdAt: -1 }).limit(LIMIT).toArray();
      headers = ['Date', 'Description', 'OK', 'Gap 1', 'Gap 2', 'Gap 3', 'Country'];
      rows = docs.map((d) => [
        d.createdAt, d.description, d.ok,
        d.gaps?.[0] ? `${d.gaps[0].title} — ${d.gaps[0].how}` : '',
        d.gaps?.[1] ? `${d.gaps[1].title} — ${d.gaps[1].how}` : '',
        d.gaps?.[2] ? `${d.gaps[2].title} — ${d.gaps[2].how}` : '',
        d.meta?.country,
      ]);
    } else if (resource === 'chats') {
      const docs = await db.collection(COLLECTIONS.chats).find({}).sort({ updatedAt: -1 }).limit(LIMIT).toArray();
      headers = ['Date', 'Session', 'Turn', 'Question', 'Answer', 'OK', 'Country'];
      rows = [];
      docs.forEach((d) => {
        (d.messages || []).forEach((m, i) => {
          rows.push([m.at, d.sessionId, i + 1, m.question, m.answer, m.ok, d.meta?.country]);
        });
      });
    } else {
      res.status(400).json({ error: 'Unknown resource' });
      return;
    }
  } catch (err) {
    console.error('[indraam admin] export failed', err.message);
    res.status(500).json({ error: 'Export failed.' });
    return;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="indraam-${resource}-${stamp}.csv"`);
  res.status(200).send('﻿' + toCsv(headers, rows)); // BOM so Excel reads UTF-8
};
