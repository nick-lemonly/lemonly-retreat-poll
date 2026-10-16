import { BADGE_IDS, badgeColor } from '../constants.js';
import { round2Status, plural } from '../logic.js';
import { h, toast, statusPill, badgeMark, confirmDialog } from '../ui.js';

const DRAG_THRESHOLD = 6;

export function createRound2View(ctx) {
  const { state, backend } = ctx;
  const uid = state.me.uid;

  let pending = null;
  let saving = Promise.resolve();
  let selected = null; // badgeId picked up via tap/keyboard
  let drag = null;
  let suppressClick = false;

  const cats = () => state.config.round2Categories || [];
  const open = () => !!state.config.round2Open;
  const locked = () => !!state.config.round2Locked;
  const editable = () => open() && !locked();

  function myBadges() {
    const raw = pending ?? state.r2[uid]?.badges ?? {};
    // Ignore placements on categories that aren't in Round 2 (e.g. after a re-do).
    return Object.fromEntries(BADGE_IDS.map((b) => [b, cats().includes(raw[b]) ? raw[b] : null]));
  }

  function place(badgeId, catId) {
    save({ ...myBadges(), [badgeId]: catId });
  }

  async function clearAll() {
    if (!editable()) return;
    const ok = await confirmDialog({
      title: 'Clear your badges?',
      body: h('p', 'All four of your badges go back to the tray. You can place them again any time while voting is open.'),
      confirmLabel: 'Clear my badges',
      danger: true,
    });
    if (ok) save(Object.fromEntries(BADGE_IDS.map((b) => [b, null])));
  }

  function save(badges) {
    if (!editable()) return;
    pending = badges;
    selected = null;
    update();
    const snapshot = badges;
    saving = saving
      .then(() => backend.saveRound2(uid, snapshot))
      .then(
        () => {
          if (pending === snapshot) pending = null;
          ctx.update();
        },
        (e) => {
          console.error(e);
          pending = null;
          toast(locked() ? 'Voting is locked — your change wasn’t saved.' : 'Couldn’t save your badge. Check your connection and try again.', { error: true });
          ctx.update();
        }
      );
  }

  function select(badgeId) {
    if (!editable()) return;
    selected = selected === badgeId ? null : badgeId;
    update();
  }

  // ----- Layout -----
  const notOpen = h(
    'div.empty-state',
    h('h1.eyebrow', 'Round 2'),
    h('h2', 'Round 2 isn’t open yet'),
    h('p', 'Hang tight — once Round 1 wraps up, the top categories will show up here.')
  );
  const banner = h('div.lock-banner', { role: 'status', hidden: true }, h('strong', 'Voting is locked.'), ' Your badges are shown below.');
  const trayTitle = h('h2.tray__title', { 'aria-live': 'polite' }, 'Your badges');
  const traySlots = h('div.tray__slots');
  const trayReturn = h('button.btn.btn--quiet.tray__return', { type: 'button', hidden: true, onclick: () => selected && place(selected, null) }, 'Return to tray');
  const tray = h('div.tray', { dataset: { drop: '' } }, h('div.tray__head', trayTitle, trayReturn), traySlots);
  tray.addEventListener('click', (e) => {
    if (e.target.closest('.token, button')) return;
    if (selected && myBadges()[selected]) place(selected, null);
  });
  const catList = h('div.drop-list');
  const tallyText = h('span.tally__text');
  const tallyStatus = h('span.tally__status');
  const tally = h('div.tally', { 'aria-live': 'polite' }, h('div.tally__row', tallyText, tallyStatus));
  const resetBtn = h('button.btn.btn--quiet.btn--small', { type: 'button', onclick: clearAll }, 'Clear my badges');
  const resetRow = h('div.reset-row', resetBtn);

  const voting = h(
    'div',
    banner,
    h(
      'div.view-intro',
      h('h1.eyebrow', 'Round 2'),
      h('p', 'Place each of your four badges on a category. Stack them however you like — even all on one. Drag a badge, or tap it and then tap a category.'),
      h('p.view-intro__note', 'Taglines are examples for inspiration only, not actual wording.')
    ),
    tray,
    catList,
    resetRow,
    tally
  );
  const el = h('section.round.round--2', notOpen, voting);

  function token(badgeId) {
    const t = h(
      'button.token',
      {
        type: 'button',
        style: { '--badge': badgeColor(state.config, badgeId) },
        dataset: { badge: badgeId },
        'aria-pressed': String(selected === badgeId),
        onclick: (e) => {
          e.stopPropagation();
          if (suppressClick) return;
          select(badgeId);
        },
      },
      h('span.token__letter', badgeMark(badgeId, state.config)),
      h('span.token__label', state.config.badgeLabels[badgeId])
    );
    if (selected === badgeId) t.classList.add('is-selected');
    t.addEventListener('pointerdown', (e) => startPointer(e, badgeId, t));
    return t;
  }

  /** The mock "ad": Lemonly wordmark with the category's example tagline. */
  function taglineGraphic(catId) {
    const tagline = state.config.categoryTaglines?.[catId]?.trim();
    return h(
      'div.tagline-card',
      h('img.tagline-card__logo', { src: 'assets/lemonly-wordmark.svg', alt: 'Lemonly', draggable: 'false' }),
      tagline && h('p.tagline-card__text', tagline)
    );
  }

  /** A badge that can't be moved (voting is locked). */
  function staticToken(b) {
    return h(
      'span.token.token--static',
      { style: { '--badge': badgeColor(state.config, b) } },
      h('span.token__letter', badgeMark(b, state.config)),
      h('span.token__label', state.config.badgeLabels[b])
    );
  }

  // ----- Drag and drop (pointer events: mouse + touch + pen) -----
  function startPointer(e, badgeId, tokenEl) {
    if (!editable() || e.button > 0) return;
    drag = { badgeId, tokenEl, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, pointerId: e.pointerId };
    tokenEl.setPointerCapture(e.pointerId);
    tokenEl.addEventListener('pointermove', onMove);
    tokenEl.addEventListener('pointerup', onUp);
    tokenEl.addEventListener('pointercancel', onCancel);
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.active) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < DRAG_THRESHOLD) return;
      drag.active = true;
      selected = null;
      const r = drag.tokenEl.getBoundingClientRect();
      drag.offsetX = drag.startX - r.left;
      drag.offsetY = drag.startY - r.top;
      drag.ghost = drag.tokenEl.cloneNode(true);
      drag.ghost.classList.add('token--ghost');
      drag.ghost.style.width = `${r.width}px`;
      document.body.append(drag.ghost);
      drag.tokenEl.classList.add('is-dragging-source');
      document.body.classList.add('is-dragging');
      autoScroll();
    }
    drag.ghost.style.transform = `translate(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px)`;
    highlight(dropTargetAt(drag.x, drag.y));
  }

  function dropTargetAt(x, y) {
    if (drag?.ghost) drag.ghost.style.display = 'none';
    const target = document.elementFromPoint(x, y)?.closest('[data-drop]');
    if (drag?.ghost) drag.ghost.style.display = '';
    return target && el.contains(target) ? target : null;
  }

  function highlight(target) {
    el.querySelectorAll('[data-drop].is-over').forEach((n) => n !== target && n.classList.remove('is-over'));
    target?.classList.add('is-over');
  }

  function autoScroll() {
    if (!drag?.active) return;
    const edge = 70;
    const speed = drag.y < edge ? -(edge - drag.y) / 4 : drag.y > innerHeight - edge ? (drag.y - (innerHeight - edge)) / 4 : 0;
    if (speed) {
      window.scrollBy(0, speed);
      highlight(dropTargetAt(drag.x, drag.y));
    }
    requestAnimationFrame(autoScroll);
  }

  function endDrag() {
    if (!drag) return;
    const { tokenEl } = drag;
    tokenEl.removeEventListener('pointermove', onMove);
    tokenEl.removeEventListener('pointerup', onUp);
    tokenEl.removeEventListener('pointercancel', onCancel);
    drag.ghost?.remove();
    tokenEl.classList.remove('is-dragging-source');
    document.body.classList.remove('is-dragging');
    highlight(null);
    const wasActive = drag.active;
    drag = null;
    if (wasActive) {
      // The click that follows a drag shouldn't count as a tap.
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
    }
  }

  function onUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { badgeId, active } = drag;
    const target = active ? dropTargetAt(e.clientX, e.clientY) : null;
    endDrag();
    if (target) place(badgeId, target.dataset.drop || null);
    else if (active) update();
  }

  function onCancel() {
    endDrag();
    update();
  }

  function onKey(e) {
    if (e.key === 'Escape' && selected) {
      selected = null;
      update();
    }
  }
  document.addEventListener('keydown', onKey);

  // ----- Update -----
  function update() {
    const isOpen = open();
    notOpen.hidden = isOpen;
    voting.hidden = !isOpen;
    if (!isOpen) return;
    if (drag) return; // don't rebuild under the user's finger

    const isLocked = locked();
    if (isLocked) selected = null;
    banner.hidden = !isLocked;
    el.classList.toggle('is-locked', isLocked);
    el.classList.toggle('has-selection', !!selected);

    const badges = myBadges();
    const focusedBadge = document.activeElement?.closest?.('.token')?.dataset.badge;

    traySlots.replaceChildren(
      ...BADGE_IDS.map((b) =>
        badges[b]
          ? h('span.tray__slot', { title: `${state.config.badgeLabels[b]} is placed` }, badgeMark(b, state.config))
          : isLocked
            ? staticToken(b)
            : token(b)
      )
    );
    trayReturn.hidden = !(selected && badges[selected]);

    catList.replaceChildren(
      ...cats().map((catId) => {
        const here = BADGE_IDS.filter((b) => badges[b] === catId);
        const label = state.config.categoryLabels[catId];
        return h(
          'div.drop-card',
          {
            dataset: { drop: catId },
            class: here.length ? 'has-badges' : null,
            onclick: (e) => {
              if (e.target.closest('.token')) return;
              if (selected) place(selected, catId);
            },
          },
          h(
            'button.drop-card__head',
            {
              type: 'button',
              disabled: isLocked,
              'aria-label': selected ? `Place ${state.config.badgeLabels[selected]} on ${label}` : `${label}: ${here.length} ${plural(here.length, 'badge')}`,
              onclick: (e) => {
                e.stopPropagation();
                if (selected) place(selected, catId);
                else toast('Tap a badge first, then tap a category.');
              },
            },
            h('span.drop-card__name', label),
            h('span.drop-card__cta', selected ? 'Place here' : '')
          ),
          state.config.categoryDescriptions?.[catId]?.trim() && h('p.drop-card__desc', state.config.categoryDescriptions[catId].trim()),
          taglineGraphic(catId),
          h(
            'div.drop-card__badges',
            here.length
              ? here.map((b) => (isLocked ? staticToken(b) : token(b)))
              : h('span.drop-card__empty', isLocked ? 'No badges' : 'Drop a badge here')
          )
        );
      })
    );

    if (focusedBadge) el.querySelector(`.token[data-badge="${focusedBadge}"]`)?.focus({ preventScroll: true });

    trayTitle.textContent = selected ? `${state.config.badgeLabels[selected]} selected — tap a category` : 'Your badges';
    trayTitle.classList.toggle('is-hint', !!selected);

    const status = round2Status(badges, cats());
    resetRow.hidden = isLocked;
    resetBtn.disabled = status.placed === 0;
    tallyText.replaceChildren(h('strong', status.placed), ` / ${BADGE_IDS.length} badges placed`);
    tallyStatus.replaceChildren(
      status.state === 'complete'
        ? statusPill({ state: 'complete', label: '✓ Complete' })
        : statusPill({ state: 'incomplete', label: `Incomplete · ${status.left} ${plural(status.left, 'badge')} left` })
    );
    tally.classList.toggle('is-complete', status.state === 'complete');
  }

  return { el, update, destroy: () => document.removeEventListener('keydown', onKey) };
}
