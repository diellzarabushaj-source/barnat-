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

function withBuildToken(url) {
  const [base, query = ''] = String(url).split('?');
  const params = query
    .split('&')
    .filter(Boolean)
    .filter(part => !/^build=/i.test(part));
  params.push(`build=${releaseId}`);
  return `${base}?${params.join('&')}`;
}

const BOOT_GUARD = `<style id="miShellBootGuard">
  html.mi-shell-booting,html.mi-shell-booting body{min-height:100%;background:#f8fafc!important}
  html.mi-shell-booting body{overflow:hidden!important}
  html.mi-shell-booting body>*:not(#pageLoader):not(#miShellRecovery){visibility:hidden!important}
  html.mi-shell-booting #pageLoader{display:flex!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important;background:#f8fafc!important;color:#0b1220!important}
  html.mi-shell-booting #pageLoader .loader-content{color:#0b1220!important}
  html.mi-shell-booting #pageLoader .circle{background:#2450b8!important}
  html.mi-shell-booting #pageLoader .shadow{background:rgba(36,80,184,.16)!important}
  html.mi-shell-booting body::before{content:"MedIndex";position:fixed;z-index:999997;top:calc(50% - 34px);left:50%;translate:-50% -50%;visibility:visible!important;color:#0b1220;font:800 22px/1.1 Inter,ui-sans-serif,system-ui,sans-serif;letter-spacing:-.035em}
  html.mi-shell-booting body::after{content:"Po ngarkohet hapësira klinike…";position:fixed;z-index:999997;top:calc(50% + 4px);left:50%;translate:-50% -50%;visibility:visible!important;color:#667085;font:600 12px/1.4 Inter,ui-sans-serif,system-ui,sans-serif;white-space:nowrap}
  #miShellRecovery{position:fixed!important;inset:0!important;z-index:1000002!important;display:grid!important;place-items:center!important;visibility:visible!important;opacity:1!important;padding:24px!important;background:#f8fafc!important;color:#0b1220!important;font-family:Inter,ui-sans-serif,system-ui,sans-serif!important}
  #miShellRecovery[hidden]{display:none!important}
  #miShellRecovery .mi-shell-recovery-card{width:min(430px,100%);padding:30px 28px;border:1px solid #e4e7ec;border-radius:18px;background:#fff;box-shadow:0 18px 50px rgba(16,24,40,.10);text-align:center}
  #miShellRecovery strong{display:block;margin:0 0 8px;font-size:20px;letter-spacing:-.03em}
  #miShellRecovery p{margin:0;color:#667085;font-size:13px;line-height:1.6}
  #miShellRecovery button{min-height:44px;margin-top:20px;padding:0 18px;border:0;border-radius:10px;background:#2450b8;color:#fff;font:700 13px/1 Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer}
  #miShellRecovery button:disabled{opacity:.58;cursor:wait}
  @media(prefers-reduced-motion:reduce){html.mi-shell-booting #pageLoader .circle,html.mi-shell-booting #pageLoader .shadow{animation:none!important}}
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
    write(file, html);

    const written = read(file);
    if (!written.includes('mi-shell-booting') || !written.includes('id="miShellBootGuard"')) {
      throw new Error(`${file}: shell boot guard was not installed.`);
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

  if (!source.includes(MARKER)) {
    const clearBefore = `  function clearBootState() {\n    clearTimeout(shellFallback);\n    document.documentElement.classList.remove('mi-shell-booting', 'mi-shell-fallback');\n  }`;
    const clearAfter = `  // ${MARKER}\n  function clearBootState() {\n    clearTimeout(shellFallback);\n    document.documentElement.classList.remove('mi-shell-booting', 'mi-shell-fallback', 'mi-shell-recovery');\n    document.getElementById('miShellRecovery')?.remove();\n  }`;
    if (!source.includes(clearBefore)) throw new Error('Shell coherence could not find clearBootState().');
    source = source.replace(clearBefore, clearAfter);

    const fallbackBefore = `  function revealSafeFallback() {\n    if (document.querySelector('.mi-app-shell') || document.body?.dataset.tailadminReady === '1') return;\n    document.documentElement.classList.remove('mi-shell-booting');\n    document.documentElement.classList.add('mi-shell-fallback');\n    document.documentElement.dataset.miShellError ||= 'fallback-visible';\n    document.getElementById('pageLoader')?.classList.add('is-hidden');\n  }`;
    const fallbackAfter = `  function revealSafeFallback() {\n    if (document.querySelector('.mi-app-shell') || document.body?.dataset.tailadminReady === '1') return;\n    document.documentElement.classList.add('mi-shell-booting', 'mi-shell-recovery');\n    document.documentElement.classList.remove('mi-shell-fallback');\n    document.documentElement.dataset.miShellError ||= 'shell-recovery-visible';\n\n    let recovery = document.getElementById('miShellRecovery');\n    if (!recovery) {\n      recovery = document.createElement('section');\n      recovery.id = 'miShellRecovery';\n      recovery.setAttribute('role', 'alert');\n      recovery.setAttribute('aria-live', 'assertive');\n      recovery.innerHTML = '<div class="mi-shell-recovery-card"><strong>MedIndex po rifreskon ndërfaqen</strong><p>Nuk po shfaqet versioni i vjetër i faqes. Po ngarkohet versioni aktual i hapësirës klinike.</p><button type="button">Provo përsëri</button></div>';\n      recovery.querySelector('button')?.addEventListener('click', event => {\n        const button = event.currentTarget;\n        button.disabled = true;\n        button.textContent = 'Po provohet…';\n        document.documentElement.dataset.miShellError = 'manual-shell-retry';\n        loadLegacyShell(true);\n        window.setTimeout(() => {\n          if (document.querySelector('.mi-app-shell') || document.body?.dataset.tailadminReady === '1') return;\n          button.disabled = false;\n          button.textContent = 'Provo përsëri';\n        }, 3200);\n      });\n      document.body.appendChild(recovery);\n    } else {\n      recovery.hidden = false;\n    }\n\n    loadLegacyShell(true);\n  }`;
    if (!source.includes(fallbackBefore)) throw new Error('Shell coherence could not find revealSafeFallback().');
    source = source.replace(fallbackBefore, fallbackAfter);

    source = source.replace(
      `  function init() {\n    if (isRegistryPage()) document.documentElement.classList.add('mi-shell-booting');`,
      `  function init() {\n    if (isRegistryPage() || document.documentElement.classList.contains('medindex-tailadmin')) document.documentElement.classList.add('mi-shell-booting');`
    );

    source = source.replace(
      `  window.addEventListener('medindex:tailadmin-ready', finalizeShellReady);`,
      `  window.addEventListener('medindex:tailadmin-ready', finalizeShellReady);\n  window.addEventListener('online', () => {\n    if (document.getElementById('miShellRecovery') && !document.querySelector('.mi-app-shell')) loadLegacyShell(true);\n  }, { passive:true });`
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
  if (!written.includes(`tailadmin-shell-core.js?v=production-audit-v2&build=${releaseId}`)) {
    throw new Error('Shell core runtime is not release-pinned.');
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
