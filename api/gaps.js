/* POST /api/gaps — AI gap finder. */
const { reject, readBody } = require('./_lib/guard');
const { runGaps } = require('./_lib/core');

module.exports = async function handler(req, res) {
  if (reject(req, res)) return;
  const { status, payload } = await runGaps(readBody(req), req.headers);
  res.status(status).json(payload);
};
