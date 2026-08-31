
-- DRx Phase 11AG: diclofenac route/form scoped evidence and regimens.
-- Demonstrates that the same clinical moiety can have very different dosing by
-- route/formulation and therefore must never inherit rules across contexts blindly.

do $$
declare
  v_source_url text;
  v_source_key text;
  v_raw text;
  v_s2 text;
  v_s41 text;
  v_s42 text;
  v_s43 text;
  v_snapshot text;
  v_doc_date date;
  v_version text;
begin
  -- Oral prolonged-release 75 mg.
  v_source_url := 'https://www.medicines.org.uk/emc/product/2661/smpc';
  v_source_key := 'EMC-PRODUCT-2661-SMPC';
  v_doc_date := date '2026-05-01';
  v_version := 'emc-update-2026-05-01';
  v_s2 := 'Each prolonged-release tablet contains 75 mg diclofenac sodium.';
  v_s41 := 'Adults and elderly: relief of pain and inflammation in arthritic conditions, acute musculoskeletal disorders, and other painful traumatic or peri-operative conditions. The 75 mg prolonged-release tablet is not suitable for children.';
  v_s42 := 'Adults: one 75 mg prolonged-release tablet once or twice daily; recommended maximum daily dose 150 mg. This medicine is not suitable for children. Elderly patients should use the lowest effective dose with particular caution. Renal failure and hepatic failure are contraindications; no specific dose-adjustment recommendation can be made for mild-moderate impairment, where caution is advised. Oral administration; tablets taken whole with liquid, preferably with or after food.';
  v_s43 := 'Contraindications include active/recurrent GI ulceration or bleeding, last trimester of pregnancy, hepatic failure, renal failure, established congestive heart failure NYHA II-IV, ischemic heart disease, peripheral arterial disease and/or cerebrovascular disease, and relevant NSAID hypersensitivity.';
  v_raw := concat_ws(E'\n\n',
    'Source: emc product 2661',
    'Title: Diclofenac sodium Dexcel SR 75 mg prolonged-release tablets',
    'Active ingredient: diclofenac sodium',
    'ATC: M01AB05',
    'Last updated on emc: 01 May 2026',
    'URL: '||v_source_url,
    'Section 2 normalized extract: '||v_s2,
    'Section 4.1 normalized extract: '||v_s41,
    'Section 4.2 normalized extract: '||v_s42,
    'Section 4.3 normalized extract: '||v_s43
  );
  v_snapshot := encode(digest(v_raw,'sha256'),'hex');

  insert into public.dose_source_snapshots_v3(
    snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
    document_type,document_version,document_date,fetched_at,content_type,content_length,
    raw_sha256,parser_version,archive_locator
  ) values (
    v_snapshot,v_source_key,v_source_url,v_source_url,'EMC',
    'electronic Medicines Compendium (emc)','United Kingdom','SmPC',
    v_version,v_doc_date,now(),
    'text/plain; charset=utf-8; profile=drx-normalized-web-capture',
    octet_length(v_raw),v_snapshot,'drx-web-normalized-capture-v1',v_source_url
  ) on conflict (snapshot_id) do nothing;

  insert into public.dose_source_sections_v3(
    snapshot_id,section_code,section_key,heading,section_text,section_sha256,
    extracted_json,parser_version,extraction_status
  ) values
    (v_snapshot,'2','section-2','Qualitative and quantitative composition',v_s2,encode(digest(v_s2,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','217-224'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.1','section-4.1','Therapeutic indications',v_s41,encode(digest(v_s41,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','234-247'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.2','section-4.2','Posology and method of administration',v_s42,encode(digest(v_s42,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','249-276'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.3','section-4.3','Contraindications',v_s43,encode(digest(v_s43,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','278-294'),
     'drx-web-normalized-capture-v1','extracted')
  on conflict (snapshot_id,section_code) do nothing;

  -- Topical 1.16% gel.
  v_source_url := 'https://www.medicines.org.uk/emc/product/13852/smpc';
  v_source_key := 'EMC-PRODUCT-13852-SMPC';
  v_doc_date := date '2026-05-29';
  v_version := 'emc-update-2026-05-29';
  v_s2 := 'Each 1 g of gel contains 11.6 mg diclofenac diethylamine corresponding to 10 mg diclofenac sodium.';
  v_s41 := 'Adults and adolescents aged 14 years and over: short-term local symptomatic treatment of mild to moderate pain in acute strains, sprains or contusions following blunt trauma.';
  v_s42 := 'Adults and adolescents >=14 years: apply 1-4 g of gel to the affected area 3-4 times daily, corresponding to 10-40 mg diclofenac sodium per application. Maximum daily dose 16 g gel, corresponding to 160 mg diclofenac sodium. Do not use longer than 1 week without medical advice. No dose reduction is required in renal or hepatic impairment for this topical presentation. Cutaneous use only.';
  v_s43 := 'Contraindicated in children/adolescents under 14 years; also contraindicated on open injuries, inflamed/infected skin, eczema or mucous membranes, in the third trimester of pregnancy, and in relevant NSAID hypersensitivity.';
  v_raw := concat_ws(E'\n\n',
    'Source: emc product 13852',
    'Title: Motusol 1.16% w/w Gel',
    'Active ingredient: diclofenac diethylamine corresponding to diclofenac sodium',
    'ATC: M02AA15',
    'Last updated on emc: 29 May 2026',
    'URL: '||v_source_url,
    'Section 2 normalized extract: '||v_s2,
    'Section 4.1 normalized extract: '||v_s41,
    'Section 4.2 normalized extract: '||v_s42,
    'Section 4.3 normalized extract: '||v_s43
  );
  v_snapshot := encode(digest(v_raw,'sha256'),'hex');

  insert into public.dose_source_snapshots_v3(
    snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
    document_type,document_version,document_date,fetched_at,content_type,content_length,
    raw_sha256,parser_version,archive_locator
  ) values (
    v_snapshot,v_source_key,v_source_url,v_source_url,'EMC',
    'electronic Medicines Compendium (emc)','United Kingdom','SmPC',
    v_version,v_doc_date,now(),
    'text/plain; charset=utf-8; profile=drx-normalized-web-capture',
    octet_length(v_raw),v_snapshot,'drx-web-normalized-capture-v1',v_source_url
  ) on conflict (snapshot_id) do nothing;

  insert into public.dose_source_sections_v3(
    snapshot_id,section_code,section_key,heading,section_text,section_sha256,
    extracted_json,parser_version,extraction_status
  ) values
    (v_snapshot,'2','section-2','Qualitative and quantitative composition',v_s2,encode(digest(v_s2,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','219-226'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.1','section-4.1','Therapeutic indications',v_s41,encode(digest(v_s41,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','234-239'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.2','section-4.2','Posology and method of administration',v_s42,encode(digest(v_s42,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','241-280'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.3','section-4.3','Contraindications',v_s43,encode(digest(v_s43,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','282-287'),
     'drx-web-normalized-capture-v1','extracted')
  on conflict (snapshot_id,section_code) do nothing;

  -- Topical 2.32% gel.
  v_source_url := 'https://www.medicines.org.uk/emc/product/15192/smpc';
  v_source_key := 'EMC-PRODUCT-15192-SMPC';
  v_doc_date := date '2026-05-11';
  v_version := 'emc-update-2026-05-11';
  v_s2 := 'Each 1 g of gel contains 23.2 mg diclofenac diethylamine corresponding to 20 mg diclofenac sodium.';
  v_s41 := 'Adults and adolescents aged 14 years and over: short-term local symptomatic treatment of mild to moderate pain in acute strains, sprains or contusions following blunt trauma.';
  v_s42 := 'Adults and adolescents >=14 years: apply 1-4 g of gel twice daily, preferably morning and evening, corresponding to 20-80 mg diclofenac sodium per application. Maximum daily dose 8 g gel, corresponding to 160 mg diclofenac sodium. Do not use longer than 1 week without medical advice. No dose reduction is required in renal or hepatic impairment for this topical presentation. Cutaneous use only.';
  v_s43 := 'Contraindicated in children/adolescents under 14 years; also contraindicated on open injuries, inflamed/infected skin, eczema or mucous membranes, in the third trimester of pregnancy, and in relevant NSAID hypersensitivity.';
  v_raw := concat_ws(E'\n\n',
    'Source: emc product 15192',
    'Title: Diclofenac 2.32% gel',
    'Active ingredient: diclofenac diethylamine corresponding to diclofenac sodium',
    'ATC: M02AA15',
    'Last updated on emc: 11 May 2026',
    'URL: '||v_source_url,
    'Section 2 normalized extract: '||v_s2,
    'Section 4.1 normalized extract: '||v_s41,
    'Section 4.2 normalized extract: '||v_s42,
    'Section 4.3 normalized extract: '||v_s43
  );
  v_snapshot := encode(digest(v_raw,'sha256'),'hex');

  insert into public.dose_source_snapshots_v3(
    snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
    document_type,document_version,document_date,fetched_at,content_type,content_length,
    raw_sha256,parser_version,archive_locator
  ) values (
    v_snapshot,v_source_key,v_source_url,v_source_url,'EMC',
    'electronic Medicines Compendium (emc)','United Kingdom','SmPC',
    v_version,v_doc_date,now(),
    'text/plain; charset=utf-8; profile=drx-normalized-web-capture',
    octet_length(v_raw),v_snapshot,'drx-web-normalized-capture-v1',v_source_url
  ) on conflict (snapshot_id) do nothing;

  insert into public.dose_source_sections_v3(
    snapshot_id,section_code,section_key,heading,section_text,section_sha256,
    extracted_json,parser_version,extraction_status
  ) values
    (v_snapshot,'2','section-2','Qualitative and quantitative composition',v_s2,encode(digest(v_s2,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','217-224'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.1','section-4.1','Therapeutic indications',v_s41,encode(digest(v_s41,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','232-237'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.2','section-4.2','Posology and method of administration',v_s42,encode(digest(v_s42,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','239-280'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.3','section-4.3','Contraindications',v_s43,encode(digest(v_s43,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','282-287'),
     'drx-web-normalized-capture-v1','extracted')
  on conflict (snapshot_id,section_code) do nothing;
end $$;

-- Evidence-backed dose-moiety normalization for topical diclofenac.
with src as (
  select s.snapshot_id,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='2'
   and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-15192-SMPC'
  order by s.created_at desc limit 1
),
ids as (
  select
    (select concept_id from public.substance_concepts_v1 where canonical_key='diclofenacdiethylamine') source_id,
    (select concept_id from public.substance_concepts_v1 where canonical_key='diclofenacsodium') target_id
)
insert into drx_dose.component_moiety_map_v1(
  source_concept_id,dose_moiety_concept_id,mapping_kind,source_snapshot_id,
  source_section_code,source_section_sha256,mapping_status,verified_by,verified_at,note
)
select
  ids.source_id,ids.target_id,'EQUIVALENT_ACTIVE',src.snapshot_id,
  '2',src.section_sha256,'VERIFIED','system:phase11ag-emc-15192-composition',now(),
  'SmPC composition explicitly expresses diclofenac diethylamine content as the corresponding diclofenac sodium amount.'
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
  where s.source_key in ('EMC-PRODUCT-2661-SMPC','EMC-PRODUCT-13852-SMPC','EMC-PRODUCT-15192-SMPC')
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='diclofenacsodium'
)
insert into drx_dose.source_regimen_candidates_v1(
  regimen_key,substance_concept_id,indication_key_candidate,indication_label,
  patient_group,route_key,form_family,regimen_kind,
  source_snapshot_id,source_section_sha256,source_url,review_status,
  target_kind,strength_match_mode
)
select * from (
  select
    'SRC-DICLO-SR75-ADULT-PAIN-INFLAMMATION'::text,sub.concept_id,
    'diclofenac-adult-pain-inflammation-sr75',
    'Adult pain and inflammation for the 75 mg prolonged-release oral presentation',
    'adult_only','PO','oral_solid','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','EXACT_COMPONENT_STRENGTH'
  from sub join src on src.source_key='EMC-PRODUCT-2661-SMPC'

  union all
  select
    'SRC-DICLO-GEL116-TRAUMA-14PLUS',sub.concept_id,
    'diclofenac-topical-acute-strain-sprain-contusion-14plus',
    'Topical short-term symptomatic treatment of acute strains, sprains or contusions in >=14 years (1.16% gel)',
    'pediatric_and_adult','TOP','cutaneous','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','EXACT_COMPONENT_STRENGTH'
  from sub join src on src.source_key='EMC-PRODUCT-13852-SMPC'

  union all
  select
    'SRC-DICLO-GEL232-TRAUMA-14PLUS',sub.concept_id,
    'diclofenac-topical-acute-strain-sprain-contusion-14plus',
    'Topical short-term symptomatic treatment of acute strains, sprains or contusions in >=14 years (2.32% gel)',
    'pediatric_and_adult','TOP','cutaneous','single_step',
    src.snapshot_id,src.section_sha256,src.source_url,'PENDING','SUBSTANCE','EXACT_COMPONENT_STRENGTH'
  from sub join src on src.source_key='EMC-PRODUCT-15192-SMPC'
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
  frequency_mode,times_per_day,duration_max_days,
  max_single_dose_mg,max_daily_dose_mg,condition_text,source_note
) values
  ('SRC-DICLO-SR75-ADULT-PAIN-INFLAMMATION',1,1,216,
   'fixed_dose',75,75,'mg','times_per_day',1,null,75,150,
   'Adults; one 75 mg prolonged-release tablet once daily.',
   'Source also permits twice-daily dosing; second branch retained separately.'),
  ('SRC-DICLO-SR75-ADULT-PAIN-INFLAMMATION',2,1,216,
   'fixed_dose',75,75,'mg','times_per_day',2,null,75,150,
   'Adults; one 75 mg prolonged-release tablet twice daily.',
   'Maximum total daily dose 150 mg.'),

  ('SRC-DICLO-GEL116-TRAUMA-14PLUS',1,1,168,
   'fixed_dose',1,4,'g gel','times_per_day',3,7,null,null,
   'Adults and adolescents >=14 years; lower end of source frequency range.',
   '1-4 g gel per application, 3-4 times/day; max 16 g gel/day = 160 mg diclofenac sodium equivalent.'),
  ('SRC-DICLO-GEL116-TRAUMA-14PLUS',2,1,168,
   'fixed_dose',1,4,'g gel','times_per_day',4,7,null,null,
   'Adults and adolescents >=14 years; upper end of source frequency range.',
   '1-4 g gel per application, 3-4 times/day; max 16 g gel/day = 160 mg diclofenac sodium equivalent.'),

  ('SRC-DICLO-GEL232-TRAUMA-14PLUS',1,1,168,
   'fixed_dose',1,4,'g gel','times_per_day',2,7,null,null,
   'Adults and adolescents >=14 years.',
   '1-4 g gel per application twice daily; max 8 g gel/day = 160 mg diclofenac sodium equivalent.')
on conflict (regimen_key,branch_no,step_no) do nothing;

-- Explicit active-moiety equivalents for topical product quantities.
with sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='diclofenacsodium'
)
insert into drx_dose.source_regimen_step_components_v1(
  regimen_key,branch_no,step_no,component_concept_id,component_role,
  dose_min_value,dose_max_value,dose_unit,dose_basis,max_daily_value,max_daily_unit,note
)
select * from (
  select 'SRC-DICLO-GEL116-TRAUMA-14PLUS'::text,1,1,sub.concept_id,'DOSE_BASIS',
    10::numeric,40::numeric,'mg','per_application',160::numeric,'mg/day',
    'Diclofenac sodium equivalent per 1-4 g application.' from sub
  union all
  select 'SRC-DICLO-GEL116-TRAUMA-14PLUS',2,1,sub.concept_id,'DOSE_BASIS',
    10,40,'mg','per_application',160,'mg/day',
    'Diclofenac sodium equivalent per 1-4 g application.' from sub
  union all
  select 'SRC-DICLO-GEL232-TRAUMA-14PLUS',1,1,sub.concept_id,'DOSE_BASIS',
    20,80,'mg','per_application',160,'mg/day',
    'Diclofenac sodium equivalent per 1-4 g application.' from sub
) x(
  regimen_key,branch_no,step_no,component_concept_id,component_role,
  dose_min_value,dose_max_value,dose_unit,dose_basis,max_daily_value,max_daily_unit,note
)
on conflict (regimen_key,branch_no,step_no,component_concept_id) do nothing;

insert into drx_dose.source_candidate_applicability_v1(
  candidate_type,candidate_key,scope_type,route_key,form_family,
  source_strength_value,source_strength_unit,release_key,
  source_product_label,product_binding_policy
) values
  ('REGIMEN','SRC-DICLO-SR75-ADULT-PAIN-INFLAMMATION','EXACT_PRESENTATION','PO','oral_solid',
   75,'mg','PROLONGED',
   'emc 2661 Diclofenac sodium 75 mg prolonged-release tablet','EXACT_PRESENTATION_ONLY'),
  ('REGIMEN','SRC-DICLO-GEL116-TRAUMA-14PLUS','EXACT_PRESENTATION','TOP','cutaneous',
   10,'mg/g','NOT_APPLICABLE',
   'emc 13852 diclofenac gel 1.16% corresponding to 10 mg/g diclofenac sodium','EXACT_PRESENTATION_ONLY'),
  ('REGIMEN','SRC-DICLO-GEL232-TRAUMA-14PLUS','EXACT_PRESENTATION','TOP','cutaneous',
   20,'mg/g','NOT_APPLICABLE',
   'emc 15192 diclofenac gel 2.32% corresponding to 20 mg/g diclofenac sodium','EXACT_PRESENTATION_ONLY')
on conflict (candidate_type,candidate_key) do nothing;

-- Product-specific age restrictions.
with src as (
  select s.source_key,s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.3'
   and sec.extraction_status='extracted'
  where s.source_key in ('EMC-PRODUCT-13852-SMPC','EMC-PRODUCT-15192-SMPC')
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='diclofenacsodium'
)
insert into drx_dose.source_restriction_candidates_v1(
  restriction_key,substance_concept_id,patient_group,restriction_type,machine_action,
  max_age_months,restriction_text,
  source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
select * from (
  select
    'SRC-REST-DICLO-GEL116-BELOW-14'::text,sub.concept_id,'pediatric_only',
    'FORMULATION_RESTRICTION','BLOCK',167.999::numeric,
    'The emc 13852 1.16% gel presentation is contraindicated below 14 years.',
    src.snapshot_id,'4.3',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub join src on src.source_key='EMC-PRODUCT-13852-SMPC'
  union all
  select
    'SRC-REST-DICLO-GEL232-BELOW-14',sub.concept_id,'pediatric_only',
    'FORMULATION_RESTRICTION','BLOCK',167.999,
    'The emc 15192 2.32% gel presentation is contraindicated below 14 years.',
    src.snapshot_id,'4.3',src.section_sha256,src.source_url,'PENDING','SUBSTANCE'
  from sub join src on src.source_key='EMC-PRODUCT-15192-SMPC'
) x(
  restriction_key,substance_concept_id,patient_group,restriction_type,machine_action,
  max_age_months,restriction_text,
  source_snapshot_id,source_section_code,source_section_sha256,source_url,
  review_status,target_kind
)
on conflict (restriction_key) do nothing;

insert into drx_dose.source_candidate_applicability_v1(
  candidate_type,candidate_key,scope_type,route_key,form_family,
  source_strength_value,source_strength_unit,release_key,
  source_product_label,product_binding_policy
) values
  ('RESTRICTION','SRC-REST-DICLO-GEL116-BELOW-14','SOURCE_PRODUCT_ONLY','TOP','cutaneous',
   10,'mg/g','NOT_APPLICABLE','emc 13852 diclofenac 1.16% gel','EXACT_PRESENTATION_ONLY'),
  ('RESTRICTION','SRC-REST-DICLO-GEL232-BELOW-14','SOURCE_PRODUCT_ONLY','TOP','cutaneous',
   20,'mg/g','NOT_APPLICABLE','emc 15192 diclofenac 2.32% gel','EXACT_PRESENTATION_ONLY')
on conflict (candidate_type,candidate_key) do nothing;

select public.drx_phase11_refresh_source_indications_v1();
