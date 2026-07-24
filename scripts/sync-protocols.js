#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { put } = require('@vercel/blob');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'data', 'protocols.json');
const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 45000;
const REGISTRY_PATH = '/Documents/Index/273';

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function cleanRegistryText(value) {
  return decodeHtml(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateRegistryUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.hostname !== 'msh.rks-gov.net' || url.pathname !== REGISTRY_PATH) {
    throw new Error(`Regjistër jozyrtar ose i palejuar: ${url.href}`);
  }
  return url;
}

function parseRegistryEntries(html, registryUrl) {
  const baseUrl = validateRegistryUrl(registryUrl);
  const entries = new Map();
  const blocks = String(html || '').split(/(?=<h2\b)/i);
  for (const block of blocks) {
    const titleMatch = block.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    const dateMatch = block.match(/fa-calendar[\s\S]*?(\d{2}\.\d{2}\.\d{4})/i);
    if (!titleMatch || !dateMatch) continue;
    const registryTitle = cleanRegistryText(titleMatch[1]);
    const publishedAt = dateMatch[1].split('.').reverse().join('-');
    const linkPattern = /href=["']([^"']*\/Documents\/DownloadDocument\?fileName=[^"']+)["']/gi;
    for (const match of block.matchAll(linkPattern)) {
      const officialUrl = new URL(decodeHtml(match[1]), baseUrl).href;
      entries.set(officialUrlKey(officialUrl), { registryTitle, publishedAt, officialUrl });
    }
  }
  return entries;
}

async function fetchRegistryEntries(registryUrl) {
  const url = validateRegistryUrl(registryUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect:'follow',
      signal:controller.signal,
      headers:{ 'User-Agent':'MedIndexProtocolSync/1.0', Accept:'text/html' },
    });
    if (!response.ok) throw new Error(`Regjistri ktheu HTTP ${response.status}.`);
    return parseRegistryEntries(await response.text(), url);
  } finally {
    clearTimeout(timer);
  }
}

function verifyRegistryDocument(document, registryEntries) {
  const registry = registryEntries.get(officialUrlKey(document.officialUrl));
  if (!registry?.registryTitle || !/^\d{4}-\d{2}-\d{2}$/.test(registry.publishedAt || '')) {
    throw new Error(`${document.id} nuk u gjet me titull dhe datë në regjistrin zyrtar.`);
  }
  return { ...document, ...registry, registryVerifiedAt:new Date().toISOString() };
}

function validateOfficialUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.hostname !== 'msh.rks-gov.net' || url.pathname !== '/Documents/DownloadDocument') {
    throw new Error(`URL jozyrtare ose e palejuar: ${url.href}`);
  }
  return url;
}

function officialUrlKey(value) {
  const url = validateOfficialUrl(value);
  const fileName = String(url.searchParams.get('fileName') || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!fileName) throw new Error(`URL-ja zyrtare nuk ka fileName: ${url.href}`);
  return `${url.pathname}?fileName=${fileName}`;
}

function verifyDocument(buffer, expectedType) {
  const type = String(expectedType || '').toLowerCase();
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) throw new Error('Dokumenti është bosh ose i dëmtuar.');
  if (buffer.length > MAX_DOCUMENT_BYTES) throw new Error(`Dokumenti tejkalon ${MAX_DOCUMENT_BYTES} bytes.`);
  if (type === 'pdf' && buffer.subarray(0, 4).toString('ascii') !== '%PDF') throw new Error('Magic bytes nuk janë PDF.');
  if (type === 'docx' && !(buffer[0] === 0x50 && buffer[1] === 0x4b)) throw new Error('Magic bytes nuk janë DOCX/ZIP.');
}

async function downloadDocument(document) {
  const officialUrl = validateOfficialUrl(document.officialUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(officialUrl, {
      redirect:'follow',
      signal:controller.signal,
      headers:{ 'User-Agent':'MedIndexProtocolSync/1.0', Accept:'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_DOCUMENT_BYTES) throw new Error('Dokumenti i deklaruar është tepër i madh.');
    const buffer = Buffer.from(await response.arrayBuffer());
    verifyDocument(buffer, document.type);
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

async function syncDocument(document, token) {
  const buffer = await downloadDocument(document);
  const contentSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const extension = document.type === 'docx' ? 'docx' : 'pdf';
  const blobPath = `protocols/${document.id}/${contentSha256}.${extension}`;
  const blob = await put(blobPath, buffer, {
    access:'private',
    addRandomSuffix:false,
    allowOverwrite:true,
    contentType:extension === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    token,
  });
  return {
    ...document,
    blobPath,
    blobUrl:blob.url,
    contentSha256,
    bytes:buffer.length,
    verifiedAt:new Date().toISOString(),
  };
}

async function main() {
  const token = String(process.env.BLOB_READ_WRITE_TOKEN || '').trim();
  if (!token) throw new Error('Mungon BLOB_READ_WRITE_TOKEN për Blob store privat.');
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
  if (!Array.isArray(manifest.documents) || manifest.documents.length !== 55) {
    throw new Error('Manifesti duhet të përmbajë saktësisht 55 dokumente.');
  }

  const registryEntries = await fetchRegistryEntries(manifest.sourceRegistry);
  const registryVerifiedDocuments = manifest.documents.map(document => verifyRegistryDocument(document, registryEntries));
  const nextDocuments = [];
  for (const document of registryVerifiedDocuments) {
    process.stdout.write(`Duke verifikuar ${document.id}… `);
    const synced = await syncDocument(document, token);
    nextDocuments.push(synced);
    process.stdout.write(`${synced.bytes} bytes\n`);
  }

  const nextManifest = {
    ...manifest,
    syncedAt:new Date().toISOString(),
    documents:nextDocuments,
  };
  const temporaryPath = `${MANIFEST_PATH}.next`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, MANIFEST_PATH);
  process.stdout.write('Manifesti u përditësua vetëm pasi përfunduan të 55 importet.\n');
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Importi dështoi: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  validateOfficialUrl,
  officialUrlKey,
  validateRegistryUrl,
  fetchRegistryEntries,
  parseRegistryEntries,
  verifyRegistryDocument,
  verifyDocument,
  downloadDocument,
  syncDocument,
};
