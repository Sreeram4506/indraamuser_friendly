/* ==========================================================================
   GET /api/verify?id=IND-2026-XXXXXXXX            -> public certificate details
   GET /api/verify?id=IND-2026-XXXXXXXX&file=1     -> the certificate file itself

   Public and unauthenticated by design: this is what the QR code on a
   certificate points at. It only ever returns the fields in publicView().
   Admin-only fields (email, notes) never leave the database through here.
   ========================================================================== */

const { hit, clientIp } = require('./_lib/guard');
const { getDb, configured, COLLECTIONS } = require('./_lib/db');
const { normalizeId, publicView } = require('./_lib/certs');

const MAX_PER_MINUTE = Number(process.env.VERIFY_RATE_MAX || 40);

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  // Stops someone enumerating IDs. Per-instance and best-effort, like the other public routes.
  if (hit('verify:' + clientIp(req), MAX_PER_MINUTE, 60000)) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
    return;
  }

  const id = normalizeId((req.query || {}).id);
  if (!id) { res.status(404).json({ status: 'not_found' }); return; }

  if (!configured()) { res.status(503).json({ error: 'Verification is temporarily unavailable.' }); return; }

  try {
    const db = await getDb();
    const doc = await db.collection(COLLECTIONS.certificates).findOne({ certId: id });
    if (!doc) { res.status(404).json({ status: 'not_found' }); return; }

    const wantFile = String((req.query || {}).file || '') === '1';

    if (wantFile) {
      if (doc.status === 'revoked') { res.status(404).json({ status: 'not_found' }); return; }
      const f = await db.collection(COLLECTIONS.certificateFiles).findOne({ certId: id });
      if (!f || !f.data) { res.status(404).json({ status: 'not_found' }); return; }
      res.setHeader('Content-Type', f.mime);
      res.setHeader('Content-Disposition', `inline; filename="${id}.${f.mime === 'application/pdf' ? 'pdf' : f.mime === 'image/png' ? 'png' : 'jpg'}"`);
      res.status(200).send(Buffer.from(f.data.buffer));
      return;
    }

    const file = await db.collection(COLLECTIONS.certificateFiles).findOne({ certId: id }, { projection: { mime: 1 } });
    const view = publicView(doc, Boolean(file));
    view.fileType = view.hasFile ? file.mime : null;
    res.status(200).json(view);
  } catch (err) {
    console.error('[indraam verify] lookup failed', err.message);
    res.status(503).json({ error: 'Verification is temporarily unavailable.' });
  }
};
