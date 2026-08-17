'use strict';

/* Kontrata e klientit të kalkulatorit pediatrik.
 *
 * Mban tri kufij që nuk guxojnë të rrëshqasin:
 * 1. klienti nuk bën aritmetikë doze;
 * 2. klienti nuk dërgon dozë, përqendrim, caps ose indikacion free-text;
 * 3. regimenId vjen vetëm nga calculationRegimen që serveri ka lidhur.
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

const code = client
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

// ------------------------------------------------------------- pronësia
assert.match(client, /document\.documentElement\.dataset\.pediatricCalculator = OWNER_FLAG/);
assert.match(legacy, /dataset\.pediatricCalculator === 'server'\) return;/);
assert.ok(
  html.indexOf('pediatric-calculator-client.js') < html.indexOf('dozologjia.js'),
  'Klienti duhet të ngarkohet para dozologjia.js.',
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

/* Nxirret vetëm funksioni patientPayload, jo funksionet që vijnë më pas.
   Kjo e mbron testin nga false-positive kur UI-ja përmend fjalë si "dose". */
const payloadStart = client.indexOf('function patientPayload()');
const payloadEnd = client.indexOf('\n  function calculationContext(', payloadStart);
assert.ok(payloadStart >= 0 && payloadEnd > payloadStart, 'Nuk u gjet kufiri i patientPayload().');
const payloadBody = client.slice(payloadStart, payloadEnd);

for (const key of [
  'doseMin', 'doseMax', 'concentration', 'maxSingle', 'maxDaily', 'pediatric_',
  'indication:', 'indicationId',
]) {
  assert.ok(!payloadBody.includes(key), `Trupi i kërkesës nuk guxon të mbajë "${key}".`);
}
assert.match(payloadBody, /payload\.weightKg = weight/);
assert.match(payloadBody, /payload\.heightCm = height/);
assert.match(payloadBody, /const selectionId = state\.product\?\.calculationRegimen\?\.selectionId/);
assert.match(payloadBody, /if \(selectionId\) payload\.regimenId = selectionId/);
assert.doesNotMatch(payloadBody, /state\.product\?\.regimen\?\.primaryRegimenId/,
  'Klienti nuk duhet të marrë regimenId nga fusha legacy typed; binding-u vjen nga serveri.');

// ------------------------------------------------------------ endpoint-et
assert.match(client, /\/api\/dosage\/search\?q=\$\{encodeURIComponent\(query\)\}/);
assert.match(client, /\/api\/dosage\/product\/\$\{encodeURIComponent\(drugId\)\}/);
assert.match(client, /'\/api\/dosage\/calculate'/);
assert.match(client, /method:'POST'/);
assert.doesNotMatch(code, /fetch\('\/api\/dosage'[^/]/,
  'Klienti nuk guxon ta tërheqë të gjithë katalogun e dozimit.');

// ------------------------------------------------------- teksti nga baza
assert.doesNotMatch(code, /innerHTML/,
  'Klienti duhet të ndërtojë DOM me elemente, jo me vargje HTML.');
assert.match(client, /node\.textContent = String\(content\)/);

// ------------------------------------------- formulari dinamik
assert.match(client, /function applyPatientFields\(requires\)/);
assert.match(client, /weight:Boolean\(requires\?\.weight\)/);
assert.match(client, /height:Boolean\(requires\?\.height\)/);
for (const field of ['weight', 'age', 'age-unit', 'height']) {
  assert.match(html, new RegExp(`data-patient-field="${field}"`), `Mungon fusha ${field}.`);
}
for (const id of ['patientWeightKg', 'patientAgeMonths', 'dosageSearch', 'dosageList', 'dosageStatus']) {
  assert.match(html, new RegExp(`id="${id}"`), `Mungon #${id}.`);
}

// ----------------------------------------- binding-u indikacion/regjim
assert.match(client, /function calculationContext\(product\)/);
assert.match(client, /Indikacioni i kësaj llogaritjeje/);
assert.match(client, /Regjimi u zgjodh automatikisht nga serveri/);
assert.match(client, /item\.sourceKey === binding\.selectionId/);
assert.match(client, /regimen\.sourceKey === primaryKey/);
assert.match(client, /Nuk përdoret nga kalkulatori i këtij regjimi typed/);
assert.doesNotMatch(html, /id="(?:pediatric)?indication/i,
  'Nuk duhet të ekzistojë input free-text për indikacionin.');

// ---------------------------------------------- "Si u llogarit?"
assert.match(client, /'Si u llogarit\?'/);
assert.match(client, /for \(const step of calculation\.steps\)/);
assert.doesNotMatch(code, /steps\.push/, 'Klienti nuk guxon t\'i shkruajë vetë hapat.');

// ------------------------------------------------------ prekja
assert.match(css, /--pk-touch:44px/);
const touchTargets = ['.pediatric-result-button', '.pediatric-calculate-button', '.pediatric-back-button'];
for (const selector of touchTargets) {
  const block = css.slice(css.indexOf(`${selector}{`), css.indexOf('}', css.indexOf(`${selector}{`)));
  assert.match(block, /min-height:var\(--pk-touch\)/, `${selector} duhet të ketë 44px lartësi minimale.`);
}
assert.match(css, /@media \(max-width: 767px\)/);
assert.match(css, /overflow-wrap:anywhere/);
assert.match(client, /CALCULATOR_READY:'Llogaritet'/);
assert.match(client, /CONTRAINDICATED:'Kundërindikuar'/);
assert.match(client, /if \(token !== state\.searchToken\) return;/);

console.log(
  'Pediatric calculator UI passed: klienti nuk llogarit dhe nuk dërgon dozë/indikacion; '
  + 'regimenId merret vetëm nga binding-u server-side; indikacioni i lidhur shfaqet automatikisht; '
  + 'regjimet tjera mbeten vetëm informuese.',
);
