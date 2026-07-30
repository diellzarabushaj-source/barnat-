'use strict';

const crypto = require('node:crypto');

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const FETCH_TIMEOUT_MS = 6000;
const MAX_TOKEN_CHARS = 12000;
let cachedJwks = null;
let cachedUntil = 0;
let jwksPromise = null;

class GoogleTokenError extends Error {
  constructor(message, code = 'GOOGLE_TOKEN_INVALID') {
    super(message);
    this.code = code;
  }
}

function decodeJsonPart(value) {
  try {
    return JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'));
  } catch {
    throw new GoogleTokenError('Google ktheu një token të pavlefshëm.');
  }
}

function cacheMaxAge(headers) {
  const match = String(headers?.get?.('cache-control') || '').match(/max-age=(\d+)/i);
  return match ? Math.max(60, Math.min(86400, Number(match[1]) || 300)) : 300;
}

async function fetchGoogleJwks() {
  if (cachedJwks && Date.now() < cachedUntil) return cachedJwks;
  if (!jwksPromise) {
    jwksPromise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(GOOGLE_JWKS_URL, {
          headers:{ Accept:'application/json' },
          cache:'no-store',
          signal:controller.signal,
        });
        if (!response.ok) throw new GoogleTokenError('Çelësat publikë të Google nuk u morën.', 'GOOGLE_KEYS_UNAVAILABLE');
        const payload = await response.json();
        if (!Array.isArray(payload?.keys) || !payload.keys.length) {
          throw new GoogleTokenError('Google nuk ktheu çelësa publikë.', 'GOOGLE_KEYS_UNAVAILABLE');
        }
        cachedJwks = payload;
        cachedUntil = Date.now() + cacheMaxAge(response.headers) * 1000;
        return payload;
      } catch (error) {
        if (error instanceof GoogleTokenError) throw error;
        throw new GoogleTokenError('Verifikimi me Google nuk u përgjigj me kohë.', 'GOOGLE_KEYS_UNAVAILABLE');
      } finally {
        clearTimeout(timer);
      }
    })().finally(() => { jwksPromise = null; });
  }
  return jwksPromise;
}

function audienceMatches(audience, clientId) {
  return Array.isArray(audience) ? audience.includes(clientId) : audience === clientId;
}

function verifyClaims(payload, { clientId, nonce, nowSeconds = Math.floor(Date.now() / 1000) }) {
  if (!GOOGLE_ISSUERS.has(payload?.iss)) throw new GoogleTokenError('Lëshuesi i tokenit Google nuk është valid.');
  if (!audienceMatches(payload?.aud, clientId)) throw new GoogleTokenError('Tokeni Google nuk i përket MedIndex-it.');
  if (!Number.isFinite(payload?.exp) || payload.exp <= nowSeconds) throw new GoogleTokenError('Hyrja me Google ka skaduar.');
  if (Number.isFinite(payload?.iat) && payload.iat > nowSeconds + 90) throw new GoogleTokenError('Koha e tokenit Google nuk është valide.');
  if (nonce && payload?.nonce !== nonce) throw new GoogleTokenError('Kontrolli i sigurisë së Google nuk përputhet.', 'GOOGLE_CSRF');
  if (!payload?.sub || typeof payload.sub !== 'string') throw new GoogleTokenError('Identifikuesi i llogarisë Google mungon.');
  const email = String(payload?.email || '').trim().toLowerCase();
  if (!email || payload?.email_verified !== true) throw new GoogleTokenError('Email-i Google nuk është i verifikuar.');
  return {
    sub:payload.sub,
    email,
    name:String(payload.name || '').trim().slice(0, 160),
    picture:String(payload.picture || '').trim().slice(0, 1000),
  };
}

async function verifyGoogleIdToken(token, options = {}) {
  const credential = String(token || '').trim();
  const clientId = String(options.clientId || '').trim();
  if (!clientId) throw new GoogleTokenError('Google Client ID mungon në server.', 'GOOGLE_NOT_CONFIGURED');
  if (!credential || credential.length > MAX_TOKEN_CHARS) throw new GoogleTokenError('Google ktheu një credential të pavlefshëm.');
  const parts = credential.split('.');
  if (parts.length !== 3) throw new GoogleTokenError('Google ktheu një token të pavlefshëm.');
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodeJsonPart(headerPart);
  const payload = decodeJsonPart(payloadPart);
  if (header.alg !== 'RS256' || !header.kid) throw new GoogleTokenError('Algoritmi i tokenit Google nuk lejohet.');

  const jwks = options.jwks || await fetchGoogleJwks();
  const jwk = jwks.keys?.find(item => item.kid === header.kid && item.kty === 'RSA' && (!item.alg || item.alg === 'RS256'));
  if (!jwk) {
    if (!options.jwks) {
      cachedUntil = 0;
      cachedJwks = null;
    }
    throw new GoogleTokenError('Çelësi publik i tokenit Google nuk u gjet.', 'GOOGLE_KEYS_UNAVAILABLE');
  }

  let publicKey;
  try {
    publicKey = crypto.createPublicKey({ key:jwk, format:'jwk' });
  } catch {
    throw new GoogleTokenError('Çelësi publik i Google nuk u lexua.', 'GOOGLE_KEYS_UNAVAILABLE');
  }

  const verified = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerPart}.${payloadPart}`, 'utf8'),
    publicKey,
    Buffer.from(signaturePart, 'base64url'),
  );
  if (!verified) throw new GoogleTokenError('Nënshkrimi i tokenit Google nuk është valid.');
  return verifyClaims(payload, options);
}

module.exports = {
  verifyGoogleIdToken,
  GoogleTokenError,
  _test:{
    verifyClaims,
    decodeJsonPart,
    audienceMatches,
    resetCache() { cachedJwks = null; cachedUntil = 0; jwksPromise = null; },
  },
};
