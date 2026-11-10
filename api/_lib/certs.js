/* ==========================================================================
   Certificate helpers shared by the admin and public-verify endpoints.

   A certificate has a random, hard-to-guess ID (IND-2026-K7M3Q9XA). The QR
   code printed on the certificate encodes https://<site>/verify?id=<ID>, so
   scanning it lands on the public verify page, which looks the ID up here.
   ========================================================================== */

const crypto = require('crypto');

// 32 characters with no 0/O/1/I, so an ID read aloud or typed by hand is
// unambiguous. 32 divides 256, so `byte % 32` is unbiased.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ID_RE = /^IND-\d{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

const MAX_FILE_BYTES = 3 * 1024 * 1024; // keeps the base64 upload under Vercel's 4.5 MB body limit

function newId() {
  const bytes = crypto.randomBytes(8);
  let tail = '';
  for (let i = 0; i < 8; i += 1) tail += ALPHABET[bytes[i] % 32];
  return `IND-${new Date().getFullYear()}-${tail}`;
}

/** Upper-case, trim, and reject anything that is not a well-formed ID. */
function normalizeId(input) {
  const id = String(input || '').trim().toUpperCase();
  return ID_RE.test(id) ? id : null;
}

function baseUrl() {
  return String(process.env.PUBLIC_BASE_URL || 'https://www.indraam.com').replace(/\/+$/, '');
}

function verifyUrl(id) {
  return `${baseUrl()}/verify?id=${encodeURIComponent(id)}`;
}

/** Identify the real file type from its bytes — never trust the filename or declared MIME. */
function detectType(buf) {
  if (!buf || buf.length < 8) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

/** Only these fields ever reach the public verify page. */
function publicView(doc, hasFile) {
  return {
    status: doc.status === 'revoked' ? 'revoked' : 'valid',
    certId: doc.certId,
    name: doc.name,
    program: doc.program,
    startDate: doc.startDate || null,
    endDate: doc.endDate || null,
    issuedOn: doc.issuedOn || null,
    hasFile: Boolean(hasFile) && doc.status !== 'revoked',
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function cleanDate(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) return undefined; // undefined = invalid
  return s;
}

function cleanText(v, max) {
  return String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

module.exports = { ALPHABET, MAX_FILE_BYTES, newId, normalizeId, baseUrl, verifyUrl, detectType, publicView, cleanDate, cleanText };
