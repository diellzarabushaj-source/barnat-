-- Phase 6B: read-only evidence pack for index rationalization.
-- Run only against production when the Supabase SQL gateway is healthy.
-- This file intentionally contains no schema/data mutation.
--
-- Current Supabase guidance: combine query-shape evidence, EXPLAIN plans,
-- index usage, relation size, and write-cost considerations. Never drop an
-- index solely because an advisor labels it unused.

begin read only;
set local statement_timeout = '8s';
set local lock_timeout = '2s';

-- 1) Stats horizon: low scan counts are meaningless without knowing when
-- PostgreSQL statistics were last reset.
select
  current_database() as database_name,
  now() as observed_at,
  stats_reset
from pg_stat_database
where datname = current_database();

-- 2) Candidate index usage + size.
with candidates(index_name) as (
  values
    ('drugs_search_idx'),
    ('sync_outbox_entity_idx'),
    ('sync_outbox_processing_idx'),
    ('drive_sheet_rows_hash_idx'),
    ('drive_sheet_rows_payload_gin_idx'),
    ('drive_sheet_rows_source_row_idx')
)
select
  s.schemaname,
  s.relname as table_name,
  s.indexrelname as index_name,
  s.idx_scan,
  s.idx_tup_read,
  s.idx_tup_fetch,
  pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size,
  pg_relation_size(s.indexrelid) as index_bytes,
  pg_get_indexdef(s.indexrelid) as index_definition
from pg_stat_user_indexes s
join candidates c on c.index_name = s.indexrelname
order by s.relname, s.indexrelname;

-- 3) Protected/deferred index usage + size. These are comparison controls:
-- rare-but-critical FK/admin/clinical indexes should not be judged by scan
-- count alone.
with protected(index_name) as (
  values
    ('drugs_published_active_substance_registry_idx'),
    ('drugs_published_strength_registry_idx'),
    ('user_notes_drug_idx'),
    ('user_notes_user_live_updated_idx'),
    ('verification_documents_reviewed_by_idx'),
    ('profiles_status_created_idx'),
    ('dose_safety_v2_product_idx'),
    ('dose_safety_v2_substance_idx'),
    ('icd_hierarchy_nodes_code_idx'),
    ('icd_hierarchy_nodes_parent_idx')
)
select
  s.schemaname,
  s.relname as table_name,
  s.indexrelname as index_name,
  s.idx_scan,
  pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size,
  pg_get_indexdef(s.indexrelid) as index_definition
from pg_stat_user_indexes s
join protected p on p.index_name = s.indexrelname
order by s.relname, s.indexrelname;

-- 4) Table read/write pressure and total index footprint.
select
  st.schemaname,
  st.relname as table_name,
  st.n_live_tup,
  st.seq_scan,
  st.idx_scan,
  st.n_tup_ins,
  st.n_tup_upd,
  st.n_tup_del,
  pg_size_pretty(pg_total_relation_size(st.relid)) as total_relation_size,
  pg_size_pretty(pg_indexes_size(st.relid)) as indexes_size
from pg_stat_user_tables st
where st.schemaname = 'public'
  and st.relname in (
    'drugs',
    'sync_outbox',
    'drive_sheet_rows',
    'user_notes',
    'verification_documents',
    'profiles',
    'dose_safety_v2',
    'icd_hierarchy_nodes'
  )
order by pg_total_relation_size(st.relid) desc;

-- 5) Exact duplicate index signatures. Primary/unique indexes are retained in
-- the output so the reviewer can see why a superficially redundant index may
-- still carry a constraint.
with index_signatures as (
  select
    i.indrelid,
    i.indexrelid,
    n.nspname as schema_name,
    t.relname as table_name,
    x.relname as index_name,
    i.indisunique,
    i.indisprimary,
    i.indisvalid,
    i.indkey,
    i.indclass,
    i.indcollation,
    i.indoption,
    pg_get_expr(i.indexprs, i.indrelid) as index_expressions,
    pg_get_expr(i.indpred, i.indrelid) as predicate
  from pg_index i
  join pg_class t on t.oid = i.indrelid
  join pg_class x on x.oid = i.indexrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
)
select
  a.table_name,
  a.index_name as index_a,
  b.index_name as index_b,
  a.indisunique as index_a_unique,
  b.indisunique as index_b_unique,
  a.indisprimary as index_a_primary,
  b.indisprimary as index_b_primary,
  pg_size_pretty(pg_relation_size(a.indexrelid)) as index_a_size,
  pg_size_pretty(pg_relation_size(b.indexrelid)) as index_b_size
from index_signatures a
join index_signatures b
  on a.indrelid = b.indrelid
 and a.indexrelid < b.indexrelid
 and a.indkey = b.indkey
 and a.indclass = b.indclass
 and a.indcollation = b.indcollation
 and a.indoption = b.indoption
 and a.index_expressions is not distinct from b.index_expressions
 and a.predicate is not distinct from b.predicate
order by a.table_name, a.index_name, b.index_name;

-- 6) Foreign keys with no left-prefix supporting index on the referencing
-- table. Expected result for the final architecture target: zero rows.
with foreign_keys as (
  select
    c.oid as constraint_oid,
    n.nspname as schema_name,
    t.relname as table_name,
    c.conname as constraint_name,
    c.conrelid,
    c.conkey
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where c.contype = 'f'
    and n.nspname = 'public'
),
support as (
  select
    fk.*,
    exists (
      select 1
      from pg_index i
      where i.indrelid = fk.conrelid
        and i.indisvalid
        and i.indisready
        and i.indpred is null
        and (i.indkey::smallint[])[1:cardinality(fk.conkey)] = fk.conkey
    ) as has_supporting_index
  from foreign_keys fk
)
select
  schema_name,
  table_name,
  constraint_name,
  conkey as fk_attribute_numbers
from support
where not has_supporting_index
order by table_name, constraint_name;

-- 7) pg_stat_statements: actual SQL workload touching the candidate tables.
-- Keep the normalized query text so candidate decisions are tied to real
-- predicates/orderings instead of only aggregate scan counters.
select
  calls,
  round(total_exec_time::numeric, 3) as total_exec_ms,
  round(mean_exec_time::numeric, 3) as mean_exec_ms,
  rows,
  shared_blks_hit,
  shared_blks_read,
  temp_blks_read,
  temp_blks_written,
  left(regexp_replace(query, '\\s+', ' ', 'g'), 1000) as normalized_query
from extensions.pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
  and (
    lower(query) like '%drugs%'
    or lower(query) like '%sync_outbox%'
    or lower(query) like '%drive_sheet_rows%'
  )
order by total_exec_time desc
limit 100;

-- 8) Representative current registry query shapes. These are protected
-- indexes and should show whether the planner benefits from their ordering.
explain (analyze, buffers, format text)
select
  id, registry_number, trade_name, active_substance, strength
from public.drugs
where is_published = true
  and editorial_status = 'published'
order by active_substance asc nulls last, registry_number asc
limit 50;

explain (analyze, buffers, format text)
select
  id, registry_number, trade_name, active_substance, strength
from public.drugs
where is_published = true
  and editorial_status = 'published'
order by strength asc nulls last, registry_number asc
limit 50;

-- 9) Current Phase 3 search path, contrasted against the legacy FTS expression
-- that drugs_search_idx was built for.
explain (analyze, buffers, format text)
select *
from public.medindex_search_drugs_v2('paracetamol', 20);

explain (analyze, buffers, format text)
select id, registry_number
from public.drugs
where to_tsvector(
        'simple',
        coalesce(trade_name, '') || ' ' ||
        coalesce(active_substance, '') || ' ' ||
        coalesce(atc_code, '') || ' ' ||
        coalesce(use_text, '')
      ) @@ plainto_tsquery('simple', 'paracetamol')
limit 20;

-- 10) Current outbox pull shape. The existing delivery composite index should
-- be favored; the entity/processing candidates should not be retained merely
-- because they exist.
explain (analyze, buffers, format text)
select id, row_key, payload, idempotency_key, status, attempts,
       available_at, updated_at, last_error
from public.sync_outbox
where destination = 'google_sheet'
  and status in ('pending', 'failed', 'processing')
order by id asc
limit 150;

-- 11) Current Drive mirror lookup shape. Runtime writes/upserts by the unique
-- (source_id,row_key) key and does not query payload/source_hash.
explain (analyze, buffers, format text)
select source_id, row_key, row_number, source_hash
from public.drive_sheet_rows
where source_id = (
  select source_id
  from public.drive_sheet_rows
  order by updated_at desc
  limit 1
)
order by row_key
limit 200;

rollback;
