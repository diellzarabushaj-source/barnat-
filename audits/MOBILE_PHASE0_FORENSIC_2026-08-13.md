# MedIndex Mobile — Phase 0 Forensic Audit

Date: 2026-08-13  
Scope: phone registry architecture, renderer ownership, runtime handoff, CSS geometry, shell breakpoints, build artifact parity, and network/cache policy.

## Rule for Phase 0

Phase 0 is the forensic baseline. It must prove who owns the phone registry DOM and network path before later visual/performance phases are accepted. The audit is run against the post-`build:runtime` artifact because build patches intentionally mutate runtime files.

## Historical critical findings and their current status

### P0-RACE-001 — fixed and regression-gated

The original loader gave mobile-lite a fixed grace period and could start the full registry if the lightweight response was slow. That created a credible dual-owner race.

Current contract:

- `registry-runtime-loader-v9` no longer has the `mobile-lite-timeout` takeover;
- a 12-second `medindex:mobile-lite-stalled` diagnostic is observable but does **not** wake the full renderer;
- normal delayed phone startup must keep `/api/registry` untouched;
- the post-build WebKit probe deliberately delays `/api/drug-search?view=registry-page` for 13 seconds so the stall path is exercised rather than merely inferred from source.

### P0-OWNER-002 — fixed and regression-gated

Ordinary phone interactions/errors may not replace the mobile list renderer. Nonfatal mobile full-runtime requests are blocked, and full runtime is reserved for explicit fatal recovery or a transition out of the phone viewport.

### P0-DOM-009 — fixed with an unconditional phone guard

The desktop/tablet first-page enhancer previously depended on a deferred mobile-lite marker. That dependency was itself an execution-order risk.

Current `first-page-clinical.js` decides ownership directly from the phone breakpoint:

- `phoneOwnsFirstPage()` is true on `<=767px`;
- the guard runs before any desktop first-page DOM rewrite;
- the phone path stamps `data-first-page-clinical="phone-skipped"`;
- it emits `medindex:first-page-audit-ready` with owner `phone-registry`;
- it preserves the canonical `registry-filter-panel-unified` marker without constructing desktop toolbar/table chrome;
- the decision does not depend on `data-registry-mobile-lite`, removing the deferred-script race.

## Historical high findings and current status

### P0-GEOMETRY-003 — fixed and statically gated

The favorite control and `Më shumë` previously shared the right-side card geometry. The current card contract reserves independent action hitboxes and content width. `--assert-phase2-ready` prevents that collision geometry from returning.

### P0-BUILD-004 — accepted architecture constraint

`build:runtime` still applies ordered runtime patches, including mobile personalization. Therefore source-only review is not enough. CI always builds first, then executes the Phase 0 gates against the built artifact.

### P0-CASCADE-005 — still an architectural debt item, not a Phase 0 blocker

Multiple registry-mobile CSS layers remain. They are intentionally not consolidated during the forensic phase because bulk removal would make causality harder to verify. Later consolidation must happen only after geometry/runtime tests are green.

## Medium findings retained for later phases

### P0-BREAKPOINT-006

The shell experience and phone registry do not use the same breakpoint. The registry owner boundary remains `<=767px`; the wider shell breakpoint must be tested explicitly at 767/768/1023/1024 rather than treated as accidental equivalence.

### P0-NETWORK-007

Static assets currently favor freshness/revalidation while private APIs remain strict. This is a performance optimization target, not a Phase 0 ownership fix.

### P0-SHELL-008

Safari keyboard, drawer, detail sheet and rotation involve several shell systems. These state combinations remain covered by dedicated WebKit shell tests in later gates.

## Phase 0 acceptance gates

Phase 0 is considered complete only when both the static post-build gate and the delayed WebKit runtime gate pass.

### 1. Static source/build ownership gate

```bash
node scripts/audit-mobile-phase0.js --assert-phase0-ready --assert-phase1-ready --assert-phase2-ready
```

This verifies, among other invariants:

- no mobile timeout takeover;
- no ordinary mobile error/full-detail/advanced-control handoff;
- nonfatal full-runtime requests are blocked;
- fatal recovery remains explicit;
- the race-free `phoneOwnsFirstPage()` guard runs before desktop DOM rewriting;
- the `phone-skipped` and `phone-registry` ownership markers exist;
- the phone guard does not depend on a deferred mobile-lite marker;
- card action geometry keeps independent favorite/detail slots.

### 2. Post-build delayed-start runtime gate

```bash
PHASE0_MOBILE_SEARCH_DELAY_MS=13000 \
PHASE0_MOBILE_STALL_THRESHOLD_MS=12000 \
node scripts/audit-mobile-phase0-runtime.js --assert-single-owner
```

The WebKit probe uses a 390×844 phone viewport and records:

- `medindex:full-registry-started`;
- `medindex:mobile-lite-ready`;
- `medindex:mobile-lite-stalled`;
- blocked/full handoff events;
- `medindex:first-page-audit-ready` owner details;
- `/api/drug-search` and `/api/registry` requests;
- final runtime datasets;
- phone toolbar and first-card ownership/geometry.

Expected delayed-start result:

- the stall diagnostic is observed;
- full registry starts: `0`;
- `/api/registry` requests: `0`;
- mobile-lite reaches ready after the delayed bounded response;
- runtime settles to `mobile-lite`;
- first-page enhancer marker is `phone-skipped`;
- ownership event is `phone-registry`;
- the canonical phone toolbar marker remains present.

## CI enforcement on `main`

`.github/workflows/phase5-performance-audit.yml` now runs, in order:

1. `build:runtime`;
2. Phase 0 static forensic gates;
3. existing mobile static contracts;
4. browser installation;
5. Phase 0 13-second delayed WebKit single-owner gate;
6. Phase 5/6 interaction and main-thread gates;
7. phone WebKit density, shell, network and startup gates;
8. upload of Phase 0/5/6 diagnostics.

This means a future commit cannot silently reintroduce the old phone owner race while still passing the later performance suite.

## Phase 0 conclusion

The core root cause is architectural ownership, not lack of responsive CSS. The current architecture now has an explicit phone owner contract and machine-verifiable regression gates. Once both Phase 0 CI gates are green on the current `main`, the next implementation work can move to Phase 1/remaining shell density issues without reopening renderer ownership by guesswork.