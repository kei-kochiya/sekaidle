#!/usr/bin/env node
/**
 * Builds data/characters.json and data/cards.json from the community-maintained
 * Sekai-World master database (the same source IchikaBot uses).
 *
 *   node scripts/build-data.mjs                 # rebuild
 *   node scripts/build-data.mjs --verify-images # also HEAD-check every card image
 *
 * The game only needs a handful of fields, so the multi-megabyte upstream files
 * are boiled down to ~100 KB of JSON that the browser can load in one request.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JP = 'https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/';
const EN = 'https://raw.githubusercontent.com/Sekai-World/sekai-master-db-en-diff/main/';
const IMG = 'https://assets.unipjsk.com/startapp/';
const VERIFY = process.argv.includes('--verify-images');

const UNITS = {
  light_sound: 'leo_need',
  idol: 'mmj',
  street: 'vbs',
  theme_park: 'wxs',
  school_refusal: 'n25',
  piapro: 'vs',
};

// Virtual Singers are written family-name first in the game ("Hatsune Miku").
const VS_NAMES = {
  21: ['Hatsune Miku', 'Miku'],
  22: ['Kagamine Rin', 'Rin'],
  23: ['Kagamine Len', 'Len'],
  24: ['Megurine Luka', 'Luka'],
  25: ['MEIKO', 'MEIKO'],
  26: ['KAITO', 'KAITO'],
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

function normaliseSchool(raw) {
  if (!raw || raw === '-') return 'none';
  if (/miyamasuzaka/i.test(raw)) return 'miyamasuzaka';
  // "Kamiyama HS (Night Classes)" is still Kamiyama; the hint is about the school, not the timetable.
  if (/kamiyama/i.test(raw)) return 'kamiyama';
  if (/correspondence/i.test(raw)) return 'correspondence';
  throw new Error(`Unrecognised school "${raw}": teach normaliseSchool() about it.`);
}

function parseBirthday(raw) {
  const m = /([A-Za-z]{3})[a-z]*\.?\s*(\d{1,2})/.exec(raw || '');
  if (!m) throw new Error(`Unparseable birthday "${raw}"`);
  const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  if (!month) throw new Error(`Unknown month in "${raw}"`);
  return [month, Number(m[2])];
}

async function exists(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.status === 200) return true;
      if (res.status === 404) return false;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return false;
}

async function pool(items, size, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i], i);
      }
    }),
  );
  return out;
}

console.log('Downloading master data (about 70 MB, one time)…');
const [jpCards, enCards, enChars, enProfiles, charUnits] = await Promise.all([
  getJson(JP + 'cards.json'),
  getJson(EN + 'cards.json'),
  getJson(EN + 'gameCharacters.json'),
  getJson(EN + 'characterProfiles.json'),
  getJson(JP + 'gameCharacterUnits.json'),
]);

const enPrefix = new Map(enCards.filter((c) => c.prefix).map((c) => [c.id, c.prefix]));
const now = Date.now();

/* ---------- cards ---------- */
let cards = jpCards
  .filter(
    (c) =>
      (c.cardRarityType === 'rarity_3' || c.cardRarityType === 'rarity_4') &&
      c.prefix &&
      c.releaseAt <= now,
  )
  .sort((a, b) => a.id - b.id)
  .map((c) => {
    const en = enPrefix.get(c.id);
    const card = {
      id: c.id,
      c: c.characterId,
      r: c.cardRarityType === 'rarity_4' ? 4 : 3,
      at: c.attr,
      n: en || c.prefix,
      b: c.assetbundleName,
      d: Math.floor(c.releaseAt / 86400000),
    };
    if (!en) card.jp = 1; // only the Japanese title exists (yet)
    if (c.initialSpecialTrainingStatus === 'done') card.t = 1; // only has trained art
    return card;
  });

if (VERIFY) {
  console.log(`Checking ${cards.length} cards for art on the image CDN…`);
  const checks = await pool(cards, 8, async (c) => {
    const variant = c.t ? 'after_training' : 'normal';
    const [thumb, art] = await Promise.all([
      exists(`${IMG}thumbnail/chara/${c.b}_${variant}.png`),
      exists(`${IMG}character/member_small/${c.b}/card_${variant}.png`),
    ]);
    let trainedOk = true;
    if (!c.t) trainedOk = await exists(`${IMG}character/member_small/${c.b}/card_after_training.png`);
    return { c, ok: thumb && art, trainedOk };
  });
  const missing = checks.filter((x) => !x.ok);
  const noTrained = checks.filter((x) => x.ok && !x.trainedOk).map((x) => x.c.id);
  if (missing.length) console.log('Dropping cards without art:', missing.map((x) => x.c.id).join(', '));
  cards = checks.filter((x) => x.ok).map((x) => x.c);
  for (const c of cards) if (noTrained.includes(c.id)) c.nt = 1; // no trained art available
  console.log(`${cards.length} cards verified; ${noTrained.length} without trained art.`);
}

/* ---------- characters ---------- */
const characters = enChars
  .filter((g) => g.id >= 1 && g.id <= 26)
  .map((g) => {
    const profile = enProfiles.find((p) => p.characterId === g.id);
    if (!profile) throw new Error(`No profile for character ${g.id}`);
    const isVs = g.id >= 21;
    const [name, short] = isVs
      ? VS_NAMES[g.id]
      : [`${g.givenName} ${g.firstName}`, g.givenName];
    const unit = UNITS[g.unit];
    if (!unit) throw new Error(`Unknown unit "${g.unit}" for ${name}`);
    const ownColor =
      charUnits.find((u) => u.gameCharacterId === g.id && u.unit === g.unit) ??
      charUnits.find((u) => u.gameCharacterId === g.id);
    const avatarCard =
      cards.filter((c) => c.c === g.id && c.r === 4 && !c.t)[0] ?? cards.find((c) => c.c === g.id);
    return {
      id: g.id,
      name,
      short,
      unit,
      color: ownColor?.colorCode ?? '#888888',
      school: normaliseSchool(profile.school),
      birthday: parseBirthday(profile.birthday),
      height: parseInt(profile.height, 10),
      avatar: avatarCard?.b ?? null,
    };
  });

for (const ch of characters) {
  if (!Number.isFinite(ch.height)) throw new Error(`Bad height for ${ch.name}`);
  if (!ch.avatar) throw new Error(`No avatar card for ${ch.name}`);
}

const latest = Math.max(...cards.map((c) => c.d));
const meta = {
  built: new Date().toISOString().slice(0, 10),
  latestCard: new Date(latest * 86400000).toISOString().slice(0, 10),
  cards: cards.length,
  characters: characters.length,
};

await mkdir(path.join(ROOT, 'data'), { recursive: true });
await writeFile(path.join(ROOT, 'data/characters.json'), JSON.stringify(characters));
await writeFile(path.join(ROOT, 'data/cards.json'), JSON.stringify({ meta, cards }));
console.log('Wrote data/characters.json and data/cards.json', meta);
