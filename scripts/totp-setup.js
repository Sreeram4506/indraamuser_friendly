/* ==========================================================================
   npm run totp

   Makes a new authenticator-app secret for the admin login and shows how to
   switch it on. Prints a QR code to scan with Google Authenticator, 1Password,
   Authy or similar, plus the secret itself as a fallback.

   Nothing is saved: copy the secret into ADMIN_TOTP_SECRET yourself (in
   .env.local, and in the Vercel project settings), then redeploy.
   ========================================================================== */

const QRCode = require('qrcode');
const totp = require('../api/_lib/totp');

async function main() {
  const secret = totp.newSecret();
  const url = totp.otpauthUrl(secret, 'admin', 'Indraam');
  const qr = await QRCode.toString(url, { type: 'terminal', small: true });

  process.stdout.write(`
Scan this QR code with your authenticator app:

${qr}
Or enter this secret by hand (type: time-based):

  ${secret}

Then set it as an environment variable and redeploy:

  ADMIN_TOTP_SECRET=${secret}

  - locally:  add that line to .env.local
  - Vercel:   Project -> Settings -> Environment Variables -> add ADMIN_TOTP_SECRET

Once it is set, signing in at /admin asks for the 6-digit code as well as the password.
Keep the secret like a password. If you lose your phone, set a new secret to reset it.
`);
}

main().catch((err) => {
  process.stderr.write(`Could not create a secret: ${err.message}\n`);
  process.exit(1);
});
