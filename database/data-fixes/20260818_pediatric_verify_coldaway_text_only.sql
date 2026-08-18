-- MedIndex pediatric audit — 2026-08-18
-- Registry #28 TANFLEX COLDAWAY / exact Abdi Ibrahim COLDAWAY COLD & FLU 200 mg/30 mg KÜB.
-- Safety rule: the product has a two-phase initial + PRN regimen. Keep it VERIFIED but TEXT_ONLY;
-- never reinterpret the 6-tablet/24h ceiling as six administrations per day.

UPDATE drugs
SET pediatric_dose_summary = 'KÜB zyrtar: popullata pediatrike ≥12 vjeç. Doza fillestare 2 tableta; pastaj vetëm sipas nevojës 1–2 tableta me interval të paktën 4 orë; maksimumi 6 tableta/24h; përdorim afatshkurtër, jo më gjatë se 5 ditë.',
    pediatric_min_age_value = 12,
    pediatric_min_age_unit = 'vjet',
    pediatric_max_age_value = NULL,
    pediatric_max_age_unit = NULL,
    pediatric_dose_min = NULL,
    pediatric_dose_max = NULL,
    pediatric_dose_unit = NULL,
    pediatric_dose_basis = NULL,
    pediatric_doses_per_day = NULL,
    pediatric_interval_hours = NULL,
    pediatric_max_doses_per_day = NULL,
    pediatric_min_interval_hours = 4,
    pediatric_max_single_value = 2,
    pediatric_max_single_unit = 'tableta',
    pediatric_max_daily_value = 6,
    pediatric_max_daily_unit = 'tableta',
    pediatric_route = 'PO',
    pediatric_restriction = 'Nën 12 vjeç është kundërindikuar. Regjimi ka dy faza (dozë fillestare 2 tableta, pastaj 1–2 tableta PRN), ndaj nuk përfaqësohet si një formulë e vetme nga kalkulatori aktual; ruhet VERIFIED por TEXT_ONLY. Kufiri 6/24h është numër tabletash, jo numër administrimesh.',
    pediatric_source_url = 'https://www.abdiibrahim.com.tr/Uploads/Product/prospektus/coldaway/1311-kub-temiz.pdf',
    pediatric_source_section = 'KÜB 4.2 Posoloji ve uygulama şekli; Pediyatrik popülasyon; 4.3 Kontrendikasyonlar',
    pediatric_verification_status = 'verified',
    pediatric_verified_at = COALESCE(pediatric_verified_at, TIMESTAMPTZ '2026-08-18T07:29:14.546Z'),
    updated_at = now()
WHERE registry_number = 28;

UPDATE dosage_regimens
SET dose_text = '≥12 vjeç: dozë fillestare 2 tableta; pastaj vetëm sipas nevojës 1–2 tableta.',
    frequency_text = 'Pas dozës fillestare: 1–2 tableta PRN me interval të paktën 4 orë.',
    duration_text = 'Përdorim afatshkurtër; jo më gjatë se 5 ditë.',
    maximum_text = 'Maksimumi 2 tableta për administrim dhe 6 tableta në 24 orë.',
    warnings = 'VERIFIED / TEXT_ONLY — KÜB product-specific. Nën 12 vjeç kundërindikuar. Regjimi loading + PRN nuk duhet kthyer në schedule rutinë; 6/24h është kufi tabletash, jo 6 administrime.',
    calculation_status = 'text_verified',
    calculation_type = NULL,
    dose_value_min = NULL,
    dose_value_max = NULL,
    doses_per_day = NULL,
    interval_hours = NULL,
    max_single_mg = NULL,
    max_daily_mg = NULL,
    min_age_months = 144,
    max_age_months = NULL,
    editorial_status = 'published',
    reviewed_by = 'OpenAI clinical audit 2026-08-18',
    reviewed_at = COALESCE(reviewed_at, TIMESTAMPTZ '2026-08-18T07:29:14.546Z'),
    source_url = 'https://www.abdiibrahim.com.tr/Uploads/Product/prospektus/coldaway/1311-kub-temiz.pdf',
    updated_at = now()
WHERE source_key = 'card:28:pediatric';
