-- 2026-08-18 — pediatric in_review cleanup, batch 1.
--
-- Safety goal: promote only product-/regulator-backed content that can be
-- verified without inventing a calculator formula. All four rows remain
-- fail-closed for automatic dosing because their typed dose basis is NULL or
-- the clinical status blocks calculation.
--
-- Reviewed sources:
--   #1686 Ibum Sport gel — Hasco-Lek product page + product ChPL.
--   #1688 Ibum Express 400 mg — Hasco-Lek current 400 mg soft-caps leaflet.
--   #2151 SOSARIA — AIFA authorised-population restriction + Gazzetta label update.
--   #2927 PANTENOL %5 pomad — Saba product-specific KÜB.

BEGIN;

UPDATE public.drugs SET
  pediatric_dose_summary = 'Adoleshentë mbi 12 vjeç: aplikohet në lëkurë një shirit xheli 5–12 cm (rreth 50–125 mg ibuprofen) në zonën e dhimbshme, deri 3 herë në ditë; nën 12 vjeç nuk ka indikacion të përshtatshëm për këtë formulim.',
  pediatric_indication = 'dhimbje dhe inflamacion lokal muskuloskeletal',
  pediatric_use_status = 'KUFIZUAR',
  pediatric_min_age_value = NULL,
  pediatric_min_age_unit = NULL,
  pediatric_max_age_value = NULL,
  pediatric_max_age_unit = NULL,
  pediatric_dose_min = NULL,
  pediatric_dose_max = NULL,
  pediatric_dose_unit = NULL,
  pediatric_dose_basis = NULL,
  pediatric_doses_per_day = NULL,
  pediatric_interval_hours = NULL,
  pediatric_max_single_value = NULL,
  pediatric_max_single_unit = NULL,
  pediatric_max_daily_value = NULL,
  pediatric_max_daily_unit = NULL,
  pediatric_route = 'TOP',
  pediatric_restriction = 'Burimi product-specific thotë “mbi 12 vjeç”. Ky formulim ruhet si TEXT_ONLY që engine-i të mos shpikë një kufi inkluziv moshe ose njësi të shiritit në cm si formulë automatike.',
  pediatric_source_url = 'https://www.hasco-lek.pl/produkty/ibum-sport-zel/; https://www.hasco-lek.pl/wp-content/uploads/2023/02/Charakterystyka-IBUM-SPORT-50-mg-30-mg-zel.pdf',
  pediatric_source_section = 'ChPL 4.2 Posology and method of administration / Children below 12 years',
  pediatric_verification_status = 'verified',
  pediatric_verified_at = NOW()
WHERE registry_number = 1686
  AND pediatric_primary_regimen_id = 'card:1686:pediatric';

UPDATE public.drugs SET
  pediatric_dose_summary = 'Adoleshentë mbi 12 vjeç: 400 mg (1 kapsulë) nga goja; sipas nevojës mund të përsëritet çdo 4–6 orë; maksimumi 1200 mg (3 kapsula) në 24 orë. Nën 12 vjeç nuk përdoret.',
  pediatric_indication = 'dhimbje e lehtë–mesatare; dismenorre; temperaturë',
  pediatric_use_status = 'KUFIZUAR',
  pediatric_min_age_value = NULL,
  pediatric_min_age_unit = NULL,
  pediatric_max_age_value = NULL,
  pediatric_max_age_unit = NULL,
  pediatric_dose_min = NULL,
  pediatric_dose_max = NULL,
  pediatric_dose_unit = NULL,
  pediatric_dose_basis = NULL,
  pediatric_doses_per_day = NULL,
  pediatric_interval_hours = NULL,
  pediatric_max_single_value = NULL,
  pediatric_max_single_unit = NULL,
  pediatric_max_daily_value = NULL,
  pediatric_max_daily_unit = NULL,
  pediatric_route = 'PO',
  pediatric_restriction = 'Hasco-Lek e etiketon aktualisht formulimin 400 mg soft-caps si IBUM EXPRESS FORTE. Regjistri vendor e mban emrin IBUM EXPRESS. Dosa është verifikuar si tekst, por nuk aktivizohet automatikisht derisa identiteti i emrit vendor dhe kufiri “mbi 12 vjeç” të modelohen pa inferencë.',
  pediatric_source_url = 'https://www.hasco-lek.pl/produkty/ibum-express-forte/; https://www.hasco-lek.pl/wp-content/uploads/2023/02/Ulotka-IBUM-EXPRESS-FORTE-400-mg-kapsulki-miekkie.pdf',
  pediatric_source_section = 'Product leaflet / ChPL 4.2 Posology and method of administration',
  pediatric_verification_status = 'verified',
  pediatric_verified_at = NOW()
WHERE registry_number = 1688
  AND pediatric_primary_regimen_id = 'card:1688:pediatric';

UPDATE public.drugs SET
  pediatric_dose_summary = 'Fëmijë dhe adoleshentë <18 vjeç: përdorimi i kombinimit fiks salbutamol/ipratropium 3.75 mg/mL + 0.75 mg/mL nuk indikohet; AIFA e ka kufizuar këtë FDC në popullatën adulte.',
  pediatric_indication = 'Bronkospazëm te pacientët adultë me COPD që kërkojnë terapi të rregullt si me ipratropium bromide ashtu edhe me salbutamol.',
  pediatric_use_status = 'NUK REKOMANDOHET',
  pediatric_dose_min = NULL,
  pediatric_dose_max = NULL,
  pediatric_dose_unit = NULL,
  pediatric_dose_basis = NULL,
  pediatric_doses_per_day = NULL,
  pediatric_interval_hours = NULL,
  pediatric_max_single_value = NULL,
  pediatric_max_single_unit = NULL,
  pediatric_max_daily_value = NULL,
  pediatric_max_daily_unit = NULL,
  pediatric_restriction = 'AIFA: kombinimi fiks 0.375% + 0.075% është kufizuar te të rriturit >18 vjeç; përdorimi te fëmijët dhe adoleshentët nuk indikohet. Gazzetta Ufficiale konfirmon SOSARIA 3.75 mg/mL + 0.75 mg/mL dhe përditësimin e stampave sipas kërkesave të autoritetit.',
  pediatric_source_url = 'https://www.gazzettaufficiale.it/eli/id/2023/08/10/TX23ADD8309/p2; https://www.aifa.gov.it/en/-/modifica-di-indicazioni-e-popolazione-autorizzata-dei-medicinali-a-base-dell-associazione-fissa-fdc',
  pediatric_source_section = 'AIFA authorised population update (05 Jul 2023); Gazzetta Ufficiale SOSARIA label update (10 Aug 2023)',
  pediatric_verification_status = 'verified',
  pediatric_verified_at = NOW()
WHERE registry_number = 2151
  AND pediatric_primary_regimen_id = 'card:2151:pediatric';

UPDATE public.drugs SET
  pediatric_dose_summary = 'Topikale: për përshpejtim të epitelizimit përdoret 1–2 herë/ditë; te foshnjat aplikohet pas ndërrimit të pelenës; në plagë mund të aplikohet disa herë gjatë ditës deri në mbylljen e plagës.',
  pediatric_indication = 'plagë sipërfaqësore; djegie; dermatit/piqje; rigjenerim dhe epitelizim i lëkurës',
  pediatric_use_status = 'KUFIZUAR',
  pediatric_dose_min = NULL,
  pediatric_dose_max = NULL,
  pediatric_dose_unit = NULL,
  pediatric_dose_basis = NULL,
  pediatric_doses_per_day = NULL,
  pediatric_interval_hours = NULL,
  pediatric_max_single_value = NULL,
  pediatric_max_single_unit = NULL,
  pediatric_max_daily_value = NULL,
  pediatric_max_daily_unit = NULL,
  pediatric_route = 'TOP',
  pediatric_restriction = 'KÜB-ja product-specific jep udhëzim për foshnjat dhe frekuenca të ndryshme sipas indikacionit, por në seksionin “Pediyatrik popülasyon” shënon se nuk ka të dhëna shtesë. Nuk ekziston një frekuencë pediatrike universale; ruhet TEXT_ONLY.',
  pediatric_source_url = 'https://sabailac.com.tr/urunler/pantenol-5-pomad-recetesiz-urun; https://sabailac.com.tr/assets/urunler/kub/pantenol-5-pomad-kub-26082014.pdf',
  pediatric_source_section = 'KÜB 4.2 Pozoloji ve uygulama şekli / Pediyatrik popülasyon',
  pediatric_verification_status = 'verified',
  pediatric_verified_at = NOW()
WHERE registry_number = 2927
  AND pediatric_primary_regimen_id = 'card:2927:pediatric';

UPDATE public.dosage_regimens SET
  dose_text = 'Adoleshentë mbi 12 vjeç: aplikohet në lëkurë një shirit xheli 5–12 cm (rreth 50–125 mg ibuprofen) deri 3 herë në ditë; nën 12 vjeç nuk ka indikacion të përshtatshëm për këtë formulim.',
  frequency_text = 'deri 3 herë/ditë',
  maximum_text = NULL,
  warnings = 'TEXT_ONLY: burimi thotë mbi 12 vjeç dhe dozën si gjatësi shiriti në cm; mos e shndërro në formulë automatike.',
  calculation_status = 'text_verified',
  editorial_status = 'published',
  reviewed_by = 'MedIndex clinical audit 2026-08-18',
  reviewed_at = NOW(), updated_at = NOW(),
  source_url = 'https://www.hasco-lek.pl/produkty/ibum-sport-zel/; https://www.hasco-lek.pl/wp-content/uploads/2023/02/Charakterystyka-IBUM-SPORT-50-mg-30-mg-zel.pdf'
WHERE source_key = 'card:1686:pediatric' AND population = 'pediatric';

UPDATE public.dosage_regimens SET
  dose_text = 'Adoleshentë mbi 12 vjeç: 400 mg (1 kapsulë) PO; sipas nevojës përsëritet çdo 4–6 orë; maksimumi 1200 mg (3 kapsula) në 24 orë. Nën 12 vjeç nuk përdoret.',
  frequency_text = 'çdo 4–6 orë sipas nevojës',
  maximum_text = 'Maksimumi 1200 mg (3 kapsula) në 24 orë.',
  warnings = 'TEXT_ONLY: emri vendor është IBUM EXPRESS ndërsa Hasco-Lek e etiketon formulimin aktual 400 mg si IBUM EXPRESS FORTE; mos aktivizo kalkulim pa zgjidhur identitetin e emrit dhe kufirin >12 vjeç.',
  calculation_status = 'text_verified',
  editorial_status = 'published',
  reviewed_by = 'MedIndex clinical audit 2026-08-18',
  reviewed_at = NOW(), updated_at = NOW(),
  source_url = 'https://www.hasco-lek.pl/produkty/ibum-express-forte/; https://www.hasco-lek.pl/wp-content/uploads/2023/02/Ulotka-IBUM-EXPRESS-FORTE-400-mg-kapsulki-miekkie.pdf'
WHERE source_key = 'card:1688:pediatric' AND population = 'pediatric';

UPDATE public.dosage_regimens SET
  dose_text = 'Fëmijë dhe adoleshentë <18 vjeç: kombinimi fiks salbutamol/ipratropium 3.75 mg/mL + 0.75 mg/mL nuk indikohet.',
  frequency_text = NULL,
  maximum_text = NULL,
  warnings = 'AIFA e kufizon këtë fixed-dose combination në popullatën adulte; nuk ka regjim pediatrik për kalkulim.',
  calculation_status = 'text_verified',
  editorial_status = 'published',
  reviewed_by = 'MedIndex clinical audit 2026-08-18',
  reviewed_at = NOW(), updated_at = NOW(),
  source_url = 'https://www.gazzettaufficiale.it/eli/id/2023/08/10/TX23ADD8309/p2; https://www.aifa.gov.it/en/-/modifica-di-indicazioni-e-popolazione-autorizzata-dei-medicinali-a-base-dell-associazione-fissa-fdc'
WHERE source_key = 'card:2151:pediatric' AND population = 'pediatric';

UPDATE public.dosage_regimens SET
  dose_text = 'Topikale: për epitelizim 1–2 herë/ditë; te foshnjat pas ndërrimit të pelenës; në plagë mund të aplikohet disa herë gjatë ditës deri në mbylljen e plagës.',
  frequency_text = NULL,
  maximum_text = NULL,
  warnings = 'No universal fixed pediatric frequency; product KÜB gives indication-dependent topical use and states no additional pediatric-population data.',
  calculation_status = 'text_verified',
  editorial_status = 'published',
  reviewed_by = 'MedIndex clinical audit 2026-08-18',
  reviewed_at = NOW(), updated_at = NOW(),
  source_url = 'https://sabailac.com.tr/assets/urunler/kub/pantenol-5-pomad-kub-26082014.pdf'
WHERE source_key = 'card:2927:pediatric' AND population = 'pediatric';

COMMIT;
