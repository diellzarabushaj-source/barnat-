-- Search v4: exact/prefix/token search first, typo-tolerant trigram fallback last.
-- Keeps the existing RPC name for API compatibility while hardening ranking semantics.

create index if not exists drugs_trade_name_trgm_idx
  on public.drugs using gin (lower(trade_name) extensions.gin_trgm_ops)
  where is_published = true and editorial_status = 'published';

create index if not exists drugs_active_substance_trgm_idx
  on public.drugs using gin (lower(active_substance) extensions.gin_trgm_ops)
  where is_published = true and editorial_status = 'published';

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
  q_lower text := lower(btrim(left(coalesce(p_query, ''), 160)));
  q_norm text := btrim(regexp_replace(
    translate(lower(btrim(left(coalesce(p_query, ''), 160))), 'ëç', 'ec'),
    '[^a-z0-9]+', ' ', 'g'
  ));
  lim integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  registry_candidate integer;
  tokens text[];
  explicit_value text;
begin
  q_norm := btrim(regexp_replace(q_norm, '\s+', ' ', 'g'));

  -- Explicit identifiers remove ambiguity between registry number and PDID.
  if q_lower ~ '^(nr|reg|registry)[[:space:]]*:?[[:space:]]*[0-9]{1,9}$' then
    explicit_value := regexp_replace(q_lower, '[^0-9]', '', 'g');
    begin registry_candidate := explicit_value::integer;
    exception when numeric_value_out_of_range then registry_candidate := null;
    end;
    return query
    select d.id,d.registry_number,d.pdid,d.trade_name,d.active_substance,d.atc_code,d.drug_class,d.use_text,
           d.strength,d.pharmaceutical_form,d.packaging,d.product_status,d.retail_price,d.editorial_status,
           0::smallint,'registry_exact'::text
    from public.drugs d
    where d.is_published=true and d.editorial_status='published'
      and registry_candidate is not null and d.registry_number=registry_candidate
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
    where d.is_published=true and d.editorial_status='published' and d.pdid=explicit_value
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
    where d.is_published=true and d.editorial_status='published'
      and upper(coalesce(d.atc_code,'')) like explicit_value || '%'
    order by 15,d.trade_name nulls last,d.registry_number
    limit lim;
    return;
  end if;

  -- Plain numeric input: registry exact first, then PDID exact, both clearly labelled.
  if q ~ '^[0-9]{1,9}$' then
    begin registry_candidate := q::integer;
    exception when numeric_value_out_of_range then registry_candidate := null;
    end;

    return query
    select
      d.id,d.registry_number,d.pdid,d.trade_name,d.active_substance,d.atc_code,d.drug_class,d.use_text,
      d.strength,d.pharmaceutical_form,d.packaging,d.product_status,d.retail_price,d.editorial_status,
      case
        when d.registry_number=registry_candidate and d.pdid=q then 0
        when d.registry_number=registry_candidate then 0
        when d.pdid=q then 1
        else 2
      end::smallint,
      case
        when d.registry_number=registry_candidate and d.pdid=q then 'registry_pdid_exact'
        when d.registry_number=registry_candidate then 'registry_exact'
        when d.pdid=q then 'pdid_exact'
        else 'numeric_exact'
      end::text
    from public.drugs d
    where d.is_published=true
      and d.editorial_status='published'
      and ((registry_candidate is not null and d.registry_number=registry_candidate) or d.pdid=q)
    order by 15,d.trade_name nulls last,d.registry_number
    limit lim;

    if found then return; end if;
  end if;

  if length(q_norm) < 2 then return; end if;

  -- Two characters: bounded prefix search only, never a broad contains scan.
  if length(q_norm)=2 then
    return query
    select x.id,x.registry_number,x.pdid,x.trade_name,x.active_substance,x.atc_code,x.drug_class,x.use_text,
           x.strength,x.pharmaceutical_form,x.packaging,x.product_status,x.retail_price,x.editorial_status,
           x.match_rank,x.match_reason
    from (
      select d.*,
        case
          when btrim(regexp_replace(translate(lower(coalesce(d.trade_name,'')),'ëç','ec'),'[^a-z0-9]+',' ','g'))=q_norm then 10
          when btrim(regexp_replace(translate(lower(coalesce(d.atc_code,'')),'ëç','ec'),'[^a-z0-9]+',' ','g'))=q_norm then 11
          when btrim(regexp_replace(translate(lower(coalesce(d.active_substance,'')),'ëç','ec'),'[^a-z0-9]+',' ','g'))=q_norm then 12
          when btrim(regexp_replace(translate(lower(coalesce(d.trade_name,'')),'ëç','ec'),'[^a-z0-9]+',' ','g')) like q_norm||'%' then 20
          when btrim(regexp_replace(translate(lower(coalesce(d.atc_code,'')),'ëç','ec'),'[^a-z0-9]+',' ','g')) like q_norm||'%' then 21
          else 22
        end::smallint as match_rank,
        case
          when btrim(regexp_replace(translate(lower(coalesce(d.trade_name,'')),'ëç','ec'),'[^a-z0-9]+',' ','g'))=q_norm then 'trade_exact'
          when btrim(regexp_replace(translate(lower(coalesce(d.atc_code,'')),'ëç','ec'),'[^a-z0-9]+',' ','g'))=q_norm then 'atc_exact'
          when btrim(regexp_replace(translate(lower(coalesce(d.active_substance,'')),'ëç','ec'),'[^a-z0-9]+',' ','g'))=q_norm then 'substance_exact'
          when btrim(regexp_replace(translate(lower(coalesce(d.trade_name,'')),'ëç','ec'),'[^a-z0-9]+',' ','g')) like q_norm||'%' then 'trade_prefix'
          when btrim(regexp_replace(translate(lower(coalesce(d.atc_code,'')),'ëç','ec'),'[^a-z0-9]+',' ','g')) like q_norm||'%' then 'atc_prefix'
          else 'substance_prefix'
        end::text as match_reason
      from public.drugs d
      where d.is_published=true and d.editorial_status='published'
        and (
          btrim(regexp_replace(translate(lower(coalesce(d.trade_name,'')),'ëç','ec'),'[^a-z0-9]+',' ','g')) like q_norm||'%'
          or btrim(regexp_replace(translate(lower(coalesce(d.atc_code,'')),'ëç','ec'),'[^a-z0-9]+',' ','g')) like q_norm||'%'
          or btrim(regexp_replace(translate(lower(coalesce(d.active_substance,'')),'ëç','ec'),'[^a-z0-9]+',' ','g')) like q_norm||'%'
        )
    ) x
    order by x.match_rank,x.trade_name nulls last,x.registry_number
    limit lim;
    return;
  end if;

  tokens := regexp_split_to_array(q_norm,'\s+');

  -- First pass: exact, prefix and all-token matching across all searchable columns.
  return query
  with candidate as (
    select d.*,
      btrim(regexp_replace(translate(lower(
        coalesce(d.registry_search_text,'')||' '||coalesce(d.global_search_text,'')||' '||
        coalesce(d.pdid,'')||' '||coalesce(d.protocol_no,'')
      ),'ëç','ec'),'[^a-z0-9]+',' ','g')) as search_norm,
      btrim(regexp_replace(translate(lower(
        coalesce(d.trade_name,'')||' '||coalesce(d.active_substance,'')||' '||
        coalesce(d.strength,'')||' '||coalesce(d.pharmaceutical_form,'')||' '||coalesce(d.packaging,'')
      ),'ëç','ec'),'[^a-z0-9]+',' ','g')) as identity_norm,
      btrim(regexp_replace(translate(lower(coalesce(d.trade_name,'')),'ëç','ec'),'[^a-z0-9]+',' ','g')) as trade_norm,
      btrim(regexp_replace(translate(lower(coalesce(d.active_substance,'')),'ëç','ec'),'[^a-z0-9]+',' ','g')) as substance_norm,
      btrim(regexp_replace(translate(lower(coalesce(d.atc_code,'')),'ëç','ec'),'[^a-z0-9]+',' ','g')) as atc_norm,
      btrim(regexp_replace(translate(lower(coalesce(d.pdid,'')),'ëç','ec'),'[^a-z0-9]+',' ','g')) as pdid_norm
    from public.drugs d
    where d.is_published=true and d.editorial_status='published'
  ), ranked as (
    select c.id,c.registry_number,c.pdid,c.trade_name,c.active_substance,c.atc_code,c.drug_class,c.use_text,
           c.strength,c.pharmaceutical_form,c.packaging,c.product_status,c.retail_price,c.editorial_status,
      case
        when c.trade_norm=q_norm then 10
        when c.pdid_norm=q_norm then 11
        when c.atc_norm=q_norm then 12
        when c.substance_norm=q_norm then 13
        when c.trade_norm like q_norm||'%' then 20
        when c.atc_norm like q_norm||'%' then 21
        when c.substance_norm like q_norm||'%' then 22
        when not exists (
          select 1 from unnest(tokens) t
          where t<>'' and c.identity_norm not like '%'||t||'%'
        ) then 25
        when position(q_norm in c.search_norm)>0 then 30
        else 40
      end::smallint as match_rank,
      case
        when c.trade_norm=q_norm then 'trade_exact'
        when c.pdid_norm=q_norm then 'pdid_exact'
        when c.atc_norm=q_norm then 'atc_exact'
        when c.substance_norm=q_norm then 'substance_exact'
        when c.trade_norm like q_norm||'%' then 'trade_prefix'
        when c.atc_norm like q_norm||'%' then 'atc_prefix'
        when c.substance_norm like q_norm||'%' then 'substance_prefix'
        when not exists (
          select 1 from unnest(tokens) t
          where t<>'' and c.identity_norm not like '%'||t||'%'
        ) then 'identity_token_all'
        when position(q_norm in c.search_norm)>0 then 'phrase_contains'
        else 'token_all'
      end::text as match_reason
    from candidate c
    where not exists (
      select 1 from unnest(tokens) t
      where t<>'' and c.search_norm not like '%'||t||'%'
    )
  )
  select r.* from ranked r
  order by r.match_rank,r.trade_name nulls last,r.registry_number
  limit lim;

  if found then return; end if;

  -- Last resort: typo-tolerant trade/substance matching. Never outranks deterministic matches.
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

revoke all on function public.medindex_search_drugs_v2(text,integer) from public;
grant execute on function public.medindex_search_drugs_v2(text,integer) to anon,authenticated,service_role;
