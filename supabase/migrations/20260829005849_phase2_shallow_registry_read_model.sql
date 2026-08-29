-- Synced from Supabase production migration history.
-- version: 20260829005849
-- name: phase2_shallow_registry_read_model

create or replace view public.medindex_atc_counts_v1
with (security_invoker = true) as
select
  coalesce(
    case
      when upper(btrim(coalesce(atc_code,''))) ~ '^[A-Z][0-9]{2}'
        then left(upper(btrim(atc_code)),3)
      else null
    end,
    'UNCLASSIFIED'
  ) as category_code,
  count(*)::integer as product_count
from public.drugs
where is_published = true
  and editorial_status = 'published'
group by 1;

comment on view public.medindex_atc_counts_v1 is
  'Shallow runtime projection for ATC category counts. Reads published drugs directly and avoids paging the full registry.';

grant select on public.medindex_atc_counts_v1
to anon, authenticated, service_role;

revoke select on
  public.medindex_all_drug_search_v2,
  public.medindex_all_drugs_public_v2,
  public.medindex_all_product_search_v3,
  public.medindex_all_product_search_v4,
  public.medindex_all_products_public_v3,
  public.medindex_all_products_public_v4,
  public.medindex_product_categories_v1,
  public.medindex_product_categories_v2,
  public.medindex_catalog_categories,
  public.medindex_catalog_public,
  public.medindex_catalog_search
from anon, authenticated;

grant select on
  public.medindex_all_drug_search_v2,
  public.medindex_all_drugs_public_v2,
  public.medindex_all_product_search_v3,
  public.medindex_all_product_search_v4,
  public.medindex_all_products_public_v3,
  public.medindex_all_products_public_v4,
  public.medindex_product_categories_v1,
  public.medindex_product_categories_v2,
  public.medindex_catalog_categories,
  public.medindex_catalog_public,
  public.medindex_catalog_search
to service_role;
