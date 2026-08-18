(() => {
  'use strict';

  const detail = document.getElementById('emergencyDetail');
  if (!detail) return;

  const normalize = value => String(value || '')
    .trim()
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const text = node => String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));

  function cardPriority(card) {
    const labels = [...card.querySelectorAll('.ck-step-footer em')].map(node => normalize(text(node)));
    if (labels.some(value => value === 'immediate' || value.includes('menjehere'))) return 'immediate';
    if (labels.some(value => value === 'minutes' || value.includes('brenda minutave'))) return 'minutes';
    if (labels.some(value => value === 'after-stabilization' || value.includes('pas stabilizimit'))) return 'after';
    return 'other';
  }

  function stepData(card) {
    return {
      title: text(card.querySelector('.ck-step-copy strong')),
      action: text(card.querySelector('.ck-step-action')),
    };
  }

  function stepsFor(primary, priority) {
    if (!primary) return [];
    return [...primary.querySelectorAll('.ck-step-card')]
      .filter(card => cardPriority(card) === priority)
      .map(stepData)
      .filter(step => step.title || step.action);
  }

  function actionList(items, emptyText) {
    if (!items.length) {
      return `<p class="ck-time-empty">${esc(emptyText)}</p>`;
    }
    return `<ol class="ck-time-actions">${items.slice(0, 4).map(item => `
      <li>
        ${item.title ? `<strong>${esc(item.title)}</strong>` : ''}
        ${item.action ? `<span>${esc(item.action)}</span>` : ''}
      </li>`).join('')}</ol>`;
  }

  function countRedFlags() {
    return detail.querySelectorAll('#ck-doctor-redflags .ck-info-card').length;
  }

  function referralUrgency() {
    const referral = detail.querySelector('#ck-doctor-referral');
    if (!referral) return '';
    const row = [...referral.querySelectorAll('.ck-summary')].find(node =>
      /urgjenca\s*:/i.test(text(node))
    );
    if (!row) return '';
    const clone = row.cloneNode(true);
    clone.querySelector('strong')?.remove();
    const value = text(clone).replace(/^[:\s]+/, '');
    const normalized = normalize(value);
    if (normalized === 'immediate') return 'Menjëherë';
    if (normalized === 'same-day') return 'Urgjent sot';
    if (normalized === 'planned') return 'I planifikuar';
    return value;
  }

  function scrollTo(id) {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({behavior:'smooth', block:'start'});
    target.setAttribute('tabindex', '-1');
    window.setTimeout(() => target.focus({preventScroll:true}), 280);
  }

  function buildTimeline() {
    detail.querySelector('.ck-clinician-timeline')?.remove();

    const consoleEl = detail.querySelector('.ck-doctor-console');
    const primary = detail.querySelector('#ck-doctor-now');
    if (!consoleEl || !primary) return;

    const immediate = stepsFor(primary, 'immediate');
    const minutes = stepsFor(primary, 'minutes');
    const after = stepsFor(primary, 'after');
    const redFlags = countRedFlags();
    const referral = referralUrgency();

    const timeline = document.createElement('section');
    timeline.className = 'ck-clinician-timeline';
    timeline.setAttribute('aria-label', 'Rrjedha kohore e urgjencës');
    timeline.innerHTML = `
      <div class="ck-time-head">
        <div>
          <strong>Rrjedha kohore</strong>
          <span>Vetëm hapat e shënuar në protokoll; nuk shtohen veprime të supozuara.</span>
        </div>
        <div class="ck-time-safety">
          <button type="button" data-ck-time-target="ck-doctor-redflags">Red flags · ${redFlags}</button>
          ${referral ? `<button type="button" data-ck-time-target="ck-doctor-referral">Referimi · ${esc(referral)}</button>` : ''}
        </div>
      </div>
      <div class="ck-time-grid">
        <article class="ck-time-phase is-zero">
          <header><span>0–1 min</span><strong>Veprimet e menjëhershme</strong></header>
          ${actionList(immediate, 'Nuk ka hap të etiketuar “Menjëherë” në këtë protokoll.')}
        </article>
        <article class="ck-time-phase is-five">
          <header><span>1–5 min</span><strong>Brenda minutave</strong></header>
          ${actionList(minutes, 'Nuk ka hap të etiketuar “Brenda minutave” në këtë protokoll.')}
        </article>
        <article class="ck-time-phase is-after">
          <header><span>Pas stabilizimit</span><strong>Hapat pasues</strong></header>
          ${actionList(after, 'Shiko rendin e plotë të hapave për veprimet pas stabilizimit.')}
        </article>
      </div>
      <div class="ck-time-foot">
        <button type="button" data-ck-time-target="ck-doctor-now">Hap të gjithë hapat</button>
        <span>Rendi klinik mbetet ai i dokumentit në Sanity.</span>
      </div>`;

    consoleEl.insertAdjacentElement('afterend', timeline);

    timeline.querySelectorAll('[data-ck-time-target]').forEach(button => {
      button.addEventListener('click', () => scrollTo(button.dataset.ckTimeTarget));
    });
  }

  let frame = 0;
  const observer = new MutationObserver(mutations => {
    const relevant = mutations.some(mutation => [...mutation.addedNodes].some(node =>
      node.nodeType === 1 && (
        node.matches?.('.ck-doctor-console,.ck-sections,.ck-detail-head')
        || node.querySelector?.('.ck-doctor-console,.ck-sections')
      )
    ));
    if (!relevant) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(buildTimeline);
  });

  observer.observe(detail, {childList:true, subtree:false});
  requestAnimationFrame(buildTimeline);
})();
