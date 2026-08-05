(() => {
  'use strict';

  const QUERY = `*[_type == "emergencyProtocol" && reviewStatus != "archived"] | order(title asc){
    _id,title,"slug":slug.current,icdCodes,aliases,category,triageLevel,summary,
    primaryCareSteps[]{_key,title,action,why,setting,priority,note},
    redFlags,doNotDo,
    referral{when,destination,urgency,beforeTransfer,handover,secondaryCareOverview},
    secondaryCareSteps[]{_key,title,action,why,setting,priority,note},
    reviewStatus,reviewedBy,lastReviewedAt,reviewDueAt,version
  }`;

  const state = { items:[], filtered:[], selectedId:'' };
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalize = value => String(value ?? '').toLocaleLowerCase('sq').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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

  function renderDetail(item) {
    const detail = $('#emergencyDetail');
    if (!item) {
      detail.innerHTML = '<div class="ck-empty">Nuk u gjet urgjenca.</div>';
      return;
    }

    const referral = item.referral || {};
    detail.innerHTML = `
      <header class="ck-detail-head">
        <div>
          <h2>${esc(item.title)}</h2>
          <div class="ck-meta">
            ${(item.icdCodes || []).map(code => chip(code)).join('')}
            ${item.category ? chip(item.category) : ''}
            ${item.triageLevel ? chip(item.triageLevel, 'is-critical') : ''}
            ${reviewChip(item.reviewStatus)}
            ${item.version ? chip(`v${item.version}`) : ''}
          </div>
          <p class="ck-summary">${esc(item.summary || '')}</p>
        </div>
      </header>
      <div class="ck-sections">
        <section class="ck-section">
          <h3>Hapat në kujdes parësor</h3>
          <div class="ck-steps">${(item.primaryCareSteps || []).map(stepMarkup).join('') || '<p class="ck-status">Ende pa hapa.</p>'}</div>
        </section>
        ${item.redFlags?.length ? `<section class="ck-section"><h3>Shenjat alarmuese</h3>${bulletMarkup(item.redFlags)}</section>` : ''}
        <section class="ck-section ck-referral">
          <h3>Referimi</h3>
          ${referral.when ? `<p class="ck-summary"><strong>Kur:</strong> ${esc(referral.when)}</p>` : ''}
          ${referral.destination ? `<p class="ck-summary"><strong>Ku:</strong> ${esc(referral.destination)}</p>` : ''}
          ${referral.beforeTransfer?.length ? `<h3>Para transferimit</h3>${bulletMarkup(referral.beforeTransfer)}` : ''}
          ${referral.handover ? `<p class="ck-summary"><strong>Handover:</strong> ${esc(referral.handover)}</p>` : ''}
        </section>
        ${(item.secondaryCareSteps?.length || referral.secondaryCareOverview?.length) ? `<section class="ck-section"><h3>Kujdesi sekondar</h3><div class="ck-steps">${(item.secondaryCareSteps || []).map(stepMarkup).join('')}</div>${referral.secondaryCareOverview?.length ? bulletMarkup(referral.secondaryCareOverview) : ''}</section>` : ''}
        ${item.doNotDo?.length ? `<section class="ck-section"><h3>Çfarë të mos bëhet</h3>${bulletMarkup(item.doNotDo)}</section>` : ''}
      </div>`;
  }

  function renderList() {
    const list = $('#emergencyList');
    list.innerHTML = state.filtered.map(item => `
      <button class="ck-list-button${item._id === state.selectedId ? ' is-active' : ''}" type="button" data-id="${esc(item._id)}">
        <strong>${esc(item.title)}</strong>
        <span>${esc((item.icdCodes || []).join(' · '))}${item.category ? ` · ${esc(item.category)}` : ''}</span>
      </button>`).join('') || '<p class="ck-status">Nuk u gjet asnjë urgjencë.</p>';

    list.querySelectorAll('[data-id]').forEach(button => {
      button.addEventListener('click', () => {
        state.selectedId = button.dataset.id;
        renderList();
        renderDetail(state.items.find(item => item._id === state.selectedId));
      });
    });
  }

  function applyFilters() {
    const term = normalize($('#emergencySearch').value);
    const category = $('#emergencyCategory').value;
    state.filtered = state.items.filter(item => {
      const haystack = normalize([item.title,item.summary,item.category,...(item.icdCodes || []),...(item.aliases || [])].join(' '));
      return (!term || haystack.includes(term)) && (!category || item.category === category);
    });
    if (!state.filtered.some(item => item._id === state.selectedId)) state.selectedId = state.filtered[0]?._id || '';
    renderList();
    renderDetail(state.items.find(item => item._id === state.selectedId));
    $('#emergencyStatus').textContent = `${state.filtered.length} urgjenca`;
  }

  async function init() {
    try {
      state.items = await window.MedIndexSanity.query(QUERY);
      const categories = [...new Set(state.items.map(item => item.category).filter(Boolean))].sort((a,b) => a.localeCompare(b,'sq'));
      $('#emergencyCategory').insertAdjacentHTML('beforeend', categories.map(category => `<option value="${esc(category)}">${esc(category)}</option>`).join(''));
      state.selectedId = state.items[0]?._id || '';
      $('#emergencySearch').addEventListener('input', applyFilters);
      $('#emergencyCategory').addEventListener('change', applyFilters);
      applyFilters();
    } catch (error) {
      console.error(error);
      $('#emergencyStatus').textContent = 'Urgjencat nuk u ngarkuan.';
      $('#emergencyDetail').innerHTML = '<div class="ck-empty">Kontrollo lidhjen me Sanity ose publiko dokumentet.</div>';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
