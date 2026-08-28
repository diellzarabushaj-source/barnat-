(() => {
  'use strict';

  const QUERY = `*[_type == "learningTopic" && reviewStatus != "archived"] | order(title asc){
    _id,question,title,"slug":slug.current,keywords,icdCodes,summary,
    steps[]{_key,title,action,why,setting,priority,note},
    prescriptions[]{_key,medicine,genericName,form,strength,dose,route,frequency,duration,quantity,instructions,patientGroup,clinicalNote},
    redFlags,whenToRefer,reviewStatus,reviewedBy,lastReviewedAt,version,
    relatedProtocols[]->{_id,title,"slug":slug.current,summary,reviewStatus}
  }`;

  const state = { items:[], filtered:[], selectedId:'' };
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalize = value => String(value ?? '').toLocaleLowerCase('sq').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  async function authJson(url = '/api/auth', options = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        credentials:'same-origin', cache:'no-store', ...options, signal:controller.signal,
        headers:{ Accept:'application/json', ...(options.headers || {}) },
      });
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    } finally { clearTimeout(timer); }
  }

  function redirectToLogin() {
    const target = new URL('/landing.html', location.origin);
    target.searchParams.set('return', location.pathname + location.search + location.hash);
    location.replace(target.pathname + target.search);
  }

  async function ensureAuth() {
    const { response, payload } = await authJson();
    if (!response.ok || !payload.authenticated) {
      redirectToLogin();
      throw new Error('Sesioni nuk është aktiv.');
    }
    return payload;
  }

  function loadRuntime(src, marker) {
    const existing = document.querySelector(`script[${marker}]`);
    if (existing) return new Promise(resolve => {
      if (existing.dataset.loaded === '1') return resolve();
      existing.addEventListener('load', resolve, { once:true });
      setTimeout(resolve, 1800);
    });
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src; script.defer = true; script.setAttribute(marker, '1');
      script.addEventListener('load', () => { script.dataset.loaded = '1'; resolve(); }, { once:true });
      script.addEventListener('error', reject, { once:true });
      document.head.appendChild(script);
    });
  }

  async function syncProfileChrome(payload) {
    await loadRuntime('/medindex-brand-runtime.js?v=profile-unified-v1', 'data-drx-profile-runtime').catch(() => null);
    window.MedIndexProfile?.adoptAccount?.(payload);
    window.dispatchEvent(new CustomEvent('medindex:auth-ready', { detail:payload }));
  }

  function loadSharedSidebarTaxonomy() {
    void loadRuntime('/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v3', 'data-drx-sidebar-taxonomy');
  }

  async function ensureSanity() {
    if (window.MedIndexSanity) return window.MedIndexSanity;
    await loadRuntime('/sanity-clinical-client.js?v=20260805-1', 'data-drx-sanity-runtime');
    if (!window.MedIndexSanity) throw new Error('Sanity nuk u inicializua.');
    return window.MedIndexSanity;
  }

  function openSidebar() {
    $('#sidebar')?.classList.add('is-open');
    const backdrop = $('#sidebarBackdrop'); if (backdrop) backdrop.hidden = false;
  }
  function closeSidebar() {
    $('#sidebar')?.classList.remove('is-open');
    const backdrop = $('#sidebarBackdrop'); if (backdrop) backdrop.hidden = true;
  }
  async function logout() {
    const button = $('#logoutButton'); if (button) button.disabled = true;
    try {
      const { response } = await authJson('/api/auth', { method:'DELETE' });
      if (!response.ok) throw new Error('Dalja nuk u krye.');
      location.replace('/landing.html');
    } catch { if (button) button.disabled = false; }
  }
  function bindShell() {
    $('#menuButton')?.addEventListener('click', openSidebar);
    $('#sidebarClose')?.addEventListener('click', closeSidebar);
    $('#sidebarBackdrop')?.addEventListener('click', closeSidebar);
    $('#logoutButton')?.addEventListener('click', logout);
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeSidebar();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); $('#learningSearch')?.focus();
      }
    });
  }

  function chip(label, className = '') {
    return `<span class="ck-chip ${className}">${esc(label)}</span>`;
  }

  function reviewChip(status) {
    const labels = {draft:'Draft',review:'Për verifikim',verified:'Verifikuar',archived:'Arkivuar'};
    return chip(labels[status] || status || 'Pa status', status === 'verified' ? 'is-verified' : 'is-review');
  }

  function stepMarkup(step) {
    return `<div class="ck-step"><strong>${esc(step.title || 'Hapi')}</strong><p>${esc(step.action || '')}</p>${step.why ? `<small>${esc(step.why)}</small>` : ''}</div>`;
  }

  function bulletMarkup(items) {
    return `<ul class="ck-bullets">${(items || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
  }

  function rxMarkup(rx) {
    const rows = [
      ['Substanca', rx.genericName], ['Forma', rx.form], ['Fortësia', rx.strength], ['Doza', rx.dose],
      ['Rruga', rx.route], ['Shpeshtësia', rx.frequency], ['Kohëzgjatja', rx.duration], ['Sasia', rx.quantity],
    ].filter(([,value]) => value);
    return `<article class="ck-rx-card"><strong>${esc(rx.medicine || 'Recetë')}</strong><dl>${rows.map(([label,value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>${rx.instructions ? `<p class="ck-summary">${esc(rx.instructions)}</p>` : ''}${rx.clinicalNote ? `<small>${esc(rx.clinicalNote)}</small>` : ''}</article>`;
  }

  function renderDetail(item) {
    const detail = $('#learningDetail');
    if (!item) {
      detail.innerHTML = '<div class="ck-empty">Nuk u gjet tema.</div>';
      return;
    }

    detail.innerHTML = `
      <header class="ck-detail-head">
        <div>
          <p class="ck-kicker">${esc(item.question || 'Temë klinike')}</p>
          <h2>${esc(item.title)}</h2>
          <div class="ck-meta">
            ${(item.icdCodes || []).map(code => chip(code)).join('')}
            ${reviewChip(item.reviewStatus)}
            ${item.version ? chip(`v${item.version}`) : ''}
          </div>
          <p class="ck-summary">${esc(item.summary || '')}</p>
        </div>
      </header>
      <div class="ck-sections">
        ${item.redFlags?.length ? `<section class="ck-section ck-referral"><h3>Red flags — ndalo dhe vlerëso urgjent</h3>${bulletMarkup(item.redFlags)}</section>` : ''}
        <section class="ck-section"><h3>Trajtimi hap pas hapi</h3><div class="ck-steps">${(item.steps || []).map(stepMarkup).join('') || '<p class="ck-status">Ende pa hapa.</p>'}</div></section>
        ${item.prescriptions?.length ? `<section class="ck-section"><h3>Shembuj recetash</h3><div class="ck-rx-grid">${item.prescriptions.map(rxMarkup).join('')}</div></section>` : ''}
        ${item.whenToRefer ? `<section class="ck-section ck-referral"><h3>Referimi</h3><p class="ck-summary">${esc(item.whenToRefer)}</p></section>` : ''}
        ${item.relatedProtocols?.length ? `<section class="ck-section"><h3>Protokolle të lidhura</h3>${bulletMarkup(item.relatedProtocols.map(protocol => protocol.title))}</section>` : ''}
      </div>`;
  }

  function renderList() {
    const select = $('#learningTopic');
    if (!select) return;
    select.innerHTML = state.filtered.map(item => {
      const code = item.icdCodes?.length ? ` · ${esc(item.icdCodes.join(' · '))}` : '';
      return `<option value="${esc(item._id)}">${esc(item.question || item.title)}${code}</option>`;
    }).join('') || '<option value="">Asnjë temë</option>';
    select.value = state.selectedId;
    select.disabled = state.filtered.length === 0;
  }

  function applyFilters() {
    const term = normalize($('#learningSearch').value);
    const category = $('#learningCategory').value;
    state.filtered = state.items.filter(item => {
      const haystack = normalize([item.question,item.title,item.summary,...(item.keywords || []),...(item.icdCodes || [])].join(' '));
      const inferredCategory = item.icdCodes?.[0]?.charAt(0) || '';
      return (!term || haystack.includes(term)) && (!category || inferredCategory === category);
    });
    if (!state.filtered.some(item => item._id === state.selectedId)) state.selectedId = state.filtered[0]?._id || '';
    renderList();
    renderDetail(state.items.find(item => item._id === state.selectedId));
    $('#learningStatus').textContent = `${state.filtered.length} tema`;
  }

  async function init() {
    loadSharedSidebarTaxonomy();
    bindShell();
    try {
      const authPayload = await ensureAuth();
      await syncProfileChrome(authPayload);
      await ensureSanity();

      state.items = await window.MedIndexSanity.query(QUERY);
      const groups = [...new Set(state.items.map(item => item.icdCodes?.[0]?.charAt(0)).filter(Boolean))].sort();
      $('#learningCategory').insertAdjacentHTML('beforeend', groups.map(group => `<option value="${esc(group)}">ICD ${esc(group)}</option>`).join(''));
      state.selectedId = state.items[0]?._id || '';

      $('#learningSearch').addEventListener('input', applyFilters);
      $('#learningCategory').addEventListener('change', applyFilters);
      $('#learningTopic').addEventListener('change', event => {
        state.selectedId = event.target.value;
        renderDetail(state.items.find(item => item._id === state.selectedId));
      });
      if ($('#syncText')) $('#syncText').textContent = 'Sanity';
      applyFilters();
      $('#appShell')?.setAttribute('aria-busy','false');
    } catch (error) {
      console.error('[Medical Hub v2]', error);
      $('#learningStatus').textContent = 'Temat nuk u ngarkuan.';
      $('#learningTopic').innerHTML = '<option>Gabim në ngarkim</option>';
      $('#learningDetail').innerHTML = '<div class="ck-empty"><strong>Medical Hub nuk u ngarkua.</strong><span>Kontrollo Sanity dhe provo përsëri pa humbur sesionin.</span></div>';
      $('#appShell')?.setAttribute('aria-busy','false');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
