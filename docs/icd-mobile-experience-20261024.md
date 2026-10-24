# ICD phone experience — 24 October 2026

The existing ICD interface now prioritizes search and the selected diagnosis on phones. The desktop catalog, sidebar, search engine, clinical content and prescription handoff remain in the same application.

## Changes

- At widths up to 940 px, filters and chapter browsing are native disclosures. Active filters have a count and a separate one-tap reset.
- Repeated introductory text is removed on phones. Search results use the page scroll rather than a nested scrollbox. Verification and symptom/differential distinctions remain visible.
- Selecting a diagnosis dismisses the keyboard, closes secondary controls and reveals the diagnosis. A return button focuses search. Copy, prescription and navigation controls have larger touch targets.
- Desktop disclosures stay open. Keyboard selection still scrolls the active result; typing no longer jumps the page.
- Explicit terminology assistance has a 45-second model deadline and stage-specific operational error metadata. Logs exclude queries, responses and user identity. Failed requests leave no answer cache entry and can be retried. Standard search never waits for AI.

## Verification

Twenty browser cases passed in Chromium and WebKit, including 320, 390 and 430 px phone layouts, a reduced-height viewport, filter/reset/chapter navigation, keyboard dismissal, diagnosis return, no horizontal overflow, and existing memory, consent, CSRF, offline search and prescription behavior. Phone and desktop screenshots were inspected. These are simulated browser checks, not physical-device certification.

The runtime build and deployment checks passed. Current memory/security/database, Gemini prescription, command-center, scoped-filter, published-immutability and production-health checks are release checks. An additional historical asset audit fails on an unchanged Analizat version expectation; it is not evidence of an ICD asset mismatch. ICD HTML and runtime manifest versions advance together.

The user authorized one generic live expression, `pom ne majte`, for explicit assistance and pending-only storage. The first attempt returned a service error; the deployed diagnostic retry identified a Gemini timeout at 25 seconds. Terminology now requests low thinking through the existing transport and permits up to 45 seconds. Prescription model, thinking defaults and response token budget are unchanged. Google's [Interactions API](https://ai.google.dev/api/interactions-api.md) documents the thinking setting; its [thinking guidance](https://ai.google.dev/gemini-api/docs/thought-signatures) recommends reducing thinking rather than imposing a small token limit. The final deployed retry and its actual result must be recorded separately; this document does not claim that the live AI check has passed. No automatic clinical approval is performed.
