-- DRx Phase 8Q: published V3 search index hardening.
-- Keeps V2 served and V3 shadow-only; no clinical rows are created or published.

create index if not exists dose_products_v3_published_registry_idx
  on public.dose_products_v3(registry_number)
  where editorial_status='published';

create index if not exists dose_products_v3_published_pdid_idx
  on public.dose_products_v3(pdid)
  where editorial_status='published';

create index if not exists dose_products_v3_published_trade_trgm_idx
  on public.dose_products_v3 using gin (lower(trade_name) gin_trgm_ops)
  where editorial_status='published';

create index if not exists dose_products_v3_published_substance_trgm_idx
  on public.dose_products_v3 using gin (lower(active_substance) gin_trgm_ops)
  where editorial_status='published';

create index if not exists dose_products_v3_published_atc_idx
  on public.dose_products_v3(atc_code)
  where editorial_status='published';

create or replace function public.drx_dose_search_v3_shadow_v1(
  p_query text,
  p_limit integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_runtime
as $$
with input as (
  select
    lower(btrim(coalesce(p_query,''))) q,
    greatest(1,least(coalesce(p_limit,20),50)) lim
),
matches as (
  select
    r.product_key,
    r.drug_id,
    r.registry_number,
    r.pdid,
    r.trade_name,
    r.active_substance,
    r.atc_code,
    r.pharmaceutical_form,
    r.route,
    r.patient_group,
    r.rule_count,
    case
      when lower(r.product_key)=i.q then 1
      when lower(coalesce(r.registry_number,''))=i.q then 2
      when lower(coalesce(r.pdid,''))=i.q then 3
      when lower(r.trade_name)=i.q then 4
      when lower(r.active_substance)=i.q then 5
      when lower(r.product_key) like i.q || '%' then 6
      when lower(r.trade_name) like i.q || '%' then 6
      when lower(r.active_substance) like i.q || '%' then 6
      else 10
    end rank
  from drx_runtime.published_product_read_model_v1 r
  cross join input i
  where length(i.q)>=2
    and (
      lower(r.product_key) like '%' || i.q || '%'
      or lower(coalesce(r.registry_number,'')) like '%' || i.q || '%'
      or lower(coalesce(r.pdid,'')) like '%' || i.q || '%'
      or lower(r.trade_name) like '%' || i.q || '%'
      or lower(r.active_substance) like '%' || i.q || '%'
      or lower(coalesce(r.atc_code,'')) like '%' || i.q || '%'
      or lower(coalesce(r.pharmaceutical_form,'')) like '%' || i.q || '%'
      or lower(coalesce(r.route,'')) like '%' || i.q || '%'
    )
  order by rank,r.trade_name,r.product_key
  limit (select lim from input)
)
select coalesce(jsonb_agg(jsonb_build_object(
  'productKey',product_key,
  'drugId',drug_id,
  'registryNumber',registry_number,
  'pdid',pdid,
  'tradeName',trade_name,
  'activeSubstance',active_substance,
  'atcCode',atc_code,
  'pharmaceuticalForm',pharmaceutical_form,
  'route',route,
  'patientGroup',patient_group,
  'ruleCount',rule_count
) order by rank,trade_name,product_key),'[]'::jsonb)
from matches;
$$;

revoke all on function public.drx_dose_search_v3_shadow_v1(text,integer)
  from public,anon,authenticated;
grant execute on function public.drx_dose_search_v3_shadow_v1(text,integer)
  to service_role;
