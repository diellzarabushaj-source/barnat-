'use strict';

const crypto = require('node:crypto');
const { neonRequest } = require('./neon-data-api.js');
const Administration = require('../administration-routes.js');

const CURRENT_SPREADSHEET_ID = '1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo';
const MAX_DELIVERY_ATTEMPTS = 10;
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_PULL = 100;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const nowIso = () => new Date().toISOString();
const dateOnly = value => new Date(value || Date.now()).toISOString().slice(0, 10);
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function missingTable(error) {
  const message = clean(error?.message || error).toLowerCase();
  return message.includes('sync_outbox') && (
    message.includes('does not exist')
    || message.includes('not found')
    || message.includes('42p01')
    || message.includes('pgrst205')
  );
}

function statusLabel(value) {
  const status = clean(value).toLowerCase();
  if (status === 'verified') return 'VERIFIKUAR';
  if (status === 'in_review') return 'NË VERIFIKIM';
  return 'DRAFT';
}

function sourceUrls(profile = {}) {
  const value = profile.sourceUrls || profile.source_urls || [];
  return (Array.isArray(value) ? value : String(value || '').split(/\n|;/))
    .map(clean)
    .filter(url => /^https:\/\//i.test(url));
}

function profileValue(profile, camel, snake) {
  return profile?.[camel] ?? profile?.[snake] ?? '';
}

function administrationFor(record) {
  const drug = record.drug || {};
  const adult = record.dosage?.adult || {};
  const pediatric = record.dosage?.pediatric || {};
  const inferred = Administration.inferAdministration({
    administrationCategory:drug.administrationCategory,
    allowedRoutes:drug.allowedRoutes,
    form:drug.pharmaceuticalForm,
    route:[adult.route, pediatric.route].filter(Boolean).join(' '),
  });
  const routes = Administration.routeTokens([
    drug.allowedRoutes,
    adult.route,
    pediatric.route,
    inferred.routes,
  ].flat().filter(Boolean).join(' '));
  return {
    category:Administration.normalizeCategory(drug.administrationCategory) || inferred.category || '',
    routes,
  };
}

function common(record) {
  const drug = record.drug || {};
  const profile = record.profile || {};
  const adult = record.dosage?.adult || {};
  const pediatric = record.dosage?.pediatric || {};
  const administration = administrationFor(record);
  const urls = sourceUrls(profile);
  const primarySource = clean(adult.sourceUrl || pediatric.sourceUrl || urls[0]);
  const notes = [
    clean(adult.notes),
    clean(pediatric.notes),
    clean(profileValue(profile, 'editorialNotes', 'editorial_notes')),
  ].filter(Boolean).join(' | ');
  const verificationStatus = clean(profileValue(profile, 'verificationStatus', 'verification_status')) || 'pending';
  return { drug, profile, adult, pediatric, administration, primarySource, notes, verificationStatus };
}

function cardTarget(record) {
  const { drug, profile, adult, pediatric, administration, primarySource, notes, verificationStatus } = common(record);
  const registryNumber = Number(drug.registryNumber);
  return {
    sheetName:'KARTELA_BARNAVE',
    rowKey:String(registryNumber),
    values:{
      'Nr rendor':registryNumber,
      'PDID':clean(drug.pdid),
      'Emri tregtar':clean(drug.tradeName),
      'Substanca aktive':clean(drug.activeSubstance),
      'ATC':clean(drug.atcCode),
      'Forma':clean(drug.pharmaceuticalForm),
      'Fortësia':clean(drug.strength),
      'Klasa / Çka është':clean(drug.drugClass),
      'Përdorimi':clean(drug.useText || profileValue(profile, 'indicationsText', 'indications_text')),
      'Doza e plotë — Të rritur':clean(adult.dose),
      'Rruga — Të rritur':clean(adult.route),
      'Doza e plotë — Fëmijë':clean(pediatric.dose),
      'Rruga — Fëmijë':clean(pediatric.route),
      'Burimi URL':primarySource,
      'Data e auditimit':dateOnly(),
      'Statusi':statusLabel(verificationStatus),
      'Publiko?':verificationStatus === 'verified' || adult.verified === true || pediatric.verified === true ? 'PO' : 'JO',
      'Shënim auditimi':notes,
      'Kategoria e administrimit':administration.category,
      'Rrugët e lejuara':administration.routes.join('; '),
    },
  };
}

function adultTarget(record) {
  const { drug, profile, adult } = common(record);
  const registryNumber = Number(drug.registryNumber);
  const verified = adult.verified === true;
  return {
    sheetName:'DOZA_TE_RRITUR',
    rowKey:`EDITOR-${registryNumber}-ADULT`,
    values:{
      'RegimenID':`EDITOR-${registryNumber}-ADULT`,
      'Substanca aktive':clean(drug.activeSubstance),
      'ATC':clean(drug.atcCode),
      'Forma':clean(drug.pharmaceuticalForm),
      'Fortësia referencë':clean(drug.strength),
      'Indikacioni':clean(profileValue(profile, 'indicationsText', 'indications_text')).split('\n')[0],
      'Kodi ICD (opsional)':'',
      'Popullata':'Të rritur',
      'Doza për marrje (mg)':'',
      'Njësia praktike':'',
      'Numri i njësive':'',
      'Rruga':clean(adult.route),
      'Shpeshtësia':'',
      'Intervali (orë)':'',
      'Kohëzgjatja default':'',
      'PRN?':'JO',
      'Indikacioni PRN':'',
      'Maks. për marrje (mg)':'',
      'Maks. 24h (mg)':'',
      'Maks. njësi/24h':'',
      'Dispenso default':'',
      'Signatura draft':clean(adult.dose),
      'Udhëzime / alarme':clean(adult.notes),
      'Renal / hepatik':[
        clean(profileValue(profile, 'renalAdjustment', 'renal_adjustment')),
        clean(profileValue(profile, 'hepaticAdjustment', 'hepatic_adjustment')),
      ].filter(Boolean).join(' | '),
      'Burimi URL':clean(adult.sourceUrl),
      'Data e burimit':dateOnly(),
      'Statusi':verified ? 'VERIFIKUAR' : 'DRAFT',
      'Auto-fill':'JO',
      'Default?':'JO',
    },
  };
}

function pediatricTarget(record) {
  const { drug, profile, pediatric } = common(record);
  const registryNumber = Number(drug.registryNumber);
  const verified = pediatric.verified === true;
  return {
    sheetName:'DOZA_PEDIATRIKE',
    rowKey:`EDITOR-${registryNumber}-PED`,
    values:{
      'RegimenID':`EDITOR-${registryNumber}-PED`,
      'Substanca aktive':clean(drug.activeSubstance),
      'ATC':clean(drug.atcCode),
      'Forma':clean(drug.pharmaceuticalForm),
      'Përqendrimi':clean(drug.strength),
      'Indikacioni':clean(profileValue(profile, 'indicationsText', 'indications_text')).split('\n')[0],
      'ICD (opsional)':'',
      'Mosha min (muaj)':'',
      'Mosha max (muaj)':'',
      'Pesha min (kg)':'',
      'Pesha max (kg)':'',
      'Lloji i skemës':'Tekst klinik nga editori',
      'Vlera mg/kg':'',
      'Baza (dozë/ditë)':'',
      'Nr. dozave/ditë':'',
      'Doza fikse (mg)':'',
      'Vëllimi fikse (mL)':'',
      'Rruga':clean(pediatric.route),
      'Shpeshtësia':'',
      'Intervali (orë)':'',
      'Maks. për marrje (mg)':'',
      'Maks. 24h (mg)':'',
      'Maks. nr. dozave/24h':'',
      'Kohëzgjatja default':'',
      'Formula e llogaritjes':'Nuk aplikohet — kërkohet skemë e strukturuar para Auto-fill.',
      'Signatura draft':clean(pediatric.dose),
      'Udhëzime / alarme':clean(pediatric.notes),
      'Burimi URL':clean(pediatric.sourceUrl),
      'Statusi':verified ? 'VERIFIKUAR' : 'DRAFT',
      'Auto-fill':'JO',
      'Default?':'JO',
    },
  };
}

function buildTargets(record) {
  const registryNumber = Number(record?.drug?.registryNumber);
  if (!Number.isInteger(registryNumber) || registryNumber < 1) throw new Error('Outbox: numri i barit nuk është valid.');
  return [cardTarget(record), adultTarget(record), pediatricTarget(record)];
}

function outboxRow(target, registryNumber) {
  const payload = {
    registryNumber,
    rowKey:target.rowKey,
    values:target.values,
  };
  return {
    source:'clinical_editor',
    destination:'google_sheet',
    spreadsheet_id:CURRENT_SPREADSHEET_ID,
    sheet_name:target.sheetName,
    row_key:target.rowKey,
    payload,
    idempotency_key:hash({
      destination:'google_sheet',
      spreadsheetId:CURRENT_SPREADSHEET_ID,
      sheetName:target.sheetName,
      rowKey:target.rowKey,
      values:target.values,
    }),
    status:'pending',
    attempts:0,
    available_at:nowIso(),
    last_error:null,
    applied_at:null,
    updated_at:nowIso(),
  };
}

async function enqueueEditorRecord(record) {
  const registryNumber = Number(record?.drug?.registryNumber);
  const rows = buildTargets(record).map(target => outboxRow(target, registryNumber));
  try {
    await neonRequest('sync_outbox?on_conflict=idempotency_key', {
      method:'POST',
      body:rows,
      prefer:'resolution=merge-duplicates,return=minimal',
    });
    return { available:true, queued:true, count:rows.length };
  } catch (error) {
    if (missingTable(error)) return { available:false, queued:false, count:0, fallback:'audit_logs' };
    console.error('Sync outbox enqueue failed:', error);
    return { available:true, queued:false, count:0, error:clean(error.message || error) };
  }
}

function numericIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number).filter(value => Number.isInteger(value) && value > 0))];
}

async function patchIds(ids, body) {
  const valid = numericIds(ids);
  if (!valid.length) return 0;
  await neonRequest(`sync_outbox?id=in.(${valid.join(',')})`, {
    method:'PATCH', body:{ ...body, updated_at:nowIso() }, prefer:'return=minimal',
  });
  return valid.length;
}

async function pullUpdates({ spreadsheetId, sheetName, limit = MAX_PULL }) {
  const requestedLimit = Math.max(1, Math.min(MAX_PULL, Number(limit) || MAX_PULL));
  const path = 'sync_outbox?select=id,row_key,payload,idempotency_key,status,attempts,available_at,updated_at,last_error'
    + '&destination=eq.google_sheet'
    + `&spreadsheet_id=eq.${encodeURIComponent(clean(spreadsheetId))}`
    + `&sheet_name=eq.${encodeURIComponent(clean(sheetName))}`
    + '&status=in.(pending,failed,processing)'
    + `&order=${encodeURIComponent('id.asc')}&limit=${requestedLimit * 3}`;
  try {
    const { data } = await neonRequest(path);
    const now = Date.now();
    const rows = (Array.isArray(data) ? data : []).filter(row => {
      if (Number(row.attempts || 0) >= MAX_DELIVERY_ATTEMPTS) return false;
      if (row.status === 'pending') return true;
      if (row.status === 'failed') return Date.parse(row.available_at || 0) <= now;
      return row.status === 'processing' && Date.parse(row.updated_at || 0) <= now - PROCESSING_TIMEOUT_MS;
    }).slice(0, requestedLimit);
    const ids = rows.map(row => Number(row.id));
    if (ids.length) await patchIds(ids, { status:'processing', last_error:null });
    return {
      available:true,
      mode:'outbox',
      updates:rows.map(row => ({
        outboxId:Number(row.id),
        idempotencyKey:row.idempotency_key,
        rowKey:clean(row.row_key),
        values:row.payload?.values || {},
        registryNumber:Number(row.payload?.registryNumber) || null,
      })),
    };
  } catch (error) {
    if (missingTable(error)) return { available:false, mode:'audit_fallback', updates:[] };
    throw error;
  }
}

async function acknowledge(ids) {
  return patchIds(ids, { status:'applied', applied_at:nowIso(), last_error:null });
}

async function fail(ids, errorMessage) {
  const valid = numericIds(ids);
  if (!valid.length) return 0;
  const { data } = await neonRequest(
    `sync_outbox?select=id,attempts&id=in.(${valid.join(',')})`
  );
  const groups = new Map();
  (Array.isArray(data) ? data : []).forEach(row => {
    const attempts = Math.min(MAX_DELIVERY_ATTEMPTS, Number(row.attempts || 0) + 1);
    const status = attempts >= MAX_DELIVERY_ATTEMPTS ? 'dead_letter' : 'failed';
    const key = `${status}:${attempts}`;
    if (!groups.has(key)) groups.set(key, { status, attempts, ids:[] });
    groups.get(key).ids.push(Number(row.id));
  });
  for (const group of groups.values()) {
    const delaySeconds = Math.min(3600, Math.max(60, 60 * (2 ** Math.min(group.attempts - 1, 6))));
    await patchIds(group.ids, {
      status:group.status,
      attempts:group.attempts,
      available_at:new Date(Date.now() + delaySeconds * 1000).toISOString(),
      last_error:clean(errorMessage).slice(0, 2000) || 'Google Sheet nuk e konfirmoi shkrimin.',
    });
  }
  return valid.length;
}

async function stats() {
  try {
    const { data } = await neonRequest(
      'sync_outbox?select=id,status,sheet_name,attempts,last_error,created_at,updated_at,applied_at&order=id.desc&limit=500'
    );
    const rows = Array.isArray(data) ? data : [];
    const counts = rows.reduce((output, row) => {
      output[row.status] = (output[row.status] || 0) + 1;
      return output;
    }, {});
    return {
      available:true,
      counts,
      pending:(counts.pending || 0) + (counts.processing || 0) + (counts.failed || 0),
      deadLetter:counts.dead_letter || 0,
      lastAppliedAt:rows.find(row => row.applied_at)?.applied_at || null,
      lastError:rows.find(row => row.status === 'failed' || row.status === 'dead_letter')?.last_error || null,
    };
  } catch (error) {
    if (missingTable(error)) return { available:false, counts:{}, pending:0, deadLetter:0, lastAppliedAt:null, lastError:null };
    throw error;
  }
}

module.exports = {
  CURRENT_SPREADSHEET_ID,
  MAX_DELIVERY_ATTEMPTS,
  PROCESSING_TIMEOUT_MS,
  buildTargets,
  enqueueEditorRecord,
  pullUpdates,
  acknowledge,
  fail,
  stats,
  _test:{ missingTable, statusLabel, administrationFor, cardTarget, adultTarget, pediatricTarget, outboxRow, numericIds },
};
