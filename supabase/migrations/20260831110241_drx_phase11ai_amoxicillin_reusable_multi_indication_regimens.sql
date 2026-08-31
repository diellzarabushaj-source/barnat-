
-- DRx Phase 11AI: multi-indication reusable regimen families + amoxicillin rules.
-- One reviewed regimen can link to several indications when the SmPC explicitly
-- uses the same dose pattern, avoiding duplicate clinical rule rows.

create table if not exists drx_dose.source_regimen_indication_links_v1 (
  regimen_key text not null
    references drx_dose.source_regimen_candidates_v1(regimen_key) on delete cascade,
  indication_key_candidate text not null,
  indication_label text not null,
  indication_id uuid
    references public.dose_indication_concepts_v3(indication_id) on delete restrict,
  link_status text not null default 'PENDING'
    check (link_status in ('PENDING','IN_REVIEW','VERIFIED','REJECTED')),
  reviewed_by text,
  reviewed_at timestamptz,
  auto_publish_allowed boolean not null default false check (auto_publish_allowed=false),
  created_at timestamptz not null default now(),
  primary key (regimen_key,indication_key_candidate),
  check (
    link_status<>'VERIFIED'
    or (nullif(btrim(reviewed_by),'') is not null and reviewed_at is not null)
  )
);

create index if not exists source_regimen_indication_links_v1_indication_idx
  on drx_dose.source_regimen_indication_links_v1(indication_id,link_status);

create or replace function public.drx_phase11_refresh_regimen_indication_links_v1()
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
    x.indication_key_candidate,
    x.indication_label,
    '{}'::text[],
    'unverified',
    'draft'
  from (
    select distinct on (indication_key_candidate)
      indication_key_candidate,indication_label
    from drx_dose.source_regimen_indication_links_v1
    order by indication_key_candidate,created_at
  ) x
  where not exists (
    select 1 from public.dose_indication_concepts_v3 i
    where i.indication_key=x.indication_key_candidate
  );
  get diagnostics v_concepts=row_count;

  insert into public.dose_indication_terms_v3(
    term_key,indication_id,term,language,term_type,source_snapshot_id,verified_at
  )
  select
    'TERM-SRCLINK-'||md5(x.indication_key_candidate),
    i.indication_id,
    x.indication_label,
    'en',
    'canonical',
    r.source_snapshot_id,
    null
  from (
    select distinct on (indication_key_candidate)
      regimen_key,indication_key_candidate,indication_label
    from drx_dose.source_regimen_indication_links_v1
    order by indication_key_candidate,created_at
  ) x
  join drx_dose.source_regimen_candidates_v1 r on r.regimen_key=x.regimen_key
  join public.dose_indication_concepts_v3 i on i.indication_key=x.indication_key_candidate
  on conflict (term_key) do nothing;
  get diagnostics v_terms=row_count;

  update drx_dose.source_regimen_indication_links_v1 l
  set indication_id=i.indication_id
  from public.dose_indication_concepts_v3 i
  where i.indication_key=l.indication_key_candidate
    and l.indication_id is distinct from i.indication_id;
  get diagnostics v_links=row_count;

  return jsonb_build_object(
    'newDraftConcepts',v_concepts,
    'newDraftTerms',v_terms,
    'linksResolved',v_links,
    'totalLinks',(select count(*) from drx_dose.source_regimen_indication_links_v1),
    'verifiedLinks',(select count(*) from drx_dose.source_regimen_indication_links_v1 where link_status='VERIFIED'),
    'autoPublished',false
  );
end;
$$;

with src as (
  select s.source_key,s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key in ('EMC-PRODUCT-13501-SMPC','EMC-PRODUCT-10891-SMPC')
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='amoxicillin'
)
insert into drx_dose.source_regimen_candidates_v1(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status,
  target_kind,strength_match_mode
)
select * from (
  select
    'SRC-AMOX-ADULT-GROUP-A-Q8Q12'::text,sub.concept_id,
    'amoxicillin-acute-bacterial-sinusitis-adult',
    'Adult shared dose family: sinusitis / bacteriuria / pyelonephritis / dental abscess / cystitis',
    'adult_only','PO',null::text,'conditional',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-13501-SMPC'

  union all
  select
    'SRC-AMOX-ADULT-GROUP-B-AOM-ENT-BRONCHITIS',sub.concept_id,
    'amoxicillin-acute-otitis-media-adult',
    'Adult shared dose family: otitis / streptococcal tonsillitis-pharyngitis / bronchitis exacerbation',
    'adult_only','PO',null::text,'conditional',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-13501-SMPC'

  union all
  select
    'SRC-AMOX-ADULT-CAP',sub.concept_id,
    'amoxicillin-community-acquired-pneumonia-adult',
    'Adult community-acquired pneumonia',
    'adult_only','PO',null::text,'single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-13501-SMPC'

  union all
  select
    'SRC-AMOX-ADULT-TYPHOID-PARATYPHOID',sub.concept_id,
    'amoxicillin-typhoid-paratyphoid-adult',
    'Adult typhoid and paratyphoid fever',
    'adult_only','PO',null::text,'single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-13501-SMPC'

  union all
  select
    'SRC-AMOX-ADULT-PROSTHETIC-JOINT',sub.concept_id,
    'amoxicillin-prosthetic-joint-infection-adult',
    'Adult prosthetic joint infection',
    'adult_only','PO',null::text,'single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-13501-SMPC'

  union all
  select
    'SRC-AMOX-ENDOCARDITIS-PROPHYLAXIS-40KGPLUS',sub.concept_id,
    'amoxicillin-endocarditis-prophylaxis-40kgplus',
    'Endocarditis prophylaxis in adults/children >=40 kg',
    'pediatric_and_adult','PO',null::text,'single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-13501-SMPC'

  union all
  select
    'SRC-AMOX-H-PYLORI-40KGPLUS',sub.concept_id,
    'amoxicillin-h-pylori-eradication-40kgplus',
    'H. pylori eradication combination therapy in >=40 kg',
    'pediatric_and_adult','PO',null::text,'single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-13501-SMPC'

  union all
  select
    'SRC-AMOX-LYME-EARLY-40KGPLUS',sub.concept_id,
    'amoxicillin-lyme-early-40kgplus',
    'Early Lyme disease in >=40 kg',
    'pediatric_and_adult','PO',null::text,'single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-13501-SMPC'

  union all
  select
    'SRC-AMOX-LYME-LATE-40KGPLUS',sub.concept_id,
    'amoxicillin-lyme-late-systemic-40kgplus',
    'Late/systemic Lyme disease in >=40 kg',
    'pediatric_and_adult','PO',null::text,'single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-13501-SMPC'

  union all
  select
    'SRC-AMOX-PED-GROUP-A-20TO90MGKGDAY',sub.concept_id,
    'amoxicillin-acute-bacterial-sinusitis-pediatric-under40kg',
    'Paediatric <40 kg shared dose family: sinusitis / otitis / CAP / cystitis / pyelonephritis / dental abscess',
    'pediatric_only','PO',null::text,'conditional',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-10891-SMPC'

  union all
  select
    'SRC-AMOX-PED-TONSILLITIS-40TO90MGKGDAY',sub.concept_id,
    'amoxicillin-tonsillitis-pharyngitis-pediatric-under40kg',
    'Paediatric <40 kg acute streptococcal tonsillitis/pharyngitis',
    'pediatric_only','PO',null::text,'single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-10891-SMPC'

  union all
  select
    'SRC-AMOX-PED-TYPHOID-100MGKGDAY',sub.concept_id,
    'amoxicillin-typhoid-paratyphoid-pediatric-under40kg',
    'Paediatric <40 kg typhoid/paratyphoid fever',
    'pediatric_only','PO',null::text,'single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-10891-SMPC'

  union all
  select
    'SRC-AMOX-PED-ENDOCARDITIS-PROPHYLAXIS',sub.concept_id,
    'amoxicillin-endocarditis-prophylaxis-pediatric-under40kg',
    'Paediatric <40 kg endocarditis prophylaxis',
    'pediatric_only','PO',null::text,'single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-10891-SMPC'

  union all
  select
    'SRC-AMOX-PED-LYME-EARLY',sub.concept_id,
    'amoxicillin-lyme-early-pediatric-under40kg',
    'Paediatric <40 kg early Lyme disease',
    'pediatric_only','PO',null::text,'single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-10891-SMPC'

  union all
  select
    'SRC-AMOX-PED-LYME-LATE',sub.concept_id,
    'amoxicillin-lyme-late-systemic-pediatric-under40kg',
    'Paediatric <40 kg late/systemic Lyme disease',
    'pediatric_only','PO',null::text,'single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-10891-SMPC'
) x(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status,
  target_kind,strength_match_mode
)
on conflict (regimen_key) do nothing;

insert into drx_dose.source_regimen_steps_v1(
  regimen_key,branch_no,step_no,min_weight_kg,max_weight_kg,
  calculation_method,dose_min_value,dose_max_value,dose_unit,
  frequency_mode,interval_min_hours,interval_max_hours,times_per_day,
  duration_min_days,duration_max_days,max_single_dose_mg,max_daily_dose_mg,
  condition_text,source_note
) values
  -- Adult shared group A.
  ('SRC-AMOX-ADULT-GROUP-A-Q8Q12',1,1,40,null,'fixed_dose',250,500,'mg','interval',8,8,null,null,null,500,null,
   'Standard q8h option.','Shared source dose family.'),
  ('SRC-AMOX-ADULT-GROUP-A-Q8Q12',2,1,40,null,'fixed_dose',750,1000,'mg','interval',12,12,null,null,null,1000,null,
   'Standard q12h option.','Shared source dose family.'),
  ('SRC-AMOX-ADULT-GROUP-A-Q8Q12',3,1,40,null,'fixed_dose',750,1000,'mg','interval',8,8,null,null,null,1000,null,
   'Severe infection option.','Clinical severity selection required.'),

  -- Adult shared group B.
  ('SRC-AMOX-ADULT-GROUP-B-AOM-ENT-BRONCHITIS',1,1,40,null,'fixed_dose',500,500,'mg','interval',8,8,null,null,null,500,null,
   'Standard q8h option.','Shared source dose family.'),
  ('SRC-AMOX-ADULT-GROUP-B-AOM-ENT-BRONCHITIS',2,1,40,null,'fixed_dose',750,1000,'mg','interval',12,12,null,null,null,1000,null,
   'Standard q12h option.','Shared source dose family.'),
  ('SRC-AMOX-ADULT-GROUP-B-AOM-ENT-BRONCHITIS',3,1,40,null,'fixed_dose',750,1000,'mg','interval',8,8,null,10,10,1000,null,
   'Severe infection option.','Source specifies 10 days for severe infection.'),

  ('SRC-AMOX-ADULT-CAP',1,1,40,null,'fixed_dose',500,1000,'mg','interval',8,8,null,null,null,1000,null,
   'Community-acquired pneumonia.','Source dose family.'),
  ('SRC-AMOX-ADULT-TYPHOID-PARATYPHOID',1,1,40,null,'fixed_dose',500,2000,'mg','interval',8,8,null,null,null,2000,null,
   'Typhoid/paratyphoid fever.','Source dose family.'),
  ('SRC-AMOX-ADULT-PROSTHETIC-JOINT',1,1,40,null,'fixed_dose',500,1000,'mg','interval',8,8,null,null,null,1000,null,
   'Prosthetic joint infection.','Source dose family.'),

  ('SRC-AMOX-ENDOCARDITIS-PROPHYLAXIS-40KGPLUS',1,1,40,null,'fixed_dose',2000,2000,'mg','single',null,null,null,1,1,2000,2000,
   'Give 30-60 minutes before procedure.','Single oral prophylaxis dose.'),

  ('SRC-AMOX-H-PYLORI-40KGPLUS',1,1,40,null,'fixed_dose',750,1000,'mg','times_per_day',null,null,2,7,7,1000,2000,
   'Use with PPI and another antibiotic.','Combination therapy; full regimen requires clinical selection.'),

  ('SRC-AMOX-LYME-EARLY-40KGPLUS',1,1,40,null,'fixed_dose',500,1000,'mg','interval',8,8,null,10,21,1000,4000,
   'Early Lyme disease.','Source usual duration 14 days within 10-21 day range; max 4 g/day.'),
  ('SRC-AMOX-LYME-LATE-40KGPLUS',1,1,40,null,'fixed_dose',500,2000,'mg','interval',8,8,null,10,30,2000,6000,
   'Late/systemic Lyme disease.','Source max 6 g/day.'),

  -- Paediatric <40 kg.
  ('SRC-AMOX-PED-GROUP-A-20TO90MGKGDAY',1,1,null,39.999,'dose_per_kg_per_day',20,90,'mg','manual',null,null,null,null,null,null,null,
   'Children <40 kg; divided doses.','Twice-daily dosing only when the dose is in the upper range; frequency remains review-gated.'),
  ('SRC-AMOX-PED-TONSILLITIS-40TO90MGKGDAY',1,1,null,39.999,'dose_per_kg_per_day',40,90,'mg','manual',null,null,null,null,null,null,null,
   'Children <40 kg; divided doses.','Frequency remains review-gated.'),
  ('SRC-AMOX-PED-TYPHOID-100MGKGDAY',1,1,null,39.999,'dose_per_kg_per_day',100,100,'mg','times_per_day',null,null,3,null,null,null,null,
   'Children <40 kg.','100 mg/kg/day in 3 divided doses.'),
  ('SRC-AMOX-PED-ENDOCARDITIS-PROPHYLAXIS',1,1,null,39.999,'dose_per_kg_per_dose',50,50,'mg','single',null,null,null,1,1,null,null,
   'Children <40 kg; give 30-60 minutes before procedure.','Single prophylaxis dose.'),
  ('SRC-AMOX-PED-LYME-EARLY',1,1,null,39.999,'dose_per_kg_per_day',25,50,'mg','times_per_day',null,null,3,10,21,null,null,
   'Children <40 kg.','Early Lyme disease; 3 divided doses.'),
  ('SRC-AMOX-PED-LYME-LATE',1,1,null,39.999,'dose_per_kg_per_day',100,100,'mg','times_per_day',null,null,3,10,30,null,null,
   'Children <40 kg.','Late/systemic Lyme disease; 3 divided doses.')
on conflict (regimen_key,branch_no,step_no) do nothing;

-- Multi-indication links for shared dose families.
insert into drx_dose.source_regimen_indication_links_v1(
  regimen_key,indication_key_candidate,indication_label
) values
  ('SRC-AMOX-ADULT-GROUP-A-Q8Q12','amoxicillin-acute-bacterial-sinusitis-adult','Adult acute bacterial sinusitis'),
  ('SRC-AMOX-ADULT-GROUP-A-Q8Q12','amoxicillin-asymptomatic-bacteriuria-pregnancy-adult','Asymptomatic bacteriuria in pregnancy'),
  ('SRC-AMOX-ADULT-GROUP-A-Q8Q12','amoxicillin-acute-pyelonephritis-adult','Adult acute pyelonephritis'),
  ('SRC-AMOX-ADULT-GROUP-A-Q8Q12','amoxicillin-dental-abscess-cellulitis-adult','Adult dental abscess with spreading cellulitis'),
  ('SRC-AMOX-ADULT-GROUP-A-Q8Q12','amoxicillin-acute-cystitis-adult','Adult acute cystitis'),

  ('SRC-AMOX-ADULT-GROUP-B-AOM-ENT-BRONCHITIS','amoxicillin-acute-otitis-media-adult','Adult acute otitis media'),
  ('SRC-AMOX-ADULT-GROUP-B-AOM-ENT-BRONCHITIS','amoxicillin-streptococcal-tonsillitis-pharyngitis-adult','Adult acute streptococcal tonsillitis/pharyngitis'),
  ('SRC-AMOX-ADULT-GROUP-B-AOM-ENT-BRONCHITIS','amoxicillin-chronic-bronchitis-exacerbation-adult','Adult acute exacerbation of chronic bronchitis'),

  ('SRC-AMOX-PED-GROUP-A-20TO90MGKGDAY','amoxicillin-acute-bacterial-sinusitis-pediatric-under40kg','Paediatric <40 kg acute bacterial sinusitis'),
  ('SRC-AMOX-PED-GROUP-A-20TO90MGKGDAY','amoxicillin-acute-otitis-media-pediatric-under40kg','Paediatric <40 kg acute otitis media'),
  ('SRC-AMOX-PED-GROUP-A-20TO90MGKGDAY','amoxicillin-community-acquired-pneumonia-pediatric-under40kg','Paediatric <40 kg community-acquired pneumonia'),
  ('SRC-AMOX-PED-GROUP-A-20TO90MGKGDAY','amoxicillin-acute-cystitis-pediatric-under40kg','Paediatric <40 kg acute cystitis'),
  ('SRC-AMOX-PED-GROUP-A-20TO90MGKGDAY','amoxicillin-acute-pyelonephritis-pediatric-under40kg','Paediatric <40 kg acute pyelonephritis'),
  ('SRC-AMOX-PED-GROUP-A-20TO90MGKGDAY','amoxicillin-dental-abscess-cellulitis-pediatric-under40kg','Paediatric <40 kg dental abscess with spreading cellulitis')
on conflict do nothing;

-- Attach both product SmPCs as supporting evidence to every amoxicillin regimen.
insert into drx_dose.source_regimen_supporting_evidence_v1(
  regimen_key,source_snapshot_id,source_section_sha256,source_url,evidence_role
)
select
  r.regimen_key,s.snapshot_id,sec.section_sha256,s.source_url,
  case
    when r.patient_group='pediatric_only' and s.source_key='EMC-PRODUCT-10891-SMPC' then 'PRIMARY'
    when r.patient_group<>'pediatric_only' and s.source_key='EMC-PRODUCT-13501-SMPC' then 'PRIMARY'
    else 'CONCORDANT'
  end
from drx_dose.source_regimen_candidates_v1 r
join public.dose_source_snapshots_v3 s
  on s.source_key in ('EMC-PRODUCT-13501-SMPC','EMC-PRODUCT-10891-SMPC')
join public.dose_source_sections_v3 sec
  on sec.snapshot_id=s.snapshot_id
 and sec.section_code='4.2'
 and sec.extraction_status='extracted'
where r.regimen_key like 'SRC-AMOX-%'
on conflict do nothing;

insert into drx_dose.source_candidate_applicability_v1(
  candidate_type,candidate_key,scope_type,route_key,form_family,
  source_product_label,product_binding_policy
)
select
  'REGIMEN',r.regimen_key,'ROUTE_FORM_REVIEW','PO',null,
  'Concordant emc amoxicillin 500 mg capsule + 250 mg/5 mL suspension SmPCs',
  'COMPATIBLE_PRODUCT_REVIEW'
from drx_dose.source_regimen_candidates_v1 r
where r.regimen_key like 'SRC-AMOX-%'
on conflict (candidate_type,candidate_key) do nothing;

-- Adult renal adjustment candidates from §4.2.
with src as (
  select s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-13501-SMPC'
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='amoxicillin'
)
insert into drx_dose.source_adjustment_candidates_v1(
  adjustment_key,regimen_key,substance_concept_id,adjustment_domain,measure_type,
  min_value,max_value,min_inclusive,max_inclusive,action_type,
  replacement_dose_min,replacement_dose_max,replacement_frequency_mode,
  replacement_times_per_day,max_daily_dose_mg,condition_text,
  source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
select * from (
  select
    'SRC-ADJ-AMOX-GFR-GT30-NOCHANGE'::text,null::text,sub.concept_id,
    'RENAL','GFR_mL_min',30::numeric,null::numeric,false,true,'NO_CHANGE',
    null::numeric,null::numeric,null::text,null::numeric,null::numeric,
    'GFR >30 mL/min: no adjustment necessary.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub cross join src

  union all
  select
    'SRC-ADJ-AMOX-ADULT-GFR10TO30-MAX500BID',null,sub.concept_id,
    'RENAL','GFR_mL_min',10,30,true,true,'REPLACE_DOSE',
    500,500,'times_per_day',2,1000,
    'Adults/children >=40 kg with GFR 10-30 mL/min: maximum 500 mg twice daily.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub cross join src

  union all
  select
    'SRC-ADJ-AMOX-ADULT-GFRLT10-MAX500QD',null,sub.concept_id,
    'RENAL','GFR_mL_min',null,10,true,false,'REPLACE_DOSE',
    500,500,'times_per_day',1,500,
    'Adults/children >=40 kg with GFR <10 mL/min: maximum 500 mg/day.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub cross join src

  union all
  select
    'SRC-ADJ-AMOX-PED-GFR10TO30-MANUAL',null,sub.concept_id,
    'RENAL','GFR_mL_min',10,30,true,true,'MANUAL_REVIEW',
    null,null,null,null,null,
    'Children <40 kg with GFR 10-30 mL/min: 15 mg/kg twice daily, maximum 500 mg twice daily.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub cross join src

  union all
  select
    'SRC-ADJ-AMOX-PED-GFRLT10-MANUAL',null,sub.concept_id,
    'RENAL','GFR_mL_min',null,10,true,false,'MANUAL_REVIEW',
    null,null,null,null,null,
    'Children <40 kg with GFR <10 mL/min: 15 mg/kg once daily, maximum 500 mg.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub cross join src
) x(
  adjustment_key,regimen_key,substance_concept_id,adjustment_domain,measure_type,
  min_value,max_value,min_inclusive,max_inclusive,action_type,
  replacement_dose_min,replacement_dose_max,replacement_frequency_mode,
  replacement_times_per_day,max_daily_dose_mg,condition_text,
  source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
on conflict (adjustment_key) do nothing;

insert into drx_dose.source_candidate_applicability_v1(
  candidate_type,candidate_key,scope_type,route_key,form_family,
  source_product_label,product_binding_policy
)
select
  'ADJUSTMENT',a.adjustment_key,'SUBSTANCE_WIDE_REVIEW','PO',null,
  'Concordant amoxicillin emc SmPC renal table','REVIEW_REQUIRED'
from drx_dose.source_adjustment_candidates_v1 a
where a.adjustment_key like 'SRC-ADJ-AMOX-%'
on conflict (candidate_type,candidate_key) do nothing;

select public.drx_phase11_refresh_source_indications_v1();
select public.drx_phase11_refresh_regimen_indication_links_v1();

alter table drx_dose.source_regimen_indication_links_v1 enable row level security;
revoke all on drx_dose.source_regimen_indication_links_v1 from public,anon,authenticated;
grant select,insert,update,delete on drx_dose.source_regimen_indication_links_v1 to service_role;

revoke all on function public.drx_phase11_refresh_regimen_indication_links_v1() from public,anon,authenticated;
grant execute on function public.drx_phase11_refresh_regimen_indication_links_v1() to service_role;
