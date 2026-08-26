'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const { once } = require('node:events');
const {
  auditDeployment,
  normalizeBaseUrl,
  normalizeExpectedSha,
  REQUIRED_ASSETS,
} = require('../scripts/audit-registry-row-actions-deployment.js');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const REVISION = '1234567890abcdef1234567890abcdef12345678';

const assets = {
  'registry-user-personalization.js': Buffer.from([
    "const VERSION = 'registry-user-personalization-v3.3.0';",
    "menu.id = 'registryRowActionsMenu';",
    "tbody.addEventListener('click', handleTableActionsClick);",
  ].join('\n')),
  'registry-user-personalization.css': Buffer.from('/* registry-row-actions-menu-phase3-v1 */\n.registry-row-actions-menu{}\n'),
  'registry-desktop-lite.js': Buffer.from('/* registry-row-actions-menu-phase1-v1 */\n'),
  'registry-unified-table.js': Buffer.from('/* registry-row-actions-menu-phase1-v1 */\n'),
};

function makeManifest() {
  return {
    schema:'medindex.registry.row-actions.release.v1',
    release:'registry-row-actions-menu-phase7-v1',
    sourceRevision:REVISION,
    runtime:{
      personalizationVersion:'registry-user-personalization-v3.3.0',
      triggerSelector:'[data-row-actions-menu]',
      singletonMenuId:'registryRowActionsMenu',
      delegatedTableOwner:'#tbody',
      phoneOwnerQuery:'(max-width: 767px)',
    },
    contracts:{
      singletonMenu:true,
      delegatedTableListener:true,
      legacyRowFavoriteNoteControls:false,
      frozenMobilePersonalization:true,
      deterministicDoubleBuild:true,
    },
    assets:Object.fromEntries(REQUIRED_ASSETS.map(file => [file, { sha256:sha256(assets[file]) }])),
  };
}

(async () => {
  assert.equal(normalizeExpectedSha(REVISION.slice(0, 12)), REVISION.slice(0, 12));
  assert.throws(() => normalizeExpectedSha('not-a-sha'), /hexadecimal Git revision/);
  assert.throws(() => normalizeBaseUrl('http://example.com'), /HTTPS only/);

  let manifest = makeManifest();
  let tamperedFile = null;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname.replace(/^\//, '');
    if (pathname === 'registry-row-actions-release.json') {
      response.setHeader('content-type', 'application/json');
      response.end(`${JSON.stringify(manifest)}\n`);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(assets, pathname)) {
      response.setHeader('content-type', pathname.endsWith('.css') ? 'text/css' : 'application/javascript');
      response.end(tamperedFile === pathname ? Buffer.from('tampered') : assets[pathname]);
      return;
    }
    response.statusCode = 404;
    response.end('not found');
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/`;

  try {
    const ok = await auditDeployment({ baseUrl, expectedSha:REVISION.slice(0, 12) });
    assert.equal(ok.ok, true);
    assert.equal(ok.sourceRevision, REVISION);
    assert.equal(ok.release, 'registry-row-actions-menu-phase7-v1');

    await assert.rejects(
      () => auditDeployment({ baseUrl, expectedSha:'aaaaaaaaaaaa' }),
      /commit mismatch/
    );

    tamperedFile = 'registry-user-personalization.js';
    await assert.rejects(
      () => auditDeployment({ baseUrl, expectedSha:REVISION }),
      /hash mismatch for registry-user-personalization\.js/
    );
    tamperedFile = null;

    manifest = { ...makeManifest(), sourceRevision:null };
    await assert.rejects(
      () => auditDeployment({ baseUrl, expectedSha:REVISION }),
      /does not expose a valid build commit identity/
    );
  } finally {
    server.close();
    await once(server, 'close');
  }

  console.log('✓ Registry row actions Phase 8 passed: remote attestation accepts the exact manifest/assets, rejects commit mismatch, rejects live hash drift, requires deploy commit identity, and limits plaintext HTTP to localhost fixtures.');
})().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
