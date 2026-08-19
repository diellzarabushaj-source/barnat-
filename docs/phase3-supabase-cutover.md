# Phase 3 — Supabase private writes cutover

Status: **prepared, not yet safe to merge into production**.

## Current production

- Medical GET reads: Supabase.
- Private writes/reads and sync state: Neon.
- Neon remains rollback/backup.

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

## Cutover gate

Do **not** merge/cut over writes until all of the following are true:

1. Private Neon rows are copied into Supabase preserving IDs and timestamps.
2. Exact counts and critical state checks match.
3. Supabase RLS remains enabled and `anon`/`authenticated` have no direct grants on private server tables.
4. Preview login and Drive sync variables are available if those flows will be tested in Preview.
5. Preview smoke tests pass for login, Favorites, saved prescriptions, clinical-editor writes and sync outbox.
6. Neon remains unchanged for rollback.

## Rollback

Set:

```env
MEDINDEX_WRITE_PROVIDER=neon
```

Medical read rollback remains:

```env
MEDINDEX_MEDICAL_READ_PROVIDER=neon
```

No Neon tables should be deleted during Phase 3.

## Supabase Auth

Database/user-state migration is separate from switching the identity provider. Existing MedIndex cookie auth remains the safe login path until Supabase Google Auth is configured and tested. Do not replace the current login in the same unverified step as the database write cutover.
