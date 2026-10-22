# Recetat chapters 21–22 — reconciliation, 22 October 2026

All 131 published source guides in the final two prescription chapters now have a diagnosis-specific clinical overlay: 40 obstetrics/gynaecology and 91 paediatrics/neonatology. The established nested step cards, colours, spacing and responsive layout are retained. Practical instructions stay visible; source wording, provenance and technical explanations remain in the closed question-mark disclosure.

The release provides 31 structured plans and 100 individual planning guides. Individual guides open an empty therapy draft for the clinician; they do not transfer a hospital protocol, a neonatal dose or an incomplete source regimen into a prescription. Structured regimens require explicit alternatives and clinical confirmations where appropriate. There is no new automatic paediatric dose calculation or inference of actual age in Recetat.

## Material corrections

- Pregnancy: no routine antibiotics for a viral cough or sterile stone; a complete seven-day lower-UTI regimen with formulation/term/renal restrictions; local azoles for seven days for vaginal candidiasis; distinct pregnancy branches for chlamydia; complete combined PID regimens and separate inpatient treatment; partner management and recurrence guidance for trichomoniasis/BV.
- Gynaecology: symptomatic versus incidental cysts, fertility goals, individual hormonal cycles, precise tranexamic-acid course, GnRH depot distinctions and withdrawn ulipristal 5 mg indication. Antibiotics and combined contraceptives are not offered as automatic treatments for a simple ovarian cyst.
- Neonates: intravascular versus endotracheal adrenaline, GIR in mg/kg/min, maintenance versus resuscitation fluids, maternal antenatal steroids versus neonatal treatment, product-specific surfactant volumes, age-specific bilirubin thresholds and monitored infection/seizure treatment.
- Children: oral/IV concentration boundaries; paracetamol IV weight bands; antibiotic daily versus per-dose units; no routine bronchiolitis medications; iron measured as elemental iron; vitamin-D treatment distinguished from prevention; constipation phases; separate diarrhoea protocols and current zinc guidance; epilepsy syndrome/titration distinctions; treatment versus prophylaxis doses of tetanus immunoglobulin and product-specific rabies PEP.

## Evidence and source integrity

The 131 Sanity document IDs, revisions and editorial statuses matched a fresh published-metadata read. Canonical books were read as DOCX, preserving runs and tables; Volume II was exported afresh. Original source text is never replaced by a clinical interpretation. Exact semantic fingerprints bind each overlay, and a changed source disables reuse until reassessment. The legacy 16–22 dataset remains unchanged on disk; runtime composition uses the complete 16–20 and 21–22 datasets without duplicate IDs.

The read-only original-Rx comparison for chapters 20–22 covered 148 guides and 2,938 paragraphs with zero guide edits. All 574 current source guides rendered without exceptions; none of the active overlays had a source-fingerprint mismatch. Three pending editorial guides remain pending. This technical coverage does not certify every possible patient-specific dose or replace clinical judgement.

The overlay carries public references for each plan: official product information, WHO, CDC, NICE, RCH, specialty-society guidance and original consensus guidelines. Link checking identified and corrected stale paths; publisher/bot restrictions are distinguished from missing pages. No complete private book, patient information, credentials or browser state is published.

## Validation

- Complete existing suite: 211 test files; new standalone chapter suites add two, for 213 files checked against this release.
- Browser coverage: 108 Chromium/WebKit cases across 320, 390 and 1,440 px, including required alternatives, combined PID therapy, confirmation gates, formulation/route text, empty individual drafts, occupied-draft protection, filters and navigation.
- Production build and runtime asset version checks.
- Original source remains unchanged; no CMS writes or database migrations.

The 21–22 workflow runs its isolated clinical and browser regressions. Main publication also retains the existing project-wide checks. Runtime asset revision: `38-chapters-21-22-20261022`.

## Primary reference examples

- [CDC PID](https://www.cdc.gov/std/treatment-guidelines/pid.htm), [CDC candidiasis](https://www.cdc.gov/std/treatment-guidelines/candidiasis.htm), [NICE pregnancy lower UTI](https://www.nice.org.uk/guidance/ng109/chapter/Recommendations).
- [AHA/AAP neonatal resuscitation](https://cpr.heart.org/en/resuscitation-science/cpr-and-ecc-guidelines/neonatal-resuscitation), [NICE neonatal infection](https://www.nice.org.uk/guidance/ng195/chapter/Recommendations), [IV paracetamol SmPC](https://www.medicines.org.uk/emc/product/100803/smpc).
- [WHO pneumonia/diarrhoea guideline](https://www.who.int/publications/i/item/9789240103412), [UNICEF zinc implementation update](https://www.unicef.org/supply/market-update-oral-rehydration-salts-ors-and-zinc), [NICE epilepsy](https://www.nice.org.uk/guidance/ng217/chapter/treating-epileptic-seizures-in-children-young-people-and-adults).
