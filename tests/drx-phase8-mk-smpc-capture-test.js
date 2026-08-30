'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const s=fs.readFileSync('scripts/capture-drx-phase8-mk-smpc.js','utf8');

assert.match(s,/drx-phase8-mk-smpc-capture-v1/);
assert.match(s,/downloadguide\/52577/);
assert.match(s,/downloadguide\/51848/);
assert.match(s,/lekovi\.zdravstvo\.gov\.mk/);
assert.match(s,/payload is not PDF/);
assert.match(s,/rawSha256:digest/);
assert.match(s,/snapshotId:digest/);
assert.match(s,/CLINICAL_REVIEW_ONLY/);
assert.match(s,/publicationAllowed:false/);
assert.match(s,/automaticVerificationAllowed:false/);
assert.match(s,/automaticPublicationAllowed:false/);
assert.doesNotMatch(s,/SUPABASE_SECRET|service_role|insert\s+into|update\s+/i);

console.log('DRx Phase 8 MK SmPC capture contract: PASS');
