module.exports = async function handler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Metoda nuk lejohet.' });
  }

  const auth = await import('../lib/auth.mjs');
  const payload = {
    ok: true,
    service: 'MedIndex',
    version: '2026-07-23.2',
    node: process.version,
    auth: {
      sessionHours: auth.SESSION_TTL_SECONDS / 3600,
      hardened: auth.secureConfigurationEnabled(),
    },
    registry: {
      sourceConfigured: true,
      dosageSourceConfigured: Boolean(process.env.DOSAGE_SHEET_ID || 'default'),
      autoFillFlag: ['TRUE', '1', 'YES', 'PO'].includes(String(process.env.ENABLE_DOSAGE_AUTOFILL || '').toUpperCase()),
    },
    timestamp: new Date().toISOString(),
  };

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).json(payload);
};
