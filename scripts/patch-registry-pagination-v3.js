'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function paginationItems(current, total, compact = false) {
  const safeTotal = Math.max(1, Math.floor(Number(total) || 1));
  const safeCurrent = Math.min(safeTotal, Math.max(1, Math.floor(Number(current) || 1)));
  if (compact) {
    if (safeTotal <= 5) return Array.from({ length:safeTotal }, (_, index) => index + 1);
    if (safeCurrent <= 3) return [1, 2, 3, 4, 'ellipsis-end', safeTotal];
    if (safeCurrent >= safeTotal - 2) return [1, 'ellipsis-start', safeTotal - 3, safeTotal - 2, safeTotal - 1, safeTotal];
    return [1, 'ellipsis-start', safeCurrent, 'ellipsis-end', safeTotal];
  }
  if (safeTotal <= 7) return Array.from({ length:safeTotal }, (_, index) => index + 1);
  if (safeCurrent <= 4) return [1, 2, 3, 4, 'ellipsis-end', safeTotal];
  if (safeCurrent >= safeTotal - 3) return [1, 'ellipsis-start', safeTotal - 3, safeTotal - 2, safeTotal - 1, safeTotal];
  return [1, 'ellipsis-start', safeCurrent - 1, safeCurrent, safeCurrent + 1, 'ellipsis-end', safeTotal];
}

function helperSource(indent = '') {
  return paginationItems.toString().replace('paginationItems', 'registryPaginationItems')
    .split('\n').map(line => indent + line).join('\n');
}

function replaceBlock(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Registry pagination v3 could not find ${label}.`);
  return source.replace(pattern, replacement);
}

function liteRenderSource(kind) {
  const isDesktop = kind === 'desktop';
  const dataPage = isDesktop ? 'desktopLitePage' : 'mobileLitePage';
  const dataNumber = isDesktop ? 'desktopLitePageNumber' : 'mobileLitePageNumber';
  const loadingGuard = 'state.loading || state.disabled || page === state.page';
  return `${helperSource('  ')}\n\n  function renderPagination() {\n    const pagination = document.getElementById('pagination');\n    if (!pagination) return;\n    const totalPages = Number.isFinite(state.totalPages) ? Math.max(1, Number(state.totalPages)) : null;\n    const current = totalPages ? Math.min(totalPages, Math.max(1, state.page)) : Math.max(1, state.page);\n    const pageSize = Math.max(1, Number(state.pageSize) || 50);\n    const totalItems = Number.isFinite(state.total) ? Math.max(0, Number(state.total)) : null;\n    const compact = window.matchMedia?.('(max-width: 560px)').matches === true;\n\n    pagination.innerHTML = '';\n    pagination.classList.add('registry-pagination-v2', 'registry-pagination-v3');\n    pagination.setAttribute('role', 'navigation');\n    pagination.setAttribute('aria-label', totalPages\n      ? \`Navigimi i faqeve, faqja \${current} nga \${totalPages}\`\n      : \`Navigimi i faqeve, faqja \${current}\`);\n\n    const frame = document.createElement('div');\n    frame.className = 'registry-pagination-frame';\n\n    const summary = document.createElement('div');\n    summary.className = 'registry-pagination-summary';\n    if (totalItems !== null) {\n      const start = totalItems ? Math.min(totalItems, ((current - 1) * pageSize) + 1) : 0;\n      const end = totalItems ? Math.min(totalItems, current * pageSize) : 0;\n      summary.innerHTML = '<span class="registry-pagination-summary-label">Rezultatet</span>'\n        + \`<strong>\${start}–\${end}</strong><span>nga \${totalItems}</span>\`;\n      summary.setAttribute('aria-label', \`Rezultatet \${start} deri \${end} nga \${totalItems}\`);\n    } else {\n      summary.innerHTML = '<span class="registry-pagination-summary-label">Faqja</span>' + \`<strong>\${current}</strong>\`;\n    }\n\n    const controls = document.createElement('div');\n    controls.className = 'registry-pagination-controls';\n    const pages = document.createElement('div');\n    pages.className = 'registry-pagination-pages';\n    pages.setAttribute('role', 'group');\n    pages.setAttribute('aria-label', 'Zgjidh faqen');\n\n    const addButton = ({ label, page, disabled = false, active = false, kind = 'page', direction = '' }) => {\n      const button = document.createElement('button');\n      button.type = 'button';\n      button.className = kind === 'nav' ? 'registry-pagination-nav' : 'registry-pagination-page';\n      button.disabled = Boolean(disabled);\n      if (kind === 'nav') {\n        button.dataset.${dataPage} = direction;\n        button.dataset.direction = direction;\n        const icon = direction === 'prev' ? '←' : '→';\n        button.innerHTML = \`<span class="registry-pagination-nav-icon" aria-hidden="true">\${icon}</span><span class="registry-pagination-nav-label">\${label}</span>\`;\n        button.setAttribute('aria-label', direction === 'prev' ? 'Faqja paraprake' : 'Faqja pasuese');\n      } else {\n        button.dataset.${dataNumber} = String(page);\n        button.textContent = label;\n        if (active) {\n          button.classList.add('active');\n          button.setAttribute('aria-current', 'page');\n          button.setAttribute('aria-label', \`Faqja \${page}, faqja aktuale\`);\n        } else {\n          button.setAttribute('aria-label', \`Shko te faqja \${page}\`);\n        }\n      }\n      button.addEventListener('click', () => {\n        if (button.disabled || ${loadingGuard}) return;\n        state.page = page;\n        void loadPage({ includeTotal:false, scroll:true });\n      });\n      (kind === 'page' ? pages : controls).appendChild(button);\n      return button;\n    };\n\n    addButton({ label:'Para', page:Math.max(1, current - 1), disabled:current <= 1, kind:'nav', direction:'prev' });\n\n    if (totalPages) {\n      registryPaginationItems(current, totalPages, compact).forEach(item => {\n        if (typeof item === 'number') {\n          addButton({ label:String(item), page:item, active:item === current });\n          return;\n        }\n        const dots = document.createElement('span');\n        dots.className = 'registry-pagination-ellipsis';\n        dots.textContent = '…';\n        dots.setAttribute('aria-hidden', 'true');\n        pages.appendChild(dots);\n      });\n    } else {\n      const fallback = document.createElement('span');\n      fallback.className = 'registry-pagination-current-fallback';\n      fallback.textContent = String(current);\n      fallback.setAttribute('aria-label', \`Faqja \${current}\`);\n      pages.appendChild(fallback);\n    }\n\n    controls.appendChild(pages);\n    addButton({\n      label:'Pas',\n      page:current + 1,\n      disabled:totalPages ? current >= totalPages : !state.hasNext,\n      kind:'nav',\n      direction:'next',\n    });\n\n    const size = document.createElement('div');\n    size.className = 'registry-pagination-size';\n    size.textContent = \`\${pageSize} / faqe\`;\n    size.setAttribute('aria-label', \`\${pageSize} rezultate për faqe\`);\n\n    frame.append(summary, controls, size);\n    pagination.appendChild(frame);\n  }`;
}

function patchDesktop() {
  const file = 'registry-desktop-lite.js';
  let source = read(file);
  source = replaceBlock(
    source,
    /  function registryPaginationItems\(current, total\) \{[\s\S]*?\n  \}\n\n  function renderPagination\(\) \{[\s\S]*?\n  \}(?=\n\n  function configureControls\(\))/, 
    liteRenderSource('desktop'),
    'desktop pagination v2 block',
  );
  if (!source.includes("classList.add('registry-pagination-v2', 'registry-pagination-v3')")) throw new Error('Desktop v3 marker missing.');
  if (!source.includes('registry-pagination-summary')) throw new Error('Desktop pagination summary missing.');
  write(file, source);
}

function patchMobile() {
  const file = 'registry-mobile-lite.js';
  let source = read(file);
  source = replaceBlock(
    source,
    /  function registryPaginationItems\(current, total\) \{[\s\S]*?\n  \}\n\n  function renderPagination\(\) \{[\s\S]*?\n  \}(?=\n\n  async function loadPage\()/,
    liteRenderSource('mobile'),
    'mobile pagination v2 block',
  );
  if (!source.includes('mobileLitePageNumber')) throw new Error('Mobile v3 direct page controls missing.');
  if (!source.includes("matchMedia?.('(max-width: 560px)')")) throw new Error('Mobile compact pagination model missing.');
  write(file, source);
}

function fullRenderSource() {
  return `${helperSource('')}\n\nfunction renderPagination(totalPages, totalItems = null){\n  const pag = document.getElementById('pagination');\n  if(!pag) return;\n  pag.innerHTML = '';\n  pag.classList.add('registry-pagination-v2', 'registry-pagination-v3');\n\n  if(state.pageSize >= 4006){\n    const frame = document.createElement('div');\n    frame.className = 'registry-pagination-frame registry-pagination-frame-all';\n    frame.innerHTML = '<div class="registry-pagination-summary"><span class="registry-pagination-summary-label">Regjistri</span><strong>Të gjitha rreshtat</strong></div>';\n    pag.appendChild(frame);\n    return;\n  }\n\n  const safeTotal = Math.max(1, Number(totalPages) || 1);\n  const current = Math.min(safeTotal, Math.max(1, state.page));\n  const pageSize = Math.max(1, Number(state.pageSize) || 50);\n  const safeItems = Number.isFinite(totalItems) ? Math.max(0, Number(totalItems)) : null;\n  const compact = window.matchMedia?.('(max-width: 560px)').matches === true;\n  pag.setAttribute('role', 'navigation');\n  pag.setAttribute('aria-label', \`Navigimi i faqeve, faqja \${current} nga \${safeTotal}\`);\n\n  const frame = document.createElement('div');\n  frame.className = 'registry-pagination-frame';\n  const summary = document.createElement('div');\n  summary.className = 'registry-pagination-summary';\n  if(safeItems !== null){\n    const start = safeItems ? Math.min(safeItems, ((current - 1) * pageSize) + 1) : 0;\n    const end = safeItems ? Math.min(safeItems, current * pageSize) : 0;\n    summary.innerHTML = '<span class="registry-pagination-summary-label">Rezultatet</span>' + \`<strong>\${start}–\${end}</strong><span>nga \${safeItems}</span>\`;\n    summary.setAttribute('aria-label', \`Rezultatet \${start} deri \${end} nga \${safeItems}\`);\n  } else {\n    summary.innerHTML = '<span class="registry-pagination-summary-label">Faqja</span>' + \`<strong>\${current}</strong>\`;\n  }\n\n  const controls = document.createElement('div');\n  controls.className = 'registry-pagination-controls';\n  const pages = document.createElement('div');\n  pages.className = 'registry-pagination-pages';\n  pages.setAttribute('role', 'group');\n  pages.setAttribute('aria-label', 'Zgjidh faqen');\n\n  const addButton = ({ label, page, disabled = false, active = false, kind = 'page', direction = '' }) => {\n    const button = document.createElement('button');\n    button.type = 'button';\n    button.className = kind === 'nav' ? 'registry-pagination-nav' : 'registry-pagination-page';\n    button.disabled = Boolean(disabled);\n    if(kind === 'nav'){\n      button.dataset.direction = direction;\n      const icon = direction === 'prev' ? '←' : '→';\n      button.innerHTML = \`<span class="registry-pagination-nav-icon" aria-hidden="true">\${icon}</span><span class="registry-pagination-nav-label">\${label}</span>\`;\n      button.setAttribute('aria-label', direction === 'prev' ? 'Faqja paraprake' : 'Faqja pasuese');\n    } else {\n      button.dataset.registryPageNumber = String(page);\n      button.textContent = label;\n      if(active){\n        button.classList.add('active');\n        button.setAttribute('aria-current', 'page');\n        button.setAttribute('aria-label', \`Faqja \${page}, faqja aktuale\`);\n      } else {\n        button.setAttribute('aria-label', \`Shko te faqja \${page}\`);\n      }\n    }\n    button.addEventListener('click', () => {\n      if(button.disabled || page === state.page) return;\n      state.page = page;\n      render();\n    });\n    (kind === 'page' ? pages : controls).appendChild(button);\n    return button;\n  };\n\n  addButton({ label:'Para', page:Math.max(1, current - 1), disabled:current <= 1, kind:'nav', direction:'prev' });\n  registryPaginationItems(current, safeTotal, compact).forEach(item => {\n    if(typeof item === 'number'){\n      addButton({ label:String(item), page:item, active:item === current });\n      return;\n    }\n    const dots = document.createElement('span');\n    dots.className = 'registry-pagination-ellipsis';\n    dots.textContent = '…';\n    dots.setAttribute('aria-hidden', 'true');\n    pages.appendChild(dots);\n  });\n  controls.appendChild(pages);\n  addButton({ label:'Pas', page:Math.min(safeTotal, current + 1), disabled:current >= safeTotal, kind:'nav', direction:'next' });\n\n  const size = document.createElement('div');\n  size.className = 'registry-pagination-size';\n  size.textContent = \`\${pageSize} / faqe\`;\n  size.setAttribute('aria-label', \`\${pageSize} rezultate për faqe\`);\n  frame.append(summary, controls, size);\n  pag.appendChild(frame);\n}\n`;
}

function patchFullRuntime() {
  const file = 'app-parts/part-04.txt';
  let source = read(file);
  source = replaceBlock(
    source,
    /function registryPaginationItems\(current, total\) \{[\s\S]*?\n\}\n\nfunction renderPagination\(totalPages\)\{[\s\S]*?\n\}(?=\n\nfunction buildColPanel\(\))/, 
    fullRenderSource().trimEnd(),
    'full runtime pagination v2 block',
  );
  source = source.replace('  renderPagination(totalPages);', '  renderPagination(totalPages, total);');
  if (!source.includes('renderPagination(totalPages, total);')) throw new Error('Full runtime pagination does not receive total items.');
  if (!source.includes('registry-pagination-frame')) throw new Error('Full runtime v3 frame missing.');
  write(file, source);
}

function bumpStyleVersion() {
  const index = read('index.html');
  if (!index.includes('registry-table-tools.css?v=')) {
    throw new Error('Single registry stylesheet authority is missing.');
  }
  if (index.includes('registry-pagination-v2.css')) {
    throw new Error('Legacy pagination stylesheet must not be reintroduced.');
  }
}

function verifyModel() {
  assert.deepEqual(paginationItems(1, 81, false), [1, 2, 3, 4, 'ellipsis-end', 81]);
  assert.deepEqual(paginationItems(40, 81, false), [1, 'ellipsis-start', 39, 40, 41, 'ellipsis-end', 81]);
  assert.deepEqual(paginationItems(1, 81, true), [1, 2, 3, 4, 'ellipsis-end', 81]);
  assert.deepEqual(paginationItems(40, 81, true), [1, 'ellipsis-start', 40, 'ellipsis-end', 81]);
  assert.deepEqual(paginationItems(80, 81, true), [1, 'ellipsis-start', 78, 79, 80, 81]);
  assert.deepEqual(paginationItems(3, 5, true), [1, 2, 3, 4, 5]);
}

function verifyOutput() {
  const desktop = read('registry-desktop-lite.js');
  const mobile = read('registry-mobile-lite.js');
  const full = read('app-parts/part-04.txt');
  const index = read('index.html');
  for (const [label, source] of [['desktop', desktop], ['mobile', mobile], ['full', full]]) {
    if (!source.includes('registry-pagination-v3')) throw new Error(`${label} v3 marker missing.`);
    if (!source.includes('registry-pagination-frame')) throw new Error(`${label} footer frame missing.`);
    if (!source.includes('registry-pagination-summary')) throw new Error(`${label} result summary missing.`);
    if (!source.includes('registry-pagination-pages')) throw new Error(`${label} page group missing.`);
    if (!source.includes("setAttribute('aria-current', 'page')")) throw new Error(`${label} current-page accessibility missing.`);
  }
  if (!index.includes('registry-table-tools.css?v=')) throw new Error('Single registry stylesheet authority is missing.');
}

verifyModel();
patchDesktop();
patchMobile();
patchFullRuntime();
bumpStyleVersion();
verifyOutput();
console.log('Registry pagination v3 senior UX passed: structured footer, result range, centered grouped navigation, compact no-scroll mobile model and accessible page semantics.');
