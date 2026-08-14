'use strict';

const fs = require('node:fs');
const path = require('node:path');

const navFile = path.resolve(__dirname, '..', 'registry-mobile-phase3.js');
let navSource = fs.readFileSync(navFile, 'utf8').replace(/\r\n?/g, '\n');

const before = `    nav.style.visibility = blocked ? 'hidden' : 'visible';\n    nav.style.opacity = blocked ? '0' : '1';\n    nav.style.pointerEvents = blocked ? 'none' : '';`;
const after = `    nav.style.setProperty('visibility', blocked ? 'hidden' : 'visible', 'important');\n    nav.style.setProperty('opacity', blocked ? '0' : '1', 'important');\n    nav.style.setProperty('pointer-events', blocked ? 'none' : 'auto', 'important');\n    nav.style.setProperty('transform', blocked ? 'translateY(calc(100% + 24px))' : 'translateY(0)', 'important');`;

if (!navSource.includes(after)) {
  if (!navSource.includes(before)) throw new Error('Bottom nav style synchronization block changed.');
  navSource = navSource.replace(before, after);
}

fs.writeFileSync(navFile, navSource, 'utf8');

const designCssFile = path.resolve(__dirname, '..', 'registry-mobile-design-audit.css');
let designCss = fs.readFileSync(designCssFile, 'utf8').replace(/\r\n?/g, '\n');
const oldDesignCard = `  html[data-registry-mobile-lite] .mobile-lite-card{\n    min-height:96px;\n    gap:10px;\n    padding:13px 12px 13px 15px;`;
const compactDesignCard = `  html[data-registry-mobile-lite] .mobile-lite-card{\n    min-height:96px;\n    gap:10px;\n    padding:4px 12px 4px 15px;`;

if (!designCss.includes(compactDesignCard)) {
  if (!designCss.includes(oldDesignCard)) throw new Error('Mobile design-audit card spacing block changed.');
  designCss = designCss.replace(oldDesignCard, compactDesignCard);
}

const oldSub390Card = `@media (max-width:389px){\n  html.medindex-tailadmin[data-registry-mobile-lite] .mi-heading-badge{\n    display:none!important;\n  }\n  html.medindex-tailadmin[data-registry-mobile-lite] .mi-page-heading{\n    min-height:28px!important;\n  }\n  html[data-registry-mobile-lite] .mobile-lite-card{\n    grid-template-columns:minmax(0,1fr) auto;\n    padding:12px 10px 12px 13px;\n  }`;
const priorSub390Card = `@media (max-width:389px){\n  html.medindex-tailadmin[data-registry-mobile-lite] .mi-heading-badge{\n    display:none!important;\n  }\n  html.medindex-tailadmin[data-registry-mobile-lite] .mi-page-heading{\n    min-height:28px!important;\n  }\n  html[data-registry-mobile-lite] .mobile-lite-card{\n    grid-template-columns:minmax(0,1fr) auto;\n    padding:4px 10px 4px 13px;\n  }`;
const compactSub390Card = `@media (max-width:389px){\n  html.medindex-tailadmin[data-registry-mobile-lite] .mi-heading-badge{\n    display:none!important;\n  }\n  html.medindex-tailadmin[data-registry-mobile-lite] .mi-page-heading{\n    min-height:28px!important;\n  }\n  html[data-registry-mobile-lite] .mobile-lite-card{\n    grid-template-columns:minmax(0,1fr) auto;\n    padding:3px 10px 3px 13px;\n  }`;

if (!designCss.includes(compactSub390Card)) {
  if (designCss.includes(oldSub390Card)) designCss = designCss.replace(oldSub390Card, compactSub390Card);
  else if (designCss.includes(priorSub390Card)) designCss = designCss.replace(priorSub390Card, compactSub390Card);
  else throw new Error('Sub-390 mobile design-audit card spacing block changed.');
}
if (!designCss.includes('padding:4px 12px 4px 15px;')) {
  throw new Error('Final mobile design card spacing was not materialized.');
}
if (!designCss.includes('padding:3px 10px 3px 13px;')) {
  throw new Error('Final sub-390 mobile card spacing was not materialized.');
}
fs.writeFileSync(designCssFile, designCss, 'utf8');

const phoneCssFile = path.resolve(__dirname, '..', 'registry-mobile-phone-hardening.css');
let phoneCss = fs.readFileSync(phoneCssFile, 'utf8').replace(/\r\n?/g, '\n');
const oldNarrowCard = `@media (max-width:359px){\n  html[data-registry-mobile-lite] .mobile-lite-card{\n    gap:7px;\n    min-height:92px;\n    padding:11px 9px 11px 12px;\n  }`;
const compactNarrowCard = `@media (max-width:359px){\n  html[data-registry-mobile-lite] .mobile-lite-card{\n    gap:7px;\n    min-height:92px;\n    padding:4px 9px 4px 12px;\n  }`;

if (!phoneCss.includes(compactNarrowCard)) {
  if (!phoneCss.includes(oldNarrowCard)) throw new Error('Narrow-phone card hardening block changed.');
  phoneCss = phoneCss.replace(oldNarrowCard, compactNarrowCard);
}
if (!phoneCss.includes('padding:4px 9px 4px 12px;')) {
  throw new Error('Final narrow-phone vertical card spacing was not materialized.');
}
fs.writeFileSync(phoneCssFile, phoneCss, 'utf8');

console.log('Late mobile styles now preserve blocked-nav priority and keep <=389px cards inside the audited geometry budget without shrinking 44px actions.');