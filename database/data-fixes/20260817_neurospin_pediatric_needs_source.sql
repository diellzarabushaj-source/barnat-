-- 2026-08-17 — fail-closed cleanup for Neon-only Neurospin row.
-- No pediatric primary source is bound to this record. Do not infer a dose,
-- indication, ATC code or pediatric eligibility from product composition.

BEGIN;

UPDATE drugs
SET pediatric_verification_status = 'needs_source',
    pediatric_verified_at = NULL
WHERE registry_number IS NULL
  AND trade_name = 'Neurospin'
  AND pediatric_source_url IS NULL;

COMMIT;
