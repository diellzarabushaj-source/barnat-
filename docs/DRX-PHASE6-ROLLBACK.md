# DRx Phase 6 rollback

Phase 6 is additive and private. It creates the `drx_clinical` evidence/classification
layer and does not alter raw registry evidence, Phase 5 market/variant identity, Phase 4
canonical identity, or the current production read path.

## Trigger

Use this rollback if provenance hashes, source-policy ordering, product/variant
classification, indication evidence, safety evidence, or access boundaries fail.

## Procedure

1. Stop consumers from reading `drx_clinical.*`.
2. Keep `publication_allowed=false`.
3. Route classification and identity reads back to Phase 5 / Phase 4.
4. Preserve source snapshots, section hashes, indication claims, safety claims and review queues.
5. Re-run Phase 1-5 gates and raw reconstruction parity.
6. Correct the defect with a forward migration and re-run `drx_phase6_status_v1()`.

## Safety constraints

- **Do not drop** `drx_clinical`, `drx_variant`, `drx_identity`, `drx_norm`,
  `drx_stage`, `drx_raw`, source snapshots or evidence sections.
- Do not invent ICD-10 codes from free text.
- Do not infer an Albanian canonical indication without explicit review.
- Do not infer structured safety semantics from regulatory prose.
- Do not bind a source document to a variant from a free-text candidate match.
- Do not majority-vote ATC conflicts into a single classification.
- Do not promote legacy safety rows that are still in review.
- Keep `publication_allowed=false` until a later explicit publication phase.

Rollback is a read-path switch, not destructive cleanup.
