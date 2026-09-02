'use strict';

const { execFileSync } = require('node:child_process');

const NON_RUNTIME_PATHS = [
  /^\.github\//,
  /^tests\//,
  /^supabase\/migration-history\.json$/,
];

function cleanPath(value) {
  return String(value || '').trim().replace(/\\/g, '/');
}

function isNonRuntimePath(file) {
  const path = cleanPath(file);
  return Boolean(path) && NON_RUNTIME_PATHS.some(pattern => pattern.test(path));
}

function hasExplicitSkip(message) {
  return /\[(?:skip-deploy|skip deploy)\]/i.test(String(message || ''));
}

function shouldIgnoreBuild(files, { explicitSkip = false } = {}) {
  const changed = (Array.isArray(files) ? files : [])
    .map(cleanPath)
    .filter(Boolean);
  return Boolean(explicitSkip)
    && changed.length > 0
    && changed.every(isNonRuntimePath);
}

function changedFiles() {
  try {
    return execFileSync('git', ['diff', '--name-only', 'HEAD^', 'HEAD'], {
      encoding:'utf8',
      stdio:['ignore','pipe','ignore'],
    }).split(/\r?\n/).map(cleanPath).filter(Boolean);
  } catch {
    return [];
  }
}

function main() {
  const files = changedFiles();
  const explicitSkip = hasExplicitSkip(process.env.VERCEL_GIT_COMMIT_MESSAGE);

  // Never infer that a metadata-only HEAD is safe to skip: the previous
  // runtime commit may still be undeployed. Skipping is opt-in only.
  if (shouldIgnoreBuild(files, { explicitSkip })) {
    console.log('Vercel build skipped by explicit [skip-deploy] marker (' + files.join(', ') + ').');
    process.exitCode = 0;
    return;
  }

  if (!files.length) {
    console.log('Vercel build continues: changed-file set could not be resolved safely.');
  } else if (files.every(isNonRuntimePath)) {
    console.log('Vercel build continues: metadata-only HEAD is not implicitly safe to skip.');
  } else {
    console.log('Vercel build continues: runtime-impacting change detected (' + files.join(', ') + ').');
  }
  process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { NON_RUNTIME_PATHS, cleanPath, isNonRuntimePath, hasExplicitSkip, shouldIgnoreBuild, changedFiles };
