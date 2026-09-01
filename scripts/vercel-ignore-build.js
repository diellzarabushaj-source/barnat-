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

function shouldIgnoreBuild(files) {
  const changed = (Array.isArray(files) ? files : [])
    .map(cleanPath)
    .filter(Boolean);
  return changed.length > 0 && changed.every(isNonRuntimePath);
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
  if (shouldIgnoreBuild(files)) {
    console.log('Vercel build skipped: only non-runtime files changed (' + files.join(', ') + ').');
    process.exitCode = 0;
    return;
  }

  if (!files.length) {
    console.log('Vercel build continues: changed-file set could not be resolved safely.');
  } else {
    console.log('Vercel build continues: runtime-impacting change detected (' + files.join(', ') + ').');
  }
  process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { NON_RUNTIME_PATHS, cleanPath, isNonRuntimePath, shouldIgnoreBuild, changedFiles };
