'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'registry-mobile-lite.js');
const MARKER = 'registry-mobile-phase10-a11y-v1';

let source = fs.readFileSync(TARGET, 'utf8').replace(/\r\n?/g, '\n');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Phase 10 accessibility patch could not find ${label}.`);
  source = source.replace(before, after);
}

if (!source.includes(MARKER)) {
  replaceOnce(
    `  let detailController = null;\n  let searchTimer = 0;`,
    `  let detailController = null;\n  let detailReturnFocus = null;\n  let detailKeydownBound = false;\n  const PHASE10_A11Y = '${MARKER}';\n  let searchTimer = 0;`,
    'detail state anchor',
  );

  replaceOnce(
    `  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({\n    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'\n  }[character]));`,
    `  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({\n    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'\n  }[character]));\n  const visibleFocusable = root => [...root.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]\n    .filter(node => !node.hidden && node.getAttribute('aria-hidden') !== 'true' && node.getClientRects().length);\n  const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;`,
    'accessibility helpers',
  );

  const controlsAnchor = `  function configureMobileControls() {`;
  const liveRegions = `  function hardenMobileSemantics() {\n    const badge = document.getElementById('countBadge');\n    if (badge) {\n      badge.setAttribute('role', 'status');\n      badge.setAttribute('aria-live', 'polite');\n      badge.setAttribute('aria-atomic', 'true');\n    }\n    const pagination = document.getElementById('pagination');\n    if (pagination) {\n      pagination.setAttribute('role', 'navigation');\n      pagination.setAttribute('aria-label', 'Faqet e rezultateve të barnave');\n    }\n    const table = document.getElementById('dataTable');\n    if (table) table.setAttribute('aria-label', table.getAttribute('aria-label') || 'Rezultatet e barnave');\n  }\n\n${controlsAnchor}`;
  replaceOnce(controlsAnchor, liveRegions, 'mobile semantics anchor');

  source = source.replace(
    `<button type="button" class="mobile-lite-more" data-mobile-lite-detail="\${id}">Më shumë</button>`,
    `<button type="button" class="mobile-lite-more" data-mobile-lite-detail="\${id}" aria-expanded="false" aria-label="Më shumë për \${escapeHtml(row.tradeName || 'barin')}">Më shumë</button>`
  );
  source = source.replace(
    `<button type="button" class="mobile-lite-open" data-mobile-lite-detail="\${id}" aria-label="Hap \${escapeHtml(row.tradeName)}">`,
    `<button type="button" class="mobile-lite-open" data-mobile-lite-detail="\${id}" aria-expanded="false" aria-label="Hap \${escapeHtml(row.tradeName)}">`
  );

  source = source.replace(
    `<section class="mobile-lite-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="mobileLiteDetailTitle">`,
    `<section class="mobile-lite-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="mobileLiteDetailTitle" tabindex="-1">`
  );

  const closeAnchor = `  function closeDetail() {\n    detailController?.abort();\n    const dialog = document.getElementById('mobileLiteDrugDetail');\n    if (!dialog) return;\n    dialog.hidden = true;\n    document.body.classList.remove('mobile-lite-detail-open');\n  }`;
  const closeReplacement = `  function closeDetail() {\n    detailController?.abort();\n    const dialog = document.getElementById('mobileLiteDrugDetail');\n    if (!dialog) return;\n    dialog.hidden = true;\n    document.body.classList.remove('mobile-lite-detail-open');\n    const returnFocus = detailReturnFocus;\n    if (returnFocus?.isConnected) returnFocus.setAttribute('aria-expanded', 'false');\n    detailReturnFocus = null;\n    if (returnFocus?.isConnected) requestAnimationFrame(() => returnFocus.focus({ preventScroll:true }));\n  }\n\n  function trapDetailKeyboard(event) {\n    const dialog = document.getElementById('mobileLiteDrugDetail');\n    if (!dialog || dialog.hidden || state.disabled) return;\n    if (event.key === 'Escape') {\n      event.preventDefault();\n      closeDetail();\n      return;\n    }\n    if (event.key !== 'Tab') return;\n    const sheet = dialog.querySelector('.mobile-lite-detail-sheet');\n    const items = sheet ? visibleFocusable(sheet) : [];\n    if (!items.length) {\n      event.preventDefault();\n      sheet?.focus({ preventScroll:true });\n      return;\n    }\n    const first = items[0];\n    const last = items.at(-1);\n    if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) {\n      event.preventDefault();\n      last.focus();\n    } else if (!event.shiftKey && document.activeElement === last) {\n      event.preventDefault();\n      first.focus();\n    }\n  }`;
  replaceOnce(closeAnchor, closeReplacement, 'detail close/focus anchor');

  replaceOnce(
    `    dialog.hidden = false;\n    document.body.classList.add('mobile-lite-detail-open');\n    body.innerHTML = '<div class="mobile-lite-detail-loading">Duke i ngarkuar detajet…</div>';`,
    `    detailReturnFocus = trigger instanceof HTMLElement ? trigger : (document.activeElement instanceof HTMLElement ? document.activeElement : null);\n    dialog.hidden = false;\n    document.body.classList.add('mobile-lite-detail-open');\n    trigger?.setAttribute('aria-expanded', 'true');\n    body.innerHTML = '<div class="mobile-lite-detail-loading" role="status" aria-live="polite">Duke i ngarkuar detajet…</div>';\n    requestAnimationFrame(() => dialog.querySelector('[data-mobile-lite-close]')?.focus({ preventScroll:true }));`,
    'detail opening semantics',
  );

  source = source.replace(
    `      trigger?.setAttribute('aria-expanded', 'true');`,
    `      trigger?.setAttribute('aria-expanded', 'true');`
  );

  replaceOnce(
    `      body.innerHTML = \`<div class="mobile-lite-detail-error">\${escapeHtml(error?.message || 'Detajet nuk u ngarkuan.')}</div>\`;`,
    `      body.innerHTML = \`<div class="mobile-lite-detail-error" role="alert">\${escapeHtml(error?.message || 'Detajet nuk u ngarkuan.')}</div>\`;`,
    'detail error announcement',
  );

  replaceOnce(
    `  function start() {\n    if (state.disabled) return;\n    configureMobileControls();`,
    `  function start() {\n    if (state.disabled) return;\n    hardenMobileSemantics();\n    configureMobileControls();\n    if (!detailKeydownBound) {\n      document.addEventListener('keydown', trapDetailKeyboard, true);\n      detailKeydownBound = true;\n    }`,
    'mobile start semantics',
  );

  source = source.replace(
    `if (scroll) document.getElementById('registryContent')?.scrollIntoView({ block:'start', behavior:'smooth' });`,
    `if (scroll) document.getElementById('registryContent')?.scrollIntoView({ block:'start', behavior:prefersReducedMotion() ? 'auto' : 'smooth' });`
  );
}

if (!source.includes(MARKER)) throw new Error('Phase 10 accessibility marker missing.');
if (!source.includes("event.key === 'Escape'")) throw new Error('Phase 10 Escape close is missing.');
if (!source.includes("event.key !== 'Tab'")) throw new Error('Phase 10 focus trap is missing.');
if (!source.includes("returnFocus.focus({ preventScroll:true })")) throw new Error('Phase 10 focus return is missing.');
if (!source.includes("badge.setAttribute('aria-live', 'polite')")) throw new Error('Phase 10 result announcements are missing.');
if (!source.includes("role=\"alert\"")) throw new Error('Phase 10 detail error announcement is missing.');
if (!source.includes("prefersReducedMotion() ? 'auto' : 'smooth'")) throw new Error('Phase 10 reduced-motion scroll guard is missing.');

fs.writeFileSync(TARGET, source, 'utf8');
console.log('Phase 10 mobile-lite focus trap, Escape close, focus return, live status and reduced-motion accessibility passed.');
