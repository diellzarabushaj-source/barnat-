-- Synced from Supabase production migration history.
-- version: 20260819123616
-- name: add_neon_view_definition_bridge

drop foreign table if exists _migration_neon.pg_views_remote;
create foreign table _migration_neon.pg_views_remote (
  schemaname name,
  viewname name,
  viewowner name,
  definition text
) server medindex_neon_test
options (schema_name 'pg_catalog', table_name 'pg_views');
