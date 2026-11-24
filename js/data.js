/* Game data: loading, normalized models, lookup tables, and image URLs. */

export const MAX_GUESSES = 6;

const IMAGE_HOST = 'https://assets.unipjsk.com/startapp/';

export const UNITS = {
  leo_need: { label: 'Leo/need', short: 'Leo/need', color: 'var(--unit-leo-need)' },
  mmj: { label: 'MORE MORE JUMP!', short: 'MMJ', color: 'var(--unit-mmj)' },
  vbs: { label: 'Vivid BAD SQUAD', short: 'VBS', color: 'var(--unit-vbs)' },
  wxs: { label: 'Wonderlands×Showtime', short: 'WxS', color: 'var(--unit-wxs)' },
  n25: { label: 'Nightcord at 25:00', short: 'Nightcord', color: 'var(--unit-n25)' },
  vs: { label: 'Virtual Singer', short: 'Virtual Singer', color: 'var(--unit-vs)' },
};

export const UNIT_ORDER = ['leo_need', 'mmj', 'vbs', 'wxs', 'n25', 'vs'];

export const SCHOOLS = {
  // Soft hyphens (U+00AD): on a very narrow tile the word breaks at a syllable, not mid-letter.
  miyamasuzaka: { label: 'Miyamasuzaka Girls Academy', short: 'Miya\u00admasu\u00adzaka' },
  kamiyama: { label: 'Kamiyama High School', short: 'Kami\u00adyama' },
  correspondence: { label: 'Correspondence School', short: 'Cor\u00adre\u00adspon\u00addence' },
  none: { label: 'No school', short: 'No school' },
};

export const ATTRIBUTES = {
  cute: { label: 'Cute', icon: 'heart', token: 'var(--attr-cute)' },
  cool: { label: 'Cool', icon: 'drop', token: 'var(--attr-cool)' },
  pure: { label: 'Pure', icon: 'leaf', token: 'var(--attr-pure)' },
  happy: { label: 'Happy', icon: 'star', token: 'var(--attr-happy)' },
  mysterious: { label: 'Mysterious', icon: 'moon', token: 'var(--attr-mysterious)' },
};

export const ATTRIBUTE_ORDER = ['cute', 'cool', 'pure', 'happy', 'mysterious'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatBirthday = ([month, day]) => `${MONTHS[month - 1]} ${day}`;

/** Sortable month-day number; birthdays have no year, so this is the whole comparison. */
export const birthdayValue = ([month, day]) => month * 100 + day;

const variantName = (trained) => (trained ? 'after_training' : 'normal');

/** Resolve a valid art boolean for a card, clamping single-art cards to the only art they have. */
export function resolveCardArt(card, preferTrained = false) {
  if (card.trainedOnly) return true;
  if (card.untrainedOnly) return false;
  return Boolean(preferTrained);
}

/** Return the valid (trained: boolean) variants available for a card. */
export function cardArtVariants(card) {
  if (card.trainedOnly) return [true];
  if (card.untrainedOnly) return [false];
  return [false, true];
}

export const images = {
  /** 128px square face crop. */
  thumb(assetName, trained = false) {
    return `${IMAGE_HOST}thumbnail/chara/${assetName}_${variantName(trained)}.png`;
  },
  /** 940×530 card art (the "small" rendition is a fifth of the full-size download). */
  art(assetName, trained = false) {
    return `${IMAGE_HOST}character/member_small/${assetName}/card_${variantName(trained)}.png`;
  },
};

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

/** Normalize compact wire JSON (`c`, `r`, `at`, `n`, `b`, `d`, `jp`, `t`, `nt`) into readable fields. */
export function normalizeRuntimeData(rawCharacters, rawCardData) {
  if (!Array.isArray(rawCharacters) || !Array.isArray(rawCardData?.cards)) {
    throw new Error('Malformed game data payload');
  }

  const characters = rawCharacters
    .filter(
      (ch) =>
        ch &&
        Number.isInteger(ch.id) &&
        UNITS[ch.unit] &&
        SCHOOLS[ch.school] &&
        Array.isArray(ch.birthday) &&
        ch.birthday.length === 2 &&
        Number.isFinite(ch.height),
    )
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((ch) => ({
      ...ch,
      haystack: [ch.name, ch.short, UNITS[ch.unit].label, UNITS[ch.unit].short, ch.unit]
        .join(' ')
        .toLowerCase(),
    }));

  const charById = new Map(characters.map((ch) => [ch.id, ch]));
  const cardsByCharId = new Map(characters.map((ch) => [ch.id, []]));

  const cards = [];
  for (const raw of rawCardData.cards) {
    const character = charById.get(raw?.c);
    const attrMeta = ATTRIBUTES[raw?.at];
    if (
      !character ||
      !attrMeta ||
      !Number.isInteger(raw.id) ||
      !Number.isFinite(raw.d) ||
      typeof raw.n !== 'string' ||
      typeof raw.b !== 'string' ||
      !raw.b
    ) {
      continue;
    }

    const card = {
      id: raw.id,
      charId: raw.c,
      rarity: raw.r,
      attr: raw.at,
      name: raw.n,
      asset: raw.b,
      releaseDay: raw.d,
      isJp: Boolean(raw.jp),
      trainedOnly: Boolean(raw.t),
      untrainedOnly: Boolean(raw.nt),
      character,
      unit: character.unit,
      haystack: [
        raw.n,
        character.name,
        character.short,
        attrMeta.label,
        UNITS[character.unit].label,
        UNITS[character.unit].short,
        character.unit,
      ]
        .join(' ')
        .toLowerCase(),
    };
    cards.push(card);
    cardsByCharId.get(card.charId)?.push(card);
  }

  if (!characters.length || !cards.length) {
    throw new Error('Empty character or card dataset');
  }

  return {
    meta: rawCardData.meta ?? { built: '', latestCard: '', cards: cards.length, characters: characters.length },
    characters,
    charById,
    cards,
    cardById: new Map(cards.map((c) => [c.id, c])),
    cardsByCharId,
  };
}

export async function loadData() {
  const [rawCharacters, rawCardData] = await Promise.all([
    fetchJson('data/characters.json'),
    fetchJson('data/cards.json'),
  ]);
  return normalizeRuntimeData(rawCharacters, rawCardData);
}
