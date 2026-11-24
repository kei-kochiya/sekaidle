/* Persistence. Everything lives in one localStorage entry; every access is guarded,
 * schema-validated, and applied as an atomic delta onto the latest disk state. */

import { MAX_GUESSES } from './data.js';
import { dateKey, previousDateKey } from './rng.js';

export const STORAGE_KEY = 'sekaidle:v1';
const KEEP_DAYS = 14;

const VALID_GAMES = new Set(['character', 'card']);
const VALID_MODES = new Set(['daily', 'random']);
const VALID_STATUSES = new Set(['playing', 'won', 'lost']);
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isNonNegInt = (v) => Number.isInteger(v) && v >= 0;
const isSafeKey = (k) => typeof k === 'string' && !UNSAFE_KEYS.has(k);

const blank = () => ({ prefs: {}, sessions: {}, stats: {} });

function sanitizeSession(key, raw) {
  if (!isSafeKey(key) || !isPlainObject(raw)) return null;
  if (!VALID_GAMES.has(raw.game) || !VALID_MODES.has(raw.mode)) return null;
  if (!VALID_STATUSES.has(raw.status) || !Number.isInteger(raw.answer)) return null;
  if (raw.mode === 'daily' && (typeof raw.dateKey !== 'string' || !DATE_KEY_RE.test(raw.dateKey))) {
    return null;
  }
  if (!Array.isArray(raw.guesses) || raw.guesses.length > MAX_GUESSES) return null;
  if (!raw.guesses.every((id) => Number.isInteger(id))) return null;
  if (raw.status === 'playing' && raw.guesses.length >= MAX_GUESSES) return null;
  if (raw.status === 'won' && raw.guesses.length === 0) return null;

  const session = {
    key,
    game: raw.game,
    mode: raw.mode,
    dateKey: raw.mode === 'daily' ? raw.dateKey : null,
    guesses: raw.guesses.slice(),
    status: raw.status,
    answer: raw.answer,
  };
  if (typeof raw.trained === 'boolean') session.trained = raw.trained;
  if (Array.isArray(raw.arts)) {
    session.arts = raw.guesses.map((_, i) =>
      typeof raw.arts[i] === 'boolean' ? raw.arts[i] : undefined,
    );
  }
  if (raw.recorded === true) session.recorded = true;
  return session;
}

function sanitizeStatsEntry(raw) {
  const base = {
    played: 0,
    wins: 0,
    streak: 0,
    best: 0,
    lastWon: null,
    distribution: Array(MAX_GUESSES).fill(0),
  };
  if (!isPlainObject(raw)) return base;
  if (isNonNegInt(raw.played)) base.played = raw.played;
  if (isNonNegInt(raw.wins)) base.wins = Math.min(raw.wins, base.played);
  if (isNonNegInt(raw.streak)) base.streak = raw.streak;
  if (isNonNegInt(raw.best)) base.best = Math.max(raw.best, base.streak);
  if (typeof raw.lastWon === 'string' && DATE_KEY_RE.test(raw.lastWon)) base.lastWon = raw.lastWon;
  if (Array.isArray(raw.distribution) && raw.distribution.length === MAX_GUESSES) {
    base.distribution = raw.distribution.map((n) => (isNonNegInt(n) ? n : 0));
  }
  return base;
}

function sanitizeState(parsed) {
  const clean = blank();
  if (!isPlainObject(parsed)) return clean;

  if (isPlainObject(parsed.prefs)) {
    for (const [k, v] of Object.entries(parsed.prefs)) {
      if (!isSafeKey(k)) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        clean.prefs[k] = v;
      }
    }
  }
  if (isPlainObject(parsed.sessions)) {
    for (const [k, v] of Object.entries(parsed.sessions)) {
      if (!isSafeKey(k)) continue;
      const s = sanitizeSession(k, v);
      if (s) clean.sessions[k] = s;
    }
  }
  if (isPlainObject(parsed.stats)) {
    for (const game of VALID_GAMES) {
      if (parsed.stats[game] !== undefined) {
        clean.stats[game] = sanitizeStatsEntry(parsed.stats[game]);
      }
    }
  }
  return clean;
}

/** Used when `localStorage` is blocked or after a quota failure so in-memory progress is never lost. */
let memoryFallback = blank();
let diskWriteFailed = false;

function readCurrentState() {
  if (diskWriteFailed) return memoryFallback;
  try {
    const storage = globalThis.localStorage;
    if (!storage) return memoryFallback;
    const raw = storage.getItem(STORAGE_KEY);
    const loaded = raw ? sanitizeState(JSON.parse(raw)) : blank();
    memoryFallback = loaded;
    return loaded;
  } catch {
    return memoryFallback;
  }
}

function updateState(mutator) {
  const current = readCurrentState();
  mutator(current);
  memoryFallback = current;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(current));
    diskWriteFailed = false;
  } catch {
    diskWriteFailed = true;
  }
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      diskWriteFailed = false;
      readCurrentState();
    }
  });
}

function pruneDailySessions(sessions) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - KEEP_DAYS);
  const cutoff = dateKey(cutoffDate);
  for (const [key, session] of Object.entries(sessions)) {
    if (session?.mode === 'daily' && typeof session.dateKey === 'string' && session.dateKey < cutoff) {
      delete sessions[key];
    }
  }
}

export const store = {
  getPref(name, fallback) {
    if (!isSafeKey(name)) return fallback;
    return readCurrentState().prefs[name] ?? fallback;
  },

  setPref(name, value) {
    if (!isSafeKey(name)) return;
    updateState((current) => {
      current.prefs[name] = value;
    });
  },

  getSession(key) {
    if (!isSafeKey(key)) return null;
    return readCurrentState().sessions[key] ?? null;
  },

  saveSession(session) {
    if (!session || !isSafeKey(session.key)) return;
    updateState((current) => {
      // Preserve recorded=true if another tab already completed and recorded this daily puzzle.
      if (current.sessions[session.key]?.recorded) {
        session.recorded = true;
      }
      current.sessions[session.key] = session;
      if (session.mode === 'daily') pruneDailySessions(current.sessions);
    });
  },

  deleteSession(key) {
    if (!isSafeKey(key)) return;
    updateState((current) => {
      delete current.sessions[key];
    });
  },

  getStats(game) {
    const entry = sanitizeStatsEntry(readCurrentState().stats[game]);
    return { ...entry, distribution: [...entry.distribution] };
  },

  /** Record a finished daily puzzle. Idempotent across reloads and concurrent tabs. */
  recordDaily(session) {
    if (!session || session.mode !== 'daily' || session.recorded || !isSafeKey(session.key)) return;
    updateState((current) => {
      if (current.sessions[session.key]?.recorded) {
        session.recorded = true;
        return;
      }

      const baseStats = sanitizeStatsEntry(current.stats[session.game]);
      const stats = { ...baseStats, distribution: [...baseStats.distribution] };
      const won = session.status === 'won';
      const isNewerDate = !stats.lastWon || session.dateKey > stats.lastWon;

      stats.played += 1;
      if (won) {
        stats.wins += 1;
        const bucket = Math.min(Math.max(session.guesses.length - 1, 0), MAX_GUESSES - 1);
        stats.distribution[bucket] += 1;
        if (isNewerDate) {
          stats.streak = stats.lastWon === previousDateKey(session.dateKey) ? stats.streak + 1 : 1;
          stats.best = Math.max(stats.best, stats.streak);
          stats.lastWon = session.dateKey;
        }
      } else if (isNewerDate) {
        stats.streak = 0;
      }

      current.stats[session.game] = stats;
      session.recorded = true;
      current.sessions[session.key] = session;
      pruneDailySessions(current.sessions);
    });
  },
};
