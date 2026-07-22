(() => {
  'use strict';
  const DATA = window.MEDINDEX_ICD10 || { entries: [] };
  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const normalize = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    $('#themeButton').textContent = theme === 'dark' ? '☀' : '☾';
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    applyTheme(saved === 'dark' || saved === 'light' ? saved : (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'));
    $('#themeButton').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  }

  function card(entry) {
    return `<article class="med-card" data-code="${esc(entry.code)}"><span class="med-card-code">${esc(entry.code)}</span><h3>${esc(entry.title)}</h3><p>${esc(entry.summary)}</p><div class="med-card-meta"><span class="med-chip">${esc(entry.level)}</span><span class="med-chip">Prindi: ${esc(entry.parent)}</span></div><button type="button" data-open-code="${esc(entry.code)}">Hape kodin</button></article>`;
  }

  function filterEntries() {
    const query = normalize($('#icdSearch').value);
    const level = $('#icdLevel').value;
    const entries = DATA.entries.filter(entry => {
      const haystack = normalize([entry.code, entry.title, entry.summary, ...(entry.keywords || []), ...(entry.includes || []), ...(entry.excludes || [])].join(' '));
      return (!query || haystack.includes(query)) && (!level || entry.level === level);
    });
    $('#icdGrid').innerHTML = entries.length ? entries.map(card).join('') : '<div class="med-empty">Nuk u gjet asnjë kod për këtë kërkim.</div>';
    $('#icdCount').textContent = `${entries.length} / ${DATA.entries.length} kode`;
  }

  function list(items, empty = 'Nuk ka shënim të veçantë.') {
    return items?.length ? `<ul>${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : `<p>${esc(empty)}</p>`;
  }

  function openEntry(code) {
    const entry = DATA.entries.find(item => item.code === code);
    if (!entry) return;
    $('#detailKicker').textContent = `${DATA.version} · ${entry.code}`;
    $('#detailTitle').textContent = entry.title;
    $('#detailBody').innerHTML = `<div class="med-detail-grid"><section class="med-detail full"><strong>Përkufizimi praktik</strong><p>${esc(entry.summary)}</p></section><section class="med-detail"><strong>Përfshin</strong>${list(entry.includes)}</section><section class="med-detail"><strong>Përjashton</strong>${list(entry.excludes)}</section><section class="med-detail full"><strong>Shënime për kodim</strong>${list(entry.codingNotes)}</section><section class="med-detail full"><strong>Fjalë kyçe për kërkim</strong><p>${(entry.keywords || []).map(item => `<span class="med-chip">${esc(item)}</span>`).join(' ')}</p></section></div><div class="med-source"><strong>Burimi:</strong> WHO ICD-10, versioni 2019. Përkthimi është bërë në shqip për MedIndex; kodi dhe hierarkia ruhen sipas burimit. <a href="${esc(DATA.sourceUrl)}" target="_blank" rel="noopener noreferrer">Hape WHO ICD‑10</a></div>`;
    $('#detailOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#detailClose').focus();
  }

  function closeEntry() {
    $('#detailOverlay').hidden = true;
    document.body.style.overflow = '';
  }

  function init() {
    initTheme();
    $('#blockTitle').textContent = `${DATA.block.code} — ${DATA.block.title}`;
    $('#chapterTitle').textContent = `${DATA.chapter.code} · ${DATA.chapter.title}`;
    $('#icdSearch').addEventListener('input', filterEntries);
    $('#icdLevel').addEventListener('change', filterEntries);
    $('#icdGrid').addEventListener('click', event => {
      const button = event.target.closest('[data-open-code]');
      if (button) openEntry(button.dataset.openCode);
    });
    $('#detailClose').addEventListener('click', closeEntry);
    $('#detailDone').addEventListener('click', closeEntry);
    $('#detailOverlay').addEventListener('click', event => { if (event.target.id === 'detailOverlay') closeEntry(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#detailOverlay').hidden) closeEntry(); });
    filterEntries();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();