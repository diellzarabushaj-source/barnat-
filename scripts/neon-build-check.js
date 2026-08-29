'use strict';

const { neonRequest, exactCount } = require('../lib/medindex-data-api.js');

(async () => {
  if (!process.env.VERCEL) {
    console.log('MedIndex Supabase health check skipped outside Vercel.');
    return;
  }

  try {
    const { response } = await neonRequest('lab_tests?select=id&limit=1', {
      headers:{ Range:'0-0', 'Range-Unit':'items' },
      prefer:'count=exact',
    });
    console.log(`MedIndex Neon healthy. Lab tests: ${exactCount(response) ?? 'unknown'}.`);
  } catch (error) {
    console.warn(`MedIndex Supabase health check limited: ${error.message}`);
  }
})();
