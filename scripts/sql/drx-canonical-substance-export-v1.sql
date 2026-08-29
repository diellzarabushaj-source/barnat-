-- DRx Dosierung canonical substance export v1
-- Source of truth confirmed from migration 20260827130837.
-- Read-only. Deterministic. Publication-neutral.

select
  concept_id,
  canonical_key,
  canonical_name
from public.substance_concepts_v1
where canonical_key is not null
  and btrim(canonical_key) <> ''
  and canonical_name is not null
  and btrim(canonical_name) <> ''
order by canonical_key asc, concept_id asc;
