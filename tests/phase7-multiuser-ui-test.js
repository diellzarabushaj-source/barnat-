'use strict';

// Phase 7 — the screens that make multi-user reachable.
//
// The backend has shipped; these assertions lock the wiring that exposes it:
// the approval panel, the pending-login message, and the personal drug surface.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// --- admin approval panel ------------------------------------------------

{
  const html = read('sistemi.html');
  assert.match(html, /id="systemUsersPanel"/, 'the accounts panel is missing from the system page');
  assert.match(html, /<section[^>]+id="systemUsersPanel"[^>]*\shidden/, 'the accounts panel must start hidden and only appear for an admin');
  assert.match(html, /admin-users\.js\?v=/, 'the accounts panel needs its versioned runtime');
  assert.match(html, /admin-users\.css\?v=/, 'the accounts panel needs its versioned stylesheet');
  assert.match(html, /id="systemUsersRows"/, 'the accounts table body is missing');

  const js = read('admin-users.js');
  assert.match(js, /\/api\/auth\?scope=users/, 'the panel must call the admin users endpoint');
  assert.match(js, /X-CSRF-Token/, 'account changes must carry the CSRF proof the server now requires');
  assert.match(js, /method:'PATCH'/, 'approving an account is a PATCH');
  assert.match(js, /error\.status === 403[\s\S]{0,200}hidden = true/, 'a non-admin must get a hidden panel, not a broken one');
}

// --- the panel follows the TailAdmin design system -----------------------

{
  const css = read('admin-users.css');
  const js = read('admin-users.js');

  for (const token of ['--mi-border', '--mi-surface', '--mi-brand-600', '--mi-text']) {
    assert.ok(css.includes(token), `the admin panel must build on the TailAdmin token ${token}, not on ad-hoc colors`);
  }
  assert.ok(css.includes('--mi-success-50') && css.includes('--mi-warning-50') && css.includes('--mi-error-50'),
    'status badges must use the TailAdmin semantic palette');
  assert.match(css, /html\[data-theme="dark"\]/, 'the panel must follow the shell dark theme');

  assert.match(js, /class="mi-badge/, 'statuses render as TailAdmin badges');
  assert.match(js, /mi-users-action/, 'row actions use the TailAdmin button class');
  assert.ok(!js.includes('system-user-action'), 'the earlier ad-hoc button styling must be gone');
}

// --- pending accounts get a real answer at login ------------------------

{
  const js = read('login.js');
  assert.match(js, /ACCOUNT_PENDING_APPROVAL/, 'login must recognise the pending-approval code');
  assert.match(js, /function showPendingApproval/, 'pending approval needs its own message path, not the generic failure');
  assert.match(js, /pendingApproval\) return;/, 'a pending account must not be able to retry into the same refusal');
}

// --- personal drugs: private by construction ----------------------------

{
  const html = read('index.html');
  assert.match(html, /personal-drugs-ui\.js\?v=/, 'the registry page must load the personal drug surface');
  assert.match(html, /personal-drugs-ui\.css\?v=/, 'the personal drug surface needs its stylesheet');

  const ui = read('personal-drugs-ui.js');
  assert.match(ui, /savePersonalDrug/, 'the form saves through the library API, not straight into storage');
  assert.match(ui, /deletePersonalDrug/, 'entries can be removed');
  assert.match(ui, /Personale · e paverifikuar/, 'a personal entry must be labelled unverified wherever it is shown');
  assert.ok(!ui.includes('localStorage.setItem'), 'the UI must not write library storage directly; that belongs to the sync client');

  // An admin publishing for everyone goes through the admin-gated editor, and the
  // option is never offered to a plain doctor.
  assert.match(ui, /\/api\/clinical-editor/, 'the shared-registry path must go through the clinical editor');
  assert.match(ui, /isAdmin = payload\.authUser\?\.role === 'admin'/, 'the shared option is gated on the verified admin role');
  assert.match(ui, /sharedRow\.hidden = !isAdmin/, 'a doctor must never see the "publish to everyone" control');

  // The launcher must not become another inline item in the mobile navigation:
  // at 320px that pushes the document past the viewport, which the responsive
  // audit rejects.
  assert.ok(!ui.includes('cloneNode'), 'the launcher must not clone a navigation control');
  assert.match(ui, /createElement\('button'\)[\s\S]{0,200}className = 'pd-launch'/, 'the launcher is its own block element, not a cloned nav control');
  const css = read('personal-drugs-ui.css');
  assert.match(css, /\.pd-launch\{[^}]*width:100%/, 'the launcher spans its container instead of adding inline width');
  assert.match(css, /\.pd-launch\{[^}]*box-sizing:border-box/, 'the launcher must not overflow its container');
}

// --- the client sync carries personal drugs -----------------------------

{
  const client = read('user-library-client.js');
  assert.match(client, /const DRUGS_KEY = /, 'personal drugs need their own storage key');
  assert.match(client, /localStorage\.removeItem\(DRUGS_KEY\)/, 'logout must clear personal drugs from the device');
  assert.match(client, /drugs:Object\.entries\(meta\.deletedDrugs\)/, 'deletions must travel as tombstones');
  assert.match(client, /deletedDrugs/, 'drug tombstones need their own meta bucket');
  assert.ok(
    client.includes("['medindex:favorites-changed', 'medindex:notes-changed', 'medindex:personal-note-saved', 'medindex:personal-drugs-changed']"),
    'a personal drug change must schedule a sync like every other personal mutation',
  );
}

console.log('Phase 7 multi-user UI contract passed.');
