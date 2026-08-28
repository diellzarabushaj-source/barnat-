-- P1.24: close the two runtime gaps found after the P1 exit migration ran.
--
-- 1. A reviewed single-expression override is already resolved, so delimiter
--    diagnostics from the rejected parsing path must not survive as blocker
--    reason codes on that resolved row.
-- 2. Trigger functions do not need to be callable through PostgREST RPC. The
--    conflict guard is SECURITY DEFINER, therefore public EXECUTE is revoked.

create or replace function public.medindex_refresh_product_ingredients_v1()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  total_drugs bigint;
  resolved_single bigint;
  resolved_multi bigint;
  needs_review bigint;
  excluded bigint;
  ingredient_rows bigint;
  bad_resolved bigint;
  bad_unresolved bigint;
  bad_source_counts bigint;
begin
  insert into public.substance_concepts_v1
  (concept_id,canonical_key,canonical_name,concept_kind,source_method)
  select public.medindex_stable_uuid_v1('substance',q.canonical_key),
         q.canonical_key,max(q.canonical_name),'INGREDIENT','CANONICAL_GRAPH'
  from (
    select canonical_key,canonical_name
    from public.medindex_p1_safe_single_v1
    union all
    select p.canonical_key,p.canonical_name
    from public.medindex_p1_resolved_delimiter_parts_v2 p
    join public.medindex_p1_safe_delimiter_v2 s
      on s.source_drug_id=p.source_drug_id
  ) q
  where q.canonical_key is not null
  group by q.canonical_key
  on conflict (canonical_key) do update
  set canonical_name=excluded.canonical_name,
      updated_at=now();

  delete from public.product_ingredients_v1;

  insert into public.product_ingredients_v1
  (source_drug_id,ingredient_ordinal,concept_id,source_term,component_key,
   resolution_method,confidence,source_occurrence_count,source_terms)
  select
    s.source_drug_id,1,c.concept_id,s.source_expression,s.component_key,
    'SINGLE_CANONICAL',s.confidence,1,array[s.source_expression]
  from public.medindex_p1_safe_single_v1 s
  join public.substance_concepts_v1 c on c.canonical_key=s.canonical_key;

  insert into public.product_ingredients_v1
  (source_drug_id,ingredient_ordinal,concept_id,source_term,component_key,
   resolution_method,confidence,source_occurrence_count,source_terms)
  select
    p.source_drug_id,p.ingredient_ordinal,c.concept_id,p.source_term,p.component_key,
    case when p.source_occurrence_count>1 then 'DELIMITER_DEDUP' else 'DELIMITER_EXACT' end,
    p.confidence,p.source_occurrence_count,p.source_terms
  from public.medindex_p1_resolved_delimiter_parts_v2 p
  join public.medindex_p1_safe_delimiter_v2 s
    on s.source_drug_id=p.source_drug_id
  join public.substance_concepts_v1 c on c.canonical_key=p.canonical_key;

  insert into public.product_ingredients_v1
  (source_drug_id,ingredient_ordinal,concept_id,source_term,component_key,
   resolution_method,confidence,source_occurrence_count,source_terms)
  select
    p.source_drug_id,p.ingredient_ordinal,p.concept_id,p.source_term,p.term_key,
    'AND_EXACT',p.confidence,1,array[p.source_term]
  from public.medindex_p1_and_parts_v1 p
  join public.medindex_p1_safe_and_v1 s on s.source_drug_id=p.source_drug_id;

  delete from public.product_ingredient_resolution_v1;

  insert into public.product_ingredient_resolution_v1
  (source_drug_id,resolution_status,expected_component_count,resolved_component_count,
   reason_codes,source_expression,reviewed_at,source_component_count,duplicate_component_count)
  select
    d.id,
    case
      when e.source_drug_id is not null then 'EXCLUDED'
      when sd.source_drug_id is not null and sd.identity_count=1 then 'RESOLVED_SINGLE'
      when sd.source_drug_id is not null and sd.identity_count>=2 then 'RESOLVED_MULTI'
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
        (select count(*)::integer from public.medindex_p1_combo_parts_v1 cp where cp.source_drug_id=d.id)
      when d.active_substance !~ '(;|\+|&)' and d.active_substance ~* '\sand\s' then
        (select count(*)::integer from public.medindex_p1_and_parts_v1 ap where ap.source_drug_id=d.id)
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
      when sd.source_drug_id is not null and sd.duplicate_component_count>0 then
        array['DUPLICATE_SOURCE_COMPONENT_COLLAPSED']
      else array_remove(array[
        case when coalesce(btrim(d.active_substance),'')='' then 'MISSING_ACTIVE_SUBSTANCE' end,
        case when d.active_substance ~* '(equivalent to|corresponding to|\yas\y)' then
               case when sd.source_drug_id is not null
                      or sa.source_drug_id is not null
                      or ss.source_drug_id is not null
                    then 'EQUIVALENCE_REVIEWED'
                    else 'EQUIVALENCE_EXPRESSION' end end,
        case when sd.source_drug_id is null
                   and sa.source_drug_id is null
                   and ss.source_drug_id is null
                   and d.active_substance !~ '(;|\+|&)'
                   and d.active_substance ~* '\sand\s'
             then 'WORD_AND_CONNECTOR' end,
        case when sd.source_drug_id is null
                   and sa.source_drug_id is null
                   and ss.source_drug_id is null
                   and d.active_substance !~ '(;|\+|&)'
                   and d.active_substance ~ '/'
             then 'SLASH_CONNECTOR' end,
        case when sd.source_drug_id is null
                   and sa.source_drug_id is null
                   and ss.source_drug_id is null
                   and d.active_substance ~ '(;|\+|&)'
                   and exists (
                     select 1 from public.medindex_p1_combo_parts_v1 cp
                     where cp.source_drug_id=d.id and cp.canonical_key is null
                   )
             then 'UNRESOLVED_COMPONENT' end,
        case when m.source_drug_id is not null
               and not exists (
                 select 1 from public.substance_canonical sc
                 where sc.variant_key=d.active_substance_key
               ) then 'NO_CANONICAL_ROOT' end,
        case when m.source_drug_id is null and e.source_drug_id is null then 'NO_CORE_MAP' end
      ],null)
    end,
    d.active_substance,
    case when sd.source_drug_id is not null or sa.source_drug_id is not null or ss.source_drug_id is not null
         then now() else null end,
    case
      when sd.source_drug_id is not null then sd.source_component_count
      when sa.source_drug_id is not null then sa.part_count
      when ss.source_drug_id is not null then 1
      when d.active_substance ~ '(;|\+|&)' then
        (select count(*)::integer from public.medindex_p1_combo_parts_v1 cp where cp.source_drug_id=d.id)
      else null
    end,
    coalesce(sd.duplicate_component_count,0)
  from public.drugs d
  left join public.medindex_drug_core_map_v1 m on m.source_drug_id=d.id
  left join public.medindex_drug_pipeline_exceptions_v1 e on e.source_drug_id=d.id
  left join public.medindex_p1_safe_delimiter_v2 sd on sd.source_drug_id=d.id
  left join public.medindex_p1_safe_and_v1 sa on sa.source_drug_id=d.id
  left join public.medindex_p1_safe_single_v1 ss on ss.source_drug_id=d.id;

  select count(*) into total_drugs from public.product_ingredient_resolution_v1;
  select count(*) into resolved_single from public.product_ingredient_resolution_v1 where resolution_status='RESOLVED_SINGLE';
  select count(*) into resolved_multi from public.product_ingredient_resolution_v1 where resolution_status='RESOLVED_MULTI';
  select count(*) into needs_review from public.product_ingredient_resolution_v1 where resolution_status='NEEDS_REVIEW';
  select count(*) into excluded from public.product_ingredient_resolution_v1 where resolution_status='EXCLUDED';
  select count(*) into ingredient_rows from public.product_ingredients_v1;

  if total_drugs <> (select count(*) from public.drugs) then
    raise exception 'P1 refresh lost product coverage';
  end if;

  select count(*) into bad_resolved
  from public.product_ingredient_resolution_v1 r
  left join (
    select source_drug_id,count(*)::integer n
    from public.product_ingredients_v1
    group by source_drug_id
  ) i using(source_drug_id)
  where (r.resolution_status='RESOLVED_SINGLE' and coalesce(i.n,0)<>1)
     or (r.resolution_status='RESOLVED_MULTI' and (
           r.expected_component_count<>r.resolved_component_count
           or coalesce(i.n,0)<>r.resolved_component_count
           or r.resolved_component_count<2
         ));

  if bad_resolved <> 0 then
    raise exception 'P1 refresh has % invalid resolved products',bad_resolved;
  end if;

  select count(*) into bad_unresolved
  from public.product_ingredient_resolution_v1 r
  join public.product_ingredients_v1 i using(source_drug_id)
  where r.resolution_status in ('NEEDS_REVIEW','EXCLUDED');

  if bad_unresolved <> 0 then
    raise exception 'P1 refresh assigned ingredients to % unresolved/excluded products',bad_unresolved;
  end if;

  select count(*) into bad_source_counts
  from public.product_ingredient_resolution_v1 r
  join (
    select source_drug_id,
           sum(source_occurrence_count)::integer as source_n,
           count(*)::integer as identity_n
    from public.product_ingredients_v1
    group by source_drug_id
  ) i using(source_drug_id)
  where r.resolution_status in ('RESOLVED_SINGLE','RESOLVED_MULTI')
    and (
      r.resolved_component_count<>i.identity_n
      or (r.source_component_count is not null and r.source_component_count<>i.source_n)
      or r.duplicate_component_count<>greatest(i.source_n-i.identity_n,0)
    );

  if bad_source_counts <> 0 then
    raise exception 'P1 refresh has % invalid source occurrence counts',bad_source_counts;
  end if;

  return jsonb_build_object(
    'total',total_drugs,
    'resolved_single',resolved_single,
    'resolved_multi',resolved_multi,
    'needs_review',needs_review,
    'excluded',excluded,
    'ingredient_rows',ingredient_rows
  );
end $$;

-- RLS policies and SQL privileges are separate gates. Keep the curated read
-- surface available on a clean rebuild without inheriting broad defaults.
grant select on
  public.substance_concepts_v1,
  public.substance_terms_v1,
  public.substance_aliases,
  public.substance_merge_rejections,
  public.substance_equivalence_reviewed_v1,
  public.substance_equivalence_cleared_v1,
  public.substance_single_expression_override_v1,
  public.product_ingredients_v1,
  public.product_ingredient_resolution_v1,
  public.substance_canonical,
  public.active_substances,
  public.medindex_product_ingredient_sets_v1
to anon, authenticated;

-- Trigger execution is internal to PostgreSQL. It must not be an exposed RPC.
revoke all on function public.medindex_reject_alias_rejection_conflict()
  from public, anon, authenticated;
grant execute on function public.medindex_reject_alias_rejection_conflict()
  to service_role;

-- Reassert the existing maintenance boundary after replacing the function.
revoke all on function public.medindex_refresh_product_ingredients_v1()
  from public, anon, authenticated;
grant execute on function public.medindex_refresh_product_ingredients_v1()
  to service_role;

select public.medindex_refresh_product_ingredients_v1();

do $$
declare
  n bigint;
  client_role text;
  object_name text;
  privilege_name text;
begin
  select count(*) into n
  from public.product_ingredient_resolution_v1
  where resolution_status in ('RESOLVED_SINGLE','RESOLVED_MULTI')
    and reason_codes && array[
      'EQUIVALENCE_EXPRESSION',
      'UNRESOLVED_COMPONENT',
      'SLASH_CONNECTOR',
      'WORD_AND_CONNECTOR'
    ]::text[];
  if n <> 0 then
    raise exception 'P1 exit: % resolved products still carry blocker reason codes', n;
  end if;

  if has_function_privilege(
       'anon',
       'public.medindex_reject_alias_rejection_conflict()',
       'EXECUTE'
     ) or has_function_privilege(
       'authenticated',
       'public.medindex_reject_alias_rejection_conflict()',
       'EXECUTE'
     ) then
    raise exception 'P1 exit: conflict trigger function remains callable through a client role';
  end if;

  if has_function_privilege(
       'anon',
       'public.medindex_refresh_product_ingredients_v1()',
       'EXECUTE'
     ) or has_function_privilege(
       'authenticated',
       'public.medindex_refresh_product_ingredients_v1()',
       'EXECUTE'
     ) then
    raise exception 'P1 exit: ingredient refresh function remains callable through a client role';
  end if;

  if not has_table_privilege(
       'anon',
       'public.substance_single_expression_override_v1',
       'SELECT'
     ) or not has_table_privilege(
       'authenticated',
       'public.substance_single_expression_override_v1',
       'SELECT'
     ) then
    raise exception 'P1 exit: reviewed single-expression overrides are not readable';
  end if;

  select count(*) into n
  from public.substance_single_expression_override_v1 o
  left join public.substance_aliases a on a.variant_key=o.source_key
  where a.variant_key is null
     or a.canonical_key is distinct from o.canonical_key;
  if n <> 0 then
    raise exception 'P1 exit: % single-expression overrides disagree with the alias graph', n;
  end if;

  foreach client_role in array array['anon','authenticated']::text[] loop
    foreach object_name in array array[
      'substance_concepts_v1',
      'substance_terms_v1',
      'substance_aliases',
      'substance_merge_rejections',
      'substance_equivalence_reviewed_v1',
      'substance_equivalence_cleared_v1',
      'substance_single_expression_override_v1',
      'product_ingredients_v1',
      'product_ingredient_resolution_v1',
      'substance_canonical',
      'active_substances',
      'medindex_product_ingredient_sets_v1'
    ]::text[] loop
      foreach privilege_name in array array[
        'INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
      ]::text[] loop
        if has_table_privilege(
             client_role,
             format('public.%I', object_name),
             privilege_name
           ) then
          raise exception 'P1 exit: role % retains effective % on %',
            client_role, privilege_name, object_name;
        end if;
      end loop;
    end loop;
  end loop;

  select count(*) into n
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace ns on ns.oid=c.relnamespace
  where ns.nspname='public'
    and c.relkind='r'
    and c.relname in (
      'substance_concepts_v1',
      'substance_terms_v1',
      'substance_aliases',
      'substance_merge_rejections',
      'substance_equivalence_reviewed_v1',
      'substance_equivalence_cleared_v1',
      'substance_single_expression_override_v1',
      'product_ingredients_v1',
      'product_ingredient_resolution_v1'
    )
    and not c.relrowsecurity;
  if n <> 0 then
    raise exception 'P1 exit: % curated tables have RLS disabled', n;
  end if;

  select count(*) into n
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace ns on ns.oid=c.relnamespace
  where ns.nspname='public'
    and c.relkind='r'
    and c.relname in (
      'substance_concepts_v1',
      'substance_terms_v1',
      'substance_aliases',
      'substance_merge_rejections',
      'substance_equivalence_reviewed_v1',
      'substance_equivalence_cleared_v1',
      'substance_single_expression_override_v1',
      'product_ingredients_v1',
      'product_ingredient_resolution_v1'
    )
    and not exists (
      select 1
      from pg_catalog.pg_policies p
      where p.schemaname='public'
        and p.tablename=c.relname
        and p.cmd='SELECT'
        and p.qual='true'
        and (
          p.roles @> array['public']::name[]
          or p.roles @> array['anon','authenticated']::name[]
        )
    );
  if n <> 0 then
    raise exception 'P1 exit: % curated tables lack a public read policy', n;
  end if;

  select count(*) into n
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace ns on ns.oid=c.relnamespace
  where ns.nspname='public'
    and c.relkind='v'
    and (
      c.relname like 'medindex_p1_%'
      or c.relname in (
        'substance_canonical',
        'active_substances',
        'medindex_product_ingredient_sets_v1',
        'medindex_product_ingredient_review_queue_v1'
      )
    )
    and not (
      coalesce(c.reloptions, array[]::text[])
      @> array['security_invoker=true']::text[]
    );
  if n <> 0 then
    raise exception 'P1 exit: % P1 views are not security_invoker', n;
  end if;
end $$;
