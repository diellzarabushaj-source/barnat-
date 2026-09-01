-- Keep the ranked registry search aligned with the 50-row registry UI ceiling.
CREATE OR REPLACE FUNCTION public.medindex_search_drugs_v2(p_query text, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, registry_number integer, pdid text, trade_name text, active_substance text, atc_code text, drug_class text, use_text text, strength text, pharmaceutical_form text, packaging text, product_status text, retail_price numeric, editorial_status text, match_rank smallint, match_reason text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  q text := btrim(left(coalesce(p_query, ''), 160));
  q_norm text := regexp_replace(
    translate(lower(btrim(left(coalesce(p_query, ''), 160))), 'ëç', 'ec'),
    '[^a-z0-9]+', ' ', 'g'
  );
  lim integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  registry_candidate integer;
  tokens text[];
begin
  q_norm := btrim(regexp_replace(q_norm, '\s+', ' ', 'g'));

  if q ~ '^[0-9]{1,9}$' then
    begin
      registry_candidate := q::integer;
    exception when numeric_value_out_of_range then
      registry_candidate := null;
    end;

    return query
    select
      d.id, d.registry_number, d.pdid, d.trade_name, d.active_substance,
      d.atc_code, d.drug_class, d.use_text, d.strength,
      d.pharmaceutical_form, d.packaging, d.product_status,
      d.retail_price, d.editorial_status,
      0::smallint,
      case
        when d.registry_number = registry_candidate and d.pdid = q then 'registry_pdid_exact'
        when d.registry_number = registry_candidate then 'registry_exact'
        when d.pdid = q then 'pdid_exact'
        else 'numeric_exact'
      end::text
    from public.drugs d
    where d.is_published = true
      and d.editorial_status = 'published'
      and (
        (registry_candidate is not null and d.registry_number = registry_candidate)
        or d.pdid = q
      )
    order by d.trade_name nulls last, d.registry_number
    limit lim;

    if found then
      return;
    end if;
  end if;

  if length(q_norm) < 2 then
    return;
  end if;

  if length(q_norm) = 2 then
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
          when regexp_replace(translate(lower(coalesce(d.trade_name,'')), 'ëç', 'ec'), '[^a-z0-9]+', ' ', 'g') = q_norm then 10
          when regexp_replace(translate(lower(coalesce(d.atc_code,'')), 'ëç', 'ec'), '[^a-z0-9]+', ' ', 'g') = q_norm then 11
          when regexp_replace(translate(lower(coalesce(d.active_substance,'')), 'ëç', 'ec'), '[^a-z0-9]+', ' ', 'g') = q_norm then 12
          when regexp_replace(translate(lower(coalesce(d.trade_name,'')), 'ëç', 'ec'), '[^a-z0-9]+', ' ', 'g') like q_norm || '%' then 20
          when regexp_replace(translate(lower(coalesce(d.atc_code,'')), 'ëç', 'ec'), '[^a-z0-9]+', ' ', 'g') like q_norm || '%' then 21
          else 22
        end::smallint as match_rank,
        case
          when regexp_replace(translate(lower(coalesce(d.trade_name,'')), 'ëç', 'ec'), '[^a-z0-9]+', ' ', 'g') = q_norm then 'trade_exact'
          when regexp_replace(translate(lower(coalesce(d.atc_code,'')), 'ëç', 'ec'), '[^a-z0-9]+', ' ', 'g') = q_norm then 'atc_exact'
          when regexp_replace(translate(lower(coalesce(d.active_substance,'')), 'ëç', 'ec'), '[^a-z0-9]+', ' ', 'g') = q_norm then 'substance_exact'
          when regexp_replace(translate(lower(coalesce(d.trade_name,'')), 'ëç', 'ec'), '[^a-z0-9]+', ' ', 'g') like q_norm || '%' then 'trade_prefix'
          when regexp_replace(translate(lower(coalesce(d.atc_code,'')), 'ëç', 'ec'), '[^a-z0-9]+', ' ', 'g') like q_norm || '%' then 'atc_prefix'
          else 'substance_prefix'
        end::text as match_reason
      from public.drugs d
      where d.is_published = true
        and d.editorial_status = 'published'
        and (
          regexp_replace(translate(lower(coalesce(d.trade_name,'')), 'ëç', 'ec'), '[^a-z0-9]+', ' ', 'g') like q_norm || '%'
          or regexp_replace(translate(lower(coalesce(d.atc_code,'')), 'ëç', 'ec'), '[^a-z0-9]+', ' ', 'g') like q_norm || '%'
          or regexp_replace(translate(lower(coalesce(d.active_substance,'')), 'ëç', 'ec'), '[^a-z0-9]+', ' ', 'g') like q_norm || '%'
        )
    ) x
    order by x.match_rank, x.trade_name nulls last, x.registry_number
    limit lim;
    return;
  end if;

  tokens := regexp_split_to_array(q_norm, '\s+');

  return query
  with candidate as (
    select
      d.*,
      btrim(regexp_replace(
        translate(lower(
          coalesce(d.registry_search_text,'') || ' ' ||
          coalesce(d.global_search_text,'') || ' ' ||
          coalesce(d.pdid,'') || ' ' ||
          coalesce(d.protocol_no,'')
        ), 'ëç', 'ec'),
        '[^a-z0-9]+', ' ', 'g'
      )) as search_norm,
      btrim(regexp_replace(
        translate(lower(
          coalesce(d.trade_name,'') || ' ' ||
          coalesce(d.active_substance,'') || ' ' ||
          coalesce(d.strength,'') || ' ' ||
          coalesce(d.pharmaceutical_form,'')
        ), 'ëç', 'ec'),
        '[^a-z0-9]+', ' ', 'g'
      )) as identity_norm,
      btrim(regexp_replace(translate(lower(coalesce(d.trade_name,'')), 'ëç', 'ec'), '[^a-z0-9]+', ' ', 'g')) as trade_norm,
      btrim(regexp_replace(translate(lower(coalesce(d.active_substance,'')), 'ëç', 'ec'), '[^a-z0-9]+', ' ', 'g')) as substance_norm,
      btrim(regexp_replace(translate(lower(coalesce(d.atc_code,'')), 'ëç', 'ec'), '[^a-z0-9]+', ' ', 'g')) as atc_norm,
      btrim(regexp_replace(translate(lower(coalesce(d.pdid,'')), 'ëç', 'ec'), '[^a-z0-9]+', ' ', 'g')) as pdid_norm
    from public.drugs d
    where d.is_published = true
      and d.editorial_status = 'published'
  ),
  ranked as (
    select
      c.id, c.registry_number, c.pdid, c.trade_name, c.active_substance,
      c.atc_code, c.drug_class, c.use_text, c.strength,
      c.pharmaceutical_form, c.packaging, c.product_status,
      c.retail_price, c.editorial_status,
      case
        when c.trade_norm = q_norm then 10
        when c.pdid_norm = q_norm then 11
        when c.atc_norm = q_norm then 12
        when c.substance_norm = q_norm then 13
        when c.trade_norm like q_norm || '%' then 20
        when c.atc_norm like q_norm || '%' then 21
        when c.substance_norm like q_norm || '%' then 22
        when not exists (
          select 1
          from unnest(tokens) token_value
          where token_value <> ''
            and c.identity_norm not like '%' || token_value || '%'
        ) then 25
        when position(q_norm in c.search_norm) > 0 then 30
        else 40
      end::smallint as match_rank,
      case
        when c.trade_norm = q_norm then 'trade_exact'
        when c.pdid_norm = q_norm then 'pdid_exact'
        when c.atc_norm = q_norm then 'atc_exact'
        when c.substance_norm = q_norm then 'substance_exact'
        when c.trade_norm like q_norm || '%' then 'trade_prefix'
        when c.atc_norm like q_norm || '%' then 'atc_prefix'
        when c.substance_norm like q_norm || '%' then 'substance_prefix'
        when not exists (
          select 1
          from unnest(tokens) token_value
          where token_value <> ''
            and c.identity_norm not like '%' || token_value || '%'
        ) then 'identity_token_all'
        when position(q_norm in c.search_norm) > 0 then 'phrase_contains'
        else 'token_all'
      end::text as match_reason
    from candidate c
    where not exists (
      select 1
      from unnest(tokens) token_value
      where token_value <> ''
        and c.search_norm not like '%' || token_value || '%'
    )
  )
  select
    r.id, r.registry_number, r.pdid, r.trade_name, r.active_substance,
    r.atc_code, r.drug_class, r.use_text, r.strength,
    r.pharmaceutical_form, r.packaging, r.product_status,
    r.retail_price, r.editorial_status, r.match_rank, r.match_reason
  from ranked r
  order by r.match_rank, r.trade_name nulls last, r.registry_number
  limit lim;
end;
$function$;

revoke all on function public.medindex_search_drugs_v2(text, integer) from public;
grant execute on function public.medindex_search_drugs_v2(text, integer) to anon, authenticated, service_role;
