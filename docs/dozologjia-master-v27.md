# Dozologjia Master v2.7

The standalone page uses Bari → Për çka → Si jepet → Doza. The previous page/runtime is archived as inert text in `docs/archive/dozologjia-before-v27`.

## The Albanian layer

Master stores its clinical text in English shorthand (`q8h`, `Renal context must be checked`, `PONV prevention/treatment`). None of it is readable at the bedside here, so `lib/dozologjia-sq.js` maps every published string once and `lib/dozologjia-master.js` asserts the mapping at load: a published indication, route, population, frequency, duration, safety note, dose ceiling, step, preparation, gate, dose unit or dosage form with no Albanian rendering stops the module rather than reaching a clinician. Adding a regimen therefore means adding its wording in the same commit. Nothing in that file changes a number.

Product names are the exception: they identify a real product and are shown exactly as the source recorded them, with the dosage form rendered beside them.

## The formulation calculator

### Practical workflow update (20 September 2026)

Manual shelf conversions are now limited to oral and rectal routes. Injections and other routes use only the engine's verified product/preparation conversion. Previously, the generic shelf could offer an unverified market strength even when the engine withheld preparation; neither saved products nor copied summaries can take that fallback now.

Regimen choices include their numeric source rule and automatically expand when a choice is still needed. The answer can explain its source coefficients, entered weight, pre-cap amount and final capped amount. These are server-provided calculation operands, not a second clinical calculator in the browser. No numeric dose, indication, age/weight rule or ceiling changed.

The missing-field action focuses the next incomplete control without confirming it. Calculation and catalog requests time out after 12 seconds and offer retry. Request revisions continue to reject stale answers. Custom concentration edits disable copying until saved, and the copied summary retains the selected sequence step, dose period, duration availability, preparation and cautions.

Validation includes the 43-regimen engine suite, workspace and Albanian formulation tests, test:deploy, and `node tests/dozologjia-clarity-browser.js`. The browser test covers catalog recovery, missing-field focus, real mg-to-mL arithmetic, invalid concentrations, stale responses, failed and timed-out requests, route-restricted manual conversions, daily-total copying, patient reset and mobile-to-desktop resizing.

Master binds an exact, audited product to some regimens and converts mg to mL itself; that conversion is shown as the answer and named as source-bound. For every other regimen the clinician still has to turn mg into something a spoon or a blister carries, so `lib/dozologjia-products.js` carries the strengths commonly found on the shelf, per drug. They are **not** read off a verified label: each is flagged `marketTypical`, carries no source, and the page says to check the bottle.

The clinician can always enter their own strength (mg per tablet, or mg per mL) — it is remembered per drug in `localStorage` under `drx.dozologjia.products.v1`, leads the shelf from then on, and is labelled as theirs. That arithmetic happens in the page, on a strength the clinician supplied; no strength or concentration is ever posted to the calculator, and the API's allow-list still rejects one.

`data/dozologjia-master-v27-production.json` contains the 43 PRODUCTION_EXPORT regimens and their referenced clinical dependencies. It excludes inactive regimens, workbook QA cases, unused formulations, and the private Google Sheet address. The full source workbook is not part of this release. Certification remains `SOURCE_AUDITED_ONLY`.

The existing `/api/dosage` function serves authenticated `master-catalog` (GET) and `master-calculate` (POST) requests. The browser sends patient values and selected IDs; it cannot override rules or concentrations. No external sheet is fetched during patient calculations. Editing Google Sheets does not silently change the frozen runtime snapshot: changes require another reviewed code release and tests.

Required patient safety conditions block output until satisfied. These are patient-specific gates, not human dataset signoff. Daily totals remain daily totals. Dose-only rows cannot convert products; protocol-only rows cannot generate preparation. Volume requires an exact formulation binding and a verified ready preparation for the same route. Cumulative limits require explicit prior dose input. Responses are invalidated on every input change.

Run `pnpm run test:dozologjia` and `pnpm run test:deploy`. Rebuild the page runtime with `pnpm run build:dozologjia`. Legacy pediatric API consumers remain available independently of this standalone page.
