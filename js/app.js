/* App shell: tabs, daily/random mode, dialogs, theme, and mount lifecycle. */

import { h, icon, announce, cancelAnnouncement } from './dom.js';
import { loadData } from './data.js';
import { store } from './store.js';
import { dateKey as todayKey, puzzleNumber, formatDateKey } from './rng.js';
import { mountCharacterGame } from './character-game.js';
import { mountCardGame } from './card-game.js';
import { createTile } from './game-common.js';

const GAMES = {
  character: { label: 'Character', mount: mountCharacterGame },
  card: { label: 'Card', mount: mountCardGame },
};

const THEME_COLORS = {
  light: '#f4f5fb',
  dark: '#101321',
};

const isValidGame = (name) => typeof name === 'string' && Object.hasOwn(GAMES, name);
const isValidMode = (name) => name === 'daily' || name === 'random';

const $ = (selector) => document.querySelector(selector);
const root = $('#game');

let data = null;
let running = null;
let activeController = null;
let booting = false;

let game = gameFromHash() ?? store.getPref('game', 'character');
if (!isValidGame(game)) game = 'character';

let mode = store.getPref('mode', 'daily');
if (!isValidMode(mode)) mode = 'daily';

let today = todayKey();

function gameFromHash() {
  const name = location.hash.replace(/^#/, '');
  return isValidGame(name) ? name : null;
}

/* ---------- chrome ---------- */

function syncChrome() {
  for (const key of Object.keys(GAMES)) {
    const tab = $(`#tab-${key}`);
    const selected = key === game;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  root.setAttribute('aria-labelledby', `tab-${game}`);
  $('#mode-daily').setAttribute('aria-pressed', String(mode === 'daily'));
  $('#mode-random').setAttribute('aria-pressed', String(mode === 'random'));

  const info = $('#mode-info');
  info.replaceChildren(
    ...(mode === 'daily'
      ? [h('strong', {}, `Daily #${puzzleNumber(today)}`), ` · ${formatDateKey(today)}`]
      : [h('strong', {}, 'Random'), ' · not tracked']),
  );
}

function render({ focusRoot = false } = {}) {
  const hadFocusInGame = root.contains(document.activeElement);
  activeController?.abort();
  activeController = new AbortController();
  cancelAnnouncement();
  running?.destroy();
  running = null;

  syncChrome();
  if (!data) return;

  const ctx = {
    data,
    mode,
    dateKey: today,
    signal: activeController.signal,
    refresh: () => {
      today = todayKey();
      render({ focusRoot: true });
    },
    rolloverIfStale: () => {
      const nowKey = todayKey();
      if (nowKey === today) return false;
      today = nowKey;
      render({ focusRoot: true });
      announce("Midnight passed. Loaded today's puzzle.");
      return true;
    },
    playRandom: () => setMode('random'),
    openStats,
  };

  running = GAMES[game].mount(root, ctx);
  if (focusRoot || hadFocusInGame) {
    root.focus({ preventScroll: true });
  }
}

function setGame(next, { focusTab = false } = {}) {
  if (!isValidGame(next) || next === game) return;
  game = next;
  store.setPref('game', game);
  history.replaceState(null, '', `#${game}`);
  render();
  if (focusTab) $(`#tab-${game}`).focus();
}

function setMode(next) {
  if (!isValidMode(next) || next === mode) return;
  mode = next;
  store.setPref('mode', mode);
  render({ focusRoot: true });
}

/* ---------- tabs, mode switch & date rollover ---------- */

for (const key of Object.keys(GAMES)) {
  $(`#tab-${key}`).addEventListener('click', () => setGame(key));
}

$('.tabs').addEventListener('keydown', (event) => {
  const keys = Object.keys(GAMES);
  const index = keys.indexOf(game);
  let next = null;
  if (event.key === 'ArrowRight') next = keys[(index + 1) % keys.length];
  if (event.key === 'ArrowLeft') next = keys[(index - 1 + keys.length) % keys.length];
  if (event.key === 'Home') next = keys[0];
  if (event.key === 'End') next = keys[keys.length - 1];
  if (next) {
    event.preventDefault();
    setGame(next, { focusTab: true });
  }
});

$('#mode-daily').addEventListener('click', () => setMode('daily'));
$('#mode-random').addEventListener('click', () => setMode('random'));

window.addEventListener('hashchange', () => {
  const next = gameFromHash();
  if (next) setGame(next);
});

function checkMidnightRollover() {
  if (document.visibilityState === 'visible' && todayKey() !== today) {
    today = todayKey();
    render();
  }
}

document.addEventListener('visibilitychange', checkMidnightRollover);
window.addEventListener('focus', checkMidnightRollover);

/* ---------- theme ---------- */

const systemDarkMq = window.matchMedia('(prefers-color-scheme: dark)');

function effectiveTheme() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return systemDarkMq.matches ? 'dark' : 'light';
}

function syncThemeChrome() {
  const current = effectiveTheme();
  const btn = $('#btn-theme');
  btn.setAttribute('aria-pressed', String(current === 'dark'));
  btn.setAttribute('aria-label', `Switch to ${current === 'dark' ? 'light' : 'dark'} theme`);
  const metaTheme = $('#meta-theme-color');
  if (metaTheme) metaTheme.setAttribute('content', THEME_COLORS[current]);
}

$('#btn-theme').addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.setPref('theme', next);
  syncThemeChrome();
  announce(`Switched to ${next} theme.`);
});

systemDarkMq.addEventListener('change', syncThemeChrome);
syncThemeChrome();

/* ---------- dialogs ---------- */

for (const dialog of document.querySelectorAll('dialog')) {
  let pointerDownTarget = null;
  dialog.addEventListener('pointerdown', (event) => {
    pointerDownTarget = event.target;
  });
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) {
      dialog.close();
      return;
    }
    if (event.target === dialog && pointerDownTarget === dialog) {
      dialog.close();
    }
  });
}

function buildHelp() {
  const legendRow = (tile, text) => h('li', {}, tile, h('span', {}, text));
  return [
    h(
      'p',
      {},
      'Two games, six guesses each. A new daily puzzle appears every day at midnight. Random puzzles never run out and do not touch your stats.',
    ),
    h(
      'section',
      {},
      h('h3', {}, 'Character'),
      h('p', {}, 'Name the character. After each guess, three tiles compare it with the answer.'),
      h(
        'ul',
        { class: 'legend' },
        legendRow(createTile({ kind: 'school', state: 'correct', value: 'Kamiyama' }), 'Matches the answer.'),
        legendRow(
          createTile({ kind: 'height', state: 'higher', value: '160 cm' }),
          'The answer is later in the year, or taller.',
        ),
        legendRow(
          createTile({ kind: 'birthday', state: 'lower', value: 'Aug 11' }),
          'The answer is earlier in the year, or shorter.',
        ),
        legendRow(createTile({ kind: 'school', state: 'wrong', value: 'Miyamasuzaka' }), 'Does not match.'),
      ),
      h(
        'p',
        {},
        'Birthdays are compared by month and day only, since the game gives no year. Kamiyama night classes count as Kamiyama High School, Kanade attends Correspondence School, and Virtual Singers have no school.',
      ),
    ),
    h(
      'section',
      {},
      h('h3', {}, 'Card'),
      h(
        'ul',
        {},
        h('li', {}, 'You see a 3 or 4-star card, heavily blurred. Every wrong guess sharpens it.'),
        h(
          'li',
          {},
          'Filter candidates by attribute, group or character, and pick Untrained or Trained art. Four tiles say what matches the answer: attribute, group, character and art.',
        ),
        h(
          'li',
          {},
          'The puzzle shows either the untrained or the trained art of its card (single-art cards automatically clamp to the art they have). After a guess, the Art switch aligns to the puzzle’s art.',
        ),
        h('li', {}, 'Group means the unit. A Virtual Singer counts as Virtual Singer, whatever unit the card is for.'),
        h(
          'li',
          {},
          'Only the exact card in the exact art wins. The right card in the other art counts as a miss, and a note says so. Matching the first three tiles on a different card means the right character, attribute and group, so let the art decide.',
        ),
      ),
    ),
  ];
}

function openHelp() {
  const body = $('#help-body');
  if (!body.firstChild) body.append(...buildHelp());
  $('#dlg-help').showModal();
}

function statBlock(key) {
  const s = store.getStats(key);
  const rate = s.played ? Math.round((100 * s.wins) / s.played) : 0;
  const peak = Math.max(1, ...s.distribution);
  const stat = (label, value) => h('div', {}, h('dt', {}, label), h('dd', {}, value));
  return h(
    'section',
    { class: 'stat-block' },
    h('h3', {}, GAMES[key].label),
    h(
      'dl',
      { class: 'stat-line' },
      stat('Played', s.played),
      stat('Win rate', `${rate}%`),
      stat('Streak', s.streak),
      stat('Best streak', s.best),
    ),
    h(
      'ol',
      { class: 'dist', 'aria-label': `${GAMES[key].label}: wins by number of guesses` },
      s.distribution.map((count, i) =>
        h(
          'li',
          {},
          h('span', { 'aria-hidden': 'true' }, i + 1),
          h(
            'span',
            {
              class: `dist-bar${count ? ' is-filled' : ''}`,
              style: { width: `${Math.max(8, (count / peak) * 100)}%` },
            },
            h('span', { class: 'sr-only' }, `Solved in ${i + 1}: `),
            count,
          ),
        ),
      ),
    ),
  );
}

function openStats() {
  const body = $('#stats-body');
  body.replaceChildren(
    statBlock('character'),
    statBlock('card'),
    h('p', {}, 'Only daily puzzles count toward your stats. They are saved in this browser.'),
  );
  $('#dlg-stats').showModal();
}

$('#btn-help').addEventListener('click', openHelp);
$('#btn-stats').addEventListener('click', openStats);

/* ---------- boot ---------- */

function showError(error) {
  console.error(error);
  const retryLabel = h('span', {}, 'Try again');
  const retryBtn = h(
    'button',
    {
      class: 'btn btn-primary',
      type: 'button',
      onclick: () => {
        retryBtn.disabled = true;
        retryLabel.textContent = 'Loading…';
        boot({ focusRoot: true });
      },
    },
    icon('refresh'),
    retryLabel,
  );
  root.replaceChildren(
    h(
      'div',
      { class: 'state-panel' },
      h('h2', {}, "Couldn't load the game data"),
      h('p', {}, 'Check your connection and try again.'),
      retryBtn,
    ),
  );
}

async function boot({ focusRoot = false } = {}) {
  if (booting) return;
  booting = true;
  try {
    data = await loadData();
    $('#data-note').textContent = `Data updated ${data.meta.built}, up to the card released ${data.meta.latestCard}.`;
    render({ focusRoot });
  } catch (error) {
    showError(error);
  } finally {
    booting = false;
  }
}

syncChrome();
boot();
