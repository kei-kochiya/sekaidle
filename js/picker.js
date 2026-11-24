/* Shared accessible combobox + listbox controller used by both Character and Card modes. */

import { h, icon } from './dom.js';

const desktopMedia = () => window.matchMedia('(min-width: 60rem)');

/**
 * Builds the `.picker` form shell, search combobox input, mobile expand/collapse button,
 * WAI-ARIA `aria-activedescendant` keyboard navigation, Escape hierarchy, and outside-click close.
 */
export function createPicker({
  idPrefix,
  searchLabel,
  placeholder,
  toggleLabels,
  extraControls = null,
  resultsChildren = [],
  getNavigableItems,
  hasSelection,
  onInput,
  onSelect,
  onSubmit,
  onCloseInner = null,
  onOpenChange = null,
  onViewportChange = null,
  signal,
}) {
  const inputId = `${idPrefix}-search`;
  const listboxId = `${idPrefix}-listbox`;
  const resultsId = `${idPrefix}-results`;
  const mq = desktopMedia();

  let isOpen = false;
  let activeId = null;
  let suppressOpenOnFocus = false;

  const input = h('input', {
    id: inputId,
    class: 'field-input',
    type: 'text',
    role: 'combobox',
    placeholder,
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'go',
    'aria-expanded': String(mq.matches),
    'aria-controls': listboxId,
    'aria-autocomplete': 'list',
  });

  const lead = h('span', { class: 'field-lead' }, icon('search'));
  const toggle = h(
    'button',
    {
      class: 'field-toggle',
      type: 'button',
      'aria-label': toggleLabels.closed,
      'aria-expanded': 'false',
      'aria-controls': resultsId,
      onclick: () => setOpen(!isOpen),
    },
    icon('chevron'),
  );

  const field = h('div', { class: 'field' }, lead, input, toggle);
  const submit = h('button', { class: 'btn btn-primary', type: 'submit', disabled: true }, 'Guess');
  const results = h('div', { id: resultsId, class: 'picker-results' }, resultsChildren);

  const el = h(
    'form',
    { class: 'picker', dataset: { open: 'false' }, autocomplete: 'off', novalidate: true },
    h('label', { class: 'sr-only', for: inputId }, searchLabel),
    h('div', { class: 'picker-bar' }, field, submit),
    extraControls,
    results,
  );

  function focusInputQuietly() {
    suppressOpenOnFocus = true;
    input.focus({ preventScroll: true });
    suppressOpenOnFocus = false;
  }

  function syncExpanded() {
    el.dataset.open = String(isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? toggleLabels.open : toggleLabels.closed);
    // On >= 60rem desktop, CSS keeps `.picker-results` always visible.
    input.setAttribute('aria-expanded', String(isOpen || mq.matches));
  }

  function clearActive() {
    if (activeId != null) {
      el.querySelector('.is-active')?.classList.remove('is-active');
    }
    activeId = null;
    input.removeAttribute('aria-activedescendant');
  }

  function setActive(id, { scroll = true } = {}) {
    clearActive();
    if (id == null) return;
    const target = getNavigableItems().find((item) => item.id === id);
    if (!target) return;
    activeId = target.id;
    target.el.classList.add('is-active');
    if (target.el.id) input.setAttribute('aria-activedescendant', target.el.id);
    if (scroll) target.el.scrollIntoView({ block: 'nearest' });
  }

  function setOpen(next) {
    const prev = isOpen;
    isOpen = Boolean(next);
    if (!isOpen) clearActive();
    syncExpanded();
    if (prev !== isOpen) onOpenChange?.(isOpen);
  }

  function moveActive(delta) {
    if (!isOpen) setOpen(true);
    const items = getNavigableItems();
    if (!items.length) {
      clearActive();
      return;
    }
    const currentIndex = items.findIndex((item) => item.id === activeId);
    const nextIndex =
      currentIndex === -1
        ? delta > 0
          ? 0
          : items.length - 1
        : (currentIndex + delta + items.length) % items.length;
    setActive(items[nextIndex].id);
  }

  function enterOrSubmit() {
    // If an option is actively highlighted via ArrowDown/ArrowUp (or nothing is selected yet),
    // Enter commits that option rather than submitting an earlier selection.
    if (!hasSelection() || activeId != null) {
      const items = getNavigableItems();
      const target = items.find((item) => item.id === activeId) ?? (!hasSelection() ? items[0] : null);
      if (target) {
        clearActive();
        onSelect(target.id, { source: 'keyboard' });
      }
      return;
    }
    if (!submit.disabled) onSubmit();
  }

  input.addEventListener('focus', () => {
    if (suppressOpenOnFocus) return;
    setOpen(true);
    if (hasSelection()) input.select();
  });

  input.addEventListener('input', () => {
    clearActive();
    setOpen(true);
    onInput(input.value);
  });

  input.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      enterOrSubmit();
    }
  });

  el.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (onCloseInner?.()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (isOpen) {
      event.preventDefault();
      setOpen(false);
      focusInputQuietly();
    }
  });

  el.addEventListener('submit', (event) => {
    event.preventDefault();
    if (hasSelection() && !submit.disabled) {
      clearActive();
      onSubmit();
    } else {
      enterOrSubmit();
    }
  });

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!el.contains(event.target)) setOpen(false);
    },
    { signal },
  );

  mq.addEventListener(
    'change',
    () => {
      syncExpanded();
      onViewportChange?.(mq.matches);
    },
    { signal },
  );
  syncExpanded();

  return {
    el,
    input,
    lead,
    submit,
    results,
    isDesktop: () => mq.matches,
    setOpen,
    clearActive,
    focusInputQuietly,
    focusAfterSelect(source) {
      if (source === 'keyboard') {
        focusInputQuietly();
      } else if (!mq.matches || !submit.disabled) {
        if (submit.disabled) focusInputQuietly();
        else submit.focus({ preventScroll: true });
      }
    },
  };
}
