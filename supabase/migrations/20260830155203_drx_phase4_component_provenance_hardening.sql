-- DRx Phase 4 provenance clarity: source-literal component identities stay visibly review-only.

create or replace view drx_identity.component_resolution_v1 as
with identity_exact as (
  select
    r.term_key component_term_key,
    r.canonical_concept_id,
    'IDENTITY_TERM_EXACT'::text resolution_method,
    1 priority
  from drx_identity.identity_term_resolution_v1 r
  join drx_identity.canonical_concepts_v1 c
    on c.concept_id=r.canonical_concept_id
  where r.candidate_count=1
    and c.identity_status<>'REVIEW'
),
alias_exact as (
  select
    component_term_key,
    canonical_concept_id,
    'EVIDENCED_ALIAS'::text resolution_method,
    2 priority
  from drx_identity.component_alias_evidence_v1
),
source_literal as (
  select
    normalized_name component_term_key,
    concept_id canonical_concept_id,
    'SOURCE_LITERAL_IDENTITY'::text resolution_method,
    3 priority
  from drx_identity.canonical_concepts_v1
  where source_namespace='STAGE'
    and identity_status='REVIEW'
),
all_candidates as (
  select * from identity_exact
  union all
  select * from alias_exact
  union all
  select * from source_literal
),
ranked as (
  select *,
         row_number() over(partition by component_term_key order by priority) rn,
         count(*) over(partition by component_term_key,priority) same_priority_count
  from all_candidates
)
select
  component_term_key,
  canonical_concept_id,
  resolution_method
from ranked
where rn=1 and same_priority_count=1;

delete from drx_identity.combination_components_v1;

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
  select p.*,r.canonical_concept_id,r.resolution_method
  from parts p
  left join drx_identity.component_resolution_v1 r
    on r.component_term_key=p.component_term_key
)
insert into drx_identity.combination_components_v1(
  combination_concept_id,component_ordinal,source_component_text,component_term_key,
  component_concept_id,resolution_status,resolution_method
)
select
  combination_concept_id,
  component_ordinal,
  source_component_text,
  component_term_key,
  canonical_concept_id,
  case when canonical_concept_id is not null then 'EXACT' else 'UNRESOLVED' end,
  coalesce(resolution_method,'NO_EXACT_COMPONENT_IDENTITY')
from resolved;

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
    (select count(*) from drx_identity.combination_components_v1 where resolution_method='EVIDENCED_ALIAS') evidenced_alias_components,
    (select count(*) from drx_identity.combination_components_v1 where resolution_method='SOURCE_LITERAL_IDENTITY') source_literal_components,
    (select count(distinct component_concept_id) from drx_identity.combination_components_v1
      where resolution_method='SOURCE_LITERAL_IDENTITY') source_literal_concepts,
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
  'evidenced_alias_components',m.evidenced_alias_components,
  'source_literal_component_rows',m.source_literal_components,
  'source_literal_concepts',m.source_literal_concepts,
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
  'source_literal_identity_claims_equivalence',false,
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
