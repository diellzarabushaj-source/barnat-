-- DRx strict Phase 4: unified canonical substance/composition namespace.
-- Additive, private, fail-closed. Base/salt are never merged by canonical_key alone.

create schema if not exists drx_identity;
revoke all on schema drx_identity from public,anon,authenticated;

create table if not exists drx_identity.canonical_concepts_v1 (
  concept_id uuid primary key,
  canonical_name text not null,
  normalized_name text not null,
  concept_kind text not null check (concept_kind in ('INGREDIENT','COMBINATION')),
  source_namespace text not null check (source_namespace in ('PUBLIC','STAGE')),
  public_concept_id uuid,
  identity_status text not null check (identity_status in ('SOURCE_CANONICAL','STAGE_EXACT','REVIEW')),
  publication_eligible boolean not null default false,
  created_at timestamptz not null default now(),
  check (publication_eligible = false)
);

create unique index if not exists drx_identity_public_concept_uq
  on drx_identity.canonical_concepts_v1(public_concept_id)
  where public_concept_id is not null;

create table if not exists drx_identity.source_concept_map_v1 (
  source_namespace text not null check (source_namespace in ('PUBLIC','STAGE')),
  source_concept_id uuid not null,
  canonical_concept_id uuid not null
    references drx_identity.canonical_concepts_v1(concept_id) on delete restrict,
  source_key text,
  source_name text not null,
  source_normalized_name text not null,
  resolution_method text not null,
  resolution_status text not null check (resolution_status in ('EXACT','REVIEW')),
  evidence_note text,
  created_at timestamptz not null default now(),
  primary key(source_namespace,source_concept_id)
);

create table if not exists drx_identity.canonical_terms_v1 (
  term_key text not null,
  canonical_concept_id uuid not null
    references drx_identity.canonical_concepts_v1(concept_id) on delete restrict,
  term text not null,
  term_type text not null check (term_type in ('CANONICAL','ALIAS','SOURCE_TERM')),
  is_preferred boolean not null default false,
  review_status text not null check (review_status in ('REVIEWED','SOURCE_EXACT','REVIEW')),
  evidence_urls text[] not null default '{}'::text[],
  source_ref text not null,
  created_at timestamptz not null default now(),
  primary key(term_key,canonical_concept_id)
);

create table if not exists drx_identity.relationships_v1 (
  relationship_id uuid primary key default gen_random_uuid(),
  source_concept_id uuid not null
    references drx_identity.canonical_concepts_v1(concept_id) on delete restrict,
  target_concept_id uuid not null
    references drx_identity.canonical_concepts_v1(concept_id) on delete restrict,
  relationship_type text not null check (relationship_type in (
    'BASE_SALT_EQUIVALENCE',
    'HYDRATE_EQUIVALENCE',
    'ESTER_EQUIVALENCE',
    'REVIEWED_EQUIVALENCE'
  )),
  reason text not null,
  decided_by text not null,
  reviewed_at timestamptz not null,
  evidence_urls text[] not null,
  source_ref text not null,
  publication_eligible boolean not null default false,
  created_at timestamptz not null default now(),
  check (source_concept_id <> target_concept_id),
  check (cardinality(evidence_urls) > 0),
  check (publication_eligible = false),
  unique(source_concept_id,target_concept_id,relationship_type,source_ref)
);

create table if not exists drx_identity.combination_components_v1 (
  combination_concept_id uuid not null
    references drx_identity.canonical_concepts_v1(concept_id) on delete restrict,
  component_ordinal integer not null check (component_ordinal > 0),
  source_component_text text not null,
  component_term_key text not null,
  component_concept_id uuid
    references drx_identity.canonical_concepts_v1(concept_id) on delete restrict,
  resolution_status text not null check (resolution_status in ('EXACT','UNRESOLVED','AMBIGUOUS')),
  resolution_method text not null,
  primary key(combination_concept_id,component_ordinal),
  check (
    (resolution_status='EXACT' and component_concept_id is not null)
    or (resolution_status in ('UNRESOLVED','AMBIGUOUS') and component_concept_id is null)
  )
);

create table if not exists drx_identity.product_component_strength_v1 (
  source_drug_id uuid not null,
  ingredient_ordinal integer not null check (ingredient_ordinal > 0),
  canonical_concept_id uuid not null
    references drx_identity.canonical_concepts_v1(concept_id) on delete restrict,
  source_term text not null,
  raw_component_strength text not null,
  parsed_component_strength jsonb not null,
  alignment_status text not null check (alignment_status='EXACT_PLUS_DELIMITER'),
  source_strength text not null,
  created_at timestamptz not null default now(),
  primary key(source_drug_id,ingredient_ordinal)
);

insert into drx_identity.canonical_concepts_v1(
  concept_id,canonical_name,normalized_name,concept_kind,source_namespace,
  public_concept_id,identity_status,publication_eligible
)
select
  c.concept_id,
  c.canonical_name,
  public.medindex_normalize_substance_term_v1(c.canonical_name),
  'INGREDIENT',
  'PUBLIC',
  c.concept_id,
  'SOURCE_CANONICAL',
  false
from public.substance_concepts_v1 c
on conflict (concept_id) do update set
  canonical_name=excluded.canonical_name,
  normalized_name=excluded.normalized_name,
  public_concept_id=excluded.public_concept_id;

insert into drx_identity.source_concept_map_v1(
  source_namespace,source_concept_id,canonical_concept_id,source_key,source_name,
  source_normalized_name,resolution_method,resolution_status,evidence_note
)
select
  'PUBLIC',c.concept_id,c.concept_id,c.canonical_key,c.canonical_name,
  public.medindex_normalize_substance_term_v1(c.canonical_name),
  'PUBLIC_IDENTITY','EXACT','Existing public substance_concepts_v1 UUID retained'
from public.substance_concepts_v1 c
on conflict (source_namespace,source_concept_id) do update set
  canonical_concept_id=excluded.canonical_concept_id,
  source_key=excluded.source_key,
  source_name=excluded.source_name,
  source_normalized_name=excluded.source_normalized_name,
  resolution_method=excluded.resolution_method,
  resolution_status=excluded.resolution_status,
  evidence_note=excluded.evidence_note;

create or replace view drx_identity.public_exact_term_resolver_v1 as
select
  t.term_key,
  min(t.concept_id::text)::uuid as concept_id,
  count(distinct t.concept_id) as candidate_count
from public.substance_terms_v1 t
group by t.term_key;

with stage_norm as (
  select
    s.*,
    public.medindex_normalize_substance_term_v1(s.canonical_substance) as exact_term_key
  from drx_stage.substance_master_v1 s
),
resolved as (
  select s.*,r.concept_id
  from stage_norm s
  join drx_identity.public_exact_term_resolver_v1 r
    on r.term_key=s.exact_term_key and r.candidate_count=1
)
insert into drx_identity.source_concept_map_v1(
  source_namespace,source_concept_id,canonical_concept_id,source_key,source_name,
  source_normalized_name,resolution_method,resolution_status,evidence_note
)
select
  'STAGE',substance_concept_id,concept_id,canonical_key,canonical_substance,
  exact_term_key,'EXACT_PUBLIC_TERM','EXACT',
  'Resolved only by exact normalized substance term; canonical_key alone is not used'
from resolved
on conflict (source_namespace,source_concept_id) do update set
  canonical_concept_id=excluded.canonical_concept_id,
  source_key=excluded.source_key,
  source_name=excluded.source_name,
  source_normalized_name=excluded.source_normalized_name,
  resolution_method=excluded.resolution_method,
  resolution_status=excluded.resolution_status,
  evidence_note=excluded.evidence_note;

with stage_norm as (
  select
    s.*,
    public.medindex_normalize_substance_term_v1(s.canonical_substance) as exact_term_key
  from drx_stage.substance_master_v1 s
),
unmatched as (
  select s.*
  from stage_norm s
  left join drx_identity.source_concept_map_v1 m
    on m.source_namespace='STAGE' and m.source_concept_id=s.substance_concept_id
  where m.source_concept_id is null
),
grouped as (
  select
    exact_term_key,
    (array_agg(substance_concept_id order by substance_concept_id::text))[1] canonical_id,
    (array_agg(canonical_substance order by substance_concept_id::text))[1] canonical_name
  from unmatched
  where exact_term_key is not null
  group by exact_term_key
)
insert into drx_identity.canonical_concepts_v1(
  concept_id,canonical_name,normalized_name,concept_kind,source_namespace,
  public_concept_id,identity_status,publication_eligible
)
select
  canonical_id,
  canonical_name,
  exact_term_key,
  case
    when public.medindex_substance_component_signature(canonical_name) is not null
      then 'COMBINATION'
    else 'INGREDIENT'
  end,
  'STAGE',
  null,
  'STAGE_EXACT',
  false
from grouped
on conflict (concept_id) do nothing;

with stage_norm as (
  select
    s.*,
    public.medindex_normalize_substance_term_v1(s.canonical_substance) as exact_term_key
  from drx_stage.substance_master_v1 s
),
unmatched as (
  select s.*
  from stage_norm s
  left join drx_identity.source_concept_map_v1 m
    on m.source_namespace='STAGE' and m.source_concept_id=s.substance_concept_id
  where m.source_concept_id is null
),
canonical_by_term as (
  select
    normalized_name,
    (array_agg(concept_id order by concept_id::text))[1] concept_id
  from drx_identity.canonical_concepts_v1
  where source_namespace='STAGE'
  group by normalized_name
)
insert into drx_identity.source_concept_map_v1(
  source_namespace,source_concept_id,canonical_concept_id,source_key,source_name,
  source_normalized_name,resolution_method,resolution_status,evidence_note
)
select
  'STAGE',s.substance_concept_id,c.concept_id,s.canonical_key,s.canonical_substance,
  s.exact_term_key,'EXACT_STAGE_TERM','EXACT',
  'Stage-only identity grouped solely by exact normalized canonical_substance'
from unmatched s
join canonical_by_term c on c.normalized_name=s.exact_term_key
on conflict (source_namespace,source_concept_id) do update set
  canonical_concept_id=excluded.canonical_concept_id,
  source_key=excluded.source_key,
  source_name=excluded.source_name,
  source_normalized_name=excluded.source_normalized_name,
  resolution_method=excluded.resolution_method,
  resolution_status=excluded.resolution_status,
  evidence_note=excluded.evidence_note;

insert into drx_identity.canonical_terms_v1(
  term_key,canonical_concept_id,term,term_type,is_preferred,
  review_status,evidence_urls,source_ref
)
select
  t.term_key,t.concept_id,t.term,
  case when t.term_type='CANONICAL' then 'CANONICAL' else 'ALIAS' end,
  t.is_preferred,
  case when coalesce(cardinality(t.evidence_urls),0)>0 then 'REVIEWED' else 'REVIEW' end,
  coalesce(t.evidence_urls,'{}'::text[]),
  'public.substance_terms_v1'
from public.substance_terms_v1 t
join drx_identity.canonical_concepts_v1 c on c.concept_id=t.concept_id
on conflict (term_key,canonical_concept_id) do update set
  term=excluded.term,
  term_type=excluded.term_type,
  is_preferred=excluded.is_preferred,
  review_status=excluded.review_status,
  evidence_urls=excluded.evidence_urls,
  source_ref=excluded.source_ref;

insert into drx_identity.canonical_terms_v1(
  term_key,canonical_concept_id,term,term_type,is_preferred,
  review_status,evidence_urls,source_ref
)
select distinct
  m.source_normalized_name,m.canonical_concept_id,m.source_name,
  'SOURCE_TERM',false,'SOURCE_EXACT','{}'::text[],
  'drx_stage.substance_master_v1'
from drx_identity.source_concept_map_v1 m
where m.source_namespace='STAGE'
on conflict (term_key,canonical_concept_id) do nothing;

insert into drx_identity.canonical_terms_v1(
  term_key,canonical_concept_id,term,term_type,is_preferred,
  review_status,evidence_urls,source_ref
)
select
  a.variant_key,
  c.concept_id,
  a.variant_key,
  'ALIAS',
  false,
  case when coalesce(cardinality(a.evidence_urls),0)>0 then 'REVIEWED' else 'REVIEW' end,
  coalesce(a.evidence_urls,'{}'::text[]),
  'public.substance_aliases'
from public.substance_aliases a
join public.substance_concepts_v1 c on c.canonical_key=a.canonical_key
on conflict (term_key,canonical_concept_id) do update set
  review_status=excluded.review_status,
  evidence_urls=excluded.evidence_urls,
  source_ref=excluded.source_ref;

create or replace view drx_identity.term_resolution_v1 as
select
  term_key,
  min(canonical_concept_id::text)::uuid canonical_concept_id,
  count(distinct canonical_concept_id) candidate_count
from drx_identity.canonical_terms_v1
group by term_key;

with src as (
  select
    e.*,
    rs.canonical_concept_id source_concept_id,
    rt.canonical_concept_id target_concept_id
  from public.substance_equivalence_reviewed_v1 e
  join drx_identity.term_resolution_v1 rs
    on rs.term_key=e.source_key and rs.candidate_count=1
  join drx_identity.term_resolution_v1 rt
    on rt.term_key=e.canonical_key and rt.candidate_count=1
  where coalesce(cardinality(e.evidence_urls),0)>0
    and nullif(btrim(e.decided_by),'') is not null
    and e.reviewed_at is not null
    and rs.canonical_concept_id <> rt.canonical_concept_id
)
insert into drx_identity.relationships_v1(
  source_concept_id,target_concept_id,relationship_type,reason,
  decided_by,reviewed_at,evidence_urls,source_ref,publication_eligible
)
select
  source_concept_id,target_concept_id,
  case
    when reason ilike '%kripa%' or reason ilike '%salt%' then 'BASE_SALT_EQUIVALENCE'
    when reason ilike '%hidrat%' or reason ilike '%hydrate%' then 'HYDRATE_EQUIVALENCE'
    when reason ilike '%ester%' then 'ESTER_EQUIVALENCE'
    else 'REVIEWED_EQUIVALENCE'
  end,
  reason,decided_by,reviewed_at,evidence_urls,
  'public.substance_equivalence_reviewed_v1',false
from src
on conflict (source_concept_id,target_concept_id,relationship_type,source_ref)
do update set
  reason=excluded.reason,
  decided_by=excluded.decided_by,
  reviewed_at=excluded.reviewed_at,
  evidence_urls=excluded.evidence_urls;

delete from drx_identity.combination_components_v1;

with combo_source as (
  select c.concept_id,c.canonical_name
  from drx_identity.canonical_concepts_v1 c
  where c.concept_kind='COMBINATION'
),
parts as (
  select
    c.concept_id combination_concept_id,
    p.ord::integer component_ordinal,
    btrim(p.part) source_component_text,
    public.medindex_normalize_substance_term_v1(btrim(p.part)) component_term_key
  from combo_source c
  cross join lateral regexp_split_to_table(c.canonical_name,E'\\s*[;+&]\\s*')
    with ordinality as p(part,ord)
),
resolved as (
  select
    p.*,
    r.canonical_concept_id,
    coalesce(r.candidate_count,0) candidate_count
  from parts p
  left join drx_identity.term_resolution_v1 r on r.term_key=p.component_term_key
)
insert into drx_identity.combination_components_v1(
  combination_concept_id,component_ordinal,source_component_text,component_term_key,
  component_concept_id,resolution_status,resolution_method
)
select
  combination_concept_id,component_ordinal,source_component_text,component_term_key,
  case when candidate_count=1 then canonical_concept_id else null end,
  case
    when candidate_count=1 then 'EXACT'
    when candidate_count=0 then 'UNRESOLVED'
    else 'AMBIGUOUS'
  end,
  'EXACT_TERM_ONLY'
from resolved;

delete from drx_identity.product_component_strength_v1;

with eligible as (
  select
    d.id source_drug_id,
    d.strength source_strength,
    r.resolved_component_count
  from public.drugs d
  join public.product_ingredient_resolution_v1 r on r.source_drug_id=d.id
  where r.resolution_status='RESOLVED_MULTI'
    and d.strength like '%+%'
),
strength_parts as (
  select
    e.source_drug_id,
    e.source_strength,
    p.ord::integer ingredient_ordinal,
    btrim(p.part) raw_component_strength,
    count(*) over(partition by e.source_drug_id) strength_part_count,
    e.resolved_component_count
  from eligible e
  cross join lateral regexp_split_to_table(e.source_strength,E'\\s*\\+\\s*')
    with ordinality as p(part,ord)
)
insert into drx_identity.product_component_strength_v1(
  source_drug_id,ingredient_ordinal,canonical_concept_id,source_term,
  raw_component_strength,parsed_component_strength,alignment_status,source_strength
)
select
  sp.source_drug_id,
  sp.ingredient_ordinal,
  pi.concept_id,
  pi.source_term,
  sp.raw_component_strength,
  drx_norm.parse_strength_v1(sp.raw_component_strength),
  'EXACT_PLUS_DELIMITER',
  sp.source_strength
from strength_parts sp
join public.product_ingredients_v1 pi
  on pi.source_drug_id=sp.source_drug_id
 and pi.ingredient_ordinal=sp.ingredient_ordinal
join drx_identity.canonical_concepts_v1 c on c.concept_id=pi.concept_id
where sp.strength_part_count=sp.resolved_component_count
  and sp.resolved_component_count=(
    select count(*) from public.product_ingredients_v1 x
    where x.source_drug_id=sp.source_drug_id
  );

create or replace view drx_identity.identity_review_queue_v1 as
select
  'DUPLICATE_PUBLIC_NORMALIZED_NAME'::text issue_type,
  null::uuid source_drug_id,
  null::uuid source_concept_id,
  lower(btrim(canonical_name)) issue_key,
  string_agg(canonical_key,', ' order by canonical_key) detail
from public.substance_concepts_v1
group by lower(btrim(canonical_name))
having count(*)>1

union all

select
  'ALIAS_TARGET_UNRESOLVED',
  null::uuid,
  null::uuid,
  a.variant_key,
  a.canonical_key
from public.substance_aliases a
where not exists (
  select 1 from public.substance_concepts_v1 c
  where c.canonical_key=a.canonical_key
)

union all

select
  'COMBINATION_COMPONENT_UNRESOLVED',
  null::uuid,
  cc.combination_concept_id,
  cc.component_term_key,
  cc.source_component_text
from drx_identity.combination_components_v1 cc
where cc.resolution_status<>'EXACT'

union all

select
  'PRODUCT_INGREDIENT_REVIEW',
  q.source_drug_id,
  null::uuid,
  coalesce(q.active_substance,''),
  array_to_string(q.reason_codes,',')
from public.medindex_product_ingredient_review_queue_v1 q

union all

select
  'COMPONENT_STRENGTH_ALIGNMENT_REVIEW',
  r.source_drug_id,
  null::uuid,
  coalesce(d.strength,''),
  coalesce(r.source_expression,'')
from public.product_ingredient_resolution_v1 r
join public.drugs d on d.id=r.source_drug_id
where r.resolution_status='RESOLVED_MULTI'
  and not exists (
    select 1 from drx_identity.product_component_strength_v1 pcs
    where pcs.source_drug_id=r.source_drug_id
  )

union all

select
  'EXPRESSION_REVIEW',
  null::uuid,
  m.canonical_concept_id,
  m.source_normalized_name,
  m.source_name
from drx_identity.source_concept_map_v1 m
where m.source_namespace='STAGE'
  and public.medindex_substance_component_signature(m.source_name) is null
  and m.source_name ~* '(/|\\band\\b|\\bdhe\\b)';

create or replace view drx_identity.source_key_collision_v1 as
select
  s.canonical_key,
  array_agg(distinct public.medindex_normalize_substance_term_v1(s.canonical_substance)
            order by public.medindex_normalize_substance_term_v1(s.canonical_substance)) exact_identity_keys,
  array_agg(distinct s.canonical_substance order by s.canonical_substance) source_names,
  count(distinct public.medindex_normalize_substance_term_v1(s.canonical_substance)) exact_identity_count
from drx_stage.substance_master_v1 s
group by s.canonical_key
having count(distinct public.medindex_normalize_substance_term_v1(s.canonical_substance))>1;

create or replace function public.drx_phase4_status_v1()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public,drx_identity,drx_stage
as $$
with recursive legacy_edges as (
  select variant_key src,canonical_key dst
  from public.substance_aliases
  where variant_key is not null and canonical_key is not null
),
walk as (
  select src,dst,array[src,dst]::text[] path,(src=dst) cycle
  from legacy_edges
  union all
  select w.src,e.dst,w.path||e.dst,e.dst=any(w.path)
  from walk w
  join legacy_edges e on e.src=w.dst
  where not w.cycle and cardinality(w.path)<25
),
metrics as (
  select
    (select count(*) from drx_stage.substance_master_v1) stage_sources,
    (select count(*) from drx_identity.source_concept_map_v1 where source_namespace='STAGE') stage_mapped,
    (select count(*) from public.substance_concepts_v1) public_sources,
    (select count(*) from drx_identity.source_concept_map_v1 where source_namespace='PUBLIC') public_mapped,
    (select count(*) from drx_identity.canonical_concepts_v1) canonical_concepts,
    (select count(*) from drx_identity.canonical_concepts_v1 where concept_kind='COMBINATION') combinations,
    (select count(*) from drx_identity.combination_components_v1) combination_components,
    (select count(*) from drx_identity.combination_components_v1 where resolution_status<>'EXACT') unresolved_combination_components,
    (select count(*) from drx_identity.product_component_strength_v1) exact_product_component_strengths,
    (select count(distinct source_drug_id) from drx_identity.product_component_strength_v1) exact_strength_products,
    (select count(*) from drx_identity.relationships_v1) reviewed_relationships,
    (select count(*) from drx_identity.relationships_v1 where relationship_type='BASE_SALT_EQUIVALENCE') base_salt_relationships,
    (select count(*) from drx_identity.source_key_collision_v1) source_key_collisions,
    (select count(*) from (select distinct src,path from walk where cycle) x) legacy_alias_cycles,
    (select count(*) from drx_identity.identity_review_queue_v1) review_queue_open
)
select jsonb_build_object(
  'stage_sources',m.stage_sources,
  'stage_mapped',m.stage_mapped,
  'public_sources',m.public_sources,
  'public_mapped',m.public_mapped,
  'canonical_concepts',m.canonical_concepts,
  'combination_concepts',m.combinations,
  'combination_components',m.combination_components,
  'unresolved_combination_components',m.unresolved_combination_components,
  'exact_product_component_strength_rows',m.exact_product_component_strengths,
  'exact_component_strength_products',m.exact_strength_products,
  'reviewed_relationships',m.reviewed_relationships,
  'base_salt_relationships',m.base_salt_relationships,
  'source_key_collisions',m.source_key_collisions,
  'legacy_alias_cycles',m.legacy_alias_cycles,
  'review_queue_open',m.review_queue_open,
  'base_equals_salt_auto_merge_enabled',false,
  'similarity_merge_enabled',false,
  'publication_allowed',false,
  'gate_pass',
    m.stage_sources=m.stage_mapped
    and m.public_sources=m.public_mapped
    and m.legacy_alias_cycles=0
)
from metrics m;
$$;

revoke all on all tables in schema drx_identity from public,anon,authenticated;
revoke all on all sequences in schema drx_identity from public,anon,authenticated;
revoke execute on all functions in schema drx_identity from public,anon,authenticated;
revoke all on schema drx_identity from public,anon,authenticated;

alter default privileges for role postgres in schema drx_identity
  revoke all on tables from public,anon,authenticated;
alter default privileges for role postgres in schema drx_identity
  revoke all on sequences from public,anon,authenticated;
alter default privileges for role postgres in schema drx_identity
  revoke execute on functions from public,anon,authenticated;

revoke all on function public.drx_phase4_status_v1() from public,anon,authenticated;
grant execute on function public.drx_phase4_status_v1() to service_role;

comment on schema drx_identity is
  'DRx Phase 4 private canonical substance/composition namespace. Exact identity only; no similarity merge.';
comment on table drx_identity.relationships_v1 is
  'Reviewed identity relationships; evidence and reviewer are mandatory. Never implies dose equivalence.';
comment on table drx_identity.product_component_strength_v1 is
  'Component strengths aligned only by explicit plus delimiter and exact component counts.';
