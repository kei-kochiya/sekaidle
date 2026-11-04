---
name: Sekaidle
description: A daily Project Sekai guessing game. Neutral violet-tinted chrome, colour reserved for meaning, one authored moment (the reveal).
colors:
  page: "oklch(0.972 0.008 275)"
  surface: "oklch(1 0 0)"
  surface-raised: "oklch(0.952 0.012 275)"
  surface-pressed: "oklch(0.92 0.016 275)"
  hairline: "oklch(0.89 0.014 275)"
  boundary: "oklch(0.64 0.035 275)"
  ink: "oklch(0.235 0.05 275)"
  ink-secondary: "oklch(0.4 0.04 275)"
  ink-tertiary: "oklch(0.49 0.035 275)"
  focus: "oklch(0.5 0.2 270)"
  match: "oklch(0.5 0.13 152)"
  direction: "oklch(0.85 0.15 85)"
  page-dark: "oklch(0.19 0.03 275)"
  surface-dark: "oklch(0.24 0.034 275)"
  ink-dark: "oklch(0.96 0.008 275)"
  attr-cute: "#ff6699"
  attr-cool: "#4488ee"
  attr-pure: "#44bb55"
  attr-happy: "#ffaa22"
  attr-mysterious: "#9966cc"
  shadow-lift: "oklch(0.2 0.05 275 / 0.18)"
  shadow-dialog: "oklch(0.15 0.05 275 / 0.5)"
  shadow-dialog-edge: "oklch(0.15 0.05 275 / 0.2)"
  unit-leo-need: "#4455dd"
  unit-mmj: "#88dd44"
  unit-vbs: "#ee1166"
  unit-wxs: "#ff9900"
  unit-nightcord: "#884499"
  unit-virtual-singer: "#33ccbb"
typography:
  wordmark:
    fontFamily: "Archivo, Archivo Fallback, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Archivo, Archivo Fallback, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Archivo, Archivo Fallback, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  heading:
    fontFamily: "Archivo, Archivo Fallback, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
  small:
    fontFamily: "Archivo, Archivo Fallback, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: "Archivo, Archivo Fallback, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
  tile:
    fontFamily: "Archivo, Archivo Fallback, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.15
rounded:
  xs: "3px"
  sm: "10px"
  md: "14px"
  lg: "18px"
  xl: "24px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.page}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "0 20px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "0 20px"
  tile-match:
    backgroundColor: "{colors.match}"
    textColor: "#ffffff"
    typography: "{typography.tile}"
    rounded: "{rounded.md}"
    height: "60px"
  tile-direction:
    backgroundColor: "{colors.direction}"
    textColor: "oklch(0.24 0.05 85)"
    typography: "{typography.tile}"
    rounded: "{rounded.md}"
    height: "60px"
  tile-miss:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.tile}"
    rounded: "{rounded.md}"
    height: "60px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "48px"
---

# Design System: Sekaidle

## Overview

**Mode:** Operate. The player is in a task (guess, read the feedback, guess again), so familiarity and scanability outrank expression. Ambition shows as precision: crisp tiles, one reveal, nothing that makes the player wait.

**Scene:** a fan on a phone in the evening or on a commute, in a short session, then pasting the result into a chat. That calls for a system that works in both light and dark, so both are first-class and follow the system setting (with a manual toggle).

**Thesis:** the interface is neutral so the content can be colourful. Card art and character faces carry the saturation. The only chrome colour is the six-bar unit rail along the top edge, which is data (the six units), not decoration. The one authored moment is the reveal: tiles flip in sequence, and the card art eases from heavy blur to sharp.

## Colors

- **Strategy:** Restrained. Violet-tinted neutrals plus one accent role: ink. Primary actions and selected states are ink-on-page (inverted in dark). Saturated colour appears only as meaning: unit colours on rings, dots and chips; feedback colours on tiles.
- **Feedback vocabulary:** `match` green (matches the answer), `direction` amber (the answer lies the way the arrow points), and a neutral raised surface for a miss. Colour is never the only signal: every tile carries an icon (check, arrow up, arrow down, cross) and a spoken label.
- **Neutrals:** `page`, `surface` and `surface-raised` form the three layers. `boundary` is the stronger 3:1 line used for inputs and chips.
- **Dark theme** is composed, not inverted: deeper violet surfaces, lighter secondary ink, the green and amber retained with their contrast checked.

### Named Rules

**The Colour-Means-Something Rule.** A saturated colour must encode a unit, an attribute or a result. If it does none of these, make it neutral.

**The Two-Signals Rule.** Any state is shown by at least two of: colour, icon, text, position.

## Typography

- **Family:** Archivo, self-hosted as a variable font (weight 100 to 900, width 62% to 125%) plus one static 800 italic for the wordmark. One family for everything; Operate surfaces don't need a pairing.
- **Width axis as a tool:** tile values run at 84 to 88% width so long names ("Miyamasuzaka") fit a narrow tile without shrinking the type.
- **Scale:** fixed rem steps, tight ratio: label 0.75, small 0.8125, tile 0.875, body 1, heading 1.25, title 1.375, wordmark 1.625.
- **Numerals:** tabular figures for the countdown, stats and distribution.
- **Fallback:** a metric-matched local Arial stand-in avoids layout shift; Japanese titles fall back to the system CJK font.

### Named Rules

**The Fixed-Scale Rule.** No fluid type in the product UI. Size is set by role.

## Layout

- One column on phones with the order: hero (art or character plate, gauge), picker, history. The picker is a compact search field with an inline results panel that opens on demand, so the newest guess is always visible without scrolling past 26 avatars.
- From 960px the page becomes two columns: hero and history on the left, a sticky picker on the right, always open.
- Content width caps at 64rem. Spacing runs 4, 8, 12, 16, 24, 40: tight within groups, generous between them.

## Elevation & Depth

Almost flat. Separation comes from hairlines and surface layers. The only shadows are a soft 1px lift on the selected segment and the dialog's large, blurred shadow (`shadow-lift`, `shadow-dialog`, `shadow-dialog-edge`). No hard offset shadows and no glows.

## Shapes

Rounded rectangles at 10, 14, 18 and 24px (the largest for dialogs and the mystery plate), 3px for slim bars; pills for chips and the mode switch. Avatars use a squircle-like radius (28% of size) with a unit-colour ring. The one slanted form is a parallelogram (skewX −24°) used for gauge bars, unit chips' dots and the top rail: a nod to the game's own UI, kept to non-text elements.

## Components

### Buttons
Primary is ink on page. Secondary is a surface with a boundary line. Quiet is text only. 48px tall (36px for quiet), 14px radius, 1px press offset on active, disabled primary drops to a pressed surface.

### Tiles
The core component: 60px minimum height, state icon above a value in the condensed width. States: pending (neutral, icon hidden), match, direction up/down, miss. The reveal flips each tile on its X axis, 520ms with 190ms stagger, and swaps state at the midpoint.

### Guess gauge
Six slanted bars. Used bars fill ink; a winning final bar fills green.

### Fields and chips
48px field with a 3:1 boundary and a focus ring in `focus`. Chips are pills with an unit or attribute mark, and invert to ink when pressed.

### Art switch
A joined two-way pill (Untrained / Trained) under the card search, always visible so it works with the list closed. The pressed side inverts to ink like a chip. It picks the art a card guess is made with; list rows carry a quiet outlined "Trained" / "Untrained" tag, with no colour because it encodes neither a unit, attribute nor result.

### Art frame
16:9 frame with container-relative blur (`cqw`) and a zoom that relaxes with the blur so soft edges stay hidden. Skeleton while loading; a retry state if the image fails.

## Do's and Don'ts

### Do:
- Pair every colour with an icon and a word.
- Keep tiles and guess rows scannable at 360px wide.
- Respect `prefers-reduced-motion` by dropping the flip and the unblur transition, keeping the state change.
- Theme the browser surfaces: selection, caret, scrollbars, focus rings.

### Don't:
- Don't add colour to chrome that doesn't encode a unit, attribute or result.
- Don't use gradients as text, glass blurs, hard offset shadows or coloured side borders.
- Don't use emoji as interface icons (they appear only in the copied share text).
- Don't open a modal for anything but help and stats, which the player asked for.
- Don't store or proxy card art.
