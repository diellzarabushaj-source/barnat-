# Barnat implementation audit

Status: visual direction generated in Superdesign; production implementation waits for explicit user approval.

Design draft: `63e3e163-4b5d-40c0-ae90-efd86adae3bd` — “MedIndex Barnat - Clinical Workspace”.

## What to carry into production

- Exact real sidebar grouping and labels: KRYESORE, KLINIKE, MJETET.
- 264px sidebar, 64px topbar, compact page heading, and one-line registry metadata strip.
- One compact working toolbar with dominant search, filters, view controls, selection summary, and prescription action.
- Main table consumes the remaining workspace height and owns its own horizontal/vertical overflow.
- Neutral sticky table header, sticky selection and trade-name columns, subtle edge cue, and strong medicine identity.
- Adult and pediatric dose content uses obvious labels, wrap-safe layout, disclosure for long values, and source-aware status.
- Local/system typography, local inline SVGs, neutral TailAdmin surfaces, restrained teal, no decorative hero or footer.

## Draft details that must NOT be copied

- Do not use Tailwind CDN, Iconify, Google Fonts, or any other network runtime from the Superdesign preview.
- Do not change the real page-size options (`50`, `100`, `250`, `500`, favorites mode) to the draft’s illustrative `15` rows.
- Do not merge the two real opt-in dosage columns into a single invented “Dozologjia Klinike” column.
- Do not mark the dataset “verified/current” unless the real registry-quality state proves it; reuse existing quality metadata and wording.
- Do not add an animated status pulse; connection/data state must remain calm and text-labelled.
- Do not invent medicine values, routes, indications, status values, pagination totals, source claims, or new navigation destinations.
- Do not alter IDs, data attributes, storage keys, event names, API requests, sorting, filtering, selection, favorites, or prescription handoff.

## Production file map

- Shared shell geometry/tokens: `tailadmin-medindex.css`, `tailadmin-professional.css`, `tailadmin-shell-legacy.js`.
- Barnat structure and accessibility enhancement: `first-page-clinical.js`.
- Barnat visual layer and responsive table/cards: `first-page-clinical.css`.
- Stable source markup/cache versions: `index.html`, `first-page-style-loader.js`.
- Medicine identity and dosage presentation: `name-display.js`, `registry-dosage-columns-v2.js`, `registry-dosage-columns.css`, `registry-dosage-loader.js`.
- Generated registry runtime remains derived from `app-parts/*`; rebuild through the existing build script only.

## Verification contract

- Static/UI: `first-page-ui-audit-test.js`, `registry-dosage-columns-test.js`, `professional-ui-audit-test.js`, `ui-navigation-audit-test.js`.
- Simplicity/offline: `simplicity-offline-ui-test.js`, `offline-first-audit-test.js`, `low-bandwidth-resilience-test.js`.
- Performance/interaction: `registry-interaction-resilience-test.js`, `registry-main-thread-deep-audit-test.js`, Playwright registry performance spec.
- Render QA: desktop 1511×900, 1280×720, tablet 768×1024, mobile 390×844; light/dark; keyboard; long Albanian content; 4006-row and slow-network states.

Current pre-implementation targeted audit: all seven targeted static checks pass after aligning the dosage-column test with the current concise labels and disclosure text.
