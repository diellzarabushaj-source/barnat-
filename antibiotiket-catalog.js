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
  const legacy = [...column.children];

  const nav = document.createElement('div');
  nav.className = 'abx-catalog-modebar';
  nav.setAttribute('role', 'group');
  nav.setAttribute('aria-label', 'Pamjet e antibiotikëve');
  nav.innerHTML = '<button type="button" data-mode="catalog" aria-pressed="true">Tabela e antibiotikëve</button><button type="button" data-mode="guide" aria-pressed="false">Udhëzuesi sipas infeksionit (NICE)</button>';

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
    '<div class="abx-catalog-table-scroll" role="region" aria-label="Tabela e antibiotikëve" tabindex="0"><table class="abx-catalog-list"><thead><tr><th>✓</th><th>Grupi kryesor</th><th>Nën-grupi</th><th>Substanca aktive</th><th>Indikacionet</th><th>Format dhe forcat AKPPM</th><th>Statusi i dozimit</th><th>Detaje</th></tr></thead><tbody id="abxCatalogRows"></tbody></table></div>',
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
      return '<tr><td>' + esc(r.id) + '</td><td>' + esc(r.indication) + '<small class="abx-catalog-cell-note">' + esc(r.formulation) + ' · ' + esc(r.route) + '</small></td><td>' + esc(r.population) + '</td><td><b>' + esc(doseText(r)) + '</b><small class="abx-catalog-cell-note">' + esc(r.interval || '—') + '</small></td><td>' + esc(dur) + '</td><td><span class="abx-catalog-pill ' + (status === 'Bllokuar' ? 'is-missing' : '') + '">' + status + '</span><small class="abx-catalog-cell-note">' + esc(r.qaReason) + '</small></td><td>' + link + '</td></tr>';
    }).join('');
    return '<div class="abx-catalog-detail"><section><h3>Indikacionet Mayo</h3><div class="abx-catalog-inline-items">' + ind + '</div></section><section><h3>Produktet e identifikuara në AKPPM (' + a.products.length + ')</h3><div class="abx-catalog-product-list">' + products + '</div></section><section><h3>Skemat Mayo (' + a.regimens.length + ') — referencë</h3><p class="abx-catalog-critical">Llogaritja mg/kg → mL është e bllokuar. Kontrollo AUDIT QA, SmPC lokale, indikacionin, moshën dhe peshën reale para çdo përshkrimi.</p><div class="abx-catalog-subtable-scroll"><table class="abx-catalog-subtable"><thead><tr><th>ID</th><th>Indikacioni / forma</th><th>Popullata</th><th>Doza Mayo</th><th>Ditë</th><th>QA</th><th>Burimi</th></tr></thead><tbody>' + doses + '</tbody></table></div></section></div>';
  }
  function render() {
    const visible = core.filterAntibiotics(all, filters, selected);
    $('abxCatalogCount').textContent = visible.length + ' / ' + all.length + ' antibiotikë';
    $('abxCatalogSelectedCount').textContent = selected.length + ' në Listën time';
    if (!visible.length) {
      body.innerHTML = '<tr><td colspan="8" class="abx-catalog-empty">Nuk ka rezultate. Ndrysho filtrat ose përdor “Pastro filtrat”.</td></tr>';
      return;
    }
    body.innerHTML = visible.map(a => {
      const isSelected = selected.includes(a.atc);
      const open = expanded.has(a.atc);
      const indications = a.indications.slice(0, 4).join(' · ');
      const forms = a.products.length ? [...new Set(a.products.map(p => p.form + ' ' + p.strength))].slice(0, 3).join(' · ') : 'Nuk u gjet në AKPPM';
      const status = a.regimens.some(r => r.qaStatus === 'RISHIKIM KLINIK') ? 'Në rishikim' : 'Të bllokuara';
      return '<tr class="abx-catalog-item-row"><td><input type="checkbox" data-atc="' + esc(a.atc) + '" aria-label="Shto ' + esc(a.name) + ' në Listën time" ' + (isSelected ? 'checked' : '') + '></td><td>' + esc(a.group) + '</td><td>' + esc(a.subgroup) + '</td><td><strong class="abx-catalog-name">' + esc(a.name) + '</strong><small class="abx-catalog-atc">' + esc(a.atc) + '</small></td><td><span class="abx-catalog-clamp">' + esc(indications) + '</span>' + (a.indications.length > 4 ? '<small class="abx-catalog-cell-note">+' + (a.indications.length - 4) + ' indikacione të tjera</small>' : '') + '</td><td><span class="abx-catalog-clamp">' + esc(forms) + '</span><small class="abx-catalog-cell-note">' + a.products.length + ' regjistrime AKPPM</small></td><td><span class="abx-catalog-pill ' + (status === 'Të bllokuara' ? 'is-missing' : '') + '">' + status + '</span><small class="abx-catalog-cell-note">' + a.regimens.length + ' skema</small></td><td><button type="button" class="abx-catalog-details-button" data-detail="' + esc(a.atc) + '" aria-expanded="' + open + '">' + (open ? 'Mbyll' : 'Shiko') + '</button></td></tr>' + (open ? '<tr class="abx-catalog-detail-row"><td colspan="8">' + detail(a) + '</td></tr>' : '');
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
  column.prepend(nav, view);
  function setMode(mode) {
    const show = mode === 'catalog';
    view.hidden = !show;
    legacy.forEach(el => { el.classList.toggle('abx-catalog-legacy-hidden', show); el.setAttribute('aria-hidden', String(show)); });
    nav.querySelectorAll('button[data-mode]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode)));
  }
  nav.addEventListener('click', e => {
    const button = e.target.closest('button[data-mode]');
    if (button) setMode(button.dataset.mode);
  });
  setMode('catalog');
})();
