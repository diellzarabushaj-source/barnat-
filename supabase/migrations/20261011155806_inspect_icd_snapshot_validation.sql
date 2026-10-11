-- Service-only read-only plan inspection: no ANALYZE, user data or credentials.
CREATE OR REPLACE FUNCTION public.inspect_icd_snapshot_validation(p_revision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE v_plan jsonb; v_settings jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.icd_hierarchy_revisions WHERE revision=p_revision) THEN
    RAISE EXCEPTION 'ICD snapshot inspection requires an existing revision' USING ERRCODE='22023';
  END IF;
  EXECUTE $plan$EXPLAIN(FORMAT JSON,SETTINGS)
  WITH snapshot AS MATERIALIZED (
    SELECT code,level_name,chapter_code,block_code,parent_code,title_en,is_published
    FROM public.icd_hierarchy_nodes WHERE revision=$1
  )
  SELECT pg_catalog.jsonb_build_object(
    'total',count(*),
    'chapter',count(*) FILTER (WHERE n.level_name='chapter'),
    'block',count(*) FILTER (WHERE n.level_name='block'),
    'category',count(*) FILTER (WHERE n.level_name='category'),
    'subcategory',count(*) FILTER (WHERE n.level_name='subcategory')
  ), count(*) FILTER (WHERE
    NOT n.is_published
    OR pg_catalog.btrim(n.code)=''
    OR pg_catalog.btrim(n.title_en)=''
    OR CASE n.level_name
      WHEN 'chapter' THEN
        coalesce(pg_catalog.btrim(n.parent_code),'')<>''
        OR n.chapter_code IS DISTINCT FROM n.code
      WHEN 'block' THEN
        p.code IS NULL OR p.level_name<>'chapter'
        OR n.chapter_code IS DISTINCT FROM p.code
        OR n.block_code IS DISTINCT FROM n.code
      WHEN 'category' THEN
        p.code IS NULL OR p.level_name<>'block'
        OR n.chapter_code IS DISTINCT FROM p.chapter_code
        OR n.block_code IS DISTINCT FROM p.code
      WHEN 'subcategory' THEN
        p.code IS NULL OR p.level_name<>'category'
        OR n.chapter_code IS DISTINCT FROM p.chapter_code
        OR n.block_code IS DISTINCT FROM p.block_code
      ELSE true
    END
  )::integer
  FROM snapshot n LEFT JOIN snapshot p ON p.code=n.parent_code;
$plan$ INTO v_plan USING p_revision;
  SELECT jsonb_object_agg(name,setting) INTO v_settings FROM pg_catalog.pg_settings
  WHERE name IN ('enable_hashjoin','enable_mergejoin','enable_nestloop','enable_seqscan','enable_indexscan','enable_bitmapscan','plan_cache_mode','work_mem','statement_timeout','lock_timeout','row_security','jit','max_parallel_workers_per_gather','random_page_cost');
  RETURN jsonb_build_object('currentRole',current_user,'sessionRole',session_user,
    'bypassRls',(SELECT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user),
    'settings',v_settings,'plan',v_plan);
END;
$fn$;
REVOKE ALL ON FUNCTION public.inspect_icd_snapshot_validation(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inspect_icd_snapshot_validation(text) TO service_role;
NOTIFY pgrst,'reload schema';
