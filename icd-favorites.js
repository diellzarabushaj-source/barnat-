(function bootstrapIcdFavorites(root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root) return;

  root.MedIndexIcdFavorites = api;
  const start = () => api.init(root);
  if (root.document?.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})(typeof window !== 'undefined' ? window : null, function createIcdFavorites() {
  'use strict';

  const VERSION = 'icd-favorites-v1';
  const STORAGE_KEY = 'medindex_icd_favorites_v1';
  const MAX_ITEMS = 24;
  const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
  const VALID_LEVELS = new Set(['category', 'subcategory']);
  const CODE_PATTERN = /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/;
  let initialized = false;

  const clean = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));
  const clampText = (value, max) => clean(value).slice(0, max);
  const normalizeCode = value => clean(value).toUpperCase().replace(/\s+/g, '');

  function normalizeItem(value, now = Date.now()) {
    const code = normalizeCode(value?.code);
    const level = clean(value?.level).toLowerCase();
    if (!CODE_PATTERN.test(code) || !VALID_LEVELS.has(level)) return null;

    let savedAt = Number(value?.savedAt || now);
    if (!Number.isFinite(savedAt) || savedAt <= 0 || savedAt > now + 86400000) savedAt = now;
    const titleSq = clampText(value?.titleSq ?? value?.albanianDraft, 500);
    const titleEn = clampText(value?.titleEn ?? value?.englishTitle, 500);
    const displayTitle = clampText(value?.displayTitle || titleSq || titleEn || code, 700);

    return {
      code,
      level,
      titleSq,
      titleEn,
      displayTitle,
      translationStatus:clampText(value?.translationStatus, 40),
      savedAt,
    };
  }

  function parsePayload(raw, now = Date.now()) {
    let parsed = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); }
      catch { return []; }
    }
    const source = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
    const normalized = source
      .map(item => normalizeItem(item, now))
      .filter(Boolean)
      .filter(item => now - item.savedAt <= MAX_AGE_MS)
      .sort((left, right) => right.savedAt - left.savedAt || left.code.localeCompare(right.code, 'en'));

    const seen = new Set();
    const items = [];
    for (const item of normalized) {
      if (seen.has(item.code)) continue;
      seen.add(item.code);
      items.push(item);
      if (items.length >= MAX_ITEMS) break;
    }
    return items;
  }

  function serializePayload(items, now = Date.now()) {
    return JSON.stringify({ version:1, updatedAt:now, items:parsePayload(items, now) });
  }

  function contains(items, code) {
    const key = normalizeCode(code);
    return (items || []).some(item => normalizeCode(item?.code) === key);
  }

  function removeItem(items, code, now = Date.now()) {
    const key = normalizeCode(code);
    return parsePayload(items, now).filter(item => item.code !== key);
  }

  function toggleItem(items, value, now = Date.now()) {
    const current = parsePayload(items, now);
    const item = normalizeItem({ ...value, savedAt:now }, now);
    if (!item) return { items:current, added:false, removed:false, item:null };
    if (contains(current, item.code)) {
      return { items:removeItem(current, item.code, now), added:false, removed:true, item };
    }
    return {
      items:parsePayload([item, ...current], now),
      added:true,
      removed:false,
      item,
    };
  }

  function init(root) {
    if (initialized || !root?.document?.getElementById('icdTree')) return false;
    initialized = true;

    const document = root.document;
    const els = {
      toggle:document.getElementById('icdFavoritesToggle'),
      count:document.getElementById('icdFavoritesCount'),
      panel:document.getElementById('icdFavoritesPanel'),
      list:document.getElementById('icdFavoritesList'),
      empty:document.getElementById('icdFavoritesEmpty'),
      clear:document.getElementById('icdFavoritesClear'),
      status:document.getElementById('icdFavoritesStatus'),
    };
    if (Object.values(els).some(value => !value)) return false;

    let items = [];
    let detailObserver = null;
    let detailUpdateFrame = 0;

    function announce(message) {
      els.status.textContent = clean(message);
      const detailStatus = document.getElementById('detailActionStatus');
      if (detailStatus && !document.getElementById('detailOverlay')?.hidden) detailStatus.textContent = clean(message);
    }

    function readStorage() {
      try { return parsePayload(root.localStorage.getItem(STORAGE_KEY)); }
      catch { return []; }
    }

    function writeStorage(nextItems, message = '') {
      items = parsePayload(nextItems);
      try { root.localStorage.setItem(STORAGE_KEY, serializePayload(items)); }
      catch {
        announce('Favoritet nuk u ruajtën në këtë browser.');
        return false;
      }
      render();
      updateDetailButton();
      if (message) announce(message);
      root.dispatchEvent(new root.CustomEvent('medindex:icd-favorites-changed', {
        detail:{ count:items.length, codes:items.map(item => item.code) },
      }));
      return true;
    }

    function levelLabel(level) {
      return level === 'subcategory' ? 'Nënkategori' : 'Kategori';
    }

    function translationLabel(status) {
      return ({
        verified:'Term i verifikuar',
        standardized:'Term i standardizuar',
        machine:'Draft automatik',
        missing:'Vetëm anglisht',
      })[clean(status)] || 'Status terminologjik i papërcaktuar';
    }

    function itemMarkup(item) {
      const title = item.displayTitle || item.titleSq || item.titleEn || item.code;
      const alternate = item.titleEn && item.titleEn.toLowerCase() !== title.toLowerCase() ? item.titleEn : '';
      return `<article class="icd-favorite-item" role="listitem" data-favorite-code="${esc(item.code)}">
        <button class="icd-favorite-open" type="button" data-favorite-open="${esc(item.code)}">
          <span class="icd-favorite-code">${esc(item.code)}</span>
          <span class="icd-favorite-copy">
            <strong>${esc(title)}</strong>
            ${alternate ? `<small>${esc(alternate)}</small>` : ''}
            <span>${esc(levelLabel(item.level))} · ${esc(translationLabel(item.translationStatus))}</span>
          </span>
        </button>
        <button class="icd-favorite-remove" type="button" data-favorite-remove="${esc(item.code)}" aria-label="Hiqe ${esc(item.code)} nga të preferuarat">×</button>
      </article>`;
    }

    function render() {
      els.count.textContent = String(items.length);
      els.toggle.setAttribute('aria-label', `Të preferuarat ICD, ${items.length} kode`);
      els.list.innerHTML = items.map(itemMarkup).join('');
      els.empty.hidden = items.length > 0;
      els.clear.hidden = items.length === 0;
      document.documentElement.dataset.miIcdFavoriteCount = String(items.length);
    }

    function setPanelOpen(open) {
      const next = Boolean(open);
      els.panel.hidden = !next;
      els.toggle.setAttribute('aria-expanded', String(next));
      els.toggle.classList.toggle('is-active', next);
      if (next) {
        const target = els.list.querySelector('button') || els.clear;
        target?.focus({ preventScroll:true });
      }
    }

    function currentDetailCode() {
      const kicker = clean(document.getElementById('detailKicker')?.textContent);
      const separator = kicker.lastIndexOf('·');
      return normalizeCode(separator >= 0 ? kicker.slice(separator + 1) : '');
    }

    function currentDetailLevel() {
      const label = clean(document.getElementById('detailLevelBadge')?.textContent).toLowerCase();
      if (label === 'kategori') return 'category';
      if (label === 'nënkategori' || label === 'nenkategori') return 'subcategory';
      return '';
    }

    function ensureDetailButton() {
      let button = document.getElementById('icdFavoriteCode');
      if (button) return button;
      const actions = document.querySelector('.icd-detail-actions');
      if (!actions) return null;
      button = document.createElement('button');
      button.className = 'icd-favorite-action';
      button.id = 'icdFavoriteCode';
      button.type = 'button';
      button.hidden = true;
      const useButton = document.getElementById('icdUseDiagnosis');
      actions.insertBefore(button, useButton || null);
      button.addEventListener('click', toggleCurrentDetail);
      return button;
    }

    function updateDetailButton() {
      const button = ensureDetailButton();
      if (!button) return;
      const overlay = document.getElementById('detailOverlay');
      const code = currentDetailCode();
      const level = currentDetailLevel();
      const supported = !overlay?.hidden && CODE_PATTERN.test(code) && VALID_LEVELS.has(level);
      button.hidden = !supported;
      if (!supported) {
        button.dataset.code = '';
        button.setAttribute('aria-pressed', 'false');
        return;
      }
      const saved = contains(items, code);
      button.dataset.code = code;
      button.setAttribute('aria-pressed', String(saved));
      button.textContent = saved ? '★ Hiqe nga të preferuarat' : '☆ Shto te të preferuarat';
    }

    function scheduleDetailUpdate() {
      if (detailUpdateFrame) return;
      detailUpdateFrame = root.requestAnimationFrame(() => {
        detailUpdateFrame = 0;
        updateDetailButton();
      });
    }

    async function resolveNode(code) {
      const fetcher = root.MedIndexNativeFetch || root.fetch.bind(root);
      const response = await fetcher(`/api/icd?view=resolve&code=${encodeURIComponent(code)}`, {
        credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' },
      });
      if (!response.ok) throw new Error(`ICD API ${response.status}`);
      const payload = await response.json();
      const node = payload?.ok ? payload?.data?.node : null;
      const normalized = normalizeItem(node);
      if (!normalized) throw new Error('Vetëm kategoritë dhe nënkategoritë mund të ruhen.');
      return normalized;
    }

    async function toggleCurrentDetail() {
      const button = ensureDetailButton();
      const code = normalizeCode(button?.dataset.code || currentDetailCode());
      if (!CODE_PATTERN.test(code)) return;

      if (contains(items, code)) {
        writeStorage(removeItem(items, code), `${code} u hoq nga të preferuarat.`);
        return;
      }

      button.disabled = true;
      button.textContent = 'Po ruhet…';
      try {
        const item = await resolveNode(code);
        const result = toggleItem(items, item);
        writeStorage(result.items, `${code} u shtua te të preferuarat.`);
      } catch (error) {
        announce(clean(error?.message || 'Kodi nuk u ruajt.'));
      } finally {
        button.disabled = false;
        updateDetailButton();
      }
    }

    async function openFavorite(code) {
      const key = normalizeCode(code);
      if (!contains(items, key)) return;
      setPanelOpen(false);
      try {
        if (root.MedIndexIcdTable?.revealCode) {
          await root.MedIndexIcdTable.revealCode(key, { history:true, focus:true });
          root.dispatchEvent(new root.CustomEvent('medindex:icd-open-detail', { detail:{ code:key } }));
        } else {
          root.location.assign(`/icd.html?code=${encodeURIComponent(key)}`);
        }
      } catch (error) {
        announce(clean(error?.message || 'Kodi nuk u hap.'));
      }
    }

    function bind() {
      els.toggle.addEventListener('click', () => setPanelOpen(els.panel.hidden));
      els.clear.addEventListener('click', () => {
        if (!items.length) return;
        if (!root.confirm('Të hiqen të gjitha kodet ICD nga të preferuarat?')) return;
        writeStorage([], 'Të preferuarat u pastruan.');
      });
      els.panel.addEventListener('click', event => {
        const openButton = event.target.closest('[data-favorite-open]');
        if (openButton) { openFavorite(openButton.dataset.favoriteOpen); return; }
        const removeButton = event.target.closest('[data-favorite-remove]');
        if (removeButton) writeStorage(removeItem(items, removeButton.dataset.favoriteRemove), `${removeButton.dataset.favoriteRemove} u hoq nga të preferuarat.`);
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !els.panel.hidden) {
          event.preventDefault();
          setPanelOpen(false);
          els.toggle.focus({ preventScroll:true });
        }
      });
      root.addEventListener('storage', event => {
        if (event.key !== STORAGE_KEY) return;
        items = parsePayload(event.newValue);
        render();
        updateDetailButton();
      });
    }

    function observeDetail() {
      const overlay = document.getElementById('detailOverlay');
      if (!overlay || detailObserver) return;
      detailObserver = new root.MutationObserver(scheduleDetailUpdate);
      detailObserver.observe(overlay, {
        attributes:true,
        attributeFilter:['hidden', 'aria-hidden'],
        childList:true,
        subtree:true,
        characterData:true,
      });
      scheduleDetailUpdate();
    }

    items = readStorage();
    bind();
    render();
    observeDetail();
    root.addEventListener('medindex:icd-detail-ready', observeDetail, { once:true });
    document.documentElement.dataset.miIcdFavorites = VERSION;
    root.dispatchEvent(new root.CustomEvent('medindex:icd-favorites-ready', {
      detail:{ version:VERSION, count:items.length, limit:MAX_ITEMS },
    }));
    return true;
  }

  return Object.freeze({
    VERSION,
    STORAGE_KEY,
    MAX_ITEMS,
    MAX_AGE_MS,
    normalizeCode,
    normalizeItem,
    parsePayload,
    serializePayload,
    contains,
    removeItem,
    toggleItem,
    init,
  });
});
