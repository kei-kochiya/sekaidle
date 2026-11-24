/* Shared UI & session primitives: sessions, gauge, tiles, turn runner, avatars, end panel, countdown. */

import { h, icon, copyText, announce, prefersReducedMotion, sleep } from './dom.js';
import { MAX_GUESSES } from './data.js';
import { store } from './store.js';
import { dateKey, nextMidnightMs, pad2 } from './rng.js';

export const POST_REVEAL_DELAY_MS = 320;

/* ---------- sessions ---------- */

/**
 * A session is one puzzle in progress: the answer, the guesses so far, and a status.
 * Dailies are keyed by date so reloading never rerolls; the random puzzle is a single
 * saved slot that survives reloads until the player asks for a new one.
 * If a saved answer ID is missing from the current dataset, heal and persist it immediately.
 */
export function ensureSession({ game, mode, dateKey: key, createAnswer, isValidAnswer }) {
  const sessionKey = mode === 'daily' ? `${game}:daily:${key}` : `${game}:random`;
  let session = store.getSession(sessionKey);
  if (!session) {
    session = {
      key: sessionKey,
      game,
      mode,
      dateKey: mode === 'daily' ? key : null,
      guesses: [],
      status: 'playing',
      ...createAnswer(),
    };
    store.saveSession(session);
  } else if (isValidAnswer && !isValidAnswer(session.answer)) {
    Object.assign(session, createAnswer());
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

/* ---------- shared text & controls ---------- */

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Insert a zero-width line-break opportunity right after `×` (e.g. Wonderlands×Showtime). */
export function wrapCross(text) {
  if (typeof text !== 'string' || !text.includes('×')) return text;
  const [left, ...rest] = text.split('×');
  return [left, '×', h('wbr'), rest.join('×')];
}

export function createGiveUpButton({ mode, canForfeit, onForfeit }) {
  if (mode !== 'random') return null;
  return h(
    'button',
    {
      class: 'btn btn-quiet',
      type: 'button',
      onclick: () => {
        if (canForfeit()) onForfeit();
      },
    },
    icon('flag', { size: 16 }),
    'Give up',
  );
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

const stripSoftHyphens = (text) => String(text ?? '').replace(/\u00ad/g, '');

/**
 * One cell of feedback. `state` is the truth; `pending` renders the neutral, unrevealed
 * face that flips into `state` during the reveal animation.
 */
export function createTile({ kind, state, value, srValue, lead, pending = false }) {
  const spokenValue = stripSoftHyphens(srValue ?? value);
  const el = h(
    'div',
    { class: 'tile', 'data-kind': kind, 'data-state': pending ? 'pending' : state },
    h('span', { class: 'tile-mark' }, icon(MARKS[state], { size: 16 })),
    h('span', { class: 'tile-value' }, lead, value),
    h('span', { class: 'sr-only' }, `${KIND_LABELS[kind]}: ${spokenValue}, ${stateWords(kind, state)}.`),
  );
  el.reveal = () => {
    el.dataset.state = state;
  };
  return el;
}

/** Flip a row's tiles one after another. Cancels cleanly if `signal` aborts. */
export async function revealTiles(
  tiles,
  { stagger = 190, duration = 520, reduced = prefersReducedMotion(), signal } = {},
) {
  if (signal?.aborted) return;
  if (reduced) {
    tiles.forEach((tile) => tile.reveal());
    return;
  }

  const animations = [];
  const timers = [];
  const cancelAll = () => {
    for (const timer of timers) clearTimeout(timer);
    for (const anim of animations) {
      try {
        anim.cancel();
      } catch {
        /* ignore already finished */
      }
    }
  };
  signal?.addEventListener('abort', cancelAll, { once: true });

  try {
    await Promise.all(
      tiles.map(
        (tile, i) =>
          new Promise((resolve) => {
            if (signal?.aborted) {
              resolve();
              return;
            }
            const delay = i * stagger;
            const anim = tile.animate(
              [
                { transform: 'rotateX(0deg)' },
                { transform: 'rotateX(90deg)', offset: 0.5 },
                { transform: 'rotateX(0deg)' },
              ],
              {
                duration,
                delay,
                easing: 'cubic-bezier(0.45, 0, 0.2, 1)',
                fill: 'backwards',
              },
            );
            animations.push(anim);
            const onAbort = () => resolve();
            signal?.addEventListener('abort', onAbort, { once: true });
            anim.finished
              .catch(() => {})
              .finally(() => {
                signal?.removeEventListener('abort', onAbort);
                resolve();
              });
            timers.push(setTimeout(() => tile.reveal(), delay + duration / 2));
          }),
      ),
    );
  } finally {
    signal?.removeEventListener('abort', cancelAll);
  }
}

/**
 * Shared guess-turn pipeline: preserves focus across input/submit, prepends the row,
 * animates tile flips, handles abort cancellation, and routes to playing vs finished states.
 */
export async function executeGuessTurn({
  session,
  picker,
  historyList,
  hintEl,
  signal,
  commitAndBuildRow,
  onAfterCommit,
  onRevealPlaying,
  onRevealEnded,
}) {
  const reduced = prefersReducedMotion();
  const returnFocusToControls =
    document.activeElement === picker.input || document.activeElement === picker.submit;

  const { row, tiles, result } = commitAndBuildRow({ reduced });
  picker.input.value = '';
  picker.setOpen(false);
  historyList.prepend(row);
  hintEl.hidden = true;
  onAfterCommit?.();

  // Keep focus anchored inside `.picker` even on the winning/final guess so `mountResultPanel`
  // sees focus inside controls rather than `document.body` after `picker.submit` disables.
  if (returnFocusToControls) {
    picker.focusInputQuietly();
  }

  await revealTiles(tiles, { reduced, signal });
  if (signal?.aborted) return;

  if (session.status === 'playing') {
    const left = MAX_GUESSES - session.guesses.length;
    onRevealPlaying({ result, left });
  } else {
    await sleep(reduced ? 0 : POST_REVEAL_DELAY_MS, signal);
    if (signal?.aborted) return;
    onRevealEnded({ result });
  }
}

/* ---------- avatars & thumbnails ---------- */

/**
 * A square face with a coloured ring. Omit `size` when CSS controls `--size` (e.g. `.mystery .avatar`).
 */
export function createAvatar({ src, fallback, initial, color, size, label }) {
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
      style: { '--size': size != null ? `${size}px` : null, '--ring': color },
      role: label ? 'img' : null,
      'aria-label': label,
    },
    h('span', { class: 'avatar-initial', 'aria-hidden': 'true' }, initial),
    img,
  );
}

/* ---------- sharing, countdown & end-of-game panel ---------- */

export function createShareButton(buildText, signal) {
  const label = h('span', {}, 'Copy result');
  let timer = null;
  const clearReset = () => {
    clearTimeout(timer);
    timer = null;
  };
  signal?.addEventListener('abort', clearReset, { once: true });

  return h(
    'button',
    {
      class: 'btn btn-primary',
      type: 'button',
      onclick: async () => {
        const ok = await copyText(buildText());
        if (signal?.aborted) return;
        label.textContent = ok ? 'Copied' : 'Copy failed';
        announce(ok ? 'Result copied to clipboard.' : 'Could not copy the result.');
        clearReset();
        timer = setTimeout(() => {
          label.textContent = 'Copy result';
        }, 2200);
      },
    },
    icon('share'),
    label,
  );
}

export function createCountdown(forDateKey, onExpire, signal) {
  const time = h('time', { class: 'tabular' });
  const el = h('p', { class: 'countdown' }, 'Next daily puzzle in ', time);
  const targetMs = nextMidnightMs(forDateKey);
  let timer = null;
  let stopped = false;

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    timer = null;
  };

  const tick = () => {
    if (stopped || signal?.aborted) return;
    if (dateKey() !== forDateKey) {
      stop();
      onExpire();
      return;
    }
    const remainingMs = Math.max(0, targetMs - Date.now());
    const totalSec = Math.ceil(remainingMs / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    time.textContent = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;

    const nextDelay = remainingMs <= 1050 ? remainingMs + 30 : remainingMs % 1000 || 1000;
    clearTimeout(timer);
    timer = setTimeout(tick, nextDelay);
  };

  signal?.addEventListener('abort', stop, { once: true });
  tick();
  return { el, stop };
}

export function outcomeStatusText(session) {
  if (session.status === 'won') {
    return session.guesses.length === 1
      ? 'First try!'
      : `Solved in ${session.guesses.length} of ${MAX_GUESSES}`;
  }
  return session.guesses.length >= MAX_GUESSES ? 'Out of guesses' : 'Gave up';
}

export function outcomeAnnouncement(session, answerName) {
  if (session.status === 'won') {
    return `Correct! It was ${answerName}, solved in ${plural(session.guesses.length, 'guess')}.`;
  }
  const lead = session.guesses.length >= MAX_GUESSES ? 'Out of guesses.' : 'Gave up.';
  return `${lead} The answer was ${answerName}.`;
}

export function mountResultPanel({
  pickerEl,
  giveUpBtn,
  mode,
  dateKey: key,
  factPairs,
  buildShareText,
  onNewRandom,
  ctx,
}) {
  const focusWasInsideControls =
    pickerEl.contains(document.activeElement) ||
    (giveUpBtn != null && giveUpBtn === document.activeElement);

  if (giveUpBtn) giveUpBtn.hidden = true;

  const facts = h(
    'dl',
    { class: 'facts' },
    factPairs.map(([term, desc]) => h('div', { class: 'fact' }, h('dt', {}, term), h('dd', {}, desc))),
  );

  const shareBtn = createShareButton(buildShareText, ctx.signal);
  const secondaryActions =
    mode === 'daily'
      ? [
          h(
            'button',
            { class: 'btn btn-secondary', type: 'button', onclick: ctx.playRandom },
            icon('dice'),
            'Play a random puzzle',
          ),
          h('button', { class: 'btn btn-quiet', type: 'button', onclick: ctx.openStats }, icon('chart'), 'Stats'),
        ]
      : [
          h(
            'button',
            { class: 'btn btn-secondary', type: 'button', onclick: onNewRandom },
            icon('refresh'),
            'New puzzle',
          ),
        ];

  const actions = h('div', { class: 'result-actions' }, shareBtn, ...secondaryActions);
  const panel = h('section', { class: 'result', 'aria-label': 'Result', tabindex: '-1' }, facts, actions);

  let countdown = null;
  if (mode === 'daily') {
    countdown = createCountdown(key, ctx.refresh, ctx.signal);
    panel.append(countdown.el);
  }

  pickerEl.replaceWith(panel);
  if (focusWasInsideControls && !ctx.signal?.aborted) {
    shareBtn.focus({ preventScroll: true });
  }

  return { panel, countdown };
}
