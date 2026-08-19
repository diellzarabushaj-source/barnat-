# Phase 3 status

Prepared safely; private-state migration pending.

- Production medical reads are already on Supabase and post-cutover runtime logs were clean.
- Production private writes/sync remain on Neon.
- Supabase private schema exists and is locked behind RLS/no direct anon/authenticated grants.
- One MedIndex user row is present in Supabase; remaining private-state tables are not yet copied.
- Supabase Auth is not yet the production identity provider.
- Branch requires explicit `MEDINDEX_WRITE_PROVIDER=supabase`; secret presence alone is insufficient.
