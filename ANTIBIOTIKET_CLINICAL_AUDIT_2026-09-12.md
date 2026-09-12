# DRx Antibiotikët — Clinical hardening audit

Date: 2026-09-12

## Release scope

This release covers the 12 pediatric outpatient diagnosis pathways already exposed by the Antibiotikët workspace and their linked hospital IV/IM escalation pathways. It is a clinical decision-support calculator, not a substitute for diagnosis, local susceptibility data, specialist judgment, renal/TDM workflows, or neonatal protocols.

## Source hierarchy

- Children’s Mercy current outpatient/CAP/AOM/ABRS/SSTI/bite pathways for operational pediatric regimens.
- CDC current Group A Streptococcal pharyngitis guidance for GAS.
- Canadian Paediatric Society 2026 UTI statement for cystitis/febrile UTI and parenteral UTI stewardship.
- CPS 2026 preseptal/orbital cellulitis statement for orbital red-flag safety boundaries.
- CHOP beta-lactam allergy pathway for allergy risk hard stops.
- Exact official product labels (DailyMed) only for formulation strength, reconstitution, concentration, route and administration details.

## Hard release rules

1. Chronologic age is a separate clinical input. Weight may suggest an age band for orientation but may not unlock age-gated treatment.
2. Max dose is applied before mg-to-mL conversion.
3. Combination products calculate on the explicitly named active component (amoxicillin for amox/clav; trimethoprim for TMP-SMX).
4. Product-sensitive drugs cannot use an unrestricted custom concentration that would bypass a ratio, product or weight restriction.
5. IV and IM are distinct routes. A preparation record must match the regimen route and exact product/presentation before mL can be calculated.
6. Renal-sensitive hospital regimens do not become final doses in the generic calculator when renal status is impaired or unknown.
7. Vancomycin remains a specialist/TDM workflow; neonatal dosing remains outside the general pediatric module.
8. A severe delayed beta-lactam reaction (SCAR/SJS/TEN/DRESS) is a hard safety boundary.
9. Orbital/neurologic red flags and other high-acuity findings suppress simple outpatient finalization.
10. If a clinical runtime fails to load, the UI declares degraded mode instead of silently appearing complete.

## 2026-09-12 audit corrections

- UTI scope updated to CPS 2026 age range beginning at 1 month.
- Nitrofurantoin cystitis fixed at a full 5-day course.
- UTI amoxicillin/clavulanate pinned to the 7:1 formulation path (400/57 mg per 5 mL reference presentation).
- Mammalian bite combination caps oral clindamycin at 450 mg/dose.
- ABRS restricted to the 1–18 year pathway population; current cefuroxime and cefixime+clindamycin alternatives added; age-dependent levofloxacin is no longer auto-finalized by a generic weight-only rule.
- CDC cefadroxil GAS alternative added with exact liquid/solid formulation references.
- Current AOM cefuroxime option added and ceftriaxone x1 versus treatment-failure x3 pathways separated by route/scenario.
- CAP cefuroxime option added and severe-delayed clindamycin corrected to 10–13 mg/kg/dose q8h (max 600 mg/dose).
- Cephalosporin allergy A4 receives a reaction-severity refinement instead of being treated as a single automatic substitution bucket.
- CAP atypical toggle explicitly states that it is a filter for atypical coverage and not automatic replacement of typical CAP coverage.

## Intentionally deferred / blocked

- Neonatal dosing.
- Renal-adjustment dose tables in the general calculator.
- Final vancomycin dosing/AUC/TDM.
- Aminoglycoside UTI auto-dosing until the renal/TDM and exact-product preparation workflow is implemented.
- Any local Kosovo susceptibility claim unless a current, validated pediatric antibiogram is available.

These are intentional safety gates, not missing values to be guessed.