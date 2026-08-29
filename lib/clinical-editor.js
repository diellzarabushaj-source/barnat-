'use strict';

const crypto = require('node:crypto');
const { neonRequest } = require('./medindex-data-api.js');
const SyncOutbox = require('./sync-outbox.js');
const AdminAccess = require('./admin-access.js');
const AdminDrugs = require('./admin-drugs.js');
const SystemHealthSnapshot = require('./system-health-snapshot.js');

const PAGE_SIZE = 1000;
const MAX_BODY_BYTES = 160 * 1024;
const MAX_TEXT = 12000;
const VERIFIED_CALCULATION = new Set(['text_verified', 'calculable_verified']);
const VALID_STATUSES = new Set(['pending', 'in_review', 'verified']);

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const nowIso = () => new Date().toISOString();
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function text(value, max = MAX_TEXT) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function httpsUrl(value) {
  const candidate = clean(value);
  return /^https:\/\/[^\s]+$/i.test(candidate) ? candidate : '';
}

function uniqueUrls(value) {
  const source = Array.isArray(value) ? value : text(value).split(/\n|;/);
  return [...new Set(source.map(httpsUrl).filter(Boolean))].slice(0, 20);
}

function bodySize(req) {
  const declared = Number(req.headers?.['content-length'] || 0);
  if (Number.isFinite(declared) && declared > 0) return declared;
  try { return Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8'); }
  catch { return MAX_BODY_BYTES + 1; }
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return {};
}

function queryValue(req, key) {
  if (req.query && req.query[key] !== undefined) return req.query[key];
  try { return new URL(String(req.url || ''), 'https://medindex.local').searchParams.get(key); }
  catch { return null; }
}

function sameOrigin(req) {
  const origin = clean(req.headers?.origin);
  if (!origin) return true;
  const host = clean(req.headers?.['x-forwarded-host'] || req.headers?.host);
  try { return !host || new URL(origin).host === host; }
  catch { return false; }
}

// The clinical editor writes the shared, official registry that every MedIndex
// account reads, so it is an admin-only tool. A valid session is not enough: admin
// standing is re-verified against Supabase on every request.
async function requireEditorAdmin(req) {
  return AdminAccess.requireAdminSession(req);
}

// Shared-registry changes are attributed to the admin who made them, not to a
// hardcoded name, so the audit trail stays meaningful with more than one admin.
function auditActor(actor) {
  const name = clean(actor?.name);
  const email = clean(actor?.email);
  if (name && email) return `${name} <${email}>`;
  return email || name || 'admin';
}

/* Supabase zbaton tavanin e vet `max-rows` mbi çdo kërkesë, prandaj një faqe më
   e shkurtër se `PAGE_SIZE` nuk dëshmon se tabela mbaroi — vetëm një faqe bosh e
   dëshmon. Kur tavani i serverit është nën `PAGE_SIZE`, ndalimi te faqja e
   shkurtër e priste leximin që në faqen e parë. Ecja sipas rreshtave që u
   kthyen vërtet e mban shëtitjen të saktë nën çdo tavan. */
async function fetchPaged(table, select, filters = '', order = '') {
  const output = [];
  for (let offset = 0; ;) {
    const path = `${table}?select=${encodeURIComponent(select)}&limit=${PAGE_SIZE}&offset=${offset}`
      + filters + (order ? `&order=${encodeURIComponent(order)}` : '');
    const { data } = await neonRequest(path);
    const rows = Array.isArray(data) ? data : [];
    output.push(...rows);
    if (rows.length === 0) break;
    offset += rows.length;
    if (output.length > 10000) throw new Error(`${table}: kufiri i leximit u tejkalua.`);
  }
  return output;
}

async function fetchOne(table, select, filters) {
  const { data } = await neonRequest(`${table}?select=${encodeURIComponent(select)}${filters}&limit=1`);
  return Array.isArray(data) ? data[0] || null : null;
}

function verifiedDose(row) {
  return Boolean(row
    && row.editorial_status === 'published'
    && VERIFIED_CALCULATION.has(row.calculation_status)
    && clean(row.dose_text)
    && clean(row.route)
    && httpsUrl(row.source_url));
}

function summaryItem(drug, profile, regimens = []) {
  return {
    registryNumber:Number(drug.registry_number),
    drugId:clean(drug.id),
    tradeName:clean(drug.trade_name),
    verificationStatus:profile?.verification_status || 'pending',
    adultVerified:regimens.some(row => row.population === 'adult' && verifiedDose(row)),
    pediatricVerified:regimens.some(row => row.population === 'pediatric' && verifiedDose(row)),
    editorialOverride:drug.editorial_override === true,
    reviewedAt:profile?.reviewed_at || '',
    updatedAt:profile?.updated_at || drug.updated_at || '',
  };
}

async function getSummary() {
  const [drugs, profiles, regimens] = await Promise.all([
    fetchPaged('drugs', 'id,registry_number,trade_name,editorial_override,updated_at', '&is_published=eq.true', 'registry_number.asc'),
    fetchPaged('drug_clinical_profiles', 'drug_id,verification_status,reviewed_at,updated_at'),
    fetchPaged('dosage_regimens', 'drug_id,population,editorial_status,calculation_status,dose_text,route,source_url,source_key', '&drug_id=not.is.null'),
  ]);
  const profileMap = new Map(profiles.map(row => [row.drug_id, row]));
  const regimenMap = new Map();
  regimens.filter(row => clean(row.source_key).startsWith('card:')).forEach(row => {
    if (!regimenMap.has(row.drug_id)) regimenMap.set(row.drug_id, []);
    regimenMap.get(row.drug_id).push(row);
  });
  const items = drugs.map(drug => summaryItem(drug, profileMap.get(drug.id), regimenMap.get(drug.id)));
  return {
    total:items.length,
    pending:items.filter(item => item.verificationStatus === 'pending').length,
    inReview:items.filter(item => item.verificationStatus === 'in_review').length,
    verified:items.filter(item => item.verificationStatus === 'verified').length,
    adultVerified:items.filter(item => item.adultVerified).length,
    pediatricVerified:items.filter(item => item.pediatricVerified).length,
    items,
    generatedAt:nowIso(),
  };
}

function mapDrug(row) {
  return {
    id:clean(row.id), registryNumber:Number(row.registry_number), protocolNo:clean(row.protocol_no), pdid:clean(row.pdid),
    tradeName:clean(row.trade_name), activeSubstance:clean(row.active_substance), atcCode:clean(row.atc_code),
    drugClass:clean(row.drug_class), useText:text(row.use_text), strength:clean(row.strength),
    pharmaceuticalForm:clean(row.pharmaceutical_form), packaging:clean(row.packaging), manufacturer:clean(row.manufacturer),
    marketingAuthorizationHolder:clean(row.marketing_authorization_holder), maCertificate:clean(row.ma_certificate),
    productStatus:clean(row.product_status), validityText:clean(row.validity_text),
    editorialOverride:row.editorial_override === true, updatedAt:row.updated_at || '',
  };
}

function mapProfile(row) {
  return {
    verificationStatus:row?.verification_status || 'pending', clinicalSummary:text(row?.clinical_summary),
    indicationsText:text(row?.indications_text), contraindications:text(row?.contraindications), warnings:text(row?.warnings),
    interactions:text(row?.interactions), pregnancyLactation:text(row?.pregnancy_lactation),
    renalAdjustment:text(row?.renal_adjustment), hepaticAdjustment:text(row?.hepatic_adjustment), monitoring:text(row?.monitoring),
    administrationNotes:text(row?.administration_notes), editorialNotes:text(row?.editorial_notes),
    sourceUrls:Array.isArray(row?.source_urls) ? row.source_urls.map(httpsUrl).filter(Boolean) : [],
    reviewedBy:clean(row?.reviewed_by), reviewedAt:row?.reviewed_at || '', updatedAt:row?.updated_at || '',
  };
}

function mapDosage(row) {
  if (!row) return { dose:'', route:'', sourceUrl:'', notes:'', verified:false, status:'missing' };
  return {
    id:clean(row.id), dose:text(row.dose_text), route:clean(row.route), sourceUrl:httpsUrl(row.source_url),
    notes:text(row.warnings), verified:verifiedDose(row), status:clean(row.editorial_status),
    reviewedBy:clean(row.reviewed_by), reviewedAt:row.reviewed_at || '',
  };
}

function normalizeRegistryNumber(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new HttpError(400, 'Numri i barit nuk është valid.');
  return number;
}

async function getDrugEditor(registryNumber) {
  const number = normalizeRegistryNumber(registryNumber);
  const drug = await fetchOne(
    'drugs',
    'id,registry_number,protocol_no,pdid,trade_name,active_substance,atc_code,drug_class,use_text,strength,pharmaceutical_form,packaging,manufacturer,marketing_authorization_holder,ma_certificate,product_status,validity_text,editorial_override,updated_at',
    `&registry_number=eq.${number}`
  );
  if (!drug) throw new HttpError(404, 'Bari nuk u gjet.');
  const encodedId = encodeURIComponent(drug.id);
  const [profile, dosageRows, indications, sources, audit] = await Promise.all([
    fetchOne('drug_clinical_profiles', '*', `&drug_id=eq.${encodedId}`),
    fetchPaged('dosage_regimens', 'id,drug_id,population,dose_text,route,warnings,calculation_status,editorial_status,reviewed_by,reviewed_at,source_key,source_url,updated_at', `&drug_id=eq.${encodedId}`),
    fetchPaged('drug_indications', 'id,indication_name,icd_code,population,editorial_status,updated_at', `&drug_id=eq.${encodedId}&editorial_status=neq.archived`, 'indication_name.asc'),
    fetchPaged('clinical_sources', 'id,source_name,source_url,source_type,supports_field,checked_at', `&entity_type=eq.drug&entity_id=eq.${encodedId}`, 'created_at.asc'),
    fetchPaged('audit_logs', 'id,action,changed_by,source,changed_at', `&entity_type=eq.drug&entity_id=eq.${encodedId}`, 'changed_at.desc'),
  ]);
  const cards = dosageRows.filter(row => clean(row.source_key).startsWith(`card:${number}:`));
  return {
    drug:mapDrug(drug), profile:mapProfile(profile),
    dosage:{ adult:mapDosage(cards.find(row => row.population === 'adult')), pediatric:mapDosage(cards.find(row => row.population === 'pediatric')) },
    indications:indications.slice(0, 100).map(row => ({ name:clean(row.indication_name), icdCode:clean(row.icd_code), population:clean(row.population), status:clean(row.editorial_status) })),
    sources:sources.slice(0, 50).map(row => ({ name:clean(row.source_name), url:httpsUrl(row.source_url), supportsField:clean(row.supports_field), checkedAt:row.checked_at || '' })),
    audit:audit.slice(0, 20).map(row => ({ id:row.id, action:clean(row.action), changedBy:clean(row.changed_by), source:clean(row.source), changedAt:row.changed_at || '' })),
  };
}

function normalizeDrugPayload(payload, current) {
  const input = payload?.drug || {};
  const result = {
    trade_name:clean(input.tradeName), active_substance:clean(input.activeSubstance), atc_code:clean(input.atcCode).toUpperCase(),
    drug_class:text(input.drugClass, 1000), use_text:text(input.useText, 4000), strength:clean(input.strength),
    pharmaceutical_form:clean(input.pharmaceuticalForm), packaging:text(input.packaging, 1000),
    editorial_override:true, is_published:true, editorial_status:'published', updated_at:nowIso(),
  };
  if (!result.trade_name || !result.active_substance || !result.atc_code || !result.strength || !result.pharmaceutical_form) {
    throw new HttpError(400, 'Emri, substanca, ATC, fortësia dhe forma janë të detyrueshme.');
  }
  result.source_hash = hash({ ...current, ...result, editorialOverride:true });
  return result;
}

function normalizeProfilePayload(payload, actor = null, current = {}) {
  const input = payload?.profile || {};
  const value = key => hasOwn(input, key) ? input[key] : current?.[key];
  const status = clean(value('verificationStatus') || 'pending');
  if (!VALID_STATUSES.has(status)) throw new HttpError(400, 'Statusi i verifikimit nuk është valid.');
  const sourceUrls = uniqueUrls(value('sourceUrls'));
  const result = {
    verification_status:status, clinical_summary:text(value('clinicalSummary')), indications_text:text(value('indicationsText')),
    contraindications:text(value('contraindications')), warnings:text(value('warnings')), interactions:text(value('interactions')),
    pregnancy_lactation:text(value('pregnancyLactation')), renal_adjustment:text(value('renalAdjustment')),
    hepatic_adjustment:text(value('hepaticAdjustment')), monitoring:text(value('monitoring')),
    administration_notes:text(value('administrationNotes')), editorial_notes:text(value('editorialNotes')), source_urls:sourceUrls,
    reviewed_by:status === 'verified' ? auditActor(actor) : null,
    reviewed_at:status === 'verified' ? nowIso() : null, editorial_override:true, updated_at:nowIso(),
  };
  if (status === 'verified' && !sourceUrls.length) throw new HttpError(400, 'Për statusin “I verifikuar” duhet së paku një burim HTTPS.');
  return result;
}

function normalizeDosePayload(value, population, current = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const field = key => hasOwn(input, key) ? input[key] : current?.[key];
  const result = {
    dose:text(field('dose'), 4000), route:clean(field('route')), sourceUrl:httpsUrl(field('sourceUrl')),
    notes:text(field('notes'), 3000), verified:hasOwn(input, 'verified') ? input.verified === true : current?.verified === true, population,
  };
  if (result.verified && (!result.dose || !result.route || !result.sourceUrl)) {
    throw new HttpError(400, `Doza ${population === 'adult' ? 'për të rritur' : 'pediatrike'} kërkon dozën, rrugën dhe burimin HTTPS.`);
  }
  return result;
}

function parseIndications(value) {
  const lines = text(value, 12000).split('\n').map(line => line.trim()).filter(Boolean).slice(0, 60);
  const seen = new Set();
  return lines.flatMap(line => {
    const [nameRaw, icdRaw = '', populationRaw = 'all'] = line.split('|').map(part => part.trim());
    const name = nameRaw.slice(0, 300);
    const population = ['all', 'adult', 'pediatric'].includes(populationRaw.toLowerCase()) ? populationRaw.toLowerCase() : 'all';
    const key = `${name.toLocaleLowerCase('sq')}|${population}`;
    if (!name || seen.has(key)) return [];
    seen.add(key);
    return [{ name, icdCode:icdRaw.slice(0, 20).toUpperCase(), population }];
  });
}

async function upsertCardDosage(drug, dose, actor = null) {
  const sourceKey = `card:${drug.registryNumber}:${dose.population}`;
  if (!dose.dose) {
    await neonRequest(`dosage_regimens?source_key=eq.${encodeURIComponent(sourceKey)}&editorial_override=eq.true`, {
      method:'PATCH', body:{ editorial_status:'archived', calculation_status:'pending', reviewed_by:null, reviewed_at:null, updated_at:nowIso() }, prefer:'return=minimal',
    });
    return;
  }
  const published = dose.verified;
  const record = {
    drug_id:drug.id, population:dose.population, dose_text:dose.dose, route:dose.route || null, warnings:dose.notes || null,
    calculation_status:published ? 'text_verified' : 'pending', editorial_status:published ? 'published' : 'in_review',
    reviewed_by:published ? auditActor(actor) : null, reviewed_at:published ? nowIso() : null,
    source_key:sourceKey, regimen_code:`EDITOR-${drug.registryNumber}-${dose.population === 'adult' ? 'ADULT' : 'PED'}`,
    atc_code:drug.atcCode, active_substance:drug.activeSubstance, pharmaceutical_form:drug.pharmaceuticalForm,
    reference_strength:drug.strength, source_url:dose.sourceUrl || null, signatura_template:dose.dose, signatura_text:dose.dose,
    source_hash:hash({ drugId:drug.id, ...dose }), editorial_override:true, updated_at:nowIso(),
  };
  await neonRequest('dosage_regimens?on_conflict=source_key', { method:'POST', body:[record], prefer:'resolution=merge-duplicates,return=minimal' });
}

async function replaceIndications(drug, profile, entries) {
  await neonRequest(`drug_indications?drug_id=eq.${encodeURIComponent(drug.id)}&editorial_override=eq.true`, {
    method:'PATCH', body:{ editorial_status:'archived', updated_at:nowIso() }, prefer:'return=minimal',
  });
  if (!entries.length) return;
  const status = profile.verification_status === 'verified' ? 'published' : 'in_review';
  const rows = entries.map(entry => ({
    drug_id:drug.id, indication_name:entry.name, icd_code:entry.icdCode || null, population:entry.population,
    editorial_status:status, source_hash:hash(entry), editorial_override:true, updated_at:nowIso(),
  }));
  await neonRequest('drug_indications?on_conflict=drug_id%2Cindication_name%2Cpopulation', {
    method:'POST', body:rows, prefer:'resolution=merge-duplicates,return=minimal',
  });
}

async function replaceSources(drugId, urls) {
  await neonRequest(`clinical_sources?entity_type=eq.drug&entity_id=eq.${encodeURIComponent(drugId)}&source_type=eq.editorial`, {
    method:'DELETE', prefer:'return=minimal',
  });
  if (!urls.length) return;
  const checkedAt = nowIso();
  const rows = urls.map(url => {
    let sourceName = 'Burim klinik';
    try { sourceName = new URL(url).hostname.replace(/^www\./, ''); } catch {}
    return { entity_type:'drug', entity_id:drugId, source_name:sourceName, source_url:url, source_type:'editorial', supports_field:'profil_klinik', checked_at:checkedAt };
  });
  await neonRequest('clinical_sources', { method:'POST', body:rows, prefer:'return=minimal' });
}

async function saveDrugEditor(payload, actor = null) {
  const registryNumber = Number(payload?.registryNumber);
  const current = await getDrugEditor(registryNumber);
  const drugPatch = normalizeDrugPayload(payload, current.drug);
  const profile = normalizeProfilePayload(payload, actor, current.profile);
  const adult = normalizeDosePayload(payload?.dosage?.adult, 'adult', current.dosage?.adult);
  const pediatric = normalizeDosePayload(payload?.dosage?.pediatric, 'pediatric', current.dosage?.pediatric);
  const indications = parseIndications(profile.indications_text);

  await neonRequest(`drugs?id=eq.${encodeURIComponent(current.drug.id)}`, { method:'PATCH', body:drugPatch, prefer:'return=minimal' });
  await neonRequest('drug_clinical_profiles?on_conflict=drug_id', {
    method:'POST', body:[{ drug_id:current.drug.id, ...profile }], prefer:'resolution=merge-duplicates,return=minimal',
  });
  const updatedDrug = {
    ...current.drug, tradeName:drugPatch.trade_name, activeSubstance:drugPatch.active_substance, atcCode:drugPatch.atc_code,
    drugClass:drugPatch.drug_class, useText:drugPatch.use_text, strength:drugPatch.strength,
    pharmaceuticalForm:drugPatch.pharmaceutical_form, packaging:drugPatch.packaging, editorialOverride:true,
  };
  await Promise.all([
    upsertCardDosage(updatedDrug, adult, actor), upsertCardDosage(updatedDrug, pediatric, actor),
    replaceIndications(updatedDrug, profile, indications), replaceSources(updatedDrug.id, profile.source_urls),
  ]);
  await neonRequest('audit_logs', {
    method:'POST',
    body:[{
      entity_type:'drug', entity_id:updatedDrug.id, action:'editor_update', old_data:current,
      new_data:{ drug:updatedDrug, profile:{ ...payload.profile, sourceUrls:profile.source_urls }, dosage:{ adult, pediatric }, indications },
      changed_by:auditActor(actor), source:'clinical_editor', changed_at:nowIso(),
    }],
    prefer:'return=minimal',
  });
  const sync = await SyncOutbox.enqueueEditorRecord({
  drug:updatedDrug,
  profile:{
    ...(payload.profile || {}),
    verificationStatus:profile.verification_status,
    sourceUrls:profile.source_urls,
  },
  dosage:{ adult, pediatric },
});
await SystemHealthSnapshot.refreshBestEffort('clinical-editor');
const saved = await getDrugEditor(registryNumber);
return { ...saved, sync };
}

async function handle(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!sameOrigin(req)) return res.status(403).json({ ok:false, error:'Origjina e kërkesës nuk lejohet.' });
  let admin;
  try {
    admin = await requireEditorAdmin(req);
  } catch (error) {
    return res.status(Number(error?.status) || 403).json({
      ok:false,
      code:error?.code || 'ADMIN_REQUIRED',
      error:clean(error?.message) || 'Ky veprim është vetëm për administratorin.',
    });
  }
  try {
    if (req.method === 'GET') {
      if (queryValue(req, 'summary') === '1') return res.status(200).json({ ok:true, summary:await getSummary() });
      return res.status(200).json({ ok:true, record:await getDrugEditor(queryValue(req, 'registryNumber')) });
    }
    if (req.method === 'PUT') {
      if (!/^application\/json\b/i.test(clean(req.headers?.['content-type']))) throw new HttpError(415, 'Kërkohet application/json.');
      if (bodySize(req) > MAX_BODY_BYTES) throw new HttpError(413, 'Të dhënat e editorit janë tepër të mëdha.');
      return res.status(200).json({ ok:true, record:await saveDrugEditor(parseBody(req), admin) });
    }
    if (req.method === 'POST') {
      // Adding a drug as admin publishes it to the shared registry, so every MedIndex
      // account sees it. A normal user's additions never come through here.
      if (!/^application\/json\b/i.test(clean(req.headers?.['content-type']))) throw new HttpError(415, 'Kërkohet application/json.');
      if (bodySize(req) > MAX_BODY_BYTES) throw new HttpError(413, 'Të dhënat e barit janë tepër të mëdha.');
      return res.status(201).json({ ok:true, drug:await AdminDrugs.createSharedDrug(admin, parseBody(req)) });
    }
    res.setHeader('Allow', 'GET, POST, PUT');
    return res.status(405).json({ ok:false, error:'Metoda nuk lejohet.' });
  } catch (error) {
    console.error('Clinical editor error:', error);
    return res.status(error.status || 500).json({ ok:false, error:clean(error.message || error).slice(0, 700) });
  }
}

module.exports = {
  handle, getSummary, getDrugEditor, saveDrugEditor,
  _test:{ bodySize, parseIndications, normalizeDosePayload, normalizeProfilePayload, normalizeRegistryNumber, sameOrigin, auditActor, requireEditorAdmin },
};
