'use strict';

function cleanRelease(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 96);
}

function currentRelease() {
  return cleanRelease(
    process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.GITHUB_SHA
    || process.env.VERCEL_DEPLOYMENT_ID
    || 'local-1.8.0'
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error:'Method Not Allowed' });
  }

  const payload = {
    id:currentRelease(),
    strategy:'single-version-v1',
  };

  if (req.method === 'HEAD') return res.status(204).end();
  return res.status(200).json(payload);
};
