'use strict';

const assert = require('node:assert/strict');
const SmPC = require('../lib/smpc-parser.js');

const html = `
<h2>4.1 Therapeutic indications</h2>
<p>Pain and fever.</p>
<h2>4.2 Posology and method of administration</h2>
<p>Use the lowest effective dose.</p>
<h2>4.3 Contraindications</h2>
<p>Hypersensitivity.</p>
<h2>4.9 Overdose</h2>
<p>Supportive care.</p>
<h2>5. Pharmacological properties</h2>
<p>Not part of section 4.</p>`;

const parsed = SmPC.extractClinicalSections(html);
assert.equal(parsed.indicationsSectionPresent, true);
assert.equal(parsed.doseSectionPresent, true);
assert.equal(parsed.sections['4.1'].text, 'Pain and fever.');
assert.equal(parsed.sections['4.2'].text, 'Use the lowest effective dose.');
assert.equal(parsed.sections['4.9'].text, 'Supportive care.');
assert.ok(parsed.missing.includes('4.4'));
assert.deepEqual(SmPC.publicationExtractionGate(parsed), {
  allowed:true,
  reason:'required_smpc_sections_present',
});

const missing = SmPC.extractClinicalSections('4.1 Therapeutic indications\nPain');
assert.equal(SmPC.publicationExtractionGate(missing).allowed, false);
assert.equal(SmPC.publicationExtractionGate(missing).reason, 'section_4_2_missing');

console.log('DRx SmPC parser contract passed.');
