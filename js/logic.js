// Pure calculations shared by the views (no DOM, no Firebase).
import { CATEGORY_IDS, BADGE_IDS, TOTAL_VOTES, ADVANCE_COUNT } from './constants.js';

export function voteCount(votes, catId) {
  const n = Number(votes?.[catId]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function votesUsed(votes) {
  return CATEGORY_IDS.reduce((sum, id) => sum + voteCount(votes, id), 0);
}

/** Badges that are placed on a category that's currently in Round 2. */
export function placedBadges(badges, round2Categories = []) {
  return BADGE_IDS.filter((b) => badges?.[b] && round2Categories.includes(badges[b]));
}

export function round1Status(votes) {
  const used = votesUsed(votes);
  const left = TOTAL_VOTES - used;
  if (used === 0) return { state: 'not-started', used, left, label: 'Not started' };
  if (left > 0) return { state: 'incomplete', used, left, label: `${left} ${plural(left, 'vote')} left` };
  return { state: 'complete', used, left: 0, label: 'Complete' };
}

export function round2Status(badges, round2Categories) {
  const placed = placedBadges(badges, round2Categories).length;
  const left = BADGE_IDS.length - placed;
  if (placed === 0) return { state: 'not-started', placed, left, label: 'Not started' };
  if (left > 0) return { state: 'incomplete', placed, left, label: `${left} ${plural(left, 'badge')} left` };
  return { state: 'complete', placed, left: 0, label: 'Complete' };
}

export function categoryTotals(round1Votes) {
  const totals = Object.fromEntries(CATEGORY_IDS.map((id) => [id, 0]));
  for (const doc of Object.values(round1Votes || {})) {
    for (const id of CATEGORY_IDS) totals[id] += voteCount(doc?.votes, id);
  }
  return totals;
}

/**
 * Top categories by Round 1 total. Everything tied with 4th place advances too,
 * so the result can be longer than ADVANCE_COUNT. Ordered by total, then by ID order.
 */
export function advancingCategories(round1Votes) {
  const totals = categoryTotals(round1Votes);
  const ranked = [...CATEGORY_IDS].sort((a, b) => totals[b] - totals[a] || CATEGORY_IDS.indexOf(a) - CATEGORY_IDS.indexOf(b));
  const cutoff = totals[ranked[ADVANCE_COUNT - 1]];
  return ranked.filter((id) => totals[id] >= cutoff);
}

export function countComplete(users, round, round1Votes, round2Votes, round2Categories) {
  const uids = Object.keys(users || {});
  const complete = uids.filter((uid) =>
    round === 1
      ? round1Status(round1Votes?.[uid]?.votes).state === 'complete'
      : round2Status(round2Votes?.[uid]?.badges, round2Categories).state === 'complete'
  ).length;
  return { complete, total: uids.length };
}

export function plural(n, word) {
  return n === 1 ? word : `${word}s`;
}

export function firstName(name = '') {
  return name.trim().split(/\s+/)[0] || name;
}

export function initials(name = '', email = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (email[0] || '?').toUpperCase();
}

/** Stable hash → index, used for initials avatar colors. */
export function hashIndex(str = '', mod) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % mod;
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv({ users, round1Votes, round2Votes, config }) {
  const r2Cats = config.round2Categories || [];
  const header = [
    'Name',
    'Email',
    ...CATEGORY_IDS.map((id) => `Round 1: ${config.categoryLabels[id]}`),
    ...r2Cats.map((id) => `Round 2: ${config.categoryLabels[id]}`),
  ];

  const rows = Object.entries(users || {})
    .filter(([uid]) => {
      const usedR1 = votesUsed(round1Votes?.[uid]?.votes) > 0;
      const usedR2 = placedBadges(round2Votes?.[uid]?.badges, r2Cats).length > 0;
      return usedR1 || usedR2;
    })
    .sort(([, a], [, b]) => (a.name || '').localeCompare(b.name || ''))
    .map(([uid, user]) => {
      const votes = round1Votes?.[uid]?.votes;
      const badges = round2Votes?.[uid]?.badges || {};
      return [
        user.name,
        user.email,
        ...CATEGORY_IDS.map((id) => voteCount(votes, id)),
        ...r2Cats.map((catId) =>
          BADGE_IDS.filter((b) => badges[b] === catId)
            .map((b) => config.badgeLabels[b])
            .join('; ')
        ),
      ];
    });

  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function csvFilename(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `lemonly-retreat-poll-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.csv`;
}
