# Pediatric dose recovery audit — 2026-08-17

This document records the source-grounded recovery work performed after the pediatric calculator was changed to fail closed on undocumented or invalid dose ceilings.

## Runtime safety gate

Production code commit:

- `f69817bee95343110d2d87fc57ba571c0ca5523e` — `fix(pediatrics): fail closed on undocumented dose ceilings`

The gate classifies each configured pediatric maximum as `specified`, `absent`, `incomplete`, or `invalid`. Scalable `kg/*` and `m²/*` formulas require at least one documented compatible maximum before they can be `CALCULATOR_READY`. Fixed-dose formulas are not blocked solely because a cap is absent.

Production Vercel deployment for that commit reached `READY` and was aliased to `barnat-six.vercel.app`.

## Audit baseline

Before source recovery, among published, verified, scalable pediatric formulas with otherwise usable typed dose fields:

- 158 scalable candidates
- 32 with at least one documented cap
- 126 with no documented cap
- 0 value-without-unit cap records
- 0 unit-without-value cap records
- 0 zero-valued caps

The main problem was therefore missing ceiling semantics, not malformed cap pairs.

## Recovery policy

A row was recovered only when all of the following held:

1. The source was a regulator/official SmPC or equivalent authoritative label.
2. The ceiling was explicit for the regimen represented by the typed row.
3. Unit and period semantics could be represented by the calculator without inference.
4. The row remained linked to its published pediatric primary regimen via `pediatric_primary_regimen_id` / `dosage_regimens.source_key`.
5. The change was first applied and checked on a temporary Neon branch.
6. Production updates used guards so an intervening data change could not be silently overwritten.

Rows whose source/formulation/indication did not match the typed formula were left fail-closed or demoted to `in_review`.

## Batch 1 — explicit ceilings

Recovered 12 production rows:

| Registry | Product | Recovery |
|---|---|---|
| 14 | CEFTRIAXONE ABC | max daily `4 g` |
| 215–218 | LYVAM | max single `30 mg/kg/dozë` |
| 350 | VANCOTEN | max daily `60 mg/kg/ditë` |
| 357 | NIMEDINE | max single `25 mg/kg/dozë` |
| 360–361 | MEROPENEM/ANFARM, MEROPENEM/AMFARM | max single `40 mg/kg/dozë` |
| 2787–2789 | CEFEPIMA QILU | max single `2000 mg` |

Primary sources used included eMC SmPCs and CIMA/AEMPS product information already attached to the rows.

After Batch 1:

- 44 scalable rows with documented caps
- 114 still without caps

## Batch 2 — formulation- and indication-matched ceilings

Recovered 5 production rows:

| Registry | Product | Recovery | Source |
|---|---|---|---|
| 81–82 | FUARTE NEO | max daily `28 mg/kg/ditë` | https://www.medicines.org.uk/emc/product/4329/smpc |
| 1218 | siprosan | max single `750 mg` | https://www.medicines.org.uk/emc/product/4346/smpc |
| 2865 | CIPROFLOKSACIN | max single `750 mg` | https://www.medicines.org.uk/emc/product/7258/smpc |
| 3002 | Palonosetron 250 micrograms solution for injection | max single `1500 mcg` | https://www.medicines.org.uk/emc/product/12627/smpc |

The ciprofloxacin ceiling applies to the represented cystic-fibrosis/complicated-UTI/other-severe pediatric dosing. Anthrax has a lower ceiling and is not represented by these typed indications.

After Batch 2:

- 49 scalable rows with documented caps
- 109 still without caps

## Batch 3 — regimen completeness plus ceiling

Recovered 2 production rows where the authoritative SmPC explicitly supplied both frequency and maximum:

| Registry | Product | Recovery | Source |
|---|---|---|---|
| 515 | Fluconazole B.Braun 2 mg/ml | `1 dose/day`, `24 h`, max daily `400 mg` | https://www.medicines.org.uk/emc/product/15231/smpc |
| 2392 | KLACID 250 mg/5 ml | `2 doses/day`, `12 h`, max single `500 mg` | https://www.medicines.org.uk/emc/product/12807/smpc |

These rows were not reopened using a ceiling alone; the missing typed frequency was restored from the same source first.

After Batch 3:

- 51 scalable rows with documented caps
- 107 still without caps

## Batch 4 — dispersible deferasirox and source consistency

### Recovered

Registry 48–49 (`FUARTE`) are stored as **dispersible tablets** with `20 mg/kg/ditë`. Their attached eMC SmPC is for a film-coated deferasirox product, but its official conversion table explicitly gives both formulations: dispersible starting dose `20 mg/kg/day` and maximum `40 mg/kg/day`. The rows were therefore recovered with:

- max daily `40 mg/kg/ditë`
- source: https://www.medicines.org.uk/emc/product/13336/smpc

### Demoted to `in_review`

Two film-coated clarithromycin tablet rows had a typed automatic formula of `7.5 mg/kg/dozë`, while their own tablet SmPCs use adult/adolescent fixed dosing at age 12 years and above. Their typed automatic formula was therefore demoted from `verified` to `in_review`; the stale `pediatric_verified_at` timestamp was cleared.

| Registry | Product | Source |
|---|---|---|
| 805 | Monoclar | https://www.medicines.org.uk/emc/product/15000/smpc |
| 1145 | DEKLARIT | https://www.medicines.org.uk/emc/product/10641/smpc |

Their `dosage_regimens` text remains `text_verified`, because that text correctly distinguishes `<12 years -> pediatric suspension 7.5 mg/kg` from `>=12 years -> tablet/adult dosing`. Only the unsafe typed automatic formula was demoted.

## Current state after these batches

Current production audit:

- **156** published + verified scalable candidates
- **53** with a documented cap
- **103** still without a documented cap and therefore fail-closed
- **2** known typed formula/source mismatches explicitly demoted to `in_review`

The reduction from 158 to 156 verified scalable candidates is intentional: the two clarithromycin tablet formulas are no longer counted as verified automatic formulas.

## Deliberately deferred

The following classes should not be reopened by simply inserting a numeric ceiling:

- PRN regimens where the source gives a *maximum frequency* rather than a scheduled frequency (for example metoclopramide and paracetamol).
- Steroids and specialist regimens with indication-dependent ceilings.
- Continuous infusions where the ceiling depends on monitoring/titration.
- Biologics/oncology regimens where indication, cycle, specialist-only use, and administration context are essential.
- Rows whose source/formulation does not support the exact typed formula.

These remain fail-closed until the data model can represent the missing semantics without converting free text into arithmetic.

## Next audit target

Prioritize the remaining 103 fail-closed scalable rows by:

1. exact official source attached,
2. explicit dose + frequency + maximum in that source,
3. one indication/regimen represented by the typed fields,
4. primary-regimen binding present,
5. no renal/hepatic/specialist dependency required to interpret the base formula.
