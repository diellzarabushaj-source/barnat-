'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const file = path.join(ROOT, 'registry-mobile-phase8.css');
let css = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');

const oldBlock = `  html[data-registry-mobile-lite] #tbody .mobile-lite-card{\n    position:relative;\n    display:block!important;\n    width:100%!important;\n    min-width:0!important;\n    max-width:none!important;\n    box-sizing:border-box!important;\n  }\n\n  /* Favorite and detail action get separate 44px touch slots. The content\n     reserves the rail width, so neither control can overlap text or the other\n     action even on narrow iPhones. */\n  #tbody .mobile-lite-card:has(.mi-mobile-favorite-toggle){\n    min-height:108px;\n  }\n  #tbody .mobile-lite-card:has(.mi-mobile-favorite-toggle) .mobile-lite-open{`;

const newBlock = `  html[data-registry-mobile-lite] #tbody .mobile-lite-card{\n    position:relative;\n    display:block!important;\n    width:100%!important;\n    min-width:0!important;\n    max-width:none!important;\n    min-height:108px!important;\n    box-sizing:border-box!important;\n  }\n\n  /* Reserve both 44px action slots before personalization appends the star.\n     The stable 108px card prevents a late list-height jump and keeps Safari's\n     end-of-list scroll range deterministic. */\n  html[data-registry-mobile-lite] #tbody .mobile-lite-open{`;

if (!css.includes(newBlock)) {
  if (!css.includes(oldBlock)) throw new Error('Phase 2 stable-card patch could not find the Phase 8 action-rail block.');
  css = css.replace(oldBlock, newBlock);
}

css = css.replace(
  '#tbody .mobile-lite-card:has(.mi-mobile-favorite-toggle) .mobile-lite-more{',
  'html[data-registry-mobile-lite] #tbody .mobile-lite-more{',
);

if (!css.includes('min-height:108px!important')) throw new Error('Phase 2 stable card reserve is missing.');
if (css.includes('.mobile-lite-card:has(.mi-mobile-favorite-toggle){\n    min-height:108px')) {
  throw new Error('Phase 2 favorite-dependent card-height jump is still present.');
}

fs.writeFileSync(file, css, 'utf8');
console.log('Phase 2 mobile card reserves its action rail before personalization; Safari list height stays stable.');