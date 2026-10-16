import { firebaseConfig } from '../firebase-config.js';
import { APP_TITLE, defaultConfig, isAllowedEmail, isAdminEmail } from './constants.js';
import { h, avatar, toast } from './ui.js';
import { createRound1View } from './views/round1.js';
import { createRound2View } from './views/round2.js';
import { createResultsView } from './views/results.js';
import { createAdminView } from './views/admin.js';

const root = document.getElementById('app');
const LOGO = 'assets/lemonly-logo.svg';

const params = new URLSearchParams(location.search);
const isConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('YOUR_');

let backend;
if (params.has('demo')) {
  // Local-only demo backend (git-ignored, so it doesn't exist on the live site).
  try {
    const { createDemoBackend } = await import('./backend-demo.js');
    backend = createDemoBackend();
  } catch {
    backend = null;
  }
}
if (!backend && isConfigured) {
  const { createFirebaseBackend } = await import('./backend-firebase.js');
  backend = createFirebaseBackend(firebaseConfig);
}

if (!backend) {
  renderSetupNeeded();
} else {
  let stopApp = null;
  backend.onAuth((user) => {
    stopApp?.();
    stopApp = null;
    if (!user) renderSignIn();
    else if (!user.emailVerified || !isAllowedEmail(user.email)) renderNotAllowed(user);
    else stopApp = startApp(user);
  });
}

// ---------------------------------------------------------------------------
// Pre-app screens
// ---------------------------------------------------------------------------

function splash(...children) {
  root.replaceChildren(
    h(
      'main.splash',
      h(
        'div.splash__card',
        h('img.splash__logo', { src: LOGO, alt: 'Lemonly' }),
        h('h1.splash__title', APP_TITLE),
        backend?.splashBadge?.(h),
        ...children
      )
    )
  );
}

function renderSetupNeeded() {
  splash(
    h('p', 'Firebase isn’t configured yet. Add your project’s settings to ', h('code', 'firebase-config.js'), '.')
  );
}

function renderSignIn() {
  if (backend.signInScreen) return splash(...backend.signInScreen(h));

  const error = h('p.form-error', { role: 'alert' });
  const button = h(
    'button.btn.btn--google.btn--block',
    {
      onclick: async () => {
        error.textContent = '';
        button.disabled = true;
        try {
          await backend.signIn();
        } catch (e) {
          if (e?.code === 'auth/popup-blocked') error.textContent = 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
          else if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request')
            error.textContent = 'Sign-in didn’t work. Please try again.';
        } finally {
          button.disabled = false;
        }
      },
    },
    googleIcon(),
    'Sign in with Google'
  );
  splash(h('p', 'Sign in with your Lemonly or Click Rain Google account to vote.'), button, error);
}

function renderNotAllowed(user) {
  splash(
    h('p.splash__lead', 'This poll is for Lemonly team members.'),
    h('p', 'You’re signed in as ', h('strong', user.email), '. Sign in with your @lemonly.com or @clickrain.com account instead.'),
    h('button.btn.btn--primary.btn--block', { onclick: () => backend.signOut() }, 'Sign out')
  );
}

function googleIcon() {
  const span = h('span.google-icon', { 'aria-hidden': 'true' });
  span.innerHTML =
    '<svg viewBox="0 0 48 48" width="20" height="20"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  return span;
}

// ---------------------------------------------------------------------------
// Main app
// ---------------------------------------------------------------------------

function startApp(user) {
  let queued = false;
  const state = {
    me: user,
    isAdmin: isAdminEmail(user.email),
    config: undefined, // undefined = loading, null = doesn't exist yet
    users: {},
    r1: {},
    r2: {},
    route: null,
    resultsRound: 1,
    sortBy: 'fixed', // fixed | votes | voters
    r2SortBy: 'votes', // fixed | votes
    showAvatars: true,
    focusUid: null,
  };

  const ctx = {
    state,
    backend,
    update: scheduleUpdate,
    navigate,
  };

  backend.upsertUser(user).catch((e) => console.error('Could not save profile', e));

  const onError = (e) => {
    console.error(e);
    toast('Lost connection to the poll. Try reloading the page.', { error: true });
  };
  let seeding = false;
  const unsubs = [
    backend.watchConfig((cfg) => {
      state.config = cfg ? { ...defaultConfig(), ...cfg } : null;
      if (!cfg && state.isAdmin && !seeding) {
        seeding = true;
        backend.setConfig(defaultConfig()).catch(onError);
      }
      scheduleUpdate();
    }, onError),
    backend.watchCollection('users', (d) => ((state.users = d), scheduleUpdate()), onError),
    backend.watchCollection('round1Votes', (d) => ((state.r1 = d), scheduleUpdate()), onError),
    backend.watchCollection('round2Votes', (d) => ((state.r2 = d), scheduleUpdate()), onError),
  ];

  // ----- Shell -----
  const tabs = h('nav.tabs', { 'aria-label': 'Sections' });
  const main = h('main.view', { id: 'main', tabindex: '-1' });
  const shell = h('div.shell', header(), tabs, main);
  root.replaceChildren(shell);

  function header() {
    const menu = h(
      'div.user-menu__panel',
      { hidden: true },
      h('div.user-menu__who', h('strong', user.name), h('span', user.email), state.isAdmin && h('span.pill.pill--admin', 'Admin')),
      h('button.btn.btn--quiet.btn--block', { onclick: () => backend.signOut() }, 'Sign out')
    );
    const toggle = h(
      'button.user-menu__toggle',
      {
        'aria-label': `Account: ${user.name}`,
        'aria-expanded': 'false',
        onclick: (e) => {
          e.stopPropagation();
          menu.hidden = !menu.hidden;
          toggle.setAttribute('aria-expanded', String(!menu.hidden));
        },
      },
      avatar(user, { size: 36 })
    );
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !menu.contains(e.target)) {
        menu.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
    return h(
      'header.site-header',
      h('a.brand', { href: '#' }, h('img.brand__logo', { src: LOGO, alt: '' }), h('span.brand__title', APP_TITLE)),
      backend.headerBadge?.(h),
      h('div.user-menu', toggle, menu)
    );
  }

  const views = {};
  const viewFactories = {
    round1: createRound1View,
    round2: createRound2View,
    results: createResultsView,
    admin: createAdminView,
  };
  const getView = (name) => (views[name] ??= viewFactories[name](ctx));

  function availableRoutes() {
    const c = state.config;
    const r = ['round1', 'round2'];
    if (state.isAdmin || c?.round1ResultsRevealed || c?.round2ResultsRevealed) r.push('results');
    if (state.isAdmin) r.push('admin');
    return r;
  }

  function defaultRoute() {
    return state.config?.round2Open ? 'round2' : 'round1';
  }

  function routeFromHash() {
    const want = location.hash.replace('#', '');
    return availableRoutes().includes(want) ? want : defaultRoute();
  }

  function navigate(route) {
    if (location.hash !== `#${route}`) location.hash = route;
    else scheduleUpdate();
  }

  const onHash = () => scheduleUpdate();
  window.addEventListener('hashchange', onHash);

  function scheduleUpdate() {
    if (queued) return;
    queued = true;
    // Batch snapshot bursts into one render. (Not rAF: it pauses while the page is hidden.)
    setTimeout(() => {
      queued = false;
      render();
    }, 0);
  }

  const LABELS = { round1: 'Round 1', round2: 'Round 2', results: 'Results', admin: 'Admin' };

  function render() {
    if (state.config === undefined) {
      main.replaceChildren(h('p.loading', 'Loading…'));
      return;
    }
    if (state.config === null) {
      main.replaceChildren(h('div.empty-state', h('h2', 'Almost ready'), h('p', 'The poll hasn’t been set up yet. An admin needs to sign in first.')));
      return;
    }

    const routes = availableRoutes();
    // First load with no hash: land on the active round.
    const route = location.hash ? routeFromHash() : state.route ?? defaultRoute();
    if (location.hash && location.hash !== `#${route}`) history.replaceState(null, '', `#${route}`);

    tabs.replaceChildren(
      ...routes.map((r) =>
        h('a.tab', { href: `#${r}`, 'aria-current': r === route ? 'page' : null, class: r === 'admin' ? 'tab--admin' : null }, LABELS[r])
      )
    );

    const view = getView(route);
    if (state.route !== route || main.firstChild !== view.el) {
      main.replaceChildren(view.el);
      document.body.dataset.route = route;
      if (state.route) window.scrollTo(0, 0);
      state.route = route;
    }
    view.update();
  }

  render();

  return () => {
    unsubs.forEach((u) => u?.());
    window.removeEventListener('hashchange', onHash);
    Object.values(views).forEach((v) => v.destroy?.());
  };
}
