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

const phase8CssFile = path.resolve(__dirname, '..', 'registry-mobile-phase8.css');
let phase8Css = fs.readFileSync(phase8CssFile, 'utf8').replace(/\r\n?/g, '\n');
const oldPhoneCardPadding = 'padding:10px 10px 10px 13px!important;';
const compactPhoneCardPadding = 'padding:4px 10px 4px 13px!important;';
if (!phase8Css.includes(compactPhoneCardPadding)) {
  if (!phase8Css.includes(oldPhoneCardPadding)) throw new Error('Phase 8 explicit mobile card padding block changed.');
  phase8Css = phase8Css.replace(oldPhoneCardPadding, compactPhoneCardPadding);
}
if (!phase8Css.includes(compactPhoneCardPadding)) {
  throw new Error('Final phone card vertical spacing was not materialized.');
}
fs.writeFileSync(phase8CssFile, phase8Css, 'utf8');

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

console.log('Late mobile styles now preserve blocked-nav priority and compact phone card spacing without shrinking 44px actions.');