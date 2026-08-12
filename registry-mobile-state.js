(() => {
  'use strict';

  const VERSION = 'registry-mobile-state-v1';
  const MOBILE_QUERY = '(max-width: 767px)';
  const FAVORITES_KEY = 'medindex_mobile_favorites_v1';
  const RECENT_KEY = 'medindex_mobile_recent_v1';
  const MAX_RECENT = 8;
  if (!window.matchMedia?.(MOBILE_QUERY).matches) return;

  let registry = window.MedIndexMobileRegistry || null;
  let applyingUrl = false;
  let detailOpenedFromHistory = false;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const safeJson = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch { return fallback; }
  };
  const saveJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

  function ensureStyles() {
    if (document.getElementById('registryMobileStateStyles')) return;
    const style = document.createElement('style');
    style.id = 'registryMobileStateStyles';
    style.textContent = `
      @media(max-width:767px){
        .registry-mobile-row-actions{display:inline-flex;align-items:center;gap:7px;margin-left:8px;vertical-align:middle}
        .registry-mobile-favorite-row{width:38px;height:38px;border:1px solid #e4e7ec;border-radius:11px;background:#fff;color:#667085;font-size:18px;line-height:1}
        .registry-mobile-favorite-row[aria-pressed="true"]{border-color:#f0b323;background:#fffaeb;color:#b54708}
        .registry-mobile-server-detail-actions{display:flex;gap:9px;padding:0 18px 12px;background:#fff}
        .registry-mobile-detail-action{min-height:42px;padding:0 13px;border:1px solid #d0d5dd;border-radius:12px;background:#fff;color:#344054;font-size:13px;font-weight:700}
        .registry-mobile-detail-action[aria-pressed="true"]{border-color:#f0b323;background:#fffaeb;color:#b54708}
        .registry-mobile-server-sheet-eyebrow{display:block;margin-bottom:3px;color:#0f766e;font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
        .registry-mobile-server-detail-section{margin:0 0 16px;padding:14px;border:1px solid #eaecf0;border-radius:15px;background:#fff}
        .registry-mobile-server-detail-section h3{margin:0 0 10px;color:#344054;font-size:12px;font-weight:800;letter-spacing:.02em}
        .registry-mobile-recent{margin:0 0 10px;padding:10px 0 2px}
        .registry-mobile-recent[hidden]{display:none!important}
        .registry-mobile-recent-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
        .registry-mobile-recent-head strong{color:#344054;font-size:12px}
        .registry-mobile-recent-list{display:flex;gap:8px;overflow:auto;padding-bottom:4px;scrollbar-width:none}
        .registry-mobile-recent-list::-webkit-scrollbar{display:none}
        .registry-mobile-recent-item{flex:0 0 auto;max-width:190px;min-height:44px;padding:7px 10px;border:1px solid #e4e7ec;border-radius:12px;background:#fff;text-align:left;color:#344054}
        .registry-mobile-recent-item strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
        .registry-mobile-recent-item span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;color:#667085;font-size:10px}
      }
    `;
    document.head.appendChild(style);
  }

  function favorites() {
    const values = safeJson(FAVORITES_KEY, []);
    return new Set(Array.isArray(values) ? values.map(clean).filter(Boolean) : []);
  }

  function setFavorite(id, active) {
    const set = favorites();
    if (active) set.add(clean(id)); else set.delete(clean(id));
    saveJson(FAVORITES_KEY, [...set]);
    decorateRows();
    const button = document.querySelector('[data-mobile-detail-favorite]');
    if (button && button.dataset.mobileDetailFavorite === clean(id)) {
      button.setAttribute('aria-pressed', String(active));
      button.textContent = active ? '★ I preferuar' : '☆ Prefero';
    }
    window.dispatchEvent(new CustomEvent('medindex:mobile-favorites-changed', { detail:{ id:clean(id), active, total:set.size } }));
  }

  function recentItems() {
    const values = safeJson(RECENT_KEY, []);
    return Array.isArray(values) ? values.filter(item => item && clean(item.id)).slice(0, MAX_RECENT) : [];
  }

  function rememberRecent(row) {
    const id = clean(row?.id);
    if (!id) return;
    const current = recentItems().filter(item => clean(item.id) !== id);
    current.unshift({ id, name:clean(row.tradeName), substance:clean(row.activeSubstance), at:Date.now() });
    saveJson(RECENT_KEY, current.slice(0, MAX_RECENT));
    renderRecent();
  }

  function currentScroller() {
    return document.querySelector('.mi-main') || document.scrollingElement || document.documentElement;
  }

  function scrollPosition() {
    const scroller = currentScroller();
    return scroller === document.scrollingElement || scroller === document.documentElement
      ? window.scrollY
      : Number(scroller.scrollTop || 0);
  }

  function restoreScroll(value) {
    const top = Number(value);
    if (!Number.isFinite(top)) return;
    requestAnimationFrame(() => {
      const scroller = currentScroller();
      if (scroller === document.scrollingElement || scroller === document.documentElement) window.scrollTo({ top, behavior:'auto' });
      else scroller.scrollTo({ top, behavior:'auto' });
    });
  }

  function queryState() {
    const url = new URL(location.href);
    const int = (name, fallback) => {
      const value = Number(url.searchParams.get(name));
      return Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
    };
    return {
      q:clean(url.searchParams.get('q')),
      status:clean(url.searchParams.get('status')),
      formQuery:clean(url.searchParams.get('form')),
      atc:clean(url.searchParams.get('atc')).toUpperCase(),
      page:int('page', 1),
      pageSize:[25,50].includes(int('size',25)) ? int('size',25) : 25,
      sort:clean(url.searchParams.get('sort')) || 'registry',
      direction:url.searchParams.get('dir') === 'desc' ? 'desc' : 'asc',
      drug:clean(url.searchParams.get('drug')),
    };
  }

  function syncUrlFromRegistry(state) {
    if (applyingUrl || !state?.ready) return;
    const url = new URL(location.href);
    const set = (key, value, defaultValue = '') => {
      if (value && String(value) !== String(defaultValue)) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    };
    set('q', state.q);
    set('status', state.status);
    set('form', state.formQuery);
    set('atc', state.atc);
    set('page', state.page > 1 ? String(state.page) : '');
    set('size', state.pageSize === 50 ? '50' : '');
    set('sort', state.sort !== 'registry' ? state.sort : '');
    set('dir', state.direction === 'desc' ? 'desc' : '');
    history.replaceState({ ...(history.state || {}), medindexRegistry:true }, '', url);
  }

  function pushDetailUrl(id) {
    const url = new URL(location.href);
    if (url.searchParams.get('drug') === id) return;
    history.replaceState({ ...(history.state || {}), medindexRegistry:true, scrollTop:scrollPosition() }, '', location.href);
    url.searchParams.set('drug', id);
    history.pushState({ medindexRegistry:true, detail:true, scrollTop:scrollPosition() }, '', url);
  }

  function removeDetailUrl({ replace = false } = {}) {
    const url = new URL(location.href);
    if (!url.searchParams.has('drug')) return;
    url.searchParams.delete('drug');
    const method = replace ? 'replaceState' : 'pushState';
    history[method]({ ...(history.state || {}), medindexRegistry:true, detail:false }, '', url);
  }

  async function shareRow(row) {
    const title = clean(row.tradeName) || 'MedIndex';
    const substance = clean(row.activeSubstance);
    const url = location.href;
    const text = [title, substance].filter(Boolean).join(' — ');
    try {
      if (navigator.share) return await navigator.share({ title, text, url });
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        window.dispatchEvent(new CustomEvent('medindex:toast', { detail:{ message:'Linku u kopjua.' } }));
      }
    } catch (error) {
      if (error?.name !== 'AbortError') console.warn('Share failed:', error);
    }
  }

  function renderDetailActions(detail) {
    const actions = detail?.actions || document.querySelector('[data-mobile-detail-actions]');
    const row = detail?.row;
    const id = clean(detail?.id || row?.id);
    if (!actions || !id || !row) return;
    const active = favorites().has(id);
    actions.innerHTML = `
      <button type="button" class="registry-mobile-detail-action" data-mobile-detail-favorite="${id}" aria-pressed="${active}">${active ? '★ I preferuar' : '☆ Prefero'}</button>
      <button type="button" class="registry-mobile-detail-action" data-mobile-detail-share>Ndaje</button>`;
    actions.querySelector('[data-mobile-detail-favorite]')?.addEventListener('click', buttonEvent => {
      const button = buttonEvent.currentTarget;
      setFavorite(id, button.getAttribute('aria-pressed') !== 'true');
    });
    actions.querySelector('[data-mobile-detail-share]')?.addEventListener('click', () => void shareRow(row));
  }

  function decorateRows() {
    const set = favorites();
    document.querySelectorAll('[data-mobile-server-row]').forEach(row => {
      const id = clean(row.dataset.mobileServerRow);
      const actions = row.querySelector('.registry-mobile-row-actions');
      if (!id || !actions) return;
      let button = actions.querySelector('[data-mobile-row-favorite]');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'registry-mobile-favorite-row';
        button.dataset.mobileRowFavorite = id;
        button.setAttribute('aria-label', 'Shto te të preferuarat');
        button.addEventListener('click', event => {
          event.stopPropagation();
          const active = button.getAttribute('aria-pressed') !== 'true';
          setFavorite(id, active);
        });
        actions.prepend(button);
      }
      const active = set.has(id);
      button.setAttribute('aria-pressed', String(active));
      button.textContent = active ? '★' : '☆';
      button.setAttribute('aria-label', active ? 'Hiq nga të preferuarat' : 'Shto te të preferuarat');
    });
  }

  function ensureRecent() {
    let section = document.getElementById('registryMobileRecent');
    if (section) return section;
    const registryContent = document.getElementById('registryContent');
    if (!registryContent?.parentElement) return null;
    section = document.createElement('section');
    section.id = 'registryMobileRecent';
    section.className = 'registry-mobile-recent';
    section.hidden = true;
    section.setAttribute('aria-label', 'Barnat e hapura së fundi');
    section.innerHTML = '<div class="registry-mobile-recent-head"><strong>Të fundit</strong></div><div class="registry-mobile-recent-list" data-mobile-recent-list></div>';
    registryContent.parentElement.insertBefore(section, registryContent);
    return section;
  }

  function renderRecent() {
    const section = ensureRecent();
    if (!section || !registry) return;
    const items = recentItems().slice(0, 4);
    const list = section.querySelector('[data-mobile-recent-list]');
    section.hidden = !items.length;
    if (!list) return;
    list.innerHTML = items.map(item => `<button type="button" class="registry-mobile-recent-item" data-mobile-recent-id="${clean(item.id)}"><strong>${clean(item.name) || 'Bar'}</strong><span>${clean(item.substance)}</span></button>`).join('');
    list.querySelectorAll('[data-mobile-recent-id]').forEach(button => button.addEventListener('click', () => {
      const id = clean(button.dataset.mobileRecentId);
      if (id) void registry.openDetail(id, button, { source:'recent' });
    }));
  }

  function applyUrlState({ openDrug = true } = {}) {
    if (!registry) return;
    const values = queryState();
    applyingUrl = true;
    registry.setFilters(values, { reason:'url-state', reload:true, scroll:false });
    applyingUrl = false;
    if (openDrug && values.drug) {
      detailOpenedFromHistory = true;
      const openWhenReady = () => void registry.openDetail(values.drug, null, { source:'url' });
      const current = registry.getState();
      if (current.ready) openWhenReady();
      else window.addEventListener('medindex:mobile-registry-ready', openWhenReady, { once:true });
    }
  }

  function attach() {
    registry = window.MedIndexMobileRegistry || registry;
    if (!registry) return;
    ensureStyles();
    document.documentElement.dataset.registryMobileState = VERSION;
    decorateRows();
    renderRecent();
    applyUrlState();
  }

  window.addEventListener('medindex:mobile-registry-api-ready', attach);
  window.addEventListener('medindex:mobile-registry-rows-rendered', decorateRows);
  window.addEventListener('medindex:mobile-registry-state', event => syncUrlFromRegistry(event.detail));
  window.addEventListener('medindex:mobile-detail-opened', event => {
    const detail = event.detail || {};
    rememberRecent(detail.row || {});
    renderDetailActions(detail);
    if (!detailOpenedFromHistory && detail.id) pushDetailUrl(clean(detail.id));
    detailOpenedFromHistory = false;
  });
  window.addEventListener('medindex:mobile-detail-closed', event => {
    if (event.detail?.source === 'popstate') return;
    const url = new URL(location.href);
    if (url.searchParams.has('drug')) history.back();
  });

  window.addEventListener('popstate', event => {
    if (!registry) return;
    const values = queryState();
    if (values.drug) {
      detailOpenedFromHistory = true;
      void registry.openDetail(values.drug, null, { source:'popstate' });
    } else {
      registry.closeDetail({ source:'popstate' });
      registry.setFilters(values, { reason:'popstate', reload:true, scroll:false });
      restoreScroll(event.state?.scrollTop);
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once:true });
  else attach();
})();
