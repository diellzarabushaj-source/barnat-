# DRx Phase 5 rollback

Phase 5 is additive and private. It creates `drx_variant` as a derived modeling layer.
It does not alter raw registry evidence, Phase 4 identity data, Phase 3 normalization,
or the current production read path.

## Trigger

Use this rollback if clinical-variant grouping, market-product binding, metadata parity,
privilege boundaries, or the Phase 5 gate fails.

## Procedure

1. Stop consumers from reading `drx_variant.*`.
2. Keep `publication_allowed=false`; do not cut production reads over to Phase 5.
3. Route clinical identity reads back to Phase 4 `drx_identity` and Phase 3 `drx_norm`.
4. Re-run Phase 1-4 integrity checks and raw reconstruction parity.
5. Preserve the Phase 5 migration, anomaly queue, bindings and evidence for audit.
6. Correct the defect with a forward migration, run `drx_phase5_refresh_v1()`, then
   re-run `drx_phase5_status_v1()`.

## Safety constraints

- **Do not drop** `drx_variant`, `drx_identity`, `drx_norm`, `drx_stage`,
  `drx_raw`, provenance, or correction ledgers.
- Do not invent replacement PDIDs, registry numbers, market-product UUIDs, routes,
  release types, strengths, or forms.
- Do not force anomaly products into clinical variants.
- Do not merge commercial brands into the clinical identity layer.
- Do not publish Phase 5 data while the later publication gate remains closed.

Rollback is a read-path switch because Phase 5 is not yet the production runtime.
