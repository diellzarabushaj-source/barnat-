'use strict';

const crypto = require('node:crypto');
const DriveNeonSync = require('../lib/drive-neon-sync.js');
const SyncOutbox = require('../lib/sync-outbox.js');
const Administration = require('../administration-routes.js');
const { neonRequest } = require('../lib/neon-data-api.js');

const CURRENT_DOSAGE_SPREADSHEET_ID = '17cuXg5qORIIWkvAxLZ7uz2FMmGvzwjr850cubUcIgLE';
const LEGACY_DOSAGE_SPREADSHEET_ID = '1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo';
const DOSAGE_SHEETS = new Set(['KARTELA_BARNAVE', 'DOZA_TE_RRITUR', 'DOZA_PEDIATRIKE']);
const GOOGLE_SYNC_OWNER_EMAIL = 'diellzarabushaj@gmail.com';

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const isoOrEmpty = value => {
  const timestamp = Date.parse(clean(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
};

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch { return {}; }
  }
  return {};
}

function canonicalPayload(payload = {}) {
  return payload;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

async function verifiedGoogleOwner(req, payload = parseBody(req)) {
  const authorization = clean(req.headers?.authorization);
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return '';
  const token = clean(match[1]);
  if (token.length < 40 || token.length > 4096) return '';

  const spreadsheetId = clean(payload.spreadsheetId);
  if (spreadsheetId !== CURRENT_DOSAGE_SPREADSHEET_ID) return '';

  const driveResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}`
      + '?fields=id%2CmimeType%2Cowners(emailAddress)%2Ccapabilities(canEdit)&supportsAllDrives=true',
    { headers:{ Authorization:`Bearer ${token}`, Accept:'application/json' } },
  );
  if (!driveResponse.ok) return '';
  const driveFile = await driveResponse.json().catch(() => ({}));
  const owners = Array.isArray(driveFile.owners)
    ? driveFile.owners.map(item => clean(item?.emailAddress).toLowerCase())
    : [];
  if (driveFile.id !== spreadsheetId) return '';
  if (driveFile.mimeType !== 'application/vnd.google-apps.spreadsheet') return '';
  if (driveFile.capabilities?.canEdit !== true) return '';
  if (!owners.includes(GOOGLE_SYNC_OWNER_EMAIL)) return '';

  const sheetResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`
      + '?fields=spreadsheetId%2Csheets.properties.title',
    { headers:{ Authorization:`Bearer ${token}`, Accept:'application/json' } },
  );
  if (!sheetResponse.ok) return '';
  const metadata = await sheetResponse.json().catch(() => ({}));
  const titles = Array.isArray(metadata.sheets)
    ? metadata.sheets.map(item => clean(item?.properties?.title))
    : [];
  if (metadata.spreadsheetId !== spreadsheetId) return '';
  if (![...DOSAGE_SHEETS].every(title => titles.includes(title))) return '';
  return GOOGLE_SYNC_OWNER_EMAIL;
}

async function bootstrapSecret(req, res, payload) {
  const email = await verifiedGoogleOwner(req, payload);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!email) return res.status(401).json({ ok:false, error:'Autorizimi Google nuk u verifikua.' });

  const secret = crypto.randomBytes(36).toString('base64url');
  const secretHash = crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
  const now = new Date().toISOString();
  await neonRequest(
    `drive_sync_sources?spreadsheet_id=eq.${encodeURIComponent(CURRENT_DOSAGE_SPREADSHEET_ID)}`
      + `&sheet_name=in.(${[...DOSAGE_SHEETS].join(',')})`,
    {
      method:'PATCH',
      body:{ auth_secret_hash:secretHash, enabled:true, last_status:'pending', last_error:null, updated_at:now },
      prefer:'return=minimal',
    },
  );
  return res.status(200).json({ ok:true, secret, owner:email, expires:'stored_by_apps_script_only' });
}

async function verifiedSecret(req, payload = parseBody(req)) {
  const received = clean(req.headers?.['x-medindex-sync-secret']);
  if (received.length < 24) return '';
  const spreadsheetId = clean(payload.spreadsheetId);
  const sheetName = clean(payload.sheetName);
  if (!spreadsheetId || !sheetName) return '';
  const path = `drive_sync_sources?select=auth_secret_hash,enabled,entity_scope`
    + `&spreadsheet_id=eq.${encodeURIComponent(spreadsheetId)}`
    + `&sheet_name=eq.${encodeURIComponent(sheetName)}&limit=1`;
  const { data } = await neonRequest(path);
  const source = Array.isArray(data) ? data[0] : null;
  if (!source || source.enabled !== true || !source.auth_secret_hash) return '';
  const suppliedHash = crypto.createHash('sha256').update(received, 'utf8').digest('hex');
  return safeEqual(suppliedHash, source.auth_secret_hash) ? { secret:received, source } : '';
}

async function setCurrentSourceStatus(payload, status, error = null) {
  const spreadsheetId = clean(payload?.spreadsheetId);
  const sheetName = clean(payload?.sheetName);
  if (spreadsheetId !== CURRENT_DOSAGE_SPREADSHEET_ID || !DOSAGE_SHEETS.has(sheetName)) return;
  const now = new Date().toISOString();
  await neonRequest(
    `drive_sync_sources?spreadsheet_id=eq.${encodeURIComponent(spreadsheetId)}`
      + `&sheet_name=eq.${encodeURIComponent(sheetName)}`,
    {
      method:'PATCH',
      body:{
        last_status:status,
        last_error:error ? clean(error).slice(0, 2000) : null,
        last_synced_at:status === 'synced' ? now : undefined,
        updated_at:now,
      },
      prefer:'return=minimal',
    },
  );
}

function editorValues(scope, audit) {
  const next = audit?.new_data || {};
  const drug = next.drug || {};
  const adult = next.dosage?.adult || {};
  const pediatric = next.dosage?.pediatric || {};
  const profile = next.profile || {};
  const registryNumber = Number(drug.registryNumber);
  if (!Number.isInteger(registryNumber) || registryNumber < 1) return null;

  const administration = Administration.inferAdministration({
    form:drug.pharmaceuticalForm,
    route:[adult.route, pediatric.route].filter(Boolean).join(' '),
    administrationCategory:drug.administrationCategory,
    allowedRoutes:drug.allowedRoutes,
  });
  const category = clean(drug.administrationCategory || administration.category);
  const allowedRoutes = Administration.routeTokens(
    [drug.allowedRoutes, adult.route, pediatric.route, administration.routes].flat().filter(Boolean).join(' '),
  ).join('; ');

  if (scope === 'drugs') {
    return {
      rowKey:String(registryNumber),
      values:{
        'Nr rendor':registryNumber,
        'Emri tregtar':clean(drug.tradeName),
        'Substanca aktive':clean(drug.activeSubstance),
        'ATC Code':clean(drug.atcCode),
        'Klasa / Çka është':clean(drug.drugClass),
        'Përdorimi (fjalë kyçe)':clean(drug.useText),
        'Fortësia':clean(drug.strength),
        'Forma farmaceutike':clean(drug.pharmaceuticalForm),
        'Madhësia e paketimit':clean(drug.packaging),
        'Kategoria e administrimit':category,
        'Rrugët e lejuara':allowedRoutes,
      },
    };
  }

  if (scope === 'dosage_cards') {
    return {
      rowKey:String(registryNumber),
      values:{
        'Nr rendor':registryNumber,
        'Emri tregtar':clean(drug.tradeName),
        'Substanca aktive':clean(drug.activeSubstance),
        'ATC':clean(drug.atcCode),
        'Forma':clean(drug.pharmaceuticalForm),
        'Fortësia':clean(drug.strength),
        'Përdorimi':clean(profile.indicationsText),
        'Doza e plotë — Të rritur':clean(adult.dose),
        'Rruga — Të rritur':clean(adult.route),
        'Doza e plotë — Fëmijë':clean(pediatric.dose),
        'Rruga — Fëmijë':clean(pediatric.route),
        'Burimi URL':clean(adult.sourceUrl || pediatric.sourceUrl || (profile.sourceUrls || [])[0]),
        'Statusi':profile.verificationStatus === 'verified' ? 'VERIFIKUAR' : 'NË PUNË',
        'Publiko?':adult.verified || pediatric.verified ? 'PO' : 'JO',
        'Shënim auditimi':[clean(adult.notes), clean(pediatric.notes), clean(profile.editorialNotes)].filter(Boolean).join(' | '),
        'Kategoria e administrimit':category,
        'Rrugët e lejuara':allowedRoutes,
      },
    };
  }

  return null;
}

async function pullEditorUpdates(res, payload, source) {
  const cursor = isoOrEmpty(payload.cursor) || new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const outbox = await SyncOutbox.pullUpdates({
    spreadsheetId:payload.spreadsheetId,
    sheetName:payload.sheetName,
    limit:100,
  });
  if (outbox.available) {
    return res.status(200).json({
      ok:true,
      source:source.entity_scope,
      mode:'outbox',
      updates:outbox.updates,
      nextCursor:cursor,
    });
  }

  if (!['drugs', 'dosage_cards'].includes(source.entity_scope)) {
    return res.status(200).json({ ok:true, source:source.entity_scope, mode:'audit_fallback', updates:[], nextCursor:cursor });
  }

  const path = `audit_logs?select=${encodeURIComponent('id,new_data,changed_at')}`
    + `&source=eq.clinical_editor&action=eq.editor_update`
    + `&changed_at=gt.${encodeURIComponent(cursor)}`
    + `&order=${encodeURIComponent('changed_at.asc,id.asc')}&limit=100`;
  const { data } = await neonRequest(path);
  const audits = Array.isArray(data) ? data : [];
  const updates = audits.flatMap(audit => {
    const mapped = editorValues(source.entity_scope, audit);
    return mapped ? [{ ...mapped, auditId:audit.id, changedAt:audit.changed_at }] : [];
  });
  const nextCursor = audits.length ? audits[audits.length - 1].changed_at : cursor;
  return res.status(200).json({ ok:true, source:source.entity_scope, mode:'audit_fallback', updates, nextCursor });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return DriveNeonSync.handle(req, res);
  try {
    const payload = parseBody(req);
    if (clean(payload.action) === 'bootstrap_secret') return bootstrapSecret(req, res, payload);
    const verification = await verifiedSecret(req, payload);
    if (!verification) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(401).json({ ok:false, error:'Çelësi i sinkronizimit nuk është valid.' });
    }

    const action = clean(payload.action);
    if (action === 'pull_editor_updates') {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return pullEditorUpdates(res, payload, verification.source);
    }
    if (action === 'ack_editor_updates') {
      const acknowledged = await SyncOutbox.acknowledge(payload.outboxIds);
      return res.status(200).json({ ok:true, acknowledged });
    }
    if (action === 'fail_editor_updates') {
      const failed = await SyncOutbox.fail(payload.outboxIds, payload.error);
      return res.status(200).json({ ok:true, failed });
    }

    const previousSecret = process.env.MEDINDEX_DRIVE_SYNC_SECRET;
    const previousBody = req.body;
    process.env.MEDINDEX_DRIVE_SYNC_SECRET = verification.secret;
    req.body = canonicalPayload(payload);
    try {
      await setCurrentSourceStatus(payload, 'syncing');
      const result = await DriveNeonSync.handle(req, res);
      const successful = Number(res.statusCode || 200) >= 200 && Number(res.statusCode || 200) < 300;
      await setCurrentSourceStatus(payload, successful ? 'synced' : 'failed', successful ? null : 'Sinkronizimi u refuzua nga API-ja.');
      return result;
    } catch (error) {
      await setCurrentSourceStatus(payload, 'failed', error.message).catch(() => {});
      throw error;
    } finally {
      req.body = previousBody;
      if (previousSecret === undefined) delete process.env.MEDINDEX_DRIVE_SYNC_SECRET;
      else process.env.MEDINDEX_DRIVE_SYNC_SECRET = previousSecret;
    }
  } catch (error) {
    console.error('Drive sync authorization failed:', error);
    return res.status(500).json({ ok:false, error:'Autorizimi i sinkronizimit dështoi.' });
  }
};

module.exports._test = {
  parseBody,
  canonicalPayload,
  safeEqual,
  verifiedSecret,
  verifiedGoogleOwner,
  bootstrapSecret,
  editorValues,
  isoOrEmpty,
  CURRENT_DOSAGE_SPREADSHEET_ID,
  LEGACY_DOSAGE_SPREADSHEET_ID,
};
