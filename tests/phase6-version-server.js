'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PHASE6_PORT || 4175);
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function runtimeRelease() {
  const source = read('offline-runtime.js');
  const match = source.match(/const RELEASE_ID = '([^']+)'/);
  if (!match?.[1]) throw new Error('Phase 6 fixture requires build:runtime before startup.');
  return match[1];
}

const BUILD_RELEASE = runtimeRelease();
let releaseOverride = BUILD_RELEASE;

const TYPES = {
  '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml; charset=utf-8',
  '.webmanifest':'application/manifest+json; charset=utf-8',
};

function send(res, status, body, type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, {
    'Content-Type':type,
    'Cache-Control':'no-store, max-age=0',
    'X-Content-Type-Options':'nosniff',
    ...headers,
  });
  res.end(body);
}

function html(marker) {
  const safe = String(marker || 'base').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 48) || 'base';
  return `<!doctype html>
<html lang="sq" data-phase6-server-release="${safe}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="manifest" href="/manifest.webmanifest">
<title>Phase 6 ${safe}</title>
<script src="/offline-runtime.js?v=${BUILD_RELEASE}" data-medindex-offline-runtime defer></script>
</head>
<body>
<main id="phase6Version">${safe}</main>
</body>
</html>`;
}

function safeFile(pathname) {
  const relative = pathname.replace(/^\/+/, '');
  if (!relative || relative.includes('..')) return null;
  const file = path.resolve(ROOT, relative);
  return file.startsWith(ROOT + path.sep) ? file : null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/auth' && req.method === 'GET') {
    if (url.searchParams.get('release') === '1') {
      return send(res, 200, JSON.stringify({ id:releaseOverride, strategy:'single-version-v1' }), 'application/json; charset=utf-8');
    }
    return send(res, 200, JSON.stringify({ authenticated:true, sessionHours:8, hardened:true }), 'application/json; charset=utf-8');
  }

  if (url.pathname === '/__phase6/release' && req.method === 'POST') {
    releaseOverride = String(url.searchParams.get('value') || BUILD_RELEASE).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 96) || BUILD_RELEASE;
    return send(res, 200, JSON.stringify({ id:releaseOverride }), 'application/json; charset=utf-8');
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    return send(res, 200, html(url.searchParams.get('phase6')), 'text/html; charset=utf-8');
  }

  const file = safeFile(url.pathname);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found');
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type':type,
    'Cache-Control':'no-store, max-age=0',
    'Service-Worker-Allowed':'/',
    'X-Content-Type-Options':'nosniff',
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Phase 6 version server listening on ${PORT}; release=${BUILD_RELEASE}`);
});
