(() => {
  'use strict';
  const model = window.DrxRegistryColumns;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 5h16l-6 7v6l-4 2v-8z"/></svg>';
  window.DrxColumnFilter = Object.freeze({ create({columns, getFilters, getSort, getFacetUrl, fetchJson, onApply, onSort, onOpen}) {
    let active = '', anchor = null, draft = {}, values = [], offset = 0, hasMore = false, requestId = 0, controller = null, timer = 0, search = '';
    const panel = document.createElement('section');
    panel.id = 'registryColumnFilterPanel'; panel.className = 'registry-column-filter'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal','true'); panel.setAttribute('aria-labelledby','columnFilterTitle');
    panel.innerHTML = `<header><div><small>FILTËR I KOLONËS</small><h2 id="columnFilterTitle"></h2></div><button type="button" data-close aria-label="Mbyll filtrin">×</button></header>
      <div class="column-sort-actions"><button type="button" data-direction="asc">↑ Rendit A → Z</button><button type="button" data-direction="desc">↓ Rendit Z → A</button></div>
      <button type="button" data-clear class="column-filter-clear">Pastro filtrin e kësaj kolone</button>
      <div class="column-condition"><label for="columnFilterOperator">Kushti</label><select id="columnFilterOperator"></select><input id="columnFilterText" aria-label="Vlera e kushtit" placeholder="Shkruaj vlerën…"><input id="columnFilterText2" aria-label="Kufiri maksimal" placeholder="Deri në…" hidden></div>
      <label class="column-values-search" for="columnFilterSearch">Kërko në vlerat e kolonës<input id="columnFilterSearch" type="search" placeholder="Kërko…" autocomplete="off"></label>
      <label class="column-select-all"><input type="checkbox" id="columnFilterSelectAll"> <span>Zgjidh të gjitha</span><button type="button" data-only-shown hidden>Vetëm rezultatet e kërkimit</button></label>
      <div class="column-filter-values" id="columnFilterValues" aria-label="Vlerat e kolonës"></div>
      <button type="button" data-more hidden class="column-more">Shfaq më shumë vlera</button>
      <p class="column-filter-feedback" id="columnFilterFeedback" role="status" aria-live="polite"></p>
      <footer><button type="button" data-cancel>Anulo</button><button type="button" data-apply>Apliko</button></footer>`;
    const backdrop = document.createElement('div'); backdrop.className = 'column-filter-backdrop'; backdrop.hidden = true;
    document.body.append(backdrop, panel);
    const select = panel.querySelector('#columnFilterOperator'), text = panel.querySelector('#columnFilterText'), text2 = panel.querySelector('#columnFilterText2'), searchInput = panel.querySelector('#columnFilterSearch'), list = panel.querySelector('#columnFilterValues'), all = panel.querySelector('#columnFilterSelectAll'), feedback = panel.querySelector('#columnFilterFeedback');
    const toolbar = document.createElement('div'); toolbar.className = 'registry-column-tools';
    toolbar.innerHTML = `<label for="columnFilterColumn">Filtri i kolonës</label><div><select id="columnFilterColumn" aria-label="Zgjidh kolonën për filtrim">${columns.map(col => `<option value="${col.id}">${escape(col.label)}</option>`).join('')}</select><button type="button" id="columnFilterOpen">${icon}<span>Filtro kolonën</span></button></div>`;
    document.querySelector('#filterPanel').append(toolbar);
    const chips = document.createElement('div'); chips.className = 'registry-column-filter-chips'; chips.hidden = true; chips.setAttribute('aria-label','Filtrat e kolonave aktive');
    document.querySelector('#filterPanel').after(chips);
    const buttons = [];
    for (const col of columns) {
      const th = document.querySelector(`#registryTable th[data-col="${col.id}"]`);
      if (!th) continue;
      const wrap = document.createElement('div'); wrap.className = 'registry-column-header';
      while (th.firstChild) wrap.append(th.firstChild);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'column-filter-trigger'; button.dataset.columnFilter = col.id; button.setAttribute('aria-label',`Filtro kolonën: ${col.label}`); button.setAttribute('aria-haspopup','dialog'); button.setAttribute('aria-controls',panel.id); button.setAttribute('aria-expanded','false'); button.innerHTML = icon;
      button.addEventListener('click', () => open(col.id, button)); buttons.push(button); wrap.append(button); th.append(wrap);
    }
    function chosen(value) { return draft.mode === 'include' ? (draft.values || []).includes(value) : !(draft.values || []).includes(value); }
    function choose(value, selected) {
      const next = new Set(draft.values || []), included = draft.mode === 'include';
      if (selected === included) next.add(value); else next.delete(value);
      draft.mode = included ? 'include' : 'exclude'; draft.values = [...next];
    }
    function syncAll() {
      const explicit = draft.values?.length || 0;
      all.checked = draft.mode !== 'include' && !explicit;
      all.indeterminate = explicit > 0;
      panel.querySelector('[data-only-shown]').hidden = !search;
      panel.querySelector('[data-apply]').disabled = draft.mode === 'include' && !explicit;
    }
    function renderValues() {
      list.innerHTML = values.map((item, i) => `<label class="column-filter-value"><input type="checkbox" data-value-index="${i}" ${chosen(item.value) ? 'checked' : ''}><span title="${escape(item.label)}">${escape(item.label)}</span><small>${item.count.toLocaleString('sq')}</small></label>`).join('') || '<p class="column-values-empty">Asnjë vlerë nuk u gjet.</p>';
      panel.querySelector('[data-more]').hidden = !hasMore;
      syncAll();
    }
    function syncCondition() {
      const op = select.value;
      const noText = !op || ['empty','notEmpty'].includes(op);
      text.hidden = noText; text2.hidden = op !== 'between';
      text.inputMode = model.numeric(active) ? 'decimal' : 'text'; text2.inputMode = 'decimal';
    }
    function position() {
      if (panel.hidden) return;
      const height = Math.min(680, window.innerHeight - 24); panel.style.maxHeight = `${height}px`;
      const width = Math.min(370, window.innerWidth - 24), rect = anchor.getBoundingClientRect();
      panel.style.width = `${width}px`;
      panel.style.left = `${Math.min(Math.max(12, rect.left), window.innerWidth - width - 12)}px`;
      panel.style.top = `${window.innerWidth <= 760 ? 12 : Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - Math.min(panel.offsetHeight, height) - 12))}px`;
    }
    async function loadValues(more = false) {
      controller?.abort(); controller = new AbortController(); const id = ++requestId;
      const column = active;
      feedback.textContent = 'Duke ngarkuar vlerat e regjistrit…';
      panel.querySelector('[data-more]').disabled = true;
      if (!more) { values = []; offset = 0; hasMore = false; list.innerHTML = '<p class="column-values-empty">Duke ngarkuar…</p>'; }
      try {
        const {payload} = await fetchJson(getFacetUrl(column, search, more ? offset : 0), {signal:controller.signal}, 20000);
        if (id !== requestId || panel.hidden || column !== active) return;
        values = more ? [...values,...payload.values] : payload.values;
        offset = values.length; hasMore = payload.hasMore === true;
        renderValues(); feedback.textContent = `${payload.total.toLocaleString('sq')} vlera të ndryshme · në të gjithë regjistrin`;
      } catch (error) {
        if (id !== requestId || panel.hidden || error.name === 'AbortError') return;
        if (!more) list.innerHTML = '<p class="column-values-empty">Vlerat nuk u ngarkuan.</p>';
        feedback.textContent = error.message || 'Provo përsëri.';
        const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Provo përsëri'; retry.addEventListener('click', () => void loadValues(more)); list.append(retry);
      } finally { if (id === requestId) { panel.querySelector('[data-more]').disabled = false; position(); } }
    }
    function close(focus = true) {
      if (panel.hidden) return;
      ++requestId; controller?.abort(); clearTimeout(timer); panel.hidden = true; backdrop.hidden = true;
      anchor?.setAttribute('aria-expanded','false');
      if (focus) anchor?.focus({preventScroll:true});
    }
    function open(id, button) {
      close(false); onOpen?.(); active = id; anchor = button;
      draft = JSON.parse(JSON.stringify(getFilters()[id] || {mode:'exclude',values:[]})); search = '';
      const col = columns.find(col => col.id === id);
      panel.querySelector('#columnFilterTitle').textContent = col.label;
      const options = [['','Pa kusht shtesë'],['equals','Është e barabartë me'],['notEquals','Nuk është e barabartë me'], ...(model.numeric(id) ? [['gt','Më e madhe se'],['gte','Më e madhe ose e barabartë'],['lt','Më e vogël se'],['lte','Më e vogël ose e barabartë'],['between','Midis dy vlerave']] : [['contains','Përmban'],['notContains','Nuk përmban'],['startsWith','Fillon me'],['endsWith','Mbaron me']]),['empty','Është bosh'],['notEmpty','Nuk është bosh']];
      select.innerHTML = options.map(([value,label]) => `<option value="${value}">${label}</option>`).join('');
      select.value = draft.op || ''; text.value = draft.text || ''; text2.value = draft.text2 || ''; searchInput.value = '';
      const sort = getSort();
      for (const direction of ['asc','desc']) {
        const action = panel.querySelector(`[data-direction="${direction}"]`);
        action.textContent = model.numeric(id) ? direction === 'asc' ? '↑ Nga më e vogla te më e madhja' : '↓ Nga më e madhja te më e vogla' : direction === 'asc' ? '↑ Rendit A → Z' : '↓ Rendit Z → A';
        action.setAttribute('aria-pressed',String(sort.sort === model.sortKey(id) && sort.direction === direction));
      }
      syncCondition(); syncAll(); panel.hidden = false; backdrop.hidden = false; button.setAttribute('aria-expanded','true'); position();
      searchInput.focus({preventScroll:true}); void loadValues();
    }
    function update() {
      const filters = getFilters();
      buttons.forEach(button => { const set = Boolean(filters[button.dataset.columnFilter]); button.classList.toggle('is-filtered',set); button.dataset.filtered = String(set); });
      chips.hidden = !Object.keys(filters).length;
      chips.innerHTML = columns.filter(col => filters[col.id]).map(col => `<button type="button" data-remove-column="${col.id}" aria-label="Pastro filtrin: ${escape(col.label)}">${icon}${escape(col.label)} <b>×</b></button>`).join('');
    }
    toolbar.querySelector('button').addEventListener('click', event => open(toolbar.querySelector('select').value,event.currentTarget));
    chips.addEventListener('click', event => { const button = event.target.closest('[data-remove-column]'); if (button) onApply(button.dataset.removeColumn,null); });
    backdrop.addEventListener('click', () => close());
    searchInput.addEventListener('input', () => { search = model.clean(searchInput.value); clearTimeout(timer); ++requestId; controller?.abort(); timer = setTimeout(() => void loadValues(),180); });
    select.addEventListener('change',syncCondition);
    all.addEventListener('change', () => { draft.mode = all.checked ? 'exclude' : 'include'; draft.values = []; renderValues(); });
    list.addEventListener('change', event => { const index = event.target.dataset.valueIndex; if (index === undefined) return; choose(values[Number(index)].value,event.target.checked); feedback.textContent = ''; syncAll(); });
    panel.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.hasAttribute('data-close') || button.hasAttribute('data-cancel')) return close();
      if (button.hasAttribute('data-clear')) { onApply(active,null); return close(); }
      if (button.hasAttribute('data-more')) return void loadValues(true);
      if (button.hasAttribute('data-only-shown')) { draft.mode = 'include'; draft.values = values.map(item => item.value); renderValues(); feedback.textContent = hasMore ? 'U zgjodhën vlerat e ngarkuara. Shfaq më shumë për vlera të tjera.' : ''; return; }
      if (button.dataset.direction) { onSort(model.sortKey(active),button.dataset.direction); return close(); }
      if (button.hasAttribute('data-apply')) {
        const next = {...draft}; delete next.op; delete next.text; delete next.text2;
        if (select.value) { next.op = select.value; next.text = text.value.replace(',','.'); next.text2 = text2.value.replace(',','.'); if (!model.numeric(active)) next.text = text.value; }
        try { const filters = model.parseFilters({...getFilters(),[active]:next}); onApply(active,filters[active] || null); close(); }
        catch (error) { feedback.textContent = error.message; }
      }
    });
    document.addEventListener('keydown', event => {
      if (panel.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key === 'Tab') {
        const nodes = [...panel.querySelectorAll('button,input,select')].filter(node => !node.disabled && !node.hidden && node.getClientRects().length);
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    },true);
    window.addEventListener('resize',position);
    document.addEventListener('scroll',position,true);
    return Object.freeze({update,close,open});
  }});
})();
