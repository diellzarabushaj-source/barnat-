'use strict';

// The two doors a clinician actually walks through: the login card and the
// registration page.
//
// The rules that matter here are the ones a redesign could quietly break — a
// document uploaded without the identity the server demands, a registration page
// that needs a session to reach, a title whose required proof is left implicit.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

// --- registration is reachable without a session ------------------------

{
  const middleware = read('middleware.ts');
  for (const asset of ['/regjistrimi.html', '/regjistrimi.js', '/auth-shell.css', '/login-email.css']) {
    assert.ok(
      middleware.includes(`'${asset}'`),
      `${asset} must be public: the person registering has no session yet and will not have one until an admin approves`,
    );
  }
}

// --- the registration page asks for everything the server requires -------

{
  const html = read('regjistrimi.html');
  for (const id of ['firstName', 'lastName', 'titleChoices', 'specialty', 'documentInput', 'profileSubmit']) {
    assert.match(html, new RegExp(`id="${id}"`), `the registration form is missing #${id}`);
  }
  assert.match(html, /accept="application\/pdf,image\/jpeg,image\/png"/,
    'the picker must offer only the three types the server accepts, not every file on the device');
  assert.match(html, /id="signupEmail"[\s\S]{0,400}id="signupPassword"/,
    'an account can be created with an email, not only with Google');
  assert.match(html, /minlength="10"/, 'the password floor shown must match the one the server enforces');
  assert.match(html, /<a href="\/login-v2\.html">/,
    'someone who already has an account must be able to leave for the canonical login page');
  assert.ok(!html.includes('href="/login.html"'),
    'registration must not route users back to the retired login surface');

  const js = read('regjistrimi.js');
  assert.match(js, /scope=verification/, 'registration submits through the verification endpoint');
  assert.match(js, /firstName,\s*\n\s*lastName,\s*\n\s*professionalTitle:title\.value,/,
    'the document must travel together with the identity it belongs to; the server refuses one without the other');
  assert.match(js, /action:'signup'/, 'the email signup path must exist');
  assert.match(read('login.js'), /action:'reset'/, 'a person who forgot their password needs a way out, from the login card');
}

// --- the title decides the proof, and says so -----------------------------

{
  const js = read('regjistrimi.js');
  // The catalogue is served by the API so the form and the server can never
  // disagree about which document a title owes.
  assert.match(js, /titles = Array\.isArray\(status\.titles\)/,
    'the title list must come from the server, not be hard-coded in the page');
  assert.match(js, /Duhet të ngarkosh: \$\{escapeHtml\(title\.proof\)\}/,
    'each title must state the document it requires, before anything is uploaded');
  assert.match(js, /title\?\.specialtyRequired/,
    'the specialty field must follow the chosen title rather than always being shown');

  const verification = read('lib/professional-verification.js');
  assert.match(verification, /student:\{ documentKind:'id'/);
  assert.match(verification, /mjek:\{ documentKind:'diplome'/);
  assert.match(verification, /specialist:\{ documentKind:'licence'[^}]*specialtyRequired:true/);
  assert.match(verification, /specializant:\{ documentKind:'licence'/);
}

// --- login carries both doors, and no longer claims one account ----------

{
  for (const file of ['login.html', 'login-v2.html']) {
    const html = read(file);
    assert.match(html, /id="emailLoginForm"/, `${file}: the email door is missing`);
    assert.match(html, /id="loginEmail"[\s\S]{0,600}id="loginPassword"/, `${file}: email and password fields are missing`);
    assert.match(html, /href="\/regjistrimi\.html"/, `${file}: a new clinician must be able to find registration`);
    assert.match(html, /login-email\.css\?v=/, `${file}: the email form needs its versioned stylesheet`);
    assert.ok(
      !html.includes('Lejohet vetëm diellzarabushaj@gmail.com'),
      `${file}: MedIndex is multi-user now; the single-account claim is false and must not be shown`,
    );
    assert.ok(
      !/Vazhdo me llogarinë e aprovuar Google\./.test(html),
      `${file}: the card copy must not describe Google as the only way in`,
    );
  }
}

// --- an unapproved account is sent to registration, not left stranded ----

{
  const js = read('login.js');
  assert.match(js, /if \(payload\.verificationRequired\) \{[\s\S]{0,400}location\.assign\('\/regjistrimi\.html'\)/,
    'an account that still owes a document must be taken to the page that collects it');
  assert.match(js, /submitCredential\(\{ email, password:value \}, 'email'\)/,
    'the email form must post an email and a password');

  // The old inline uploader sent a file with no name, title or specialty. The
  // server now refuses exactly that, so it must be gone rather than left to fail.
  for (const symbol of ['verificationPanel', 'submitProfessionalVerification']) {
    assert.ok(!js.includes(symbol),
      `login.js must not keep ${symbol}: it uploads a document without the identity the server requires`);
  }
}

// --- the auth shell follows the TailAdmin tokens -------------------------

{
  const css = read('auth-shell.css');
  for (const token of ['--mi-border', '--mi-surface', '--mi-brand-600', '--mi-text', '--mi-muted']) {
    assert.ok(css.includes(token), `the auth shell must build on the TailAdmin token ${token}, not on ad-hoc colors`);
  }
  assert.match(css, /@media \(min-width: 1024px\)/, 'the brand panel appears only where there is room for it');
  assert.match(css, /\.mi-input, \.mi-select \{ font-size: 16px; \}/,
    'inputs must reach 16px on small screens, or iOS Safari zooms the viewport on focus and never zooms back');

  const email = read('login-email.css');
  assert.match(email, /\.login-email-input \{ font-size: 16px; \}/, 'the same iOS zoom rule applies to the login card');
  assert.ok(email.includes('--mi-brand-600'), 'the email form must follow the shell palette');
}

console.log('Registration and login UI contract passed.');
