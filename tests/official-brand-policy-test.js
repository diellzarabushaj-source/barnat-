'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const manifestPath = path.join(ROOT, 'official-brand-assets.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const expectedAssets = {
  markOnLight: {
    route: '/brand/medindex-mark-on-light.webp',
    blobPath: 'medindex/brand/v1/medindex-mark-on-light.webp',
  },
  fullOnLight: {
    route: '/brand/medindex-full-on-light.png',
    blobPath: 'medindex/brand/v1/medindex-full-on-light.png',
  },
  horizontalOnLight: {
    route: '/brand/medindex-horizontal-on-light.webp',
    blobPath: 'medindex/brand/v1/medindex-horizontal-on-light.webp',
  },
  horizontalOnDark: {
    route: '/brand/medindex-horizontal-on-dark.webp',
    blobPath: 'medindex/brand/v1/medindex-horizontal-on-dark.webp',
  },
  markOnDark: {
    route: '/brand/medindex-mark-on-dark.png',
    blobPath: 'medindex/brand/v1/medindex-mark-on-dark.png',
  },
  fullOnDark: {
    route: '/brand/medindex-full-on-dark.png',
    blobPath: 'medindex/brand/v1/medindex-full-on-dark.png',
  },
};

const approvedAliases = [
  'medindex-icon.svg',
  'images/brand/medindex-mark-mplus.svg',
];

assert.equal(manifest.brand, 'MedIndex');
assert.equal(manifest.version, 'v1');
assert.deepEqual(Object.keys(manifest.assets).sort(), Object.keys(expectedAssets).sort());

for (const [key, expected] of Object.entries(expectedAssets)) {
  assert.equal(manifest.assets[key].route, expected.route, `${key} route changed`);
  assert.equal(manifest.assets[key].blobPath, expected.blobPath, `${key} Blob path changed`);
}

const allowedReferences = new Set();
for (const asset of Object.values(expectedAssets)) {
  allowedReferences.add(asset.route);
  allowedReferences.add(asset.route.replace(/^\//, ''));
  allowedReferences.add(asset.blobPath);
  allowedReferences.add(path.posix.basename(asset.route));
}
for (const alias of approvedAliases) {
  allowedReferences.add(alias);
  allowedReferences.add(`/${alias}`);
}

const horizontalSources = [
  'brand/source-v2/medindex-horizontal-on-light.webp',
  'brand/source-v2/medindex-horizontal-on-dark.webp',
];
for (const relativePath of horizontalSources) {
  const buffer = fs.readFileSync(path.join(ROOT, relativePath));
  assert.ok(buffer.length > 1000, `Horizontal logo source is too small: ${relativePath}`);
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF', `Horizontal logo is not WebP: ${relativePath}`);
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP', `Horizontal logo is not WebP: ${relativePath}`);
}

const officialMarkBase64 = fs.readFileSync(path.join(ROOT, 'brand/source-v2/medindex-mark-on-light-transparent.webp.b64'), 'utf8').trim();
for (const alias of approvedAliases) {
  const aliasPath = path.join(ROOT, alias);
  assert.ok(fs.existsSync(aliasPath), `Approved logo alias is missing: ${alias}`);
  const aliasContent = fs.readFileSync(aliasPath, 'utf8');
  assert.ok(aliasContent.includes(`data:image/webp;base64,${officialMarkBase64}`), `${alias} is not generated from the approved transparent MedIndex mark`);
}

const ignoredDirectories = new Set(['.git', '.vercel', 'node_modules', 'coverage', 'tests', 'scripts']);
const sourceExtensions = new Set(['.html', '.css', '.js', '.mjs', '.ts', '.json']);
const imageReferencePattern = /(?:\/?[A-Za-z0-9_.-]+\/)*medindex-[A-Za-z0-9_.\/-]*\.(?:png|webp|svg|jpe?g)(?!\.[A-Za-z0-9])/gi;
const violations = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath);
      continue;
    }
    if (!sourceExtensions.has(path.extname(entry.name).toLowerCase())) continue;

    const relativePath = path.relative(ROOT, absolutePath).replaceAll('\\', '/');
    const content = fs.readFileSync(absolutePath, 'utf8');
    const references = content.match(imageReferencePattern) || [];
    for (const reference of references) {
      const normalized = reference.replace(/^\.\//, '');
      const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
      if (!allowedReferences.has(normalized) && !allowedReferences.has(withLeadingSlash)) {
        violations.push(`${relativePath}: ${reference}`);
      }
    }
  }
}

walk(ROOT);
assert.deepEqual(violations, [], `Non-approved MedIndex logo references found:\n${violations.join('\n')}`);

const loginHtml = fs.readFileSync(path.join(ROOT, 'login.html'), 'utf8');
const loginLogoReferences = (loginHtml.match(imageReferencePattern) || [])
  .map(reference => reference.startsWith('/') ? reference : `/${reference}`);
loginLogoReferences.forEach(reference => {
  assert.ok(allowedReferences.has(reference), `Login uses a non-approved logo: ${reference}`);
});

// The public DRx system has its own committed vector lockup. Login may use the
// approved MedIndex assets above or the DRx lockup, but never a reconstructed
// wordmark made from live text.
const approvedDrxLoginLogos = [
  '/brand/drx-horizontal-on-light.svg',
  '/brand/drx-horizontal-on-dark.svg',
];
const drxLoginLogos = approvedDrxLoginLogos.filter(reference => loginHtml.includes(reference));
assert.ok(loginLogoReferences.length > 0 || drxLoginLogos.length > 0,
  'Login must use an approved MedIndex or DRx logo asset.');
drxLoginLogos.forEach(reference => {
  assert.ok(fs.existsSync(path.join(ROOT, reference.replace(/^\//, ''))), `Approved DRx logo is missing: ${reference}`);
});

console.log('Official logo policy passed: MedIndex legacy assets stay governed and login uses the canonical DRx on-light/on-dark lockup.');
