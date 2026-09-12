'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

const shell=read('antibiotiket-shell.js');
const hard=read('antibiotiket-clinical-hardening.js');
const agePrecision=read('antibiotiket-age-precision.js');
const css=read('antibiotiket-clinical-hardening.css');
const prescription=read('antibiotiket-prescription.js');
const prep=read('antibiotiket-parenteral-prep.js');

// Fail-visible module loading.
assert.match(shell,/clinical-completeness-v2/);
assert.match(shell,/clinical-age-precision-v1/);
assert.match(shell,/clinical-hardening-v1/);
assert.match(shell,/modalitet i degraduar/);
assert.match(shell,/Mos përdor pjesën e munguar për vendim final/);

// Age is not allowed to be inferred as a clinical fact from weight.
assert.match(hard,/reconcileAgeFromWeight/);
assert.match(hard,/Mosha klinike duhet zgjedhur veçmas/);
assert.match(hard,/Pesha nuk përdoret si zëvendësim i moshës/);
assert.match(agePrecision,/id:'1m'/);
assert.match(agePrecision,/id:'2m'/);
assert.match(agePrecision,/id:'5y'/);
assert.match(agePrecision,/clinical-only bands never create a reference weight/i);
assert.match(agePrecision,/nuk i caktohet peshë referuese/i);

// Context-specific hard stops.
assert.match(hard,/STOP — alergjia ndaj cefalosporinës duhet specifikuar/);
assert.match(hard,/STOP — dyshim për sinusit të komplikuar/);
assert.match(hard,/Funksioni renal para dozës IV\/IM/);
assert.match(hard,/renal-adjusted dosing/);
assert.match(hard,/Azithromycin nuk duhet interpretuar automatikisht/);

// Product/route safety.
assert.match(hard,/“fuqi custom” është bllokuar/);
assert.match(prep,/HARD_BLOCK_ROUTE/);
assert.match(prep,/VERIFY_EXACT_PRODUCT/);
assert.match(prep,/HARD_BLOCK_WORKFLOW/);
assert.match(prescription,/Nuk ka përputhje të saktë me njësi të plota/);

// Mobile and readable safety UI.
assert.match(css,/@media\(max-width:560px\)/);
assert.match(css,/abx-hardening-stop/);
assert.match(css,/abx-hardening-card-gate/);
assert.match(css,/abx-runtime-error/);

console.log('Antibiotics frontend safety contract audit passed.');