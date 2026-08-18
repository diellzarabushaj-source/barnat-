-- 2026-08-18 — pediatric in_review cleanup, batch 3.
--
-- 15 Gentipharm products are backed only by the manufacturer's registered-drugs
-- catalog. The catalog confirms product identity but contains no pediatric
-- posology, age/weight limits or product-specific pediatric instructions.
-- ETOLAX #2430 has a first-party source mismatch: the official product page says
-- 500/8 mg while its linked KÜB identifies ETOLAX 500/4 mg. All 16 records are
-- therefore moved to needs_source and remain fail-closed.

BEGIN;

UPDATE public.drugs SET
  pediatric_dose_summary = NULL,
  pediatric_indication = NULL,
  pediatric_use_status = 'PA TË DHËNA',
  pediatric_min_age_value = NULL,
  pediatric_min_age_unit = NULL,
  pediatric_max_age_value = NULL,
  pediatric_max_age_unit = NULL,
  pediatric_min_weight_kg = NULL,
  pediatric_max_weight_kg = NULL,
  pediatric_dose_min = NULL,
  pediatric_dose_max = NULL,
  pediatric_dose_unit = NULL,
  pediatric_dose_basis = NULL,
  pediatric_doses_per_day = NULL,
  pediatric_interval_hours = NULL,
  pediatric_max_doses_per_day = NULL,
  pediatric_min_interval_hours = NULL,
  pediatric_max_single_value = NULL,
  pediatric_max_single_unit = NULL,
  pediatric_max_daily_value = NULL,
  pediatric_max_daily_unit = NULL,
  pediatric_route = NULL,
  pediatric_restriction = 'KËRKON BURIM PRODUCT-SPECIFIC PËR PEDIATRI: katalogu zyrtar i Gentipharm konfirmon identitetin e produktit (emër/formë/fortësi), por nuk publikon posologji, kufij moshe/peshe ose udhëzim pediatrik. Mos transfero dozë nga një markë/comparator tjetër.',
  pediatric_source_url = 'https://www.gentipharm.com/registered-drugs',
  pediatric_source_section = 'Official manufacturer catalog — product identity only; product-specific pediatric RCP/leaflet required',
  pediatric_verification_status = 'needs_source',
  pediatric_verified_at = NULL
WHERE registry_number IN (
  1569,1573,1574,1578,1594,1633,1635,1636,1642,1648,1650,1651,1656,1657,1660
);

UPDATE public.drugs SET
  pediatric_dose_summary = NULL,
  pediatric_indication = NULL,
  pediatric_use_status = 'PA TË DHËNA',
  pediatric_min_age_value = NULL,
  pediatric_min_age_unit = NULL,
  pediatric_max_age_value = NULL,
  pediatric_max_age_unit = NULL,
  pediatric_min_weight_kg = NULL,
  pediatric_max_weight_kg = NULL,
  pediatric_dose_min = NULL,
  pediatric_dose_max = NULL,
  pediatric_dose_unit = NULL,
  pediatric_dose_basis = NULL,
  pediatric_doses_per_day = NULL,
  pediatric_interval_hours = NULL,
  pediatric_max_doses_per_day = NULL,
  pediatric_min_interval_hours = NULL,
  pediatric_max_single_value = NULL,
  pediatric_max_single_unit = NULL,
  pediatric_max_daily_value = NULL,
  pediatric_max_daily_unit = NULL,
  pediatric_route = 'PO',
  pediatric_restriction = 'KËRKON KÜB EXACT 500/8 mg: faqja zyrtare e Nobel-it identifikon ETOLAX 500 mg/8 mg film tablet, por dokumenti “Kısa Ürün Bilgisi” që ajo vetë lidh hapet si ETOLAX 500 mg/4 mg. Ai dokument 500/4 mg thotë se përdorimi te fëmijët nuk rekomandohet dhe ≤18 vjeç është kundërindikuar, por ky kufizim nuk etiketohet si verified për rreshtin 500/8 mg derisa të lidhet dokumenti product-specific i saktë.',
  pediatric_source_url = 'https://www.nobel.com.tr/urunler/ilaclar/etolax-500-8mg-film-tablet; https://www.nobel.com.tr/cmsfiles/turkey/products/etolax-500-8mg-film-tablet-short-product-info-1.pdf?v=42',
  pediatric_source_section = 'Official-source mismatch: product page 500/8 mg; linked KÜB document identifies ETOLAX 500/4 mg',
  pediatric_verification_status = 'needs_source',
  pediatric_verified_at = NULL
WHERE registry_number = 2430
  AND pediatric_primary_regimen_id = 'card:2430:pediatric';

UPDATE public.dosage_regimens SET
  dose_text = 'Dozimi/statusi pediatrik kërkon RCP/leaflet product-specific; katalogu i prodhuesit konfirmon vetëm identitetin e produktit.',
  frequency_text = NULL,
  maximum_text = NULL,
  warnings = 'Official Gentipharm catalog is identity-only and contains no pediatric posology or age/weight limits; do not inherit dosing from comparators.',
  calculation_status = 'pending',
  editorial_status = 'in_review',
  reviewed_by = 'MedIndex clinical audit 2026-08-18',
  reviewed_at = NOW(),
  updated_at = NOW(),
  source_url = 'https://www.gentipharm.com/registered-drugs'
WHERE source_key IN (
  'card:1569:pediatric','card:1573:pediatric','card:1574:pediatric','card:1578:pediatric',
  'card:1594:pediatric','card:1633:pediatric','card:1635:pediatric','card:1636:pediatric',
  'card:1642:pediatric','card:1648:pediatric','card:1650:pediatric','card:1651:pediatric',
  'card:1656:pediatric','card:1657:pediatric','card:1660:pediatric'
) AND population = 'pediatric';

UPDATE public.dosage_regimens SET
  dose_text = 'Dozimi/statusi pediatrik mbetet i bllokuar derisa të lidhet KÜB exact për ETOLAX 500 mg/8 mg.',
  frequency_text = NULL,
  maximum_text = NULL,
  warnings = 'Official Nobel product page says 500/8 mg, but its linked short product information PDF identifies ETOLAX 500/4 mg. Do not transfer the 500/4 mg pediatric contraindication as product-specific evidence for 500/8 mg.',
  calculation_status = 'pending',
  editorial_status = 'in_review',
  reviewed_by = 'MedIndex clinical audit 2026-08-18',
  reviewed_at = NOW(),
  updated_at = NOW(),
  source_url = 'https://www.nobel.com.tr/urunler/ilaclar/etolax-500-8mg-film-tablet; https://www.nobel.com.tr/cmsfiles/turkey/products/etolax-500-8mg-film-tablet-short-product-info-1.pdf?v=42'
WHERE source_key = 'card:2430:pediatric' AND population = 'pediatric';

COMMIT;
