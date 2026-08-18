-- 2026-08-18 — Diurocard 50 mg/20 mg (#2142) pediatric verification.
-- Exact product identity: ANMDMR Nomenclator, CIM W58726003.
-- Exact official leaflet: ANMDMR PRO 12842/13.12.2019.
-- The leaflet states the product is not suitable for children/adolescents and
-- administration in this population is not recommended. No pediatric dose is
-- inferred and all calculator fields remain empty.

BEGIN;

UPDATE public.drugs
SET pediatric_dose_summary = 'Fëmijë dhe adoleshentë: Diurocard 50 mg/20 mg nuk është i përshtatshëm për përdorim dhe administrimi nuk rekomandohet.',
    pediatric_use_status = 'NUK REKOMANDOHET',
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
    pediatric_restriction = 'ANMDMR: prospecti exact i Diurocard 50 mg/20 mg thotë se produkti nuk është i përshtatshëm për fëmijë/adoleshentë dhe se administrimi në këtë popullatë nuk rekomandohet.',
    pediatric_source_url = 'https://nomenclator.anm.ro/medicamente?cim=W58726003&direction=asc&order=codAtc; https://www.anm.ro/_/_PRO/pro_12842_13.12.19.pdf',
    pediatric_source_section = 'Prospect section 3: Cum să utilizaţi Diurocard / Copii şi adolescenţi',
    pediatric_verification_status = 'verified',
    pediatric_verified_at = NOW()
WHERE registry_number = 2142
  AND pediatric_primary_regimen_id = 'card:2142:pediatric';

UPDATE public.dosage_regimens r
SET dose_text = 'Fëmijë dhe adoleshentë: Diurocard 50 mg/20 mg nuk është i përshtatshëm për përdorim; administrimi nuk rekomandohet.',
    frequency_text = NULL,
    maximum_text = NULL,
    warnings = 'Përdorimi pediatrik/adoleshent është i bllokuar nga prospecti product-specific i ANMDMR.',
    calculation_status = 'text_verified',
    editorial_status = 'published',
    reviewed_by = 'OpenAI clinical audit 2026-08-18',
    reviewed_at = NOW(),
    updated_at = NOW(),
    source_url = 'https://www.anm.ro/_/_PRO/pro_12842_13.12.19.pdf'
FROM public.drugs d
WHERE r.drug_id = d.id
  AND d.registry_number = 2142
  AND r.population = 'pediatric'
  AND r.source_key = 'card:2142:pediatric';

COMMIT;
