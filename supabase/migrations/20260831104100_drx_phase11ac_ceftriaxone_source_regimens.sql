
-- DRx Phase 11AC: reusable source-indication materializer + ceftriaxone source regimens.
-- All indications/regimens remain DRAFT/PENDING. No publication or runtime serving.

alter table drx_dose.source_regimen_steps_v1
  add column if not exists min_age_days numeric,
  add column if not exists max_age_days numeric;

alter table drx_dose.source_regimen_steps_v1
  drop constraint if exists source_regimen_steps_v1_age_days_check;
alter table drx_dose.source_regimen_steps_v1
  add constraint source_regimen_steps_v1_age_days_check
  check (min_age_days is null or max_age_days is null or min_age_days <= max_age_days);

create or replace function public.drx_phase11_refresh_source_indications_v1()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_concepts integer;
  v_terms integer;
  v_links integer;
begin
  insert into public.dose_indication_concepts_v3(
    indication_id,indication_key,canonical_name,icd10_codes,
    icd_verification_status,editorial_status
  )
  select
    gen_random_uuid(),
    s.indication_key_candidate,
    s.indication_label,
    '{}'::text[],
    'unverified',
    'draft'
  from (
    select distinct on (r.indication_key_candidate)
      r.indication_key_candidate,r.indication_label
    from drx_dose.source_regimen_candidates_v1 r
    where nullif(btrim(r.indication_key_candidate),'') is not null
    order by r.indication_key_candidate,r.created_at
  ) s
  where not exists (
    select 1 from public.dose_indication_concepts_v3 i
    where i.indication_key=s.indication_key_candidate
  );

  get diagnostics v_concepts=row_count;

  insert into public.dose_indication_terms_v3(
    term_key,indication_id,term,language,term_type,source_snapshot_id,verified_at
  )
  select
    'TERM-SRC-'||md5(r.indication_key_candidate),
    i.indication_id,
    r.indication_label,
    'en',
    'canonical',
    r.source_snapshot_id,
    null
  from (
    select distinct on (indication_key_candidate)
      indication_key_candidate,indication_label,source_snapshot_id
    from drx_dose.source_regimen_candidates_v1
    where nullif(btrim(indication_key_candidate),'') is not null
    order by indication_key_candidate,created_at
  ) r
  join public.dose_indication_concepts_v3 i
    on i.indication_key=r.indication_key_candidate
  on conflict (term_key) do nothing;

  get diagnostics v_terms=row_count;

  update drx_dose.source_regimen_candidates_v1 r
  set indication_id=i.indication_id,updated_at=now()
  from public.dose_indication_concepts_v3 i
  where i.indication_key=r.indication_key_candidate
    and r.indication_id is distinct from i.indication_id;

  get diagnostics v_links=row_count;

  return jsonb_build_object(
    'newDraftConcepts',v_concepts,
    'newDraftTerms',v_terms,
    'regimensLinked',v_links,
    'draftIndications',(select count(*) from public.dose_indication_concepts_v3 where editorial_status='draft'),
    'autoPublished',false
  );
end;
$$;

-- Source-backed ceftriaxone regimen candidates from the captured emc §4.2.
with src as (
  select s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-102127-SMPC'
  order by s.created_at desc limit 1
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='ceftriaxone'
)
insert into drx_dose.source_regimen_candidates_v1(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status,
  target_kind,strength_match_mode
)
select * from (
  select 'SRC-CEFTRI-ADULT-CAP-COPD-IAI-CUTI'::text,sub.concept_id,
    'ceftriaxone-adult-cap-copd-iai-cuti',
    'Adult community-acquired pneumonia, COPD exacerbation, intra-abdominal infection or complicated UTI',
    'adult_only','IV_OR_IM','parenteral','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','ANY_COMPATIBLE'
  from sub cross join src

  union all
  select 'SRC-CEFTRI-ADULT-HAP',sub.concept_id,
    'ceftriaxone-adult-hospital-acquired-pneumonia',
    'Adult hospital-acquired pneumonia',
    'adult_only','IV_OR_IM','parenteral','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','ANY_COMPATIBLE'
  from sub cross join src

  union all
  select 'SRC-CEFTRI-ADULT-SSTI-BONE-JOINT',sub.concept_id,
    'ceftriaxone-adult-complicated-ssti-bone-joint',
    'Adult complicated skin/soft-tissue or bone/joint infection',
    'adult_only','IV_OR_IM','parenteral','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','ANY_COMPATIBLE'
  from sub cross join src

  union all
  select 'SRC-CEFTRI-ADULT-MENINGITIS-ENDOCARDITIS-NEUTROPENIC',sub.concept_id,
    'ceftriaxone-adult-meningitis-endocarditis-neutropenic-fever',
    'Adult bacterial meningitis, bacterial endocarditis or neutropenic fever',
    'adult_only','IV_OR_IM','parenteral','conditional',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','ANY_COMPATIBLE'
  from sub cross join src

  union all
  select 'SRC-CEFTRI-ADULT-GONORRHOEA',sub.concept_id,
    'ceftriaxone-adult-gonorrhoea',
    'Adult gonorrhoea',
    'adult_only','IM','parenteral','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','ANY_COMPATIBLE'
  from sub cross join src

  union all
  select 'SRC-CEFTRI-ADULT-SURGICAL-PROPHYLAXIS',sub.concept_id,
    'ceftriaxone-adult-surgical-prophylaxis',
    'Adult pre-operative prophylaxis of surgical-site infection',
    'adult_only','IV_OR_IM','parenteral','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','ANY_COMPATIBLE'
  from sub cross join src

  union all
  select 'SRC-CEFTRI-ADULT-LYME',sub.concept_id,
    'ceftriaxone-adult-disseminated-lyme-borreliosis',
    'Adult disseminated Lyme borreliosis',
    'adult_only','IV_OR_IM','parenteral','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','ANY_COMPATIBLE'
  from sub cross join src

  union all
  select 'SRC-CEFTRI-PED-CAP-HAP-IAI-CUTI',sub.concept_id,
    'ceftriaxone-pediatric-cap-hap-iai-cuti',
    'Paediatric community/hospital pneumonia, intra-abdominal infection or complicated UTI',
    'pediatric_only','IV_OR_IM','parenteral','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','ANY_COMPATIBLE'
  from sub cross join src

  union all
  select 'SRC-CEFTRI-PED-SSTI-BONE-NEUTROPENIC',sub.concept_id,
    'ceftriaxone-pediatric-ssti-bone-joint-neutropenic-fever',
    'Paediatric complicated skin/soft-tissue, bone/joint infection or neutropenic fever',
    'pediatric_only','IV_OR_IM','parenteral','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','ANY_COMPATIBLE'
  from sub cross join src

  union all
  select 'SRC-CEFTRI-PED-MENINGITIS',sub.concept_id,
    'ceftriaxone-pediatric-bacterial-meningitis',
    'Paediatric bacterial meningitis',
    'pediatric_only','IV_OR_IM','parenteral','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','ANY_COMPATIBLE'
  from sub cross join src

  union all
  select 'SRC-CEFTRI-PED-ENDOCARDITIS',sub.concept_id,
    'ceftriaxone-pediatric-bacterial-endocarditis',
    'Paediatric bacterial endocarditis',
    'pediatric_only','IV_OR_IM','parenteral','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','ANY_COMPATIBLE'
  from sub cross join src

  union all
  select 'SRC-CEFTRI-PED-OTITIS',sub.concept_id,
    'ceftriaxone-pediatric-acute-otitis-media',
    'Paediatric acute otitis media',
    'pediatric_only','IM','parenteral','conditional',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','ANY_COMPATIBLE'
  from sub cross join src

  union all
  select 'SRC-CEFTRI-PED-SURGICAL-PROPHYLAXIS',sub.concept_id,
    'ceftriaxone-pediatric-surgical-prophylaxis',
    'Paediatric pre-operative prophylaxis of surgical-site infection',
    'pediatric_only','IV_OR_IM','parenteral','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','ANY_COMPATIBLE'
  from sub cross join src

  union all
  select 'SRC-CEFTRI-PED-SYPHILIS',sub.concept_id,
    'ceftriaxone-pediatric-syphilis',
    'Paediatric syphilis',
    'pediatric_only','IV_OR_IM','parenteral','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','ANY_COMPATIBLE'
  from sub cross join src

  union all
  select 'SRC-CEFTRI-PED-LYME',sub.concept_id,
    'ceftriaxone-pediatric-disseminated-lyme-borreliosis',
    'Paediatric disseminated Lyme borreliosis',
    'pediatric_only','IV_OR_IM','parenteral','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','ANY_COMPATIBLE'
  from sub cross join src

  union all
  select 'SRC-CEFTRI-NEONATE-GENERAL',sub.concept_id,
    'ceftriaxone-neonate-listed-infections-general',
    'Neonatal listed bacterial infections excluding meningitis/endocarditis',
    'pediatric_only','IV_OR_IM','parenteral','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','ANY_COMPATIBLE'
  from sub cross join src

  union all
  select 'SRC-CEFTRI-NEONATE-MENINGITIS-ENDOCARDITIS',sub.concept_id,
    'ceftriaxone-neonate-meningitis-endocarditis',
    'Neonatal bacterial meningitis or endocarditis',
    'pediatric_only','IV','parenteral','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','ANY_COMPATIBLE'
  from sub cross join src
) x(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status,
  target_kind,strength_match_mode
)
on conflict (regimen_key) do nothing;

insert into drx_dose.source_regimen_steps_v1(
  regimen_key,branch_no,step_no,min_age_days,max_age_days,min_age_months,max_age_months,
  min_weight_kg,max_weight_kg,calculation_method,dose_min_value,dose_max_value,dose_unit,
  frequency_mode,interval_min_hours,interval_max_hours,times_per_day,
  duration_min_days,duration_max_days,max_single_dose_mg,max_daily_dose_mg,
  condition_text,source_note
) values
  ('SRC-CEFTRI-ADULT-CAP-COPD-IAI-CUTI',1,1,null,null,null,null,50,null,
   'fixed_dose',1000,2000,'mg','times_per_day',null,null,1,
   null,null,2000,2000,'Adults and children >12 years with body weight >=50 kg.','Normalized from source §4.2.'),

  ('SRC-CEFTRI-ADULT-HAP',1,1,null,null,null,null,50,null,
   'fixed_dose',2000,2000,'mg','times_per_day',null,null,1,
   null,null,2000,2000,'Adults and children >12 years with body weight >=50 kg.','Normalized from source §4.2.'),

  ('SRC-CEFTRI-ADULT-SSTI-BONE-JOINT',1,1,null,null,null,null,50,null,
   'fixed_dose',2000,2000,'mg','times_per_day',null,null,1,
   null,null,2000,2000,'Adults and children >12 years with body weight >=50 kg.','Normalized from source §4.2.'),

  ('SRC-CEFTRI-ADULT-MENINGITIS-ENDOCARDITIS-NEUTROPENIC',1,1,null,null,null,null,50,null,
   'fixed_dose',2000,4000,'mg','times_per_day',null,null,1,
   null,null,4000,4000,'Dose range is source-indication dependent; doses above 2 g/day may be divided every 12 hours.','Clinical selection remains review-only.'),

  ('SRC-CEFTRI-ADULT-GONORRHOEA',1,1,null,null,null,null,50,null,
   'fixed_dose',500,500,'mg','single',null,null,null,
   1,1,500,500,'Single intramuscular dose.','Normalized from source §4.2.'),

  ('SRC-CEFTRI-ADULT-SURGICAL-PROPHYLAXIS',1,1,null,null,null,null,50,null,
   'fixed_dose',2000,2000,'mg','single',null,null,null,
   1,1,2000,2000,'Single pre-operative dose.','Normalized from source §4.2.'),

  ('SRC-CEFTRI-ADULT-LYME',1,1,null,null,null,null,50,null,
   'fixed_dose',2000,2000,'mg','times_per_day',null,null,1,
   14,21,2000,2000,'Disseminated Lyme borreliosis.','Normalized from source §4.2.'),

  ('SRC-CEFTRI-PED-CAP-HAP-IAI-CUTI',1,1,15,null,null,143.999,null,49.999,
   'dose_per_kg_per_day',50,80,'mg','times_per_day',null,null,1,
   null,null,null,4000,'Children 15 days to 12 years with body weight <50 kg.','Max daily dose staged conservatively at source paediatric ceiling.'),

  ('SRC-CEFTRI-PED-SSTI-BONE-NEUTROPENIC',1,1,15,null,null,143.999,null,49.999,
   'dose_per_kg_per_day',50,100,'mg','times_per_day',null,null,1,
   null,null,null,4000,'Children 15 days to 12 years with body weight <50 kg.','Normalized from source §4.2; 4 g max.'),

  ('SRC-CEFTRI-PED-MENINGITIS',1,1,15,null,null,143.999,null,49.999,
   'dose_per_kg_per_day',80,100,'mg','times_per_day',null,null,1,
   null,null,null,4000,'Children 15 days to 12 years with body weight <50 kg.','Normalized from source §4.2; 4 g max.'),

  ('SRC-CEFTRI-PED-ENDOCARDITIS',1,1,15,null,null,143.999,null,49.999,
   'dose_per_kg_per_day',100,100,'mg','times_per_day',null,null,1,
   null,null,null,4000,'Children 15 days to 12 years with body weight <50 kg.','Normalized from source §4.2; 4 g max.'),

  ('SRC-CEFTRI-PED-OTITIS',1,1,15,null,null,143.999,null,49.999,
   'dose_per_kg_per_dose',50,50,'mg','single',null,null,null,
   1,1,null,4000,'Single IM dose for acute otitis media.','Selected severe/failed cases require separate clinical branch review.'),

  ('SRC-CEFTRI-PED-OTITIS',2,1,15,null,null,143.999,null,49.999,
   'dose_per_kg_per_day',50,50,'mg','times_per_day',null,null,1,
   3,3,null,4000,'Selected severe/failed cases: daily for 3 days.','Conditional branch; review required.'),

  ('SRC-CEFTRI-PED-SURGICAL-PROPHYLAXIS',1,1,15,null,null,143.999,null,49.999,
   'dose_per_kg_per_dose',50,80,'mg','single',null,null,null,
   1,1,null,4000,'Single pre-operative paediatric dose.','Normalized from source §4.2.'),

  ('SRC-CEFTRI-PED-SYPHILIS',1,1,15,null,null,143.999,null,49.999,
   'dose_per_kg_per_day',75,100,'mg','times_per_day',null,null,1,
   10,14,null,4000,'Paediatric syphilis.','Normalized from source §4.2; 4 g max.'),

  ('SRC-CEFTRI-PED-LYME',1,1,15,null,null,143.999,null,49.999,
   'dose_per_kg_per_day',50,80,'mg','times_per_day',null,null,1,
   14,21,null,4000,'Paediatric disseminated Lyme borreliosis.','Normalized from source §4.2.'),

  ('SRC-CEFTRI-NEONATE-GENERAL',1,1,0,14,null,null,null,null,
   'dose_per_kg_per_day',20,50,'mg','times_per_day',null,null,1,
   null,null,null,null,'Term neonates 0-14 days for listed infections excluding meningitis/endocarditis.','Source max daily dose is 50 mg/kg.'),

  ('SRC-CEFTRI-NEONATE-MENINGITIS-ENDOCARDITIS',1,1,0,14,null,null,null,null,
   'dose_per_kg_per_day',50,50,'mg','times_per_day',null,null,1,
   null,null,null,null,'Term neonates 0-14 days with meningitis/endocarditis.','Source max daily dose is 50 mg/kg.')
on conflict (regimen_key,branch_no,step_no) do nothing;

-- Source-backed renal candidate for preterminal renal failure.
with src as (
  select s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id and sec.section_code='4.2' and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-102127-SMPC'
  order by s.created_at desc limit 1
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='ceftriaxone'
)
insert into drx_dose.source_adjustment_candidates_v1(
  adjustment_key,regimen_key,substance_concept_id,adjustment_domain,measure_type,
  min_value,max_value,min_inclusive,max_inclusive,action_type,max_daily_dose_mg,
  condition_text,source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
select
  'SRC-ADJ-CEFTRI-CRCL-BELOW-10-MAX2G',
  null,sub.concept_id,'RENAL','CrCl_mL_min',
  null,10,true,false,'MAX_DAILY_CAP',2000,
  'In preterminal renal failure with CrCl below 10 mL/min, the source limits the daily dose to 2 g; usual reduction is otherwise generally not required when hepatic function is not impaired.',
  src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
from sub cross join src
on conflict (adjustment_key) do nothing;

-- Neonatal source restriction from the same evidence.
with src as (
  select s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id and sec.section_code='4.2' and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-102127-SMPC'
  order by s.created_at desc limit 1
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='ceftriaxone'
)
insert into drx_dose.source_restriction_candidates_v1(
  restriction_key,substance_concept_id,patient_group,restriction_type,machine_action,
  restriction_text,source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
select
  'SRC-REST-CEFTRI-PREMATURE-NEONATE-PMA41',
  sub.concept_id,'pediatric_only','CONTRAINDICATED','BLOCK',
  'Premature neonates up to a postmenstrual age of 41 weeks are contraindicated according to the captured SmPC.',
  src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
from sub cross join src
on conflict (restriction_key) do nothing;

select public.drx_phase11_refresh_source_indications_v1();

revoke all on function public.drx_phase11_refresh_source_indications_v1() from public,anon,authenticated;
grant execute on function public.drx_phase11_refresh_source_indications_v1() to service_role;
