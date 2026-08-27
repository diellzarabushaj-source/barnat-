-- Synced from Supabase production migration history.
-- version: 20260819124113
-- name: cleanup_neon_migration_bridge

drop server if exists medindex_neon_test cascade;
drop schema if exists _migration_neon cascade;
drop extension if exists postgres_fdw;
