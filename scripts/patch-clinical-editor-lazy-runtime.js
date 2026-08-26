'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const EDITOR = path.join(ROOT, 'clinical-editor.js');
const LOADER = 'clinical-editor-interaction-loader.js?v=clinical-editor-interaction-lazy-v1';
const MARKER = 'clinical-editor-interaction-lazy-v1';

const normalize = value => value.replace(/\r\n?/g, '\n');

function functionBoundary(source, functionName, from = 0) {
  const candidates = [
    `  function ${functionName}`,
    `  async function ${functionName}`,
  ].map(needle => ({ needle, index:source.indexOf(needle, from) }))
    .filter(candidate => candidate.index >= 0)
    .sort((left, right) => left.index - right.index);
  return candidates[0] || null;
}

function replaceFunction(source, functionName, nextFunctionName, replacement) {
  const startBoundary = functionBoundary(source, functionName);
  const nextBoundary = startBoundary
    ? functionBoundary(source, nextFunctionName, startBoundary.index + startBoundary.needle.length)
    : null;
  if (!startBoundary || !nextBoundary || nextBoundary.index <= startBoundary.index) {
    throw new Error(`Clinical editor lazy patch could not find ${functionName}() boundaries.`);
  }
  return source.slice(0, startBoundary.index) + replacement.trimEnd() + '\n\n' + source.slice(nextBoundary.index);
}

let html = normalize(fs.readFileSync(INDEX, 'utf8'));
const directScript = html.match(/<script\s+src="(clinical-editor\.js[^\"]*)"\s+defer><\/script>/);
if (!html.includes('clinical-editor-interaction-loader.js')) {
  if (!directScript) throw new Error('Clinical editor lazy patch could not find the direct runtime tag.');
  const runtimeSrc = directScript[1];
  const loaderTag = `<script src="${LOADER}" data-clinical-editor-runtime="${runtimeSrc}" defer></script>`;
  html = html.replace(directScript[0], loaderTag);
}
if (/<script\s+src="clinical-editor\.js[^\"]*"[^>]*><\/script>/.test(html)) {
  throw new Error('Clinical editor must not remain a startup script after lazy composition.');
}
if (!/data-clinical-editor-runtime="clinical-editor\.js\?[^\"]+"/.test(html)) {
  throw new Error('Clinical editor lazy loader lost the exact runtime URL.');
}
fs.writeFileSync(INDEX, html, 'utf8');

let editor = normalize(fs.readFileSync(EDITOR, 'utf8'));
if (!editor.includes(MARKER)) {
  const versionAnchor = "  const VERSION = 'clinical-editor-live-v2';";
  if (!editor.includes(versionAnchor)) throw new Error('Clinical editor VERSION anchor is missing.');
  editor = editor.replace(
    versionAnchor,
    `${versionAnchor}\n  // ${MARKER}: the full editor is loaded only after explicit Auditimi intent.\n  const LAZY_RUNTIME_VERSION = '${MARKER}';`,
  );

  const mapAnchor = '  let summaryMap = new Map();';
  if (!editor.includes(mapAnchor)) throw new Error('Clinical editor summary state anchor is missing.');
  editor = editor.replace(mapAnchor, `${mapAnchor}\n  let summaryPromise = null;`);

  editor = replaceFunction(editor, 'ensureProgressButton', 'buildHeaderIndex', `  function ensureProgressButton() {
    if (!progressButton?.isConnected) {
      progressButton = document.querySelector('[data-clinical-editor-lazy-trigger]') || null;
    }
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) return;

    if (!progressButton) {
      progressButton = document.createElement('button');
      progressButton.type = 'button';
      progressButton.className = 'clinical-editor-progress';
      const reference = document.getElementById('countBadge');
      if (reference?.parentElement === toolbar) toolbar.insertBefore(progressButton, reference);
      else toolbar.appendChild(progressButton);
    }

    progressButton.dataset.clinicalEditorProgress = VERSION;
    progressButton.dataset.clinicalEditorRuntime = LAZY_RUNTIME_VERSION;
    progressButton.classList.add('clinical-editor-progress');
    if (progressButton.dataset.clinicalEditorBound !== VERSION) {
      progressButton.dataset.clinicalEditorBound = VERSION;
      progressButton.addEventListener('click', () => void openNext());
    }
    updateProgressButton();
  }`);

  editor = replaceFunction(editor, 'loadSummary', 'field', `  function loadSummary() {
    if (summaryPromise) return summaryPromise;
    summaryPromise = (async () => {
      const payload = await api(\`${'${ENDPOINT}'}?summary=1\`);
      summary = payload.summary || summary;
      summaryMap = new Map((summary.items || []).map(item => [Number(item.registryNumber), item]));
      updateProgressButton();
      scheduleEnhance();
      return summary;
    })().finally(() => {
      summaryPromise = null;
    });
    return summaryPromise;
  }`);

  const startAnchor = '  function start() {';
  if (!editor.includes(startAnchor)) throw new Error('Clinical editor start() anchor is missing.');
  editor = editor.replace(startAnchor, `  async function openNext() {
    if (!summaryMap.size) await loadSummary();
    const next = nextIncomplete();
    if (!next) return null;
    return openEditor(next.registryNumber);
  }

${startAnchor}`);

  const exportAnchor = '  window.MedIndexClinicalEditor = { version:VERSION, open:openEditor, refresh:loadSummary };';
  if (!editor.includes(exportAnchor)) throw new Error('Clinical editor public API anchor is missing.');
  editor = editor.replace(
    exportAnchor,
    '  window.MedIndexClinicalEditor = { version:VERSION, open:openEditor, openNext, refresh:loadSummary };',
  );
}

for (const fragment of [
  MARKER,
  'let summaryPromise = null;',
  "document.querySelector('[data-clinical-editor-lazy-trigger]')",
  'progressButton.addEventListener(\'click\', () => void openNext())',
  'function loadSummary() {',
  'if (summaryPromise) return summaryPromise;',
  'async function openNext() {',
  'openNext, refresh:loadSummary',
]) {
  if (!editor.includes(fragment)) throw new Error(`Clinical editor lazy runtime missing ${fragment}.`);
}
fs.writeFileSync(EDITOR, editor, 'utf8');

execFileSync(process.execPath, [path.join(ROOT, 'tests', 'clinical-editor-lazy-runtime-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});

console.log('Clinical editor startup cleanup applied: lightweight Auditimi trigger stays eager; full editor JS, MutationObserver and summary API are interaction-only.');
