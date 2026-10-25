# ICD description retrieval: evidence and context guard

The failure was broader than the two blood examples: a valid ICD code/title pair
could still describe a finding the user did not supply. This change constrains
description search across clinical systems, before results reach the browser.
It does not establish diagnoses or certify clinical accuracy.

## Request and result contract

- Every generated candidate must include a short, contiguous excerpt from the
  anonymous input. The server checks the excerpt, canonical WHO code/title pair,
  current context and existing bleeding-origin constraints. Missing or invented
  excerpts fail closed. English/SQ/Latin canonical text belongs to the catalog.
- Negated, historical and family findings cannot support active patient findings.
  Clause boundaries, repeated mentions and the intrinsically negative expressions
  “nuk mbushem me fryme” / “nuk dal jashte” are covered separately.
- Site conflicts, unsupported diabetes type, selected aetiological qualifiers,
  laterality, incompatible acute/chronic timing and selected complication states
  are rejected. These are retrieval checks, not a complete clinical ontology.
- Known current symptom phrases use the existing symptom vocabulary. Symptom
  candidates must have a matching named term, symptom relation or compatible pain
  expression. Single symptoms cannot support unnamed causes. Unnamed differential
  candidates need multiple quoted positive symptoms and an existing curated
  retrieval relation; they remain possibilities for clinician assessment.
- Valid symptom candidates precede differential candidates. Current known symptoms
  remain available when model candidates are rejected. Short exact symptom phrases
  use a conditional catalog path without an external model call.
- The page shows a neutral explanation grounded in the quoted input, instead of
  arbitrary model reasoning. If a candidate is rejected, a current-symptom/site/
  duration clarification remains visible, including when there are zero results.
  No result is automatically selected or converted into a saved diagnosis/alias.
- The model receives current/excluded known findings and canonical retrieval hints.
  Negated/family/history clauses are excluded from positive hint ranking. Cache
  revision `description-v5-evidence` prevents reuse of earlier unchecked outputs.
- Existing explicit provider consent, ownership, CSRF, cancellation, deadlines,
  credential fallback and secret handling remain in place. No migration or provider
  key changes are required. Input and rejected model content are not logged.

## Scope and limitations

The vocabulary and bilingual matching are finite. Unusual wording, complex
coordination, mixed present/history narratives and unsupported clinical qualifiers
can cause a clarification instead of a result. A source excerpt is necessary, not
proof of semantic equivalence or a diagnosis. The language model and curated
retrieval relations can still miss or misrank possibilities. No probability,
clinical verification badge or assertion that errors are impossible is added.

The pain-in-throat fallback uses R07.0 for an unqualified pain description;
it does not turn a sore throat into confirmed acute pharyngitis. Acute sore throat
NOS has separate indexing conventions and requires review of the actual wording.
See the canonical catalog and the [NHS ICD tabular list for R00–R09](https://classbrowser.nhs.uk/ICD-10-5TH-Edition/vol1/block-r00-r09.htm).
Existing blood-origin references remain in `icd-bleeding-context-20261025.md`.
The [WHO guidance on large multimodal models in health](https://www.who.int/publications/i/item/9789240084759)
provides the general oversight context, not validation of this implementation.

## Regression evidence

`tests/icd-description-evidence-test.js` checks unsupported and supported results
across respiratory, gastrointestinal, urinary, cardiac, neurological, ENT, skin,
musculoskeletal and endocrine examples. It also checks negative/current contrast,
family/history scope, exact excerpts, symptom-first output and neutral explanations.

`tests/icd-query-memory-browser.spec.js` exercises the actual server validator with
synthetic wrong model outputs at phone and desktop sizes in Chromium and WebKit:
negated fever, family diabetes, wrong pain site, conditional differential retrieval,
and zero-result clarification. Existing consent, cancellation, stale response,
offline, keyboard and blood-origin cases remain in the suite.

These are software regression checks, not prospective clinical validation.
