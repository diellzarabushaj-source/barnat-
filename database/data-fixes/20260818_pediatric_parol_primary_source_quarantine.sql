-- 2026-08-18 — PAROL primary-source provenance cleanup.
-- Atabay confirms the exact PAROL 500 mg tablet and PAROL 120 mg/5 mL oral
-- suspension products, but its primary product pages do not expose pediatric
-- KÜB/RCP posology. Prior dose text came from a secondary mirror; keep both
-- records fail-closed until a primary product-specific document is linked.

BEGIN;

UPDATE public.drugs SET
  pediatric_dose_summary=NULL,
  pediatric_indication=NULL,
  pediatric_use_status='PA TË DHËNA',
  pediatric_min_age_value=NULL,pediatric_min_age_unit=NULL,
  pediatric_max_age_value=NULL,pediatric_max_age_unit=NULL,
  pediatric_min_weight_kg=NULL,pediatric_max_weight_kg=NULL,
  pediatric_dose_min=NULL,pediatric_dose_max=NULL,pediatric_dose_unit=NULL,pediatric_dose_basis=NULL,
  pediatric_doses_per_day=NULL,pediatric_interval_hours=NULL,
  pediatric_max_doses_per_day=NULL,pediatric_min_interval_hours=NULL,
  pediatric_max_single_value=NULL,pediatric_max_single_unit=NULL,
  pediatric_max_daily_value=NULL,pediatric_max_daily_unit=NULL,
  pediatric_route='PO',
  pediatric_restriction='KËRKON KÜB/RCP PRIMAR PRODUCT-SPECIFIC: Atabay konfirmon produktin exact PAROL në faqen e prodhuesit, por faqja primare nuk publikon posologji pediatrike ose dokument KÜB/RCP. Doza e mëparshme vinte nga një kopje sekondare dhe nuk mbahet si evidencë verified.',
  pediatric_source_section='Official Atabay product identity page only; primary pediatric KÜB/RCP not exposed',
  pediatric_verification_status='needs_source',
  pediatric_verified_at=NULL
WHERE registry_number IN (452,467);

UPDATE public.drugs
SET pediatric_source_url='https://www.atabay.com/ilac/parol-500-mg-tablet-30-tablet-blister-2-2/'
WHERE registry_number=452;

UPDATE public.drugs
SET pediatric_source_url='https://www.atabay.com/ilac/parol-120-mg-5-ml-oral-suspansiyon/'
WHERE registry_number=467;

UPDATE public.dosage_regimens SET
  dose_text='Dozimi pediatrik mbetet i bllokuar derisa të lidhet KÜB/RCP primar product-specific nga Atabay/TİTCK.',
  frequency_text=NULL,
  maximum_text=NULL,
  warnings='Exact Atabay product page confirms identity only; prior pediatric dose text came from a secondary KÜB mirror and is not treated as verified primary evidence.',
  calculation_status='pending',
  editorial_status='in_review',
  reviewed_by='MedIndex clinical audit 2026-08-18',
  reviewed_at=NOW(),
  updated_at=NOW()
WHERE source_key IN ('card:452:pediatric','card:467:pediatric') AND population='pediatric';

UPDATE public.dosage_regimens SET source_url='https://www.atabay.com/ilac/parol-500-mg-tablet-30-tablet-blister-2-2/'
WHERE source_key='card:452:pediatric' AND population='pediatric';

UPDATE public.dosage_regimens SET source_url='https://www.atabay.com/ilac/parol-120-mg-5-ml-oral-suspansiyon/'
WHERE source_key='card:467:pediatric' AND population='pediatric';

COMMIT;
