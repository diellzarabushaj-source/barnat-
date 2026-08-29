-- Synced from Supabase production migration history.
-- version: 20260829011924
-- name: phase4_resolution_review_reason_guard

create or replace function private.medindex_ensure_resolution_review_reason_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  substance_key text;
  has_core_map boolean;
begin
  if new.resolution_status <> 'NEEDS_REVIEW'
     or cardinality(coalesce(new.reason_codes, '{}'::text[])) <> 0 then
    return new;
  end if;

  select
    d.active_substance_key,
    (m.source_drug_id is not null)
  into substance_key, has_core_map
  from public.drugs d
  left join public.medindex_drug_core_map_v1 m
    on m.source_drug_id = d.id
  where d.id = new.source_drug_id;

  if has_core_map
     and substance_key is not null
     and not exists (
       select 1
       from public.substance_concepts_v1 c
       where c.canonical_key = private.medindex_resolve_substance_key_v1(substance_key)
     ) then
    new.reason_codes := array['NO_CANONICAL_ROOT']::text[];
  end if;

  return new;
end
$$;

revoke all on function private.medindex_ensure_resolution_review_reason_v1()
from public, anon, authenticated;

drop trigger if exists product_ingredient_resolution_review_reason_guard
on public.product_ingredient_resolution_v1;

create trigger product_ingredient_resolution_review_reason_guard
before insert or update of resolution_status, reason_codes
on public.product_ingredient_resolution_v1
for each row
when (
  new.resolution_status = 'NEEDS_REVIEW'
  and cardinality(new.reason_codes) = 0
)
execute function private.medindex_ensure_resolution_review_reason_v1();

comment on trigger product_ingredient_resolution_review_reason_guard
on public.product_ingredient_resolution_v1 is
  'Prevents silent NEEDS_REVIEW rows: an unresolved mapped substance without a reviewed canonical concept receives NO_CANONICAL_ROOT.';
