'use strict';

// Section 2 extraction.
//
// The salt and strength basis of a medicine is declared in SmPC section 2 and
// nowhere else in the label. Without it, a base-to-salt equivalence such as
// bisoprolol to bisoprolol fumarate can only be assumed, never proven from
// archived evidence - and a silent base-versus-salt error in a microgram drug
// like levothyroxine is a dosing error.
//
// This is kept separate from extractClinicalSections on purpose, and the tests
// below pin both reasons: coverage semantics must not shift, and section 2 must
// not swallow section 3.

const assert = require('node:assert/strict');
const SmPC = require('../lib/smpc-parser.js');

const LABEL = [
  '1. NAME OF THE MEDICINAL PRODUCT',
  'Bisoprolol 10 mg film-coated tablets',
  '',
  '2. QUALITATIVE AND QUANTITATIVE COMPOSITION',
  'Each film-coated tablet contains 10 mg bisoprolol fumarate.',
  'Excipient with known effect: contains lactose monohydrate.',
  '',
  '3. PHARMACEUTICAL FORM',
  'Film-coated tablet. White, round, scored.',
  '',
  '4.1 Therapeutic indications',
  'Treatment of stable chronic heart failure.',
  '',
  '4.2 Posology and method of administration',
  'The recommended starting dose is 1.25 mg once daily.',
  '',
  '5.1 Pharmacodynamic properties',
  'Beta-blocking agent.',
].join('\n');

const composition = SmPC.extractCompositionSection(LABEL);
assert.ok(composition, 'section 2 must be extracted.');
assert.equal(composition.code, '2');
assert.equal(composition.key, 'qualitative_and_quantitative_composition');

// The whole point: the salt is readable from this section.
assert.match(composition.text, /bisoprolol fumarate/i);
assert.match(composition.text, /10 mg/);

// It must stop at section 3, not run on into the rest of the label.
assert.equal(composition.terminatedAt, '3');
assert.doesNotMatch(composition.text, /PHARMACEUTICAL FORM/i,
  'section 2 must not swallow section 3.');
assert.doesNotMatch(composition.text, /Therapeutic indications/i);
assert.doesNotMatch(composition.text, /Pharmacodynamic/i);

// Falls back to section 4 when section 3 is absent, still without running on.
const noSectionThree = LABEL
  .replace('3. PHARMACEUTICAL FORM\nFilm-coated tablet. White, round, scored.\n\n', '');
const fallback = SmPC.extractCompositionSection(noSectionThree);
assert.ok(fallback, 'section 2 must still be found when section 3 is absent.');
assert.equal(fallback.terminatedAt, '4');
assert.match(fallback.text, /bisoprolol fumarate/i);
assert.doesNotMatch(fallback.text, /Therapeutic indications/i);

// A label with no composition section yields null rather than a guess.
assert.equal(SmPC.extractCompositionSection('4.2 Posology\nTake one daily.'), null);
assert.equal(SmPC.extractCompositionSection(''), null);

// A numbered list item starting with 2 must not be mistaken for the heading.
const decoy = [
  '2. Take one tablet twice daily',
  '',
  '2. QUALITATIVE AND QUANTITATIVE COMPOSITION',
  'Each tablet contains 50 micrograms levothyroxine sodium.',
  '',
  '3. PHARMACEUTICAL FORM',
  'Tablet.',
].join('\n');
const decoyResult = SmPC.extractCompositionSection(decoy);
assert.ok(decoyResult);
assert.match(decoyResult.text, /levothyroxine sodium/i,
  'the composition heading must win over a numbered list item.');
assert.doesNotMatch(decoyResult.text, /twice daily/i);

// Clinical coverage semantics must be untouched: section 2 is not a clinical
// section and must not appear in the clinical set or move the denominator.
assert.equal(SmPC.SECTION_TITLES['2'], undefined,
  'section 2 must stay out of SECTION_TITLES.');
assert.equal(Object.keys(SmPC.SECTION_TITLES).length, 9,
  'the clinical section set must remain 4.1 through 4.9.');

const clinical = SmPC.extractClinicalSections(LABEL);
assert.equal(clinical.sections['2'], undefined,
  'the clinical extractor must not return section 2.');
assert.ok(clinical.present.includes('4.1'));
assert.ok(clinical.present.includes('4.2'));
assert.equal(clinical.clinicalSectionCoverage, clinical.present.length / 9,
  'coverage must stay a ratio over the nine clinical sections.');

console.log('DRx SmPC composition section extraction passed.');
