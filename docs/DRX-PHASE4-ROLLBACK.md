# DRx Phase 4 rollback

Phase 4 is additive and private. It creates the `drx_identity` namespace and does not
replace raw registry evidence, Phase 3 normalization, or the current production read path.

## Trigger

Use this rollback if an identity mapping, component alignment, privilege boundary, or
Phase 4 parity check fails.

## Procedure

1. Stop all consumers from reading `drx_identity.*`.
2. Keep `publication_allowed=false`; do not promote Phase 4 identities to production.
3. Route identity/form/route reads back to the Phase 3 `drx_norm` and existing V2 path.
4. Re-run Phase 1-3 integrity and raw reconstruction checks.
5. Preserve all Phase 4 migrations, source maps, review queues and evidence for audit.
6. Correct the defect with a new forward migration and re-run `drx_phase4_status_v1()`.

## Safety constraints

- **Do not drop** `drx_identity`, `drx_norm`, `drx_stage`, `drx_raw`, provenance,
  correction ledgers, or source-literal review identities.
- Do not merge base and salt identities as a rollback shortcut.
- Do not convert search aliases into identity merges.
- Do not treat source-literal identities as chemical equivalence.
- Do not silently resolve review-queue rows.
- Keep publication closed until a later explicit cutover phase.

Because Phase 4 is not the production read path, rollback is a consumer/read-path switch,
not destructive cleanup.
