# Dozologjia clarity review — 2026-09-20

The 43-regimen catalog remains the source of clinical rules. This release fixes empty prior-dose input becoming zero, requires explicit selection when several regimens match an indication, identifies populations in regimen choices, and includes the dose period and indication in copied summaries. Dose ranges remain ranges. Daily totals are never converted into an invented per-administration schedule.

Patient weight/age are retained in memory across regimen changes; prior-dose amounts and confirmations reset. The existing weight-to-age mapping is unchanged and remains an estimate, not proof of chronological age. “Pacient i ri” clears patient values and confirmations. Search also matches indications without accents. The initial shell and calculator share one authentication request.

## Source checks

- https://www.medicines.org.uk/emc/product/6594/smpc — adult metoclopramide: 10 mg per administration, both 30 mg/day and 0.5 mg/kg/day ceilings, at least six hours between administrations. Existing rules match; additional boundary tests cover the two ceilings.
- https://www.medicines.org.uk/emc/product/101465/smpc — pediatric postoperative ondansetron: 0.1 mg/kg IV, maximum 4 mg. Existing numeric rule matches; additional weight/cap/age tests added. Prevention and treatment differ in the evidence for children under two; this release does not claim a new indication-specific clinical certification.
- https://www.resus.org.uk/library/additional-guidance/guidance-anaphylaxis/emergency-treatment-anaphylactic-reactions — corrected source metadata to the May 2021 guideline rather than a claimed 2025 version.

## Validation and limits

Engine tests cover all 43 published regimens, required gates, units, maxima, products and sequence steps. Browser regression tests use a local synthetic session with the real catalog/calculation engine and cover indication search, explicit regimen selection, blank prior amounts, per-dose/day clipboard text, new-patient reset and mobile overflow. Workspace/formulation and deployment contract suites pass.

No new medication, indication or dose was invented to fill a gap. This is not independent clinical revalidation of every source, product, renal adjustment or hospital protocol. Some catalog sources still link to general institutional pages; those references require a separate product-specific source review before expanding clinical coverage. Performance change removes duplicate authentication and redundant pending calculations; no end-to-end production latency claim is made.
