module.exports = async function handler(req, res) {
  try {
    const auth = await import('../lib/auth.mjs');
    const token = auth.sessionFromRequest(req);
    if (!auth.verifySessionToken(token)) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(401).json({ error: 'Sesioni nuk është aktiv.' });
    }
    return require('./dosage.js')(req, res);
  } catch (error) {
    console.error('Dosage auth wrapper error:', error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'Dozologjia nuk u ngarkua.' });
  }
};
