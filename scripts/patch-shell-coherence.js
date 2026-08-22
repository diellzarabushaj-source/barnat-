'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PACKAGE = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const MARKER = 'never-raw-shell-fallback-v1';

function cleanRelease(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 96);
}

const releaseId = cleanRelease(
  process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.GITHUB_SHA
  || process.env.VERCEL_DEPLOYMENT_ID
  || `local-${PACKAGE.version}`
);
if (!releaseId) throw new Error('Shell coherence release ID could not be resolved.');

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, source) => fs.writeFileSync(path.join(ROOT, file), source.replace(/\r\n?/g, '\n'), 'utf8');

function escapeForRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function withBuildToken(url) {
  const [base, query = ''] = String(url).split('?');
  const params = query
    .split('&')
    .filter(Boolean)
    .filter(part => !/^build=/i.test(part));
  params.push(`build=${releaseId}`);
  return `${base}?${params.join('&')}`;
}

// The first thing a doctor sees. The shell has not booted yet, so this is a
// self-contained screen: the mark arrives first, the four rings turn in the
// MedIndex palette, and the line underneath says what is happening. No script,
// no stylesheet, nothing that can arrive late.
const BOOT_MARKUP = `<div id="miShellBoot" class="mi-boot-screen" role="status" aria-live="polite" aria-label="Po ngarkohet MedIndex">
  <img class="mi-boot-logo mi-boot-logo--light" src="/brand/medindex-horizontal-on-light.webp" alt="MedIndex" width="188" height="52" decoding="async" fetchpriority="high">
  <img class="mi-boot-logo mi-boot-logo--dark" src="/brand/medindex-horizontal-on-dark.webp" alt="" aria-hidden="true" width="188" height="52" decoding="async">
  <svg class="mi-boot-rings" viewBox="0 0 240 240" aria-hidden="true" focusable="false">
    <circle class="mi-boot-ring mi-boot-ring--a" cx="120" cy="120" r="105"></circle>
    <circle class="mi-boot-ring mi-boot-ring--b" cx="120" cy="120" r="35"></circle>
    <circle class="mi-boot-ring mi-boot-ring--c" cx="85" cy="120" r="70"></circle>
    <circle class="mi-boot-ring mi-boot-ring--d" cx="155" cy="120" r="70"></circle>
  </svg>
  <p class="mi-boot-text">Po ngarkohet hapësira klinike…</p>
</div>`;

const BOOT_GUARD = `<style id="miShellBootGuard">
  html.mi-shell-booting,html.mi-shell-booting body,html.auth-checking,html.auth-checking body{min-height:100%;background:#f8fafc!important}
  html.mi-shell-booting body,html.auth-checking body{overflow:hidden!important}
  html.mi-shell-booting body>*:not(#miShellBoot):not(#miShellRecovery),html.auth-checking body>*:not(#miShellBoot):not(#miShellRecovery){visibility:hidden!important}
  html.mi-shell-booting #pageLoader,html.auth-checking #pageLoader{display:none!important}
  #miShellBoot{display:none}
  html.mi-shell-booting #miShellBoot,html.auth-checking #miShellBoot{position:fixed!important;inset:0!important;z-index:999998!important;display:grid!important;place-content:center!important;justify-items:center!important;gap:28px!important;padding:24px!important;visibility:visible!important;background:#f8fafc!important;color:#0b1220!important;font-family:Inter,ui-sans-serif,system-ui,sans-serif!important}
  .mi-boot-screen .mi-boot-logo{width:min(226px,56vw);height:auto;animation:miBootLogoIn .78s cubic-bezier(.22,1,.36,1) both}
  .mi-boot-screen .mi-boot-rings{width:5.6em;height:5.6em;font-size:16px;animation:miBootFade .5s ease .3s both}
  .mi-boot-screen .mi-boot-ring{fill:none;stroke-linecap:round;stroke-width:20;animation:miBootRingA 2s linear .3s infinite}
  .mi-boot-screen .mi-boot-ring--a{stroke:#155f63}
  .mi-boot-screen .mi-boot-ring--b{stroke:#efb660;animation-name:miBootRingB}
  .mi-boot-screen .mi-boot-ring--c{stroke:#2450b8;animation-name:miBootRingC}
  .mi-boot-screen .mi-boot-ring--d{stroke:#4f958d;animation-name:miBootRingD}
  .mi-boot-screen .mi-boot-text{margin:0;color:#667085;font-size:12.5px;font-weight:600;line-height:1.45;text-align:center;animation:miBootFade .5s ease .46s both}
  .mi-boot-screen .mi-boot-logo--dark{display:none}
  html[data-theme="dark"] .mi-boot-screen .mi-boot-logo--light,html.dark .mi-boot-screen .mi-boot-logo--light{display:none}
  html[data-theme="dark"] .mi-boot-screen .mi-boot-logo--dark,html.dark .mi-boot-screen .mi-boot-logo--dark{display:block}
  html[data-theme="dark"].mi-shell-booting,html[data-theme="dark"].mi-shell-booting body,html[data-theme="dark"].auth-checking,html[data-theme="dark"].auth-checking body{background:#101d20!important}
  html[data-theme="dark"].mi-shell-booting #miShellBoot,html[data-theme="dark"].auth-checking #miShellBoot{background:#101d20!important;color:#e6efed!important}
  html[data-theme="dark"] .mi-boot-screen .mi-boot-text{color:#93a7a4}
  @keyframes miBootLogoIn{from{opacity:0;transform:translateY(16px) scale(.94)}to{opacity:1;transform:none}}
  @keyframes miBootFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  @keyframes miBootRingA{from,4%{stroke-dasharray:0 660;stroke-width:20;stroke-dashoffset:-330}12%{stroke-dasharray:60 600;stroke-width:30;stroke-dashoffset:-335}32%{stroke-dasharray:60 600;stroke-width:30;stroke-dashoffset:-595}40%,54%{stroke-dasharray:0 660;stroke-width:20;stroke-dashoffset:-660}62%{stroke-dasharray:60 600;stroke-width:30;stroke-dashoffset:-665}82%{stroke-dasharray:60 600;stroke-width:30;stroke-dashoffset:-925}90%,to{stroke-dasharray:0 660;stroke-width:20;stroke-dashoffset:-990}}
  @keyframes miBootRingB{from,12%{stroke-dasharray:0 220;stroke-width:20;stroke-dashoffset:-110}20%{stroke-dasharray:20 200;stroke-width:30;stroke-dashoffset:-115}40%{stroke-dasharray:20 200;stroke-width:30;stroke-dashoffset:-195}48%,62%{stroke-dasharray:0 220;stroke-width:20;stroke-dashoffset:-220}70%{stroke-dasharray:20 200;stroke-width:30;stroke-dashoffset:-225}90%{stroke-dasharray:20 200;stroke-width:30;stroke-dashoffset:-305}98%,to{stroke-dasharray:0 220;stroke-width:20;stroke-dashoffset:-330}}
  @keyframes miBootRingC{from{stroke-dasharray:0 440;stroke-width:20;stroke-dashoffset:0}8%{stroke-dasharray:40 400;stroke-width:30;stroke-dashoffset:-5}28%{stroke-dasharray:40 400;stroke-width:30;stroke-dashoffset:-175}36%,58%{stroke-dasharray:0 440;stroke-width:20;stroke-dashoffset:-220}66%{stroke-dasharray:40 400;stroke-width:30;stroke-dashoffset:-225}86%{stroke-dasharray:40 400;stroke-width:30;stroke-dashoffset:-395}94%,to{stroke-dasharray:0 440;stroke-width:20;stroke-dashoffset:-440}}
  @keyframes miBootRingD{from,8%{stroke-dasharray:0 440;stroke-width:20;stroke-dashoffset:0}16%{stroke-dasharray:40 400;stroke-width:30;stroke-dashoffset:-5}36%{stroke-dasharray:40 400;stroke-width:30;stroke-dashoffset:-175}44%,50%{stroke-dasharray:0 440;stroke-width:20;stroke-dashoffset:-220}58%{stroke-dasharray:40 400;stroke-width:30;stroke-dashoffset:-225}78%{stroke-dasharray:40 400;stroke-width:30;stroke-dashoffset:-395}86%,to{stroke-dasharray:0 440;stroke-width:20;stroke-dashoffset:-440}}
  #miShellRecovery{position:fixed!important;inset:0!important;z-index:1000002!important;display:grid!important;place-items:center!important;visibility:visible!important;opacity:1!important;padding:24px!important;background:#f8fafc!important;color:#0b1220!important;font-family:Inter,ui-sans-serif,system-ui,sans-serif!important}
  #miShellRecovery[hidden]{display:none!important}
  #miShellRecovery .mi-shell-recovery-card{width:min(430px,100%);padding:30px 28px;border:1px solid #e4e7ec;border-radius:18px;background:#fff;box-shadow:0 18px 50px rgba(16,24,40,.10);text-align:center}
  #miShellRecovery strong{display:block;margin:0 0 8px;font-size:20px;letter-spacing:-.03em}
  #miShellRecovery p{margin:0;color:#667085;font-size:13px;line-height:1.6}
  #miShellRecovery button{min-height:44px;margin-top:20px;padding:0 18px;border:0;border-radius:10px;background:#2450b8;color:#fff;font:700 13px/1 Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer}
  #miShellRecovery button:disabled{opacity:.58;cursor:wait}
  @media(prefers-reduced-motion:reduce){
    .mi-boot-screen .mi-boot-logo,.mi-boot-screen .mi-boot-rings,.mi-boot-screen .mi-boot-text{animation-duration:.01ms!important;animation-delay:0ms!important}
    .mi-boot-screen .mi-boot-ring{animation:none!important;stroke-width:22}
    .mi-boot-screen .mi-boot-ring--a{stroke-dasharray:150 510;stroke-dashoffset:-330}
    .mi-boot-screen .mi-boot-ring--b{stroke-dasharray:50 170;stroke-dashoffset:-110}
    .mi-boot-screen .mi-boot-ring--c{stroke-dasharray:100 340;stroke-dashoffset:-40}
    .mi-boot-screen .mi-boot-ring--d{stroke-dasharray:100 340;stroke-dashoffset:-260}
  }
</style>`;

function ensureBootClass(html) {
  if (/^<html\b[^>]*class="[^"]*\bmi-shell-booting\b/im.test(html)) return html;
  if (/^<html\b[^>]*class="/im.test(html)) {
    return html.replace(/(<html\b[^>]*class=")([^"]*)"/i, (_, prefix, classes) => `${prefix}${classes} mi-shell-booting"`);
  }
  return html.replace(/<html\b/i, '<html class="mi-shell-booting"');
}

function pinCriticalHtmlAssets(html) {
  const critical = new Set([
    'styles.css',
    'ui-controls.css',
    'loader.css',
    'clean-medindex-ui.css',
    'tailadmin-medindex.css',
    'tailadmin-professional.css',
    'tailadmin-shell.js',
    'tailadmin-professional.js',
    'auth-client.js',
  ]);

  return html.replace(/\b(href|src)="([^"#]+\.(?:css|js)(?:\?[^"#]*)?)"/gi, (full, attr, url) => {
    let pathname = url.split('?')[0];
    pathname = pathname.replace(/^\.\//, '').replace(/^\//, '');
    if (!critical.has(pathname)) return full;
    return `${attr}="${withBuildToken(url)}"`;
  });
}

function patchClinicalPages() {
  /* Only pages that actually load tailadmin-shell.js are boot-guarded. A page
     that merely reuses a TailAdmin class but has no shell runtime must never
     be hidden by a guard that nobody can clear. */
  const shellScript = /\bsrc=["']\/?tailadmin-shell\.js(?:\?[^"']*)?["']/i;
  const files = fs.readdirSync(ROOT)
    .filter(file => file.endsWith('.html'))
    .filter(file => shellScript.test(read(file)));

  for (const file of files) {
    let html = read(file);
    html = ensureBootClass(html);
    html = pinCriticalHtmlAssets(html);
    if (!html.includes('id="miShellBootGuard"')) {
      if (!html.includes('</head>')) throw new Error(`${file}: missing </head> for shell boot guard.`);
      html = html.replace('</head>', `${BOOT_GUARD}\n</head>`);
    }
    // The boot screen is markup, not a pseudo-element: it carries the mark and
    // the four rings. It leads the body so it paints before anything else the
    // page brings with it.
    if (!html.includes('id="miShellBoot"')) {
      const bodyOpen = html.match(/<body\b[^>]*>/i);
      if (!bodyOpen) throw new Error(`${file}: missing <body> for the shell boot screen.`);
      html = html.replace(bodyOpen[0], `${bodyOpen[0]}\n${BOOT_MARKUP}`);
    }
    write(file, html);

    const written = read(file);
    if (!written.includes('mi-shell-booting') || !written.includes('id="miShellBootGuard"')) {
      throw new Error(`${file}: shell boot guard was not installed.`);
    }
    if (!written.includes('id="miShellBoot"') || !written.includes('mi-boot-ring--d')) {
      throw new Error(`${file}: shell boot screen was not installed.`);
    }
    if (!/<body\b[^>]*>\s*<div id="miShellBoot"/i.test(written)) {
      throw new Error(`${file}: the boot screen must lead the body so it paints first.`);
    }
    for (const asset of ['tailadmin-shell.js', 'tailadmin-medindex.css', 'tailadmin-professional.css']) {
      if (written.includes(asset) && !new RegExp(`${asset.replace('.', '\\.')}[^\"']*build=${releaseId}`).test(written)) {
        throw new Error(`${file}: critical ${asset} is not release-pinned.`);
      }
    }
  }

  return files;
}

function pinShellRuntimeAssets(source) {
  const runtimeAssets = new Set([
    'tailadmin-shell-core.js',
    'mobile-experience.js',
    'mobile-accessibility-hardening.js',
    'mobile-sidebar-hardening.js',
    'offline-runtime.js',
    'offline-runtime-performance.js',
    'medindex-brand-runtime.js',
    'atc-sidebar.js',
    'atc-global-search.js',
  ]);

  return source.replace(/(['"])(\/[^'"?#]+\.js(?:\?[^'"]*)?)\1/g, (full, quote, url) => {
    const pathname = url.split('?')[0].replace(/^\//, '');
    if (!runtimeAssets.has(pathname)) return full;
    return `${quote}${withBuildToken(url)}${quote}`;
  });
}

function patchShellLoader() {
  const file = 'tailadmin-shell.js';
  let source = read(file);
  source = pinShellRuntimeAssets(source);

  // Phase 7 renames the shell loader from `loadLegacyShell` to `loadCoreShell`
  // earlier in the same build. The recovery path added below calls it, so the
  // name is read from the file rather than assumed: hardcoding the source
  // spelling left the built bundle calling a function it does not define, and
  // the recovery UI threw the moment it appeared.
  const loaderName = ['loadCoreShell', 'loadLegacyShell']
    .find(name => new RegExp(`function ${name}\\s*\\(`).test(source)) || '';
  if (!loaderName) throw new Error('Shell coherence could not find the shell loader function.');

  if (!source.includes(MARKER)) {
    const clearBefore = `  function clearBootState() {\n    clearTimeout(shellFallback);\n    document.documentElement.classList.remove('mi-shell-booting', 'mi-shell-fallback');\n  }`;
    const clearAfter = `  // ${MARKER}\n  function clearBootState() {\n    clearTimeout(shellFallback);\n    document.documentElement.classList.remove('mi-shell-booting', 'mi-shell-fallback', 'mi-shell-recovery');\n    document.getElementById('miShellRecovery')?.remove();\n  }`;
    if (!source.includes(clearBefore)) throw new Error('Shell coherence could not find clearBootState().');
    source = source.replace(clearBefore, clearAfter);

    const fallbackBefore = `  function revealSafeFallback() {\n    if (document.querySelector('.mi-app-shell') || document.body?.dataset.tailadminReady === '1') return;\n    document.documentElement.classList.remove('mi-shell-booting');\n    document.documentElement.classList.add('mi-shell-fallback');\n    document.documentElement.dataset.miShellError ||= 'fallback-visible';\n    document.getElementById('pageLoader')?.classList.add('is-hidden');\n  }`;
    const fallbackAfter = `  function revealSafeFallback() {\n    if (document.querySelector('.mi-app-shell') || document.body?.dataset.tailadminReady === '1') return;\n    document.documentElement.classList.add('mi-shell-booting', 'mi-shell-recovery');\n    document.documentElement.classList.remove('mi-shell-fallback');\n    document.documentElement.dataset.miShellError ||= 'shell-recovery-visible';\n\n    let recovery = document.getElementById('miShellRecovery');\n    if (!recovery) {\n      recovery = document.createElement('section');\n      recovery.id = 'miShellRecovery';\n      recovery.setAttribute('role', 'alert');\n      recovery.setAttribute('aria-live', 'assertive');\n      recovery.innerHTML = '<div class="mi-shell-recovery-card"><strong>MedIndex po rifreskon ndërfaqen</strong><p>Nuk po shfaqet versioni i vjetër i faqes. Po ngarkohet versioni aktual i hapësirës klinike.</p><button type="button">Provo përsëri</button></div>';\n      recovery.querySelector('button')?.addEventListener('click', event => {\n        const button = event.currentTarget;\n        button.disabled = true;\n        button.textContent = 'Po provohet…';\n        document.documentElement.dataset.miShellError = 'manual-shell-retry';\n        ${loaderName}(true);\n        window.setTimeout(() => {\n          if (document.querySelector('.mi-app-shell') || document.body?.dataset.tailadminReady === '1') return;\n          button.disabled = false;\n          button.textContent = 'Provo përsëri';\n        }, 3200);\n      });\n      document.body.appendChild(recovery);\n    } else {\n      recovery.hidden = false;\n    }\n\n    ${loaderName}(true);\n  }`;
    if (!source.includes(fallbackBefore)) throw new Error('Shell coherence could not find revealSafeFallback().');
    source = source.replace(fallbackBefore, fallbackAfter);

    source = source.replace(
      `  function init() {\n    if (isRegistryPage()) document.documentElement.classList.add('mi-shell-booting');`,
      `  function init() {\n    if (isRegistryPage() || document.documentElement.classList.contains('medindex-tailadmin')) document.documentElement.classList.add('mi-shell-booting');`
    );

    source = source.replace(
      `  window.addEventListener('medindex:tailadmin-ready', finalizeShellReady);`,
      `  window.addEventListener('medindex:tailadmin-ready', finalizeShellReady);\n  window.addEventListener('online', () => {\n    if (document.getElementById('miShellRecovery') && !document.querySelector('.mi-app-shell')) ${loaderName}(true);\n  }, { passive:true });`
    );
  }

  write(file, source);
  const written = read(file);
  if (!written.includes(MARKER)
      || !written.includes("classList.add('mi-shell-booting', 'mi-shell-recovery')")
      || written.includes("dataset.miShellError ||= 'fallback-visible'")
      || !written.includes('miShellRecovery')) {
    throw new Error('Shell coherence did not close the raw fallback path.');
  }
  // Phase 7 runs earlier in the same build and rewrites this constant to
  // `?v=<release>`, so the source spelling `?v=production-audit-v2` is already
  // gone by the time coherence sees the file. What matters is the property, not
  // the spelling: the shell core must carry this build's release token.
  const pinnedShellCore = new RegExp(
    `tailadmin-shell-core\\.js\\?[^'"]*\\bbuild=${escapeForRegExp(releaseId)}(?=['"&])`,
  );
  if (!pinnedShellCore.test(written)) {
    throw new Error('Shell core runtime is not release-pinned.');
  }
  // A recovery path that calls a loader this build does not define is worse
  // than no recovery path: it throws exactly when the shell has already failed.
  for (const called of new Set([...written.matchAll(/\b(loadCoreShell|loadLegacyShell)\s*\(/g)].map(match => match[1]))) {
    if (!new RegExp(`function ${called}\\s*\\(`).test(written)) {
      throw new Error(`Shell coherence left a call to ${called}(), which this build does not define.`);
    }
  }
}

const pages = patchClinicalPages();
patchShellLoader();

const canonicalWorker = read('sw.js');
if (!canonicalWorker.includes("VERSION = 'single-version-v1'") || !canonicalWorker.includes(`RELEASE_ID = '${releaseId}'`)) {
  throw new Error('Shell coherence requires the canonical single-version service worker to run first.');
}
for (const shim of ['sw-resilient.js', 'sw-resilient-v3.js']) {
  const source = read(shim);
  if (!source.includes('compatibility shim') || !source.includes('/sw.js?v=')) {
    throw new Error(`${shim}: legacy worker must remain a migration shim only.`);
  }
}

console.log(`Shell coherence: ${pages.length} clinical HTML pages are boot-guarded; raw legacy fallback disabled; critical shell assets pinned to ${releaseId}.`);
