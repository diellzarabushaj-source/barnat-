-- Synced from Supabase production migration history.
-- version: 20260829003649
-- name: phase1_publication_and_default_grant_hardening

-- Phase 1 perfection: publication gates + future explicit grants.

do $$
declare
  t text;
  dose_tables text[] := array[
    'dose_indications_v2',
    'dose_products_v2',
    'dose_rule_products_v2',
    'dose_rules_v2',
    'dose_safety_v2',
    'dose_sources_v2'
  ];
begin
  foreach t in array dose_tables loop
    execute format('drop policy if exists medical_content_read on public.%I', t);
    execute format(
      'create policy medical_content_read on public.%I for select to anon, authenticated using (active = true and editorial_status = ''published'')',
      t
    );
  end loop;
end $$;

drop policy if exists medical_content_read on public.drug_indications;
create policy medical_content_read
on public.drug_indications
for select
to anon, authenticated
using (editorial_status = 'published');

drop policy if exists medical_content_read on public.icd_codes;
create policy medical_content_read
on public.icd_codes
for select
to anon, authenticated
using (is_published = true and editorial_status = 'published');

drop policy if exists medical_content_read on public.icd_hierarchy_nodes;
create policy medical_content_read
on public.icd_hierarchy_nodes
for select
to anon, authenticated
using (is_published = true);

drop policy if exists medical_content_read on public.icd_hierarchy_revisions;
create policy medical_content_read
on public.icd_hierarchy_revisions
for select
to anon, authenticated
using (status = 'active');

drop policy if exists medical_content_read on public.lab_tests;
create policy medical_content_read
on public.lab_tests
for select
to anon, authenticated
using (is_published = true and editorial_status = 'published');

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete, truncate, references, trigger
  on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select, update
  on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute
  on functions from public, anon, authenticated, service_role;
