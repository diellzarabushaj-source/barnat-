-- 2026-08-18 — pediatric in_review cleanup, batch 2.
-- #1679 is promoted only as a regulator-backed NOT_RECOMMENDED text record.
-- #2227 and #2419 are moved to needs_source because the linked products do not
-- match the local product form/composition. No calculator formula is activated.

BEGIN;

UPDATE public.drugs SET
  pediatric_dose_summary = 'Fëmijë dhe adoleshentë <18 vjeç: paroxetina nuk është e autorizuar për përdorim në këtë popullatë dhe nuk duhet përdorur rutinë; EMA raportoi rritje të sjelljes suicidale dhe armiqësisë në provat pediatrike.',
  pediatric_indication = 'Indikacionet e autorizuara të produktit janë për të rritur; nuk ka indikacion pediatrik të autorizuar për Paroxetina GP.',
  pediatric_use_status = 'NUK REKOMANDOHET',
  pediatric_min_age_value = NULL, pediatric_min_age_unit = NULL,
  pediatric_max_age_value = NULL, pediatric_max_age_unit = NULL,
  pediatric_min_weight_kg = NULL, pediatric_max_weight_kg = NULL,
  pediatric_dose_min = NULL, pediatric_dose_max = NULL,
  pediatric_dose_unit = NULL, pediatric_dose_basis = NULL,
  pediatric_doses_per_day = NULL, pediatric_interval_hours = NULL,
  pediatric_max_doses_per_day = NULL, pediatric_min_interval_hours = NULL,
  pediatric_max_single_value = NULL, pediatric_max_single_unit = NULL,
  pediatric_max_daily_value = NULL, pediatric_max_daily_unit = NULL,
  pediatric_route = 'PO',
  pediatric_restriction = 'EMA/CHMP: paroxetina nuk është e autorizuar për përdorim te fëmijët dhe adoleshentët; rekomandohet të mos përdoret në këtë popullatë. INFARMED konfirmon produktin Paroxetina GP 20 mg oral (regj. 5099650/5099668). Kalkulimi pediatrik nuk aplikohet.',
  pediatric_source_url = 'https://app10.infarmed.pt/genericos/genericos_II/lista_genericos.php?escolha_dci=UGFyb3hldGluYQ%3D%3D&fonte=dci&tabela=spr; https://www.ema.europa.eu/en/medicines/human/referrals/paroxetine',
  pediatric_source_section = 'INFARMED exact product identity; EMA/CHMP paroxetine referral — paediatric use recommendation',
  pediatric_verification_status = 'verified', pediatric_verified_at = NOW()
WHERE registry_number = 1679 AND pediatric_primary_regimen_id = 'card:1679:pediatric';

UPDATE public.drugs SET
  pediatric_dose_summary = NULL, pediatric_indication = NULL,
  pediatric_use_status = 'PA TË DHËNA',
  pediatric_min_age_value = NULL, pediatric_min_age_unit = NULL,
  pediatric_max_age_value = NULL, pediatric_max_age_unit = NULL,
  pediatric_min_weight_kg = NULL, pediatric_max_weight_kg = NULL,
  pediatric_dose_min = NULL, pediatric_dose_max = NULL,
  pediatric_dose_unit = NULL, pediatric_dose_basis = NULL,
  pediatric_doses_per_day = NULL, pediatric_interval_hours = NULL,
  pediatric_max_doses_per_day = NULL, pediatric_min_interval_hours = NULL,
  pediatric_max_single_value = NULL, pediatric_max_single_unit = NULL,
  pediatric_max_daily_value = NULL, pediatric_max_daily_unit = NULL,
  pediatric_route = NULL,
  pediatric_restriction = 'KËRKON BURIM PRODUCT-SPECIFIC: rreshti vendor Biolis është tadalafil 20 mg film-coated tablet nga Swiss Parenterals Pvt. Ltd. Burimi biolisgel.com i përket një produkti tjetër: tadalafil gel 20 mg oral, markë e Laboratorios Jayor në Panama. Comparator-i i AEMPS nuk zgjidh identitetin e produktit vendor. Mos përdor të dhëna pediatrike derisa të lidhet RCP/SmPC exact për tabletën Biolis të regjistruar.',
  pediatric_source_url = 'https://biolisgel.com/',
  pediatric_source_section = 'Product/form/manufacturer identity mismatch: local Biolis 20 mg film-coated tablet vs Biolis 20 mg oral gel',
  pediatric_verification_status = 'needs_source', pediatric_verified_at = NULL
WHERE registry_number = 2227 AND pediatric_primary_regimen_id = 'card:2227:pediatric';

UPDATE public.drugs SET
  pediatric_dose_summary = NULL, pediatric_indication = NULL,
  pediatric_use_status = 'PA TË DHËNA',
  pediatric_min_age_value = NULL, pediatric_min_age_unit = NULL,
  pediatric_max_age_value = NULL, pediatric_max_age_unit = NULL,
  pediatric_min_weight_kg = NULL, pediatric_max_weight_kg = NULL,
  pediatric_dose_min = NULL, pediatric_dose_max = NULL,
  pediatric_dose_unit = NULL, pediatric_dose_basis = NULL,
  pediatric_doses_per_day = NULL, pediatric_interval_hours = NULL,
  pediatric_max_doses_per_day = NULL, pediatric_min_interval_hours = NULL,
  pediatric_max_single_value = NULL, pediatric_max_single_unit = NULL,
  pediatric_max_daily_value = NULL, pediatric_max_daily_unit = NULL,
  pediatric_route = 'PO',
  pediatric_restriction = 'KËRKON BURIM PRODUCT-SPECIFIC: rreshti vendor TYLOLFEN HOT 500 mg+60 mg+4 mg përmban paracetamol + pseudoefedrinë + klorfeniraminë. Nobel Kosovë/Turqi e publikon këtë përbërje me emrin Tylol Hot, ndërsa Nobel Azerbaijan e publikon TYLOLFEN HOT me phenylephrine në vend të pseudoephedrinës. Mos përdor të dhëna pediatrike derisa të lidhet SmPC/KÜB që përputhet njëkohësisht me emrin vendor, fortësinë dhe përbërjen.',
  pediatric_source_url = 'https://kosova.nobel.com.tr/produkte/barna/tylol-hot-500mg-4mg-60mg-12-qeska; https://www.nobelfarma.az/en-us/our-products/drugs/tylolfen-hot-12-paket',
  pediatric_source_section = 'Product identity conflict: Tylol Hot pseudoephedrine formulation vs TYLOLFEN HOT phenylephrine formulation',
  pediatric_verification_status = 'needs_source', pediatric_verified_at = NULL
WHERE registry_number = 2419 AND pediatric_primary_regimen_id = 'card:2419:pediatric';

UPDATE public.dosage_regimens SET
  dose_text = 'Fëmijë dhe adoleshentë <18 vjeç: paroxetina nuk është e autorizuar dhe nuk rekomandohet për përdorim rutinë.',
  frequency_text = NULL, maximum_text = NULL,
  warnings = 'EMA/CHMP: increased suicidal behaviour/hostility signal in paediatric trials; paroxetine is not authorised in children/adolescents.',
  calculation_status = 'text_verified', editorial_status = 'published',
  reviewed_by = 'MedIndex clinical audit 2026-08-18', reviewed_at = NOW(), updated_at = NOW(),
  source_url = 'https://app10.infarmed.pt/genericos/genericos_II/lista_genericos.php?escolha_dci=UGFyb3hldGluYQ%3D%3D&fonte=dci&tabela=spr; https://www.ema.europa.eu/en/medicines/human/referrals/paroxetine'
WHERE source_key = 'card:1679:pediatric' AND population = 'pediatric';

UPDATE public.dosage_regimens SET
  dose_text = 'Dozimi/statusi pediatrik mbetet i bllokuar derisa të lidhet një RCP/SmPC product-specific për Biolis 20 mg film-coated tablet nga prodhuesi i rreshtit vendor.',
  frequency_text = NULL, maximum_text = NULL,
  warnings = 'Current Biolis URL belongs to a different 20 mg oral-gel product from Panama; do not transfer indication or pediatric status to the local film-coated tablet.',
  calculation_status = 'pending', editorial_status = 'in_review',
  reviewed_by = 'MedIndex clinical audit 2026-08-18', reviewed_at = NOW(), updated_at = NOW(), source_url = 'https://biolisgel.com/'
WHERE source_key = 'card:2227:pediatric' AND population = 'pediatric';

UPDATE public.dosage_regimens SET
  dose_text = 'Dozimi pediatrik mbetet i bllokuar derisa të lidhet një SmPC/KÜB që përputhet me emrin TYLOLFEN HOT dhe përbërjen paracetamol + pseudoefedrinë + klorfeniraminë.',
  frequency_text = NULL, maximum_text = NULL,
  warnings = 'Product identity mismatch: Nobel Kosovo/Turkey maps the pseudoephedrine combination to Tylol Hot; Nobel Azerbaijan maps TYLOLFEN HOT to a phenylephrine combination.',
  calculation_status = 'pending', editorial_status = 'in_review',
  reviewed_by = 'MedIndex clinical audit 2026-08-18', reviewed_at = NOW(), updated_at = NOW(),
  source_url = 'https://kosova.nobel.com.tr/produkte/barna/tylol-hot-500mg-4mg-60mg-12-qeska; https://www.nobelfarma.az/en-us/our-products/drugs/tylolfen-hot-12-paket'
WHERE source_key = 'card:2419:pediatric' AND population = 'pediatric';

COMMIT;
