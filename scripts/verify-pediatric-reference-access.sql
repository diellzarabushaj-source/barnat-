-- Read-only operational check: no patient data and no persistent role change.
BEGIN READ ONLY;
SET LOCAL ROLE service_role;
SELECT
  (SELECT count(*) FROM public.pediatric_common_reference_snapshots_v1
    WHERE dataset_key = 'pediatric_common_drugs_20260928') AS reference_rows,
  (SELECT count(*) FROM public.pediatric_weight_age_defaults_v1
    WHERE dataset_key = 'pediatric_weight_age_default_20260928') AS age_rows,
  (SELECT count(*) FROM public.pediatric_clinical_audits_v1
    WHERE dataset_key = 'pediatric_clinical_audit_20260928') AS audit_rows;
ROLLBACK;

SELECT relation_name,
  has_table_privilege('service_role', 'public.' || relation_name, 'SELECT') AS server_read,
  has_table_privilege('anon', 'public.' || relation_name, 'SELECT') AS anonymous_read,
  has_table_privilege('authenticated', 'public.' || relation_name, 'SELECT') AS direct_user_read,
  (SELECT relrowsecurity FROM pg_class
    WHERE oid = ('public.' || relation_name)::regclass) AS rls_enabled
FROM unnest(ARRAY[
  'pediatric_common_reference_snapshots_v1',
  'pediatric_weight_age_defaults_v1'
]) AS relation_name;
