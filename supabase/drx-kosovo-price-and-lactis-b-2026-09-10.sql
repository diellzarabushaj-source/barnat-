-- DRx / MedIndex catalog patch — Kosovo pricing + Lactis B variants
-- Date: 2026-09-10
-- Data-only patch; safe to re-run.
--
-- Sources:
--   Synopen base identity: existing Synopen reference record + current Kosovo comparator price
--   Kosovo comparator: Allergosan 10 mg/mL solution for injection, 10 x 2 mL, registry no. 3039
--   LACTIS B COMPLEX sachets: https://borapharmacy.com/product?id=8744
--   LACTIS B-COMPLEX FLACON A8: https://barnatoreonline-ks.com/product-details.php?product=lactis-b-complex-flacon-a8
--   Secondary flacon source: https://borapharmacy.com/product?id=9742

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) SYNOPEN — Kosovo price REFERENCE, not a Synopen-specific official price.
-- Exact local comparator: Allergosan 10 mg/mL, solution for injection,
-- 10 ampoules x 2 mL; Kosovo registry no. 3039; validity 01.05–31.12.2026.
-- ---------------------------------------------------------------------------
UPDATE public.drugs
SET wholesale_price = 7.67,
    wholesale_with_margin = 9.59,
    vat_text = '8 %',
    retail_price = 10.35,
    updated_at = now(),
    source_payload = (
      source_payload
      - 'max_price_rsd'
      - 'rfzo_price_rsd'
      - 'copay'
      - 'rfzo_list'
    ) || jsonb_build_object(
      'price_display_currency','EUR',
      'price_display_market','Kosovo',
      'kosovo_price_reference_eur',10.35,
      'kosovo_wholesale_reference_eur',7.67,
      'kosovo_wholesale_with_margin_reference_eur',9.59,
      'kosovo_vat_reference','8 %',
      'kosovo_price_reference_product','Allergosan 10mg/ml solution for injection',
      'kosovo_price_reference_registry_number',3039,
      'kosovo_price_reference_packaging','Box containing 10 ampoules x 2ml',
      'kosovo_price_reference_validity','01.05.2026 - 31.12.2026',
      'kosovo_price_reference_basis','Exact INN/concentration/form/pack comparator; not a Synopen-specific official Kosovo price',
      'kosovo_price_reference_source','Current DRx Kosovo registry import / Ministry of Health price list',
      'kosovo_price_reference_source_url','https://msh.rks-gov.net/Documents/Index/267?year=2026',
      'foreign_price_archive',jsonb_build_object(
        'country','Serbia',
        'max_wholesale_rsd',833.00,
        'rfzo_rsd',831.60,
        'displayed_in_ui',false
      )
    )
WHERE registry_number = 58334
  AND upper(trade_name) = 'SYNOPEN';

UPDATE public.medindex_registry_audit_v2 a
SET evidence = coalesce(a.evidence,'{}'::jsonb) || jsonb_build_object(
      'kosovo_price_reference_eur',10.35,
      'kosovo_price_reference_product','Allergosan 10mg/ml solution for injection',
      'kosovo_price_reference_registry_number',3039,
      'kosovo_price_reference_basis','Exact INN/concentration/form/pack comparator; not Synopen-specific current official Kosovo price',
      'kosovo_price_reference_validity','01.05.2026 - 31.12.2026'
    ),
    audited_at = now()
FROM public.drugs d
WHERE a.product_identity_id = d.id
  AND d.registry_number = 58334
  AND upper(d.trade_name) = 'SYNOPEN';

-- ---------------------------------------------------------------------------
-- 2) LACTIS B COMPLEX — sachet/powder variant, Bora Pharmacy Kosovo.
-- Retail price: EUR 8.40. Retailer direction: 1 sachet 2–3 times daily.
-- ---------------------------------------------------------------------------
UPDATE public.drugs
SET active_substance = 'Lactic acid bacteria (probiotic ferments); B-complex vitamins; inulin',
    strength = NULL,
    pharmaceutical_form = 'Oral powder in sachet',
    atc_code = NULL,
    drug_class = 'Food supplement — probiotic + B-complex vitamins + prebiotic inulin',
    use_text = 'Food supplement marketed to support restoration and balance of intestinal flora; retailer claims are not medicinal indications.',
    editorial_status = 'published',
    is_published = true,
    product_status = 'Food supplement — excluded from medicine registry',
    retail_price = 8.40,
    updated_at = now(),
    source_payload = jsonb_build_object(
      'source_name','Bora Pharmacy Kosovo — LACTIS B COMPLEX',
      'source_url','https://borapharmacy.com/product?id=8744',
      'source_type','kosovo_retailer_product_page',
      'source_country','Kosovo',
      'verified_at','2026-09-10',
      'regulatory_scope','food_supplement_non_medicinal',
      'category','Shtesat ushqimore > Lukthi > Lactobacile',
      'price_eur',8.40,
      'price_type','retail',
      'price_currency','EUR',
      'price_market','Kosovo',
      'composition_summary','Fermente laktike (probiotik), vitamina B kompleks dhe inulinë (prebiotik).',
      'recommended_dose','1 qese, 2 ose 3 herë në ditë',
      'administration','Direkt në gojë ose në rreth 100 mL ujë/pije jo të nxehtë; mundësisht ndërmjet vakteve.',
      'route','PO',
      'captured_from_user_source',true,
      'registry_exclusion_reason','Food supplement; no ATC medicinal classification or medicine-registration identity supplied by source.'
    )
WHERE id = (
  SELECT id FROM public.drugs
  WHERE upper(trade_name)='LACTIS B COMPLEX'
  ORDER BY created_at LIMIT 1
);

INSERT INTO public.drugs (
  trade_name, active_substance, pharmaceutical_form, atc_code, drug_class,
  use_text, editorial_status, is_published, product_status, retail_price,
  source_payload
)
SELECT
  'LACTIS B COMPLEX',
  'Lactic acid bacteria (probiotic ferments); B-complex vitamins; inulin',
  'Oral powder in sachet',
  NULL,
  'Food supplement — probiotic + B-complex vitamins + prebiotic inulin',
  'Food supplement marketed to support restoration and balance of intestinal flora; retailer claims are not medicinal indications.',
  'published', true,
  'Food supplement — excluded from medicine registry',
  8.40,
  jsonb_build_object(
    'source_name','Bora Pharmacy Kosovo — LACTIS B COMPLEX',
    'source_url','https://borapharmacy.com/product?id=8744',
    'source_type','kosovo_retailer_product_page',
    'source_country','Kosovo',
    'verified_at','2026-09-10',
    'regulatory_scope','food_supplement_non_medicinal',
    'category','Shtesat ushqimore > Lukthi > Lactobacile',
    'price_eur',8.40,
    'price_type','retail',
    'price_currency','EUR',
    'price_market','Kosovo',
    'composition_summary','Fermente laktike (probiotik), vitamina B kompleks dhe inulinë (prebiotik).',
    'recommended_dose','1 qese, 2 ose 3 herë në ditë',
    'administration','Direkt në gojë ose në rreth 100 mL ujë/pije jo të nxehtë; mundësisht ndërmjet vakteve.',
    'route','PO',
    'captured_from_user_source',true,
    'registry_exclusion_reason','Food supplement; no ATC medicinal classification or medicine-registration identity supplied by source.'
  )
WHERE NOT EXISTS (
  SELECT 1 FROM public.drugs WHERE upper(trade_name)='LACTIS B COMPLEX'
);

WITH d AS (
  SELECT id FROM public.drugs
  WHERE upper(trade_name)='LACTIS B COMPLEX'
  ORDER BY created_at LIMIT 1
), c AS (
  SELECT coalesce(
    (SELECT m.substance_concept_id FROM public.medindex_drug_core_map_v1 m JOIN d ON d.id=m.source_drug_id LIMIT 1),
    gen_random_uuid()
  ) AS concept_id
)
INSERT INTO public.medindex_drug_core_map_v1 (
  source_drug_id, product_identity_id, substance_concept_id,
  active_substance_override, substance_resolution_method,
  strength_override, strength_status, form_override, form_family, release_type,
  registry_scope, quality_status, publication_gate, source_gap_codes,
  is_display_source, snapshot_version
)
SELECT d.id, d.id, c.concept_id,
       'Lactic acid bacteria (probiotic ferments); B-complex vitamins; inulin',
       'PRODUCT_OVERRIDE', NULL, 'normalized', 'Oral powder in sachet',
       'oral_powder', 'not_applicable', 'EXCLUDED_NON_MEDICINE', 'EXCLUDED',
       'EXCLUDED', ARRAY[]::text[], true, '2026-09-10-lactis-b'
FROM d CROSS JOIN c
ON CONFLICT (source_drug_id) DO UPDATE SET
  product_identity_id=excluded.product_identity_id,
  substance_concept_id=excluded.substance_concept_id,
  active_substance_override=excluded.active_substance_override,
  substance_resolution_method=excluded.substance_resolution_method,
  strength_override=excluded.strength_override,
  strength_status=excluded.strength_status,
  form_override=excluded.form_override,
  form_family=excluded.form_family,
  release_type=excluded.release_type,
  registry_scope=excluded.registry_scope,
  quality_status=excluded.quality_status,
  publication_gate=excluded.publication_gate,
  source_gap_codes=excluded.source_gap_codes,
  is_display_source=excluded.is_display_source,
  snapshot_version=excluded.snapshot_version;

INSERT INTO public.medindex_registry_audit_v2 (
  product_identity_id, display_registry_number, trade_name, registry_scope,
  audit_scope, audit_status, publication_decision, quality_at_audit,
  identity_complete, source_gap_noncritical, audit_reason, evidence,
  audited_by, snapshot_version
)
SELECT d.id, NULL, 'LACTIS B COMPLEX', 'EXCLUDED_NON_MEDICINE',
       'REGISTRY_IDENTITY', 'AUDITED_EXCLUDED', 'EXCLUDE', 'EXCLUDED',
       false, false,
       'Food supplement retained in searchable non-ATC catalog; not represented as a registered medicine.',
       jsonb_build_object('source','Bora Pharmacy Kosovo','source_url','https://borapharmacy.com/product?id=8744','price_eur',8.40,'dose','1 sachet 2–3 times daily','non_medicine',true),
       'Source-backed import 2026-09-10', '2026-09-10-lactis-b'
FROM (
  SELECT id FROM public.drugs WHERE upper(trade_name)='LACTIS B COMPLEX' ORDER BY created_at LIMIT 1
) d
ON CONFLICT (product_identity_id) DO UPDATE SET
  trade_name=excluded.trade_name,
  registry_scope=excluded.registry_scope,
  audit_scope=excluded.audit_scope,
  audit_status=excluded.audit_status,
  publication_decision=excluded.publication_decision,
  quality_at_audit=excluded.quality_at_audit,
  identity_complete=excluded.identity_complete,
  source_gap_noncritical=excluded.source_gap_noncritical,
  audit_reason=excluded.audit_reason,
  evidence=excluded.evidence,
  audited_by=excluded.audited_by,
  audited_at=now(),
  snapshot_version=excluded.snapshot_version;

-- ---------------------------------------------------------------------------
-- 3) LACTIS B-COMPLEX FLACON A8 — separate oral flacon variant.
-- Primary Kosovo retailer: Barnatore Online, EUR 6.39 incl. VAT, SKU LACZBR588.
-- Secondary Kosovo retailer: Bora Pharmacy, EUR 6.04.
-- Retailer dosing differs: 1/day vs 1–2/day; preserve source variance.
-- ---------------------------------------------------------------------------
UPDATE public.drugs
SET active_substance = 'Probiotic lactic cultures (Lactobacilli; Bifidobacteria); B-complex vitamins; inulin (prebiotic)',
    strength = NULL,
    pharmaceutical_form = 'Oral liquid in flacon (mixed immediately before use)',
    atc_code = NULL,
    drug_class = 'Food supplement — probiotic + B-complex vitamins + prebiotic/inulin',
    use_text = 'Food supplement marketed to support maintenance/balance of intestinal flora; retailer claims are not medicinal indications.',
    editorial_status = 'published',
    is_published = true,
    packaging = 'FLACON A8',
    product_status = 'Food supplement — excluded from medicine registry',
    retail_price = 6.39,
    vat_text = 'Included in listed retail price',
    updated_at = now(),
    source_payload = jsonb_build_object(
      'source_name','Barnatore Online Kosovo — LACTIS B-COMPLEX FLACON A8',
      'source_url','https://barnatoreonline-ks.com/product-details.php?product=lactis-b-complex-flacon-a8',
      'source_type','kosovo_retailer_product_page',
      'source_country','Kosovo',
      'verified_at','2026-09-10',
      'regulatory_scope','food_supplement_non_medicinal',
      'sku','LACZBR588',
      'packaging_text','FLACON A8',
      'price_eur',6.39,
      'price_type','retail_including_vat',
      'price_currency','EUR',
      'price_market','Kosovo',
      'shipping_kosovo_eur',2.00,
      'composition_summary','Probiotic/lactic cultures including Lactobacilli and Bifidobacteria; B-complex vitamins; inulin/prebiotic.',
      'recommended_dose','1 flakon/ditë per Barnatore Online; Bora Pharmacy lists 1–2 flakone/ditë',
      'dose_source_variance',true,
      'dose_source_note','Retailer instructions differ; preserve source-specific directions rather than treating one as a universal clinical regimen.',
      'administration','Rrotullo kapakun kundër akrepave derisa përmbajtja e kapakut të bjerë në tretësirë; tunde mirë; hape dhe pije menjëherë.',
      'route','PO',
      'price_sources',jsonb_build_array(
        jsonb_build_object('retailer','Barnatore Online Kosovo','price_eur',6.39,'includes_vat',true,'verified_at','2026-09-10','url','https://barnatoreonline-ks.com/product-details.php?product=lactis-b-complex-flacon-a8'),
        jsonb_build_object('retailer','Bora Pharmacy Kosovo','price_eur',6.04,'includes_vat',NULL,'verified_at','2026-09-10','url','https://borapharmacy.com/product?id=9742')
      ),
      'captured_from_user_source',true,
      'web_verified_price',true,
      'registry_exclusion_reason','Food supplement; no ATC medicinal classification or medicine-registration identity supplied by source.'
    )
WHERE id = (
  SELECT id FROM public.drugs
  WHERE upper(trade_name)='LACTIS B-COMPLEX FLACON A8'
  ORDER BY created_at LIMIT 1
);

INSERT INTO public.drugs (
  trade_name, active_substance, pharmaceutical_form, atc_code, drug_class,
  use_text, editorial_status, is_published, packaging, product_status,
  retail_price, vat_text, source_payload
)
SELECT
  'LACTIS B-COMPLEX FLACON A8',
  'Probiotic lactic cultures (Lactobacilli; Bifidobacteria); B-complex vitamins; inulin (prebiotic)',
  'Oral liquid in flacon (mixed immediately before use)',
  NULL,
  'Food supplement — probiotic + B-complex vitamins + prebiotic/inulin',
  'Food supplement marketed to support maintenance/balance of intestinal flora; retailer claims are not medicinal indications.',
  'published', true, 'FLACON A8',
  'Food supplement — excluded from medicine registry',
  6.39, 'Included in listed retail price',
  jsonb_build_object(
    'source_name','Barnatore Online Kosovo — LACTIS B-COMPLEX FLACON A8',
    'source_url','https://barnatoreonline-ks.com/product-details.php?product=lactis-b-complex-flacon-a8',
    'source_type','kosovo_retailer_product_page',
    'source_country','Kosovo',
    'verified_at','2026-09-10',
    'regulatory_scope','food_supplement_non_medicinal',
    'sku','LACZBR588',
    'packaging_text','FLACON A8',
    'price_eur',6.39,
    'price_type','retail_including_vat',
    'price_currency','EUR',
    'price_market','Kosovo',
    'shipping_kosovo_eur',2.00,
    'composition_summary','Probiotic/lactic cultures including Lactobacilli and Bifidobacteria; B-complex vitamins; inulin/prebiotic.',
    'recommended_dose','1 flakon/ditë per Barnatore Online; Bora Pharmacy lists 1–2 flakone/ditë',
    'dose_source_variance',true,
    'dose_source_note','Retailer instructions differ; preserve source-specific directions rather than treating one as a universal clinical regimen.',
    'administration','Rrotullo kapakun kundër akrepave derisa përmbajtja e kapakut të bjerë në tretësirë; tunde mirë; hape dhe pije menjëherë.',
    'route','PO',
    'price_sources',jsonb_build_array(
      jsonb_build_object('retailer','Barnatore Online Kosovo','price_eur',6.39,'includes_vat',true,'verified_at','2026-09-10','url','https://barnatoreonline-ks.com/product-details.php?product=lactis-b-complex-flacon-a8'),
      jsonb_build_object('retailer','Bora Pharmacy Kosovo','price_eur',6.04,'includes_vat',NULL,'verified_at','2026-09-10','url','https://borapharmacy.com/product?id=9742')
    ),
    'captured_from_user_source',true,
    'web_verified_price',true,
    'registry_exclusion_reason','Food supplement; no ATC medicinal classification or medicine-registration identity supplied by source.'
  )
WHERE NOT EXISTS (
  SELECT 1 FROM public.drugs WHERE upper(trade_name)='LACTIS B-COMPLEX FLACON A8'
);

WITH d AS (
  SELECT id FROM public.drugs
  WHERE upper(trade_name)='LACTIS B-COMPLEX FLACON A8'
  ORDER BY created_at LIMIT 1
), c AS (
  SELECT coalesce(
    (SELECT m.substance_concept_id FROM public.medindex_drug_core_map_v1 m JOIN d ON d.id=m.source_drug_id LIMIT 1),
    gen_random_uuid()
  ) AS concept_id
)
INSERT INTO public.medindex_drug_core_map_v1 (
  source_drug_id, product_identity_id, substance_concept_id,
  active_substance_override, substance_resolution_method,
  strength_override, strength_status, form_override, form_family, release_type,
  registry_scope, quality_status, publication_gate, source_gap_codes,
  is_display_source, snapshot_version
)
SELECT d.id, d.id, c.concept_id,
       'Probiotic lactic cultures (Lactobacilli; Bifidobacteria); B-complex vitamins; inulin (prebiotic)',
       'PRODUCT_OVERRIDE', NULL, 'normalized',
       'Oral liquid in flacon (mixed immediately before use)',
       'oral_liquid', 'not_applicable', 'EXCLUDED_NON_MEDICINE', 'EXCLUDED',
       'EXCLUDED', ARRAY[]::text[], true, '2026-09-10-lactis-b-flacon-a8-v2'
FROM d CROSS JOIN c
ON CONFLICT (source_drug_id) DO UPDATE SET
  product_identity_id=excluded.product_identity_id,
  substance_concept_id=excluded.substance_concept_id,
  active_substance_override=excluded.active_substance_override,
  substance_resolution_method=excluded.substance_resolution_method,
  strength_override=excluded.strength_override,
  strength_status=excluded.strength_status,
  form_override=excluded.form_override,
  form_family=excluded.form_family,
  release_type=excluded.release_type,
  registry_scope=excluded.registry_scope,
  quality_status=excluded.quality_status,
  publication_gate=excluded.publication_gate,
  source_gap_codes=excluded.source_gap_codes,
  is_display_source=excluded.is_display_source,
  snapshot_version=excluded.snapshot_version;

INSERT INTO public.medindex_registry_audit_v2 (
  product_identity_id, display_registry_number, trade_name, registry_scope,
  audit_scope, audit_status, publication_decision, quality_at_audit,
  identity_complete, source_gap_noncritical, audit_reason, evidence,
  audited_by, snapshot_version
)
SELECT d.id, NULL, 'LACTIS B-COMPLEX FLACON A8', 'EXCLUDED_NON_MEDICINE',
       'REGISTRY_IDENTITY', 'AUDITED_EXCLUDED', 'EXCLUDE', 'EXCLUDED',
       false, false,
       'Food supplement retained in searchable non-ATC catalog; not represented as a registered medicine.',
       jsonb_build_object(
         'primary_retailer','Barnatore Online Kosovo',
         'primary_source_url','https://barnatoreonline-ks.com/product-details.php?product=lactis-b-complex-flacon-a8',
         'sku','LACZBR588',
         'primary_price_eur',6.39,
         'price_includes_vat',true,
         'secondary_retailer','Bora Pharmacy Kosovo',
         'secondary_source_url','https://borapharmacy.com/product?id=9742',
         'secondary_price_eur',6.04,
         'dose_source_variance',true,
         'barnatore_online_dose','1 flakon daily',
         'bora_pharmacy_dose','1–2 flakone daily',
         'non_medicine',true
       ),
       'Source-backed import 2026-09-10', '2026-09-10-lactis-b-flacon-a8-v2'
FROM (
  SELECT id FROM public.drugs WHERE upper(trade_name)='LACTIS B-COMPLEX FLACON A8' ORDER BY created_at LIMIT 1
) d
ON CONFLICT (product_identity_id) DO UPDATE SET
  trade_name=excluded.trade_name,
  registry_scope=excluded.registry_scope,
  audit_scope=excluded.audit_scope,
  audit_status=excluded.audit_status,
  publication_decision=excluded.publication_decision,
  quality_at_audit=excluded.quality_at_audit,
  identity_complete=excluded.identity_complete,
  source_gap_noncritical=excluded.source_gap_noncritical,
  audit_reason=excluded.audit_reason,
  evidence=excluded.evidence,
  audited_by=excluded.audited_by,
  audited_at=now(),
  snapshot_version=excluded.snapshot_version;

COMMIT;
