'use strict';

/* Fazat 3, 4, 8 dhe 9 — kontrata e klientit të kalkulatorit.
 *
 * Rrjedha e vërtetë provohet në shfletues me
 * `scripts/verify-pediatric-calculator-browser.js`, që kërkon një pemë të
 * ndërtuar dhe Chromium. Ky test mban atë pjesë të kontratës që mund të bjerë
 * në heshtje pa u parë: pronësinë e faqes, mungesën e aritmetikës te klienti,
 * dhe faktin që asnjë numër dozimi nuk niset nga shfletuesi.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const client = read('pediatric-calculator-client.js');
const legacy = read('dozologjia.js');
const html = read('dozologjia.html');
const css = read('pediatric-calculator.css');

/* Pohimet për ndalesa duhet të lexojnë kod, jo prozë. Pa këtë, komenti që
   shpjegon *pse* nuk përdoret `innerHTML` e rrëzonte pikërisht pohimin që
   siguron se nuk përdoret. E njëjta gjë vlen për shumëzimet me peshën: ato
   përmenden te komentet, prandaj hiqen edhe ato para se të kërkohen. */
const code = client
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

// ------------------------------------------------------------- pronësia

/* Dy kontrollues mbi të njëjtin `#dosageList` do të tregonin dy të vërteta për
   të njëjtin bar. Shenja vendoset te klienti dhe lexohet te i vjetri. */
assert.match(client, /document\.documentElement\.dataset\.pediatricCalculator = OWNER_FLAG/);
assert.match(legacy, /dataset\.pediatricCalculator === 'server'\) return;/);

/* Radha e skriptave është pjesë e kontratës, jo detaj: me `defer` ato xhirojnë
   sipas radhës së dokumentit, prandaj shenja duhet vendosur para se
   kontrolluesi i vjetër të niset. */
assert.ok(
  html.indexOf('pediatric-calculator-client.js') < html.indexOf('dozologjia.js'),
  'Klienti duhet të ngarkohet para dozologjia.js, përndryshe pronësinë e merr i vjetri.',
);
assert.ok(
  html.indexOf('dozologjia-deep-audit.js') < html.indexOf('dozologjia.js'),
  'Radha ekzistuese e deduperit nuk guxon të prishet.',
);
assert.ok(
  html.indexOf('pediatric-calculator.css') < html.indexOf('tailadmin-professional.css'),
  'tailadmin-professional.css duhet të mbetet fleta e fundit.',
);

// --------------------------------------------- asnjë llogaritje te klienti

/* Pika e Fazës 5 humbet nëse klienti fillon të llogarisë "vetëm pak". Këto
   modele janë pikërisht ato që do të shfaqeshin po të ndodhte: shumëzim me
   peshën, pjesëtim me përqendrimin, ose një kufi i vënë në shfletues. */
for (const forbidden of [
  /weightKg\s*\*/,
  /\*\s*weightKg/,
  /\/\s*concentration/i,
  /Math\.min\s*\(\s*[^)]*max/i,
  /dose(?:Min|Max)\s*[*/]/,
]) {
  assert.doesNotMatch(code, forbidden,
    `Klienti nuk guxon të llogarisë doza: ${forbidden}`);
}

/* Dhe as t'i dërgojë. Trupi i kërkesës ndërtohet në një vend të vetëm; nëse
   dikush shton një fushë dozimi aty, ky pohim bie. */
const payloadBody = client.slice(
  client.indexOf('function patientPayload()'),
  client.indexOf('function renderProduct()'),
);
for (const key of ['dose', 'concentration', 'maxSingle', 'maxDaily', 'pediatric_']) {
  assert.ok(!payloadBody.includes(key), `Trupi i kërkesës nuk guxon të mbajë "${key}".`);
}
assert.match(payloadBody, /payload\.weightKg = weight/);
assert.match(payloadBody, /payload\.heightCm = height/);

// ------------------------------------------------------------ endpoint-et

assert.match(client, /\/api\/dosage\/search\?q=\$\{encodeURIComponent\(query\)\}/);
assert.match(client, /\/api\/dosage\/product\/\$\{encodeURIComponent\(drugId\)\}/);
assert.match(client, /'\/api\/dosage\/calculate'/);
assert.match(client, /method:'POST'/);

/* Katalogu i vjetër tërhiqte gjithçka në shfletues; klienti i ri nuk guxon ta
   bëjë atë kurrë. */
assert.doesNotMatch(code, /fetch\('\/api\/dosage'[^/]/,
  'Klienti nuk guxon ta tërheqë të gjithë katalogun e dozimit.');

// ------------------------------------------------------- teksti nga baza

/* Emrat e barnave dhe arsyet klinike vijnë nga baza. Nëse ndonjëherë futet
   `innerHTML` me to, kjo faqe bëhet vektor XSS-i brenda një aplikacioni
   klinik. Ndërtimi bëhet me elemente. */
assert.doesNotMatch(code, /innerHTML/,
  'Klienti duhet të ndërtojë DOM me elemente, jo me vargje HTML.');
assert.match(client, /node\.textContent = String\(content\)/);

// ------------------------------------------- Faza 4: formulari dinamik

/* Fushat vijnë nga `requires` i serverit. Nëse klienti fillon t'i vendosë vetë,
   formulari do të kërkojë të dhëna që nuk hyjnë askund — ose, më keq, do të
   heshtë për ato që hyjnë. */
assert.match(client, /function applyPatientFields\(requires\)/);
assert.match(client, /weight:Boolean\(requires\?\.weight\)/);
assert.match(client, /height:Boolean\(requires\?\.height\)/);
for (const field of ['weight', 'age', 'age-unit', 'height']) {
  assert.match(html, new RegExp(`data-patient-field="${field}"`), `Mungon fusha ${field}.`);
}

/* Fushat që tri teste të tjera i presin te kjo faqe mbeten aty. */
for (const id of ['patientWeightKg', 'patientAgeMonths', 'dosageSearch', 'dosageList', 'dosageStatus']) {
  assert.match(html, new RegExp(`id="${id}"`), `Mungon #${id}.`);
}

// ---------------------------------------------- Faza 8: "Si u llogarit?"

assert.match(client, /'Si u llogarit\?'/);
/* Hapat vijnë nga serveri. Një rindërtim te klienti mund të thoshte diçka
   tjetër nga ajo që ndodhi vërtet. */
assert.match(client, /for \(const step of calculation\.steps\)/);
assert.doesNotMatch(code, /steps\.push/, 'Klienti nuk guxon t\'i shkruajë vetë hapat.');

// ------------------------------------------------------ Faza 9: prekja

assert.match(css, /--pk-touch:44px/);
const touchTargets = ['.pediatric-result-button', '.pediatric-calculate-button', '.pediatric-back-button'];
for (const selector of touchTargets) {
  const block = css.slice(css.indexOf(`${selector}{`), css.indexOf('}', css.indexOf(`${selector}{`)));
  assert.match(block, /min-height:var\(--pk-touch\)/, `${selector} duhet të ketë 44px lartësi minimale.`);
}
assert.match(css, /@media \(max-width: 767px\)/, 'Duhet një trajtim i veçantë për telefonin.');
assert.match(css, /overflow-wrap:anywhere/, 'Emrat e gjatë të barnave duhet të thyhen.');

/* Ngjyra nuk mban kuptim vetëm: etiketa e gjendjes e thotë të njëjtën gjë me
   fjalë, për këdo që nuk i dallon ngjyrat. */
assert.match(client, /CALCULATOR_READY:'Llogaritet'/);
assert.match(client, /CONTRAINDICATED:'Kundërindikuar'/);

// ------------------------------------------ kërkesat që tejkalojnë njëra-tjetrën

/* Shkrimi i shpejtë nis disa kërkime; përgjigjja e vonuar nuk guxon ta
   mbishkruajë një kërkim më të ri. */
assert.match(client, /if \(token !== state\.searchToken\) return;/);

console.log(
  'Pediatric calculator UI passed: klienti e merr pronësinë para të vjetrit, nuk llogarit dhe nuk '
  + 'dërgon asnjë numër dozimi, formulari ndërtohet nga `requires` i serverit, hapat vijnë nga '
  + 'serveri, dhe objektivat e prekjes janë 44px.',
);
