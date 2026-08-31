
-- DRx Phase 11AE: product-scope applicability + ibuprofen source regimens.
-- A source-backed dose/restriction may be presentation-specific. No product
-- inherits a rule/restriction automatically from this staging layer.

create table if not exists drx_dose.source_candidate_applicability_v1 (
  candidate_type text not null
    check (candidate_type in ('REGIMEN','RESTRICTION','ADJUSTMENT')),
  candidate_key text not null,
  scope_type text not null
    check (scope_type in (
      'SUBSTANCE_WIDE_REVIEW',
      'ROUTE_FORM_REVIEW',
      'EXACT_PRESENTATION',
      'SOURCE_PRODUCT_ONLY'
    )),
  route_key text,
  form_family text,
  source_strength_value numeric,
  source_strength_unit text,
  release_key text,
  requires_scored boolean not null default false,
  minimum_split_denominator integer,
  source_product_label text,
  product_binding_policy text not null
    check (product_binding_policy in (
      'REVIEW_REQUIRED',
      'COMPATIBLE_PRODUCT_REVIEW',
      'EXACT_PRESENTATION_ONLY'
    )),
  auto_bind_allowed boolean not null default false check (auto_bind_allowed=false),
  created_at timestamptz not null default now(),
  primary key (candidate_type,candidate_key),
  check (
    not requires_scored
    or (minimum_split_denominator is not null and minimum_split_denominator >= 2)
  ),
  check (
    source_strength_value is null
    or nullif(btrim(source_strength_unit),'') is not null
  )
);

create index if not exists source_candidate_applicability_v1_scope_idx
  on drx_dose.source_candidate_applicability_v1(scope_type,product_binding_policy);

with src as (
  select s.source_key,s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key in (
    'EMC-PRODUCT-7020-SMPC',
    'EMC-PRODUCT-10952-SMPC',
    'EMC-PRODUCT-101385-SMPC'
  )
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='ibuprofen'
)
insert into drx_dose.source_regimen_candidates_v1(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status,
  target_kind,strength_match_mode
)
select * from (
  select
    'SRC-IBU-400P-PF-12PLUS'::text,sub.concept_id,
    'ibuprofen-mild-moderate-pain-fever-12plus',
    'Mild to moderate pain and fever in adults/adolescents >=12 years and >=40 kg',
    'pediatric_and_adult','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-10952-SMPC'

  union all
  select
    'SRC-IBU-400P-MIGRAINE-12PLUS',sub.concept_id,
    'ibuprofen-migraine-12plus',
    'Migraine headache in adults/adolescents >=12 years and >=40 kg',
    'pediatric_and_adult','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-10952-SMPC'

  union all
  select
    'SRC-IBU-400P-DYSMENORRHOEA-12PLUS',sub.concept_id,
    'ibuprofen-primary-dysmenorrhoea-12plus',
    'Primary dysmenorrhoea in adults/adolescents >=12 years and >=40 kg',
    'pediatric_and_adult','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-10952-SMPC'

  union all
  select
    'SRC-IBU-400POM-PF-20TO29KG',sub.concept_id,
    'ibuprofen-pain-fever-child-20-29kg',
    'Mild to moderate pain and fever in children 20-29 kg (source age 6-9 years)',
    'pediatric_only','PO','oral_solid','weight_band',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-7020-SMPC'

  union all
  select
    'SRC-IBU-400POM-PF-30TO90KG-AGE10TO11',sub.concept_id,
    'ibuprofen-pain-fever-child-30-90kg-age10-11',
    'Mild to moderate pain and fever in children 30-90 kg (source age 10-11 years)',
    'pediatric_only','PO','oral_solid','weight_band',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-7020-SMPC'

  union all
  select
    'SRC-IBU-POM-RHEUMATIC-ADULT-STANDARD',sub.concept_id,
    'ibuprofen-rheumatic-disease-adult-standard',
    'Rheumatic disease in adults — source daily-dose range',
    'adult_only','PO','oral_solid','conditional',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-7020-SMPC'

  union all
  select
    'SRC-IBU-POM-RHEUMATIC-ADOLESCENT-15TO17',sub.concept_id,
    'ibuprofen-rheumatic-disease-adolescent-15-17',
    'Rheumatic disease in adolescents 15-17 years — weight-based daily dose',
    'pediatric_only','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-7020-SMPC'

  union all
  select
    'SRC-IBU-200GSL-PAIN-FEVER-12PLUS',sub.concept_id,
    'ibuprofen-otc-pain-fever-12plus',
    'OTC pain/fever symptom relief in adults and adolescents >=12 years',
    'pediatric_and_adult','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','MANUAL_REVIEW'
  from sub join src on src.source_key='EMC-PRODUCT-101385-SMPC'
) x(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status,
  target_kind,strength_match_mode
)
on conflict (regimen_key) do nothing;

insert into drx_dose.source_regimen_steps_v1(
  regimen_key,branch_no,step_no,min_age_months,max_age_months,min_weight_kg,max_weight_kg,
  calculation_method,dose_min_value,dose_max_value,dose_unit,
  frequency_mode,interval_min_hours,interval_max_hours,times_per_day,
  max_single_dose_mg,max_daily_dose_mg,condition_text,source_note
) values
  ('SRC-IBU-400P-PF-12PLUS',1,1,144,null,40,null,
   'fixed_dose',200,400,'mg','interval',6,6,null,400,1200,
   'Adults/adolescents >=12 years and >=40 kg; use as required.',
   'Source product 10952; product/presentation inheritance requires review.'),

  ('SRC-IBU-400P-MIGRAINE-12PLUS',1,1,144,null,40,null,
   'fixed_dose',400,400,'mg','interval',6,6,null,400,1200,
   'Migraine; repeat only as required with 6-hour interval.',
   'Source product 10952; product/presentation inheritance requires review.'),

  ('SRC-IBU-400P-DYSMENORRHOEA-12PLUS',1,1,144,null,40,null,
   'fixed_dose',200,400,'mg','interval',6,6,null,400,1200,
   'Primary dysmenorrhoea in >=12 years and >=40 kg.',
   'Source states 1-3 times daily and 6-hour intervals; interval + daily cap retained conservatively.'),

  ('SRC-IBU-400POM-PF-20TO29KG',1,1,72,119.999,20,29.999,
   'fixed_dose',200,200,'mg','interval',6,6,null,200,600,
   'Source age 6-9 years and weight 20-29 kg.',
   'Source product 7020 is a scored 400 mg POM tablet; 200 mg delivery requires presentation compatibility review.'),

  ('SRC-IBU-400POM-PF-30TO90KG-AGE10TO11',1,1,120,143.999,30,90,
   'fixed_dose',200,200,'mg','interval',6,6,null,200,800,
   'Source states age 10-11 years and weight 30-90 kg.',
   'Literal source weight band retained; review required before promotion.'),

  ('SRC-IBU-POM-RHEUMATIC-ADULT-STANDARD',1,1,216,null,null,null,
   'manual_only',null,null,null,'manual',null,null,null,null,2400,
   'Adults: recommended 1200-1800 mg/day divided; maintenance 600-1200 mg/day; acute/severe conditions may temporarily reach 2400 mg/day in 3-4 divided doses.',
   'Complex variable daily-total/divided-dose regimen intentionally remains manual-only.'),

  ('SRC-IBU-POM-RHEUMATIC-ADOLESCENT-15TO17',1,1,180,215.999,null,null,
   'dose_per_kg_per_day',20,40,'mg','manual',null,null,null,null,2400,
   'Adolescents 15-17 years.',
   '20-40 mg/kg/day, maximum 2400 mg/day, divided into 3-4 doses; division schedule remains manual-review.'),

  ('SRC-IBU-200GSL-PAIN-FEVER-12PLUS',1,1,144,null,null,null,
   'fixed_dose',200,400,'mg','interval',4,null,null,400,1200,
   'Adults, elderly and children over 12 years; short-term use.',
   'Source 101385: 200-400 mg up to three times daily, >=4-hour interval, max 1200 mg/day.')
on conflict (regimen_key,branch_no,step_no) do nothing;

insert into drx_dose.source_candidate_applicability_v1(
  candidate_type,candidate_key,scope_type,route_key,form_family,
  source_strength_value,source_strength_unit,requires_scored,minimum_split_denominator,
  source_product_label,product_binding_policy
) values
  ('REGIMEN','SRC-IBU-400P-PF-12PLUS','EXACT_PRESENTATION','PO','oral_solid',400,'mg',false,null,
   'emc 10952 Ibuprofen 400 mg film-coated tablet','COMPATIBLE_PRODUCT_REVIEW'),
  ('REGIMEN','SRC-IBU-400P-MIGRAINE-12PLUS','EXACT_PRESENTATION','PO','oral_solid',400,'mg',false,null,
   'emc 10952 Ibuprofen 400 mg film-coated tablet','COMPATIBLE_PRODUCT_REVIEW'),
  ('REGIMEN','SRC-IBU-400P-DYSMENORRHOEA-12PLUS','EXACT_PRESENTATION','PO','oral_solid',400,'mg',false,null,
   'emc 10952 Ibuprofen 400 mg film-coated tablet','COMPATIBLE_PRODUCT_REVIEW'),
  ('REGIMEN','SRC-IBU-400POM-PF-20TO29KG','EXACT_PRESENTATION','PO','oral_solid',400,'mg',true,2,
   'emc 7020 Ibuprofen 400 mg scored film-coated tablet (POM)','EXACT_PRESENTATION_ONLY'),
  ('REGIMEN','SRC-IBU-400POM-PF-30TO90KG-AGE10TO11','EXACT_PRESENTATION','PO','oral_solid',400,'mg',true,2,
   'emc 7020 Ibuprofen 400 mg scored film-coated tablet (POM)','EXACT_PRESENTATION_ONLY'),
  ('REGIMEN','SRC-IBU-POM-RHEUMATIC-ADULT-STANDARD','ROUTE_FORM_REVIEW','PO','oral_solid',400,'mg',false,null,
   'emc 7020 Ibuprofen 400 mg film-coated tablet (POM)','REVIEW_REQUIRED'),
  ('REGIMEN','SRC-IBU-POM-RHEUMATIC-ADOLESCENT-15TO17','ROUTE_FORM_REVIEW','PO','oral_solid',400,'mg',false,null,
   'emc 7020 Ibuprofen 400 mg film-coated tablet (POM)','REVIEW_REQUIRED'),
  ('REGIMEN','SRC-IBU-200GSL-PAIN-FEVER-12PLUS','EXACT_PRESENTATION','PO','oral_solid',200,'mg',false,null,
   'emc 101385 Ibuprofen 200 mg film-coated tablet (GSL)','COMPATIBLE_PRODUCT_REVIEW')
on conflict (candidate_type,candidate_key) do nothing;

with src as (
  select s.source_key,s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.3'
   and sec.extraction_status='extracted'
  where s.source_key in ('EMC-PRODUCT-7020-SMPC','EMC-PRODUCT-10952-SMPC','EMC-PRODUCT-101385-SMPC')
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='ibuprofen'
)
insert into drx_dose.source_restriction_candidates_v1(
  restriction_key,substance_concept_id,patient_group,restriction_type,machine_action,
  max_age_months,max_weight_kg,restriction_text,
  source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
select * from (
  select
    'SRC-REST-IBU-10952-BELOW-12'::text,sub.concept_id,'pediatric_only',
    'FORMULATION_RESTRICTION','BLOCK',143.999::numeric,null::numeric,
    'The emc 10952 400 mg Pharmacy presentation is contraindicated below 12 years; this must not be generalized to all ibuprofen products.',
    src.snapshot_id,'4.3',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub join src on src.source_key='EMC-PRODUCT-10952-SMPC'

  union all
  select
    'SRC-REST-IBU-101385-BELOW-12',sub.concept_id,'pediatric_only',
    'FORMULATION_RESTRICTION','BLOCK',143.999,null,
    'The emc 101385 200 mg GSL presentation is not suitable below 12 years; this is presentation-specific.',
    src.snapshot_id,'4.3',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub join src on src.source_key='EMC-PRODUCT-101385-SMPC'

  union all
  select
    'SRC-REST-IBU-7020-BELOW-6-OR-20KG',sub.concept_id,'pediatric_only',
    'FORMULATION_RESTRICTION','BLOCK',71.999,19.999,
    'The emc 7020 400 mg POM presentation is contraindicated below 20 kg body weight or younger than 6 years.',
    src.snapshot_id,'4.3',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub join src on src.source_key='EMC-PRODUCT-7020-SMPC'
) x(
  restriction_key,substance_concept_id,patient_group,restriction_type,machine_action,
  max_age_months,max_weight_kg,restriction_text,
  source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
on conflict (restriction_key) do nothing;

insert into drx_dose.source_candidate_applicability_v1(
  candidate_type,candidate_key,scope_type,route_key,form_family,
  source_strength_value,source_strength_unit,requires_scored,minimum_split_denominator,
  source_product_label,product_binding_policy
) values
  ('RESTRICTION','SRC-REST-IBU-10952-BELOW-12','SOURCE_PRODUCT_ONLY','PO','oral_solid',400,'mg',false,null,
   'emc 10952 Ibuprofen 400 mg Pharmacy presentation','EXACT_PRESENTATION_ONLY'),
  ('RESTRICTION','SRC-REST-IBU-101385-BELOW-12','SOURCE_PRODUCT_ONLY','PO','oral_solid',200,'mg',false,null,
   'emc 101385 Ibuprofen 200 mg GSL presentation','EXACT_PRESENTATION_ONLY'),
  ('RESTRICTION','SRC-REST-IBU-7020-BELOW-6-OR-20KG','SOURCE_PRODUCT_ONLY','PO','oral_solid',400,'mg',true,2,
   'emc 7020 Ibuprofen 400 mg POM scored presentation','EXACT_PRESENTATION_ONLY')
on conflict (candidate_type,candidate_key) do nothing;

select public.drx_phase11_refresh_source_indications_v1();

alter table drx_dose.source_candidate_applicability_v1 enable row level security;
revoke all on drx_dose.source_candidate_applicability_v1 from public,anon,authenticated;
grant select,insert,update,delete on drx_dose.source_candidate_applicability_v1 to service_role;
