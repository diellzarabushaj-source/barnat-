'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const jsPath = path.join(root, 'registry-v2.js');
const cssPath = path.join(root, 'registry-v2.css');
const MARKER = 'registry-table-16-column-layout-v1';
const ACTIONS_MARKER = 'registry-actions-sticky-v1';

let js = fs.readFileSync(jsPath, 'utf8').replace(/\r\n?/g, '\n');
let css = fs.readFileSync(cssPath, 'utf8').replace(/\r\n?/g, '\n');

if (!js.includes(MARKER)) {
  const oldWidths = `    const widths = {
      registry:68, name:225, substance:190, strength:105, form:145, prescription:260,
      drugClass:180, use:220, population:150, atc:90,
      adultDose:190, pediatricDose:190, status:105, price:92,
    };`;
  const newWidths = `    const REGISTRY_TABLE_LAYOUT = '${MARKER}';
    const widths = {
      registry:68, name:225, substance:210, strength:105, form:155, prescription:300,
      drugClass:210, use:210, population:145, atc:90,
      adultDose:190, pediatricDose:190, status:105, price:92,
    };`;
  if (!js.includes(oldWidths)) throw new Error('Registry table width map anchor missing.');
  js = js.replace(oldWidths, newWidths);

  const oldChromeWidth = '    }, 44 + 48);';
  if (!js.includes(oldChromeWidth)) throw new Error('Registry table chrome width anchor missing.');
  js = js.replace(oldChromeWidth, '    }, 44 + 88);');

  fs.writeFileSync(jsPath, js, 'utf8');
}

if (!css.includes(MARKER)) {
  css += `

/* ${MARKER}
   The prescription column made Registry V2 a 16-column table. Keep widths tied
   to semantic data-col ids so a new column cannot shift every column after it.
   ${ACTIONS_MARKER}: row actions stay visible at the right edge while the
   clinical columns scroll horizontally. */
@media(min-width:761px){
  .registry-table td{overflow:hidden}
  .registry-table th[data-col="registry"],.registry-table td[data-col="registry"]{width:68px}
  .registry-table th[data-col="name"],.registry-table td[data-col="name"]{width:225px}
  .registry-table th[data-col="substance"],.registry-table td[data-col="substance"]{width:210px}
  .registry-table th[data-col="strength"],.registry-table td[data-col="strength"]{width:105px}
  .registry-table th[data-col="form"],.registry-table td[data-col="form"]{width:155px}
  .registry-table th[data-col="prescription"],.registry-table td[data-col="prescription"]{width:300px}
  .registry-table th[data-col="drugClass"],.registry-table td[data-col="drugClass"]{width:210px}
  .registry-table th[data-col="use"],.registry-table td[data-col="use"]{width:210px}
  .registry-table th[data-col="population"],.registry-table td[data-col="population"]{width:145px}
  .registry-table th[data-col="atc"],.registry-table td[data-col="atc"]{width:90px}
  .registry-table th[data-col="adultDose"],.registry-table td[data-col="adultDose"]{width:190px}
  .registry-table th[data-col="pediatricDose"],.registry-table td[data-col="pediatricDose"]{width:190px}
  .registry-table th[data-col="status"],.registry-table td[data-col="status"]{width:105px;text-align:left}
  .registry-table th[data-col="price"],.registry-table td[data-col="price"]{width:92px;text-align:right}

  .registry-table th.actions-col{
    position:sticky;right:0;z-index:13;width:88px;min-width:88px;max-width:88px;
    padding-left:8px;padding-right:8px;background:#f7f9fb;text-align:center;
    box-shadow:-1px 0 0 #e8edf2,-10px 0 18px -18px rgba(10,37,64,.55)
  }
  .registry-table td.registry-actions-cell{
    position:sticky;right:0;z-index:9;width:88px;min-width:88px;max-width:88px;
    overflow:visible;padding-left:8px;padding-right:8px;background:#fff;text-align:center;
    box-shadow:-1px 0 0 #edf0f3,-10px 0 18px -18px rgba(10,37,64,.45)
  }
  .registry-table td.registry-actions-cell .registry-row-actions{min-width:0;justify-content:center}
  .registry-table tbody tr:hover td.registry-actions-cell{background:#fbfcff}
  .registry-table tbody tr.is-selected td.registry-actions-cell{background:#f7f6ff}
  .registry-table tbody tr.is-pediatric-only td.registry-actions-cell{background:#fff3f8}
  .registry-table tbody tr.is-pediatric-only:hover td.registry-actions-cell{background:#ffeaf3}
  .registry-table tbody tr.is-pediatric-only.is-selected td.registry-actions-cell{background:#fce8f3}
  .registry-table td.registry-actions-cell:has(.registry-more[open]){z-index:30}

  .registry-table td[data-col="prescription"]{padding-right:20px;white-space:normal}
  .registry-table td[data-col="drugClass"]{padding-left:18px}
  .registry-prescription-text{display:block;max-width:100%;overflow:hidden;overflow-wrap:break-word;word-break:normal;white-space:normal;line-height:1.42}
  .registry-table td[data-col="substance"] .cell-clamp,
  .registry-table td[data-col="drugClass"] .cell-clamp,
  .registry-table td[data-col="use"] .cell-clamp{-webkit-line-clamp:3}
}
`;
  fs.writeFileSync(cssPath, css, 'utf8');
}

console.log('Stabilized Registry V2 16-column widths, prescription wrapping and sticky row actions.');
