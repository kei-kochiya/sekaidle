/* Seeded randomness and date helpers, so every player gets the same daily puzzle. */

/** 32-bit string hash (xmur3). */
export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Small, fast, deterministic PRNG. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(list, rand) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const EPOCH = Date.UTC(2026, 10, 4); // puzzle #1 = 4 Nov 2026

/** Whole days since 1970-01-01 (UTC) for a YYYY-MM-DD key; matches the card release-day numbers in the data. */
export function epochDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** Puzzle number for a date key (1-based, DST-proof). */
export function puzzleNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000) + 1;
}

export function msUntilTomorrow(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function previousDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d - 1));
}

export function formatDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Daily answer: walk through a shuffled copy of the pool, one entry per day, so
 * nothing repeats until the whole pool has been used. A new shuffle starts each cycle.
 */
export function pickDaily(game, ids, key) {
  const n = puzzleNumber(key) - 1;
  const cycle = Math.floor(n / ids.length);
  const position = ((n % ids.length) + ids.length) % ids.length;
  const order = shuffled(ids, mulberry32(hashString(`sekaidle:${game}:cycle:${cycle}`)));
  return order[position];
}

/** A deterministic coin flip for the daily puzzle (e.g. normal vs trained art). */
export function dailyCoin(game, key) {
  return mulberry32(hashString(`sekaidle:${game}:coin:${key}`))() < 0.5;
}
