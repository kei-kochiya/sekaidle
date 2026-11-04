/* Game data: loading, lookup tables, and image URLs. */

const IMAGE_HOST = 'https://assets.unipjsk.com/startapp/';

export const UNITS = {
  leo_need: { label: 'Leo/need', short: 'Leo/need', color: '#4455dd' },
  mmj: { label: 'MORE MORE JUMP!', short: 'MMJ', color: '#88dd44' },
  vbs: { label: 'Vivid BAD SQUAD', short: 'VBS', color: '#ee1166' },
  wxs: { label: 'Wonderlands×Showtime', short: 'WxS', color: '#ff9900' },
  n25: { label: 'Nightcord at 25:00', short: 'Nightcord', color: '#884499' },
  vs: { label: 'Virtual Singer', short: 'Virtual Singer', color: '#33ccbb' },
};

export const UNIT_ORDER = ['leo_need', 'mmj', 'vbs', 'wxs', 'n25', 'vs'];

export const SCHOOLS = {
  // Soft hyphens (U+00AD): on a very narrow tile the word breaks at a syllable, not mid-letter.
  miyamasuzaka: { label: 'Miyamasuzaka Girls Academy', short: 'Miya­masu­zaka' },
  kamiyama: { label: 'Kamiyama High School', short: 'Kami­yama' },
  correspondence: { label: 'Correspondence School', short: 'Cor­re­spon­dence' },
  none: { label: 'No school', short: 'No school' },
};

export const ATTRIBUTES = {
  cute: { label: 'Cute', color: '#ff6699', icon: 'heart' },
  cool: { label: 'Cool', color: '#4488ee', icon: 'drop' },
  pure: { label: 'Pure', color: '#44bb55', icon: 'leaf' },
  happy: { label: 'Happy', color: '#ffaa22', icon: 'star' },
  mysterious: { label: 'Mysterious', color: '#9966cc', icon: 'moon' },
};

export const ATTRIBUTE_ORDER = ['cute', 'cool', 'pure', 'happy', 'mysterious'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatBirthday = ([month, day]) => `${MONTHS[month - 1]} ${day}`;

/** Sortable month-day number; birthdays have no year, so this is the whole comparison. */
export const birthdayValue = ([month, day]) => month * 100 + day;

const variantName = (trained) => (trained ? 'after_training' : 'normal');

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

export async function loadData() {
  const [characters, cardData] = await Promise.all([
    fetchJson('data/characters.json'),
    fetchJson('data/cards.json'),
  ]);

  const charById = new Map(characters.map((c) => [c.id, c]));
  const cards = cardData.cards.map((card) => {
    const character = charById.get(card.c);
    return {
      ...card,
      trainedOnly: Boolean(card.t),
      character,
      unit: character.unit,
      // Lowercased text the search box matches against.
      haystack: [
        card.n,
        character.name,
        character.short,
        ATTRIBUTES[card.at].label,
        UNITS[character.unit].label,
        UNITS[character.unit].short,
      ]
        .join(' ')
        .toLowerCase(),
    };
  });

  return {
    meta: cardData.meta,
    characters,
    charById,
    cards,
    cardById: new Map(cards.map((c) => [c.id, c])),
  };
}
