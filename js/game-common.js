/* Pieces both games share: sessions, the guess gauge, tiles, avatars, sharing. */

import { h, icon, copyText, announce } from './dom.js';
import { store, MAX_GUESSES } from './store.js';
import { msUntilTomorrow } from './rng.js';

/* ---------- sessions ---------- */

/**
 * A session is one puzzle in progress: the answer, the guesses so far, and a status.
 * Dailies are keyed by date so reloading never rerolls; the random puzzle is a single
 * saved slot that survives reloads until the player asks for a new one.
 */
export function ensureSession({ game, mode, dateKey, createAnswer }) {
  const key = mode === 'daily' ? `${game}:daily:${dateKey}` : `${game}:random`;
  let session = store.getSession(key);
  if (!session) {
    session = {
      key,
      game,
      mode,
      dateKey: mode === 'daily' ? dateKey : null,
      guesses: [],
      status: 'playing',
      ...createAnswer(),
    };
    store.saveSession(session);
  }
  return session;
}

export function resetRandomSession(game, createAnswer) {
  store.deleteSession(`${game}:random`);
  return ensureSession({ game, mode: 'random', dateKey: null, createAnswer });
}

/**
 * Record a guess. By default it wins when `id` is the answer; a game whose guesses carry more
 * than an id (the card game's art variant) passes `correct` itself. `art` is stored alongside
 * the guess, index for index, so older saved sessions without it keep working.
 */
export function applyGuess(session, id, { correct = id === session.answer, art } = {}) {
  session.guesses.push(id);
  if (art !== undefined) {
    session.arts ??= [];
    session.arts[session.guesses.length - 1] = art;
  }
  if (correct) session.status = 'won';
  else if (session.guesses.length >= MAX_GUESSES) session.status = 'lost';
  store.saveSession(session);
  if (session.status !== 'playing') store.recordDaily(session);
  return session.status;
}

/** Give up on the random puzzle: reveals the answer and counts as a loss (not tracked). */
export function forfeit(session) {
  session.status = 'lost';
  store.saveSession(session);
}

/* ---------- the guess gauge: six slanted bars, like a rhythm-game life meter ---------- */

export function createGauge() {
  const bars = Array.from({ length: MAX_GUESSES }, () => h('i'));
  const el = h('div', { class: 'gauge', role: 'img' }, bars);
  return {
    el,
    set(used, status) {
      el.setAttribute('aria-label', `${used} of ${MAX_GUESSES} guesses used`);
      bars.forEach((bar, i) => {
        bar.className = i < used ? 'is-used' : '';
        if (status === 'won' && i === used - 1) bar.className = 'is-hit';
      });
    },
  };
}

/* ---------- tiles ---------- */

const MARKS = { correct: 'check', wrong: 'x', higher: 'up', lower: 'down' };

const KIND_LABELS = {
  school: 'School',
  birthday: 'Birthday',
  height: 'Height',
  attr: 'Attribute',
  group: 'Group',
  character: 'Character',
  art: 'Art',
};

const DIRECTION_WORDS = {
  birthday: { higher: 'the answer is later in the year', lower: 'the answer is earlier in the year' },
  height: { higher: 'the answer is taller', lower: 'the answer is shorter' },
};

/** Where "not a match" would mislead, say what a miss means. */
const MISS_WORDS = { art: 'the answer uses the other art' };

export function stateWords(kind, state) {
  if (state === 'correct') return 'correct';
  if (state === 'wrong') return MISS_WORDS[kind] ?? 'not a match';
  return DIRECTION_WORDS[kind]?.[state] ?? state;
}

/**
 * One cell of feedback. `state` is the truth; `pending` renders the neutral, unrevealed
 * face that flips into `state` during the reveal animation.
 */
export function createTile({ kind, state, value, lead, pending = false }) {
  const el = h(
    'div',
    { class: 'tile', 'data-kind': kind, 'data-state': pending ? 'pending' : state },
    h('span', { class: 'tile-mark' }, icon(MARKS[state], { size: 16 })),
    h('span', { class: 'tile-value' }, lead, value),
    h('span', { class: 'sr-only' }, `${KIND_LABELS[kind]}: ${value}, ${stateWords(kind, state)}.`),
  );
  el.reveal = () => {
    el.dataset.state = state;
  };
  return el;
}

/** Flip a row's tiles one after another. Returns when the last one has landed. */
export async function revealTiles(tiles, { stagger = 190, duration = 520, reduced = false } = {}) {
  if (reduced) {
    tiles.forEach((tile) => tile.reveal());
    return;
  }
  const waits = tiles.map(
    (tile, i) =>
      new Promise((resolve) => {
        const delay = i * stagger;
        tile.animate(
          [
            { transform: 'rotateX(0deg)' },
            { transform: 'rotateX(90deg)', offset: 0.5 },
            { transform: 'rotateX(0deg)' },
          ],
          { duration, delay, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'backwards' },
        ).finished.then(resolve, resolve);
        setTimeout(() => tile.reveal(), delay + duration / 2);
      }),
  );
  await Promise.all(waits);
}

/* ---------- avatars & thumbnails ---------- */

/**
 * A square face with a coloured ring. The initial sits underneath the image so a
 * blocked or missing image degrades to a tidy placeholder instead of a broken icon.
 */
export function createAvatar({ src, fallback, initial, color, size = 48, label }) {
  let retried = false;
  const img = h('img', {
    src,
    alt: '',
    width: 128,
    height: 128,
    loading: 'lazy',
    decoding: 'async',
    referrerpolicy: 'no-referrer',
    onerror: () => {
      // Try the fallback image once (e.g. the other art variant) before settling for the initial.
      if (fallback && !retried) {
        retried = true;
        img.src = fallback;
      } else {
        img.remove();
      }
    },
  });
  return h(
    'span',
    {
      class: 'avatar',
      style: { '--size': `${size}px`, '--ring': color },
      role: label ? 'img' : null,
      'aria-label': label,
    },
    h('span', { class: 'avatar-initial', 'aria-hidden': 'true' }, initial),
    img,
  );
}

/* ---------- sharing & countdown ---------- */

export function createShareButton(buildText) {
  const label = h('span', {}, 'Copy result');
  let timer = null;
  const button = h(
    'button',
    {
      class: 'btn btn-primary',
      type: 'button',
      onclick: async () => {
        const ok = await copyText(buildText());
        label.textContent = ok ? 'Copied' : 'Copy failed';
        announce(ok ? 'Result copied to clipboard.' : 'Could not copy the result.');
        clearTimeout(timer);
        timer = setTimeout(() => (label.textContent = 'Copy result'), 2200);
      },
    },
    icon('share'),
    label,
  );
  return button;
}

const pad2 = (n) => String(n).padStart(2, '0');

export function createCountdown(onExpire) {
  const time = h('time', { class: 'tabular' });
  const el = h('p', { class: 'countdown' }, 'Next daily puzzle in ', time);
  const tick = () => {
    const ms = msUntilTomorrow();
    if (ms <= 1000) {
      stop();
      onExpire();
      return;
    }
    const total = Math.floor(ms / 1000);
    time.textContent = `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(total % 60)}`;
  };
  const stop = () => clearInterval(timer);
  tick();
  const timer = setInterval(tick, 1000);
  return { el, stop };
}

/* ---------- misc ---------- */

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

