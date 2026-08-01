(() => {
  'use strict';

  const DATA_SRC = '/classification-data.js?v=atc-global-search-v1';
  const SHARED_SRC = '/atc-shared.js?v=atc-global-search-v1';
  const STYLE_SRC = '/atc-global-search.css?v=atc-global-search-v1';
  const ENDPOINT = '/api/drug-search';
  const MIN_QUERY = 2;
  const MAX_OPTIONS = 12;
  const DEBOUNCE_MS = 220;
  let input = null;
  let wrapper = null;
  let listbox = null;
  let status = null;
  let options = [];
  let activeIndex = -1;
  let timer = 0;
  let requestController = null;
  let requestSequence = 0;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalize = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    })[character]);
  }

  function loadScript(source, marker) {
    return new Promise((resolve, reject) => {
      const pathname = new URL(source, location.href).pathname;
      const existing = document.querySelector(`script[${marker}]`)
        || [...document.scripts].find(script => new URL(script.src || location.href, location.href).pathname === pathname);
      if (existing && ((pathname.includes('classification-data') && window.MEDINDEX_ATC_GROUPS) || (pathname.includes('atc-shared') && window.MedIndexATC))) {
        resolve(existing);
        return;
      }
      if (existing) {
        existing.addEventListener('load', () => resolve(existing), { once:true });
        existing.addEventListener('error', reject, { once:true });
        return;
      }
      const script = document.createElement('script');
      script.src = source;
      script.async = false;
      script.setAttribute(marker, '1');
      script.addEventListener('load', () => resolve(script), { once:true });
      script.addEventListener('error', reject, { once:true });
      document.head.appendChild(script);
    });
  }

  async function ensureAtcData() {
    if (!window.MEDINDEX_ATC_GROUPS || !window.MEDINDEX_ATC_SUBGROUPS) {
      await loadScript(DATA_SRC, 'data-mi-global-atc-data');
    }
    if (!window.MedIndexATC) await loadScript(SHARED_SRC, 'data-mi-global-atc-shared');
    if (!window.MedIndexATC) throw new Error('Klasifikimi ATC nuk u ngarkua.');
  }

  function ensureStylesheet() {
    if (document.querySelector('link[data-mi-atc-global-search-css],link[href*="atc-global-search.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_SRC;
    link.dataset.miAtcGlobalSearchCss = '1';
    const professional = document.querySelector('link[data-tailadmin-professional-css],link[href*="tailadmin-professional.css"]');
    if (professional?.parentNode) professional.parentNode.insertBefore(link, professional);
    else document.head.appendChild(link);
  }

  function categoryOptions(query) {
    const needle = normalize(query);
    if (!needle) return [];
    const output = [];

    Object.entries(window.MEDINDEX_ATC_SUBGROUPS || {}).forEach(([code, name]) => {
      const label = `${code} ${name}`;
      if (!normalize(label).includes(needle)) return;
      output.push({
        key:`category:${code}`,
        type:'category',
        title:`${code} — ${name}`,
        meta:'Kategori ATC',
        atc:code,
        href:window.MedIndexATC.registryUrl({ atc:code }),
        score:normalize(code) === needle || normalize(name) === needle ? 500 : 220,
      });
    });

    Object.entries(window.MEDINDEX_ATC_GROUPS || {}).forEach(([code, name]) => {
      const label = `${code} ${name}`;
      if (!normalize(label).includes(needle)) return;
      output.push({
        key:`group:${code}`,
        type:'group',
        title:`${code} — ${name}`,
        meta:'Grup kryesor ATC',
        atc:code,
        href:window.MedIndexATC.classificationUrl(code),
        score:normalize(code) === needle || normalize(name) === needle ? 480 : 180,
      });
    });

    return output;
  }

  function categoryFromAtc(value) {
    return window.MedIndexATC.resolveCategoryCode(value);
  }

  function drugOptions(results, query) {
    const needle = normalize(query);
    const products = [];
    const substanceGroups = new Map();

    (Array.isArray(results) ? results : []).forEach(result => {
      const tradeName = clean(result.tradeName);
      const substance = clean(result.substance);
      const strength = clean(result.strength);
      const form = clean(result.form);
      const atc = categoryFromAtc(result.atc);
      if (!tradeName && !substance) return;

      const productQuery = tradeName || substance;
      products.push({
        key:`product:${clean(result.key) || `${tradeName}|${strength}|${atc}`}`,
        type:'product',
        title:[tradeName, strength].filter(Boolean).join(' · '),
        meta:[substance, form, atc ? window.MedIndexATC.getCategoryLabel(atc) : ''].filter(Boolean).join(' · '),
        atc,
        href:window.MedIndexATC.registryUrl({ atc, query:productQuery }),
        score:normalize(tradeName) === needle ? 460 : normalize(tradeName).startsWith(needle) ? 340 : 260,
      });

      const substanceKey = normalize(substance);
      if (!substanceKey) return;
      if (!substanceGroups.has(substanceKey)) substanceGroups.set(substanceKey, { label:substance, categories:new Set(), count:0 });
      const group = substanceGroups.get(substanceKey);
      if (atc) group.categories.add(atc);
      group.count += 1;
    });

    const substances = [];
    substanceGroups.forEach((group, key) => {
      if (group.categories.size !== 1) return;
      const atc = [...group.categories][0];
      substances.push({
        key:`substance:${key}:${atc}`,
        type:'substance',
        title:group.label,
        meta:`Substancë aktive · ${window.MedIndexATC.getCategoryLabel(atc)} · ${group.count} produkte`,
        atc,
        href:window.MedIndexATC.registryUrl({ atc, query:group.label }),
        score:key === needle ? 520 : key.startsWith(needle) ? 380 : 280,
      });
    });

    return [...substances, ...products];
  }

  function uniqueRanked(items) {
    const seen = new Set();
    return items
      .filter(item => item?.key && item?.href && !seen.has(item.key) && seen.add(item.key))
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, 'sq'))
      .slice(0, MAX_OPTIONS);
  }

  function optionIcon(type) {
    if (type === 'category' || type === 'group') return 'ATC';
    if (type === 'substance') return 'S';
    return 'Rx';
  }

  function renderOptions(items, message = '') {
    options = items;
    activeIndex = items.length ? 0 : -1;
    input.setAttribute('aria-expanded', String(items.length > 0 || Boolean(message)));

    if (!items.length) {
      listbox.innerHTML = message ? `<div class="mi-atc-search-message" role="status">${escapeHtml(message)}</div>` : '';
      listbox.hidden = !message;
      input.removeAttribute('aria-activedescendant');
      return;
    }

    listbox.hidden = false;
    listbox.innerHTML = items.map((item, index) => `<a
      class="mi-atc-search-option${index === activeIndex ? ' is-active' : ''}"
      id="miAtcSearchOption${index}"
      role="option"
      aria-selected="${index === activeIndex}"
      href="${escapeHtml(item.href)}"
      data-mi-atc-search-index="${index}"
    >
      <span class="mi-atc-search-option__icon" aria-hidden="true">${optionIcon(item.type)}</span>
      <span class="mi-atc-search-option__copy">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.meta)}</small>
      </span>
      <span class="mi-atc-search-option__arrow" aria-hidden="true">→</span>
    </a>`).join('');
    setActiveIndex(0);
  }

  function setActiveIndex(index) {
    if (!options.length) return;
    activeIndex = (index + options.length) % options.length;
    listbox.querySelectorAll('[data-mi-atc-search-index]').forEach((node, nodeIndex) => {
      const active = nodeIndex === activeIndex;
      node.classList.toggle('is-active', active);
      node.setAttribute('aria-selected', String(active));
    });
    const active = document.getElementById(`miAtcSearchOption${activeIndex}`);
    if (active) {
      input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block:'nearest', behavior:'auto' });
    }
  }

  function closeResults() {
    clearTimeout(timer);
    requestController?.abort();
    requestController = null;
    options = [];
    activeIndex = -1;
    listbox.hidden = true;
    listbox.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function navigateFallback(query) {
    const exactCategories = options.filter(item => item.atc && ['substance','product','category'].includes(item.type));
    const categories = new Set(exactCategories.map(item => item.atc));
    const exact = exactCategories.filter(item => normalize(item.title) === normalize(query));
    const exactCategoriesSet = new Set(exact.map(item => item.atc));
    if (exact.length && exactCategoriesSet.size === 1) {
      location.href = window.MedIndexATC.registryUrl({ atc:[...exactCategoriesSet][0], query });
      return;
    }
    if (categories.size === 1 && exactCategories.length === 1) {
      location.href = exactCategories[0].href;
      return;
    }
    location.href = window.MedIndexATC.registryUrl({ query });
  }

  async function search(query) {
    const value = clean(query);
    if (value.length < MIN_QUERY) {
      closeResults();
      return;
    }

    const sequence = ++requestSequence;
    requestController?.abort();
    requestController = new AbortController();
    renderOptions([], 'Duke kërkuar…');

    const local = categoryOptions(value);
    try {
      const response = await fetch(`${ENDPOINT}?q=${encodeURIComponent(value)}`, {
        credentials:'same-origin',
        cache:'no-store',
        headers:{ Accept:'application/json' },
        signal:requestController.signal,
      });
      if (!response.ok) throw new Error(`Kërkimi dështoi (${response.status}).`);
      const payload = await response.json();
      if (sequence !== requestSequence || clean(input.value) !== value) return;
      const combined = uniqueRanked([...local, ...drugOptions(payload.results, value)]);
      renderOptions(combined, combined.length ? '' : `Nuk u gjet rezultat për “${value}”.`);
      status.textContent = combined.length ? `${combined.length} rezultate të sugjeruara.` : 'Nuk u gjet rezultat.';
    } catch (error) {
      if (error.name === 'AbortError') return;
      const fallback = uniqueRanked(local);
      renderOptions(fallback, fallback.length ? '' : 'Kërkimi i barnave nuk është i arritshëm. Shtyp Enter për kërkim në regjistër.');
      status.textContent = fallback.length ? `${fallback.length} kategori të sugjeruara.` : 'Kërkimi i barnave nuk është i arritshëm.';
    }
  }

  function scheduleSearch() {
    clearTimeout(timer);
    const query = clean(input.value);
    if (query.length < MIN_QUERY) {
      closeResults();
      return;
    }
    timer = setTimeout(() => void search(query), DEBOUNCE_MS);
  }

  function onKeydown(event) {
    if (!['ArrowDown','ArrowUp','Enter','Escape'].includes(event.key)) return;
    if (event.key === 'Escape') {
      if (!listbox.hidden) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeResults();
      }
      return;
    }

    const query = clean(input.value);
    if (!query) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.key === 'ArrowDown') {
      if (listbox.hidden) void search(query);
      else setActiveIndex(activeIndex + 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      if (listbox.hidden) void search(query);
      else setActiveIndex(activeIndex - 1);
      return;
    }
    if (options[activeIndex]) location.href = options[activeIndex].href;
    else navigateFallback(query);
  }

  function ensureUi() {
    input = document.getElementById('miGlobalSearch');
    wrapper = input?.closest('.mi-global-search');
    if (!input || !wrapper) return false;
    if (document.getElementById('miAtcGlobalSearchListbox')) return true;

    listbox = document.createElement('div');
    listbox.id = 'miAtcGlobalSearchListbox';
    listbox.className = 'mi-atc-global-search-results';
    listbox.setAttribute('role', 'listbox');
    listbox.setAttribute('aria-label', 'Rezultatet e kërkimit të barnave dhe kategorive');
    listbox.hidden = true;

    status = document.createElement('span');
    status.className = 'mi-visually-hidden';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    wrapper.append(listbox, status);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', listbox.id);
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('placeholder', 'Kërko barin, substancën ose kategorinë…');

    input.addEventListener('input', scheduleSearch);
    input.addEventListener('search', scheduleSearch);
    input.addEventListener('keydown', onKeydown, true);
    input.addEventListener('focus', () => {
      if (clean(input.value).length >= MIN_QUERY && options.length) listbox.hidden = false;
    });
    listbox.addEventListener('mousemove', event => {
      const option = event.target.closest('[data-mi-atc-search-index]');
      if (option) setActiveIndex(Number(option.dataset.miAtcSearchIndex));
    });
    listbox.addEventListener('click', () => closeResults());
    document.addEventListener('pointerdown', event => {
      if (!wrapper.contains(event.target)) closeResults();
    });
    return true;
  }

  async function init() {
    try {
      ensureStylesheet();
      await ensureAtcData();
      if (!ensureUi()) {
        const observer = new MutationObserver(() => {
          if (ensureUi()) observer.disconnect();
        });
        observer.observe(document.body, { childList:true, subtree:true });
        setTimeout(() => observer.disconnect(), 12000);
      }
      document.documentElement.dataset.miAtcGlobalSearch = 'v1';
    } catch (error) {
      document.documentElement.dataset.miAtcGlobalSearchError = 'load';
      console.error('MedIndex ATC global search failed:', error);
    }
  }

  if (document.querySelector('.mi-app-shell')) void init();
  else window.addEventListener('medindex:tailadmin-ready', () => void init(), { once:true });
})();