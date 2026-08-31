CREATE OR REPLACE FUNCTION public.medindex_dose_product_fast_path_v3(p_product_key text DEFAULT NULL::text, p_drug_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
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
        'requiredInputs', r.required_inputs
      ) || jsonb_build_object(
        'regimenKey', r.regimen_key,
        'regimenKind', r.regimen_kind,
        'branchNo', r.branch_no,
        'stepNo', r.step_no,
        'startDay', r.start_day,
        'endDay', r.end_day,
        'conditionText', r.condition_text,
        'conditionReviewRequired', r.condition_review_required,
        'regimenOptionKey', r.regimen_option_key,
        'minAgeDays', r.min_age_days,
        'maxAgeDays', r.max_age_days,
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
