(() => {
  'use strict';

  const TARGET_PROTOCOL = 'upk-01';
  const TRANSFER_KEY = 'medindexPrescriptionProtocolDraft';
  const HASH_PATTERN = /^[a-f0-9]{64}$/i;
  let scheduled = false;

  const clean = (value, max = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

  function routeId() {
    try { return new URL(window.location.href).searchParams.get('protocol') || ''; }
    catch { return ''; }
  }

  function currentRoot() {
    if (routeId() !== TARGET_PROTOCOL) return null;
    return document.querySelector('#protocolReader:not([hidden]) .protocol-primary-care');
  }

  function moveCitationOutsideLabel(label) {
    if (!label || label.closest('.pc-check-row')) return;
    const link = label.querySelector('.pc-source-chip');
    if (!link || !label.parentNode) return;
    const row = document.createElement('div');
    row.className = 'pc-check-row';
    label.parentNode.insertBefore(row, label);
    row.appendChild(label);
    row.appendChild(link);
  }

  function normalizeInteractiveSemantics(root) {
    root.querySelectorAll('.pc-check').forEach(moveCitationOutsideLabel);
    const title = root.querySelector('#pcProtocolHeading');
    if (title) title.textContent = 'Osteoporoza — çfarë duhet të kesh parasysh në praktikë';
    const quick = root.querySelector('#pcQuickTitle');
    if (quick) quick.textContent = 'Çfarë duhet të kontrollosh në 60 sekonda';
    const workflow = root.querySelector('#pcWorkflowTitle');
    if (workflow) workflow.textContent = 'Çfarë bën mjeku familjar?';
    const treatment = root.querySelector('#pcTreatmentTitle');
    if (treatment) treatment.textContent = 'Çfarë menaxhohet në QKMF dhe çfarë kalon te specialisti?';
  }

  function ensureHandoffButton(root) {
    const actions = root.querySelector('.pc-rx-editor-actions');
    if (!actions || actions.querySelector('[data-pc-open-receta]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pc-copy-button pc-rx-handoff';
    button.dataset.pcOpenReceta = '1';
    button.textContent = 'Vazhdo te Recetat';
    const clear = actions.querySelector('[data-pc-clear-rx]');
    actions.insertBefore(button, clear || null);
  }

  function rxValues(root) {
    return Object.fromEntries([...root.querySelectorAll('[data-pc-rx-field]')].map(field => [
      clean(field.dataset.pcRxField, 40),
      clean(field.value, field.dataset.pcRxField === 'instructions' ? 1200 : 300),
    ]));
  }

  function composerFromValues(values) {
    if (!values.medicine) return '';
    const medication = [values.medicine, values.strength].filter(Boolean).join(' ');
    const signature = [
      values.dose ? `Doza: ${values.dose}` : '',
      values.frequency ? `Shpeshtësia: ${values.frequency}` : '',
      values.duration ? `Kohëzgjatja: ${values.duration}` : '',
      values.instructions || '',
    ].filter(Boolean).join(' · ');
    return [
      'Rp:',
      medication,
      values.quantity ? `Sasia: ${values.quantity}` : '',
      signature ? `S (Signatura): ${signature}` : '',
    ].filter(Boolean).join('\n');
  }

  function sourceHash() {
    const value = clean(document.querySelector('#protocolReader .protocol-source-hash')?.textContent, 64).toLowerCase();
    return HASH_PATTERN.test(value) ? value : '';
  }

  function transferToPrescriptions(root) {
    const values = rxValues(root);
    const hash = sourceHash();
    const status = root.querySelector('[data-pc-copy-status]');
    if (!hash) {
      if (status) status.textContent = 'Burimi nuk u verifikua; drafti nuk u bart te Recetat.';
      return;
    }

    const payload = {
      version:1,
      protocolId:TARGET_PROTOCOL,
      protocolTitle:'Menaxhimi i osteoporozës',
      diagnosis:'Osteoporozë',
      sourceHash:hash,
      composer:composerFromValues(values),
      fields:values,
      createdAt:new Date().toISOString(),
    };

    try {
      sessionStorage.setItem(TRANSFER_KEY, JSON.stringify(payload));
    } catch {
      if (status) status.textContent = 'Shfletuesi nuk lejoi bartjen e draftit.';
      return;
    }

    const button = root.querySelector('[data-pc-open-receta]');
    if (button) {
      button.disabled = true;
      button.textContent = 'Duke hapur Recetat…';
    }
    window.location.assign(`recetat.html?from=protocol&protocol=${encodeURIComponent(TARGET_PROTOCOL)}`);
  }

  function enhance() {
    scheduled = false;
    const root = currentRoot();
    if (!root) return;
    normalizeInteractiveSemantics(root);
    ensureHandoffButton(root);
    if (root.dataset.pcHandoffReady === 'true') return;
    root.dataset.pcHandoffReady = 'true';
    root.addEventListener('click', event => {
      const button = event.target.closest?.('[data-pc-open-receta]');
      if (!button) return;
      event.preventDefault();
      transferToPrescriptions(root);
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  function init() {
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden'] });
    window.addEventListener('popstate', schedule);
    window.addEventListener('pageshow', schedule, { passive:true });
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
