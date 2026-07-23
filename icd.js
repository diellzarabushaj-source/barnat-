(() => {
  'use strict';

  const DATA = window.MEDINDEX_ICD10 || { chapters: [], entries: [] };
  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const CACHE_KEY = 'medindex_icd_sheet_cache_v1';
  const CACHE_MAX_AGE = 6 * 60 * 60 * 1000;
  const PAGE_STEP = 120;
  let visibleLimit = PAGE_STEP;
  let lastFocused = null;

  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const normalize = value => text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const tokens = value => normalize(value).split(' ').filter(Boolean);

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    const button = $('#themeButton');
    if (button) {
      button.textContent = theme === 'dark' ? '☀' : '☾';
      button.setAttribute('aria-label', theme === 'dark' ? 'Aktivizo temën e çelët' : 'Aktivizo temën e errët');
    }
  }

  function initTheme() {
    let saved = '';
    try { saved = localStorage.getItem(THEME_KEY) || ''; } catch {}
    applyTheme(saved === 'dark' || saved === 'light' ? saved : (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'));
    $('#themeButton')?.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  }

  function chapterUrl(chapter) {
    const base = DATA.browserUrl || 'https://icd.who.int/browse10/2019/en';
    return `${base}#/${encodeURIComponent(chapter.whoPath || chapter.range || '')}`;
  }

  function chapterCount(chapter) {
    return (DATA.entries || []).filter(entry => entry.chapter === chapter.number).length;
  }

  function chapterCard(chapter) {
    const count = chapterCount(chapter);
    return `<article class="med-card icd-chapter-card">
      <div class="icd-chapter-head"><span class="icd-roman">${esc(chapter.number)}</span><span class="med-card-code">${esc(chapter.range)}</span></div>
      <h3>${esc(chapter.title)}</h3>
      <div class="med-card-meta"><span class="med-chip">Kapitulli ${esc(chapter.number)}</span><span class="med-chip">${count} kode</span></div>
      <a class="icd-card-link" href="${esc(chapterUrl(chapter))}" target="_blank" rel="noopener noreferrer" aria-label="Hape kapitullin ${esc(chapter.number)} në WHO ICD-10">Hape në WHO ↗</a>
    </article>`;
  }

  function contextChips(entry) {
    const chips = [];
    if (entry.isFamilyMedicine) chips.push('<span class="med-chip icd-chip-family">Familjare</span>');
    if (entry.isEmergency) chips.push('<span class="med-chip icd-chip-emergency">Urgjencë</span>');
    if (entry.isCritical) chips.push('<span class="med-chip icd-chip-critical">Kritik</span>');
    return chips.join('');
  }

  function codeCard(entry) {
    return `<article class="med-card icd-code-card" data-code="${esc(entry.code)}">
      <div class="icd-code-head"><span class="med-card-code">${esc(entry.code)}</span><span class="icd-priority">${esc(entry.priority || entry.sourceLevel || '')}</span></div>
      <h3>${esc(entry.title)}</h3>
      ${entry.englishTitle ? `<p class="icd-english">${esc(entry.englishTitle)}</p>` : ''}
      <p>${esc(entry.summary || entry.group || '')}</p>
      <div class="med-card-meta"><span class="med-chip">${esc(entry.chapter || '')}</span><span class="med-chip">${esc(entry.group || entry.level || '')}</span>${contextChips(entry)}</div>
      <button type="button" data-open-code="${esc(entry.code)}">Hape kodin</button>
    </article>`;
  }

  function searchableChapter(chapter) {
    return normalize([chapter.number, chapter.range, chapter.title, chapter.englishTitle, ...(chapter.keywords || [])].join(' '));
  }

  function searchableEntry(entry) {
    return normalize([
      entry.code, entry.title, entry.englishTitle, entry.summary, entry.parent, entry.chapter,
      entry.chapterRange, entry.chapterTitle, entry.group, entry.primaryCare, entry.emergency,
      entry.priority, entry.warning, ...(entry.keywords || []), ...(entry.codingNotes || [])
    ].join(' '));
  }

  function rank(item, queryTokens, primaryValues) {
    if (!queryTokens.length) return 0;
    let score = 0;
    queryTokens.forEach(token => {
      if (primaryValues.some(value => normalize(value).startsWith(token))) score += 8;
      else if (item.searchIndex.includes(token)) score += 2;
    });
    return score;
  }

  function matchesContext(entry, context) {
    if (context === 'family') return entry.isFamilyMedicine;
    if (context === 'emergency') return entry.isEmergency;
    if (context === 'critical') return entry.isCritical;
    return true;
  }

  function filteredData() {
    const query = $('#icdSmartSearch')?.value || '';
    const queryTokens = tokens(query);
    const level = $('#icdLevel')?.value || '';
    const context = $('#icdContext')?.value || '';

    const chapters = (DATA.chapters || [])
      .map(chapter => ({ chapter, searchIndex: searchableChapter(chapter) }))
      .filter(item => queryTokens.every(token => item.searchIndex.includes(token)))
      .map(item => ({ ...item, score: rank(item, queryTokens, [item.chapter.number, item.chapter.range, item.chapter.title]) }))
      .sort((a, b) => b.score - a.score || (DATA.chapters || []).indexOf(a.chapter) - (DATA.chapters || []).indexOf(b.chapter))
      .map(item => item.chapter);

    const entries = (DATA.entries || [])
      .map(entry => ({ entry, searchIndex: searchableEntry(entry) }))
      .filter(item => queryTokens.every(token => item.searchIndex.includes(token)) && (!level || item.entry.level === level) && matchesContext(item.entry, context))
      .map(item => ({ ...item, score: rank(item, queryTokens, [item.entry.code, item.entry.title, item.entry.englishTitle]) }))
      .sort((a, b) => b.score - a.score || a.entry.code.localeCompare(b.entry.code, 'sq', { numeric:true }))
      .map(item => item.entry);

    return { query, chapters, entries };
  }

  function filterAll({ preserveLimit = false } = {}) {
    if (!preserveLimit) visibleLimit = PAGE_STEP;
    const result = filteredData();
    const shown = result.entries.slice(0, visibleLimit);
    const remaining = Math.max(0, result.entries.length - shown.length);

    $('#chapterGrid').innerHTML = result.chapters.length ? result.chapters.map(chapterCard).join('') : '<div class="med-empty">Nuk u gjet asnjë kapitull për këtë kërkim.</div>';
    $('#icdGrid').innerHTML = result.entries.length
      ? `${shown.map(codeCard).join('')}${remaining ? `<button class="icd-load-more" type="button" data-load-more>Shfaq edhe ${Math.min(PAGE_STEP, remaining)} kode · ${remaining} të mbetura</button>` : ''}`
      : '<div class="med-empty">Nuk u gjet asnjë kod për këtë kërkim ose filtër.</div>';
    $('#chapterCount').textContent = `${result.chapters.length} / ${(DATA.chapters || []).length} kapituj`;
    $('#icdCount').textContent = `${result.entries.length} / ${(DATA.entries || []).length} kode`;
    $('#smartCount').textContent = `${result.entries.length} kode`;
    const clear = $('#icdClear');
    if (clear) clear.hidden = !text(result.query);
  }

  function populateSuggestions() {
    const datalist = $('#icdSuggestions');
    if (!datalist) return;
    const chapterOptions = (DATA.chapters || []).map(chapter => `<option value="${esc(chapter.range)}">Kapitulli ${esc(chapter.number)} — ${esc(chapter.title)}</option>`);
    const codeOptions = (DATA.entries || []).map(entry => `<option value="${esc(entry.code)}">${esc(entry.title)}</option>`);
    datalist.innerHTML = [...chapterOptions, ...codeOptions].join('');
  }

  function list(items, empty = 'Nuk ka shënim të veçantë në materialin burimor.') {
    return items?.length ? `<ul>${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : `<p>${esc(empty)}</p>`;
  }

  function detailField(label, value, full = false) {
    if (!text(value)) return '';
    return `<section class="med-detail${full ? ' full' : ''}"><strong>${esc(label)}</strong><p>${esc(value)}</p></section>`;
  }

  function openEntry(code) {
    const entry = (DATA.entries || []).find(item => item.code === code);
    if (!entry) return;
    lastFocused = document.activeElement;
    $('#detailKicker').textContent = `${DATA.version || 'ICD-10-WHO 2019'} · ${entry.code}`;
    $('#detailTitle').textContent = entry.title;
    const source = entry.sourceUrl || DATA.browserUrl || 'https://icd.who.int/browse10/2019/en';
    $('#detailBody').innerHTML = `<div class="med-detail-grid">
      ${detailField('Emri në anglisht', entry.englishTitle)}
      ${detailField('Kapitulli', [entry.chapter, entry.chapterRange, entry.chapterTitle].filter(Boolean).join(' · '))}
      ${detailField('Grupi / nënkategoria klinike', entry.group)}
      ${detailField('Niveli', entry.sourceLevel || entry.level)}
      ${detailField('Mjekësi familjare', entry.primaryCare)}
      ${detailField('Mjekësi urgjente', entry.emergency)}
      ${detailField('Prioriteti', entry.priority)}
      ${detailField('Përdorimi tipik', entry.summary, true)}
      ${detailField('Shenja alarmi / kujdes', entry.warning, true)}
      <section class="med-detail full"><strong>Shënim kodimi</strong>${list(entry.codingNotes)}</section>
      <section class="med-detail full"><strong>Fjalë kyçe për kërkim</strong><p class="icd-keyword-list">${(entry.keywords || []).map(item => `<span class="med-chip">${esc(item)}</span>`).join(' ') || 'Nuk janë shënuar.'}</p></section>
    </div><div class="med-source"><strong>Burimi:</strong> Google Sheet-i ICD-10 i dhënë nga përdoruesi; lidhja WHO ruhet për secilin kod. <a href="${esc(source)}" target="_blank" rel="noopener noreferrer">Hape kodin në WHO ICD-10 ↗</a></div>`;
    const overlay = $('#detailOverlay');
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    $('#detailClose')?.focus();
  }

  function closeEntry() {
    const overlay = $('#detailOverlay');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    lastFocused?.focus?.({ preventScroll:true });
    lastFocused = null;
  }

  function cacheDataset(data) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt:Date.now(), data })); } catch {}
  }

  function cachedDataset() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (!cached?.data?.entries?.length || Date.now() - Number(cached.savedAt || 0) > CACHE_MAX_AGE) return null;
      return cached.data;
    } catch {
      return null;
    }
  }

  function applyDataset(data, sourceLabel = 'Google Sheet') {
    DATA.entries = Array.isArray(data.entries) ? data.entries : DATA.entries;
    DATA.version = data.version || DATA.version;
    DATA.sheetMeta = data.counts || {};
    populateSuggestions();
    filterAll();
    const counts = data.counts || {};
    const notice = $('#icdSourceNotice');
    if (notice) notice.innerHTML = `<strong>Burimi:</strong> ${esc(sourceLabel)} · ${Number(counts.total || DATA.entries.length)} kode të përzgjedhura · ${Number(counts.emergency || 0)} për urgjencë · ${Number(counts.critical || 0)} kritike. Ky është set klinik i përzgjedhur, jo lista e plotë e të gjitha nënkodeve ICD-10; për kodim përfundimtar kontrollo kodin më specifik dhe udhëzimet përkatëse.`;
  }

  async function loadSheetData() {
    const cached = cachedDataset();
    if (cached) applyDataset(cached, 'Google Sheet-i i aprovuar (cache i sesionit)');
    try {
      const response = await fetch('/api/icd', { credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' } });
      if (!response.ok) throw new Error(`ICD API ${response.status}`);
      const payload = await response.json();
      if (!payload?.data?.entries?.length) throw new Error('Dataset bosh');
      cacheDataset(payload.data);
      applyDataset(payload.data, 'Google Sheet-i i aprovuar');
    } catch (error) {
      console.error('ICD Sheet load failed:', error);
      if (!cached) {
        const notice = $('#icdSourceNotice');
        if (notice) notice.innerHTML = '<strong>Njoftim:</strong> Google Sheet-i ICD-10 nuk u ngarkua. Po shfaqet vetëm përmbajtja rezervë lokale derisa lidhja të rikthehet.';
        populateSuggestions();
        filterAll();
      }
    }
  }

  function init() {
    initTheme();
    $('#whoBrowserLink').href = DATA.browserUrl || 'https://icd.who.int/browse10/2019/en';
    $('#icdSmartSearch')?.addEventListener('input', () => filterAll());
    $('#icdLevel')?.addEventListener('change', () => filterAll());
    $('#icdContext')?.addEventListener('change', () => filterAll());
    $('#icdClear')?.addEventListener('click', () => {
      $('#icdSmartSearch').value = '';
      $('#icdSmartSearch').focus();
      filterAll();
    });
    $('#icdGrid')?.addEventListener('click', event => {
      const open = event.target.closest('[data-open-code]');
      if (open) openEntry(open.dataset.openCode);
      if (event.target.closest('[data-load-more]')) {
        visibleLimit += PAGE_STEP;
        filterAll({ preserveLimit:true });
      }
    });
    $('#detailClose')?.addEventListener('click', closeEntry);
    $('#detailDone')?.addEventListener('click', closeEntry);
    $('#detailOverlay')?.addEventListener('click', event => { if (event.target.id === 'detailOverlay') closeEntry(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !$('#detailOverlay')?.hidden) closeEntry();
      if (event.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) {
        event.preventDefault();
        $('#icdSmartSearch')?.focus();
      }
    });
    populateSuggestions();
    filterAll();
    loadSheetData();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
