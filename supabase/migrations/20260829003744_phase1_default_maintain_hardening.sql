-- Synced from Supabase production migration history.
-- version: 20260829003744
-- name: phase1_default_maintain_hardening

-- PostgreSQL 17 MAINTAIN is not required by Data API roles.
revoke maintain on all tables in schema public
from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke maintain on tables from anon, authenticated, service_role;
