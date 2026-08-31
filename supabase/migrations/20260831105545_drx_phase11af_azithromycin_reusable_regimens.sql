
-- DRx Phase 11AF: supporting-evidence layer + azithromycin source regimens.
-- One clinical regimen may be supported by multiple product SmPCs, avoiding
-- duplicate per-brand/per-strength clinical rules.

create table if not exists drx_dose.source_regimen_supporting_evidence_v1 (
  regimen_key text not null
    references drx_dose.source_regimen_candidates_v1(regimen_key) on delete cascade,
  source_snapshot_id text not null
    references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  source_section_code text not null default '4.2' check (source_section_code='4.2'),
  source_section_sha256 text not null check (source_section_sha256 ~ '^[0-9a-f]{64}$'),
  source_url text not null check (source_url ~ '^https://'),
  evidence_role text not null
    check (evidence_role in ('PRIMARY','CONCORDANT','SUPPORTING','FORMULATION_SPECIFIC')),
  review_status text not null default 'PENDING'
    check (review_status in ('PENDING','IN_REVIEW','VERIFIED','REJECTED')),
  auto_promote_allowed boolean not null default false check (auto_promote_allowed=false),
  created_at timestamptz not null default now(),
  primary key (regimen_key,source_snapshot_id,source_section_sha256)
);

create index if not exists source_regimen_supporting_evidence_v1_regimen_idx
  on drx_dose.source_regimen_supporting_evidence_v1(regimen_key,evidence_role,review_status);

with src as (
  select s.source_key,s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key in ('HEMOFARM-HEMOMYCIN-250-SMPC','HEMOFARM-HEMOMYCIN-500-SMPC')
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='azithromycin'
)
insert into drx_dose.source_regimen_candidates_v1(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status,
  target_kind,strength_match_mode
)
select * from (
  select
    'SRC-AZI-RESP-SKIN-3DAY-45KGPLUS'::text,sub.concept_id,
    'azithromycin-respiratory-skin-infections-45kgplus',
    'Susceptible respiratory and skin/soft-tissue infections excluding erythema migrans in patients >45 kg',
    'pediatric_and_adult','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='HEMOFARM-HEMOMYCIN-500-SMPC'

  union all
  select
    'SRC-AZI-ERYTHEMA-MIGRANS-5DAY-45KGPLUS',sub.concept_id,
    'azithromycin-erythema-migrans-45kgplus',
    'Erythema migrans in patients >45 kg',
    'pediatric_and_adult','PO','oral_solid','sequence',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='HEMOFARM-HEMOMYCIN-500-SMPC'

  union all
  select
    'SRC-AZI-CHLAMYDIA-SINGLE-45KGPLUS',sub.concept_id,
    'azithromycin-uncomplicated-chlamydia-45kgplus',
    'Uncomplicated Chlamydia trachomatis urethritis/cervicitis in patients >45 kg',
    'pediatric_and_adult','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='HEMOFARM-HEMOMYCIN-500-SMPC'

  union all
  select
    'SRC-AZI-H-PYLORI-COMBINATION-45KGPLUS',sub.concept_id,
    'azithromycin-h-pylori-combination-45kgplus',
    'H. pylori-associated gastric/duodenal infection in combination therapy',
    'pediatric_and_adult','PO','oral_solid','conditional',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='HEMOFARM-HEMOMYCIN-500-SMPC'

  union all
  select
    'SRC-AZI-ACNE-MODERATE-500MG',sub.concept_id,
    'azithromycin-moderate-acne-vulgaris',
    'Moderate acne vulgaris',
    'adult_only','PO','oral_solid','sequence',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='HEMOFARM-HEMOMYCIN-500-SMPC'
) x(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status,
  target_kind,strength_match_mode
)
on conflict (regimen_key) do nothing;

insert into drx_dose.source_regimen_steps_v1(
  regimen_key,branch_no,step_no,start_day,end_day,min_weight_kg,max_weight_kg,
  calculation_method,dose_min_value,dose_max_value,dose_unit,
  frequency_mode,interval_min_hours,interval_max_hours,times_per_day,
  duration_min_days,duration_max_days,max_single_dose_mg,max_daily_dose_mg,
  condition_text,source_note
) values
  ('SRC-AZI-RESP-SKIN-3DAY-45KGPLUS',1,1,1,3,45.001,null,
   'fixed_dose',500,500,'mg','times_per_day',null,null,1,
   3,3,500,500,
   'Adults, older adults and children >45 kg; excludes erythema migrans.',
   'Total course 1500 mg over 3 consecutive days.'),

  ('SRC-AZI-ERYTHEMA-MIGRANS-5DAY-45KGPLUS',1,1,1,1,45.001,null,
   'fixed_dose',1000,1000,'mg','single',null,null,null,
   1,1,1000,1000,
   'Day 1.',
   'First step of 5-day sequence.'),
  ('SRC-AZI-ERYTHEMA-MIGRANS-5DAY-45KGPLUS',1,2,2,5,45.001,null,
   'fixed_dose',500,500,'mg','times_per_day',null,null,1,
   4,4,500,500,
   'Days 2-5.',
   'Second step of 5-day sequence; total course 3 g.'),

  ('SRC-AZI-CHLAMYDIA-SINGLE-45KGPLUS',1,1,null,null,45.001,null,
   'fixed_dose',1000,1000,'mg','single',null,null,null,
   1,1,1000,1000,
   'Uncomplicated Chlamydia trachomatis infection.',
   'Single oral dose.'),

  ('SRC-AZI-H-PYLORI-COMBINATION-45KGPLUS',1,1,null,null,45.001,null,
   'fixed_dose',1000,1000,'mg','times_per_day',null,null,1,
   null,null,1000,1000,
   'Must be used as part of combination therapy according to clinician decision.',
   'Source does not define the complete combination regimen/duration in this captured section; promotion remains clinical-review only.'),

  ('SRC-AZI-ACNE-MODERATE-500MG',1,1,1,3,null,null,
   'fixed_dose',500,500,'mg','times_per_day',null,null,1,
   3,3,500,500,
   'Moderate acne vulgaris, initial phase.',
   '500 mg once daily for 3 days.'),
  ('SRC-AZI-ACNE-MODERATE-500MG',1,2,null,null,null,null,
   'fixed_dose',500,500,'mg','interval',168,168,null,
   63,63,500,500,
   'Maintenance phase after the initial 3 days.',
   '500 mg once weekly for the next 9 weeks; exact calendar sequencing remains review-gated.')
on conflict (regimen_key,branch_no,step_no) do nothing;

-- Attach both 250 mg capsule and 500 mg tablet evidence where concordant.
insert into drx_dose.source_regimen_supporting_evidence_v1(
  regimen_key,source_snapshot_id,source_section_sha256,source_url,evidence_role
)
select
  r.regimen_key,s.snapshot_id,sec.section_sha256,s.source_url,
  case when s.source_key='HEMOFARM-HEMOMYCIN-500-SMPC' then 'PRIMARY' else 'CONCORDANT' end
from drx_dose.source_regimen_candidates_v1 r
join public.dose_source_snapshots_v3 s
  on s.source_key in ('HEMOFARM-HEMOMYCIN-250-SMPC','HEMOFARM-HEMOMYCIN-500-SMPC')
join public.dose_source_sections_v3 sec
  on sec.snapshot_id=s.snapshot_id
 and sec.section_code='4.2'
 and sec.extraction_status='extracted'
where r.regimen_key in (
  'SRC-AZI-RESP-SKIN-3DAY-45KGPLUS',
  'SRC-AZI-ERYTHEMA-MIGRANS-5DAY-45KGPLUS',
  'SRC-AZI-CHLAMYDIA-SINGLE-45KGPLUS',
  'SRC-AZI-H-PYLORI-COMBINATION-45KGPLUS'
)
on conflict do nothing;

insert into drx_dose.source_regimen_supporting_evidence_v1(
  regimen_key,source_snapshot_id,source_section_sha256,source_url,evidence_role
)
select
  'SRC-AZI-ACNE-MODERATE-500MG',
  s.snapshot_id,sec.section_sha256,s.source_url,'PRIMARY'
from public.dose_source_snapshots_v3 s
join public.dose_source_sections_v3 sec
  on sec.snapshot_id=s.snapshot_id
 and sec.section_code='4.2'
 and sec.extraction_status='extracted'
where s.source_key='HEMOFARM-HEMOMYCIN-500-SMPC'
on conflict do nothing;

-- Route/form-level reuse is allowed only after product compatibility review.
insert into drx_dose.source_candidate_applicability_v1(
  candidate_type,candidate_key,scope_type,route_key,form_family,
  source_strength_value,source_strength_unit,requires_scored,minimum_split_denominator,
  source_product_label,product_binding_policy
) values
  ('REGIMEN','SRC-AZI-RESP-SKIN-3DAY-45KGPLUS','ROUTE_FORM_REVIEW','PO','oral_solid',null,null,false,null,
   'Hemomycin 250 mg capsule + 500 mg film-coated tablet concordant SmPCs','COMPATIBLE_PRODUCT_REVIEW'),
  ('REGIMEN','SRC-AZI-ERYTHEMA-MIGRANS-5DAY-45KGPLUS','ROUTE_FORM_REVIEW','PO','oral_solid',null,null,false,null,
   'Hemomycin 250 mg capsule + 500 mg film-coated tablet concordant SmPCs','COMPATIBLE_PRODUCT_REVIEW'),
  ('REGIMEN','SRC-AZI-CHLAMYDIA-SINGLE-45KGPLUS','ROUTE_FORM_REVIEW','PO','oral_solid',null,null,false,null,
   'Hemomycin 250 mg capsule + 500 mg film-coated tablet concordant SmPCs','COMPATIBLE_PRODUCT_REVIEW'),
  ('REGIMEN','SRC-AZI-H-PYLORI-COMBINATION-45KGPLUS','ROUTE_FORM_REVIEW','PO','oral_solid',null,null,false,null,
   'Hemomycin 250 mg capsule + 500 mg film-coated tablet concordant SmPCs','REVIEW_REQUIRED'),
  ('REGIMEN','SRC-AZI-ACNE-MODERATE-500MG','EXACT_PRESENTATION','PO','oral_solid',500,'mg',false,null,
   'Hemomycin 500 mg film-coated tablet SmPC','EXACT_PRESENTATION_ONLY')
on conflict (candidate_type,candidate_key) do nothing;

-- Source restrictions and organ-function cautions.
with src as (
  select s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key='HEMOFARM-HEMOMYCIN-500-SMPC'
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='azithromycin'
)
insert into drx_dose.source_adjustment_candidates_v1(
  adjustment_key,regimen_key,substance_concept_id,adjustment_domain,measure_type,
  min_value,max_value,min_inclusive,max_inclusive,action_type,
  condition_text,source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
select * from (
  select
    'SRC-ADJ-AZI-GFR-10-80-NOCHANGE'::text,null::text,sub.concept_id,
    'RENAL','GFR_mL_min',10::numeric,80::numeric,true,true,'NO_CHANGE',
    'Source states no dose adjustment for mild-moderate renal impairment with GFR 10-80 mL/min.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub cross join src

  union all
  select
    'SRC-ADJ-AZI-GFR-BELOW-10-CAUTION',null,sub.concept_id,
    'RENAL','GFR_mL_min',null,10,true,false,'CAUTION',
    'Use caution when GFR is below 10 mL/min.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub cross join src
) x(
  adjustment_key,regimen_key,substance_concept_id,adjustment_domain,measure_type,
  min_value,max_value,min_inclusive,max_inclusive,action_type,
  condition_text,source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
on conflict (adjustment_key) do nothing;

with src as (
  select s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key='HEMOFARM-HEMOMYCIN-500-SMPC'
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='azithromycin'
)
insert into drx_dose.source_restriction_candidates_v1(
  restriction_key,substance_concept_id,patient_group,restriction_type,machine_action,
  restriction_text,source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
select
  'SRC-REST-AZI-SEVERE-HEPATIC',
  sub.concept_id,'pediatric_and_adult','HEPATIC_RESTRICTION','BLOCK',
  'The captured Hemomycin SmPC states that azithromycin should not be used in severe hepatic impairment.',
  src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
from sub cross join src
on conflict (restriction_key) do nothing;

insert into drx_dose.source_candidate_applicability_v1(
  candidate_type,candidate_key,scope_type,route_key,form_family,
  source_product_label,product_binding_policy
) values
  ('ADJUSTMENT','SRC-ADJ-AZI-GFR-10-80-NOCHANGE','SUBSTANCE_WIDE_REVIEW','PO',null,
   'Hemomycin azithromycin SmPC','REVIEW_REQUIRED'),
  ('ADJUSTMENT','SRC-ADJ-AZI-GFR-BELOW-10-CAUTION','SUBSTANCE_WIDE_REVIEW','PO',null,
   'Hemomycin azithromycin SmPC','REVIEW_REQUIRED'),
  ('RESTRICTION','SRC-REST-AZI-SEVERE-HEPATIC','SUBSTANCE_WIDE_REVIEW','PO',null,
   'Hemomycin azithromycin SmPC','REVIEW_REQUIRED')
on conflict (candidate_type,candidate_key) do nothing;

select public.drx_phase11_refresh_source_indications_v1();

alter table drx_dose.source_regimen_supporting_evidence_v1 enable row level security;
revoke all on drx_dose.source_regimen_supporting_evidence_v1 from public,anon,authenticated;
grant select,insert,update,delete on drx_dose.source_regimen_supporting_evidence_v1 to service_role;
