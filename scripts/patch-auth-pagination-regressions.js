'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const MARKER = 'auth-pagination-regressions-v1';
const DEDUPE_MARKER = 'auth-read-dedupe-v1';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, source) => fs.writeFileSync(path.join(ROOT, file), source.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const at = source.indexOf(before);
  if (at < 0) throw new Error(`${MARKER}: ${label} anchor not found.`);
  if (source.indexOf(before, at + before.length) >= 0) throw new Error(`${MARKER}: ${label} anchor is ambiguous.`);
  return source.slice(0, at) + after + source.slice(at + before.length);
}

function patchAuthReadDedupe(source) {
  if (source.includes(DEDUPE_MARKER)) return source;

  source = replaceOnce(
    source,
    '  let authBootstrap = null;',
    `  let authBootstrap = null;\n  // ${DEDUPE_MARKER}: one canonical in-flight GET /api/auth read per tab.\n  let authReadInFlight = null;`,
    'auth read in-flight state',
  );

  const oldAuthRequest = [
    '  async function authRequest(options = {}) {',
    '    const controller = new AbortController();',
    '    const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);',
    '    try {',
    "      return await originalFetch('/api/auth', {",
    "        cache:'no-store',",
    "        credentials:'same-origin',",
    "        headers:{ Accept:'application/json', ...(options.headers || {}) },",
    '        ...options,',
    '        signal:controller.signal,',
    '      });',
    '    } finally {',
    '      clearTimeout(timer);',
    '    }',
    '  }',
  ].join('\n');

  const newAuthRequest = [
    '  async function performAuthRequest(options = {}) {',
    '    const controller = new AbortController();',
    '    const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);',
    '    try {',
    "      return await originalFetch('/api/auth', {",
    "        cache:'no-store',",
    "        credentials:'same-origin',",
    "        headers:{ Accept:'application/json', ...(options.headers || {}) },",
    '        ...options,',
    '        signal:controller.signal,',
    '      });',
    '    } finally {',
    '      clearTimeout(timer);',
    '    }',
    '  }',
    '',
    '  async function authRequest(options = {}) {',
    "    const method = String(options.method || 'GET').toUpperCase();",
    "    if (method !== 'GET') return performAuthRequest(options);",
    '    if (!authReadInFlight) {',
    '      authReadInFlight = performAuthRequest(options)',
    '        .finally(() => { authReadInFlight = null; });',
    '    }',
    '    const response = await authReadInFlight;',
    '    return response.clone();',
    '  }',
  ].join('\n');

  source = replaceOnce(source, oldAuthRequest, newAuthRequest, 'canonical auth request dedupe');
  return source;
}

function patchAuthClient() {
  const file = 'auth-client.js';
  let source = read(file);
  source = patchAuthReadDedupe(source);

  const oldBlock = [
    '  window.fetch = async (...args) => {',
    '    const response = await originalFetch(...args);',
    "    const target = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';",
    "    if ((response.status === 401 || response.status === 403) && !String(target).includes('/api/auth')) showExpired();",
    '    return response;',
    '  };',
  ].join('\n');
  const newBlock = [
    `  // ${MARKER}: confirm auth before global expiry`,
    '  // A 401/403 from a secondary API can mean endpoint-level authorization,',
    '  // not an expired MedIndex login. Confirm against /api/auth before showing',
    '  // the destructive session-expired banner or redirecting the doctor.',
    '  let apiAuthRevalidation = null;',
    '',
    '  function sameOriginApiTarget(target) {',
    '    try {',
    "      const parsed = new URL(String(target || ''), location.origin);",
    "      return parsed.origin === location.origin && parsed.pathname.startsWith('/api/');",
    '    } catch {',
    '      return false;',
    '    }',
    '  }',
    '',
    '  function plainAuthRead(args, target) {',
    '    try {',
    "      const parsed = new URL(String(target || ''), location.origin);",
    "      const method = String(args[1]?.method || args[0]?.method || 'GET').toUpperCase();",
    "      return method === 'GET' && parsed.origin === location.origin && parsed.pathname === '/api/auth' && !parsed.search;",
    '    } catch {',
    '      return false;',
    '    }',
    '  }',
    '',
    '  function confirmSessionAfterApiAuthFailure() {',
    '    if (apiAuthRevalidation) return apiAuthRevalidation;',
    '    apiAuthRevalidation = authRequest()',
    '      .then(async response => {',
    '        if (response.status === 401 || response.status === 403) return false;',
    '        if (!response.ok) return null;',
    '        const payload = await response.json().catch(() => ({}));',
    '        if (!payload?.authenticated || payload.hardened !== true || !phase5Session(payload)) return false;',
    '        saveOfflineLease(payload);',
    '        return true;',
    '      })',
    '      .catch(() => null)',
    '      .finally(() => { apiAuthRevalidation = null; });',
    '    return apiAuthRevalidation;',
    '  }',
    '',
    '  window.fetch = async (...args) => {',
    "    const target = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';",
    '    // Plain session reads share the canonical in-flight auth request. Query',
    '    // variants such as ?release=1 and ?offline_probe=1 keep their own semantics.',
    '    const response = plainAuthRead(args, target) ? await authRequest() : await originalFetch(...args);',
    '    if ((response.status === 401 || response.status === 403)',
    "        && !String(target).includes('/api/auth')",
    '        && sameOriginApiTarget(target)) {',
    '      void confirmSessionAfterApiAuthFailure().then(confirmed => {',
    '        if (confirmed === false) showExpired();',
    '      });',
    '    }',
    '    return response;',
    '  };',
  ].join('\n');

  if (!source.includes(`${MARKER}: confirm auth before global expiry`)) {
    source = replaceOnce(source, oldBlock, newBlock, 'global fetch auth handling');
  }
  if (source.includes("!String(target).includes('/api/auth')) showExpired();")) {
    throw new Error(`${MARKER}: direct global API expiry path survived.`);
  }
  if (!source.includes(DEDUPE_MARKER) || !source.includes('return response.clone();')) {
    throw new Error(`${DEDUPE_MARKER}: canonical auth dedupe was not applied.`);
  }
  write(file, source);
}

function patchDesktopPagination() {
  const file = 'registry-desktop-lite.js';
  let source = read(file);
  const helper = [
    `  // ${MARKER}: keep document viewport stable on pagination`,
    '  function resetDesktopTableViewport() {',
    "    const tableWrap = document.getElementById('tableWrap');",
    '    if (!tableWrap) return;',
    '    const left = Number(tableWrap.scrollLeft || 0);',
    "    if (typeof tableWrap.scrollTo === 'function') {",
    "      tableWrap.scrollTo({ top:0, left, behavior:'auto' });",
    '      return;',
    '    }',
    '    tableWrap.scrollTop = 0;',
    '    tableWrap.scrollLeft = left;',
    '  }',
    '',
  ].join('\n');

  if (!source.includes(`${MARKER}: keep document viewport stable on pagination`)) {
    const anchor = '  async function loadPage(';
    const at = source.indexOf(anchor);
    if (at < 0) throw new Error(`${MARKER}: desktop loadPage anchor not found.`);
    source = source.slice(0, at) + helper + source.slice(at);
  }

  const oldScroll = "if (scroll) document.getElementById('registryContent')?.scrollIntoView({ block:'start', behavior:'smooth' });";
  if (source.includes(oldScroll)) {
    source = source.replace(oldScroll, 'if (scroll) resetDesktopTableViewport();');
  }
  if (source.includes("document.getElementById('registryContent')?.scrollIntoView")) {
    throw new Error(`${MARKER}: document-level pagination scroll survived.`);
  }
  if (!source.includes('if (scroll) resetDesktopTableViewport();')) {
    throw new Error(`${MARKER}: pagination viewport reset was not wired.`);
  }
  write(file, source);
}

patchAuthClient();
patchDesktopPagination();
for (const file of ['auth-client.js', 'registry-desktop-lite.js']) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}
console.log('Auth + pagination regression patch applied: secondary API 401/403 is auth-confirmed before logout, concurrent plain auth reads are deduplicated, and table paging no longer scrolls the whole document.');
