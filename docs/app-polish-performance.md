# Shared UI and startup polish

Scope: the 11 clinical workspace pages, retaining all clinical data, calculations and weight/age behavior.

- Shared typography, focus visibility, mobile touch targets, secondary text, card borders and toolbar spacing.
- Prescription scheme titles and metadata occupy separate wrapping rows.
- One sidebar bootstrap per page. Closed ATC/ICD navigation groups load on demand; their own pages load immediately. Successful results are reused, failed loads can retry on reopening, and existing direct links remain available.
- Fresh ICD navigation metadata uses the existing ten-minute session cache. Scroll persistence is debounced, with immediate save on navigation/page exit.
- Shared asset versions updated consistently across all 11 pages. No new runtime dependency or font.

## Verification

`pnpm run test:deploy` passed, including dose engine, golden cases and dosage workspace checks. Shared sidebar/shell contract tests passed.

With `PORT=4190 node tests/clinical-smoke-server.js` running:

- `node tests/shared-shell-polish-browser.js` verifies single bootstrap, deferred ATC/ICD, one-time expansion, session cache and mobile focus/inert/Escape behavior.
- `APP_AUDIT_PHASE=after node tests/app-polish-browser-audit.js` measures all 11 pages at 1440px and 390px with fresh browser contexts. All 22 loads had no JavaScript page errors or document horizontal overflow.

Compared with the same local fixture baseline, initial requests decrease by 2–3 per page. Decoded resource payload drops approximately 9–25 KB per page, depending on the active module. No percentage latency claim: local timings fluctuate with disk/browser scheduling. These are startup and shell checks with fixture data, not a production latency benchmark or complete clinical workflow validation.

The repository's previously failing brand-version CI assertion is unrelated to this change; clinical dose values are not modified.
