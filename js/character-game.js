/* Character mode: deduce the character from school, birthday and height. */

import { h, icon, announce, clear, prefersReducedMotion, sleep } from './dom.js';
import { UNITS, SCHOOLS, images, formatBirthday, birthdayValue } from './data.js';
import { MAX_GUESSES } from './store.js';
import { pickDaily, puzzleNumber } from './rng.js';
import {
  ensureSession,
  resetRandomSession,
  applyGuess,
  forfeit,
  createGauge,
  createTile,
  revealTiles,
  createAvatar,
  createShareButton,
  createCountdown,
  plural,
  stateWords,
} from './game-common.js';

/** 'higher' means the answer is later / taller than the guess; 'lower' the opposite. */
export function compareCharacters(guess, answer) {
  const direction = (g, a) => (g === a ? 'correct' : g < a ? 'higher' : 'lower');
  return {
    school: guess.school === answer.school ? 'correct' : 'wrong',
    birthday: direction(birthdayValue(guess.birthday), birthdayValue(answer.birthday)),
    height: direction(guess.height, answer.height),
  };
}

export function mountCharacterGame(root, ctx) {
  const { data, mode, dateKey } = ctx;
  const { characters, charById } = data;
  const reduced = prefersReducedMotion();

  const createAnswer = () => {
    const ids = characters.map((c) => c.id);
    return {
      answer:
        mode === 'daily'
          ? pickDaily('character', ids, dateKey)
          : ids[Math.floor(Math.random() * ids.length)],
    };
  };

  let session = ensureSession({ game: 'character', mode, dateKey, createAnswer });
  let answerChar = charById.get(session.answer);
  let selectedId = null;
  let busy = false;
  let countdown = null;

  /* ---------- hero ---------- */

  const gauge = createGauge();
  const mystery = h('div', { class: 'mystery', 'aria-hidden': 'true' }, '?');
  const title = h('h2', { class: 'hero-title' });
  const status = h('p', { class: 'hero-sub' });
  const giveUp =
    mode === 'random'
      ? h(
          'button',
          {
            class: 'btn btn-quiet',
            type: 'button',
            onclick: () => {
              if (busy || session.status !== 'playing') return;
              forfeit(session);
              renderEnd();
            },
          },
          icon('flag', { size: 16 }),
          'Give up',
        )
      : null;
  const hero = h(
    'section',
    { class: 'hero hero-character', 'aria-labelledby': 'hero-title' },
    mystery,
    h('div', { class: 'hero-copy' }, title, status, h('div', { class: 'hero-meter' }, gauge.el, giveUp)),
  );
  title.id = 'hero-title';

  /* ---------- picker ---------- */

  const input = h('input', {
    id: 'character-search',
    class: 'field-input',
    type: 'text',
    role: 'combobox',
    placeholder: 'Search characters',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'go',
    'aria-expanded': 'false',
    'aria-controls': 'character-results',
    'aria-autocomplete': 'list',
  });
  const lead = h('span', { class: 'field-lead' }, icon('search'));
  const toggle = h(
    'button',
    {
      class: 'field-toggle',
      type: 'button',
      'aria-label': 'Show all characters',
      'aria-expanded': 'false',
      'aria-controls': 'character-results',
      onclick: () => setOpen(picker.dataset.open !== 'true'),
    },
    icon('chevron'),
  );
  const field = h('div', { class: 'field' }, lead, input, toggle);
  const submit = h('button', { class: 'btn btn-primary', type: 'submit', disabled: true }, 'Guess');

  const cells = new Map();
  for (const ch of characters) {
    const cell = h(
      'button',
      {
        type: 'button',
        class: 'char-cell',
        'aria-pressed': 'false',
        dataset: { id: ch.id },
        onclick: () => select(ch.id),
      },
      createAvatar({ src: images.thumb(ch.avatar), initial: ch.short[0], color: ch.color, size: 52 }),
      h('span', { class: 'char-name' }, ch.short),
      h('span', { class: 'sr-only guessed-note' }),
    );
    cells.set(ch.id, cell);
  }
  const grid = h('div', { class: 'char-grid', role: 'group', 'aria-label': 'Characters' }, [...cells.values()]);
  const none = h('p', { class: 'empty', hidden: true }, 'No character matches that search.');
  const results = h('div', { id: 'character-results', class: 'picker-results' }, grid, none);

  const picker = h(
    'form',
    { class: 'picker', dataset: { open: 'false' }, autocomplete: 'off', novalidate: true },
    h('label', { class: 'sr-only', for: 'character-search' }, 'Search characters'),
    h('div', { class: 'picker-bar' }, field, submit),
    results,
  );

  function setOpen(open) {
    picker.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    input.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Hide characters' : 'Show all characters');
  }

  const guessedIds = () => new Set(session.guesses);

  function applyFilter() {
    const tokens = (selectedId == null ? input.value : '').toLowerCase().split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const ch of characters) {
      const hay = `${ch.name} ${ch.short} ${UNITS[ch.unit].label} ${UNITS[ch.unit].short}`.toLowerCase();
      const show = tokens.every((t) => hay.includes(t));
      cells.get(ch.id).hidden = !show;
      if (show) visible += 1;
    }
    none.hidden = visible > 0;
  }

  function select(id) {
    selectedId = id;
    for (const [cid, cell] of cells) cell.setAttribute('aria-pressed', String(cid === id));
    if (id == null) {
      submit.disabled = true;
      lead.replaceChildren(icon('search'));
      return;
    }
    const ch = charById.get(id);
    input.value = ch.name;
    submit.disabled = false;
    lead.replaceChildren(
      createAvatar({ src: images.thumb(ch.avatar), initial: ch.short[0], color: ch.color, size: 28 }),
    );
    applyFilter();
    setOpen(false);
    announce(`${ch.name} selected. Press Guess to submit.`);
  }

  input.addEventListener('focus', () => {
    setOpen(true);
    if (selectedId != null) input.select();
  });
  input.addEventListener('input', () => {
    if (selectedId != null) select(null);
    setOpen(true);
    applyFilter();
  });
  document.addEventListener('pointerdown', onOutsidePointer);
  function onOutsidePointer(event) {
    if (!picker.contains(event.target)) setOpen(false);
  }

  // Enter with nothing chosen picks the first remaining match; a second Enter guesses it.
  // (Handled here rather than via form submission: browsers skip implicit submission
  // while the submit button is disabled.)
  function enterOrSubmit() {
    if (selectedId == null) {
      const first = characters.find((ch) => !cells.get(ch.id).hidden && !guessedIds().has(ch.id));
      if (first) select(first.id);
      return;
    }
    submitGuess();
  }

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      enterOrSubmit();
    }
  });
  picker.addEventListener('submit', (event) => {
    event.preventDefault();
    enterOrSubmit();
  });

  /* ---------- history ---------- */

  const head = h(
    'div',
    { class: 'history-head', 'aria-hidden': 'true' },
    h('span', {}, 'Guess'),
    h('span', {}, 'School'),
    h('span', {}, 'Birthday'),
    h('span', {}, 'Height'),
  );
  const list = h('ol', { class: 'history-list', 'aria-label': 'Your guesses, newest first' });
  const hint = h(
    'p',
    { class: 'empty' },
    'Pick a character. Each tile shows how their school, birthday and height compare with the answer.',
  );
  const history = h('section', { class: 'history', 'aria-label': 'Guesses' }, head, list, hint);

  function buildRow(guessChar, { pending }) {
    const result = compareCharacters(guessChar, answerChar);
    const tiles = [
      createTile({ kind: 'school', state: result.school, value: SCHOOLS[guessChar.school].short, pending }),
      createTile({ kind: 'birthday', state: result.birthday, value: formatBirthday(guessChar.birthday), pending }),
      createTile({ kind: 'height', state: result.height, value: `${guessChar.height} cm`, pending }),
    ];
    const row = h(
      'li',
      { class: pending ? 'row row-character is-new' : 'row row-character' },
      h('span', { class: 'sr-only' }, `${guessChar.name}.`),
      h(
        'div',
        { class: 'row-who' },
        createAvatar({
          src: images.thumb(guessChar.avatar),
          initial: guessChar.short[0],
          color: guessChar.color,
          size: 40,
        }),
        h('span', { class: 'row-name' }, guessChar.short),
      ),
      tiles,
    );
    row.tiles = tiles;
    row.result = result;
    return { row, tiles, result };
  }

  function markGuessed(id) {
    const cell = cells.get(id);
    cell.disabled = true;
    cell.classList.add('is-guessed');
    cell.querySelector('.guessed-note').textContent = ', already guessed';
  }

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
    if (guessedIds().has(selectedId)) return;
    busy = true;
    const guessChar = charById.get(selectedId);
    const keepFocus = document.activeElement === input;
    applyGuess(session, guessChar.id);
    select(null);
    input.value = '';
    applyFilter();
    setOpen(false);

    const { row, tiles, result } = buildRow(guessChar, { pending: !reduced });
    list.prepend(row);
    hint.hidden = true;
    markGuessed(guessChar.id);
    renderStatus();
    if (keepFocus) input.focus({ preventScroll: true });

    await revealTiles(tiles, { reduced });
    const left = MAX_GUESSES - session.guesses.length;
    announce(
      `${guessChar.name}. School ${stateWords('school', result.school)}. Birthday ${stateWords('birthday', result.birthday)}. Height ${stateWords('height', result.height)}.` +
        (session.status === 'playing' ? ` ${plural(left, 'guess')} left.` : ''),
    );
    if (session.status !== 'playing') {
      await sleep(reduced ? 0 : 450);
      renderEnd();
    }
    busy = false;
  }

  function shareText() {
    const marks = { correct: '🟩', wrong: '⬛', higher: '🟨', lower: '🟨' };
    const rows = session.guesses.map((id) => {
      const r = compareCharacters(charById.get(id), answerChar);
      return [r.school, r.birthday, r.height].map((s) => marks[s]).join('');
    });
    const score = session.status === 'won' ? session.guesses.length : 'X';
    const name = mode === 'daily' ? `Character #${puzzleNumber(dateKey)}` : 'Character (random)';
    return `Sekaidle ${name} ${score}/${MAX_GUESSES}\n${rows.join('\n')}\n${location.origin}${location.pathname}`;
  }

  function renderEnd() {
    const won = session.status === 'won';
    root.dataset.outcome = session.status;
    gauge.set(session.guesses.length, session.status);
    title.textContent = answerChar.name;
    status.textContent = won
      ? session.guesses.length === 1
        ? 'First try!'
        : `Solved in ${session.guesses.length} of ${MAX_GUESSES}`
      : session.guesses.length >= MAX_GUESSES
        ? 'Out of guesses'
        : 'Gave up';
    hint.hidden = true;
    if (giveUp) giveUp.hidden = true;
    mystery.replaceWith(
      h(
        'div',
        { class: 'mystery is-revealed' },
        createAvatar({
          src: images.thumb(answerChar.avatar),
          initial: answerChar.short[0],
          color: answerChar.color,
          size: 96,
          label: answerChar.name,
        }),
      ),
    );

    const facts = h(
      'dl',
      { class: 'facts' },
      fact('Unit', UNITS[answerChar.unit].label),
      fact('School', SCHOOLS[answerChar.school].label),
      fact('Birthday', formatBirthday(answerChar.birthday)),
      fact('Height', `${answerChar.height} cm`),
    );

    const actions = h('div', { class: 'result-actions' }, createShareButton(shareText), ...endActions());
    const panel = h('section', { class: 'result', 'aria-label': 'Result' }, facts, actions);
    countdown?.stop();
    if (mode === 'daily') {
      countdown = createCountdown(ctx.refresh);
      panel.append(countdown.el);
    }
    picker.replaceWith(panel);
    document.removeEventListener('pointerdown', onOutsidePointer);
    announce(
      won
        ? `Correct! It was ${answerChar.name}, solved in ${plural(session.guesses.length, 'guess')}.`
        : `Out of guesses. The answer was ${answerChar.name}.`,
    );
  }

  function endActions() {
    return mode === 'daily'
      ? [
          h('button', { class: 'btn btn-secondary', type: 'button', onclick: ctx.playRandom }, icon('dice'), 'Play a random puzzle'),
          h('button', { class: 'btn btn-quiet', type: 'button', onclick: ctx.openStats }, icon('chart'), 'Stats'),
        ]
      : [
          h(
            'button',
            {
              class: 'btn btn-secondary',
              type: 'button',
              onclick: () => {
                resetRandomSession('character', createAnswer);
                ctx.refresh();
              },
            },
            icon('refresh'),
            'New puzzle',
          ),
        ];
  }

  function fact(label, value) {
    return h('div', { class: 'fact' }, h('dt', {}, label), h('dd', {}, value));
  }

  /* ---------- mount ---------- */

  root.dataset.outcome = 'playing';
  root.replaceChildren(hero, picker, history);
  applyFilter();
  for (const id of session.guesses) {
    const guessChar = charById.get(id);
    list.prepend(buildRow(guessChar, { pending: false }).row);
    markGuessed(id);
  }
  hint.hidden = session.guesses.length > 0;
  renderStatus();
  if (session.status !== 'playing') renderEnd();

  return {
    destroy() {
      countdown?.stop();
      document.removeEventListener('pointerdown', onOutsidePointer);
    },
  };
}
