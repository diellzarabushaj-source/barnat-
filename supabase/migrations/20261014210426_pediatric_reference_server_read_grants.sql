-- The runtime reads these immutable references with its existing server-only key.
-- Keep direct browser roles blocked and do not grant writes.
DO $grant_guard$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('pediatric_common_reference_snapshots_v1','pediatric_weight_age_defaults_v1') AND NOT c.relrowsecurity) THEN
    RAISE EXCEPTION 'Pediatric reference RLS must remain enabled';
  END IF;
END
$grant_guard$;
GRANT SELECT ON TABLE public.pediatric_common_reference_snapshots_v1, public.pediatric_weight_age_defaults_v1 TO service_role;
