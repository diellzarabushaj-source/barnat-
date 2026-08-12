'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Prescription targeted dosage patch could not find ${label}.`);
  return source.replace(before, after);
}

function patchDrugSearch() {
  let source = read('api/drug-search.js');
  source = replaceOnce(
    source,
    `  return {\n    key:\`${'${pdid}'}|${'${protocolNo}'}|${'${tradeName}'}|${'${strength}'}\`,` ,
    `  return {\n    drugId:clean(row.__neonDrugId),\n    key:\`${'${pdid}'}|${'${protocolNo}'}|${'${tradeName}'}|${'${strength}'}\`,` ,
    'drug-search result drugId bridge',
  );
  if (!source.includes('drugId:clean(row.__neonDrugId)')) throw new Error('Drug search must expose the Neon drugId.');
  write('api/drug-search.js', source);
}

function patchPrescriptionCore() {
  let source = read('prescription-format-core.js');
  source = replaceOnce(
    source,
    `      key: text(item?.key || item?.drugKey || \`${'${item?.pdid || \'\'}'}|${'${item?.tradeName || \'\'}'}|${'${item?.strength || \'\'}'}\`),\n      tradeName: text(item?.tradeName),`,
    `      key: text(item?.key || item?.drugKey || \`${'${item?.pdid || \'\'}'}|${'${item?.tradeName || \'\'}'}|${'${item?.strength || \'\'}'}\`),\n      drugId: text(item?.drugId || item?.id),\n      tradeName: text(item?.tradeName),`,
    'prescription normalizeDrug drugId bridge',
  );
  if (!source.includes('drugId: text(item?.drugId || item?.id)')) throw new Error('Prescription core must preserve drugId.');
  write('prescription-format-core.js', source);
}

function patchDosageGateway() {
  let source = read('api/dosage.js');
  source = replaceOnce(
    source,
    `const dosageCardHandler = require('../lib/dosage-card-handler.js');\nconst approvedPopulationHandler = require('../lib/approved-population-handler.js');`,
    `const dosageCardHandler = require('../lib/dosage-card-handler.js');\nconst prescriptionDosageHandler = require('../lib/prescription-dosage-handler.js');\nconst approvedPopulationHandler = require('../lib/approved-population-handler.js');`,
    'prescription dosage handler import',
  );
  source = replaceOnce(
    source,
    `function isApprovedPopulationRequest(req) {\n  return requestView(req) === 'approved-population';\n}`,
    `function isPrescriptionRequest(req) {\n  return requestView(req) === 'prescription';\n}\n\nfunction isApprovedPopulationRequest(req) {\n  return requestView(req) === 'approved-population';\n}`,
    'prescription view detector',
  );
  source = replaceOnce(
    source,
    `  if (isCardRequest(req) || isCardsRequest(req)) return dosageCardHandler(req, res);\n  if (isApprovedPopulationRequest(req)) return approvedPopulationHandler(req, res);`,
    `  if (isCardRequest(req) || isCardsRequest(req)) return dosageCardHandler(req, res);\n  if (isPrescriptionRequest(req)) return prescriptionDosageHandler(req, res);\n  if (isApprovedPopulationRequest(req)) return approvedPopulationHandler(req, res);`,
    'prescription dosage gateway dispatch',
  );
  source = replaceOnce(
    source,
    `handler.isCardsRequest = isCardsRequest;\nhandler.isApprovedPopulationRequest = isApprovedPopulationRequest;`,
    `handler.isCardsRequest = isCardsRequest;\nhandler.isPrescriptionRequest = isPrescriptionRequest;\nhandler.isApprovedPopulationRequest = isApprovedPopulationRequest;`,
    'prescription dosage gateway export',
  );
  if (!source.includes("requestView(req) === 'prescription'")) throw new Error('Prescription dosage view is not exposed by /api/dosage.');
  write('api/dosage.js', source);
}

function patchRecetat() {
  let source = read('recetat.js');
  source = replaceOnce(
    source,
    `    dosagePayload: null,\n    dosagePromise: null,`,
    `    dosageByDrug: new Map(),\n    dosagePromises: new Map(),`,
    'per-drug dosage cache state',
  );

  const oldLoader = `  async function dosagePayload() {\n    if (state.dosagePayload) return state.dosagePayload;\n    if (!state.dosagePromise) {\n      state.dosagePromise = fetch('/api/dosage', { credentials:'same-origin', headers:{ Accept:'application/json' } })\n        .then(async response => {\n          const payload = await response.json();\n          if (!response.ok) throw new Error(payload.error || \`Dozologjia ${'${response.status}'}\`);\n          state.dosagePayload = payload;\n          return payload;\n        })\n        .catch(() => ({ adult:[], pediatric:[] }))\n        .finally(() => { state.dosagePromise = null; });\n    }\n    return state.dosagePromise;\n  }`;
  const newLoader = `  async function dosagePayloadForDrug(drug) {\n    const drugId = text(drug?.drugId);\n    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(drugId)) return { adult:[], pediatric:[] };\n    if (state.dosageByDrug.has(drugId)) return state.dosageByDrug.get(drugId);\n    if (!state.dosagePromises.has(drugId)) {\n      const request = fetch(\`/api/dosage?view=prescription&id=${'${encodeURIComponent(drugId)}'}\`, {\n        credentials:'same-origin', headers:{ Accept:'application/json' }\n      })\n        .then(async response => {\n          const payload = await response.json();\n          if (!response.ok || !payload?.ok) throw new Error(payload?.error || \`Dozologjia ${'${response.status}'}\`);\n          const targeted = { adult:Array.isArray(payload.adult) ? payload.adult : [], pediatric:Array.isArray(payload.pediatric) ? payload.pediatric : [] };\n          state.dosageByDrug.set(drugId, targeted);\n          return targeted;\n        })\n        .catch(() => ({ adult:[], pediatric:[] }))\n        .finally(() => { state.dosagePromises.delete(drugId); });\n      state.dosagePromises.set(drugId, request);\n    }\n    return state.dosagePromises.get(drugId);\n  }`;
  source = replaceOnce(source, oldLoader, newLoader, 'full dosage loader');
  source = replaceOnce(
    source,
    `    const payload = await dosagePayload();\n    const decision = Dosage.decideMatch(drug, payload.adult || [], { population:'adult' });`,
    `    const payload = await dosagePayloadForDrug(drug);\n    const decision = Dosage.decideMatch(drug, payload.adult || [], { population:'adult' });`,
    'targeted dosage decision',
  );

  if (source.includes("fetch('/api/dosage',")) throw new Error('Recetat still fetches the full dosage payload.');
  if (!source.includes('/api/dosage?view=prescription&id=')) throw new Error('Recetat targeted dosage URL is missing.');
  if (!source.includes("decision.status === 'choose-indication'")) throw new Error('Indication chooser must remain intact.');
  if (!source.includes("dosageStatus:'manual'")) throw new Error('Manual dosage fallback must remain intact.');
  write('recetat.js', source);
}

patchDrugSearch();
patchPrescriptionCore();
patchDosageGateway();
patchRecetat();

console.log('Phase 7 Recetat targeted per-drug dosage, indication chooser and manual fallback patch passed.');
