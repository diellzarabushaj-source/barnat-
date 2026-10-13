'use strict';

const { loadReference } = require('./pediatric-common-reference-handler.js');
const makeEngine = require('./pediatric-common-dose-engine.generated.js');
const liquid = require('../pediatric-common-liquid-core.js');
const VIEW = 'pediatric-common-calculate';

const revisionOf = reference => JSON.stringify([
  reference.database?.clinicalAudit?.version || reference.clinicalAudit?.schemaVersion || '',
  reference.database?.clinicalAudit?.updatedAt || reference.clinicalAudit?.auditedAt || '',
  reference.database?.payloadSha256 || '',
]);

function decimal(value) {
  if (!['string','number'].includes(typeof value)) return NaN;
  const text = String(value ?? '').trim().replace(',', '.');
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : NaN;
}

function calculate(reference, input) {
  if (input.referenceRevision !== revisionOf(reference)) return { error:'Referenca ka ndryshuar ose nuk është aktive. Ringarko faqen para llogaritjes.' };
  const engine = makeEngine(reference);
  const drug = reference.sections.flatMap(section => section.drugs).find(item => item.name === input.drugName);
  if (!drug) return { error:'Bari nuk u gjet në referencën aktive.' };
  const audit = reference.clinicalAudit?.drugs?.[drug.name];
  if (!audit || audit.calculator?.disabled) return { error:audit?.calculator?.reasonSq || 'Llogaritja nuk është e lejuar për këtë bar.' };
  const index = typeof input.optionIndex === 'number' || (typeof input.optionIndex === 'string' && /^\d+$/.test(input.optionIndex)) ? Number(input.optionIndex) : NaN;
  const options = engine.effectiveOptions(drug);
  if (!Number.isInteger(index) || index < 0 || !options[index]) return { error:'Zgjidh një skemë të verifikuar.' };
  const option = options[index];
  const weight = decimal(input.weight);
  if (engine.needsPatientWeight(option) && (!Number.isFinite(weight) || weight < 0.4 || weight > 150)) {
    return { error:'Shëno peshën reale ndërmjet 0,4 dhe 150 kg.' };
  }
  const values = { weight:String(weight), age:'', ageUnit:'month', ageManual:false };
  if (input.ageConfirmed === true) {
    if (!['day','month','year'].includes(input.ageUnit)) return { error:'Zgjidh njësinë e moshës.' };
    const age = decimal(input.age);
    if (!Number.isFinite(age) || age < 0 || engine.ageDays(age,input.ageUnit) > 18 * 365.25) {
      return { error:'Mosha duhet të jetë nga 0 deri në 18 vjeç.' };
    }
    values.age = String(age); values.ageUnit = input.ageUnit; values.ageManual = true;
  }
  // Weight is sufficient for weight-only rules. It cannot establish actual age
  // for a rule whose eligibility/frequency/dose depends on chronological age.
  if (engine.needsAge(option) && !values.ageManual) {
    return { error:'Kjo skemë varet nga mosha. Konfirmo ose ndrysho moshën e sugjeruar.', needsAgeConfirmation:true, exactDaysRequired:engine.optionNeedsExactDays(option) };
  }
  if (engine.optionNeedsExactDays(option) && values.ageManual && engine.ageDays(values.age, values.ageUnit) < 60 && values.ageUnit !== 'day') {
    return { error:'Për foshnjat nën 60 ditë, shëno moshën e saktë në ditë.', needsAgeConfirmation:true, exactDaysRequired:true };
  }
  const result = engine.calculateOption(option, values);
  if (result.error) return result;
  if (![result.doseMin,result.doseMax].every(value => Number.isFinite(value) && value > 0)) {
    return { error:'Nuk ka rezultat numerik të sigurt për këtë skemë.' };
  }
  const practical = engine.practicalDrug(drug);
  return { ...result, conversions:liquid.volumeConversions(result, liquid.presentationsFor(practical,option)),
    vialItems:liquid.vialConversions(result,practical,option), formulationAudit:liquid.formulationAudit(practical,option),
    ageInfo:engine.resolvedAgeInfo(values), drugName:drug.name, optionIndex:index,
    referenceVersion:reference.database?.clinicalAudit?.version || reference.clinicalAudit.schemaVersion,
    referenceUpdatedAt:reference.database?.clinicalAudit?.updatedAt || null };
}

module.exports = async function(req,res) {
  res.setHeader('Cache-Control','private, no-store'); res.setHeader('Vary','Cookie');
  const auth = await import('./auth.mjs');
  if (!(await auth.verifySessionToken(auth.sessionFromRequest(req)))) return res.status(401).json({error:'Sesioni nuk është aktiv.'});
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({error:'Metodë e palejuar.'}); }
  let input = req.body;
  try { if (typeof input === 'string') { if (input.length > 4096) throw Error(); input=JSON.parse(input); } } catch { return res.status(400).json({error:'Të dhënat nuk janë të vlefshme.'}); }
  if (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 4096) return res.status(400).json({error:'Të dhënat nuk janë të vlefshme.'});
  try {
    const result = calculate(await loadReference(),input);
    return res.status(result.error ? 422 : 200).json(result);
  } catch { return res.status(503).json({error:'Referenca aktive nuk u ngarkua. Provo përsëri; rezultati i vjetër nuk përdoret.'}); }
};
module.exports.VIEW = VIEW;
module.exports.calculate = calculate;
module.exports.revisionOf = revisionOf;
