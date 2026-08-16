'use strict';

const PROJECT_ID = '4wdtp8cz';
const DATASET = 'production';
const API_VERSION = '2026-08-16';
const SANITY_URL = `https://${PROJECT_ID}.apicdn.sanity.io/v${API_VERSION}/data/query/${DATASET}`;

const LIST_QUERY = `*[_type == "blogPost" && defined(slug.current)] | order(publishedAt desc) {
  _id,
  title,
  "slug": slug.current,
  excerpt,
  category,
  tags,
  language,
  publishedAt,
  readingTimeMinutes,
  "author": author->{name, credentials, role, "slug": slug.current}
}`;

const DETAIL_QUERY = `*[_type == "blogPost" && slug.current == $slug][0] {
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
  "author": author->{name, credentials, role, bio, "slug": slug.current}
}`;

async function querySanity(query, params = {}) {
  const url = new URL(SANITY_URL);
  url.searchParams.set('query', query);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(`$${key}`, JSON.stringify(value));
  });

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Sanity request failed with ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.description || 'Sanity query failed');
  }
  return payload.result;
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const rawSlug = Array.isArray(req.query?.slug) ? req.query.slug[0] : req.query?.slug;
    const slug = String(rawSlug || '').trim();

    if (slug) {
      if (!/^[a-z0-9-]{1,140}$/i.test(slug)) {
        return res.status(400).json({ ok: false, error: 'Slug i pavlefshëm.' });
      }
      const post = await querySanity(DETAIL_QUERY, { slug });
      if (!post) return res.status(404).json({ ok: false, error: 'Artikulli nuk u gjet.' });
      return res.status(200).json({ ok: true, post });
    }

    const posts = await querySanity(LIST_QUERY);
    return res.status(200).json({ ok: true, posts: Array.isArray(posts) ? posts : [] });
  } catch (error) {
    console.error('[blog-api]', error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ ok: false, error: 'Përmbajtja e blogut nuk mund të ngarkohet për momentin.' });
  }
};
