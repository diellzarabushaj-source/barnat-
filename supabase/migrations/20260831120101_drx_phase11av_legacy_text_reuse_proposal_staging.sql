
-- DRx Phase 11AV: reuse proposals from already-written legacy dose text.
-- This turns exact-source, structurally clean legacy rows into deduplicated
-- review proposals per dose-moiety/rule signature. It does NOT create or publish
-- a clinical rule automatically.

create table if not exists drx_dose.legacy_rule_reuse_proposals_v1 (
  proposal_key text primary key,
  dose_moiety_key text not null,
  dose_moiety_concept_ids uuid[] not null,
  patient_group text not null,
  route_key text not null,
  form_family text,
  calculation_method text not null,
  dose_min_value numeric,
  dose_max_value numeric,
  dose_unit text,
  frequency_mode text not null,
  times_per_day numeric,
  interval_min_hours numeric,
  interval_max_hours numeric,
  source_snapshot_id text not null
    references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  source_section_sha256 text not null check (source_section_sha256 ~ '^[0-9a-f]{64}$'),
  source_url text not null check (source_url ~ '^https://'),
  candidate_ids uuid[] not null,
  candidate_count integer not null check (candidate_count > 0),
  represented_product_count integer not null check (represented_product_count > 0),
  indication_texts text[] not null default '{}'::text[],
  source_dose_texts text[] not null default '{}'::text[],
  min_parser_confidence numeric,
  max_parser_confidence numeric,
  review_status text not null default 'PENDING'
    check (review_status in ('PENDING','IN_REVIEW','APPROVED','REJECTED','RETIRED')),
  reviewed_by text,
  reviewed_at timestamptz,
  auto_create_rule_allowed boolean not null default false check (auto_create_rule_allowed=false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    review_status<>'APPROVED'
    or (nullif(btrim(reviewed_by),'') is not null and reviewed_at is not null)
  )
);

create index if not exists legacy_rule_reuse_proposals_v1_target_idx
  on drx_dose.legacy_rule_reuse_proposals_v1(dose_moiety_key,review_status);

create or replace function public.drx_phase11_refresh_legacy_rule_reuse_proposals_v1()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_rows integer;
begin
  with safe as (
    select
      q.candidate_id,
      q.patient_group,
      q.normalized_route_keys[1] as route_key,
      q.form_family,
      q.parsed_rule_payload,
      q.parser_confidence,
      q.single_snapshot_id,
      q.single_section_sha256,
      q.effective_source_url,
      c.indication_text,
      c.dose_text,
      p.drug_id,
      p.dose_moiety_key,
      p.dose_moiety_concept_ids,
      p.variant_anomaly_codes
    from drx_dose.rule_candidate_promotion_queue_v1 q
    join drx_dose.rule_candidate_extractions_v1 c using(candidate_id)
    join drx_dose.product_dose_moiety_targets_v1 p on p.drug_id=q.drug_id
    where q.matching_snapshot_count=1
      and q.single_section_sha256 is not null
      and q.promotion_blockers <@ array[
        'VERIFIED_INDICATION_BINDING',
        'CLINICAL_REVIEW'
      ]::text[]
      and q.target_kind='SUBSTANCE'
      and cardinality(q.normalized_route_keys)=1
      and not (
        p.variant_anomaly_codes && array[
          'COMBINATION_INGREDIENT_SET_INCOMPLETE',
          'COMPOSITION_REVIEW_COMPONENT',
          'COMBINATION_COMPONENT_REVIEW'
        ]::text[]
      )
  ),
  normalized as (
    select
      s.*,
      s.parsed_rule_payload->>'calculationMethod' as calculation_method,
      nullif(s.parsed_rule_payload->>'doseMinValue','')::numeric as dose_min_value,
      nullif(s.parsed_rule_payload->>'doseMaxValue','')::numeric as dose_max_value,
      s.parsed_rule_payload->>'doseUnit' as dose_unit,
      s.parsed_rule_payload->>'frequencyMode' as frequency_mode,
      nullif(s.parsed_rule_payload->>'timesPerDay','')::numeric as times_per_day,
      nullif(s.parsed_rule_payload->>'intervalMinHours','')::numeric as interval_min_hours,
      nullif(s.parsed_rule_payload->>'intervalMaxHours','')::numeric as interval_max_hours
    from safe s
  ),
  grouped as (
    select
      md5(concat_ws('|',
        dose_moiety_key,
        patient_group,
        route_key,
        coalesce(form_family,''),
        calculation_method,
        coalesce(dose_min_value::text,''),
        coalesce(dose_max_value::text,''),
        coalesce(dose_unit,''),
        frequency_mode,
        coalesce(times_per_day::text,''),
        coalesce(interval_min_hours::text,''),
        coalesce(interval_max_hours::text,''),
        single_snapshot_id,
        single_section_sha256
      )) as proposal_key,
      dose_moiety_key,
      dose_moiety_concept_ids,
      patient_group,
      route_key,
      form_family,
      calculation_method,
      dose_min_value,
      dose_max_value,
      dose_unit,
      frequency_mode,
      times_per_day,
      interval_min_hours,
      interval_max_hours,
      single_snapshot_id,
      single_section_sha256,
      min(effective_source_url) as source_url,
      array_agg(candidate_id order by candidate_id) as candidate_ids,
      count(*)::integer as candidate_count,
      count(distinct drug_id)::integer as represented_product_count,
      array_agg(distinct indication_text order by indication_text)
        filter (where nullif(btrim(indication_text),'') is not null) as indication_texts,
      array_agg(distinct dose_text order by dose_text)
        filter (where nullif(btrim(dose_text),'') is not null) as source_dose_texts,
      min(parser_confidence) as min_parser_confidence,
      max(parser_confidence) as max_parser_confidence
    from normalized
    group by
      dose_moiety_key,dose_moiety_concept_ids,patient_group,route_key,form_family,
      calculation_method,dose_min_value,dose_max_value,dose_unit,frequency_mode,
      times_per_day,interval_min_hours,interval_max_hours,
      single_snapshot_id,single_section_sha256
  )
  insert into drx_dose.legacy_rule_reuse_proposals_v1(
    proposal_key,dose_moiety_key,dose_moiety_concept_ids,patient_group,route_key,
    form_family,calculation_method,dose_min_value,dose_max_value,dose_unit,
    frequency_mode,times_per_day,interval_min_hours,interval_max_hours,
    source_snapshot_id,source_section_sha256,source_url,
    candidate_ids,candidate_count,represented_product_count,
    indication_texts,source_dose_texts,min_parser_confidence,max_parser_confidence,
    updated_at
  )
  select
    proposal_key,dose_moiety_key,dose_moiety_concept_ids,patient_group,route_key,
    form_family,calculation_method,dose_min_value,dose_max_value,dose_unit,
    frequency_mode,times_per_day,interval_min_hours,interval_max_hours,
    single_snapshot_id,single_section_sha256,source_url,
    candidate_ids,candidate_count,represented_product_count,
    coalesce(indication_texts,'{}'::text[]),
    coalesce(source_dose_texts,'{}'::text[]),
    min_parser_confidence,max_parser_confidence,now()
  from grouped
  on conflict (proposal_key) do update set
    candidate_ids=excluded.candidate_ids,
    candidate_count=excluded.candidate_count,
    represented_product_count=excluded.represented_product_count,
    indication_texts=excluded.indication_texts,
    source_dose_texts=excluded.source_dose_texts,
    min_parser_confidence=excluded.min_parser_confidence,
    max_parser_confidence=excluded.max_parser_confidence,
    updated_at=now()
  where drx_dose.legacy_rule_reuse_proposals_v1.review_status='PENDING';

  get diagnostics v_rows=row_count;

  return jsonb_build_object(
    'proposalRows',(select count(*) from drx_dose.legacy_rule_reuse_proposals_v1),
    'pendingRows',(select count(*) from drx_dose.legacy_rule_reuse_proposals_v1 where review_status='PENDING'),
    'representedLegacyCandidates',(select coalesce(sum(candidate_count),0) from drx_dose.legacy_rule_reuse_proposals_v1 where review_status='PENDING'),
    'representedProducts',(select coalesce(sum(represented_product_count),0) from drx_dose.legacy_rule_reuse_proposals_v1 where review_status='PENDING'),
    'autoCreateRuleAllowed',false,
    'rowsRefreshed',v_rows
  );
end;
$$;

select public.drx_phase11_refresh_legacy_rule_reuse_proposals_v1();

create or replace view drx_dose.legacy_rule_reuse_existing_match_v1 as
select
  p.proposal_key,
  r.regimen_key,
  r.indication_key_candidate,
  r.indication_label,
  r.patient_group as regimen_patient_group,
  r.route_key as regimen_route_key,
  r.form_family as regimen_form_family,
  s.branch_no,
  s.step_no,
  case
    when r.patient_group=p.patient_group then 'EXACT_PATIENT_GROUP'
    when r.patient_group='pediatric_and_adult'
      and p.patient_group in ('adult_only','pediatric_only') then 'SUBPOPULATION_MATCH'
    else 'PATIENT_GROUP_REVIEW'
  end as patient_group_match,
  (
    s.calculation_method=p.calculation_method
    and s.dose_min_value is not distinct from p.dose_min_value
    and s.dose_max_value is not distinct from p.dose_max_value
    and s.dose_unit is not distinct from p.dose_unit
    and s.frequency_mode=p.frequency_mode
    and s.times_per_day is not distinct from p.times_per_day
  ) as dose_signature_match
from drx_dose.legacy_rule_reuse_proposals_v1 p
join drx_dose.source_regimen_candidates_v1 r
  on r.dose_moiety_key=p.dose_moiety_key
 and r.route_key=p.route_key
 and (r.form_family is null or p.form_family is null or r.form_family=p.form_family)
join drx_dose.source_regimen_steps_v1 s on s.regimen_key=r.regimen_key
where p.review_status='PENDING';

create or replace view drx_dose.legacy_rule_reuse_review_queue_v1 as
select
  p.*,
  coalesce(m.existing_match_count,0) as existing_match_count,
  coalesce(m.exact_dose_match_count,0) as exact_dose_match_count,
  coalesce(m.matching_regimen_keys,'{}'::text[]) as matching_regimen_keys,
  case
    when coalesce(m.exact_dose_match_count,0)>0 then 'REVIEW_MERGE_WITH_EXISTING_SOURCE_REGIMEN'
    else 'REVIEW_NEW_SHARED_REGIMEN'
  end as next_action,
  false::boolean as auto_merge_allowed,
  false::boolean as auto_create_rule_allowed_v2
from drx_dose.legacy_rule_reuse_proposals_v1 p
left join (
  select
    proposal_key,
    count(*)::integer as existing_match_count,
    count(*) filter (
      where dose_signature_match
        and patient_group_match in ('EXACT_PATIENT_GROUP','SUBPOPULATION_MATCH')
    )::integer as exact_dose_match_count,
    array_agg(distinct regimen_key order by regimen_key)
      filter (
        where dose_signature_match
          and patient_group_match in ('EXACT_PATIENT_GROUP','SUBPOPULATION_MATCH')
      ) as matching_regimen_keys
  from drx_dose.legacy_rule_reuse_existing_match_v1
  group by proposal_key
) m using(proposal_key)
where p.review_status in ('PENDING','IN_REVIEW');

alter table drx_dose.legacy_rule_reuse_proposals_v1 enable row level security;
revoke all on drx_dose.legacy_rule_reuse_proposals_v1 from public,anon,authenticated;
revoke all on drx_dose.legacy_rule_reuse_existing_match_v1 from public,anon,authenticated;
revoke all on drx_dose.legacy_rule_reuse_review_queue_v1 from public,anon,authenticated;
grant select,insert,update on drx_dose.legacy_rule_reuse_proposals_v1 to service_role;
grant select on drx_dose.legacy_rule_reuse_existing_match_v1 to service_role;
grant select on drx_dose.legacy_rule_reuse_review_queue_v1 to service_role;

revoke all on function public.drx_phase11_refresh_legacy_rule_reuse_proposals_v1() from public,anon,authenticated;
grant execute on function public.drx_phase11_refresh_legacy_rule_reuse_proposals_v1() to service_role;
