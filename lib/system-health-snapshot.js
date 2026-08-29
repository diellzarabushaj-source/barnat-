'use strict';

const { neonRequest, isRelationMissing } = require('./medindex-data-api.js');

const SNAPSHOT_RELATION = 'medindex_system_health_snapshot_v1';
const SNAPSHOT_RPC = 'rpc/medindex_refresh_system_health_snapshot_v1';

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

function missingSnapshot(error) {
  if (isRelationMissing(error)) return true;
  const message = clean(error?.message || error).toLowerCase();
  return message.includes(SNAPSHOT_RELATION)
    || message.includes('medindex_refresh_system_health_snapshot_v1')
    || message.includes('pgrst202')
    || message.includes('pgrst205')
    || message.includes('could not find the function');
}

function normalizeSnapshot(value) {
  const row = Array.isArray(value) ? value[0] || null : value;
  if (!row || typeof row !== 'object') return null;

  const counts = row.counts && typeof row.counts === 'object' ? row.counts : {};
  const syncSources = Array.isArray(row.syncSources)
    ? row.syncSources
    : Array.isArray(row.sync_sources) ? row.sync_sources : [];
  const editorEvents = Array.isArray(row.editorEvents)
    ? row.editorEvents
    : Array.isArray(row.editor_events) ? row.editor_events : [];
  const recentRuns = Array.isArray(row.recentRuns)
    ? row.recentRuns
    : Array.isArray(row.recent_runs) ? row.recent_runs : [];
  const outbox = row.outbox && typeof row.outbox === 'object' ? row.outbox : {};

  return {
    snapshotKey:clean(row.snapshotKey || row.snapshot_key || 'system') || 'system',
    snapshotVersion:Number(row.snapshotVersion ?? row.snapshot_version ?? 1) || 1,
    counts,
    syncSources,
    editorEvents,
    recentRuns,
    outbox,
    dirtyRevision:Number(row.dirtyRevision ?? row.dirty_revision ?? 0) || 0,
    refreshedRevision:Number(row.refreshedRevision ?? row.refreshed_revision ?? 0) || 0,
    dirtyAt:row.dirtyAt || row.dirty_at || null,
    refreshedAt:row.refreshedAt || row.refreshed_at || null,
    refreshDurationMs:Number(row.refreshDurationMs ?? row.refresh_duration_ms ?? 0) || 0,
  };
}

function isDirty(snapshot) {
  return !snapshot
    || !snapshot.refreshedAt
    || snapshot.dirtyRevision > snapshot.refreshedRevision;
}

async function read() {
  try {
    const { data } = await neonRequest(
      `${SNAPSHOT_RELATION}?select=snapshot_key,snapshot_version,counts,sync_sources,editor_events,recent_runs,outbox,dirty_revision,refreshed_revision,dirty_at,refreshed_at,refresh_duration_ms&snapshot_key=eq.system&limit=1`
    );
    return normalizeSnapshot(data);
  } catch (error) {
    if (missingSnapshot(error)) return null;
    throw error;
  }
}

async function refresh() {
  try {
    const { data } = await neonRequest(SNAPSHOT_RPC, {
      method:'POST',
      body:{},
      prefer:'return=representation',
      timeoutMs:12000,
      label:'System health snapshot refresh',
    });
    return normalizeSnapshot(data);
  } catch (error) {
    if (missingSnapshot(error)) return null;
    throw error;
  }
}

async function getFresh() {
  const current = await read();
  if (!isDirty(current)) return { ...current, source:'snapshot' };

  const refreshed = await refresh();
  if (refreshed) return { ...refreshed, source:'snapshot-refreshed' };

  return null;
}

async function refreshBestEffort(label = 'system-health') {
  try {
    const snapshot = await refresh();
    return { ok:Boolean(snapshot), snapshot };
  } catch (error) {
    console.warn(`[${label}] snapshot refresh skipped:`, clean(error?.message || error));
    return { ok:false, snapshot:null, error:clean(error?.message || error) };
  }
}

module.exports = {
  SNAPSHOT_RELATION,
  SNAPSHOT_RPC,
  normalizeSnapshot,
  isDirty,
  read,
  refresh,
  getFresh,
  refreshBestEffort,
  _test:{ clean, missingSnapshot },
};
