'use strict';

const { neonRequest, exactCount } = require('../lib/neon-data-api');

const CURRENT_DOSAGE_SPREADSHEET_ID = '1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo';
const REQUIRED_DOSAGE_SHEETS = Object.freeze(['KARTELA_BARNAVE', 'DOZA_TE_RRITUR', 'DOZA_PEDIATRIKE']);
const STALE_AFTER_MS = 15 * 60 * 1000;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

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
  const codes = states.map(item => item.code);
  if (codes.includes('error')) return { code:'error', label:'Kërkon ndërhyrje', severity:'danger' };
  if (codes.includes('setup_required')) return { code:'setup_required', label:'Aktivizo Apps Script', severity:'warning' };
  if (codes.includes('stale')) return { code:'stale', label:'Sinkronizimi është vonuar', severity:'warning' };
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

async function healthPayload(now = Date.now()) {
  const [drugs, dosageRegimens, icdCodes, labTests, rawSources, editorEvents, recentRuns] = await Promise.all([
    tableCount('drugs'),
    tableCount('dosage_regimens'),
    tableCount('icd_codes'),
    tableCount('lab_tests'),
    list('drive_sync_sources?select=spreadsheet_id,sheet_name,entity_scope,enabled,last_status,last_error,last_synced_at,updated_at&order=spreadsheet_id.asc,sheet_name.asc'),
    list('audit_logs?select=id,entity_type,entity_id,action,changed_by,changed_at&source=eq.clinical_editor&order=changed_at.desc&limit=8'),
    list('sync_runs?select=source_type,target_scope,status,rows_read,rows_inserted,rows_updated,rows_skipped,error_summary,started_at,completed_at&order=started_at.desc&limit=5'),
  ]);

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
        lastError:'Burimi nuk është regjistruar në Neon.',
        lastSyncedAt:null,
        updatedAt:null,
      }
  );
  const dosageState = overallState(dosageSources.map(source => source.state));
  const lastEditorEvent = editorEvents[0] || null;

  return {
    connected:true,
    provider:'neon',
    project:'MedIndex',
    statusVersion:2,
    overall:dosageState,
    counts:{ drugs, dosageRegimens, icdCodes, labTests },
    synchronization:{
      currentSpreadsheetId:CURRENT_DOSAGE_SPREADSHEET_ID,
      appsScriptActivated:dosageState.code !== 'setup_required',
      healthy:dosageState.code === 'healthy',
      staleAfterMinutes:STALE_AFTER_MS / 60000,
      dosageSources,
      allEnabledSources:sources.filter(source => source.enabled),
    },
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

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error:'Lejohet vetëm GET.' });
  }

  try {
    return res.status(200).json(await healthPayload());
  } catch (error) {
    return res.status(503).json({
      connected:false,
      provider:'neon',
      overall:{ code:'error', label:'Neon nuk u lexua', severity:'danger' },
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
  CURRENT_DOSAGE_SPREADSHEET_ID,
  REQUIRED_DOSAGE_SHEETS,
  STALE_AFTER_MS,
};
