# Phase 3 regression check

The branch includes `tests/supabase-write-cutover-test.js` to lock the safety contract:

- no `MEDINDEX_WRITE_PROVIDER` => Neon writes
- `MEDINDEX_WRITE_PROVIDER=auto` => Neon writes (legacy/fail-safe behavior)
- presence of a Supabase server secret alone => does not cut over writes
- only `MEDINDEX_WRITE_PROVIDER=supabase` selects Supabase private reads/writes
- `MEDINDEX_WRITE_PROVIDER=neon` remains the emergency rollback

This test is intentionally isolated so it can be run directly during the Phase 3 acceptance gate before merge.
