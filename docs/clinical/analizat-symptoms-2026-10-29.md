# Analizat: symptom-led workups — 29 October 2026

The supplied 20-symptom outline is implemented as a versioned clinical reference
layer on the existing authenticated laboratory catalog. This is decision support,
not a diagnosis, universal workup, laboratory availability list or clinical certification.
Patient age, pregnancy, severity, examination and local pathways remain relevant.

## Content and catalog reconciliation

- Added 20 searchable profiles in four symptom groups; retained the six existing
  diagnosis profiles and their database IDs.
- Compared the enrichment with the actual published catalog: 111 existing tests,
  27 reference additions, 138 total; all new profile links resolve. No database
  rows, grants, RLS policies or authentication settings are changed.
- Added CBC, ferritin, thyroid assays, HbA1c, hs-cTn, natriuretic peptides, lipase,
  pregnancy testing, blood ketones/gases/lactate, targeted microbiology, ACR,
  anti-CCP and a von Willebrand reference panel. Method and availability require
  confirmation with the receiving laboratory. No reference intervals are invented.
- Exact English assay identity prevents blood glucose/urine glucose and serum/
  urine bilirubin substitutions. Creatinine clearance is not eGFR. Urinalysis is
  not urine culture; routine stool examination is not pathogen culture/PCR;
  ordinary troponin is not assumed to be a high-sensitivity assay.
- Selected CBC suppresses its ten individually linked count/index components.
  Deselecting CBC restores independently requested components; manual additions
  are preserved.

## Clinical selection

Conditional tests start unchecked and enter the copied order only after explicit
selection. Typical headache, mild acute cough, uncomplicated constipation and
mild acute diarrhea do not silently produce broad laboratory orders.

Chest pain emphasizes urgent assessment, ECG and serial assay-specific hs-cTn;
elevation alone does not establish myocardial infarction. Throat testing separates
GAS antigen/culture from EBV serology. Stool testing is targeted to the clinical
context. Urine culture indications include pregnancy, men/children according to
the applicable pathway, recurrence/complication and suspected pyelonephritis.
Acute monoarthritis requires consideration of septic arthritis and synovial
assessment. Heavy menstrual bleeding starts with CBC; thyroid/coagulation/vWF
testing is conditional. eGFR is an assessment derived from the appropriate
creatinine equation, not an invented standalone order.

Interpretation, non-laboratory examinations and references are expandable;
conditional urgent warning signs remain visible. Source URLs are maintained in
`lib/lab-symptom-guide.js` (CDC, NICE, SAEM, ACC, ADA, IDSA, ACG, AGA and IAP).
The archived AGA 2013 laboratory recommendations are explicitly labeled as such
alongside the 2026 update on refractory constipation. This layer does not assign
a new clinical approval status to existing records.

## Interaction and verification

- Search supports Albanian spelling without diacritics, English aliases and ICD
  terms; profiles can be filtered by group and combined without duplicate orders.
- Picker supports multiple selections, an explicit Done button, keyboard
  navigation and Escape. Outside-click detection uses the original event path so
  replacing a selected option does not inadvertently dismiss the picker.
- Selection engine tests cover conditional opt-in, copied-order contents, exact
  specimen identities, CBC coverage/restoration, idempotence and preserved input.
- Browser tests exercise all 20 profiles, failed-source behavior and deliberate
  orders at 320, 390 and 1440 pixels in Chromium and WebKit. They check overflow,
  picker bounds, removal/reset, optional tests and disabled copying of empty orders.
- Live catalog reconciliation is a read-only check. The authenticated endpoint
  remains the data source; an unavailable source does not fabricate a workup.
- The catalog request carries a versioned revision so the device worker's cached
  six-profile dataset cannot mask the new twenty symptom profiles. This keeps
  existing offline data and authentication intact rather than clearing storage.

The versioned additions are maintained in code and returned with the existing
catalog, rather than inserted as newly approved laboratory database records.

## 23 November 2026 expansion

The guide now covers 55 versioned profiles (20 original symptom profiles and
35 additional presentations or diagnoses), alongside six existing Supabase
diagnoses. The original profile slugs and legacy diagnosis IDs remain valid.

- `lib/lab-workup-profiles.js` contains the new profiles, additional examinations
  and profile-level references. It cites the Kosovo Ministry of Health for local
  UTI, asthma and hypertension guidance, supplemented by international references
  with the relevant recommendation section where available.
- `lib/lab-result-findings.js` contains interpretation by assay identity. Profiles
  can override either direction for the specific presentation. A result direction
  without clinical meaning is omitted. Qualitative tests use positive/negative
  terminology. A low result, a normal result and a result below a decision
  threshold have different meanings where stated in the interpretation.
- The order builder still includes only selected laboratory entries. Additional
  examinations such as ECG, ultrasound, CT, spirometry and otoscopy are displayed
  in the clinical profile with their indications. Profiles that usually need
  examination alone give an explicit empty laboratory plan.
- Conditional orders, including D-dimer, hs-cTn, and acute-care investigations,
  start unchecked. Selecting multiple profiles deduplicates the test while
  keeping each indication and its own result interpretation.
- The API catalog revision is `lab-workups-20261123-v2`. There is no database
  migration. Reference-only assays do not assert local stock, availability,
  methods or reference intervals. The sourced content is clinical decision
  support and has not been formally approved as a new local protocol.
- Verification covers exact identities, profile and assay uniqueness,
  idempotence, contextual results, examination-only profiles, intentional
  ordering, access failure, and 320/390/1440 px browser layouts.

## Catalog and navigation

The Analizat page offers a clinical plan, a laboratory catalog, and an
examinations catalog. The laboratory catalog reads every assay from the same
authenticated dataset used by the plan. The search accepts Albanian or English
names, and category filtering and progressive paging make the catalog
available on small screens. Searches give matches in names priority over
matches in clinical context, and each catalog retains its query, filter and
loaded pages during the visit. Adding or removing a linked assay updates its
selection in the plan. The catalog identifies components covered by a panel.

The examinations catalog indexes the examinations in all loaded profiles.
Identically named examinations share a card with the applicable clinical
contexts. Contexts can be filtered by clinical group. The card shows the
existing indication and findings. The user can explicitly add the profile to
the plan or return to its guidance when it is already selected. Examination
entries are never added to the laboratory order.
The views are linkable with `?view=analiza` and `?view=ekzaminime`.
