-- MedIndex pediatric audit — 2026-08-18
-- Registry #95 Mucosoft complex 500 mg/200 mg sachet.
-- Official Adipharm directions are internally inconsistent for pediatric use:
-- 1 sachet 3–4x/day, while the same source states pediatric daily ceilings of
-- 1.8 g paracetamol and 600 mg acetylcysteine. Because 4 sachets exceed both
-- pediatric ceilings, MedIndex must not infer an undocumented “max 3 sachets/day”.

UPDATE drugs
SET pediatric_dose_summary = 'BURIMI ZYRTAR KA KONFLIKT TË BRENDSHËM: ≥12 vjeç jepet 1 qese 3–4 herë/ditë me interval 4–6 orë, por njëkohësisht nuk duhet tejkaluar 1.8 g paracetamol/ditë te fëmijët dhe 600 mg acetylcysteine/ditë. Çdo qese përmban 500 mg + 200 mg; prandaj skema nuk strukturohet automatikisht derisa dokumenti të sqarohet nga prodhuesi/regulatori.',
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
    pediatric_min_interval_hours = NULL,
    pediatric_max_single_value = 1,
    pediatric_max_single_unit = 'qese',
    pediatric_max_daily_value = NULL,
    pediatric_max_daily_unit = NULL,
    pediatric_route = 'PO',
    pediatric_restriction = 'Nën 12 vjeç nuk rekomandohet. Mos infero “maksimum 3 qese/ditë” nga kufijtë e përbërësve: faqja zyrtare jep njëkohësisht 3–4 qese/ditë dhe caps pediatrikë që nuk përputhen me 4 qese. Mbetet IN_REVIEW / TEXT_ONLY derisa të ketë sqarim product-specific.',
    pediatric_concentration_value = NULL,
    pediatric_concentration_unit = NULL,
    pediatric_concentration_per_value = NULL,
    pediatric_concentration_per_unit = NULL,
    pediatric_source_url = 'https://adipharm.com/en/product/mukosoft-kompleks-200-mg',
    pediatric_source_section = 'Official product page / Usage / Patient leaflet: ≥12 years; 1 sachet 3–4 times daily; pediatric paracetamol and acetylcysteine daily ceilings',
    pediatric_verification_status = 'in_review',
    pediatric_verified_at = NULL,
    updated_at = now()
WHERE registry_number = 95;

UPDATE dosage_regimens
SET dose_text = '≥12 vjeç: burimi zyrtar jep 1 qese për administrim, por skema ditore ka konflikt të brendshëm dhe nuk strukturohet.',
    frequency_text = 'Burimi: 3–4 herë/ditë, interval 4–6 orë; mos e përdor si schedule automatik për shkak të konfliktit me caps ditore.',
    duration_text = 'Trajtim afatshkurtër; përdoret doza më e ulët efektive për kohën më të shkurtër.',
    maximum_text = 'Kufijtë e publikuar: 1.8 g paracetamol/ditë te fëmijët dhe 600 mg acetylcysteine/ditë; nuk përkthehen automatikisht në numër qesesh.',
    warnings = 'IN_REVIEW / TEXT_ONLY — burimi zyrtar është kontradiktor. Mos infero max 3 qese/ditë dhe mos publiko schedule automatik pa sqarim product-specific.',
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
    min_age_months = 144,
    max_age_months = NULL,
    editorial_status = 'in_review',
    reviewed_by = 'OpenAI clinical audit 2026-08-18',
    reviewed_at = TIMESTAMPTZ '2026-08-18T07:32:00Z',
    source_url = 'https://adipharm.com/en/product/mukosoft-kompleks-200-mg',
    updated_at = now()
WHERE source_key = 'card:95:pediatric';
