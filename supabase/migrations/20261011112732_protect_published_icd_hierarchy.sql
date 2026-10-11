SET LOCAL lock_timeout='3s';
LOCK TABLE public.icd_hierarchy_revisions IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.icd_hierarchy_nodes IN SHARE MODE;

CREATE OR REPLACE FUNCTION public.validate_icd_hierarchy_snapshot(p_revision text,v_declared_counts jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET lock_timeout = '3s' AS $fn$
DECLARE v_counts jsonb; v_invalid integer;
BEGIN
  LOCK TABLE public.icd_hierarchy_nodes IN SHARE MODE;
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

  RETURN v_counts;
END;
$fn$;
REVOKE ALL ON FUNCTION public.validate_icd_hierarchy_snapshot(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_icd_hierarchy_snapshot(text,jsonb) TO service_role;

DO $guard$
BEGIN
  IF EXISTS(SELECT 1 FROM public.icd_hierarchy_revisions
    WHERE (status IN ('active','superseded')) IS DISTINCT FROM (activated_at IS NOT NULL))
    OR (SELECT count(*) FROM public.icd_hierarchy_revisions WHERE status='active') <> 1 THEN
    RAISE EXCEPTION 'ICD publication state requires review before immutability activation' USING ERRCODE='23514';
  END IF;
  PERFORM public.validate_icd_hierarchy_snapshot(revision,counts)
    FROM public.icd_hierarchy_revisions WHERE status='active';
END;
$guard$;

-- Published ICD snapshots are immutable, including after supersession.
-- Trusted maintenance can still prepare staging revisions and atomically
-- switch to a complete validated snapshot. No clinical content is rewritten.
CREATE OR REPLACE FUNCTION public.guard_icd_published_nodes()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE v_revision text; v_published boolean;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'ICD snapshot truncation is forbidden' USING ERRCODE = '42501';
  END IF;
  -- Protect both sides of a revision move; lock in a deterministic order.
  FOR v_revision IN
    SELECT DISTINCT value FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.revision END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.revision END
    ]) value WHERE value IS NOT NULL ORDER BY value
  LOOP
    SELECT r.activated_at IS NOT NULL INTO v_published
    FROM public.icd_hierarchy_revisions r WHERE r.revision=v_revision FOR SHARE;
    IF v_published THEN
      RAISE EXCEPTION 'Published ICD nodes are immutable' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.guard_icd_published_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
BEGIN
  IF TG_OP='TRUNCATE' THEN
    RAISE EXCEPTION 'ICD snapshot truncation is forbidden' USING ERRCODE = '42501';
  END IF;
  IF TG_OP='DELETE' THEN
    IF OLD.activated_at IS NOT NULL THEN
      RAISE EXCEPTION 'Published ICD revision is immutable' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.activated_at IS NOT NULL OR NEW.status NOT IN ('staging','failed') THEN
      RAISE EXCEPTION 'New ICD revisions must be staged first' USING ERRCODE = '42501';
    END IF;
  ELSIF OLD.activated_at IS NOT NULL THEN
    IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status')
      OR NEW.status NOT IN ('active','superseded') THEN
      RAISE EXCEPTION 'Published ICD revision metadata is immutable' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.status='active' THEN
    IF OLD.status <> 'staging' OR NEW.activated_at IS NULL OR NEW.error_summary IS NOT NULL THEN
      RAISE EXCEPTION 'Only a staging ICD revision can be published' USING ERRCODE = '22023';
    END IF;
  ELSIF NEW.activated_at IS NOT NULL OR NEW.status NOT IN ('staging','failed') THEN
    RAISE EXCEPTION 'Unpublished ICD revision cannot acquire a publication marker' USING ERRCODE = '42501';
  END IF;
  IF NEW.status='active' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    -- Direct maintenance publication is subject to the same full validation
    -- as the normal activation RPC, while source nodes remain locked.
    PERFORM public.validate_icd_hierarchy_snapshot(NEW.revision,NEW.counts);
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.guard_icd_active_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
BEGIN
  IF EXISTS(SELECT 1 FROM public.icd_hierarchy_revisions WHERE activated_at IS NOT NULL)
    AND (SELECT count(*) FROM public.icd_hierarchy_revisions WHERE status='active') <> 1 THEN
    RAISE EXCEPTION 'Exactly one published ICD snapshot must remain active' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER icd_nodes_immutable BEFORE INSERT OR UPDATE OR DELETE
ON public.icd_hierarchy_nodes FOR EACH ROW EXECUTE FUNCTION public.guard_icd_published_nodes();
CREATE TRIGGER icd_nodes_no_truncate BEFORE TRUNCATE
ON public.icd_hierarchy_nodes FOR EACH STATEMENT EXECUTE FUNCTION public.guard_icd_published_nodes();
CREATE TRIGGER icd_revision_immutable BEFORE INSERT OR UPDATE OR DELETE
ON public.icd_hierarchy_revisions FOR EACH ROW EXECUTE FUNCTION public.guard_icd_published_revision();
CREATE TRIGGER icd_revision_no_truncate BEFORE TRUNCATE
ON public.icd_hierarchy_revisions FOR EACH STATEMENT EXECUTE FUNCTION public.guard_icd_published_revision();
CREATE CONSTRAINT TRIGGER icd_one_active_at_commit AFTER INSERT OR UPDATE OR DELETE
ON public.icd_hierarchy_revisions DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.guard_icd_active_snapshot();

REVOKE TRUNCATE ON public.icd_hierarchy_nodes,public.icd_hierarchy_revisions
FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_icd_published_nodes(),public.guard_icd_published_revision(),
public.guard_icd_active_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_icd_published_nodes(),public.guard_icd_published_revision(),
public.guard_icd_active_snapshot() TO service_role;

CREATE OR REPLACE FUNCTION public.activate_icd_hierarchy_revision(p_revision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET lock_timeout = '3s' AS $fn$
DECLARE v_status text; v_counts jsonb;
BEGIN
  IF p_revision IS NULL OR pg_catalog.btrim(p_revision)='' THEN
    RAISE EXCEPTION 'ICD hierarchy revision is required' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(7470670931834101::bigint);
  LOCK TABLE public.icd_hierarchy_revisions IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.icd_hierarchy_nodes IN SHARE MODE;
  SELECT status,counts INTO v_status,v_counts FROM public.icd_hierarchy_revisions
    WHERE revision=p_revision FOR UPDATE;
  IF NOT FOUND OR v_status NOT IN ('staging','superseded','active') THEN
    RAISE EXCEPTION 'ICD hierarchy revision cannot be activated' USING ERRCODE='22023';
  END IF;
  IF v_status='active' THEN
    PERFORM public.validate_icd_hierarchy_snapshot(p_revision,v_counts);
  ELSE
    UPDATE public.icd_hierarchy_revisions SET status='superseded'
      WHERE status='active' AND revision<>p_revision;
    -- The revision trigger validates every new publication before visibility.
    UPDATE public.icd_hierarchy_revisions SET status='active',
      error_summary=CASE WHEN activated_at IS NULL THEN NULL ELSE error_summary END,
      activated_at=coalesce(activated_at,pg_catalog.now()) WHERE revision=p_revision;
  END IF;
  RETURN v_counts || pg_catalog.jsonb_build_object('revision',p_revision,'orphans',0);
END;
$fn$;
REVOKE ALL ON FUNCTION public.activate_icd_hierarchy_revision(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_icd_hierarchy_revision(text) TO service_role;
COMMENT ON FUNCTION public.activate_icd_hierarchy_revision(text) IS
  'Service-only atomic activation of a complete immutable ICD snapshot, including safe reuse of a superseded revision.';
NOTIFY pgrst,'reload schema';
