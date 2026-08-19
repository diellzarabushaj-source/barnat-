'use strict';

const crypto = require('node:crypto');
const { verifyGoogleIdToken } = require('../lib/google-id-token.js');
const { exchangeGoogleIdToken, SupabaseBootstrapError } = require('../lib/supabase-auth-bootstrap.js');
const SupabaseAuth = require('../lib/supabase-auth.js');

const MAX_BODY_BYTES = 20 * 1024;

function sameOrigin(req) {
  const origin = String(req.headers?.origin || '').trim();
  if (!origin) return true;
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').trim();
  try { return Boolean(host) && new URL(origin).host === host; }
  catch { return false; }
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const raw = typeof req.body === 'string' ? req.body : '';
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) throw Object.assign(new Error('BODY_TOO_LARGE'), { code:'BODY_TOO_LARGE' });
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error:'Metoda nuk lejohet.' });
  }
  if (!sameOrigin(req)) return res.status(403).json({ code:'ORIGIN_INVALID', error:'Origjina e kërkesës nuk lejohet.' });
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return res.status(415).json({ code:'CONTENT_TYPE_INVALID', error:'Kërkohet Content-Type application/json.' });
  }

  try {
    const auth = await import('../lib/auth.mjs');
    const body = await readBody(req);
    const rawNonce = String(req.headers['x-csrf-token'] || body.csrfToken || '').trim();
    const credential = String(body.credential || '').trim();
    if (!auth.verifyCsrfToken(req, rawNonce)) {
      return res.status(403).json({ code:'CSRF_INVALID', error:'Kontrolli i sigurisë skadoi. Rifresko faqen.' });
    }
    if (!auth.googleConfigurationEnabled()) {
      return res.status(503).json({ code:'GOOGLE_NOT_CONFIGURED', error:'Google Client ID nuk është konfiguruar në server.' });
    }

    // The Phase 4 browser sends SHA-256(raw nonce) to Google. Supabase receives
    // the raw nonce and hashes it internally, while our direct Google verifier
    // checks the nonce claim exactly against the hashed value.
    const googleIdentity = await verifyGoogleIdToken(credential, {
      clientId:auth.googleClientId(),
      nonce:sha256Hex(rawNonce),
    });

    const exchanged = await exchangeGoogleIdToken({ credential, nonce:rawNonce });
    if (exchanged.user.email !== googleIdentity.email) {
      return res.status(409).json({ code:'AUTH_IDENTITY_MISMATCH', error:'Google dhe Supabase kthyen identitete të ndryshme.' });
    }

    const identity = await SupabaseAuth.requireDoctor({
      headers:{ authorization:`Bearer ${exchanged.accessToken}` },
    });
    if (identity.email !== googleIdentity.email || identity.id !== exchanged.user.id) {
      return res.status(409).json({ code:'PROFILE_IDENTITY_MISMATCH', error:'Profili MedIndex nuk përputhet me identitetin Supabase.' });
    }

    return res.status(200).json({
      ok:true,
      user:{ id:identity.id, email:identity.email, role:identity.role, status:identity.status },
      message:'Supabase Auth + profile + doctor guard u verifikuan me sukses.',
    });
  } catch (error) {
    console.error('Phase 4 Auth bootstrap:', error?.code || error?.message || error);
    if (error?.code === 'BODY_TOO_LARGE') return res.status(413).json({ code:error.code, error:'Kërkesa është tepër e madhe.' });
    if (error instanceof SupabaseBootstrapError || error instanceof SupabaseAuth.SupabaseAuthError) {
      return res.status(Number(error.status) || 400).json({ code:error.code, error:error.message });
    }
    if (/^GOOGLE_/.test(String(error?.code || ''))) {
      return res.status(error.code === 'GOOGLE_KEYS_UNAVAILABLE' ? 503 : 401).json({ code:error.code, error:error.message });
    }
    return res.status(400).json({ code:'PHASE4_BOOTSTRAP_FAILED', error:'Testi i Supabase Auth nuk u përfundua.' });
  }
};

module.exports._test = { sameOrigin, sha256Hex, MAX_BODY_BYTES };
