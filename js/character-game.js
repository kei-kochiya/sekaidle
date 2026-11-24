/* Character mode: deduce the character from school, birthday and height. */

import { h, icon, announce } from './dom.js';
import { MAX_GUESSES, UNITS, SCHOOLS, images, formatBirthday } from './data.js';
import {
  compareCharacters,
  filterCharacters,
  rollCharacterPortraits,
  formatShareText,
} from './logic.js';
import { pickDaily } from './rng.js';
import { createPicker } from './picker.js';
import {
  ensureSession,
  resetRandomSession,
  applyGuess,
  forfeit,
  wrapCross,
  createGiveUpButton,
  createGauge,
  createTile,
  executeGuessTurn,
  createAvatar,
  outcomeStatusText,
  outcomeAnnouncement,
  mountResultPanel,
  plural,
  stateWords,
} from './game-common.js';

function buildCharacterRow(guessChar, answerChar, renderAvatar, { pending }) {
  const result = compareCharacters(guessChar, answerChar);
  const tiles = [
    createTile({
      kind: 'school',
      state: result.school,
      value: SCHOOLS[guessChar.school].short,
      srValue: SCHOOLS[guessChar.school].label,
      pending,
    }),
    createTile({
      kind: 'birthday',
      state: result.birthday,
      value: formatBirthday(guessChar.birthday),
      pending,
    }),
    createTile({
      kind: 'height',
      state: result.height,
      value: `${guessChar.height} cm`,
      pending,
    }),
  ];
  const row = h(
    'li',
    { class: pending ? 'row-character is-new' : 'row-character' },
    h('span', { class: 'sr-only' }, `${guessChar.name}.`),
    h(
      'div',
      { class: 'row-who', 'aria-hidden': 'true' },
      renderAvatar(guessChar, 40),
      h('span', { class: 'row-name' }, guessChar.short),
    ),
    tiles,
  );
  return { row, tiles, result };
}

export function mountCharacterGame(root, ctx) {
  const { data, mode, dateKey, signal } = ctx;
  const { characters, charById, cardsByCharId } = data;

  const sessionAvatarById = rollCharacterPortraits(characters, cardsByCharId);
  const charAvatar = (ch, size, label) =>
    createAvatar({
      src: sessionAvatarById.get(ch.id),
      fallback: images.thumb(ch.avatar, false),
      initial: ch.short[0],
      color: ch.color,
      size,
      label,
    });

  const createAnswer = () => {
    const ids = characters.map((c) => c.id);
    return {
      answer:
        mode === 'daily'
          ? pickDaily('character', ids, dateKey)
          : ids[Math.floor(Math.random() * ids.length)],
    };
  };

  const session = ensureSession({
    game: 'character',
    mode,
    dateKey,
    createAnswer,
    isValidAnswer: (id) => charById.has(id),
  });
  const answerChar = charById.get(session.answer);

  let selectedId = null;
  let busy = false;
  let countdown = null;

  /* ---------- hero ---------- */

  const gauge = createGauge();
  const mystery = h('div', { class: 'mystery', 'aria-hidden': 'true' }, '?');
  const title = h('h2', { id: 'hero-title', class: 'hero-title' });
  const status = h('p', { class: 'hero-sub' });
  const giveUp = createGiveUpButton({
    mode,
    canForfeit: () => !busy && session.status === 'playing',
    onForfeit: () => {
      forfeit(session);
      renderEnd();
    },
  });
  const hero = h(
    'section',
    { class: 'hero hero-character', 'aria-labelledby': 'hero-title' },
    mystery,
    h('div', { class: 'hero-body' }, title, status, h('div', { class: 'hero-meter' }, gauge.el, giveUp)),
  );

  /* ---------- picker ---------- */

  const guessedIds = () => new Set(session.guesses);
  const cells = new Map();

  for (const ch of characters) {
    const note = h('span', { class: 'sr-only' });
    const el = h(
      'div',
      {
        id: `char-opt-${ch.id}`,
        role: 'option',
        class: 'char-cell',
        'aria-selected': 'false',
        'aria-disabled': 'false',
        dataset: { id: ch.id },
        onclick: () => {
          if (el.getAttribute('aria-disabled') === 'true') return;
          select(ch.id, { source: 'pointer' });
        },
      },
      charAvatar(ch, 52),
      h('span', { class: 'char-name' }, ch.short),
      note,
    );
    cells.set(ch.id, { el, note });
  }

  const listbox = h(
    'div',
    { id: 'character-listbox', class: 'char-grid', role: 'listbox', 'aria-label': 'Characters' },
    [...cells.values()].map((item) => item.el),
  );
  const none = h('p', { class: 'empty', hidden: true }, 'No character matches that search.');

  const picker = createPicker({
    idPrefix: 'character',
    searchLabel: 'Search characters',
    placeholder: 'Search characters',
    toggleLabels: { open: 'Hide characters', closed: 'Show all characters' },
    resultsChildren: [listbox, none],
    getNavigableItems: () =>
      characters
        .filter((ch) => {
          const item = cells.get(ch.id);
          return !item.el.hidden && item.el.getAttribute('aria-disabled') !== 'true';
        })
        .map((ch) => ({ id: ch.id, el: cells.get(ch.id).el })),
    hasSelection: () => selectedId != null,
    onInput: () => {
      if (selectedId != null) select(null);
      applyFilter();
    },
    onSelect: (id, meta) => select(id, meta),
    onSubmit: () => submitGuess(),
    signal,
  });

  function applyFilter() {
    const query = selectedId == null ? picker.input.value : '';
    const matches = new Set(filterCharacters(characters, query).map((ch) => ch.id));
    for (const ch of characters) {
      cells.get(ch.id).el.hidden = !matches.has(ch.id);
    }
    none.hidden = matches.size > 0;
  }

  function select(id, { source = 'program' } = {}) {
    selectedId = id;
    picker.clearActive();
    for (const [cid, item] of cells) {
      item.el.setAttribute('aria-selected', String(cid === id));
    }
    if (id == null) {
      picker.submit.disabled = true;
      picker.lead.replaceChildren(icon('search'));
      return;
    }
    const ch = charById.get(id);
    if (!ch) return;
    picker.input.value = ch.name;
    picker.submit.disabled = false;
    picker.lead.replaceChildren(charAvatar(ch, 28));
    applyFilter();
    picker.setOpen(false);
    picker.focusAfterSelect(source);
    announce(`${ch.name} selected. Press Guess to submit.`);
  }

  function markGuessed(id) {
    const item = cells.get(id);
    if (!item) return;
    item.el.setAttribute('aria-disabled', 'true');
    item.note.textContent = ', already guessed';
  }

  /* ---------- history ---------- */

  const head = h(
    'div',
    { class: 'history-head', 'aria-hidden': 'true' },
    h('span', {}, 'Guess'),
    h('span', {}, 'School'),
    h('span', {}, 'Birthday'),
    h('span', {}, 'Height'),
  );
  const historyList = h('ol', { class: 'history-list', 'aria-label': 'Your guesses, newest first' });
  const hint = h(
    'p',
    { class: 'empty' },
    'Pick a character. Each tile shows how their school, birthday and height compare with the answer.',
  );
  const history = h('section', { class: 'history', 'aria-label': 'Guesses' }, head, historyList, hint);

  /* ---------- flow ---------- */

  function renderStatus() {
    const used = session.guesses.length;
    gauge.set(used, session.status);
    if (session.status === 'playing') {
      title.textContent = mode === 'daily' ? "Today's character" : 'Random character';
      status.textContent = `Guess ${used + 1} of ${MAX_GUESSES}`;
    }
  }

  async function submitGuess() {
    if (busy || session.status !== 'playing' || selectedId == null) return;
    if (mode === 'daily' && session.guesses.length === 0 && ctx.rolloverIfStale()) return;
    if (guessedIds().has(selectedId)) return;
    const guessChar = charById.get(selectedId);
    if (!guessChar) return;

    busy = true;
    try {
      const formatSpeech = (result) =>
        `${guessChar.name}. School ${stateWords('school', result.school)}. Birthday ${stateWords('birthday', result.birthday)}. Height ${stateWords('height', result.height)}.`;

      await executeGuessTurn({
        session,
        picker,
        historyList,
        hintEl: hint,
        signal,
        commitAndBuildRow: ({ reduced }) => {
          applyGuess(session, guessChar.id);
          select(null);
          return buildCharacterRow(guessChar, answerChar, charAvatar, { pending: !reduced });
        },
        onAfterCommit: () => {
          applyFilter();
          markGuessed(guessChar.id);
          renderStatus();
        },
        onRevealPlaying: ({ result, left }) => {
          announce(`${formatSpeech(result)} ${plural(left, 'guess')} left.`);
        },
        onRevealEnded: ({ result }) => {
          renderEnd({ announcePrefix: `${formatSpeech(result)} ` });
        },
      });
    } finally {
      busy = false;
    }
  }

  function buildShareText() {
    const tileRows = session.guesses
      .map((id) => charById.get(id))
      .filter(Boolean)
      .map((ch) => {
        const r = compareCharacters(ch, answerChar);
        return [r.school, r.birthday, r.height];
      });
    return formatShareText({
      gameLabel: 'Character',
      mode,
      dateKey,
      status: session.status,
      guessCount: session.guesses.length,
      tileRows,
      url: `${location.origin}${location.pathname}`,
    });
  }

  function renderEnd({ silent = false, announcePrefix = '' } = {}) {
    if (signal?.aborted) return;
    root.dataset.outcome = session.status;
    gauge.set(session.guesses.length, session.status);
    title.textContent = answerChar.name;
    status.textContent = outcomeStatusText(session);
    hint.hidden = true;
    mystery.replaceWith(
      h('div', { class: 'mystery is-revealed' }, charAvatar(answerChar, null, answerChar.name)),
    );

    countdown?.stop();
    const mounted = mountResultPanel({
      pickerEl: picker.el,
      giveUpBtn: giveUp,
      mode,
      dateKey,
      factPairs: [
        ['Unit', wrapCross(UNITS[answerChar.unit].label)],
        ['School', SCHOOLS[answerChar.school].label],
        ['Birthday', formatBirthday(answerChar.birthday)],
        ['Height', `${answerChar.height} cm`],
      ],
      buildShareText,
      onNewRandom: () => {
        resetRandomSession('character', createAnswer);
        ctx.refresh();
      },
      ctx,
    });
    countdown = mounted.countdown;

    if (!silent && !signal?.aborted) {
      announce(`${announcePrefix}${outcomeAnnouncement(session, answerChar.name)}`);
    }
  }

  /* ---------- mount ---------- */

  root.dataset.outcome = 'playing';
  root.replaceChildren(hero, picker.el, history);
  for (const id of session.guesses) {
    const guessChar = charById.get(id);
    if (!guessChar) continue;
    historyList.prepend(buildCharacterRow(guessChar, answerChar, charAvatar, { pending: false }).row);
    markGuessed(id);
  }
  hint.hidden = session.guesses.length > 0;
  renderStatus();
  if (session.status === 'playing') {
    applyFilter();
  } else {
    renderEnd({ silent: true });
  }

  return {
    destroy() {
      countdown?.stop();
    },
  };
}
