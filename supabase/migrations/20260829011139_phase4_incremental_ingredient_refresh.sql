-- Synced from Supabase production migration history.
-- version: 20260829011139
-- name: phase4_incremental_ingredient_refresh

create or replace function public.medindex_refresh_product_ingredients_for_drugs_v1(
  p_drug_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
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

  insert into public.substance_concepts_v1
  (concept_id, canonical_key, canonical_name, concept_kind, source_method)
  select
    public.medindex_stable_uuid_v1('substance', q.canonical_key),
    q.canonical_key,
    max(q.canonical_name),
    'INGREDIENT',
    'CANONICAL_GRAPH'
  from (
    select s.canonical_key, s.canonical_name
    from public.medindex_p1_safe_single_v1 s
    where s.source_drug_id = any(target_ids)
    union all
    select p.canonical_key, p.canonical_name
    from public.medindex_p1_resolved_delimiter_parts_v2 p
    join public.medindex_p1_safe_delimiter_v2 s
      on s.source_drug_id = p.source_drug_id
    where p.source_drug_id = any(target_ids)
  ) q
  where q.canonical_key is not null
  group by q.canonical_key
  on conflict (canonical_key) do update
  set canonical_name = excluded.canonical_name,
      updated_at = now();

  delete from public.product_ingredients_v1 i
  where i.source_drug_id = any(target_ids);

  insert into public.product_ingredients_v1
  (source_drug_id, ingredient_ordinal, concept_id, source_term, component_key,
   resolution_method, confidence, source_occurrence_count, source_terms)
  select
    s.source_drug_id, 1, c.concept_id, s.source_expression, s.component_key,
    'SINGLE_CANONICAL', s.confidence, 1, array[s.source_expression]
  from public.medindex_p1_safe_single_v1 s
  join public.substance_concepts_v1 c
    on c.canonical_key = s.canonical_key
  where s.source_drug_id = any(target_ids);

  insert into public.product_ingredients_v1
  (source_drug_id, ingredient_ordinal, concept_id, source_term, component_key,
   resolution_method, confidence, source_occurrence_count, source_terms)
  select
    p.source_drug_id, p.ingredient_ordinal, c.concept_id, p.source_term, p.component_key,
    case when p.source_occurrence_count > 1 then 'DELIMITER_DEDUP' else 'DELIMITER_EXACT' end,
    p.confidence, p.source_occurrence_count, p.source_terms
  from public.medindex_p1_resolved_delimiter_parts_v2 p
  join public.medindex_p1_safe_delimiter_v2 s
    on s.source_drug_id = p.source_drug_id
  join public.substance_concepts_v1 c
    on c.canonical_key = p.canonical_key
  where p.source_drug_id = any(target_ids);

  insert into public.product_ingredients_v1
  (source_drug_id, ingredient_ordinal, concept_id, source_term, component_key,
   resolution_method, confidence, source_occurrence_count, source_terms)
  select
    p.source_drug_id, p.ingredient_ordinal, p.concept_id, p.source_term, p.term_key,
    'AND_EXACT', p.confidence, 1, array[p.source_term]
  from public.medindex_p1_and_parts_v1 p
  join public.medindex_p1_safe_and_v1 s
    on s.source_drug_id = p.source_drug_id
  where p.source_drug_id = any(target_ids);

  delete from public.product_ingredient_resolution_v1 r
  where r.source_drug_id = any(target_ids);

  insert into public.product_ingredient_resolution_v1
  (source_drug_id, resolution_status, expected_component_count, resolved_component_count,
   reason_codes, source_expression, reviewed_at, source_component_count, duplicate_component_count)
  select
    d.id,
    case
      when e.source_drug_id is not null then 'EXCLUDED'
      when sd.source_drug_id is not null and sd.identity_count = 1 then 'RESOLVED_SINGLE'
      when sd.source_drug_id is not null and sd.identity_count >= 2 then 'RESOLVED_MULTI'
      when sa.source_drug_id is not null then 'RESOLVED_MULTI'
      when ss.source_drug_id is not null then 'RESOLVED_SINGLE'
      else 'NEEDS_REVIEW'
    end,
    case
      when e.source_drug_id is not null then 0
      when sd.source_drug_id is not null then sd.identity_count
      when sa.source_drug_id is not null then sa.part_count
      when ss.source_drug_id is not null then 1
      when d.active_substance ~ '(;|\+|&)' then
        (select count(*)::integer from public.medindex_p1_combo_parts_v1 cp where cp.source_drug_id = d.id)
      when d.active_substance !~ '(;|\+|&)' and d.active_substance ~* '\sand\s' then
        (select count(*)::integer from public.medindex_p1_and_parts_v1 ap where ap.source_drug_id = d.id)
      else null
    end,
    case
      when sd.source_drug_id is not null then sd.identity_count
      when sa.source_drug_id is not null then sa.part_count
      when ss.source_drug_id is not null then 1
      else 0
    end,
    case
      when e.source_drug_id is not null then array[e.exception_code]
      when sd.source_drug_id is not null and sd.duplicate_component_count > 0 then
        array['DUPLICATE_SOURCE_COMPONENT_COLLAPSED']
      else array_remove(array[
        case when coalesce(btrim(d.active_substance), '') = '' then 'MISSING_ACTIVE_SUBSTANCE' end,
        case when d.active_substance ~* '(equivalent to|corresponding to|\yas\y)' then
          case when sd.source_drug_id is not null or sa.source_drug_id is not null or ss.source_drug_id is not null
               then 'EQUIVALENCE_REVIEWED' else 'EQUIVALENCE_EXPRESSION' end
        end,
        case when sd.source_drug_id is null and sa.source_drug_id is null and ss.source_drug_id is null
                   and d.active_substance !~ '(;|\+|&)' and d.active_substance ~* '\sand\s'
          then 'WORD_AND_CONNECTOR' end,
        case when sd.source_drug_id is null and sa.source_drug_id is null and ss.source_drug_id is null
                   and d.active_substance !~ '(;|\+|&)' and d.active_substance ~ '/'
          then 'SLASH_CONNECTOR' end,
        case when sd.source_drug_id is null and sa.source_drug_id is null and ss.source_drug_id is null
                   and d.active_substance ~ '(;|\+|&)'
                   and exists (
                     select 1 from public.medindex_p1_combo_parts_v1 cp
                     where cp.source_drug_id = d.id and cp.canonical_key is null
                   )
          then 'UNRESOLVED_COMPONENT' end,
        case when m.source_drug_id is not null
                   and not exists (
                     select 1 from public.substance_canonical sc
                     where sc.variant_key = d.active_substance_key
                   )
          then 'NO_CANONICAL_ROOT' end,
        case when m.source_drug_id is null and e.source_drug_id is null then 'NO_CORE_MAP' end
      ], null)
    end,
    d.active_substance,
    case when sd.source_drug_id is not null or sa.source_drug_id is not null or ss.source_drug_id is not null
         then now() else null end,
    case
      when sd.source_drug_id is not null then sd.source_component_count
      when sa.source_drug_id is not null then sa.part_count
      when ss.source_drug_id is not null then 1
      when d.active_substance ~ '(;|\+|&)' then
        (select count(*)::integer from public.medindex_p1_combo_parts_v1 cp where cp.source_drug_id = d.id)
      else null
    end,
    coalesce(sd.duplicate_component_count, 0)
  from public.drugs d
  left join public.medindex_drug_core_map_v1 m on m.source_drug_id = d.id
  left join public.medindex_drug_pipeline_exceptions_v1 e on e.source_drug_id = d.id
  left join public.medindex_p1_safe_delimiter_v2 sd on sd.source_drug_id = d.id
  left join public.medindex_p1_safe_and_v1 sa on sa.source_drug_id = d.id
  left join public.medindex_p1_safe_single_v1 ss on ss.source_drug_id = d.id
  where d.id = any(target_ids);

  select count(*)::integer into bad_resolved
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
      or (r.resolution_status = 'RESOLVED_MULTI' and (
        r.expected_component_count <> r.resolved_component_count
        or coalesce(i.n, 0) <> r.resolved_component_count
        or r.resolved_component_count < 2
      ))
    );

  if bad_resolved <> 0 then
    raise exception 'Incremental P1 refresh has % invalid resolved products', bad_resolved;
  end if;

  select count(*)::integer into bad_unresolved
  from public.product_ingredient_resolution_v1 r
  join public.product_ingredients_v1 i using (source_drug_id)
  where r.source_drug_id = any(target_ids)
    and r.resolution_status in ('NEEDS_REVIEW', 'EXCLUDED');

  if bad_unresolved <> 0 then
    raise exception 'Incremental P1 refresh assigned ingredients to % unresolved/excluded products', bad_unresolved;
  end if;

  select count(*)::integer into bad_source_counts
  from public.product_ingredient_resolution_v1 r
  join (
    select source_drug_id,
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
    raise exception 'Incremental P1 refresh has % invalid source occurrence counts', bad_source_counts;
  end if;

  select
    count(*) filter (where resolution_status = 'RESOLVED_SINGLE')::integer,
    count(*) filter (where resolution_status = 'RESOLVED_MULTI')::integer,
    count(*) filter (where resolution_status = 'NEEDS_REVIEW')::integer,
    count(*) filter (where resolution_status = 'EXCLUDED')::integer
  into resolved_single, resolved_multi, needs_review, excluded
  from public.product_ingredient_resolution_v1
  where source_drug_id = any(target_ids);

  select count(*)::integer into ingredient_rows
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

create or replace function private.medindex_refresh_edited_drug_ingredients_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform public.medindex_refresh_product_ingredients_for_drugs_v1(array[new.id]::uuid[]);
  return new;
end
$$;

revoke all on function private.medindex_refresh_edited_drug_ingredients_v1()
from public, anon, authenticated;

drop trigger if exists drugs_refresh_ingredients_after_editorial_substance_change
on public.drugs;

create trigger drugs_refresh_ingredients_after_editorial_substance_change
after update of active_substance on public.drugs
for each row
when (
  new.editorial_override = true
  and old.active_substance is distinct from new.active_substance
)
execute function private.medindex_refresh_edited_drug_ingredients_v1();

comment on function public.medindex_refresh_product_ingredients_for_drugs_v1(uuid[]) is
  'Incremental P1 ingredient refresh for at most 250 existing drug IDs. Reuses the canonical P1 views and validates only affected products. Service-role maintenance only.';

comment on trigger drugs_refresh_ingredients_after_editorial_substance_change on public.drugs is
  'Keeps derived ingredient rows transactionally current when Clinical Editor changes active_substance; bulk/import rows are not routed through this editorial-only trigger.';
