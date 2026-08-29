'use strict';

const MIGRATOR_URL = 'https://ftuchtmolddhhsdcwnqe.supabase.co/functions/v1/phase5-migrate-once';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok:false, error:'method_not_allowed' });
  }

  const token = String(req.query?.token || '').trim();
  if (token.length < 40 || token.length > 120) {
    return res.status(403).json({ ok:false, error:'forbidden' });
  }

  try {
    const url = new URL(MIGRATOR_URL);
    url.searchParams.set('token', token);
    const response = await fetch(url, {
      method:'GET',
      headers:{ Accept:'application/json' },
      cache:'no-store',
    });
    const body = await response.text();
    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json; charset=utf-8');
    return res.send(body);
  } catch (error) {
    return res.status(502).json({ ok:false, error:String(error?.message || error).slice(0,500) });
  }
};
