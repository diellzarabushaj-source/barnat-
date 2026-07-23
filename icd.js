(() => {
  'use strict';
  const DATA = window.MEDINDEX_ICD10 || { chapters: [], entries: [] };
  const THEME_KEY = 'regjistriBarnave_theme_v1';
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

  function chapterCard(chapter) {
    return `<article class="med-card icd-chapter-card">
      <div class="icd-chapter-head"><span class="icd-roman">${esc(chapter.number)}</span><span class="med-card-code">${esc(chapter.range)}</span></div>
      <h3>${esc(chapter.title)}</h3>
      <div class="med-card-meta"><span class="med-chip">Kapitulli ${esc(chapter.number)}</span><span class="med-chip">ICD-10 2019</span></div>
      <a class="icd-card-link" href="${esc(chapterUrl(chapter))}" target="_blank" rel="noopener noreferrer" aria-label="Hape kapitullin ${esc(chapter.number)} në WHO ICD-10">Hape në WHO ↗</a>
    </article>`;
  }

  function codeCard(entry) {
    return `<article class="med-card" data-code="${esc(entry.code)}"><span class="med-card-code">${esc(entry.code)}</span><h3>${esc(entry.title)}</h3><p>${esc(entry.summary)}</p><div class="med-card-meta"><span class="med-chip">${esc(entry.level)}</span><span class="med-chip">Prindi: ${esc(entry.parent)}</span></div><button type="button" data-open-code="${esc(entry.code)}">Hape kodin</button></article>`;
  }

  function searchableChapter(chapter) {
    return normalize([chapter.number, chapter.range, chapter.title, chapter.englishTitle, ...(chapter.keywords || [])].join(' '));
  }

  function searchableEntry(entry) {
    return normalize([entry.code, entry.title, entry.summary, entry.parent, ...(entry.keywords || []), ...(entry.includes || []), ...(entry.excludes || [])].join(' '));
  }

  function rank(item, queryTokens, primaryValues) {
    if (!queryTokens.length) return 0;
    const haystack = item.searchIndex;
    let score = 0;
    queryTokens.forEach(token => {
      if (primaryValues.some(value => normalize(value).startsWith(token))) score += 6;
      else if (haystack.includes(token)) score += 2;
    });
    return score;
  }

  function filterAll() {
    const query = $('#icdSmartSearch')?.value || '';
    const queryTokens = tokens(query);
    const level = $('#icdLevel')?.value || '';

    const chapters = (DATA.chapters || [])
      .map(chapter => ({ chapter, searchIndex: searchableChapter(chapter) }))
      .filter(item => queryTokens.every(token => item.searchIndex.includes(token)))
      .map(item => ({ ...item, score: rank(item, queryTokens, [item.chapter.number, item.chapter.range, item.chapter.title]) }))
      .sort((a, b) => b.score - a.score || (DATA.chapters || []).indexOf(a.chapter) - (DATA.chapters || []).indexOf(b.chapter))
      .map(item => item.chapter);

    const entries = (DATA.entries || [])
      .map(entry => ({ entry, searchIndex: searchableEntry(entry) }))
      .filter(item => queryTokens.every(token => item.searchIndex.includes(token)) && (!level || item.entry.level === level))
      .map(item => ({ ...item, score: rank(item, queryTokens, [item.entry.code, item.entry.title]) }))
      .sort((a, b) => b.score - a.score || a.entry.code.localeCompare(b.entry.code, 'sq'))
      .map(item => item.entry);

    $('#chapterGrid').innerHTML = chapters.length ? chapters.map(chapterCard).join('') : '<div class="med-empty">Nuk u gjet asnjë kapitull për këtë kërkim.</div>';
    $('#icdGrid').innerHTML = entries.length ? entries.map(codeCard).join('') : '<div class="med-empty">Nuk u gjet asnjë kod i detajuar për këtë kërkim.</div>';
    $('#chapterCount').textContent = `${chapters.length} / ${(DATA.chapters || []).length} kapituj`;
    $('#icdCount').textContent = `${entries.length} / ${(DATA.entries || []).length} kode`;
    $('#smartCount').textContent = `${chapters.length} kapituj · ${entries.length} kode`;
    const clear = $('#icdClear');
    if (clear) clear.hidden = !text(query);
  }

  function populateSuggestions() {
    const datalist = $('#icdSuggestions');
    if (!datalist) return;
    const chapterOptions = (DATA.chapters || []).flatMap(chapter => [
      `<option value="${esc(chapter.range)}">Kapitulli ${esc(chapter.number)} — ${esc(chapter.title)}</option>`,
      `<option value="${esc(chapter.title)}">Kapitulli ${esc(chapter.number)}</option>`
    ]);
    const codeOptions = (DATA.entries || []).flatMap(entry => [
      `<option value="${esc(entry.code)}">${esc(entry.title)}</option>`,
      `<option value="${esc(entry.title)}">${esc(entry.code)}</option>`
    ]);
    datalist.innerHTML = [...chapterOptions, ...codeOptions].join('');
  }

  function list(items, empty = 'Nuk ka shënim të veçantë.') {
    return items?.length ? `<ul>${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : `<p>${esc(empty)}</p>`;
  }

  function openEntry(code) {
    const entry = (DATA.entries || []).find(item => item.code === code);
    if (!entry) return;
    $('#detailKicker').textContent = `${DATA.version} · ${entry.code}`;
    $('#detailTitle').textContent = entry.title;
    $('#detailBody').innerHTML = `<div class="med-detail-grid"><section class="med-detail full"><strong>Përkufizimi praktik</strong><p>${esc(entry.summary)}</p></section><section class="med-detail"><strong>Përfshin</strong>${list(entry.includes)}</section><section class="med-detail"><strong>Përjashton</strong>${list(entry.excludes)}</section><section class="med-detail full"><strong>Shënime për kodim</strong>${list(entry.codingNotes)}</section><section class="med-detail full"><strong>Fjalë kyçe për kërkim</strong><p>${(entry.keywords || []).map(item => `<span class="med-chip">${esc(item)}</span>`).join(' ')}</p></section></div><div class="med-source"><strong>Burimi:</strong> WHO ICD-10, versioni 2019. Përkthimi është bërë në shqip për MedIndex; kodi dhe hierarkia ruhen sipas burimit. <a href="${esc(DATA.sourceUrl)}" target="_blank" rel="noopener noreferrer">Hape WHO ICD-10</a></div>`;
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
  }

  function init() {
    initTheme();
    populateSuggestions();
    $('#blockTitle').textContent = `${DATA.block.code} — ${DATA.block.title}`;
    $('#chapterTitle').textContent = `${DATA.chapter.code} · ${DATA.chapter.title}`;
    $('#whoBrowserLink').href = DATA.browserUrl || 'https://icd.who.int/browse10/2019/en';
    $('#icdSmartSearch')?.addEventListener('input', filterAll);
    $('#icdLevel')?.addEventListener('change', filterAll);
    $('#icdClear')?.addEventListener('click', () => {
      $('#icdSmartSearch').value = '';
      $('#icdSmartSearch').focus();
      filterAll();
    });
    $('#icdGrid')?.addEventListener('click', event => {
      const button = event.target.closest('[data-open-code]');
      if (button) openEntry(button.dataset.openCode);
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
    filterAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
