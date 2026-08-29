-- Service-role ingestion grants for V3 source provenance.
-- version: 20260829151516
-- name: drx_v3_service_ingestion_grants
--
-- Recovered from production. This migration was applied live but no file was
-- committed, so the repository and the database had drifted by one migration.
-- The statements below are the exact text recorded in
-- supabase_migrations.schema_migrations for this version, not a reconstruction
-- from intent.
--
-- These grants let a trusted server-side ingester write archived SmPC section
-- text, which cannot travel through the repository: dose_source_sections_v3
-- requires section_text, and the archive attestation deliberately carries
-- hashes only so no document text is ever committed.
--
-- service_role only. anon and authenticated hold nothing here, and RLS stays
-- enabled on both tables.

grant select on table public.dose_source_snapshots_v3 to service_role;
grant select, insert, update on table public.dose_source_sections_v3 to service_role;
