/* Pure game rules, filtering, portrait selection, and share-text formatting (zero DOM). */

import { MAX_GUESSES, birthdayValue, cardArtVariants, images } from './data.js';
import { puzzleNumber } from './rng.js';

export const artWord = (trained) => (trained ? 'Trained' : 'Untrained');

export function cardArtBadgeText(card, trained) {
  if (card.trainedOnly) return 'Trained only';
  if (card.untrainedOnly) return 'Untrained only';
  return artWord(trained);
}

/** 'higher' means the answer is later / taller than the guess; 'lower' the opposite. */
export function compareCharacters(guess, answer) {
  const direction = (g, a) => (g === a ? 'correct' : g < a ? 'higher' : 'lower');
  return {
    school: guess.school === answer.school ? 'correct' : 'wrong',
    birthday: direction(birthdayValue(guess.birthday), birthdayValue(answer.birthday)),
    height: direction(guess.height, answer.height),
  };
}

/**
 * Group means the unit; any Virtual Singer counts as "Virtual Singer", whichever unit's version of
 * the card it is. `art` reports whether the guessed variant matches the variant shown by the puzzle.
 */
export function compareCards(guess, answer, { guessTrained, answerTrained }) {
  return {
    attr: guess.attr === answer.attr ? 'correct' : 'wrong',
    group: guess.unit === answer.unit ? 'correct' : 'wrong',
    character: guess.charId === answer.charId ? 'correct' : 'wrong',
    art: guessTrained === answerTrained ? 'correct' : 'wrong',
  };
}

export function tokenizeQuery(query) {
  return String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function filterCharacters(characters, query) {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) return characters;
  return characters.filter((ch) => tokens.every((t) => ch.haystack.includes(t)));
}

export function filterCards(cards, { query = '', attr = null, unit = null, charId = null } = {}) {
  const tokens = tokenizeQuery(query);
  return cards.filter(
    (card) =>
      (!attr || card.attr === attr) &&
      (!unit || card.unit === unit) &&
      (!charId || card.charId === charId) &&
      tokens.every((t) => card.haystack.includes(t)),
  );
}

/**
 * Roll a random 3★/4★ card thumbnail (untrained or trained, respecting single-art cards)
 * for each character so portraits feel fresh instead of showing one static card forever.
 */
export function rollCharacterPortraits(characters, cardsByCharId, rand = Math.random) {
  const map = new Map();
  for (const ch of characters) {
    const pool = [];
    for (const card of cardsByCharId.get(ch.id) ?? []) {
      for (const trained of cardArtVariants(card)) {
        pool.push(images.thumb(card.asset, trained));
      }
    }
    const picked = pool.length
      ? pool[Math.floor(rand() * pool.length)]
      : images.thumb(ch.avatar, false);
    map.set(ch.id, picked);
  }
  return map;
}

const SHARE_MARKS = { correct: '🟩', wrong: '⬛', higher: '🟨', lower: '🟨' };

export function formatShareText({ gameLabel, mode, dateKey, status, guessCount, tileRows, url }) {
  const lines = tileRows.map((states) => states.map((s) => SHARE_MARKS[s] ?? '⬛').join(''));
  const score = status === 'won' ? guessCount : 'X';
  const title = mode === 'daily' ? `${gameLabel} #${puzzleNumber(dateKey)}` : `${gameLabel} (random)`;
  return `Sekaidle ${title} ${score}/${MAX_GUESSES}\n${lines.join('\n')}\n${url}`;
}
