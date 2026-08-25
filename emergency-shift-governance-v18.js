(() => {
  'use strict';

  let reviewMode = false;
  try { reviewMode = new URL(window.location.href).searchParams.get('review') === '1'; } catch {}
  if (!reviewMode) return;

  const shift = window.MedIndexEmergencyShiftV18;
  if (!shift?.governance) return;

  const REASON_LABELS = Object.freeze({
    'not-critical':'Jo kritik',
    'not-verified':'Jo verified',
    'missing-version':'Pa version',
    'missing-source':'Pa burim',
    'missing-reviewer':'Pa reviewer',
    'missing-review-date':'Pa datë review',
    'invalid-review-due':'Review due i pavlefshëm',
    'review-overdue':'Review i skaduar',
    'missing-first-action':'Pa veprim fillestar',
  });

  let authorized = false;
  let observer = null;
  let frame = 0;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));

  function items() {
    return Array.isArray(window.__medIndexEmergencyItems) ? window.__medIndexEmergencyItems : [];
  }

  function criticalRows() {
    const now = Date.now();
    return items()
      .filter(item => shift.CRITICAL_LEVELS?.has?.(String(item?.triageLevel || '')))
      .map(item => ({item, governance:shift.governance(item, now)}));
  }

  function summary(rows) {
    const reasonCounts = {};
    rows.forEach(row => row.governance.reasons.forEach(reason => {
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }));
    return {
      total:rows.length,
      eligible:rows.filter(row => row.governance.eligible).length,
      blocked:rows.filter(row => !row.governance.eligible).length,
      reasonCounts,
    };
  }

  function studioUrl(item) {
    const base = String(window.MedIndexSanity?.studioUrl || '').trim();
    const id = String(item?._id || '').trim();
    if (!base || !id) return '';
    const root = base.endsWith('/') ? base : `${base}/`;
    return `${root}intent/edit/id=${encodeURIComponent(id)};type=emergencyProtocol`;
  }

  function reasonLabel(reason) {
    return REASON_LABELS[reason] || reason;
  }

  function blockerChips(report) {
    const order = ['not-verified','missing-reviewer','missing-review-date','review-overdue','missing-source','missing-version','missing-first-action','invalid-review-due'];
    const chips = order
      .filter(reason => Number(report.reasonCounts[reason] || 0) > 0)
      .map(reason => `<span><b>${report.reasonCounts[reason]}</b> ${esc(reasonLabel(reason))}</span>`)
      .join('');
    return chips || '<span><b>0</b> bllokues governance</span>';
  }

  function rowMarkup(row) {
    const g = row.governance;
    const reasons = g.eligible ? ['Gati për sesion'] : g.reasons.map(reasonLabel);
    const link = studioUrl(row.item);
    return `<div class="ck-v18-gov-row" data-ready="${g.eligible ? 'true' : 'false'}">
      <div><strong>${esc(g.title)}</strong><small>${esc(g.triageLevel)} · v${esc(g.version || '—')} · ${g.sourceCount} burime</small></div>
      <span>${esc(reasons.join(' · '))}</span>
      ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Hape në Sanity</a>` : ''}
    </div>`;
  }

  function ensurePanel() {
    const shell = document.querySelector('.ck-v14-review .ck-v14-shell');
    if (!shell) return null;
    const existing = shell.querySelector('[data-ck-v18-governance]');
    if (existing) return existing;
    const node = document.createElement('section');
    node.className = 'ck-v18-governance';
    node.dataset.ckV18Governance = '1';
    const overview = shell.querySelector('.ck-v14-overview');
    if (overview) overview.insertAdjacentElement('afterend', node);
    else shell.prepend(node);
    return node;
  }

  function render() {
    if (!authorized) return;
    const rows = criticalRows();
    const report = summary(rows);
    const node = ensurePanel();
    if (!node) return;

    node.dataset.ready = report.eligible > 0 ? 'true' : 'false';
    node.innerHTML = `<div class="ck-v18-gov-head">
        <div><span>READY FOR SHIFT · GOVERNANCE</span><strong>${report.eligible}/${report.total} protokolle kritike gati</strong></div>
        <em>${report.blocked ? `${report.blocked} të bllokuara` : 'Të gjitha gati'}</em>
      </div>
      <p class="ck-v18-gov-note">Ky panel nuk aprovon asgjë. Ready for Shift pranon vetëm protokolle critical/very-urgent me status <b>verified</b>, version, burim, reviewer, datë review dhe review jo të skaduar.</p>
      <div class="ck-v18-gov-chips">${blockerChips(report)}</div>
      ${rows.length ? `<details class="ck-v18-gov-details"><summary>Shiko ${rows.length} protokollet kritike</summary><div class="ck-v18-gov-list">${rows.map(rowMarkup).join('')}</div></details>` : '<p class="ck-v18-gov-empty">Nuk ka protokolle critical/very-urgent në dataset.</p>'}`;
  }

  function scheduleRender() {
    if (!authorized) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  }

  function start(authState) {
    if (authState?.authenticated !== true || authState?.offline === true || authState?.authUser?.adminConsole !== true) return;
    authorized = true;
    const root = document.querySelector('.clinical-knowledge-page') || document.body;
    observer = new MutationObserver(scheduleRender);
    observer.observe(root, {childList:true,subtree:true});
    render();
    window.setTimeout(render, 250);
    window.setTimeout(render, 800);
  }

  Promise.resolve(window.MEDINDEX_AUTH_READY).then(start).catch(() => {});
})();
