'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const file = path.join(ROOT, 'registry-mobile-phase8.css');
let css = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');

const oldCard = `  html[data-registry-mobile-lite] #tbody .mobile-lite-card{\n    position:relative;\n    display:block!important;\n    width:100%!important;\n    min-width:0!important;\n    max-width:none!important;\n    box-sizing:border-box!important;\n  }`;

const stableCard = `  html[data-registry-mobile-lite] #tbody .mobile-lite-card{\n    position:relative;\n    display:block!important;\n    width:100%!important;\n    min-width:0!important;\n    max-width:none!important;\n    min-height:108px!important;\n    box-sizing:border-box!important;\n  }`;

if (!css.includes(stableCard)) {
  if (!css.includes(oldCard)) throw new Error('Phase 2 stable-card patch could not find the Phase 8 card block.');
  css = css.replace(oldCard, stableCard);
}

if (!css.includes('min-height:108px!important')) throw new Error('Phase 2 stable card reserve is missing.');
if (!css.includes('#tbody .mobile-lite-card:has(.mi-mobile-favorite-toggle) .mobile-lite-open{')) {
  throw new Error('Phase 2 content action-rail contract is missing.');
}
if (!css.includes('#tbody .mobile-lite-card:has(.mi-mobile-favorite-toggle) .mobile-lite-more{')) {
  throw new Error('Phase 2 detail action slot contract is missing.');
}

fs.writeFileSync(file, css, 'utf8');
console.log('Phase 2 mobile card reserves 108px before personalization while preserving independent action-slot contracts.');