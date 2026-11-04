# Sekaidle

A daily, Wordle-style guessing game for **Project Sekai** fans. Two games, six guesses each:

- **Character** – guess the character. After every guess you learn whether the **school** matches, whether the answer's **birthday** is earlier or later, and whether the answer is **taller, shorter or the same height**.
- **Card** – a random 3★ or 4★ card is shown heavily blurred. Every wrong guess sharpens it. A guess is a card plus the art you pick for it (**Untrained** or **Trained**), and it tells you whether its **attribute**, **group** (the unit; any Virtual Singer counts as Virtual Singer), **character** and **art** match.

A new daily puzzle appears at local midnight. There is also an unlimited **Random** mode that doesn't affect your stats. Progress and stats are saved in your browser only.

> Unofficial fan project. Not affiliated with SEGA, Colorful Palette or Crypton Future Media. Project Sekai and its characters and artwork belong to their owners.

## Run it locally

No build step and no dependencies, just Node 20+ for the tiny static server:

```bash
npm run dev
```

Then open <http://localhost:4173/>. Any static file server works too.

## Where the data comes from

`data/characters.json` and `data/cards.json` are generated from the community-maintained [Sekai-World master database](https://github.com/Sekai-World/sekai-master-db-diff) (the same source [IchikaBot](https://github.com/kei-kochiya/IchikaBot) uses), with English names and profiles from the EN database where they exist.

### Automatic refresh

A GitHub Action ([`refresh-data.yml`](.github/workflows/refresh-data.yml)) rebuilds the data every Monday and commits it only if something changed, then asks Pages to rebuild. You can also run it from the Actions tab (*Run workflow*).

To refresh by hand:

```bash
npm run build:data:verify
```

The script downloads about 70 MB of master data and writes about 100 KB of JSON. It is incremental: cards already in `data/cards.json` are kept as they are, and `--verify-images` only checks the art of cards that are new since the last run. A new card whose art isn't online yet is skipped and picked up on a later run. If nothing changed it writes nothing.

## Art

Card art and face thumbnails are loaded in the player's browser from the community mirror at `assets.unipjsk.com` and are **not stored in this repository**. If that host ever changes, update `IMAGE_HOST` in `js/data.js`.

## How the puzzles work

- The daily answer walks through a seeded shuffle of the pool, one per day, so nothing repeats until every character (or card) has been used. Everyone gets the same puzzle on the same local date.
- Daily cards are drawn only from cards released at least 14 days before that day. That keeps the weekly data refresh from reshuffling a day's puzzle; new cards join the daily rotation after the delay (they are in Random mode immediately).
- Birthdays have no year in the game, so they are compared by month and day only.
- Ena's night-school classes and Kamiyama High School count as the same school; Virtual Singers have no school (and match each other).
- The puzzle's art is untrained or trained at random (always trained for the few cards that only have trained art). That choice is hidden: the picker's thumbnails show the art the player chose with the Art switch, never the puzzle's, and the art tile on each guess is how the player learns it. After a guess the switch follows the puzzle's art.
- Only the exact card in the exact art wins in Card mode. The right card in the other art is a miss (the art tile is grey and a note says it was the right card). Matching the first three tiles on a different card means the right character, attribute and group, but another card.
- Card guesses are saved as the card id plus an `arts` entry (`session.arts[i]`, true for trained). Sessions saved before that have no `arts` and are read as having used the puzzle's art.

## Project layout

```
index.html            page shell, icon sprite, dialogs
css/styles.css        design tokens (OKLCH, light and dark) and components
js/app.js             tabs, daily/random mode, theme, help and stats
js/character-game.js  character mode
js/card-game.js       card mode (blurred art, search and filters)
js/game-common.js     sessions, gauge, tiles, avatars, sharing
js/store.js           localStorage persistence and stats
js/rng.js             seeded daily selection, date helpers
js/data.js            data loading, labels, image URLs
scripts/              data builder and dev server
PRODUCT.md DESIGN.md  product context and design system notes
```

## Design

The UI was designed following [Impeccable](https://github.com/pbakaus/impeccable)'s guidance for product interfaces. `PRODUCT.md` and `DESIGN.md` record the decisions.

## Licence

Code is MIT-licensed (see `LICENSE`). Archivo is under the SIL Open Font License 1.1. Game data, names and artwork are the property of their respective owners and are not covered by this licence.
