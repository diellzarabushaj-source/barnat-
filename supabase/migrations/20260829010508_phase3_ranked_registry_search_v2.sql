-- Synced from Supabase production migration history.
-- version: 20260829010508
-- name: phase3_ranked_registry_search_v2

create or replace function public.medindex_search_drugs_v2(
  p_query text,
  p_limit integer default 20
)
returns table (
  id uuid,
  registry_number integer,
  pdid text,
  trade_name text,
  active_substance text,
  atc_code text,
  drug_class text,
  use_text text,
  strength text,
  pharmaceutical_form text,
  packaging text,
  product_status text,
  retail_price numeric,
  editorial_status text,
  match_rank smallint,
  match_reason text
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  q text := btrim(left(coalesce(p_query, ''), 160));
  lim integer := least(greatest(coalesce(p_limit, 20), 1), 20);
  registry_candidate integer;
begin
  if q ~ '^[0-9]{1,9}$' then
    begin
      registry_candidate := q::integer;
    exception when numeric_value_out_of_range then
      registry_candidate := null;
    end;

    if registry_candidate is not null then
      return query
      select
        d.id, d.registry_number, d.pdid, d.trade_name, d.active_substance,
        d.atc_code, d.drug_class, d.use_text, d.strength,
        d.pharmaceutical_form, d.packaging, d.product_status,
        d.retail_price, d.editorial_status,
        0::smallint, 'registry_exact'::text
      from public.drugs d
      where d.is_published = true
        and d.editorial_status = 'published'
        and d.registry_number = registry_candidate
      limit 1;

      if found then
        return;
      end if;
    end if;
  end if;

  if length(q) < 2 then
    return;
  end if;

  if length(q) = 2 then
    return query
    select
      x.id, x.registry_number, x.pdid, x.trade_name, x.active_substance,
      x.atc_code, x.drug_class, x.use_text, x.strength,
      x.pharmaceutical_form, x.packaging, x.product_status,
      x.retail_price, x.editorial_status, x.match_rank, x.match_reason
    from (
      select
        d.id, d.registry_number, d.pdid, d.trade_name, d.active_substance,
        d.atc_code, d.drug_class, d.use_text, d.strength,
        d.pharmaceutical_form, d.packaging, d.product_status,
        d.retail_price, d.editorial_status,
        case
          when lower(d.trade_name) = lower(q) then 10
          when lower(d.atc_code) = lower(q) then 11
          when lower(d.active_substance) = lower(q) then 12
          when d.trade_name ilike q || '%' then 20
          when d.atc_code ilike q || '%' then 21
          else 22
        end::smallint as match_rank,
        case
          when lower(d.trade_name) = lower(q) then 'trade_exact'
          when lower(d.atc_code) = lower(q) then 'atc_exact'
          when lower(d.active_substance) = lower(q) then 'substance_exact'
          when d.trade_name ilike q || '%' then 'trade_prefix'
          when d.atc_code ilike q || '%' then 'atc_prefix'
          else 'substance_prefix'
        end::text as match_reason
      from public.drugs d
      where d.is_published = true
        and d.editorial_status = 'published'
        and (
          d.trade_name ilike q || '%'
          or d.atc_code ilike q || '%'
          or d.active_substance ilike q || '%'
        )
    ) x
    order by x.match_rank, x.trade_name nulls last, x.registry_number
    limit lim;
    return;
  end if;

  return query
  select
    x.id, x.registry_number, x.pdid, x.trade_name, x.active_substance,
    x.atc_code, x.drug_class, x.use_text, x.strength,
    x.pharmaceutical_form, x.packaging, x.product_status,
    x.retail_price, x.editorial_status, x.match_rank, x.match_reason
  from (
    select
      d.id, d.registry_number, d.pdid, d.trade_name, d.active_substance,
      d.atc_code, d.drug_class, d.use_text, d.strength,
      d.pharmaceutical_form, d.packaging, d.product_status,
      d.retail_price, d.editorial_status,
      case
        when lower(d.trade_name) = lower(q) then 10
        when lower(d.atc_code) = lower(q) then 11
        when lower(d.active_substance) = lower(q) then 12
        when d.trade_name ilike q || '%' then 20
        when d.atc_code ilike q || '%' then 21
        when d.active_substance ilike q || '%' then 22
        else 30
      end::smallint as match_rank,
      case
        when lower(d.trade_name) = lower(q) then 'trade_exact'
        when lower(d.atc_code) = lower(q) then 'atc_exact'
        when lower(d.active_substance) = lower(q) then 'substance_exact'
        when d.trade_name ilike q || '%' then 'trade_prefix'
        when d.atc_code ilike q || '%' then 'atc_prefix'
        when d.active_substance ilike q || '%' then 'substance_prefix'
        else 'global_fuzzy'
      end::text as match_reason
    from public.drugs d
    where d.is_published = true
      and d.editorial_status = 'published'
      and d.global_search_text ilike '%' || q || '%'
  ) x
  order by x.match_rank, x.trade_name nulls last, x.registry_number
  limit lim;
end;
$$;

revoke all on function public.medindex_search_drugs_v2(text, integer) from public;
grant execute on function public.medindex_search_drugs_v2(text, integer)
to anon, authenticated, service_role;

comment on function public.medindex_search_drugs_v2(text, integer) is
  'Phase 3 ranked registry search: exact registry first, then exact/prefix identity matches, then bounded trigram-backed global fallback. SECURITY INVOKER preserves drugs RLS.';
