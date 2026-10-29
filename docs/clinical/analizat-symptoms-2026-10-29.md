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
