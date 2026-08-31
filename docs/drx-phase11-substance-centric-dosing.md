# DRx Phase 11 — Substance-Centric Dosing

## Goal

Store clinical dose rules once at the canonical substance or exact ingredient-set level, then reuse them across compatible market products without copying the same dose prose into every brand.

Runtime model:

```
market product
  -> canonical substance OR exact ingredient set
  -> verified dose rule
  -> indication + population + route + form/release compatibility
  -> patient calculation
  -> product strength/concentration conversion
```

## Safety contract

- Free-text legacy dose prose is never published directly.
- Machine parsing creates candidates only.
- `auto_publish_allowed` is hard-locked to `false`.
- Candidate promotion creates a DRAFT V3 rule only after explicit review and exact source/indication prerequisites.
- Combination products cannot be auto-promoted until their dose-basis component is explicitly resolved.
- Rule inheritance requires a VERIFIED rule target and strict compatible product identity.
- Current Phase 11 runtime serving remains disabled. Existing V3 explicit product bindings continue to be authoritative.

## Live database baseline after Phase 11C

- Published products: 4,013
- Product target rows: 4,013
- Ingredient targets ready: 3,909
- Strict auto-inheritance product identities ready: 1,246
- Published legacy regimens in source view: 7,779
- Candidate rows staged for currently published products: 7,777
- Legacy rows excluded because their product is not currently published: 2
- Structured parser candidates: 1,424
- Text-only candidates: 5,513
- Blocked/restricted candidates: 644
- Needs-review candidates: 196
- Candidate contexts: 5,461
- Context conflicts: 109
- Source URLs queued for verified §4.2 ingestion: 2,585
- Indication strings queued for canonical normalization: 2,185
- Existing V3 rule targets reconciled: 4/4, all exact-strength scoped
- Inherited runtime matches: 0
- Promoted draft rules: 0
- Auto-published candidate rules: 0

Current product coverage classification:

- TEXT_ONLY: 2,582 products
- CANDIDATE_REVIEW: 1,214 products
- INSUFFICIENT_DATA: 113 products
- INGREDIENT_REVIEW: 104 products

These are staging/readiness states, not clinical publication claims.

## Main Phase 11 objects

### Rule reuse

- `drx_dose.rule_targets_v1`
- `drx_dose.product_rule_targets_v1`
- `drx_dose.inherited_rule_matches_v1`

### Text-to-rule staging

- `drx_dose.rule_candidate_extractions_v1`
- `drx_dose.rule_candidate_contexts_v1`
- `drx_dose.rule_candidate_context_conflicts_v1`
- `drx_dose.rule_candidate_promotion_queue_v1`

### Fill queues

- `drx_dose.source_ingestion_queue_v1`
- `drx_dose.indication_normalization_queue_v1`
- `drx_dose.phase11_review_queue_v1`
- `drx_dose.product_calculator_coverage_v1`

### Review / draft promotion

- `public.drx_phase11_review_candidate_v1(...)`
- `public.drx_phase11_promote_candidate_to_draft_v1(...)`
- `drx_dose.candidate_review_events_v1`
- `drx_dose.candidate_promotions_v1`

### Audit

- `public.drx_phase11_status_v1()`
- `public.drx_phase11_product_context_v1(uuid)`
- `public.drx_phase11_refresh_candidates_v1()`

## What "fill the calculator" now means

The 4,013 products do not need 4,013 manually duplicated clinical dose records.

The remaining work is queue-driven:

1. Resolve the remaining ingredient identities.
2. Normalize missing routes/variants where strict inheritance needs them.
3. Ingest exact official source snapshots and section 4.2 evidence.
4. Normalize indication terms to V3 indication concepts.
5. Review structured candidates and conflicts.
6. Promote approved single-substance candidates to DRAFT V3 rules.
7. Resolve combination dose-basis components explicitly.
8. Run existing V3 safety/provenance/publication gates.
9. Verify rule targets and compatibility scope.
10. Enable substance inheritance only after shadow/parity evidence is clean.

The invariant is: product strength/concentration converts a verified clinical dose; it never invents the clinical dose.
