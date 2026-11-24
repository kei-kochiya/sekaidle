/* Card mode filter bar: attribute chips, group chips, and collapsible character drawer. */

import { h, icon } from './dom.js';
import { UNITS, UNIT_ORDER, ATTRIBUTES, ATTRIBUTE_ORDER, images } from './data.js';
import { createAvatar } from './game-common.js';

function createChip(labelText, { lead = null, color, key, onClick }) {
  return h(
    'button',
    {
      type: 'button',
      class: 'chip',
      'aria-pressed': 'false',
      dataset: { key },
      style: { '--chip': color },
      onclick: onClick,
    },
    lead ?? h('span', { class: 'chip-dot', 'aria-hidden': 'true' }),
    labelText,
  );
}

/**
 * Owns the attribute/unit/character filter UI and notifies `onChange()` whenever criteria change.
 */
export function createCardFilters({ characters, charById, filterState, onChange }) {
  let drawerOpen = false;

  const attrChips = ATTRIBUTE_ORDER.map((key) =>
    createChip(ATTRIBUTES[key].label, {
      lead: icon(ATTRIBUTES[key].icon, { size: 16 }),
      color: ATTRIBUTES[key].token,
      key,
      onClick: () => {
        filterState.attr = filterState.attr === key ? null : key;
        sync();
        onChange();
      },
    }),
  );

  const unitChips = UNIT_ORDER.map((key) =>
    createChip(UNITS[key].short, {
      color: UNITS[key].color,
      key,
      onClick: () => {
        filterState.unit = filterState.unit === key ? null : key;
        if (filterState.unit && filterState.charId && charById.get(filterState.charId)?.unit !== filterState.unit) {
          filterState.charId = null;
        }
        sync();
        onChange();
      },
    }),
  );

  const charTriggerLabel = h('span', {});
  const charTriggerLead = h('span', { class: 'char-trigger-lead' });
  const charTrigger = h(
    'button',
    {
      type: 'button',
      class: 'chip char-filter-trigger',
      'aria-expanded': 'false',
      dataset: { active: 'false' },
      'aria-controls': 'card-char-drawer',
      onclick: () => setDrawerOpen(!drawerOpen),
    },
    charTriggerLead,
    charTriggerLabel,
    icon('chevron', { size: 15 }),
  );

  const charClear = h(
    'button',
    {
      type: 'button',
      class: 'chip char-filter-clear',
      hidden: true,
      'aria-label': 'Clear character filter',
      onclick: () => {
        filterState.charId = null;
        setDrawerOpen(false);
        sync();
        charTrigger.focus({ preventScroll: true });
        onChange();
      },
    },
    icon('x', { size: 14 }),
    'Clear',
  );

  const charCells = new Map();
  for (const ch of characters) {
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'char-mini',
        'aria-pressed': 'false',
        dataset: { id: ch.id },
        onclick: () => {
          filterState.charId = filterState.charId === ch.id ? null : ch.id;
          setDrawerOpen(false);
          charTrigger.focus({ preventScroll: true });
          sync();
          onChange();
        },
      },
      createAvatar({
        src: images.thumb(ch.avatar, false),
        initial: ch.short[0],
        color: ch.color,
        size: 36,
      }),
      h('span', { class: 'char-mini-name' }, ch.short),
    );
    charCells.set(ch.id, btn);
  }

  const charDrawer = h(
    'div',
    {
      id: 'card-char-drawer',
      class: 'char-drawer',
      role: 'group',
      'aria-label': 'Filter by character',
      hidden: true,
    },
    [...charCells.values()],
  );

  const el = h(
    'div',
    { class: 'filters', role: 'region', 'aria-label': 'Card filters' },
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by attribute' }, attrChips),
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by group' }, unitChips),
    h('div', { class: 'char-filter-row' }, charTrigger, charClear),
    charDrawer,
  );

  function setDrawerOpen(open) {
    drawerOpen = Boolean(open);
    charDrawer.hidden = !drawerOpen;
    charTrigger.setAttribute('aria-expanded', String(drawerOpen));
  }

  function closeDrawerIfOpen() {
    if (!drawerOpen) return false;
    const focusInsideDrawer = charDrawer.contains(document.activeElement);
    setDrawerOpen(false);
    if (focusInsideDrawer) charTrigger.focus({ preventScroll: true });
    return true;
  }

  function sync() {
    for (const c of attrChips) c.setAttribute('aria-pressed', String(c.dataset.key === filterState.attr));
    for (const c of unitChips) c.setAttribute('aria-pressed', String(c.dataset.key === filterState.unit));

    for (const ch of characters) {
      const cell = charCells.get(ch.id);
      const visible = !filterState.unit || ch.unit === filterState.unit;
      cell.hidden = !visible;
      cell.setAttribute('aria-pressed', String(filterState.charId === ch.id));
    }

    if (filterState.charId != null) {
      const chosen = charById.get(filterState.charId);
      charTrigger.dataset.active = 'true';
      charTriggerLead.replaceChildren(
        createAvatar({
          src: images.thumb(chosen.avatar, false),
          initial: chosen.short[0],
          color: chosen.color,
          size: 20,
        }),
      );
      charTriggerLabel.textContent = chosen.name;
      charClear.hidden = false;
    } else {
      charTrigger.dataset.active = 'false';
      charTriggerLead.replaceChildren();
      charTriggerLabel.textContent = filterState.unit
        ? `Character: All ${UNITS[filterState.unit].short}`
        : 'Character: All';
      charClear.hidden = true;
    }
  }

  return {
    el,
    sync,
    setDrawerOpen,
    closeDrawerIfOpen,
  };
}
