-- Pediatric calculator PRN semantics hardening — 2026-08-17
--
-- This file mirrors the reviewed live Neon fixes and is intentionally idempotent.
-- Exact routine schedules are cleared when the source says "when needed", "up to",
-- or otherwise defines a ceiling/minimum interval rather than a prescription clock.
-- The two overlay fields below are Neon-owned safety fields and are not inferred
-- from product strength/concentration.

-- Regimens that are representable as a PRN administration ceiling.
UPDATE public.drugs
SET pediatric_doses_per_day = NULL,
    pediatric_interval_hours = NULL,
    pediatric_max_doses_per_day = 4,
    pediatric_min_interval_hours = 6
WHERE registry_number = 83
  AND pediatric_primary_regimen_id = 'card:83:pediatric'
  AND pediatric_verification_status = 'verified';

UPDATE public.drugs
SET pediatric_doses_per_day = NULL,
    pediatric_interval_hours = NULL,
    pediatric_max_doses_per_day = 4,
    pediatric_min_interval_hours = NULL
WHERE registry_number = 97
  AND pediatric_primary_regimen_id = 'card:97:pediatric'
  AND pediatric_verification_status = 'verified';

UPDATE public.drugs
SET pediatric_doses_per_day = NULL,
    pediatric_interval_hours = NULL,
    pediatric_max_doses_per_day = 3,
    pediatric_min_interval_hours = NULL
WHERE registry_number IN (124,125,295,296,308)
  AND pediatric_verification_status = 'verified';

UPDATE public.drugs
SET pediatric_doses_per_day = NULL,
    pediatric_interval_hours = NULL,
    pediatric_max_doses_per_day = 4,
    pediatric_min_interval_hours = NULL
WHERE registry_number = 319
  AND pediatric_primary_regimen_id = 'card:319:pediatric'
  AND pediatric_verification_status = 'verified';

UPDATE public.drugs
SET pediatric_doses_per_day = NULL,
    pediatric_interval_hours = NULL,
    pediatric_max_doses_per_day = 1,
    pediatric_min_interval_hours = NULL
WHERE registry_number = 472
  AND pediatric_primary_regimen_id = 'card:472:pediatric'
  AND pediatric_verification_status = 'verified';

-- TANFLEX COLDAWAY has a loading/maintenance pattern: initial 2 tablets, then
-- 1–2 q4h PRN, max 6/day. The current single-phase engine cannot faithfully
-- represent that sequence, so keep the limits but fail closed as in_review.
UPDATE public.drugs
SET pediatric_doses_per_day = NULL,
    pediatric_interval_hours = NULL,
    pediatric_max_doses_per_day = 6,
    pediatric_min_interval_hours = 4,
    pediatric_verification_status = 'in_review',
    pediatric_verified_at = NULL
WHERE registry_number = 28
  AND pediatric_primary_regimen_id = 'card:28:pediatric';

-- PAROL 500 mg tablet has a 60 mg/kg/day ceiling while its typed dose is a
-- tablet-count range. The engine intentionally does not infer mg from product
-- strength, so it cannot enforce that weight-based mass ceiling against count.
UPDATE public.drugs
SET pediatric_doses_per_day = NULL,
    pediatric_interval_hours = NULL,
    pediatric_max_doses_per_day = 4,
    pediatric_min_interval_hours = 4,
    pediatric_verification_status = 'in_review',
    pediatric_verified_at = NULL
WHERE registry_number = 452
  AND pediatric_primary_regimen_id = 'card:452:pediatric';

-- Product-specific Maxolon/REGLAN 10 mg tablet modelling. The SmPC dosing table
-- makes the tablet suitable only for the 15–18 y / >=61 kg band at 10 mg.
UPDATE public.drugs
SET pediatric_dose_summary = 'Adoleshentë 15–18 vjeç me peshë ≥61 kg, vetëm si terapi e linjës së dytë për parandalim të vonuar të nauzesë/të vjellave nga kimioterapia: 10 mg PO për dozë, deri 3 herë në 24 orë; interval minimal 6 orë; maksimumi 0.5 mg/kg/24h; trajtimi maksimum 5 ditë. Tabletat 10 mg nuk janë të përshtatshme nën 61 kg.',
    pediatric_indication = 'parandalim i vonuar i nauzesë/të vjellave nga kimioterapia (CINV), si linjë e dytë',
    pediatric_min_age_value = 15,
    pediatric_min_age_unit = 'vjet',
    pediatric_max_age_value = 18,
    pediatric_max_age_unit = 'vjet',
    pediatric_min_weight_kg = 61,
    pediatric_dose_min = 10,
    pediatric_dose_max = 10,
    pediatric_dose_unit = 'mg',
    pediatric_dose_basis = 'dozë fikse',
    pediatric_doses_per_day = NULL,
    pediatric_interval_hours = NULL,
    pediatric_max_doses_per_day = 3,
    pediatric_min_interval_hours = 6,
    pediatric_max_single_value = 10,
    pediatric_max_single_unit = 'mg',
    pediatric_max_daily_value = 0.5,
    pediatric_max_daily_unit = 'mg/kg/ditë',
    pediatric_restriction = 'Vetëm për CINV të vonuar si linjë e dytë. Tableta 10 mg përdoret vetëm te 15–18 vjeç me peshë ≥61 kg; interval minimal 6 orë edhe pas të vjellave; trajtimi maksimum 5 ditë.',
    pediatric_verification_status = 'verified'
WHERE registry_number = 178
  AND pediatric_primary_regimen_id = 'card:178:pediatric'
  AND pediatric_source_url = 'https://www.medicines.org.uk/emc/product/6213/smpc';

-- Oral solution keeps weight-based dosing, but the pediatric indication must not
-- inherit adult RINV/migraine indications.
UPDATE public.drugs
SET pediatric_indication = 'parandalim i vonuar i nauzesë/të vjellave nga kimioterapia (CINV), si linjë e dytë',
    pediatric_doses_per_day = NULL,
    pediatric_interval_hours = NULL,
    pediatric_max_doses_per_day = 3,
    pediatric_min_interval_hours = 6,
    pediatric_restriction = 'Vetëm për CINV të vonuar si linjë e dytë. Përqendrimi është 1 mg/mL; interval minimal 6 orë edhe pas të vjellave; trajtimi maksimum 5 ditë.'
WHERE registry_number = 179
  AND pediatric_primary_regimen_id = 'card:179:pediatric'
  AND pediatric_source_url = 'https://www.medicines.org.uk/emc/product/2471/smpc';

UPDATE public.dosage_regimens
SET indication_text = 'parandalim i vonuar i nauzesë/të vjellave nga kimioterapia (CINV), si linjë e dytë',
    dose_text = CASE source_key
      WHEN 'card:178:pediatric' THEN 'Adoleshentë 15–18 vjeç me peshë ≥61 kg: 10 mg PO për dozë sipas nevojës, deri 3 herë/24h; interval minimal 6 orë; maksimumi 0.5 mg/kg/24h; maksimum 5 ditë.'
      WHEN 'card:179:pediatric' THEN 'Fëmijë 1–18 vjeç: 0.1–0.15 mL/kg/dozë PO sipas nevojës për CINV të vonuar si linjë e dytë; deri 3 herë/24h; interval minimal 6 orë; maksimumi 0.5 mL/kg/24h; maksimum 5 ditë.'
      ELSE dose_text END,
    warnings = CASE source_key
      WHEN 'card:178:pediatric' THEN 'Tableta 10 mg nuk është e përshtatshme nën 61 kg. Respekto intervalin minimal 6-orësh edhe pas të vjellave.'
      WHEN 'card:179:pediatric' THEN 'Përqendrimi 1 mg/mL. Respekto intervalin minimal 6-orësh edhe pas të vjellave.'
      ELSE warnings END
WHERE source_key IN ('card:178:pediatric','card:179:pediatric');
