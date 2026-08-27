-- Synced from Supabase production migration history.
-- version: 20260819123059
-- name: test_local_table_from_neon_foreign

drop table if exists public._migration_drugs_shape_test;
create table public._migration_drugs_shape_test (like _migration_neon.drugs including all);
