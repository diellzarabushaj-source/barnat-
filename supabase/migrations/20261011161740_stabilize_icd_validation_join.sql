-- A newly imported revision can be absent from the table's MCV statistics.
-- The one-row estimate must not turn the materialized parent lookup into
-- a quadratic nested loop over a complete 12,542-node snapshot.
-- These planner preferences are local to the two maintenance functions.
ALTER FUNCTION public.validate_icd_hierarchy_snapshot(text,jsonb) SET enable_nestloop='off';
ALTER FUNCTION public.validate_icd_hierarchy_snapshot(text,jsonb) SET enable_hashjoin='on';
ALTER FUNCTION public.inspect_icd_snapshot_validation(text) SET enable_nestloop='off';
ALTER FUNCTION public.inspect_icd_snapshot_validation(text) SET enable_hashjoin='on';
NOTIFY pgrst,'reload schema';
