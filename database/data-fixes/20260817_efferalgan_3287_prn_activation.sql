-- 2026-08-17 — EFFERALGAN 30 mg/mL (#3287) pediatric calculator activation.
-- Official ANSM/BDPM product CIS 63390065:
--   https://base-donnees-publique.medicaments.gouv.fr/medicament/63390065/extrait
-- Regimen: children 3–32 kg, 15 mg/kg/dose PO, renew only if necessary after
-- at least 6 h, max 4 administrations/24h, approx 60 mg/kg/day.
-- The 4/day and 6 h values are safety/PRN limits; they must not become a fixed
-- routine schedule.

BEGIN;

UPDATE drugs
SET pediatric_min_weight_kg = 3,
    pediatric_max_weight_kg = 32,
    pediatric_doses_per_day = NULL,
    pediatric_interval_hours = NULL,
    pediatric_max_doses_per_day = 4,
    pediatric_min_interval_hours = 6,
    pediatric_max_daily_value = 60,
    pediatric_max_daily_unit = 'mg/kg/ditë',
    pediatric_restriction = 'Ky formulim 30 mg/mL është për fëmijë 3–32 kg. Jepet 15 mg/kg për dozë vetëm sipas nevojës; respekto minimumi 6 orë dhe maksimumi 4 administrime/24h. Llogarit të gjithë paracetamolin nga barnat e tjera.',
    pediatric_source_section = '4.2 Posologie et mode d''administration / Population pédiatrique',
    pediatric_verification_status = 'verified',
    pediatric_verified_at = NOW()
WHERE registry_number = 3287;

UPDATE dosage_regimens r
SET frequency_text = 'sipas nevojës; interval minimal 6 orë',
    maximum_text = 'Maksimumi 4 administrime/24h; rreth 60 mg/kg/ditë.',
    warnings = 'Formulimi është për 3–32 kg; kufijtë PRN janë safety ceilings dhe jo schedule rutinë. Llogarit të gjithë paracetamolin nga produktet e tjera.',
    reviewed_by = 'MedIndex clinical audit 2026-08-17',
    reviewed_at = NOW(),
    updated_at = NOW()
FROM drugs d
WHERE r.drug_id = d.id
  AND d.registry_number = 3287
  AND r.population = 'pediatric';

COMMIT;
