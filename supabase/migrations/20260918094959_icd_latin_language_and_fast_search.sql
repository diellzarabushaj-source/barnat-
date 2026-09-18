alter table public.icd_codes
  add column if not exists title_la text;

comment on column public.icd_codes.title_la is
  'Medical Latin diagnosis title. Keep NULL unless sourced/verified; do not substitute English.';

alter table public.icd_hierarchy_nodes
  add column if not exists title_la text;

comment on column public.icd_hierarchy_nodes.title_la is
  'Medical Latin diagnosis title. Keep NULL unless sourced/verified; do not substitute English.';

create index if not exists icd_codes_title_la_trgm_idx
  on public.icd_codes using gin (title_la gin_trgm_ops)
  where title_la is not null;

create index if not exists icd_hierarchy_nodes_title_la_trgm_idx
  on public.icd_hierarchy_nodes using gin (title_la gin_trgm_ops)
  where title_la is not null;

create index if not exists icd_hierarchy_nodes_search_v2_idx
  on public.icd_hierarchy_nodes
  using gin (
    to_tsvector(
      'simple',
      coalesce(code,'') || ' ' ||
      coalesce(title_sq,'') || ' ' ||
      coalesce(title_en,'') || ' ' ||
      coalesce(title_la,'') || ' ' ||
      coalesce(path_text,'') || ' ' ||
      coalesce(search_text,'')
    )
  );

create or replace view public.icd_hierarchy_active as
select
  n.revision,
  n.code,
  n.level_name,
  n.chapter_code,
  n.block_code,
  n.parent_code,
  n.title_en,
  n.title_sq,
  n.display_title,
  n.translation_status,
  n.path_text,
  n.source_url,
  n.source_row,
  n.search_text,
  n.source_hash,
  n.is_published,
  n.created_at,
  n.updated_at,
  n.title_la
from public.icd_hierarchy_nodes n
join public.icd_hierarchy_revisions r on r.revision = n.revision
where r.status = 'active'
  and n.is_published = true;
