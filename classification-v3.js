(() => {
  'use strict';

  const GROUPS = window.MEDINDEX_ATC_GROUPS || {};
  const SUBGROUPS = window.MEDINDEX_ATC_SUBGROUPS || {};
  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const state = { group: '', subgroup: '', query: '' };
  let rows = [];

  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
  const normalize = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq');
  const atcCode = row => text(row['ATC Code']).toUpperCase().replace(/\s+/g, '');
  const groupCode = row => atcCode(row).match(/^[A-Z]/)?.[0] || '';
  const subgroupCode = row => atcCode(row).match(/^[A-Z]\d{2}/)?.[0] || '';

  function uniqueExamples(items, limit = 4) {
    const result = [];
    const seen = new Set();
    for (const row of items) {
      const name = text(row['Emri tregtar']);
      const key = normalize(name);
      if (!name || seen.has(key)) continue;
      seen.add(key);
      result.push(name);
      if (result.length >= limit) break;
    }
    return result;
  }

  function arrowIcon() {
    return '<svg fill="none" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M13.47 17.97a.75.75 0 0 0 1.06 1.06l5.79-5.79a1.75 1.75 0 0 0 0-2.48l-5.79-5.79a.75.75 0 0 0-1.06 1.06l5.22 5.22H4a.75.75 0 0 0 0 1.5h14.69l-5.22 5.22Z"/></svg>';
  }

  function cardHtml(code, title, items, type) {
    const examples = uniqueExamples(items);
    const description = examples.length ? examples.join(', ') : 'Nuk ka shembuj të regjistruar.';
    const action = type === 'group' ? 'Shiko nën-grupet' : 'Hap te Barnat';
    return `<div class="atc-card-shell" data-atc-card-shell="${escapeHtml(code)}">
      <article class="atc-card" tabindex="0" role="button" aria-label="${escapeHtml(`${code} — ${title}. ${action}`)}" data-card-type="${type}" data-code="${escapeHtml(code)}">
        <span class="atc-card-code">${escapeHtml(code)}</span>
        <h3>${escapeHtml(title)}</h3>
        <p class="atc-card-examples">${escapeHtml(description)}</p>
        <div class="atc-card-footer"><span class="atc-card-count">${items.length} barna</span><span>${action}</span></div>
        <span class="atc-card-arrow">${arrowIcon()}</span>
      </article>
      <button class="atc-card-info" type="button" data-atc-info data-code="${escapeHtml(code)}" data-card-type="${type}" aria-label="Shiko informacionin për ${escapeHtml(`${code} — ${title}`)}">i</button>
    </div>`;
  }

  function setSection(title, subtitle, breadcrumb = '') {
    $('#sectionTitle').textContent = title;
    $('#sectionSubtitle').textContent = subtitle;
    $('#breadcrumb').innerHTML = breadcrumb;
  }

  function updateControls(count) {
    $('#atcCount').textContent = `${count} / ${rows.length} barna`;
    $('#backButton').hidden = !state.group && !state.query;
  }

  function registryUrl(code, query = '') {
    return window.MedIndexATC?.registryUrl?.({ atc:code, query })
      || `/index.html?atc=${encodeURIComponent(code)}${query ? `&q=${encodeURIComponent(query)}` : ''}`;
  }

  function attachCardEvents() {
    document.querySelectorAll('.atc-card').forEach(card => {
      const activate = () => card.dataset.cardType === 'group'
        ? openGroup(card.dataset.code)
        : openSubgroup(card.dataset.code, state.query);
      card.addEventListener('click', activate);
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
    });
  }

  function renderGroups() {
    state.group = '';
    state.subgroup = '';
    state.query = '';
    history.replaceState(null, '', location.pathname);
    const available = Object.keys(GROUPS)
      .map(code => ({ code, items: rows.filter(row => groupCode(row) === code) }))
      .filter(group => group.items.length);
    setSection('Grupet kryesore ATC', 'Zgjidhe sistemin ose grupin terapeutik për t’i parë nën-grupet.', '<strong>Klasifikimi ATC</strong>');
    $('#cardGrid').innerHTML = available.length
      ? available.map(group => cardHtml(group.code, GROUPS[group.code], group.items, 'group')).join('')
      : '<div class="atc-empty">Nuk u gjet asnjë grup ATC në databazë.</div>';
    $('#cardGrid').hidden = false;
    $('#drugResults').hidden = true;
    updateControls(available.reduce((total, group) => total + group.items.length, 0));
    attachCardEvents();
  }

  function openGroup(code, options = {}) {
    state.group = code;
    state.subgroup = '';
    if (!options.preserveQuery) {
      state.query = '';
      $('#atcSearch').value = '';
    }
    if (options.updateHistory !== false) location.hash = code;
    const groupRows = rows.filter(row => groupCode(row) === code);
    const codes = [...new Set(groupRows.map(subgroupCode).filter(Boolean))].sort();
    setSection(
      `${code} — ${GROUPS[code] || 'Grupi ATC'}`,
      'Zgjidhe nën-grupin për ta hapur në tabelën kryesore të Barnave.',
      `<button class="atc-reset" type="button" data-go-home>Klasifikimi ATC</button> / <strong>${escapeHtml(code)}</strong>`
    );
    $('#cardGrid').innerHTML = codes.length
      ? codes.map(subcode => cardHtml(subcode, SUBGROUPS[subcode] || `Nën-grupi ${subcode}`, groupRows.filter(row => subgroupCode(row) === subcode), 'subgroup')).join('')
      : '<div class="atc-empty">Ky grup nuk ka nën-grupe të lexueshme në databazë.</div>';
    $('#cardGrid').hidden = false;
    $('#drugResults').hidden = true;
    updateControls(groupRows.length);
    attachCardEvents();
    $('[data-go-home]')?.addEventListener('click', renderGroups);

    if (options.focusCode) {
      requestAnimationFrame(() => {
        const card = document.querySelector(`.atc-card[data-code="${options.focusCode}"]`);
        card?.focus({ preventScroll:true });
        card?.scrollIntoView({ block:'center', behavior:'smooth' });
      });
    } else {
      scrollTo({ top:0, behavior:'smooth' });
    }
  }

  function revealSubgroup(code) {
    const category = window.MedIndexATC?.resolveCategoryCode?.(code) || code;
    const group = category.charAt(0);
    history.replaceState(null, '', `${location.pathname}#${encodeURIComponent(category)}`);
    openGroup(group, { updateHistory:false, focusCode:category });
  }

  function openSubgroup(code, query = '') {
    const category = window.MedIndexATC?.resolveCategoryCode?.(code) || code;
    location.href = registryUrl(category, query);
  }

  function rowsMatchingQuery(query) {
    const needle = normalize(query);
    if (!needle) return [];
    return rows.filter(row => normalize([
      row['Emri tregtar'], row['Substanca aktive'], row['ATC Code'],
      row['Klasa / Çka është'], row['Përdorimi (fjalë kyçe)'], row['Forma farmaceutike']
    ].join(' ')).includes(needle));
  }

  function renderSearch(query) {
    state.query = text(query);
    if (!state.query) {
      renderGroups();
      return;
    }

    const needle = normalize(state.query);
    const matchingRows = rowsMatchingQuery(state.query);
    const matchingGroupCodes = new Set(Object.entries(GROUPS)
      .filter(([code, name]) => normalize(`${code} ${name}`).includes(needle))
      .map(([code]) => code));
    const matchingSubgroupCodes = new Set(Object.entries(SUBGROUPS)
      .filter(([code, name]) => normalize(`${code} ${name}`).includes(needle))
      .map(([code]) => code));

    matchingRows.map(subgroupCode).filter(Boolean).forEach(code => matchingSubgroupCodes.add(code));

    state.group = '';
    state.subgroup = '';
    history.replaceState(null, '', `${location.pathname}?q=${encodeURIComponent(state.query)}`);

    const cards = [];
    matchingGroupCodes.forEach(code => {
      const items = rows.filter(row => groupCode(row) === code);
      if (items.length) cards.push(cardHtml(code, GROUPS[code], items, 'group'));
    });
    matchingSubgroupCodes.forEach(code => {
      const exactMatches = matchingRows.filter(row => subgroupCode(row) === code);
      const items = exactMatches.length ? exactMatches : rows.filter(row => subgroupCode(row) === code);
      if (items.length) cards.push(cardHtml(code, SUBGROUPS[code] || `Nën-grupi ${code}`, items, 'subgroup'));
    });

    setSection(
      `Rezultatet për “${state.query}”`,
      cards.length
        ? 'Zgjidhe kategorinë për t’i hapur rezultatet në tabelën kryesore të Barnave.'
        : 'Nuk u identifikua një kategori e vetme. Mund ta vazhdosh kërkimin në tabelën e Barnave.',
      '<button class="atc-reset" type="button" data-go-home>Klasifikimi ATC</button> / <strong>Kërkimi</strong>'
    );

    $('#cardGrid').innerHTML = cards.length
      ? cards.join('')
      : `<div class="atc-empty"><p>Nuk u gjet kategori e drejtpërdrejtë për “${escapeHtml(state.query)}”.</p><a class="atc-reset atc-search-registry-link" href="${escapeHtml(window.MedIndexATC?.registryUrl?.({ query:state.query }) || `/index.html?q=${encodeURIComponent(state.query)}`)}">Kërko te Barnat</a></div>`;
    $('#cardGrid').hidden = false;
    $('#drugResults').hidden = true;
    updateControls(matchingRows.length);
    attachCardEvents();
    $('[data-go-home]')?.addEventListener('click', renderGroups);
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    $('#themeButton').textContent = theme === 'dark' ? '☀' : '☾';
    $('#themeButton').setAttribute('aria-label', theme === 'dark' ? 'Aktivizo light mode' : 'Aktivizo dark mode');
  }

  function initTheme() {
    let saved = '';
    try { saved = localStorage.getItem(THEME_KEY) || ''; } catch {}
    applyTheme(['dark','light'].includes(saved) ? saved : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    $('#themeButton').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  }

  function initNavigation() {
    $('#backButton').addEventListener('click', renderGroups);
    $('#resetButton').addEventListener('click', () => {
      $('#atcSearch').value = '';
      renderGroups();
    });
    let timer;
    const search = $('#atcSearch');
    search.addEventListener('input', event => {
      clearTimeout(timer);
      timer = setTimeout(() => renderSearch(event.target.value), 180);
    });
    search.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || !text(search.value)) return;
      const subgroupCards = [...document.querySelectorAll('.atc-card[data-card-type="subgroup"]')];
      if (subgroupCards.length === 1) {
        event.preventDefault();
        subgroupCards[0].click();
      }
    });
  }

  async function init() {
    initTheme();
    initNavigation();
    try {
      const result = await window.MEDINDEX_REGISTRY_READY;
      rows = result?.rows || window.MEDINDEX_REGISTRY_ROWS || [];
      if (!rows.length) throw new Error('Databaza nuk ktheu asnjë rresht të lexueshëm.');
      $('#atcLoader')?.remove();
      $('#atcWorkspace').hidden = false;
      const query = new URLSearchParams(location.search).get('q');
      const hash = location.hash.replace('#', '').toUpperCase();
      if (query) {
        $('#atcSearch').value = query;
        renderSearch(query);
      } else if (/^[A-Z]\d{2}$/.test(hash)) revealSubgroup(hash);
      else if (/^[A-Z]$/.test(hash) && GROUPS[hash]) openGroup(hash);
      else renderGroups();
    } catch (error) {
      console.error(error);
      const loader = $('#atcLoader');
      if (loader) loader.innerHTML = `<div class="atc-empty">Databaza nuk u ngarkua: ${escapeHtml(error.message || 'gabim i panjohur')}.</div>`;
    }
  }

  window.MedIndexClassification = Object.freeze({
    openGroup:code => openGroup(text(code).toUpperCase()),
    openSubgroup:(code, query = '') => openSubgroup(text(code).toUpperCase(), text(query)),
    revealSubgroup:code => revealSubgroup(text(code).toUpperCase()),
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();