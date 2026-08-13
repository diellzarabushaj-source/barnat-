# MedIndex Mobile — Phase 0 Forensic Audit

Date: 2026-08-13
Scope: phone registry architecture, renderer ownership, runtime handoff, CSS geometry, shell breakpoints, build artifact parity, and network/cache policy.

## Rule for Phase 0

No visual redesign is implemented in this phase. The goal is to identify the exact ownership/race/cascade causes before changing production UI behavior.

## Critical findings

### P0-RACE-001 — mobile-lite can lose ownership after a fixed timeout

`registry-runtime-loader.js` gives mobile-lite a 5 second grace window. If `data-registry-mobile-lite-ready="1"` is not present in that window, it starts the full registry runtime with reason `mobile-lite-timeout`.

The full runtime (`app-performance.js`) can then load `/api/registry`, hydrate the complete registry data path and load the generated full registry runtime.

Consequence: on a cold/slow mobile request, the lightweight list and the full registry path can both become active. This is a credible root cause for a compact mobile list turning into a large desktop/full-table-derived card layout.

### P0-OWNER-002 — feature clicks and initial load failure can hand the phone to the full registry

`registry-mobile-lite.js` calls `requestFullRegistry()` for advanced controls and on initial mobile-lite load error. The current owner is therefore not guaranteed to remain mobile-lite for the whole mobile session.

Consequence: renderer ownership can change mid-session. When that happens, full-registry DOM can be subjected to mobile CSS layers that were written for the lightweight DOM.

## High findings

### P0-GEOMETRY-003 — favorite and “Më shumë” can share the same right-side geometry

The base mobile card is a two-column grid (`1fr auto`). Phase 8 adds a 44×44 favorite button using absolute top/right positioning. The design layer separately gives the `Më shumë` button a fixed right-side footprint.

Consequence: these controls can collide on narrow cards. This matches the supplied iPhone screenshot where the star overlaps the `Më shumë` control.

### P0-BUILD-004 — checked-in source is not identical to the production build artifact

`build:runtime` runs patch scripts that mutate generated/runtime files. `patch-registry-phase8-personalization.js` modifies `registry-mobile-lite.js` and inserts Phase 8 CSS/JS tags into `index.html` during build.

The checked-in `index.html` therefore does not fully represent the final production cascade before build execution.

Consequence: source-only inspection is insufficient. All mobile regression tests for the next phases must run against the post-`build:runtime` artifact.

### P0-CASCADE-005 — too many mobile registry CSS owners

The checked-in index already references multiple registry mobile layers (`critical`, `lite`, `phase3`, `phase4`, `design-audit`, `phone-hardening`), and the build adds Phase 8.

Consequence: geometry can be correct in one file but overridden later. More CSS patches should not be added before ownership and geometry are stabilized.

## Medium findings

### P0-BREAKPOINT-006 — shell and registry mobile breakpoints differ

The shell/mobile experience uses a 1024px breakpoint, while mobile-lite uses 767px.

Consequence: widths 768–1023 can receive a mobile shell with a desktop/non-lite registry architecture. This must be treated as an explicit boundary contract in later tests.

### P0-NETWORK-007 — static assets revalidate while APIs are no-store

Vercel headers currently make API responses private/no-store and JS/CSS `max-age=0, must-revalidate`.

This is safe for freshness but creates repeated validation overhead across a page with many scripts/styles. It is not the Phase 0 fix; it is a measured optimization target for the performance phases.

### P0-SHELL-008 — mobile shell state is controlled by several overlapping systems

Critical CSS fixes the app shell/body to the viewport, `mobile-experience.js` tracks `visualViewport`, and `mobile-sidebar-hardening.js` adds body/sidebar observers and focus containment.

Consequence: Safari keyboard, rotation, drawer, and detail-sheet states must be tested as combinations, not as isolated responsive screenshots.

## Phase 0 conclusion

The primary problem is not a missing responsive stylesheet. The first production fix must be architectural:

1. keep a single mobile list owner;
2. prevent timeout/feature handoff from replacing the lightweight list renderer;
3. then fix card action geometry;
4. only after that refine shell/header/sidebar/bottom navigation;
5. consolidate CSS layers later, after behavior is stable.

## Phase 1 entry gate

Phase 1 may start only with these invariants:

- On <=767px, the list owner remains `mobile-lite` during normal use.
- Slow initial API response must not cause the full renderer to take over the list.
- Advanced mobile features may load modules/sheets, but may not replace the list renderer.
- Full-runtime fallback remains allowed for a genuine fatal recovery path, but ownership transition must be explicit and observable.
- Desktop behavior remains unchanged.

## Audit command

Run:

```bash
node scripts/audit-mobile-phase0.js
```

The command prints machine-readable JSON with the current Phase 0 findings and metrics. It does not modify production behavior.
