'use strict';

const { neonRequest } = require('./neon-data-api.js');

const PROFILE_LIMIT = 6000;
const DRUG_CHUNK_SIZE = 100;
const APPROVED_POPULATIONS = new Map([
  ['adult only', 'Adult only'],
  ['pediatric only', 'Pediatric only'],
  ['pediatric and adult both', 'Pediatric and adult both'],
]);

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalizePopulation = value => clean(value)
  .toLowerCase()
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ');

function approvedPopulationFromNotes(value) {
  const source = clean(value);
  if (!source) return '';
  try {
    const parsed = JSON.parse(source);
    const raw = clean(parsed?.medindex_audit?.approved_population || parsed?.approved_population);
    return APPROVED_POPULATIONS.get(normalizePopulation(raw)) || '';
  } catch {
    return '';
  }
}

async function authorized(req) {
  const auth = await import('./auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

async function approvedPopulationProfiles() {
  const { data } = await neonRequest(
    `drug_clinical_profiles?select=drug_id,editorial_notes&editorial_notes=ilike.*approved_population*&limit=${PROFILE_LIMIT}`
  );
  const profiles = Array.isArray(data) ? data : [];
  const byDrugId = new Map();
  profiles.forEach(row => {
    const drugId = clean(row?.drug_id);
    const approvedPopulation = approvedPopulationFromNotes(row?.editorial_notes);
    if (drugId && approvedPopulation) byDrugId.set(drugId, approvedPopulation);
  });
  return byDrugId;
}

async function registryItemsForProfiles(byDrugId) {
  const drugIds = [...byDrugId.keys()];
  const items = [];
  for (let index = 0; index < drugIds.length; index += DRUG_CHUNK_SIZE) {
    const chunk = drugIds.slice(index, index + DRUG_CHUNK_SIZE);
    const idFilter = chunk.join(',');
    const { data } = await neonRequest(
      `drugs?select=id,registry_number&id=in.(${idFilter})&order=registry_number.asc&limit=${DRUG_CHUNK_SIZE}`
    );
    (Array.isArray(data) ? data : []).forEach(row => {
      const registryNumber = Number(row?.registry_number);
      const approvedPopulation = byDrugId.get(clean(row?.id)) || '';
      if (!Number.isInteger(registryNumber) || registryNumber <= 0 || !approvedPopulation) return;
      items.push({ registryNumber, approvedPopulation });
    });
  }
  return items.sort((left, right) => left.registryNumber - right.registryNumber);
}

async function getApprovedPopulationItems() {
  const profiles = await approvedPopulationProfiles();
  if (!profiles.size) return [];
  return registryItemsForProfiles(profiles);
}

async function getPediatricOnlyRegistryNumbers() {
  const items = await getApprovedPopulationItems();
  return items
    .filter(item => item.approvedPopulation === 'Pediatric only')
    .map(item => item.registryNumber);
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-cache, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok:false, error:'Metoda nuk lejohet.' });
  }
  if (!(await authorized(req))) {
    return res.status(401).json({ ok:false, error:'Sesioni nuk është aktiv.' });
  }

  try {
    const items = await getApprovedPopulationItems();
    const registryNumbers = items
      .filter(item => item.approvedPopulation === 'Pediatric only')
      .map(item => item.registryNumber);
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).json({
      ok:true,
      population:'Pediatric only',
      registryNumbers,
      count:registryNumbers.length,
      items,
      classifiedCount:items.length,
    });
  } catch (error) {
    console.error('Approved population marker error:', error);
    return res.status(500).json({ ok:false, error:'Nuk u lexua klasifikimi i popullatës.' });
  }
}

handler.getApprovedPopulationItems = getApprovedPopulationItems;
handler.getPediatricOnlyRegistryNumbers = getPediatricOnlyRegistryNumbers;
handler.approvedPopulationFromNotes = approvedPopulationFromNotes;
handler.normalizePopulation = normalizePopulation;
module.exports = handler;
