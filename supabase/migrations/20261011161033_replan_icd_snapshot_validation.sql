-- Replan the bounded snapshot query for each publication instead of caching a generic plan.
-- Keep publication counts, required titles, ownership and locks unchanged.
CREATE OR REPLACE FUNCTION public.validate_icd_hierarchy_snapshot(p_revision text,v_declared_counts jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET lock_timeout = '3s' AS $fn$
DECLARE v_counts jsonb; v_invalid integer;
BEGIN
  LOCK TABLE public.icd_hierarchy_nodes IN SHARE MODE;
  EXECUTE $validation$
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
  $validation$ INTO v_counts,v_invalid USING p_revision;

  IF v_counts IS DISTINCT FROM '{"total":12542,"chapter":22,"block":274,"category":2050,"subcategory":10196}'::jsonb
    OR v_declared_counts IS DISTINCT FROM v_counts THEN
    RAISE EXCEPTION 'ICD hierarchy counts invalid' USING ERRCODE='22023';
  END IF;
  IF v_invalid<>0 THEN
    RAISE EXCEPTION 'ICD hierarchy has invalid publication or parent links' USING ERRCODE='22023';
  END IF;
  RETURN v_counts;
END;
$fn$;
REVOKE ALL ON FUNCTION public.validate_icd_hierarchy_snapshot(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_icd_hierarchy_snapshot(text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
