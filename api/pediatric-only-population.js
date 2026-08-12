'use strict';

const { neonRequest } = require('../lib/neon-data-api.js');

const PROFILE_LIMIT = 6000;
const DRUG_CHUNK_SIZE = 100;

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
    return clean(parsed?.medindex_audit?.approved_population || parsed?.approved_population);
  } catch {
    return '';
  }
}

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

async function pediatricOnlyDrugIds() {
  const { data } = await neonRequest(
    `drug_clinical_profiles?select=drug_id,editorial_notes&editorial_notes=ilike.*approved_population*&limit=${PROFILE_LIMIT}`
  );
  const profiles = Array.isArray(data) ? data : [];
  return [...new Set(profiles
    .filter(row => normalizePopulation(approvedPopulationFromNotes(row?.editorial_notes)) === 'pediatric only')
    .map(row => clean(row?.drug_id))
    .filter(Boolean))];
}

async function registryNumbersForDrugIds(drugIds) {
  const numbers = [];
  for (let index = 0; index < drugIds.length; index += DRUG_CHUNK_SIZE) {
    const chunk = drugIds.slice(index, index + DRUG_CHUNK_SIZE);
    const idFilter = chunk.join(',');
    const { data } = await neonRequest(
      `drugs?select=id,registry_number&id=in.(${idFilter})&order=registry_number.asc&limit=${DRUG_CHUNK_SIZE}`
    );
    (Array.isArray(data) ? data : []).forEach(row => {
      const number = Number(row?.registry_number);
      if (Number.isInteger(number) && number > 0) numbers.push(number);
    });
  }
  return [...new Set(numbers)].sort((left, right) => left - right);
}

async function getPediatricOnlyRegistryNumbers() {
  const drugIds = await pediatricOnlyDrugIds();
  if (!drugIds.length) return [];
  return registryNumbersForDrugIds(drugIds);
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
    const registryNumbers = await getPediatricOnlyRegistryNumbers();
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).json({
      ok:true,
      population:'Pediatric only',
      registryNumbers,
      count:registryNumbers.length,
    });
  } catch (error) {
    console.error('Pediatric-only population marker error:', error);
    return res.status(500).json({ ok:false, error:'Nuk u lexua klasifikimi i popullatës.' });
  }
}

handler.getPediatricOnlyRegistryNumbers = getPediatricOnlyRegistryNumbers;
handler.approvedPopulationFromNotes = approvedPopulationFromNotes;
handler.normalizePopulation = normalizePopulation;
module.exports = handler;
