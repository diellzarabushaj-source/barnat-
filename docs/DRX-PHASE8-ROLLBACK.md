# DRx Phase 8 rollback

Phase 8 is shadow-only. V2 remains the served dosing runtime and V3 is not cut over.

## Trigger

Use this rollback if shadow comparison causes latency/errors, telemetry writes fail,
the V3 shadow read model exposes unverified rows, or parity logic is incorrect.

## Procedure

1. Set `DRX_DOSE_V3_SHADOW=false`.
2. Keep `DRX_DOSE_V3_READS=false` and `DRX_DOSE_V3_STRICT=false`.
3. Continue serving the existing V2 product-rules runtime.
4. Preserve `drx_runtime.shadow_comparisons_v1` for audit.
5. Correct Phase 8 with a forward migration/commit.
6. Re-run `drx_phase8_status_v1()` before re-enabling shadow mode.

## Safety constraints

- **Do not drop** `drx_runtime`, `drx_dose`, `drx_clinical`, `drx_variant`,
  `drx_identity`, `drx_norm`, `drx_stage`, `drx_raw` or provenance.
- Do not make shadow results affect the clinical API response.
- Do not persist full clinical payloads in telemetry; only hashes/diff codes.
- Do not enable V3 cutover or strict mode in Phase 8.
- Do not publish V3 products/rules as part of shadow testing.
- Keep V2 fallback until the explicit later cutover phase.

Rollback is a feature-flag switch, not destructive cleanup.
