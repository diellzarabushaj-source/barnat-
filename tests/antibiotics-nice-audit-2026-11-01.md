# Antibiotikët: audit against one clinical authority

Reviewed 2026-11-01. Selected authority: **NICE**, following the user's explicit
choice to send cases outside the verified coverage to separate assessment.
This is a focused outpatient implementation, not a reproduction of every NICE
antibiotic, severe-infection pathway or specialist recommendation.

## Infection-by-infection comparison and disposition

| Infection | Primary NICE reference | Finding and resulting behavior |
|---|---|---|
| AOM | [NG91, recommendations 1.1 and table 1](https://www.nice.org.uk/guidance/ng91/chapter/recommendations) | The published table is for under-18s. Adult NHS Fife rows no longer activate. The routine tool excludes under-3-month infants. The reference flow is conditional on a clinically established antibiotic indication; per user preference it has no no-antibiotic/backup/start selectors. NICE decision criteria remain in the folded source details. Child amoxicillin age bands remain 125/250/500 mg TID; routine course 5 days within NICE's 5–7-day interval. Failure after at least 2–3 days requires reassessment before co-amoxiclav. |
| Acute sore throat / GAS | [NG84, recommendations 1.1.6–1.1.13 and tables 1–2](https://www.nice.org.uk/guidance/ng84/chapter/Recommendations) | FeverPAIN/Centor and the indication decision belong to clinical assessment and folded NICE guidance; the UI does not add start/backup/no-antibiotic selectors. Penicillin V's QDS/BID age bands and macrolide alternatives remain source-bound. Ten days is the routine Penicillin V default within the published 5–10-day interval. The separately sourced CDC amoxicillin and native Ospen protocols no longer activate. A positive RADT checkbox is no longer a prerequisite for this NICE workflow. |
| Community-acquired pneumonia | [NG250, 1.6 and tables 1–2](https://www.nice.org.uk/guidance/ng250/chapter/Recommendations) | The old atypical checkbox could produce a routine add-on for non-severe childhood disease. This is corrected: atypical coverage is a single alternative in non-severe disease; an additional macrolide is distinct and only available for assessed moderate adult disease. Childhood 12–17 clarithromycin retains the published 250–500 mg range. The 3-day course is limited to 3 months–11 years without complications/underlying disease; routine older/adult courses remain 5 days. Other profiles leave this routine pathway. |
| Acute sinusitis | [NG79, 1.1 and tables 1–2](https://www.nice.org.uk/guidance/ng79/chapter/Recommendations) | The initial regimen is explicitly for an assessed indication. NICE guidance on short symptoms/no antibiotics is retained in the source details; there is no prescribing-strategy selector. ≥10 days alone does not imply an antibiotic. Penicillin V age bands remain QDS for 5 days; reassessed failure/high risk selects the second-line context. The Danish IU regimen is inactive. Ospen remains an AKKPM product reference, and cannot silently replace the NICE mg regimen. |
| Lower UTI / cystitis | [NG109, 1.4 and tables 1–4](https://www.nice.org.uk/guidance/ng109/chapter/Recommendations) | The inherited minimum of 2 months was inconsistent with routine NG109 prescribing; the active minimum is 3 months. Nitrofurantoin IR remains 0.75 mg/kg QDS below 12, or 50 mg QDS in the older band, with renal and upper-tract/prostate/term restrictions. Three-day versus seven-day courses follow age, pregnancy and sex; pregnancy tables apply from 12 years. Culture-based amoxicillin and other implemented alternatives retain their individual gates. |
| Febrile UTI / pyelonephritis | [NG111, recommendations and antibiotic tables](https://www.nice.org.uk/guidance/ng111/chapter/Recommendations) | Under-3-month infants leave routine outpatient treatment. Cefalexin retains the age-band oral schedule and a routine 7-day course within 7–10 days; culture-susceptible co-amoxiclav and suitability-gated ciprofloxacin remain separate options. Nitrofurantoin is not an upper-tract substitute. Pregnancy uses its own first-choice cefalexin route. |
| Impetigo | [NG153, 1.1 and tables 1–2](https://www.nice.org.uk/guidance/ng153/chapter/Recommendations) | Localised non-bullous disease does not automatically produce oral antibiotics. The oral route is conditional on extent/bullous/systemic assessment, with flucloxacillin or a suitable macrolide for 5 days. Topical and oral therapy are not silently combined. The topical AKKPM binding is not implemented, so the local-treatment route remains assessment information, not a fabricated product prescription. |
| Non-purulent cellulitis / erysipelas | [NG141, 1.1 and tables 1–2](https://www.nice.org.uk/guidance/ng141/chapter/Recommendations) | Flucloxacillin and appropriate alternatives remain NICE age-band options. Routine 5 days is within the 5–7-day interval; deterioration requires reassessment. Purulence/abscess is not treated as this non-purulent pathway. The selected dose is a routine source choice, not a claim of a universal maximum. |
| Human/animal bites | [NG184, 1.1 and tables 1–2](https://www.nice.org.uk/guidance/ng184/chapter/Recommendations) | No indication, high-risk prophylaxis and established infection remain distinct. Implemented co-amoxiclav follows its age/formulation table, with program-selected 3 days for prophylaxis and 5 days for infection. The CM TMP-SMX + clindamycin combination is not imported. Allergy, unusual organism and complex wound profiles require the appropriate separate pathway when no implemented NICE option fits. Wound/tetanus/rabies assessment remains essential. |
| General wound / laceration | Scope exclusion | The former 875/125 mg BID row combined a product label with a different organization's duration. It is no longer automatically prescribed. Clean wounds, contaminated injuries and infected wounds are not interchangeable diagnoses. Assessment text directs wound care, tetanus and deep-infection evaluation. |
| Cutaneous abscess | Scope exclusion | The prior drainage/TMP-SMX/clindamycin rows came from CM/CPS. They are not relabelled NICE. The infection stays searchable, but requires assessment for source control and the need for antibiotics; no automatic prescription. |
| Preseptal / periorbital cellulitis | Scope exclusion; [NG141 eye/nose caution](https://www.nice.org.uk/guidance/ng141/chapter/Recommendations) | NG141's near-eye/near-nose table is not presented as a complete preseptal/orbital pathway. A separate assessment route is displayed; orbital signs or an inadequate eye examination require urgent assessment. No automatic broad-table substitution. |
| Acute cervical lymphadenitis | Scope exclusion | The previous CM pediatric regimen is not extended into adults or renamed NICE. The searchable route directs etiological/deep-neck/abscess assessment; no automatic antibiotic. |

## Enforced source and product boundaries

- Every active numerical regimen is from one of the nine explicitly allowed NICE
  guideline identifiers. A string merely starting with `nice-` is insufficient.
- CDC amoxicillin, DK IU schedules, CM/CPS rows and adult NHS Fife AOM schedules
  cannot leak into the active resolver. Missing NICE runtime fails closed.
- Historical source adapters remain separately regression-tested for compatibility;
  the published page is tested with unmodified HTML in
  `antibiotics-nice-browser.spec.js`. The compatibility fixture deliberately
  removes the new policy and is not evidence for active NICE behavior.
- The old mixed-source parenteral module is hidden in this outpatient manual.
  Urgent, severe and IV/IM cases require separate assessment. Existing numeric
  IV/IM rows are not claimed as NICE.
- Incompatible ratios, routes, units and populations are removed from selectable forms/strengths before selection. A missing compatible AKKPM product is an explicit hard stop.
- AKKPM controls physical product identity, form and strength. Product-label
  restrictions can prevent a calculation; they do not create a clinical regimen.
  An SmPC-only dose override is never renamed a NICE recommendation.
- True cephalosporin or multiple/unclear allergy profiles require individualized
  assessment. The prior cross-class low-risk override is not used to manufacture
  a NICE treatment choice.
- Suggested age remains editable and unconfirmed until checked. Editing weight
  clears clinical answers and invalidates an old prescription. No reference
  weight is invented for a final weight-dependent dose.

## What the audit does not claim

The manual implements a conservative subset of routine NICE choices. It is not a
complete BNF/BNFC, renal dosing, drug-interaction or severe-infection engine.
Some NICE alternatives (including staged doxycycline/pivmecillinam schedules,
trimethoprim monotherapy and the complete bite-allergy tables) do not yet have
an implemented product-bound flow here; the app directs separate assessment
rather than borrowing an easier regimen. Local resistance is not inferred from
the Kosovo product register. A course default within a published interval does
not replace reassessment or mean that the drug has a universal dose ceiling.

## Validation

The independent standard test checks numerical age-band examples for all nine
covered infections, all 13 coverage decisions and 3,640 source-isolation contexts.
Browser release coverage exercises the unmodified NICE page in Chromium/WebKit,
including nine infection/product flows at 320/390/1440px, all exclusions, age reset,
the absence of prescribing-strategy selectors, missing-runtime failure, IU isolation and
alternative-versus-addition semantics. General source-adapter math/product tests
remain separate. No patient data or private source books are included.
