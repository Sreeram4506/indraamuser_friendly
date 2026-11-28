/* Read numeric settings from the environment without letting a typo turn a protection off. */

/**
 * A whole number from process.env[name], or `fallback` when it is unset,
 * not a number, or below `min`. Number('abc') is NaN, and every comparison
 * with NaN is false, which would silently disable a limit.
 */
function intFromEnv(name, fallback, { min = 1 } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
}

module.exports = { intFromEnv };
