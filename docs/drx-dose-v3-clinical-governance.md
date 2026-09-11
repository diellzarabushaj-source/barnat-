# DRx Dosierung V3 — Clinical Governance

Status: **design/implementation candidate; not a production authorization**  
Updated: **2026-09-11**

## Goal

DRx Dose V3 must behave as a clinically governed evidence system, not as a generic drug-dose lookup table. A structured rule is publishable only when its clinical context, source identity, source section, product binding and human review are all explicit and reproducible.

## Regulatory source strategy

For EU/Kosovo use, the primary dosing evidence remains authorized product information, especially SmPC section **4.2 Posology and method of administration**. The source hierarchy remains jurisdiction-aware:

1. EMA centrally authorized product information.
2. eMC or an EU/EEA national regulator when product identity and authorized information match the intended jurisdiction.
3. Kosovo AKPPM evidence when available and sufficiently specific.
4. Official non-EU regulator/label sources, including DailyMed/FDA, as review-only fallback or cross-check evidence.
5. Secondary drug databases only for discovery/cross-checking; never as sole automatic publication evidence.

A higher-ranked source does not override a jurisdiction-specific discrepancy automatically. Conflicts enter clinical review.

## EMA ePI / FHIR alignment

The clinical hardening contract targets the EMRN ePI Implementation Guide v1.0.0 and records the EMA section code for SmPC 4.2 (`200000029800`) plus the Posology, Paediatric population and Method of administration subsection codes. This is an interoperability mapping, not a claim that the internal DRx schema is itself a FHIR resource.

FHIR dosage concepts inform the DRx structure where useful: sequence, timing, route, dose, rate and maximum-dose semantics. DRx retains its own deterministic clinical rules and provenance requirements rather than blindly mirroring FHIR.

## Dose semantics

A rule must preserve the distinction between:

- fixed dose and fixed volume;
- per-dose vs per-day weight-based dosing;
- mg/kg vs mg/m² vs unit-based dosing;
- loading, maintenance, titration, taper, rescue, prophylaxis, cyclic and continuous phases;
- dose amount vs infusion/dose rate;
- frequency vs interval vs duration;
- maximum per administration vs maximum per day.

If normalization would erase meaning, the rule remains manual-review/non-computable until an explicit safe representation exists.

## Paediatric and neonatal rules

Age and weight are not sufficient for every neonatal regimen. The hardening layer therefore permits gestational age and postmenstrual age, but these fields must only be populated when the authoritative source explicitly requires them. DRx must never infer neonatal maturity from chronological age alone.

## Renal dosing

CrCl and eGFR are separate clinical measures and must never be silently interchanged. When the source specifies a calculation method, it must be retained. The hardening model supports Cockcroft-Gault, CKD-EPI, source-stated-unspecified and not-applicable states.

Dialysis-specific instructions can record HD, PD, CRRT and source-defined modalities together with timing relative to dialysis. Dialysis fields are valid only for a dialysis-specific adjustment.

## Hepatic dosing

Child-Pugh classes are structured only when the source explicitly states them or explicitly defines the mapping. Text such as "mild/moderate/severe hepatic impairment" must not be converted into Child-Pugh classes by inference.

## Units and coding

The original source unit remains authoritative. DRx may additionally store an unambiguous UCUM representation for machine calculation. If a unit cannot be mapped safely, the UCUM field remains empty and the rule requires manual handling rather than a guessed conversion.

Route and pharmaceutical-form coding are optional interoperability layers. Source wording must remain semantically primary.

## Parser governance

Parser, NLP and LLM output is **candidate data only**. A parser may extract or propose dose values, frequency, route, population, renal/hepatic conditions and source anchors, but it may not mark a rule as clinically verified or published.

The following always require human review before publication:

- source conflicts;
- ambiguous dose basis or unit;
- combination-product ambiguity;
- off-label content;
- high-risk dose rules;
- non-EU fallback evidence for EU/Kosovo use;
- ambiguous renal or hepatic criteria;
- lossy normalization;
- missing required patient inputs.

Confidence scores assist triage only; they are not evidence of correctness.

## Publication gate

A clinical rule must fail closed unless all required conditions pass:

- authoritative source is eligible for the intended jurisdiction;
- immutable source snapshot and exact section hash revalidate;
- indication/population/route context is complete;
- dose basis and units are semantically valid;
- required patient inputs are declared;
- renal/hepatic adjustments are verified when required;
- exact product binding is verified when conversion depends on formulation/strength;
- safety validation has passed;
- human clinical review is complete;
- no unresolved source conflict remains.

## Versioning

Dose changes must be represented as a new rule/version with an explicit supersession link and reason. Published source evidence is immutable. A newer SmPC does not rewrite historical evidence; it creates a new snapshot and triggers revalidation.

## Runtime safety

The calculator must not produce a numeric patient dose when a required input is absent. Examples include weight for mg/kg rules, BSA for mg/m² rules, or the specified renal measure for renal-adjusted dosing. The UI should state which input is missing rather than substitute defaults.

The runtime should expose the verified source/version and rule status near the computed result so a clinician can distinguish published clinical evidence from draft/review data.

## Rollout order

1. Keep current V2 runtime unchanged.
2. Apply the existing V3 base candidate only in staging after baseline verification.
3. Apply `drx-dose-v3-clinical-hardening-candidate.sql` in staging.
4. Run contract, publication-gate, renal/hepatic, golden-case and security tests.
5. Extend the V3 RPC/runtime projection only after the new fields are validated.
6. Pilot a small clinically diverse set: simple adult oral, paediatric weight-based, renal-adjusted, hepatic-adjusted, loading/maintenance, infusion-rate and neonatal cases.
7. Require clinical sign-off before any cutover or public publication.

## Non-goals

This hardening does **not** authorize importing GitHub dosage datasets as clinical truth, does not auto-publish DailyMed/FDA data into an EU/Kosovo context, and does not replace clinician judgment or the authorized product information.
