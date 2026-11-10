/* ==========================================================================
   Certificate management. Every branch is behind requireAuth.

   GET    /api/admin/certificates?q=&page=            list
   GET    /api/admin/certificates?id=ID&qr=png|svg    QR code that points at /verify?id=ID
   GET    /api/admin/certificates?id=ID&file=1        the uploaded certificate file
   POST   { action:'create', name, program, startDate, endDate, issuedOn, email, note }
   POST   { action:'upload', certId, filename, dataBase64 }   attach / replace the file
   POST   { action:'removeFile', certId }
   PATCH  { certId, status?, name?, program?, startDate?, endDate?, issuedOn?, email?, note? }
   DELETE ?id=ID                                      removes the record and its file

   Workflow: create the record -> download the QR -> place it on the
   certificate design -> export the finished certificate -> upload it here.
   ========================================================================== */

const { requireAuth } = require('../_lib/auth');
const { readBody } = require('../_lib/guard');
const { getDb, configured, COLLECTIONS } = require('../_lib/db');
const certs = require('../_lib/certs');

const PAGE = 25;

function today() { return new Date().toISOString().slice(0, 10); }

/** What the admin list sees: everything except the file bytes. */
function adminView(doc, hasFile) {
  return {
    certId: doc.certId,
    name: doc.name,
    program: doc.program,
    startDate: doc.startDate || null,
    endDate: doc.endDate || null,
    issuedOn: doc.issuedOn || null,
    email: doc.email || '',
    note: doc.note || '',
    status: doc.status === 'revoked' ? 'revoked' : 'valid',
    hasFile: Boolean(hasFile),
    createdAt: doc.createdAt,
    verifyUrl: certs.verifyUrl(doc.certId),
  };
}

/** Validate the editable fields. Returns { fields } or { error }. */
function readFields(body, { requireCore }) {
  const fields = {};
  if (body.name !== undefined || requireCore) {
    fields.name = certs.cleanText(body.name, 120);
    if (!fields.name) return { error: 'Name is required.' };
  }
  if (body.program !== undefined || requireCore) {
    fields.program = certs.cleanText(body.program, 160);
    if (!fields.program) return { error: 'Program or role is required.' };
  }
  for (const key of ['startDate', 'endDate', 'issuedOn']) {
    if (body[key] !== undefined) {
      const d = certs.cleanDate(body[key]);
      if (d === undefined) return { error: `${key} must be a date like 2026-07-31.` };
      fields[key] = d;
    }
  }
  if (body.email !== undefined) fields.email = certs.cleanText(body.email, 200);
  if (body.note !== undefined) fields.note = certs.cleanText(body.note, 500);
  if (fields.startDate && fields.endDate && fields.endDate < fields.startDate) {
    return { error: 'End date is before the start date.' };
  }
  return { fields };
}

async function qr(res, id, format) {
  let QRCode;
  try { QRCode = require('qrcode'); } catch { res.status(500).json({ error: 'The qrcode package is not installed. Run npm install.' }); return; }
  const url = certs.verifyUrl(id);
  // High error correction: the code gets printed, resized and sometimes scuffed.
  const opts = { errorCorrectionLevel: 'H', margin: 2 };
  if (format === 'svg') {
    const svg = await QRCode.toString(url, Object.assign({ type: 'svg' }, opts));
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Content-Disposition', `attachment; filename="${id}-qr.svg"`);
    res.status(200).send(svg);
    return;
  }
  const png = await QRCode.toBuffer(url, Object.assign({ type: 'png', width: 1200 }, opts));
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="${id}-qr.png"`);
  res.status(200).send(png);
}

module.exports = async function handler(req, res) {
  if (requireAuth(req, res)) return;

  if (!configured()) {
    res.status(503).json({ error: 'MONGODB_URI is not set — certificates cannot be stored yet.' });
    return;
  }

  let db;
  try { db = await getDb(); } catch (err) {
    console.error('[indraam certificates] db connect failed', err.message);
    res.status(503).json({ error: 'Could not reach the database.' });
    return;
  }

  const certsColl = db.collection(COLLECTIONS.certificates);
  const filesColl = db.collection(COLLECTIONS.certificateFiles);
  const query = req.query || {};

  try {
    /* ------------------------------------------------------------- GET */
    if (req.method === 'GET') {
      if (query.id) {
        const id = certs.normalizeId(query.id);
        if (!id || !(await certsColl.findOne({ certId: id }, { projection: { _id: 1 } }))) {
          res.status(404).json({ error: 'Certificate not found.' });
          return;
        }
        if (query.qr) { await qr(res, id, query.qr === 'svg' ? 'svg' : 'png'); return; }
        if (String(query.file) === '1') {
          const f = await filesColl.findOne({ certId: id });
          if (!f) { res.status(404).json({ error: 'No file uploaded yet.' }); return; }
          res.setHeader('Content-Type', f.mime);
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.status(200).send(Buffer.from(f.data.buffer));
          return;
        }
        res.status(400).json({ error: 'Specify qr=png|svg or file=1.' });
        return;
      }

      const page = Math.max(1, parseInt(query.page, 10) || 1);
      const q = String(query.q || '').trim().slice(0, 80);
      const filter = q
        ? { $or: ['name', 'program', 'certId', 'email'].map((k) => ({ [k]: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })) }
        : {};
      const [docs, total] = await Promise.all([
        certsColl.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).toArray(),
        certsColl.countDocuments(filter),
      ]);
      const withFiles = new Set(
        (await filesColl.find({ certId: { $in: docs.map((d) => d.certId) } }, { projection: { certId: 1 } }).toArray()).map((f) => f.certId)
      );
      res.status(200).json({ items: docs.map((d) => adminView(d, withFiles.has(d.certId))), total, page, pages: Math.max(1, Math.ceil(total / PAGE)) });
      return;
    }

    /* ------------------------------------------------------------ POST */
    if (req.method === 'POST') {
      const body = readBody(req);
      const action = body.action || 'create';

      if (action === 'create') {
        const parsed = readFields(body, { requireCore: true });
        if (parsed.error) { res.status(400).json({ error: parsed.error }); return; }
        const now = new Date();
        const base = Object.assign({ issuedOn: today(), startDate: null, endDate: null, email: '', note: '' }, parsed.fields, { status: 'valid', createdAt: now, updatedAt: now });
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const doc = Object.assign({ certId: certs.newId() }, base);
          try {
            await certsColl.insertOne(doc);
            res.status(201).json(adminView(doc, false));
            return;
          } catch (err) {
            if (err && err.code === 11000) continue; // ID collision: draw another
            throw err;
          }
        }
        res.status(500).json({ error: 'Could not allocate a certificate ID. Try again.' });
        return;
      }

      const id = certs.normalizeId(body.certId);
      if (!id || !(await certsColl.findOne({ certId: id }, { projection: { _id: 1 } }))) {
        res.status(404).json({ error: 'Certificate not found.' });
        return;
      }

      if (action === 'upload') {
        const raw = String(body.dataBase64 || '').replace(/^data:[^;]+;base64,/, '');
        if (!raw) { res.status(400).json({ error: 'No file received.' }); return; }
        const buf = Buffer.from(raw, 'base64');
        if (buf.length > certs.MAX_FILE_BYTES) { res.status(413).json({ error: 'File is larger than 3 MB.' }); return; }
        const mime = certs.detectType(buf);
        if (!mime) { res.status(400).json({ error: 'Upload a PNG, JPG or PDF file.' }); return; }
        const { Binary } = require('mongodb');
        await filesColl.updateOne(
          { certId: id },
          { $set: { certId: id, mime, size: buf.length, name: certs.cleanText(body.filename, 160), data: new Binary(buf), uploadedAt: new Date() } },
          { upsert: true }
        );
        await certsColl.updateOne({ certId: id }, { $set: { updatedAt: new Date() } });
        res.status(200).json({ ok: true, mime, size: buf.length });
        return;
      }

      if (action === 'removeFile') {
        await filesColl.deleteOne({ certId: id });
        res.status(200).json({ ok: true });
        return;
      }

      res.status(400).json({ error: 'Unknown action.' });
      return;
    }

    /* ----------------------------------------------------------- PATCH */
    if (req.method === 'PATCH') {
      const body = readBody(req);
      const id = certs.normalizeId(body.certId);
      if (!id) { res.status(400).json({ error: 'Bad certificate ID.' }); return; }
      const parsed = readFields(body, { requireCore: false });
      if (parsed.error) { res.status(400).json({ error: parsed.error }); return; }
      const set = Object.assign({}, parsed.fields, { updatedAt: new Date() });
      if (body.status !== undefined) {
        if (body.status !== 'valid' && body.status !== 'revoked') { res.status(400).json({ error: 'Status must be valid or revoked.' }); return; }
        set.status = body.status;
        set.revokedAt = body.status === 'revoked' ? new Date() : null;
      }
      const r = await certsColl.updateOne({ certId: id }, { $set: set });
      if (!r.matchedCount) { res.status(404).json({ error: 'Certificate not found.' }); return; }
      const doc = await certsColl.findOne({ certId: id });
      const hasFile = Boolean(await filesColl.findOne({ certId: id }, { projection: { _id: 1 } }));
      res.status(200).json(adminView(doc, hasFile));
      return;
    }

    /* ---------------------------------------------------------- DELETE */
    if (req.method === 'DELETE') {
      const id = certs.normalizeId(query.id);
      if (!id) { res.status(400).json({ error: 'Bad certificate ID.' }); return; }
      await Promise.all([certsColl.deleteOne({ certId: id }), filesColl.deleteOne({ certId: id })]);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[indraam certificates] request failed', err.message);
    res.status(500).json({ error: 'Request failed.' });
  }
};
