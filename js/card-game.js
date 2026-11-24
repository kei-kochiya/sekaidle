/* Card mode: name the card from heavily blurred art; each miss sharpens it. */

import { h, icon, announce } from './dom.js';
import { MAX_GUESSES, UNITS, ATTRIBUTES, images, resolveCardArt } from './data.js';
import {
  artWord,
  cardArtBadgeText,
  compareCards,
  filterCards,
  formatShareText,
} from './logic.js';
import { store } from './store.js';
import { pickDailyCard, dailyCoin, formatEpochDay } from './rng.js';
import { createPicker } from './picker.js';
import { createCardFilters } from './card-filters.js';
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

const BLUR = [10, 6.5, 4.2, 2.6, 1.4, 0.7];
const ZOOM = [1.3, 1.2, 1.12, 1.07, 1.03, 1.01];
const PAGE_SIZE = 40;
const DAILY_DELAY_DAYS = 14;
const SEARCH_DEBOUNCE_MS = 120;

// No fallback to the other art on purpose: a "trained" thumbnail must never quietly render untrained.
function cardAvatar(card, size, trained) {
  return createAvatar({
    src: images.thumb(card.asset, trained),
    initial: card.character.short[0],
    color: UNITS[card.unit].color,
    size,
  });
}

function cardMeta(card) {
  const attrMeta = ATTRIBUTES[card.attr];
  return h(
    'span',
    { class: 'card-opt-meta' },
    h('span', { class: 'meta-attr', style: { '--attr': attrMeta.token } }, icon(attrMeta.icon, { size: 14 })),
    attrMeta.label,
    ' · ',
    icon('star', { size: 14 }),
    card.rarity,
    h('span', { class: 'sr-only' }, '-star'),
  );
}

function buildCardRow(card, trained, answerCard, answerTrained, { pending }) {
  const result = compareCards(card, answerCard, { guessTrained: trained, answerTrained });
  const attrMeta = ATTRIBUTES[card.attr];
  const tiles = [
    createTile({
      kind: 'attr',
      state: result.attr,
      value: attrMeta.label,
      lead: icon(attrMeta.icon, { size: 16 }),
      pending,
    }),
    createTile({ kind: 'group', state: result.group, value: UNITS[card.unit].short, pending }),
    createTile({ kind: 'character', state: result.character, value: card.character.short, pending }),
    createTile({ kind: 'art', state: result.art, value: artWord(trained), pending }),
  ];
  const row = h(
    'li',
    { class: pending ? 'row-card is-new' : 'row-card' },
    h('span', { class: 'sr-only' }, `${card.name}, ${card.character.name}.`),
    h(
      'div',
      { class: 'row-card-head', 'aria-hidden': 'true' },
      cardAvatar(card, 44, trained),
      h(
        'div',
        { class: 'row-card-title' },
        h('strong', { lang: card.isJp ? 'ja' : null }, card.name),
        h('span', { class: 'row-card-sub' }, card.character.name, ' · ', cardMeta(card)),
      ),
    ),
    h('div', { class: 'row-card-tiles' }, tiles),
  );
  return { row, tiles, result };
}

function createArtFrame({ src, signal, onRetryFocus }) {
  let attempt = 0;
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
  const retryBtn = h(
    'button',
    {
      class: 'btn btn-secondary',
      type: 'button',
      onclick: () => {
        const hadFocus = document.activeElement === retryBtn;
        load();
        if (hadFocus) onRetryFocus?.();
      },
    },
    icon('refresh'),
    'Try again',
  );
  const failure = h(
    'div',
    { class: 'frame-failure', hidden: true },
    h('p', {}, "The card art didn't load. Check your connection and try again."),
    retryBtn,
  );
  const el = h(
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

  function load() {
    el.dataset.state = 'loading';
    failure.hidden = true;
    img.onload = () => {
      if (!signal?.aborted) el.dataset.state = 'ready';
    };
    img.onerror = () => {
      if (signal?.aborted) return;
      el.dataset.state = 'failed';
      failure.hidden = false;
    };
    img.src = attempt ? `${src}?retry=${attempt}` : src;
    attempt += 1;
  }

  function setStage(stage) {
    el.style.setProperty('--blur', stage == null ? 0 : BLUR[Math.min(stage, BLUR.length - 1)]);
    el.style.setProperty('--zoom', stage == null ? 1 : ZOOM[Math.min(stage, ZOOM.length - 1)]);
  }

  signal?.addEventListener(
    'abort',
    () => {
      img.onload = null;
      img.onerror = null;
    },
    { once: true },
  );

  return { el, load, setStage };
}

export function mountCardGame(root, ctx) {
  const { data, mode, dateKey, signal } = ctx;
  const { cards, cardById, characters, charById } = data;
  const sortedCards = cards.slice().sort((a, b) => b.releaseDay - a.releaseDay || b.id - a.id);

  const createAnswer = () => {
    const answer =
      mode === 'daily'
        ? pickDailyCard(cards, dateKey, DAILY_DELAY_DAYS)
        : cards[Math.floor(Math.random() * cards.length)].id;
    const card = cardById.get(answer) ?? cards[0];
    const coin = mode === 'daily' ? dailyCoin('card', dateKey) : Math.random() < 0.5;
    return { answer: card.id, trained: resolveCardArt(card, coin) };
  };

  const session = ensureSession({
    game: 'card',
    mode,
    dateKey,
    createAnswer,
    isValidAnswer: (id) => cardById.has(id),
  });
  const answerCard = cardById.get(session.answer);
  const answerTrained = resolveCardArt(answerCard, session.trained);

  const savedArtPref = store.getPref('cardArt', 'untrained') === 'trained' ? 'trained' : 'untrained';
  let artMode = session.guesses.length
    ? answerTrained
      ? 'trained'
      : 'untrained'
    : savedArtPref;
  const artFor = (card) => resolveCardArt(card, artMode === 'trained');

  const guessTrainedAt = (index) => {
    const saved = session.arts?.[index];
    if (typeof saved === 'boolean') return saved;
    const gCard = cardById.get(session.guesses[index]);
    return gCard ? resolveCardArt(gCard, session.trained) : answerTrained;
  };
  const guessKey = (id, trained) => `${id}:${trained ? 1 : 0}`;
  const guessedKeys = () => new Set(session.guesses.map((id, i) => guessKey(id, guessTrainedAt(i))));

  let selectedId = null;
  let busy = false;
  let countdown = null;
  let userArtEpoch = 0;
  let debounce = null;
  let listDirty = true;

  const filterState = { query: '', attr: null, unit: null, charId: null, limit: PAGE_SIZE };

  const clearPendingSearch = () => {
    clearTimeout(debounce);
    debounce = null;
  };
  signal?.addEventListener('abort', clearPendingSearch, { once: true });

  /* ---------- hero: the art ---------- */

  const artFrame = createArtFrame({
    src: images.art(answerCard.asset, answerTrained),
    signal,
    onRetryFocus: () => {
      if (session.status === 'playing') picker.focusInputQuietly();
      else root.focus({ preventScroll: true });
    },
  });

  const gauge = createGauge();
  const title = h('h2', { id: 'hero-title', class: 'hero-title' });
  const status = h('p', { class: 'hero-sub' });
  const note = h('p', { class: 'hero-note' });
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
    { class: 'hero hero-card', 'aria-labelledby': 'hero-title' },
    artFrame.el,
    h('div', {}, title, status, h('div', { class: 'hero-meter' }, gauge.el, giveUp), note),
  );

  /* ---------- filters & picker ---------- */

  const filters = createCardFilters({
    characters,
    charById,
    filterState,
    onChange: () => resetList(),
  });

  const count = h('p', { class: 'results-count' });
  const candidateList = h('ul', {
    id: 'card-listbox',
    class: 'card-list',
    role: 'listbox',
    'aria-label': 'Cards',
  });
  const more = h(
    'button',
    {
      class: 'btn btn-secondary btn-block',
      type: 'button',
      onclick: () => {
        const hadFocus = document.activeElement === more;
        filterState.limit += PAGE_SIZE;
        renderList();
        if (more.hidden && hadFocus) picker.focusInputQuietly();
      },
    },
    'Show more cards',
  );
  const none = h('p', { class: 'empty', hidden: true }, 'No card matches. Try fewer words or clear a filter.');

  const artButtons = ['untrained', 'trained'].map((key) =>
    h(
      'button',
      {
        type: 'button',
        class: 'seg-btn',
        'aria-pressed': 'false',
        dataset: { key },
        onclick: () => {
          userArtEpoch += 1;
          store.setPref('cardArt', key);
          setArtMode(key);
        },
      },
      artWord(key === 'trained'),
    ),
  );
  const artPick = h(
    'div',
    { class: 'art-pick' },
    h('span', { class: 'art-pick-label', id: 'art-pick-label' }, 'Art'),
    h('div', { class: 'seg seg-art', role: 'group', 'aria-labelledby': 'art-pick-label' }, artButtons),
  );

  const optionEls = new Map();

  const picker = createPicker({
    idPrefix: 'card',
    searchLabel: 'Search cards',
    placeholder: 'Search cards or characters',
    toggleLabels: { open: 'Hide cards', closed: 'Show cards' },
    extraControls: artPick,
    resultsChildren: [filters.el, count, candidateList, none, more],
    getNavigableItems: () => {
      if (debounce !== null) resetList();
      const out = [];
      for (const [id, el] of optionEls) {
        if (el.getAttribute('aria-disabled') !== 'true') out.push({ id, el });
      }
      return out;
    },
    hasSelection: () => selectedId != null,
    onInput: (value) => {
      if (selectedId != null) select(null);
      filterState.query = value;
      clearPendingSearch();
      debounce = setTimeout(resetList, SEARCH_DEBOUNCE_MS);
    },
    onSelect: (id, meta) => select(id, meta),
    onSubmit: () => submitGuess(),
    onCloseInner: () => filters.closeDrawerIfOpen(),
    onOpenChange: (open) => {
      if (!open) filters.setDrawerOpen(false);
      if (open && listDirty && session.status === 'playing') resetList();
    },
    onViewportChange: (isDesktop) => {
      if (isDesktop && listDirty && session.status === 'playing') resetList();
    },
    signal,
  });

  function syncSelectionAndArt() {
    const selectedCard = selectedId != null ? cardById.get(selectedId) : null;
    const effectiveKey = selectedCard
      ? artFor(selectedCard)
        ? 'trained'
        : 'untrained'
      : artMode;

    for (const button of artButtons) {
      const key = button.dataset.key;
      const unavailable =
        Boolean(selectedCard?.trainedOnly && key === 'untrained') ||
        Boolean(selectedCard?.untrainedOnly && key === 'trained');
      button.disabled = unavailable;
      button.setAttribute('aria-pressed', String(key === effectiveKey));
    }

    if (!selectedCard) {
      picker.submit.disabled = true;
      return;
    }

    const trained = artFor(selectedCard);
    const alreadyGuessed = guessedKeys().has(guessKey(selectedCard.id, trained));
    picker.submit.disabled = alreadyGuessed;
    picker.input.value = `${selectedCard.name} · ${selectedCard.character.short} · ${artWord(trained)}`;
    picker.lead.replaceChildren(cardAvatar(selectedCard, 28, trained));
  }

  function setArtMode(nextMode) {
    artMode = nextMode;
    syncSelectionAndArt();
    if (session.status === 'playing') renderList();
  }

  function resetList() {
    clearPendingSearch();
    filterState.limit = PAGE_SIZE;
    candidateList.scrollTop = 0;
    picker.results.scrollTop = 0;
    renderList();
  }

  function renderList() {
    picker.clearActive();
    optionEls.clear();
    listDirty = false;

    const all = filterCards(sortedCards, filterState);
    const guessed = guessedKeys();
    const shown = all.slice(0, filterState.limit);

    candidateList.replaceChildren(
      ...shown.map((card) => {
        const trained = artFor(card);
        const done = guessed.has(guessKey(card.id, trained));
        const opt = h(
          'li',
          {
            id: `card-opt-${card.id}`,
            role: 'option',
            class: 'card-opt',
            'aria-selected': String(card.id === selectedId),
            'aria-disabled': String(done),
            dataset: { id: card.id },
            onclick: () => {
              if (done) return;
              select(card.id, { source: 'pointer' });
            },
          },
          cardAvatar(card, 48, trained),
          h(
            'span',
            { class: 'card-opt-text' },
            h('span', { class: 'card-opt-name', lang: card.isJp ? 'ja' : null }, card.name),
            h(
              'span',
              { class: 'card-opt-sub' },
              card.character.short,
              ' · ',
              cardMeta(card),
              h('span', { class: 'art-tag' }, cardArtBadgeText(card, trained)),
            ),
          ),
          done && h('span', { class: 'card-opt-done' }, 'Guessed'),
        );
        optionEls.set(card.id, opt);
        return opt;
      }),
    );

    more.hidden = all.length <= shown.length;
    none.hidden = all.length > 0;
    count.textContent =
      all.length === cards.length ? `${cards.length} cards` : `${plural(all.length, 'card')} found`;
  }

  function select(id, { source = 'program' } = {}) {
    userArtEpoch += 1;
    clearPendingSearch();
    selectedId = id;
    picker.clearActive();
    for (const [cid, el] of optionEls) {
      el.setAttribute('aria-selected', String(cid === id));
    }
    if (id == null) {
      syncSelectionAndArt();
      picker.lead.replaceChildren(icon('search'));
      return;
    }
    const card = cardById.get(id);
    if (!card) return;
    if (filterState.query !== '') {
      filterState.query = '';
      listDirty = true;
    }
    syncSelectionAndArt();
    if (listDirty && picker.isDesktop()) resetList();
    picker.setOpen(false);
    picker.focusAfterSelect(source);
    announce(
      `${card.name}, ${card.character.name}, ${artWord(artFor(card)).toLowerCase()} art, selected. Press Guess to submit.`,
    );
  }

  /* ---------- history ---------- */

  const historyList = h('ol', { class: 'history-list', 'aria-label': 'Your guesses, newest first' });
  const hint = h(
    'p',
    { class: 'empty' },
    'Search for any card you think it could be, and pick the art you think it shows. Tiles show whether its attribute, group, character and art match the answer.',
  );
  const history = h('section', { class: 'history', 'aria-label': 'Guesses' }, historyList, hint);

  /* ---------- flow ---------- */

  function renderStatus() {
    const used = session.guesses.length;
    gauge.set(used, session.status);
    if (session.status === 'playing') {
      title.textContent = mode === 'daily' ? "Today's card" : 'Random card';
      status.textContent = `Guess ${used + 1} of ${MAX_GUESSES}`;
      if (used === 0) note.textContent = 'The art sharpens a little with every wrong guess.';
      artFrame.setStage(used);
    }
  }

  async function submitGuess() {
    if (busy || session.status !== 'playing' || selectedId == null) return;
    if (mode === 'daily' && session.guesses.length === 0 && ctx.rolloverIfStale()) return;
    const card = cardById.get(selectedId);
    if (!card) return;
    const trained = artFor(card);
    if (guessedKeys().has(guessKey(card.id, trained))) return;

    busy = true;
    try {
      const exact = card.id === answerCard.id && trained === answerTrained;
      let epochAtSubmit = 0;
      const formatSpeech = (result) =>
        `${card.name}, ${artWord(trained).toLowerCase()} art. Attribute ${stateWords('attr', result.attr)}. Group ${stateWords('group', result.group)}. Character ${stateWords('character', result.character)}. Art ${stateWords('art', result.art)}.`;

      await executeGuessTurn({
        session,
        picker,
        historyList,
        hintEl: hint,
        signal,
        commitAndBuildRow: ({ reduced }) => {
          applyGuess(session, card.id, { correct: exact, art: trained });
          select(null);
          filterState.query = '';
          epochAtSubmit = userArtEpoch;
          return buildCardRow(card, trained, answerCard, answerTrained, { pending: !reduced });
        },
        onAfterCommit: () => {
          resetList();
          renderStatus();
        },
        onRevealPlaying: ({ result, left }) => {
          const sameEverything =
            result.attr === 'correct' && result.group === 'correct' && result.character === 'correct';
          note.textContent =
            card.id === answerCard.id
              ? 'Right card, wrong art. Try its other version.'
              : sameEverything
                ? 'Same character, attribute and group, but a different card. Let the art decide.'
                : '';
          if (userArtEpoch === epochAtSubmit && selectedId == null) {
            setArtMode(answerTrained ? 'trained' : 'untrained');
          }
          announce(`${formatSpeech(result)} The art is a little sharper. ${plural(left, 'guess')} left.`);
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
    const tileRows = [];
    session.guesses.forEach((id, i) => {
      const gCard = cardById.get(id);
      if (!gCard) return;
      const r = compareCards(gCard, answerCard, { guessTrained: guessTrainedAt(i), answerTrained });
      tileRows.push([r.attr, r.group, r.character, r.art]);
    });
    return formatShareText({
      gameLabel: 'Card',
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
    artFrame.setStage(null);
    artFrame.el.setAttribute('aria-label', `${answerCard.name}, ${answerCard.character.name}`);
    title.textContent = answerCard.name;
    if (answerCard.isJp) title.setAttribute('lang', 'ja');
    else title.removeAttribute('lang');
    status.textContent = outcomeStatusText(session);
    hint.hidden = true;
    note.textContent = '';

    countdown?.stop();
    const mounted = mountResultPanel({
      pickerEl: picker.el,
      giveUpBtn: giveUp,
      mode,
      dateKey,
      factPairs: [
        ['Character', answerCard.character.name],
        ['Attribute', ATTRIBUTES[answerCard.attr].label],
        ['Group', wrapCross(UNITS[answerCard.unit].label)],
        ['Rarity', `${answerCard.rarity}-star, ${artWord(answerTrained).toLowerCase()} art`],
        ['Released (JP)', formatEpochDay(answerCard.releaseDay)],
      ],
      buildShareText,
      onNewRandom: () => {
        resetRandomSession('card', createAnswer);
        ctx.refresh();
      },
      ctx,
    });
    countdown = mounted.countdown;

    if (!silent && !signal?.aborted) {
      announce(`${announcePrefix}${outcomeAnnouncement(session, answerCard.name)}`);
    }
  }

  /* ---------- mount ---------- */

  root.dataset.outcome = 'playing';
  root.replaceChildren(hero, picker.el, history);
  session.guesses.forEach((id, i) => {
    const gCard = cardById.get(id);
    if (gCard) {
      historyList.prepend(buildCardRow(gCard, guessTrainedAt(i), answerCard, answerTrained, { pending: false }).row);
    }
  });
  hint.hidden = session.guesses.length > 0;
  artFrame.setStage(Math.min(session.guesses.length, BLUR.length - 1));
  renderStatus();
  artFrame.load();

  if (session.status === 'playing') {
    filters.sync();
    setArtMode(artMode);
  } else {
    renderEnd({ silent: true });
  }

  return {
    destroy() {
      clearPendingSearch();
      countdown?.stop();
    },
  };
}
