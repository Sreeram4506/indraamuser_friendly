/* ==========================================================================
   TOTP (RFC 6238) for the admin login — the 6-digit code from an
   authenticator app. Pure Node crypto, no dependency.

   Enabled by setting ADMIN_TOTP_SECRET (base32). Generate one with
   `npm run totp`, which also prints a QR code to scan.
   ========================================================================== */

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_MS = 30000;
const DIGITS = 6;
const MIN_SECRET_BYTES = 10; // 16 base32 characters

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Returns a Buffer, or null if the text is not valid base32. */
function base32Decode(text) {
  const clean = String(text || '').toUpperCase().replace(/[\s=-]/g, '');
  if (!clean) return null;
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret, counter, digits = DIGITS) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', secret).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

function secretBytes() {
  const raw = process.env.ADMIN_TOTP_SECRET;
  if (!raw) return null;
  const buf = base32Decode(raw);
  return buf && buf.length >= MIN_SECRET_BYTES ? buf : null;
}

/** True when a secret is set (valid or not). Used to fail closed on a typo. */
function requested() { return Boolean(process.env.ADMIN_TOTP_SECRET); }

/** True when a usable secret is set. */
function enabled() { return secretBytes() !== null; }

/**
 * Check a code. Accepts the previous, current and next 30-second step to
 * allow for clock drift. Returns the matching step number, or null.
 * All three candidates are compared in constant time.
 */
function check(code, now = Date.now()) {
  const secret = secretBytes();
  if (!secret) return null;
  const given = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(given)) return null;

  const step = Math.floor(now / STEP_MS);
  const want = Buffer.from(given);
  let matched = null;
  for (const drift of [-1, 0, 1]) {
    const candidate = Buffer.from(hotp(secret, step + drift));
    if (crypto.timingSafeEqual(candidate, want) && matched === null) matched = step + drift;
  }
  return matched;
}

function newSecret() { return base32Encode(crypto.randomBytes(20)); }

function otpauthUrl(secret, account = 'admin', issuer = 'Indraam') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=30`;
}

module.exports = { base32Encode, base32Decode, hotp, check, enabled, requested, newSecret, otpauthUrl, STEP_MS };
