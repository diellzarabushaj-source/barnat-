-- 2026-08-18 — pediatric provenance cleanup, batch 5.
--
-- These rows have official product/catalog identity evidence, but no bound
-- product-specific pediatric posology document. Identity is not dosing evidence.
-- Keep them fail-closed as needs_source until an exact leaflet/SmPC/RCP is bound.
--
-- Sources:
--   #2157 ARDBEG: Lebanon MoPH exact identity = ARDBEG 80MG ADULTS.
--   #2542/#2544/#2549/#2550: Olpha official product catalog.
--   Remaining rows: TrePharm official OTC/RX product catalogs.

BEGIN;

UPDATE public.drugs
SET pediatric_verification_status = 'needs_source',
    pediatric_verified_at = NULL,
    pediatric_source_section = CASE
      WHEN registry_number = 2157 THEN
        'Lebanon MoPH exact product identity: ARDBEG 80MG ADULTS; product-specific pediatric posology/age statement not provided'
      WHEN registry_number IN (2542,2544,2549,2550) THEN
        'Olpha official product catalog: identity/portfolio evidence only; product-specific pediatric posology document required'
      ELSE
        'TrePharm official OTC/RX catalog: identity/form/strength evidence only; product-specific pediatric posology document required'
    END,
    pediatric_restriction = CASE
      WHEN registry_number = 2157 THEN
        'Lebanon MoPH confirms the exact 80 mg ketoprofen lysine powder presentation as ARDBEG 80MG ADULTS, but the database entry does not provide product-specific pediatric posology or an explicit pediatric contraindication/recommendation. Keep fail-closed until an exact leaflet/SmPC is bound.'
      WHEN registry_number IN (2542,2544,2549,2550) THEN
        'Olpha official catalog confirms portfolio identity only; no product-specific pediatric posology document is bound to this row.'
      ELSE
        'TrePharm official product catalog confirms identity/form/strength only; no product-specific pediatric posology document is bound to this row.'
    END
WHERE registry_number IN (
  2157,2542,2544,2549,2550,
  3121,3163,3166,3168,3201,3213,3218,3221,3239,3246
);

UPDATE public.dosage_regimens r
SET calculation_status = 'pending',
    editorial_status = 'in_review',
    warnings = 'Product identity/catalog evidence is available, but a product-specific pediatric posology source is not bound. Keep fail-closed.',
    reviewed_by = 'OpenAI clinical audit 2026-08-18',
    reviewed_at = NOW(),
    updated_at = NOW()
FROM public.drugs d
WHERE r.drug_id = d.id
  AND d.registry_number IN (
    2157,2542,2544,2549,2550,
    3121,3163,3166,3168,3201,3213,3218,3221,3239,3246
  )
  AND r.population = 'pediatric';

COMMIT;
