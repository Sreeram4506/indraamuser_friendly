/* POST /api/contact — order-desk form. */
const { reject, readBody } = require('./_lib/guard');
const { runContact } = require('./_lib/core');

module.exports = async function handler(req, res) {
  if (reject(req, res)) return;
  const { status, payload } = await runContact(readBody(req), req.headers);
  res.status(status).json(payload);
};
