'use strict';

const crypto = require('node:crypto');
const DriveNeonSync = require('../lib/drive-neon-sync.js');
const { neonRequest } = require('../lib/neon-data-api.js');

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

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
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

function editorValues(scope, audit) {
  const next = audit?.new_data || {};
  const drug = next.drug || {};
  const registryNumber = Number(drug.registryNumber);
  if (!Number.isInteger(registryNumber) || registryNumber < 1) return null;

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
      },
    };
  }

  if (scope === 'dosage_cards') {
    const adult = next.dosage?.adult || {};
    const pediatric = next.dosage?.pediatric || {};
    const profile = next.profile || {};
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
      },
    };
  }

  return null;
}

async function pullEditorUpdates(req, res, payload, source) {
  const cursor = isoOrEmpty(payload.cursor) || new Date(Date.now() - 5 * 60 * 1000).toISOString();
  if (!['drugs', 'dosage_cards'].includes(source.entity_scope)) {
    return res.status(200).json({ ok:true, updates:[], nextCursor:cursor });
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
  return res.status(200).json({ ok:true, source:source.entity_scope, updates, nextCursor });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return DriveNeonSync.handle(req, res);
  try {
    const payload = parseBody(req);
    const verification = await verifiedSecret(req, payload);
    if (!verification) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(401).json({ ok:false, error:'Çelësi i sinkronizimit nuk është valid.' });
    }

    if (clean(payload.action) === 'pull_editor_updates') {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return pullEditorUpdates(req, res, payload, verification.source);
    }

    const previous = process.env.MEDINDEX_DRIVE_SYNC_SECRET;
    process.env.MEDINDEX_DRIVE_SYNC_SECRET = verification.secret;
    try { return await DriveNeonSync.handle(req, res); }
    finally {
      if (previous === undefined) delete process.env.MEDINDEX_DRIVE_SYNC_SECRET;
      else process.env.MEDINDEX_DRIVE_SYNC_SECRET = previous;
    }
  } catch (error) {
    console.error('Drive sync authorization failed:', error);
    return res.status(500).json({ ok:false, error:'Autorizimi i sinkronizimit dështoi.' });
  }
};

module.exports._test = { parseBody, safeEqual, verifiedSecret, editorValues, isoOrEmpty };
