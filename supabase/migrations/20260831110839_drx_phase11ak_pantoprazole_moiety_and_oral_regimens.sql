
-- DRx Phase 11AK: normalize pantoprazole salt to active moiety and stage
-- route/form/strength-scoped reusable regimens. No auto binding/publication.

with src as (
  select s.snapshot_id,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='2'
   and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-14644-SMPC'
  order by s.created_at desc limit 1
),
ids as (
  select
    (select concept_id from public.substance_concepts_v1 where canonical_key='pantoprazolesodiumsesquihydrate') source_id,
    (select concept_id from public.substance_concepts_v1 where canonical_key='pantoprazole') target_id
)
insert into drx_dose.component_moiety_map_v1(
  source_concept_id,dose_moiety_concept_id,mapping_kind,source_snapshot_id,
  source_section_code,source_section_sha256,mapping_status,verified_by,verified_at,note
)
select
  ids.source_id,ids.target_id,'ACTIVE_MOIETY',src.snapshot_id,
  '2',src.section_sha256,'VERIFIED','system:phase11ak-emc-14644-composition',now(),
  'SmPC states the labelled strength as pantoprazole, supplied as pantoprazole sodium sesquihydrate.'
from ids cross join src
where ids.source_id is not null and ids.target_id is not null
on conflict (source_concept_id) do nothing;

with src as (
  select s.source_key,s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key in ('EMC-PRODUCT-14643-SMPC','EMC-PRODUCT-14644-SMPC')
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='pantoprazole'
)
insert into drx_dose.source_regimen_candidates_v1(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status,
  target_kind,strength_match_mode
)
select * from (
  select
    'SRC-PANTO20-GERD-SYMPTOMATIC-12PLUS'::text,sub.concept_id,
    'pantoprazole-symptomatic-gerd-12plus',
    'Symptomatic gastro-oesophageal reflux disease in adults/adolescents >=12 years',
    'pediatric_and_adult','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','EXACT_COMPONENT_STRENGTH'
  from sub join src on src.source_key='EMC-PRODUCT-14643-SMPC'

  union all
  select
    'SRC-PANTO20-REFLUX-MAINTENANCE-12PLUS',sub.concept_id,
    'pantoprazole-reflux-oesophagitis-maintenance-12plus',
    'Long-term management and relapse prevention in reflux oesophagitis >=12 years',
    'pediatric_and_adult','PO','oral_solid','conditional',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','EXACT_COMPONENT_STRENGTH'
  from sub join src on src.source_key='EMC-PRODUCT-14643-SMPC'

  union all
  select
    'SRC-PANTO20-NSAID-ULCER-PREVENTION-ADULT',sub.concept_id,
    'pantoprazole-nsaid-gastroduodenal-ulcer-prevention-adult',
    'Prevention of NSAID-induced gastroduodenal ulcers in at-risk adults requiring continuous NSAIDs',
    'adult_only','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','EXACT_COMPONENT_STRENGTH'
  from sub join src on src.source_key='EMC-PRODUCT-14643-SMPC'

  union all
  select
    'SRC-PANTO40-REFLUX-OESOPHAGITIS-12PLUS',sub.concept_id,
    'pantoprazole-reflux-oesophagitis-treatment-12plus',
    'Treatment of reflux oesophagitis in adults/adolescents >=12 years',
    'pediatric_and_adult','PO','oral_solid','conditional',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','EXACT_COMPONENT_STRENGTH'
  from sub join src on src.source_key='EMC-PRODUCT-14644-SMPC'

  union all
  select
    'SRC-PANTO40-H-PYLORI-ERADICATION-ADULT',sub.concept_id,
    'pantoprazole-h-pylori-eradication-adult',
    'H. pylori eradication as combination therapy in adults with associated ulcers',
    'adult_only','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','EXACT_COMPONENT_STRENGTH'
  from sub join src on src.source_key='EMC-PRODUCT-14644-SMPC'

  union all
  select
    'SRC-PANTO40-GASTRIC-ULCER-ADULT',sub.concept_id,
    'pantoprazole-gastric-ulcer-adult',
    'Treatment of gastric ulcer in adults',
    'adult_only','PO','oral_solid','conditional',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','EXACT_COMPONENT_STRENGTH'
  from sub join src on src.source_key='EMC-PRODUCT-14644-SMPC'

  union all
  select
    'SRC-PANTO40-DUODENAL-ULCER-ADULT',sub.concept_id,
    'pantoprazole-duodenal-ulcer-adult',
    'Treatment of duodenal ulcer in adults',
    'adult_only','PO','oral_solid','conditional',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','EXACT_COMPONENT_STRENGTH'
  from sub join src on src.source_key='EMC-PRODUCT-14644-SMPC'

  union all
  select
    'SRC-PANTO40-ZES-HYPERSECRETORY-ADULT',sub.concept_id,
    'pantoprazole-zollinger-ellison-hypersecretory-adult',
    'Zollinger-Ellison syndrome and other pathological hypersecretory conditions in adults',
    'adult_only','PO','oral_solid','conditional',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','EXACT_COMPONENT_STRENGTH'
  from sub join src on src.source_key='EMC-PRODUCT-14644-SMPC'
) x(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status,
  target_kind,strength_match_mode
)
on conflict (regimen_key) do nothing;

insert into drx_dose.source_regimen_steps_v1(
  regimen_key,branch_no,step_no,min_age_months,
  calculation_method,dose_min_value,dose_max_value,dose_unit,
  frequency_mode,times_per_day,duration_min_days,duration_max_days,
  max_single_dose_mg,max_daily_dose_mg,condition_text,source_note
) values
  ('SRC-PANTO20-GERD-SYMPTOMATIC-12PLUS',1,1,144,
   'fixed_dose',20,20,'mg','times_per_day',1,14,56,20,20,
   'Initial continuous symptomatic treatment.',
   'Usual relief 2-4 weeks; may need a further 4 weeks.'),
  ('SRC-PANTO20-GERD-SYMPTOMATIC-12PLUS',2,1,144,
   'fixed_dose',20,20,'mg','times_per_day',1,null,null,20,20,
   'On-demand phase after symptom relief.',
   'Take one 20 mg tablet when required; branch selection requires clinical context.'),

  ('SRC-PANTO20-REFLUX-MAINTENANCE-12PLUS',1,1,144,
   'fixed_dose',20,20,'mg','times_per_day',1,null,null,20,20,
   'Maintenance / prevention of relapse.',
   'If relapse occurs the source allows 40 mg/day; escalation is a separate branch.'),
  ('SRC-PANTO20-REFLUX-MAINTENANCE-12PLUS',2,1,144,
   'fixed_dose',40,40,'mg','times_per_day',1,null,null,40,40,
   'Relapse treatment branch.',
   'After healing, reduce again to 20 mg/day.'),

  ('SRC-PANTO20-NSAID-ULCER-PREVENTION-ADULT',1,1,216,
   'fixed_dose',20,20,'mg','times_per_day',1,null,null,20,20,
   'At-risk adult requiring continuous non-selective NSAID treatment.',
   'Indication eligibility requires clinical risk assessment.'),

  ('SRC-PANTO40-REFLUX-OESOPHAGITIS-12PLUS',1,1,144,
   'fixed_dose',40,40,'mg','times_per_day',1,28,56,40,40,
   'Standard reflux-oesophagitis dose.',
   'Usually 4 weeks; may require a further 4 weeks.'),
  ('SRC-PANTO40-REFLUX-OESOPHAGITIS-12PLUS',2,1,144,
   'fixed_dose',80,80,'mg','times_per_day',1,28,56,80,80,
   'Individual escalation when response to other treatment is inadequate.',
   'Clinical branch; not default.'),

  ('SRC-PANTO40-H-PYLORI-ERADICATION-ADULT',1,1,216,
   'fixed_dose',40,40,'mg','times_per_day',2,7,14,40,80,
   'Pantoprazole component of H. pylori eradication combination therapy.',
   'Must be combined with two appropriate antibiotics according to local resistance/guidance.'),

  ('SRC-PANTO40-GASTRIC-ULCER-ADULT',1,1,216,
   'fixed_dose',40,40,'mg','times_per_day',1,28,56,40,40,
   'Standard gastric-ulcer dose.',
   'Usually 4 weeks; may require a further 4 weeks.'),
  ('SRC-PANTO40-GASTRIC-ULCER-ADULT',2,1,216,
   'fixed_dose',80,80,'mg','times_per_day',1,28,56,80,80,
   'Individual escalation branch.',
   'Clinical branch; not default.'),

  ('SRC-PANTO40-DUODENAL-ULCER-ADULT',1,1,216,
   'fixed_dose',40,40,'mg','times_per_day',1,14,28,40,40,
   'Standard duodenal-ulcer dose.',
   'Usually 2 weeks; may require a further 2 weeks.'),
  ('SRC-PANTO40-DUODENAL-ULCER-ADULT',2,1,216,
   'fixed_dose',80,80,'mg','times_per_day',1,14,28,80,80,
   'Individual escalation branch.',
   'Clinical branch; not default.'),

  ('SRC-PANTO40-ZES-HYPERSECRETORY-ADULT',1,1,216,
   'manual_only',null,null,null,'manual',null,null,null,null,null,
   'Start 80 mg/day, then titrate to gastric-acid secretion; doses >80 mg/day divided BID; temporary >160 mg/day may be used.',
   'Titration is intentionally manual-review, not a flat calculator rule.')
on conflict (regimen_key,branch_no,step_no) do nothing;

insert into drx_dose.source_candidate_applicability_v1(
  candidate_type,candidate_key,scope_type,route_key,form_family,
  source_strength_value,source_strength_unit,release_key,
  source_product_label,product_binding_policy
)
select
  'REGIMEN',r.regimen_key,'EXACT_PRESENTATION','PO','oral_solid',
  case when r.regimen_key like 'SRC-PANTO20-%' then 20 else 40 end,
  'mg','GASTRO_RESISTANT',
  case when r.regimen_key like 'SRC-PANTO20-%'
    then 'emc 14643 pantoprazole 20 mg gastro-resistant tablet'
    else 'emc 14644 pantoprazole 40 mg gastro-resistant tablet' end,
  'COMPATIBLE_PRODUCT_REVIEW'
from drx_dose.source_regimen_candidates_v1 r
where r.regimen_key like 'SRC-PANTO20-%' or r.regimen_key like 'SRC-PANTO40-%'
on conflict (candidate_type,candidate_key) do nothing;

-- Source-backed special-population adjustment candidates.
with src as (
  select s.source_key,s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key in ('EMC-PRODUCT-14643-SMPC','EMC-PRODUCT-14644-SMPC')
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='pantoprazole'
)
insert into drx_dose.source_adjustment_candidates_v1(
  adjustment_key,regimen_key,substance_concept_id,adjustment_domain,measure_type,
  action_type,max_daily_dose_mg,condition_text,
  source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
select * from (
  select
    'SRC-ADJ-PANTO-RENAL-NOCHANGE'::text,null::text,sub.concept_id,
    'RENAL','renal_impairment','NO_CHANGE',null::numeric,
    'No general dose adjustment is necessary in renal impairment; H. pylori combination therapy is separately restricted.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub join src on src.source_key='EMC-PRODUCT-14643-SMPC'

  union all
  select
    'SRC-ADJ-PANTO-SEVERE-HEPATIC-MAX20',null,sub.concept_id,
    'HEPATIC','severe_hepatic_impairment','MAX_DAILY_CAP',20,
    'In severe hepatic impairment, pantoprazole should not exceed 20 mg/day.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub join src on src.source_key='EMC-PRODUCT-14644-SMPC'
) x(
  adjustment_key,regimen_key,substance_concept_id,adjustment_domain,measure_type,
  action_type,max_daily_dose_mg,condition_text,
  source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
on conflict (adjustment_key) do nothing;

insert into drx_dose.source_candidate_applicability_v1(
  candidate_type,candidate_key,scope_type,route_key,form_family,
  source_product_label,product_binding_policy
) values
  ('ADJUSTMENT','SRC-ADJ-PANTO-RENAL-NOCHANGE','ROUTE_FORM_REVIEW','PO','oral_solid',
   'Pantoprazole oral gastro-resistant SmPCs','REVIEW_REQUIRED'),
  ('ADJUSTMENT','SRC-ADJ-PANTO-SEVERE-HEPATIC-MAX20','ROUTE_FORM_REVIEW','PO','oral_solid',
   'Pantoprazole oral gastro-resistant SmPCs','REVIEW_REQUIRED')
on conflict (candidate_type,candidate_key) do nothing;

-- Fail-closed oral-paediatric and H. pylori-specific restrictions.
with src as (
  select s.source_key,s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-14644-SMPC'
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='pantoprazole'
)
insert into drx_dose.source_restriction_candidates_v1(
  restriction_key,substance_concept_id,indication_key_candidate,patient_group,
  restriction_type,machine_action,max_age_months,restriction_text,
  source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
select * from (
  select
    'SRC-REST-PANTO-ORAL-BELOW-12'::text,sub.concept_id,null::text,'pediatric_only',
    'NO_ESTABLISHED_DATA','BLOCK',143.999::numeric,
    'Oral gastro-resistant pantoprazole is not recommended below 12 years because of limited safety/efficacy data.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub cross join src

  union all
  select
    'SRC-REST-PANTO-H-PYLORI-RENAL',sub.concept_id,'pantoprazole-h-pylori-eradication-adult','adult_only',
    'RENAL_RESTRICTION','BLOCK',null::numeric,
    'Pantoprazole H. pylori combination treatment should not be used in patients with impaired renal function due to lack of efficacy/safety data for the combination regimen.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub cross join src

  union all
  select
    'SRC-REST-PANTO-H-PYLORI-HEPATIC',sub.concept_id,'pantoprazole-h-pylori-eradication-adult','adult_only',
    'HEPATIC_RESTRICTION','BLOCK',null::numeric,
    'Pantoprazole H. pylori combination treatment should not be used in moderate to severe hepatic dysfunction due to lack of efficacy/safety data for the combination regimen.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub cross join src
) x(
  restriction_key,substance_concept_id,indication_key_candidate,patient_group,
  restriction_type,machine_action,max_age_months,restriction_text,
  source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
on conflict (restriction_key) do nothing;

insert into drx_dose.source_candidate_applicability_v1(
  candidate_type,candidate_key,scope_type,route_key,form_family,
  source_product_label,product_binding_policy
) values
  ('RESTRICTION','SRC-REST-PANTO-ORAL-BELOW-12','ROUTE_FORM_REVIEW','PO','oral_solid',
   'Pantoprazole oral gastro-resistant SmPCs','REVIEW_REQUIRED'),
  ('RESTRICTION','SRC-REST-PANTO-H-PYLORI-RENAL','ROUTE_FORM_REVIEW','PO','oral_solid',
   'Pantoprazole 40 mg H. pylori combination SmPC','REVIEW_REQUIRED'),
  ('RESTRICTION','SRC-REST-PANTO-H-PYLORI-HEPATIC','ROUTE_FORM_REVIEW','PO','oral_solid',
   'Pantoprazole 40 mg H. pylori combination SmPC','REVIEW_REQUIRED')
on conflict (candidate_type,candidate_key) do nothing;

select public.drx_phase11_refresh_source_indications_v1();
