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
