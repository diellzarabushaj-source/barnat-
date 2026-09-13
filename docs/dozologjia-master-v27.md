# Dozologjia Master v2.7

The standalone page uses Bari → Indikacioni → Doza. The previous page/runtime is archived as inert text in `docs/archive/dozologjia-before-v27`.

`data/dozologjia-master-v27-production.json` contains the 43 PRODUCTION_EXPORT regimens and their referenced clinical dependencies. It excludes inactive regimens, workbook QA cases, unused formulations, and the private Google Sheet address. The full source workbook is not part of this release. Certification remains `SOURCE_AUDITED_ONLY`.

The existing `/api/dosage` function serves authenticated `master-catalog` (GET) and `master-calculate` (POST) requests. The browser sends patient values and selected IDs; it cannot override rules or concentrations. No external sheet is fetched during patient calculations. Editing Google Sheets does not silently change the frozen runtime snapshot: changes require another reviewed code release and tests.

Required patient safety conditions block output until satisfied. These are patient-specific gates, not human dataset signoff. Daily totals remain daily totals. Dose-only rows cannot convert products; protocol-only rows cannot generate preparation. Volume requires an exact formulation binding and a verified ready preparation for the same route. Cumulative limits require explicit prior dose input. Responses are invalidated on every input change.

Run `pnpm run test:dozologjia` and `pnpm run test:deploy`. Rebuild the page runtime with `pnpm run build:dozologjia`. Legacy pediatric API consumers remain available independently of this standalone page.
