-- 2026-08-17 — pediatric PRN/provenance cleanup for 8 text-verified rows.
-- Goal: remove fake exact schedules and reject inherited cross-product dosing.
-- No row in this batch is newly promoted to automatic calculation.

BEGIN;

-- #2106 NORMOSTOP: product-specific age bands use q8h and q6–8h; no universal exact interval.
UPDATE drugs SET
  pediatric_interval_hours = NULL,
  pediatric_restriction = 'Regjimi ndryshon sipas moshës: 2–6 vjeç 25 mg çdo 8 orë sipas nevojës (max 75 mg/ditë); 7–12 vjeç 25–50 mg çdo 6–8 orë (max 150 mg/ditë). Nuk përdoret një interval i vetëm typed për të gjitha bandat.',
  pediatric_verified_at = NOW()
WHERE registry_number = 2106;

-- #2420 TYLOL HOT PEDIATRIC: official source = 3–4/day; >=6 h between administrations.
UPDATE drugs SET
  pediatric_doses_per_day = 3,
  pediatric_interval_hours = NULL,
  pediatric_max_doses_per_day = 4,
  pediatric_min_interval_hours = 6,
  pediatric_restriction = 'Burimi zyrtar jep 1 qese 3–4 herë/ditë te fëmijët >6 vjeç; 6 orë ruhet si interval minimal dhe 4/24h si ceiling, jo si schedule fiks 4 herë/ditë.',
  pediatric_verified_at = NOW()
WHERE registry_number = 2420;

-- #2719 CODEINE PHOSPHATE 15 mg: q6h is PRN; preserve opioid ceilings only.
UPDATE drugs SET
  pediatric_interval_hours = NULL,
  pediatric_max_doses_per_day = 4,
  pediatric_min_interval_hours = 6,
  pediatric_max_single_value = 60,
  pediatric_max_single_unit = 'mg',
  pediatric_max_daily_value = 240,
  pediatric_max_daily_unit = 'mg',
  pediatric_restriction = '12–18 vjeç: 30–60 mg çdo 6 orë vetëm sipas nevojës; max 240 mg/24h. Kodeina përdoret për kohën më të shkurtër dhe zakonisht jo >3 ditë pa rivlerësim; <12 vjeç nuk përdoret për analgjezi.',
  pediatric_verified_at = NOW()
WHERE registry_number = 2719;

-- #2926 PANTENOL 5% cream: official Saba KÜB supports indication-dependent topical frequency.
UPDATE drugs SET
  pediatric_dose_summary = 'Topikale: për përshpejtim të epitelizimit përdoret 1–2 herë/ditë; te foshnjat aplikohet pas ndërrimit të pelenës; në plagë mund të aplikohet disa herë gjatë ditës sipas nevojës.',
  pediatric_doses_per_day = NULL,
  pediatric_interval_hours = NULL,
  pediatric_route = 'TOP',
  pediatric_restriction = 'Nuk ka një frekuencë pediatrike universale të vetme; frekuenca varet nga indikacioni. KÜB-ja jep udhëzim për foshnjat, por te seksioni “Pediyatrik popülasyon” shënon se nuk ka të dhëna shtesë.',
  pediatric_source_url = 'https://sabailac.com.tr/assets/urunler/kub/pantenol-5-krem-kub-10.09.2024_fdb.pdf',
  pediatric_source_section = '4.2 Pozoloji ve uygulama şekli',
  pediatric_verification_status = 'verified',
  pediatric_verified_at = NOW()
WHERE registry_number = 2926;

-- #2927 PANTENOL 5% ointment: official product page exists, but KÜB posology was not retrievable.
UPDATE drugs SET
  pediatric_dose_summary = NULL,
  pediatric_doses_per_day = NULL,
  pediatric_interval_hours = NULL,
  pediatric_route = 'TOP',
  pediatric_restriction = 'Faqja zyrtare e Saba-s konfirmon PANTENOL %5 pomad dhe lidh KÜB-në e produktit, por dokumenti i posologjisë nuk u rikuperua në audit. Dozimi i mëparshëm i trashëguar nuk përdoret derisa KÜB-ja të rishikohet drejtpërdrejt.',
  pediatric_source_url = 'https://sabailac.com.tr/urunler/pantenol-5-pomad-recetesiz-urun',
  pediatric_source_section = 'Official product page; KÜB linked, posology pending direct review',
  pediatric_verification_status = 'in_review',
  pediatric_verified_at = NULL
WHERE registry_number = 2927;

-- #3216 DOLOKIDS: TrePharm catalog proves identity only; inherited PAROL dosing is rejected.
UPDATE drugs SET
  pediatric_dose_summary = NULL,
  pediatric_doses_per_day = NULL,
  pediatric_interval_hours = NULL,
  pediatric_max_doses_per_day = NULL,
  pediatric_min_interval_hours = NULL,
  pediatric_restriction = 'TrePharm zyrtar konfirmon DOLOKIDS 120 mg/5 mL oral suspension, por nuk publikon posologji produkt-specifike në faqen e katalogut. Doza e trashëguar nga PAROL u hoq nga verifikimi.',
  pediatric_source_url = 'https://trepharm.com/otc-products/',
  pediatric_source_section = 'Product identity only; product-specific pediatric posology source required',
  pediatric_verification_status = 'needs_source',
  pediatric_verified_at = NULL
WHERE registry_number = 3216;

-- #3758 MINAMOL: no direct primary KÜB/RCP was bound; inherited PAROL dosing is rejected.
UPDATE drugs SET
  pediatric_dose_summary = NULL,
  pediatric_doses_per_day = NULL,
  pediatric_interval_hours = NULL,
  pediatric_max_doses_per_day = NULL,
  pediatric_min_interval_hours = NULL,
  pediatric_restriction = 'Doza e mëparshme ishte trashëguar nga një produkt tjetër 120 mg/5 mL. Nuk u gjet një KÜB/RCP primar i drejtpërdrejtë për MİNAMOL gjatë auditit; kalkulimi/posologjia mbeten të bllokuara.',
  pediatric_source_url = NULL,
  pediatric_source_section = NULL,
  pediatric_verification_status = 'needs_source',
  pediatric_verified_at = NULL
WHERE registry_number = 3758;

-- #3811 PIROFEN: replace inherited PAROL evidence with official DEVA KÜB.
-- Keep dose_basis unset; metadata remains TEXT_ONLY until product age/formulation modeling is complete.
UPDATE drugs SET
  pediatric_dose_summary = 'Pirofen 120 mg/5 mL: 10–15 mg/kg për dozë çdo 6 orë; minimumi 4 orë ndërmjet dozave dhe jo >4 administrime/24h. Maksimumi 60 mg/kg/ditë; mbi 30 kg maksimumi 500 mg/dozë dhe 2 g/ditë.',
  pediatric_doses_per_day = 4,
  pediatric_interval_hours = 6,
  pediatric_max_doses_per_day = 4,
  pediatric_min_interval_hours = 4,
  pediatric_max_single_value = 500,
  pediatric_max_single_unit = 'mg',
  pediatric_max_daily_value = 2000,
  pediatric_max_daily_unit = 'mg',
  pediatric_restriction = 'KÜB-ja zyrtare: ky formulim nuk rekomandohet te fëmijët ≥6 vjeç; nën 2 muaj nuk përdoret. Në 2 muaj, për temperaturë pas vaksinimit, jepet 2.5 mL. Pa rekomandim mjeku jo >3 ditë; mos kombino me produkte të tjera me paracetamol.',
  pediatric_source_url = 'https://devacomtr.s3.eu-west-2.amazonaws.com/urunler/kub/pirofen-120-mg5-ml-pediatrik-oral-suspansiyon-kub-10-04-2025.pdf',
  pediatric_source_section = '4.2 Pozoloji ve uygulama şekli / Pediyatrik popülasyon',
  pediatric_verification_status = 'verified',
  pediatric_verified_at = NOW()
WHERE registry_number = 3811;

UPDATE dosage_regimens r SET
  warnings = 'Multiple pediatric age bands have different intervals; no single typed exact schedule should represent all bands.',
  reviewed_by = 'MedIndex clinical audit 2026-08-17', reviewed_at = NOW(), updated_at = NOW()
FROM drugs d WHERE r.drug_id=d.id AND d.registry_number=2106 AND r.population='pediatric';

UPDATE dosage_regimens r SET
  frequency_text='3–4 administrime/24h; interval minimal 6 orë', maximum_text='Maksimumi 4 qese/24h.',
  warnings='Range 3–4/day must not become fixed 4/day.', reviewed_by='MedIndex clinical audit 2026-08-17', reviewed_at=NOW(), updated_at=NOW()
FROM drugs d WHERE r.drug_id=d.id AND d.registry_number=2420 AND r.population='pediatric';

UPDATE dosage_regimens r SET
  frequency_text='çdo 6 orë sipas nevojës', maximum_text='Maksimumi 60 mg/dozë dhe 240 mg/24h.',
  warnings='PRN opioid regimen; interval 6h is a minimum/PRN constraint, not a routine fixed schedule.', reviewed_by='MedIndex clinical audit 2026-08-17', reviewed_at=NOW(), updated_at=NOW()
FROM drugs d WHERE r.drug_id=d.id AND d.registry_number=2719 AND r.population='pediatric';

UPDATE dosage_regimens r SET
  dose_text='Topikale: për epitelizim 1–2 herë/ditë; te foshnjat pas çdo ndërrimi të pelenës; plagët mund të trajtohen disa herë gjatë ditës sipas nevojës.',
  frequency_text=NULL, maximum_text=NULL, warnings='No universal fixed pediatric frequency; use depends on indication.',
  reviewed_by='MedIndex clinical audit 2026-08-17', reviewed_at=NOW(), updated_at=NOW()
FROM drugs d WHERE r.drug_id=d.id AND d.registry_number=2926 AND r.population='pediatric';

UPDATE dosage_regimens r SET
  calculation_status='pending', dose_text='Dozimi pediatrik produkt-specifik kërkon rishikim të drejtpërdrejtë të KÜB-së së PANTENOL %5 pomad.',
  frequency_text=NULL, maximum_text=NULL, warnings='Official product page found; product-specific KÜB posology requires direct review.',
  reviewed_by='MedIndex clinical audit 2026-08-17', reviewed_at=NOW(), updated_at=NOW()
FROM drugs d WHERE r.drug_id=d.id AND d.registry_number=2927 AND r.population='pediatric';

UPDATE dosage_regimens r SET
  calculation_status='pending', dose_text='Dozimi pediatrik produkt-specifik për DOLOKIDS 120 mg/5 mL kërkon burim primar të lidhur me produktin.',
  frequency_text=NULL, maximum_text=NULL, warnings='TrePharm catalog confirms identity only; prior PAROL-derived dose is not accepted as product-specific evidence.',
  reviewed_by='MedIndex clinical audit 2026-08-17', reviewed_at=NOW(), updated_at=NOW()
FROM drugs d WHERE r.drug_id=d.id AND d.registry_number=3216 AND r.population='pediatric';

UPDATE dosage_regimens r SET
  calculation_status='pending', dose_text='Dozimi pediatrik produkt-specifik për MİNAMOL 120 mg/5 mL kërkon KÜB/RCP primar të lidhur drejtpërdrejt.',
  frequency_text=NULL, maximum_text=NULL, warnings='Prior dose was inherited from another 120 mg/5 mL product; direct primary Minamol KÜB/RCP required.',
  reviewed_by='MedIndex clinical audit 2026-08-17', reviewed_at=NOW(), updated_at=NOW()
FROM drugs d WHERE r.drug_id=d.id AND d.registry_number=3758 AND r.population='pediatric';

UPDATE dosage_regimens r SET
  dose_text='10–15 mg/kg për dozë çdo 6 orë; max 60 mg/kg/ditë; mbi 30 kg max 500 mg/dozë dhe 2 g/ditë.',
  frequency_text='çdo 6 orë; interval minimal 4 orë; jo >4 administrime/24h',
  maximum_text='Maksimumi 60 mg/kg/ditë; >30 kg max 500 mg/dozë dhe 2 g/ditë.',
  warnings='Formulimi nuk rekomandohet ≥6 vjeç dhe nuk përdoret <2 muaj; në 2 muaj post-vaksinë përdoret 2.5 mL sipas KÜB-së.',
  reviewed_by='MedIndex clinical audit 2026-08-17', reviewed_at=NOW(), updated_at=NOW()
FROM drugs d WHERE r.drug_id=d.id AND d.registry_number=3811 AND r.population='pediatric';

COMMIT;
