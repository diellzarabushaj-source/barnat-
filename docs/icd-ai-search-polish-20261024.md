# ICD Gemini interaction polish — 24 October 2026

The term-only confirmation now includes a direct, keyboard-accessible “Kërko me Gemini” action. Its disabled state follows the checkbox, and the completed confirmation removes the redundant reminder. Phone controls retain at least 44px touch targets.

An in-flight AI search has a visible “Ndalo” action and progress indicator. Editing or clearing the query, or navigating to another ICD selection, aborts the client request and immediately releases the AI control. Each request owns its cleanup, so a late completion cannot unlock or overwrite a replacement request. Cancellation does not promise to undo work that the server has already received.

The client request has a 55-second deadline spanning fresh CSRF authentication, response headers and response body. Aborted authentication cannot continue into a terminology POST. Explicit offline use explains that Gemini requires internet while ordinary ICD search remains available. Existing query-specific consent, fresh ownership checks, CSRF retry rules, canonical validation and pending-only AI proposals remain intact. There are no clinical-content, model-order, database-schema or dependency changes.

Validation: production build and 32 Chromium/WebKit browser cases passed; six cancellation/consent/deadline cases were repeated after clearing the redundant confirmation reminder. Tests exercise consent before transmission, explicit cancellation, replacement requests, query edits, programmatic clearing, deadline recovery and offline use, alongside the existing mobile/desktop search, dictionary, review and prescription handoff flows. GitHub CI and production deployment are verified during release.

The standalone legacy runtime-asset-version-audit-test.js still expects old Analizat/Stripe shell assets and fails outside the maintained test-suite.json. Its asserted files and the test itself are unchanged by this package; the maintained suite and runtime manifest/build are the release checks. This is recorded rather than changing unrelated pages or weakening the old test.
