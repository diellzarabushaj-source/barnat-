-- MedIndex pediatric audit — 2026-08-18
-- Final source-hardening for in_review records whose exact product identity is known
-- but whose primary quantitative pediatric document cannot yet be safely ingested.
-- No status promotion and no calculator activation.

-- #2182 KETONAL FORTE 100 mg: ANMDMR confirms exact LEK product; ŠÚKL/VVKT
-- link current primary SPC/RPP, but document retrieval is not available to this audit.
-- Remove secondary/mirror dosing narrative and preserve only primary-source facts.
UPDATE drugs
SET pediatric_dose_summary = 'IN_REVIEW / TEXT_ONLY: regulatorët primarë konfirmojnë exact KETONAL FORTE 100 mg, ketoprofen, tabletë e filmuar, përdorim oral; ŠÚKL shënon se produkti ka dozimin pediatrik dhe lidh SPC të përditësuar 02/2025. Teksti i SPC-së primare nuk u rikuperua dot nga endpoint-i, ndaj nuk publikohet kufi moshe, dozë ose frekuencë nga mirror/comparator.',
    pediatric_min_age_value = NULL,
    pediatric_min_age_unit = NULL,
    pediatric_max_age_value = NULL,
    pediatric_max_age_unit = NULL,
    pediatric_min_weight_kg = NULL,
    pediatric_max_weight_kg = NULL,
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
    pediatric_route = 'PO',
    pediatric_restriction = 'ANMDMR konfirmon exact KETONAL FORTE 100 mg me LEK PHARMACEUTICALS D.D.; ŠÚKL/VVKT konfirmojnë exact product dhe current SPC/RPP. Derisa përmbajtja e dokumentit primar të lexohet drejtpërdrejt, mos trashëgo pragun >15 vjeç ose dozimin nga ADC/mirror. Mbetet IN_REVIEW / TEXT_ONLY.',
    pediatric_source_url = 'https://nomenclator.anm.ro/medicamente?cim=W03883001&direction=asc&order=codAtc; https://www.sukl.sk/ketonal-forte-100-mg-76653; https://vapris.vvkt.lt/vvkt-web/public/medications/view/15898?lang=en',
    pediatric_source_section = 'ANMDMR exact product identity; ŠÚKL current SPC metadata (02/2025, pediatric dosing = yes); VVKT exact RPP linked 2025-03-27; primary document content retrieval pending',
    pediatric_verification_status = 'in_review',
    pediatric_verified_at = NULL,
    updated_at = now()
WHERE registry_number = 2182;

UPDATE dosage_regimens
SET dose_text = 'Exact product është konfirmuar nga regulatorët; dozimi pediatrik sasior nuk publikohet derisa SPC/RPP primare të lexohet drejtpërdrejt.',
    frequency_text = NULL,
    duration_text = NULL,
    maximum_text = NULL,
    warnings = 'IN_REVIEW / TEXT_ONLY — mos përdor dozimin nga mirror/comparator. Primary regulator metadata confirms pediatric dosing exists, but exact primary SPC content has not been ingested.',
    calculation_status = 'pending',
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
    editorial_status = 'in_review',
    reviewed_by = 'OpenAI clinical audit 2026-08-18',
    source_url = 'https://nomenclator.anm.ro/medicamente?cim=W03883001&direction=asc&order=codAtc; https://www.sukl.sk/ketonal-forte-100-mg-76653; https://vapris.vvkt.lt/vvkt-web/public/medications/view/15898?lang=en',
    updated_at = now()
WHERE source_key = 'card:2182:pediatric';

-- #2457 COLISTIN/NORMA 1,000,000 IU: exact product/form/strength are primary-verified;
-- primary pediatric posology content remains unavailable. Keep zero quantitative model.
UPDATE drugs
SET pediatric_dose_summary = 'IN_REVIEW / TEXT_ONLY: Norma Hellas dhe regjistri zyrtar konfirmojnë exact COLISTIN/NORMA 1,000,000 IU/vial, colistimethate sodium, pluhur për solucion për infuzion, paketim 1 vial. Dokumenti primar me posologjinë pediatrike nuk u rikuperua; nuk transferohet dozë nga produkte colistimethate të tjera.',
    pediatric_min_age_value = NULL,
    pediatric_min_age_unit = NULL,
    pediatric_max_age_value = NULL,
    pediatric_max_age_unit = NULL,
    pediatric_min_weight_kg = NULL,
    pediatric_max_weight_kg = NULL,
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
    pediatric_restriction = 'Exact produkt/formë/fortësi janë konfirmuar, por për shkak se colistimethate është high-risk dhe doza varet nga mosha, pesha, funksioni renal, indikacioni dhe njësitë IU/CMS, nuk publikohet asnjë regjim pa lexuar RCP/leaflet-in primar exact të COLISTIN/NORMA 1,000,000 IU infusion.',
    pediatric_source_url = 'https://www.normahellas.gr/en/Products/antiinfectives-systemic-use/colistin-norma2; https://lekovi.zdravstvo.gov.mk/drugsregister/detailview/1693168609',
    pediatric_source_section = 'Norma Hellas exact 1,000,000 IU infusion product; national registry exact identity; primary pediatric posology document retrieval pending',
    pediatric_verification_status = 'in_review',
    pediatric_verified_at = NULL,
    updated_at = now()
WHERE registry_number = 2457;

UPDATE dosage_regimens
SET dose_text = 'Exact COLISTIN/NORMA 1,000,000 IU infusion është konfirmuar; dozimi pediatrik sasior nuk publikohet pa RCP/leaflet primar exact.',
    frequency_text = NULL,
    duration_text = NULL,
    maximum_text = NULL,
    warnings = 'IN_REVIEW / TEXT_ONLY — high-risk colistimethate; do not inherit IU/CMS dosing from another product or formulation.',
    calculation_status = 'pending',
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
    editorial_status = 'in_review',
    reviewed_by = 'OpenAI clinical audit 2026-08-18',
    source_url = 'https://www.normahellas.gr/en/Products/antiinfectives-systemic-use/colistin-norma2; https://lekovi.zdravstvo.gov.mk/drugsregister/detailview/1693168609',
    updated_at = now()
WHERE source_key = 'card:2457:pediatric';

-- #4013 DAFALGAN PEDIATRIE is a Neon-only Belgian manual external reference,
-- not a Kosovo-verified registry product. Current brand materials conflict on
-- 3–50 kg versus 4–50 kg, so remove the inherited historical French 3–32 kg model.
UPDATE drugs
SET pediatric_dose_summary = 'KARTELË E JASHTME BELGE / IN_REVIEW: DAFALGAN PEDIATRIE 30 mg/mL është formulim pediatrik me pipetë sipas peshës, por kufiri i peshës nuk është i qëndrueshëm në materialet aktuale të UPSA/Dafalgan (faqet e produktit/legal copy japin 3–50 kg, ndërsa homepage aktuale jep 4–50 kg). Regjistrimi vendor në Kosovë nuk është verifikuar; nuk publikohet regjim automatik derisa të lidhet dokument regulator exact dhe identiteti i tregut.',
    pediatric_min_age_value = NULL,
    pediatric_min_age_unit = NULL,
    pediatric_max_age_value = NULL,
    pediatric_max_age_unit = NULL,
    pediatric_min_weight_kg = NULL,
    pediatric_max_weight_kg = NULL,
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
    pediatric_route = 'PO',
    pediatric_restriction = 'Mos trashëgo kufirin historik francez 3–32 kg ose skemën 15 mg/kg si model typed për këtë kartelë. source_payload e identifikon si manual_external_reference nga Belgjika dhe kosovo_registration_verified=false. Materialet aktuale të markës kanë konflikt 3–50 vs 4–50 kg; mbetet IN_REVIEW / TEXT_ONLY.',
    pediatric_concentration_value = 30,
    pediatric_concentration_unit = 'mg',
    pediatric_concentration_per_value = 1,
    pediatric_concentration_per_unit = 'mL',
    pediatric_source_url = 'https://dafalgan.be/nl/dafalgan-voor-babys-en-kinderen/; https://dafalgan.be/nl/homepage/',
    pediatric_source_section = 'Current UPSA/Dafalgan Belgium pediatric product/legal copy; conflicting 3–50 kg vs 4–50 kg weight boundaries; local market identity unverified',
    pediatric_verification_status = 'in_review',
    pediatric_verified_at = NULL,
    updated_at = now()
WHERE registry_number = 4013;
