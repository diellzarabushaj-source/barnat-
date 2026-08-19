# Phase 3 variable recommendations

## Production

Keep the current production login configuration unchanged during the database write migration.

Before merge/cutover:

- `SESSION_SECRET`: keep existing value.
- `GOOGLE_CLIENT_ID`: keep existing value.
- existing access-code fallback: keep unchanged if currently enabled.
- `MEDINDEX_MEDICAL_READ_PROVIDER`: Supabase (or leave current production behavior if already verified).
- `SUPABASE_SECRET_KEY` or `MEDINDEX_SUPABASE_SECRET_KEY`: server-only; never expose client-side.
- `MEDINDEX_WRITE_PROVIDER`: keep `neon` until private-state parity is verified, then change explicitly to `supabase`.
- `MEDINDEX_DRIVE_SYNC_SECRET`: keep existing production value for Drive sync.

## Preview

Observed Preview currently has a Supabase server secret and `SESSION_SECRET`, but does not have `GOOGLE_CLIENT_ID` or `MEDINDEX_DRIVE_SYNC_SECRET`.

If Preview is used for the full Phase 3 smoke test, add the missing Preview-scoped login/sync variables. Do not copy or expose secret values into source control.

The branch is fail-safe: a Supabase secret alone does not change the write provider.
