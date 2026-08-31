
-- DRx Phase 11X: strength-aware source regimens + co-amoxiclav ingredient-set seed.
-- Demonstrates "fill once for the active ingredient set, reuse across brands"
-- while keeping strength/formulation compatibility explicit.

alter table drx_dose.source_regimen_candidates_v1
  add column if not exists strength_match_mode text not null default 'MANUAL_REVIEW'
    check (strength_match_mode in (
      'ANY_COMPATIBLE','EXACT_PRODUCT_STRENGTH','EXACT_COMPONENT_STRENGTH','MANUAL_REVIEW'
    ));

create table if not exists drx_dose.source_regimen_strength_requirements_v1 (
  regimen_key text not null
    references drx_dose.source_regimen_candidates_v1(regimen_key) on delete cascade,
  component_concept_id uuid not null
    references public.substance_concepts_v1(concept_id) on delete restrict,
  numerator_value numeric not null check (numerator_value > 0),
  numerator_unit text not null,
  denominator_value numeric not null default 1 check (denominator_value > 0),
  denominator_unit text not null,
  requirement_note text,
  created_at timestamptz not null default now(),
  primary key (regimen_key,component_concept_id,numerator_value,numerator_unit,denominator_value,denominator_unit)
);

create index if not exists source_regimen_strength_requirements_v1_regimen_idx
  on drx_dose.source_regimen_strength_requirements_v1(regimen_key);

-- Existing single-substance source regimens remain explicit manual-review strength
-- until product conversion/binding is implemented for this staging layer.
update drx_dose.source_regimen_candidates_v1
set strength_match_mode='MANUAL_REVIEW'
where strength_match_mode is null;

-- Co-amoxiclav 875/125 mg source-first regimen candidates.
with src as (
  select s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-10877-SMPC'
  order by s.created_at desc limit 1
),
ids as (
  select
    (select concept_id from public.substance_concepts_v1 where canonical_key='amoxicillin') as amox,
    (select concept_id from public.substance_concepts_v1 where canonical_key='clavulanicacid') as clav
),
inds as (
  select
    (select indication_id from public.dose_indication_concepts_v3
     where indication_key='IND-P8-COALMACIN-LOWER-DOSE') as lower_indication_id,
    (select indication_id from public.dose_indication_concepts_v3
     where indication_key='IND-P8-COALMACIN-HIGHER-DOSE') as higher_indication_id
)
insert into drx_dose.source_regimen_candidates_v1(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,indication_id,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status,
  target_kind,dose_moiety_concept_ids,strength_match_mode
)
select * from (
  select
    'SRC-COAMOX-875125-ADULT-STANDARD'::text,null::uuid,
    'IND-P8-COALMACIN-LOWER-DOSE',
    'SmPC-listed infections — standard 875/125 mg regimen',
    inds.lower_indication_id,
    'adult_only','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING',
    'INGREDIENT_SET',array[ids.amox,ids.clav]::uuid[],'EXACT_COMPONENT_STRENGTH'
  from src cross join ids cross join inds

  union all

  select
    'SRC-COAMOX-875125-ADULT-HIGHER',null::uuid,
    'IND-P8-COALMACIN-HIGHER-DOSE',
    'Selected SmPC-listed infections — higher 875/125 mg regimen',
    inds.higher_indication_id,
    'adult_only','PO','oral_solid','conditional',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING',
    'INGREDIENT_SET',array[ids.amox,ids.clav]::uuid[],'EXACT_COMPONENT_STRENGTH'
  from src cross join ids cross join inds

  union all

  select
    'SRC-COAMOX-PED-STANDARD-RANGE',null::uuid,
    'IND-P8-COALMACIN-LOWER-DOSE',
    'Paediatric co-amoxiclav standard weight-based range',
    inds.lower_indication_id,
    'pediatric_only','PO',null::text,'weight_band',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING',
    'INGREDIENT_SET',array[ids.amox,ids.clav]::uuid[],'MANUAL_REVIEW'
  from src cross join ids cross join inds

  union all

  select
    'SRC-COAMOX-PED-HIGHER-RANGE',null::uuid,
    'IND-P8-COALMACIN-HIGHER-DOSE',
    'Paediatric co-amoxiclav higher weight-based regimen for selected infections',
    inds.higher_indication_id,
    'pediatric_only','PO',null::text,'conditional',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING',
    'INGREDIENT_SET',array[ids.amox,ids.clav]::uuid[],'MANUAL_REVIEW'
  from src cross join ids cross join inds
) x(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,indication_id,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status,
  target_kind,dose_moiety_concept_ids,strength_match_mode
)
on conflict (regimen_key) do nothing;

-- Parent regimen steps. Combination component doses live in the child component table.
insert into drx_dose.source_regimen_steps_v1(
  regimen_key,branch_no,step_no,min_weight_kg,max_weight_kg,
  calculation_method,dose_min_value,dose_max_value,dose_unit,
  frequency_mode,times_per_day,duration_max_days,condition_text,source_note
) values
  ('SRC-COAMOX-875125-ADULT-STANDARD',1,1,40,null,
   'fixed_dose',1,1,'tablet','times_per_day',2,14,
   'Adults and children >=40 kg; treatment beyond 14 days requires review.',
   'One 875/125 mg tablet twice daily; exact component strength required.'),

  ('SRC-COAMOX-875125-ADULT-HIGHER',1,1,40,null,
   'fixed_dose',1,1,'tablet','times_per_day',3,14,
   'Higher regimen particularly for selected infections such as otitis media, sinusitis, lower respiratory tract infections and urinary tract infections.',
   'One 875/125 mg tablet three times daily; exact component strength required.'),

  ('SRC-COAMOX-PED-STANDARD-RANGE',1,1,null,39.999,
   'manual_only',null,null,null,'times_per_day',2,14,
   'Children <40 kg; component-specific doses are expressed per kg per day and divided into two doses.',
   'Use component rows; formulation/product conversion remains manual-review.'),

  ('SRC-COAMOX-PED-HIGHER-RANGE',1,1,null,39.999,
   'manual_only',null,null,null,'times_per_day',2,14,
   'Up to the higher component-specific weight-based regimen may be considered for selected infections.',
   'Use component rows; formulation/product conversion remains manual-review.')
on conflict (regimen_key,branch_no,step_no) do nothing;

-- Adult fixed-dose component content per tablet/dose.
with ids as (
  select
    (select concept_id from public.substance_concepts_v1 where canonical_key='amoxicillin') as amox,
    (select concept_id from public.substance_concepts_v1 where canonical_key='clavulanicacid') as clav
)
insert into drx_dose.source_regimen_step_components_v1(
  regimen_key,branch_no,step_no,component_concept_id,component_role,
  dose_min_value,dose_max_value,dose_unit,dose_basis,note
)
select * from (
  select 'SRC-COAMOX-875125-ADULT-STANDARD'::text,1,1,ids.amox,'DOSE_BASIS',875::numeric,875::numeric,'mg','per_dose','Amoxicillin content of one tablet/dose' from ids
  union all
  select 'SRC-COAMOX-875125-ADULT-STANDARD',1,1,ids.clav,'ACTIVE',125,125,'mg','per_dose','Clavulanic acid content of one tablet/dose' from ids
  union all
  select 'SRC-COAMOX-875125-ADULT-HIGHER',1,1,ids.amox,'DOSE_BASIS',875,875,'mg','per_dose','Amoxicillin content of one tablet/dose' from ids
  union all
  select 'SRC-COAMOX-875125-ADULT-HIGHER',1,1,ids.clav,'ACTIVE',125,125,'mg','per_dose','Clavulanic acid content of one tablet/dose' from ids
  union all
  select 'SRC-COAMOX-PED-STANDARD-RANGE',1,1,ids.amox,'DOSE_BASIS',25,45,'mg','kg/day','Amoxicillin component range' from ids
  union all
  select 'SRC-COAMOX-PED-STANDARD-RANGE',1,1,ids.clav,'ACTIVE',3.6,6.4,'mg','kg/day','Clavulanic acid component range' from ids
  union all
  select 'SRC-COAMOX-PED-HIGHER-RANGE',1,1,ids.amox,'DOSE_BASIS',70,70,'mg','kg/day','Amoxicillin component higher regimen' from ids
  union all
  select 'SRC-COAMOX-PED-HIGHER-RANGE',1,1,ids.clav,'ACTIVE',10,10,'mg','kg/day','Clavulanic acid component higher regimen' from ids
) x(regimen_key,branch_no,step_no,component_concept_id,component_role,dose_min_value,dose_max_value,dose_unit,dose_basis,note)
on conflict (regimen_key,branch_no,step_no,component_concept_id) do nothing;

-- Exact 875/125 mg per tablet requirements for the adult fixed-tablet regimens.
with ids as (
  select
    (select concept_id from public.substance_concepts_v1 where canonical_key='amoxicillin') as amox,
    (select concept_id from public.substance_concepts_v1 where canonical_key='clavulanicacid') as clav
)
insert into drx_dose.source_regimen_strength_requirements_v1(
  regimen_key,component_concept_id,numerator_value,numerator_unit,denominator_value,denominator_unit,requirement_note
)
select * from (
  select 'SRC-COAMOX-875125-ADULT-STANDARD'::text,ids.amox,875::numeric,'mg',1::numeric,'tablet','Exact amoxicillin content per tablet' from ids
  union all
  select 'SRC-COAMOX-875125-ADULT-STANDARD',ids.clav,125,'mg',1,'tablet','Exact clavulanic acid content per tablet' from ids
  union all
  select 'SRC-COAMOX-875125-ADULT-HIGHER',ids.amox,875,'mg',1,'tablet','Exact amoxicillin content per tablet' from ids
  union all
  select 'SRC-COAMOX-875125-ADULT-HIGHER',ids.clav,125,'mg',1,'tablet','Exact clavulanic acid content per tablet' from ids
) x(regimen_key,component_concept_id,numerator_value,numerator_unit,denominator_value,denominator_unit,requirement_note)
on conflict do nothing;

-- Combination-target safety restrictions from the same §4.2 source.
with src as (
  select s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id and sec.section_code='4.2' and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-10877-SMPC'
  order by s.created_at desc limit 1
),
ids as (
  select
    (select concept_id from public.substance_concepts_v1 where canonical_key='amoxicillin') as amox,
    (select concept_id from public.substance_concepts_v1 where canonical_key='clavulanicacid') as clav
)
insert into drx_dose.source_restriction_candidates_v1(
  restriction_key,substance_concept_id,patient_group,restriction_type,machine_action,
  max_age_months,max_weight_kg,renal_operator,renal_threshold,renal_unit,
  restriction_text,source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind,dose_moiety_concept_ids
)
select * from (
  select
    'SRC-REST-COAMOX-875125-TABLET-BELOW-25KG'::text,null::uuid,'pediatric_only',
    'FORMULATION_RESTRICTION','BLOCK',null::numeric,24.999::numeric,
    null::text,null::numeric,null::text,
    'The 875/125 mg tablet cannot be divided and must not be used in children below 25 kg; use an appropriate paediatric formulation.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING',
    'INGREDIENT_SET',array[ids.amox,ids.clav]::uuid[]
  from src cross join ids

  union all

  select
    'SRC-REST-COAMOX-7TO1-CRCL-BELOW-30',null::uuid,'pediatric_and_adult',
    'RENAL_RESTRICTION','BLOCK',null::numeric,null::numeric,
    '<',30,'mL/min',
    'Amoxicillin/clavulanic acid 7:1 presentations are not recommended when CrCl is below 30 mL/min because dose-adjustment recommendations are unavailable.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING',
    'INGREDIENT_SET',array[ids.amox,ids.clav]::uuid[]
  from src cross join ids

  union all

  select
    'SRC-REST-COAMOX-7TO1-BELOW-2MONTHS',null::uuid,'pediatric_only',
    'NO_ESTABLISHED_DATA','BLOCK',1.999,null::numeric,
    null::text,null::numeric,null::text,
    'No dosing recommendation can be made for amoxicillin/clavulanic acid 7:1 formulations below 2 months of age based on this SmPC.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING',
    'INGREDIENT_SET',array[ids.amox,ids.clav]::uuid[]
  from src cross join ids
) x(
  restriction_key,substance_concept_id,patient_group,restriction_type,machine_action,
  max_age_months,max_weight_kg,renal_operator,renal_threshold,renal_unit,
  restriction_text,source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind,dose_moiety_concept_ids
)
on conflict (restriction_key) do nothing;

-- Fix dashboard metric so draft-regimen contexts are counted even if another
-- blocker has higher display precedence.
create or replace view drx_dose.dose_fill_dashboard_v1 as
select
  'TARGETS'::text as metric_group,
  jsonb_build_object(
    'uniqueDoseTargets',(select count(*) from drx_dose.dose_target_catalog_v1),
    'targetsWithDraftRegimens',(select count(*) from drx_dose.dose_target_catalog_v1 where source_regimen_candidate_count>0),
    'targetsWithVerifiedRules',(select count(*) from drx_dose.dose_target_catalog_v1 where verified_rule_target_count>0),
    'productsRepresented',(select coalesce(sum(product_count),0) from drx_dose.dose_target_catalog_v1)
  ) as metrics
union all
select
  'CONTEXTS',
  jsonb_build_object(
    'targetContexts',(select count(*) from drx_dose.dose_target_context_queue_v1),
    'contextsWithDraftRegimens',(select count(*) from drx_dose.dose_target_context_queue_v1 where source_regimen_candidate_count>0),
    'contextsWithExactEvidence',(select count(*) from drx_dose.dose_target_context_queue_v1 where exact_42_candidate_rows>0),
    'contextsWithLegacyCandidates',(select count(*) from drx_dose.dose_target_context_queue_v1 where structured_candidate_rows>0)
  );

alter table drx_dose.source_regimen_strength_requirements_v1 enable row level security;
revoke all on drx_dose.source_regimen_strength_requirements_v1 from public,anon,authenticated;
grant select,insert,update,delete on drx_dose.source_regimen_strength_requirements_v1 to service_role;
