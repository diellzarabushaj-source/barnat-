-- 2026-08-18 — DAFALGAN PEDIATRIE 30 mg/mL (#4013), Belgian external reference.
-- Exact primary UPSA Belgium leaflet, MA BE123776, approved 03/2025.
-- The leaflet verifies the narrative pediatric regimen, but the dosing-device
-- instructions are explicit for 4–32 kg while the medicinal product is generally
-- reserved for children <50 kg. Keep all typed dose/schedule/cap fields empty so
-- no automatic regimen is inferred for the >32 kg band or for a Kosovo product.

BEGIN;

UPDATE public.drugs
SET pediatric_dose_summary = 'BELGIAN EXTERNAL REFERENCE / VERIFIED TEXT_ONLY: DAFALGAN PEDIATRIE 30 mg/mL, MA BE123776. Leaflet-i primar i aprovuar 03/2025 jep dozën e zakonshme 15 mg/kg çdo 6 orë (60 mg/kg/24h), maksimum 4 administrime/ditë dhe interval minimal 4 orë. Produkti është për fëmijë <50 kg; udhëzimet e sistemit dozues përshkruhen shprehimisht për 4–32 kg. Nuk strukturohet kalkulator automatik përtej udhëzimeve e pipetës.',
    pediatric_indication = 'Trajtim simptomatik i dhimbjes dhe temperaturës.',
    pediatric_use_status = 'KUFIZUAR',
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
    pediatric_restriction = 'Kjo kartelë mbetet referencë e jashtme belge; kosovo_registration_verified=false. Leaflet-i exact BE123776 është product-specific dhe i mjaftueshëm për verifikim narrativ, por kalkulatori mbetet i çaktivizuar sepse udhëzimet e sistemit dozues janë të shprehura për 4–32 kg ndërsa produkti në përgjithësi është për <50 kg. Mos infero volum/dozë për bandën >32 kg.',
    pediatric_concentration_value = 30,
    pediatric_concentration_unit = 'mg',
    pediatric_concentration_per_value = 1,
    pediatric_concentration_per_unit = 'mL',
    pediatric_source_url = 'https://dafalgan.be/nl/product/dafalgan-pediatrie-30mgml/; https://cms.dafalgan.be/s3fs-public/2025-04/250307-be-pil_dafsolution-nl_clean-last.pdf',
    pediatric_source_section = 'Belgian patient leaflet approved 03/2025, MA BE123776, sections 1 and 3; official UPSA Belgium product page',
    pediatric_verification_status = 'verified',
    pediatric_verified_at = COALESCE(pediatric_verified_at, NOW())
WHERE registry_number = 4013
  AND trade_name = 'DAFALGAN PEDIATRIE';

UPDATE public.dosage_regimens
SET dose_text = 'VERIFIED TEXT_ONLY — exact Belgian DAFALGAN PEDIATRIE 30 mg/mL leaflet (BE123776, approved 03/2025) states usual pediatric dose 15 mg/kg every 6 h, maximum 60 mg/kg/24 h, up to 4 administrations/day, minimum 4 h. The dosing-system instructions are explicitly described for 4–32 kg; do not auto-model >32 kg.',
    frequency_text = NULL,
    duration_text = NULL,
    maximum_text = NULL,
    warnings = 'Belgian external reference only; Kosovo registration not verified. Keep typed calculation fields empty because the exact leaflet describes the dosing device explicitly for 4–32 kg while the product is generally reserved for children <50 kg.',
    calculation_status = 'text_verified',
    calculation_type = NULL,
    dose_value_min = NULL,
    dose_value_max = NULL,
    doses_per_day = NULL,
    interval_hours = NULL,
    max_single_mg = NULL,
    max_daily_mg = NULL,
    concentration_mg = NULL,
    concentration_ml = NULL,
    min_age_months = NULL,
    max_age_months = NULL,
    min_weight_kg = NULL,
    max_weight_kg = NULL,
    signatura_template = NULL,
    editorial_status = 'published',
    reviewed_by = 'OpenAI clinical audit 2026-08-18',
    reviewed_at = COALESCE(reviewed_at, NOW()),
    source_url = 'https://dafalgan.be/nl/product/dafalgan-pediatrie-30mgml/; https://cms.dafalgan.be/s3fs-public/2025-04/250307-be-pil_dafsolution-nl_clean-last.pdf',
    updated_at = NOW()
WHERE source_key = 'extra-4013-pediatric'
  AND drug_id = (SELECT id FROM public.drugs WHERE registry_number = 4013);

COMMIT;
