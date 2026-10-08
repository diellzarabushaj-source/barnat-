'use strict';

const crypto = require('node:crypto');

const VERSION = 1;
const ALGORITHM = 'aes-256-gcm';
const AAD_PREFIX = 'medindex-user-library-v1';

function sourceSecret() {
  const value = String(
    process.env.MEDINDEX_USER_DATA_KEY
    || process.env.SESSION_SECRET
    || process.env.MEDINDEX_SESSION_SECRET
    || ''
  ).trim();
  if (value.length < 32) throw new Error('Mungon çelësi privat për ruajtjen e bibliotekës së përdoruesit.');
  return value;
}

function encryptionKey(secret = sourceSecret()) {
  return Buffer.from(crypto.hkdfSync(
    'sha256',
    Buffer.from(secret, 'utf8'),
    Buffer.from('medindex-user-library-salt-v1', 'utf8'),
    Buffer.from('prescriptions-at-rest', 'utf8'),
    32,
  ));
}

function aad(context, keyId = '') {
  return Buffer.from(`${keyId ? 'medindex-user-library-v2:' + keyId : AAD_PREFIX}:${String(context || '')}`, 'utf8');
}

function keyring() {
  const currentId = String(process.env.MEDINDEX_USER_DATA_KEY_ID || '').trim();
  const current = String(process.env.MEDINDEX_USER_DATA_KEY || '').trim();
  let previous;
  try { previous = JSON.parse(process.env.MEDINDEX_USER_DATA_PREVIOUS_KEYS || '{}'); }
  catch { throw new Error('Konfigurimi i çelësave të bibliotekës është i pavlefshëm.'); }
  if (!previous || Array.isArray(previous) || typeof previous !== 'object' || Object.keys(previous).length > 8) throw new Error('Konfigurimi i çelësave të bibliotekës është i pavlefshëm.');
  const validId = id => /^[a-zA-Z0-9_-]{1,64}$/.test(id);
  for (const [id,secret] of Object.entries(previous)) {
    if (!validId(id) || typeof secret !== 'string' || secret.trim().length < 32 || id === currentId) throw new Error('Konfigurimi i çelësave të bibliotekës është i pavlefshëm.');
    previous[id] = secret.trim();
  }
  if (currentId && (!validId(currentId) || current.length < 32)) throw new Error('Çelësi i dedikuar i bibliotekës nuk është konfiguruar.');
  if (process.env.MEDINDEX_USER_DATA_REQUIRE_DEDICATED === '1' && !currentId) throw new Error('Çelësi i dedikuar i bibliotekës nuk është konfiguruar.');
  return {currentId,current,previous};
}

function encryptJson(value, context = '') {
  const keys = keyring();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(keys.currentId ? keys.current : sourceSecret()), iv);
  cipher.setAAD(aad(context,keys.currentId));
  const plaintext = Buffer.from(JSON.stringify(value ?? {}), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v:keys.currentId ? 2 : VERSION,
    ...(keys.currentId ? {kid:keys.currentId} : {}),
    alg:'A256GCM',
    iv:iv.toString('base64url'),
    tag:tag.toString('base64url'),
    ciphertext:ciphertext.toString('base64url'),
  };
}

function decryptJson(envelope, context = '') {
  if (!envelope || ![VERSION,2].includes(envelope.v) || envelope.alg !== 'A256GCM') {
    throw new Error('Formati i bibliotekës së enkriptuar nuk është valid.');
  }
  const keys = keyring();
  if (envelope.v === 2) {
    if (typeof envelope.kid !== 'string') throw new Error('Identifikuesi i çelësit të bibliotekës është i pavlefshëm.');
    const secret = envelope.kid === keys.currentId ? keys.current : Object.hasOwn(keys.previous,envelope.kid) ? keys.previous[envelope.kid] : '';
    if (!secret) throw new Error('Çelësi i këtij versioni të bibliotekës nuk është i disponueshëm.');
    return decryptWithKey(envelope,context,secret,envelope.kid);
  }
  // Existing v1 records remain readable during an explicit, staged rotation.
  const candidates = [...new Set([keys.current,...Object.values(keys.previous),process.env.SESSION_SECRET,process.env.MEDINDEX_SESSION_SECRET].filter(key => typeof key === 'string' && key.trim().length >= 32).map(key => key.trim()))];
  let failure;
  for (const secret of candidates) { try { return decryptWithKey(envelope,context,secret); } catch(error) { failure = error; } }
  throw failure || new Error('Çelësi privat i bibliotekës nuk është i disponueshëm.');
}

function decryptWithKey(envelope, context, secret, keyId = '') {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    encryptionKey(secret),
    Buffer.from(String(envelope.iv || ''), 'base64url'),
  );
  decipher.setAAD(aad(context,keyId));
  decipher.setAuthTag(Buffer.from(String(envelope.tag || ''), 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(String(envelope.ciphertext || ''), 'base64url')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

module.exports = {
  encryptJson,
  decryptJson,
  _test:{ encryptionKey },
};
