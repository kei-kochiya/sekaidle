#!/usr/bin/env node
/**
 * Builds data/characters.json and data/cards.json from the community-maintained
 * Sekai-World master database (the same source IchikaBot uses).
 *
 *   node scripts/build-data.mjs                 # rebuild
 *   node scripts/build-data.mjs --verify-images # also HEAD-check new card images on CDN
 *
 * The game only needs a handful of fields, so the multi-megabyte upstream files
 * are boiled down to ~100 KB of JSON that the browser can load in one request.
 */
import { writeFile, rename, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JP = 'https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/';
const EN = 'https://raw.githubusercontent.com/Sekai-World/sekai-master-db-en-diff/main/';
const IMG = 'https://assets.unipjsk.com/startapp/';
const VERIFY = process.argv.includes('--verify-images');
const MS_PER_DAY = 86_400_000;

const UNITS = {
  light_sound: 'leo_need',
  idol: 'mmj',
  street: 'vbs',
  theme_park: 'wxs',
  school_refusal: 'n25',
  piapro: 'vs',
};

const VALID_ATTRS = new Set(['cute', 'cool', 'pure', 'happy', 'mysterious']);

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

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < 2) await delay(600 * (attempt + 1));
    }
  }
  throw lastError;
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

/**
 * HEAD-check a CDN URL, distinguishing genuine 404 ('missing') from transient network/5xx/429 ('error').
 * Never conflate transient errors with missing variants, or a two-art card could be misflagged single-art.
 */
async function probeImage(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
      if (res.status === 200) return 'ok';
      if (res.status === 404) return 'missing';
    } catch {
      /* transient error: retry */
    }
    if (attempt < 2) await delay(400 * (attempt + 1));
  }
  return 'error';
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

async function readPrevious(file) {
  try {
    return JSON.parse(await readFile(path.join(ROOT, file), 'utf8'));
  } catch {
    return null;
  }
}

async function writeJsonAtomic(targetPath, data) {
  const tmpPath = `${targetPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(data));
  await rename(tmpPath, targetPath);
}

async function main() {
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

  const previousCards = await readPrevious('data/cards.json');
  const previousChars = await readPrevious('data/characters.json');
  const known = new Map((previousCards?.cards ?? []).map((c) => [c.id, c]));

  /* ---------- characters (built first to validate card characterIds) ---------- */
  const rawChars = enChars
    .filter((g) => g.id >= 1 && g.id <= 26)
    .sort((a, b) => a.id - b.id);
  const validCharIds = new Set(rawChars.map((g) => g.id));

  /* ---------- cards ---------- */
  const trainableIds = new Set();
  let cards = jpCards
    .filter(
      (c) =>
        (c.cardRarityType === 'rarity_3' || c.cardRarityType === 'rarity_4') &&
        validCharIds.has(c.characterId) &&
        VALID_ATTRS.has(c.attr) &&
        c.prefix &&
        c.assetbundleName &&
        c.releaseAt <= now,
    )
    .sort((a, b) => a.id - b.id)
    .map((c) => {
      const en = enPrefix.get(c.id);
      const prev = known.get(c.id);
      const card = {
        id: c.id,
        c: c.characterId,
        r: c.cardRarityType === 'rarity_4' ? 4 : 3,
        at: c.attr,
        n: en || c.prefix,
        b: c.assetbundleName,
        d: Math.floor(c.releaseAt / MS_PER_DAY),
      };
      if (!en) card.jp = 1;

      const trainedOnlyMeta = c.initialSpecialTrainingStatus === 'done';
      const hasTrainingCosts = Array.isArray(c.specialTrainingCosts) && c.specialTrainingCosts.length > 0;
      const untrainedOnlyMeta =
        !trainedOnlyMeta && Array.isArray(c.specialTrainingCosts) && c.specialTrainingCosts.length === 0;

      if (!trainedOnlyMeta && hasTrainingCosts) trainableIds.add(c.id);

      if (trainedOnlyMeta || prev?.t) card.t = 1;
      else if (untrainedOnlyMeta || prev?.nt) card.nt = 1;
      return card;
    });

  if (VERIFY) {
    // Only newcomers are checked so a flaky CDN check never drops an established card.
    const fresh = cards.filter((c) => !known.has(c.id));
    console.log(`Checking ${fresh.length} new card(s) for art on the image CDN…`);
    const checks = await pool(fresh, 8, async (c) => {
      const [normalThumb, normalArt, trainedThumb, trainedArt] = await Promise.all([
        c.t ? 'skip' : probeImage(`${IMG}thumbnail/chara/${c.b}_normal.png`),
        c.t ? 'skip' : probeImage(`${IMG}character/member_small/${c.b}/card_normal.png`),
        c.nt ? 'skip' : probeImage(`${IMG}thumbnail/chara/${c.b}_after_training.png`),
        c.nt ? 'skip' : probeImage(`${IMG}character/member_small/${c.b}/card_after_training.png`),
      ]);
      const hadError = [normalThumb, normalArt, trainedThumb, trainedArt].includes('error');
      const normalOk = normalThumb === 'ok' && normalArt === 'ok';
      const trainedOk = trainedThumb === 'ok' && trainedArt === 'ok';

      // Defer if any probe hit a transient error, if neither variant is ready, or if master DB says
      // the card has both variants (`trainableIds`) and CDN hasn't finished uploading both yet.
      if (hadError || (!normalOk && !trainedOk)) {
        return { id: c.id, status: 'defer' };
      }
      if (trainableIds.has(c.id) && (!normalOk || !trainedOk)) {
        return { id: c.id, status: 'defer' };
      }
      if (!normalOk && trainedOk) return { id: c.id, status: 'trained-only' };
      if (normalOk && !trainedOk) return { id: c.id, status: 'untrained-only' };
      return { id: c.id, status: 'both' };
    });

    const deferred = new Set(checks.filter((x) => x.status === 'defer').map((x) => x.id));
    const onlyTrained = new Set(checks.filter((x) => x.status === 'trained-only').map((x) => x.id));
    const onlyUntrained = new Set(checks.filter((x) => x.status === 'untrained-only').map((x) => x.id));

    if (deferred.size) {
      console.log('Deferring cards whose art is not ready on CDN yet:', [...deferred].join(', '));
    }
    cards = cards.filter((c) => known.has(c.id) || !deferred.has(c.id));
    for (const c of cards) {
      if (onlyTrained.has(c.id)) {
        c.t = 1;
        delete c.nt;
      } else if (onlyUntrained.has(c.id)) {
        c.nt = 1;
        delete c.t;
      }
    }
  }

  if (!cards.length) {
    throw new Error('Refusing to write empty card dataset.');
  }

  const characters = rawChars.map((g) => {
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
      cards.find((c) => c.c === g.id && c.r === 4 && !c.t) ?? cards.find((c) => c.c === g.id);
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

  const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (previousCards && previousChars && sameJson(previousCards.cards, cards) && sameJson(previousChars, characters)) {
    console.log(
      `Data is already up to date (${cards.length} cards, latest release ${previousCards.meta.latestCard}).`,
    );
    return;
  }

  const added = cards.filter((c) => !known.has(c.id));
  const removed = [...known.keys()].filter((id) => !cards.some((c) => c.id === id));
  if (previousCards) console.log(`Added ${added.length} card(s), removed ${removed.length}.`);

  const latest = cards.reduce((max, c) => Math.max(max, c.d), 0);
  const meta = {
    built: new Date().toISOString().slice(0, 10),
    latestCard: new Date(latest * MS_PER_DAY).toISOString().slice(0, 10),
    cards: cards.length,
    characters: characters.length,
  };

  await mkdir(path.join(ROOT, 'data'), { recursive: true });
  await writeJsonAtomic(path.join(ROOT, 'data/characters.json'), characters);
  await writeJsonAtomic(path.join(ROOT, 'data/cards.json'), { meta, cards });
  console.log('Wrote data/characters.json and data/cards.json', meta);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
