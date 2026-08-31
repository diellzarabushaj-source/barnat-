
-- DRx Phase 11AM: regimen-step presentation requirements + administration
-- requirements, then enrich rivaroxaban with strength-, food-, renal- and
-- hepatic-scoped source evidence. No auto-promotion or runtime serving.

create table if not exists drx_dose.source_regimen_step_presentation_requirements_v1 (
  regimen_key text not null,
  branch_no integer not null check (branch_no >= 1),
  step_no integer not null check (step_no >= 1),
  required_strength_value numeric,
  required_strength_unit text,
  required_form_family text,
  required_route_key text,
  required_release_key text,
  presentation_policy text not null
    check (presentation_policy in (
      'EXACT_STRENGTH',
      'COMPATIBLE_STRENGTH_REVIEW',
      'FORM_ROUTE_ONLY',
      'MANUAL_REVIEW'
    )),
  source_product_label text,
  source_snapshot_id text
    references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  source_section_sha256 text,
  review_status text not null default 'PENDING'
    check (review_status in ('PENDING','IN_REVIEW','VERIFIED','REJECTED')),
  auto_bind_allowed boolean not null default false check (auto_bind_allowed=false),
  created_at timestamptz not null default now(),
  primary key (regimen_key,branch_no,step_no),
  foreign key (regimen_key,branch_no,step_no)
    references drx_dose.source_regimen_steps_v1(regimen_key,branch_no,step_no)
    on delete cascade,
  check (
    required_strength_value is null
    or nullif(btrim(required_strength_unit),'') is not null
  ),
  check (
    source_section_sha256 is null
    or source_section_sha256 ~ '^[0-9a-f]{64}$'
  )
);

create table if not exists drx_dose.source_regimen_step_administration_v1 (
  regimen_key text not null,
  branch_no integer not null check (branch_no >= 1),
  step_no integer not null check (step_no >= 1),
  food_requirement text not null default 'NOT_SPECIFIED'
    check (food_requirement in (
      'WITH_FOOD',
      'WITH_OR_WITHOUT_FOOD',
      'FASTING',
      'NOT_SPECIFIED'
    )),
  timing_requirement text,
  administration_note text,
  source_snapshot_id text
    references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  source_section_sha256 text,
  review_status text not null default 'PENDING'
    check (review_status in ('PENDING','IN_REVIEW','VERIFIED','REJECTED')),
  auto_apply_allowed boolean not null default false check (auto_apply_allowed=false),
  created_at timestamptz not null default now(),
  primary key (regimen_key,branch_no,step_no),
  foreign key (regimen_key,branch_no,step_no)
    references drx_dose.source_regimen_steps_v1(regimen_key,branch_no,step_no)
    on delete cascade,
  check (
    source_section_sha256 is null
    or source_section_sha256 ~ '^[0-9a-f]{64}$'
  )
);

create index if not exists source_regimen_step_presentation_strength_idx
  on drx_dose.source_regimen_step_presentation_requirements_v1(
    required_strength_value,required_strength_unit,required_route_key,required_form_family
  );

-- Step-level exact strengths for rivaroxaban.
with src as (
  select s.source_key,s.snapshot_id,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key in (
    'EMC-PRODUCT-101914-SMPC',
    'EMC-PRODUCT-101915-SMPC',
    'EMC-PRODUCT-101916-SMPC'
  )
)
insert into drx_dose.source_regimen_step_presentation_requirements_v1(
  regimen_key,branch_no,step_no,
  required_strength_value,required_strength_unit,
  required_form_family,required_route_key,required_release_key,
  presentation_policy,source_product_label,source_snapshot_id,source_section_sha256
)
select * from (
  select
    'SRC-RIVA-DVTPE-ADULT-SEQUENCE'::text,1,1,15::numeric,'mg',
    'oral_solid','PO',null::text,'EXACT_STRENGTH',
    'emc 101915 rivaroxaban 15 mg film-coated tablet',
    src.snapshot_id,src.section_sha256
  from src where src.source_key='EMC-PRODUCT-101915-SMPC'
  union all
  select
    'SRC-RIVA-DVTPE-ADULT-SEQUENCE',1,2,20,'mg',
    'oral_solid','PO',null,'EXACT_STRENGTH',
    'emc 101916 rivaroxaban 20 mg film-coated tablet',
    src.snapshot_id,src.section_sha256
  from src where src.source_key='EMC-PRODUCT-101916-SMPC'

  union all
  select
    'SRC-RIVA-DVTPE-EXTENDED-ADULT',1,1,10,'mg',
    'oral_solid','PO',null,'EXACT_STRENGTH',
    'emc 101914 rivaroxaban 10 mg film-coated tablet',
    src.snapshot_id,src.section_sha256
  from src where src.source_key='EMC-PRODUCT-101914-SMPC'
  union all
  select
    'SRC-RIVA-DVTPE-EXTENDED-ADULT',2,1,20,'mg',
    'oral_solid','PO',null,'EXACT_STRENGTH',
    'emc 101916 rivaroxaban 20 mg film-coated tablet',
    src.snapshot_id,src.section_sha256
  from src where src.source_key='EMC-PRODUCT-101916-SMPC'

  union all
  select
    'SRC-RIVA-NVAF-ADULT',1,1,20,'mg',
    'oral_solid','PO',null,'EXACT_STRENGTH',
    'emc 101916 rivaroxaban 20 mg film-coated tablet',
    src.snapshot_id,src.section_sha256
  from src where src.source_key='EMC-PRODUCT-101916-SMPC'

  union all
  select
    'SRC-RIVA-ORTHO-VTE-HIP',1,1,10,'mg',
    'oral_solid','PO',null,'EXACT_STRENGTH',
    'emc 101914 rivaroxaban 10 mg film-coated tablet',
    src.snapshot_id,src.section_sha256
  from src where src.source_key='EMC-PRODUCT-101914-SMPC'
  union all
  select
    'SRC-RIVA-ORTHO-VTE-KNEE',1,1,10,'mg',
    'oral_solid','PO',null,'EXACT_STRENGTH',
    'emc 101914 rivaroxaban 10 mg film-coated tablet',
    src.snapshot_id,src.section_sha256
  from src where src.source_key='EMC-PRODUCT-101914-SMPC'

  union all
  select
    'SRC-RIVA-PED-VTE-WEIGHT-BANDS',1,1,15,'mg',
    'oral_solid','PO',null,'EXACT_STRENGTH',
    'emc 101915 rivaroxaban 15 mg film-coated tablet',
    src.snapshot_id,src.section_sha256
  from src where src.source_key='EMC-PRODUCT-101915-SMPC'
  union all
  select
    'SRC-RIVA-PED-VTE-WEIGHT-BANDS',2,1,20,'mg',
    'oral_solid','PO',null,'EXACT_STRENGTH',
    'emc 101916 rivaroxaban 20 mg film-coated tablet',
    src.snapshot_id,src.section_sha256
  from src where src.source_key='EMC-PRODUCT-101916-SMPC'
) x(
  regimen_key,branch_no,step_no,
  required_strength_value,required_strength_unit,
  required_form_family,required_route_key,required_release_key,
  presentation_policy,source_product_label,source_snapshot_id,source_section_sha256
)
on conflict (regimen_key,branch_no,step_no) do nothing;

-- Food requirements explicitly stated in the captured 15 mg / 20 mg SmPCs.
with src as (
  select s.source_key,s.snapshot_id,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key in ('EMC-PRODUCT-101915-SMPC','EMC-PRODUCT-101916-SMPC')
)
insert into drx_dose.source_regimen_step_administration_v1(
  regimen_key,branch_no,step_no,food_requirement,timing_requirement,
  administration_note,source_snapshot_id,source_section_sha256
)
select * from (
  select
    'SRC-RIVA-DVTPE-ADULT-SEQUENCE'::text,1,1,'WITH_FOOD'::text,null::text,
    '15 mg rivaroxaban tablet dose is taken with food.',
    src.snapshot_id,src.section_sha256
  from src where src.source_key='EMC-PRODUCT-101915-SMPC'
  union all
  select
    'SRC-RIVA-DVTPE-ADULT-SEQUENCE',1,2,'WITH_FOOD',null,
    '20 mg rivaroxaban tablet dose is taken with food.',
    src.snapshot_id,src.section_sha256
  from src where src.source_key='EMC-PRODUCT-101916-SMPC'
  union all
  select
    'SRC-RIVA-DVTPE-EXTENDED-ADULT',2,1,'WITH_FOOD',null,
    '20 mg extended-prevention branch is taken with food.',
    src.snapshot_id,src.section_sha256
  from src where src.source_key='EMC-PRODUCT-101916-SMPC'
  union all
  select
    'SRC-RIVA-NVAF-ADULT',1,1,'WITH_FOOD',null,
    '20 mg NVAF dose is taken with food.',
    src.snapshot_id,src.section_sha256
  from src where src.source_key='EMC-PRODUCT-101916-SMPC'
  union all
  select
    'SRC-RIVA-PED-VTE-WEIGHT-BANDS',1,1,'WITH_FOOD',null,
    '15 mg paediatric tablet dose is taken with food.',
    src.snapshot_id,src.section_sha256
  from src where src.source_key='EMC-PRODUCT-101915-SMPC'
  union all
  select
    'SRC-RIVA-PED-VTE-WEIGHT-BANDS',2,1,'WITH_FOOD',null,
    '20 mg paediatric tablet dose is taken with food.',
    src.snapshot_id,src.section_sha256
  from src where src.source_key='EMC-PRODUCT-101916-SMPC'
) x(
  regimen_key,branch_no,step_no,food_requirement,timing_requirement,
  administration_note,source_snapshot_id,source_section_sha256
)
on conflict (regimen_key,branch_no,step_no) do nothing;

-- Supporting evidence: attach all directly relevant strengths to each reusable regimen.
insert into drx_dose.source_regimen_supporting_evidence_v1(
  regimen_key,source_snapshot_id,source_section_sha256,source_url,evidence_role
)
select
  x.regimen_key,s.snapshot_id,sec.section_sha256,s.source_url,x.evidence_role
from (
  values
    ('SRC-RIVA-DVTPE-ADULT-SEQUENCE','EMC-PRODUCT-101916-SMPC','PRIMARY'),
    ('SRC-RIVA-DVTPE-ADULT-SEQUENCE','EMC-PRODUCT-101915-SMPC','SUPPORTING'),
    ('SRC-RIVA-DVTPE-EXTENDED-ADULT','EMC-PRODUCT-101914-SMPC','PRIMARY'),
    ('SRC-RIVA-DVTPE-EXTENDED-ADULT','EMC-PRODUCT-101916-SMPC','SUPPORTING'),
    ('SRC-RIVA-NVAF-ADULT','EMC-PRODUCT-101916-SMPC','PRIMARY'),
    ('SRC-RIVA-NVAF-ADULT','EMC-PRODUCT-101915-SMPC','SUPPORTING'),
    ('SRC-RIVA-ORTHO-VTE-HIP','EMC-PRODUCT-101914-SMPC','PRIMARY'),
    ('SRC-RIVA-ORTHO-VTE-KNEE','EMC-PRODUCT-101914-SMPC','PRIMARY'),
    ('SRC-RIVA-PED-VTE-WEIGHT-BANDS','EMC-PRODUCT-101915-SMPC','PRIMARY'),
    ('SRC-RIVA-PED-VTE-WEIGHT-BANDS','EMC-PRODUCT-101916-SMPC','SUPPORTING')
) x(regimen_key,source_key,evidence_role)
join public.dose_source_snapshots_v3 s on s.source_key=x.source_key
join public.dose_source_sections_v3 sec
  on sec.snapshot_id=s.snapshot_id
 and sec.section_code='4.2'
 and sec.extraction_status='extracted'
on conflict do nothing;

-- Candidate-level applicability remains review-only because sequence/branch
-- regimens may require more than one tablet strength.
insert into drx_dose.source_candidate_applicability_v1(
  candidate_type,candidate_key,scope_type,route_key,form_family,
  source_product_label,product_binding_policy
)
select
  'REGIMEN',r.regimen_key,'ROUTE_FORM_REVIEW','PO','oral_solid',
  'Rivaroxaban film-coated tablets; exact strengths are defined per regimen step',
  'COMPATIBLE_PRODUCT_REVIEW'
from drx_dose.source_regimen_candidates_v1 r
where r.regimen_key like 'SRC-RIVA-%'
on conflict (candidate_type,candidate_key) do nothing;

-- Adult renal adjustments.
with src as (
  select s.source_key,s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key in ('EMC-PRODUCT-101915-SMPC','EMC-PRODUCT-101916-SMPC')
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='rivaroxaban'
)
insert into drx_dose.source_adjustment_candidates_v1(
  adjustment_key,regimen_key,substance_concept_id,adjustment_domain,measure_type,
  min_value,max_value,min_inclusive,max_inclusive,action_type,
  replacement_dose_min,replacement_dose_max,replacement_dose_unit,
  replacement_frequency_mode,replacement_times_per_day,max_daily_dose_mg,
  condition_text,source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
select * from (
  select
    'SRC-ADJ-RIVA-NVAF-CRCL15TO49-15QD'::text,'SRC-RIVA-NVAF-ADULT'::text,sub.concept_id,
    'RENAL','CrCl_mL_min',15::numeric,49::numeric,true,true,'REPLACE_DOSE',
    15::numeric,15::numeric,'mg','times_per_day',1::numeric,15::numeric,
    'For adult NVAF with CrCl 15-49 mL/min, the captured SmPC uses rivaroxaban 15 mg once daily.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub join src on src.source_key='EMC-PRODUCT-101916-SMPC'

  union all
  select
    'SRC-ADJ-RIVA-DVTPE-AFTER-DAY21-CONSIDER15QD',
    'SRC-RIVA-DVTPE-ADULT-SEQUENCE',sub.concept_id,
    'RENAL','CrCl_mL_min',15,49,true,true,'CONSIDER_REDUCTION',
    15,15,'mg','times_per_day',1,15,
    'After the initial 3 weeks of adult DVT/PE treatment, reduction from 20 mg once daily to 15 mg once daily may be considered when assessed bleeding risk outweighs recurrence risk. This is a clinician-judgement branch, not an automatic renal replacement.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub join src on src.source_key='EMC-PRODUCT-101916-SMPC'

  union all
  select
    'SRC-ADJ-RIVA-CRCL15TO29-CAUTION',null,sub.concept_id,
    'RENAL','CrCl_mL_min',15,29,true,true,'CAUTION',
    null,null,null,null,null,null,
    'Adult CrCl 15-29 mL/min: use rivaroxaban with caution.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub join src on src.source_key='EMC-PRODUCT-101916-SMPC'
) x(
  adjustment_key,regimen_key,substance_concept_id,adjustment_domain,measure_type,
  min_value,max_value,min_inclusive,max_inclusive,action_type,
  replacement_dose_min,replacement_dose_max,replacement_dose_unit,
  replacement_frequency_mode,replacement_times_per_day,max_daily_dose_mg,
  condition_text,source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
on conflict (adjustment_key) do nothing;

-- Adult/pediatric renal and hepatic fail-closed restrictions.
with src as (
  select s.source_key,s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key in ('EMC-PRODUCT-101915-SMPC','EMC-PRODUCT-101916-SMPC')
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='rivaroxaban'
)
insert into drx_dose.source_restriction_candidates_v1(
  restriction_key,substance_concept_id,indication_key_candidate,patient_group,
  restriction_type,machine_action,renal_operator,renal_threshold,renal_unit,
  restriction_text,source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
select * from (
  select
    'SRC-REST-RIVA-ADULT-CRCL-LT15'::text,sub.concept_id,null::text,'adult_only',
    'RENAL_RESTRICTION','BLOCK','<',15::numeric,'mL/min',
    'Adult rivaroxaban is not recommended when CrCl is below 15 mL/min.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub join src on src.source_key='EMC-PRODUCT-101916-SMPC'

  union all
  select
    'SRC-REST-RIVA-PED-GFR-LT50',sub.concept_id,
    'rivaroxaban-pediatric-vte-treatment-recurrence-prevention','pediatric_only',
    'RENAL_RESTRICTION','BLOCK','<',50,'mL/min/1.73m2',
    'Paediatric rivaroxaban is not recommended when GFR is below 50 mL/min/1.73m2.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub join src on src.source_key='EMC-PRODUCT-101916-SMPC'

  union all
  select
    'SRC-REST-RIVA-HEPATIC-COAGULOPATHY-BLEEDING',sub.concept_id,null,'pediatric_and_adult',
    'HEPATIC_RESTRICTION','BLOCK',null,null,null,
    'Rivaroxaban is contraindicated in hepatic disease associated with coagulopathy and clinically relevant bleeding risk.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub join src on src.source_key='EMC-PRODUCT-101916-SMPC'
) x(
  restriction_key,substance_concept_id,indication_key_candidate,patient_group,
  restriction_type,machine_action,renal_operator,renal_threshold,renal_unit,
  restriction_text,source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
on conflict (restriction_key) do nothing;

insert into drx_dose.source_candidate_applicability_v1(
  candidate_type,candidate_key,scope_type,route_key,form_family,
  source_product_label,product_binding_policy
)
select
  'ADJUSTMENT',a.adjustment_key,'ROUTE_FORM_REVIEW','PO','oral_solid',
  'Rivaroxaban film-coated tablet SmPC renal recommendations','REVIEW_REQUIRED'
from drx_dose.source_adjustment_candidates_v1 a
where a.adjustment_key like 'SRC-ADJ-RIVA-%'
on conflict (candidate_type,candidate_key) do nothing;

insert into drx_dose.source_candidate_applicability_v1(
  candidate_type,candidate_key,scope_type,route_key,form_family,
  source_product_label,product_binding_policy
)
select
  'RESTRICTION',r.restriction_key,'ROUTE_FORM_REVIEW','PO','oral_solid',
  'Rivaroxaban film-coated tablet SmPC restriction','REVIEW_REQUIRED'
from drx_dose.source_restriction_candidates_v1 r
where r.restriction_key like 'SRC-REST-RIVA-%'
on conflict (candidate_type,candidate_key) do nothing;

alter table drx_dose.source_regimen_step_presentation_requirements_v1 enable row level security;
alter table drx_dose.source_regimen_step_administration_v1 enable row level security;
revoke all on drx_dose.source_regimen_step_presentation_requirements_v1 from public,anon,authenticated;
revoke all on drx_dose.source_regimen_step_administration_v1 from public,anon,authenticated;
grant select,insert,update,delete on drx_dose.source_regimen_step_presentation_requirements_v1 to service_role;
grant select,insert,update,delete on drx_dose.source_regimen_step_administration_v1 to service_role;
