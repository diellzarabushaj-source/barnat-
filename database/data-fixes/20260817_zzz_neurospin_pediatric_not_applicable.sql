-- 2026-08-17 — Neurospin is a food supplement, not a medicinal pediatric regimen.
-- Keep it out of the pediatric drug-dose calculator instead of treating the row
-- as a medicine whose SmPC is merely missing.
-- Manufacturer product page:
-- https://hamapharm.com/hr/proizvodi-2/neurospin-kapsule-a30-3/

BEGIN;

UPDATE public.drugs
SET pediatric_verification_status = 'not_applicable',
    pediatric_use_status = 'NUK APLIKOHET',
    pediatric_verified_at = NULL,
    pediatric_source_url = 'https://hamapharm.com/hr/proizvodi-2/neurospin-kapsule-a30-3/',
    pediatric_restriction = 'Neurospin është suplement ushqimor (dodatak prehrani), jo bar me regjim pediatrik të aprovuar për kalkulatorin e barnave. Për këtë arsye dozologjia pediatrike automatike nuk aplikohet.'
WHERE trade_name = 'Neurospin'
  AND manufacturer = 'Hamapharm'
  AND registry_number IS NULL;

COMMIT;
