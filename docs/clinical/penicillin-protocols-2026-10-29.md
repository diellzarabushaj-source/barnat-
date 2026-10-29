# Penicillins: source-bound dosing and adult context

Implementation: `antibiotiket-penicillin-protocols.js`, loaded after the legacy
source dataset and before the UI. The historical data remain unchanged for
traceability. The rendered page uses the new resolver; a missing resolver blocks
outpatient results and prevents hospital/product modules from loading.

## Coverage

| Penicillin | Implemented use |
| --- | --- |
| Amoxicillin PO | AOM, nonsevere CAP, CDC alternative for confirmed GAS, culture-susceptible lower UTI in the NICE-covered populations |
| Phenoxymethylpenicillin (Penicillin V) PO | Acute sore throat/GAS and bacterial sinusitis; independent adolescent/adult doses |
| Amoxicillin/clavulanate PO | AOM second choice, sinusitis, eligible cellulitis/preseptal infection, bite prophylaxis/treatment, culture-susceptible pyelonephritis; existing wound and pediatric oral-source lymphadenitis pathways retained separately |
| Flucloxacillin PO | NICE cellulitis/impetigo; actual published Kosovo product required, no automatic cloxacillin substitution |
| Benzathine penicillin G IM | Confirmed GAS, 600,000 IU below 27 kg or 1,200,000 IU at/above 27 kg; whole matched syringe and IM-only restriction retained |
| Ampicillin IV | Existing pediatric hospital pathway; separate fixed adult drug dose from UCSF, with renal conditions displayed |
| Ampicillin/sulbactam IV | Existing pediatric component-based pathways; adult 2000/1000 mg q6h standard dose with renal conditions displayed |

The catalog also contains cloxacillin, benzylpenicillin and piperacillin/tazobactam.
Catalog presence does not create a clinical regimen. No new indication-specific
numeric schedules are invented for these drugs. The existing adult lymphadenitis
coverage gap is stated explicitly instead of extending a pediatric coefficient.

## Source decisions

- [NICE NG91](https://www.nice.org.uk/guidance/ng91/chapter/Recommendations): pediatric AOM amoxicillin 125/250/500 mg TID by age; 5–7 days. Co-amoxiclav is second choice after reassessment. This guideline is not labelled as an adult AOM source.
- [NHS Fife adult ENT](https://www.rightdecisions.scot.nhs.uk/nhs-fife/hospital-guidance/ear-nose-and-throat/): adult AOM amoxicillin 500 mg TID, co-amoxiclav 500/125 mg TID second line, 5 days; adult allergy alternatives remain separately sourced.
- [NICE NG84](https://www.nice.org.uk/guidance/ng84/chapter/Recommendations): Penicillin V age-band QID schedule, 5–10 days. The UI defaults to 10 days while permitting the published alternatives. The CDC amoxicillin 10-day alternative is labelled separately.
- [NICE NG79](https://www.nice.org.uk/guidance/ng79/chapter/Recommendations): sinusitis Penicillin V first line and co-amoxiclav second line/high-risk use, 5 days. Historical high-dose amoxicillin is not shown as NICE first line.
- [NICE NG250](https://www.nice.org.uk/guidance/ng250/chapter/Recommendations): nonsevere CAP amoxicillin TID; 3 days in eligible children aged 3 months–11 years, 5 days at 12–17 and in adults. This outpatient UI excludes infants under 3 months and complicated/severe cases.
- [NICE NG109](https://www.nice.org.uk/guidance/ng109/chapter/Recommendations): lower-UTI amoxicillin only with susceptible culture, 3 days under 16 or 7 days in the pregnancy table. Adult empirical penicillin is not fabricated for the other lower-UTI populations. UTI tables change at age 16, independently of the UI's adult threshold of 18.
- [NICE NG111](https://www.nice.org.uk/guidance/ng111/chapter/Recommendations): susceptible-culture co-amoxiclav for nonpregnant pyelonephritis, 7–10 days. Pregnancy requires a different pathway.
- [NICE NG141](https://www.nice.org.uk/guidance/ng141/chapter/Recommendations) and [NG153](https://www.nice.org.uk/guidance/ng153/chapter/Recommendations): flucloxacillin for cellulitis/impetigo; co-amoxiclav for relevant pediatric alternative/near-eye pathways, not a routine adult cellulitis substitution.
- [NICE NG184](https://www.nice.org.uk/guidance/ng184/chapter/Recommendations): co-amoxiclav 3-day bite prophylaxis or 5-day treatment. A longer treatment course needs review, not a default copied from another guideline.
- [Co-amoxiclav 4:1 SmPC](https://www.medicines.org.uk/emc/product/101680/smpc): at/above 40 kg, 500/125 mg TID is a separately attributed dose even in a child. NICE retains the indication's duration. The 500/125 mg TID option is not extended below 25 kg. NICE's age groups assume average size; atypical dimensions still need clinical assessment.
- [UCSF ampicillin](https://idmp.ucsf.edu/content/ampicillin-0): adult standard dose for other infections 2 g q4h when CrCl >50 mL/min. This supplies the drug dose, not an independent endorsement of empiric ampicillin for every CAP case.
- [UCSF ampicillin/sulbactam](https://idmp.ucsf.edu/content/ampicillin-sulbactam-unasyn): adult standard 3 g total (2 g ampicillin/1 g sulbactam) q6h at CrCl >30; different intervals/paths for renal impairment or dialysis.

Verified against retrieved primary-source tables on 2026-10-29. This records source
verification, not independent external clinical approval. Standard schedules do
not replace assessment of renal/hepatic function, severe allergy, interactions,
atypical size, infection severity or product-specific restrictions.

## Product and prescription contract

1. Choose actual age (all pediatric months/years and an explicit 18+ option).
   Weight never infers age; an old inferred-age context is not migrated.
2. Fixed schedules do not require invented reference weights. Actual weight is
   mandatory for weight-based doses and product/regimen thresholds.
3. Every co-amoxiclav row owns its ratio. NICE 4:1 does not borrow a 7:1 or 14:1
   product. Existing separately sourced 7:1 rows retain that ratio.
4. Product selection uses the published Kosovo registry catalog. An `Adult only`
   entry needs confirmed age >=18. Registration does not imply pharmacy stock.
5. No rounding to a different tablet dose. 1200 mg with a 1000 mg tablet is not
   a one-tablet prescription. Use exactly representable whole units or an
   appropriate liquid/product/regimen. No inferred tablet score-line use.
6. Co-amoxiclav copy text includes both actual product components, daily total,
   practical units/mL and course quantity. A fixed prescribed dose is not called
   the drug's universal maximum. Liquid amounts remain mathematical values;
   confirm measurability with the actual measuring device before signing.
7. Culture confirmation resets when age, weight, diagnosis or pregnancy changes,
   and is never restored from storage. A different product revalidates the ratio.
8. Numeric adult hospital doses never come from pediatric coefficients; the
   preparation engine uses the same resolved adult dose as the displayed card.

## Validation

- `node tests/antibiotics-daily-dose-test.js`: legacy source/calculation gates plus
  the new penicillin protocol boundary, component, population and safety tests.
- `node tests/antibiotic-market-test.js`
- `node tests/antibiotic-market-math-test.js`
- `node tests/antibiotics-page-ui-contract-test.js`
- `tests/antibiotics-market-browser.spec.js`: 21 real Chromium flows, including
  320/390/1440px layouts, prescription creation, 17/18 boundary, no-weight fixed
  doses, incompatible capsules, 4:1/7:1 mismatch, 25kg product boundary,
  culture/pregnancy changes, infant doses, neonatal/orbital stops, retryable
  catalog failure, missing protocol script, benzathine syringe and adult IV doses.

Browser tests use authenticated API fixtures and the production catalog builder;
no production patient, account or database records are changed by the tests.


## Practical-dose clarification

The product-aware prescription control supports equal halves of ordinary oral
tablets only after the clinician confirms that the exact product leaflet permits
two equal doses. This confirmation is cleared on product changes and is never
inferred from a score line, another brand, capsules or modified-release products.

A central selected-dose box is flanked by the current regimen's source minimum
and maximum. Fixed protocols remain fixed and are labelled accordingly; these
bounds are not advertised as universal therapeutic limits. For published ranges,
the clinician can select a representable dose or ask for the nearest product dose
to an entered target. Every candidate must remain within both source bounds;
there is no arbitrary percentage tolerance and no rounding across either bound.
The actual selected mg, half/whole tablet quantity, daily total and course quantity
are recalculated together. The mathematical midpoint is not a clinical default.

Validation adds source-bounded rounding/half-tablet arithmetic tests and real
browser flows for 1½ tablets, reset of leaflet confirmation, and the central range
control with final prescription generation.

# Automatic age suggestion from weight (2026-10-29)

The existing month/year select and explicit adult option are preserved. Weight
entry now fills an **unconfirmed suggestion** automatically. Each new weight entry replaces the age suggestion, including a previously
manual age, and clears its confirmation. Manual age selection remains available
for correcting the suggestion until the next weight edit. Reloading an inferred age also requires confirmation. Until real
age is confirmed, no outpatient numerical regimen or prescription is shown.

The suggestion uses the **existing user-supplied reference map dated 2026-09-28**
in `pediatric-weight-age-core.js` / `data/pediatric-weight-age-defaults.json`.
It does not add growth-chart or normal-weight claims. Monthly selection intervals
are derived by linear interpolation between that map's anchors; neighboring
midpoints define nonoverlapping, lower-inclusive / upper-exclusive bins. The UI
keeps months for the first year and selects the closest displayed reference year
thereafter, capped at the shared 16+ reference group. Displayed weight
bounds round outwards to two decimals; matching uses the unrounded boundaries.

There is no supported distinction between 16, 17 and adults from the map's
open-ended 16+ weight band. This remains a shared orientational band; 18+ is
always selected explicitly, never inferred. Below the map's 3.2 kg lower bound,
no age is suggested. A manual age remains usable at any valid weight. These
selection intervals are **not normal growth limits**, therapeutic thresholds,
or a method of establishing chronological age. WHO likewise does not publish
weight-for-age references above 10 years:
https://www.who.int/tools/growth-reference-data-for-5to19-years/indicators/weight-for-age-5to10-years

Validation: all 193 supported monthly intervals, exact boundaries, decimal comma,
lower/out-of-range inputs, and open-band behavior have unit coverage. Browser
coverage checks every first-year month, confirmation, manual overrides, weight
changes, reloads and the adult gate, alongside the existing prescription tests.

Product selection also automatically adapts a genuinely ranged solid dose. The
initial target is the published lower bound; later products use the selected
dose as target. Only whole units or explicitly confirmed equal halves inside the
source interval qualify. If none qualify, the prescription remains blocked.
Fixed doses are never rounded. Editing the practical target applies on change
without requiring the adaptation button. All changes remain visible in the
central dose box and can be overridden within the published bounds.

## AOM clinical workflow refinement — 2026-10-29

The age/weight fields keep their layout. A compact, indication-specific panel
requires a clinician-selected plan after otoscopy: no antibiotic, a back-up
prescription, or immediate treatment. There is no assumed antibiotic plan on
opening/reloading the page. High-risk assessment selects immediate treatment;
suspected serious systemic infection or complications blocks routine oral and
linked parenteral prescriptions and directs urgent hospital assessment. No-antibiotic
and back-up decisions also hide the linked parenteral module.

Co-amoxiclav is a gated second choice. The clinician must confirm reassessment
and worsening after at least 2–3 days of first-line treatment. In that pathway,
first-choice agents are withheld. Penicillin-allergic treatment failure leads
to microbiology/ENT advice, not an automatic repeat of the initial alternative.
Failure confirmation clears on age/weight changes; all AOM decision state starts
fresh on reload or switching indication.

Back-up instructions appear before the prescription and at the beginning of its
copied text, including the three-day trigger and urgent reassessment advice.
Fixed amoxicillin schedules remain fixed. The published 250–500 mg per-dose
interval is available for clarithromycin at 12–17 years and the selected QID
erythromycin pregnancy schedule at 8–17 years. These are absolute mg intervals,
not mg/kg and not universal therapeutic limits. The existing product-aware
adaptation and both source bounds apply without requiring an irrelevant weight.
A 500 mg dose can use half a 1000 mg immediate-release tablet only after explicit
confirmation that the exact product permits two equal doses. Capsules and
modified-release products cannot acquire half-tablet permission.

Source responsibilities remain separate:

- NICE NG91: pediatric prescribing decisions, oral schedules and course lengths.
- NHS Fife: the selected adult doses and five-day courses.
- NHS Borders: prescribing/observation, back-up and referral pathways for people
  with AOM, including adults (not a replacement adult dose source).
- CDC pediatric outpatient guidance: otoscopic diagnostic criteria only.
- NICE NG143: fever risk under three months. The existing conservative outpatient
  minimum age of three months is retained; it is not described as NICE NG91's
  dosing-table lower bound (which is one month).
- NHS mastoiditis page: postauricular signs and specialist hospital assessment.

Additional source URLs:
https://www.rightdecisions.scot.nhs.uk/nhs-borders-clinical-guidelines/ear-nose-and-throat/acute-otitis-media-aom/
https://www.cdc.gov/antibiotic-use/hcp/clinical-care/pediatric-outpatient.html
https://www.nice.org.uk/guidance/ng143/chapter/recommendations
https://www.nhs.uk/conditions/mastoiditis/

Tests cover no assumed plan, observation without prescriptions, urgent removal
of existing prescriptions, high-risk restrictions, gated second choice/allergy
failure, copied delayed-use advice, exact half-tablet conversion, absolute-mg
adolescent range transport, and fresh decision state after reload. Existing
age, formulation-ratio, duration, pregnancy and product eligibility tests remain.

## Weight changes always refresh the suggestion — 2026-10-29

Fixes the reported stale-age case: entering 56 kg after selecting 11 years now
selects the nearest displayed reference year (15 years), marked as inferred and
unconfirmed. Editing weight always overrides a previous manual age. Loading a
saved valid weight also recalculates the suggestion so an old stored choice
cannot leave the page mismatched. A manually chosen real age can still be used
until the next weight edit, including the adult option and fixed-dose pathways
without weight. Empty/invalid/below-map weight edits clear the previous age.

The hint interval groups the same monthly bins used to select that year, so the
entered weight and displayed reference interval agree. Labels and layout stay
unchanged. These are UI bins derived from the existing user map, not evidence of
a weight-specific chronological age. No weight change confirms age or enables
a numerical prescription on its own. The open 16+ group never establishes 18+.

## Simplified antibiotic-only AOM workspace — 2026-10-29

At the clinician's request, the UI now focuses on antibiotic selection/dosing
once treatment is indicated. The no-antibiotic, back-up and immediate-treatment
choice buttons are removed. This does not assert that all AOM needs antibiotics;
the visible scope explicitly says "Kur antibiotiku indikohet". NICE NG91 still
supports observation/back-up strategies in appropriate pediatric cases. This
workspace is not the complete antibiotic-indication decision pathway.

The visible sequence is Patient → Antibiotic choice → Dose and prescription.
Repeated context paragraphs are removed from the AOM results; diagnostic guidance,
source calculations, regimen notes, duplicate limits and verification explanations
remain accessible in closed details. Dose, interval, daily total, duration and
prescription stay visible. Suspected-complication, real-age, infant exclusion,
allergy, second-choice reassessment, product ratio and equal-half-tablet gates
are retained. Doses and durations are unchanged. Adult schedules remain NHS Fife,
with NICE NG91 explicitly identified for under-18 prescribing.
