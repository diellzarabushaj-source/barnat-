'use strict';

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ region:process.env.VERCEL_REGION || 'unknown' });
};
