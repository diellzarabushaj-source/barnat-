# DRx Phase 7 rollback

Phase 7 is additive and fail-closed. It creates `drx_dose` staging and three
publication-verification guards around the empty V3 dosing tables.

## Trigger

Use this rollback if posology provenance, legacy comparison staging, product-source
binding review, or any V3 guard behaves incorrectly.

## Procedure

1. Keep all V3 rows unpublished and stop consumers from using V3 dosing.
2. Route dosing reads back to the Phase 6 / legacy read path.
3. Preserve `drx_dose`, source §4.2 evidence, review queues and manual decisions.
4. Re-run Phase 1-6 gates and raw reconstruction parity.
5. Correct the issue with a forward migration.
6. Re-run `drx_phase7_status_v1()` before any verification/publication work resumes.

## Safety constraints

- **Do not drop** `drx_dose`, `drx_clinical`, `drx_variant`, `drx_identity`,
  `drx_norm`, `drx_stage`, `drx_raw` or source snapshots.
- Do not disable the V3 publication guards as a shortcut.
- Do not auto-migrate legacy regimens into V3 rules.
- Do not infer structured doses, frequencies, durations or maxima from free text.
- Do not verify a product without an explicit reviewed product-source binding.
- Do not verify a rule unless exact §4.2 provenance, substance identity, indication
  review and safety validation all pass.
- Keep `publication_allowed=false` until an explicit later cutover.

Rollback is a read-path switch, not destructive cleanup.
