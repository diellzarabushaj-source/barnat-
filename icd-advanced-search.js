(() => {
  'use strict';

  const VERSION = 'sq-clinical-search-v3';
  const ENGINE = 'clinical-ranking-v3';
  const SOURCE_PATH = '/api/icd';
  const ADVANCED_FLAG = 'advanced';
  const GROUP_ORDER = ['exact', 'suggested', 'broader', 'narrower', 'english'];
  const GROUP_LABELS = {
    exact:'Përputhje e saktë',
    suggested:'Diagnoza të sugjeruara',
    broader:'Kategori më të gjera',
    narrower:'Nënkode më specifike',
    english:'Rezultate në anglisht',
  };
  const originalFetch = window.MedIndexNativeFetch || window.fetch.bind(window);
  let latestSuggestionPayload = null;
  let latestSuggestionRequest = null;
  let suggestionSequence = 0;
  let decorating = false;
  let observer = null;
  let decorationTimer = 0;
  let sourceRequest = null;

  const clean = value => String(value ?? '').trim();
  const queryKey = value => clean(value).toLocaleLowerCase('sq-AL');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));

  function advancedUrl(input) {
    try {
      const url = new URL(typeof input === 'string' ? input : input?.url, location.origin);
      if (url.origin !== location.origin || url.pathname !== SOURCE_PATH) return null;
      const view = clean(url.searchParams.get('view')).toLowerCase();
      const query = clean(url.searchParams.get('q'));
      if (!query || !['table', 'suggest'].includes(view)) return null;
      url.searchParams.set(ADVANCED_FLAG, '1');
      if (view === 'suggest') url.searchParams.set('controller', 'race-guard-v2');
      return { url, view, query };
    } catch {
      return null;
    }
  }

  function suggestionContainer() {
    return document.getElementById('icdSuggestions');
  }

  function setSuggestionBusy(value) {
    const container = suggestionContainer();
    if (container) container.setAttribute('aria-busy', String(Boolean(value)));
  }

  function sourceStatusText(source) {
    if (source?.status === 'stale') return 'Burimi: cache i fundit';
    if (source?.status === 'live') return 'Burimi: live';
    return 'Burimi: duke u verifikuar';
  }

  function renderSourceStatus(source) {
    const node = document.getElementById('icdSourceStatus');
    if (!node) return;
    const status = clean(source?.status).toLowerCase();
    node.dataset.sourceStatus = status || 'loading';
    node.textContent = sourceStatusText(source);
    const loadedAt = clean(source?.loadedAt);
    const revision = clean(source?.revision);
    const details = [];
    if (loadedAt) {
      const date = new Date(loadedAt);
      if (!Number.isNaN(date.getTime())) details.push(`Ngarkuar ${date.toLocaleString('sq-AL')}`);
    }
    if (revision) details.push(`Revizioni ${revision}`);
    node.title = details.join(' · ');
  }

  async function loadSourceStatus() {
    if (sourceRequest) return sourceRequest;
    sourceRequest = originalFetch(`${SOURCE_PATH}?view=meta`, {
      credentials:'same-origin',
      cache:'no-store',
      headers:{ Accept:'application/json' },
    }).then(async response => {
      if (!response.ok) throw new Error(`ICD meta ${response.status}`);
      const payload = await response.json();
      renderSourceStatus(payload?.data?.meta?.source || null);
    }).catch(() => {
      const node = document.getElementById('icdSourceStatus');
      if (node) {
        node.dataset.sourceStatus = 'unknown';
        node.textContent = 'Burimi: status i panjohur';
      }
    }).finally(() => {
      sourceRequest = null;
    });
    return sourceRequest;
  }

  function scheduleDecoration() {
    clearTimeout(decorationTimer);
    decorationTimer = window.setTimeout(() => {
      decorationTimer = 0;
      decorateSuggestionList();
    }, 0);
  }

  function registerSuggestionPayload(payload) {
    if (!payload?.ok || !payload?.data) return;
    latestSuggestionPayload = payload.data;
    renderSourceStatus(payload.data.meta?.source || null);
    window.dispatchEvent(new CustomEvent('medindex:icd-advanced-suggestions', {
      detail:{
        query:payload.data.query,
        total:payload.data.total,
        normalizedCode:payload.data.normalizedCode || '',
      },
    }));
    scheduleDecoration();
  }

  async function currentSuggestionResponse(sequence, ownPromise) {
    try {
      const response = await ownPromise;
      if (sequence !== latestSuggestionRequest?.sequence) {
        const latest = await latestSuggestionRequest?.promise;
        return latest?.clone ? latest.clone() : response;
      }
      return response;
    } catch (error) {
      if (sequence !== latestSuggestionRequest?.sequence && latestSuggestionRequest?.promise) {
        const latest = await latestSuggestionRequest.promise;
        return latest.clone();
      }
      throw error;
    }
  }

  window.fetch = async function medIndexAdvancedIcdFetch(input, init) {
    const route = advancedUrl(input);
    if (!route) return originalFetch(input, init);

    if (route.view !== 'suggest') {
      try {
        const response = await originalFetch(route.url.toString(), init);
        return response.ok ? response : originalFetch(input, init);
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        return originalFetch(input, init);
      }
    }

    const sequence = ++suggestionSequence;
    setSuggestionBusy(true);
    const requestInit = init?.signal ? { ...init, signal:undefined } : init;
    const ownPromise = originalFetch(route.url.toString(), requestInit);
    latestSuggestionRequest = { sequence, query:route.query, promise:ownPromise };

    try {
      let response = await currentSuggestionResponse(sequence, ownPromise);
      if (!response.ok) response = await originalFetch(input, requestInit);
      if (sequence === latestSuggestionRequest?.sequence) {
        response.clone().json().then(registerSuggestionPayload).catch(() => {});
      }
      return response;
    } finally {
      if (sequence === latestSuggestionRequest?.sequence) setSuggestionBusy(false);
    }
  };

  function pathText(node) {
    const breadcrumb = Array.isArray(node?.breadcrumb) ? node.breadcrumb : [];
    if (breadcrumb.length) {
      return breadcrumb.map(item => {
        const title = clean(item?.title);
        return [clean(item?.code), title].filter(Boolean).join(' — ');
      }).filter(Boolean).join(' › ');
    }
    return [node?.chapter ? `Kapitulli ${node.chapter}` : '', node?.block || '', node?.parentCode || '']
      .filter(Boolean)
      .join(' · ');
  }

  function optionMarkup(node, index) {
    const match = node?.searchMatch || {};
    const english = clean(node?.englishTitle);
    const display = clean(node?.displayTitle);
    const alternate = english && english.toLowerCase() !== display.toLowerCase() ? english : '';
    return `<button class="icd-suggestion icd-suggestion-advanced" id="icdSuggestion-${index}" type="button" role="option" aria-selected="false" data-suggestion-index="${index}" data-code="${esc(node?.code)}" data-level="${esc(node?.level)}">
      <span class="icd-suggestion-code">${esc(node?.code)}</span>
      <span class="icd-suggestion-copy">
        <strong>${esc(display)}</strong>
        ${alternate ? `<small class="icd-suggestion-english">${esc(alternate)}</small>` : ''}
        <small class="icd-suggestion-path">${esc(pathText(node))}</small>
      </span>
      <span class="icd-suggestion-meta">
        <span class="icd-suggestion-level">${esc(levelLabel(node?.level))}</span>
        <span class="icd-suggestion-match" data-match-type="${esc(match.type)}">${esc(match.label || 'Përputhje')}</span>
      </span>
    </button>`;
  }

  function levelLabel(level) {
    return ({
      chapter:'Kapitull',
      block:'Bllok',
      category:'Kategori',
      subcategory:'Nënkategori',
    })[level] || clean(level) || '—';
  }

  function interpretationMarkup(payload) {
    if (!payload?.interpretedAs) return '';
    const label = payload.interpretationType === 'code-normalized'
      ? 'Kodi u normalizua si'
      : 'Kërkimi u interpretua si';
    return `<div class="icd-suggestion-interpretation" role="status">
      <span>${esc(label)}</span>
      <strong>${esc(payload.interpretedAs)}</strong>
    </div>`;
  }

  function emptyMarkup(payload) {
    return `${interpretationMarkup(payload)}
      <div class="icd-suggestion-empty" role="status">
        <strong>Nuk u gjet asnjë kod ICD-10</strong>
        <span>Provo kodin me ose pa pikë, diagnozën në shqip, termin anglisht ose një sinonim klinik.</span>
      </div>
      <div class="icd-suggestion-safety" role="note">${esc(payload?.safetyNote || 'Sugjerimet ndihmojnë kërkimin dhe kodimin; nuk vendosin diagnozë.')}</div>`;
  }

  function syncActiveDescendant() {
    const search = document.getElementById('icdSearch');
    const selected = suggestionContainer()?.querySelector('[role="option"][aria-selected="true"]');
    if (!search) return;
    if (selected?.id) search.setAttribute('aria-activedescendant', selected.id);
    else search.removeAttribute('aria-activedescendant');
  }

  function decorateSuggestionList() {
    if (decorating) return;
    const container = suggestionContainer();
    const search = document.getElementById('icdSearch');
    const payload = latestSuggestionPayload;
    if (!container || !search || !payload) return;

    const payloadKey = queryKey(payload.query);
    if (!payloadKey || queryKey(search.value) !== payloadKey) return;
    if (
      container.dataset.miAdvancedQuery === payloadKey
      && container.dataset.miAdvancedReady === 'true'
      && container.querySelector('.icd-suggestion-group, .icd-suggestion-empty')
    ) {
      container.hidden = false;
      search.setAttribute('aria-expanded', 'true');
      syncActiveDescendant();
      return;
    }

    decorating = true;
    try {
      if (!payload.rows?.length) {
        container.innerHTML = emptyMarkup(payload);
        container.dataset.miAdvancedQuery = payloadKey;
        container.dataset.miAdvancedReady = 'true';
        container.hidden = false;
        search.setAttribute('aria-expanded', 'true');
        syncActiveDescendant();
        return;
      }

      const grouped = new Map(GROUP_ORDER.map(group => [group, []]));
      payload.rows.forEach((node, index) => {
        const group = node?.searchMatch?.group || 'suggested';
        if (!grouped.has(group)) grouped.set(group, []);
        grouped.get(group).push({ node, index });
      });

      const sections = [interpretationMarkup(payload)];
      for (const group of GROUP_ORDER) {
        const items = grouped.get(group) || [];
        if (!items.length) continue;
        const label = payload.groups?.find(item => item.id === group)?.label || GROUP_LABELS[group];
        sections.push(`<div class="icd-suggestion-group" role="presentation" data-suggestion-group="${group}">
          <div class="icd-suggestion-group-title" role="presentation">
            <span>${esc(label)}</span><small>${items.length}</small>
          </div>
          ${items.map(item => optionMarkup(item.node, item.index)).join('')}
        </div>`);
      }
      sections.push(`<div class="icd-suggestion-safety" role="note">${esc(payload.safetyNote || 'Sugjerimet ndihmojnë kërkimin dhe kodimin; nuk vendosin diagnozë.')}</div>`);
      container.innerHTML = sections.join('');
      container.dataset.miAdvancedQuery = payloadKey;
      container.dataset.miAdvancedReady = 'true';
      container.hidden = false;
      search.setAttribute('aria-expanded', 'true');
      syncActiveDescendant();
    } finally {
      decorating = false;
    }
  }

  async function chooseDecoratedSuggestion(option) {
    const code = clean(option?.dataset?.code);
    if (!code) return;
    const search = document.getElementById('icdSearch');
    const clear = document.getElementById('icdSearchClear');
    const container = suggestionContainer();
    if (search) {
      search.value = code;
      search.setAttribute('aria-expanded', 'false');
      search.removeAttribute('aria-activedescendant');
    }
    if (clear) clear.hidden = false;
    if (container) {
      container.hidden = true;
      container.innerHTML = '';
    }
    try {
      await window.MedIndexIcdTable?.revealCode?.(code, { history:true, focus:true });
      if (clean(option.dataset.level) === 'subcategory') {
        window.dispatchEvent(new CustomEvent('medindex:icd-open-detail', { detail:{ code } }));
      }
    } catch (error) {
      console.error('ICD suggestion selection failed:', error);
    }
  }

  function installObserver() {
    const container = suggestionContainer();
    if (!container || observer) return;
    observer = new MutationObserver(() => {
      scheduleDecoration();
      queueMicrotask(syncActiveDescendant);
    });
    observer.observe(container, {
      childList:true,
      subtree:true,
      attributes:true,
      attributeFilter:['hidden', 'aria-selected'],
    });
  }

  function bindAccessibility() {
    const search = document.getElementById('icdSearch');
    const container = suggestionContainer();
    if (!search || !container) return;
    search.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        const selected = container.querySelector('[role="option"][aria-selected="true"]')
          || container.querySelector('[role="option"]');
        if (selected?.classList.contains('icd-suggestion-advanced')) {
          event.preventDefault();
          event.stopImmediatePropagation();
          chooseDecoratedSuggestion(selected);
          return;
        }
      }
      if (['ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) {
        queueMicrotask(syncActiveDescendant);
      }
    }, true);
    container.addEventListener('click', event => {
      const option = event.target.closest('.icd-suggestion-advanced[data-code]');
      if (!option) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      chooseDecoratedSuggestion(option);
    }, true);
    search.addEventListener('input', () => {
      search.removeAttribute('aria-activedescendant');
      const container = suggestionContainer();
      if (container) {
        delete container.dataset.miAdvancedQuery;
        delete container.dataset.miAdvancedReady;
      }
    });
  }

  function init() {
    installObserver();
    bindAccessibility();
    renderSourceStatus(null);
    document.documentElement.dataset.miIcdSearch = VERSION;
    document.documentElement.dataset.miIcdSearchEngine = ENGINE;
    window.addEventListener('pageshow', () => {
      installObserver();
      loadSourceStatus();
    }, { passive:true });
    window.addEventListener('medindex:icd-tree-ready', loadSourceStatus, { once:true });
    window.dispatchEvent(new CustomEvent('medindex:icd-advanced-search-ready', {
      detail:{ version:VERSION, engine:ENGINE },
    }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
