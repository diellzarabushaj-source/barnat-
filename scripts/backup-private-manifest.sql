-- Read-only parity of complete stored rows; never returns row values or keys.
-- The same ephemeral, masked salt is supplied to source and isolated restore.
DO $check$
BEGIN
  IF coalesce(current_setting('drx.backup_fingerprint_salt', true), '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Private backup fingerprint salt is missing or invalid';
  END IF;
END
$check$;
WITH rows AS (
  SELECT 'user_notes' AS dataset, to_jsonb(t)::text AS value FROM public.user_notes t
  UNION ALL SELECT 'user_favorites', to_jsonb(t)::text FROM public.user_favorites t
  UNION ALL SELECT 'user_prescriptions', to_jsonb(t)::text FROM public.user_prescriptions t
  UNION ALL SELECT 'medindex_users', to_jsonb(t)::text FROM public.medindex_users t
  UNION ALL SELECT 'note_receipts', to_jsonb(t)::text FROM note_write_private.receipts t
  UNION ALL SELECT 'prescription_receipts', to_jsonb(t)::text FROM prescription_write_private.receipts t
  UNION ALL SELECT 'note_control', to_jsonb(t)::text FROM note_write_private.control t
  UNION ALL SELECT 'prescription_control', to_jsonb(t)::text FROM prescription_write_private.control t
), digests AS (
  SELECT dataset, encode(sha256(convert_to(current_setting('drx.backup_fingerprint_salt') || ':' || dataset || ':' || value, 'UTF8')), 'hex') AS digest FROM rows
), datasets(dataset) AS (
  VALUES ('user_notes'), ('user_favorites'), ('user_prescriptions'), ('medindex_users'),
    ('note_receipts'), ('prescription_receipts'), ('note_control'), ('prescription_control')
), totals AS (
  SELECT datasets.dataset, count(digests.digest) AS count,
    encode(sha256(convert_to(current_setting('drx.backup_fingerprint_salt') || ':' || datasets.dataset || ':' || coalesce(string_agg(digests.digest, '' ORDER BY digests.digest), ''), 'UTF8')), 'hex') AS fingerprint
  FROM datasets LEFT JOIN digests USING (dataset) GROUP BY datasets.dataset
)
SELECT dataset || '_private_' || field || '=' || value AS entry
FROM totals CROSS JOIN LATERAL (VALUES ('count', count::text), ('fingerprint', fingerprint)) AS entries(field, value)
ORDER BY dataset, field;
