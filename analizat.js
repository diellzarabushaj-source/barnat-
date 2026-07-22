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

  function systemById(id) {
    return DATA.systems.find(system => system.id === id) || { title: id, description: '' };
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

  function testCard(test) {
    const system = systemById(test.system);
    return `<article class="med-card lab-card" data-test-id="${esc(test.id)}">
      <div class="lab-card-head">
        <span class="med-card-code">${esc(test.abbr || test.name)}</span>
        ${test.kosovoCore ? '<span class="med-chip lab-local">Bazë në QKMF</span>' : ''}
      </div>
      <h3>${esc(test.name)}</h3>
      <p>${esc(test.why)}</p>
      <div class="med-range">${esc(test.reference)} ${test.unit ? `<span>${esc(test.unit)}</span>` : ''}<small>${esc(test.specimen)}</small></div>
      <div class="med-card-meta"><span class="med-chip">${esc(system.title)}</span></div>
      <button type="button" data-open-test="${esc(test.id)}">Shiko interpretimin</button>
    </article>`;
  }

  function selectedTests() {
    const query = normalize($('#labSearch')?.value);
    const system = $('#labSystem')?.value || '';
    const scope = $('#labScope')?.value || '';
    return DATA.tests.filter(test => {
      const haystack = normalize([
        test.name, test.abbr, test.reference, test.unit, test.specimen,
        test.why, test.high, test.low, test.preparation,
        systemById(test.system).title
      ].join(' '));
      return (!query || haystack.includes(query))
        && (!system || test.system === system)
        && (scope !== 'kosovo-core' || test.kosovoCore === true);
    });
  }

  function renderSystems() {
    const select = $('#labSystem');
    if (!select) return;
    select.innerHTML = '<option value="">Të gjitha sistemet</option>' + DATA.systems.map(system =>
      `<option value="${esc(system.id)}">${esc(system.title)}</option>`
    ).join('');
  }

  function render() {
    const tests = selectedTests();
    const grid = $('#labGrid');
    if (!grid) return;
    grid.innerHTML = tests.length
      ? tests.map(testCard).join('')
      : '<div class="med-empty">Nuk u gjet asnjë analizë për këtë kërkim ose filtër.</div>';
    $('#labCount').textContent = `${tests.length} / ${DATA.tests.length} analiza`;

    const systemId = $('#labSystem')?.value || '';
    const heading = systemId ? systemById(systemId) : null;
    $('#labSectionTitle').textContent = heading?.title || 'Analizat sipas sistemeve';
    $('#labSectionSubtitle').textContent = heading?.description || 'Kërko analizën ose zgjidhe sistemin për ta parë panelin e plotë.';
  }

  function detail(label, body, full = false) {
    return `<section class="med-detail${full ? ' full' : ''}"><strong>${esc(label)}</strong><p>${esc(body || 'Nuk ka shënim të veçantë.')}</p></section>`;
  }

  function openTest(id) {
    const test = DATA.tests.find(item => item.id === id);
    if (!test) return;
    const system = systemById(test.system);
    $('#detailKicker').textContent = `${system.title} · ${test.abbr || test.name}`;
    $('#detailTitle').textContent = test.name;
    $('#detailBody').innerHTML = `
      <div class="med-detail-grid">
        <section class="med-detail full">
          <strong>Vlera referente orientuese</strong>
          <div class="med-range">${esc(test.reference)} ${test.unit ? `<span>${esc(test.unit)}</span>` : ''}<small>Mostra: ${esc(test.specimen)}</small></div>
        </section>
        ${detail('Pse bëhet', test.why, true)}
        ${detail('Kur është e rritur / pozitive', test.high)}
        ${detail('Kur është e ulët / negative', test.low)}
        ${detail('Përgatitja dhe kujdesi', test.preparation, true)}
      </div>
      <div class="med-source">
        <strong>Kujdes:</strong> ${esc(DATA.disclaimer)}
        ${test.sourceUrl ? `<br><a href="${esc(test.sourceUrl)}" target="_blank" rel="noopener noreferrer">Hape burimin e intervalit/interpretimit</a>` : ''}
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
      .lab-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.lab-local{background:#fff0d8;color:#7b4c0b}.med-range>span{margin-left:4px;font-family:inherit;font-weight:700}.lab-source-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:16px 0}.lab-source-strip div{padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--paper)}.lab-source-strip strong{display:block;color:var(--teal-dark);font-size:.78rem}.lab-source-strip span{display:block;margin-top:4px;color:var(--muted);font-size:.7rem;line-height:1.4}
      html[data-theme=dark] .lab-local{background:#44331e;color:#efcf99}
      @media(max-width:650px){.lab-source-strip{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function init() {
    addLocalStyles();
    initTheme();
    renderSystems();
    $('#labSearch')?.addEventListener('input', render);
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