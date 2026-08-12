(() => {
  'use strict';

  const VERSION = 'registry-mobile-filters-v1';
  const MOBILE_QUERY = '(max-width: 767px)';
  if (!window.matchMedia?.(MOBILE_QUERY).matches) return;

  let registry = window.MedIndexMobileRegistry || null;
  let sheet = null;
  let lastFocused = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function ensureStyles() {
    if (document.getElementById('registryMobileFiltersStyles')) return;
    const style = document.createElement('style');
    style.id = 'registryMobileFiltersStyles';
    style.textContent = `
      @media(max-width:767px){
        html[data-registry-mobile-server] #statusFilter,
        html[data-registry-mobile-server] #pageSize{display:none!important}
        html[data-registry-mobile-server] #formPickerBtn{
          width:100%!important;min-height:48px!important;border:1px solid #d0d5dd!important;border-radius:12px!important;
          background:#fff!important;color:#344054!important;font-size:14px!important;font-weight:650!important
        }
        .registry-mobile-filter-trigger-count{
          display:inline-grid;place-items:center;min-width:20px;height:20px;margin-left:6px;padding:0 6px;border-radius:999px;
          background:#0f766e;color:#fff;font-size:11px;font-weight:750
        }
        .registry-mobile-filters[hidden]{display:none!important}
        .registry-mobile-filters{position:fixed;inset:0;z-index:2400;display:flex;align-items:flex-end;justify-content:center}
        .registry-mobile-filters-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.52);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
        .registry-mobile-filters-sheet{
          position:relative;z-index:1;width:100%;max-height:min(86dvh,760px);overflow:hidden;border-radius:24px 24px 0 0;
          background:#fff;box-shadow:0 -22px 60px rgba(15,23,42,.22);padding-bottom:env(safe-area-inset-bottom,0px)
        }
        .registry-mobile-filters-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px 12px;border-bottom:1px solid #eaecf0}
        .registry-mobile-filters-head h2{margin:0;color:#101828;font-size:20px;line-height:1.15;letter-spacing:-.03em}
        .registry-mobile-filters-head p{margin:3px 0 0;color:#667085;font-size:12px}
        .registry-mobile-filters-close{width:44px;height:44px;border:0;border-radius:13px;background:#f2f4f7;color:#344054;font-size:24px}
        .registry-mobile-filters-body{display:grid;gap:16px;max-height:calc(86dvh - 146px);overflow:auto;padding:16px 18px 22px;-webkit-overflow-scrolling:touch}
        .registry-mobile-filter-field{display:grid;gap:7px}
        .registry-mobile-filter-field>span{color:#344054;font-size:12px;font-weight:700}
        .registry-mobile-filter-field input,.registry-mobile-filter-field select{
          width:100%;height:48px;box-sizing:border-box;border:1px solid #d0d5dd;border-radius:12px;background:#fff;color:#101828;
          padding:0 12px;font-size:16px;outline:none
        }
        .registry-mobile-filter-field input:focus,.registry-mobile-filter-field select:focus{border-color:#0f766e;box-shadow:0 0 0 3px rgba(15,118,110,.12)}
        .registry-mobile-filter-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .registry-mobile-filter-chips{display:flex;gap:8px;overflow:auto;padding-bottom:2px;scrollbar-width:none}
        .registry-mobile-filter-chips::-webkit-scrollbar{display:none}
        .registry-mobile-filter-chip{flex:0 0 auto;min-height:40px;padding:0 13px;border:1px solid #d0d5dd;border-radius:999px;background:#fff;color:#344054;font-size:13px;font-weight:650}
        .registry-mobile-filter-chip[aria-pressed="true"]{border-color:#0f766e;background:#f0fdfa;color:#0f766e}
        .registry-mobile-filters-actions{position:sticky;bottom:0;display:grid;grid-template-columns:.72fr 1.28fr;gap:10px;padding:12px 18px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid #eaecf0;background:rgba(255,255,255,.96)}
        .registry-mobile-filters-actions button{min-height:48px;border-radius:13px;font-size:14px;font-weight:750}
        .registry-mobile-filter-clear{border:1px solid #d0d5dd;background:#fff;color:#344054}
        .registry-mobile-filter-apply{border:1px solid #0f766e;background:#0f766e;color:#fff}
        body.registry-mobile-filters-open{overflow:hidden!important}
      }
    `;
    document.head.appendChild(style);
  }

  function activeCount(state) {
    return [state?.status, state?.formQuery, state?.atc, Number(state?.pageSize) === 50 ? '50' : ''].filter(Boolean).length;
  }

  function syncTrigger() {
    const button = document.getElementById('formPickerBtn');
    if (!button || !registry) return;
    const state = registry.getState();
    const count = activeCount(state);
    button.innerHTML = `Filtra${count ? `<span class="registry-mobile-filter-trigger-count">${count}</span>` : ''}`;
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', String(Boolean(sheet && !sheet.hidden)));
  }

  function ensureSheet() {
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'registryMobileFilters';
    sheet.className = 'registry-mobile-filters';
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="registry-mobile-filters-backdrop" data-registry-mobile-filter-close></div>
      <section class="registry-mobile-filters-sheet" role="dialog" aria-modal="true" aria-labelledby="registryMobileFiltersTitle">
        <div class="registry-mobile-filters-head">
          <div><h2 id="registryMobileFiltersTitle">Filtrat</h2><p>Gjej barnat me sa më pak hapa.</p></div>
          <button type="button" class="registry-mobile-filters-close" data-registry-mobile-filter-close aria-label="Mbyll filtrat">×</button>
        </div>
        <div class="registry-mobile-filters-body">
          <div class="registry-mobile-filter-field">
            <span>Statusi</span>
            <div class="registry-mobile-filter-chips" data-filter-status-chips>
              <button type="button" class="registry-mobile-filter-chip" data-status="" aria-pressed="true">Të gjitha</button>
              <button type="button" class="registry-mobile-filter-chip" data-status="Gjenerik" aria-pressed="false">Gjenerik</button>
              <button type="button" class="registry-mobile-filter-chip" data-status="Origjinator" aria-pressed="false">Origjinator</button>
            </div>
          </div>
          <label class="registry-mobile-filter-field"><span>Forma farmaceutike</span><input type="search" data-filter-form placeholder="p.sh. tablet, capsule, syrup" autocomplete="off"></label>
          <label class="registry-mobile-filter-field"><span>ATC</span><input type="text" data-filter-atc placeholder="p.sh. N02, J01, C09" maxlength="12" autocapitalize="characters"></label>
          <div class="registry-mobile-filter-grid">
            <label class="registry-mobile-filter-field"><span>Rezultate / faqe</span><select data-filter-page-size><option value="25">25</option><option value="50">50</option></select></label>
            <label class="registry-mobile-filter-field"><span>Rendit sipas</span><select data-filter-sort><option value="registry">Renditjes</option><option value="name">Emrit</option><option value="substance">Substancës</option><option value="atc">ATC</option><option value="form">Formës</option></select></label>
          </div>
          <label class="registry-mobile-filter-field"><span>Drejtimi</span><select data-filter-direction><option value="asc">A → Z</option><option value="desc">Z → A</option></select></label>
        </div>
        <div class="registry-mobile-filters-actions">
          <button type="button" class="registry-mobile-filter-clear" data-filter-clear>Pastro</button>
          <button type="button" class="registry-mobile-filter-apply" data-filter-apply>Shfaq rezultatet</button>
        </div>
      </section>`;
    document.body.appendChild(sheet);

    sheet.querySelectorAll('[data-registry-mobile-filter-close]').forEach(control => control.addEventListener('click', close));
    sheet.querySelectorAll('[data-status]').forEach(chip => chip.addEventListener('click', () => {
      sheet.querySelectorAll('[data-status]').forEach(item => item.setAttribute('aria-pressed', String(item === chip)));
    }));
    sheet.querySelector('[data-filter-clear]')?.addEventListener('click', () => {
      sheet.querySelector('[data-filter-form]').value = '';
      sheet.querySelector('[data-filter-atc]').value = '';
      sheet.querySelector('[data-filter-page-size]').value = '25';
      sheet.querySelector('[data-filter-sort]').value = 'registry';
      sheet.querySelector('[data-filter-direction]').value = 'asc';
      sheet.querySelectorAll('[data-status]').forEach(chip => chip.setAttribute('aria-pressed', String(chip.dataset.status === '')));
    });
    sheet.querySelector('[data-filter-apply]')?.addEventListener('click', () => {
      if (!registry) return;
      const selectedStatus = [...sheet.querySelectorAll('[data-status]')].find(chip => chip.getAttribute('aria-pressed') === 'true')?.dataset.status || '';
      registry.setFilters({
        status:selectedStatus,
        formQuery:sheet.querySelector('[data-filter-form]')?.value || '',
        atc:sheet.querySelector('[data-filter-atc]')?.value || '',
        pageSize:Number(sheet.querySelector('[data-filter-page-size]')?.value || 25),
        sort:sheet.querySelector('[data-filter-sort]')?.value || 'registry',
        direction:sheet.querySelector('[data-filter-direction]')?.value || 'asc',
      }, { reason:'mobile-filter-sheet', scroll:true });
      close();
    });
    sheet.addEventListener('keydown', event => {
      if (event.key === 'Escape') close();
    });
    return sheet;
  }

  function fillFromState() {
    if (!registry) return;
    const panel = ensureSheet();
    const state = registry.getState();
    panel.querySelector('[data-filter-form]').value = state.formQuery || '';
    panel.querySelector('[data-filter-atc]').value = state.atc || '';
    panel.querySelector('[data-filter-page-size]').value = String(state.pageSize || 25);
    panel.querySelector('[data-filter-sort]').value = state.sort || 'registry';
    panel.querySelector('[data-filter-direction]').value = state.direction || 'asc';
    panel.querySelectorAll('[data-status]').forEach(chip => chip.setAttribute('aria-pressed', String((chip.dataset.status || '') === (state.status || ''))));
  }

  function open() {
    if (!registry) return;
    lastFocused = document.activeElement;
    fillFromState();
    const panel = ensureSheet();
    panel.hidden = false;
    document.body.classList.add('registry-mobile-filters-open');
    syncTrigger();
    requestAnimationFrame(() => panel.querySelector('[data-filter-form]')?.focus({ preventScroll:true }));
  }

  function close() {
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    document.body.classList.remove('registry-mobile-filters-open');
    syncTrigger();
    lastFocused?.focus?.({ preventScroll:true });
  }

  function attach() {
    registry = window.MedIndexMobileRegistry || registry;
    if (!registry) return;
    ensureStyles();
    syncTrigger();
    document.documentElement.dataset.registryMobileFilters = VERSION;
  }

  window.addEventListener('medindex:mobile-registry-api-ready', attach);
  window.addEventListener('medindex:mobile-registry-state', syncTrigger);
  window.addEventListener('medindex:open-mobile-registry-filters', open);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once:true });
  else attach();
})();
