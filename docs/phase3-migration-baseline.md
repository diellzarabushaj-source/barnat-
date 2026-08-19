# Phase 3 private migration baseline

Exact Neon baseline before private-state migration:

| Table | Rows |
|---|---:|
| medindex_users | 1 |
| user_favorites | 82 |
| user_prescriptions | 2 |
| drive_sync_sources | 10 |
| drive_sheet_rows | 31 |
| sync_runs | 5 |
| sync_outbox | 65 |
| audit_logs | 1417 |

Additional state:

- `user_favorites`: 82 total, 0 currently active; tombstones must be preserved.
- `user_prescriptions`: 2 total, 0 currently active; tombstones must be preserved.
- Supabase currently has the matching `medindex_users` row only; the other seven private tables must be copied before write cutover.
- Supabase Auth is a separate migration and currently has no users.

Acceptance requires exact row/state parity, foreign-key integrity and sequence correction before setting `MEDINDEX_WRITE_PROVIDER=supabase`.
