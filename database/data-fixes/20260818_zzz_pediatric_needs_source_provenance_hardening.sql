-- 2026-08-18 — harden four pediatric needs_source rows whose linked evidence
-- belongs to a different product/brand/manufacturer.
--
-- Safety contract:
--   * no row is promoted;
--   * every typed pediatric dose/schedule/cap remains NULL;
--   * use status becomes PA TË DHËNA instead of implying a supported regimen;
--   * source_payload mirrors U:AX so the source_payload sync trigger cannot
--     erase the hardened pediatric metadata on a future payload update.

BEGIN;

CREATE TEMP TABLE _pediatric_provenance_hardening (
  registry_number integer PRIMARY KEY,
  indication text,
  route text,
  restriction text,
  source_url text,
  source_section text,
  warning_text text,
  finding text
) ON COMMIT DROP;

INSERT INTO _pediatric_provenance_hardening VALUES
(
  1595,
  'rosacea inflamatore (papula/pustula/eritemë)',
  'TOP',
  'KËRKON BURIM EXACT PËR ROZAMEX: regjistri zyrtar i Maqedonisë së Veriut në linkun e mëparshëm është ROZAMET 10 mg/g krem nga Jadran, jo ROZAMEX 10 mg/g nga Gentipharm. Comparatorët nuk përdoren si evidencë product-specific; posologjia pediatrike mbetet e bllokuar.',
  'https://www.gentipharm.com/registered-drugs; https://lekovi.zdravstvo.gov.mk/drugsregister/detailview/2446308917',
  'Provenance blocker: Gentipharm identity catalog + official North Macedonia record is ROZAMET/Jadran, not ROZAMEX/Gentipharm',
  'Linked North Macedonia regulator record is ROZAMET 10 mg/g by Jadran, not ROZAMEX 10 mg/g by Gentipharm. Keep fail-closed until exact ROZAMEX primary label is bound.',
  'linked regulator record is ROZAMET/Jadran, not ROZAMEX/Gentipharm'
),
(
  1621,
  'kandidiazë vaginale; infeksion fungal vaginal',
  'VAGINAL',
  'KËRKON BURIM EXACT PËR MECLOZOL: regjistri zyrtar i Maqedonisë së Veriut në linkun e mëparshëm është GINOFIX 500 mg+200 mg nga Replek, jo Meclozol 500 mg+100 mg nga Gentipharm. Mos transfero dozë/kufizim nga ky produkt tjetër.',
  'https://www.gentipharm.com/registered-drugs; https://lekovi.zdravstvo.gov.mk/drugsregister/detailview/3477217023',
  'Provenance blocker: Gentipharm identity catalog + official North Macedonia record is GINOFIX 500+200/Replek, not Meclozol 500+100/Gentipharm',
  'Linked North Macedonia regulator record is GINOFIX 500+200 mg by Replek, not Meclozol 500+100 mg by Gentipharm. Keep fail-closed.',
  'linked regulator record is GINOFIX 500+200/Replek, not Meclozol 500+100/Gentipharm'
),
(
  1670,
  'diabet tip 2; ul glukozën; terapi e kombinuar',
  'PO',
  'KËRKON BURIM EXACT PËR EMPIGET-M: Getz Pharma publikon DIAMPA-M për kombinimin empagliflozin+metformin dhe Empiget si linjë tjetër; faqja DIAMPA-M nuk është dokument product-specific për markën Empiget-M të këtij rreshti. Posologjia pediatrike mbetet e bllokuar.',
  'https://getzpharma.com/product/diampa-m/; https://getzpharma.com/products/',
  'Provenance blocker: official Getz source is DIAMPA-M, not Empiget-M; exact Empiget-M RCP/leaflet required',
  'Official Getz page is DIAMPA-M, not Empiget-M. Same ingredients/strength do not establish product-specific pediatric evidence.',
  'official Getz page is DIAMPA-M, not Empiget-M'
),
(
  2762,
  'Vertigo/motion-related symptoms ku cinnarizine 25 mg do të indikohej.',
  'PO',
  'KËRKON BURIM EXACT PËR CINARIZINE PROFARMA: linku ANMDMR W10590001 identifikon STUGERON 25 mg nga TERAPIA S.A., jo CINARIZINE 25 mg nga PROFARMA. Mos transfero posologji ose kufizime pediatrike nga STUGERON.',
  'https://nomenclator.anm.ro/medicamente?cim=W10590001&direction=asc&order=cim',
  'Provenance blocker: ANMDMR W10590001 is STUGERON 25 mg/Terapia, not CINARIZINE 25 mg/Profarma',
  'ANMDMR W10590001 is STUGERON 25 mg by Terapia, not CINARIZINE 25 mg by Profarma. Keep fail-closed.',
  'ANMDMR W10590001 is STUGERON/Terapia, not CINARIZINE/Profarma'
);

-- source_payload is source-owned for Sheet rows. Populate every pediatric U:AX
-- key in the same UPDATE so the BEFORE UPDATE OF source_payload trigger produces
-- exactly the hardened mirror columns instead of NULLing them.
UPDATE drugs d
SET
  source_payload = COALESCE(d.source_payload, '{}'::jsonb) || jsonb_build_object(
    'Doza pediatrike — përmbledhje', NULL,
    'Indikacioni pediatrik', e.indication,
    'Statusi i përdorimit pediatrik', 'PA TË DHËNA',
    'Mosha minimale — vlerë', NULL,
    'Mosha minimale — njësi', NULL,
    'Mosha maksimale — vlerë', NULL,
    'Mosha maksimale — njësi', NULL,
    'Pesha minimale (kg)', NULL,
    'Pesha maksimale (kg)', NULL,
    'Doza pediatrike — min', NULL,
    'Doza pediatrike — max', NULL,
    'Njësia e dozës', NULL,
    'Baza e dozës', NULL,
    'Nr. dozave / ditë', NULL,
    'Intervali (orë)', NULL,
    'Maks. për dozë — vlerë', NULL,
    'Maks. për dozë — njësi', NULL,
    'Maks. në 24h — vlerë', NULL,
    'Maks. në 24h — njësi', NULL,
    'Rruga pediatrike', e.route,
    'Kufizim / mos-përdorim pediatrik', e.restriction,
    'Koncentrimi — sasia', NULL,
    'Koncentrimi — njësi', NULL,
    'Koncentrimi për — sasia', NULL,
    'Koncentrimi për — njësi', NULL,
    'Burimi pediatrik', e.source_url,
    'Seksioni i burimit pediatrik', e.source_section,
    'Statusi i verifikimit pediatrik', 'needs_source',
    'Verifikuar më', NULL,
    'Regimen ID kryesor', 'card:' || d.registry_number || ':pediatric',
    'medindex_pediatric_provenance_audit', jsonb_build_object(
      'reviewed_at', '2026-08-18',
      'status', 'needs_source',
      'rule', 'exact_product_primary_source_required',
      'trigger_safe_payload_sync', true,
      'finding', e.finding
    )
  ),
  pediatric_max_doses_per_day = NULL,
  pediatric_min_interval_hours = NULL
FROM _pediatric_provenance_hardening e
WHERE d.registry_number = e.registry_number;

UPDATE dosage_regimens r
SET
  calculation_status = 'pending',
  editorial_status = 'in_review',
  dose_text = 'Dozimi pediatrik product-specific nuk është verifikuar; kërkohet burim primar exact për produktin e regjistruar.',
  frequency_text = NULL,
  maximum_text = NULL,
  calculation_type = NULL,
  dose_value_min = NULL,
  dose_value_max = NULL,
  doses_per_day = NULL,
  interval_hours = NULL,
  max_single_mg = NULL,
  max_daily_mg = NULL,
  concentration_mg = NULL,
  concentration_ml = NULL,
  min_age_months = NULL,
  max_age_months = NULL,
  min_weight_kg = NULL,
  max_weight_kg = NULL,
  formula_text = NULL,
  warnings = e.warning_text,
  source_url = e.source_url,
  reviewed_by = 'MedIndex clinical audit 2026-08-18',
  reviewed_at = NOW(),
  updated_at = NOW()
FROM drugs d
JOIN _pediatric_provenance_hardening e ON e.registry_number = d.registry_number
WHERE r.drug_id = d.id AND r.population = 'pediatric';

INSERT INTO audit_logs(entity_type, entity_id, action, old_data, new_data, changed_by, source, changed_at)
SELECT
  'drug',
  d.id,
  'pediatric_needs_source_provenance_hardening_migration',
  jsonb_build_object('note', 'linked evidence was not exact-product primary pediatric evidence'),
  jsonb_build_object(
    'registry_number', d.registry_number,
    'pediatric_verification_status', d.pediatric_verification_status,
    'pediatric_use_status', d.pediatric_use_status,
    'pediatric_source_url', d.pediatric_source_url,
    'pediatric_source_section', d.pediatric_source_section,
    'typed_fields_cleared', true,
    'source_payload_mirrored', true
  ),
  'MedIndex migration',
  'Exact-product provenance audit 2026-08-18',
  NOW()
FROM drugs d
JOIN _pediatric_provenance_hardening e ON e.registry_number = d.registry_number;

COMMIT;
