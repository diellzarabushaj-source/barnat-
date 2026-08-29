'use strict';

const { neonRequest, exactCount } = require('../lib/medindex-data-api');
const SyncOutbox = require('../lib/sync-outbox.js');
const IcdPublicSource = require('../lib/icd-public-source.js');
const IcdHealth = require('../lib/icd-health-audit.js');
const SystemHealthSnapshot = require('../lib/system-health-snapshot.js');

const CURRENT_DOSAGE_SPREADSHEET_ID = '1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo';
const REQUIRED_DOSAGE_SHEETS = Object.freeze(['KARTELA_BARNAVE', 'DOZA_TE_RRITUR', 'DOZA_PEDIATRIKE']);
const STALE_AFTER_MS = 15 * 60 * 1000;
const PEDIATRIC_EXPORT_MIN = 501;
const PEDIATRIC_EXPORT_MAX = 4012;
const PEDIATRIC_EXPORT_LIMIT = 250;
const PEDIATRIC_EXPORT_FIELDS = Object.freeze([
  'pediatric_dose_summary',
  'pediatric_indication',
  'pediatric_use_status',
  'pediatric_min_age_value',
  'pediatric_min_age_unit',
  'pediatric_max_age_value',
  'pediatric_max_age_unit',
  'pediatric_min_weight_kg',
  'pediatric_max_weight_kg',
  'pediatric_dose_min',
  'pediatric_dose_max',
  'pediatric_dose_unit',
  'pediatric_dose_basis',
  'pediatric_doses_per_day',
  'pediatric_interval_hours',
  'pediatric_max_single_value',
  'pediatric_max_single_unit',
  'pediatric_max_daily_value',
  'pediatric_max_daily_unit',
  'pediatric_route',
  'pediatric_restriction',
  'pediatric_concentration_value',
  'pediatric_concentration_unit',
  'pediatric_concentration_per_value',
  'pediatric_concentration_per_unit',
  'pediatric_source_url',
  'pediatric_source_section',
  'pediatric_verification_status',
  'pediatric_verified_at',
  'pediatric_primary_regimen_id',
]);

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const cleanTsv = value => String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();

async function tableCount(table) {
  const { response } = await neonRequest(`${table}?select=id&limit=1`, {
    headers:{ Range:'0-0', 'Range-Unit':'items' },
    prefer:'count=exact',
  });
  return exactCount(response);
}

async function list(path) {
  const { data } = await neonRequest(path);
  return Array.isArray(data) ? data : [];
}

function timestamp(value) {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceState(source, now = Date.now()) {
  if (!source?.enabled) return { code:'disabled', label:'I çaktivizuar', severity:'neutral' };
  if (clean(source.last_status).toLowerCase() === 'failed') {
    return { code:'error', label:'Gabim', severity:'danger' };
  }
  if (clean(source.last_status).toLowerCase() === 'syncing') {
    return { code:'syncing', label:'Po sinkronizohet', severity:'info' };
  }
  const lastSynced = timestamp(source.last_synced_at);
  if (!lastSynced) return { code:'setup_required', label:'Kërkon aktivizim', severity:'warning' };
  const ageMs = Math.max(0, now - lastSynced);
  if (ageMs > STALE_AFTER_MS) return { code:'stale', label:'I vonuar', severity:'warning', ageMs };
  return { code:'healthy', label:'Në rregull', severity:'success', ageMs };
}

function overallState(states) {
  const codes = states.map(item => item?.code).filter(Boolean);
  if (codes.includes('error')) return { code:'error', label:'Kërkon ndërhyrje', severity:'danger' };
  if (codes.includes('setup_required')) return { code:'setup_required', label:'Aktivizo Apps Script', severity:'warning' };
  if (codes.includes('stale')) return { code:'stale', label:'Një burim është vonuar', severity:'warning' };
  if (codes.includes('warning')) return { code:'warning', label:'Kontrollo sistemin', severity:'warning' };
  if (codes.includes('syncing')) return { code:'syncing', label:'Po sinkronizohet', severity:'info' };
  if (states.length && codes.every(code => code === 'healthy')) return { code:'healthy', label:'Të gjitha në rregull', severity:'success' };
  return { code:'warning', label:'Kontrollo konfigurimin', severity:'warning' };
}

function publicSource(source, now = Date.now()) {
  const state = sourceState(source, now);
  return {
    spreadsheetId:source.spreadsheet_id,
    sheetName:source.sheet_name,
    entityScope:source.entity_scope,
    enabled:source.enabled === true,
    status:clean(source.last_status) || 'pending',
    state,
    lastError:clean(source.last_error) || null,
    lastSyncedAt:source.last_synced_at || null,
    updatedAt:source.updated_at || null,
  };
}

async function liveDatabaseHealth() {
  const [drugs, dosageRegimens, icdCodes, labTests, rawSources, editorEvents, recentRuns, outbox] = await Promise.all([
    tableCount('drugs'),
    tableCount('dosage_regimens'),
    tableCount('icd_codes'),
    tableCount('lab_tests'),
    list('drive_sync_sources?select=spreadsheet_id,sheet_name,entity_scope,enabled,last_status,last_error,last_synced_at,updated_at&order=spreadsheet_id.asc,sheet_name.asc'),
    list('audit_logs?select=id,entity_type,entity_id,action,changed_by,changed_at&source=eq.clinical_editor&order=changed_at.desc&limit=8'),
    list('sync_runs?select=source_type,target_scope,status,rows_read,rows_inserted,rows_updated,rows_skipped,error_summary,started_at,completed_at&order=started_at.desc&limit=5'),
    SyncOutbox.stats(),
  ]);

  return {
    source:'live-fallback',
    snapshotVersion:0,
    refreshedAt:null,
    refreshDurationMs:null,
    dirtyRevision:null,
    refreshedRevision:null,
    counts:{ drugs, dosageRegimens, icdCodes, labTests },
    rawSources,
    editorEvents,
    recentRuns,
    outbox,
  };
}

async function databaseHealth(options = {}) {
  const snapshot = options.forceSnapshot === true
    ? await SystemHealthSnapshot.refresh()
    : await SystemHealthSnapshot.getFresh();
  if (!snapshot) return liveDatabaseHealth();

  return {
    source:snapshot.source || 'snapshot',
    snapshotVersion:snapshot.snapshotVersion || 1,
    refreshedAt:snapshot.refreshedAt || null,
    refreshDurationMs:Number(snapshot.refreshDurationMs) || 0,
    dirtyRevision:Number(snapshot.dirtyRevision) || 0,
    refreshedRevision:Number(snapshot.refreshedRevision) || 0,
    counts:{
      drugs:Number(snapshot.counts?.drugs) || 0,
      dosageRegimens:Number(snapshot.counts?.dosageRegimens) || 0,
      icdCodes:Number(snapshot.counts?.icdCodes) || 0,
      labTests:Number(snapshot.counts?.labTests) || 0,
    },
    rawSources:Array.isArray(snapshot.syncSources) ? snapshot.syncSources : [],
    editorEvents:Array.isArray(snapshot.editorEvents) ? snapshot.editorEvents : [],
    recentRuns:Array.isArray(snapshot.recentRuns) ? snapshot.recentRuns : [],
    outbox:snapshot.outbox && typeof snapshot.outbox === 'object'
      ? snapshot.outbox
      : { available:false, counts:{}, pending:0, deadLetter:0, lastAppliedAt:null, lastError:null },
  };
}

async function healthPayload(now = Date.now(), options = {}) {
  const [database, icd] = await Promise.all([
    databaseHealth(options),
    IcdHealth.loadHealth(IcdPublicSource, now),
  ]);

  const {
    counts,
    rawSources,
    editorEvents,
    recentRuns,
    outbox,
  } = database;

  const sources = rawSources.map(source => publicSource(source, now));
  const dosageSources = REQUIRED_DOSAGE_SHEETS.map(sheetName =>
    sources.find(source => source.spreadsheetId === CURRENT_DOSAGE_SPREADSHEET_ID && source.sheetName === sheetName)
      || {
        spreadsheetId:CURRENT_DOSAGE_SPREADSHEET_ID,
        sheetName,
        entityScope:null,
        enabled:false,
        status:'missing',
        state:{ code:'setup_required', label:'Burimi mungon', severity:'danger' },
        lastError:'Burimi nuk është regjistruar në databazë.',
        lastSyncedAt:null,
        updatedAt:null,
      }
  );
  const dosageState = overallState(dosageSources.map(source => source.state));
  const platformState = overallState([dosageState, icd.state]);
  const lastEditorEvent = editorEvents[0] || null;

  return {
    connected:true,
    provider:'supabase',
    project:'MedIndex',
    statusVersion:5,
    overall:platformState,
    counts,
    databaseSnapshot:{
      source:database.source,
      version:database.snapshotVersion,
      refreshedAt:database.refreshedAt,
      refreshDurationMs:database.refreshDurationMs,
      dirtyRevision:database.dirtyRevision,
      refreshedRevision:database.refreshedRevision,
      current:database.dirtyRevision === null
        || database.refreshedRevision === null
        || database.dirtyRevision <= database.refreshedRevision,
    },
    synchronization:{
      state:dosageState,
      currentSpreadsheetId:CURRENT_DOSAGE_SPREADSHEET_ID,
      appsScriptActivated:dosageState.code !== 'setup_required',
      healthy:dosageState.code === 'healthy',
      staleAfterMinutes:STALE_AFTER_MS / 60000,
      dosageSources,
      allEnabledSources:sources.filter(source => source.enabled),
      outbox,
    },
    icd,
    editor:{
      available:true,
      lastChangeAt:lastEditorEvent?.changed_at || null,
      recentChanges:editorEvents.map(event => ({
        id:event.id,
        entityType:event.entity_type,
        entityId:event.entity_id,
        action:event.action,
        changedBy:event.changed_by,
        changedAt:event.changed_at,
      })),
    },
    recentImports:recentRuns.map(run => ({
      sourceType:run.source_type,
      targetScope:run.target_scope,
      status:run.status,
      rowsRead:run.rows_read,
      rowsInserted:run.rows_inserted,
      rowsUpdated:run.rows_updated,
      rowsSkipped:run.rows_skipped,
      error:clean(run.error_summary) || null,
      startedAt:run.started_at,
      completedAt:run.completed_at,
    })),
    checkedAt:new Date(now).toISOString(),
  };
}

function exportInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

async function pediatricMasterExport(req, res) {
  const start = exportInteger(req.query?.start);
  const end = exportInteger(req.query?.end);
  if (start === null || end === null || start < PEDIATRIC_EXPORT_MIN || end > PEDIATRIC_EXPORT_MAX || end < start || (end - start + 1) > PEDIATRIC_EXPORT_LIMIT) {
    return res.status(400).send(`Use start/end inside ${PEDIATRIC_EXPORT_MIN}-${PEDIATRIC_EXPORT_MAX}, maximum ${PEDIATRIC_EXPORT_LIMIT} rows.`);
  }

  const select = ['registry_number', ...PEDIATRIC_EXPORT_FIELDS].join(',');
  const path = `drugs?select=${encodeURIComponent(select)}&registry_number=gte.${start}&registry_number=lte.${end}&order=registry_number.asc&limit=${PEDIATRIC_EXPORT_LIMIT}`;
  const { data } = await neonRequest(path, { timeoutMs:12000, label:'Pediatric master export' });
  const rows = Array.isArray(data) ? data : [];
  const expected = end - start + 1;
  if (rows.length !== expected) return res.status(409).send(`Expected ${expected} rows, received ${rows.length}.`);
  for (let index = 0; index < rows.length; index += 1) {
    if (Number(rows[index].registry_number) !== start + index) {
      return res.status(409).send(`Registry sequence mismatch at ${start + index}.`);
    }
  }

  const tsv = rows.map(row => PEDIATRIC_EXPORT_FIELDS.map(field => cleanTsv(row[field])).join('\t')).join('\n');
  res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-MedIndex-Migration', 'pediatric-master-20260817');
  return res.status(200).send(tsv);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error:'Lejohet vetëm GET.' });
  }

  try {
    if (String(req.query?.pediatricMasterExport || '') === '1') return await pediatricMasterExport(req, res);
    const forceSnapshot = String(req.query?.refresh || '') === '1';
    return res.status(200).json(await healthPayload(Date.now(), { forceSnapshot }));
  } catch (error) {
    if (String(req.query?.pediatricMasterExport || '') === '1') {
      console.error('[pediatric-master-export]', error);
      return res.status(503).send('Pediatric master export unavailable.');
    }
    return res.status(503).json({
      connected:false,
      provider:'supabase',
      overall:{ code:'error', label:'Supabase nuk u lexua', severity:'danger' },
      error:clean(error.message || error),
      checkedAt:new Date().toISOString(),
    });
  }
};

module.exports._test = {
  sourceState,
  overallState,
  publicSource,
  healthPayload,
  databaseHealth,
  liveDatabaseHealth,
  CURRENT_DOSAGE_SPREADSHEET_ID,
  REQUIRED_DOSAGE_SHEETS,
  STALE_AFTER_MS,
};
