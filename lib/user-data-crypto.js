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

function encryptionKey() {
  return Buffer.from(crypto.hkdfSync(
    'sha256',
    Buffer.from(sourceSecret(), 'utf8'),
    Buffer.from('medindex-user-library-salt-v1', 'utf8'),
    Buffer.from('prescriptions-at-rest', 'utf8'),
    32,
  ));
}

function aad(context) {
  return Buffer.from(`${AAD_PREFIX}:${String(context || '')}`, 'utf8');
}

function encryptJson(value, context = '') {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  cipher.setAAD(aad(context));
  const plaintext = Buffer.from(JSON.stringify(value ?? {}), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v:VERSION,
    alg:'A256GCM',
    iv:iv.toString('base64url'),
    tag:tag.toString('base64url'),
    ciphertext:ciphertext.toString('base64url'),
  };
}

function decryptJson(envelope, context = '') {
  if (!envelope || envelope.v !== VERSION || envelope.alg !== 'A256GCM') {
    throw new Error('Formati i bibliotekës së enkriptuar nuk është valid.');
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(String(envelope.iv || ''), 'base64url'),
  );
  decipher.setAAD(aad(context));
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
