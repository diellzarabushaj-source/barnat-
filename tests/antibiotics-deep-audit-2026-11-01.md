# Antibiotics: interaction and UI follow-up audit — 1 November 2026

Scope: the actual NICE-only `antibiotiket.html` page, preserving the approved
two-part **Rasti → Trajtimi** flow. This supplements the clinical scope review in
`antibiotics-nice-audit-2026-11-01.md`; it does not expand its clinical coverage.

## Findings resolved

| Priority | Trigger and former behavior | Result |
| --- | --- | --- |
| P1 | The browser did not pass its allergy category into the NICE wrapper, although isolated engine tests did. Some non-beta-lactam UTI options remained available for the categories designated for individual assessment. | The selected allergy now reaches the active engine. All 13 infections are exercised with all 7 allergy categories for child and adult profiles. The designated assessment categories cannot render a routine prescription. |
| P1 | Confirming culture sensitivity, then switching antibiotics or changing allergy, could retain the confirmation. | Culture and fluoroquinolone confirmations clear on an explicit antibiotic switch and on an allergy change. A fresh confirmation is required for the selected agent. |
| P2 | A weight-review card lacked its regimen identity and could disappear when selecting the visible antibiotic. The case could be reported ready. | The stop remains visible with the applicable weight, no market conversion or prescription is added, and the case cannot collapse as ready. |
| P2 | “Pastro rastin” cleared patient inputs but retained the remembered product. | A new case clears product memory, starts form/strength unselected, clears tablet-splitting consent and focuses weight. |
| P2 | Selecting a conditional antibiotic could reopen the case while leaving the missing confirmation above the current viewport. | A deliberate selection moves focus to the relevant renal, culture, second-line or fluoroquinolone control. Normal rerenders do not steal focus. |
| P2 | The collapsed summary omitted pregnancy and the selected infection-specific answer. | The summary retains pregnancy, the clinical choice, atypical suspicion and reassessed treatment failure where applicable. |
| P2 | The standalone atypical alternative could retain a heading describing a base-plus-addition plan. | The two-part heading appears only when an actual additional agent is rendered. |
| P2 | A calculated weight-based dose without a published absolute maximum was labelled as a limit. | It is labelled as the calculated weight-based dose. A missing absolute maximum is still disclosed; no universal maximum is invented. |
| P3 | A gap separated the antibiotic selector from its treatment card; pregnancy fell below a full-width hint; some disclosure targets were too short. | One continuous treatment surface, more compact case spacing, aligned pregnancy, clearer mobile labels and helpers, visible focus and at least 44 px product-limit disclosures. |
| P3 | Folded page copy still named historical non-NICE dosing sources. | Active page copy describes NICE-only schedules and the separate role of the AKKPM product registry. Historical adapters remain isolated compatibility tests. |

## Interaction coverage

`antibiotics-nice-browser.spec.js` operates the unmodified HTML and actual active
NICE runtime using normal input/select/click events. Auth and the product endpoint
are local test fixtures; no patient records are created or changed.

- All 13 infection routes, each with a child and adult profile and all 7 allergy
  categories; every antibiotic option exposed in those cases is selected.
- Every option in the infection-specific clinical selectors: AOM risk and
  reassessed failure, pneumonia severity, sinusitis course, impetigo extent,
  cellulitis purulence and bite purpose. Urgent stops and reversal are exercised.
- GAS two/four-times-daily schedules; pneumonia alternative versus additional
  treatment; pregnancy across the 9 covered infections.
- UTI female/male profiles, pregnancy/term, renal boundary, reassessed second-line
  treatment, culture, restricted ciprofloxacin, febrile/prostate and urgent flags,
  and the two/three-times-daily cefalexin schedules.
- Every eligible form, strength and product in the seeded product cases at
  320, 390 and 1440 px, plus product/source disclosures. Incompatible ratios,
  IU conversions, modified-release and non-oral substitutions remain excluded.
- Case folding/editing, reset and focus; weight clear/retype and age confirmation;
  a tablet requiring separately confirmed equal halves; catalog failure/retry;
  missing NICE module; unsupported scope and adult AOM.
- No horizontal page overflow in the exercised product views. The browser matrix
  also collects unhandled page exceptions in the infection/allergy cases.

The expanded suite has 46 scenarios in each of Chromium and WebKit (92 checks).
The first full pass was successful; the focused refinement pass and required
release workflow verify the final publication tree. Source-isolation tests also
exercise 3,640 engine contexts independently of the browser suite.

## Source cross-check

The active authority remains NICE. The online cross-check used the published
recommendations and summaries for [AOM NG91](https://www.nice.org.uk/guidance/ng91/chapter/Recommendations),
[sore throat NG84](https://www.nice.org.uk/guidance/ng84/chapter/Recommendations),
[pneumonia NG250](https://www.nice.org.uk/guidance/ng250/chapter/Recommendations),
[sinusitis NG79](https://www.nice.org.uk/guidance/ng79/chapter/Recommendations),
[lower UTI NG109](https://www.nice.org.uk/guidance/ng109/chapter/Recommendations),
[pyelonephritis NG111](https://www.nice.org.uk/guidance/ng111/chapter/recommendations),
[impetigo NG153](https://www.nice.org.uk/guidance/ng153/chapter/Recommendations),
[cellulitis NG141](https://www.nice.org.uk/guidance/ng141/chapter/Recommendations),
and [bites NG184](https://www.nice.org.uk/guidance/ng184/chapter/Recommendations).
Some direct document requests returned 403; indexed official NICE excerpts and
the available official recommendations supplied the cross-check. No alternative
organization's dose was substituted.

## Limits of this evidence

The suite covers the exposed options and representative profiles, not every
possible patient combination, physical phone, commercial product leaflet or
clinical outcome. WebKit at phone width is not a physical iPhone test. Seeded
products verify registry-binding behavior; they do not establish local stock or
product-specific approval. Full renal adjustment, interactions, severe-infection
pathways and the previously documented unsupported regimens are outside this
routine manual. These checks do not establish complete WCAG conformance or a
guarantee of error-free clinical care.
