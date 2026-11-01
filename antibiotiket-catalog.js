(function () {
  'use strict';
  const data = window.DRX_ANTIBIOTIC_CATALOG;
  const core = window.DRX_ANTIBIOTIC_CATALOG_CORE;
  const column = document.querySelector('.abx-column');
  if (!data || !core || !column || !Array.isArray(data.antibiotics)) return;
  const all = data.antibiotics;
  const key = 'drx.antibiotics.selected.v1';
  const allowed = new Set(all.map(a => a.atc));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safe = url => /^https:\/\//i.test(String(url || '')) ? String(url) : '';
  let selected = [];
  try { selected = core.readSelected(localStorage.getItem(key), [...allowed]); } catch { selected = []; }
  const expanded = new Set();
  const filters = {search:'',group:'',subgroup:'',indication:'',route:'',selectedOnly:false};
  const view = document.createElement('section');
  view.id = 'antibioticsCatalog';
  view.className = 'abx-catalog';
  view.setAttribute('aria-label', 'Katalogu i antibiotikëve');
  view.innerHTML = [
    '<header class="abx-catalog-heading"><div><h1>Antibiotikët</h1><p>Substancat, grupet, indikacionet dhe format e regjistruara në Kosovë.</p></div><span id="abxCatalogCount" class="abx-catalog-count"></span></header>',
    '<div class="abx-catalog-alert"><strong>Dozat dhe indikacionet nga Mayo janë referencë, jo rekomandim i miratuar për trajtim.</strong> Auditimi Mayo/AKPPM nuk ka miratuar ende asnjë skemë për llogaritje automatike. Tick-u krijon vetëm Listën time, jo miratim klinik.</div>',
    '<div class="abx-catalog-controls">',
    '<label class="abx-catalog-search">Kërko substancë, indikacion ose produkt<input type="search" id="abxCatalogSearch" placeholder="P.sh. otit, amoxicillin, OSPEN…" autocomplete="off"></label>',
    '<label>Grupi kryesor<select id="abxCatalogGroup"></select></label>',
    '<label>Nën-grupi<select id="abxCatalogSubgroup"></select></label>',
    '<label>Indikacioni<select id="abxCatalogIndication"></select></label>',
    '<label>Rruga<select id="abxCatalogRoute"><option value="">Të gjitha rrugët</option><option>PO</option><option>IV</option><option>IM</option><option>TOP</option><option>Inhalim</option></select></label>',
    '</div>',
    '<div class="abx-catalog-toolbar"><label class="abx-catalog-checklabel"><input type="checkbox" id="abxCatalogOnlySelected"> Vetëm të zgjedhurit</label><button type="button" id="abxCatalogReset" class="abx-catalog-reset">Pastro filtrat</button><span id="abxCatalogSelectedCount" class="abx-catalog-selected-count" role="status"></span></div>',
    '<div class="abx-catalog-list" id="abxCatalogRows" role="list" aria-label="Lista e antibiotikëve"></div>',
    '<div class="abx-catalog-footer"><span>AKPPM: mostër e regjistrit, jo inventar farmacie. Tick-u ruhet në këtë shfletues.</span><span><a target="_blank" rel="noopener noreferrer" href="' + esc(safe(data.sourceSheet)) + '">Mayo / Audit QA</a> · <a target="_blank" rel="noopener noreferrer" href="' + esc(safe(data.akppmRegistry)) + '">AKPPM</a></span></div>'
  ].join('');
  const $ = id => view.querySelector('#' + id);
  const body = $('abxCatalogRows');

  function options(id, values, placeholder, current) {
    const select = $(id);
    select.replaceChildren();
    const first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    select.append(first);
    values.forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.append(option);
    });
    select.value = values.includes(current) ? current : '';
  }
  const sorted = values => [...new Set(values)].sort((a,b) => a.localeCompare(b, 'sq'));
  function refreshSubgroups() {
    options('abxCatalogSubgroup', sorted(all.filter(a => !filters.group || a.group === filters.group).map(a => a.subgroup)), 'Të gjithë nëngrupet', filters.subgroup);
    filters.subgroup = $('abxCatalogSubgroup').value;
  }
  function doseText(r) {
    if (r.doseMin == null) return 'Nuk jepet dozë numerike e aktivizueshme';
    const values = String(r.doseMin) + (r.doseMax != null && r.doseMax !== r.doseMin ? '–' + r.doseMax : '');
    return values + ' ' + String(r.doseUnit || '');
  }
  function detail(a) {
    const ind = a.indications.map(x => '<span>' + esc(x) + '</span>').join('');
    const products = a.products.length
      ? a.products.map(p => '<div class="abx-catalog-product"><b>' + esc(p.brand) + '</b>' + esc(p.strength) + ' · ' + esc(p.form) + '<small>MA/RMA: ' + esc(p.registration) + '</small></div>').join('')
      : '<p>Nuk u gjet produkt aktiv AKPPM në mostrën e kontrolluar.</p>';
    const doses = a.regimens.map(r => {
      const dur = r.daysMin == null && r.daysMax == null ? 'Nuk specifikohet' : String(r.daysMin ?? r.daysMax) + (r.daysMax != null && r.daysMin !== r.daysMax ? '–' + r.daysMax : '') + ' ditë';
      const status = r.qaStatus === 'RISHIKIM KLINIK' ? 'Në rishikim' : 'Bllokuar';
      const link = safe(r.mayoUrl) ? '<a href="' + esc(r.mayoUrl) + '" target="_blank" rel="noopener noreferrer">Mayo</a>' : 'Burimi numerik mungon';
      const limit = r.maxDaily != null ? ' · Maksimumi nga burimi: ' + esc(r.maxDaily) + ' mg/ditë' : '';
      return '<li class="abx-catalog-regimen"><div class="abx-catalog-regimen-heading"><strong>' + esc(r.id) + ' · ' + esc(r.indication) + '</strong><span class="abx-catalog-pill ' + (status === 'Bllokuar' ? 'is-missing' : '') + '">' + status + '</span></div><p><b>Forma / rruga:</b> ' + esc(r.formulation) + ' · ' + esc(r.route) + ' · <b>Popullata:</b> ' + esc(r.population) + '</p><p><b>Doza sipas Mayo:</b> ' + esc(doseText(r)) + ' · ' + esc(r.interval || '—') + ' · <b>Kohëzgjatja:</b> ' + esc(dur) + '</p><p><b>Shënime / kufizime:</b> ' + esc(r.note || 'Nuk janë dhënë shënime shtesë.') + limit + '</p><p class="abx-catalog-regimen-qa"><b>Kontrolli klinik:</b> ' + esc(r.qaReason) + '</p><p class="abx-catalog-regimen-source">Burimi: ' + link + '</p></li>';
    }).join('');
    return '<div class="abx-catalog-detail"><section><h3>Indikacionet Mayo</h3><div class="abx-catalog-inline-items">' + ind + '</div></section><section><h3>Produktet e identifikuara në AKPPM (' + a.products.length + ')</h3><div class="abx-catalog-product-list">' + products + '</div></section><section><h3>Skemat Mayo (' + a.regimens.length + ') — referencë</h3><p class="abx-catalog-critical">Llogaritja mg/kg → mL është e bllokuar. Kontrollo AUDIT QA, SmPC lokale, indikacionin, moshën dhe peshën reale para çdo përshkrimi.</p><ul class="abx-catalog-regimens">' + doses + '</ul></section></div>';
  }
  function render() {
    const visible = core.filterAntibiotics(all, filters, selected);
    $('abxCatalogCount').textContent = visible.length + ' / ' + all.length + ' antibiotikë';
    $('abxCatalogSelectedCount').textContent = selected.length + ' në Listën time';
    if (!visible.length) {
      body.innerHTML = '<p class="abx-catalog-empty">Nuk ka rezultate. Ndrysho filtrat ose përdor “Pastro filtrat”.</p>';
      return;
    }
    body.innerHTML = visible.map(a => {
      const isSelected = selected.includes(a.atc);
      const open = expanded.has(a.atc);
      const indications = a.indications.slice(0, 4).join(' · ');
      const forms = a.products.length ? [...new Set(a.products.map(p => p.form + ' ' + p.strength))].slice(0, 3).join(' · ') : 'Nuk u gjet në AKPPM';
      const status = a.regimens.some(r => r.qaStatus === 'RISHIKIM KLINIK') ? 'Në rishikim' : 'Të bllokuara';
      return '<article class="abx-catalog-item" role="listitem"><div class="abx-catalog-item-row"><label class="abx-catalog-item-check"><input type="checkbox" data-atc="' + esc(a.atc) + '" aria-label="Shto ' + esc(a.name) + ' në Listën time" ' + (isSelected ? 'checked' : '') + '></label><div class="abx-catalog-item-copy"><div class="abx-catalog-title-line"><strong class="abx-catalog-name">' + esc(a.name) + '</strong><span class="abx-catalog-atc">' + esc(a.atc) + '</span></div><p class="abx-catalog-taxonomy">' + esc(a.group) + ' <span aria-hidden="true">›</span> ' + esc(a.subgroup) + '</p><p class="abx-catalog-summary"><b>Indikacionet:</b> ' + esc(indications) + (a.indications.length > 4 ? ' · +' + (a.indications.length - 4) + ' të tjera' : '') + '</p><p class="abx-catalog-summary"><b>Forma / fortësia AKPPM:</b> ' + esc(forms) + ' <span class="abx-catalog-muted">(' + a.products.length + ' produkte)</span></p></div><div class="abx-catalog-item-actions"><span class="abx-catalog-pill ' + (status === 'Të bllokuara' ? 'is-missing' : '') + '">' + status + '</span><small class="abx-catalog-cell-note">' + a.regimens.length + ' skema</small><button type="button" class="abx-catalog-details-button" data-detail="' + esc(a.atc) + '" aria-expanded="' + open + '">' + (open ? 'Mbyll detajet' : 'Shiko detajet') + '</button></div></div>' + (open ? detail(a) : '') + '</article>';
    }).join('');
  }
  function save() { try { localStorage.setItem(key, JSON.stringify(selected)); } catch { /* In-memory fallback. */ } }
  body.addEventListener('change', event => {
    const atc = event.target?.dataset?.atc;
    if (!allowed.has(atc)) return;
    selected = event.target.checked ? [...new Set([...selected, atc])] : selected.filter(x => x !== atc);
    save(); render();
  });
  body.addEventListener('click', event => {
    const button = event.target.closest('button[data-detail]');
    if (!button || !allowed.has(button.dataset.detail)) return;
    if (expanded.has(button.dataset.detail)) expanded.delete(button.dataset.detail);
    else expanded.add(button.dataset.detail);
    render();
  });
  $('abxCatalogSearch').addEventListener('input', e => { filters.search = e.target.value; render(); });
  $('abxCatalogGroup').addEventListener('change', e => { filters.group = e.target.value; refreshSubgroups(); render(); });
  $('abxCatalogSubgroup').addEventListener('change', e => { filters.subgroup = e.target.value; render(); });
  $('abxCatalogIndication').addEventListener('change', e => { filters.indication = e.target.value; render(); });
  $('abxCatalogRoute').addEventListener('change', e => { filters.route = e.target.value; render(); });
  $('abxCatalogOnlySelected').addEventListener('change', e => { filters.selectedOnly = e.target.checked; render(); });
  $('abxCatalogReset').addEventListener('click', () => {
    Object.assign(filters, {search:'',group:'',subgroup:'',indication:'',route:'',selectedOnly:false});
    ['abxCatalogSearch','abxCatalogGroup','abxCatalogIndication','abxCatalogRoute'].forEach(id => { $(id).value = ''; });
    $('abxCatalogOnlySelected').checked = false;
    refreshSubgroups(); render();
  });
  options('abxCatalogGroup', sorted(all.map(a => a.group)), 'Të gjitha grupet', '');
  options('abxCatalogIndication', sorted(all.flatMap(a => a.indications)), 'Të gjitha indikacionet', '');
  refreshSubgroups(); render();
  column.append(view);
})();
