(() => {
  'use strict';

  const VERSION = 'sq-clinical-search-v1';
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
  const originalFetch = window.fetch.bind(window);
  let latestSuggestionPayload = null;
  let decorating = false;
  let observer = null;
  let decorationTimer = 0;

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
      return { url, view };
    } catch {
      return null;
    }
  }

  function scheduleDecoration() {
    clearTimeout(decorationTimer);
    decorationTimer = window.setTimeout(() => {
      decorationTimer = 0;
      decorateSuggestionList();
    }, 0);
  }

  window.fetch = async function medIndexAdvancedIcdFetch(input, init) {
    const route = advancedUrl(input);
    if (!route) return originalFetch(input, init);
    try {
      const response = await originalFetch(route.url.toString(), init);
      if (!response.ok) return originalFetch(input, init);
      if (route.view === 'suggest') {
        response.clone().json().then(payload => {
          if (!payload?.ok || !payload?.data) return;
          latestSuggestionPayload = payload.data;
          window.dispatchEvent(new CustomEvent('medindex:icd-advanced-suggestions', {
            detail:{
              query:payload.data.query,
              total:payload.data.total,
              normalizedCode:payload.data.normalizedCode || '',
            },
          }));
          scheduleDecoration();
        }).catch(() => {});
      }
      return response;
    } catch {
      return originalFetch(input, init);
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
    return `<button class="icd-suggestion icd-suggestion-advanced" type="button" role="option" aria-selected="false" data-suggestion-index="${index}" data-code="${esc(node?.code)}" data-level="${esc(node?.level)}">
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

  function sameSuggestionRows(options, rows) {
    if (options.length !== rows.length) return false;
    return options.every((option, index) => clean(option.dataset.code) === clean(rows[index]?.code));
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

  function decorateSuggestionList() {
    if (decorating) return;
    const container = document.getElementById('icdSuggestions');
    const search = document.getElementById('icdSearch');
    const payload = latestSuggestionPayload;
    if (!container || !search || !payload) return;

    const payloadKey = queryKey(payload.query);
    if (!payloadKey || queryKey(search.value) !== payloadKey) return;
    if (container.dataset.miAdvancedQuery === payloadKey && container.dataset.miAdvancedReady === 'true') {
      container.hidden = false;
      search.setAttribute('aria-expanded', 'true');
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
        return;
      }

      const currentOptions = [...container.querySelectorAll('[data-suggestion-index]')];
      if (!sameSuggestionRows(currentOptions, payload.rows)) return;
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
    } finally {
      decorating = false;
    }
  }

  function installObserver() {
    const container = document.getElementById('icdSuggestions');
    if (!container || observer) return;
    observer = new MutationObserver(() => scheduleDecoration());
    observer.observe(container, { childList:true, subtree:false, attributes:true, attributeFilter:['hidden'] });
  }

  function init() {
    installObserver();
    document.documentElement.dataset.miIcdSearch = VERSION;
    document.documentElement.dataset.miIcdSearchEngine = 'clinical-ranking-v3';
    window.addEventListener('pageshow', installObserver, { passive:true });
    window.dispatchEvent(new CustomEvent('medindex:icd-advanced-search-ready', {
      detail:{ version:VERSION, engine:'clinical-ranking-v3' },
    }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
