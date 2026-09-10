-- DRx / MedIndex — corrective source-provenance patch for LACTIS B
-- Date: 2026-09-10
-- Purpose: keep the exact Kosovo retailer recommendation separate from the current AGIPS formulation.
-- Bora Kosovo product 8744 lists inulin and recommends 1 sachet 2–3 times/day.
-- Current AGIPS pediatric stick-pack page recommends 2 stick-packs/day but publishes a different ingredient list.

BEGIN;

UPDATE public.drugs
SET source_payload = source_payload || jsonb_build_object(
  'Doza e plotë — Të rritur','1 qese, 2–3 herë në ditë. Të merret direkt në gojë ose të tretet në rreth 100 mL ujë/pije tjetër jo të nxehtë, mundësisht në stomak bosh ndërmjet vakteve.',
  'Rruga — Të rritur','PO',
  'adult_dose_summary','1 qese, 2–3 herë në ditë; direkt në gojë ose në rreth 100 mL ujë/pije jo të nxehtë, mundësisht në stomak bosh ndërmjet vakteve.',
  'dose_primary_source','Bora Pharmacy Kosovo — LACTIS B COMPLEX, product 8744',
  'dose_primary_source_url','https://borapharmacy.com/product?id=8744',
  'dose_primary_verified_at','2026-09-10',
  'Doza pediatrike — përmbledhje','Për formulimin aktual AGIPS të listuar në linjën pediatrike: 2 qese stick-pack në ditë, pa ndarje sipas moshës ose peshës. Formula e listuar nga Bora Pharmacy Kosovo nuk përputhet plotësisht me formulimin aktual AGIPS, prandaj kjo dozë nuk duhet interpretuar si dozë pediatrike e konfirmuar specifikisht për SKU-në lokale pa verifikim të paketimit/formulës.',
  'Indikacioni pediatrik','Mbështetje e ekuilibrit të florës intestinale sipas përshkrimit të suplementit.',
  'Statusi i përdorimit pediatrik','KUFIZUAR',
  'Rruga pediatrike','PO',
  'Kufizim / mos-përdorim pediatrik','Burimi lokal Bora nuk jep regjim pediatrik të ndarë sipas moshës/peshës. AGIPS e liston formulimin aktual stick-pack në linjën pediatrike me 2 qese/ditë, por përbërja e publikuar ndryshon nga lista e Bora-s; kërkohet konfirmim i formulimit lokal para përdorimit si dozë pediatrike specifike.',
  'Burimi pediatrik','https://www.agipsfarmaceutici.it/linea_pediatrica.php?idc=44&idcback=43&idp=74',
  'Seksioni i burimit pediatrik','Modo d''uso / Linea Pediatrica',
  'Statusi i verifikimit pediatrik','in_review',
  'Verifikuar më',now()::text,
  'Regimen ID kryesor','lactis-b-complex-stick:pediatric:agips-2026',
  'manufacturer_current_formulation_dose','AGIPS aktual: 2 stick-pack në ditë ose sipas udhëzimit mjekësor.',
  'manufacturer_current_formulation_url','https://www.agipsfarmaceutici.it/linea_pediatrica.php?idc=44&idcback=43&idp=74',
  'dose_source_variance','Bora Kosovo (produkt 8744): 1 qese 2–3 herë/ditë dhe liston inulinë. AGIPS aktual: 2 stick-pack/ditë dhe publikon formulim të ndryshëm; burimet ruhen veçmas.'
), updated_at = now()
WHERE upper(trade_name)='LACTIS B COMPLEX';

DELETE FROM public.dosage_regimens
WHERE source_key='lactis-b-complex-stick:adult:agips-2026';

INSERT INTO public.dosage_regimens (
  drug_id,population,dose_text,route,frequency_text,maximum_text,warnings,
  calculation_status,calculation_type,editorial_status,reviewed_by,reviewed_at,
  source_key,regimen_code,active_substance,pharmaceutical_form,indication_text,
  source_url,signatura_text,editorial_override
)
SELECT d.id,'adult',
  '1 qese, 2–3 herë në ditë. Të merret direkt në gojë ose të tretet në rreth 100 mL ujë/pije tjetër jo të nxehtë, mundësisht në stomak bosh ndërmjet vakteve.',
  'PO','1 qese, 2–3 herë/ditë','Mos e tejkaloni dozën ditore të rekomanduar të produktit.',
  'Doza është rekomandimi i produktit të listuar nga Bora Pharmacy Kosovo; suplement ushqimor, jo bar.',
  'text_verified','fixed_dose','published','Source-backed update 2026-09-10',now(),
  'lactis-b-complex-stick:adult:bora-2026','LACTIS_B_STICK_ADULT_KS',
  'Fermente laktike (probiotikë); vitamina të kompleksit B; inulinë (prebiotik)',
  'Pluhur oral në qese (stick-pack)',
  'Mbështetje e ekuilibrit të florës intestinale sipas përshkrimit të suplementit.',
  'https://borapharmacy.com/product?id=8744',
  'Merr 1 qese 2–3 herë në ditë, direkt në gojë ose në rreth 100 mL ujë/pije jo të nxehtë, mundësisht ndërmjet vakteve.',false
FROM public.drugs d WHERE upper(d.trade_name)='LACTIS B COMPLEX'
ON CONFLICT (source_key) DO UPDATE SET
  drug_id=excluded.drug_id,population=excluded.population,dose_text=excluded.dose_text,route=excluded.route,
  frequency_text=excluded.frequency_text,maximum_text=excluded.maximum_text,warnings=excluded.warnings,
  calculation_status=excluded.calculation_status,calculation_type=excluded.calculation_type,
  editorial_status=excluded.editorial_status,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,
  active_substance=excluded.active_substance,pharmaceutical_form=excluded.pharmaceutical_form,
  indication_text=excluded.indication_text,source_url=excluded.source_url,signatura_text=excluded.signatura_text,updated_at=now();

UPDATE public.dosage_regimens
SET dose_text='Formulimi aktual AGIPS i listuar në linjën pediatrike: 2 qese stick-pack në ditë, ose sipas udhëzimit mjekësor; pa ndarje sipas moshës ose peshës. Përbërja e publikuar nga AGIPS ndryshon nga ajo e produktit lokal Bora, prandaj kjo nuk është dozë pediatrike e konfirmuar specifikisht për SKU-në kosovare.',
    route='PO',
    frequency_text='2 qese/ditë për formulimin aktual AGIPS',
    warnings='Kërkohet konfirmim i formulimit/paketimit lokal para se kjo dozë të përdoret si regjim pediatrik specifik për SKU-në e Bora Pharmacy Kosovo.',
    calculation_status='text_verified',
    editorial_status='published',
    source_url='https://www.agipsfarmaceutici.it/linea_pediatrica.php?idc=44&idcback=43&idp=74',
    signatura_text='AGIPS aktual: 2 qese stick-pack në ditë; pa regjim sipas moshës/peshës. Verifiko formulimin lokal para përdorimit pediatrik.',
    reviewed_by='Source-variance review 2026-09-10', reviewed_at=now(), updated_at=now()
WHERE source_key='lactis-b-complex-stick:pediatric:agips-2026';

UPDATE public.drugs
SET source_payload = source_payload || jsonb_build_object(
  'udhëzimi_i_përgatitjes_shqip','Rrotullo kapakun në kahun antiorar derisa përmbajtja e kapakut të bjerë në tretësirë; tunde mirë; hape dhe pije menjëherë.',
  'local_retailer_dose','Barnatore Online Kosovë: 1 flakon në ditë.',
  'manufacturer_dose','AGIPS: 1–2 flakonë nga 10 mL në ditë, ose sipas udhëzimit mjekësor, mundësisht me stomak bosh.',
  'dose_source_variance','Barnatore Online Kosovo rekomandon 1 flakon/ditë; prodhuesi AGIPS jep 1–2 flakonë/ditë. Doza e prodhuesit ruhet si regjim primar; rekomandimi lokal ruhet si alternativë.'
), updated_at=now()
WHERE upper(trade_name)='LACTIS B-COMPLEX FLACON A8';

COMMIT;
