(() => {
  'use strict';

  const DATA = window.MEDINDEX_LABS || { systems: [], tests: [] };
  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const normalize = value => text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sq');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));

  const systems = new Map((DATA.systems || []).map(system => [system.id, system]));
  const tests = Array.isArray(DATA.tests) ? DATA.tests : [];
  const searchable = tests.map(test => ({
    test,
    index: normalize([
      test.name, test.abbr, test.reference, test.unit, test.specimen,
      test.alternateReference, test.referenceNote, test.sourceLabel,
      systems.get(test.system)?.title
    ].join(' '))
  }));

  function systemById(id) {
    return systems.get(id) || { title: id, description: '' };
  }

  function hasPrintedReference(test) {
    return text(test.reference) && !normalize(test.reference).startsWith('nuk eshte shenuar');
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    const button = $('#themeButton');
    if (button) button.textContent = theme === 'dark' ? '☀' : '☾';
  }

  function initTheme() {
    let saved = '';
    try { saved = localStorage.getItem(THEME_KEY) || ''; } catch {}
    const theme = ['dark', 'light'].includes(saved)
      ? saved
      : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(theme);
    $('#themeButton')?.addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
  }

  function rangeMarkup(test, compact = false) {
    const primary = `<div class="med-range${hasPrintedReference(test) ? '' : ' is-missing'}">
      ${esc(test.reference || 'Nuk është shënuar në formular')}
      ${test.unit ? `<span>${esc(test.unit)}</span>` : ''}
      ${compact ? `<small>${esc(test.specimen || 'Mostra nuk është shënuar')}</small>` : ''}
    </div>`;
    const alternate = test.alternateReference
      ? `<div class="lab-alt-range"><strong>Intervali i aparatit:</strong> ${esc(test.alternateReference)}</div>`
      : '';
    return primary + alternate;
  }

  function testCard(test) {
    const system = systemById(test.system);
    return `<article class="med-card lab-card" data-test-id="${esc(test.id)}">
      <div class="lab-card-head">
        <span class="med-card-code">${esc(test.abbr || test.name)}</span>
        <span class="med-chip lab-local">Nga formulari</span>
      </div>
      <h3>${esc(test.name)}</h3>
      ${rangeMarkup(test, true)}
      <div class="med-card-meta"><span class="med-chip">${esc(system.title)}</span></div>
      <button type="button" data-open-test="${esc(test.id)}">Shiko detajet</button>
    </article>`;
  }

  function selectedTests() {
    const query = normalize($('#labSearch')?.value);
    const system = $('#labSystem')?.value || '';
    const scope = $('#labScope')?.value || '';
    return searchable
      .filter(({ test, index }) =>
        (!query || index.includes(query))
        && (!system || test.system === system)
        && (scope !== 'with-reference' || hasPrintedReference(test))
        && (scope !== 'without-reference' || !hasPrintedReference(test))
      )
      .map(item => item.test);
  }

  function renderSystems() {
    const select = $('#labSystem');
    if (!select) return;
    select.innerHTML = '<option value="">Të gjitha seksionet</option>' + (DATA.systems || []).map(system =>
      `<option value="${esc(system.id)}">${esc(system.title)}</option>`
    ).join('');
  }

  function render() {
    const visible = selectedTests();
    const grid = $('#labGrid');
    if (!grid) return;
    grid.innerHTML = visible.length
      ? visible.map(testCard).join('')
      : '<div class="med-empty">Nuk u gjet asnjë analizë në formularët e dërguar për këtë kërkim.</div>';
    $('#labCount').textContent = `${visible.length} / ${tests.length} analiza`;

    const systemId = $('#labSystem')?.value || '';
    const heading = systemId ? systemById(systemId) : null;
    $('#labSectionTitle').textContent = heading?.title || 'Analizat nga formularët e dërguar';
    $('#labSectionSubtitle').textContent = heading?.description || DATA.sourcePolicy || '';
  }

  let renderTimer = 0;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 45);
  }

  function detail(label, body, full = false) {
    if (!text(body)) return '';
    return `<section class="med-detail${full ? ' full' : ''}"><strong>${esc(label)}</strong><p>${esc(body)}</p></section>`;
  }

  function openTest(id) {
    const test = tests.find(item => item.id === id);
    if (!test) return;
    const system = systemById(test.system);
    $('#detailKicker').textContent = `${system.title} · ${test.abbr || test.name}`;
    $('#detailTitle').textContent = test.name;
    $('#detailBody').innerHTML = `
      <div class="med-detail-grid">
        <section class="med-detail full">
          <strong>Vlera referente e transkriptuar</strong>
          ${rangeMarkup(test)}
        </section>
        ${detail('Mostra', test.specimen)}
        ${detail('Interval alternativ', test.alternateReference)}
        ${detail('Shënim i transkriptimit', test.referenceNote, true)}
        ${detail('Burimi', test.sourceLabel, true)}
      </div>
      <div class="med-source">
        <strong>Kujdes:</strong> ${esc(DATA.disclaimer || '')}
      </div>`;
    $('#detailOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#detailClose')?.focus();
  }

  function closeDetail() {
    $('#detailOverlay').hidden = true;
    document.body.style.overflow = '';
  }

  function addLocalStyles() {
    if ($('#labLocalStyles')) return;
    const style = document.createElement('style');
    style.id = 'labLocalStyles';
    style.textContent = `
      .lab-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .lab-local{background:#fff0d8;color:#7b4c0b}
      .med-range>span{margin-left:4px;font-family:inherit;font-weight:700}
      .med-range.is-missing{font-size:.88rem;color:var(--muted)}
      .lab-alt-range{margin-top:7px;padding:7px 9px;border-left:3px solid var(--amber);border-radius:6px;background:rgba(199,125,31,.09);font-size:.7rem;line-height:1.4;color:var(--muted)}
      .lab-alt-range strong{color:var(--ink)}
      .lab-source-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:16px 0}
      .lab-source-strip div{padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--paper)}
      .lab-source-strip strong{display:block;color:var(--teal-dark);font-size:.78rem}
      .lab-source-strip span{display:block;margin-top:4px;color:var(--muted);font-size:.7rem;line-height:1.4}
      html[data-theme=dark] .lab-local{background:#44331e;color:#efcf99}
      html[data-theme=dark] .lab-alt-range{background:#33291c}
      html[data-theme=dark] .lab-alt-range strong{color:#f2e8d7}
      @media(max-width:650px){.lab-source-strip{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function init() {
    addLocalStyles();
    initTheme();
    renderSystems();
    $('#labSearch')?.addEventListener('input', scheduleRender);
    $('#labSystem')?.addEventListener('change', render);
    $('#labScope')?.addEventListener('change', render);
    $('#labGrid')?.addEventListener('click', event => {
      const button = event.target.closest('[data-open-test]');
      if (button) openTest(button.dataset.openTest);
    });
    $('#detailClose')?.addEventListener('click', closeDetail);
    $('#detailDone')?.addEventListener('click', closeDetail);
    $('#detailOverlay')?.addEventListener('click', event => {
      if (event.target.id === 'detailOverlay') closeDetail();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !$('#detailOverlay')?.hidden) closeDetail();
    });
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
