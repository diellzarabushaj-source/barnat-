'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  process.env.SESSION_SECRET = 'professional-verification-test-secret-32-characters';
  process.env.MEDINDEX_SUPABASE_SECRET_KEY = 'sb_secret_test_only';

  const ROOT = path.resolve(__dirname, '..');
  const dataApiPath = require.resolve('../lib/neon-data-api.js');
  const adminAccessPath = require.resolve('../lib/admin-access.js');
  const verificationPath = require.resolve('../lib/professional-verification.js');
  const originalDataApi = require.cache[dataApiPath];
  const originalAdminAccess = require.cache[adminAccessPath];
  const requests = [];
  let rpcFailure = null;
  let adminFailure = null;

  require.cache[dataApiPath] = {
    id:dataApiPath, filename:dataApiPath, loaded:true,
    exports:{
      neonRequest:async (requestPath, options = {}) => {
        requests.push({ path:requestPath, options });
        if (requestPath.startsWith('profiles?select=id,status,verification_status')) {
          return { data:[{ id:'11111111-2222-4333-8444-555555555555', status:'pending', verification_status:'missing' }] };
        }
        if (requestPath === 'rpc/record_professional_verification') {
          if (rpcFailure) throw rpcFailure;
          return { data:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' };
        }
        if (requestPath.startsWith('verification_documents?select=id,user_id,storage_path')) {
          return { data:[{
            id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            user_id:'11111111-2222-4333-8444-555555555555',
            storage_path:'11111111-2222-4333-8444-555555555555/2026/document.pdf',
            original_filename:'licenca.pdf', mime_type:'application/pdf',
          }] };
        }
        if (requestPath === 'audit_logs') return { data:null };
        return { data:[] };
      },
    },
  };
  require.cache[adminAccessPath] = {
    id:adminAccessPath, filename:adminAccessPath, loaded:true,
    exports:{
      requireAdminSession:async () => {
        if (adminFailure) throw adminFailure;
        return { authUid:'99999999-8888-4777-8666-555555555555', email:'admin@example.com', name:'Admin' };
      },
    },
  };
  delete require.cache[verificationPath];
  const Verification = require('../lib/professional-verification.js');
  const auth = await import(`${pathToFileURL(path.join(ROOT, 'lib/auth.mjs')).href}?professional=${Date.now()}`);

  const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n%%EOF', 'ascii');
  const decoded = Verification._test.decodeDocument({
    filename:'../../Licenca: Mjekut.pdf', mimeType:'application/pdf', base64:pdf.toString('base64'),
  });
  assert.equal(decoded.mimeType, 'application/pdf');
  assert.equal(decoded.extension, 'pdf');
  assert.equal(decoded.originalFilename, 'Licenca_ Mjekut.pdf');
  assert.match(decoded.sha256Hex, /^[a-f0-9]{64}$/);
  assert.equal(Verification._test.serverHeaders().Authorization, 'Bearer sb_secret_test_only',
    'private Storage requests must authenticate with the server secret');

  assert.throws(
    () => Verification._test.decodeDocument({ filename:'virus.pdf', mimeType:'application/pdf', base64:Buffer.from('MZ executable').toString('base64') }),
    error => error.code === 'DOCUMENT_SIGNATURE_INVALID' && error.status === 415,
    'an executable renamed to PDF must fail magic-byte validation',
  );
  assert.throws(
    () => Verification._test.decodeDocument({ filename:'page.svg', mimeType:'image/svg+xml', base64:'PHN2Zz4=' }),
    error => error.code === 'DOCUMENT_TYPE_INVALID',
    'active image formats must not be accepted',
  );
  assert.throws(
    () => Verification._test.decodeDocument({ filename:'bad.pdf', mimeType:'application/pdf', base64:'%%%=' }),
    error => error.code === 'DOCUMENT_BASE64_INVALID',
  );

  const userId = '11111111-2222-4333-8444-555555555555';
  const enrollment = auth.createEnrollmentToken({ authUid:userId, email:'doctor@example.com' });
  assert.equal(auth.sessionData(enrollment), null, 'an enrollment proof can never become an application session');
  assert.equal(auth.enrollmentData(enrollment).authUid, userId);
  assert.equal(auth.enrollmentData(enrollment, Date.now() + (auth.ENROLLMENT_TTL_SECONDS + 1) * 1000), null,
    'enrollment proof expires after fifteen minutes');

  const fetchCalls = [];
  const fetchImpl = async (url, options = {}) => {
    fetchCalls.push({ url, options });
    return {
      ok:true, status:200,
      text:async () => url.includes('/sign/')
        ? JSON.stringify({ signedURL:'/object/sign/professional-verifications/file?token=short-lived' })
        : '{}',
    };
  };
  const request = {
    headers:{
      cookie:`medindex_enrollment=${encodeURIComponent(enrollment)}; medindex_csrf=csrf-proof`,
      'x-csrf-token':'csrf-proof', 'content-type':'application/json',
    },
    body:{
      filename:'licenca.pdf', mimeType:'application/pdf', base64:pdf.toString('base64'),
      firstName:'Arta', lastName:'Krasniqi', professionalTitle:'specialist', specialty:'Kardiologji',
    },
  };
  const uploaded = await Verification.uploadVerification(request, { fetchImpl });
  assert.equal(uploaded.status, 'submitted');
  const uploadCall = fetchCalls.find(call => call.options.method === 'POST' && !call.url.includes('/sign/'));
  assert.ok(uploadCall.url.includes('/storage/v1/object/professional-verifications/'));
  assert.ok(!uploadCall.url.includes('/public/'), 'verification uploads never use a public object URL');
  assert.equal(uploadCall.options.headers['x-upsert'], 'false');
  const rpcOf = () => requests.filter(item => item.path === 'rpc/record_professional_verification').at(-1).options.body;
  const rpc = requests.find(item => item.path === 'rpc/record_professional_verification');
  assert.equal(rpc.options.body.p_user_id, userId);
  assert.equal(rpc.options.body.p_byte_size, pdf.length);
  assert.ok(!Object.hasOwn(rpc.options.body, 'base64'), 'database stores metadata and hash, never file bytes');
  assert.equal(rpc.options.body.p_full_name, 'Arta Krasniqi');
  assert.equal(rpc.options.body.p_professional_title, 'specialist');
  assert.equal(rpc.options.body.p_specialty, 'Kardiologji');
  assert.equal(rpc.options.body.p_document_kind, 'licence',
    'the proof a specialist owes is a licence, and the server decides that — not the form');

  // The title decides the document, so the client never gets to name the kind.
  // Each of these is a registration a crafted request could otherwise smuggle
  // through: a claim with no proof behind it.
  const withBody = extra => ({ ...request, body:{ ...request.body, ...extra } });
  await assert.rejects(
    Verification.uploadVerification(withBody({ professionalTitle:'kirurg' }), { fetchImpl }),
    error => error.code === 'PROFESSIONAL_TITLE_INVALID',
    'a title outside the catalogue is refused',
  );
  await assert.rejects(
    Verification.uploadVerification(withBody({ specialty:'' }), { fetchImpl }),
    error => error.code === 'SPECIALTY_REQUIRED',
    'a specialist must name a specialty',
  );
  await assert.rejects(
    Verification.uploadVerification(withBody({ firstName:'A' }), { fetchImpl }),
    error => error.code === 'FULL_NAME_REQUIRED',
    'a one-letter name is not a name',
  );
  await Verification.uploadVerification(withBody({ documentKind:'id' }), { fetchImpl });
  assert.equal(rpcOf().p_document_kind, 'licence',
    'a client-supplied document kind is ignored; the title decides the proof');

  // A refused registration must not leave a file behind in private storage.
  const beforeRejected = fetchCalls.length;
  await assert.rejects(Verification.uploadVerification(withBody({ professionalTitle:'' }), { fetchImpl }));
  assert.equal(
    fetchCalls.slice(beforeRejected).filter(call => call.options.method === 'POST').length, 0,
    'identity is validated before anything is written to storage',
  );

  const studentRequest = withBody({ professionalTitle:'student', specialty:'' });
  await Verification.uploadVerification(studentRequest, { fetchImpl });
  assert.equal(rpcOf().p_document_kind, 'id', 'a student proves enrolment with an ID');
  assert.equal(rpcOf().p_specialty, '', 'a student carries no specialty');

  await Verification.uploadVerification(withBody({ professionalTitle:'mjek', specialty:'' }), { fetchImpl });
  assert.equal(rpcOf().p_document_kind, 'diplome', 'a doctor proves qualification with a diploma');

  rpcFailure = new Error('database unavailable');
  await assert.rejects(Verification.uploadVerification(request, { fetchImpl }), /database unavailable/);
  assert.ok(fetchCalls.some(call => call.options.method === 'DELETE'),
    'an object is deleted if its transactional metadata write fails');
  rpcFailure = null;

  const signed = await Verification.signedDocument({}, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', { fetchImpl });
  assert.equal(signed.expiresIn, 60);
  assert.match(signed.url, /token=short-lived/);
  assert.ok(requests.some(item => item.path === 'audit_logs' && item.options.body?.[0]?.action === 'verification_document_signed_url_created'),
    'every admin signed-URL creation is audited');

  adminFailure = Object.assign(new Error('Administrator required'), { status:403, code:'ADMIN_REQUIRED' });
  await assert.rejects(
    Verification.signedDocument({}, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', { fetchImpl }),
    error => error.code === 'ADMIN_REQUIRED' && error.status === 403,
    'a non-admin cannot create a signed verification URL',
  );

  const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260820081645_professional_verification_hardening.sql'), 'utf8');
  assert.match(migration, /'professional-verifications'[\s\S]*?false/i, 'the verification bucket is private');
  assert.match(migration, /verification_documents_direct_access_denied[\s\S]*?using \(false\)/i);
  assert.match(migration, /PROFESSIONAL_DOCUMENT_REQUIRED/);
  assert.match(migration, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(migration, /grant execute[\s\S]*?to service_role/i);
  assert.match(migration, /professional_verification_submitted/);
  assert.match(migration, /admin_user_review/);

  const activeGuardMigration = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260820082755_active_profiles_require_verified_document.sql'), 'utf8');
  assert.match(activeGuardMigration, /profiles_require_verified_document_before_active/);
  assert.match(activeGuardMigration, /new\.status = 'active' and new\.verification_status <> 'verified'/);
  assert.match(activeGuardMigration, /PROFESSIONAL_DOCUMENT_REQUIRED/);

  const adminUsers = fs.readFileSync(path.join(ROOT, 'lib/admin-users.js'), 'utf8');
  assert.match(adminUsers, /rpc\/review_medindex_registration/,
    'admin approval is a single transactional database operation');
  assert.ok(!/neonRequest\(`profiles\?id=eq\.[\s\S]*method:'PATCH'/.test(adminUsers),
    'admin approval no longer performs a non-transactional direct profile patch');
  const authRoute = fs.readFileSync(path.join(ROOT, 'api/auth.js'), 'utf8');
  assert.match(authRoute, /createEnrollmentToken/);
  assert.match(authRoute, /PROFESSIONAL_VERIFICATION_REQUIRED/);
  assert.match(authRoute, /expiredSessionCookie\(\)[\s\S]*enrollmentCookie/,
    'pending registration clears any application session before issuing enrollment proof');

  if (originalDataApi) require.cache[dataApiPath] = originalDataApi; else delete require.cache[dataApiPath];
  if (originalAdminAccess) require.cache[adminAccessPath] = originalAdminAccess; else delete require.cache[adminAccessPath];
  delete require.cache[verificationPath];

  console.log('Professional verification, private storage and transactional approval tests passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
