'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function registryPaginationItems(current, total) {
  const safeTotal = Math.max(1, Math.floor(Number(total) || 1));
  const safeCurrent = Math.min(safeTotal, Math.max(1, Math.floor(Number(current) || 1)));
  if (safeTotal <= 7) return Array.from({ length:safeTotal }, (_, index) => index + 1);
  if (safeCurrent <= 4) return [1, 2, 3, 4, 'ellipsis-end', safeTotal];
  if (safeCurrent >= safeTotal - 3) return [1, 'ellipsis-start', safeTotal - 3, safeTotal - 2, safeTotal - 1, safeTotal];
  return [1, 'ellipsis-start', safeCurrent - 1, safeCurrent, safeCurrent + 1, 'ellipsis-end', safeTotal];
}

function helperSource(indent = '') {
  return registryPaginationItems
    .toString()
    .split('\n')
    .map(line => indent + line)
    .join('\n');
}

function replaceBlock(source, pattern, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!pattern.test(source)) throw new Error(`Registry pagination v2 could not find ${label}.`);
  return source.replace(pattern, replacement);
}

function patchDesktopLite() {
  const file = 'registry-desktop-lite.js';
  let source = read(file);
  if (source.includes('data-desktop-lite-page-number')) return;

  const replacement = `${helperSource('  ')}\n\n  function renderPagination() {\n    const pagination = document.getElementById('pagination');\n    if (!pagination) return;\n    const totalPages = Number.isFinite(state.totalPages) ? Math.max(1, Number(state.totalPages)) : null;\n    const current = totalPages ? Math.min(totalPages, Math.max(1, state.page)) : Math.max(1, state.page);\n    pagination.innerHTML = '';\n    pagination.classList.add('registry-pagination-v2');\n    pagination.setAttribute('role', 'navigation');\n    pagination.setAttribute('aria-label', totalPages\n      ? \`Navigimi i faqeve, faqja \${current} nga \${totalPages}\`\n      : \`Navigimi i faqeve, faqja \${current}\`);\n\n    const addButton = ({ label, page, disabled = false, active = false, kind = 'page' }) => {\n      const button = document.createElement('button');\n      button.type = 'button';\n      button.textContent = label;\n      button.className = kind === 'nav' ? 'registry-pagination-nav' : 'registry-pagination-page';\n      if (kind === 'nav') button.dataset.desktopLitePage = page < current ? 'prev' : 'next';\n      else button.dataset.desktopLitePageNumber = String(page);\n      button.disabled = Boolean(disabled);\n      if (active) {\n        button.classList.add('active');\n        button.setAttribute('aria-current', 'page');\n        button.setAttribute('aria-label', \`Faqja \${page}, faqja aktuale\`);\n      } else if (kind === 'page') {\n        button.setAttribute('aria-label', \`Shko te faqja \${page}\`);\n      }\n      button.addEventListener('click', () => {\n        if (button.disabled || state.loading || state.disabled || page === state.page) return;\n        state.page = page;\n        void loadPage({ includeTotal:false, scroll:true });\n      });\n      pagination.appendChild(button);\n    };\n\n    addButton({ label:'← Para', page:Math.max(1, current - 1), disabled:current <= 1, kind:'nav' });\n\n    if (totalPages) {\n      registryPaginationItems(current, totalPages).forEach(item => {\n        if (typeof item === 'number') {\n          addButton({ label:String(item), page:item, active:item === current });\n          return;\n        }\n        const dots = document.createElement('span');\n        dots.className = 'registry-pagination-ellipsis';\n        dots.textContent = '…';\n        dots.setAttribute('aria-hidden', 'true');\n        pagination.appendChild(dots);\n      });\n    } else {\n      const fallback = document.createElement('span');\n      fallback.className = 'registry-pagination-current-fallback';\n      fallback.textContent = String(current);\n      fallback.setAttribute('aria-label', \`Faqja \${current}\`);\n      pagination.appendChild(fallback);\n    }\n\n    addButton({\n      label:'Pas →',\n      page:current + 1,\n      disabled:totalPages ? current >= totalPages : !state.hasNext,\n      kind:'nav',\n    });\n  }\n\n  function configureControls() {`;

  source = replaceBlock(
    source,
    /  function renderPagination\(\) \{[\s\S]*?\n  \}\n\n  function configureControls\(\) \{/,
    replacement,
    'desktop-lite pagination block',
  );
  if (!source.includes('dataDesktopLitePageNumber') && !source.includes('desktopLitePageNumber')) {
    throw new Error('Desktop numbered page controls were not installed.');
  }
  write(file, source);
}

function patchMobileLite() {
  const file = 'registry-mobile-lite.js';
  let source = read(file);
  if (source.includes('data-mobile-lite-page-number')) return;

  const replacement = `${helperSource('  ')}\n\n  function renderPagination() {\n    const pagination = document.getElementById('pagination');\n    if (!pagination) return;\n    const totalPages = Number.isFinite(state.totalPages) ? Math.max(1, Number(state.totalPages)) : null;\n    const current = totalPages ? Math.min(totalPages, Math.max(1, state.page)) : Math.max(1, state.page);\n    pagination.innerHTML = '';\n    pagination.classList.add('registry-pagination-v2');\n    pagination.setAttribute('role', 'navigation');\n    pagination.setAttribute('aria-label', totalPages\n      ? \`Navigimi i faqeve, faqja \${current} nga \${totalPages}\`\n      : \`Navigimi i faqeve, faqja \${current}\`);\n\n    const addButton = ({ label, page, disabled = false, active = false, kind = 'page' }) => {\n      const button = document.createElement('button');\n      button.type = 'button';\n      button.textContent = label;\n      button.className = kind === 'nav' ? 'registry-pagination-nav' : 'registry-pagination-page';\n      if (kind === 'nav') button.dataset.mobileLitePage = page < current ? 'prev' : 'next';\n      else button.dataset.mobileLitePageNumber = String(page);\n      button.disabled = Boolean(disabled);\n      if (active) {\n        button.classList.add('active');\n        button.setAttribute('aria-current', 'page');\n        button.setAttribute('aria-label', \`Faqja \${page}, faqja aktuale\`);\n      } else if (kind === 'page') {\n        button.setAttribute('aria-label', \`Shko te faqja \${page}\`);\n      }\n      button.addEventListener('click', () => {\n        if (button.disabled || state.loading || state.disabled || page === state.page) return;\n        state.page = page;\n        void loadPage({ includeTotal:false, scroll:true });\n      });\n      pagination.appendChild(button);\n    };\n\n    addButton({ label:'← Para', page:Math.max(1, current - 1), disabled:current <= 1, kind:'nav' });\n\n    if (totalPages) {\n      registryPaginationItems(current, totalPages).forEach(item => {\n        if (typeof item === 'number') {\n          addButton({ label:String(item), page:item, active:item === current });\n          return;\n        }\n        const dots = document.createElement('span');\n        dots.className = 'registry-pagination-ellipsis';\n        dots.textContent = '…';\n        dots.setAttribute('aria-hidden', 'true');\n        pagination.appendChild(dots);\n      });\n    } else {\n      const fallback = document.createElement('span');\n      fallback.className = 'registry-pagination-current-fallback';\n      fallback.textContent = String(current);\n      fallback.setAttribute('aria-label', \`Faqja \${current}\`);\n      pagination.appendChild(fallback);\n    }\n\n    addButton({\n      label:'Pas →',\n      page:current + 1,\n      disabled:totalPages ? current >= totalPages : !state.hasNext,\n      kind:'nav',\n    });\n  }\n\n  async function loadPage({ includeTotal = false, scroll = false } = {}) {`;

  source = replaceBlock(
    source,
    /  function renderPagination\(\) \{[\s\S]*?\n  \}\n\n  async function loadPage\(\{ includeTotal = false, scroll = false \} = \{\}\) \{/,
    replacement,
    'mobile-lite pagination block',
  );
  if (!source.includes('mobileLitePageNumber')) throw new Error('Mobile numbered page controls were not installed.');
  write(file, source);
}

function patchFullRuntimeSource() {
  const file = 'app-parts/part-04.txt';
  let source = read(file);
  if (source.includes('data-registry-page-number')) return;

  const replacement = `${helperSource('')}\n\nfunction renderPagination(totalPages){\n  const pag = document.getElementById('pagination');\n  if(!pag) return;\n  pag.innerHTML = '';\n  pag.classList.add('registry-pagination-v2');\n  if(state.pageSize >= 4006){\n    pag.innerHTML = '<span class="registry-pagination-all">Duke shfaqur të gjitha rreshtat</span>';\n    return;\n  }\n\n  const safeTotal = Math.max(1, Number(totalPages) || 1);\n  const current = Math.min(safeTotal, Math.max(1, state.page));\n  pag.setAttribute('role', 'navigation');\n  pag.setAttribute('aria-label', \`Navigimi i faqeve, faqja \${current} nga \${safeTotal}\`);\n\n  const addButton = ({ label, page, disabled = false, active = false, kind = 'page' }) => {\n    const button = document.createElement('button');\n    button.type = 'button';\n    button.textContent = label;\n    button.className = kind === 'nav' ? 'registry-pagination-nav' : 'registry-pagination-page';\n    if(kind === 'page') button.dataset.registryPageNumber = String(page);\n    button.disabled = Boolean(disabled);\n    if(active){\n      button.classList.add('active');\n      button.setAttribute('aria-current', 'page');\n      button.setAttribute('aria-label', \`Faqja \${page}, faqja aktuale\`);\n    } else if(kind === 'page') {\n      button.setAttribute('aria-label', \`Shko te faqja \${page}\`);\n    }\n    button.addEventListener('click', () => {\n      if(button.disabled || page === state.page) return;\n      state.page = page;\n      render();\n    });\n    pag.appendChild(button);\n  };\n\n  addButton({ label:'← Para', page:Math.max(1, current - 1), disabled:current <= 1, kind:'nav' });\n  registryPaginationItems(current, safeTotal).forEach(item => {\n    if(typeof item === 'number'){\n      addButton({ label:String(item), page:item, active:item === current });\n      return;\n    }\n    const dots = document.createElement('span');\n    dots.className = 'registry-pagination-ellipsis';\n    dots.textContent = '…';\n    dots.setAttribute('aria-hidden', 'true');\n    pag.appendChild(dots);\n  });\n  addButton({ label:'Pas →', page:Math.min(safeTotal, current + 1), disabled:current >= safeTotal, kind:'nav' });\n}\n\nfunction buildColPanel(){`;

  source = replaceBlock(
    source,
    /function renderPagination\(totalPages\)\{[\s\S]*?\n\}\n\nfunction buildColPanel\(\)\{/,
    replacement,
    'full registry pagination block',
  );
  if (!source.includes('registryPageNumber')) throw new Error('Full-runtime numbered page controls were not installed.');
  write(file, source);
}

function patchIndexStyle() {
  const file = 'index.html';
  let source = read(file);
  if (source.includes('registry-pagination-v2.css')) return;
  const link = '<link rel="stylesheet" href="registry-pagination-v2.css?v=20260825-1" data-registry-pagination-v2-css>';
  const tableTools = /(<link rel="stylesheet" href="registry-table-tools\.css\?v=[^"]+"[^>]*>)/;
  if (tableTools.test(source)) source = source.replace(tableTools, `$1\n${link}`);
  else if (source.includes('</head>')) source = source.replace('</head>', `${link}\n</head>`);
  else throw new Error('Registry pagination v2 could not find the index stylesheet anchor.');
  write(file, source);
}

function verifyModel() {
  assert.deepEqual(registryPaginationItems(1, 81), [1, 2, 3, 4, 'ellipsis-end', 81]);
  assert.deepEqual(registryPaginationItems(4, 81), [1, 2, 3, 4, 'ellipsis-end', 81]);
  assert.deepEqual(registryPaginationItems(5, 81), [1, 'ellipsis-start', 4, 5, 6, 'ellipsis-end', 81]);
  assert.deepEqual(registryPaginationItems(40, 81), [1, 'ellipsis-start', 39, 40, 41, 'ellipsis-end', 81]);
  assert.deepEqual(registryPaginationItems(80, 81), [1, 'ellipsis-start', 78, 79, 80, 81]);
  assert.deepEqual(registryPaginationItems(81, 81), [1, 'ellipsis-start', 78, 79, 80, 81]);
  assert.deepEqual(registryPaginationItems(3, 6), [1, 2, 3, 4, 5, 6]);
}

function verifyOutput() {
  const desktop = read('registry-desktop-lite.js');
  const mobile = read('registry-mobile-lite.js');
  const full = read('app-parts/part-04.txt');
  const index = read('index.html');
  const css = read('registry-pagination-v2.css');

  for (const [label, source] of [['desktop', desktop], ['mobile', mobile], ['full runtime', full]]) {
    if (!source.includes('registryPaginationItems')) throw new Error(`${label} pagination model is missing.`);
    if (!source.includes("setAttribute('aria-current', 'page')")) throw new Error(`${label} active-page semantics are missing.`);
    if (!source.includes('registry-pagination-ellipsis')) throw new Error(`${label} ellipsis semantics are missing.`);
  }
  if (!desktop.includes('desktopLitePageNumber')) throw new Error('Desktop direct page buttons are missing.');
  if (!mobile.includes('mobileLitePageNumber')) throw new Error('Mobile direct page buttons are missing.');
  if (!full.includes('registryPageNumber')) throw new Error('Full-runtime direct page buttons are missing.');
  if (!index.includes('registry-pagination-v2.css?v=20260825-1')) throw new Error('Pagination stylesheet is not wired into index.html.');
  if (!css.includes('#pagination button[aria-current="page"]')) throw new Error('Pagination active state styling is missing.');
}

verifyModel();
patchDesktopLite();
patchMobileLite();
patchFullRuntimeSource();
patchIndexStyle();
verifyOutput();
console.log('Registry pagination v2 passed: 1 2 3 4 … last, contextual middle pages, direct navigation, mobile parity and accessible active-page semantics.');
