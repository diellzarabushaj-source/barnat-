'use strict';

const { neonRequest, exactCount } = require('../lib/medindex-data-api.js');
const SystemHealthSnapshot = require('../lib/system-health-snapshot.js');

const MINIMUM_REGISTRY_ROWS = 3500;

async function count(path) {
  const { response } = await neonRequest(`${path}${path.includes('?') ? '&' : '?'}select=id&limit=1`, {
    headers:{ Range:'0-0', 'Range-Unit':'items' },
    prefer:'count=exact',
  });
  return exactCount(response);
}

async function publishRegistry() {
  if (!process.env.VERCEL) {
    console.log('MedIndex Supabase registry publication skipped outside Vercel.');
    return;
  }
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
    console.log('MedIndex Supabase registry publication skipped outside production.');
    return;
  }

  const eligibleFilter = 'drugs?source_hash=not.is.null&trade_name=not.is.null&registry_number=not.is.null';
  const eligible = await count(eligibleFilter);
  if (!Number.isFinite(eligible) || eligible < MINIMUM_REGISTRY_ROWS) {
    throw new Error(`Supabase registry publication stopped: ${eligible ?? 'unknown'} eligible rows; expected at least ${MINIMUM_REGISTRY_ROWS}.`);
  }

  await neonRequest(eligibleFilter, {
    method:'PATCH',
    body:{ editorial_status:'published', is_published:true },
    prefer:'return=minimal',
  });

  const published = await count('drugs?editorial_status=eq.published&is_published=eq.true');
  if (!Number.isFinite(published) || published < MINIMUM_REGISTRY_ROWS) {
    throw new Error(`Supabase registry publication verification failed: ${published ?? 'unknown'} published rows.`);
  }
  await SystemHealthSnapshot.refreshBestEffort('registry-publish');
  console.log(`MedIndex Supabase registry publication completed: ${published} published rows.`);
}

publishRegistry().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
