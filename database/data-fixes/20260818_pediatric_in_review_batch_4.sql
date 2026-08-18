-- 2026-08-18 — pediatric in_review cleanup, batch 4.
-- Nine rows were linked to the same Google Drive medicine registry/price list.
-- That file confirms product identity but contains no pediatric posology.
-- Ribodoxo has an official VVKT identity record without pediatric posology docs.
-- Influvac is season-specific; the local strain composition does not match the
-- currently linked HPRA Influvac Tetra SmPC. All remain fail-closed.

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
  pediatric_route=NULL,
  pediatric_restriction='KËRKON BURIM PRODUCT-SPECIFIC PËR PEDIATRI: Google Drive file i lidhur është lista zyrtare e regjistrit/çmimeve dhe konfirmon vetëm identitetin e produktit. Nuk përmban seksion Pediatric population, posologji, kufij moshe/peshe ose udhëzim pediatrik.',
  pediatric_source_section='Official registry/price list — product identity only; not an SmPC/RCP/leaflet and not pediatric posology',
  pediatric_verification_status='needs_source',
  pediatric_verified_at=NULL
WHERE registry_number IN (1619,1625,1767,1768,1769,3248,3651,3664,3847);

UPDATE public.drugs SET
  pediatric_dose_summary=NULL,pediatric_indication=NULL,pediatric_use_status='PA TË DHËNA',
  pediatric_min_age_value=NULL,pediatric_min_age_unit=NULL,pediatric_max_age_value=NULL,pediatric_max_age_unit=NULL,
  pediatric_min_weight_kg=NULL,pediatric_max_weight_kg=NULL,
  pediatric_dose_min=NULL,pediatric_dose_max=NULL,pediatric_dose_unit=NULL,pediatric_dose_basis=NULL,
  pediatric_doses_per_day=NULL,pediatric_interval_hours=NULL,pediatric_max_doses_per_day=NULL,pediatric_min_interval_hours=NULL,
  pediatric_max_single_value=NULL,pediatric_max_single_unit=NULL,pediatric_max_daily_value=NULL,pediatric_max_daily_unit=NULL,
  pediatric_route=NULL,
  pediatric_restriction='KËRKON SmPC/RCP PRODUCT-SPECIFIC: VVKT konfirmon Ribodoxo 2 mg/mL dhe formën e infuzionit, por faqja publike nuk jep dokument/posologji pediatrike. Mos transfero dozë doxorubicini nga një produkt tjetër pa dokumentin exact.',
  pediatric_source_url='https://vapris.vvkt.lt/vvkt-web/public/medications/view/28208?lang=en',
  pediatric_source_section='Official regulator product identity record only; no product-specific pediatric posology document exposed',
  pediatric_verification_status='needs_source',pediatric_verified_at=NULL
WHERE registry_number=1761 AND pediatric_primary_regimen_id='card:1761:pediatric';

UPDATE public.drugs SET
  pediatric_dose_summary=NULL,
  pediatric_indication='Parandalim sezonal i influencës; formulimi është season-specific.',
  pediatric_use_status='PA TË DHËNA',
  pediatric_min_age_value=NULL,pediatric_min_age_unit=NULL,pediatric_max_age_value=NULL,pediatric_max_age_unit=NULL,
  pediatric_min_weight_kg=NULL,pediatric_max_weight_kg=NULL,
  pediatric_dose_min=NULL,pediatric_dose_max=NULL,pediatric_dose_unit=NULL,pediatric_dose_basis=NULL,
  pediatric_doses_per_day=NULL,pediatric_interval_hours=NULL,pediatric_max_doses_per_day=NULL,pediatric_min_interval_hours=NULL,
  pediatric_max_single_value=NULL,pediatric_max_single_unit=NULL,pediatric_max_daily_value=NULL,pediatric_max_daily_unit=NULL,
  pediatric_route='IM/SC',
  pediatric_restriction='KËRKON LABEL EXACT TË SEZONIT: rreshti vendor Influvac sub-unit tetra përmban A/Thailand/8/2022 (H3N2), ndërsa SmPC aktual i HPRA për Influvac Tetra ka A/Croatia/10136RV/2023 (H3N2). Mos transfero dozën e produktit aktual te ky rresht season-specific pa label-in exact.',
  pediatric_source_url='https://www.hpra.ie/find-a-medicine/for-human-use/authorised-medicines/details/30367; https://assets.hpra.ie/products/Human/30367/Licence_PA23355-016-001_04072025125655.pdf',
  pediatric_source_section='Season-specific composition mismatch: local row A/Thailand/8/2022 vs current HPRA Influvac Tetra A/Croatia/10136RV/2023',
  pediatric_verification_status='needs_source',pediatric_verified_at=NULL
WHERE registry_number=2396 AND pediatric_primary_regimen_id='card:2396:pediatric';

UPDATE public.dosage_regimens SET
  dose_text='Dozimi/statusi pediatrik kërkon RCP/SmPC/leaflet product-specific; source i lidhur është vetëm listë regjistri/çmimesh.',
  frequency_text=NULL,maximum_text=NULL,
  warnings='The linked Drive file is a medicine registry/price list and contains no pediatric posology.',
  calculation_status='pending',editorial_status='in_review',
  reviewed_by='MedIndex clinical audit 2026-08-18',reviewed_at=NOW(),updated_at=NOW()
WHERE source_key IN ('card:1619:pediatric','card:1625:pediatric','card:1767:pediatric','card:1768:pediatric','card:1769:pediatric','card:3248:pediatric','card:3651:pediatric','card:3664:pediatric','card:3847:pediatric') AND population='pediatric';

UPDATE public.dosage_regimens SET
  dose_text='Dozimi pediatrik kërkon SmPC/RCP exact për Ribodoxo 2 mg/mL.',frequency_text=NULL,maximum_text=NULL,
  warnings='Official VVKT record exposes product identity but no pediatric posology document.',
  calculation_status='pending',editorial_status='in_review',reviewed_by='MedIndex clinical audit 2026-08-18',reviewed_at=NOW(),updated_at=NOW(),
  source_url='https://vapris.vvkt.lt/vvkt-web/public/medications/view/28208?lang=en'
WHERE source_key='card:1761:pediatric' AND population='pediatric';

UPDATE public.dosage_regimens SET
  dose_text='Dozimi pediatrik mbetet i bllokuar derisa të lidhet label-i exact i sezonit që përputhet me strain-et e rreshtit vendor.',frequency_text=NULL,maximum_text=NULL,
  warnings='Season-specific identity mismatch: local row contains A/Thailand/8/2022 H3N2 while current HPRA Influvac Tetra SmPC contains A/Croatia/10136RV/2023 H3N2.',
  calculation_status='pending',editorial_status='in_review',reviewed_by='MedIndex clinical audit 2026-08-18',reviewed_at=NOW(),updated_at=NOW(),
  source_url='https://www.hpra.ie/find-a-medicine/for-human-use/authorised-medicines/details/30367'
WHERE source_key='card:2396:pediatric' AND population='pediatric';

COMMIT;
