'use strict';

// Admin-added shared drugs.
//
// A normal user's additions live in `public.user_drugs` and stay private to them.
// When an admin adds a drug it belongs to the shared registry in `public.drugs`, so
// every MedIndex account sees it. This module only ever INSERTs: it never edits or
// deletes an imported row, and it never touches ICD data.
//
// Admin-added entries take registry numbers from a reserved band far above the
// official import range, so they can never collide with a future official number
// and stay easy to identify.

const { neonRequest } = require('./medindex-data-api.js');
const SystemHealthSnapshot = require('./system-health-snapshot.js');

const ADMIN_REGISTRY_BAND_START = 900000;
const MAX_TEXT = 1200;
const MAX_LONG_TEXT = 4000;

const clean = (value, max = MAX_TEXT) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const nowIso = () => new Date().toISOString();

class AdminDrugError extends Error {
  constructor(status, message, code = '') {
    super(message);
    this.name = 'AdminDrugError';
    this.status = status;
    this.code = code;
  }
}

// Mirrors the official column set, so an admin-added drug renders through exactly
// the same registry path as an imported one.
const TEXT_FIELDS = Object.freeze({
  activeSubstance:'active_substance',
  strength:'strength',
  pharmaceuticalForm:'pharmaceutical_form',
  atcCode:'atc_code',
  drugClass:'drug_class',
  packaging:'packaging',
  manufacturer:'manufacturer',
  marketingAuthorizationHolder:'marketing_authorization_holder',
  productStatus:'product_status',
});

function normalizeInput(input = {}) {
  const tradeName = clean(input.tradeName || input.name, 300);
  if (!tradeName) throw new AdminDrugError(400, 'Bari i përbashkët duhet të ketë emrin tregtar.', 'TRADE_NAME_MISSING');

  const record = { trade_name:tradeName };
  for (const [key, column] of Object.entries(TEXT_FIELDS)) {
    const value = clean(input[key], key === 'atcCode' ? 20 : MAX_TEXT);
    if (value) record[column] = value;
  }
  const useText = clean(input.useText, MAX_LONG_TEXT);
  if (useText) record.use_text = useText;
  return record;
}

// Reserves the next number in the admin band. The band is queried with a bounded,
// ordered read so it stays inside the runtime egress guard.
async function nextRegistryNumber() {
  const { data } = await neonRequest(
    'drugs?select=registry_number'
    + `&registry_number=gte.${ADMIN_REGISTRY_BAND_START}`
    + `&order=${encodeURIComponent('registry_number.desc')}`
    + '&limit=1',
  );
  const row = Array.isArray(data) ? data[0] : null;
  const highest = Number(row?.registry_number);
  return Number.isFinite(highest) && highest >= ADMIN_REGISTRY_BAND_START
    ? highest + 1
    : ADMIN_REGISTRY_BAND_START;
}

async function writeAudit(actor, drug) {
  await neonRequest('audit_logs', {
    method:'POST',
    body:[{
      entity_type:'drug',
      entity_id:clean(drug.id, 80),
      action:'admin_drug_created',
      old_data:null,
      new_data:drug,
      changed_by:`${clean(actor?.name) || 'admin'} <${String(actor?.email || '').toLowerCase()}>`,
      source:'admin_drugs',
      changed_at:nowIso(),
    }],
    prefer:'return=minimal',
  });
}

async function createSharedDrug(actor, input = {}) {
  const record = normalizeInput(input);
  const now = nowIso();
  const registryNumber = await nextRegistryNumber();

  const body = {
    ...record,
    registry_number:registryNumber,
    is_published:true,
    editorial_status:'published',
    editorial_override:true,
    // Provenance for a manually added entry: it did not come from the official import.
    source_payload:{
      origin:'admin_manual',
      addedBy:String(actor?.email || '').toLowerCase(),
      addedAt:now,
    },
    created_at:now,
    updated_at:now,
  };

  const { data } = await neonRequest('drugs?select=id,registry_number,trade_name', {
    method:'POST',
    body:[body],
    prefer:'return=representation',
  });
  const created = Array.isArray(data) ? data[0] : null;
  if (!created?.id) throw new AdminDrugError(502, 'Bari i ri nuk u ruajt në regjistrin e përbashkët.', 'SHARED_DRUG_NOT_CREATED');

  await writeAudit(actor, created);
  await SystemHealthSnapshot.refreshBestEffort('admin-drug-create');
  return {
    id:clean(created.id, 80),
    registryNumber:Number(created.registry_number),
    tradeName:clean(created.trade_name, 300),
    shared:true,
  };
}

module.exports = {
  AdminDrugError,
  ADMIN_REGISTRY_BAND_START,
  TEXT_FIELDS,
  createSharedDrug,
  _test:{ clean, normalizeInput, nextRegistryNumber },
};
