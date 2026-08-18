BEGIN;

UPDATE drugs
SET pediatric_dose_summary = 'COLISTIN/NORMA 1,000,000 IU/vial (IV infusion): SPC-ja exact e produktit përfshin fëmijë, edhe neonatë. Fëmijë ≤40 kg: 75,000–150,000 IU/kg/ditë të ndara në 3 doza. >40 kg: merret në konsideratë skema e të rriturit. Të dhënat pediatrike janë shumë të kufizuara dhe zgjedhja e dozës duhet të marrë parasysh maturimin renal.',
    pediatric_indication = 'Infeksione serioze nga patogjenë aerobë Gram-negativë të zgjedhur te pacientë me mundësi të kufizuara trajtimi; exact COLISTIN/NORMA 1 MIU powder for solution for infusion.',
    pediatric_use_status = 'KUFIZUAR',
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
    pediatric_route = 'IV',
    pediatric_restriction = 'VERIFIED TEXT_ONLY: SPC-ja exact product-specific jep një regjim piecewise (≤40 kg kundrejt >40 kg), thekson të dhëna shumë të kufizuara, maturimin renal dhe mungesën e rekomandimeve të vendosura për fëmijë me dëmtim renal. Mos e ktheni automatikisht në formulë të vetme mg/IU për dozë.',
    pediatric_source_url = 'https://www.normahellas.gr/en/Products/antiinfectives-systemic-use/colistin-norma2; https://www.normahellas.gr/images/products/63engfile.pdf',
    pediatric_source_section = 'Exact COLISTIN/NORMA SPC: sections 4.1 and 4.2, Pediatric population; 1,000,000 IU/vial infusion presentation',
    pediatric_verification_status = 'verified',
    pediatric_verified_at = COALESCE(pediatric_verified_at, NOW())
WHERE registry_number = 2457;

UPDATE dosage_regimens
SET dose_text = 'Exact COLISTIN/NORMA SPC: children ≤40 kg 75,000–150,000 IU/kg/day divided in 3 doses; >40 kg consider adult dosing recommendation.',
    frequency_text = '≤40 kg: daily dose divided in 3 doses; >40 kg: adult regimen may be considered.',
    maximum_text = NULL,
    warnings = 'Pediatric evidence is very limited. Dose selection should account for renal maturity; no established dosing recommendation for children with impaired renal function. Keep TEXT_ONLY because the regimen is piecewise and high-risk.',
    calculation_status = 'text_verified',
    calculation_type = NULL,
    dose_value_min = NULL,
    dose_value_max = NULL,
    doses_per_day = NULL,
    interval_hours = NULL,
    max_single_mg = NULL,
    max_daily_mg = NULL,
    min_age_months = NULL,
    max_age_months = NULL,
    min_weight_kg = NULL,
    max_weight_kg = NULL,
    editorial_status = 'published',
    reviewed_by = 'OpenAI clinical audit 2026-08-18',
    reviewed_at = COALESCE(reviewed_at, NOW()),
    updated_at = NOW(),
    source_url = 'https://www.normahellas.gr/en/Products/antiinfectives-systemic-use/colistin-norma2; https://www.normahellas.gr/images/products/63engfile.pdf'
WHERE source_key = 'card:2457:pediatric';

COMMIT;
