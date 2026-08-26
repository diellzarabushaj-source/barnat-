'use strict';

// The admin console is reachable, and only by an administrator.
//
// These are routing facts, not styling ones, and every one of them was broken at
// least once: a sign-in page that required a session, a console served only on
// its .html path, and two copies of the address list that could disagree with
// the server. None of that shows up in a screenshot until someone is locked out.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const middleware = read('middleware.ts');
const vercel = JSON.parse(read('vercel.json'));
const rewriteFor = source => vercel.rewrites.find(rule => rule.source === source);

// --- the admin sign-in page must not require a session -------------------

{
  // A sign-in page behind the session gate is unreachable by exactly the people
  // who need it. Before this, a signed-out admin was sent to /admin-login.html,
  // which bounced straight back to the clinical login.
  for (const asset of ['/admin-login.html', '/admin-login', '/admin-login.css']) {
    assert.ok(
      middleware.includes(`'${asset}'`),
      `${asset} must be public, or nobody who is signed out can ever sign in as an administrator`,
    );
  }

  // Already signed in? Then the sign-in page is not where you belong.
  assert.match(middleware, /const LOGIN_PAGES = new Set\(\[[^\]]*ADMIN_LOGIN_PAGE/,
    'an authenticated visitor must be moved off the admin sign-in page, not shown a form they do not need');

  // Reaching for the console sends you to the console's own sign-in.
  assert.match(middleware, /ADMIN_CONSOLE_PATHS\.has\(pathname\) \? ADMIN_LOGIN_PAGE : ENTRY_PAGE/,
    'someone reaching for the admin console must land on the admin sign-in, not the public entry page');
}

// --- the console itself stays behind the gate ----------------------------

{
  for (const guarded of ["'/admin'", "'/admin.html'"]) {
    assert.ok(
      !new RegExp(`PUBLIC_PATHS = new Set\\(\\[[\\s\\S]*?${guarded}[\\s\\S]*?\\]\\)`).test(middleware),
      `${guarded} must never be public — it is the one page that must stay behind the session gate`,
    );
  }
}

// --- clean URLs resolve ---------------------------------------------------

{
  assert.equal(rewriteFor('/admin')?.destination, '/admin.html');
  assert.equal(rewriteFor('/admin-login')?.destination, '/admin-login.html');
  assert.equal(rewriteFor('/regjistrimi')?.destination, '/regjistrimi.html');

  // The array is matched in order and the first rule is asserted elsewhere by
  // source; keep the page rules from displacing it.
  assert.equal(vercel.rewrites[0].destination, '/api/registry',
    'the registry data rewrite must stay first; page rules belong at the end');
}

// --- the console asks the server who may open it -------------------------

{
  const api = read('api/auth.js');
  assert.match(api, /adminConsole:session\.authRole === 'admin'[\s\S]{0,200}AdminAccess\.isAdminEmail\(session\.email\)/,
    'the session response must say whether this account may open the console');

  for (const file of ['admin-entry-guard.js', 'admin-dashboard.js']) {
    const source = read(file);
    assert.match(source, /adminConsole\s*!==\s*true/,
      `${file} must read the server's verdict rather than deciding for itself`);
    assert.ok(
      !source.includes('diellzarabushaj@gmail.com'),
      `${file} must not carry its own copy of the address list: it would lock out a co-administrator the server allows`,
    );
  }
}

// --- the console's own assets are wired ----------------------------------

{
  const html = read('admin.html');
  assert.match(html, /admin-dashboard\.css\?v=/, 'the console needs its versioned stylesheet');
  assert.match(html, /admin-entry-guard\.js\?v=/, 'the console needs its versioned guard');
  assert.match(html, /id="adminGate"[\s\S]*id="adminShell"/,
    'the console must start gated and reveal the shell only after the guard approves');

  const guard = read('admin-entry-guard.js');
  assert.match(guard, /admin-dashboard\.js\?v=/,
    'the guard loads the workspace, so the dashboard must never be a bare script tag on the page');

  // Every local asset the console names has to exist, or the page renders as
  // unstyled markup — which is exactly how this was first noticed.
  const referenced = [...html.matchAll(/(?:src|href)="\/?([a-z0-9-]+\.(?:css|js))\?/g)].map(match => match[1]);
  assert.ok(referenced.length >= 3, 'the console should reference its stylesheet, theme and guard');
  for (const asset of new Set(referenced)) {
    assert.ok(fs.existsSync(path.join(ROOT, asset)), `admin.html references ${asset}, which does not exist`);
    assert.ok(fs.statSync(path.join(ROOT, asset)).size > 0, `${asset} is empty, so the console would render unstyled`);
  }
}

// --- no build scratch files ------------------------------------------------

{
  assert.ok(!fs.existsSync(path.join(ROOT, 'noop.tmp')),
    'a scratch file committed to force a deployment must not stay in the tree');
}


// --- mobile admin workspace and modal ownership ----------------------------

{
  const html = read('admin.html');
  const css = read('admin-dashboard.css');
  const dashboard = read('admin-dashboard.js');

  assert.match(html, /<dialog class="mi-dialog mi-drug-dialog" id="drugDialog">[\s\S]*id="drugSave"/,
    'the drug editor must remain a native modal dialog with an explicit save action');

  assert.match(css, /\.mi-dialog\{[^}]*max-height:90dvh;[^}]*overflow-y:auto;[^}]*overscroll-behavior:contain;/,
    'admin dialogs must own vertical overflow inside the 90dvh mobile viewport instead of pushing the dashboard');
  assert.match(css, /html:has\(\.mi-dialog\[open\]\),body:has\(\.mi-dialog\[open\]\)\{overflow:hidden\}/,
    'the document behind an open admin dialog must be scroll-locked');
  assert.match(css, /\.mi-dialog-actions\{[\s\S]*?position:sticky;[\s\S]*?bottom:-?\d+px/,
    'the long DRx drug editor must keep its actions sticky and reachable while the dialog scrolls');
  assert.match(css, /@media\(max-width:650px\)\{[\s\S]*?\.mi-form-grid,\.mi-detail-list\{grid-template-columns:1fr\}/,
    'drug forms and detail lists must collapse to one column on phones');

  assert.match(dashboard, /function showView\(name\)\{[\s\S]*?document\.body\.classList\.remove\('mi-admin-nav-open'\)/,
    'changing admin workspace on mobile must close the navigation drawer');
  assert.match(dashboard, /\$\('adminMenu'\)\.addEventListener\('click',[\s\S]*?mi-admin-nav-open/,
    'the admin mobile menu must keep a single explicit drawer owner');
}

console.log('Admin console routing contract passed.');
