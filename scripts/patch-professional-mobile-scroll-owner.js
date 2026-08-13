'use strict';

const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(__dirname, '..', 'tailadmin-professional.js');
let source = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');

const before = `  function normalizeContentScroll({ force = false } = {}) {\n    const main = document.querySelector('.mi-main');\n    if (!main) return;\n    if (main.style.scrollBehavior !== 'auto') main.style.scrollBehavior = 'auto';\n    if (!force && navigationType() === 'back_forward') return;\n    if (main.scrollTop) main.scrollTop = 0;\n    requestAnimationFrame(() => {\n      if (main.scrollTop) main.scrollTop = 0;\n    });\n  }`;

const after = `  function normalizeContentScroll({ force = false } = {}) {\n    const main = document.querySelector('.mi-main');\n    if (!main) return;\n    if (main.style.scrollBehavior !== 'auto') main.style.scrollBehavior = 'auto';\n    const phoneRegistryOwnsScroll = window.matchMedia?.('(max-width: 767px)')?.matches === true\n      && document.documentElement.dataset.registryMobileLiteReady === '1'\n      && document.documentElement.dataset.registryMobileLiteState !== 'handoff';\n    if (phoneRegistryOwnsScroll) return;\n    if (!force && navigationType() === 'back_forward') return;\n    if (main.scrollTop) main.scrollTop = 0;\n    requestAnimationFrame(() => {\n      if (main.scrollTop) main.scrollTop = 0;\n    });\n  }`;

if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('Professional content-scroll normalization block changed.');
  source = source.replace(before, after);
}

if (!source.includes("document.documentElement.dataset.registryMobileLiteReady === '1'")) {
  throw new Error('Phone registry scroll ownership guard was not materialized.');
}

fs.writeFileSync(file, source, 'utf8');
console.log('Professional UI preserves active mobile-lite vertical scroll.');
