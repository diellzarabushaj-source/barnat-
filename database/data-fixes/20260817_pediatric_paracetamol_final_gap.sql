-- 2026-08-17 — final pediatric paracetamol hardening
--
-- Sources reviewed:
--   #4013 DAFALGAN PEDIATRIE 30 mg/mL
--     ANSM / Base de Données Publique des Médicaments, CIS 63390065
--     https://base-donnees-publique.medicaments.gouv.fr/medicament/63390065/extrait
--     Historical identity confirmed by HAS: DAFALGAN PEDIATRIQUE 3 POUR CENT = CIS 63390065.
--   #466 PAROL PLUS 250 mg/5 mL
--     Atabay KÜB / SmPC-equivalent, section 4.2
--     https://www.atabay.com/wp-content/uploads/2022/12/PAROL-PLUS-250-KUB.pdf
--     10–15 mg/kg q6h; minimum interval 4h; <=4 administrations/day;
--     daily target <=60 mg/kg; >30 kg max 500 mg/dose and 2 g/day.
--
-- #467 PAROL 120 mg/5 mL is deliberately quarantined as in_review until a
-- directly retrievable primary KÜB/RCP can be bound to the product. Existing
-- typed values are retained for editorial review but must not calculate.

BEGIN;

UPDATE drugs
SET pediatric_dose_summary = 'Fëmijë 3–32 kg: 15 mg/kg për dozë PO sipas nevojës; interval minimal 6 orë; maksimumi 4 doza/24 orë dhe rreth 60 mg/kg/ditë.',
    pediatric_indication = 'dhimbje e lehtë–mesatare; temperaturë',
    pediatric_use_status = 'KUFIZUAR',
    pediatric_min_age_value = NULL,
    pediatric_min_age_unit = NULL,
    pediatric_max_age_value = NULL,
    pediatric_max_age_unit = NULL,
    pediatric_min_weight_kg = 3,
    pediatric_max_weight_kg = 32,
    pediatric_dose_min = 15,
    pediatric_dose_max = 15,
    pediatric_dose_unit = 'mg',
    pediatric_dose_basis = 'kg/dozë',
    pediatric_doses_per_day = NULL,
    pediatric_interval_hours = NULL,
    pediatric_max_doses_per_day = 4,
    pediatric_min_interval_hours = 6,
    pediatric_max_single_value = NULL,
    pediatric_max_single_unit = NULL,
    pediatric_max_daily_value = 60,
    pediatric_max_daily_unit = 'mg/kg/ditë',
    pediatric_route = 'PO',
    pediatric_restriction = 'Ky formulim është i përshtatshëm vetëm për 3–32 kg. Llogarit të gjithë paracetamolin nga produktet e tjera; në insuficiencë renale/hepatike kërkohet përshtatje e intervalit/dozës sipas RCP-së.',
    pediatric_concentration_value = 30,
    pediatric_concentration_unit = 'mg',
    pediatric_concentration_per_value = 1,
    pediatric_concentration_per_unit = 'mL',
    pediatric_source_url = 'https://base-donnees-publique.medicaments.gouv.fr/medicament/63390065/extrait',
    pediatric_source_section = '4.2 Posologie et mode d''administration / Population pédiatrique',
    pediatric_verification_status = 'verified',
    pediatric_verified_at = NOW(),
    pediatric_primary_regimen_id = 'extra-4013-pediatric'
WHERE registry_number = 4013;

UPDATE dosage_regimens
SET warnings = 'Ky formulim është i përshtatshëm vetëm për fëmijë 3–32 kg. Llogarit të gjithë paracetamolin nga produktet e tjera; përshtat intervalin/dozën në insuficiencë renale/hepatike sipas RCP-së.',
    reviewed_by = 'MedIndex clinical audit 2026-08-17',
    reviewed_at = NOW(),
    updated_at = NOW()
WHERE drug_id = (SELECT id FROM drugs WHERE registry_number = 4013)
  AND population = 'pediatric'
  AND source_key = 'extra-4013-pediatric';

UPDATE drugs
SET pediatric_dose_summary = 'Fëmijë ≥6 vjeç: 10–15 mg/kg për dozë PO çdo 6 orë; minimumi 4 orë ndërmjet dozave; maksimumi 4 doza/24 orë dhe 60 mg/kg/ditë. Nën 6 vjeç përdoret formulimi 120 mg/5 mL.',
    pediatric_max_single_value = 500,
    pediatric_max_single_unit = 'mg',
    pediatric_max_daily_value = 2000,
    pediatric_max_daily_unit = 'mg',
    pediatric_max_doses_per_day = 4,
    pediatric_min_interval_hours = 4,
    pediatric_restriction = 'Tunde para përdorimit; mos e përdor më gjatë se 3 ditë rresht pa rekomandim mjeku. Formula 10–15 mg/kg çdo 6 orë nuk duhet të kalojë 500 mg për dozë, 2000 mg/24h, 4 doza/24h ose intervalin minimal 4 orë; llogarit të gjithë paracetamolin nga barnat e tjera.',
    pediatric_verification_status = 'verified',
    pediatric_verified_at = NOW()
WHERE registry_number = 466;

UPDATE dosage_regimens
SET frequency_text = 'çdo 6 orë',
    duration_text = 'Pa rekomandim mjeku, jo më gjatë se 3 ditë rresht.',
    maximum_text = 'Maksimumi 60 mg/kg/ditë; mbi 30 kg maksimum 500 mg për dozë dhe 2 g/ditë; minimumi 4 orë ndërmjet dozave; jo më shumë se 4 doza/24 orë.',
    warnings = 'Tunde para përdorimit dhe llogarit të gjithë paracetamolin nga produktet e tjera.',
    reviewed_by = 'MedIndex clinical audit 2026-08-17',
    reviewed_at = NOW(),
    updated_at = NOW()
WHERE drug_id = (SELECT id FROM drugs WHERE registry_number = 466)
  AND population = 'pediatric'
  AND source_key = 'card:466:pediatric';

UPDATE drugs
SET pediatric_verification_status = 'in_review',
    pediatric_verified_at = NULL,
    pediatric_restriction = 'Dozimi i strukturuar ruhet për rishikim, por kalkulimi automatik mbetet i çaktivizuar derisa RCP/KÜB primar i PAROL 120 mg/5 mL të lidhet drejtpërdrejt me këtë regjistrim.'
WHERE registry_number = 467;

COMMIT;
