-- DRx priority batch: source-backed co-trimoxazole (trimethoprim + sulfamethoxazole)
-- Source is stored as a normalized, source-backed capture. Nothing is auto-published.
-- The dose basis is component-aware; combined tablet mass is never used for mg/kg math.

with payload as (
  select
    $raw$Source: emc product 11466
Title: Co-Trimoxazole Forte 160/800mg Tablets
Active ingredients: trimethoprim, sulfamethoxazole
ATC: J01EE01
Last updated on emc: 19 Aug 2025
URL: https://www.medicines.org.uk/emc/product/11466/smpc

Section 2 composition:
Each Forte tablet contains 160 mg trimethoprim and 800 mg sulfamethoxazole.

Section 4.1 therapeutic indications:
Co-trimoxazole is indicated in adults and adolescents/children 12-18 years for susceptible infections including treatment/prophylaxis of Pneumocystis jirovecii pneumonitis, treatment/prophylaxis of toxoplasmosis and treatment of nocardiosis. Acute uncomplicated urinary tract infection, acute exacerbation of chronic bronchitis and acute otitis media may be treated where there is bacterial evidence of sensitivity and good reason to prefer the combination to a single antibacterial agent.

Section 4.2 normalized posology extract:
Adults over 18 years, standard acute-infection dosage: one Forte tablet containing 160 mg trimethoprim and 800 mg sulfamethoxazole every 12 hours.
Children over 12 to under 18 years: the source states the standard paediatric dose is approximately 6 mg trimethoprim and 30 mg sulfamethoxazole per kg body weight per day in two equally divided doses; the age-table schedule for this Forte presentation is one Forte tablet every 12 hours.
Most acute infections require at least 5 days and treatment should continue until symptom-free for two days; acute uncomplicated lower UTI may use a 1-3 day short course according to clinical selection.
Renal function in patients over 12 years and adults: CrCl >30 mL/min one Forte tablet every 12 hours; CrCl 15-30 mL/min one Forte tablet per day; CrCl <15 mL/min not recommended.
Pneumocystis jirovecii pneumonitis treatment in patients over 12 years and adults: 20 mg trimethoprim plus 100 mg sulfamethoxazole per kg body weight per day in two or more divided doses for two weeks.
PJP prophylaxis uses separate schedules and is not auto-selected by this migration.
Method of administration: oral; taking with some food or drink may reduce gastrointestinal disturbance.$raw$::text as raw_text,

    $s2$Each Forte tablet contains 160 mg trimethoprim and 800 mg sulfamethoxazole.$s2$::text as section_2,

    $s41$Co-trimoxazole is indicated in adults and adolescents/children 12-18 years for susceptible infections including treatment/prophylaxis of Pneumocystis jirovecii pneumonitis, treatment/prophylaxis of toxoplasmosis and treatment of nocardiosis. Acute uncomplicated urinary tract infection, acute exacerbation of chronic bronchitis and acute otitis media may be treated where there is bacterial evidence of sensitivity and good reason to prefer the combination to a single antibacterial agent.$s41$::text as section_41,

    $s42$Adults over 18 years, standard acute-infection dosage: one Forte tablet containing 160 mg trimethoprim and 800 mg sulfamethoxazole every 12 hours.
Children over 12 to under 18 years: the source states the standard paediatric dose is approximately 6 mg trimethoprim and 30 mg sulfamethoxazole per kg body weight per day in two equally divided doses; the age-table schedule for this Forte presentation is one Forte tablet every 12 hours.
Most acute infections require at least 5 days and treatment should continue until symptom-free for two days; acute uncomplicated lower UTI may use a 1-3 day short course according to clinical selection.
Renal function in patients over 12 years and adults: CrCl >30 mL/min one Forte tablet every 12 hours; CrCl 15-30 mL/min one Forte tablet per day; CrCl <15 mL/min not recommended.
Pneumocystis jirovecii pneumonitis treatment in patients over 12 years and adults: 20 mg trimethoprim plus 100 mg sulfamethoxazole per kg body weight per day in two or more divided doses for two weeks.
PJP prophylaxis uses separate schedules and is not auto-selected by this migration.
Method of administration: oral; taking with some food or drink may reduce gastrointestinal disturbance.$s42$::text as section_42
),
hashed as (
  select *,
    encode(digest(raw_text,'sha256'),'hex') snapshot_id,
    encode(digest(section_2,'sha256'),'hex') section_2_sha256,
    encode(digest(section_41,'sha256'),'hex') section_41_sha256,
    encode(digest(section_42,'sha256'),'hex') section_42_sha256
  from payload
)
insert into public.dose_source_snapshots_v3(
  snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
  document_type,document_version,document_date,fetched_at,content_type,content_length,
  raw_sha256,parser_version,archive_locator
)
select
  snapshot_id,
  'EMC-PRODUCT-11466-SMPC',
  'https://www.medicines.org.uk/emc/product/11466/smpc',
  'https://www.medicines.org.uk/emc/product/11466/smpc',
  'EMC',
  'electronic Medicines Compendium (emc)',
  'United Kingdom',
  'SmPC',
  'emc-update-2025-08-19',
  date '2025-08-19',
  now(),
  'text/plain; charset=utf-8; profile=drx-normalized-web-capture',
  octet_length(raw_text),
  snapshot_id,
  'drx-web-normalized-capture-v1',
  'https://www.medicines.org.uk/emc/product/11466/smpc'
from hashed
on conflict (snapshot_id) do nothing;

with payload as (
  select
    $raw$Source: emc product 11466
Title: Co-Trimoxazole Forte 160/800mg Tablets
Active ingredients: trimethoprim, sulfamethoxazole
ATC: J01EE01
Last updated on emc: 19 Aug 2025
URL: https://www.medicines.org.uk/emc/product/11466/smpc

Section 2 composition:
Each Forte tablet contains 160 mg trimethoprim and 800 mg sulfamethoxazole.

Section 4.1 therapeutic indications:
Co-trimoxazole is indicated in adults and adolescents/children 12-18 years for susceptible infections including treatment/prophylaxis of Pneumocystis jirovecii pneumonitis, treatment/prophylaxis of toxoplasmosis and treatment of nocardiosis. Acute uncomplicated urinary tract infection, acute exacerbation of chronic bronchitis and acute otitis media may be treated where there is bacterial evidence of sensitivity and good reason to prefer the combination to a single antibacterial agent.

Section 4.2 normalized posology extract:
Adults over 18 years, standard acute-infection dosage: one Forte tablet containing 160 mg trimethoprim and 800 mg sulfamethoxazole every 12 hours.
Children over 12 to under 18 years: the source states the standard paediatric dose is approximately 6 mg trimethoprim and 30 mg sulfamethoxazole per kg body weight per day in two equally divided doses; the age-table schedule for this Forte presentation is one Forte tablet every 12 hours.
Most acute infections require at least 5 days and treatment should continue until symptom-free for two days; acute uncomplicated lower UTI may use a 1-3 day short course according to clinical selection.
Renal function in patients over 12 years and adults: CrCl >30 mL/min one Forte tablet every 12 hours; CrCl 15-30 mL/min one Forte tablet per day; CrCl <15 mL/min not recommended.
Pneumocystis jirovecii pneumonitis treatment in patients over 12 years and adults: 20 mg trimethoprim plus 100 mg sulfamethoxazole per kg body weight per day in two or more divided doses for two weeks.
PJP prophylaxis uses separate schedules and is not auto-selected by this migration.
Method of administration: oral; taking with some food or drink may reduce gastrointestinal disturbance.$raw$::text as raw_text,
    $s2$Each Forte tablet contains 160 mg trimethoprim and 800 mg sulfamethoxazole.$s2$::text as section_2,
    $s41$Co-trimoxazole is indicated in adults and adolescents/children 12-18 years for susceptible infections including treatment/prophylaxis of Pneumocystis jirovecii pneumonitis, treatment/prophylaxis of toxoplasmosis and treatment of nocardiosis. Acute uncomplicated urinary tract infection, acute exacerbation of chronic bronchitis and acute otitis media may be treated where there is bacterial evidence of sensitivity and good reason to prefer the combination to a single antibacterial agent.$s41$::text as section_41,
    $s42$Adults over 18 years, standard acute-infection dosage: one Forte tablet containing 160 mg trimethoprim and 800 mg sulfamethoxazole every 12 hours.
Children over 12 to under 18 years: the source states the standard paediatric dose is approximately 6 mg trimethoprim and 30 mg sulfamethoxazole per kg body weight per day in two equally divided doses; the age-table schedule for this Forte presentation is one Forte tablet every 12 hours.
Most acute infections require at least 5 days and treatment should continue until symptom-free for two days; acute uncomplicated lower UTI may use a 1-3 day short course according to clinical selection.
Renal function in patients over 12 years and adults: CrCl >30 mL/min one Forte tablet every 12 hours; CrCl 15-30 mL/min one Forte tablet per day; CrCl <15 mL/min not recommended.
Pneumocystis jirovecii pneumonitis treatment in patients over 12 years and adults: 20 mg trimethoprim plus 100 mg sulfamethoxazole per kg body weight per day in two or more divided doses for two weeks.
PJP prophylaxis uses separate schedules and is not auto-selected by this migration.
Method of administration: oral; taking with some food or drink may reduce gastrointestinal disturbance.$s42$::text as section_42
),
hashed as (
  select *,
    encode(digest(raw_text,'sha256'),'hex') snapshot_id,
    encode(digest(section_2,'sha256'),'hex') section_2_sha256,
    encode(digest(section_41,'sha256'),'hex') section_41_sha256,
    encode(digest(section_42,'sha256'),'hex') section_42_sha256
  from payload
)
insert into public.dose_source_sections_v3(
  snapshot_id,section_code,section_key,heading,section_text,section_sha256,
  extracted_json,parser_version,extraction_status
)
select snapshot_id,'2','section-2','Qualitative and quantitative composition',section_2,section_2_sha256,
       jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl','https://www.medicines.org.uk/emc/product/11466/smpc'),
       'drx-web-normalized-capture-v1','extracted'
from hashed
union all
select snapshot_id,'4.1','section-4-1','Therapeutic indications',section_41,section_41_sha256,
       jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl','https://www.medicines.org.uk/emc/product/11466/smpc'),
       'drx-web-normalized-capture-v1','extracted'
from hashed
union all
select snapshot_id,'4.2','section-4-2','Posology and method of administration',section_42,section_42_sha256,
       jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl','https://www.medicines.org.uk/emc/product/11466/smpc','doseBasis','component-aware'),
       'drx-web-normalized-capture-v1','extracted'
from hashed
on conflict (snapshot_id,section_code) do nothing;

with src as (
  select s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id and sec.section_code='4.2' and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-11466-SMPC'
  order by s.created_at desc limit 1
), ids as (
  select
    (select concept_id from public.substance_concepts_v1 where canonical_key='trimethoprim') as tmp,
    (select concept_id from public.substance_concepts_v1 where canonical_key='sulfamethoxazole') as smx
)
insert into drx_dose.source_regimen_candidates_v1(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status,
  target_kind,dose_moiety_concept_ids,dose_moiety_key,strength_match_mode,
  review_note
)
select * from (
  select
    'SRC-COTRIM-FORTE-ADULT-ACUTE'::text,null::uuid,
    'cotrimoxazole-standard-acute-infection-adult',
    'Co-trimoxazole standard acute-infection regimen in adults >18 years',
    'adult_only','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING',
    'INGREDIENT_SET',array[ids.tmp,ids.smx]::uuid[],'trimethoprim+sulfamethoxazole','EXACT_COMPONENT_STRENGTH',
    'Source-backed candidate only; indication/susceptibility selection remains clinical-review gated.'
  from src cross join ids
  union all
  select
    'SRC-COTRIM-FORTE-ADOLESCENT-ACUTE',null::uuid,
    'cotrimoxazole-standard-acute-infection-adolescent-12-17',
    'Co-trimoxazole standard acute-infection regimen age >12 to <18 years',
    'pediatric_only','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING',
    'INGREDIENT_SET',array[ids.tmp,ids.smx]::uuid[],'trimethoprim+sulfamethoxazole','EXACT_COMPONENT_STRENGTH',
    'Forte tablet schedule from the captured SmPC; component mg/kg equivalence is preserved in the component rows.'
  from src cross join ids
  union all
  select
    'SRC-COTRIM-PJP-TREATMENT-12PLUS',null::uuid,
    'cotrimoxazole-pjp-treatment-12plus',
    'Pneumocystis jirovecii pneumonitis treatment in patients >12 years',
    'pediatric_and_adult','PO','oral_solid','conditional',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING',
    'INGREDIENT_SET',array[ids.tmp,ids.smx]::uuid[],'trimethoprim+sulfamethoxazole','MANUAL_REVIEW',
    'Source says two or more divided doses, therefore the staging layer must not invent an exact per-dose frequency.'
  from src cross join ids
) x(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status,
  target_kind,dose_moiety_concept_ids,dose_moiety_key,strength_match_mode,review_note
)
on conflict (regimen_key) do nothing;

insert into drx_dose.source_regimen_steps_v1(
  regimen_key,branch_no,step_no,min_age_months,max_age_months,
  calculation_method,dose_min_value,dose_max_value,dose_unit,
  frequency_mode,times_per_day,duration_min_days,duration_max_days,
  condition_text,source_note
) values
  ('SRC-COTRIM-FORTE-ADULT-ACUTE',1,1,216,null,
   'fixed_dose',1,1,'tablet','times_per_day',2,5,null,
   'Adults >18 years; susceptible acute infection selected according to the captured SmPC.',
   'One Forte 160/800 mg tablet every 12 hours. Continue until symptom-free for two days; most require at least 5 days.'),
  ('SRC-COTRIM-FORTE-ADOLESCENT-ACUTE',1,1,144,215.999,
   'fixed_dose',1,1,'tablet','times_per_day',2,5,null,
   'Age >12 to <18 years; susceptible acute infection selected according to the captured SmPC.',
   'One Forte 160/800 mg tablet every 12 hours; source also states approximately 6 mg TMP + 30 mg SMX/kg/day divided BID.'),
  ('SRC-COTRIM-PJP-TREATMENT-12PLUS',1,1,144,null,
   'dose_per_kg_per_day',20,20,'mg','manual',null,14,14,
   'PJP treatment; the mg/kg dose is expressed on the trimethoprim component.',
   '20 mg TMP + 100 mg SMX/kg/day for two weeks in two or more divided doses. Exact split remains clinician-selected.')
on conflict (regimen_key,branch_no,step_no) do nothing;

with ids as (
  select
    (select concept_id from public.substance_concepts_v1 where canonical_key='trimethoprim') as tmp,
    (select concept_id from public.substance_concepts_v1 where canonical_key='sulfamethoxazole') as smx
)
insert into drx_dose.source_regimen_step_components_v1(
  regimen_key,branch_no,step_no,component_concept_id,component_role,
  dose_min_value,dose_max_value,dose_unit,dose_basis,note
)
select * from (
  select 'SRC-COTRIM-FORTE-ADULT-ACUTE'::text,1,1,ids.tmp,'DOSE_BASIS',160::numeric,160::numeric,'mg','per_dose','Trimethoprim content per Forte tablet/dose' from ids
  union all
  select 'SRC-COTRIM-FORTE-ADULT-ACUTE',1,1,ids.smx,'ACTIVE',800,800,'mg','per_dose','Sulfamethoxazole content per Forte tablet/dose' from ids
  union all
  select 'SRC-COTRIM-FORTE-ADOLESCENT-ACUTE',1,1,ids.tmp,'DOSE_BASIS',160,160,'mg','per_dose','Trimethoprim content per Forte tablet/dose; source also states approx 6 mg/kg/day standard paediatric basis' from ids
  union all
  select 'SRC-COTRIM-FORTE-ADOLESCENT-ACUTE',1,1,ids.smx,'ACTIVE',800,800,'mg','per_dose','Sulfamethoxazole content per Forte tablet/dose; source also states approx 30 mg/kg/day standard paediatric basis' from ids
  union all
  select 'SRC-COTRIM-PJP-TREATMENT-12PLUS',1,1,ids.tmp,'DOSE_BASIS',20,20,'mg','kg/day','Trimethoprim component is the calculation basis' from ids
  union all
  select 'SRC-COTRIM-PJP-TREATMENT-12PLUS',1,1,ids.smx,'ACTIVE',100,100,'mg','kg/day','Sulfamethoxazole paired component' from ids
) x(regimen_key,branch_no,step_no,component_concept_id,component_role,dose_min_value,dose_max_value,dose_unit,dose_basis,note)
on conflict (regimen_key,branch_no,step_no,component_concept_id) do nothing;

with ids as (
  select
    (select concept_id from public.substance_concepts_v1 where canonical_key='trimethoprim') as tmp,
    (select concept_id from public.substance_concepts_v1 where canonical_key='sulfamethoxazole') as smx
)
insert into drx_dose.source_regimen_strength_requirements_v1(
  regimen_key,component_concept_id,numerator_value,numerator_unit,denominator_value,denominator_unit,requirement_note
)
select * from (
  select 'SRC-COTRIM-FORTE-ADULT-ACUTE'::text,ids.tmp,160::numeric,'mg',1::numeric,'tablet','Exact trimethoprim content per Forte tablet' from ids
  union all
  select 'SRC-COTRIM-FORTE-ADULT-ACUTE',ids.smx,800,'mg',1,'tablet','Exact sulfamethoxazole content per Forte tablet' from ids
  union all
  select 'SRC-COTRIM-FORTE-ADOLESCENT-ACUTE',ids.tmp,160,'mg',1,'tablet','Exact trimethoprim content per Forte tablet' from ids
  union all
  select 'SRC-COTRIM-FORTE-ADOLESCENT-ACUTE',ids.smx,800,'mg',1,'tablet','Exact sulfamethoxazole content per Forte tablet' from ids
) x(regimen_key,component_concept_id,numerator_value,numerator_unit,denominator_value,denominator_unit,requirement_note)
on conflict do nothing;

with src as (
  select s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id and sec.section_code='4.2' and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-11466-SMPC'
  order by s.created_at desc limit 1
), ids as (
  select
    (select concept_id from public.substance_concepts_v1 where canonical_key='trimethoprim') as tmp,
    (select concept_id from public.substance_concepts_v1 where canonical_key='sulfamethoxazole') as smx
)
insert into drx_dose.source_adjustment_candidates_v1(
  adjustment_key,regimen_key,substance_concept_id,adjustment_domain,measure_type,
  min_value,max_value,min_inclusive,max_inclusive,action_type,
  replacement_dose_min,replacement_dose_max,replacement_dose_unit,
  replacement_frequency_mode,replacement_times_per_day,
  condition_text,source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind,dose_moiety_concept_ids,dose_moiety_key,review_note
)
select * from (
  select
    'SRC-ADJ-COTRIM-CRCL-GT30-STANDARD'::text,null::text,null::uuid,
    'RENAL','CrCl_mL_min',30::numeric,null::numeric,false,true,'NO_CHANGE',
    null::numeric,null::numeric,null::text,null::text,null::numeric,
    'CrCl >30 mL/min: standard Forte schedule in the captured SmPC.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING',
    'INGREDIENT_SET',array[ids.tmp,ids.smx]::uuid[],'trimethoprim+sulfamethoxazole',
    'Applies to patients >12 years covered by this source.'
  from src cross join ids
  union all
  select
    'SRC-ADJ-COTRIM-CRCL-15TO30-ONE-DAILY',null,null,
    'RENAL','CrCl_mL_min',15,30,true,true,'REPLACE_DOSE',
    1,1,'tablet','times_per_day',1,
    'CrCl 15-30 mL/min: one Forte 160/800 mg tablet per day in the captured SmPC.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING',
    'INGREDIENT_SET',array[ids.tmp,ids.smx]::uuid[],'trimethoprim+sulfamethoxazole',
    'Component strength must remain 160 mg TMP + 800 mg SMX per tablet.'
  from src cross join ids
  union all
  select
    'SRC-ADJ-COTRIM-CRCL-LT15-NOT-RECOMMENDED',null,null,
    'RENAL','CrCl_mL_min',null,15,true,false,'NOT_RECOMMENDED',
    null,null,null,null,null,
    'CrCl <15 mL/min: not recommended in the captured SmPC.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING',
    'INGREDIENT_SET',array[ids.tmp,ids.smx]::uuid[],'trimethoprim+sulfamethoxazole',
    'Fail closed; no replacement dose is inferred.'
  from src cross join ids
) x(
  adjustment_key,regimen_key,substance_concept_id,adjustment_domain,measure_type,
  min_value,max_value,min_inclusive,max_inclusive,action_type,
  replacement_dose_min,replacement_dose_max,replacement_dose_unit,
  replacement_frequency_mode,replacement_times_per_day,
  condition_text,source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind,dose_moiety_concept_ids,dose_moiety_key,review_note
)
on conflict (adjustment_key) do nothing;

select public.drx_phase11_refresh_source_indications_v1();
