# DRx Phase 3 rollback

Phase 3 is additive and private. It does not replace raw registry data, V2 runtime data,
or provenance.

## Trigger

Use this rollback if a Phase 3 normalization defect, privilege regression, or parity
failure is detected.

## Procedure

1. Stop every consumer from reading \`drx_norm.*\`.
2. Keep \`publication_allowed=false\` and do not enable V3 strict traffic.
3. Route reads back to the existing \`drx_stage\`/V2 path.
4. Re-run Phase 1/2 integrity checks to confirm raw registry and correction-ledger parity.
5. Preserve the Phase 3 schema, review queue, migration history and evidence for audit.
6. Correct the defect with a new forward migration and re-run the Phase 3 gate.

## Safety constraints

- **Do not drop** \`drx_norm\`, raw registry tables, provenance, or correction-ledger rows.
- Do not mutate source strength/form/route/population text in place.
- Do not convert percentage or concentration values during rollback.
- Do not promote unresolved route, release, strength, or population records.
- V2 remains the runtime fallback until the final strict cutover phase.

Because no production traffic is cut over to Phase 3 in this phase, rollback is a
read-path switch, not destructive database cleanup.
