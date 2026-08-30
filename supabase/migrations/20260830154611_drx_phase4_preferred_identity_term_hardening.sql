-- DRx Phase 4 hardening: identity terms are preferred canonical terms only.
-- Search aliases never merge identities. Strict gate requires zero unresolved combination components.

-- Remove only derived Phase 4 data that can contain alias-based identity mapping.
delete from drx_identity.relationships_v1;
delete from drx_identity.combination_components_v1;
delete from drx_identity.canonical_terms_v1
where source_ref='drx_stage.substance_master_v1';
delete from drx_identity.source_concept_map_v1
where source_namespace='STAGE';
delete from drx_identity.canonical_concepts_v1
where source_namespace='STAGE';

create or replace view drx_identity.public_identity_term_resolver_v1 as
select
  t.term_key,
  min(t.concept_id::text)::uuid as concept_id,
  count(distinct t.concept_id) as candidate_count
from public.substance_terms_v1 t
where t.term_type='CANONICAL'
  and t.is_preferred=true
group by t.term_key;

-- Rebuild stage mapping using preferred canonical terms only.
with stage_norm as (
  select
    s.*,
    public.medindex_normalize_substance_term_v1(s.canonical_substance) exact_term_key
  from drx_stage.substance_master_v1 s
),
resolved as (
  select s.*,r.concept_id
  from stage_norm s
  join drx_identity.public_identity_term_resolver_v1 r
    on r.term_key=s.exact_term_key and r.candidate_count=1
)
insert into drx_identity.source_concept_map_v1(
  source_namespace,source_concept_id,canonical_concept_id,source_key,source_name,
  source_normalized_name,resolution_method,resolution_status,evidence_note
)
select
  'STAGE',substance_concept_id,concept_id,canonical_key,canonical_substance,
  exact_term_key,'EXACT_PREFERRED_PUBLIC_TERM','EXACT',
  'Only preferred CANONICAL public terms may merge stage identity to public UUID'
from resolved;

-- Every unmatched stage expression gets its own identity grouped only by exact normalized source name.
with stage_norm as (
  select
    s.*,
    public.medindex_normalize_substance_term_v1(s.canonical_substance) exact_term_key
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
  'STAGE',null,'STAGE_EXACT',false
from grouped
on conflict (concept_id) do nothing;

with stage_norm as (
  select
    s.*,
    public.medindex_normalize_substance_term_v1(s.canonical_substance) exact_term_key
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
  select normalized_name,(array_agg(concept_id order by concept_id::text))[1] concept_id
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
join canonical_by_term c on c.normalized_name=s.exact_term_key;

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

-- Identity resolution intentionally excludes ALIAS terms.
create or replace view drx_identity.identity_term_resolution_v1 as
select
  term_key,
  min(canonical_concept_id::text)::uuid canonical_concept_id,
  count(distinct canonical_concept_id) candidate_count
from drx_identity.canonical_terms_v1
where term_type in ('CANONICAL','SOURCE_TERM')
  and (
    term_type='SOURCE_TERM'
    or is_preferred=true
  )
group by term_key;

-- A generic key resolver is accepted only if all exact-key sources agree on one UUID.
create or replace view drx_identity.identity_key_resolution_v1 as
with candidates as (
  select term_key resolution_key,canonical_concept_id
  from drx_identity.identity_term_resolution_v1
  where candidate_count=1

  union all

  select source_key,
         min(canonical_concept_id::text)::uuid
  from drx_identity.source_concept_map_v1
  where source_namespace='STAGE' and source_key is not null
  group by source_key
  having count(distinct canonical_concept_id)=1

  union all

  select canonical_key,concept_id
  from public.substance_concepts_v1
)
select
  resolution_key,
  min(canonical_concept_id::text)::uuid canonical_concept_id,
  count(distinct canonical_concept_id) candidate_count
from candidates
where resolution_key is not null
group by resolution_key;

-- Import reviewed equivalence only when source and target exact-key resolvers each agree on one distinct UUID.
insert into drx_identity.relationships_v1(
  source_concept_id,target_concept_id,relationship_type,reason,
  decided_by,reviewed_at,evidence_urls,source_ref,publication_eligible
)
select
  rs.canonical_concept_id,
  rt.canonical_concept_id,
  case
    when e.reason ilike '%kripa%' or e.reason ilike '%salt%' then 'BASE_SALT_EQUIVALENCE'
    when e.reason ilike '%hidrat%' or e.reason ilike '%hydrate%' then 'HYDRATE_EQUIVALENCE'
    when e.reason ilike '%ester%' then 'ESTER_EQUIVALENCE'
    else 'REVIEWED_EQUIVALENCE'
  end,
  e.reason,e.decided_by,e.reviewed_at,e.evidence_urls,
  'public.substance_equivalence_reviewed_v1',false
from public.substance_equivalence_reviewed_v1 e
join drx_identity.identity_key_resolution_v1 rs
  on rs.resolution_key=e.source_key and rs.candidate_count=1
join drx_identity.identity_key_resolution_v1 rt
  on rt.resolution_key=e.canonical_key and rt.candidate_count=1
where coalesce(cardinality(e.evidence_urls),0)>0
  and nullif(btrim(e.decided_by),'') is not null
  and e.reviewed_at is not null
  and rs.canonical_concept_id<>rt.canonical_concept_id
on conflict (source_concept_id,target_concept_id,relationship_type,source_ref)
do update set
  reason=excluded.reason,
  decided_by=excluded.decided_by,
  reviewed_at=excluded.reviewed_at,
  evidence_urls=excluded.evidence_urls;

-- Rebuild combination components with identity terms only.
with combo_source as (
  select concept_id,canonical_name
  from drx_identity.canonical_concepts_v1
  where concept_kind='COMBINATION'
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
  select p.*,r.canonical_concept_id,coalesce(r.candidate_count,0) candidate_count
  from parts p
  left join drx_identity.identity_term_resolution_v1 r on r.term_key=p.component_term_key
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
  'IDENTITY_TERM_EXACT_ONLY'
from resolved;

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
  and m.source_name ~* '(/|\\band\\b|\\bdhe\\b)'

union all

select
  'EQUIVALENCE_RELATIONSHIP_UNRESOLVED',
  null::uuid,
  null::uuid,
  e.source_key,
  e.canonical_key || ' :: ' || e.reason
from public.substance_equivalence_reviewed_v1 e
where not exists (
  select 1
  from drx_identity.relationships_v1 r
  where r.source_ref='public.substance_equivalence_reviewed_v1'
    and r.reason=e.reason
    and r.decided_by=e.decided_by
    and r.reviewed_at=e.reviewed_at
);

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
  from walk w join legacy_edges e on e.src=w.dst
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
    (select count(*) from drx_identity.relationships_v1
      where nullif(btrim(decided_by),'') is null or reviewed_at is null
         or coalesce(cardinality(evidence_urls),0)=0) relationship_evidence_violations,
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
  'relationship_evidence_violations',m.relationship_evidence_violations,
  'review_queue_open',m.review_queue_open,
  'base_equals_salt_auto_merge_enabled',false,
  'search_alias_merges_identity',false,
  'similarity_merge_enabled',false,
  'publication_allowed',false,
  'gate_pass',
    m.stage_sources=m.stage_mapped
    and m.public_sources=m.public_mapped
    and m.legacy_alias_cycles=0
    and m.relationship_evidence_violations=0
    and m.unresolved_combination_components=0
)
from metrics m;
$$;

revoke all on all tables in schema drx_identity from public,anon,authenticated;
revoke execute on all functions in schema drx_identity from public,anon,authenticated;
revoke all on schema drx_identity from public,anon,authenticated;
revoke all on function public.drx_phase4_status_v1() from public,anon,authenticated;
grant execute on function public.drx_phase4_status_v1() to service_role;

comment on view drx_identity.identity_term_resolution_v1 is
  'Identity resolver: preferred canonical and exact stage source terms only. Search aliases cannot merge identities.';
