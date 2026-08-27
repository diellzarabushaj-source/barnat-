-- Synced from Supabase production migration history.
-- version: 20260827130837
-- name: p1_clinical_substance_identity_foundation

create or replace function public.medindex_stable_uuid_v1(scope text, value text)
returns uuid
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, public
as $$
  with h as (
    select md5(lower(btrim(scope)) || ':' || lower(btrim(value))) as v
  )
  select (
    substr(v,1,8) || '-' ||
    substr(v,9,4) || '-' ||
    '5' || substr(v,14,3) || '-' ||
    'a' || substr(v,18,3) || '-' ||
    substr(v,21,12)
  )::uuid
  from h
$$;

create or replace function public.medindex_normalize_substance_term_v1(value text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, public
as $$
  select nullif(regexp_replace(lower(btrim(value)), '[^a-z0-9]+', '', 'g'), '')
$$;

create table if not exists public.substance_concepts_v1 (
  concept_id uuid primary key,
  canonical_key text not null unique,
  canonical_name text not null,
  concept_kind text not null default 'INGREDIENT',
  source_method text not null default 'CANONICAL_GRAPH',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint substance_concepts_v1_key_check
    check (canonical_key = public.medindex_normalize_substance_term_v1(canonical_key)),
  constraint substance_concepts_v1_name_check
    check (char_length(btrim(canonical_name)) > 0),
  constraint substance_concepts_v1_kind_check
    check (concept_kind in ('INGREDIENT'))
);

create table if not exists public.substance_terms_v1 (
  term_key text primary key,
  concept_id uuid not null
    references public.substance_concepts_v1(concept_id) on delete cascade,
  term text not null,
  term_type text not null,
  is_preferred boolean not null default false,
  confidence numeric(5,4) not null default 1.0000,
  review_method text not null default 'CANONICAL_GRAPH',
  evidence_urls text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint substance_terms_v1_term_check
    check (char_length(btrim(term)) > 0),
  constraint substance_terms_v1_type_check
    check (term_type in ('CANONICAL','SOURCE','ALIAS','SYNTHETIC')),
  constraint substance_terms_v1_confidence_check
    check (confidence >= 0 and confidence <= 1)
);

create index if not exists substance_terms_v1_concept_idx
  on public.substance_terms_v1(concept_id);

create table if not exists public.product_ingredient_resolution_v1 (
  source_drug_id uuid primary key
    references public.drugs(id) on delete cascade,
  resolution_status text not null,
  expected_component_count integer,
  resolved_component_count integer not null default 0,
  reason_codes text[] not null default '{}'::text[],
  source_expression text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_ingredient_resolution_v1_status_check
    check (resolution_status in ('RESOLVED_SINGLE','RESOLVED_MULTI','NEEDS_REVIEW','EXCLUDED')),
  constraint product_ingredient_resolution_v1_counts_check
    check (
      resolved_component_count >= 0
      and (expected_component_count is null or expected_component_count >= 0)
      and (expected_component_count is null or resolved_component_count <= expected_component_count)
    )
);

create table if not exists public.product_ingredients_v1 (
  source_drug_id uuid not null
    references public.drugs(id) on delete cascade,
  ingredient_ordinal integer not null,
  concept_id uuid not null
    references public.substance_concepts_v1(concept_id),
  source_term text not null,
  component_key text not null,
  resolution_method text not null,
  confidence numeric(5,4) not null default 1.0000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_drug_id, ingredient_ordinal),
  unique (source_drug_id, concept_id),
  constraint product_ingredients_v1_ordinal_check
    check (ingredient_ordinal > 0),
  constraint product_ingredients_v1_component_key_check
    check (component_key = public.medindex_normalize_substance_term_v1(component_key)),
  constraint product_ingredients_v1_method_check
    check (resolution_method in ('SINGLE_CANONICAL','DELIMITER_EXACT')),
  constraint product_ingredients_v1_confidence_check
    check (confidence >= 0 and confidence <= 1)
);

create index if not exists product_ingredients_v1_concept_idx
  on public.product_ingredients_v1(concept_id);

alter table public.substance_concepts_v1 enable row level security;
alter table public.substance_terms_v1 enable row level security;
alter table public.product_ingredient_resolution_v1 enable row level security;
alter table public.product_ingredients_v1 enable row level security;

drop policy if exists substance_concepts_v1_read on public.substance_concepts_v1;
create policy substance_concepts_v1_read
  on public.substance_concepts_v1 for select
  to anon, authenticated using (true);

drop policy if exists substance_terms_v1_read on public.substance_terms_v1;
create policy substance_terms_v1_read
  on public.substance_terms_v1 for select
  to anon, authenticated using (true);

drop policy if exists product_ingredient_resolution_v1_read on public.product_ingredient_resolution_v1;
create policy product_ingredient_resolution_v1_read
  on public.product_ingredient_resolution_v1 for select
  to anon, authenticated using (true);

drop policy if exists product_ingredients_v1_read on public.product_ingredients_v1;
create policy product_ingredients_v1_read
  on public.product_ingredients_v1 for select
  to anon, authenticated using (true);

grant select on public.substance_concepts_v1,
                public.substance_terms_v1,
                public.product_ingredient_resolution_v1,
                public.product_ingredients_v1
to anon, authenticated;

create temporary table _p1_combo_parts on commit drop as
select
  d.id as source_drug_id,
  d.active_substance as source_expression,
  row_number() over (partition by d.id order by part.ordinality)::integer as ingredient_ordinal,
  btrim(part.value) as source_term,
  public.medindex_normalize_substance_term_v1(part.value) as component_key,
  c.canonical_key,
  c.canonical_name,
  coalesce(a.confidence,1.0000)::numeric(5,4) as confidence
from public.drugs d
join public.medindex_drug_core_map_v1 m on m.source_drug_id=d.id
cross join lateral regexp_split_to_table(d.active_substance, '\s*(?:;|\+|&)\s*')
  with ordinality as part(value,ordinality)
left join public.substance_canonical c
  on c.variant_key=public.medindex_normalize_substance_term_v1(part.value)
left join public.substance_aliases a
  on a.variant_key=public.medindex_normalize_substance_term_v1(part.value)
where d.active_substance ~ '(;|\+|&)';

create temporary table _p1_safe_multi on commit drop as
select
  p.source_drug_id,
  count(*)::integer as part_count
from _p1_combo_parts p
join public.drugs d on d.id=p.source_drug_id
group by p.source_drug_id,d.active_substance
having count(*) >= 2
   and count(p.canonical_key)=count(*)
   and count(distinct p.canonical_key)=count(*)
   and d.active_substance !~* '(equivalent to|corresponding to|\bas\b)';

create temporary table _p1_safe_single on commit drop as
select
  d.id as source_drug_id,
  d.active_substance as source_expression,
  d.active_substance_key as component_key,
  c.canonical_key,
  c.canonical_name,
  coalesce(a.confidence,1.0000)::numeric(5,4) as confidence
from public.drugs d
join public.medindex_drug_core_map_v1 m on m.source_drug_id=d.id
join public.substance_canonical c on c.variant_key=d.active_substance_key
left join public.substance_aliases a on a.variant_key=d.active_substance_key
where coalesce(btrim(d.active_substance),'') <> ''
  and d.active_substance !~ '(;|\+|&)'
  and d.active_substance !~* '\sand\s'
  and d.active_substance !~ '/'
  and d.active_substance !~* '(equivalent to|corresponding to|\bas\b)';

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
select
  public.medindex_stable_uuid_v1('substance',q.canonical_key),
  q.canonical_key,
  max(q.canonical_name),
  'INGREDIENT',
  'CANONICAL_GRAPH'
from (
  select canonical_key,canonical_name from _p1_safe_single
  union all
  select p.canonical_key,p.canonical_name
  from _p1_combo_parts p
  join _p1_safe_multi s on s.source_drug_id=p.source_drug_id
) q
where q.canonical_key is not null
group by q.canonical_key
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name,
    updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
select
  c.canonical_key,
  c.concept_id,
  c.canonical_name,
  'CANONICAL',
  true,
  1.0000,
  'CANONICAL_GRAPH',
  '{}'::text[]
from public.substance_concepts_v1 c
on conflict (term_key) do update
set concept_id=excluded.concept_id,
    term=excluded.term,
    term_type='CANONICAL',
    is_preferred=true,
    confidence=1.0000,
    review_method='CANONICAL_GRAPH',
    updated_at=now();

with source_counts as (
  select
    d.active_substance_key as term_key,
    c.concept_id,
    d.active_substance as term,
    case when a.variant_key is null then 'SOURCE' else 'ALIAS' end as term_type,
    coalesce(a.confidence,1.0000)::numeric(5,4) as confidence,
    coalesce(a.review_method,'SOURCE_REGISTRY') as review_method,
    coalesce(a.evidence_urls,'{}'::text[]) as evidence_urls,
    count(*)::bigint as n
  from public.drugs d
  join public.substance_canonical sc on sc.variant_key=d.active_substance_key
  join public.substance_concepts_v1 c on c.canonical_key=sc.canonical_key
  left join public.substance_aliases a on a.variant_key=d.active_substance_key
  where coalesce(btrim(d.active_substance),'') <> ''
  group by d.active_substance_key,c.concept_id,d.active_substance,
           case when a.variant_key is null then 'SOURCE' else 'ALIAS' end,
           coalesce(a.confidence,1.0000)::numeric(5,4),
           coalesce(a.review_method,'SOURCE_REGISTRY'),
           coalesce(a.evidence_urls,'{}'::text[])
),
source_terms as (
  select *,
         row_number() over (
           partition by term_key
           order by n desc,length(term),term
         ) as rn
  from source_counts
)
insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
select term_key,concept_id,term,term_type,false,confidence,review_method,evidence_urls
from source_terms
where rn=1
on conflict (term_key) do nothing;

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
select distinct on (p.component_key)
  p.component_key,
  c.concept_id,
  p.source_term,
  case when a.variant_key is null then 'SOURCE' else 'ALIAS' end,
  false,
  p.confidence,
  coalesce(a.review_method,'DELIMITER_SOURCE'),
  coalesce(a.evidence_urls,'{}'::text[])
from _p1_combo_parts p
join _p1_safe_multi s on s.source_drug_id=p.source_drug_id
join public.substance_concepts_v1 c on c.canonical_key=p.canonical_key
left join public.substance_aliases a on a.variant_key=p.component_key
where p.component_key is not null
order by p.component_key,length(p.source_term),p.source_term
on conflict (term_key) do nothing;

delete from public.product_ingredients_v1;

insert into public.product_ingredients_v1
(source_drug_id,ingredient_ordinal,concept_id,source_term,component_key,resolution_method,confidence)
select
  s.source_drug_id,
  1,
  c.concept_id,
  s.source_expression,
  s.component_key,
  'SINGLE_CANONICAL',
  s.confidence
from _p1_safe_single s
join public.substance_concepts_v1 c on c.canonical_key=s.canonical_key;

insert into public.product_ingredients_v1
(source_drug_id,ingredient_ordinal,concept_id,source_term,component_key,resolution_method,confidence)
select
  p.source_drug_id,
  p.ingredient_ordinal,
  c.concept_id,
  p.source_term,
  p.component_key,
  'DELIMITER_EXACT',
  p.confidence
from _p1_combo_parts p
join _p1_safe_multi s on s.source_drug_id=p.source_drug_id
join public.substance_concepts_v1 c on c.canonical_key=p.canonical_key;

delete from public.product_ingredient_resolution_v1;

insert into public.product_ingredient_resolution_v1
(source_drug_id,resolution_status,expected_component_count,resolved_component_count,reason_codes,source_expression,reviewed_at)
select
  d.id,
  case
    when e.source_drug_id is not null then 'EXCLUDED'
    when sm.source_drug_id is not null then 'RESOLVED_MULTI'
    when ss.source_drug_id is not null then 'RESOLVED_SINGLE'
    else 'NEEDS_REVIEW'
  end,
  case
    when e.source_drug_id is not null then 0
    when sm.source_drug_id is not null then sm.part_count
    when ss.source_drug_id is not null then 1
    when d.active_substance ~ '(;|\+|&)' then (
      select count(*)::integer from _p1_combo_parts cp where cp.source_drug_id=d.id
    )
    else null
  end,
  case
    when sm.source_drug_id is not null then sm.part_count
    when ss.source_drug_id is not null then 1
    else 0
  end,
  case
    when e.source_drug_id is not null then array[e.exception_code]
    else array_remove(array[
      case when coalesce(btrim(d.active_substance),'')='' then 'MISSING_ACTIVE_SUBSTANCE' end,
      case when d.active_substance ~* '(equivalent to|corresponding to|\bas\b)' then 'EQUIVALENCE_EXPRESSION' end,
      case when d.active_substance !~ '(;|\+|&)' and d.active_substance ~* '\sand\s' then 'WORD_AND_CONNECTOR' end,
      case when d.active_substance !~ '(;|\+|&)' and d.active_substance ~ '/' then 'SLASH_CONNECTOR' end,
      case when d.active_substance ~ '(;|\+|&)'
             and exists (
               select 1 from _p1_combo_parts cp
               where cp.source_drug_id=d.id and cp.canonical_key is null
             ) then 'UNRESOLVED_COMPONENT' end,
      case when d.active_substance ~ '(;|\+|&)'
             and exists (
               select 1
               from _p1_combo_parts cp
               where cp.source_drug_id=d.id
               group by cp.source_drug_id
               having count(distinct cp.canonical_key) < count(cp.canonical_key)
             ) then 'DUPLICATE_COMPONENT' end,
      case when m.source_drug_id is not null
             and not exists (
               select 1 from public.substance_canonical sc
               where sc.variant_key=d.active_substance_key
             ) then 'NO_CANONICAL_ROOT' end,
      case when m.source_drug_id is null and e.source_drug_id is null then 'NO_CORE_MAP' end
    ],null)
  end,
  d.active_substance,
  case when sm.source_drug_id is not null or ss.source_drug_id is not null then now() else null end
from public.drugs d
left join public.medindex_drug_core_map_v1 m on m.source_drug_id=d.id
left join public.medindex_drug_pipeline_exceptions_v1 e on e.source_drug_id=d.id
left join _p1_safe_multi sm on sm.source_drug_id=d.id
left join _p1_safe_single ss on ss.source_drug_id=d.id;

create or replace view public.medindex_product_ingredient_sets_v1
with (security_invoker = true) as
select
  i.source_drug_id,
  public.medindex_stable_uuid_v1(
    'ingredient-set',
    string_agg(i.concept_id::text,'|' order by i.concept_id::text)
  ) as ingredient_set_id,
  count(*)::integer as ingredient_count,
  array_agg(i.concept_id order by i.concept_id::text) as concept_ids,
  array_agg(c.canonical_name order by i.concept_id::text) as canonical_ingredients
from public.product_ingredients_v1 i
join public.substance_concepts_v1 c on c.concept_id=i.concept_id
group by i.source_drug_id;

grant select on public.medindex_product_ingredient_sets_v1
to anon, authenticated;

create or replace view public.medindex_product_ingredient_review_queue_v1
with (security_invoker = true) as
select
  d.id as source_drug_id,
  d.registry_number,
  d.trade_name,
  d.active_substance,
  r.reason_codes,
  r.expected_component_count,
  r.resolved_component_count
from public.product_ingredient_resolution_v1 r
join public.drugs d on d.id=r.source_drug_id
where r.resolution_status='NEEDS_REVIEW';

revoke all on public.medindex_product_ingredient_review_queue_v1
from anon, authenticated;

do $$
declare
  total_drugs bigint;
  resolution_rows bigint;
  exception_rows bigint;
  excluded_rows bigint;
  ingredient_rows bigint;
  bad_resolved bigint;
  bad_unresolved bigint;
  bad_exception bigint;
begin
  select count(*) into total_drugs from public.drugs;
  select count(*) into resolution_rows from public.product_ingredient_resolution_v1;
  select count(*) into exception_rows from public.medindex_drug_pipeline_exceptions_v1;
  select count(*) into excluded_rows
    from public.product_ingredient_resolution_v1
    where resolution_status='EXCLUDED';
  select count(*) into ingredient_rows from public.product_ingredients_v1;

  if total_drugs <> resolution_rows then
    raise exception 'P1 resolution coverage mismatch: drugs %, resolution %',
      total_drugs,resolution_rows;
  end if;

  if exception_rows <> excluded_rows then
    raise exception 'P1 excluded mismatch: exceptions %, excluded %',
      exception_rows,excluded_rows;
  end if;

  select count(*) into bad_resolved
  from public.product_ingredient_resolution_v1 r
  left join (
    select source_drug_id,count(*)::integer as n
    from public.product_ingredients_v1
    group by source_drug_id
  ) i using (source_drug_id)
  where (
    r.resolution_status='RESOLVED_SINGLE'
    and (r.resolved_component_count<>1 or coalesce(i.n,0)<>1)
  ) or (
    r.resolution_status='RESOLVED_MULTI'
    and (
      r.resolved_component_count<2
      or r.expected_component_count<>r.resolved_component_count
      or coalesce(i.n,0)<>r.resolved_component_count
    )
  );

  if bad_resolved <> 0 then
    raise exception 'P1 has % invalid resolved products',bad_resolved;
  end if;

  select count(*) into bad_unresolved
  from public.product_ingredient_resolution_v1 r
  join public.product_ingredients_v1 i using (source_drug_id)
  where r.resolution_status in ('NEEDS_REVIEW','EXCLUDED');

  if bad_unresolved <> 0 then
    raise exception 'P1 unresolved/excluded products have ingredient rows: %',bad_unresolved;
  end if;

  select count(*) into bad_exception
  from public.medindex_drug_pipeline_exceptions_v1 e
  join public.product_ingredients_v1 i on i.source_drug_id=e.source_drug_id;

  if bad_exception <> 0 then
    raise exception 'P1 exception products received ingredients: %',bad_exception;
  end if;

  if ingredient_rows = 0 then
    raise exception 'P1 ingredient backfill unexpectedly empty';
  end if;
end $$;
