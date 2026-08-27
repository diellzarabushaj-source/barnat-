-- Synced from Supabase production migration history.
-- version: 20260819122922
-- name: test_neon_migration_bridge

create schema if not exists _migration_neon;
drop foreign table if exists _migration_neon.drugs_test;
create foreign table _migration_neon.drugs_test (
  id uuid
) server medindex_neon_test
options (schema_name 'public', table_name 'drugs');
