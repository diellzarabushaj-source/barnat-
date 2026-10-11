-- Executes with a trusted maintenance connection. All test writes roll back;
-- no private tables, source titles or user records are returned.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL ROLE service_role;
DO $test$
DECLARE
  r record; v_code text; v_probe text := 'guard_probe_'||gen_random_uuid()::text;
  v_denied boolean; v_cases integer:=0; v_published integer;
  v_nodes_hash text; v_revisions_hash text; v_activation jsonb;
BEGIN
  SELECT md5(string_agg(md5(to_jsonb(n)::text),'' ORDER BY revision,code)) INTO v_nodes_hash FROM public.icd_hierarchy_nodes n;
  SELECT md5(string_agg(md5(to_jsonb(n)::text),'' ORDER BY revision)) INTO v_revisions_hash FROM public.icd_hierarchy_revisions n;
  SELECT count(*) INTO v_published FROM public.icd_hierarchy_revisions WHERE activated_at IS NOT NULL;
  IF v_published=0 THEN RAISE EXCEPTION 'Published snapshot fixture is required'; END IF;
  INSERT INTO public.icd_hierarchy_revisions(revision,spreadsheet_id,sheet_name,sheet_gid,source_hash,source_bytes,counts,status)
  VALUES(v_probe,'synthetic','synthetic',1,'synthetic',1,'{"total":12542,"chapter":22,"block":274,"category":2050,"subcategory":10196}','staging');
  INSERT INTO public.icd_hierarchy_nodes(revision,code,level_name,chapter_code,title_en,display_title,translation_status,source_row,search_text,source_hash)
  VALUES(v_probe,'synthetic','chapter','synthetic','Synthetic','Synthetic','missing',0,'synthetic','synthetic');

  FOR r IN SELECT revision FROM public.icd_hierarchy_revisions WHERE activated_at IS NOT NULL ORDER BY revision LOOP
    SELECT code INTO STRICT v_code FROM public.icd_hierarchy_nodes WHERE revision=r.revision ORDER BY code LIMIT 1;
    v_denied:=false;
    BEGIN UPDATE public.icd_hierarchy_nodes SET title_en=title_en WHERE revision=r.revision AND code=v_code;
    EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    IF NOT v_denied THEN RAISE EXCEPTION 'Published node update was accepted'; END IF; v_cases:=v_cases+1;
    v_denied:=false;
    BEGIN DELETE FROM public.icd_hierarchy_nodes WHERE revision=r.revision AND code=v_code;
    EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    IF NOT v_denied THEN RAISE EXCEPTION 'Published node deletion was accepted'; END IF; v_cases:=v_cases+1;
    v_denied:=false;
    BEGIN INSERT INTO public.icd_hierarchy_nodes(revision,code,level_name,chapter_code,title_en,display_title,translation_status,source_row,search_text,source_hash)
      VALUES(r.revision,v_probe,'chapter',v_probe,'Synthetic','Synthetic','missing',0,'synthetic','synthetic');
    EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    IF NOT v_denied THEN RAISE EXCEPTION 'Published node insertion was accepted'; END IF; v_cases:=v_cases+1;
    v_denied:=false;
    BEGIN UPDATE public.icd_hierarchy_nodes SET revision=v_probe WHERE revision=r.revision AND code=v_code;
    EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    IF NOT v_denied THEN RAISE EXCEPTION 'Published node move was accepted'; END IF; v_cases:=v_cases+1;
    v_denied:=false;
    BEGIN UPDATE public.icd_hierarchy_revisions SET source_hash=source_hash||'_probe' WHERE revision=r.revision;
    EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    IF NOT v_denied THEN RAISE EXCEPTION 'Published metadata update was accepted'; END IF; v_cases:=v_cases+1;
    v_denied:=false;
    BEGIN UPDATE public.icd_hierarchy_revisions SET activated_at=NULL,status='staging' WHERE revision=r.revision;
    EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    IF NOT v_denied THEN RAISE EXCEPTION 'Publication marker reset was accepted'; END IF; v_cases:=v_cases+1;
    v_denied:=false;
    BEGIN DELETE FROM public.icd_hierarchy_revisions WHERE revision=r.revision;
    EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    IF NOT v_denied THEN RAISE EXCEPTION 'Published revision cascade deletion was accepted'; END IF; v_cases:=v_cases+1;
  END LOOP;
  v_denied:=false;
  BEGIN TRUNCATE public.icd_hierarchy_nodes CASCADE;
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Node TRUNCATE was accepted'; END IF; v_cases:=v_cases+1;
  v_denied:=false;
  BEGIN TRUNCATE public.icd_hierarchy_revisions CASCADE;
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Revision TRUNCATE was accepted'; END IF; v_cases:=v_cases+1;
  v_denied:=false;
  BEGIN
    UPDATE public.icd_hierarchy_revisions SET status='superseded' WHERE status='active';
    SET CONSTRAINTS public.icd_one_active_at_commit IMMEDIATE;
  EXCEPTION WHEN check_violation THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Empty active snapshot was accepted'; END IF; v_cases:=v_cases+1;
  v_denied:=false;
  BEGIN
    UPDATE public.icd_hierarchy_revisions SET status='superseded' WHERE status='active';
    UPDATE public.icd_hierarchy_revisions SET status='active',activated_at=now() WHERE revision=v_probe;
  EXCEPTION WHEN invalid_parameter_value THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Incomplete direct publication was accepted'; END IF; v_cases:=v_cases+1;

  UPDATE public.icd_hierarchy_nodes SET title_en='Synthetic staging edit' WHERE revision=v_probe;
  DELETE FROM public.icd_hierarchy_revisions WHERE revision=v_probe;
  IF EXISTS(SELECT 1 FROM public.icd_hierarchy_nodes WHERE revision=v_probe) THEN
    RAISE EXCEPTION 'Staging cleanup did not cascade'; END IF; v_cases:=v_cases+1;
  SELECT public.activate_icd_hierarchy_revision(revision) INTO STRICT v_activation
  FROM public.icd_hierarchy_revisions WHERE status='active';
  IF (v_activation->>'total')::integer<>12542 THEN RAISE EXCEPTION 'Idempotent activation failed'; END IF; v_cases:=v_cases+1;
  IF v_cases<>v_published*7+6 OR (SELECT count(*) FROM public.icd_hierarchy_revisions WHERE status='active')<>1
    OR v_nodes_hash IS DISTINCT FROM (SELECT md5(string_agg(md5(to_jsonb(n)::text),'' ORDER BY revision,code)) FROM public.icd_hierarchy_nodes n)
    OR v_revisions_hash IS DISTINCT FROM (SELECT md5(string_agg(md5(to_jsonb(n)::text),'' ORDER BY revision)) FROM public.icd_hierarchy_revisions n) THEN
    RAISE EXCEPTION 'ICD guard execution or unchanged-source parity failed';
  END IF;
END;
$test$;
ROLLBACK;
SELECT jsonb_build_object('status','PASS','serverVersion',current_setting('server_version'),
  'publishedSnapshots',(SELECT count(*) FROM public.icd_hierarchy_revisions WHERE activated_at IS NOT NULL),
  'verifiedCases',(SELECT count(*)*7+6 FROM public.icd_hierarchy_revisions WHERE activated_at IS NOT NULL),
  'nodesCount',(SELECT count(*) FROM public.icd_hierarchy_nodes),
  'nodesHash',(SELECT md5(string_agg(md5(to_jsonb(n)::text),'' ORDER BY revision,code)) FROM public.icd_hierarchy_nodes n),
  'revisionsHash',(SELECT md5(string_agg(md5(to_jsonb(n)::text),'' ORDER BY revision)) FROM public.icd_hierarchy_revisions n),
  'activeCount',(SELECT count(*) FROM public.icd_hierarchy_revisions WHERE status='active')) AS proof;
