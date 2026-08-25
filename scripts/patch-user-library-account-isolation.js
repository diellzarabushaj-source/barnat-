'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const JS_ASSET = 'user-library-account-guard.js?v=account-isolation-v1';
const CSS_ASSET = 'user-library-account-guard.css?v=account-isolation-v1';

function patchHtml(file) {
  const full = path.join(ROOT, file);
  let source = fs.readFileSync(full, 'utf8').replace(/\r\n?/g, '\n');
  if (!source.includes('user-library-client.js')) return false;

  if (!source.includes('user-library-account-guard.css')) {
    const anchor = '<link rel="stylesheet" href="registry-user-personalization.css';
    const index = source.indexOf(anchor);
    if (index < 0) throw new Error(`${file}: personalization CSS anchor not found.`);
    source = `${source.slice(0, index)}<link rel="stylesheet" href="${CSS_ASSET}" data-user-library-account-guard-css>\n${source.slice(index)}`;
  }

  if (!source.includes('user-library-account-guard.js')) {
    const match = source.match(/<script src="user-library-client\.js[^\"]*" defer><\/script>/);
    if (!match) throw new Error(`${file}: user-library-client script anchor not found.`);
    const index = source.indexOf(match[0]);
    source = `${source.slice(0, index)}<script src="${JS_ASSET}" defer data-user-library-account-guard></script>\n${source.slice(index)}`;
  }

  const guardPosition = source.indexOf('user-library-account-guard.js');
  const clientPosition = source.indexOf('user-library-client.js');
  const personalizationPosition = source.indexOf('registry-user-personalization.js');
  if (!(guardPosition >= 0 && clientPosition > guardPosition && personalizationPosition > clientPosition)) {
    throw new Error(`${file}: personal account guard must run before library sync and personalization.`);
  }

  fs.writeFileSync(full, source, 'utf8');
  return true;
}

const htmlFiles = fs.readdirSync(ROOT).filter(name => name.endsWith('.html'));
const patched = htmlFiles.filter(patchHtml);
if (!patched.length) throw new Error('No page publishes user-library-client.js; account isolation cannot be guaranteed.');

console.log(`Per-user account isolation wired before personal library on: ${patched.join(', ')}.`);
