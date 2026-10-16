export const APP_TITLE = 'Lemonly Retreat Poll';

export const ALLOWED_DOMAINS = ['lemonly.com', 'clickrain.com'];
export const ADMIN_EMAILS = ['chris@clickrain.com', 'nick@lemonly.com'];

export const TOTAL_VOTES = 100;
export const ADVANCE_COUNT = 4;

// Stable IDs — votes are stored by these, labels are editable in-app.
export const CATEGORY_IDS = Array.from({ length: 10 }, (_, i) => `cat${i + 1}`);
export const BADGE_IDS = ['badgeA', 'badgeB', 'badgeC', 'badgeD'];


export const BADGE_LETTERS = { badgeA: 'A', badgeB: 'B', badgeC: 'C', badgeD: 'D' };

export const BRAND_COLORS = ['#33c8c5', '#f6d72c', '#f5b02b', '#f06445'];

// Category colors are stored by key so the palette can change without touching data.
export const CATEGORY_COLORS = {
  teal: { hex: '#33c8c5', label: 'Teal' },
  yellow: { hex: '#f6d72c', label: 'Yellow' },
  orange: { hex: '#f5b02b', label: 'Orange' },
  coral: { hex: '#f06445', label: 'Coral' },
  charcoal: { hex: '#333333', label: 'Charcoal' }, // neutral option, categories only
};
// The four brand colors: used for default category colors and for badges.
export const BRAND_COLOR_KEYS = ['teal', 'yellow', 'orange', 'coral'];
const COLOR_KEYS = BRAND_COLOR_KEYS;

/** A badge's color: one of the four palette keys (A teal, B yellow, C orange, D coral by default). */
export function badgeColor(config, badgeId) {
  const value = config?.badgeColors?.[badgeId];
  return (CATEGORY_COLORS[BRAND_COLOR_KEYS.includes(value) ? value : null] || CATEGORY_COLORS[COLOR_KEYS[Math.max(0, BADGE_IDS.indexOf(badgeId)) % COLOR_KEYS.length]]).hex;
}

/** Accepts "33c8c5", "#33C8C5" or "#3cc" and returns "#33c8c5", or null if it isn't a hex color. */
export function normalizeHex(value = '') {
  let v = String(value).trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(v)) v = [...v].map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/.test(v) ? `#${v}` : null;
}

/** A category's color: a palette key (teal, yellow…) or a custom hex code. */
export function categoryColor(config, catId) {
  const value = config?.categoryColors?.[catId];
  if (CATEGORY_COLORS[value]) return CATEGORY_COLORS[value].hex;
  return normalizeHex(value) || CATEGORY_COLORS.charcoal.hex;
}

export function defaultConfig() {
  return {
    categoryLabels: Object.fromEntries(CATEGORY_IDS.map((id, i) => [id, `Category ${i + 1}`])),
    badgeLabels: Object.fromEntries(BADGE_IDS.map((id) => [id, `Badge ${BADGE_LETTERS[id]}`])),
    // Charcoal by default; admins can pick a brand color or custom hex per category.
    categoryColors: Object.fromEntries(CATEGORY_IDS.map((id) => [id, 'charcoal'])),
    // Shown in the Round 1 popup.
    categoryDescriptions: Object.fromEntries(CATEGORY_IDS.map((id) => [id, ''])),
    // Shown on the Round 2 cards once a category advances.
    categoryTaglines: Object.fromEntries(CATEGORY_IDS.map((id) => [id, ''])),
    // 'letter' shows A–D; anything else is an icon name from js/icons.js.
    badgeIcons: Object.fromEntries(BADGE_IDS.map((id) => [id, 'letter'])),
    badgeColors: Object.fromEntries(BADGE_IDS.map((id, i) => [id, COLOR_KEYS[i % COLOR_KEYS.length]])),
    round1Locked: false,
    round2Open: false,
    round2Locked: false,
    round1ResultsRevealed: false,
    round2ResultsRevealed: false,
    round2Categories: [],
    // Round 2 results are revealed one badge at a time during the discussion.
    round2BadgesShown: Object.fromEntries(BADGE_IDS.map((id) => [id, false])),
  };
}

export function emailDomain(email = '') {
  return email.toLowerCase().split('@')[1] || '';
}

export function isAllowedEmail(email) {
  return ALLOWED_DOMAINS.includes(emailDomain(email));
}

export function isAdminEmail(email = '') {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
