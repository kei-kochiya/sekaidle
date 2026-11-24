/* Seeded randomness and date helpers, so every player gets the same daily puzzle. */

export const MS_PER_DAY = 86_400_000;

/** Puzzle #1 launched on 4 Nov 2026. */
const EPOCH_DAY = Math.round(Date.UTC(2026, 10, 4) / MS_PER_DAY);

export const pad2 = (n) => String(n).padStart(2, '0');

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

function parseDateParts(key) {
  if (typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const [y, m, d] = key.split('-').map(Number);
    if (Number.isFinite(y) && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return [y, m, d];
    }
  }
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()];
}

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Whole days since 1970-01-01 (UTC) for a YYYY-MM-DD key; matches card releaseDay numbers. */
export function epochDay(key) {
  const [y, m, d] = parseDateParts(key);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/** Puzzle number for a date key (1-based, DST-proof). */
export function puzzleNumber(key) {
  return epochDay(key) - EPOCH_DAY + 1;
}

/** Timestamp (ms) of the local midnight immediately following a YYYY-MM-DD date key. */
export function nextMidnightMs(key) {
  const [y, m, d] = parseDateParts(key);
  return new Date(y, m - 1, d + 1).getTime();
}

export function previousDateKey(key) {
  const [y, m, d] = parseDateParts(key);
  return dateKey(new Date(y, m - 1, d - 1));
}

export function formatDateKey(key) {
  const [y, m, d] = parseDateParts(key);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatEpochDay(days) {
  return new Date(days * MS_PER_DAY).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Daily answer for a fixed-size pool (such as the 26 characters): walk through a
 * seeded shuffle one entry per day so nothing repeats until the full pool is used.
 */
export function pickDaily(game, ids, key) {
  if (!ids.length) return null;
  const n = puzzleNumber(key) - 1;
  const cycle = Math.floor(n / ids.length);
  const position = ((n % ids.length) + ids.length) % ids.length;
  const order = shuffled(ids, mulberry32(hashString(`sekaidle:${game}:cycle:${cycle}`)));
  return order[position];
}

/**
 * Daily answer for an append-only growing card pool.
 *
 * Cards join the daily pool `delayDays` after their release day. Rather than re-shuffling
 * the whole array whenever new cards cross the delay threshold (which would alter a cycle's
 * Fisher-Yates permutation and cause earlier cards to repeat), each cycle starts with the
 * shuffled pool eligible on `cycleStartDay`, and any batch of cards crossing the delay
 * threshold during that cycle is shuffled independently and appended to the end of the cycle.
 *
 * Properties:
 * 1. Past and current daily answers never change when new cards are added.
 * 2. No card repeats within a cycle until every eligible card has been played.
 */
export function pickDailyCard(cards, key, delayDays = 14) {
  if (!cards.length) return null;
  const sorted = cards.slice().sort((a, b) => a.id - b.id);
  const eligOf = (card) => (card.releaseDay ?? card.d) + delayDays;
  const n = puzzleNumber(key) - 1;

  if (n < 0) {
    const base = sorted.filter((c) => eligOf(c) <= EPOCH_DAY);
    const pool = (base.length ? base : sorted).map((c) => c.id);
    return pickDaily('card', pool, key);
  }

  let cursor = 0;
  let cycle = 0;

  while (true) {
    const cycleStartDay = EPOCH_DAY + cursor;
    const initialCards = sorted.filter((c) => eligOf(c) <= cycleStartDay);
    const seedPool = (initialCards.length ? initialCards : sorted).map((c) => c.id);
    const deck = shuffled(seedPool, mulberry32(hashString(`sekaidle:card:cycle:${cycle}`)));
    const inDeck = new Set(deck);

    // Group cards becoming eligible after cycleStartDay by their exact eligibility day.
    const batchMap = new Map();
    for (const card of sorted) {
      if (inDeck.has(card.id)) continue;
      const eligDay = eligOf(card);
      if (!batchMap.has(eligDay)) batchMap.set(eligDay, []);
      batchMap.get(eligDay).push(card.id);
    }
    const batches = [...batchMap.entries()].sort((a, b) => a[0] - b[0]);

    for (const [eligDay, batchIds] of batches) {
      const offsetInCycle = eligDay - cycleStartDay;
      // If the current deck runs out before eligDay arrives, the cycle ends first.
      if (offsetInCycle > deck.length) break;
      const batchRand = mulberry32(hashString(`sekaidle:card:cycle:${cycle}:day:${eligDay}`));
      deck.push(...shuffled(batchIds, batchRand));
    }

    if (n < cursor + deck.length) {
      return deck[n - cursor];
    }
    cursor += deck.length;
    cycle += 1;
  }
}

/** A deterministic coin flip for the daily puzzle (e.g. normal vs trained art). */
export function dailyCoin(game, key) {
  return mulberry32(hashString(`sekaidle:${game}:coin:${key}`))() < 0.5;
}
