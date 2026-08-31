
-- DRx Phase 11AU: desloratadine oral-solution age-band regimen.
-- One shared clinical regimen covers allergic rhinitis and urticaria. It stays
-- PENDING/review-only; products are never auto-bound and nothing is published.

with src as (
  select s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-6510-SMPC'
  order by s.created_at desc
  limit 1
),
sub as (
  select concept_id
  from public.substance_concepts_v1
  where canonical_key='desloratadine'
)
insert into drx_dose.source_regimen_candidates_v1(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status,
  target_kind,strength_match_mode
)
select
  'SRC-DESLOR-SOLUTION-AGE-BANDS',
  sub.concept_id,
  'desloratadine-allergic-rhinitis-1plus',
  'Allergic rhinitis in patients aged 1 year and above — oral solution age bands',
  'pediatric_and_adult','PO','oral_liquid','conditional',
  src.snapshot_id,src.section_sha256,src.source_url,'PENDING',
  'SUBSTANCE','EXACT_COMPONENT_STRENGTH'
from sub cross join src
on conflict (regimen_key) do nothing;

insert into drx_dose.source_regimen_steps_v1(
  regimen_key,branch_no,step_no,min_age_months,max_age_months,
  calculation_method,dose_min_value,dose_max_value,dose_unit,
  frequency_mode,times_per_day,max_single_dose_mg,max_daily_dose_mg,
  condition_text,source_note
) values
  ('SRC-DESLOR-SOLUTION-AGE-BANDS',1,1,12,71.999,
   'fixed_dose',1.25,1.25,'mg','times_per_day',1,1.25,1.25,
   'Children 1 through 5 years.',
   'Equivalent source volume: 2.5 mL of 0.5 mg/mL oral solution once daily.'),
  ('SRC-DESLOR-SOLUTION-AGE-BANDS',2,1,72,143.999,
   'fixed_dose',2.5,2.5,'mg','times_per_day',1,2.5,2.5,
   'Children 6 through 11 years.',
   'Equivalent source volume: 5 mL of 0.5 mg/mL oral solution once daily.'),
  ('SRC-DESLOR-SOLUTION-AGE-BANDS',3,1,144,null,
   'fixed_dose',5,5,'mg','times_per_day',1,5,5,
   'Adults and adolescents 12 years and above.',
   'Equivalent source volume: 10 mL of 0.5 mg/mL oral solution once daily.')
on conflict (regimen_key,branch_no,step_no) do nothing;

with src as (
  select s.snapshot_id,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-6510-SMPC'
  order by s.created_at desc
  limit 1
)
insert into drx_dose.source_regimen_step_presentation_requirements_v1(
  regimen_key,branch_no,step_no,required_strength_value,required_strength_unit,
  required_form_family,required_route_key,presentation_policy,source_product_label,
  source_snapshot_id,source_section_sha256
)
select
  'SRC-DESLOR-SOLUTION-AGE-BANDS',b.branch_no,1,
  0.5,'mg/mL','oral_liquid','PO','COMPATIBLE_STRENGTH_REVIEW',
  'emc 6510 desloratadine 0.5 mg/mL oral solution',
  src.snapshot_id,src.section_sha256
from src
cross join (values (1),(2),(3)) b(branch_no)
on conflict (regimen_key,branch_no,step_no) do nothing;

with src as (
  select s.snapshot_id,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-6510-SMPC'
  order by s.created_at desc
  limit 1
)
insert into drx_dose.source_regimen_step_administration_v1(
  regimen_key,branch_no,step_no,food_requirement,administration_note,
  source_snapshot_id,source_section_sha256
)
select
  'SRC-DESLOR-SOLUTION-AGE-BANDS',b.branch_no,1,
  'WITH_OR_WITHOUT_FOOD',
  'Desloratadine oral solution may be taken with or without food.',
  src.snapshot_id,src.section_sha256
from src
cross join (values (1),(2),(3)) b(branch_no)
on conflict (regimen_key,branch_no,step_no) do nothing;

insert into drx_dose.source_regimen_indication_links_v1(
  regimen_key,indication_key_candidate,indication_label
) values
  ('SRC-DESLOR-SOLUTION-AGE-BANDS',
   'desloratadine-allergic-rhinitis-1plus',
   'Allergic rhinitis in patients aged 1 year and above'),
  ('SRC-DESLOR-SOLUTION-AGE-BANDS',
   'desloratadine-urticaria-1plus',
   'Urticaria in patients aged 1 year and above')
on conflict do nothing;

with src as (
  select s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-6510-SMPC'
  order by s.created_at desc
  limit 1
)
insert into drx_dose.source_regimen_supporting_evidence_v1(
  regimen_key,source_snapshot_id,source_section_code,source_section_sha256,
  source_url,evidence_role,review_status
)
select
  'SRC-DESLOR-SOLUTION-AGE-BANDS',
  src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PRIMARY','PENDING'
from src
on conflict do nothing;

insert into drx_dose.source_candidate_applicability_v1(
  candidate_type,candidate_key,scope_type,route_key,form_family,
  source_strength_value,source_strength_unit,release_key,
  source_product_label,product_binding_policy
) values
  ('REGIMEN','SRC-DESLOR-SOLUTION-AGE-BANDS',
   'EXACT_PRESENTATION','PO','oral_liquid',
   0.5,'mg/mL','NOT_APPLICABLE',
   'emc 6510 desloratadine 0.5 mg/mL oral solution',
   'COMPATIBLE_PRODUCT_REVIEW')
on conflict (candidate_type,candidate_key) do nothing;

with src as (
  select s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-6510-SMPC'
  order by s.created_at desc
  limit 1
),
sub as (
  select concept_id
  from public.substance_concepts_v1
  where canonical_key='desloratadine'
)
insert into drx_dose.source_restriction_candidates_v1(
  restriction_key,substance_concept_id,patient_group,restriction_type,machine_action,
  max_age_months,restriction_text,source_snapshot_id,source_section_code,
  source_section_sha256,source_url,review_status,target_kind
)
select
  'SRC-REST-DESLOR-SOLUTION-BELOW-1Y',
  sub.concept_id,'pediatric_only','NO_ESTABLISHED_DATA','BLOCK',
  11.999,
  'Safety and efficacy of desloratadine 0.5 mg/mL oral solution below 1 year have not been established.',
  src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
from sub cross join src
on conflict (restriction_key) do nothing;

insert into drx_dose.source_candidate_applicability_v1(
  candidate_type,candidate_key,scope_type,route_key,form_family,
  source_strength_value,source_strength_unit,release_key,
  source_product_label,product_binding_policy
) values
  ('RESTRICTION','SRC-REST-DESLOR-SOLUTION-BELOW-1Y',
   'SOURCE_PRODUCT_ONLY','PO','oral_liquid',
   0.5,'mg/mL','NOT_APPLICABLE',
   'emc 6510 desloratadine 0.5 mg/mL oral solution',
   'EXACT_PRESENTATION_ONLY')
on conflict (candidate_type,candidate_key) do nothing;

select public.drx_phase11_refresh_source_indications_v1();
select public.drx_phase11_refresh_regimen_indication_links_v1();
