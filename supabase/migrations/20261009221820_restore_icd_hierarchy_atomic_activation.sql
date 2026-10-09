-- Restore the missing Supabase activation RPC without rewriting source nodes.
-- One complete, validated revision becomes visible in the same transaction.
CREATE OR REPLACE FUNCTION public.activate_icd_hierarchy_revision(p_revision text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET lock_timeout = '3s'
AS $function$
DECLARE
  v_status text;
  v_declared_counts jsonb;
  v_counts jsonb;
  v_invalid integer;
BEGIN
  IF p_revision IS NULL OR pg_catalog.btrim(p_revision) = '' THEN
    RAISE EXCEPTION 'ICD hierarchy revision is required' USING ERRCODE = '22023';
  END IF;

  -- Serialize activations; the existing partial unique index is a second guard.
  PERFORM pg_catalog.pg_advisory_xact_lock(7470670931834101::bigint);
  -- Freeze revision writers first; FK key-share reads remain available.
  LOCK TABLE public.icd_hierarchy_revisions IN SHARE ROW EXCLUSIVE MODE;
  -- Readers remain available. Node writes cannot race validation.
  LOCK TABLE public.icd_hierarchy_nodes IN SHARE MODE;
  SELECT r.status, r.counts INTO v_status, v_declared_counts
  FROM public.icd_hierarchy_revisions r
  WHERE r.revision = p_revision
  FOR UPDATE;
  IF NOT FOUND OR v_status <> 'staging' THEN
    RAISE EXCEPTION 'ICD hierarchy revision is not staging' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'total', count(*),
    'chapter', count(*) FILTER (WHERE n.level_name = 'chapter'),
    'block', count(*) FILTER (WHERE n.level_name = 'block'),
    'category', count(*) FILTER (WHERE n.level_name = 'category'),
    'subcategory', count(*) FILTER (WHERE n.level_name = 'subcategory')
  ) INTO v_counts
  FROM public.icd_hierarchy_nodes n WHERE n.revision = p_revision;

  IF v_counts IS DISTINCT FROM '{"total":12542,"chapter":22,"block":274,"category":2050,"subcategory":10196}'::jsonb
    OR v_declared_counts IS DISTINCT FROM v_counts THEN
    RAISE EXCEPTION 'ICD hierarchy counts invalid' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_invalid
  FROM public.icd_hierarchy_nodes n
  LEFT JOIN public.icd_hierarchy_nodes p
    ON p.revision = n.revision AND p.code = n.parent_code
  WHERE n.revision = p_revision AND (
    NOT n.is_published
    OR pg_catalog.btrim(n.code) = ''
    OR pg_catalog.btrim(n.title_en) = ''
    OR CASE n.level_name
      WHEN 'chapter' THEN
        coalesce(pg_catalog.btrim(n.parent_code), '') <> ''
        OR n.chapter_code IS DISTINCT FROM n.code
      WHEN 'block' THEN
        p.code IS NULL OR p.level_name <> 'chapter'
        OR n.chapter_code IS DISTINCT FROM p.code
        OR n.block_code IS DISTINCT FROM n.code
      WHEN 'category' THEN
        p.code IS NULL OR p.level_name <> 'block'
        OR n.chapter_code IS DISTINCT FROM p.chapter_code
        OR n.block_code IS DISTINCT FROM p.code
      WHEN 'subcategory' THEN
        p.code IS NULL OR p.level_name <> 'category'
        OR n.chapter_code IS DISTINCT FROM p.chapter_code
        OR n.block_code IS DISTINCT FROM p.block_code
      ELSE true
    END
  );
  IF v_invalid <> 0 THEN
    RAISE EXCEPTION 'ICD hierarchy has invalid publication or parent links'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.icd_hierarchy_revisions
  SET status = 'superseded' WHERE status = 'active' AND revision <> p_revision;
  UPDATE public.icd_hierarchy_revisions
  SET status = 'active', activated_at = pg_catalog.now(), error_summary = NULL
  WHERE revision = p_revision;

  RETURN v_counts || pg_catalog.jsonb_build_object('revision', p_revision, 'orphans', 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.activate_icd_hierarchy_revision(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_icd_hierarchy_revision(text) TO service_role;
COMMENT ON FUNCTION public.activate_icd_hierarchy_revision(text) IS
  'Service-only atomic activation of a complete ICD-10 WHO 2019 hierarchy; source nodes are never rewritten.';
NOTIFY pgrst, 'reload schema';
