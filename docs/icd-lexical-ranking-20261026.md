# ICD search: preserve the requested concept

The full-catalog reproduction `faringitis acu` returned laryngitis first and
omitted acute pharyngitis. Several independent retrieval defects contributed:

- A long query token could match a one-letter candidate word by reverse prefix.
- The Latin title shown by the reader could come from the verified resource map,
  while the search profile only used the source row's empty Latin field.
- Alias expansion discarded remaining query qualifiers.
- A strongly matching child could promote an otherwise unrelated parent category
  above a directly matching category; six category slots always preceded children.
- Browser instant matching used different spelling and token-coverage rules.

## Resulting behavior

`icd-search-lexical.js` is a small shared browser/CommonJS retrieval module. It
keeps canonical text unchanged and supports accent normalization, bounded spelling
errors/transpositions, Latin/Albanian orthographic variants and typed prefixes.
Disease endings remain distinct from organ words. All meaningful query terms must
match distinct candidate tokens; function words cannot stand in for a long term.

The authoritative Latin title map is added to an ephemeral searchable copy, not
written into canonical source rows. Alias expansions preserve remaining modifiers.
Words appearing only after `without`/`pa`/`sine` do not count as a positive match
unless the query requests that wording. An unspecified acute/chronic classification
is not treated as an explicit acute classification. Filtering such a tail cannot
turn the remaining words into an artificially exact canonical-title match.

Direct category matches precede weaker promoted parents. Closely ranked categories
stay together, then the matching family's subcodes appear before weaker families.
Generic unspecified concepts receive a small tie-breaking preference; maternal,
gestational and other specifically contextual classifications do not get that
generic preference. Exact/normalized ICD codes and existing symptom-first retrieval
remain in place. These are retrieval priorities, not inferred diagnoses.

The same matching rules run for instant category results and the hot search bank.
The API query revision and engine marker change to avoid old cached rankings.
The shared asset is versioned in the runtime manifest and discovered by the existing
clinical-page precache builder. No new AI call, credential, database write or
clinical verification status is introduced.

## Evidence and limits

`tests/icd-lexical-relevance-test.js` covers 38 real-catalog ranking cases, including
pharyngitis/laryngitis, acute/chronic qualifiers, generic pneumonia, hypertension
typos, exact/OCR-normalized codes, filters, distinct token coverage, source
immutability and matching parity between browser and server.

The ICD browser regression additionally holds the server response while checking
the instant first result, then checks the server result and several offline queries
at phone and desktop sizes in Chromium and WebKit. Normal typing makes no AI request.

The catalog identity of acute pharyngitis (J02) and its separation from laryngitis
were cross-checked against the [NHS ICD tabular list, J00–J06](https://classbrowser.nhs.uk/ICD-10-5TH-Edition/vol1/block-j00-j06.htm).
This is a software search regression suite, not prospective clinical validation.
Close spelling neighbours remain possible secondary retrieval candidates; selecting
a code still requires the clinician's assessment of the actual documentation.
