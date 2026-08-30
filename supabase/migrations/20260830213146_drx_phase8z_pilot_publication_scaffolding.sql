-- Phase 8Z1: fail-closed scaffolding for reviewed pilot materialization.
alter table public.dose_rules_v3
  add column if not exists min_weight_inclusive boolean not null default true,
  add column if not exists max_weight_inclusive boolean not null default true;

create table if not exists drx_dose.phase8_pilot_variant_overrides_v1 (
  drug_id uuid primary key references public.drugs(id) on delete restrict,
  exact_binding_id uuid not null references drx_dose.exact_market_product_source_bindings_v1(binding_id) on delete restrict,
  clinical_reference_id uuid not null references drx_dose.phase8_pilot_clinical_references_v1(clinical_reference_id) on delete restrict,
  expected_anomaly_codes text[] not null,
  resolved_release_key text not null references drx_norm.release_dictionary_v1(release_key) on delete restrict,
  resolved_strength_text text not null,
  dose_basis_component_concept_id uuid references public.substance_concepts_v1(concept_id) on delete restrict,
  resolution_method text not null,
  automatic_global_promotion_allowed boolean not null default false check (automatic_global_promotion_allowed=false),
  created_at timestamptz not null default now()
);

create table if not exists drx_dose.phase8_pilot_indication_provenance_v1 (
  indication_id uuid primary key references public.dose_indication_concepts_v3(indication_id) on delete restrict,
  clinical_reference_id uuid not null references drx_dose.phase8_pilot_clinical_references_v1(clinical_reference_id) on delete restrict,
  source_section text not null check (source_section in ('4.1','4.2')),
  source_section_sha256 text not null check (source_section_sha256 ~ '^[0-9a-f]{64}$'),
  derivation_note text not null,
  icd_inference_allowed boolean not null default false check (icd_inference_allowed=false),
  created_at timestamptz not null default now()
);

create table if not exists drx_runtime.shadow_diff_classifications_v1 (
  classification_id uuid primary key default gen_random_uuid(),
  comparison_id uuid not null unique references drx_runtime.shadow_comparisons_v1(comparison_id) on delete restrict,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  classification_status text not null check (classification_status='APPROVED_CLINICAL_CORRECTION'),
  finding_ids uuid[] not null,
  classified_by text not null,
  classification_note text not null,
  automatic_global_acceptance_allowed boolean not null default false check (automatic_global_acceptance_allowed=false),
  created_at timestamptz not null default now(),
  check (cardinality(finding_ids)>0)
);

CREATE OR REPLACE FUNCTION private.drx_enforce_product_publication_v3()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  snapshot_tier text;
  snapshot_source_key text;
  snapshot_version text;
  snapshot_date date;
begin
  if new.editorial_status <> 'published' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.editorial_status = 'published' then
      return new;
    end if;
  end if;

  select s.source_tier, s.source_key, s.document_version, s.document_date
    into snapshot_tier, snapshot_source_key, snapshot_version, snapshot_date
  from public.dose_source_snapshots_v3 s
  where s.snapshot_id = new.source_snapshot_id;

  if not found then
    raise exception 'DRX_V3_PRODUCT_PUBLICATION_BLOCKED: source snapshot missing';
  end if;

  if snapshot_tier not in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM') then
    if not (
      snapshot_tier='NON_EU_REGULATOR'
      and exists (
        select 1
        from drx_dose.exact_market_product_source_bindings_v1 b
        join drx_dose.exact_market_product_source_captures_v1 c
          on c.discovery_id=b.discovery_id and c.drug_id=b.drug_id and c.snapshot_id=b.snapshot_id
        where b.drug_id=new.drug_id
          and b.snapshot_id=new.source_snapshot_id
          and b.binding_status='VERIFIED'
          and c.capture_status='CAPTURED'
      )
    ) then
      raise exception 'DRX_V3_PRODUCT_PUBLICATION_BLOCKED: source tier is not publication eligible';
    end if;
  end if;

  if snapshot_source_key is distinct from new.source_key then
    raise exception 'DRX_V3_PRODUCT_PUBLICATION_BLOCKED: source key does not match snapshot';
  end if;

  if new.source_document_version is not null
     and snapshot_version is distinct from new.source_document_version then
    raise exception 'DRX_V3_PRODUCT_PUBLICATION_BLOCKED: source version does not match snapshot';
  end if;

  if new.source_document_date is not null
     and snapshot_date is distinct from new.source_document_date then
    raise exception 'DRX_V3_PRODUCT_PUBLICATION_BLOCKED: source date does not match snapshot';
  end if;

  return new;
end
$function$
;
CREATE OR REPLACE FUNCTION drx_dose.guard_v3_product_publication_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'drx_dose', 'drx_clinical', 'drx_variant'
AS $function$
declare
  v_expected_variant uuid;
begin
  if new.editorial_status not in ('verified','published') then
    return new;
  end if;

  select m.clinical_variant_id
  into v_expected_variant
  from drx_variant.market_products_v1 m
  where m.product_id=new.drug_id
    and m.binding_status='BOUND'
  limit 1;

  if v_expected_variant is null and not exists (
    select 1
    from drx_dose.phase8_pilot_variant_overrides_v1 o
    join drx_variant.market_products_v1 m on m.product_id=o.drug_id
    join drx_dose.phase8_pilot_clinical_references_v1 cr on cr.clinical_reference_id=o.clinical_reference_id
    join drx_dose.exact_market_product_source_bindings_v1 eb on eb.binding_id=o.exact_binding_id
    where o.drug_id=new.drug_id
      and m.binding_status='ANOMALY'
      and m.anomaly_codes=o.expected_anomaly_codes
      and cr.evidence_review_status='VERIFIED'
      and cr.reviewer_role='CLINICAL_REVIEWER'
      and eb.binding_status='VERIFIED'
      and o.automatic_global_promotion_allowed=false
  ) then
    raise exception 'DRx V3 product publication blocked: market product has no strict variant or reviewed Phase 8 pilot override';
  end if;

  if exists (
    select 1
    from drx_dose.exact_market_product_source_bindings_v1 b
    join drx_dose.exact_market_product_source_captures_v1 c
      on c.discovery_id=b.discovery_id
     and c.drug_id=b.drug_id
     and c.snapshot_id=b.snapshot_id
    join public.dose_source_snapshots_v3 s on s.snapshot_id=b.snapshot_id
    where b.drug_id=new.drug_id
      and b.snapshot_id=new.source_snapshot_id
      and b.binding_status='VERIFIED'
      and c.capture_status='CAPTURED'
      and c.automatic_verification_allowed=false
      and s.source_key=new.source_key
      and s.source_tier='NON_EU_REGULATOR'
      and nullif(btrim(b.reviewed_by),'') is not null
      and b.reviewed_at is not null
  ) then
    return new;
  end if;

  if exists (
    select 1
    from drx_clinical.source_documents_v1 d
    join drx_dose.product_source_bindings_v1 b on b.source_document_id=d.source_document_id
    join drx_dose.product_source_exact_evidence_v1 e on e.binding_id=b.binding_id
    where d.snapshot_id=new.source_snapshot_id
      and d.source_key=new.source_key
      and b.drug_id=new.drug_id
      and b.clinical_variant_id=v_expected_variant
      and b.binding_status='VERIFIED'
      and b.binding_scope='EXACT_MARKET_PRODUCT'
      and nullif(btrim(b.decided_by),'') is not null
      and b.reviewed_at is not null
      and nullif(btrim(e.reviewed_by),'') is not null
      and e.reviewed_at is not null
  ) then
    return new;
  end if;

  raise exception 'DRx V3 product publication blocked: no verified exact market-product source binding';
end;
$function$
;
CREATE OR REPLACE FUNCTION drx_dose.guard_v3_rule_publication_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'drx_dose', 'drx_clinical'
AS $function$
declare
  v_source_document_id uuid;
  v_candidate_count integer;
  v_candidate_id uuid;
  v_indication_status text;
begin
  if new.editorial_status not in ('verified','published') then
    return new;
  end if;

  select
    d.source_document_id,
    c.candidate_count,
    case when c.candidate_count=1 then c.candidate_concept_ids[1] end
  into v_source_document_id,v_candidate_count,v_candidate_id
  from drx_clinical.source_documents_v1 d
  join drx_clinical.source_identity_candidates_v1 c
    on c.source_document_id=d.source_document_id
  where d.snapshot_id=new.source_snapshot_id
    and d.source_key=new.source_key
    and d.section_4_2_sha256=new.source_section_sha256
  limit 1;

  if v_source_document_id is null then
    raise exception 'DRx V3 rule publication blocked: exact §4.2 provenance not found';
  end if;

  if v_candidate_count=1 and v_candidate_id is not distinct from new.substance_concept_id then
    null;
  elsif exists (
    select 1
    from drx_dose.phase8_pilot_variant_overrides_v1 o
    join drx_dose.phase8_pilot_clinical_references_v1 cr on cr.clinical_reference_id=o.clinical_reference_id
    join drx_clinical.source_documents_v1 sd on sd.source_key=cr.source_key and sd.snapshot_id=cr.source_snapshot_id
    join drx_clinical.source_identity_candidates_v1 sic on sic.source_document_id=sd.source_document_id
    where sd.source_document_id=v_source_document_id
      and cr.evidence_review_status='VERIFIED'
      and cr.reviewer_role='CLINICAL_REVIEWER'
      and o.dose_basis_component_concept_id=new.substance_concept_id
      and new.dose_basis_mode='component'
      and new.dose_basis_component_concept_id=new.substance_concept_id
      and new.substance_concept_id=any(sic.candidate_concept_ids)
      and o.automatic_global_promotion_allowed=false
  ) then
    null;
  else
    raise exception 'DRx V3 rule publication blocked: source substance identity is ambiguous or mismatched';
  end if;

  select i.editorial_status
  into v_indication_status
  from public.dose_indication_concepts_v3 i
  where i.indication_id=new.indication_id;

  if v_indication_status not in ('verified','published') then
    raise exception 'DRx V3 rule publication blocked: indication is not verified';
  end if;

  if new.safety_validation_status<>'passed'
     or nullif(btrim(new.verified_by),'') is null
     or new.verified_at is null then
    raise exception 'DRx V3 rule publication blocked: safety/reviewer gate not complete';
  end if;

  if new.editorial_status='published' and not exists (
    select 1
    from public.dose_rule_products_v3 rp
    join public.dose_products_v3 p on p.product_id=rp.product_id
    where rp.rule_id=new.rule_id
      and rp.binding_status='verified'
      and p.editorial_status in ('verified','published')
  ) then
    raise exception 'DRx V3 rule publication blocked: no verified product binding';
  end if;

  return new;
end;
$function$
;

create or replace view drx_runtime.published_product_read_model_v1 as
 SELECT p.product_id,
    p.drug_id,
    p.product_key,
    p.registry_number,
    p.pdid,
    p.trade_name,
    p.active_substance,
    p.atc_code,
    p.pharmaceutical_form,
    p.route,
    p.patient_group,
    p.version_no,
    count(DISTINCT r.rule_id)::integer AS rule_count,
    lower(concat_ws(' '::text, p.product_key, p.registry_number, p.pdid, p.trade_name, p.active_substance, p.atc_code, p.pharmaceutical_form, p.route)) AS search_text
   FROM dose_products_v3 p
     JOIN dose_rule_products_v3 b ON b.product_id = p.product_id AND b.binding_status = 'verified'::text
     JOIN dose_rules_v3 r ON r.rule_id = b.rule_id AND r.editorial_status = 'published'::text
     JOIN dose_indication_concepts_v3 i ON i.indication_id = r.indication_id AND i.editorial_status = 'published'::text
     JOIN dose_source_snapshots_v3 ps ON ps.snapshot_id = p.source_snapshot_id AND ps.source_key = p.source_key AND ((ps.source_tier = ANY (ARRAY['EMA'::text, 'EMC'::text, 'AEMPS_CIMA'::text, 'EU_NATIONAL'::text, 'KOSOVO_AKPPM'::text]))
 OR (ps.source_tier='NON_EU_REGULATOR'::text
     AND ps.document_type='official_medicines_registry_product_record'::text
     AND EXISTS (
       SELECT 1
       FROM drx_dose.exact_market_product_source_bindings_v1 eb
       JOIN drx_dose.exact_market_product_source_captures_v1 ec
         ON ec.discovery_id=eb.discovery_id AND ec.drug_id=eb.drug_id AND ec.snapshot_id=eb.snapshot_id
       WHERE eb.drug_id=p.drug_id AND eb.snapshot_id=p.source_snapshot_id
         AND eb.binding_status='VERIFIED'::text AND ec.capture_status='CAPTURED'::text
     )))
     JOIN dose_source_snapshots_v3 rs ON rs.snapshot_id = r.source_snapshot_id AND rs.source_key = r.source_key AND (rs.source_tier = ANY (ARRAY['EMA'::text, 'EMC'::text, 'AEMPS_CIMA'::text, 'EU_NATIONAL'::text, 'KOSOVO_AKPPM'::text]))
     JOIN dose_source_sections_v3 sec ON sec.snapshot_id = r.source_snapshot_id AND sec.section_code = '4.2'::text AND sec.extraction_status = 'extracted'::text AND sec.section_sha256 = r.source_section_sha256
  WHERE p.editorial_status = 'published'::text AND p.source_snapshot_id = p.source_evidence_hash AND r.source_snapshot_id = r.source_evidence_hash AND r.source_section = '4.2'::text AND r.safety_validation_status = 'passed'::text
  GROUP BY p.product_id, p.drug_id, p.product_key, p.registry_number, p.pdid, p.trade_name, p.active_substance, p.atc_code, p.pharmaceutical_form, p.route, p.patient_group, p.version_no;;

CREATE OR REPLACE FUNCTION public.medindex_dose_product_fast_path_v3(p_product_key text DEFAULT NULL::text, p_drug_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with selector_guard as (
    select
      nullif(btrim(p_product_key), '') as product_key,
      p_drug_id as drug_id
    where (nullif(btrim(p_product_key), '') is null) <> (p_drug_id is null)
  ),
  selected_product as (
    select p.*
    from selector_guard s
    join public.dose_products_v3 p
      on (
        (s.product_key is not null and p.product_key = s.product_key)
        or (s.drug_id is not null and p.drug_id = s.drug_id)
      )
    join public.dose_source_snapshots_v3 ps
      on ps.snapshot_id = p.source_snapshot_id
     and ps.source_key = p.source_key
     and (
       ps.source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM')
       or (
         ps.source_tier='NON_EU_REGULATOR'
         and ps.document_type='official_medicines_registry_product_record'
         and exists (
           select 1
           from drx_dose.exact_market_product_source_bindings_v1 eb
           join drx_dose.exact_market_product_source_captures_v1 ec
             on ec.discovery_id=eb.discovery_id and ec.drug_id=eb.drug_id and ec.snapshot_id=eb.snapshot_id
           where eb.drug_id=p.drug_id and eb.snapshot_id=p.source_snapshot_id
             and eb.binding_status='VERIFIED' and ec.capture_status='CAPTURED'
         )
       )
     )
     and (p.source_document_version is null or ps.document_version is not distinct from p.source_document_version)
     and (p.source_document_date is null or ps.document_date is not distinct from p.source_document_date)
    where p.editorial_status = 'published'
    limit 1
  ),
  rule_rows as (
    select
      r.*,
      i.indication_key,
      i.canonical_name as indication_name,
      b.preferred,
      b.conversion_enabled,
      b.tablet_split_allowed,
      b.rounding_increment_value,
      b.rounding_increment_unit,
      b.binding_status
    from selected_product p
    join public.dose_rule_products_v3 b
      on b.product_id = p.product_id
     and b.binding_status = 'verified'
    join public.dose_rules_v3 r
      on r.rule_id = b.rule_id
     and r.editorial_status = 'published'
    join public.dose_indication_concepts_v3 i
      on i.indication_id = r.indication_id
     and i.editorial_status = 'published'
    join public.dose_source_snapshots_v3 rs
      on rs.snapshot_id = r.source_snapshot_id
     and rs.source_key = r.source_key
     and rs.source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM')
     and (r.source_document_version is null or rs.document_version is not distinct from r.source_document_version)
     and (r.source_document_date is null or rs.document_date is not distinct from r.source_document_date)
    join public.dose_source_sections_v3 sec
      on sec.snapshot_id = r.source_snapshot_id
     and sec.section_code = '4.2'
     and sec.extraction_status = 'extracted'
     and sec.section_sha256 = r.source_section_sha256
    where r.source_section = '4.2'
      and r.source_snapshot_id ~ '^[0-9a-f]{64}$'
      and r.source_section_sha256 ~ '^[0-9a-f]{64}$'
      and r.source_evidence_hash ~ '^[0-9a-f]{64}$'
      and r.source_snapshot_id = r.source_evidence_hash
      and (r.source_document_version is not null or r.source_document_date is not null)
  ),
  renal_adjustment_rows as (
    select a.*
    from rule_rows r
    join public.dose_renal_adjustments_v3 a
      on a.rule_id = r.rule_id
     and a.review_status = 'verified'
    join public.dose_source_snapshots_v3 s
      on s.snapshot_id = a.source_snapshot_id
     and s.source_key = a.source_key
     and s.source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM')
     and (a.source_document_version is null or s.document_version is not distinct from a.source_document_version)
     and (a.source_document_date is null or s.document_date is not distinct from a.source_document_date)
    join public.dose_source_sections_v3 sec
      on sec.snapshot_id = a.source_snapshot_id
     and sec.section_code = '4.2'
     and sec.extraction_status = 'extracted'
     and sec.section_sha256 = a.source_section_sha256
    where a.source_snapshot_id = a.source_evidence_hash
      and a.source_section = '4.2'
  ),
  renal_adjustments_json as (
    select rule_id, jsonb_agg(
      jsonb_build_object(
        'adjustmentId', adjustment_id,
        'measureType', measure_type,
        'minValue', min_value,
        'maxValue', max_value,
        'acceptedValues', accepted_values,
        'minInclusive', min_inclusive,
        'maxInclusive', max_inclusive,
        'doseAction', dose_action,
        'doseFactor', dose_factor,
        'replacementDoseMin', replacement_dose_min,
        'replacementDoseMax', replacement_dose_max,
        'intervalMinHours', interval_min_hours,
        'intervalMaxHours', interval_max_hours,
        'source', jsonb_build_object(
          'sourceKey', source_key,
          'snapshotId', source_snapshot_id,
          'section', source_section,
          'sectionSha256', source_section_sha256,
          'evidenceHash', source_evidence_hash,
          'documentVersion', source_document_version,
          'documentDate', source_document_date,
          'official', true
        )
      )
      order by measure_type, min_value nulls first, max_value nulls last, adjustment_id
    ) as adjustments
    from renal_adjustment_rows
    group by rule_id
  ),
  hepatic_adjustment_rows as (
    select a.*
    from rule_rows r
    join public.dose_hepatic_adjustments_v3 a
      on a.rule_id = r.rule_id
     and a.review_status = 'verified'
    join public.dose_source_snapshots_v3 s
      on s.snapshot_id = a.source_snapshot_id
     and s.source_key = a.source_key
     and s.source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM')
     and (a.source_document_version is null or s.document_version is not distinct from a.source_document_version)
     and (a.source_document_date is null or s.document_date is not distinct from a.source_document_date)
    join public.dose_source_sections_v3 sec
      on sec.snapshot_id = a.source_snapshot_id
     and sec.section_code = '4.2'
     and sec.extraction_status = 'extracted'
     and sec.section_sha256 = a.source_section_sha256
    where a.source_snapshot_id = a.source_evidence_hash
      and a.source_section = '4.2'
  ),
  hepatic_adjustments_json as (
    select rule_id, jsonb_agg(
      jsonb_build_object(
        'adjustmentId', adjustment_id,
        'measureType', measure_type,
        'severityOrClass', severity_or_class,
        'doseAction', dose_action,
        'doseFactor', dose_factor,
        'replacementDoseMin', replacement_dose_min,
        'replacementDoseMax', replacement_dose_max,
        'intervalMinHours', interval_min_hours,
        'intervalMaxHours', interval_max_hours,
        'source', jsonb_build_object(
          'sourceKey', source_key,
          'snapshotId', source_snapshot_id,
          'section', source_section,
          'sectionSha256', source_section_sha256,
          'evidenceHash', source_evidence_hash,
          'documentVersion', source_document_version,
          'documentDate', source_document_date,
          'official', true
        )
      )
      order by measure_type, adjustment_id
    ) as adjustments
    from hepatic_adjustment_rows
    group by rule_id
  ),
  rules_json as (
    select jsonb_agg(
      jsonb_build_object(
        'ruleId', r.rule_id,
        'ruleKey', r.rule_key,
        'indicationId', r.indication_id,
        'indicationKey', r.indication_key,
        'indicationName', r.indication_name,
        'patientGroup', r.patient_group,
        'calculationMethod', r.calculation_method,
        'doseMinValue', r.dose_min_value,
        'doseMaxValue', r.dose_max_value,
        'doseUnit', r.dose_unit,
        'doseBasis', r.dose_basis,
        'weightBasis', r.weight_basis,
        'frequencyMode', r.frequency_mode,
        'intervalMinHours', r.interval_min_hours,
        'intervalMaxHours', r.interval_max_hours,
        'timesPerDay', r.times_per_day,
        'timesPerDayMin', r.times_per_day_min,
        'timesPerDayMax', r.times_per_day_max,
        'maxSingleDoseMg', r.max_single_dose_mg,
        'maxDailyDoseMg', r.max_daily_dose_mg,
        'maxDoses24h', r.max_doses_24h,
        'durationMode', r.duration_mode,
        'durationMinDays', r.duration_min_days,
        'durationMaxDays', r.duration_max_days,
        'reviewAfterDays', r.review_after_days,
        'minAgeMonths', r.min_age_months,
        'maxAgeMonths', r.max_age_months,
        'minWeightKg', r.min_weight_kg,
        'minWeightInclusive', r.min_weight_inclusive,
        'maxWeightKg', r.max_weight_kg,
        'maxWeightInclusive', r.max_weight_inclusive,
        'route', r.route,
        'pharmaceuticalForm', r.pharmaceutical_form,
        'prn', r.prn,
        'renalAdjustmentRequired', r.renal_adjustment_required,
        'hepaticAdjustmentRequired', r.hepatic_adjustment_required,
        'renalAdjustments', coalesce(raj.adjustments, '[]'::jsonb),
        'hepaticAdjustments', coalesce(haj.adjustments, '[]'::jsonb),
        'cardiacAdjustmentRequired', r.cardiac_adjustment_required,
        'specialistOnly', r.specialist_only,
        'outOfRangeAction', r.out_of_range_action,
        'requiredInputs', r.required_inputs,
        'versionNo', r.version_no,
        'preferred', r.preferred,
        'conversion', jsonb_build_object(
          'enabled', r.conversion_enabled,
          'tabletSplitAllowed', r.tablet_split_allowed,
          'roundingIncrementValue', r.rounding_increment_value,
          'roundingIncrementUnit', r.rounding_increment_unit,
          'status', r.binding_status
        ),
        'source', jsonb_build_object(
          'sourceKey', r.source_key,
          'snapshotId', r.source_snapshot_id,
          'section', r.source_section,
          'sectionSha256', r.source_section_sha256,
          'evidenceHash', r.source_evidence_hash,
          'documentVersion', r.source_document_version,
          'documentDate', r.source_document_date,
          'official', true
        )
      )
      order by r.indication_name, r.rule_key
    ) as rules
    from rule_rows r
    left join renal_adjustments_json raj on raj.rule_id = r.rule_id
    left join hepatic_adjustments_json haj on haj.rule_id = r.rule_id
    where (r.renal_adjustment_required is not true or raj.adjustments is not null)
      and (r.hepatic_adjustment_required is not true or haj.adjustments is not null)
  )
  select case
    when p.product_id is null or coalesce(jsonb_array_length(r.rules), 0) = 0 then null
    else jsonb_build_object(
      'schemaVersion', 'dose-product-fast-path-v3',
      'product', jsonb_build_object(
        'productKey', p.product_key,
        'drugId', p.drug_id,
        'registryNumber', p.registry_number,
        'pdid', p.pdid,
        'tradeName', p.trade_name,
        'activeSubstance', p.active_substance,
        'atcCode', p.atc_code,
        'pharmaceuticalForm', p.pharmaceutical_form,
        'route', p.route,
        'patientGroup', p.patient_group,
        'numeratorValue', p.numerator_value,
        'numeratorUnit', p.numerator_unit,
        'denominatorValue', p.denominator_value,
        'denominatorUnit', p.denominator_unit,
        'tabletSplitDenominator', p.tablet_split_denominator,
        'isScored', p.is_scored,
        'measurableIncrementMl', p.measurable_increment_ml,
        'roundingMode', p.rounding_mode,
        'versionNo', p.version_no,
        'rules', r.rules
      ),
      'meta', jsonb_build_object(
        'dataSource', 'supabase-v3-rpc',
        'failClosed', true,
        'publishedOnly', true,
        'officialVerifiedOnly', true,
        'dbReads', 1,
        'runtimeModel', 'v3-rpc'
      )
    )
  end
  from selected_product p
  cross join rules_json r
$function$
;

create or replace function public.drx_phase8_classify_shadow_diff_v1(p_comparison_id uuid,p_drug_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,drx_runtime,drx_dose
as $$
declare v_diff_codes text[]; v_status text; v_ids uuid[]; v_count integer;
begin
  select comparison_status,diff_codes into v_status,v_diff_codes
  from drx_runtime.shadow_comparisons_v1 where comparison_id=p_comparison_id for update;
  if not found or v_status<>'DIFF' then raise exception 'Phase 8 shadow classification blocked: comparison is not a DIFF'; end if;
  if v_diff_codes<>array['RULE_SEMANTICS']::text[] then
    raise exception 'Phase 8 shadow classification blocked: only reviewed RULE_SEMANTICS diffs are accepted';
  end if;
  select array_agg(finding_id order by finding_id),count(*) into v_ids,v_count
  from drx_dose.phase8_clinical_rule_findings_v1
  where drug_id=p_drug_id and review_status='RESOLVED'
    and reviewer_role='CLINICAL_REVIEWER' and automatic_resolution_allowed=false;
  if coalesce(v_count,0)=0 then raise exception 'Phase 8 shadow classification blocked: no resolved reviewer-approved findings'; end if;
  insert into drx_runtime.shadow_diff_classifications_v1(
    comparison_id,drug_id,classification_status,finding_ids,classified_by,classification_note,automatic_global_acceptance_allowed
  ) values(
    p_comparison_id,p_drug_id,'APPROVED_CLINICAL_CORRECTION',v_ids,'phase8-reviewed-finding-classifier',
    'Technical classification only: diff fully explained by resolved CLINICAL_REVIEWER-approved Phase 8 findings.',false
  )
  on conflict (comparison_id) do update set
    drug_id=excluded.drug_id,classification_status=excluded.classification_status,finding_ids=excluded.finding_ids,
    classified_by=excluded.classified_by,classification_note=excluded.classification_note,automatic_global_acceptance_allowed=false;
  return jsonb_build_object('comparisonId',p_comparison_id,'drugId',p_drug_id,
    'classificationStatus','APPROVED_CLINICAL_CORRECTION','findingCount',v_count,'automaticGlobalAcceptanceAllowed',false);
end $$;

revoke all on function public.drx_phase8_classify_shadow_diff_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.drx_phase8_classify_shadow_diff_v1(uuid,uuid) to service_role;
revoke all on drx_dose.phase8_pilot_variant_overrides_v1,drx_dose.phase8_pilot_indication_provenance_v1 from public,anon,authenticated;
revoke all on drx_runtime.shadow_diff_classifications_v1 from public,anon,authenticated;
revoke all on schema drx_dose,drx_runtime from public,anon,authenticated;
