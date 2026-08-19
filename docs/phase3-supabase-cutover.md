# Phase 3 — Supabase private writes cutover

Status: **prepared, not yet safe to merge into production**.

## Current production

- Medical GET reads: Supabase.
- Private reads/writes and sync state: Neon.
- Existing MedIndex cookie auth remains active and healthy.
- Neon remains rollback/backup and must not be deleted during this phase.
- Production runtime logs were clean after the medical-read cutover window that began around 12:50Z on 2026-08-19.

## Prepared branch behavior

The branch `supabase-write-cutover-20260819` adds server-side Supabase support for:

- `medindex_users`
- `user_favorites`
- `user_prescriptions`
- `drive_sync_sources`
- `drive_sheet_rows`
- `sync_runs`
- `sync_outbox`
- `audit_logs`
- medical-table writes from the clinical editor / sync pipeline

Supabase server access requires a server-only secret key. The publishable key is never used for privileged writes.

### Explicit write cutover

A Supabase server secret alone must never switch writes. The default and legacy `auto` behavior resolve to Neon. Supabase private reads/writes are enabled only with:

```env
MEDINDEX_WRITE_PROVIDER=supabase
```

Rollback is explicit:

```env
MEDINDEX_WRITE_PROVIDER=neon
```

Medical read rollback remains:

```env
MEDINDEX_MEDICAL_READ_PROVIDER=neon
```

## Exact migration baseline

| Table | Neon rows |
|---|---:|
| `medindex_users` | 1 |
| `user_favorites` | 82 |
| `user_prescriptions` | 2 |
| `drive_sync_sources` | 10 |
| `drive_sheet_rows` | 31 |
| `sync_runs` | 5 |
| `sync_outbox` | 65 |
| `audit_logs` | 1417 |

Additional state that must be preserved:

- `user_favorites`: 82 total, 0 currently active; tombstones remain part of sync history.
- `user_prescriptions`: 2 total, 0 currently active; tombstones remain part of sync history.
- Supabase currently contains the matching `medindex_users` row only; the other seven private tables are still pending migration.
- Supabase Auth currently has no users and is not the production identity provider.

## Supabase security state

All eight private server tables have Row Level Security enabled and no direct grants for `anon` or `authenticated`. This boundary must remain unchanged through cutover.

## Environment findings

Observed safely from the Vercel Preview build without printing secret values:

- `SUPABASE_SECRET_KEY`: present.
- `SESSION_SECRET`: present.
- Vercel OIDC token: present.
- `GOOGLE_CLIENT_ID`: not present in Preview.
- `MEDINDEX_DRIVE_SYNC_SECRET`: not present in Preview.
- `MEDINDEX_WRITE_PROVIDER`: not explicitly set in Preview.
- `MEDINDEX_MEDICAL_READ_PROVIDER`: not explicitly set in Preview.

Production `/api/auth` reports secure Google/session/password-fallback configuration, so Preview and Production variables are environment-scoped and must not be assumed identical.

If Preview is used for the complete Phase 3 smoke test, add the missing Preview-scoped login/sync variables without committing their values to source control.

## Cutover gate — DO NOT MERGE until complete

1. Copy the remaining private Neon rows into Supabase preserving IDs, timestamps and tombstones.
2. Match the exact baseline counts above.
3. Verify foreign-key integrity and correct the `audit_logs` / `sync_outbox` sequences after import.
4. Reconfirm RLS and zero direct `anon`/`authenticated` grants.
5. Smoke-test Preview login, Favorites, saved prescriptions, clinical-editor writes and sync outbox/Drive sync.
6. Set `MEDINDEX_WRITE_PROVIDER=supabase` only in the environment that has passed those checks.
7. Keep Neon intact as rollback until a stable observation window is complete.

## Preferred private-state copy path

Use the temporary PostgreSQL FDW bridge already prepared in Supabase. Enter the Neon user mapping directly in the Supabase SQL Editor; never transmit the Neon database password through chat or commit it to source control. After the copy and parity checks, remove the temporary user mapping/foreign bridge.

## Regression contract

`tests/supabase-write-cutover-test.js` locks the safety rule that no provider value, `auto`, or secret presence can select Supabase writes. Only the explicit `supabase` provider can do so; `neon` remains rollback.

## Supabase Auth

Database/user-state migration is separate from switching the identity provider. Existing MedIndex cookie auth remains the safe login path until Supabase Google Auth is configured and tested. Do not replace authentication in the same unverified step as the database write cutover.
