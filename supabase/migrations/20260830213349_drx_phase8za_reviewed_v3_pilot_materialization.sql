insert into drx_dose.phase8_pilot_variant_overrides_v1(
  drug_id,exact_binding_id,clinical_reference_id,expected_anomaly_codes,
  resolved_release_key,resolved_strength_text,dose_basis_component_concept_id,
  resolution_method,automatic_global_promotion_allowed
) values
('c8cd0467-da73-479c-b8e8-b785af833f59','f6fcfbd8-febe-4a5d-9c6e-c134a6d118ac','cb669c45-5e4f-4d6f-9d90-100b949d0921',
 array['COMBINATION_STRENGTH_UNPARSED']::text[],'NOT_APPLICABLE','(400 mg amoxicillin + 57 mg clavulanic acid)/5 mL',
 'f4004862-4a5f-53f0-a494-71aa2dd2b0e8','PHASE8_EXACT_PRODUCT_STRENGTH_PLUS_REVIEWED_SMPC_COMPONENT_BASIS',false),
('84a1cf4a-6568-41d7-8d13-0f2b7715acae','2c3a3fab-4b75-42a3-ba63-445a26d1e8ff','25e42ab7-31e4-4513-88d4-0f5fb897a207',
 array['RELEASE_UNRESOLVED']::text[],'NOT_APPLICABLE','500 mg per tablet',null,
 'PHASE8_EXACT_PRODUCT_SIMPLE_TABLET_NO_RELEASE_MODIFIER',false)
on conflict (drug_id) do update set
 exact_binding_id=excluded.exact_binding_id,clinical_reference_id=excluded.clinical_reference_id,
 expected_anomaly_codes=excluded.expected_anomaly_codes,resolved_release_key=excluded.resolved_release_key,
 resolved_strength_text=excluded.resolved_strength_text,dose_basis_component_concept_id=excluded.dose_basis_component_concept_id,
 resolution_method=excluded.resolution_method,automatic_global_promotion_allowed=false;

do $$
begin
  if exists (
    select 1
    from drx_dose.phase8_pilot_variant_overrides_v1 o
    join drx_variant.market_products_v1 m on m.product_id=o.drug_id
    join drx_dose.exact_market_product_source_bindings_v1 b on b.binding_id=o.exact_binding_id
    join drx_dose.phase8_pilot_clinical_references_v1 cr on cr.clinical_reference_id=o.clinical_reference_id
    where m.binding_status<>'ANOMALY'
       or m.anomaly_codes<>o.expected_anomaly_codes
       or b.binding_status<>'VERIFIED'
       or cr.evidence_review_status<>'VERIFIED'
       or cr.reviewer_role<>'CLINICAL_REVIEWER'
  ) then raise exception 'Phase 8Z blocked: pilot variant override evidence changed'; end if;
end $$;

insert into public.dose_indication_concepts_v3(
 indication_id,indication_key,canonical_name,icd10_codes,icd_verification_status,editorial_status
) values
(extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/indication-v3/IND-P8-COALMACIN-LOWER-DOSE'),
 'IND-P8-COALMACIN-LOWER-DOSE','SmPC-listed infections — lower-dose regimen','{}'::text[],'unverified','published'),
(extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/indication-v3/IND-P8-COALMACIN-HIGHER-DOSE'),
 'IND-P8-COALMACIN-HIGHER-DOSE','Selected SmPC-listed infections — higher-dose regimen','{}'::text[],'unverified','published'),
(extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/indication-v3/IND-P8-PARACETAMOL-PAIN-FEVER'),
 'IND-P8-PARACETAMOL-PAIN-FEVER','Painful and febrile conditions (SmPC-listed)','{}'::text[],'unverified','published')
on conflict (indication_key) do update set canonical_name=excluded.canonical_name,icd10_codes='{}'::text[],
 icd_verification_status='unverified',editorial_status='published',updated_at=now();

insert into drx_dose.phase8_pilot_indication_provenance_v1(
 indication_id,clinical_reference_id,source_section,source_section_sha256,derivation_note,icd_inference_allowed
) values
(extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/indication-v3/IND-P8-COALMACIN-LOWER-DOSE'),
 'cb669c45-5e4f-4d6f-9d90-100b949d0921','4.2','8c01e7eac7e6390141c803b7778f19842261a76f9cfffd40146d6a7eb0d7dc79',
 'Source-derived lower-dose regimen label from reviewed SmPC section 4.2; no ICD inference.',false),
(extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/indication-v3/IND-P8-COALMACIN-HIGHER-DOSE'),
 'cb669c45-5e4f-4d6f-9d90-100b949d0921','4.2','8c01e7eac7e6390141c803b7778f19842261a76f9cfffd40146d6a7eb0d7dc79',
 'Source-derived higher-dose regimen label for selected infections from reviewed SmPC section 4.2; no ICD inference.',false),
(extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/indication-v3/IND-P8-PARACETAMOL-PAIN-FEVER'),
 '25e42ab7-31e4-4513-88d4-0f5fb897a207','4.1','76c3ba717feb8e5c683cef2f387b7e61dc5b155c7a5f9c448de223cf97bf2500',
 'Source-derived painful/febrile conditions grouping from reviewed SmPC section 4.1; no ICD inference.',false)
on conflict (indication_id) do update set clinical_reference_id=excluded.clinical_reference_id,
 source_section=excluded.source_section,source_section_sha256=excluded.source_section_sha256,
 derivation_note=excluded.derivation_note,icd_inference_allowed=false;

insert into public.dose_products_v3(
 product_id,drug_id,product_key,registry_number,pdid,trade_name,active_substance,atc_code,
 pharmaceutical_form,route,patient_group,numerator_value,numerator_unit,denominator_value,denominator_unit,
 tablet_split_denominator,is_scored,measurable_increment_ml,rounding_mode,
 source_key,source_snapshot_id,source_evidence_hash,source_document_version,source_document_date,
 editorial_status,verified_by,verified_at,version_no
) values
(extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/dose-product-v3/PROD-COALMACIN-400-57-5ML-PDID149'),
 'c8cd0467-da73-479c-b8e8-b785af833f59','PROD-COALMACIN-400-57-5ML-PDID149','282','149',
 'CO-ALMACIN','Amoxicillin/clavulanic acid','J01CR02','Powder for oral suspension','PO','pediatric_only',
 400,'mg',5,'mL',1,false,null,'manual',
 'mk-moh-registry-52577','3b87fa53635898f326aa1feeb65196c125a3e3a250062bfd43fec4e89e93f54e',
 '3b87fa53635898f326aa1feeb65196c125a3e3a250062bfd43fec4e89e93f54e',
 'registry-entry-52577',date '2013-09-12','verified','phase8-explicit-evidence-review',now(),1),
(extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/dose-product-v3/PROD-PARACETAMOL-ALKALOID-500-PDID1457'),
 '84a1cf4a-6568-41d7-8d13-0f2b7715acae','PROD-PARACETAMOL-ALKALOID-500-PDID1457','191','1457',
 'PARACETAMOL ALKALOID','Paracetamol','N02BE01','Tablet','PO','pediatric_and_adult',
 500,'mg',1,'tablet',1,false,null,'exact',
 'mk-moh-registry-51848','c3ead98126480c75deee7c70f84a3f67252a08223d833b34782b783b3c58eabd',
 'c3ead98126480c75deee7c70f84a3f67252a08223d833b34782b783b3c58eabd',
 'registry-entry-51848',date '2013-04-03','verified','phase8-explicit-evidence-review',now(),1)
on conflict (drug_id) do update set product_key=excluded.product_key,registry_number=excluded.registry_number,pdid=excluded.pdid,
 trade_name=excluded.trade_name,active_substance=excluded.active_substance,atc_code=excluded.atc_code,
 pharmaceutical_form=excluded.pharmaceutical_form,route=excluded.route,patient_group=excluded.patient_group,
 numerator_value=excluded.numerator_value,numerator_unit=excluded.numerator_unit,denominator_value=excluded.denominator_value,
 denominator_unit=excluded.denominator_unit,tablet_split_denominator=excluded.tablet_split_denominator,is_scored=excluded.is_scored,
 measurable_increment_ml=excluded.measurable_increment_ml,rounding_mode=excluded.rounding_mode,
 source_key=excluded.source_key,source_snapshot_id=excluded.source_snapshot_id,source_evidence_hash=excluded.source_evidence_hash,
 source_document_version=excluded.source_document_version,source_document_date=excluded.source_document_date,
 editorial_status='verified',verified_by=excluded.verified_by,verified_at=excluded.verified_at,version_no=1,updated_at=now();

insert into public.dose_rules_v3(
 rule_id,rule_key,substance_concept_id,indication_id,patient_group,calculation_method,
 dose_min_value,dose_max_value,dose_unit,dose_basis,weight_basis,
 frequency_mode,interval_min_hours,interval_max_hours,times_per_day,
 max_single_dose_mg,max_daily_dose_mg,max_doses_24h,duration_mode,duration_min_days,duration_max_days,review_after_days,
 min_age_months,max_age_months,min_weight_kg,max_weight_kg,min_weight_inclusive,max_weight_inclusive,
 route,pharmaceutical_form,prn,renal_adjustment_required,hepatic_adjustment_required,cardiac_adjustment_required,
 specialist_only,out_of_range_action,required_inputs,dose_basis_mode,dose_basis_component_concept_id,
 source_key,source_snapshot_id,source_section,source_section_sha256,source_evidence_hash,
 source_document_version,source_document_date,confidence_score,review_class,safety_validation_status,editorial_status,version_no
) values
(extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/dose-rule-v3/RULE-COALMACIN-PED-MILD-25MGKGDAY-BID'),
 'RULE-COALMACIN-PED-MILD-25MGKGDAY-BID','f4004862-4a5f-53f0-a494-71aa2dd2b0e8',
 extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/indication-v3/IND-P8-COALMACIN-LOWER-DOSE'),
 'pediatric_only','dose_per_kg_per_day',25,25,'mg','per_day','kg','times_per_day',null,null,2,null,null,2,
 'review_after',null,null,14,2,null,null,40,true,false,'PO','Powder for oral suspension',false,true,true,false,false,'block',
 array['age_months','weight_kg']::text[],'component','f4004862-4a5f-53f0-a494-71aa2dd2b0e8',
 'emc-10038-phase8-clinical-ref','e70260be0728f43455403b320cf5bb970174ea6119cfd2700d695992b799908f','4.2',
 '8c01e7eac7e6390141c803b7778f19842261a76f9cfffd40146d6a7eb0d7dc79',
 'e70260be0728f43455403b320cf5bb970174ea6119cfd2700d695992b799908f',
 null,date '2026-01-14',1.0,'phase8_clinical_reviewer','pending','draft',1),
(extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/dose-rule-v3/RULE-COALMACIN-PED-SEVERE-45MGKGDAY-BID'),
 'RULE-COALMACIN-PED-SEVERE-45MGKGDAY-BID','f4004862-4a5f-53f0-a494-71aa2dd2b0e8',
 extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/indication-v3/IND-P8-COALMACIN-HIGHER-DOSE'),
 'pediatric_only','dose_per_kg_per_day',45,45,'mg','per_day','kg','times_per_day',null,null,2,null,null,2,
 'review_after',null,null,14,2,null,null,40,true,false,'PO','Powder for oral suspension',false,true,true,false,false,'block',
 array['age_months','weight_kg']::text[],'component','f4004862-4a5f-53f0-a494-71aa2dd2b0e8',
 'emc-10038-phase8-clinical-ref','e70260be0728f43455403b320cf5bb970174ea6119cfd2700d695992b799908f','4.2',
 '8c01e7eac7e6390141c803b7778f19842261a76f9cfffd40146d6a7eb0d7dc79',
 'e70260be0728f43455403b320cf5bb970174ea6119cfd2700d695992b799908f',
 null,date '2026-01-14',1.0,'phase8_clinical_reviewer','pending','draft',1),
(extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/dose-rule-v3/RULE-PARACETAMOL-ALKALOID-500-13PLUS'),
 'RULE-PARACETAMOL-ALKALOID-500-13PLUS','802bae51-48c1-57c0-a629-f8946703070e',
 extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/indication-v3/IND-P8-PARACETAMOL-PAIN-FEVER'),
 'pediatric_and_adult','age_band_fixed',500,1000,'mg','per_dose','none','prn',4,null,null,1000,4000,4,
 'none',null,null,null,192,null,null,null,true,true,'PO','Tablet',true,false,false,false,false,'block',
 array['age_months']::text[],'single_active',null,
 'emc-13494-phase8-clinical-ref','b1425114552143caae223debd32e6af15c721ab694aba0444e743cd3d99d854f','4.2',
 '4583f200d7de6e2ed9d212831f43ff5334c97f28427733aa4e74e0349f886518',
 'b1425114552143caae223debd32e6af15c721ab694aba0444e743cd3d99d854f',
 null,date '2025-09-02',1.0,'phase8_clinical_reviewer','pending','draft',1),
(extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/dose-rule-v3/RULE-PARACETAMOL-ALKALOID-500-AGE6TO12'),
 'RULE-PARACETAMOL-ALKALOID-500-AGE6TO12','802bae51-48c1-57c0-a629-f8946703070e',
 extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/indication-v3/IND-P8-PARACETAMOL-PAIN-FEVER'),
 'age_band','age_band_fixed',500,500,'mg','per_dose','none','prn',4,null,null,500,2000,4,
 'review_after',null,null,3,120,191,null,null,true,true,'PO','Tablet',true,false,false,false,false,'block',
 array['age_months']::text[],'single_active',null,
 'emc-13494-phase8-clinical-ref','b1425114552143caae223debd32e6af15c721ab694aba0444e743cd3d99d854f','4.2',
 '4583f200d7de6e2ed9d212831f43ff5334c97f28427733aa4e74e0349f886518',
 'b1425114552143caae223debd32e6af15c721ab694aba0444e743cd3d99d854f',
 null,date '2025-09-02',1.0,'phase8_clinical_reviewer','pending','draft',1)
on conflict (rule_key) do nothing;

with rr as (
 select rule_id from public.dose_rules_v3
 where rule_key in ('RULE-COALMACIN-PED-MILD-25MGKGDAY-BID','RULE-COALMACIN-PED-SEVERE-45MGKGDAY-BID')
)
insert into public.dose_renal_adjustments_v3(
 adjustment_id,rule_id,measure_type,min_value,max_value,accepted_values,min_inclusive,max_inclusive,dose_action,
 source_key,source_snapshot_id,source_section,source_section_sha256,source_evidence_hash,
 source_document_version,source_document_date,review_status,verified_by,verified_at
)
select extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/renal-v3/'||r.rule_id||'/gt30'),
 r.rule_id,'CrCl_mL_min',30,null,'{}'::text[],false,true,'no_adjustment',
 'emc-10038-phase8-clinical-ref','e70260be0728f43455403b320cf5bb970174ea6119cfd2700d695992b799908f','4.2',
 '8c01e7eac7e6390141c803b7778f19842261a76f9cfffd40146d6a7eb0d7dc79',
 'e70260be0728f43455403b320cf5bb970174ea6119cfd2700d695992b799908f',null,date '2026-01-14',
 'verified','USER_ATTESTED_CLINICAL_REVIEWER',now()
from rr r
union all
select extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/renal-v3/'||r.rule_id||'/lt30'),
 r.rule_id,'CrCl_mL_min',null,30,'{}'::text[],true,false,'avoid',
 'emc-10038-phase8-clinical-ref','e70260be0728f43455403b320cf5bb970174ea6119cfd2700d695992b799908f','4.2',
 '8c01e7eac7e6390141c803b7778f19842261a76f9cfffd40146d6a7eb0d7dc79',
 'e70260be0728f43455403b320cf5bb970174ea6119cfd2700d695992b799908f',null,date '2026-01-14',
 'verified','USER_ATTESTED_CLINICAL_REVIEWER',now()
from rr r
on conflict (adjustment_id) do nothing;

with rr as (
 select rule_id from public.dose_rules_v3
 where rule_key in ('RULE-COALMACIN-PED-MILD-25MGKGDAY-BID','RULE-COALMACIN-PED-SEVERE-45MGKGDAY-BID')
)
insert into public.dose_hepatic_adjustments_v3(
 adjustment_id,rule_id,measure_type,severity_or_class,dose_action,
 source_key,source_snapshot_id,source_section,source_section_sha256,source_evidence_hash,
 source_document_version,source_document_date,review_status,verified_by,verified_at
)
select extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/hepatic-v3/'||r.rule_id||'/caution'),
 r.rule_id,'hepatic_impairment_textual',array['hepatic impairment']::text[],'specialist_review',
 'emc-10038-phase8-clinical-ref','e70260be0728f43455403b320cf5bb970174ea6119cfd2700d695992b799908f','4.2',
 '8c01e7eac7e6390141c803b7778f19842261a76f9cfffd40146d6a7eb0d7dc79',
 'e70260be0728f43455403b320cf5bb970174ea6119cfd2700d695992b799908f',null,date '2026-01-14',
 'verified','USER_ATTESTED_CLINICAL_REVIEWER',now()
from rr r
on conflict (adjustment_id) do nothing;

do $$
begin
  if not exists (select 1 from public.dose_rules_v3 where rule_key='RULE-COALMACIN-PED-MILD-25MGKGDAY-BID'
       and min_age_months=2 and max_weight_kg=40 and max_weight_inclusive=false)
  or not exists (select 1 from public.dose_rules_v3 where rule_key='RULE-COALMACIN-PED-SEVERE-45MGKGDAY-BID'
       and min_age_months=2 and max_weight_kg=40 and max_weight_inclusive=false)
  or not exists (select 1 from public.dose_rules_v3 where rule_key='RULE-PARACETAMOL-ALKALOID-500-13PLUS'
       and min_age_months=192 and dose_min_value=500 and dose_max_value=1000)
  or not exists (select 1 from public.dose_rules_v3 where rule_key='RULE-PARACETAMOL-ALKALOID-500-AGE6TO12'
       and min_age_months=120 and max_age_months=191 and dose_min_value=500 and dose_max_value=500 and max_doses_24h=4)
  then raise exception 'Phase 8Z blocked: approved corrections not materialized exactly'; end if;

  if (select count(*) from drx_dose.phase8_clinical_rule_findings_v1 where review_status='APPROVED')<>6 then
    raise exception 'Phase 8Z blocked: expected six approved findings';
  end if;
end $$;

update drx_dose.phase8_clinical_rule_findings_v1
set review_status='RESOLVED',
    review_note=review_note||' Materialized in reviewed V3 pilot rule; V2 unchanged.',
    automatic_resolution_allowed=false
where review_status='APPROVED'
  and drug_id in ('c8cd0467-da73-479c-b8e8-b785af833f59','84a1cf4a-6568-41d7-8d13-0f2b7715acae');

update public.dose_rules_v3
set safety_validation_status='passed',
    safety_validator_version='phase8-reviewed-findings-structural-safety-v1',
    safety_validated_at=now(),editorial_status='verified',
    verified_by='USER_ATTESTED_CLINICAL_REVIEWER',verified_at=now(),updated_at=now()
where rule_key in (
 'RULE-COALMACIN-PED-MILD-25MGKGDAY-BID','RULE-COALMACIN-PED-SEVERE-45MGKGDAY-BID',
 'RULE-PARACETAMOL-ALKALOID-500-13PLUS','RULE-PARACETAMOL-ALKALOID-500-AGE6TO12');

insert into public.dose_rule_products_v3(
 binding_id,rule_id,product_id,match_method,preferred,conversion_enabled,tablet_split_allowed,
 rounding_increment_value,rounding_increment_unit,binding_status,verified_by,verified_at
)
select extensions.uuid_generate_v5(extensions.uuid_ns_url(),'https://drx.local/rule-product-v3/'||r.rule_key||'/'||p.product_key),
 r.rule_id,p.product_id,'phase8_reviewed_exact_product_clinical_reference',true,true,false,
 case when p.trade_name='PARACETAMOL ALKALOID' then 1 else null end,
 case when p.trade_name='PARACETAMOL ALKALOID' then 'tablet' else null end,
 'verified','USER_ATTESTED_CLINICAL_REVIEWER',now()
from public.dose_rules_v3 r
join public.dose_products_v3 p on (
 (r.rule_key like 'RULE-COALMACIN-%' and p.drug_id='c8cd0467-da73-479c-b8e8-b785af833f59')
 or (r.rule_key like 'RULE-PARACETAMOL-ALKALOID-%' and p.drug_id='84a1cf4a-6568-41d7-8d13-0f2b7715acae')
)
where r.rule_key in (
 'RULE-COALMACIN-PED-MILD-25MGKGDAY-BID','RULE-COALMACIN-PED-SEVERE-45MGKGDAY-BID',
 'RULE-PARACETAMOL-ALKALOID-500-13PLUS','RULE-PARACETAMOL-ALKALOID-500-AGE6TO12')
on conflict (rule_id,product_id) do update set match_method=excluded.match_method,preferred=true,conversion_enabled=true,
 tablet_split_allowed=false,rounding_increment_value=excluded.rounding_increment_value,rounding_increment_unit=excluded.rounding_increment_unit,
 binding_status='verified',verified_by=excluded.verified_by,verified_at=excluded.verified_at;

insert into public.dose_legacy_comparisons_v3(rule_id,product_id,comparison_status,conflicts,missing_fields)
select r.rule_id,p.product_id,'compatible',
 case
  when r.rule_key like 'RULE-COALMACIN-%' then jsonb_build_array(
    jsonb_build_object('field','minAgeMonths','v2',0,'v3',2,'basis','CLINICAL_REVIEWER_APPROVED'),
    jsonb_build_object('field','maxWeightKg','v2',null,'v3','<40','basis','CLINICAL_REVIEWER_APPROVED'))
  when r.rule_key='RULE-PARACETAMOL-ALKALOID-500-13PLUS' then jsonb_build_array(
    jsonb_build_object('field','minAgeMonths','v2',156,'v3',192,'basis','CLINICAL_REVIEWER_APPROVED'))
  else jsonb_build_array(
    jsonb_build_object('field','ageBandMonths','v2',jsonb_build_array(72,155),'v3',jsonb_build_array(120,191),'basis','CLINICAL_REVIEWER_APPROVED'),
    jsonb_build_object('field','doseMg','v2','250-500','v3',500,'basis','CLINICAL_REVIEWER_APPROVED'),
    jsonb_build_object('field','tabletSplit','v2',true,'v3',false,'basis','CLINICAL_REVIEWER_APPROVED'))
 end,'{}'::text[]
from public.dose_rules_v3 r
join public.dose_products_v3 p on (
 (r.rule_key like 'RULE-COALMACIN-%' and p.drug_id='c8cd0467-da73-479c-b8e8-b785af833f59')
 or (r.rule_key like 'RULE-PARACETAMOL-ALKALOID-%' and p.drug_id='84a1cf4a-6568-41d7-8d13-0f2b7715acae')
)
where r.rule_key in (
 'RULE-COALMACIN-PED-MILD-25MGKGDAY-BID','RULE-COALMACIN-PED-SEVERE-45MGKGDAY-BID',
 'RULE-PARACETAMOL-ALKALOID-500-13PLUS','RULE-PARACETAMOL-ALKALOID-500-AGE6TO12')
on conflict (rule_id,product_id) do update set comparison_status='compatible',conflicts=excluded.conflicts,
 missing_fields='{}'::text[],compared_at=now();

update public.dose_products_v3
set editorial_status='published',updated_at=now()
where drug_id in ('c8cd0467-da73-479c-b8e8-b785af833f59','84a1cf4a-6568-41d7-8d13-0f2b7715acae');

update public.dose_rules_v3
set editorial_status='published',updated_at=now()
where rule_key in (
 'RULE-COALMACIN-PED-MILD-25MGKGDAY-BID','RULE-COALMACIN-PED-SEVERE-45MGKGDAY-BID',
 'RULE-PARACETAMOL-ALKALOID-500-13PLUS','RULE-PARACETAMOL-ALKALOID-500-AGE6TO12');
