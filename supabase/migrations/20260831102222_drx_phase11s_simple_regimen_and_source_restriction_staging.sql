
-- DRx Phase 11S: simple source-first regimen drafts + structured source restrictions.
-- This keeps calculable dose candidates separate from "do not use / no data / caution" facts.

create table if not exists drx_dose.source_restriction_candidates_v1 (
  restriction_key text primary key,
  substance_concept_id uuid not null
    references public.substance_concepts_v1(concept_id) on delete restrict,
  indication_key_candidate text,
  patient_group text,
  restriction_type text not null
    check (restriction_type in (
      'CONTRAINDICATED','NOT_RECOMMENDED','NO_ESTABLISHED_DATA',
      'FORMULATION_RESTRICTION','RENAL_RESTRICTION','HEPATIC_RESTRICTION','CAUTION'
    )),
  machine_action text not null
    check (machine_action in ('BLOCK','WARN','MANUAL_REVIEW')),
  min_age_months numeric,
  max_age_months numeric,
  min_weight_kg numeric,
  max_weight_kg numeric,
  renal_operator text,
  renal_threshold numeric,
  renal_unit text,
  restriction_text text not null,
  source_snapshot_id text not null
    references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  source_section_code text not null
    check (source_section_code in ('2','4.1','4.2','4.3','4.4')),
  source_section_sha256 text not null check (source_section_sha256 ~ '^[0-9a-f]{64}$'),
  source_url text not null check (source_url ~ '^https://'),
  review_status text not null default 'PENDING'
    check (review_status in ('PENDING','IN_REVIEW','APPROVED','REJECTED','PROMOTED')),
  reviewed_by text,
  reviewed_at timestamptz,
  auto_apply_allowed boolean not null default false check (auto_apply_allowed=false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    review_status not in ('APPROVED','PROMOTED')
    or (nullif(btrim(reviewed_by),'') is not null and reviewed_at is not null)
  )
);

create index if not exists source_restriction_candidates_v1_substance_idx
  on drx_dose.source_restriction_candidates_v1(substance_concept_id,review_status);
create index if not exists source_restriction_candidates_v1_type_idx
  on drx_dose.source_restriction_candidates_v1(restriction_type,machine_action);

-- Desloratadine: split the one source-backed posology into two indication-specific draft regimens.
with src as (
  select s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-14722-SMPC'
  order by s.created_at desc
  limit 1
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='desloratadine'
)
insert into drx_dose.source_regimen_candidates_v1(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status
)
select * from (
  select
    'SRC-DESLOR-ALLERGIC-RHINITIS-12PLUS'::text,sub.concept_id,
    'desloratadine-allergic-rhinitis-symptom-relief',
    'Symptomatic relief of allergic rhinitis',
    'pediatric_and_adult','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING'
  from sub cross join src

  union all

  select
    'SRC-DESLOR-URTICARIA-12PLUS',sub.concept_id,
    'desloratadine-urticaria-symptom-relief',
    'Symptomatic relief of urticaria',
    'pediatric_and_adult','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING'
  from sub cross join src
) x(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status
)
on conflict (regimen_key) do nothing;

insert into drx_dose.source_regimen_steps_v1(
  regimen_key,branch_no,step_no,min_age_months,
  calculation_method,dose_min_value,dose_max_value,dose_unit,
  frequency_mode,times_per_day,max_single_dose_mg,max_daily_dose_mg,
  condition_text,source_note
) values
  ('SRC-DESLOR-ALLERGIC-RHINITIS-12PLUS',1,1,144,
   'fixed_dose',5,5,'mg','times_per_day',1,5,5,
   'Adults and adolescents aged 12 years or older.',
   'Source-backed normalized §4.2 value.'),
  ('SRC-DESLOR-URTICARIA-12PLUS',1,1,144,
   'fixed_dose',5,5,'mg','times_per_day',1,5,5,
   'Adults and adolescents aged 12 years or older.',
   'Source-backed normalized §4.2 value.')
on conflict (regimen_key,branch_no,step_no) do nothing;

-- Source-backed restriction: the 5 mg film-coated tablet SmPC does not establish
-- safety/efficacy below 12 years; do not infer a tablet dose for this age group.
with src as (
  select s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-14722-SMPC'
  order by s.created_at desc
  limit 1
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='desloratadine'
)
insert into drx_dose.source_restriction_candidates_v1(
  restriction_key,substance_concept_id,patient_group,restriction_type,machine_action,
  max_age_months,restriction_text,
  source_snapshot_id,source_section_code,source_section_sha256,source_url,review_status
)
select
  'SRC-REST-DESLOR-5MG-TABLET-BELOW-12',
  sub.concept_id,'pediatric_only','NO_ESTABLISHED_DATA','BLOCK',
  143.999,
  'For this 5 mg film-coated tablet SmPC, safety and efficacy below 12 years are not established; do not infer a tablet dose from product strength.',
  src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING'
from sub cross join src
on conflict (restriction_key) do nothing;

-- Rivaroxaban tablet source restrictions that must remain distinct from normal dose rules.
with src20 as (
  select s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-101916-SMPC'
  order by s.created_at desc limit 1
),
src15 as (
  select s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-101915-SMPC'
  order by s.created_at desc limit 1
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='rivaroxaban'
)
insert into drx_dose.source_restriction_candidates_v1(
  restriction_key,substance_concept_id,patient_group,restriction_type,machine_action,
  max_weight_kg,renal_operator,renal_threshold,renal_unit,restriction_text,
  source_snapshot_id,source_section_code,source_section_sha256,source_url,review_status
)
select * from (
  select
    'SRC-REST-RIVA-TABLET-BELOW-30KG'::text,sub.concept_id,'pediatric_only',
    'FORMULATION_RESTRICTION','BLOCK',29.999::numeric,
    null::text,null::numeric,null::text,
    'Tablet dosing source directs patients below 30 kg to the oral-suspension SmPC; do not calculate a tablet dose for this band.',
    src15.snapshot_id,'4.2',src15.section_sha256,src15.source_url,'PENDING'
  from sub cross join src15

  union all

  select
    'SRC-REST-RIVA-CRCL-BELOW-15',sub.concept_id,'adult_only',
    'RENAL_RESTRICTION','BLOCK',null::numeric,
    '<'::text,15::numeric,'mL/min',
    'Rivaroxaban tablet use is not recommended when creatinine clearance is below 15 mL/min.',
    src20.snapshot_id,'4.2',src20.section_sha256,src20.source_url,'PENDING'
  from sub cross join src20
) x(
  restriction_key,substance_concept_id,patient_group,restriction_type,machine_action,
  max_weight_kg,renal_operator,renal_threshold,renal_unit,restriction_text,
  source_snapshot_id,source_section_code,source_section_sha256,source_url,review_status
)
on conflict (restriction_key) do nothing;

create or replace view drx_dose.source_restriction_review_queue_v1 as
select
  restriction_key,substance_concept_id,indication_key_candidate,patient_group,
  restriction_type,machine_action,min_age_months,max_age_months,min_weight_kg,max_weight_kg,
  renal_operator,renal_threshold,renal_unit,restriction_text,
  source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,auto_apply_allowed
from drx_dose.source_restriction_candidates_v1
where review_status in ('PENDING','IN_REVIEW');

alter table drx_dose.source_restriction_candidates_v1 enable row level security;
revoke all on drx_dose.source_restriction_candidates_v1 from public,anon,authenticated;
revoke all on drx_dose.source_restriction_review_queue_v1 from public,anon,authenticated;
grant select,insert,update on drx_dose.source_restriction_candidates_v1 to service_role;
grant select on drx_dose.source_restriction_review_queue_v1 to service_role;
