'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ROOT = process.env.MEDINDEX_TEST_ROOT
  ? path.resolve(process.env.MEDINDEX_TEST_ROOT)
  : PROJECT_ROOT;
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const apiSource = read('api/drug-search.js');
const desktop = read('registry-desktop-lite.js');
const mobile = read('registry-mobile-lite.js');
const patch = fs.readFileSync(path.join(PROJECT_ROOT, 'scripts/patch-registry-atc-lite-filter.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
const api = require(path.join(ROOT, 'api/drug-search.js'));

for (const file of ['api/drug-search.js', 'registry-desktop-lite.js', 'registry-mobile-lite.js']) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}
execFileSync(process.execPath, ['--check', path.join(PROJECT_ROOT, 'scripts/patch-registry-atc-lite-filter.js')], { stdio:'pipe' });

assert.equal(api.registryPageAtcFilter('N02'), 'N02');
assert.equal(api.registryPageAtcFilter(' n 02 '), 'N02');
assert.equal(api.registryPageAtcFilter('A'), 'A');
assert.equal(api.registryPageAtcFilter('N02BE01'), '', 'The bounded endpoint accepts only group/category prefixes');
assert.equal(api.registryPageAtcFilter('N02,or=(*)'), '', 'ATC input must not permit PostgREST expression injection');

const request = api.buildRegistryPagePath({ atc:'N02', q:'para', page:'2', pageSize:'25', includeTotal:'true' });
const params = new URLSearchParams(request.path.split('?')[1]);
assert.equal(request.atc, 'N02');
assert.equal(params.get('atc_code'), 'ilike.N02*');
assert.match(params.get('or'), /active_substance\.ilike\.\*para\*/, 'Text search must compose with the ATC category filter');
assert.equal(params.get('offset'), '25');
assert.equal(params.get('limit'), '25');

for (const [name, source] of [['desktop', desktop], ['mobile', mobile]]) {
  assert.match(source, /registry-atc-lite-v1/, `${name}: ATC lite marker missing`);
  assert.match(source, /readRegistryUrlState\?\.\(location\.href\)/, `${name}: URL category state is not read`);
  assert.match(source, /state\.atc = next\.atc/, `${name}: category is not applied to state`);
  assert.match(source, /params\.set\('atc', state\.atc\)/, `${name}: ATC is not sent to the bounded API`);
  assert.match(source, /registryUrlFromState/, `${name}: category/search/page state is not kept in the URL`);
  assert.match(source, /medindex:registry-atc-state/, `${name}: active category context is not published`);
  assert.match(source, /window\.addEventListener\('popstate', handleRegistryLocationChange\)/, `${name}: clear/back/forward does not reload the bounded list`);
  assert.doesNotMatch(source, /\/api\/registry(?:\?|['"`])/, `${name}: category filtering must not download the full registry`);
}

assert.match(apiSource, /params\.set\('atc_code', `ilike\.\$\{atc\}\*`\)/);
assert.match(patch, /patchApi\(\);[\s\S]*patchDesktop\(\);[\s\S]*patchMobile\(\);/);
assert.match(packageJson.scripts['build:runtime'], /patch-registry-atc-lite-filter\.js/, 'ATC routing fix must run after every deterministic runtime build');

console.log('ATC category URLs filter bounded Neon pages on desktop/mobile and survive clear/back/forward navigation.');
