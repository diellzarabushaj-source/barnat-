-- Synced from Supabase production migration history.
-- version: 20260829011529
-- name: phase4_targeted_incremental_resolver

create or replace function private.medindex_resolve_substance_key_v1(value text)
returns text
language sql
stable
strict
set search_path = pg_catalog, public, private
as $$
  with recursive resolve(canonical_key, depth, path) as (
    select value, 0, array[value]::text[]
    union all
    select a.canonical_key, r.depth + 1, r.path || a.canonical_key
    from resolve r
    join public.substance_aliases a
      on a.variant_key = r.canonical_key
    where r.depth < 32
      and not a.canonical_key = any(r.path)
  )
  select canonical_key
  from resolve
  order by depth desc
  limit 1
$$;

revoke all on function private.medindex_resolve_substance_key_v1(text)
from public, anon, authenticated;

create or replace function public.medindex_refresh_product_ingredients_for_drugs_v1(
  p_drug_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  target_ids uuid[];
  requested_count integer;
  existing_count integer;
  resolved_single integer;
  resolved_multi integer;
  needs_review integer;
  excluded integer;
  ingredient_rows integer;
  bad_resolved integer;
  bad_unresolved integer;
  bad_source_counts integer;
begin
  select coalesce(array_agg(id order by id), '{}'::uuid[])
  into target_ids
  from (
    select distinct id
    from unnest(coalesce(p_drug_ids, '{}'::uuid[])) as u(id)
    where id is not null
  ) q;

  requested_count := cardinality(target_ids);

  if requested_count = 0 then
    return jsonb_build_object(
      'requested', 0,
      'resolved_single', 0,
      'resolved_multi', 0,
      'needs_review', 0,
      'excluded', 0,
      'ingredient_rows', 0
    );
  end if;

  if requested_count > 250 then
    raise exception 'Incremental ingredient refresh is limited to 250 drug IDs per call';
  end if;

  select count(*)::integer
  into existing_count
  from public.drugs d
  where d.id = any(target_ids);

  if existing_count <> requested_count then
    raise exception 'Incremental ingredient refresh received % IDs but found % drugs',
      requested_count, existing_count;
  end if;

  perform d.id
  from public.drugs d
  where d.id = any(target_ids)
  order by d.id
  for update;

  delete from public.product_ingredients_v1 i
  where i.source_drug_id = any(target_ids);

  insert into public.product_ingredients_v1
  (source_drug_id, ingredient_ordinal, concept_id, source_term, component_key,
   resolution_method, confidence, source_occurrence_count, source_terms)
  select
    d.id,
    1,
    c.concept_id,
    d.active_substance,
    d.active_substance_key,
    'SINGLE_CANONICAL',
    coalesce(a.confidence, 1.0000)::numeric(5,4),
    1,
    array[d.active_substance]
  from public.drugs d
  join public.medindex_drug_core_map_v1 m
    on m.source_drug_id = d.id
  cross join lateral (
    select private.medindex_resolve_substance_key_v1(d.active_substance_key) as canonical_key
  ) root
  join public.substance_concepts_v1 c
    on c.canonical_key = root.canonical_key
  left join public.substance_aliases a
    on a.variant_key = d.active_substance_key
  where d.id = any(target_ids)
    and coalesce(btrim(d.active_substance), '') <> ''
    and (
      (
        d.active_substance !~ '(;|\+|&)'
        and d.active_substance !~* '\sand\s'
        and d.active_substance !~ '/'
        and (
          d.active_substance !~* '(equivalent to|corresponding to|\yas\y)'
          or exists (
            select 1
            from public.substance_equivalence_cleared_v1 e
            where e.source_key = d.active_substance_key
          )
        )
      )
      or exists (
        select 1
        from public.substance_single_expression_override_v1 o
        where o.source_key = d.active_substance_key
      )
    );

  with raw_parts as (
    select
      d.id as source_drug_id,
      d.active_substance as source_expression,
      d.active_substance_key,
      part.ordinality::integer as source_ordinal,
      btrim(part.value) as source_term,
      public.medindex_normalize_substance_term_v1(part.value) as component_key
    from public.drugs d
    join public.medindex_drug_core_map_v1 m
      on m.source_drug_id = d.id
    cross join lateral regexp_split_to_table(
      d.active_substance,
      '\s*(?:;|\+|&)\s*'
    ) with ordinality as part(value, ordinality)
    where d.id = any(target_ids)
      and d.active_substance ~ '(;|\+|&)'
  ),
  resolved_parts as (
    select
      p.*,
      private.medindex_resolve_substance_key_v1(p.component_key) as canonical_key,
      c.concept_id,
      c.canonical_name,
      coalesce(a.confidence, 1.0000)::numeric(5,4) as confidence
    from raw_parts p
    left join public.substance_concepts_v1 c
      on c.canonical_key = private.medindex_resolve_substance_key_v1(p.component_key)
    left join public.substance_aliases a
      on a.variant_key = p.component_key
  ),
  eligible as (
    select p.source_drug_id
    from resolved_parts p
    join public.drugs d on d.id = p.source_drug_id
    group by p.source_drug_id, d.active_substance, d.active_substance_key
    having count(*) >= 2
       and count(p.concept_id) = count(*)
       and not exists (
         select 1
         from public.substance_single_expression_override_v1 o
         where o.source_key = d.active_substance_key
       )
       and (
         d.active_substance !~* '(equivalent to|corresponding to|\yas\y)'
         or exists (
           select 1
           from public.substance_equivalence_cleared_v1 e
           where e.source_key = d.active_substance_key
         )
       )
  ),
  grouped as (
    select
      p.source_drug_id,
      p.canonical_key,
      p.concept_id,
      max(p.canonical_name) as canonical_name,
      min(p.source_ordinal) as first_ordinal,
      (array_agg(p.source_term order by p.source_ordinal))[1] as source_term,
      (array_agg(p.component_key order by p.source_ordinal))[1] as component_key,
      min(p.confidence)::numeric(5,4) as confidence,
      count(*)::integer as source_occurrence_count,
      array_agg(p.source_term order by p.source_ordinal) as source_terms
    from resolved_parts p
    join eligible e on e.source_drug_id = p.source_drug_id
    group by p.source_drug_id, p.canonical_key, p.concept_id
  )
  insert into public.product_ingredients_v1
  (source_drug_id, ingredient_ordinal, concept_id, source_term, component_key,
   resolution_method, confidence, source_occurrence_count, source_terms)
  select
    g.source_drug_id,
    row_number() over (
      partition by g.source_drug_id
      order by g.first_ordinal, g.canonical_key
    )::integer,
    g.concept_id,
    g.source_term,
    g.component_key,
    case when g.source_occurrence_count > 1 then 'DELIMITER_DEDUP' else 'DELIMITER_EXACT' end,
    g.confidence,
    g.source_occurrence_count,
    g.source_terms
  from grouped g;

  with and_parts as (
    select
      d.id as source_drug_id,
      d.active_substance as source_expression,
      p.ordinality::integer as source_ordinal,
      btrim(p.value) as source_term,
      public.medindex_normalize_substance_term_v1(p.value) as term_key,
      t.concept_id,
      t.confidence
    from public.drugs d
    join public.medindex_drug_core_map_v1 m
      on m.source_drug_id = d.id
    cross join lateral regexp_split_to_table(
      d.active_substance,
      '(?i)\s+and\s+'
    ) with ordinality as p(value, ordinality)
    left join public.substance_terms_v1 t
      on t.term_key = public.medindex_normalize_substance_term_v1(p.value)
    where d.id = any(target_ids)
      and d.active_substance !~ '(;|\+|&)'
      and d.active_substance ~* '\sand\s'
  ),
  eligible as (
    select p.source_drug_id
    from and_parts p
    join public.drugs d on d.id = p.source_drug_id
    group by p.source_drug_id, d.active_substance
    having count(*) = 2
       and count(p.concept_id) = 2
       and count(distinct p.concept_id) = 2
       and d.active_substance !~* '(equivalent to|corresponding to|extract|mixture|virus|complex factors|factor viii|factor ix|factor x|potency)'
  )
  insert into public.product_ingredients_v1
  (source_drug_id, ingredient_ordinal, concept_id, source_term, component_key,
   resolution_method, confidence, source_occurrence_count, source_terms)
  select
    p.source_drug_id,
    row_number() over (
      partition by p.source_drug_id
      order by p.source_ordinal
    )::integer,
    p.concept_id,
    p.source_term,
    p.term_key,
    'AND_EXACT',
    p.confidence,
    1,
    array[p.source_term]
  from and_parts p
  join eligible e on e.source_drug_id = p.source_drug_id;

  delete from public.product_ingredient_resolution_v1 r
  where r.source_drug_id = any(target_ids);

  with ingredient_stats as (
    select
      i.source_drug_id,
      count(*)::integer as identity_count,
      sum(i.source_occurrence_count)::integer as source_component_count,
      greatest(sum(i.source_occurrence_count) - count(*), 0)::integer as duplicate_component_count,
      bool_or(i.resolution_method in ('DELIMITER_EXACT','DELIMITER_DEDUP')) as has_delimiter,
      bool_or(i.resolution_method = 'AND_EXACT') as has_and,
      bool_or(i.resolution_method = 'SINGLE_CANONICAL') as has_single
    from public.product_ingredients_v1 i
    where i.source_drug_id = any(target_ids)
    group by i.source_drug_id
  )
  insert into public.product_ingredient_resolution_v1
  (source_drug_id, resolution_status, expected_component_count, resolved_component_count,
   reason_codes, source_expression, reviewed_at, source_component_count, duplicate_component_count)
  select
    d.id,
    case
      when e.source_drug_id is not null then 'EXCLUDED'
      when s.has_delimiter and s.identity_count = 1 then 'RESOLVED_SINGLE'
      when s.has_delimiter and s.identity_count >= 2 then 'RESOLVED_MULTI'
      when s.has_and then 'RESOLVED_MULTI'
      when s.has_single then 'RESOLVED_SINGLE'
      else 'NEEDS_REVIEW'
    end,
    case
      when e.source_drug_id is not null then 0
      when s.has_delimiter then s.identity_count
      when s.has_and then s.identity_count
      when s.has_single then 1
      when d.active_substance ~ '(;|\+|&)' then
        (select count(*)::integer
         from regexp_split_to_table(d.active_substance, '\s*(?:;|\+|&)\s*') p)
      when d.active_substance !~ '(;|\+|&)'
           and d.active_substance ~* '\sand\s' then
        (select count(*)::integer
         from regexp_split_to_table(d.active_substance, '(?i)\s+and\s+') p)
      else null
    end,
    case
      when s.source_drug_id is not null then s.identity_count
      else 0
    end,
    case
      when e.source_drug_id is not null then array[e.exception_code]
      when s.has_delimiter and s.duplicate_component_count > 0 then
        array['DUPLICATE_SOURCE_COMPONENT_COLLAPSED']
      else array_remove(array[
        case when coalesce(btrim(d.active_substance), '') = ''
          then 'MISSING_ACTIVE_SUBSTANCE' end,
        case when d.active_substance ~* '(equivalent to|corresponding to|\yas\y)' then
          case when s.source_drug_id is not null
               then 'EQUIVALENCE_REVIEWED'
               else 'EQUIVALENCE_EXPRESSION'
          end
        end,
        case when s.source_drug_id is null
                   and d.active_substance !~ '(;|\+|&)'
                   and d.active_substance ~* '\sand\s'
          then 'WORD_AND_CONNECTOR' end,
        case when s.source_drug_id is null
                   and d.active_substance !~ '(;|\+|&)'
                   and d.active_substance ~ '/'
          then 'SLASH_CONNECTOR' end,
        case when s.source_drug_id is null
                   and d.active_substance ~ '(;|\+|&)'
          then 'UNRESOLVED_COMPONENT' end,
        case when m.source_drug_id is not null
                   and d.active_substance_key is null
          then 'NO_CANONICAL_ROOT' end,
        case when m.source_drug_id is null and e.source_drug_id is null
          then 'NO_CORE_MAP' end
      ], null)
    end,
    d.active_substance,
    case when s.source_drug_id is not null then now() else null end,
    case
      when s.has_delimiter then s.source_component_count
      when s.has_and then s.identity_count
      when s.has_single then 1
      when d.active_substance ~ '(;|\+|&)' then
        (select count(*)::integer
         from regexp_split_to_table(d.active_substance, '\s*(?:;|\+|&)\s*') p)
      else null
    end,
    case
      when s.has_delimiter then s.duplicate_component_count
      else 0
    end
  from public.drugs d
  left join public.medindex_drug_core_map_v1 m
    on m.source_drug_id = d.id
  left join public.medindex_drug_pipeline_exceptions_v1 e
    on e.source_drug_id = d.id
  left join ingredient_stats s
    on s.source_drug_id = d.id
  where d.id = any(target_ids);

  select count(*)::integer
  into bad_resolved
  from public.product_ingredient_resolution_v1 r
  left join (
    select source_drug_id, count(*)::integer n
    from public.product_ingredients_v1
    where source_drug_id = any(target_ids)
    group by source_drug_id
  ) i using (source_drug_id)
  where r.source_drug_id = any(target_ids)
    and (
      (r.resolution_status = 'RESOLVED_SINGLE' and coalesce(i.n, 0) <> 1)
      or
      (r.resolution_status = 'RESOLVED_MULTI' and (
        r.expected_component_count <> r.resolved_component_count
        or coalesce(i.n, 0) <> r.resolved_component_count
        or r.resolved_component_count < 2
      ))
    );

  if bad_resolved <> 0 then
    raise exception 'Incremental P1 refresh has % invalid resolved products', bad_resolved;
  end if;

  select count(*)::integer
  into bad_unresolved
  from public.product_ingredient_resolution_v1 r
  join public.product_ingredients_v1 i using (source_drug_id)
  where r.source_drug_id = any(target_ids)
    and r.resolution_status in ('NEEDS_REVIEW', 'EXCLUDED');

  if bad_unresolved <> 0 then
    raise exception 'Incremental P1 refresh assigned ingredients to % unresolved/excluded products',
      bad_unresolved;
  end if;

  select count(*)::integer
  into bad_source_counts
  from public.product_ingredient_resolution_v1 r
  join (
    select
      source_drug_id,
      sum(source_occurrence_count)::integer as source_n,
      count(*)::integer as identity_n
    from public.product_ingredients_v1
    where source_drug_id = any(target_ids)
    group by source_drug_id
  ) i using (source_drug_id)
  where r.source_drug_id = any(target_ids)
    and r.resolution_status in ('RESOLVED_SINGLE', 'RESOLVED_MULTI')
    and (
      r.resolved_component_count <> i.identity_n
      or (r.source_component_count is not null and r.source_component_count <> i.source_n)
      or r.duplicate_component_count <> greatest(i.source_n - i.identity_n, 0)
    );

  if bad_source_counts <> 0 then
    raise exception 'Incremental P1 refresh has % invalid source occurrence counts',
      bad_source_counts;
  end if;

  select
    count(*) filter (where resolution_status = 'RESOLVED_SINGLE')::integer,
    count(*) filter (where resolution_status = 'RESOLVED_MULTI')::integer,
    count(*) filter (where resolution_status = 'NEEDS_REVIEW')::integer,
    count(*) filter (where resolution_status = 'EXCLUDED')::integer
  into resolved_single, resolved_multi, needs_review, excluded
  from public.product_ingredient_resolution_v1
  where source_drug_id = any(target_ids);

  select count(*)::integer
  into ingredient_rows
  from public.product_ingredients_v1
  where source_drug_id = any(target_ids);

  return jsonb_build_object(
    'requested', requested_count,
    'resolved_single', resolved_single,
    'resolved_multi', resolved_multi,
    'needs_review', needs_review,
    'excluded', excluded,
    'ingredient_rows', ingredient_rows
  );
end
$$;

revoke all on function public.medindex_refresh_product_ingredients_for_drugs_v1(uuid[])
from public, anon, authenticated;

grant execute on function public.medindex_refresh_product_ingredients_for_drugs_v1(uuid[])
to service_role;

comment on function private.medindex_resolve_substance_key_v1(text) is
  'Targeted alias-chain resolver for incremental P1 maintenance. It resolves one normalized key without evaluating the global substance_canonical view.';

comment on function public.medindex_refresh_product_ingredients_for_drugs_v1(uuid[]) is
  'Targeted incremental P1 ingredient refresh for at most 250 existing drug IDs. Uses only the reviewed alias/concept graph; unknown concepts remain NEEDS_REVIEW. Full refresh remains available for batch maintenance.';
