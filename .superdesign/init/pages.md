# Page dependency trees

This repository has no module-based page components or import graph. Each HTML file is the page entry; dependencies below include direct local styles/scripts and recursively traced local resources that those scripts load at runtime. API endpoints are noted as data boundaries, not design context files.

## Shared protected-page subtree

Every protected clinical page uses this UI subtree. It is expanded here once and referenced by each page below to keep the candidate context set readable.

- `tailadmin-medindex.css` — base `--mi-*` tokens, shell, shared controls/cards, dark mode, auth surfaces
- `tailadmin-professional.css` — final shell geometry and per-page responsive overrides
- `tailadmin-shell.js`
  - `tailadmin-shell-legacy.js` — creates sidebar, topbar, global search host, page heading, and `.mi-page-slot`
  - `mobile-experience.js` — mobile drawer/touch UI and mobile-only injected styles
  - `mobile-accessibility-hardening.js` — mobile focus, target-size, and dialog hardening
  - `offline-runtime-performance.js`
    - `clinical-workflow.js` — command palette and cross-page workflow UI
      - `local-registry.js` — lazily loaded only when local prescription drug search is used
    - `sw-resilient-v3.js` — registered service worker
    - `manifest.webmanifest`
- `tailadmin-professional.js` — active-route, scroll-container, command-palette, and viewport normalization
- `auth-client.js`
  - `tailadmin-professional.js` — fallback dynamic load if the direct runtime is absent
  - `offline-runtime-performance.js` — fallback dynamic load after authentication
- `app-stability.js`

## `/` and `/index.html` — Medicines registry

Entry: `index.html`

Dependencies:

- Shared protected-page subtree above
- `styles.css`
- `ui-controls.css`
- `loader.css`
- `app-polish.css`
- `performance.css`
- `clean-medindex-ui.css`
- `form-picker-clinical.css`
- `registry-dosage-columns.css`
- `first-page-style-loader.js`
  - `first-page-clinical.css`
- `registry-fast-start.js`
- `app-performance.js`
  - `app-runtime-performance.js` — generated browser runtime
    - `app-parts/part-01.txt` — canonical build source
    - `app-parts/part-02.txt` — canonical build source
    - `app-parts/part-03.txt` — canonical build source
    - `app-parts/part-04.txt` — canonical build source
    - `app-parts/core-tail.txt` — canonical build source
  - `data/registry-quality.js` — quality metadata preload/source
  - Data boundary: `/api/registry`
- `ui-enhancements.js` — favorites, row actions, and saved-item surfaces
- `form-picker-clinical.js`
- `first-page-clinical.js` — overview, toolbar, responsive table framing, and accessibility UI
- `dosage-engine.js`
- `registry-dosage-loader.js`
  - `registry-dosage-columns-v2.js`
    - Data boundary: `/api/dosage`
- `name-display.js`
- `offline-runtime-performance.js` — direct page include; same nested dependencies as the shared subtree

## `/klasifikimi.html` — ATC classification

Entry: `klasifikimi.html`

Dependencies:

- Shared protected-page subtree above
- `classification.css`
- `classification-nav-fix.css`
- `registry-quality.css`
- `app-polish.css`
- `performance.css`
- `clean-medindex-ui.css`
- `medical-icons.js`
- `data/registry-quality.js`
- `classification-data.js`
- `classification-registry-bridge.js`
  - Data boundary: `/api/registry?fallback=1&classification=1&bridge=5`
- `classification-v3.js` — card/table rendering and ATC navigation
- `classification-audit-view.js`
- `classification-info-v3.js`
- `classification-icons.js`

## `/icd.html` — ICD-10 workspace

Entry: `icd.html`

Dependencies:

- Shared protected-page subtree above
- `medical-hub.css`
- `app-polish.css`
- `icd.css`
- `icd-premium-cards.css`
- `performance.css`
- `clean-medindex-ui.css`
- `clinical-density.css`
- `icd-clinical-style-loader.js`
  - `icd-clinical-workspace.css`
- `icd-tailadmin-card-style-loader.js`
  - `icd-tailadmin-cards-v2.css`
- `medical-icons.js`
- `icd-data.js`
- `icd.js`
  - Data boundary: `/api/icd`
- `icd-premium-cards.js`
- `icd-clinical-workspace.js`
- `section-icons.js`
- `clinical-dialog.js`

## `/analizat.html` — Laboratory analyses

Entry: `analizat.html`

Dependencies:

- Shared protected-page subtree above
- `medical-hub.css`
- `app-polish.css`
- `analizat-polish.css`
- `performance.css`
- `clean-medindex-ui.css`
- `clinical-density.css`
- `analizat-clinical-style-loader.js`
  - `analizat-tailwind-cards-v2.css`
- `medical-icons.js`
- `lab-sheet-data.js`
- `analizat.js`
  - Data boundary: `/api/icd?dataset=labs`
- `section-icons.js`
- `clinical-dialog.js`

## `/dozologjia.html` — Dosage reference

Entry: `dozologjia.html`

Dependencies:

- Shared protected-page subtree above
- `medical-hub.css`
- `clinical-reference.css`
- `dozologjia-card-style-loader.js`
  - `dozologjia-verified-cards.css`
- `dozologjia-simple-workflow-style-loader.js`
  - `dozologjia-simple-workflow.css`
- `dosage-engine.js`
- `dozologjia-deep-audit.js`
  - `dozologjia-safety-enhancements.css`
  - `dozologjia-clinical-readiness.css`
  - Data boundary: `/api/dosage`
- `dozologjia.js`
  - Data boundary: `/api/dosage`
  - Navigation boundary: `/recetat.html`

## `/protokollet.html` — Official protocols

Entry: `protokollet.html`

Dependencies:

- Shared protected-page subtree above
- `medical-hub.css`
- `clinical-reference.css`
- `protokollet.js`
  - `data/protocols.json` — 55-document manifest and official/private source metadata
  - Data boundary: `/data/protocols.json`
  - Document boundary: `/api/protocol-document?id=<protocol-id>`
  - External boundary: each document's official `https://msh.rks-gov.net/...` URL

Note: `protocols.css` is not loaded by this page; it is a legacy registry drawer stylesheet and should not be supplied as protocol-page design context.

## `/recetat.html` — Prescription workflow

Entry: `recetat.html`

Dependencies:

- Shared protected-page subtree above
- `medical-hub.css`
- `app-polish.css`
- `performance.css`
- `recetat.css`
- `recetat-audit.css`
- `signature-templates.css`
- `local-registry-fidelity.js`
- `prescription-bridge.js`
- `medical-icons.js`
- `dosage-engine.js`
- `prescription-format-core.js`
- `prescription-registry-bridge.js`
- `signature-templates.js`
- `recetat.js`
  - Data boundary: `/api/dosage`
  - Data boundary: `/api/drug-search`
  - Optional network boundary: `/api/gemini-prescription`
- `recetat-safe-print.js`
- `clinical-workflow.js` — loaded through the shared offline runtime
  - `local-registry.js` — lazy local drug search

## `/login.html` — Authentication

Entry: `login.html`

Dependencies:

- `login.css`
- `tailadmin-medindex.css` — standalone authentication section; no application shell
- `theme-preload.js`
- `login.js`
  - Data boundary: `/api/auth`
  - Navigation boundary: safe `return` destination or `/index.html`

## `/recovery.html` — Cache/session recovery

Entry: `recovery.html`

Dependencies:

- `login.css`
- `tailadmin-medindex.css` — standalone authentication/recovery surface; no application shell
- `recovery.js`
  - Browser storage/service-worker cleanup
  - Navigation boundary: safe `return` destination or `/login.html`
