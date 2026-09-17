'use strict';

const fs = require('node:fs');
const path = require('node:path');

require('./harden-profile-photo-url.js');

const root = path.resolve(__dirname, '..');
const landingPath = path.join(root, 'landing.html');
const aboutPath = path.join(root, 'rreth-nesh.html');
const contactPath = path.join(root, 'kontakt.html');
const CONTACT_MARKER = 'drx-contact-v2';

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
}

function writeIfChanged(file, before, after) {
  if (after !== before) fs.writeFileSync(file, after, 'utf8');
}

function loginReturn(pathname) {
  return `login.html?return=${encodeURIComponent(`/${pathname}`)}`;
}

let landing = read(landingPath);
const landingBefore = landing;
landing = landing.replaceAll('1.604', '4.017');
landing = landing.replace(
  '<div class="lp-stat__value lp-num">1.449</div>\n          <div class="lp-stat__label">të klasifikuara sipas popullatës</div>\n          <div class="lp-stat__note">të rritur, fëmijë, ose të dyja</div>',
  '<div class="lp-stat__value lp-num">14</div>\n          <div class="lp-stat__label">grupe kryesore ATC</div>\n          <div class="lp-stat__note">niveli i parë i klasifikimit anatomik-terapeutik-kimik</div>'
);
landing = landing.replace(
  '<div class="lp-stat__value lp-num">841</div>\n          <div class="lp-stat__label">me dozë për të rritur dhe për fëmijë</div>\n          <div class="lp-stat__note">553 vetëm për të rritur · 55 vetëm pediatrike</div>',
  '<div class="lp-stat__value lp-num">16</div>\n          <div class="lp-stat__label">kolona klinike në Registry</div>\n          <div class="lp-stat__note">identitet, substancë, dozë, recetë, status dhe më shumë</div>'
);
landing = landing.replace('gjendja e 12 gushtit 2026', 'gjendja e 17 shtatorit 2026');
landing = landing.replace(
  'Numrat lexohen nga të dhënat e vetë projektit: fotografia e popullatës së miratuar dhe\n        regjistri i protokolleve. Kur burimi përditësohet, përditësohen edhe këtu.',
  'Vlerat më sipër i përkasin versionit aktual të publikuar të DRx. Regjistri aktiv dhe\n        struktura e ndërfaqes verifikohen në çdo build para publikimit.'
);

for (const pathname of [
  'klasifikimi.html',
  'icd.html',
  'analizat.html',
  'dozologjia.html',
  'protokollet.html',
  'recetat.html',
  'urgjencat.html',
  'sistemi.html',
]) {
  landing = landing.replaceAll(`href="${pathname}"`, `href="${loginReturn(pathname)}"`);
}

if (!landing.includes('4.017 barna')) throw new Error('Landing registry count polish failed.');
if (!landing.includes('14</div>\n          <div class="lp-stat__label">grupe kryesore ATC')) throw new Error('Landing ATC statistic polish failed.');
if (!landing.includes('16</div>\n          <div class="lp-stat__label">kolona klinike në Registry')) throw new Error('Landing Registry column statistic polish failed.');
if (landing.includes('href="dozologjia.html"') || landing.includes('href="icd.html"')) {
  throw new Error('Landing still contains protected workspace links that bounce back to itself.');
}
if (!landing.includes(`href="${loginReturn('dozologjia.html')}"`)) {
  throw new Error('Landing protected return-target routing was not materialized.');
}
writeIfChanged(landingPath, landingBefore, landing);

let about = read(aboutPath);
const aboutBefore = about;
about = about.replaceAll('4.013', '4.017');
if (!about.includes('<dd>4.017</dd>')) throw new Error('About-page registry count polish failed.');
writeIfChanged(aboutPath, aboutBefore, about);

let contact = read(contactPath);
const contactBefore = contact;
const inlineContactScript = /\n\s*<script>\s*\(\(\) => \{[\s\S]*?medindexContactForm[\s\S]*?<\/script>\s*\n/;
if (!contact.includes(CONTACT_MARKER)) {
  if (!inlineContactScript.test(contact)) throw new Error('Contact inline-script anchor missing.');
  contact = contact.replace(inlineContactScript, `\n  <script src="contact.js?v=${CONTACT_MARKER}" defer></script>\n`);
}
if (!contact.includes(`contact.js?v=${CONTACT_MARKER}`)) throw new Error('Contact external script was not wired.');
if (/<script>\s*[\s\S]*?medindexContactForm/.test(contact)) throw new Error('Contact form still relies on an inline CSP-blocked script.');
writeIfChanged(contactPath, contactBefore, contact);

console.log('Public DRx polish applied: current Registry counts, honest stats, return-safe CTAs and CSP-safe contact form.');
