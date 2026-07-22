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
    return `<article class="atc-card" tabindex="0" role="button" data-card-type="${type}" data-code="${escapeHtml(code)}">
      <span class="atc-card-code">${escapeHtml(code)}</span>
      <h3>${escapeHtml(title)}</h3>
      <p class="atc-card-examples">${escapeHtml(description)}</p>
      <div class="atc-card-footer"><span class="atc-card-count">${items.length} barna</span><span>${type === 'group' ? 'Shiko nën-grupet' : 'Shiko barnat'}</span></div>
      <span class="atc-card-arrow">${arrowIcon()}</span>
    </article>`;
  }

  function setSection(title, subtitle, breadcrumb = '') {
    $('#sectionTitle').textContent = title;
    $('#sectionSubtitle').textContent = subtitle;
    $('#breadcrumb').innerHTML = breadcrumb;
  }

  function updateControls(count) {
    $('#atcCount').textContent = `${count} / ${rows.length} barna`;
    $('#backButton').hidden = !state.group && !state.subgroup && !state.query;
  }

  function attachCardEvents() {
    document.querySelectorAll('.atc-card').forEach(card => {
      const activate = () => card.dataset.cardType === 'group'
        ? openGroup(card.dataset.code)
        : openSubgroup(card.dataset.code);
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

  function openGroup(code) {
    state.group = code;
    state.subgroup = '';
    state.query = '';
    $('#atcSearch').value = '';
    location.hash = code;
    const groupRows = rows.filter(row => groupCode(row) === code);
    const codes = [...new Set(groupRows.map(subgroupCode).filter(Boolean))].sort();
    setSection(
      `${code} — ${GROUPS[code] || 'Grupi ATC'}`,
      'Nën-grupet dhe numri real i barnave në databazën aktuale.',
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
    scrollTo({ top: 0, behavior: 'smooth' });
  }

  function drugTable(items, heading) {
    setSection(
      heading,
      `${items.length} barna të marra nga i njëjti dataset i audituar.`,
      `<button class="atc-reset" type="button" data-go-home>Klasifikimi ATC</button>${state.group ? ` / <button class="atc-reset" type="button" data-go-group>${escapeHtml(state.group)}</button>` : ''}${state.subgroup ? ` / <strong>${escapeHtml(state.subgroup)}</strong>` : ''}`
    );
    $('#cardGrid').hidden = true;
    $('#drugResults').hidden = false;
    $('#drugTableBody').innerHTML = items.length ? items.map(row => {
      const quality = row.__qualityStatus || 'verified';
      const qualityLabel = quality === 'corrected' ? '✓ Korrigjuar' : quality === 'blocked' ? '⚠ Bllokuar' : quality === 'warning' ? '⚠ Verifiko' : '';
      return `<tr class="registry-quality-${escapeHtml(quality)}" data-quality-status="${escapeHtml(quality)}">
        <td class="drug-title" title="${escapeHtml(row['Emri tregtar'])}"><button type="button" title="Kliko për ta zgjeruar">${escapeHtml(row['Emri tregtar'] || 'Pa emër')}</button>${qualityLabel ? `<small class="registry-quality-badge">${escapeHtml(qualityLabel)}</small>` : ''}</td>
        <td class="wrap">${escapeHtml(row['Substanca aktive'])}</td>
        <td class="code">${escapeHtml(row['ATC Code'])}</td>
        <td class="wrap">${escapeHtml(row['Klasa / Çka është'])}</td>
        <td>${escapeHtml(row['Fortësia'])}</td>
        <td class="wrap">${escapeHtml(row['Forma farmaceutike'])}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="6"><div class="atc-empty">Nuk u gjet asnjë bar.</div></td></tr>';
    updateControls(items.length);
    $('#drugTableBody').querySelectorAll('.drug-title button').forEach(button => {
      button.addEventListener('click', () => button.parentElement.classList.toggle('expanded'));
    });
    $('[data-go-home]')?.addEventListener('click', renderGroups);
    $('[data-go-group]')?.addEventListener('click', () => openGroup(state.group));
  }

  function openSubgroup(code) {
    state.group = code.charAt(0);
    state.subgroup = code;
    state.query = '';
    $('#atcSearch').value = '';
    location.hash = code;
    drugTable(rows.filter(row => subgroupCode(row) === code), `${code} — ${SUBGROUPS[code] || 'Nën-grupi ATC'}`);
    scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderSearch(query) {
    state.query = text(query);
    if (!state.query) {
      if (state.subgroup) openSubgroup(state.subgroup);
      else if (state.group) openGroup(state.group);
      else renderGroups();
      return;
    }
    const needle = normalize(state.query);
    const items = rows.filter(row => normalize([
      row['Emri tregtar'], row['Substanca aktive'], row['ATC Code'],
      row['Klasa / Çka është'], row['Përdorimi (fjalë kyçe)'], row['Forma farmaceutike']
    ].join(' ')).includes(needle));
    state.group = '';
    state.subgroup = '';
    history.replaceState(null, '', `${location.pathname}?q=${encodeURIComponent(state.query)}`);
    drugTable(items, `Rezultatet për “${state.query}”`);
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
    $('#backButton').addEventListener('click', () => state.query ? renderGroups() : state.subgroup ? openGroup(state.group) : renderGroups());
    $('#resetButton').addEventListener('click', () => {
      $('#atcSearch').value = '';
      renderGroups();
    });
    let timer;
    $('#atcSearch').addEventListener('input', event => {
      clearTimeout(timer);
      timer = setTimeout(() => renderSearch(event.target.value), 180);
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
      } else if (/^[A-Z]\d{2}$/.test(hash)) openSubgroup(hash);
      else if (/^[A-Z]$/.test(hash) && GROUPS[hash]) openGroup(hash);
      else renderGroups();
    } catch (error) {
      console.error(error);
      const loader = $('#atcLoader');
      if (loader) loader.innerHTML = `<div class="atc-empty">Databaza nuk u ngarkua: ${escapeHtml(error.message || 'gabim i panjohur')}.</div>`;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();