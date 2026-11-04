/* Persistence. Everything lives in one localStorage entry; every access is guarded
 * because storage can be blocked (private windows, strict privacy settings). */

import { dateKey, previousDateKey } from './rng.js';

const KEY = 'sekaidle:v1';
const MAX_GUESSES = 6;
const KEEP_DAYS = 14;

const blank = () => ({ prefs: {}, sessions: {}, stats: {} });

let state = load();

function load() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw);
    return { ...blank(), ...parsed };
  } catch {
    return blank();
  }
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: play on in memory */
  }
}

export const store = {
  getPref(name, fallback) {
    return state.prefs[name] ?? fallback;
  },

  setPref(name, value) {
    state.prefs[name] = value;
    persist();
  },

  getSession(key) {
    return state.sessions[key] ?? null;
  },

  saveSession(session) {
    state.sessions[session.key] = session;
    prune();
    persist();
  },

  deleteSession(key) {
    delete state.sessions[key];
    persist();
  },

  getStats(game) {
    return {
      played: 0,
      wins: 0,
      streak: 0,
      best: 0,
      lastWon: null,
      distribution: Array(MAX_GUESSES).fill(0),
      ...state.stats[game],
    };
  },

  /** Record a finished daily puzzle. Idempotent per session via session.recorded. */
  recordDaily(session) {
    if (session.mode !== 'daily' || session.recorded) return;
    const stats = this.getStats(session.game);
    const won = session.status === 'won';
    stats.played += 1;
    if (won) {
      stats.wins += 1;
      stats.streak = stats.lastWon === previousDateKey(session.dateKey) ? stats.streak + 1 : 1;
      stats.best = Math.max(stats.best, stats.streak);
      stats.lastWon = session.dateKey;
      stats.distribution[session.guesses.length - 1] += 1;
    } else {
      stats.streak = 0;
    }
    state.stats[session.game] = stats;
    session.recorded = true;
    this.saveSession(session);
  },
};

function prune() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - KEEP_DAYS);
  const cutoff = dateKey(cutoffDate);
  for (const [key, session] of Object.entries(state.sessions)) {
    if (session.mode === 'daily' && session.dateKey < cutoff) {
      delete state.sessions[key];
    }
  }
}

export { MAX_GUESSES };
