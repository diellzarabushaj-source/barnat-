(() => {
  'use strict';

  const VERSION = 'icd-code-comparison-bridge-v1';
  const CODE_PATTERN = /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/;
  let observer = null;
  let scheduled = 0;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const activeCode = () => clean(document.getElementById('icdCodingWorkspaceCode')?.textContent).toUpperCase();
  const activeIsCodable = () => document.getElementById('icdCodingWorkspaceReadiness')?.dataset.tone === 'ready';

  function schedule() {
    clearTimeout(scheduled);
    scheduled = window.setTimeout(update, 0);
  }

  function update() {
    const button = document.querySelector('[data-mi-icd-compare-active]');
    const api = window.MedIndexIcdCodeComparison;
    if (!button || !api) return;
    const code = activeCode();
    const valid = CODE_PATTERN.test(code) && activeIsCodable();
    const current = typeof api.current === 'function' ? api.current() : [];
    const included = valid && current.some(item => clean(item?.node?.code).toUpperCase() === code);
    const full = current.length >= Number(api.MAX_ITEMS || 3);
    button.hidden = !valid;
    button.disabled = Boolean(valid && (included || (!included && full)));
    button.textContent = included ? 'Në krahasim' : full ? 'Krahasimi është plot' : 'Shto në krahasim';
    button.setAttribute('aria-label', valid ? `${button.textContent}: ${code}` : button.textContent);
  }

  function bind() {
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-mi-icd-compare-active]');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const code = activeCode();
      if (!CODE_PATTERN.test(code) || !activeIsCodable()) return;
      window.MedIndexIcdCodeComparison?.addCode?.(code, 'workspace');
    }, true);

    window.addEventListener('medindex:icd-comparison', schedule);
    window.addEventListener('medindex:icd-coding-workspace-ready', schedule);
    window.addEventListener('medindex:icd-code-comparison-ready', schedule);

    const workspace = document.getElementById('icdCodingWorkspace');
    if (workspace) {
      observer = new MutationObserver(schedule);
      observer.observe(workspace, {
        childList:true,
        subtree:true,
        characterData:true,
        attributes:true,
        attributeFilter:['data-tone', 'hidden', 'aria-busy'],
      });
    }
  }

  function init() {
    if (!document.getElementById('icdTree')) return;
    bind();
    schedule();
    document.documentElement.dataset.miIcdCodeComparisonBridge = VERSION;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();