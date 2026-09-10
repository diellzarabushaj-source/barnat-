-- DRx / MedIndex: add Synopen® 20 mg/2 mL as a Serbian reference medicine.
-- Source: https://medicamente.ai/RS/drugs/synopen-r-20mg2ml-rastvor-za-injekciju
-- Cross-check: ALIMS product information for Synopen 20 mg/2 mL.
-- Important: source label is 20 mg/2 mL; normalized concentration is 10 mg/mL.
-- JKL 0058334 is preserved in source_payload; registry_number is integer 58334 by schema.

WITH upsert_drug AS (
  INSERT INTO public.drugs (
    registry_number,
    trade_name,
    active_substance,
    strength,
    pharmaceutical_form,
    atc_code,
    drug_class,
    use_text,
    editorial_status,
    is_published,
    packaging,
    marketing_authorization_holder,
    manufacturer,
    ma_certificate,
    validity_text,
    source_payload
  ) VALUES (
    58334,
    'SYNOPEN',
    'Chloropyramine hydrochloride',
    '20 mg/2 mL',
    'Solution for injection',
    'R06AC03',
    'First-generation H1 antihistamine (substituted ethylenediamine)',
    'For acute allergic reactions, especially in the early phase, including urticaria, angioedema, drug-induced hypersensitivity, insect-bite/sting reactions, serum sickness and hay fever; may be used as adjunctive therapy in anaphylactic shock, according to Serbian product information.',
    'published',
    true,
    '10 ampoules x 2 mL',
    'ACTAVIS D.O.O. BEOGRAD',
    'PLIVA HRVATSKA D.O.O. - PROIZVODNJA (Croatia); MERCKLE GMBH (Germany)',
    '000457848 2023 59010 007 000 515 021 04 001',
    '21.05.2024 - 21.05.2074',
    jsonb_build_object(
      'source_name','Medicamente.ai',
      'source_url','https://medicamente.ai/RS/drugs/synopen-r-20mg2ml-rastvor-za-injekciju',
      'source_country','Serbia',
      'source_last_modified','2025-10-22',
      'official_verification','ALIMS product information',
      'original_name','Synopen® 20mg/2mL rastvor za injekciju',
      'original_inn','hloropiramin',
      'normalized_active_substance','Chloropyramine hydrochloride',
      'original_strength','20 mg/2 mL',
      'normalized_concentration','10 mg/mL',
      'Rrugët e lejuara','IV; IM',
      'route_evidence','ALIMS: slow IV or IM',
      'jkl','0058334',
      'ean','3850114210645',
      'ddd','20 mg',
      'dispensing_regime','Z',
      'rfzo_list','B',
      'max_price_rsd',833.00,
      'rfzo_price_rsd',831.60,
      'copay','-',
      'packaging_original','ampula, 10x2mL',
      'manufacturers',jsonb_build_array(
        'PLIVA HRVATSKA D.O.O. - PROIZVODNJA - Hrvatska',
        'MERCKLE GMBH - Nemačka'
      ),
      'authorization',jsonb_build_object(
        'type','Obnova',
        'decision_number','000457848 2023 59010 007 000 515 021 04 001',
        'valid_from','2024-05-21',
        'valid_to','2074-05-21'
      )
    )
  )
  ON CONFLICT (registry_number) DO UPDATE SET
    trade_name = EXCLUDED.trade_name,
    active_substance = EXCLUDED.active_substance,
    strength = EXCLUDED.strength,
    pharmaceutical_form = EXCLUDED.pharmaceutical_form,
    atc_code = EXCLUDED.atc_code,
    drug_class = EXCLUDED.drug_class,
    use_text = EXCLUDED.use_text,
    editorial_status = EXCLUDED.editorial_status,
    is_published = EXCLUDED.is_published,
    packaging = EXCLUDED.packaging,
    marketing_authorization_holder = EXCLUDED.marketing_authorization_holder,
    manufacturer = EXCLUDED.manufacturer,
    ma_certificate = EXCLUDED.ma_certificate,
    validity_text = EXCLUDED.validity_text,
    source_payload = EXCLUDED.source_payload
  RETURNING id
), upsert_map AS (
  INSERT INTO public.medindex_drug_core_map_v1 (
    source_drug_id,
    product_identity_id,
    substance_concept_id,
    active_substance_override,
    substance_resolution_method,
    strength_override,
    strength_status,
    form_override,
    form_family,
    release_type,
    registry_scope,
    quality_status,
    publication_gate,
    source_gap_codes,
    is_display_source,
    snapshot_version
  )
  SELECT
    id,
    id,
    '5115f08d-e020-54e5-e0f5-f3ffe910befe'::uuid,
    'Chloropyramine hydrochloride',
    'VERIFIED_MAP',
    '10 mg/mL',
    'NORMALIZED',
    NULL,
    'parenteral',
    'not_applicable',
    'REFERENCE_ONLY',
    'REFERENCE_ONLY',
    'REFERENCE_ONLY',
    ARRAY[]::text[],
    true,
    '2026-09-10-synopen-rs'
  FROM upsert_drug
  ON CONFLICT (source_drug_id) DO UPDATE SET
    product_identity_id = EXCLUDED.product_identity_id,
    substance_concept_id = EXCLUDED.substance_concept_id,
    active_substance_override = EXCLUDED.active_substance_override,
    substance_resolution_method = EXCLUDED.substance_resolution_method,
    strength_override = EXCLUDED.strength_override,
    strength_status = EXCLUDED.strength_status,
    form_override = EXCLUDED.form_override,
    form_family = EXCLUDED.form_family,
    release_type = EXCLUDED.release_type,
    registry_scope = EXCLUDED.registry_scope,
    quality_status = EXCLUDED.quality_status,
    publication_gate = EXCLUDED.publication_gate,
    source_gap_codes = EXCLUDED.source_gap_codes,
    is_display_source = EXCLUDED.is_display_source,
    snapshot_version = EXCLUDED.snapshot_version
  RETURNING product_identity_id
)
INSERT INTO public.medindex_registry_audit_v2 (
  product_identity_id,
  display_registry_number,
  trade_name,
  registry_scope,
  audit_scope,
  audit_status,
  publication_decision,
  quality_at_audit,
  identity_complete,
  source_gap_noncritical,
  audit_reason,
  evidence,
  audited_by,
  snapshot_version
)
SELECT
  product_identity_id,
  58334,
  'SYNOPEN',
  'REFERENCE_ONLY',
  'REGISTRY_IDENTITY',
  'AUDITED_REFERENCE',
  'REFERENCE_PUBLISH',
  'REFERENCE_ONLY',
  true,
  false,
  'Serbian registered medicine retained as a reference product; identity and concentration cross-checked against source product information.',
  jsonb_build_object(
    'jkl','0058334',
    'ean','3850114210645',
    'source_country','Serbia',
    'raw_source_preserved',true,
    'normalized_concentration','10 mg/mL',
    'source_last_modified','2025-10-22'
  ),
  'Source-backed import 2026-09-10',
  '2026-09-10-synopen-rs'
FROM upsert_map
ON CONFLICT (product_identity_id) DO UPDATE SET
  display_registry_number = EXCLUDED.display_registry_number,
  trade_name = EXCLUDED.trade_name,
  registry_scope = EXCLUDED.registry_scope,
  audit_scope = EXCLUDED.audit_scope,
  audit_status = EXCLUDED.audit_status,
  publication_decision = EXCLUDED.publication_decision,
  quality_at_audit = EXCLUDED.quality_at_audit,
  identity_complete = EXCLUDED.identity_complete,
  source_gap_noncritical = EXCLUDED.source_gap_noncritical,
  audit_reason = EXCLUDED.audit_reason,
  evidence = EXCLUDED.evidence,
  audited_by = EXCLUDED.audited_by,
  audited_at = now(),
  snapshot_version = EXCLUDED.snapshot_version;
