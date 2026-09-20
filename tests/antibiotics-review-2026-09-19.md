# Antibiotics calculation and presentation review — 2026-09-19

Patient weight/age controls, reference bands, automatic age suggestion, eligibility and age-duration selection are unchanged.

## Verified changes

- Base CPS UTI amoxicillin/clavulanate: preserve 40/3 rather than 13.3 mg/kg/dose. At 18 kg this is 240 mg per administration and 720 mg/day. The current CORE4 overlay replaces these base UTI rows; this correction also protects use without that overlay.
- Preserve two decimal places in displayed coefficients (including 1.25 and 1.75); pass unrounded dose text to liquid/prescription consumers.
- Execute the existing CORE4 Penicillin V weight threshold: below 27 kg = 300 mg, at/above 27 kg = 600 mg per administration. The daily range follows the existing two-or-three-administrations choice. A reference weight cannot finalize this prescription.
- Fill the three missing GAS durations (amoxicillin, cephalexin, clarithromycin) with 10 days, explicitly citing the CPS GAS guideline separately from the CORE4 dose source.
- Replace CPS homepage links with the actual CORE4 table. Distinguish administration amount, daily total, dose interval and absent source maximum.

## Sources checked

- [CPS CORE4 table, December 2022](https://cps.ca/uploads/documents/2022_Dec_1_Antibiotics_Shortage_Tables_FINAL.pdf): active overlay doses and weight thresholds.
- [CPS GAS, table 1](https://cps.ca/en/documents/position/group-a-streptococcal): missing durations. Its Penicillin V boundary wording differs from CORE4 at exactly 27 kg; this change deliberately follows the existing CORE4 dose source, without combining the two thresholds.
- [CPS UTI, table 1, August 2026](https://cps.ca/en/documents/position/management-urinary-tract-infections): base dataset arithmetic and 7:1 formulation note.
- [Children's Mercy handbook v9.3](https://www.childrensmercy.org/siteassets/media-documents-for-depts-section/documents-for-health-care-providers/evidence-based-practice/clinical-practice-guidelines--care-process-models/outpatient-antibiotic-handbook.pdf): compared the existing non-CORE4 outpatient dose entries.
- [CDC GAS](https://www.cdc.gov/group-a-strep/hcp/clinical-guidance/strep-throat.html): base dataset comparison; CORE4 remains the live source.

## Validation

`node tests/antibiotics-daily-dose-test.js` and `node tests/antibiotics-page-ui-contract-test.js` pass. The new runtime test loads the shell BEFORE the data (production ordering), exercises 594 regimen/weight combinations, and checks thresholds, caps, exact transport and completed durations. Browser checks used the repository's local smoke server with synthetic authentication: GAS at 27 kg, liquid conversion, reference-weight prescription blocking, and 390 px mobile rendering.

## Limits

This is not a full clinical certification. The existing age inferred from weight remains an estimate; it is not proof of chronological age. CORE4 is a 2022 shortage document, not a claim that every regimen is the latest local guideline. Product-specific labeling, renal adjustments, all hospital/IV preparation records and local susceptibility were not independently revalidated. Multi-branch amoxicillin/clavulanate UTI instructions remain manual; their product ratios must not be inferred from amoxicillin strength alone. No production deployment is part of this review.
