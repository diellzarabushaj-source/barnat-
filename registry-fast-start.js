(() => {
  'use strict';

  const MAX_BLOCKING_MS = 2200;
  const loader = document.getElementById('pageLoader');
  const badge = document.getElementById('countBadge');
  const tbody = document.getElementById('tbody');
  let released = false;
  let observer = null;

  function loadingText() {
    return `${tbody?.textContent || ''} ${badge?.textContent || ''}`.toLowerCase();
  }

  function registryHasRendered() {
    if (!tbody) return false;
    const rows = tbody.querySelectorAll('tr');
    if (!rows.length) return false;
    const text = loadingText();
    return !text.includes('duke i ngarkuar') && !text.includes('po përgatitet në sfond');
  }

  function releaseLoader(reason = 'background') {
    if (released) return;
    released = true;
    document.documentElement.dataset.medindexRegistryStartup = reason;

    if (loader) {
      loader.classList.add('is-hidden');
      loader.setAttribute('aria-hidden', 'true');
      window.setTimeout(() => loader.remove(), 180);
    }

    if (!registryHasRendered()) {
      if (badge && /duke i ngarkuar/i.test(badge.textContent || '')) {
        badge.textContent = 'Po ngarkohet në sfond…';
        badge.title = 'Faqja është hapur. Regjistri po përgatitet në sfond.';
      }
      if (tbody && /duke i ngarkuar/i.test(tbody.textContent || '')) {
        tbody.innerHTML = '<tr><td colspan="30" class="empty-state">Regjistri po përgatitet në sfond. Faqja nuk është e bllokuar.</td></tr>';
      }
    }

    observer?.disconnect();
  }

  const timer = window.setTimeout(() => releaseLoader('background'), MAX_BLOCKING_MS);

  observer = new MutationObserver(() => {
    if (!registryHasRendered()) return;
    window.clearTimeout(timer);
    releaseLoader('ready');
  });

  if (tbody) observer.observe(tbody, { childList:true, subtree:true, characterData:true });

  window.addEventListener('medindex:registry-ready', () => {
    window.clearTimeout(timer);
    releaseLoader('ready');
  }, { once:true });

  window.addEventListener('error', event => {
    if (!/app-runtime|registry|barnave/i.test(String(event?.message || event?.filename || ''))) return;
    window.clearTimeout(timer);
    releaseLoader('runtime-error');
  }, { once:true });
})();
