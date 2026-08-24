(() => {
  'use strict';

  const reviewMode = (() => {
    try { return new URL(window.location.href).searchParams.get('review') === '1'; } catch { return false; }
  })();
  if (!reviewMode) return;

  const core = window.MedIndexEmergencyConsistencyV15;
  if (!core?.auditItem) return;

  const STORAGE_PREFIX = 'medindex_emergency_consistency_v15:';
  let authorized = false;
  let observer = null;
  let frame = 0;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));

  function items() {
    return Array.isArray(window.__medIndexEmergencyItems) ? window.__medIndexEmergencyItems : [];
  }

  function keyFor(item, issueId) {
    const id = String(item?._id || '').replace(/[^a-zA-Z0-9._-]+/g, '-');
    const version = String(item?.version || 'noversion').replace(/[^a-zA-Z0-9._-]+/g, '-');
    return `${STORAGE_PREFIX}${id}:${version}:${issueId}`;
  }

  function acknowledged(item, issueId) {
    try { return localStorage.getItem(keyFor(item, issueId)) === '1'; } catch { return false; }
  }

  function setAcknowledged(item, issueId, value) {
    try {
      if (value) localStorage.setItem(keyFor(item, issueId), '1');
      else localStorage.removeItem(keyFor(item, issueId));
    } catch {}
  }

  function occurrenceMarkup(occurrence) {
    if (occurrence.ranges) {
      return `<li><strong>${esc(occurrence.ranges.join(' / '))}</strong><span>${esc(occurrence.section)} · ${esc(occurrence.heading)}</span><small>${esc(occurrence.text)}</small></li>`;
    }
    return `<li><strong>${esc(occurrence.title || 'Burim')}</strong><span>Linku mungon</span></li>`;
  }

  function issueMarkup(item, issue) {
    const checked = acknowledged(item, issue.id);
    return `<article class="ck-v15-issue" data-ck-v15-issue="${esc(issue.id)}" data-reviewed="${checked ? 'true' : 'false'}">
      <div class="ck-v15-issue-head"><span>KËRKON RISHIKIM</span><strong>${esc(issue.label)}</strong></div>
      <p>Ky është sinjal konsistence, jo vendim klinik. Krahaso seksionet me burimin para se protokolli të kalojë në “verified”.</p>
      <ul>${issue.occurrences.map(occurrenceMarkup).join('')}</ul>
      <label class="ck-v15-confirm"><input type="checkbox" data-ck-v15-confirm="${esc(issue.id)}" ${checked ? 'checked' : ''}><span>E kontrollova këtë mospërputhje me burimin klinik.</span></label>
    </article>`;
  }

  function renderCard(card) {
    if (!authorized || !card || card.querySelector('[data-ck-v15-consistency]')) return;
    const itemId = String(card.dataset.ckV14Card || '').trim();
    const item = items().find(row => String(row?._id || '') === itemId);
    if (!item) return;
    const report = core.auditItem(item);
    const section = document.createElement('section');
    section.className = `ck-v15-consistency${report.requiresReview ? ' has-issues' : ''}`;
    section.dataset.ckV15Consistency = itemId;
    if (report.requiresReview) {
      section.innerHTML = `<div class="ck-v15-title"><span>CONSISTENCY GUARD v15</span><strong>${report.issueCount} ${report.issueCount === 1 ? 'pikë për rishikim' : 'pika për rishikim'}</strong></div>${report.issues.map(issue => issueMarkup(item, issue)).join('')}`;
    } else {
      section.innerHTML = '<div class="ck-v15-title"><span>CONSISTENCY GUARD v15</span><strong>S’u gjet konflikt nga kontrollet automatike të mbështetura</strong></div><p class="ck-v15-clean-note">Kjo nuk është verifikim klinik dhe nuk garanton që dozat, targetet ose udhëzimet janë të sakta.</p>';
    }
    const checks = card.querySelector('.ck-v14-checks');
    if (checks) checks.insertAdjacentElement('beforebegin', section);
    else card.appendChild(section);
  }

  function render() {
    if (!authorized) return;
    document.querySelectorAll('.ck-v14-review-card[data-ck-v14-card]').forEach(renderCard);
  }

  function scheduleRender() {
    if (!authorized) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  }

  document.addEventListener('change', event => {
    if (!authorized) return;
    const input = event.target.closest?.('[data-ck-v15-confirm]');
    if (!input) return;
    const card = input.closest('[data-ck-v14-card]');
    const item = items().find(row => String(row?._id || '') === String(card?.dataset.ckV14Card || ''));
    if (!item) return;
    setAcknowledged(item, input.dataset.ckV15Confirm, Boolean(input.checked));
    const issue = input.closest('[data-ck-v15-issue]');
    if (issue) issue.dataset.reviewed = input.checked ? 'true' : 'false';
  });

  function start(authState) {
    if (authState?.authenticated !== true || authState?.offline === true || authState?.authUser?.adminConsole !== true) return;
    authorized = true;
    const root = document.querySelector('.clinical-knowledge-page') || document.body;
    observer = new MutationObserver(scheduleRender);
    observer.observe(root, {childList:true, subtree:true});
    render();
    window.setTimeout(render, 450);
    window.setTimeout(render, 1100);
  }

  Promise.resolve(window.MEDINDEX_AUTH_READY).then(start).catch(() => {});
})();
