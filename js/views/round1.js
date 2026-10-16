import { CATEGORY_IDS, TOTAL_VOTES, categoryColor } from '../constants.js';
import { voteCount, votesUsed, round1Status, plural } from '../logic.js';
import { h, toast, statusPill, confirmDialog } from '../ui.js';

const RESET_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';

const SAVE_DELAY = 250;

export function createRound1View(ctx) {
  const { state, backend } = ctx;
  const uid = state.me.uid;

  // Local edits win over the server copy until they've been saved.
  let pending = null;
  let saveTimer = null;
  let saving = Promise.resolve();

  const myVotes = () => pending ?? state.r1[uid]?.votes ?? {};
  const locked = () => !!state.config.round1Locked;

  function setVote(catId, n) {
    if (locked()) return;
    const votes = { ...myVotes() };
    const others = votesUsed(votes) - voteCount(votes, catId);
    n = Math.max(0, Math.min(Math.round(n), TOTAL_VOTES - others));
    if (n === voteCount(votes, catId)) return;
    if (n > 0) votes[catId] = n;
    else delete votes[catId];
    pending = votes;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_DELAY);
    update();
  }

  function flush() {
    clearTimeout(saveTimer);
    if (!pending) return saving;
    const snapshot = pending;
    saving = saving
      .then(() => backend.saveRound1(uid, snapshot))
      .then(
        () => {
          if (pending === snapshot) pending = null;
          ctx.update();
        },
        (e) => {
          console.error(e);
          pending = null;
          toast(locked() ? 'Voting is locked — your change wasn’t saved.' : 'Couldn’t save your vote. Check your connection and try again.', { error: true });
          ctx.update();
        }
      );
    return saving;
  }

  // ----- Layout -----
  const banner = h('div.lock-banner', { role: 'status', hidden: true }, h('strong', 'Voting is locked.'), ' Your votes are shown below.');
  const rows = {};
  const list = h(
    'ul.cat-list',
    CATEGORY_IDS.map((id) => {
      const name = h('span.cat-row__name');
      const fill = h('span.cat-row__fill');
      const count = h('span.cat-row__count');
      const button = h(
        'button.cat-row',
        { type: 'button', onclick: () => openSheet(id) },
        h('span.cat-row__main', name, h('span.cat-row__bar', fill)),
        count
      );
      const reset = h('button.cat-reset', { type: 'button', title: 'Reset to 0', onclick: () => setVote(id, 0) });
      reset.innerHTML = RESET_ICON;
      rows[id] = { button, name, fill, count, reset };
      return h('li.cat-item', button, reset);
    })
  );

  const resetBtn = h('button.btn.btn--quiet.btn--small', { type: 'button', onclick: clearAll }, 'Clear my votes');
  const resetRow = h('div.reset-row', resetBtn);

  async function clearAll() {
    if (locked()) return;
    const ok = await confirmDialog({
      title: 'Clear your votes?',
      body: h('p', `This sets every category back to 0 so you can start over with all ${TOTAL_VOTES} votes.`),
      confirmLabel: 'Clear my votes',
      danger: true,
    });
    if (!ok) return;
    pending = {};
    flush();
    update();
  }

  const tallyFill = h('span.tally__fill');
  const tallyText = h('span.tally__text');
  const tallyStatus = h('span.tally__status');
  const tally = h(
    'div.tally',
    { 'aria-live': 'polite' },
    h('div.tally__row', tallyText, tallyStatus),
    h('span.tally__bar', tallyFill)
  );

  const el = h(
    'section.round.round--1',
    { 'aria-labelledby': 'r1-title' },
    banner,
    h(
      'div.view-intro',
      h('h1.eyebrow', { id: 'r1-title' }, 'Round 1'),
      h('p', `Spread your ${TOTAL_VOTES} votes across the categories however you like. Tap a category to set its votes. Use all ${TOTAL_VOTES} to complete your ballot — changes save automatically.`)
    ),
    list,
    resetRow,
    tally
  );

  // ----- Vote sheet -----
  let sheet = null;

  function openSheet(catId) {
    if (locked()) return;
    sheet?.dialog.close();

    const title = h('h2.sheet__title', { id: 'sheet-title' });
    const desc = h('p.sheet__desc', { id: 'sheet-desc' });
    const readout = h('output.sheet__number');
    const readoutUnit = h('span.sheet__unit');
    const hint = h('p.sheet__hint');
    const fill = h('span.vslider__fill');
    const thumb = h('span.vslider__thumb');
    const maxLabel = h('span.vslider__label.vslider__label--max');
    const track = h('span.vslider__track', fill, thumb);
    const slider = h(
      'div.vslider',
      {
        role: 'slider',
        tabindex: '0',
        'aria-orientation': 'vertical',
        'aria-labelledby': 'sheet-title',
        'aria-valuemin': '0',
      },
      maxLabel,
      track,
      h('span.vslider__label', '0')
    );
    const minus = h('button.step-btn', { type: 'button', 'aria-label': 'Remove one vote', onclick: () => setVote(catId, current() - 1) }, '−');
    const plus = h('button.step-btn', { type: 'button', 'aria-label': 'Add one vote', onclick: () => setVote(catId, current() + 1) }, '+');

    const dialog = h(
      'dialog.sheet',
      { 'aria-labelledby': 'sheet-title', 'aria-describedby': 'sheet-desc' },
      h(
        'div.sheet__box',
        h(
          'div.sheet__head',
          title,
          h('button.icon-btn', { type: 'button', 'aria-label': 'Close', onclick: () => dialog.close() }, '✕')
        ),
        desc,
        h(
          'div.sheet__body',
          slider,
          h('div.sheet__controls', h('div.sheet__readout', readout, readoutUnit), h('div.sheet__steps', plus, minus))
        ),
        hint,
        h('button.btn.btn--primary.btn--block', { type: 'button', onclick: () => dialog.close() }, 'Done')
      )
    );

    const current = () => voteCount(myVotes(), catId);
    const maxFor = () => TOTAL_VOTES - (votesUsed(myVotes()) - current());

    // Pointer dragging on the slider.
    const valueAt = (clientY) => {
      const r = track.getBoundingClientRect();
      const ratio = (r.bottom - clientY) / r.height;
      return Math.round(Math.max(0, Math.min(1, ratio)) * maxFor());
    };
    slider.addEventListener('pointerdown', (e) => {
      if (locked() || maxFor() === 0) return;
      slider.setPointerCapture(e.pointerId);
      slider.classList.add('is-dragging');
      setVote(catId, valueAt(e.clientY));
    });
    slider.addEventListener('pointermove', (e) => {
      if (slider.hasPointerCapture(e.pointerId)) setVote(catId, valueAt(e.clientY));
    });
    const endDrag = () => slider.classList.remove('is-dragging');
    slider.addEventListener('pointerup', endDrag);
    slider.addEventListener('pointercancel', endDrag);
    slider.addEventListener('keydown', (e) => {
      const v = current();
      const next = {
        ArrowUp: v + 1,
        ArrowRight: v + 1,
        ArrowDown: v - 1,
        ArrowLeft: v - 1,
        PageUp: v + 10,
        PageDown: v - 10,
        Home: 0,
        End: maxFor(),
      }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      setVote(catId, next);
    });

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => {
      flush();
      dialog.remove();
      if (sheet?.dialog === dialog) sheet = null;
      rows[catId].button.focus({ preventScroll: true });
    });

    sheet = {
      dialog,
      catId,
      render() {
        const v = current();
        const max = maxFor();
        title.textContent = state.config.categoryLabels[catId];
        desc.textContent = state.config.categoryDescriptions?.[catId] || '';
        desc.hidden = !desc.textContent;
        dialog.style.setProperty('--cat', categoryColor(state.config, catId));
        readout.textContent = v;
        readoutUnit.textContent = plural(v, 'vote');
        maxLabel.textContent = max;
        const pct = max ? (v / max) * 100 : 0;
        fill.style.height = `${pct}%`;
        thumb.style.bottom = `${pct}%`;
        slider.setAttribute('aria-valuemax', max);
        slider.setAttribute('aria-valuenow', v);
        slider.setAttribute('aria-valuetext', `${v} ${plural(v, 'vote')}`);
        slider.classList.toggle('is-disabled', max === 0);
        minus.disabled = v <= 0;
        plus.disabled = v >= max;
        const left = TOTAL_VOTES - votesUsed(myVotes());
        hint.textContent =
          max === 0
            ? `You’ve used all ${TOTAL_VOTES} votes. Take some from another category to add votes here.`
            : left === 0
              ? `All ${TOTAL_VOTES} votes used — your ballot is complete.`
              : `${left} ${plural(left, 'vote')} left to spend.`;
      },
    };
    document.body.append(dialog);
    sheet.render();
    dialog.showModal();
    slider.focus({ preventScroll: true });
  }

  // ----- Update -----
  function update() {
    const votes = myVotes();
    const isLocked = locked();
    banner.hidden = !isLocked;
    el.classList.toggle('is-locked', isLocked);
    if (isLocked && sheet) sheet.dialog.close();

    for (const id of CATEGORY_IDS) {
      const n = voteCount(votes, id);
      const r = rows[id];
      r.name.textContent = state.config.categoryLabels[id];
      r.count.textContent = n;
      r.fill.style.width = `${n}%`;
      r.button.style.setProperty('--cat', categoryColor(state.config, id));
      r.button.disabled = isLocked;
      r.button.classList.toggle('has-votes', n > 0);
      r.button.setAttribute('aria-label', `${state.config.categoryLabels[id]}: ${n} ${plural(n, 'vote')}`);
      r.reset.hidden = isLocked || n === 0;
      r.reset.setAttribute('aria-label', `Reset ${state.config.categoryLabels[id]} to 0`);
    }

    const status = round1Status(votes);
    resetRow.hidden = isLocked;
    resetBtn.disabled = status.used === 0;
    tallyFill.style.width = `${status.used}%`;
    tallyText.replaceChildren(h('strong', status.used), ` / ${TOTAL_VOTES} votes used`);
    tallyStatus.replaceChildren(
      status.state === 'complete'
        ? statusPill({ state: 'complete', label: '✓ Complete' })
        : statusPill({ state: 'incomplete', label: `Incomplete · ${status.left} ${plural(status.left, 'vote')} left` })
    );
    tally.classList.toggle('is-complete', status.state === 'complete');

    sheet?.render();
  }

  return { el, update, destroy: () => flush() };
}
