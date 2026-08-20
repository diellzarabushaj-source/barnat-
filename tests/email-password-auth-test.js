'use strict';

// The second door into MedIndex: email and password.
//
// It must be exactly as narrow as the Google one. A password never grants
// access on its own — it establishes who is asking, and the profile still has to
// be approved. These assertions guard the parts that would quietly widen it.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
process.env.MEDINDEX_SUPABASE_PUBLISHABLE_KEY = process.env.MEDINDEX_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_test';
process.env.MEDINDEX_SUPABASE_URL = 'https://project.supabase.co';

const Password = require(path.join(ROOT, 'lib/supabase-password-auth.js'));

function gotrueStub(handler) {
  return async (url, options = {}) => {
    const result = handler(String(url), options);
    return {
      ok:result.status < 400,
      status:result.status,
      text:async () => JSON.stringify(result.body ?? {}),
    };
  };
}

(async () => {

// --- input is validated before anything reaches Supabase ------------------

{
  for (const email of ['', 'nuk-eshte-email', 'a@b', 'a b@c.com', '@nope.com']) {
    assert.throws(
      () => Password._test.normalizedEmail(email),
      error => error.code === 'EMAIL_INVALID',
      `"${email}" must not be accepted as an email`,
    );
  }
  assert.equal(Password._test.normalizedEmail('  Doctor@Example.COM '), 'doctor@example.com',
    'an address is normalized once, at the edge');

  assert.throws(() => Password._test.assertPassword('short'), error => error.code === 'PASSWORD_TOO_WEAK');
  assert.throws(() => Password._test.assertPassword('aaaaaaaaaaaa'), error => error.code === 'PASSWORD_TOO_WEAK',
    'length alone must not carry a password made of one repeated character');
  assert.throws(() => Password._test.assertPassword('x'.repeat(500)), error => error.code === 'PASSWORD_TOO_LONG');
  assert.equal(Password._test.assertPassword('Recepta-2026!'), 'Recepta-2026!');
  assert.ok(Password.MIN_PASSWORD_CHARS >= 10, 'a clinical registry asks for more than the GoTrue default of six');
}

// --- signup never says whether the address already exists -----------------

{
  const calls = [];
  const fetchImpl = gotrueStub((url, options) => {
    calls.push({ url, body:JSON.parse(options.body) });
    return { status:200, body:{ user:{ id:'11111111-2222-4333-8444-555555555555', email:'doctor@example.com' } } };
  });

  const created = await Password.signUp(
    { email:'Doctor@Example.com', password:'Recepta-2026!', fullName:'Arta Krasniqi' },
    { fetchImpl },
  );
  assert.equal(created.email, 'doctor@example.com');
  assert.equal(created.confirmationRequired, true, 'an unconfirmed account must be told to confirm its email');
  assert.match(calls[0].url, /\/auth\/v1\/signup$/);
  assert.equal(calls[0].body.data.full_name, 'Arta Krasniqi');

  // Supabase answers 200 for an address that already exists. The result must be
  // indistinguishable from a fresh signup, or the form becomes a way to test
  // which clinicians have accounts.
  const repeated = await Password.signUp({ email:'doctor@example.com', password:'Recepta-2026!' }, { fetchImpl });
  assert.deepEqual(
    { ...repeated, userId:'' },
    { ...created, userId:'', accessToken:repeated.accessToken },
    'a repeated signup must look exactly like a first one',
  );
}

// --- a confirmed signup is reported as complete ---------------------------

{
  const fetchImpl = gotrueStub(() => ({
    status:200,
    body:{ user:{ id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', email_confirmed_at:'2026-08-20T10:00:00Z' }, access_token:'token' },
  }));
  const created = await Password.signUp({ email:'doctor@example.com', password:'Recepta-2026!' }, { fetchImpl });
  assert.equal(created.confirmationRequired, false);
}

// --- sign-in maps upstream refusals to something a person can act on ------

{
  const cases = [
    { status:400, body:{ error_code:'invalid_credentials' }, code:'INVALID_CREDENTIALS', status_out:401 },
    { status:400, body:{ error_code:'email_not_confirmed' }, code:'EMAIL_NOT_CONFIRMED', status_out:403 },
    { status:429, body:{ msg:'too many requests' }, code:'AUTH_RATE_LIMITED', status_out:429 },
    { status:500, body:{ msg:'boom' }, code:'AUTH_UPSTREAM_ERROR', status_out:503 },
  ];
  for (const item of cases) {
    const fetchImpl = gotrueStub(() => ({ status:item.status, body:item.body }));
    await assert.rejects(
      Password.signIn({ email:'doctor@example.com', password:'Recepta-2026!' }, { fetchImpl }),
      error => error.code === item.code && error.status === item.status_out,
      `${item.status} must surface as ${item.code}`,
    );
  }
}

// --- a successful sign-in returns only an access token, never a session ---

{
  const fetchImpl = gotrueStub(url => ({
    status:200,
    body:{
      access_token:'supabase-access-token',
      user:{ id:'11111111-2222-4333-8444-555555555555', email:'doctor@example.com', user_metadata:{ full_name:'Arta Krasniqi' } },
    },
    url,
  }));
  const signedIn = await Password.signIn({ email:'doctor@example.com', password:'Recepta-2026!' }, { fetchImpl });
  assert.equal(signedIn.accessToken, 'supabase-access-token');
  assert.equal(signedIn.userId, '11111111-2222-4333-8444-555555555555');
  assert.equal(signedIn.fullName, 'Arta Krasniqi');
  assert.ok(!Object.hasOwn(signedIn, 'role'), 'the password module never decides a role');
  assert.ok(!Object.hasOwn(signedIn, 'status'), 'the password module never decides whether an account is approved');

  // A response with no token is a refusal however cheerful its status code.
  const tokenless = gotrueStub(() => ({ status:200, body:{ user:{ id:'x' } } }));
  await assert.rejects(
    Password.signIn({ email:'doctor@example.com', password:'Recepta-2026!' }, { fetchImpl:tokenless }),
    error => error.code === 'INVALID_CREDENTIALS',
  );
}

// --- a password reset is equally silent about who exists ------------------

{
  const fetchImpl = gotrueStub(() => ({ status:400, body:{ error_code:'user_not_found' } }));
  const result = await Password.requestPasswordReset({ email:'nobody@example.com' }, { fetchImpl });
  assert.equal(result.ok, true, 'an unknown address gets the same answer as a known one');

  const limited = gotrueStub(() => ({ status:429, body:{} }));
  await assert.rejects(
    Password.requestPasswordReset({ email:'doctor@example.com' }, { fetchImpl:limited }),
    error => error.code === 'AUTH_RATE_LIMITED',
    'rate limiting is the one refusal worth surfacing, because retrying will not help',
  );
}

// --- the session layer treats both Supabase doors identically -------------

{
  const auth = await import(path.join(ROOT, 'lib/auth.mjs'));
  assert.deepEqual([...auth.SUPABASE_PROVIDERS], ['supabase-google', 'supabase-password']);

  const edge = fs.readFileSync(path.join(ROOT, 'lib/auth-edge.mjs'), 'utf8');
  for (const provider of auth.SUPABASE_PROVIDERS) {
    assert.ok(edge.includes(`'${provider}'`),
      `the edge session check must know about ${provider}; a provider it does not know is rejected there and accepted in the function`);
  }
  // Whatever the edge accepts as a Supabase session, it must demand the same
  // proof it demands of Google: an auth UUID, an approved role, an active status.
  assert.match(edge, /provider === 'supabase-google' \|\| provider === 'supabase-password'/);

  for (const file of ['lib/admin-access.js', 'lib/user-store.js']) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(source, /'supabase-google', 'supabase-password'/,
      `${file} must accept an email-authenticated Supabase session on the same terms as a Google one`);
  }
}

// --- the login route keeps the password door behind every existing gate ---

{
  const route = fs.readFileSync(path.join(ROOT, 'api/auth.js'), 'utf8');
  assert.match(route, /if \(canonicalIdentity\.status === 'pending'\) \{\s*attempts\.delete\(ip\);\s*return pendingEnrollment\(res, canonicalIdentity\);/,
    'an email-authenticated pending account must reach the same enrollment gate as a Google one');
  assert.match(route, /provider = 'supabase-password';/);
  assert.match(route, /error\.code === 'INVALID_CREDENTIALS'[\s\S]{0,200}state\.count \+= 1/,
    'a wrong password must cost a rate-limit attempt, or the email door is the soft one');
  assert.ok(
    route.indexOf('approvedSupabaseUser') < route.indexOf("provider = 'supabase-google'"),
    'both doors go through the same approval helper rather than duplicating it',
  );
  assert.match(route, /SupabaseAuth\.assertActive\(canonicalIdentity\);/,
    'no session is ever issued without asserting the profile is active');
}

console.log('Email and password authentication contract passed.');

})().catch(error => {
  console.error(error);
  process.exit(1);
});
