'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const jsPath = path.join(root, 'registry-v2.js');
const cssPath = path.join(root, 'registry-v2.css');
const htmlPath = path.join(root, 'index.html');
const MARKER = 'registry-table-16-column-layout-v1';
const ACTIONS_MARKER = 'registry-actions-sticky-v1';
const PREMIUM_MARKER = 'registry-table-premium-v2';
const SUBSTANCE_MARKER = 'registry-substance-full-v1';

let js = fs.readFileSync(jsPath, 'utf8').replace(/\r\n?/g, '\n');
let css = fs.readFileSync(cssPath, 'utf8').replace(/\r\n?/g, '\n');
let html = fs.readFileSync(htmlPath, 'utf8').replace(/\r\n?/g, '\n');
let jsChanged = false;

if (!js.includes(MARKER)) {
  const oldWidths = `    const widths = {
      registry:68, name:225, substance:190, strength:105, form:145, prescription:260,
      drugClass:180, use:220, population:150, atc:90,
      adultDose:190, pediatricDose:190, status:105, price:92,
    };`;
  const newWidths = `    const REGISTRY_TABLE_LAYOUT = '${MARKER}';
    const widths = {
      registry:68, name:235, substance:260, strength:112, form:165, prescription:300,
      drugClass:205, use:215, population:145, atc:94,
      adultDose:200, pediatricDose:200, status:110, price:96,
    };`;
  if (!js.includes(oldWidths)) throw new Error('Registry table width map anchor missing.');
  js = js.replace(oldWidths, newWidths);

  const oldChromeWidth = '    }, 44 + 48);';
  if (!js.includes(oldChromeWidth)) throw new Error('Registry table chrome width anchor missing.');
  js = js.replace(oldChromeWidth, '    }, 44 + 88);');
  jsChanged = true;
}

const plainSubstanceCell = '<td data-col="substance"><span class="cell-clamp">';
const premiumSubstanceCell = '<td data-col="substance"><span class="cell-clamp registry-substance-text" title="${escapeHtml(row.activeSubstance || \'\')}">';
if (!js.includes('registry-substance-text') && js.includes(plainSubstanceCell)) {
  js = js.replace(plainSubstanceCell, premiumSubstanceCell);
  jsChanged = true;
}

if (jsChanged) fs.writeFileSync(jsPath, js, 'utf8');

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
}

if (!css.includes(PREMIUM_MARKER)) {
  css += `

/* ${PREMIUM_MARKER} — premium clinical table polish.
   ${SUBSTANCE_MARKER}: active substances are never truncated on desktop. */
@media(min-width:761px){
  .table-scroll{
    background:#fff;overscroll-behavior:contain;scrollbar-gutter:stable;
    border-bottom-left-radius:12px;border-bottom-right-radius:12px
  }
  .registry-table{border-spacing:0;background:#fff}
  .registry-table th{
    height:48px;padding:12px 14px;background:#f8fafc;color:#52657a;
    border-bottom:1px solid #dfe6ee;font-size:11.5px;font-weight:500;
    letter-spacing:.005em;vertical-align:middle
  }
  .registry-table td{
    height:auto;padding:15px 14px;border-bottom:1px solid #e9eef4;
    color:#263b52;font-size:12.5px;line-height:1.46;vertical-align:top
  }
  .registry-table tbody tr{transition:background-color .14s ease,box-shadow .14s ease}
  .registry-table tbody tr:hover td{background:#f9fbfd}
  .registry-table tbody tr:focus-visible td{box-shadow:inset 0 1px 0 rgba(99,91,255,.22),inset 0 -1px 0 rgba(99,91,255,.22)}

  .registry-table th[data-col="registry"],.registry-table td[data-col="registry"]{width:68px}
  .registry-table th[data-col="name"],.registry-table td[data-col="name"]{width:235px}
  .registry-table th[data-col="substance"],.registry-table td[data-col="substance"]{width:260px}
  .registry-table th[data-col="strength"],.registry-table td[data-col="strength"]{width:112px}
  .registry-table th[data-col="form"],.registry-table td[data-col="form"]{width:165px}
  .registry-table th[data-col="prescription"],.registry-table td[data-col="prescription"]{width:300px}
  .registry-table th[data-col="drugClass"],.registry-table td[data-col="drugClass"]{width:205px}
  .registry-table th[data-col="use"],.registry-table td[data-col="use"]{width:215px}
  .registry-table th[data-col="population"],.registry-table td[data-col="population"]{width:145px}
  .registry-table th[data-col="atc"],.registry-table td[data-col="atc"]{width:94px}
  .registry-table th[data-col="adultDose"],.registry-table td[data-col="adultDose"]{width:200px}
  .registry-table th[data-col="pediatricDose"],.registry-table td[data-col="pediatricDose"]{width:200px}
  .registry-table th[data-col="status"],.registry-table td[data-col="status"]{width:110px}
  .registry-table th[data-col="price"],.registry-table td[data-col="price"]{width:96px}

  .registry-table td:nth-child(1),
  .registry-table td[data-col="registry"],
  .registry-table td[data-col="strength"],
  .registry-table td[data-col="form"],
  .registry-table td[data-col="population"],
  .registry-table td[data-col="atc"],
  .registry-table td[data-col="status"],
  .registry-table td[data-col="price"],
  .registry-table td.registry-actions-cell{vertical-align:middle}

  .drug-name{
    color:#102a43;font-size:13.5px;font-weight:600;line-height:1.35;
    letter-spacing:-.01em
  }
  .drug-meta{margin-top:4px;color:#8493a5;font-size:10.5px;line-height:1.3}

  .registry-table td[data-col="substance"]{overflow:visible;padding-right:20px}
  .registry-table td[data-col="substance"] .cell-clamp,
  .registry-table td[data-col="substance"] .registry-substance-text{
    display:block;max-height:none;overflow:visible;-webkit-line-clamp:unset;
    line-clamp:unset;white-space:normal;overflow-wrap:anywhere;word-break:normal;
    color:#1f3a56;font-weight:400;line-height:1.5
  }
  .registry-table td[data-col="strength"]{color:#1f3a56;font-weight:500;font-variant-numeric:tabular-nums}
  .registry-table td[data-col="form"]{color:#40566d}

  .registry-table td[data-col="prescription"]{
    padding-left:16px;padding-right:22px;background-image:linear-gradient(90deg,rgba(99,91,255,.035),transparent 36px)
  }
  .registry-prescription-text{
    color:#263f5b;font-size:12.35px;line-height:1.5;overflow-wrap:anywhere
  }
  .registry-table td[data-col="drugClass"] .cell-clamp,
  .registry-table td[data-col="use"] .cell-clamp{
    -webkit-line-clamp:3;line-height:1.46;color:#40566d
  }

  .atc-chip{
    min-height:24px;padding:3px 7px;border-color:#d9e2ec;background:#f7f9fc;
    color:#41566c;border-radius:7px
  }
  .registry-table th.actions-col{
    width:88px;min-width:88px;max-width:88px;background:#f8fafc;
    box-shadow:-1px 0 0 #dde5ed,-14px 0 24px -22px rgba(10,37,64,.65)
  }
  .registry-table td.registry-actions-cell{
    width:88px;min-width:88px;max-width:88px;background:#fff;
    box-shadow:-1px 0 0 #e3e9ef,-14px 0 24px -22px rgba(10,37,64,.55)
  }
  .registry-table tbody tr:hover td.registry-actions-cell{background:#f9fbfd}
  .registry-more-trigger,.row-action{
    width:32px;height:32px;border-radius:9px;border-color:#dfe5ec;background:#fff;
    color:#62748a
  }
  .registry-more-trigger:hover,.registry-more[open]>.registry-more-trigger,.row-action:hover{
    background:#f3f2ff;border-color:#cbc7ff;color:#4338ca
  }

  .registry-table th:nth-child(3),.registry-table td:nth-child(3){
    box-shadow:1px 0 0 #e3e9ef,12px 0 20px -22px rgba(10,37,64,.75)
  }
  .registry-table tbody tr.is-selected td{background:#f7f6ff}
  .registry-table tbody tr.is-pediatric-only td{background:#fff6fa}
  .registry-table tbody tr.is-pediatric-only:hover td{background:#ffedf5}
  .registry-table tbody tr.is-pediatric-only td.registry-actions-cell{background:#fff6fa}
  .registry-table tbody tr.is-pediatric-only:hover td.registry-actions-cell{background:#ffedf5}
}

@media(max-width:1100px) and (min-width:761px){
  .registry-table th[data-col="name"],.registry-table td[data-col="name"]{width:220px}
  .registry-table th[data-col="substance"],.registry-table td[data-col="substance"]{width:240px}
  .registry-table th[data-col="prescription"],.registry-table td[data-col="prescription"]{width:280px}
}
`;
}

fs.writeFileSync(cssPath, css, 'utf8');

const nextHtml = html.replaceAll('registry-polish-20260917-v1', 'registry-premium-20260917-v2');
if (nextHtml !== html) fs.writeFileSync(htmlPath, nextHtml, 'utf8');

console.log('Premium Registry V2 table applied: full active substances, refined spacing, semantic widths and sticky actions.');
