(() => {
  'use strict';

  const VERSION = 'registry-tailgrids-refinement-20260801-1';
  const STYLE_ID = 'registryTailgridsRefinementStyles';
  const STYLE_HREF = '/registry-tailgrids-refinement.css?v=20260801-1';

  let paginationObserver = null;
  let tableObserver = null;
  let enhancingPagination = false;
  let scheduled = false;

  const icon = direction => direction === 'left'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

  function ensureStyles() {
    let link = document.getElementById(STYLE_ID);
    if (!link) {
      link = document.createElement('link');
      link.id = STYLE_ID;
      link.rel = 'stylesheet';
      link.href = STYLE_HREF;
      link.dataset.registryTailgridsRefinement = VERSION;
    }
    if (document.head.lastElementChild !== link) document.head.appendChild(link);
  }

  function normalizeButton(button, type) {
    if (!button || button.dataset.tgPaginationType === type) return;
    button.dataset.tgPaginationType = type;
    button.classList.add('tg-pagination-nav');
    if (type === 'previous') {
      button.innerHTML = `${icon('left')}<span>Para</span>`;
      button.setAttribute('aria-label', 'Faqja e mëparshme');
    } else {
      button.innerHTML = `<span>Pas</span>${icon('right')}`;
      button.setAttribute('aria-label', 'Faqja pasuese');
    }
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
        const summary = root.querySelector(':scope > .tg-pagination-summary');
        if (summary) summary.remove();
        return;
      }

      let controls = existingControls;
      if (!controls) {
        controls = document.createElement('div');
        controls.className = 'tg-pagination-controls';
        const movable = Array.from(root.children).filter(node => !node.classList?.contains('tg-pagination-summary'));
        movable.forEach(node => controls.appendChild(node));
        root.appendChild(controls);
      }

      const buttons = Array.from(controls.querySelectorAll(':scope > button'));
      const numericButtons = buttons.filter(button => /^\d+$/.test(button.textContent.trim()));
      const currentButton = numericButtons.find(button => button.classList.contains('active'));
      const current = Number(currentButton?.textContent || 1);
      const total = Math.max(1, ...numericButtons.map(button => Number(button.textContent || 0)));

      buttons.forEach(button => {
        if (/^\d+$/.test(button.textContent.trim())) {
          const page = Number(button.textContent.trim());
          button.setAttribute('aria-label', `Shko në faqen ${page}`);
          if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
          else button.removeAttribute('aria-current');
        }
      });

      normalizeButton(buttons[0], 'previous');
      normalizeButton(buttons[buttons.length - 1], 'next');

      controls.querySelectorAll(':scope > span').forEach(span => span.classList.add('tg-pagination-ellipsis'));

      let summary = root.querySelector(':scope > .tg-pagination-summary');
      if (!summary) {
        summary = document.createElement('span');
        summary.className = 'tg-pagination-summary';
        root.prepend(summary);
      }
      summary.textContent = `Faqja ${current} nga ${total}`;
    } finally {
      enhancingPagination = false;
    }
  }

  function enhanceEditorButtons() {
    document.querySelectorAll('.clinical-editor-open').forEach(button => {
      button.setAttribute('aria-haspopup', 'dialog');
      button.title = 'Hap panelin e redaktimit';
    });
  }

  function refresh() {
    ensureStyles();
    enhancePagination();
    enhanceEditorButtons();
    document.documentElement.dataset.registryTailgridsRefinement = VERSION;
  }

  function scheduleRefresh() {
    if (scheduled) return;
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

  function boot() {
    ensureStyles();
    observe();
    refresh();
  }

  ['medindex:registry-ready', 'medindex:registry-data-ready', 'medindex:registry-table-stable']
    .forEach(eventName => window.addEventListener(eventName, scheduleRefresh));
  window.addEventListener('pageshow', scheduleRefresh, { passive:true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
