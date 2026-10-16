// Small DOM helpers shared by the views.
import { BRAND_COLORS, BADGE_LETTERS, badgeColor } from './constants.js';
import { initials, hashIndex } from './logic.js';
import { iconSvg } from './icons.js';

/** h('div.foo.bar', {attrs}, ...children) */
export function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) el.style.setProperty(p.startsWith('--') ? p : p.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), val);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function avatarColor(seed) {
  return BRAND_COLORS[hashIndex(seed, BRAND_COLORS.length)];
}

/**
 * A person's avatar: Google photo, or initials on a brand color if there's none
 * (or the photo fails to load).
 */
export function avatar(user, { size = 32, className = '' } = {}) {
  const name = user?.name || user?.email || '?';
  const wrap = h('span.avatar', { class: className || null, style: { '--size': `${size}px` } });
  const fallback = () => {
    wrap.replaceChildren(
      h('span.avatar__initials', { style: { background: avatarColor(user?.email || name) }, 'aria-hidden': 'true' }, initials(name, user?.email))
    );
  };
  if (user?.photoURL) {
    const img = h('img.avatar__img', { src: user.photoURL, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' });
    img.addEventListener('error', fallback, { once: true });
    wrap.append(img);
  } else {
    fallback();
  }
  return wrap;
}

/** What goes inside a badge's circle: its glyph, or its letter if no glyph is set. */
export function badgeMark(badgeId, config) {
  const el = h('span.badge-mark', { 'aria-hidden': 'true' });
  const svg = iconSvg(config?.badgeIcons?.[badgeId]);
  if (svg) el.innerHTML = svg;
  else el.textContent = BADGE_LETTERS[badgeId];
  return el;
}

export function badgeChip(badgeId, label, { small = false, config } = {}) {
  return h(
    'span.badge-chip',
    { class: small ? 'badge-chip--small' : null, style: { '--badge': badgeColor(config, badgeId) } },
    h('span.badge-chip__letter', badgeMark(badgeId, config)),
    h('span.badge-chip__label', label)
  );
}

// ---------- Compact dropdown picker (colors, badge glyphs) ----------

/**
 * A small button showing the current choice; clicking opens a panel of options.
 * Fires a bubbling `input` event on change so surrounding forms notice.
 */
export function createPicker({ label, options, renderValue, customHex = false, align = 'left' }) {
  let value = null;
  const valueSlot = h('span.picker__value');
  const trigger = h(
    'button.picker__trigger',
    { type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': label },
    valueSlot,
    h('span.picker__chevron', { 'aria-hidden': 'true' })
  );
  const optionButtons = options.map((o) =>
    h('button.picker__option', { type: 'button', title: o.label, 'aria-label': o.label, dataset: { value: o.value }, onclick: () => choose(o.value) }, o.render())
  );

  let hexInput = null;
  let hexError = null;
  let customRow = null;
  if (customHex) {
    hexInput = h('input.input.picker__hex', { type: 'text', placeholder: '#33c8c5', maxlength: 7, spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Custom hex color' });
    hexError = h('p.picker__error', { role: 'alert' });
    const applyHex = () => {
      const hex = customHex(hexInput.value);
      if (!hex) {
        hexError.textContent = 'Use a hex code like #33c8c5.';
        return;
      }
      hexError.textContent = '';
      choose(hex);
    };
    hexInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault(); // don't submit the surrounding form
        applyHex();
      }
    });
    hexInput.addEventListener('input', (e) => e.stopPropagation());
    customRow = h(
      'div.picker__custom',
      h('label.picker__custom-label', 'Custom'),
      h('div.picker__custom-row', hexInput, h('button.btn.btn--quiet.btn--small', { type: 'button', onclick: applyHex }, 'Use')),
      hexError
    );
  }

  const panel = h('div.picker__panel', { hidden: true, class: align === 'right' ? 'picker__panel--right' : null }, h('div.picker__grid', optionButtons), customRow);
  const el = h('div.picker', trigger, panel);

  function onDocClick(e) {
    if (!el.contains(e.target)) close();
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      trigger.focus();
    }
  }
  function open() {
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    if (hexInput) {
      hexInput.value = options.some((o) => o.value === value) ? '' : value || '';
      hexError.textContent = '';
    }
    (optionButtons.find((b) => b.dataset.value === value) || optionButtons[0])?.focus();
    document.addEventListener('click', onDocClick, true);
    el.addEventListener('keydown', onKey);
  }
  function close() {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick, true);
    el.removeEventListener('keydown', onKey);
  }
  function render() {
    valueSlot.replaceChildren(renderValue(value));
    for (const b of optionButtons) b.setAttribute('aria-pressed', String(b.dataset.value === value));
  }
  function choose(v) {
    value = v;
    render();
    close();
    trigger.focus();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  trigger.addEventListener('click', () => (panel.hidden ? open() : close()));

  return {
    el,
    get value() {
      return value;
    },
    set value(v) {
      value = v;
      render();
    },
  };
}

export function statusPill(status) {
  return h(`span.pill.pill--${status.state}`, status.label);
}

// ---------- Dialogs ----------

export function confirmDialog({ title, body, confirmLabel = 'Yes, continue', danger = false }) {
  return new Promise((resolve) => {
    const dialog = h(
      'dialog.modal',
      { 'aria-labelledby': 'modal-title' },
      h(
        'form.modal__box',
        { method: 'dialog' },
        h('h2.modal__title', { id: 'modal-title' }, title),
        h('div.modal__body', body),
        h(
          'div.modal__actions',
          h('button.btn.btn--quiet', { value: 'cancel', type: 'submit' }, 'Cancel'),
          h(`button.btn.${danger ? 'btn--danger' : 'btn--primary'}`, { value: 'ok', type: 'submit' }, confirmLabel)
        )
      )
    );
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok');
      dialog.remove();
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close('cancel');
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

// ---------- Toasts ----------

let toastRegion;
export function toast(message, { error = false } = {}) {
  if (!toastRegion) {
    toastRegion = h('div.toasts', { role: 'status', 'aria-live': 'polite' });
    document.body.append(toastRegion);
  }
  const t = h('div.toast', { class: error ? 'toast--error' : null }, message);
  toastRegion.append(t);
  setTimeout(() => {
    t.classList.add('toast--leaving');
    setTimeout(() => t.remove(), 300);
  }, 3200);
}

export function downloadFile(filename, text, type = 'text/csv;charset=utf-8') {
  // BOM so Excel reads UTF-8 names correctly.
  const blob = new Blob(['﻿', text], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
