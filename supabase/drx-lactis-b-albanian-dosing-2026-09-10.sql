-- DRx / MedIndex — LACTIS B: Albanian clinical display + source-backed dosing
-- Date: 2026-09-10
-- Data-only, idempotent patch.
-- Primary dosing source: AGIPS Farmaceutici product pages.
-- Local Kosovo retailer recommendations are preserved as secondary evidence.

BEGIN;

-- LACTIS B COMPLEX — 14 stick-pack / sachets
UPDATE public.drugs
SET
  active_substance = 'Fermente laktike (probiotikë); vitamina të kompleksit B; inulinë (prebiotik)',
  pharmaceutical_form = 'Pluhur oral në qese (stick-pack)',
  drug_class = 'Suplement ushqimor — probiotikë + vitamina të kompleksit B + prebiotik',
  use_text = 'Suplement ushqimor që ndihmon në ruajtjen dhe rikthimin e ekuilibrit të florës intestinale. Burimet e produktit përmendin përdorim gjatë/pas diarresë, të vjellave, fryrjes/gazrave, ushqyerjes së çrregullt, stresit psiko-fizik ose trajtimit me antibiotikë. Këto janë përdorime të deklaruara për suplementin, jo indikacione të një bari.',
  product_status = 'Food supplement — Suplement ushqimor, jashtë regjistrit të barnave',
  approved_population = 'Pediatric and adult both',
  source_payload = source_payload || jsonb_build_object(
    'emri_shqip','LACTIS B COMPLEX — qese stick-pack',
    'forma_shqip','Pluhur oral në qese (stick-pack)',
    'grupi_klasa_shqip','Suplement ushqimor — probiotikë + vitamina të kompleksit B + prebiotik',
    'perdorimi_shqip','Ndihmon në ruajtjen/rikthimin e ekuilibrit të florës intestinale; burimet përmendin diarre, të vjella, fryrje/gazra, ushqyerje të çrregullt, stres psiko-fizik dhe përdorim të antibiotikëve.',
    'popullata_shqip','Të rritur dhe fëmijë; pa kufi moshe/peshe të specifikuar nga prodhuesi.',
    'Doza e plotë — Të rritur','2 qese stick-pack në ditë, ose sipas udhëzimit mjekësor. Të treten direkt në gojë ose në një gotë ujë/pije tjetër jo të nxehtë.',
    'Rruga — Të rritur','PO',
    'adult_dose_summary','2 qese stick-pack në ditë, ose sipas udhëzimit mjekësor; treten direkt në gojë ose në ujë/pije jo të nxehtë.',
    'Doza pediatrike — përmbledhje','2 qese stick-pack në ditë, ose sipas udhëzimit mjekësor. Të treten direkt në gojë ose në një gotë ujë/pije tjetër jo të nxehtë. Prodhuesi nuk jep ndarje sipas moshës ose peshës.',
    'Indikacioni pediatrik','Mbështetje e ekuilibrit të florës intestinale sipas përshkrimit të suplementit.',
    'Statusi i përdorimit pediatrik','LEJOHET',
    'Rruga pediatrike','PO',
    'Kufizim / mos-përdorim pediatrik','Nuk është përcaktuar regjim sipas moshës/peshës; mos e shndërro automatikisht në dozë mg/kg. Paralajmërimi për ta mbajtur larg fëmijëve nën 3 vjeç nuk është kufi dozimi.',
    'Burimi pediatrik','https://www.agipsfarmaceutici.it/linea_pediatrica.php?idc=44&idcback=43&idp=74',
    'Seksioni i burimit pediatrik','Modo d''uso / Linea Pediatrica',
    'Statusi i verifikimit pediatrik','verified',
    'Verifikuar më',now()::text,
    'Regimen ID kryesor','lactis-b-complex-stick:pediatric:agips-2026',
    'dose_primary_source','AGIPS Farmaceutici — LACTIS B-COMPLEX 14 Stick pack',
    'dose_primary_source_url','https://www.agipsfarmaceutici.it/linea_pediatrica.php?idc=44&idcback=43&idp=74',
    'dose_primary_verified_at','2026-09-10',
    'local_retailer_dose','Bora Pharmacy: 1 qese 2–3 herë në ditë; informacion lokal alternativ, jo doza primare.',
    'local_retailer_dose_url','https://borapharmacy.com/product?id=8744'
  ),
  updated_at = now()
WHERE upper(trade_name) = 'LACTIS B COMPLEX';

-- Trigger drugs_sync_pediatric_fields_from_source_payload populates structured pediatric columns.

UPDATE public.medindex_drug_core_map_v1 m
SET
  active_substance_override = 'Fermente laktike (probiotikë); vitamina të kompleksit B; inulinë (prebiotik)',
  form_override = 'Pluhur oral në qese (stick-pack)',
  snapshot_version = '2026-09-10-lactis-b-al-dosing-v3'
FROM public.drugs d
WHERE m.source_drug_id = d.id
  AND upper(d.trade_name) = 'LACTIS B COMPLEX';

INSERT INTO public.dosage_regimens (
  drug_id, population, dose_text, route, frequency_text, maximum_text, warnings,
  calculation_status, calculation_type, editorial_status, reviewed_by, reviewed_at,
  source_key, regimen_code, active_substance, pharmaceutical_form, indication_text,
  source_url, signatura_text, editorial_override
)
SELECT
  d.id, 'adult',
  '2 qese stick-pack në ditë, ose sipas udhëzimit mjekësor. Të treten direkt në gojë ose në një gotë ujë/pije tjetër jo të nxehtë.',
  'PO', '2 qese/ditë', 'Mos e tejkaloni dozën ditore të rekomanduar.',
  'Suplement ushqimor; nuk zëvendëson dietën e larmishme dhe stilin e shëndetshëm të jetesës.',
  'text_verified', 'fixed_dose', 'published', 'Source-backed update 2026-09-10', now(),
  'lactis-b-complex-stick:adult:agips-2026', 'LACTIS_B_STICK_ADULT',
  'Fermente laktike (probiotikë); vitamina të kompleksit B; inulinë (prebiotik)',
  'Pluhur oral në qese (stick-pack)',
  'Mbështetje e ekuilibrit të florës intestinale sipas përshkrimit të suplementit.',
  'https://www.agipsfarmaceutici.it/linea_pediatrica.php?idc=44&idcback=43&idp=74',
  'Merr 2 qese stick-pack në ditë; treten direkt në gojë ose në ujë/pije jo të nxehtë.',
  false
FROM public.drugs d
WHERE upper(d.trade_name) = 'LACTIS B COMPLEX'
ON CONFLICT (source_key) DO UPDATE SET
  drug_id=EXCLUDED.drug_id, population=EXCLUDED.population, dose_text=EXCLUDED.dose_text,
  route=EXCLUDED.route, frequency_text=EXCLUDED.frequency_text, maximum_text=EXCLUDED.maximum_text,
  warnings=EXCLUDED.warnings, calculation_status=EXCLUDED.calculation_status,
  calculation_type=EXCLUDED.calculation_type, editorial_status=EXCLUDED.editorial_status,
  reviewed_by=EXCLUDED.reviewed_by, reviewed_at=EXCLUDED.reviewed_at,
  active_substance=EXCLUDED.active_substance, pharmaceutical_form=EXCLUDED.pharmaceutical_form,
  indication_text=EXCLUDED.indication_text, source_url=EXCLUDED.source_url,
  signatura_text=EXCLUDED.signatura_text, updated_at=now();

INSERT INTO public.dosage_regimens (
  drug_id, population, dose_text, route, frequency_text, maximum_text, warnings,
  calculation_status, calculation_type, editorial_status, reviewed_by, reviewed_at,
  source_key, regimen_code, active_substance, pharmaceutical_form, indication_text,
  source_url, signatura_text, editorial_override
)
SELECT
  d.id, 'pediatric',
  '2 qese stick-pack në ditë, ose sipas udhëzimit mjekësor. Prodhuesi e liston produktin në linjën pediatrike, por nuk jep ndarje sipas moshës ose peshës.',
  'PO', '2 qese/ditë', 'Mos e tejkaloni dozën ditore të rekomanduar.',
  'Nuk ka kufi moshe/peshe të specifikuar në burim; paralajmërimi për ta mbajtur larg fëmijëve nën 3 vjeç nuk është kufi dozimi.',
  'text_verified', 'fixed_dose', 'published', 'Source-backed update 2026-09-10', now(),
  'lactis-b-complex-stick:pediatric:agips-2026', 'LACTIS_B_STICK_PED',
  'Fermente laktike (probiotikë); vitamina të kompleksit B; inulinë (prebiotik)',
  'Pluhur oral në qese (stick-pack)',
  'Mbështetje e ekuilibrit të florës intestinale sipas përshkrimit të suplementit.',
  'https://www.agipsfarmaceutici.it/linea_pediatrica.php?idc=44&idcback=43&idp=74',
  '2 qese stick-pack në ditë; pa dozë të veçantë sipas moshës/peshës në burim.',
  false
FROM public.drugs d
WHERE upper(d.trade_name) = 'LACTIS B COMPLEX'
ON CONFLICT (source_key) DO UPDATE SET
  drug_id=EXCLUDED.drug_id, population=EXCLUDED.population, dose_text=EXCLUDED.dose_text,
  route=EXCLUDED.route, frequency_text=EXCLUDED.frequency_text, maximum_text=EXCLUDED.maximum_text,
  warnings=EXCLUDED.warnings, calculation_status=EXCLUDED.calculation_status,
  calculation_type=EXCLUDED.calculation_type, editorial_status=EXCLUDED.editorial_status,
  reviewed_by=EXCLUDED.reviewed_by, reviewed_at=EXCLUDED.reviewed_at,
  active_substance=EXCLUDED.active_substance, pharmaceutical_form=EXCLUDED.pharmaceutical_form,
  indication_text=EXCLUDED.indication_text, source_url=EXCLUDED.source_url,
  signatura_text=EXCLUDED.signatura_text, updated_at=now();

-- LACTIS B-COMPLEX — 8 flacons x 10 mL
UPDATE public.drugs
SET
  active_substance = 'Kultura probiotike laktike (Lactobacilli; Bifidobacteria dhe kultura të tjera); vitamina të kompleksit B; inulinë (prebiotik)',
  pharmaceutical_form = 'Tretësirë orale në flakon 10 mL me kapak rezervuar',
  drug_class = 'Suplement ushqimor — probiotikë + vitamina të kompleksit B + prebiotik',
  use_text = 'Suplement ushqimor që ndihmon në ruajtjen e ekuilibrit të florës intestinale. Burimi lokal përmend përdorim gjatë diarresë, të vjellave, konstipacionit dhe trajtimit me antibiotikë. Këto janë përdorime të deklaruara për suplementin, jo indikacione të një bari.',
  product_status = 'Food supplement — Suplement ushqimor, jashtë regjistrit të barnave',
  approved_population = 'Pediatric and adult both',
  source_payload = source_payload || jsonb_build_object(
    'emri_shqip','LACTIS B-COMPLEX — 8 flakonë x 10 mL',
    'forma_shqip','Tretësirë orale në flakon 10 mL me kapak rezervuar',
    'grupi_klasa_shqip','Suplement ushqimor — probiotikë + vitamina të kompleksit B + prebiotik',
    'perdorimi_shqip','Ndihmon në ruajtjen e ekuilibrit të florës intestinale; burimi lokal përmend diarre, të vjella, konstipacion dhe përdorim të antibiotikëve.',
    'popullata_shqip','Të rritur dhe fëmijë; pa kufi moshe/peshe të specifikuar nga prodhuesi.',
    'Doza e plotë — Të rritur','1–2 flakonë nga 10 mL në ditë, ose sipas udhëzimit mjekësor, mundësisht me stomak bosh. Mund të hollohet në ujë; tundeni para përdorimit.',
    'Rruga — Të rritur','PO',
    'adult_dose_summary','1–2 flakonë nga 10 mL në ditë, ose sipas udhëzimit mjekësor, mundësisht me stomak bosh; mund të hollohet në ujë; tundeni para përdorimit.',
    'Doza pediatrike — përmbledhje','1–2 flakonë nga 10 mL në ditë, ose sipas udhëzimit mjekësor, mundësisht me stomak bosh. Mund të hollohet në ujë; tundeni para përdorimit. Prodhuesi nuk jep ndarje sipas moshës ose peshës.',
    'Indikacioni pediatrik','Mbështetje e ekuilibrit të florës intestinale sipas përshkrimit të suplementit.',
    'Statusi i përdorimit pediatrik','LEJOHET',
    'Rruga pediatrike','PO',
    'Kufizim / mos-përdorim pediatrik','Nuk është përcaktuar regjim sipas moshës/peshës; mos e shndërro automatikisht në dozë mg/kg. Paralajmërimi për ta mbajtur larg fëmijëve nën 3 vjeç nuk është kufi dozimi.',
    'Burimi pediatrik','https://www.agipsfarmaceutici.it/linea_pediatrica.php?idc=44&idcback=43&idp=50',
    'Seksioni i burimit pediatrik','Modo d''uso / Linea Pediatrica',
    'Statusi i verifikimit pediatrik','verified',
    'Verifikuar më',now()::text,
    'Regimen ID kryesor','lactis-b-complex-flacon:pediatric:agips-2026',
    'dose_primary_source','AGIPS Farmaceutici — LACTIS B-COMPLEX 8 Flaconcini 10 mL',
    'dose_primary_source_url','https://www.agipsfarmaceutici.it/linea_pediatrica.php?idc=44&idcback=43&idp=50',
    'dose_primary_verified_at','2026-09-10',
    'local_retailer_dose','Barnatore Online Kosovë: 1 flakon në ditë; informacion lokal alternativ, jo doza primare.',
    'local_retailer_dose_url','https://barnatoreonline-ks.com/product-details.php?product=lactis-b-complex-flacon-a8'
  ),
  updated_at = now()
WHERE upper(trade_name) = 'LACTIS B-COMPLEX FLACON A8';

UPDATE public.medindex_drug_core_map_v1 m
SET
  active_substance_override = 'Kultura probiotike laktike (Lactobacilli; Bifidobacteria dhe kultura të tjera); vitamina të kompleksit B; inulinë (prebiotik)',
  form_override = 'Tretësirë orale në flakon 10 mL me kapak rezervuar',
  snapshot_version = '2026-09-10-lactis-b-flacon-al-dosing-v3'
FROM public.drugs d
WHERE m.source_drug_id = d.id
  AND upper(d.trade_name) = 'LACTIS B-COMPLEX FLACON A8';

INSERT INTO public.dosage_regimens (
  drug_id, population, dose_text, route, frequency_text, maximum_text, warnings,
  calculation_status, calculation_type, editorial_status, reviewed_by, reviewed_at,
  source_key, regimen_code, active_substance, pharmaceutical_form, reference_strength,
  indication_text, source_url, signatura_text, editorial_override
)
SELECT
  d.id, 'adult',
  '1–2 flakonë nga 10 mL në ditë, ose sipas udhëzimit mjekësor, mundësisht me stomak bosh. Mund të hollohet në ujë; tundeni para përdorimit.',
  'PO', '1–2 flakonë/ditë', 'Mos e tejkaloni dozën ditore të rekomanduar.',
  'Suplement ushqimor; nuk zëvendëson dietën e larmishme dhe stilin e shëndetshëm të jetesës.',
  'text_verified', 'fixed_dose', 'published', 'Source-backed update 2026-09-10', now(),
  'lactis-b-complex-flacon:adult:agips-2026', 'LACTIS_B_FLACON_ADULT',
  'Kultura probiotike laktike; vitamina të kompleksit B; inulinë (prebiotik)',
  'Tretësirë orale në flakon 10 mL me kapak rezervuar', '10 mL/flakon',
  'Mbështetje e ekuilibrit të florës intestinale sipas përshkrimit të suplementit.',
  'https://www.agipsfarmaceutici.it/linea_pediatrica.php?idc=44&idcback=43&idp=50',
  'Merr 1–2 flakonë 10 mL në ditë, mundësisht me stomak bosh; tundeni para përdorimit.',
  false
FROM public.drugs d
WHERE upper(d.trade_name) = 'LACTIS B-COMPLEX FLACON A8'
ON CONFLICT (source_key) DO UPDATE SET
  drug_id=EXCLUDED.drug_id, population=EXCLUDED.population, dose_text=EXCLUDED.dose_text,
  route=EXCLUDED.route, frequency_text=EXCLUDED.frequency_text, maximum_text=EXCLUDED.maximum_text,
  warnings=EXCLUDED.warnings, calculation_status=EXCLUDED.calculation_status,
  calculation_type=EXCLUDED.calculation_type, editorial_status=EXCLUDED.editorial_status,
  reviewed_by=EXCLUDED.reviewed_by, reviewed_at=EXCLUDED.reviewed_at,
  active_substance=EXCLUDED.active_substance, pharmaceutical_form=EXCLUDED.pharmaceutical_form,
  reference_strength=EXCLUDED.reference_strength, indication_text=EXCLUDED.indication_text,
  source_url=EXCLUDED.source_url, signatura_text=EXCLUDED.signatura_text, updated_at=now();

INSERT INTO public.dosage_regimens (
  drug_id, population, dose_text, route, frequency_text, maximum_text, warnings,
  calculation_status, calculation_type, editorial_status, reviewed_by, reviewed_at,
  source_key, regimen_code, active_substance, pharmaceutical_form, reference_strength,
  indication_text, source_url, signatura_text, editorial_override
)
SELECT
  d.id, 'pediatric',
  '1–2 flakonë nga 10 mL në ditë, ose sipas udhëzimit mjekësor. Prodhuesi e liston produktin në linjën pediatrike, por nuk jep ndarje sipas moshës ose peshës.',
  'PO', '1–2 flakonë/ditë', 'Mos e tejkaloni dozën ditore të rekomanduar.',
  'Nuk ka kufi moshe/peshe të specifikuar në burim; paralajmërimi për ta mbajtur larg fëmijëve nën 3 vjeç nuk është kufi dozimi.',
  'text_verified', 'fixed_dose', 'published', 'Source-backed update 2026-09-10', now(),
  'lactis-b-complex-flacon:pediatric:agips-2026', 'LACTIS_B_FLACON_PED',
  'Kultura probiotike laktike; vitamina të kompleksit B; inulinë (prebiotik)',
  'Tretësirë orale në flakon 10 mL me kapak rezervuar', '10 mL/flakon',
  'Mbështetje e ekuilibrit të florës intestinale sipas përshkrimit të suplementit.',
  'https://www.agipsfarmaceutici.it/linea_pediatrica.php?idc=44&idcback=43&idp=50',
  '1–2 flakonë 10 mL në ditë; pa dozë të veçantë sipas moshës/peshës në burim.',
  false
FROM public.drugs d
WHERE upper(d.trade_name) = 'LACTIS B-COMPLEX FLACON A8'
ON CONFLICT (source_key) DO UPDATE SET
  drug_id=EXCLUDED.drug_id, population=EXCLUDED.population, dose_text=EXCLUDED.dose_text,
  route=EXCLUDED.route, frequency_text=EXCLUDED.frequency_text, maximum_text=EXCLUDED.maximum_text,
  warnings=EXCLUDED.warnings, calculation_status=EXCLUDED.calculation_status,
  calculation_type=EXCLUDED.calculation_type, editorial_status=EXCLUDED.editorial_status,
  reviewed_by=EXCLUDED.reviewed_by, reviewed_at=EXCLUDED.reviewed_at,
  active_substance=EXCLUDED.active_substance, pharmaceutical_form=EXCLUDED.pharmaceutical_form,
  reference_strength=EXCLUDED.reference_strength, indication_text=EXCLUDED.indication_text,
  source_url=EXCLUDED.source_url, signatura_text=EXCLUDED.signatura_text, updated_at=now();

COMMIT;
