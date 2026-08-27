-- Synced from Supabase production migration history.
-- version: 20260819130038
-- name: prepare_phase3_neon_bridge

create schema if not exists extensions;
create extension if not exists postgres_fdw with schema extensions;
drop server if exists medindex_neon_phase3 cascade;
create server medindex_neon_phase3 foreign data wrapper postgres_fdw options (host 'ep-sweet-sun-afpg3338.c-2.us-west-2.aws.neon.tech', port '5432', dbname 'neondb', sslmode 'require');
