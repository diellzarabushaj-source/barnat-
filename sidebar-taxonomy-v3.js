(() => {
  'use strict';

  const CORE_SRC = '/sidebar-taxonomy-core-v3.js?v=sidebar-taxonomy-v5-polish2-lazy';
  const ANTIBIOTICS_HREF = '/antibiotiket.html';
  const HUB_OVERRIDE_ID = 'medicalhub-dod-ch05-sub07';
  const HUB_SOURCE_OVERRIDES = new Map([
    [HUB_OVERRIDE_ID, '/medical-hub-overrides/medicalhub-dod-ch05-sub07.json?v=20260916-2'],
    ['medicalhub-dod-ch05-sub08', '/medical-hub-overrides/medicalhub-dod-ch05-sub08.json?v=20260916-1'],
    ['medicalhub-dod-ch05-sub09', '/medical-hub-overrides/medicalhub-dod-ch05-sub09.json?v=20260916-1'],
    ['medicalhub-dod-ch05-sub10', '/medical-hub-overrides/medicalhub-dod-ch05-sub10.json?v=20260916-1'],
  ]);
  let observer = null;
  const hubOverridePromises = new Map();
  let hubRxObserver = null;

  function currentPath() {
    return location.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  }

  function isMedicalHub() {
    return document.documentElement?.dataset?.drxApp === 'medical-hub-v2';
  }

  function requestUrl(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      return raw ? new URL(raw, location.origin) : null;
    } catch {
      return null;
    }
  }

  function medicalHubOverrideRequest(input) {
    if (!isMedicalHub()) return null;
    const url = requestUrl(input);
    if (!url || url.origin !== location.origin || url.pathname !== '/api/medical-hub') return null;
    const id = url.searchParams.get('id') || '';
    const overrideUrl = HUB_SOURCE_OVERRIDES.get(id);
    return overrideUrl ? { id, overrideUrl } : null;
  }

  async function loadHubOverride(originalFetch, config) {
    if (!hubOverridePromises.has(config.id)) {
      const promise = originalFetch(config.overrideUrl, {
        credentials:'same-origin',
        cache:'no-store',
        headers:{ Accept:'application/json' },
      }).then(async response => {
        if (!response.ok) throw new Error(`Medical Hub override ${response.status}`);
        const payload = await response.json();
        if (!payload || payload._id !== config.id) throw new Error('Medical Hub override ID mismatch.');
        return payload;
      }).catch(error => {
        hubOverridePromises.delete(config.id);
        console.error('[Medical Hub source override]', error);
        return null;
      });
      hubOverridePromises.set(config.id, promise);
    }
    return hubOverridePromises.get(config.id);
  }

  function installMedicalHubSourceOverride() {
    if (!isMedicalHub() || window.__drxMedicalHubSourceOverrideInstalled) return;
    window.__drxMedicalHubSourceOverrideInstalled = true;
    const originalFetch = window.fetch.bind(window);

    window.fetch = async function drxMedicalHubFetch(input, init) {
      const overrideRequest = medicalHubOverrideRequest(input);
      const response = await originalFetch(input, init);
      if (!overrideRequest || !response.ok) return response;

      try {
        const payload = await response.clone().json();
        if (payload?.ok !== true || payload?.item?._id !== overrideRequest.id) return response;
        const override = await loadHubOverride(originalFetch, overrideRequest);
        if (!override) return response;

        const headers = new Headers(response.headers);
        headers.set('Content-Type', 'application/json; charset=utf-8');
        headers.delete('Content-Length');
        headers.delete('Content-Encoding');
        return new Response(JSON.stringify({
          ...payload,
          item:{ ...payload.item, ...override, _id:overrideRequest.id },
          source:'sanity-published+book-source-override',
        }), {
          status:response.status,
          statusText:response.statusText,
          headers,
        });
      } catch (error) {
        console.error('[Medical Hub source override response]', error);
        return response;
      }
    };
  }

  function decorateBrucellosisRx() {
    if (!isMedicalHub()) return;
    const rxBlocks = [...document.querySelectorAll('.ck-book-rx')];
    const rx = rxBlocks.find(block => /TRAJTIMI\s+I\s+BRUCELOZ/i.test(block.querySelector('.ck-book-rx-head>strong')?.textContent || ''));
    if (!rx) return;
    rx.classList.add('is-brucellosis-source');

    rx.querySelectorAll('.ck-book-rx-line').forEach(line => {
      if (line.dataset.sourceConnector === '1') return;
      const value = String(line.textContent || '').replace(/\s+/g, ' ').trim();
      const plus = value.match(/^PLUS\s+(.+)$/i);
      const neuro = value.match(/^PËR\s+NEUROBRUCELOZË\s*:\s*(.+)$/i);
      const match = plus || neuro;
      if (!match) return;

      line.dataset.sourceConnector = '1';
      line.classList.add('is-source-connector');
      if (neuro) line.classList.add('is-source-neuro');
      else line.classList.add('is-source-plus');
      line.textContent = '';

      const connector = document.createElement('span');
      connector.className = 'ck-book-rx-source-connector';
      connector.textContent = neuro ? 'PËR NEUROBRUCELOZË' : 'PLUS';
      const copy = document.createElement('span');
      copy.className = 'ck-book-rx-source-copy';
      copy.textContent = match[1];
      line.append(connector, copy);
    });
  }

  function observeMedicalHubRx() {
    if (!isMedicalHub() || hubRxObserver) return;
    const root = document.getElementById('learningDetail');
    if (!root) return;
    decorateBrucellosisRx();
    hubRxObserver = new MutationObserver(() => decorateBrucellosisRx());
    hubRxObserver.observe(root, { childList:true, subtree:true });
  }

  function antibioticLinkMarkup() {
    return '<span class="nav-icon" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.1 5.2a4 4 0 0 1 5.7 0l5 5a4 4 0 0 1-5.7 5.7l-5-5a4 4 0 0 1 0-5.7Z"/><path d="m9.8 12.6 5.6-5.6"/><path d="M5.5 18.5h5"/><path d="M8 16v5"/></svg></span><span>Antibiotikët</span>';
  }

  function ensureAntibioticsNav() {
    const nav = document.querySelector('.sidebar .nav-stack');
    if (!nav) return;

    let link = nav.querySelector(`a.nav-item[href="${ANTIBIOTICS_HREF}"]`);
    if (!link) {
      link = document.createElement('a');
      link.className = 'nav-item';
      link.href = ANTIBIOTICS_HREF;
      link.dataset.drxAntibioticsNav = '1';
      link.innerHTML = antibioticLinkMarkup();
    }

    const dose = nav.querySelector('a.nav-item[href="/dozologjia.html"]');
    if (dose && dose.nextElementSibling !== link) dose.after(link);
    else if (!link.isConnected) {
      const urgent = nav.querySelector('a.nav-item[href="/urgjencat.html"]');
      if (urgent) urgent.after(link);
      else nav.append(link);
    }

    const active = currentPath() === ANTIBIOTICS_HREF;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  function observeSidebar() {
    if (observer) return;
    const nav = document.querySelector('.sidebar .nav-stack');
    if (!nav) return;
    observer = new MutationObserver(() => ensureAntibioticsNav());
    observer.observe(nav, { childList:true, subtree:false });
  }

  function loadCore() {
    if (document.querySelector('script[data-drx-sidebar-core]')) return;
    const script = document.createElement('script');
    script.src = CORE_SRC;
    script.async = false;
    script.dataset.drxSidebarCore = '1';
    script.addEventListener('load', () => {
      ensureAntibioticsNav();
      observeSidebar();
      document.documentElement.dataset.drxAntibioticsNav = 'ready';
    }, { once:true });
    script.addEventListener('error', () => {
      ensureAntibioticsNav();
      observeSidebar();
      console.error('DRx sidebar core failed to load.');
    }, { once:true });
    document.head.appendChild(script);
  }

  // Kept here as the shared drawer contract used by the workspace audit.
  function initMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const trigger = document.getElementById('menuButton');
    const backdrop = document.getElementById('sidebarBackdrop');
    const main = document.querySelector('.main-shell');
    if (!sidebar || !trigger || !backdrop || !main) return;
    const desktop = window.matchMedia('(min-width: 1024px)');
    let opened = false;
    let returnFocus = null;
    let previousOverflow = '';
    let previousInert = false;
    trigger.setAttribute('aria-controls', sidebar.id);
    const focusable = () => [...sidebar.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]')]
      .filter(node => !node.disabled && node.tabIndex >= 0 && !node.closest('[inert]') && node.getClientRects().length);
    const close = () => {
      sidebar.classList.remove('is-open');
      sync();
    };
    const sync = () => {
      const next = !desktop.matches && sidebar.classList.contains('is-open');
      trigger.setAttribute('aria-expanded', String(next));
      backdrop.hidden = !next;
      sidebar.inert = !desktop.matches && !next;
      if (next === opened) return;
      opened = next;
      if (next) {
        returnFocus = document.activeElement;
        previousOverflow = document.body.style.overflow;
        previousInert = main.inert;
        main.inert = true;
        document.body.style.overflow = 'hidden';
        (focusable()[0] || sidebar).focus({ preventScroll:true });
      } else {
        main.inert = previousInert;
        document.body.style.overflow = previousOverflow;
        const target = desktop.matches ? [...main.querySelectorAll('a[href], button, input')].find(node => !node.disabled && node.getClientRects().length) : returnFocus;
        if (target?.isConnected && !target.closest('[inert]')) target.focus({ preventScroll:true });
      }
    };
    new MutationObserver(sync).observe(sidebar, { attributes:true, attributeFilter:['class'] });
    document.addEventListener('keydown', event => {
      if (!opened) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      } else if (event.key === 'Tab') {
        const items = focusable();
        const first = items[0];
        const last = items[items.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (!sidebar.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    }, true);
    sidebar.addEventListener('click', event => {
      if (opened && event.target.closest('a[href]') && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) close();
    });
    desktop.addEventListener('change', () => {
      if (desktop.matches) sidebar.classList.remove('is-open');
      sync();
    });
    window.addEventListener('pageshow', sync);
    sync();
  }

  function init() {
    installMedicalHubSourceOverride();
    observeMedicalHubRx();
    ensureAntibioticsNav();
    loadCore();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
