# Simple antibiotic manual — 2026-11-01

The user approved the local two-part design and publication to main/live.
The implementation uses existing source-bound regimen and AKKPM modules. It
adds contextual selection, not a new dose formula or diagnosis generator.

## Interface contract

- **Rasti:** infection, weight, real age and allergy; only relevant clinical
  questions follow. Seven distinct allergy categories and the cephalosporin
  low-risk confirmation remain available. Pregnancy stays visible when relevant.
- **Trajtimi:** one selected base regimen, existing form/strength/product controls,
  per-dose amount, interval, daily total, automatic course and prescription.
- Procedures and explicitly required additional treatment remain visible alongside
  the selected base regimen. They are never reduced to an OR alternative.
- The case can collapse to a readable summary and reopen without losing fields.
  Hidden case controls are inert. Unknown questions, unavailable scripts and
  alarm states withhold routine prescriptions, including the hospital module.
- ATC class navigation remains in the source/details panel and can select the
  corresponding complete regimen. It does not reorder therapeutic priorities.
- Product matching, route separation, combination ratios, whole capsules,
  confirmed tablet halves, age/weight gates and exact Ospen identities remain
  owned by their existing modules. Hidden or disconnected cards cannot copy a
  stale prescription.

## Context matrix

| Infection | Decisions retained or made explicit |
| --- | --- |
| AOM | Otoscopy/risk assessment, treatment failure and complication gate |
| Pharyngitis | Confirmed GAS, allergy, alarm signs; source-specific alternatives |
| Pneumonia | Uncomplicated scope, atypical add-on and severe-illness gate |
| Sinusitis | Initial versus reassessed failure/high risk; complication gate |
| Lower UTI | Patient profile, pregnancy/term, renal eligibility for nitrofurantoin, reassessed alternatives and culture when required |
| Pyelonephritis | Oral-treatment eligibility, culture, restricted fluoroquinolone consent and urgent referral |
| Impetigo | Localised disease prompts local-treatment assessment; no automatic oral regimen; widespread/bullous disease follows the existing oral pathway |
| Cellulitis | Non-purulent pathway is distinguished from pus/abscess |
| Wound | Clean uncomplicated wounds receive no routine systemic prescription; infected/clearly indicated wounds retain product and weight restrictions |
| Abscess | Drainage/source control remains the primary step; systemic agents require an assessed indication |
| Preseptal cellulitis | Orbital red flags or inadequate examination block outpatient treatment |
| Bite | No indication, indicated prophylaxis and infected-bite treatment remain distinct courses |
| Lymphadenitis | Skin versus oral source; unsupported adult regimens are not inferred from pediatric doses |

## Course ownership

All manual day selectors are removed from the oral prescription builder. The
program uses the regimen's explicit `defaultDays`; older range-only records use
the lower bound of their existing routine source interval. The original interval
and reassessment limitation remain in the calculation details. GAS retains its
existing ten-day default; routine AOM retains five days; uncomplicated CAP retains
its existing age-dependent three/five-day policy. The exact Ospen sinusitis course
remains the separate, previously reviewed IU protocol. No NICE dose is converted
to IU, and no new duration is imported from another drug's regimen.

## Primary references checked

- [NICE NG84: acute sore throat](https://www.nice.org.uk/guidance/ng84/chapter/Recommendations)
- [NICE NG91: AOM](https://www.nice.org.uk/guidance/ng91/chapter/Recommendations)
- [NICE NG250: pneumonia](https://www.nice.org.uk/guidance/ng250/chapter/Recommendations)
- [NICE NG79: sinusitis](https://www.nice.org.uk/guidance/ng79/chapter/Recommendations)
- [NICE NG109: lower UTI](https://www.nice.org.uk/guidance/ng109/chapter/Recommendations)
- [NICE NG111: pyelonephritis](https://www.nice.org.uk/guidance/ng111/chapter/Recommendations)
- [NICE NG153: impetigo](https://www.nice.org.uk/guidance/ng153/chapter/Recommendations)
- [NICE NG141: cellulitis](https://www.nice.org.uk/guidance/ng141/chapter/Recommendations)
- [NICE NG184: bites](https://www.nice.org.uk/guidance/ng184/chapter/Recommendations)
- [AAST: injury antibiotic prophylaxis consensus](https://tsaco.bmj.com/content/9/1/e001304)
- [CPS: bacterial skin and soft-tissue infections](https://cps.ca/en/documents/position/skin-and-soft-tissue-infections)
- [Children's Mercy: outpatient handbook](https://www.childrensmercy.org/siteassets/media-documents-for-depts-section/documents-for-health-care-providers/evidence-based-practice/clinical-practice-guidelines--care-process-models/outpatient-antibiotic-handbook.pdf)

These are inherited regimen authorities plus the focused selection review. No
patient data, credentials or private books are included. Regression coverage
exercises all 13 contexts, unknown answers, clinical state changes, stale-copy
prevention, product conversion and narrow/desktop layouts in Chromium/WebKit.
