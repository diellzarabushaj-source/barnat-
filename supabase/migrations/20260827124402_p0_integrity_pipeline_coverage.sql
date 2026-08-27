-- Synced from Supabase production migration history.
-- version: 20260827124402
-- name: p0_integrity_pipeline_coverage

create or replace function public.medindex_substance_component_signature(value text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, public
as $$
  with parts as (
    select regexp_replace(lower(btrim(part)), '[^a-z0-9]+', '', 'g') as component_key
    from regexp_split_to_table(value, E'\\s*[;+&]\\s*') as part
  ),
  valid as (
    select component_key from parts where component_key <> ''
  )
  select case
    when count(*) >= 2 then string_agg(component_key, '|' order by component_key)
    else null
  end
  from valid
$$;

create table if not exists public.medindex_drug_pipeline_exceptions_v1 (
  source_drug_id uuid primary key
    references public.drugs(id) on delete cascade,
  exception_code text not null,
  reason text not null,
  approved_by text not null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint medindex_drug_pipeline_exceptions_v1_code_check
    check (exception_code in (
      'NON_REGISTRY_REFERENCE',
      'EXCLUDED_NON_MEDICINE',
      'SOURCE_IDENTITY_PENDING',
      'TEMPORARY_IMPORT_HOLD'
    )),
  constraint medindex_drug_pipeline_exceptions_v1_reason_check
    check (char_length(btrim(reason)) >= 20),
  constraint medindex_drug_pipeline_exceptions_v1_approved_by_check
    check (char_length(btrim(approved_by)) >= 3)
);

alter table public.medindex_drug_pipeline_exceptions_v1 enable row level security;

drop policy if exists medindex_drug_pipeline_exceptions_v1_deny_client
  on public.medindex_drug_pipeline_exceptions_v1;
create policy medindex_drug_pipeline_exceptions_v1_deny_client
  on public.medindex_drug_pipeline_exceptions_v1
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.medindex_drug_pipeline_exceptions_v1
  from anon, authenticated;

insert into public.medindex_drug_pipeline_exceptions_v1
(source_drug_id,exception_code,reason,approved_by,reviewed_at)
select
  d.id,
  'NON_REGISTRY_REFERENCE',
  'Editorial reference product without an official local registry identity; excluded from canonical core/profile coverage until source registration is established.',
  'p0-integrity-review-2026-08-27',
  now()
from public.drugs d
where d.id='a31e9a20-3141-4825-a201-088639ffaf4d'::uuid
  and d.trade_name='INFLUFIX'
on conflict (source_drug_id) do update
set exception_code=excluded.exception_code,
    reason=excluded.reason,
    approved_by=excluded.approved_by,
    reviewed_at=excluded.reviewed_at;

create or replace view public.medindex_drug_pipeline_coverage_v1
with (security_invoker = true) as
select
  d.id as source_drug_id,
  d.registry_number,
  d.trade_name,
  case
    when m.source_drug_id is not null and e.source_drug_id is null then 'MAPPED'
    when m.source_drug_id is null and e.source_drug_id is not null then 'EXCLUDED'
    when m.source_drug_id is not null and e.source_drug_id is not null then 'INVALID_OVERLAP'
    else 'UNRESOLVED'
  end as pipeline_status,
  m.registry_scope,
  m.quality_status,
  m.publication_gate,
  e.exception_code,
  e.reason as exception_reason,
  (p.drug_id is not null) as has_clinical_profile
from public.drugs d
left join public.medindex_drug_core_map_v1 m on m.source_drug_id=d.id
left join public.medindex_drug_pipeline_exceptions_v1 e on e.source_drug_id=d.id
left join public.drug_clinical_profiles p on p.drug_id=d.id;

revoke all on public.medindex_drug_pipeline_coverage_v1
  from anon, authenticated;

create or replace view public.medindex_drug_pipeline_violations_v1
with (security_invoker = true) as
select source_drug_id,trade_name,'UNRESOLVED_DRUG'::text as violation
from public.medindex_drug_pipeline_coverage_v1
where pipeline_status='UNRESOLVED'
union all
select source_drug_id,trade_name,'MAPPED_AND_EXCLUDED'::text
from public.medindex_drug_pipeline_coverage_v1
where pipeline_status='INVALID_OVERLAP'
union all
select source_drug_id,trade_name,'MAPPED_WITHOUT_CLINICAL_PROFILE'::text
from public.medindex_drug_pipeline_coverage_v1
where pipeline_status='MAPPED' and not has_clinical_profile
union all
select source_drug_id,trade_name,'EXCLUDED_HAS_CLINICAL_PROFILE'::text
from public.medindex_drug_pipeline_coverage_v1
where pipeline_status='EXCLUDED' and has_clinical_profile;

revoke all on public.medindex_drug_pipeline_violations_v1
  from anon, authenticated;

do $$
declare
  drug_count bigint;
  mapped_count bigint;
  exception_count bigint;
  profile_count bigint;
  violation_count bigint;
begin
  select count(*) into drug_count from public.drugs;
  select count(*) into mapped_count from public.medindex_drug_core_map_v1;
  select count(*) into exception_count from public.medindex_drug_pipeline_exceptions_v1;
  select count(*) into profile_count from public.drug_clinical_profiles;
  select count(*) into violation_count from public.medindex_drug_pipeline_violations_v1;

  if drug_count <> mapped_count + exception_count then
    raise exception 'Pipeline coverage mismatch: drugs %, mapped %, exceptions %',
      drug_count,mapped_count,exception_count;
  end if;

  if mapped_count <> profile_count then
    raise exception 'Mapped/profile mismatch: mapped %, profiles %',
      mapped_count,profile_count;
  end if;

  if violation_count <> 0 then
    raise exception 'Drug pipeline has % integrity violations',violation_count;
  end if;
end $$;
