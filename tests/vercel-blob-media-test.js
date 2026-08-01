'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const media = require('../lib/media-library.js')._test;

assert.equal(media.normalizeKind('brand'), 'brand');
assert.equal(media.normalizeKind('patients'), 'other', 'Kategoritë e panjohura duhet të izolohen te other.');
assert.equal(media.safeFilename('Logo MedIndex.PNG', 'png'), 'logo-medindex.png');
assert.equal(media.managedPath('medindex/media/brand/2026-08-01/logo-1.png'), 'medindex/media/brand/2026-08-01/logo-1.png');
assert.throws(() => media.managedPath('../secret.txt'), /nuk i përket/i);
assert.throws(() => media.uploadPath({ filename:'logo.svg', contentType:'image/svg+xml', kind:'brand' }), /PNG, WebP dhe JPEG/i, 'SVG e pasanitizuar nuk duhet të pranohet.');
assert.equal(
  media.uploadPath({
    filename:'MedIndex Logo.png', contentType:'image/png', kind:'brand',
    now:new Date('2026-08-01T10:00:00Z'), nonce:'abc-123',
  }),
  'medindex/media/brand/2026-08-01/medindex-logo-abc-123.png'
);
assert.equal(media.MAX_FILE_BYTES, 8 * 1024 * 1024);

const vercel = JSON.parse(read('vercel.json'));
const authEndpoint = read('api/clinical-editor.js');
const library = read('lib/media-library.js');
const system = read('sistemi.html');
const client = read('media-library.js');
const styles = read('media-library.css');

assert(vercel.rewrites.some(item => item.source === '/api/media' && item.destination === '/api/clinical-editor?mediaLibrary=1'), 'Rewrite-i i Media Library mungon.');
assert(vercel.headers[0].headers.some(item => item.key === 'Content-Security-Policy' && item.value.includes('https://*.public.blob.vercel-storage.com')), 'CSP nuk lejon imazhet e public Blob.');
assert(authEndpoint.includes("require('../lib/media-library.js')"), 'Media Library nuk përdor funksionin ekzistues serverless.');
assert(authEndpoint.includes("queryFlag(req, 'mediaLibrary')"), 'Dispatcher-i i medias mungon.');
assert(!fs.existsSync(path.join(root, 'api/media.js')), 'Integrimi nuk duhet të konsumojë një funksion të ri Vercel.');
assert(library.includes("access:'public'"), 'Upload-i duhet të përdorë public Blob për media publike.');
assert(library.includes('BLOB_READ_WRITE_TOKEN'), 'Kontrolli i konfigurimit Blob mungon.');
assert(library.includes('verifyCsrf'), 'Upload/fshirja duhet të verifikojnë CSRF.');
assert(library.includes("user.role !== 'editor'"), 'Menaxhimi i medias duhet të kufizohet te editori.');
assert(library.includes('cacheControlMaxAge:31536000'), 'Asetet immutable duhet të kenë cache të gjatë.');
assert(system.includes('id="mediaUploadForm"'), 'Paneli Media Library mungon te Sistemi.');
assert(system.includes('BLOB_READ_WRITE_TOKEN'), 'Udhëzimi i konfigurimit mungon.');
assert(client.includes("new Set(['image/png', 'image/webp', 'image/jpeg'])"), 'Validimi client-side i MIME mungon.');
assert(client.includes("'X-CSRF-Token':csrfToken"), 'Client-i nuk dërgon CSRF token.');
assert(styles.includes('.media-gallery'), 'Galeria responsive mungon.');
assert(styles.includes('@media(max-width:760px)'), 'Responsive mobile mungon.');

console.log('Authenticated Vercel Blob Media Library audit passed.');
