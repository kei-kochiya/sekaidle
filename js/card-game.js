/* Card mode: name the card from heavily blurred art; each miss sharpens it. */

import { h, icon, announce, prefersReducedMotion, sleep } from './dom.js';
import { UNITS, UNIT_ORDER, ATTRIBUTES, ATTRIBUTE_ORDER, images } from './data.js';
import { MAX_GUESSES } from './store.js';
import { pickDaily, dailyCoin, puzzleNumber } from './rng.js';
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

/**
 * Blur radius (as a percentage of the frame's width) and zoom for each stage.
 * Stage = number of wrong guesses so far. Zoom hides the soft edges a heavy blur
 * leaves behind, and relaxes toward 1 as the picture sharpens.
 */
const BLUR = [10, 6.5, 4.2, 2.6, 1.4, 0.7];
const ZOOM = [1.3, 1.2, 1.12, 1.07, 1.03, 1.01];

const PAGE_SIZE = 40;

/** Group means the unit; any Virtual Singer counts as "Virtual Singer", whichever unit's version of the card it is. */
export function compareCards(guess, answer) {
  return {
    attr: guess.at === answer.at ? 'correct' : 'wrong',
    group: guess.unit === answer.unit ? 'correct' : 'wrong',
    character: guess.c === answer.c ? 'correct' : 'wrong',
  };
}

export function mountCardGame(root, ctx) {
  const { data, mode, dateKey } = ctx;
  const { cards, cardById } = data;
  const reduced = prefersReducedMotion();
  const sorted = cards.slice().sort((a, b) => b.d - a.d || b.id - a.id);

  const createAnswer = () => {
    const ids = cards.map((c) => c.id).sort((a, b) => a - b);
    const answer =
      mode === 'daily' ? pickDaily('card', ids, dateKey) : ids[Math.floor(Math.random() * ids.length)];
    const card = cardById.get(answer);
    const trained = card.trainedOnly || (mode === 'daily' ? dailyCoin('card', dateKey) : Math.random() < 0.5);
    return { answer, trained };
  };

  let session = ensureSession({ game: 'card', mode, dateKey, createAnswer });
  // The saved answer wins over today's pool, so a data refresh never changes a puzzle mid-game.
  let answerCard = cardById.get(session.answer) ?? cardById.get(createAnswer().answer);
  let selectedId = null;
  let busy = false;
  let countdown = null;
  let artAttempt = 0;
  const state = { query: '', attr: null, unit: null, limit: PAGE_SIZE };

  /* ---------- hero: the art ---------- */

  const img = h('img', {
    class: 'frame-img',
    alt: '',
    decoding: 'async',
    referrerpolicy: 'no-referrer',
    draggable: 'false',
    fetchpriority: 'high',
    width: 940,
    height: 530,
  });
  const failure = h(
    'div',
    { class: 'frame-failure', hidden: true },
    h('p', {}, "The card art didn't load. Check your connection and try again."),
    h('button', { class: 'btn btn-secondary', type: 'button', onclick: loadArt }, icon('refresh'), 'Try again'),
  );
  const frame = h(
    'figure',
    {
      class: 'frame',
      dataset: { state: 'loading' },
      role: 'img',
      'aria-label': 'Blurred card art. It sharpens with each wrong guess.',
    },
    h('div', { class: 'frame-skeleton', 'aria-hidden': 'true' }),
    img,
    failure,
  );

  function loadArt() {
    frame.dataset.state = 'loading';
    failure.hidden = true;
    img.onload = () => (frame.dataset.state = 'ready');
    img.onerror = () => {
      frame.dataset.state = 'failed';
      failure.hidden = false;
    };
    const base = images.art(answerCard.b, session.trained);
    img.src = artAttempt ? `${base}?retry=${artAttempt}` : base;
    artAttempt += 1;
  }

  function setStage(stage) {
    frame.style.setProperty('--blur', stage == null ? 0 : BLUR[Math.min(stage, BLUR.length - 1)]);
    frame.style.setProperty('--zoom', stage == null ? 1 : ZOOM[Math.min(stage, ZOOM.length - 1)]);
  }

  const gauge = createGauge();
  const title = h('h2', { class: 'hero-title' });
  const status = h('p', { class: 'hero-sub' });
  const note = h('p', { class: 'hero-note', 'aria-live': 'polite' });
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
    { class: 'hero hero-card', 'aria-labelledby': 'hero-title' },
    frame,
    h('div', { class: 'hero-copy' }, title, status, h('div', { class: 'hero-meter' }, gauge.el, giveUp), note),
  );
  title.id = 'hero-title';

  /* ---------- picker ---------- */

  const input = h('input', {
    id: 'card-search',
    class: 'field-input',
    type: 'text',
    role: 'combobox',
    placeholder: 'Search cards or characters',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'go',
    'aria-expanded': 'false',
    'aria-controls': 'card-results',
    'aria-autocomplete': 'list',
  });
  const lead = h('span', { class: 'field-lead' }, icon('search'));
  const toggle = h(
    'button',
    {
      class: 'field-toggle',
      type: 'button',
      'aria-label': 'Show cards',
      'aria-expanded': 'false',
      'aria-controls': 'card-results',
      onclick: () => setOpen(picker.dataset.open !== 'true'),
    },
    icon('chevron'),
  );
  const field = h('div', { class: 'field' }, lead, input, toggle);
  const submit = h('button', { class: 'btn btn-primary', type: 'submit', disabled: true }, 'Guess');

  const attrChips = ATTRIBUTE_ORDER.map((key) =>
    chip(ATTRIBUTES[key].label, {
      lead: icon(ATTRIBUTES[key].icon, { size: 16 }),
      color: ATTRIBUTES[key].color,
      onclick: () => {
        state.attr = state.attr === key ? null : key;
        syncChips();
        resetList();
      },
      key,
    }),
  );
  const unitChips = UNIT_ORDER.map((key) =>
    chip(UNITS[key].short, {
      color: UNITS[key].color,
      onclick: () => {
        state.unit = state.unit === key ? null : key;
        syncChips();
        resetList();
      },
      key,
    }),
  );
  const filters = h(
    'div',
    { class: 'filters' },
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by attribute' }, attrChips),
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by group' }, unitChips),
  );
  const count = h('p', { class: 'results-count', 'aria-live': 'polite' });
  const list = h('ul', { class: 'card-list', 'aria-label': 'Cards' });
  const more = h(
    'button',
    {
      class: 'btn btn-secondary btn-block',
      type: 'button',
      onclick: () => {
        state.limit += PAGE_SIZE;
        renderList();
      },
    },
    'Show more cards',
  );
  const none = h('p', { class: 'empty', hidden: true }, 'No card matches. Try fewer words or clear a filter.');
  const results = h('div', { id: 'card-results', class: 'picker-results' }, filters, count, list, none, more);

  const picker = h(
    'form',
    { class: 'picker', dataset: { open: 'false' }, autocomplete: 'off', novalidate: true },
    h('label', { class: 'sr-only', for: 'card-search' }, 'Search cards'),
    h('div', { class: 'picker-bar' }, field, submit),
    results,
  );

  function chip(label, { lead, color, onclick, key }) {
    return h(
      'button',
      {
        type: 'button',
        class: 'chip',
        'aria-pressed': 'false',
        dataset: { key },
        style: { '--chip': color },
        onclick,
      },
      lead ?? h('span', { class: 'chip-dot', 'aria-hidden': 'true' }),
      label,
    );
  }

  function syncChips() {
    for (const c of attrChips) c.setAttribute('aria-pressed', String(c.dataset.key === state.attr));
    for (const c of unitChips) c.setAttribute('aria-pressed', String(c.dataset.key === state.unit));
  }

  function setOpen(open) {
    picker.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    input.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Hide cards' : 'Show cards');
  }

  const guessedIds = () => new Set(session.guesses);
  const label = (card) => `${card.n} · ${card.character.short}`;

  function matching() {
    const tokens = state.query.toLowerCase().split(/\s+/).filter(Boolean);
    return sorted.filter(
      (card) =>
        (!state.attr || card.at === state.attr) &&
        (!state.unit || card.unit === state.unit) &&
        tokens.every((t) => card.haystack.includes(t)),
    );
  }

  function resetList() {
    state.limit = PAGE_SIZE;
    list.scrollTop = 0;
    results.scrollTop = 0;
    renderList();
  }

  function renderList() {
    const all = matching();
    const guessed = guessedIds();
    const shown = all.slice(0, state.limit);
    list.replaceChildren(
      ...shown.map((card) => {
        const done = guessed.has(card.id);
        return h(
          'li',
          {},
          h(
            'button',
            {
              type: 'button',
              class: 'card-opt',
              'aria-pressed': String(card.id === selectedId),
              disabled: done,
              dataset: { id: card.id },
              onclick: () => select(card.id),
            },
            createAvatar({
              src: images.thumb(card.b, card.trainedOnly),
              initial: card.character.short[0],
              color: UNITS[card.unit].color,
              size: 48,
            }),
            h(
              'span',
              { class: 'card-opt-text' },
              h('span', { class: 'card-opt-name', lang: card.jp ? 'ja' : null }, card.n),
              h('span', { class: 'card-opt-sub' }, card.character.short, ' · ', cardMeta(card)),
            ),
            done && h('span', { class: 'card-opt-done' }, 'Guessed'),
          ),
        );
      }),
    );
    more.hidden = all.length <= shown.length;
    none.hidden = all.length > 0;
    count.textContent = all.length === cards.length ? `${cards.length} cards` : `${plural(all.length, 'card')} found`;
  }

  function cardMeta(card) {
    return h(
      'span',
      { class: 'card-opt-meta' },
      h('span', { class: 'meta-attr', style: { color: ATTRIBUTES[card.at].color } }, icon(ATTRIBUTES[card.at].icon, { size: 14 })),
      ATTRIBUTES[card.at].label,
      ' · ',
      icon('star', { size: 14 }),
      card.r,
    );
  }

  function select(id) {
    selectedId = id;
    for (const button of list.querySelectorAll('.card-opt')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.id) === id));
    }
    if (id == null) {
      submit.disabled = true;
      lead.replaceChildren(icon('search'));
      return;
    }
    const card = cardById.get(id);
    state.query = '';
    input.value = label(card);
    submit.disabled = false;
    lead.replaceChildren(
      createAvatar({
        src: images.thumb(card.b, card.trainedOnly),
        initial: card.character.short[0],
        color: UNITS[card.unit].color,
        size: 28,
      }),
    );
    setOpen(false);
    announce(`${card.n}, ${card.character.name}, selected. Press Guess to submit.`);
  }

  let debounce = null;
  input.addEventListener('focus', () => {
    setOpen(true);
    if (selectedId != null) input.select();
  });
  input.addEventListener('input', () => {
    if (selectedId != null) select(null);
    state.query = input.value;
    setOpen(true);
    clearTimeout(debounce);
    debounce = setTimeout(resetList, 120);
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
      clearTimeout(debounce);
      state.query = input.value;
      const first = matching().find((card) => !guessedIds().has(card.id));
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

  const list2 = h('ol', { class: 'history-list', 'aria-label': 'Your guesses, newest first' });
  const hint = h(
    'p',
    { class: 'empty' },
    'Search for any card you think it could be. Tiles show whether its attribute, group and character match the answer.',
  );
  const history = h('section', { class: 'history', 'aria-label': 'Guesses' }, list2, hint);

  function buildRow(card, { pending }) {
    const result = compareCards(card, answerCard);
    const tiles = [
      createTile({
        kind: 'attr',
        state: result.attr,
        value: ATTRIBUTES[card.at].label,
        lead: icon(ATTRIBUTES[card.at].icon, { size: 16 }),
        pending,
      }),
      createTile({ kind: 'group', state: result.group, value: UNITS[card.unit].short, pending }),
      createTile({ kind: 'character', state: result.character, value: card.character.short, pending }),
    ];
    const row = h(
      'li',
      { class: pending ? 'row row-card is-new' : 'row row-card' },
      h('span', { class: 'sr-only' }, `${card.n}, ${card.character.name}.`),
      h(
        'div',
        { class: 'row-card-head', 'aria-hidden': 'true' },
        createAvatar({
          src: images.thumb(card.b, card.trainedOnly),
          initial: card.character.short[0],
          color: UNITS[card.unit].color,
          size: 44,
        }),
        h(
          'div',
          { class: 'row-card-title' },
          h('strong', { lang: card.jp ? 'ja' : null }, card.n),
          h('span', { class: 'row-card-sub' }, card.character.name, ' · ', cardMeta(card)),
        ),
      ),
      h('div', { class: 'row-card-tiles' }, tiles),
    );
    return { row, tiles, result };
  }

  /* ---------- flow ---------- */

  function renderStatus() {
    const used = session.guesses.length;
    gauge.set(used, session.status);
    if (session.status === 'playing') {
      title.textContent = mode === 'daily' ? "Today's card" : 'Random card';
      status.textContent = `Guess ${used + 1} of ${MAX_GUESSES}`;
      if (used === 0) note.textContent = 'The art sharpens a little with every wrong guess.';
      setStage(used);
    }
  }

  async function submitGuess() {
    if (busy || session.status !== 'playing' || selectedId == null) return;
    if (guessedIds().has(selectedId)) return;
    busy = true;
    const card = cardById.get(selectedId);
    const keepFocus = document.activeElement === input;
    applyGuess(session, card.id);
    select(null);
    input.value = '';
    state.query = '';
    setOpen(false);
    renderList();

    const { row, tiles, result } = buildRow(card, { pending: !reduced });
    list2.prepend(row);
    hint.hidden = true;
    renderStatus();
    if (keepFocus) input.focus({ preventScroll: true });

    await revealTiles(tiles, { reduced });
    const sameEverything = result.attr === 'correct' && result.group === 'correct' && result.character === 'correct';
    const left = MAX_GUESSES - session.guesses.length;
    if (session.status === 'playing') {
      note.textContent = sameEverything
        ? 'Same character, attribute and group, but a different card. Let the art decide.'
        : '';
    }
    announce(
      `${card.n}. Attribute ${stateWords('attr', result.attr)}. Group ${stateWords('group', result.group)}. Character ${stateWords('character', result.character)}.` +
        (session.status === 'playing' ? ` The art is a little sharper. ${plural(left, 'guess')} left.` : ''),
    );
    if (session.status !== 'playing') {
      await sleep(reduced ? 0 : 250);
      renderEnd();
    }
    busy = false;
  }

  function shareText() {
    const marks = { correct: '🟩', wrong: '⬛' };
    const rows = session.guesses.map((id) => {
      const r = compareCards(cardById.get(id), answerCard);
      return [r.attr, r.group, r.character].map((s) => marks[s]).join('');
    });
    const score = session.status === 'won' ? session.guesses.length : 'X';
    const name = mode === 'daily' ? `Card #${puzzleNumber(dateKey)}` : 'Card (random)';
    return `Sekaidle ${name} ${score}/${MAX_GUESSES}\n${rows.join('\n')}\n${location.origin}${location.pathname}`;
  }

  function renderEnd() {
    const won = session.status === 'won';
    root.dataset.outcome = session.status;
    gauge.set(session.guesses.length, session.status);
    setStage(null);
    frame.setAttribute('aria-label', `${answerCard.n}, ${answerCard.character.name}`);
    title.textContent = answerCard.n;
    title.lang = answerCard.jp ? 'ja' : '';
    status.textContent = won
      ? session.guesses.length === 1
        ? 'First try!'
        : `Solved in ${session.guesses.length} of ${MAX_GUESSES}`
      : session.guesses.length >= MAX_GUESSES
        ? 'Out of guesses'
        : 'Gave up';
    hint.hidden = true;
    note.textContent = '';
    if (giveUp) giveUp.hidden = true;

    const released = new Date(answerCard.d * 86400000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    const facts = h(
      'dl',
      { class: 'facts' },
      fact('Character', answerCard.character.name),
      fact('Attribute', ATTRIBUTES[answerCard.at].label),
      fact('Group', UNITS[answerCard.unit].label),
      fact('Rarity', `${answerCard.r}-star, ${session.trained ? 'trained' : 'untrained'} art`),
      fact('Released (JP)', released),
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
        ? `Correct! It was ${answerCard.n}, solved in ${plural(session.guesses.length, 'guess')}.`
        : `Out of guesses. The answer was ${answerCard.n}.`,
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
                resetRandomSession('card', createAnswer);
                ctx.refresh();
              },
            },
            icon('refresh'),
            'New puzzle',
          ),
        ];
  }

  function fact(labelText, value) {
    return h('div', { class: 'fact' }, h('dt', {}, labelText), h('dd', {}, value));
  }

  /* ---------- mount ---------- */

  root.dataset.outcome = 'playing';
  root.replaceChildren(hero, picker, history);
  syncChips();
  renderList();
  for (const id of session.guesses) {
    list2.prepend(buildRow(cardById.get(id), { pending: false }).row);
  }
  hint.hidden = session.guesses.length > 0;
  setStage(Math.min(session.guesses.length, BLUR.length - 1));
  renderStatus();
  loadArt();
  if (session.status !== 'playing') renderEnd();

  return {
    destroy() {
      clearTimeout(debounce);
      countdown?.stop();
      document.removeEventListener('pointerdown', onOutsidePointer);
    },
  };
}
