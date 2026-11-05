import { deployment, sitePath } from './site-config.js';

const pages = {
  '/': { name: 'home', order: 0 },
  '/games': { name: 'games', order: 1 },
  '/indie': { name: 'indie', order: 2 },
  '/minigames': { name: 'minigames', order: 3 },
  '/deals': { name: 'deals', order: 4 },
  '/account': { name: 'account', order: 5 },
};

export function pageFor(pathname) {
  if (deployment.basePath) {
    if (!pathname.startsWith(deployment.basePath + '/')) return null;
    pathname = pathname.slice(deployment.basePath.length);
  }
  const path =
    pathname === '/index.html' ? '/' : pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  return pages[path] ? { ...pages[path], path } : null;
}

export function slideDirection(from, to) {
  return to.order < from.order ? -1 : 1;
}

export function setupNavigation({ beforeChange, afterChange }) {
  const cache = new Map();
  let current = pageFor(location.pathname);
  let revision = 0;
  let pending = null;
  let finishTransition = null;

  function updateMenu(path) {
    document.querySelectorAll('.nav-link, #steam-nav').forEach((link) => {
      const active = pageFor(new URL(link.href).pathname)?.path === path;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  async function navigate(url, push) {
    const destination = pageFor(url.pathname);
    if (!destination) return;
    const token = ++revision;
    pending?.abort();
    finishTransition?.();
    pending = new AbortController();
    const previous = document.querySelector('main');
    previous.setAttribute('aria-busy', 'true');

    try {
      let html = cache.get(destination.path);
      if (!html) {
        const response = await fetch(sitePath(destination.path), { signal: pending.signal });
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
          throw new Error('Page unavailable');
        }
        html = await response.text();
        cache.set(destination.path, html);
      }
      if (token !== revision) return;
      const nextDocument = new DOMParser().parseFromString(html, 'text/html');
      const next = nextDocument.querySelector('main');
      if (!next || nextDocument.body.dataset.page !== destination.name) {
        throw new Error('Invalid page');
      }

      const direction = slideDirection(current, destination);
      previous.removeAttribute('aria-busy');
      const outgoing = previous.cloneNode(true);
      outgoing.removeAttribute('id');
      outgoing.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
      outgoing.inert = true;
      outgoing.setAttribute('aria-hidden', 'true');
      beforeChange();

      const wrapper = document.createElement('div');
      wrapper.className = 'page-slide';
      previous.replaceWith(wrapper);
      wrapper.append(outgoing, next);
      if (push) history.pushState(null, '', url.pathname + url.search + url.hash);
      document.body.dataset.page = destination.name;
      document.title = nextDocument.title;
      current = destination;
      updateMenu(destination.path);
      window.scrollTo({ top: 0, behavior: 'instant' });
      afterChange();

      let finished = false;
      const animations = [];
      const finish = () => {
        if (finished) return;
        finished = true;
        animations.forEach((animation) => animation.cancel());
        next.inert = false;
        if (wrapper.isConnected) wrapper.replaceWith(next);
        if (finishTransition === finish) finishTransition = null;
      };
      finishTransition = finish;

      if (!matchMedia('(prefers-reduced-motion: reduce)').matches && next.animate) {
        next.inert = true;
        const timing = { duration: 500, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', fill: 'both' };
        animations.push(
          outgoing.animate(
            [{ transform: 'translateX(0)' }, { transform: `translateX(${-direction * 100}%)` }],
            timing,
          ),
          next.animate(
            [{ transform: `translateX(${direction * 100}%)` }, { transform: 'translateX(0)' }],
            timing,
          ),
        );
        await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
      }
      finish();
      if (token === revision) {
        next.tabIndex = -1;
        next.focus({ preventScroll: true });
      }
    } catch (error) {
      if (token === revision && error.name !== 'AbortError') location.assign(url.href);
    } finally {
      previous.removeAttribute('aria-busy');
    }
  }

  document.addEventListener('click', (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = event.target.closest('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || !pageFor(url.pathname)) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
    event.preventDefault();
    if (url.pathname === location.pathname && url.search === location.search) {
      revision++;
      pending?.abort();
      finishTransition?.();
      document.querySelector('main').removeAttribute('aria-busy');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    navigate(url, true);
  });

  window.addEventListener('popstate', () => navigate(new URL(location.href), false));
}
