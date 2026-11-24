/* Tiny DOM helpers: hyperscript, icons, abortable sleep, announcements, clipboard. */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * h('div', { class: 'x', onclick: fn, dataset: { a: 1 }, style: { '--v': 3 } }, 'text', childNode)
 * Falsy props/children are skipped, so conditionals can be written inline.
 */
export function h(tag, props, ...children) {
  const isSvg = tag.startsWith('svg:');
  const el = isSvg
    ? document.createElementNS(SVG_NS, tag.slice(4))
    : document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.setAttribute('class', value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') {
      for (const [name, v] of Object.entries(value)) {
        if (v == null) continue;
        if (name.startsWith('--')) el.style.setProperty(name, String(v));
        else el.style[name] = v;
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** An <svg> that points at a symbol in the sprite inside index.html. */
export function icon(name, { size = 20, label } = {}) {
  const svg = h('svg:svg', {
    class: 'icon',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    focusable: 'false',
    'aria-hidden': label ? null : 'true',
    role: label ? 'img' : null,
    'aria-label': label,
  });
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Abort-safe delay. Resolves immediately if `ms <= 0` or `signal` aborts. */
export function sleep(ms, signal) {
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

let announceTimer = null;

/** Cancel any pending screen-reader live-region update. */
export function cancelAnnouncement() {
  clearTimeout(announceTimer);
  announceTimer = null;
}

/** Polite screen-reader announcement. Clears prior queued announcement to prevent races. */
export function announce(message) {
  const region = document.getElementById('live');
  if (!region) return;
  clearTimeout(announceTimer);
  region.textContent = '';
  // Wait a tick so repeating the identical message is still announced by assistive tech.
  announceTimer = setTimeout(() => {
    region.textContent = message;
    announceTimer = null;
  }, 30);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const area = h('textarea', {
      'aria-hidden': 'true',
      readonly: true,
      style: {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '1px',
        height: '1px',
        fontSize: '16px',
        opacity: '0',
        pointerEvents: 'none',
      },
    });
    area.value = text;
    document.body.append(area);
    area.focus({ preventScroll: true });
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    prevFocus?.focus({ preventScroll: true });
    return ok;
  }
}
