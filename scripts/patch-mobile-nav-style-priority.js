'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const navFile = path.join(ROOT, 'registry-mobile-phase3.js');
const cssFile = path.join(ROOT, 'registry-table-tools.css');

let navSource = fs.readFileSync(navFile, 'utf8').replace(/\r\n?/g, '\n');
const before = `    nav.style.visibility = blocked ? 'hidden' : 'visible';
    nav.style.opacity = blocked ? '0' : '1';
    nav.style.pointerEvents = blocked ? 'none' : '';`;
const priorAfter = `    nav.style.setProperty('visibility', blocked ? 'hidden' : 'visible', 'important');
    nav.style.setProperty('opacity', blocked ? '0' : '1', 'important');
    nav.style.setProperty('pointer-events', blocked ? 'none' : 'auto', 'important');
    nav.style.setProperty('transform', blocked ? 'translateY(calc(100% + 24px))' : 'translateY(0)', 'important');`;
const after = `    if (blocked) {
      nav.style.setProperty('visibility', 'hidden', 'important');
      nav.style.setProperty('opacity', '0', 'important');
      nav.style.setProperty('pointer-events', 'none', 'important');
      nav.style.setProperty('transform', 'translateY(calc(100% + 24px))', 'important');
    } else {
      nav.style.removeProperty('visibility');
      nav.style.removeProperty('opacity');
      nav.style.removeProperty('pointer-events');
      nav.style.removeProperty('transform');
    }`;
if (!navSource.includes(after)) {
  if (navSource.includes(priorAfter)) navSource = navSource.replace(priorAfter, after);
  else if (navSource.includes(before)) navSource = navSource.replace(before, after);
  else throw new Error('Bottom nav style synchronization block changed.');
}
fs.writeFileSync(navFile, navSource, 'utf8');

let css = fs.readFileSync(cssFile, 'utf8').replace(/\r\n?/g, '\n');
const blockedBefore = `  .mi-registry-bottom-nav[data-mi-registry-nav-blocked="true"],
  body.mi-sidebar-open .mi-registry-bottom-nav,
  body.mi-mobile-search-open .mi-registry-bottom-nav,
  body.mi-registry-filter-open .mi-registry-bottom-nav,
  body.mobile-lite-detail-open .mi-registry-bottom-nav,
  html[data-mi-keyboard-open="true"] .mi-registry-bottom-nav{
    opacity:0!important;
    visibility:hidden!important;
    pointer-events:none!important;
    transform:translateY(calc(100% + 24px))!important;
  }`;
const blockedAfter = blockedBefore.replace('    opacity:0!important;', '    transition:none!important;\n    opacity:0!important;');
if (!css.includes(blockedAfter)) {
  if (!css.includes(blockedBefore)) throw new Error('Blocked bottom-nav CSS state block changed in final registry CSS.');
  css = css.replace(blockedBefore, blockedAfter);
}
if (!css.includes('/* MedIndex revised Phase 2: compact narrow-phone card spacing */')) throw new Error('Final narrow-phone card spacing contract is missing.');
if (!css.includes('.mobile-lite-card:has(.mobile-lite-actions){')) throw new Error('Final mobile card action-region contract is missing.');
if (!css.includes('--mi-registry-bottom-nav-clearance:calc(80px + env(safe-area-inset-bottom))')) throw new Error('Final bottom-nav clearance contract is missing.');
fs.writeFileSync(cssFile, css, 'utf8');

console.log('Mobile nav priority and audited card geometry are maintained inside the single registry CSS authority.');
