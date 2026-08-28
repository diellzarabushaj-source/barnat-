(() => {
  'use strict';

  const VERSION = 'registry-tailgrids-refinement-20260801-3';

  let active = false;
  let paginationObserver = null;
  let tableObserver = null;
  let enhancingPagination = false;
  let scheduled = false;

  const arrowIcon = direction => direction === 'left'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

  const editIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  function ensureRuntimeStyles() {
    // Runtime style injection retired: the rule is materialized in registry-table-tools.css.
    document.documentElement.dataset.registryTailgridsCss = 'final-authority';
  }

  function normalizePaginationButton(button, type) {
    if (!button) return;
    button.dataset.tgPaginationType = type;
    button.classList.add('tg-pagination-nav');
    const markup = type === 'previous'
      ? `${arrowIcon('left')}<span>Para</span>`
      : `<span>Pas</span>${arrowIcon('right')}`;
    if (button.innerHTML !== markup) button.innerHTML = markup;
    button.setAttribute('aria-label', type === 'previous' ? 'Faqja e mëparshme' : 'Faqja pasuese');
  }

  function enhancePagination() {
    const root = document.getElementById('pagination');
    if (!root || enhancingPagination) return;
    enhancingPagination = true;

    try {
      root.classList.add('tg-pagination');
      root.setAttribute('role', 'navigation');
      root.setAttribute('aria-label', 'Navigimi në faqet e regjistrit');

      const existingControls = root.querySelector(':scope > .tg-pagination-controls');
      const directButtons = Array.from(root.children).filter(node => node.tagName === 'BUTTON');
      const sourceButtons = existingControls
        ? Array.from(existingControls.children).filter(node => node.tagName === 'BUTTON')
        : directButtons;

      if (!sourceButtons.length) {
        root.querySelector(':scope > .tg-pagination-summary')?.remove();
        return;
      }

      let controls = existingControls;
      if (!controls) {
        controls = document.createElement('div');
        controls.className = 'tg-pagination-controls';
        Array.from(root.children)
          .filter(node => !node.classList?.contains('tg-pagination-summary'))
          .forEach(node => controls.appendChild(node));
        root.appendChild(controls);
      }

      const buttons = Array.from(controls.querySelectorAll(':scope > button'));
      const numericButtons = buttons.filter(button => /^\d+$/.test(button.textContent.trim()));
      const currentButton = numericButtons.find(button => button.classList.contains('active'));
      const current = Number(currentButton?.textContent || 1);
      const total = Math.max(1, ...numericButtons.map(button => Number(button.textContent || 0)));

      numericButtons.forEach(button => {
        const page = Number(button.textContent.trim());
        button.setAttribute('aria-label', `Shko në faqen ${page}`);
        if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      });

      if (buttons.length > 1) {
        normalizePaginationButton(buttons[0], 'previous');
        normalizePaginationButton(buttons[buttons.length - 1], 'next');
      }
      controls.querySelectorAll(':scope > span').forEach(span => span.classList.add('tg-pagination-ellipsis'));

      let summary = root.querySelector(':scope > .tg-pagination-summary');
      if (!summary) {
        summary = document.createElement('span');
        summary.className = 'tg-pagination-summary';
        root.prepend(summary);
      }
      const summaryText = `Faqja ${current} nga ${total}`;
      if (summary.textContent !== summaryText) summary.textContent = summaryText;
    } finally {
      enhancingPagination = false;
    }
  }

  function enhanceEditorButtons() {
    document.querySelectorAll('.clinical-editor-open').forEach(button => {
      const alreadyNormalized = button.dataset.tgEditorButton === VERSION
        && button.querySelector(':scope > svg')
        && button.querySelector(':scope > span')?.textContent === 'Redakto';
      if (!alreadyNormalized) {
        button.innerHTML = `${editIcon}<span>Redakto</span>`;
        button.dataset.tgEditorButton = VERSION;
      }
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-label', 'Redakto barin');
      button.title = 'Redakto barin';
    });
  }

  function refresh() {
    if (!active) return;
    enhancePagination();
    enhanceEditorButtons();
    document.documentElement.dataset.registryTailgridsRefinement = VERSION;
  }

  function scheduleRefresh() {
    if (!active || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      refresh();
    });
  }

  function observe() {
    const pagination = document.getElementById('pagination');
    if (pagination) {
      paginationObserver?.disconnect();
      paginationObserver = new MutationObserver(scheduleRefresh);
      paginationObserver.observe(pagination, { childList:true, subtree:true });
    }

    const tbody = document.getElementById('tbody');
    if (tbody) {
      tableObserver?.disconnect();
      tableObserver = new MutationObserver(scheduleRefresh);
      tableObserver.observe(tbody, { childList:true, subtree:true });
    }
  }

  function activate() {
    if (active) return;
    active = true;
    ensureRuntimeStyles();
    observe();
    refresh();
  }

  ['medindex:registry-ready', 'medindex:registry-data-ready', 'medindex:registry-table-stable']
    .forEach(eventName => window.addEventListener(eventName, scheduleRefresh));
  window.addEventListener('pageshow', scheduleRefresh, { passive:true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', activate, { once:true });
  else activate();
})();