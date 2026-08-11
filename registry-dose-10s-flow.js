(() => {
  'use strict';

  const VERSION = 'registry-dose-10s-flow-v2';
  const MODAL_ID = 'doseCalculatorModal';
  const STYLE_ID = 'doseCalculator10sFlowStyles';
  let modal = null;
  let modalObserver = null;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${MODAL_ID} .dose-calculator-dialog{width:min(560px,100%);padding:18px}
      #${MODAL_ID} .dose-calculator-dialog-header{margin-bottom:6px}
      #${MODAL_ID} .dose-calculator-dialog-header h2{font-size:1.3rem}
      #${MODAL_ID} .dose-calculator-product{margin-bottom:10px;padding:8px 10px}
      #${MODAL_ID} .dose-calculator-progress{display:none!important}
      #${MODAL_ID} .dose-calculator-form{gap:10px}
      #${MODAL_ID} .dose-calculator-form label{gap:5px}
      #${MODAL_ID} .dose-calculator-form input,
      #${MODAL_ID} .dose-calculator-form select{min-height:46px;font-size:.92rem}
      #${MODAL_ID} .dose-calculator-weight-chips{display:none!important}
      #${MODAL_ID} .dose-calculator-auto-note{margin:8px 0 0;padding:7px 9px;border-radius:8px;background:rgba(13,95,99,.055);color:#52626a;font-size:.72rem;font-weight:700;text-align:left}
      #${MODAL_ID} .dose-calculator-result{margin-top:11px;padding:14px}
      #${MODAL_ID} .dose-calculator-result>p{font-size:1.05rem;line-height:1.45}
      #${MODAL_ID} .dose-calculator-result details{margin-top:10px;padding-top:9px}
      #${MODAL_ID} .dose-calculator-result-actions{margin-top:10px}
      #${MODAL_ID}[data-dose-fast-ready="true"] .dose-calculator-result:not([hidden]){scroll-margin-block:12px}
      [data-theme="dark"] #${MODAL_ID} .dose-calculator-auto-note{background:rgba(128,214,216,.07);color:#b8c7c9}
      @media(max-width:760px){
        #${MODAL_ID} .dose-calculator-dialog{padding:16px;max-height:96vh}
        #${MODAL_ID} .dose-calculator-product{margin-bottom:8px}
        #${MODAL_ID} .dose-calculator-form{gap:9px}
        #${MODAL_ID} .dose-calculator-form input,
        #${MODAL_ID} .dose-calculator-form select{min-height:48px;font-size:16px}
        #${MODAL_ID} .dose-calculator-result>p{font-size:1rem}
      }
    `;
    document.head.appendChild(style);
  }

  function visible(node) {
    return node instanceof HTMLElement && !node.hidden && !node.closest('[hidden]');
  }

  function ensureExplicitIndication(root) {
    const wrap = root.querySelector('[data-dose-indication-wrap]');
    const select = root.querySelector('[data-dose-indication]');
    if (!(select instanceof HTMLSelectElement) || !(wrap instanceof HTMLElement)) return;

    const realOptions = Array.from(select.options).filter(option => !option.dataset.doseFastPlaceholder);
    if (wrap.hidden || realOptions.length <= 1) {
      select.querySelectorAll('[data-dose-fast-placeholder]').forEach(option => option.remove());
      if (realOptions.length === 1 && !realOptions[0].selected) realOptions[0].selected = true;
      return;
    }

    let placeholder = select.querySelector('[data-dose-fast-placeholder]');
    if (!placeholder) {
      placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Zgjidh indikacionin';
      placeholder.disabled = true;
      placeholder.dataset.doseFastPlaceholder = 'true';
      select.insertBefore(placeholder, select.firstChild);
      placeholder.selected = true;
      select.selectedIndex = 0;
    }
  }

  function setCue(cue, text) {
    if (cue.textContent !== text) cue.textContent = text;
  }

  function updateCue(root) {
    const cue = root.querySelector('.dose-calculator-auto-note');
    const indicationWrap = root.querySelector('[data-dose-indication-wrap]');
    const indication = root.querySelector('[data-dose-indication]');
    const age = root.querySelector('[data-dose-age]');
    const weightWrap = root.querySelector('[data-dose-weight-wrap]');
    const weight = root.querySelector('[data-dose-weight]');
    const result = root.querySelector('[data-dose-result]');
    if (!(cue instanceof HTMLElement)) return;

    if (visible(indicationWrap) && !String(indication?.value || '').trim()) {
      setCue(cue, 'Zgjidh indikacionin → shkruaj moshën → rezultati del automatikisht.');
      return;
    }
    if (!String(age?.value || '').trim()) {
      setCue(cue, 'Shkruaj moshën. Pesha hapet vetëm kur rregulli e kërkon.');
      return;
    }
    if (visible(weightWrap) && !String(weight?.value || '').trim()) {
      setCue(cue, 'Shkruaj peshën e matur; nuk ka hap tjetër për kalkulim.');
      return;
    }
    if (result instanceof HTMLElement && !result.hidden) {
      setCue(cue, 'Rezultati është gati.');
      return;
    }
    setCue(cue, 'Rezultati llogaritet automatikisht sapo të dhënat janë të plota.');
  }

  function tuneInputs(root) {
    const indication = root.querySelector('[data-dose-indication]');
    const age = root.querySelector('[data-dose-age]');
    const weight = root.querySelector('[data-dose-weight]');
    const chips = root.querySelector('[data-dose-weight-chips]');

    if (age instanceof HTMLInputElement) {
      age.enterKeyHint = 'next';
      age.setAttribute('aria-label', 'Mosha e pacientit');
    }
    if (weight instanceof HTMLInputElement) {
      weight.enterKeyHint = 'done';
      weight.setAttribute('aria-label', 'Pesha e matur e pacientit në kilogramë');
    }
    if (indication instanceof HTMLSelectElement) indication.setAttribute('aria-label', 'Indikacioni');
    chips?.querySelectorAll('button').forEach(button => {
      if (button.tabIndex !== -1) button.tabIndex = -1;
      if (button.getAttribute('aria-hidden') !== 'true') button.setAttribute('aria-hidden', 'true');
    });
  }

  function focusNextFromAge(root) {
    const weightWrap = root.querySelector('[data-dose-weight-wrap]');
    const weight = root.querySelector('[data-dose-weight]');
    if (visible(weightWrap) && weight instanceof HTMLInputElement) {
      weight.focus();
      weight.select?.();
      return;
    }
    const result = root.querySelector('[data-dose-result]');
    if (result instanceof HTMLElement && !result.hidden) result.scrollIntoView({ block:'nearest', behavior:'auto' });
  }

  function wireEvents(root) {
    if (root.dataset.doseFastEvents === 'true') return;
    root.dataset.doseFastEvents = 'true';

    root.addEventListener('change', event => {
      if (event.target.matches?.('[data-dose-indication]') && String(event.target.value || '').trim()) {
        requestAnimationFrame(() => root.querySelector('[data-dose-age]')?.focus());
      }
      updateCue(root);
    });

    root.addEventListener('input', () => updateCue(root));

    root.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      if (event.target.matches?.('[data-dose-age]')) {
        event.preventDefault();
        requestAnimationFrame(() => focusNextFromAge(root));
      } else if (event.target.matches?.('[data-dose-weight]')) {
        const result = root.querySelector('[data-dose-result]');
        if (result instanceof HTMLElement && !result.hidden) {
          event.preventDefault();
          event.target.blur();
          result.scrollIntoView({ block:'nearest', behavior:'auto' });
        }
      }
    });
  }

  function prepareModal(root) {
    if (!(root instanceof HTMLElement)) return;
    injectStyles();
    tuneInputs(root);
    ensureExplicitIndication(root);
    wireEvents(root);
    if (root.dataset.doseFastReady !== 'true') root.dataset.doseFastReady = 'true';
    updateCue(root);
  }

  function watchModal(root) {
    modalObserver?.disconnect();
    modalObserver = new MutationObserver(mutations => {
      let optionsChanged = false;
      let visibilityChanged = false;
      let meaningfulChildChange = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.target.matches?.('[data-dose-indication]')) optionsChanged = true;
        if (mutation.type === 'childList' && !mutation.target.closest?.('.dose-calculator-auto-note')) meaningfulChildChange = true;
        if (mutation.type === 'attributes') visibilityChanged = true;
      }
      if (optionsChanged || (visibilityChanged && !root.hidden)) prepareModal(root);
      else if (!root.hidden && meaningfulChildChange) updateCue(root);
    });
    modalObserver.observe(root, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden'] });
  }

  function install() {
    const root = document.getElementById(MODAL_ID);
    if (!(root instanceof HTMLElement)) return false;
    if (root !== modal) {
      modal = root;
      prepareModal(root);
      watchModal(root);
    }
    document.documentElement.dataset.doseFastFlow = VERSION;
    return true;
  }

  function installSearchShortcut() {
    document.addEventListener('keydown', event => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;
      if (modal && !modal.hidden) return;
      const search = document.getElementById('search');
      if (!(search instanceof HTMLInputElement)) return;
      event.preventDefault();
      search.focus();
      search.select();
    });
  }

  function start() {
    installSearchShortcut();
    if (install()) return;
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.body, { childList:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  window.MedIndexDose10sFlow = Object.freeze({ version:VERSION, refresh:install });
})();
