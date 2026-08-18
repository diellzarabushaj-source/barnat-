-- 2026-08-18 — pediatric provenance cleanup, batch 7.
--
-- Final queue normalization: these rows do not have a bound primary exact-product
-- pediatric posology source. They use comparator SmPCs, mismatched strengths/forms,
-- product identity pages, or secondary KÜB/RCP mirrors. Keep them needs_source.
-- Genuine in_review is reserved for cases with exact evidence that still requires
-- resolution (source conflict, engine-model limitation, inaccessible exact RCP,
-- or unresolved market identity).

BEGIN;

UPDATE public.drugs
SET pediatric_verification_status = 'needs_source',
    pediatric_verified_at = NULL
WHERE registry_number IN (
  805,1145,1506,1507,1589,1595,1621,1628,1670,2070,
  2215,2383,2384,2399,2412,2658,2662,2671,2696,2699,
  2714,2762,2836,3137,3148,3151,3177,3838,3985,3991
);

UPDATE public.dosage_regimens r
SET calculation_status = 'pending',
    editorial_status = 'in_review',
    warnings = concat_ws(' ', nullif(r.warnings, ''),
      'Exact primary product-specific pediatric posology is not bound; keep fail-closed as needs_source.'),
    reviewed_by = 'OpenAI clinical audit 2026-08-18',
    reviewed_at = NOW(),
    updated_at = NOW()
FROM public.drugs d
WHERE r.drug_id = d.id
  AND d.registry_number IN (
    805,1145,1506,1507,1589,1595,1621,1628,1670,2070,
    2215,2383,2384,2399,2412,2658,2662,2671,2696,2699,
    2714,2762,2836,3137,3148,3151,3177,3838,3985,3991
  )
  AND r.population = 'pediatric';

COMMIT;
