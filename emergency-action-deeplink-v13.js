(() => {
  'use strict';

  const searchPanel = document.querySelector('[data-mi-page="urgjencat"] .ck-rapid-search-panel');
  const status = document.getElementById('emergencyStatus');
  const list = document.getElementById('emergencyList');
  const core = window.MedIndexEmergencyActionDeepLinkV13;
  const actionEngine = window.MedIndexEmergencyActionSearchV12;
  if (!searchPanel || !status || !list || !core?.audit || !core?.resolveAction || !actionEngine?.buildEntries) return;

  let attemptedActionId = '';
  let auditNode = null;
  let frame = 0;

  function items() {
    return Array.isArray(window.__medIndexEmergencyItems) ? window.__medIndexEmergencyItems : [];
  }

  function currentAudit() {
    return core.audit(items());
  }

  function ensureAuditNode() {
    if (auditNode?.isConnected) return auditNode;
    auditNode = document.createElement('p');
    auditNode.className = 'ck-v13-integrity';
    auditNode.dataset.ckV13Integrity = '1';
    auditNode.setAttribute('role', 'status');
    auditNode.setAttribute('aria-live', 'polite');
    status.insertAdjacentElement('afterend', auditNode);
    return auditNode;
  }

  function auditLabel(report) {
    if (!report.total) return 'Hap direkt · duke kontrolluar protokollet…';
    if (report.ready === report.total) return `Hap direkt · ${report.ready}/${report.total} protokolle të verifikuara`;
    if (report.ready > 0) return `Hap direkt · ${report.ready}/${report.total} të verifikuara · ${report.total - report.ready} jashtë kërkimit direkt`;
    if (report.inReview === report.total) return `Hap direkt · 0/${report.total} · protokollet janë ende në verifikim`;
    return `Hap direkt · 0/${report.total} protokolle të gatshme`;
  }

  function renderAudit(extra = '') {
    const report = currentAudit();
    const node = ensureAuditNode();
    node.dataset.ckV13Ready = report.ready > 0 ? 'true' : 'false';
    node.textContent = `${auditLabel(report)}${extra ? ` · ${extra}` : ''}`;
    node.title = [
      `Verifikuara: ${report.verified}`,
      `Në verifikim: ${report.inReview}`,
      `Pa version: ${report.missingVersion}`,
      `Pa burim: ${report.missingSource}`,
      `Pa përmbajtje veprimi: ${report.noActionContent}`,
    ].join(' · ');
  }

  function replaceUrl(next) {
    try { history.replaceState(null, '', next); } catch {}
  }

  function syncOpenedAction(event) {
    const actionId = String(event?.detail?.actionId || '').trim();
    if (!actionId) return;
    const result = core.resolveAction(items(), actionId, actionEngine);
    if (!result) return;
    replaceUrl(core.setActionUrl(window.location.href, result));
    attemptedActionId = actionId;
  }

  function clearStaleAction() {
    if (!core.actionFromUrl(window.location.href)) return;
    replaceUrl(core.clearActionUrl(window.location.href));
    attemptedActionId = '';
  }

  function restoreActionFromUrl() {
    const actionId = core.actionFromUrl(window.location.href);
    if (!actionId || actionId === attemptedActionId || !items().length) return;
    attemptedActionId = actionId;
    const result = core.resolveAction(items(), actionId, actionEngine);
    if (!result) {
      renderAudit('linku i hapit nuk është i disponueshëm pa verifikim klinik');
      return;
    }
    window.dispatchEvent(new CustomEvent('medindex:emergency-action-open', {
      detail:{actionId, source:'url'},
    }));
  }

  function hydrate() {
    renderAudit();
    restoreActionFromUrl();
  }

  function scheduleHydrate() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(hydrate);
  }

  list.addEventListener('click', event => {
    if (event.target.closest('.ck-list-button[data-id]')) clearStaleAction();
  }, {capture:true});

  window.addEventListener('medindex:emergency-action-opened', syncOpenedAction);
  window.addEventListener('popstate', () => {
    attemptedActionId = '';
    scheduleHydrate();
  });

  const observer = new MutationObserver(scheduleHydrate);
  observer.observe(list, {childList:true, subtree:true});

  window.MedIndexEmergencyActionAuditV13 = Object.freeze({
    report:currentAudit,
    issues:() => currentAudit().issues.map(issue => ({...issue, reasons:[...issue.reasons]})),
  });

  hydrate();
  window.setTimeout(hydrate, 280);
  window.setTimeout(hydrate, 900);
})();