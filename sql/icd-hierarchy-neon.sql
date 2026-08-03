-- MedIndex full ICD-10-WHO 2019 hierarchy mirror.
-- The editorial source remains the public Google Sheet. Neon stores immutable
-- revisions and exposes only the single revision that passed full validation.

CREATE TABLE IF NOT EXISTS public.icd_hierarchy_revisions (
  revision text PRIMARY KEY,
  spreadsheet_id text NOT NULL,
  sheet_name text NOT NULL,
  sheet_gid bigint NOT NULL,
  source_hash text NOT NULL,
  source_bytes bigint NOT NULL,
  header_row integer,
  counts jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('staging','active','superseded','failed')),
  error_summary text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS icd_hierarchy_one_active_revision
  ON public.icd_hierarchy_revisions ((status))
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.icd_hierarchy_nodes (
  revision text NOT NULL REFERENCES public.icd_hierarchy_revisions(revision) ON DELETE CASCADE,
  code text NOT NULL,
  level_name text NOT NULL CHECK (level_name IN ('chapter','block','category','subcategory')),
  chapter_code text NOT NULL,
  block_code text,
  parent_code text,
  title_en text NOT NULL,
  title_sq text,
  display_title text NOT NULL,
  translation_status text NOT NULL,
  path_text text,
  source_url text,
  source_row integer NOT NULL,
  search_text text NOT NULL,
  source_hash text NOT NULL,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (revision, code)
);

CREATE INDEX IF NOT EXISTS icd_hierarchy_nodes_parent_idx
  ON public.icd_hierarchy_nodes (revision, parent_code, source_row);
CREATE INDEX IF NOT EXISTS icd_hierarchy_nodes_level_idx
  ON public.icd_hierarchy_nodes (revision, level_name, source_row);
CREATE INDEX IF NOT EXISTS icd_hierarchy_nodes_chapter_idx
  ON public.icd_hierarchy_nodes (revision, chapter_code, source_row);
CREATE INDEX IF NOT EXISTS icd_hierarchy_nodes_block_idx
  ON public.icd_hierarchy_nodes (revision, block_code, source_row);
CREATE INDEX IF NOT EXISTS icd_hierarchy_nodes_code_idx
  ON public.icd_hierarchy_nodes (code);

CREATE OR REPLACE VIEW public.icd_hierarchy_active AS
SELECT n.*
FROM public.icd_hierarchy_nodes n
JOIN public.icd_hierarchy_revisions r ON r.revision = n.revision
WHERE r.status = 'active' AND n.is_published = true;

CREATE OR REPLACE FUNCTION public.activate_icd_hierarchy_revision(p_revision text)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_total integer;
  v_chapter integer;
  v_block integer;
  v_category integer;
  v_subcategory integer;
  v_orphans integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.icd_hierarchy_revisions
    WHERE revision = p_revision AND status = 'staging'
  ) THEN
    RAISE EXCEPTION 'ICD hierarchy revision % is not staging', p_revision;
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE level_name = 'chapter')::integer,
    count(*) FILTER (WHERE level_name = 'block')::integer,
    count(*) FILTER (WHERE level_name = 'category')::integer,
    count(*) FILTER (WHERE level_name = 'subcategory')::integer
  INTO v_total, v_chapter, v_block, v_category, v_subcategory
  FROM public.icd_hierarchy_nodes
  WHERE revision = p_revision AND is_published = true;

  IF v_total <> 12542 OR v_chapter <> 22 OR v_block <> 274 OR v_category <> 2050 OR v_subcategory <> 10196 THEN
    RAISE EXCEPTION 'ICD hierarchy counts invalid: total %, chapter %, block %, category %, subcategory %',
      v_total, v_chapter, v_block, v_category, v_subcategory;
  END IF;

  SELECT count(*)::integer
  INTO v_orphans
  FROM public.icd_hierarchy_nodes child
  LEFT JOIN public.icd_hierarchy_nodes parent
    ON parent.revision = child.revision
   AND parent.code = child.parent_code
  WHERE child.revision = p_revision
    AND child.parent_code IS NOT NULL
    AND child.parent_code <> ''
    AND parent.code IS NULL;

  IF v_orphans <> 0 THEN
    RAISE EXCEPTION 'ICD hierarchy contains % orphan nodes', v_orphans;
  END IF;

  UPDATE public.icd_hierarchy_revisions
  SET status = 'superseded'
  WHERE status = 'active' AND revision <> p_revision;

  UPDATE public.icd_hierarchy_revisions
  SET status = 'active', activated_at = now(), error_summary = NULL
  WHERE revision = p_revision;

  RETURN jsonb_build_object(
    'revision', p_revision,
    'total', v_total,
    'chapter', v_chapter,
    'block', v_block,
    'category', v_category,
    'subcategory', v_subcategory,
    'orphans', v_orphans
  );
END;
$function$;
