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

// --- the standalone admin console ---------------------------------------

{
  const html = read('admin.html');
  assert.match(html, /id="adminGate"/, 'the admin console must start behind its access gate');
  assert.match(html, /id="adminRows"/, 'the accounts table body is missing from the admin console');
  assert.match(html, /id="drugRows"/, 'the shared drug editor is missing from the admin console');
  assert.match(html, /admin-entry-guard\.js\?v=/, 'the admin console must load its versioned access guard first');
  assert.match(html, /admin-dashboard\.css\?v=/, 'the admin console needs its versioned stylesheet');
  assert.match(html, /data-view="overview"[\s\S]*data-view="drugs"[\s\S]*data-view="users"/,
    'the standalone console must expose overview, drug and user workspaces');
  assert.match(html, /id="refuseDialog"/, 'refusing a registration must ask for a reason, not happen on one click');

  const guard = read('admin-entry-guard.js');
  assert.match(guard, /\/api\/auth/, 'the admin entry guard must verify the current server session');
  // The named-administrator gate is still explicit — it just lives on the server
  // now, in `AdminAccess.isAdminEmail`, and is reported to the page as
  // `authUser.adminConsole`. A copy of the address list in the browser would
  // lock out a co-administrator the server allows, and could never be the thing
  // enforcing it anyway.
  assert.match(guard, /payload\.authUser\?\.adminConsole !== true/,
    'the admin entry guard must reject any session the server does not clear for the console');
  assert.ok(!guard.includes('diellzarabushaj@gmail.com'),
    'the guard must read the server verdict rather than carrying its own address list');
  assert.match(read('api/auth.js'), /adminConsole:session\.authRole === 'admin'/,
    'the server must be the one deciding who may open the console');
  assert.match(guard, /admin-dashboard\.js\?v=/,
    'the dashboard runtime must load only after the access guard runs');
  assert.match(guard, /admin-login\.html\?return=%2Fadmin/,
    'unauthenticated admin access must use the dedicated admin login');

  const js = read('admin-dashboard.js');
  assert.match(js, /\/api\/auth\?scope=users/, 'the dashboard must call the admin users endpoint');
  assert.match(js, /\/api\/clinical-editor/, 'the drug workspace must use the admin-gated clinical editor');
  assert.match(js, /X-CSRF-Token/, 'account changes must carry the CSRF proof the server requires');
  assert.match(js, /method:'PATCH'/, 'approving an account is a PATCH');
  assert.match(js, /authUser\?\.adminConsole\s*!==\s*true/,
    'the dashboard runtime keeps its own gate as defense in depth, on the server verdict');
  assert.ok(!js.includes('diellzarabushaj@gmail.com'),
    'the dashboard must not carry its own address list either');
  assert.match(js, /verification&document=/, 'the document opens through its signed-URL endpoint');
  assert.ok(!js.includes('storage_path') && !js.includes('storage/v1'),
    'the dashboard must never construct a storage URL itself');
  assert.ok(!js.includes('scope=library') && !js.includes('/api/user-library'),
    'the admin console must not expose doctors’ private notes or prescriptions');

  const css = read('admin-dashboard.css');
  // The console was rebuilt on the DRx/Stripe palette and owns its tokens under
  // the --stripe-* prefix; it no longer inherits the clinical --mi-* set. What
  // this guards is unchanged: a named token system rather than ad-hoc colors,
  // including semantic status colors.
  for (const token of ['--stripe-hairline', '--stripe-canvas', '--stripe-ink', '--stripe-primary']) {
    assert.ok(css.includes(token), `the admin console must keep the shared design token ${token}`);
  }
  assert.ok(css.includes('--stripe-success') && css.includes('--stripe-warning') && css.includes('--stripe-danger'),
    'status surfaces must use semantic colors');
  assert.match(css, /\.mi-table-wrap\{[^}]*max-width:100%/, 'wide admin tables must not widen their parent');
  assert.match(css, /\.mi-table-wrap\{[^}]*overflow-x:auto/, 'wide admin tables scroll inside their own container');

  const login = read('admin-login.html');
  assert.match(login, /MedIndex Admin|Admin Console/, 'admin login must be a dedicated administrative surface');
  assert.ok(!login.includes('Modules') && !login.includes('Plan') && !login.includes('Blog'),
    'admin login must not reuse the public marketing navigation');
}

// --- the system page points at the dashboard instead of duplicating it ----

{
  const html = read('sistemi.html');
  assert.match(html, /<section[^>]+id="systemUsersPanel"[^>]*\shidden/, 'the admin entry must start hidden and only appear for an admin');
  assert.match(html, /href="\/admin"/, 'the system page must lead to the dashboard');
  assert.match(html, /admin-entry\.js\?v=/, 'the entry needs its versioned runtime');
  assert.ok(!html.includes('systemUsersRows'),
    'account management lives in one place now; a second half-built table on the system page is exactly the duplication that was removed');

  const vercel = JSON.parse(read('vercel.json'));
  const rewriteFor = source => vercel.rewrites.find(rule => rule.source === source);
  assert.equal(rewriteFor('/admin')?.destination, '/admin.html', '/admin must resolve to the dashboard');
  assert.equal(rewriteFor('/regjistrimi')?.destination, '/regjistrimi.html', '/regjistrimi must resolve to the registration page');

  const middleware = read('middleware.ts');
  assert.ok(middleware.includes("'/regjistrimi'"),
    'middleware runs before the rewrite, so it sees the clean URL; registration must be public under both spellings');
  // The admin sign-in must be public: a sign-in page behind the session gate is
  // unreachable by exactly the people who need it. The console itself must not
  // be — middleware routes a signed-out visitor from /admin straight to the
  // admin sign-in, so opening the shell to anonymous requests buys nothing and
  // leaves the page's own gate to client JavaScript.
  const publicBlock = /PUBLIC_PATHS = new Set\(\[([\s\S]*?)\]\)/.exec(middleware)?.[1] || '';
  for (const openPath of ['/admin-login', '/admin-login.html', '/admin-login.css']) {
    assert.ok(publicBlock.includes(`'${openPath}'`),
      `${openPath} must pass middleware, or a signed-out administrator can never sign in`);
  }
  assert.ok(!/'\/admin'|'\/admin\.html'/.test(publicBlock),
    '/admin must stay behind the session gate; the dedicated sign-in is reached by redirect, not by opening the console');
  assert.match(middleware, /ADMIN_CONSOLE_PATHS\.has\(pathname\) \? ADMIN_LOGIN_PAGE : ENTRY_PAGE/,
    'someone reaching for the console must land on the admin sign-in, not the public entry page');

  // Scoped to the allowlists. `/api/clinical-editor` legitimately appears in the
  // blog carve-out below them, which admits only `GET …?blog=1` and leaves every
  // other request to that shared function under authentication.
  const secretApiBlock = /PUBLIC_SECRET_APIS = new Set\(\[([\s\S]*?)\]\)/.exec(middleware)?.[1] || '';
  for (const block of [publicBlock, secretApiBlock]) {
    assert.ok(!block.includes('/api/auth?scope=users'),
      'the admin users endpoint must never be made a public middleware path');
    assert.ok(!block.includes('/api/clinical-editor'),
      'the clinical editor must remain behind server authentication');
  }
  assert.match(middleware, /isPublicBlogApi[\s\S]{0,400}searchParams\.get\('blog'\) === '1'/,
    'the only public window into the clinical editor is the blog read, and it must stay that narrow');

  const entry = read('admin-entry.js');
  assert.match(entry, /payload\.authUser\?\.role !== 'admin'/, 'the entry is revealed only for a verified admin role');

  const env = read('.env.example');
  assert.match(env, /^MEDINDEX_ADMIN_EMAILS=diellzarabushaj@gmail\.com$/m,
    'the named-admin application gate must be documented in the environment contract');
  assert.match(env, /private\.admin_emails\(\)/,
    'the environment contract must warn that the app allowlist and database trigger stay aligned');
}

// --- registration always returns to the canonical login -----------------

{
  const html = read('regjistrimi.html');
  const loginLinks = [...html.matchAll(/href="(\/login(?:-v2)?\.html)"/g)].map(match => match[1]);
  assert.ok(loginLinks.length >= 4, 'registration must expose its expected routes back to login');
  assert.ok(loginLinks.every(value => value === '/login.html'),
    'registration must return users to the canonical DRx login surface');
  assert.ok(!html.includes('href="/login-v2.html"'),
    'the retired login-v2 surface must not re-enter the registration flow');
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
