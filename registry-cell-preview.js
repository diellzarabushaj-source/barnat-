(() => {
  'use strict';

  const VERSION = 'registry-cell-preview-20260801-2';
  const DIALOG_ID = 'registryCellPreviewDialog';
  const TRIGGER_CLASS = 'registry-cell-preview-trigger';
  const PREVIEW_ATTR = 'data-registry-cell-preview';
  const THRESHOLDS = Object.freeze({
    'active-substance':34,
    'drug-class':40,
    use:44,
    form:30,
    'dosage-adult':54,
    'dosage-pediatric':54,
  });

  // Lineicons Basic (MIT): expand-square-4 and xmark.
  // Source: LineiconsHQ/Lineicons, assets/svgs/regular/.
  const EXPAND_ICON = `
    <svg viewBox="0 0 25 24" fill="none" aria-hidden="true" data-lineicons-icon="expand-square-4">
      <path d="M3.5625 5.5C3.5625 4.25736 4.56986 3.25 5.8125 3.25H8.31213C8.72635 3.25 9.06213 3.58579 9.06213 4C9.06213 4.41421 8.72635 4.75 8.31213 4.75H5.8125C5.39829 4.75 5.0625 5.08579 5.0625 5.5V8C5.0625 8.41421 4.72671 8.75 4.3125 8.75C3.89829 8.75 3.5625 8.41421 3.5625 8V5.5Z" fill="currentColor"/>
      <path d="M15.5614 4C15.5614 3.58579 15.8972 3.25 16.3114 3.25H18.811C20.0537 3.25 21.061 4.25736 21.061 5.5L21.061 8C21.061 8.41421 20.7253 8.75 20.311 8.75C19.8968 8.75 19.561 8.41421 19.561 8L19.561 5.5C19.561 5.08579 19.2253 4.75 18.811 4.75H16.3114C15.8972 4.75 15.5614 4.41421 15.5614 4Z" fill="currentColor"/>
      <path d="M4.3125 15.25C4.72671 15.25 5.0625 15.5858 5.0625 16V18.5C5.0625 18.9142 5.39829 19.25 5.8125 19.25H8.31214C8.72635 19.25 9.06214 19.5858 9.06214 20C9.06214 20.4142 8.72635 20.75 8.31214 20.75H5.8125C4.56986 20.75 3.5625 19.7426 3.5625 18.5V16C3.5625 15.5858 3.89829 15.25 4.3125 15.25Z" fill="currentColor"/>
      <path d="M20.3111 15.25C20.7253 15.25 21.0611 15.5858 21.0611 16L21.0611 18.5C21.0611 19.7426 20.0537 20.75 18.8111 20.75H16.3114C15.8972 20.75 15.5614 20.4142 15.5614 20C15.5614 19.5858 15.8972 19.25 16.3114 19.25H18.8111C19.2253 19.25 19.5611 18.9142 19.5611 18.5L19.5611 16C19.5611 15.5858 19.8968 15.25 20.3111 15.25Z" fill="currentColor"/>
    </svg>`;

  const CLOSE_ICON = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" data-lineicons-icon="xmark">
      <path d="M6.21967 7.28033C5.92678 6.98744 5.92678 6.51256 6.21967 6.21967C6.51256 5.92678 6.98744 5.92678 7.28033 6.21967L11.999 10.9384L16.7176 6.2198C17.0105 5.92691 17.4854 5.92691 17.7782 6.2198C18.0711 6.51269 18.0711 6.98757 17.7782 7.28046L13.0597 11.999L17.7782 16.7176C18.0711 17.0105 18.0711 17.4854 17.7782 17.7782C17.4854 18.0711 17.0105 18.0711 16.7176 17.7782L11.999 13.0597L7.28033 17.7784C6.98744 18.0713 6.51256 18.0713 6.21967 17.7784C5.92678 17.4855 5.92678 17.0106 6.21967 16.7177L10.9384 11.999L6.21967 7.28033Z" fill="currentColor"/>
    </svg>`;

  let tableObserver = null;
  let scheduled = false;
  let active = false;
  let activeTrigger = null;
  let fallbackTimer = 0;

  const cleanInline = value => String(value ?? '').replace(/[\t ]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
  const cleanMultiline = value => String(value ?? '')
    .replace(/\r/g, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n[\t ]+/g, '\n')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  function columnKey(cell) {
    return cleanInline(cell?.dataset?.registryColumnKey || '');
  }

  function columnLabel(cell) {
    const explicit = cleanInline(cell?.dataset?.label);
    if (explicit) return explicit;
    const key = columnKey(cell);
    const header = Array.from(document.querySelectorAll('#headerRow > th'))
      .find(item => item.dataset.registryColumnKey === key);
    return cleanInline(header?.textContent).replace(/[↕↑↓]+$/g, '').trim() || key || 'Përmbajtja e qelizës';
  }

  function prepareCloneForText(cell) {
    const clone = cell.cloneNode(true);
    clone.querySelectorAll(`.${TRIGGER_CLASS},input,select,textarea,button,.drug-actions-trigger,.favorite-marker,.clinical-editor-open`)
      .forEach(element => element.remove());
    clone.querySelectorAll('details').forEach(details => {
      details.open = true;
      const summary = details.querySelector(':scope > summary');
      if (summary && details.children.length > 1) summary.remove();
    });
    clone.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode('\n')));
    clone.querySelectorAll('li,p').forEach(item => item.append(document.createTextNode('\n')));
    return clone;
  }

  function extractCellText(cell) {
    if (!cell) return '';
    const clone = prepareCloneForText(cell);
    return cleanMultiline(clone.innerText || clone.textContent || '')
      .replace(/\s*Më shumë\s*$/i, '')
      .replace(/\s*Shfaq skemat\s*$/i, '')
      .trim();
  }

  function hasExistingControl(cell) {
    if (!cell) return true;
    if (columnKey(cell) === 'trade-name') return true;
    if (cell.querySelector('.drug-select,.drug-actions-trigger,.favorite-marker,.clinical-editor-open')) return true;
    return cell.matches('.registry-verification-column,.registry-editor-column,.registry-actions-column');
  }

  function elementIsClipped(element) {
    return element instanceof HTMLElement
      && element.clientWidth > 0
      && element.clientHeight > 0
      && (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2);
  }

  function cellIsVisuallyClipped(cell) {
    return [cell, ...cell.querySelectorAll('.drug-name-text,.registry-dosage-preview,.registry-cell-value,[class*="truncate"],[class*="clamp"]')]
      .some(elementIsClipped);
  }

  function shouldPreviewCell(cell, text) {
    if (!cell || !text || hasExistingControl(cell)) return false;
    return cellIsVisuallyClipped(cell) || text.length > (THRESHOLDS[columnKey(cell)] || 58);
  }

  function removePreview(cell) {
    cell.querySelector(`:scope > .${TRIGGER_CLASS}`)?.remove();
    cell.removeAttribute(PREVIEW_ATTR);
    delete cell.dataset.registryCellPreviewText;
  }

  function createTrigger(cell, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = TRIGGER_CLASS;
    button.innerHTML = EXPAND_ICON;
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', DIALOG_ID);
    button.setAttribute('aria-label', `Shfaq ${label.toLocaleLowerCase('sq')} të plotë`);
    button.title = 'Shfaq tekstin e plotë';
    button.dataset.lineiconsSource = 'Lineicons Basic / expand-square-4';
    cell.appendChild(button);
    return button;
  }

  function enhanceCell(cell) {
    if (!(cell instanceof HTMLTableCellElement)) return;
    const text = extractCellText(cell);
    if (!shouldPreviewCell(cell, text)) {
      if (cell.hasAttribute(PREVIEW_ATTR)) removePreview(cell);
      return;
    }
    const label = columnLabel(cell);
    cell.setAttribute(PREVIEW_ATTR, 'true');
    cell.dataset.registryCellPreviewText = text;
    const trigger = cell.querySelector(`:scope > .${TRIGGER_CLASS}`) || createTrigger(cell, label);
    trigger.setAttribute('aria-label', `Shfaq ${label.toLocaleLowerCase('sq')} të plotë`);
  }

  function connectObserver() {
    const tbody = document.getElementById('tbody');
    if (!tbody || !tableObserver) return;
    tableObserver.observe(tbody, { childList:true, subtree:true, characterData:true });
  }

  function enhanceVisibleCells() {
    const tbody = document.getElementById('tbody');
    if (!tbody) return;
    tableObserver?.disconnect();
    try {
      tbody.querySelectorAll(':scope > tr:not([hidden]) > td').forEach(cell => {
        if (!cell.classList.contains('empty-state')) enhanceCell(cell);
      });
      document.documentElement.dataset.registryCellPreview = VERSION;
    } finally {
      connectObserver();
    }
  }

  function scheduleEnhance() {
    if (!active || scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      enhanceVisibleCells();
    };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout:1400 });
    else setTimeout(() => requestAnimationFrame(run), 160);
  }

  function activate() {
    if (active) return;
    active = true;
    clearTimeout(fallbackTimer);
    setTimeout(scheduleEnhance, 520);
  }

  function ensureDialog() {
    let dialog = document.getElementById(DIALOG_ID);
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = DIALOG_ID;
    dialog.className = 'registry-cell-preview-dialog';
    dialog.setAttribute('aria-labelledby', `${DIALOG_ID}Title`);
    dialog.setAttribute('aria-describedby', `${DIALOG_ID}Body`);
    dialog.innerHTML = `
      <section class="registry-cell-preview-card">
        <header class="registry-cell-preview-header">
          <div class="registry-cell-preview-heading">
            <span class="registry-cell-preview-kicker">Teksti i plotë</span>
            <h2 class="registry-cell-preview-title" id="${DIALOG_ID}Title"></h2>
            <div class="registry-cell-preview-context" id="${DIALOG_ID}Context"></div>
          </div>
          <button class="registry-cell-preview-close" type="button" aria-label="Mbyll tekstin e plotë" title="Mbyll" data-lineicons-source="Lineicons Basic / xmark">${CLOSE_ICON}</button>
        </header>
        <div class="registry-cell-preview-body" id="${DIALOG_ID}Body" role="document" tabindex="0"></div>
      </section>`;

    const close = () => {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      else dialog.removeAttribute('open');
    };
    dialog.querySelector('.registry-cell-preview-close')?.addEventListener('click', close);
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
    dialog.addEventListener('close', () => {
      const trigger = activeTrigger;
      activeTrigger = null;
      if (trigger?.isConnected) requestAnimationFrame(() => trigger.focus({ preventScroll:true }));
    });
    document.body.appendChild(dialog);
    return dialog;
  }

  function rowContext(cell) {
    const row = cell.closest('tr');
    const tradeCell = row?.querySelector('td[data-registry-column-key="trade-name"]');
    return cleanInline(extractCellText(tradeCell)) || cleanInline(row?.dataset?.registryNumber);
  }

  function openPreview(trigger) {
    const cell = trigger.closest(`td[${PREVIEW_ATTR}="true"]`);
    if (!cell) return;
    const dialog = ensureDialog();
    const title = dialog.querySelector(`#${DIALOG_ID}Title`);
    const context = dialog.querySelector(`#${DIALOG_ID}Context`);
    const body = dialog.querySelector(`#${DIALOG_ID}Body`);
    const text = extractCellText(cell) || cell.dataset.registryCellPreviewText || '';

    activeTrigger = trigger;
    title.textContent = columnLabel(cell);
    context.textContent = rowContext(cell);
    context.toggleAttribute('hidden', !context.textContent);
    body.textContent = text;

    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    requestAnimationFrame(() => body.focus({ preventScroll:true }));
  }

  function onClick(event) {
    const trigger = event.target.closest?.(`.${TRIGGER_CLASS}`);
    if (!trigger) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openPreview(trigger);
  }

  function onKeydown(event) {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.closest?.(`.${TRIGGER_CLASS}`)) {
      event.stopImmediatePropagation();
    }
  }

  function init() {
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeydown, true);
    tableObserver = new MutationObserver(() => { if (active) scheduleEnhance(); });
    connectObserver();

    ['medindex:registry-ready', 'medindex:registry-table-stable']
      .forEach(eventName => window.addEventListener(eventName, activate, { once:true }));
    ['medindex:registry-data-ready', 'medindex:tailadmin-ready']
      .forEach(eventName => window.addEventListener(eventName, scheduleEnhance));
    window.addEventListener('resize', scheduleEnhance, { passive:true });
    window.addEventListener('pageshow', () => { activate(); scheduleEnhance(); }, { passive:true });

    const armFallback = () => { fallbackTimer = setTimeout(activate, 2200); };
    if (document.readyState === 'complete') armFallback();
    else window.addEventListener('load', armFallback, { once:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

  window.MedIndexCellPreview = {
    version:VERSION,
    refresh() { activate(); scheduleEnhance(); },
    openForCell(cell) {
      const trigger = cell?.querySelector?.(`:scope > .${TRIGGER_CLASS}`);
      if (trigger) openPreview(trigger);
    },
  };
})();
