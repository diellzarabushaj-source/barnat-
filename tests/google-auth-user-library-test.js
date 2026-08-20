const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function jwt(privateKey, payload, kid = 'medindex-test-key') {
  const header = Buffer.from(JSON.stringify({ alg:'RS256', typ:'JWT', kid }), 'utf8').toString('base64url');
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signingInput = `${header}.${body}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput, 'utf8'), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

(async () => {
  delete process.env.ACCESS_CODE;
  delete process.env.ACCESS_CODE_SCRYPT;
  process.env.SESSION_SECRET = 'medindex-google-auth-test-secret-that-is-private-and-long';
  process.env.GOOGLE_CLIENT_ID = '1234567890-medindex.apps.googleusercontent.com';
  process.env.MEDINDEX_ALLOWED_EMAILS = 'attacker@example.com';

  const authUrl = pathToFileURL(path.join(root, 'lib/auth.mjs')).href;
  const auth = await import(`${authUrl}?google-library=${Date.now()}`);
  assert.equal(auth.googleConfigurationEnabled(), true, 'Google Client ID was not detected');
  assert.equal(auth.secureConfigurationEnabled(), true, 'Google auth should harden the session without a password fallback');

  const identity = {
    uid:'00000000-0000-0000-0000-000000000001',
    sub:'google-subject-123',
    email:'diellzarabushaj@gmail.com',
    role:'editor',
    name:'Diellza Rabushaj',
  };
  const sessionToken = auth.createSessionToken(identity);
  const session = auth.sessionData(sessionToken);
  assert.equal(session.email, identity.email, 'Session email was not bound to the token');
  assert.equal(session.role, 'editor', 'Editor role was not bound to the token');
  assert.equal(session.sub, identity.sub, 'Google subject was not bound to the token');
  assert.equal(auth.verifySessionToken(`${sessionToken}x`), false, 'Tampered session token was accepted');

  const csrf = auth.createCsrfToken();
  const request = { headers:{ cookie:`${auth.CSRF_COOKIE_NAME}=${encodeURIComponent(csrf)}` } };
  assert.equal(auth.verifyCsrfToken(request, csrf), true, 'CSRF double-submit token failed');
  assert.equal(auth.verifyCsrfToken(request, `${csrf}x`), false, 'Invalid CSRF token was accepted');
  const googleNonce = crypto.createHash('sha256').update(csrf, 'utf8').digest('hex');

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength:2048 });
  const jwk = publicKey.export({ format:'jwk' });
  jwk.kid = 'medindex-test-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const now = Math.floor(Date.now() / 1000);
  const googlePayload = {
    iss:'https://accounts.google.com',
    aud:process.env.GOOGLE_CLIENT_ID,
    exp:now + 300,
    iat:now - 5,
    nonce:googleNonce,
    sub:'google-subject-123',
    email:'diellzarabushaj@gmail.com',
    email_verified:true,
    name:'Diellza Rabushaj',
  };
  const { verifyGoogleIdToken } = require('../lib/google-id-token.js');
  const verified = await verifyGoogleIdToken(jwt(privateKey, googlePayload), {
    clientId:process.env.GOOGLE_CLIENT_ID,
    nonce:googleNonce,
    nowSeconds:now,
    jwks:{ keys:[jwk] },
  });
  assert.equal(verified.email, 'diellzarabushaj@gmail.com', 'Verified Google email was not returned');
  assert.equal(verified.sub, 'google-subject-123', 'Verified Google subject was not returned');

  await assert.rejects(
    verifyGoogleIdToken(jwt(privateKey, { ...googlePayload, aud:'other.apps.googleusercontent.com' }), {
      clientId:process.env.GOOGLE_CLIENT_ID,
      nonce:googleNonce,
      nowSeconds:now,
      jwks:{ keys:[jwk] },
    }),
    /nuk i përket MedIndex-it/,
    'Wrong Google audience was accepted',
  );
  await assert.rejects(
    verifyGoogleIdToken(jwt(privateKey, { ...googlePayload, nonce:'wrong' }), {
      clientId:process.env.GOOGLE_CLIENT_ID,
      nonce:googleNonce,
      nowSeconds:now,
      jwks:{ keys:[jwk] },
    }),
    /sigurisë/,
    'Wrong Google nonce was accepted',
  );
  await assert.rejects(
    verifyGoogleIdToken(jwt(privateKey, { ...googlePayload, email_verified:false }), {
      clientId:process.env.GOOGLE_CLIENT_ID,
      nonce:googleNonce,
      nowSeconds:now,
      jwks:{ keys:[jwk] },
    }),
    /nuk është i verifikuar/,
    'Unverified Google email was accepted',
  );

  const UserStore = require('../lib/user-store.js');
  assert.equal(UserStore.isAllowedEmail('diellzarabushaj@gmail.com'), true, 'Owner email is not allowlisted');
  assert.equal(UserStore.roleForEmail('diellzarabushaj@gmail.com'), 'editor', 'Owner is not assigned editor role');
  assert.equal(UserStore.isAllowedEmail('attacker@example.com'), false,
    'legacy environment allowlists must not bypass Supabase profile approval');

  const { encryptJson, decryptJson } = require('../lib/user-data-crypto.js');
  const prescription = {
    id:'rx_test_1',
    patientName:'Pacient Privat',
    diagnosis:'Diagnozë private',
    items:[{ substance:'Paracetamol', strength:'500 mg' }],
    updatedAt:new Date().toISOString(),
  };
  const encrypted = encryptJson(prescription, 'test-user:prescription:rx_test_1');
  const serialized = JSON.stringify(encrypted);
  assert.doesNotMatch(serialized, /Pacient Privat|Diagnozë private|Paracetamol/, 'Prescription plaintext leaked into the encrypted envelope');
  assert.deepEqual(decryptJson(encrypted, 'test-user:prescription:rx_test_1'), prescription, 'Encrypted prescription did not round-trip');
  assert.throws(() => decryptJson(encrypted, 'wrong-context'), /authenticate|valid|unsupported/i, 'Encryption context was not enforced');

  const library = require('../lib/user-library.js');
  const normalized = library._test.normalizedPrescription({ clientId:'rx_test_1', payload:prescription, clientUpdatedAt:prescription.updatedAt });
  assert.equal(normalized.clientId, 'rx_test_1', 'Prescription client ID was not normalized');
  assert.equal(library._test.normalizedFavorite({ entityType:'drug', entityKey:'42|Paracetamol|500 mg' }).entityType, 'drug', 'Drug favorite was not normalized');
  assert.throws(() => library._test.normalizedFavorite({ entityType:'invalid', entityKey:'x' }), /favorit/i, 'Invalid favorite type was accepted');

  const loginHtml = read('login.html');
  const loginJs = read('login.js');
  const authApi = read('api/auth.js');
  const libraryClient = read('user-library-client.js');
  const libraryServer = read('lib/user-library.js');
  const middleware = read('middleware.ts');
  const vercel = read('vercel.json');
  const env = read('.env.example');

  assert.match(loginHtml, /accounts\.google\.com\/gsi\/client/, 'Official Google Identity script is missing');
  assert.match(loginHtml, /diellzarabushaj@gmail\.com/, 'Allowed login email is not shown');
  assert.match(loginJs, /crypto\.subtle\.digest\('SHA-256'/, 'Google nonce is not derived securely from the CSRF state');
  assert.match(loginJs, /nonce,\s*auto_select:false/, 'The SHA-256 nonce is not connected to Google Identity Services');
  assert.match(authApi, /nonce:sha256Hex\(suppliedCsrf\)/, 'Server Google verification is not bound to SHA-256(CSRF)');
  assert.match(authApi, /exchangeGoogleIdToken\(\{ credential, nonce:suppliedCsrf \}\)/, 'Supabase exchange must receive the raw CSRF nonce');
  assert.match(authApi, /verifyGoogleIdToken/, 'Server does not verify the Google ID token');
  assert.match(authApi, /verifyCsrfToken/, 'Auth endpoint does not verify CSRF');
  assert.match(authApi, /UserStore\.ensureUser/, 'Auth endpoint does not enforce the user allowlist');
  assert.match(libraryClient, /regjistriBarnave_protokollet_v1/, 'Legacy prescriptions are not migrated');
  assert.match(libraryClient, /regjistriBarnave_favoritet_v1/, 'Legacy favorites are not migrated');
  assert.match(libraryClient, /tombstones/, 'Deletion tombstones are missing');
  assert.match(libraryClient, /\/api\/user-library/, 'Persistent library API is not used');
  assert.match(libraryServer, /encryptJson/, 'Prescriptions are not encrypted before persistence');
  assert.match(libraryServer, /userFromSession/, 'Library is not scoped to the authenticated user');
  assert.match(middleware, /google-login\.css/, 'Google login stylesheet is not public');
  assert.match(vercel, /accounts\.google\.com\/gsi\/client/, 'CSP does not allow the official Google script');
  assert.match(env, /GOOGLE_CLIENT_ID=/, 'Google Client ID is not documented');
  assert.match(env, /MEDINDEX_USER_DATA_KEY=/, 'User library encryption key is not documented');

  console.log('Google authentication and persistent encrypted user library audit passed.');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
