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
    const list = $('#learningList');
    list.innerHTML = state.filtered.map(item => `
      <button class="ck-list-button${item._id === state.selectedId ? ' is-active' : ''}" type="button" data-id="${esc(item._id)}">
        <strong>${esc(item.question || item.title)}</strong>
        <span>${esc(item.title)}${item.icdCodes?.length ? ` · ${esc(item.icdCodes.join(' · '))}` : ''}</span>
      </button>`).join('') || '<p class="ck-status">Nuk u gjet asnjë temë.</p>';

    list.querySelectorAll('[data-id]').forEach(button => {
      button.addEventListener('click', () => {
        state.selectedId = button.dataset.id;
        renderList();
        renderDetail(state.items.find(item => item._id === state.selectedId));
      });
    });
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
    try {
      state.items = await window.MedIndexSanity.query(QUERY);
      const groups = [...new Set(state.items.map(item => item.icdCodes?.[0]?.charAt(0)).filter(Boolean))].sort();
      $('#learningCategory').insertAdjacentHTML('beforeend', groups.map(group => `<option value="${esc(group)}">ICD ${esc(group)}</option>`).join(''));
      state.selectedId = state.items[0]?._id || '';
      $('#learningSearch').addEventListener('input', applyFilters);
      $('#learningCategory').addEventListener('change', applyFilters);
      applyFilters();
    } catch (error) {
      console.error(error);
      $('#learningStatus').textContent = 'Temat nuk u ngarkuan.';
      $('#learningDetail').innerHTML = '<div class="ck-empty">Kontrollo lidhjen me Sanity ose publiko dokumentet.</div>';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
