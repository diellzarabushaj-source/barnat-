'use strict';

// The first screen, and the only one.
//
// MedIndex was drawing four loading screens on top of each other: the boot
// guard's pseudo-element text, a second full-screen panel from app-polish.css,
// the page loader inside the document, and the auth bootstrap overlay created
// by auth-client. They differed in wording, colour and layout, faded through
// each other, and the doctor saw a bare line of text where the brand should be.
//
// One screen owns the whole wait now: the mark enters first, the four rings
// turn in the MedIndex palette, and the line underneath says what is happening
// — from first paint, through the session check, until the workspace is ready.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const patch = read('scripts/patch-shell-coherence.js');
const authClient = read('auth-client.js');
const polish = read('app-polish.css');
const index = read('index.html');

// --- the screen is in the document, before anything can load ----------------

{
  assert.match(index, /<body\b[^>]*>\s*<div id="miShellBoot" class="mi-boot-screen"/,
    'the boot screen must lead the body so it paints before anything else');
  assert.match(index, /id="miShellBootGuard"/,
    'its styles must be inline in the head, independent of any stylesheet');

  for (const ring of ['a', 'b', 'c', 'd']) {
    assert.ok(index.includes(`mi-boot-ring--${ring}`), `ring ${ring} must be in the document`);
  }
  assert.match(index, /class="mi-boot-logo mi-boot-logo--light"[^>]*fetchpriority="high"/,
    'the mark must be fetched at high priority — it is the first thing shown');
  assert.match(index, /medindex-horizontal-on-dark\.webp/,
    'the dark-theme mark must be present so the screen is not a white flash');
  assert.match(index, /Po ngarkohet hapësira klinike…/);
}

// --- the rings turn in the MedIndex palette ---------------------------------

{
  const palette = {
    'mi-boot-ring--a': '#155f63',
    'mi-boot-ring--b': '#efb660',
    'mi-boot-ring--c': '#2450b8',
    'mi-boot-ring--d': '#4f958d',
  };
  for (const [ring, colour] of Object.entries(palette)) {
    assert.ok(patch.includes(`.${ring}{stroke:${colour}`),
      `${ring} must carry the brand colour ${colour}`);
  }
  for (const foreign of ['#f42f25', '#f49725', '#255ff4', '#f42582']) {
    assert.ok(!patch.includes(foreign), `the borrowed palette colour ${foreign} must not survive`);
  }

  for (const frames of ['miBootRingA', 'miBootRingB', 'miBootRingC', 'miBootRingD']) {
    assert.ok(patch.includes(`@keyframes ${frames}{`), `${frames} must be defined`);
  }
  assert.match(patch, /@keyframes miBootLogoIn\{from\{opacity:0/,
    'the mark must have an entrance of its own');
  assert.match(patch, /\.mi-boot-screen \.mi-boot-rings\{[^}]*animation:miBootFade \.5s ease \.3s/,
    'the rings must follow the mark, not arrive with it');
  assert.match(patch, /\.mi-boot-screen \.mi-boot-text\{[^}]*animation:miBootFade \.5s ease \.46s/,
    'the line of text must come last');
}

// --- one screen, not four ---------------------------------------------------

{
  assert.doesNotMatch(polish, /auth-checking body::before/,
    'the session check must not draw a second full-screen panel');
  assert.doesNotMatch(polish, /Po verifikohet sesioni/,
    'the wording of the wait belongs to one screen only');

  assert.match(patch, /html\.mi-shell-booting #pageLoader,html\.auth-checking #pageLoader\{display:none!important\}/,
    'the page loader must stay down while the boot screen is up');
  assert.match(patch, /html\.mi-shell-booting #miShellBoot,html\.auth-checking #miShellBoot\{/,
    'one screen must cover both the shell coming up and the session being checked');

  assert.match(authClient, /const bootScreen = document\.getElementById\('miShellBoot'\);/,
    'the session check must reuse the screen the page already opened with');
  assert.match(authClient, /if \(authBootstrap && authBootstrap\.id !== 'miShellBoot'\) authBootstrap\.remove\(\);/,
    'clearing the session check must never remove the document\'s own boot screen');
  assert.match(authClient, /querySelector\('\.mi-boot-text'\)/,
    'the status line must be the one the screen already shows');
}

// --- it degrades honestly ---------------------------------------------------

{
  assert.match(patch, /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?\.mi-boot-screen \.mi-boot-ring\{animation:none!important/,
    'a doctor who asked for less motion must get still rings, not a spinner');
  assert.match(patch, /html\[data-theme="dark"\]\.auth-checking #miShellBoot\{background:#101d20!important/,
    'a dark workspace must not open on a white screen');
  assert.match(patch, /aria-live="polite"/, 'the wait must be announced');
  assert.match(patch, /aria-hidden="true" focusable="false"/,
    'the rings are decoration and must stay out of the accessibility tree');
}

// --- every guarded page carries it ------------------------------------------

{
  const pages = fs.readdirSync(ROOT)
    .filter(file => file.endsWith('.html'))
    .filter(file => /\bsrc=["']\/?tailadmin-shell\.js(?:\?[^"']*)?["']/i.test(read(file)));
  assert.ok(pages.length >= 8, 'the clinical pages must be discoverable by their shell script');
  for (const page of pages) {
    const html = read(page);
    assert.ok(html.includes('id="miShellBoot"'), `${page} must open on the boot screen`);
    assert.ok(html.includes('mi-boot-ring--d'), `${page} must carry the full ring set`);
  }
}

console.log(`Boot screen passed: one screen owns the wait — the mark enters first, the four rings turn in the MedIndex palette, and the page loader, the session-check panel and the second overlay no longer stack behind it.`);
