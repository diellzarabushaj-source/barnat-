'use strict';

const { neonRequest, exactCount } = require('../lib/neon-data-api');

(async () => {
  if (!process.env.VERCEL) {
    console.log('MedIndex Neon connection check skipped outside Vercel.');
    return;
  }

  try {
    const { response } = await neonRequest('lab_tests?select=id&limit=1', {
      headers:{ Range:'0-0', 'Range-Unit':'items' },
      prefer:'count=exact',
    });
    console.log(`MedIndex Neon connected. Lab tests: ${exactCount(response) ?? 'unknown'}.`);
  } catch (error) {
    console.warn(`MedIndex Neon connection check limited: ${error.message}`);
  }
})();
