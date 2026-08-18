-- 2026-08-18 — pediatric provenance cleanup, batch 6.
--
-- These rows were still marked in_review even though the linked evidence is a
-- secondary SmPC mirror, search page, comparator product, distributor/import
-- page, or identity-only registry entry. None has a bound primary exact-product
-- pediatric posology document. No dose fields are changed or inferred.

BEGIN;

UPDATE public.drugs
SET pediatric_verification_status = 'needs_source',
    pediatric_verified_at = NULL
WHERE registry_number IN (
  1695,1696,1697,1703,1704,1706,1708,1756,1757,
  1770,1771,1772,1773,1776,1777,1778,1782,1783,
  2251,2341,2414,2648,2660,2664,2672,2678,2689,
  2692,2698,2704,2717,2721,2722,2733,2738,2752,
  2753,2754,2761,2794,3238,3604
);

UPDATE public.dosage_regimens r
SET calculation_status = 'pending',
    editorial_status = 'in_review',
    warnings = concat_ws(' ', nullif(r.warnings, ''),
      'Primary product-specific pediatric posology source is still required; secondary/search/comparator evidence must not activate calculation.'),
    reviewed_by = 'OpenAI clinical audit 2026-08-18',
    reviewed_at = NOW(),
    updated_at = NOW()
FROM public.drugs d
WHERE r.drug_id = d.id
  AND d.registry_number IN (
    1695,1696,1697,1703,1704,1706,1708,1756,1757,
    1770,1771,1772,1773,1776,1777,1778,1782,1783,
    2251,2341,2414,2648,2660,2664,2672,2678,2689,
    2692,2698,2704,2717,2721,2722,2733,2738,2752,
    2753,2754,2761,2794,3238,3604
  )
  AND r.population = 'pediatric';

COMMIT;
