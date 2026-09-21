-- DRx registry search v5: index-first hot path for phone/desktop search.
-- Applied to production on 2026-09-21. The RPC signature remains unchanged.

create or replace function public.medindex_search_drugs_v2(
  p_query text,
  p_limit integer default 20
)
returns table(
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
as $function$
declare
  q text := btrim(left(coalesce(p_query, ''), 160));
  q_safe text;
  q_lower text;
  q_fold text;
  lim integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  registry_candidate integer;
  explicit_value text;
  tokens text[];
  folded_tokens text[];
begin
  q_safe := btrim(regexp_replace(q, '[%_\\]+', ' ', 'g'));
  q_safe := btrim(regexp_replace(q_safe, '[[:space:]]+', ' ', 'g'));
  q_lower := lower(q_safe);
  q_fold := translate(q_lower, 'ëç', 'ec');

  if q_lower ~ '^(nr|reg|registry)[[:space:]]*:?[[:space:]]*[0-9]{1,9}$' then
    explicit_value := regexp_replace(q_lower, '[^0-9]', '', 'g');
    begin
      registry_candidate := explicit_value::integer;
    exception when numeric_value_out_of_range then
      registry_candidate := null;
    end;

    return query
    select d.id,d.registry_number,d.pdid,d.trade_name,d.active_substance,d.atc_code,d.drug_class,d.use_text,
           d.strength,d.pharmaceutical_form,d.packaging,d.product_status,d.retail_price,d.editorial_status,
           0::smallint,'registry_exact'::text
    from public.drugs d
    where d.is_published=true
      and d.editorial_status='published'
      and registry_candidate is not null
      and d.registry_number=registry_candidate
    order by d.trade_name nulls last,d.registry_number
    limit lim;
    return;
  end if;

  if q_lower ~ '^pdid[[:space:]]*:?[[:space:]]*[0-9]{1,20}$' then
    explicit_value := regexp_replace(q_lower, '[^0-9]', '', 'g');
    return query
    select d.id,d.registry_number,d.pdid,d.trade_name,d.active_substance,d.atc_code,d.drug_class,d.use_text,
           d.strength,d.pharmaceutical_form,d.packaging,d.product_status,d.retail_price,d.editorial_status,
           0::smallint,'pdid_exact'::text
    from public.drugs d
    where d.is_published=true
      and d.editorial_status='published'
      and d.pdid=explicit_value
    order by d.trade_name nulls last,d.registry_number
    limit lim;
    return;
  end if;

  if q_lower ~ '^atc[[:space:]]*:?[[:space:]]*[a-z0-9]{1,12}$' then
    explicit_value := upper(regexp_replace(q_lower, '^atc[[:space:]]*:?[[:space:]]*', '', 'g'));
    return query
    select d.id,d.registry_number,d.pdid,d.trade_name,d.active_substance,d.atc_code,d.drug_class,d.use_text,
           d.strength,d.pharmaceutical_form,d.packaging,d.product_status,d.retail_price,d.editorial_status,
           case when upper(coalesce(d.atc_code,''))=explicit_value then 0 else 10 end::smallint,
           case when upper(coalesce(d.atc_code,''))=explicit_value then 'atc_exact' else 'atc_prefix' end::text
    from public.drugs d
    where d.is_published=true
      and d.editorial_status='published'
      and upper(coalesce(d.atc_code,'')) like explicit_value || '%'
    order by 15,d.trade_name nulls last,d.registry_number
    limit lim;
    return;
  end if;

  if q_safe ~ '^[0-9]{1,9}$' then
    begin
      registry_candidate := q_safe::integer;
    exception when numeric_value_out_of_range then
      registry_candidate := null;
    end;

    return query
    select d.id,d.registry_number,d.pdid,d.trade_name,d.active_substance,d.atc_code,d.drug_class,d.use_text,
           d.strength,d.pharmaceutical_form,d.packaging,d.product_status,d.retail_price,d.editorial_status,
           case
             when d.registry_number=registry_candidate and d.pdid=q_safe then 0
             when d.registry_number=registry_candidate then 0
             when d.pdid=q_safe then 1
             else 2
           end::smallint,
           case
             when d.registry_number=registry_candidate and d.pdid=q_safe then 'registry_pdid_exact'
             when d.registry_number=registry_candidate then 'registry_exact'
             when d.pdid=q_safe then 'pdid_exact'
             else 'numeric_exact'
           end::text
    from public.drugs d
    where d.is_published=true
      and d.editorial_status='published'
      and ((registry_candidate is not null and d.registry_number=registry_candidate) or d.pdid=q_safe)
    order by 15,d.trade_name nulls last,d.registry_number
    limit lim;

    if found then return; end if;
  end if;

  if length(q_fold) < 2 then return; end if;

  if length(q_fold)=2 then
    return query
    select d.id,d.registry_number,d.pdid,d.trade_name,d.active_substance,d.atc_code,d.drug_class,d.use_text,
           d.strength,d.pharmaceutical_form,d.packaging,d.product_status,d.retail_price,d.editorial_status,
           case
             when translate(lower(coalesce(d.trade_name,'')),'ëç','ec')=q_fold then 10
             when translate(lower(coalesce(d.atc_code,'')),'ëç','ec')=q_fold then 11
             when translate(lower(coalesce(d.active_substance,'')),'ëç','ec')=q_fold then 12
             when translate(lower(coalesce(d.trade_name,'')),'ëç','ec') like q_fold||'%' then 20
             when translate(lower(coalesce(d.atc_code,'')),'ëç','ec') like q_fold||'%' then 21
             else 22
           end::smallint,
           case
             when translate(lower(coalesce(d.trade_name,'')),'ëç','ec')=q_fold then 'trade_exact'
             when translate(lower(coalesce(d.atc_code,'')),'ëç','ec')=q_fold then 'atc_exact'
             when translate(lower(coalesce(d.active_substance,'')),'ëç','ec')=q_fold then 'substance_exact'
             when translate(lower(coalesce(d.trade_name,'')),'ëç','ec') like q_fold||'%' then 'trade_prefix'
             when translate(lower(coalesce(d.atc_code,'')),'ëç','ec') like q_fold||'%' then 'atc_prefix'
             else 'substance_prefix'
           end::text
    from public.drugs d
    where d.is_published=true
      and d.editorial_status='published'
      and (
        translate(lower(coalesce(d.trade_name,'')),'ëç','ec') like q_fold||'%'
        or translate(lower(coalesce(d.atc_code,'')),'ëç','ec') like q_fold||'%'
        or translate(lower(coalesce(d.active_substance,'')),'ëç','ec') like q_fold||'%'
      )
    order by 15,d.trade_name nulls last,d.registry_number
    limit lim;
    return;
  end if;

  -- Common path: let the existing partial pg_trgm GIN index on
  -- registry_search_text produce a small candidate set first.
  return query
  select d.id,d.registry_number,d.pdid,d.trade_name,d.active_substance,d.atc_code,d.drug_class,d.use_text,
         d.strength,d.pharmaceutical_form,d.packaging,d.product_status,d.retail_price,d.editorial_status,
         case
           when lower(coalesce(d.trade_name,''))=q_lower then 10
           when lower(coalesce(d.pdid,''))=q_lower then 11
           when lower(coalesce(d.atc_code,''))=q_lower then 12
           when lower(coalesce(d.active_substance,''))=q_lower then 13
           when lower(coalesce(d.trade_name,'')) like q_lower||'%' then 20
           when lower(coalesce(d.atc_code,'')) like q_lower||'%' then 21
           when lower(coalesce(d.active_substance,'')) like q_lower||'%' then 22
           else 30
         end::smallint,
         case
           when lower(coalesce(d.trade_name,''))=q_lower then 'trade_exact'
           when lower(coalesce(d.pdid,''))=q_lower then 'pdid_exact'
           when lower(coalesce(d.atc_code,''))=q_lower then 'atc_exact'
           when lower(coalesce(d.active_substance,''))=q_lower then 'substance_exact'
           when lower(coalesce(d.trade_name,'')) like q_lower||'%' then 'trade_prefix'
           when lower(coalesce(d.atc_code,'')) like q_lower||'%' then 'atc_prefix'
           when lower(coalesce(d.active_substance,'')) like q_lower||'%' then 'substance_prefix'
           else 'phrase_contains'
         end::text
  from public.drugs d
  where d.is_published=true
    and d.editorial_status='published'
    and d.registry_search_text ilike '%'||q_safe||'%'
  order by 15,d.trade_name nulls last,d.registry_number
  limit lim;

  if found then return; end if;

  tokens := regexp_split_to_array(q_lower, '[[:space:]]+');
  return query
  select d.id,d.registry_number,d.pdid,d.trade_name,d.active_substance,d.atc_code,d.drug_class,d.use_text,
         d.strength,d.pharmaceutical_form,d.packaging,d.product_status,d.retail_price,d.editorial_status,
         35::smallint,'token_all'::text
  from public.drugs d
  where d.is_published=true
    and d.editorial_status='published'
    and not exists (
      select 1 from unnest(tokens) t
      where t<>'' and lower(coalesce(d.registry_search_text,'')) not like '%'||t||'%'
    )
  order by d.trade_name nulls last,d.registry_number
  limit lim;

  if found then return; end if;

  folded_tokens := regexp_split_to_array(q_fold, '[[:space:]]+');
  return query
  select d.id,d.registry_number,d.pdid,d.trade_name,d.active_substance,d.atc_code,d.drug_class,d.use_text,
         d.strength,d.pharmaceutical_form,d.packaging,d.product_status,d.retail_price,d.editorial_status,
         45::smallint,'accent_folded'::text
  from public.drugs d
  where d.is_published=true
    and d.editorial_status='published'
    and not exists (
      select 1 from unnest(folded_tokens) t
      where t<>'' and translate(lower(coalesce(d.registry_search_text,'')),'ëç','ec') not like '%'||t||'%'
    )
  order by d.trade_name nulls last,d.registry_number
  limit lim;

  if found then return; end if;

  return query
  with fuzzy as (
    select d.*,
           extensions.similarity(lower(coalesce(d.trade_name,'')),q_lower) as trade_similarity,
           extensions.similarity(lower(coalesce(d.active_substance,'')),q_lower) as substance_similarity
    from public.drugs d
    where d.is_published=true
      and d.editorial_status='published'
      and (
        extensions.similarity(lower(coalesce(d.trade_name,'')),q_lower)>=0.34
        or extensions.similarity(lower(coalesce(d.active_substance,'')),q_lower)>=0.34
      )
  )
  select f.id,f.registry_number,f.pdid,f.trade_name,f.active_substance,f.atc_code,f.drug_class,f.use_text,
         f.strength,f.pharmaceutical_form,f.packaging,f.product_status,f.retail_price,f.editorial_status,
         case when f.trade_similarity>=f.substance_similarity then 60 else 61 end::smallint,
         case when f.trade_similarity>=f.substance_similarity then 'trade_fuzzy' else 'substance_fuzzy' end::text
  from fuzzy f
  order by greatest(f.trade_similarity,f.substance_similarity) desc,
           f.trade_name nulls last,f.registry_number
  limit least(lim,20);
end;
$function$;

revoke all on function public.medindex_search_drugs_v2(text, integer) from public;
grant execute on function public.medindex_search_drugs_v2(text, integer) to anon, authenticated, service_role;
