-- DRx strict Phase 8: service-only read model, search shadow and parity telemetry.
-- V2 remains the served runtime. V3 shadow reads must never change clinical output.

create schema if not exists drx_runtime;
revoke all on schema drx_runtime from public,anon,authenticated;

create or replace view drx_runtime.published_product_read_model_v1 as
select
  p.product_id,
  p.drug_id,
  p.product_key,
  p.registry_number,
  p.pdid,
  p.trade_name,
  p.active_substance,
  p.atc_code,
  p.pharmaceutical_form,
  p.route,
  p.patient_group,
  p.version_no,
  count(distinct r.rule_id)::integer rule_count,
  lower(concat_ws(' ',
    p.product_key,
    p.registry_number,
    p.pdid,
    p.trade_name,
    p.active_substance,
    p.atc_code,
    p.pharmaceutical_form,
    p.route
  )) search_text
from public.dose_products_v3 p
join public.dose_rule_products_v3 b
  on b.product_id=p.product_id
 and b.binding_status='verified'
join public.dose_rules_v3 r
  on r.rule_id=b.rule_id
 and r.editorial_status='published'
join public.dose_indication_concepts_v3 i
  on i.indication_id=r.indication_id
 and i.editorial_status='published'
join public.dose_source_snapshots_v3 ps
  on ps.snapshot_id=p.source_snapshot_id
 and ps.source_key=p.source_key
 and ps.source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM')
join public.dose_source_snapshots_v3 rs
  on rs.snapshot_id=r.source_snapshot_id
 and rs.source_key=r.source_key
 and rs.source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM')
join public.dose_source_sections_v3 sec
  on sec.snapshot_id=r.source_snapshot_id
 and sec.section_code='4.2'
 and sec.extraction_status='extracted'
 and sec.section_sha256=r.source_section_sha256
where p.editorial_status='published'
  and p.source_snapshot_id=p.source_evidence_hash
  and r.source_snapshot_id=r.source_evidence_hash
  and r.source_section='4.2'
  and r.safety_validation_status='passed'
group by
  p.product_id,p.drug_id,p.product_key,p.registry_number,p.pdid,p.trade_name,
  p.active_substance,p.atc_code,p.pharmaceutical_form,p.route,p.patient_group,p.version_no;

create or replace function public.drx_dose_search_v3_shadow_v1(
  p_query text,
  p_limit integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_runtime
as $$
with input as (
  select
    lower(btrim(coalesce(p_query,''))) q,
    greatest(1,least(coalesce(p_limit,20),50)) lim
),
matches as (
  select
    r.product_key,
    r.drug_id,
    r.registry_number,
    r.pdid,
    r.trade_name,
    r.active_substance,
    r.atc_code,
    r.pharmaceutical_form,
    r.route,
    r.patient_group,
    r.rule_count,
    case
      when lower(r.product_key)=i.q then 1
      when lower(coalesce(r.registry_number,''))=i.q then 2
      when lower(coalesce(r.pdid,''))=i.q then 3
      when lower(r.trade_name)=i.q then 4
      when lower(r.active_substance)=i.q then 5
      when r.search_text like i.q || '%' then 6
      else 10
    end rank
  from drx_runtime.published_product_read_model_v1 r
  cross join input i
  where length(i.q)>=2
    and r.search_text like '%' || i.q || '%'
  order by rank,r.trade_name,r.product_key
  limit (select lim from input)
)
select coalesce(jsonb_agg(jsonb_build_object(
  'productKey',product_key,
  'drugId',drug_id,
  'registryNumber',registry_number,
  'pdid',pdid,
  'tradeName',trade_name,
  'activeSubstance',active_substance,
  'atcCode',atc_code,
  'pharmaceuticalForm',pharmaceutical_form,
  'route',route,
  'patientGroup',patient_group,
  'ruleCount',rule_count
) order by rank,trade_name,product_key),'[]'::jsonb)
from matches;
$$;

create table if not exists drx_runtime.shadow_comparisons_v1 (
  comparison_id uuid primary key default gen_random_uuid(),
  selector_kind text not null check (selector_kind in ('product_key','drug_id','registry_number')),
  selector_sha256 text not null check (selector_sha256 ~ '^[0-9a-f]{64}$'),
  runtime_served text not null check (runtime_served in ('v2','v2-fallback','v2-shadow','v3','none')),
  comparison_status text not null check (
    comparison_status in ('MATCH','DIFF','V2_ONLY','V3_ONLY','BOTH_MISSING','V3_ERROR','SKIPPED')
  ),
  diff_codes text[] not null default '{}'::text[],
  v2_payload_sha256 text,
  v3_payload_sha256 text,
  v2_rule_count integer,
  v3_rule_count integer,
  duration_ms integer check (duration_ms is null or duration_ms>=0),
  created_at timestamptz not null default now(),
  check (v2_payload_sha256 is null or v2_payload_sha256 ~ '^[0-9a-f]{64}$'),
  check (v3_payload_sha256 is null or v3_payload_sha256 ~ '^[0-9a-f]{64}$'),
  check (
    (comparison_status='MATCH' and cardinality(diff_codes)=0)
    or (comparison_status<>'MATCH')
  )
);

create index if not exists drx_runtime_shadow_status_idx
  on drx_runtime.shadow_comparisons_v1(comparison_status,created_at desc);

create index if not exists drx_runtime_shadow_selector_idx
  on drx_runtime.shadow_comparisons_v1(selector_sha256,created_at desc);

create or replace function public.drx_record_dose_shadow_comparison_v1(
  p_selector_kind text,
  p_selector_sha256 text,
  p_runtime_served text,
  p_comparison_status text,
  p_diff_codes text[] default '{}'::text[],
  p_v2_payload_sha256 text default null,
  p_v3_payload_sha256 text default null,
  p_v2_rule_count integer default null,
  p_v3_rule_count integer default null,
  p_duration_ms integer default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,drx_runtime
as $$
declare
  v_id uuid;
begin
  if p_selector_kind not in ('product_key','drug_id','registry_number') then
    raise exception 'Invalid shadow selector kind';
  end if;
  if p_selector_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid selector hash';
  end if;
  if p_runtime_served not in ('v2','v2-fallback','v2-shadow','v3','none') then
    raise exception 'Invalid runtime served';
  end if;
  if p_comparison_status not in ('MATCH','DIFF','V2_ONLY','V3_ONLY','BOTH_MISSING','V3_ERROR','SKIPPED') then
    raise exception 'Invalid comparison status';
  end if;
  if p_v2_payload_sha256 is not null and p_v2_payload_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid V2 payload hash';
  end if;
  if p_v3_payload_sha256 is not null and p_v3_payload_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid V3 payload hash';
  end if;
  if coalesce(cardinality(p_diff_codes),0)>20 then
    raise exception 'Too many shadow diff codes';
  end if;

  insert into drx_runtime.shadow_comparisons_v1(
    selector_kind,selector_sha256,runtime_served,comparison_status,diff_codes,
    v2_payload_sha256,v3_payload_sha256,v2_rule_count,v3_rule_count,duration_ms
  )
  values(
    p_selector_kind,p_selector_sha256,p_runtime_served,p_comparison_status,
    coalesce(p_diff_codes,'{}'::text[]),
    p_v2_payload_sha256,p_v3_payload_sha256,p_v2_rule_count,p_v3_rule_count,p_duration_ms
  )
  returning comparison_id into v_id;

  return v_id;
end;
$$;

create or replace view drx_runtime.shadow_parity_summary_v1 as
select
  count(*) total_comparisons,
  count(*) filter(where comparison_status='MATCH') match_count,
  count(*) filter(where comparison_status='DIFF') diff_count,
  count(*) filter(where comparison_status='V2_ONLY') v2_only_count,
  count(*) filter(where comparison_status='V3_ONLY') v3_only_count,
  count(*) filter(where comparison_status='BOTH_MISSING') both_missing_count,
  count(*) filter(where comparison_status='V3_ERROR') v3_error_count,
  count(*) filter(where comparison_status='SKIPPED') skipped_count,
  max(created_at) last_comparison_at
from drx_runtime.shadow_comparisons_v1;

create or replace function public.drx_phase8_status_v1()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public,drx_runtime,drx_raw
as $$
with metrics as (
  select
    (select count(*) from drx_runtime.published_product_read_model_v1) v3_read_model_products,
    (select count(*) from public.dose_products_v3 where editorial_status='published') v3_published_products,
    (select count(*) from public.dose_rules_v3 where editorial_status='published') v3_published_rules,
    (select count(*) from drx_runtime.shadow_comparisons_v1) shadow_comparisons,
    (select count(*) from drx_runtime.shadow_comparisons_v1 where comparison_status='MATCH') shadow_matches,
    (select count(*) from drx_runtime.shadow_comparisons_v1 where comparison_status='DIFF') shadow_diffs,
    (select count(*) from drx_runtime.shadow_comparisons_v1 where comparison_status='V3_ERROR') shadow_v3_errors,
    (select count(*) from drx_raw.registry_reconstruction_diff_v1 where differs) reconstruction_true_diffs,
    (select count(*) from drx_raw.registry_generated_projection_diff_v1
      where active_substance_key_differs
         or global_search_text_differs
         or registry_search_text_differs) generated_true_diffs,
    (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and p.proname in (
          'drx_dose_search_v3_shadow_v1',
          'drx_record_dose_shadow_comparison_v1',
          'drx_phase8_status_v1'
        )) phase8_functions
)
select jsonb_build_object(
  'v3_read_model_products',m.v3_read_model_products,
  'v3_published_products',m.v3_published_products,
  'v3_published_rules',m.v3_published_rules,
  'shadow_comparisons',m.shadow_comparisons,
  'shadow_matches',m.shadow_matches,
  'shadow_diffs',m.shadow_diffs,
  'shadow_v3_errors',m.shadow_v3_errors,
  'phase8_functions',m.phase8_functions,
  'reconstruction_true_diffs',m.reconstruction_true_diffs,
  'generated_true_diffs',m.generated_true_diffs,
  'shadow_only',true,
  'v2_runtime_preserved',true,
  'v3_cutover_enabled',false,
  'publication_allowed',false,
  'gate_pass',
    m.phase8_functions=3
    and m.v3_published_products=0
    and m.v3_published_rules=0
    and m.reconstruction_true_diffs=0
    and m.generated_true_diffs=0
)
from metrics m;
$$;

revoke all on all tables in schema drx_runtime from public,anon,authenticated;
revoke all on all sequences in schema drx_runtime from public,anon,authenticated;
revoke execute on all functions in schema drx_runtime from public,anon,authenticated;
revoke all on schema drx_runtime from public,anon,authenticated;

alter default privileges for role postgres in schema drx_runtime
  revoke all on tables from public,anon,authenticated;
alter default privileges for role postgres in schema drx_runtime
  revoke all on sequences from public,anon,authenticated;
alter default privileges for role postgres in schema drx_runtime
  revoke execute on functions from public,anon,authenticated;

revoke all on function public.drx_dose_search_v3_shadow_v1(text,integer) from public,anon,authenticated;
revoke all on function public.drx_record_dose_shadow_comparison_v1(
  text,text,text,text,text[],text,text,integer,integer,integer
) from public,anon,authenticated;
revoke all on function public.drx_phase8_status_v1() from public,anon,authenticated;

grant execute on function public.drx_dose_search_v3_shadow_v1(text,integer) to service_role;
grant execute on function public.drx_record_dose_shadow_comparison_v1(
  text,text,text,text,text[],text,text,integer,integer,integer
) to service_role;
grant execute on function public.drx_phase8_status_v1() to service_role;

comment on schema drx_runtime is
  'DRx Phase 8 service-only shadow runtime and parity telemetry. No clinical response cutover.';
comment on table drx_runtime.shadow_comparisons_v1 is
  'Stores hashes and diff codes only; clinical payload content is not persisted.';
