'use strict';

/* Phase 21 — Registry List cache/version coherence.
 *
 * Keep the established primary asset versions because earlier build patches use
 * them as stable anchors. Add one shared `rlv=` release marker to every List
 * asset instead. The single registry stylesheet carries the List styles and
 * owner guard together, so online requests cannot mix CSS generations with a
 * newer controller, while the final offline manifest still derives the
 * canonical unversioned paths from the finished index.html.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const RELEASE = 'registry-list-stable-v1';
const META = `<meta name="medindex-registry-list-release" content="${RELEASE}">`;
const ASSETS = [
  'registry-table-tools.css',
  'registry-list-data-bridge.js',
  'registry-list-view.js',
  'registry-list-owner-guard.js',
  'registry-list-detail-dosage.js',
];

let html = fs.readFileSync(INDEX, 'utf8').replace(/\r\n?/g, '\n');

function withRelease(url) {
  const [base, hash = ''] = String(url).split('#', 2);
  const separator = base.includes('?') ? '&' : '?';
  const clean = base
    .replace(new RegExp(`([?&])rlv=[^&#]*&?`, 'g'), (match, lead) => lead)
    .replace(/[?&]$/, '');
  return `${clean}${clean.includes('?') ? '&' : separator}rlv=${RELEASE}${hash ? `#${hash}` : ''}`;
}

for (const asset of ASSETS) {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`((?:href|src)=["'])(${escaped}[^"']*)(["'])`, 'g');
  let hits = 0;
  html = html.replace(pattern, (_, open, url, close) => {
    hits += 1;
    return `${open}${withRelease(url)}${close}`;
  });
  if (hits !== 1) throw new Error(`Registry List Phase 21: ${asset} duhet të figurojë saktësisht një herë, jo ${hits}.`);
}

html = html.replace(/^<meta name="medindex-registry-list-release"[^>]*>\n?/gm, '');
const headClose = html.indexOf('</head>');
if (headClose < 0) throw new Error('Registry List Phase 21: </head> mungon.');
html = `${html.slice(0, headClose)}${META}\n${html.slice(headClose)}`;

fs.writeFileSync(INDEX, html, 'utf8');

const written = fs.readFileSync(INDEX, 'utf8');
for (const asset of ASSETS) {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = written.match(new RegExp(`${escaped}[^"']*rlv=${RELEASE}`, 'g')) || [];
  if (match.length !== 1) throw new Error(`Registry List Phase 21: release marker mungon ose është i dyfishtë për ${asset}.`);
}
if ((written.match(/name="medindex-registry-list-release"/g) || []).length !== 1) {
  throw new Error('Registry List Phase 21: release meta duhet të jetë unik.');
}

console.log(`Registry List Phase 4: ${ASSETS.length} asete përdorin release marker ${RELEASE}; offline manifest-i i mbledh pas këtij hapi.`);
