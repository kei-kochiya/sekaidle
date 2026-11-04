/* App shell: tabs, daily/random mode, dialogs, theme. */

import { h, icon, clear } from './dom.js';
import { loadData } from './data.js';
import { store, MAX_GUESSES } from './store.js';
import { dateKey as todayKey, puzzleNumber, formatDateKey } from './rng.js';
import { mountCharacterGame } from './character-game.js';
import { mountCardGame } from './card-game.js';
import { createTile } from './game-common.js';

const REPO_URL = 'https://github.com/kei-kochiya/sekaidle';

const GAMES = {
  character: { label: 'Character', mount: mountCharacterGame },
  card: { label: 'Card', mount: mountCardGame },
};

const $ = (selector) => document.querySelector(selector);
const root = $('#game');

let data = null;
let running = null;
let game = gameFromHash() ?? store.getPref('game', 'character');
let mode = store.getPref('mode', 'daily');
let today = todayKey();

if (!GAMES[game]) game = 'character';

function gameFromHash() {
  const name = location.hash.replace('#', '');
  return GAMES[name] ? name : null;
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

function render() {
  running?.destroy();
  running = null;
  syncChrome();
  if (!data) return;
  const ctx = {
    data,
    mode,
    dateKey: today,
    refresh: () => {
      today = todayKey();
      render();
    },
    playRandom: () => setMode('random'),
    openStats,
  };
  running = GAMES[game].mount(root, ctx);
}

function setGame(next, { focus = false } = {}) {
  if (next === game) return;
  game = next;
  store.setPref('game', game);
  history.replaceState(null, '', `#${game}`);
  render();
  if (focus) $(`#tab-${game}`).focus();
}

function setMode(next) {
  if (next === mode) return;
  mode = next;
  store.setPref('mode', mode);
  render();
  root.focus({ preventScroll: true });
}

/* ---------- tabs and mode switch ---------- */

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
    setGame(next, { focus: true });
  }
});

$('#mode-daily').addEventListener('click', () => setMode('daily'));
$('#mode-random').addEventListener('click', () => setMode('random'));

window.addEventListener('hashchange', () => {
  const next = gameFromHash();
  if (next) setGame(next);
});

// Left the tab open past midnight? Roll the daily puzzle over when they come back.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && todayKey() !== today) {
    today = todayKey();
    render();
  }
});

/* ---------- theme ---------- */

function effectiveTheme() {
  return (
    document.documentElement.dataset.theme ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );
}

$('#btn-theme').addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.setPref('theme', next);
});

/* ---------- dialogs ---------- */

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
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
        'Birthdays are compared by month and day only, since the game gives no year. Virtual Singers have no school.',
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
        h('li', {}, 'Each guess is a card. Its attribute, group and character tiles say what matches the answer.'),
        h('li', {}, 'Group means the unit. A Virtual Singer counts as Virtual Singer, whatever unit the card is for.'),
        h('li', {}, 'Only the exact card wins. If all three tiles match, it is the right character and attribute but a different card, so let the art decide.'),
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
  const body = clear($('#stats-body'));
  body.append(statBlock('character'), statBlock('card'), h('p', {}, 'Only daily puzzles count toward your stats. They are saved in this browser.'));
  $('#dlg-stats').showModal();
}

$('#btn-help').addEventListener('click', openHelp);
$('#btn-stats').addEventListener('click', openStats);

/* ---------- boot ---------- */

$('#source-link').href = REPO_URL;

function showError(error) {
  console.error(error);
  root.replaceChildren(
    h(
      'div',
      { class: 'state-panel' },
      h('h2', {}, "Couldn't load the game data"),
      h('p', {}, 'Check your connection and try again.'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: boot }, icon('refresh'), 'Try again'),
    ),
  );
}

async function boot() {
  try {
    data = await loadData();
  } catch (error) {
    showError(error);
    return;
  }
  $('#data-note').textContent = `Data updated ${data.meta.built}, up to the card released ${data.meta.latestCard}.`;
  render();
}

syncChrome();
boot();
