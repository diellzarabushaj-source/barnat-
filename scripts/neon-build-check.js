'use strict';

const { neonRequest, exactCount, oidcToken } = require('../lib/neon-data-api');

function safeClaims(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return { sub:payload.sub || '', role:payload.role || '', aud:payload.aud || '', iss:payload.iss || '' };
  } catch {
    return { sub:'unreadable', role:'', aud:'', iss:'' };
  }
}

(async () => {
  if (!process.env.VERCEL) {
    console.log('Neon OIDC build check skipped outside Vercel.');
    return;
  }

  try {
    const token = await oidcToken();
    const { response } = await neonRequest('lab_tests?select=id&limit=1', {
      headers:{ Range:'0-0', 'Range-Unit':'items' },
      prefer:'count=exact',
    });
    console.log(`Neon MedIndex connected through Vercel OIDC. Lab tests: ${exactCount(response) ?? 'unknown'}.`);
    console.log(`Neon OIDC identity: ${JSON.stringify(safeClaims(token))}`);
  } catch (error) {
    const token = await oidcToken().catch(() => '');
    console.warn(`Neon OIDC build check limited: ${error.message}`);
    console.warn(`Neon OIDC identity: ${JSON.stringify(safeClaims(token))}`);
  }
})();
