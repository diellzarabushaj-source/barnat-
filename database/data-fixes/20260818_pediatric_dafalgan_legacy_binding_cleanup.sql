-- Final cleanup for Neon-only DAFALGAN PEDIATRIE #4013.
-- The drug projection is already fail-closed; this removes the historical
-- French 3–32 kg / 15 mg/kg narrative from its legacy extra dosage_regimen too.

UPDATE dosage_regimens
SET dose_text = 'Nuk publikohet regjim sasior pediatrik: karta është referencë e jashtme belge dhe kufijtë aktualë të peshës në materialet UPSA/Dafalgan nuk janë konsistentë.',
    frequency_text = NULL,
    duration_text = NULL,
    maximum_text = NULL,
    warnings = 'IN_REVIEW / TEXT_ONLY — source_payload: Belgium manual_external_reference, kosovo_registration_verified=false. Mos përdor modelin historik francez 3–32 kg / 15 mg/kg. Materialet aktuale të markës japin kufij të ndryshëm 3–50 dhe 4–50 kg.',
    calculation_status = 'pending',
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
    editorial_status = 'in_review',
    reviewed_by = 'OpenAI clinical audit 2026-08-18',
    source_url = 'https://dafalgan.be/nl/dafalgan-voor-babys-en-kinderen/; https://dafalgan.be/nl/homepage/',
    indication_text = 'Dhimbje e lehtë–mesatare dhe/ose temperaturë; product-specific pediatric quantitative regimen pending market/label resolution.',
    updated_at = now()
WHERE source_key = 'extra-4013-pediatric';
