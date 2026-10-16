import { CATEGORY_IDS, BADGE_IDS, BADGE_LETTERS, CATEGORY_COLORS, BRAND_COLOR_KEYS, defaultConfig, categoryColor, badgeColor, normalizeHex } from '../constants.js';
import { BADGE_ICONS } from '../icons.js';
import { advancingCategories, categoryTotals, round1Status, round2Status, buildCsv, csvFilename, plural } from '../logic.js';
import { h, avatar, badgeMark, badgeChip, confirmDialog, toast, downloadFile, statusPill, createPicker } from '../ui.js';

export function createAdminView(ctx) {
  const { state, backend } = ctx;

  async function run(action, success) {
    try {
      await action();
      if (success) toast(success);
    } catch (e) {
      console.error(e);
      toast('That didn’t work. Check your connection and try again.', { error: true });
    }
  }

  const setFlag = (patch, msg) => run(() => backend.updateConfig(patch), msg);

  function catList(ids) {
    const totals = categoryTotals(state.r1);
    return h(
      'ol.mini-list',
      ids.map((id) => h('li', h('span', state.config.categoryLabels[id]), h('span.mini-list__n', `${totals[id]} ${plural(totals[id], 'vote')}`)))
    );
  }

  async function openRound2() {
    const ids = advancingCategories(state.r1);
    const ok = await confirmDialog({
      title: 'Open Round 2?',
      body: [
        h('p', `These ${ids.length} categories will advance${ids.length > 4 ? ' (there’s a tie at the cutoff)' : ''}:`),
        catList(ids),
        h('p', 'Round 1 will be locked automatically. You can unlock it later if needed.'),
      ],
      confirmLabel: 'Open Round 2',
    });
    if (!ok) return;
    await run(async () => {
      await backend.clearRound2();
      await backend.updateConfig({ round2Categories: ids, round2Open: true, round2Locked: false, round1Locked: true, round2BadgesShown: defaultConfig().round2BadgesShown });
    }, 'Round 2 is open.');
  }

  async function redoRound2() {
    const ids = advancingCategories(state.r1);
    const ok = await confirmDialog({
      title: 'Re-do Round 2 setup?',
      body: [
        h('p', 'This recomputes the advancing categories from the current Round 1 totals:'),
        catList(ids),
        h('p', h('strong', 'All Round 2 badge placements will be cleared for everyone.'), ' This can’t be undone.'),
      ],
      confirmLabel: 'Clear badges and re-do',
      danger: true,
    });
    if (!ok) return;
    await run(async () => {
      await backend.clearRound2();
      await backend.updateConfig({ round2Categories: ids, round2BadgesShown: defaultConfig().round2BadgesShown });
    }, 'Round 2 categories updated and badges cleared.');
  }

  async function resetAll() {
    const ok = await confirmDialog({
      title: 'Reset all votes?',
      body: [
        h('p', 'This wipes every Round 1 vote and Round 2 badge, closes Round 2, unlocks Round 1, and hides results.'),
        h('p', 'Labels, descriptions, taglines, colors and glyphs are kept. ', h('strong', 'This can’t be undone.')),
      ],
      confirmLabel: 'Reset everything',
      danger: true,
    });
    if (!ok) return;
    await run(async () => {
      await backend.clearRound1();
      await backend.clearRound2();
      // Keep everything admins have written; only reset voting state.
      const { categoryLabels, categoryDescriptions, categoryTaglines, categoryColors, badgeLabels, badgeIcons, badgeColors, ...flags } = defaultConfig();
      await backend.updateConfig(flags);
    }, 'All votes have been reset.');
  }

  function toggleRow(label, description, on, onLabel, offLabel, onClick, key) {
    return h(
      'div.toggle-row',
      h('div', h('div.toggle-row__label', label), h('div.toggle-row__desc', description)),
      h('button.btn.btn--small', { type: 'button', class: on ? 'btn--quiet' : 'btn--primary', onclick: onClick, dataset: { key } }, on ? onLabel : offLabel)
    );
  }

  // ----- Sections rebuilt on each update -----
  const roundsSection = h('div.admin-grid');
  const trackerBody = h('div');
  const trackerSection = h('section.card', h('h2.card__title', 'Participation'), trackerBody);

  // ----- Labels form (built once; refreshed only when not being edited) -----
  const catInputs = Object.fromEntries(
    CATEGORY_IDS.map((id, i) => [id, h('input.input', { id: `lbl-${id}`, maxlength: 60, required: true, 'aria-label': `Category ${i + 1} heading` })])
  );
  const descInputs = Object.fromEntries(
    CATEGORY_IDS.map((id, i) => [
      id,
      h('textarea.input.input--textarea', { rows: 2, maxlength: 400, placeholder: 'Description (1–2 sentences, shown when voting in Round 1)', 'aria-label': `Category ${i + 1} description` }),
    ])
  );
  const taglineInputs = Object.fromEntries(
    CATEGORY_IDS.map((id, i) => [
      id,
      h('input.input', { maxlength: 120, placeholder: 'Tagline example (shown only if it advances to Round 2)', 'aria-label': `Category ${i + 1} tagline example` }),
    ])
  );
  const badgeInputs = Object.fromEntries(
    BADGE_IDS.map((id) => [id, h('input.input', { id: `lbl-${id}`, maxlength: 60, required: true, 'aria-label': `Badge ${BADGE_LETTERS[id]} label` })])
  );
  const dot = (hex) => h('span.color-dot', { style: { '--swatch': hex } });
  const colorPickers = Object.fromEntries(
    CATEGORY_IDS.map((id, i) => [
      id,
      createPicker({
        label: `Color for category ${i + 1}`,
        align: 'right',
        options: Object.entries(CATEGORY_COLORS).map(([key, c]) => ({ value: key, label: c.label, render: () => dot(c.hex) })),
        renderValue: (v) => dot(categoryColor({ categoryColors: { [id]: v } }, id)),
        customHex: normalizeHex,
      }),
    ])
  );
  const badgeColorPickers = Object.fromEntries(
    BADGE_IDS.map((id) => [
      id,
      createPicker({
        label: `Color for badge ${BADGE_LETTERS[id]}`,
        options: BRAND_COLOR_KEYS.map((key) => ({ value: key, label: CATEGORY_COLORS[key].label, render: () => dot(CATEGORY_COLORS[key].hex) })),
        renderValue: (v) => dot(badgeColor({ badgeColors: { [id]: v } }, id)),
      }),
    ])
  );
  const iconPickers = Object.fromEntries(
    BADGE_IDS.map((id) => {
      // Color comes from --badge on the picker, so the trigger and every option follow the color picker.
      const mark = (icon) => h('span.badge-chip__letter', badgeMark(id, { badgeIcons: { [id]: icon } }));
      return [
        id,
        createPicker({
          label: `Glyph for badge ${BADGE_LETTERS[id]}`,
          options: [
            { value: 'letter', label: `Letter ${BADGE_LETTERS[id]}`, render: () => mark('letter') },
            ...Object.entries(BADGE_ICONS).map(([name, icon]) => ({ value: name, label: icon.label, render: () => mark(name) })),
          ],
          renderValue: mark,
        }),
      ];
    })
  );
  // Keep the glyph picker (button and dropdown) in the badge's chosen color.
  const syncGlyphColor = (id) =>
    iconPickers[id].el.style.setProperty('--badge', badgeColor({ badgeColors: { [id]: badgeColorPickers[id].value } }, id));
  for (const id of BADGE_IDS) badgeColorPickers[id].el.addEventListener('input', () => syncGlyphColor(id));

  let labelsDirty = false;
  const trim = (inputs) => Object.fromEntries(Object.entries(inputs).map(([id, input]) => [id, input.value.trim()]));
  const pick = (pickers) => Object.fromEntries(Object.entries(pickers).map(([id, p]) => [id, p.value]));
  const labelsForm = h(
    'form.card.labels-form',
    {
      oninput: () => (labelsDirty = true),
      onsubmit: async (e) => {
        e.preventDefault();
        const categoryLabels = trim(catInputs);
        const badgeLabels = trim(badgeInputs);
        if ([...Object.values(categoryLabels), ...Object.values(badgeLabels)].some((v) => !v)) return toast('Headings and badge labels can’t be blank.', { error: true });
        await run(
          () =>
            backend.updateConfig({
              categoryLabels,
              categoryDescriptions: trim(descInputs),
              categoryTaglines: trim(taglineInputs),
              categoryColors: pick(colorPickers),
              badgeLabels,
              badgeIcons: pick(iconPickers),
              badgeColors: pick(badgeColorPickers),
            }),
          'Labels saved.'
        );
        labelsDirty = false;
      },
    },
    h('h2.card__title', 'Labels'),
    h(
      'p.card__desc',
      'Votes are stored by ID, so editing never affects existing votes. Category colors fill the bars on the voting and results screens. Taglines stay hidden until a category advances to Round 2.'
    ),
    h(
      'div.labels-form__cols',
      h(
        'fieldset',
        h('legend', 'Categories'),
        CATEGORY_IDS.map((id, i) =>
          h(
            'div.cat-fields',
            h('span.cat-fields__num', `${i + 1}`),
            h('div.cat-fields__main', h('div.cat-field', catInputs[id], colorPickers[id].el), descInputs[id], taglineInputs[id])
          )
        )
      ),
      h(
        'fieldset.badge-fieldset',
        h('legend', 'Badges'),
        BADGE_IDS.map((id) => h('div.badge-field', iconPickers[id].el, badgeColorPickers[id].el, badgeInputs[id]))
      )
    ),
    h(
      'div.labels-form__actions',
      h('button.btn.btn--quiet', { type: 'button', onclick: () => ((labelsDirty = false), fillLabels()) }, 'Discard changes'),
      h('button.btn.btn--primary', { type: 'submit' }, 'Save changes')
    )
  );
  function fillLabels() {
    const c = state.config;
    const d = defaultConfig();
    for (const id of CATEGORY_IDS) {
      catInputs[id].value = c.categoryLabels[id];
      descInputs[id].value = c.categoryDescriptions?.[id] ?? '';
      taglineInputs[id].value = c.categoryTaglines?.[id] ?? '';
      colorPickers[id].value = c.categoryColors?.[id] ?? d.categoryColors[id];
    }
    for (const id of BADGE_IDS) {
      badgeInputs[id].value = c.badgeLabels[id];
      badgeColorPickers[id].value = c.badgeColors?.[id] ?? d.badgeColors[id];
      iconPickers[id].value = c.badgeIcons?.[id] ?? 'letter';
      syncGlyphColor(id);
    }
  }

  const dataSection = h(
    'section.card',
    h('h2.card__title', 'Data'),
    h(
      'div.toggle-row',
      h('div', h('div.toggle-row__label', 'Export results'), h('div.toggle-row__desc', 'CSV with one row per person who voted.')),
      h(
        'button.btn.btn--quiet.btn--small',
        { type: 'button', onclick: () => downloadFile(csvFilename(), buildCsv({ users: state.users, round1Votes: state.r1, round2Votes: state.r2, config: state.config })) },
        'Export CSV'
      )
    ),
    h(
      'div.toggle-row.toggle-row--danger',
      h('div', h('div.toggle-row__label', 'Reset all votes'), h('div.toggle-row__desc', 'Wipe both rounds and return to the starting state.')),
      h('button.btn.btn--danger.btn--small', { type: 'button', onclick: resetAll }, 'Reset all votes')
    )
  );

  const el = h(
    'section.admin',
    h('div.view-intro', h('h1.eyebrow', 'Admin'), h('p', 'Run the session: lock rounds, reveal results, and manage the data.')),
    roundsSection,
    trackerSection,
    labelsForm,
    dataSection,
    backend.adminTools?.({ h, toast, confirmDialog })
  );

  function renderRounds() {
    const c = state.config;
    const r1 = h(
      'section.card',
      h('h2.card__title', 'Round 1 ', statusPill(c.round1Locked ? { state: 'locked', label: 'Locked' } : { state: 'complete', label: 'Open' })),
      toggleRow('Voting', c.round1Locked ? 'Votes are frozen.' : 'People can change their votes.', c.round1Locked, 'Unlock voting', 'Lock voting',
        () => setFlag({ round1Locked: !c.round1Locked }, c.round1Locked ? 'Round 1 unlocked.' : 'Round 1 locked.'), 'r1lock'),
      toggleRow('Results', c.round1ResultsRevealed ? 'Everyone can see Round 1 results.' : 'Only admins can see Round 1 results.', c.round1ResultsRevealed, 'Hide results', 'Reveal results',
        () => setFlag({ round1ResultsRevealed: !c.round1ResultsRevealed }, c.round1ResultsRevealed ? 'Round 1 results hidden.' : 'Round 1 results revealed.'), 'r1reveal')
    );

    let r2;
    if (!c.round2Open) {
      const preview = advancingCategories(state.r1);
      r2 = h(
        'section.card',
        h('h2.card__title', 'Round 2 ', statusPill({ state: 'not-started', label: 'Not open' })),
        h('p.card__desc', 'If you opened it now, these would advance:'),
        catList(preview),
        h('button.btn.btn--primary.btn--block', { type: 'button', onclick: openRound2, dataset: { key: 'r2open' } }, 'Open Round 2')
      );
    } else {
      r2 = h(
        'section.card',
        h('h2.card__title', 'Round 2 ', statusPill(c.round2Locked ? { state: 'locked', label: 'Locked' } : { state: 'complete', label: 'Open' })),
        h('p.card__desc', `Advancing categories (${c.round2Categories.length}):`),
        catList(c.round2Categories),
        toggleRow('Voting', c.round2Locked ? 'Badges are frozen.' : 'People can move their badges.', c.round2Locked, 'Unlock voting', 'Lock voting',
          () => setFlag({ round2Locked: !c.round2Locked }, c.round2Locked ? 'Round 2 unlocked.' : 'Round 2 locked.'), 'r2lock'),
        toggleRow('Results', c.round2ResultsRevealed ? 'Everyone can see Round 2 results.' : 'Only admins can see Round 2 results.', c.round2ResultsRevealed, 'Hide results', 'Reveal results',
          () => setFlag({ round2ResultsRevealed: !c.round2ResultsRevealed }, c.round2ResultsRevealed ? 'Round 2 results hidden.' : 'Round 2 results revealed.'), 'r2reveal'),
        h(
          'div.toggle-row.toggle-row--stack',
          h(
            'div',
            h('div.toggle-row__label', 'Results by badge'),
            h('div.toggle-row__desc', 'Reveal one badge at a time to discuss it. Also on the Results screen.')
          ),
          h(
            'div.badge-toggles',
            BADGE_IDS.map((b) => {
              const shown = !!c.round2BadgesShown?.[b];
              return h(
                'button.badge-toggle',
                {
                  type: 'button',
                  'aria-pressed': String(shown),
                  dataset: { key: `r2badge-${b}` },
                  onclick: () =>
                    setFlag({ round2BadgesShown: { ...Object.fromEntries(BADGE_IDS.map((x) => [x, !!c.round2BadgesShown?.[x]])), [b]: !shown } }),
                },
                badgeChip(b, c.badgeLabels[b], { small: true, config: c }),
                h('span.badge-toggle__state', shown ? 'Shown' : 'Hidden')
              );
            })
          )
        ),
        h(
          'div.toggle-row.toggle-row--danger',
          h('div', h('div.toggle-row__label', 'Re-do setup'), h('div.toggle-row__desc', 'Recompute from current Round 1 totals. Clears all badges.')),
          h('button.btn.btn--danger.btn--small', { type: 'button', onclick: redoRound2, dataset: { key: 'r2redo' } }, 'Re-do setup')
        )
      );
    }
    roundsSection.replaceChildren(r1, r2);
  }

  function renderTracker() {
    const c = state.config;
    const people = Object.entries(state.users).sort(([, a], [, b]) => (a.name || '').localeCompare(b.name || ''));
    if (!people.length) return trackerBody.replaceChildren(h('p.card__desc', 'No one has signed in yet.'));
    const r1Done = people.filter(([uid]) => round1Status(state.r1[uid]?.votes).state === 'complete').length;
    const r2Done = people.filter(([uid]) => round2Status(state.r2[uid]?.badges, c.round2Categories).state === 'complete').length;
    trackerBody.replaceChildren(
      h(
        'p.card__desc',
        `${people.length} signed in · Round 1: ${r1Done} complete`,
        c.round2Open ? ` · Round 2: ${r2Done} complete` : ''
      ),
      h(
        'div.table-wrap',
        h(
          'table.tracker',
          h('thead', h('tr', h('th', { scope: 'col' }, 'Person'), h('th', { scope: 'col' }, 'Round 1'), h('th', { scope: 'col' }, 'Round 2'))),
          h(
            'tbody',
            people.map(([uid, u]) =>
              h(
                'tr',
                h('td', h('span.person', avatar(u, { size: 28 }), h('span', h('span.person__name', u.name), h('span.person__email', u.email)))),
                h('td', statusPill(round1Status(state.r1[uid]?.votes))),
                h('td', c.round2Open ? statusPill(round2Status(state.r2[uid]?.badges, c.round2Categories)) : h('span.muted', '—'))
              )
            )
          )
        )
      )
    );
  }

  function update() {
    const focusKey = document.activeElement?.dataset?.key;
    renderRounds();
    renderTracker();
    if (!labelsDirty && !labelsForm.contains(document.activeElement)) fillLabels();
    if (focusKey) el.querySelector(`[data-key="${focusKey}"]`)?.focus({ preventScroll: true });
  }

  return { el, update, destroy: () => backend.stopSimulation?.() };
}
