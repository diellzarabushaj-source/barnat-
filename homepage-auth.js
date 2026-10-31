(() => {
  'use strict';
  const dialog = document.querySelector('[data-home-auth]');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const content = dialog.querySelector('[data-auth-content]');
  const tabs = [...dialog.querySelectorAll('[data-auth-view]')];
  const assets = new Map();
  let view, generation = 0, instance, request, trigger, previousOverflow;
  let currentSearch = '';
  let historyBackPending = false, pendingOpen;

  function script(src) {
    if (!assets.has(src)) assets.set(src, new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = src;
      element.async = true;
      element.onload = resolve;
      element.onerror = () => { assets.delete(src); element.remove(); reject(new Error('Ngarkimi dështoi.')); };
      document.head.append(element);
    }));
    return assets.get(src);
  }

  function authUrl(value) {
    const url = new URL(value, location.href);
    if (url.origin !== location.origin) return null;
    return /^\/(login|regjistrimi)\.html$/.test(url.pathname) ? url : null;
  }

  function navigate(value, method = 'replace') {
    const url = new URL(value, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
    if (authUrl(url)) {
      mergeSearch(url.search);
      void show(url.pathname === '/login.html' ? 'login' : 'registration');
    } else location[method](url.href);
  }

  function mergeSearch(search) {
    const parameters = new URLSearchParams(currentSearch);
    new URLSearchParams(search).forEach((value, key) => parameters.set(key, value));
    currentSearch = parameters.size ? '?' + parameters.toString() : '';
  }

  async function show(next) {
    view = next;
    const token = ++generation;
    instance?.destroy(); instance = null;
    request?.abort(); request = new AbortController();
    tabs.forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.authView === next)));
    dialog.setAttribute('aria-label', next === 'login' ? 'Hyr në DRx' : 'Krijo llogari në DRx');
    content.setAttribute('aria-busy', 'true');
    const loading = document.createElement('p');
    loading.className = 'home-auth__loading';
    loading.setAttribute('role', 'status');
    loading.textContent = 'Po hapet…';
    content.replaceChildren(loading);
    const page = next === 'login' ? '/login.html' : '/regjistrimi.html';
    try {
      const [response] = await Promise.all([
        fetch(page, { credentials:'omit', signal:request.signal }),
        script(next === 'login' ? '/login.js?v=home-dialog-20261031b' : '/regjistrimi.js?v=home-dialog-20261031b'),
      ]);
      if (!response.ok || new URL(response.url).pathname !== page) throw new Error('Ngarkimi dështoi.');
      const markup = await response.text();
      if (token !== generation || !dialog.open) return;
      const documentView = new DOMParser().parseFromString(markup, 'text/html');
      const card = documentView.querySelector(next === 'login' ? '.auth-card' : '.register-card');
      if (!card) throw new Error('Formulari nuk u gjet.');
      card.querySelectorAll('script,style,iframe,.register-card__brand').forEach(node => node.remove());
      card.querySelectorAll('*').forEach(node => [...node.attributes].forEach(attribute => {
        if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
      }));
      content.replaceChildren(document.importNode(card, true));
      instance = window.DRxAuthViews[next](content, {
        search:currentSearch, navigate, reload:() => void show(view),
      });
      // Email remains usable if the optional Google SDK cannot load.
      void script('https://accounts.google.com/gsi/client').catch(() => {});
      content.querySelector(next === 'login' ? '#loginEmail' : '#signupEmail')?.focus({ preventScroll:true });
    } catch (error) {
      if (token !== generation || !dialog.open || error.name === 'AbortError') return;
      const note = document.createElement('p');
      note.setAttribute('role', 'alert');
      note.textContent = 'Formulari nuk u hap. Mund të vazhdosh në faqen e hyrjes.';
      const fallback = document.createElement('a');
      fallback.href = page + currentSearch;
      fallback.dataset.authFallback = 'true';
      fallback.textContent = next === 'login' ? 'Hap faqen e hyrjes →' : 'Hap faqen e regjistrimit →';
      content.replaceChildren(note, fallback);
    } finally {
      if (token === generation) content.removeAttribute('aria-busy');
    }
  }

  function cleanup() {
    ++generation;
    request?.abort();
    instance?.destroy(); instance = null;
    content.replaceChildren();
    document.body.style.overflow = previousOverflow ?? '';
    trigger?.focus({ preventScroll:true });
  }

  function open(next, search, source, record = true) {
    if (historyBackPending) { pendingOpen = { next, search, source }; return; }
    currentSearch = search || '';
    if (!dialog.open) {
      trigger = source || document.activeElement;
      previousOverflow = document.body.style.overflow;
      dialog.showModal();
      document.body.style.overflow = 'hidden';
      if (record) history.pushState({ ...history.state, homeAuth:true }, '', location.href);
    }
    void show(next);
  }

  function close() {
    if (!dialog.open) return;
    dialog.close();
    cleanup();
    if (history.state?.homeAuth) { historyBackPending = true; history.back(); }
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.querySelector('[data-auth-close]').addEventListener('click', close);
  let backdropPointer = false;
  dialog.addEventListener('pointerdown', event => { backdropPointer = event.target === dialog; });
  dialog.addEventListener('click', event => {
    if (backdropPointer && event.target === dialog) close();
    backdropPointer = false;
  });
  tabs.forEach(tab => tab.addEventListener('click', () => void show(tab.dataset.authView)));
  window.addEventListener('popstate', () => {
    historyBackPending = false;
    if (pendingOpen) {
      const pending = pendingOpen; pendingOpen = null;
      open(pending.next, pending.search, pending.source);
      return;
    }
    if (history.state?.homeAuth && !dialog.open) open(view || 'login', currentSearch, trigger, false);
    else if (!history.state?.homeAuth && dialog.open) { dialog.close(); cleanup(); }
  });
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[href]');
    if (!anchor || anchor.dataset.authFallback || event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target || anchor.hasAttribute('download')) return;
    const url = authUrl(anchor.href);
    if (!url) return;
    event.preventDefault();
    if (dialog.open) { mergeSearch(url.search); void show(url.pathname === '/login.html' ? 'login' : 'registration'); }
    else open(url.pathname === '/login.html' ? 'login' : 'registration', url.search, anchor);
  });
})();
