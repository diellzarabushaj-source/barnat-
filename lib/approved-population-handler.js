'use strict';

const populationSnapshot = require('../data/approved-population-snapshot.json');
const populationOverrides1to500 = require('../data/approved-population-overrides-1-500.json');
const populationOverrides501to600 = require('../data/approved-population-overrides-501-600.json');
const populationOverrides601to700 = require('../data/approved-population-overrides-601-700.json');
const populationOverrides701to800 = require('../data/approved-population-overrides-701-800.json');
const populationOverrides801to900 = require('../data/approved-population-overrides-801-900.json');
const populationOverrides901to1000 = require('../data/approved-population-overrides-901-1000.json');
const populationOverrides1001to1100 = require('../data/approved-population-overrides-1001-1100.json');
const populationOverrides1101to1200 = require('../data/approved-population-overrides-1101-1200.json');
const populationOverrides1201to1300 = require('../data/approved-population-overrides-1201-1300.json');
const populationOverrides1301to1400 = require('../data/approved-population-overrides-1301-1400.json');
const populationOverrides1401to1500 = require('../data/approved-population-overrides-1401-1500.json');
const populationOverrides1501to1600 = require('../data/approved-population-overrides-1501-1600.json');

const DEFAULT_OVERRIDE_SETS = [
  populationOverrides1to500,
  populationOverrides501to600,
  populationOverrides601to700,
  populationOverrides701to800,
  populationOverrides801to900,
  populationOverrides901to1000,
  populationOverrides1001to1100,
  populationOverrides1101to1200,
  populationOverrides1201to1300,
  populationOverrides1301to1400,
  populationOverrides1401to1500,
  populationOverrides1501to1600,
];
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

function overrideRange(overrides = populationOverrides1to500) {
  const match = clean(overrides?.source?.range).match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end < start) return null;
  return { start, end };
}

function overridePopulationMap(overrides = populationOverrides1to500) {
  const byRegistryNumber = new Map();
  const groups = [
    ['Adult only', overrides?.adultOnly],
    ['Pediatric only', overrides?.pediatricOnly],
    ['Pediatric and adult both', overrides?.pediatricAndAdultBoth],
  ];

  groups.forEach(([approvedPopulation, registryNumbers]) => {
    (Array.isArray(registryNumbers) ? registryNumbers : []).forEach(value => {
      const registryNumber = Number(value);
      if (!Number.isInteger(registryNumber) || registryNumber <= 0) {
        throw new Error(`Numër i pavlefshëm kartele në population override: ${value}.`);
      }
      const previous = byRegistryNumber.get(registryNumber);
      if (previous && previous !== approvedPopulation) {
        throw new Error(`Konflikt population override për kartën ${registryNumber}.`);
      }
      byRegistryNumber.set(registryNumber, approvedPopulation);
    });
  });

  return byRegistryNumber;
}

function applyOverrideSet(byRegistryNumber, overrides) {
  const range = overrideRange(overrides);
  const overrideMap = overridePopulationMap(overrides);
  if (range) {
    for (const registryNumber of [...byRegistryNumber.keys()]) {
      if (registryNumber >= range.start && registryNumber <= range.end) byRegistryNumber.delete(registryNumber);
    }
  }
  overrideMap.forEach((approvedPopulation, registryNumber) => {
    if (range && (registryNumber < range.start || registryNumber > range.end)) {
      throw new Error(`Population override ${registryNumber} është jashtë intervalit ${range.start}-${range.end}.`);
    }
    byRegistryNumber.set(registryNumber, approvedPopulation);
  });
}

function snapshotItems(snapshot = populationSnapshot, overrideSets = DEFAULT_OVERRIDE_SETS) {
  const sourceItems = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const byRegistryNumber = new Map();

  sourceItems.forEach(row => {
    const registryNumber = Number(row?.registryNumber);
    const approvedPopulation = APPROVED_POPULATIONS.get(normalizePopulation(row?.approvedPopulation)) || '';
    if (!Number.isInteger(registryNumber) || registryNumber <= 0 || !approvedPopulation) return;
    const previous = byRegistryNumber.get(registryNumber);
    if (previous && previous !== approvedPopulation) {
      throw new Error(`Konflikt i popullatës së aprovuar për kartën ${registryNumber}.`);
    }
    byRegistryNumber.set(registryNumber, approvedPopulation);
  });

  const sets = Array.isArray(overrideSets) ? overrideSets : [overrideSets];
  sets.filter(Boolean).forEach(overrides => applyOverrideSet(byRegistryNumber, overrides));

  return [...byRegistryNumber.entries()]
    .map(([registryNumber, approvedPopulation]) => ({ registryNumber, approvedPopulation }))
    .sort((left, right) => left.registryNumber - right.registryNumber);
}

async function authorized(req) {
  const auth = await import('./auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

async function getApprovedPopulationItems() {
  return snapshotItems();
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
      source:'sheet_snapshot_with_explicit_overrides',
      snapshotGeneratedAt:clean(populationSnapshot?.source?.generatedAt),
      overrideGeneratedAt:clean(populationOverrides1501to1600?.source?.generatedAt),
      overrideRange:'1-1600',
      overrideRanges:DEFAULT_OVERRIDE_SETS.map(overrides => clean(overrides?.source?.range)),
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
handler.snapshotItems = snapshotItems;
handler.overrideRange = overrideRange;
handler.overridePopulationMap = overridePopulationMap;
handler.applyOverrideSet = applyOverrideSet;
handler.DEFAULT_OVERRIDE_SETS = DEFAULT_OVERRIDE_SETS;
module.exports = handler;
