'use strict';

const { Readable } = require('node:stream');
const { get } = require('@vercel/blob');
const ClinicalEditor = require('../lib/clinical-editor.js');
const PopulationVerification = require('../lib/population-verification.js');
const MediaLibrary = require('../lib/media-library.js');
const Phase11Review = require('../lib/phase11-review.js');
const IcdBase = require('../lib/icd-api-base.js');
const IcdAdvanced = require('../lib/icd-advanced-handler.js');

const OFFICIAL_BRAND = Object.freeze({
  markOnLight:{ pathname:'medindex/brand/v1/medindex-mark-on-light.webp', contentType:'image/webp' },
  fullOnDark:{ pathname:'medindex/brand/v1/medindex-full-on-dark.png', contentType:'image/png' },
  markOnDark:{ pathname:'medindex/brand/v1/medindex-mark-on-dark.png', contentType:'image/png' },
  fullOnLight:{ pathname:'medindex/brand/v1/medindex-full-on-light.png', contentType:'image/png' },
  horizontalOnLight:{ pathname:'medindex/brand/v1/medindex-horizontal-on-light.webp', contentType:'image/webp' },
  horizontalOnDark:{ pathname:'medindex/brand/v1/medindex-horizontal-on-dark.webp', contentType:'image/webp' },
});

const BLOG_PROJECT_ID = '4wdtp8cz';
const BLOG_DATASET = 'production';
const BLOG_API_VERSION = '2026-08-16';
const BLOG_SANITY_URL = `https://${BLOG_PROJECT_ID}.apicdn.sanity.io/v${BLOG_API_VERSION}/data/query/${BLOG_DATASET}`;
const BLOG_COVER_PROJECTION = `
  "coverImage": coverImage {
    "url": asset->url,
    alt,
    caption,
    credit,
    hotspot { x, y, width, height },
    crop { top, bottom, left, right }
  }`;
const BLOG_LIST_QUERY = `*[_type == "blogPost" && defined(slug.current)] | order(publishedAt desc) {
  _id,
  title,
  "slug": slug.current,
  excerpt,
  category,
  tags,
  language,
  publishedAt,
  readingTimeMinutes,
  ${BLOG_COVER_PROJECTION},
  "author": author->{name, credentials, role, "slug": slug.current}
}`;
const BLOG_DETAIL_QUERY = `*[_type == "blogPost" && slug.current == $slug][0] {
  _id,
  title,
  "slug": slug.current,
  excerpt,
  category,
  tags,
  language,
  publishedAt,
  readingTimeMinutes,
  seoTitle,
  seoDescription,
  body,
  ${BLOG_COVER_PROJECTION},
  "author": author->{name, credentials, role, bio, "slug": slug.current}
}`;

function queryValue(req, name) {
  if (req.query?.[name] !== undefined) {
    const value = Array.isArray(req.query[name]) ? req.query[name][0] : req.query[name];
    return String(value || '');
  }
  try { return new URL(String(req.url || ''), 'https://medindex.local').searchParams.get(name) || ''; }
  catch { return ''; }
}

function queryFlag(req, name) {
  if (req.query?.[name] !== undefined) return true;
  try {
    return new URL(String(req.url || ''), 'https://medindex.local').searchParams.has(name);
  } catch {
    return false;
  }
}

async function authorizedIcd(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

async function icdApi(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Cookie');
  if (!(await authorizedIcd(req))) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(401).json({ error:'Kërkohet autentikim.', ok:false, data:null });
  }
  const advanced = String(req.query?.advanced || '') === '1';
  return advanced ? IcdAdvanced(req, res) : IcdBase(req, res);
}

async function officialBrand(req, res) {
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  const asset = OFFICIAL_BRAND[queryValue(req, 'officialBrand')];
  if (!asset) return res.status(404).end();
  try {
    const result = await get(asset.pathname, { access:'private' });
    if (!result || result.statusCode !== 200 || !result.stream) return res.status(404).end();
    res.setHeader('Content-Type', result.blob?.contentType || asset.contentType);
    res.setHeader('Content-Length', String(result.blob?.size || ''));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    if (req.method === 'HEAD') return res.status(200).end();
    res.statusCode = 200;
    const stream = typeof result.stream.getReader === 'function'
      ? Readable.fromWeb(result.stream)
      : Readable.from(result.stream);
    stream.on('error', () => { if (!res.headersSent) res.statusCode = 500; res.end(); });
    return stream.pipe(res);
  } catch (error) {
    console.error('Official brand asset error:', error?.message || error);
    return res.status(404).end();
  }
}

function rowActionsRelease(req, res) {
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }

  const kind = queryValue(req, 'rowActionsRelease');
  let payload;
  if (kind === 'manifest') {
    payload = require('../registry-row-actions-release.json');
    if (payload?.schema !== 'medindex.registry.row-actions.release.v1') return res.status(503).end();
  } else if (kind === 'evidence') {
    payload = require('../registry-row-actions-build-evidence.json');
    if (payload?.schema !== 'medindex.registry.row-actions.build-evidence.v1') return res.status(503).end();
  } else {
    return res.status(404).end();
  }

  const body = `${JSON.stringify(payload, null, 2)}\n`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Length', String(Buffer.byteLength(body)));
  if (req.method === 'HEAD') return res.status(200).end();
  res.statusCode = 200;
  return res.end(body);
}

async function querySanityBlog(query, params = {}) {
  const url = new URL(BLOG_SANITY_URL);
  url.searchParams.set('query', query);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(`$${key}`, JSON.stringify(value));
  });

  const response = await fetch(url, {
    method:'GET',
    headers:{ Accept:'application/json' },
  });
  if (!response.ok) throw new Error(`Sanity request failed with ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.description || 'Sanity query failed');
  return payload.result;
}

async function publicBlog(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok:false, error:'Method not allowed' });
  }

  try {
    const slug = queryValue(req, 'slug').trim();
    if (slug) {
      if (!/^[a-z0-9-]{1,140}$/i.test(slug)) {
        return res.status(400).json({ ok:false, error:'Slug i pavlefshëm.' });
      }
      const post = await querySanityBlog(BLOG_DETAIL_QUERY, { slug });
      if (!post) return res.status(404).json({ ok:false, error:'Artikulli nuk u gjet.' });
      return res.status(200).json({ ok:true, post });
    }

    const posts = await querySanityBlog(BLOG_LIST_QUERY);
    return res.status(200).json({ ok:true, posts:Array.isArray(posts) ? posts : [] });
  } catch (error) {
    console.error('[blog-api]', error?.message || error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ ok:false, error:'Përmbajtja e blogut nuk mund të ngarkohet për momentin.' });
  }
}

module.exports = async function handler(req, res) {
  if (queryFlag(req, 'phase11Review')) return Phase11Review.handle(req, res);
  if (queryFlag(req, 'icdApi')) return icdApi(req, res);
  if (queryFlag(req, 'rowActionsRelease')) return rowActionsRelease(req, res);
  if (queryFlag(req, 'officialBrand')) return officialBrand(req, res);
  if (queryFlag(req, 'blog')) return publicBlog(req, res);
  if (queryFlag(req, 'populationVerification')) return PopulationVerification.handle(req, res);
  if (queryFlag(req, 'mediaLibrary')) return MediaLibrary.handle(req, res);
  return ClinicalEditor.handle(req, res);
};

module.exports._test = { OFFICIAL_BRAND, queryValue, queryFlag, rowActionsRelease, authorizedIcd, icdApi };
