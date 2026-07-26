/* POST /api/agent — hero chat panel. */
const { reject, readBody } = require('./_lib/guard');
const { runAgent } = require('./_lib/core');

module.exports = async function handler(req, res) {
  if (reject(req, res)) return;
  const { status, payload } = await runAgent(readBody(req), req.headers);
  res.status(status).json(payload);
};
