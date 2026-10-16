import { CATEGORY_IDS, BADGE_IDS, TOTAL_VOTES, categoryColor, badgeColor } from '../constants.js';
import { voteCount, categoryTotals, countComplete, firstName, plural, buildCsv, csvFilename } from '../logic.js';
import { h, avatar, badgeChip, badgeMark, downloadFile, prefersReducedMotion, toast } from '../ui.js';

export function createResultsView(ctx) {
  const { state } = ctx;

  const canSee = (round) => state.isAdmin || !!state.config[round === 1 ? 'round1ResultsRevealed' : 'round2ResultsRevealed'];

  function setFocus(uid) {
    state.focusUid = state.focusUid === uid ? null : uid;
    ctx.update();
  }

  function onKey(e) {
    if (e.key === 'Escape' && state.focusUid && !document.querySelector('dialog[open]')) {
      state.focusUid = null;
      ctx.update();
    }
  }
  document.addEventListener('keydown', onKey);

  // ----- Toolbar -----
  const roundBtns = [1, 2].map((n) =>
    h('button.seg__btn', { type: 'button', onclick: () => ((state.resultsRound = n), ctx.update()) }, `Round ${n}`)
  );
  const participation = h('span.participation');
  const SORTS = { fixed: 'Fixed order', votes: 'Most votes', voters: 'Most voters' };
  const sortBtns = Object.entries(SORTS).map(([key, label]) =>
    h('button.seg__btn', { type: 'button', dataset: { sort: key }, onclick: () => ((state.sortBy = key), ctx.update()) }, label)
  );
  const sortGroup = h('div.seg.seg--small', { role: 'group', 'aria-label': 'Sort categories' }, sortBtns);
  const R2_SORTS = { fixed: 'Fixed order', votes: 'Most votes' };
  const r2SortBtns = Object.entries(R2_SORTS).map(([key, label]) =>
    h('button.seg__btn', { type: 'button', dataset: { sort: key }, onclick: () => ((state.r2SortBy = key), ctx.update()) }, label)
  );
  const r2SortGroup = h('div.seg.seg--small', { role: 'group', 'aria-label': 'Sort categories within each badge' }, r2SortBtns);
  const revealAllBtn = h('button.btn.btn--quiet.btn--small', { type: 'button', onclick: () => setBadgesShown(Object.fromEntries(BADGE_IDS.map((b) => [b, true]))) }, 'Reveal all');
  const hideAllBtn = h('button.btn.btn--quiet.btn--small', { type: 'button', onclick: () => setBadgesShown(Object.fromEntries(BADGE_IDS.map((b) => [b, false]))) }, 'Hide all');
  const avatarToggle = h('input.switch__input', {
    type: 'checkbox',
    role: 'switch',
    onchange: (e) => ((state.showAvatars = e.target.checked), ctx.update()),
  });
  const avatarSwitch = h('label.switch', avatarToggle, h('span.switch__track', { 'aria-hidden': 'true' }), 'Avatars');
  const exportBtn = h(
    'button.btn.btn--quiet.btn--small',
    {
      type: 'button',
      onclick: () => downloadFile(csvFilename(), buildCsv({ users: state.users, round1Votes: state.r1, round2Votes: state.r2, config: state.config })),
    },
    'Export CSV'
  );
  const toolbar = h(
    'div.results-toolbar',
    h('div.seg', { role: 'group', 'aria-label': 'Results round' }, roundBtns),
    participation,
    h(
      'div.results-toolbar__end',
      // Same order in both rounds: avatars switch, sort, then admin actions.
      h('div.results-toolbar__view', avatarSwitch, sortGroup, r2SortGroup),
      h('div.results-toolbar__admin', revealAllBtn, hideAllBtn, exportBtn)
    )
  );

  const focusBar = h('div.focus-bar', { hidden: true, 'aria-live': 'polite' });

  // ----- Round 1 grid -----
  const r1Tiles = {};
  const r1Grid = h('div.r1-grid');
  for (const id of CATEGORY_IDS) {
    const name = h('h3.tile__name');
    const fill = h('span.r1-bar__fill');
    const value = h('span.r1-bar__value');
    const avatars = h('div.av-grid');
    const tile = h(
      'article.tile.r1-tile',
      { dataset: { cat: id } },
      name,
      h('div.r1-tile__body', h('div.r1-bar', h('span.r1-bar__track', fill, value)), avatars)
    );
    r1Tiles[id] = { tile, name, fill, value, avatars };
    r1Grid.append(tile);
  }
  const r1Empty = h('div.empty-state', { hidden: true }, h('h2', 'Round 1 results aren’t revealed yet'), h('p', 'They’ll show up here once an admin reveals them.'));

  // ----- Round 2 grid: one column per badge, one row per advancing category -----
  const r2Grid = h('div.r2-grid');
  const r2Empty = h('div.empty-state', { hidden: true });
  const badgeShown = (b) => !!state.config.round2BadgesShown?.[b];

  function setBadgesShown(patch) {
    const next = { ...Object.fromEntries(BADGE_IDS.map((b) => [b, badgeShown(b)])), ...patch };
    ctx.backend.updateConfig({ round2BadgesShown: next }).catch((e) => {
      console.error(e);
      toast('Couldn’t update the results. Check your connection and try again.', { error: true });
    });
  }

  const r2Cols = {};
  for (const b of BADGE_IDS) {
    const chip = h('div.r2-col__chip');
    const total = h('span.r2-col__total');
    const toggle = h('button', { type: 'button', onclick: () => setBadgesShown({ [b]: !badgeShown(b) }) });
    const hidden = h('div.r2-col__hidden');
    const rows = h('div.r2-rows');
    const col = h('article.tile.r2-col', { dataset: { badge: b } }, h('header.r2-col__head', chip, h('div.r2-col__meta', total, toggle)), hidden, rows);
    r2Cols[b] = { col, chip, total, toggle, hidden, rows, rowEls: {} };
    r2Grid.append(col);
  }

  function makeR2Row() {
    const name = h('span.r2-row__name');
    const count = h('span.r2-row__count');
    const fill = h('span.r2-row__fill');
    const avatars = h('div.av-grid');
    return { row: h('div.r2-row', h('div.r2-row__head', name, count), h('span.r2-row__bar', fill), avatars), name, count, fill, avatars };
  }

  const el = h('section.results', toolbar, focusBar, r1Empty, r1Grid, r2Empty, r2Grid);

  // ----- Helpers -----
  function personAvatar(uid, count) {
    const user = state.users[uid] || { name: 'Unknown', email: '' };
    const isFocus = state.focusUid === uid;
    const dimmed = state.focusUid && !isFocus;
    const label = count != null ? `${user.name}: ${count} ${plural(count, 'vote')}` : user.name;
    return h(
      'button.av-btn',
      {
        type: 'button',
        class: [dimmed && 'is-dimmed', isFocus && 'is-focus'].filter(Boolean).join(' ') || null,
        'aria-label': label,
        'aria-pressed': String(isFocus),
        dataset: { name: user.name },
        onclick: () => setFocus(uid),
      },
      avatar(user),
      count != null && h('span.av-btn__count', { 'aria-hidden': 'true' }, count)
    );
  }

  // One avatar size for every tile, so columns line up and nothing looks bigger by accident.
  const AV_GAP = 8; // row gap
  const AV_COL_GAP = 11; // matches .r1-tile .av-grid column-gap
  const AV_MAX = 44;
  const AV_MIN = 20;
  const fillsScreen = window.matchMedia('(min-width: 1100px) and (min-height: 600px)');

  function avatarSize(n) {
    if (n <= 6) return 40;
    if (n <= 12) return 34;
    if (n <= 20) return 30;
    return 26;
  }

  /** Largest size that fits `n` avatars into a w×h box. */
  function fitSize(n, w, h) {
    for (let s = AV_MAX; s > AV_MIN; s--) {
      const cols = Math.max(1, Math.floor((w + AV_COL_GAP) / (s + AV_COL_GAP)));
      if (Math.ceil(n / cols) * (s + AV_GAP) - AV_GAP <= h) return s;
    }
    return AV_MIN;
  }

  let r1MaxVoters = 0;
  function sizeRound1Avatars() {
    let size = avatarSize(r1MaxVoters);
    const box = r1Tiles[CATEGORY_IDS[0]].avatars;
    if (fillsScreen.matches && box.clientWidth) {
      const cs = getComputedStyle(box);
      const w = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const hgt = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      size = fitSize(Math.max(r1MaxVoters, 1), w, hgt);
    }
    r1Grid.style.setProperty('--av', `${size}px`);
  }
  const resizeObserver = new ResizeObserver(() => {
    if (!r1Grid.hidden) sizeRound1Avatars();
  });
  resizeObserver.observe(r1Grid);

  function moveWithFlip(container, orderedEls) {
    const current = [...container.children];
    if (current.length === orderedEls.length && current.every((c, i) => c === orderedEls[i])) return;
    const animate = !prefersReducedMotion() && container.offsetParent !== null;
    const before = animate ? new Map(current.map((c) => [c, c.getBoundingClientRect()])) : null;
    container.append(...orderedEls);
    if (!animate) return;
    for (const c of orderedEls) {
      const a = before.get(c);
      if (!a) continue;
      const b = c.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (dx || dy) c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
  }

  // ----- Renderers -----
  function renderRound1() {
    const totals = categoryTotals(state.r1);
    const focus = state.focusUid;
    const focusVotes = focus ? state.r1[focus]?.votes : null;
    const scale = focus ? TOTAL_VOTES : Math.max(1, ...Object.values(totals));

    // "Most voters" = how many people put at least one vote there (ties go to more votes).
    const voterCounts = Object.fromEntries(
      CATEGORY_IDS.map((id) => [id, Object.values(state.r1).filter((d) => voteCount(d?.votes, id) > 0).length])
    );
    const byIndex = (a, b) => CATEGORY_IDS.indexOf(a) - CATEGORY_IDS.indexOf(b);
    const order =
      state.sortBy === 'votes'
        ? [...CATEGORY_IDS].sort((a, b) => totals[b] - totals[a] || byIndex(a, b))
        : state.sortBy === 'voters'
          ? [...CATEGORY_IDS].sort((a, b) => voterCounts[b] - voterCounts[a] || totals[b] - totals[a] || byIndex(a, b))
          : CATEGORY_IDS;

    let maxVoters = 0;
    for (const id of CATEGORY_IDS) {
      const t = r1Tiles[id];
      const value = focus ? voteCount(focusVotes, id) : totals[id];
      t.name.textContent = state.config.categoryLabels[id];
      // Bars read --pct: vertical bars use it as height, the phone layout as width.
      t.tile.style.setProperty('--pct', `${(value / scale) * 100}%`);
      t.value.textContent = value;
      t.tile.style.setProperty('--cat', categoryColor(state.config, id));
      t.tile.setAttribute('aria-label', `${state.config.categoryLabels[id]}: ${value} ${plural(value, 'vote')}`);

      const voters = Object.keys(state.r1)
        .map((uid) => [uid, voteCount(state.r1[uid]?.votes, id)])
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1] || (state.users[a[0]]?.name || '').localeCompare(state.users[b[0]]?.name || ''));
      maxVoters = Math.max(maxVoters, voters.length);
      t.avatars.replaceChildren(...voters.map(([uid, n]) => personAvatar(uid, n)));
    }
    r1MaxVoters = maxVoters;
    if (state.showAvatars) sizeRound1Avatars();
    moveWithFlip(r1Grid, order.map((id) => r1Tiles[id].tile));
  }

  function renderRound2() {
    const cats = state.config.round2Categories || [];
    const focus = state.focusUid;

    // placements: badge → category → [uid]
    const placements = Object.fromEntries(BADGE_IDS.map((b) => [b, Object.fromEntries(cats.map((c) => [c, []]))]));
    for (const [uid, doc] of Object.entries(state.r2)) {
      for (const b of BADGE_IDS) {
        const c = doc?.badges?.[b];
        if (placements[b][c]) placements[b][c].push(uid);
      }
    }
    const byName = (x, y) => (state.users[x]?.name || '').localeCompare(state.users[y]?.name || '');
    // One scale for every bar on the screen (all badges × all categories), so bars compare across columns.
    const maxCell = Math.max(1, ...BADGE_IDS.flatMap((b) => cats.map((c) => placements[b][c].length)));
    // Ties can send more than 4 categories through: tighten rows so they still fit on screen.
    const dense = cats.length > 4;
    r2Grid.classList.toggle('is-dense', dense);
    r2Grid.style.setProperty('--av', `${avatarSize(maxCell) - (dense ? 6 : 4)}px`);

    for (const b of BADGE_IDS) {
      const c = r2Cols[b];
      const shown = badgeShown(b);
      const label = state.config.badgeLabels[b];
      c.col.style.setProperty('--badge', badgeColor(state.config, b));
      c.col.classList.toggle('is-hidden', !shown);
      c.chip.replaceChildren(badgeChip(b, label, { config: state.config }));
      c.toggle.hidden = !state.isAdmin;
      c.toggle.textContent = shown ? 'Hide' : 'Reveal';
      c.toggle.className = `btn btn--small r2-col__toggle ${shown ? 'btn--quiet' : 'btn--primary'}`;
      c.toggle.setAttribute('aria-label', `${shown ? 'Hide' : 'Reveal'} ${label} results`);
      c.hidden.hidden = shown;
      c.hidden.replaceChildren(
        h('span.badge-chip__letter.r2-col__big-mark', badgeMark(b, state.config)),
        h('p', state.isAdmin ? 'Hidden from everyone until you reveal it.' : 'Coming up next…')
      );
      c.rows.hidden = !shown;
      const total = cats.reduce((sum, cat) => sum + placements[b][cat].length, 0);
      c.total.textContent = shown ? `${total} placed` : '';
      if (!shown) continue;

      // Rows are keyed by category so "Most votes" can animate the reorder.
      for (const cat of Object.keys(c.rowEls)) {
        if (!cats.includes(cat)) {
          c.rowEls[cat].row.remove();
          delete c.rowEls[cat];
        }
      }
      for (const cat of cats) {
        const r = (c.rowEls[cat] ??= makeR2Row());
        const uids = placements[b][cat].sort(byName);
        r.name.textContent = state.config.categoryLabels[cat];
        r.count.textContent = uids.length;
        r.row.classList.toggle('is-empty', !uids.length);
        r.fill.style.width = `${(uids.length / maxCell) * 100}%`;
        r.row.setAttribute('aria-label', `${state.config.categoryLabels[cat]}: ${uids.length} ${plural(uids.length, 'badge')}`);
        r.avatars.replaceChildren(...uids.map((uid) => personAvatar(uid, null)));
      }
      const order =
        state.r2SortBy === 'votes'
          ? [...cats].sort((x, y) => placements[b][y].length - placements[b][x].length || cats.indexOf(x) - cats.indexOf(y))
          : cats;
      moveWithFlip(c.rows, order.map((cat) => c.rowEls[cat].row));
    }
  }

  function renderFocusBar() {
    const uid = state.focusUid;
    focusBar.hidden = !uid;
    el.classList.toggle('is-focused', !!uid);
    if (!uid) return focusBar.replaceChildren();
    const user = state.users[uid] || { name: 'Unknown' };
    focusBar.replaceChildren(
      avatar(user, { size: 36 }),
      h('span.focus-bar__text', 'Showing ', h('strong', `${firstName(user.name)}’s`), ' votes'),
      h('button.btn.btn--quiet.btn--small', { type: 'button', onclick: () => ((state.focusUid = null), ctx.update()) }, 'Show everyone')
    );
  }

  function update() {
    // Voters land on whichever revealed round makes sense.
    if (!canSee(state.resultsRound)) state.resultsRound = canSee(2) && state.config.round2Open ? 2 : 1;
    if (state.resultsRound === 1 && !canSee(1) && canSee(2)) state.resultsRound = 2;
    const round = state.resultsRound;

    roundBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === round)));
    sortBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === state.sortBy)));
    sortGroup.hidden = round !== 1;
    r2SortBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === state.r2SortBy)));
    r2SortGroup.hidden = round !== 2 || !state.config.round2Open;
    revealAllBtn.hidden = hideAllBtn.hidden = !(state.isAdmin && round === 2 && state.config.round2Open);
    revealAllBtn.disabled = BADGE_IDS.every(badgeShown);
    hideAllBtn.disabled = !BADGE_IDS.some(badgeShown);
    exportBtn.hidden = !state.isAdmin;
    avatarToggle.checked = state.showAvatars;
    el.classList.toggle('hide-avatars', !state.showAvatars);
    el.dataset.round = round;

    const { complete, total } = countComplete(state.users, round, state.r1, state.r2, state.config.round2Categories);
    participation.replaceChildren(h('strong', complete), ` of ${total} complete`);

    const showR1 = round === 1 && canSee(1);
    r1Empty.hidden = !(round === 1 && !showR1);
    r1Grid.hidden = !showR1;

    const r2Open = state.config.round2Open;
    const showR2 = round === 2 && canSee(2) && r2Open;
    r2Grid.hidden = !showR2;
    r2Empty.hidden = !(round === 2 && !showR2);
    if (round === 2 && !showR2) {
      r2Empty.replaceChildren(
        ...(r2Open
          ? [h('h2', 'Round 2 results aren’t revealed yet'), h('p', 'They’ll show up here once an admin reveals them.')]
          : [h('h2', 'Round 2 hasn’t started yet'), h('p', 'Results will appear here once Round 2 opens.')])
      );
    }
    participation.hidden = !(showR1 || showR2);

    if (state.focusUid && !state.users[state.focusUid]) state.focusUid = null;
    renderFocusBar();
    if (showR1) renderRound1();
    if (showR2) renderRound2();
  }

  return {
    el,
    update,
    destroy: () => {
      document.removeEventListener('keydown', onKey);
      resizeObserver.disconnect();
    },
  };
}
