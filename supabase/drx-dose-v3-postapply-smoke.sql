-- DRx Dosierung V3 immediate post-apply smoke
-- STATUS: PREPARED_NOT_EXECUTED
-- Run only after a successful fresh V3 candidate apply and before importing any V3 data.
-- This smoke is read-only and raises on structural/security drift.

begin transaction read only;

do $$
declare
  expected_tables text[] := array[
    'dose_source_snapshots_v3',
    'dose_source_sections_v3',
    'dose_indication_concepts_v3',
    'dose_indication_terms_v3',
    'dose_products_v3',
    'dose_rules_v3',
    'dose_renal_adjustments_v3',
    'dose_hepatic_adjustments_v3',
    'dose_rule_products_v3',
    'dose_legacy_comparisons_v3',
    'dose_review_queue_v3',
    'dose_publication_events_v3'
  ];
  actual_count integer;
  bad_rls integer;
  bad_write_grants integer;
  bad_public_select integer;
  bad_nonpublished_select integer;
  bad_function_security integer;
  bad_trigger_count integer;
  bad_provenance_trigger_count integer;
  nonempty_table_count integer;
  rpc_probe jsonb;
begin
  select count(*)::integer
    into actual_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname = any(expected_tables);

  if actual_count <> cardinality(expected_tables) then
    raise exception 'DRX_V3_SMOKE_FAILED: expected % V3 tables, found %',
      cardinality(expected_tables), actual_count;
  end if;

  select count(*)::integer
    into bad_rls
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(expected_tables)
    and c.relrowsecurity is not true;

  if bad_rls <> 0 then
    raise exception 'DRX_V3_SMOKE_FAILED: % V3 tables have RLS disabled', bad_rls;
  end if;

  select count(*)::integer
    into bad_write_grants
  from information_schema.table_privileges p
  where p.table_schema = 'public'
    and p.table_name = any(expected_tables)
    and p.grantee in ('PUBLIC','anon','authenticated')
    and p.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER');

  if bad_write_grants <> 0 then
    raise exception 'DRX_V3_SMOKE_FAILED: client/public write grants detected: %', bad_write_grants;
  end if;

  select count(*)::integer
    into bad_public_select
  from information_schema.table_privileges p
  where p.table_schema = 'public'
    and p.table_name = any(expected_tables)
    and p.grantee = 'PUBLIC'
    and p.privilege_type = 'SELECT';

  if bad_public_select <> 0 then
    raise exception 'DRX_V3_SMOKE_FAILED: PUBLIC SELECT grants detected: %', bad_public_select;
  end if;

  select count(*)::integer
    into bad_nonpublished_select
  from information_schema.table_privileges p
  where p.table_schema = 'public'
    and p.table_name = any(expected_tables)
    and p.grantee in ('anon','authenticated')
    and p.privilege_type = 'SELECT'
    and p.table_name not in (
      'dose_indication_concepts_v3',
      'dose_products_v3',
      'dose_rules_v3',
      'dose_renal_adjustments_v3',
      'dose_hepatic_adjustments_v3',
      'dose_rule_products_v3'
    );

  if bad_nonpublished_select <> 0 then
    raise exception 'DRX_V3_SMOKE_FAILED: client SELECT leaked to service/admin V3 tables: %',
      bad_nonpublished_select;
  end if;

  select count(*)::integer
    into bad_function_security
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where (
      (n.nspname = 'public' and p.proname = 'medindex_dose_product_fast_path_v3')
      or
      (n.nspname = 'private' and p.proname in (
        'drx_lock_source_snapshot_v3',
        'drx_lock_source_section_v3',
        'drx_enforce_product_publication_v3',
        'drx_enforce_rule_publication_v3'
      ))
    )
    and p.prosecdef is true;

  if bad_function_security <> 0 then
    raise exception 'DRX_V3_SMOKE_FAILED: SECURITY DEFINER detected on V3 function';
  end if;

  select count(*)::integer
    into bad_trigger_count
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and (
      (c.relname = 'dose_products_v3' and t.tgname = 'dose_products_v3_publication_guard')
      or
      (c.relname = 'dose_rules_v3' and t.tgname = 'dose_rules_v3_publication_guard')
    )
    and not t.tgisinternal;

  if bad_trigger_count <> 2 then
    raise exception 'DRX_V3_SMOKE_FAILED: expected 2 publication triggers, found %',
      bad_trigger_count;
  end if;

  select count(*)::integer
    into bad_provenance_trigger_count
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and (
      (c.relname = 'dose_source_snapshots_v3' and t.tgname = 'dose_source_snapshots_v3_provenance_lock')
      or
      (c.relname = 'dose_source_sections_v3' and t.tgname = 'dose_source_sections_v3_provenance_lock')
    )
    and not t.tgisinternal;

  if bad_provenance_trigger_count <> 2 then
    raise exception 'DRX_V3_SMOKE_FAILED: expected 2 provenance lock triggers, found %',
      bad_provenance_trigger_count;
  end if;

  select
    ((select count(*) from public.dose_source_snapshots_v3) > 0)::int +
    ((select count(*) from public.dose_source_sections_v3) > 0)::int +
    ((select count(*) from public.dose_indication_concepts_v3) > 0)::int +
    ((select count(*) from public.dose_indication_terms_v3) > 0)::int +
    ((select count(*) from public.dose_products_v3) > 0)::int +
    ((select count(*) from public.dose_rules_v3) > 0)::int +
    ((select count(*) from public.dose_renal_adjustments_v3) > 0)::int +
    ((select count(*) from public.dose_hepatic_adjustments_v3) > 0)::int +
    ((select count(*) from public.dose_rule_products_v3) > 0)::int +
    ((select count(*) from public.dose_legacy_comparisons_v3) > 0)::int +
    ((select count(*) from public.dose_review_queue_v3) > 0)::int +
    ((select count(*) from public.dose_publication_events_v3) > 0)::int
    into nonempty_table_count;

  if nonempty_table_count <> 0 then
    raise exception 'DRX_V3_SMOKE_FAILED: fresh V3 shadow schema is not empty';
  end if;

  select public.medindex_dose_product_fast_path_v3(null, null)
    into rpc_probe;

  if rpc_probe is not null then
    raise exception 'DRX_V3_SMOKE_FAILED: selector-less RPC probe must fail closed to NULL';
  end if;
end
$$;

rollback;
