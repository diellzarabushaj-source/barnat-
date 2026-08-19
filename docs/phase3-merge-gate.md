# DO NOT MERGE — Phase 3 gate

This branch is intentionally **not production-ready yet**.

Merge only after:

- all seven remaining private tables are copied from Neon to Supabase;
- exact baseline counts and tombstone state match;
- sequences and foreign keys are verified;
- Preview login, Favorites, prescriptions, clinical-editor write and sync-outbox smoke tests pass;
- `MEDINDEX_WRITE_PROVIDER=supabase` is enabled explicitly only for the tested environment;
- Neon remains intact as rollback.

Until then, the code defaults private reads/writes to Neon even when a Supabase server secret is present.
