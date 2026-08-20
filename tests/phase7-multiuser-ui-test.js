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

// --- the admin dashboard -------------------------------------------------

{
  const html = read('admin.html');
  assert.match(html, /id="adminRows"/, 'the accounts table body is missing from the dashboard');
  assert.match(html, /admin-dashboard\.js\?v=/, 'the dashboard needs its versioned runtime');
  assert.match(html, /admin-dashboard\.css\?v=/, 'the dashboard needs its versioned stylesheet');
  assert.match(html, /id="statPending"[\s\S]{0,600}id="statActive"/, 'the dashboard leads with what needs the admin now');
  assert.match(html, /id="refuseDialog"/, 'refusing a registration must ask for a reason, not happen on one click');

  const js = read('admin-dashboard.js');
  assert.match(js, /\/api\/auth\?scope=users/, 'the dashboard must call the admin users endpoint');
  assert.match(js, /X-CSRF-Token/, 'account changes must carry the CSRF proof the server requires');
  assert.match(js, /method:'PATCH'/, 'approving an account is a PATCH');
  assert.match(js, /payload\.authUser\?\.role !== 'admin'[\s\S]{0,120}location\.replace/,
    'a doctor who opens this URL must be sent away, not shown controls that would fail');
  assert.match(js, /error\.status === 403[\s\S]{0,200}location\.replace/,
    'a refusal from the server must also send a non-admin away');

  // Approval is refused without a document, so the button must say so rather
  // than failing after the click.
  assert.match(js, /const hasDocument = Boolean\(user\.verificationDocument\)/);
  assert.match(js, /disabled:!hasDocument/);

  // The private document is minted server-side with a short life and audited.
  assert.match(js, /scope=verification&document=/, 'the document opens through its signed-URL endpoint');
  assert.ok(!js.includes('storage_path') && !js.includes('storage/v1'),
    'the dashboard must never construct a storage URL itself');

  const css = read('admin-dashboard.css');
  for (const token of ['--mi-border', '--mi-surface', '--mi-brand-600', '--mi-text']) {
    assert.ok(css.includes(token), `the dashboard must build on the TailAdmin token ${token}, not on ad-hoc colors`);
  }
  assert.ok(css.includes('--mi-success-50') && css.includes('--mi-warning-50') && css.includes('--mi-error-50'),
    'status badges must use the TailAdmin semantic palette');
  assert.match(css, /\.mi-table-wrap \{[^}]*max-width: 100%/, 'the wide accounts table must not widen its parent');
  assert.match(css, /\.mi-table-wrap \{[^}]*overflow-x: auto/, 'the wide accounts table scrolls inside its own container');
}

// --- the system page points at the dashboard instead of duplicating it ----

{
  const html = read('sistemi.html');
  assert.match(html, /<section[^>]+id="systemUsersPanel"[^>]*\shidden/, 'the admin entry must start hidden and only appear for an admin');
  assert.match(html, /href="\/admin\.html"/, 'the system page must lead to the dashboard');
  assert.match(html, /admin-entry\.js\?v=/, 'the entry needs its versioned runtime');
  assert.ok(!html.includes('systemUsersRows'),
    'account management lives in one place now; a second half-built table on the system page is exactly the duplication that was removed');

  const entry = read('admin-entry.js');
  assert.match(entry, /payload\.authUser\?\.role !== 'admin'/, 'the entry is revealed only for a verified admin role');
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
