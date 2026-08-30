-- DRx Phase 4 closure: evidence-backed component aliases + source-literal component identities.
-- This closes structural composition without claiming unreviewed chemical equivalence.

create table if not exists drx_identity.component_alias_evidence_v1 (
  component_term_key text primary key,
  canonical_concept_id uuid not null
    references drx_identity.canonical_concepts_v1(concept_id) on delete restrict,
  canonical_key text not null,
  reason text not null,
  decided_by text not null,
  reviewed_at timestamptz not null,
  review_method text not null,
  confidence numeric not null check (confidence >= 0.999 and confidence <= 1),
  evidence_urls text[] not null,
  source_ref text not null default 'public.substance_aliases',
  created_at timestamptz not null default now(),
  check (cardinality(evidence_urls)>0)
);

insert into drx_identity.component_alias_evidence_v1(
  component_term_key,canonical_concept_id,canonical_key,reason,decided_by,
  reviewed_at,review_method,confidence,evidence_urls,source_ref
)
select
  a.variant_key,
  c.concept_id,
  a.canonical_key,
  a.reason,
  a.decided_by,
  a.reviewed_at,
  a.review_method,
  a.confidence,
  a.evidence_urls,
  'public.substance_aliases'
from public.substance_aliases a
join public.substance_concepts_v1 c on c.canonical_key=a.canonical_key
where coalesce(cardinality(a.evidence_urls),0)>0
  and a.confidence>=0.999
  and nullif(btrim(a.decided_by),'') is not null
  and a.reviewed_at is not null
on conflict (component_term_key) do update set
  canonical_concept_id=excluded.canonical_concept_id,
  canonical_key=excluded.canonical_key,
  reason=excluded.reason,
  decided_by=excluded.decided_by,
  reviewed_at=excluded.reviewed_at,
  review_method=excluded.review_method,
  confidence=excluded.confidence,
  evidence_urls=excluded.evidence_urls,
  source_ref=excluded.source_ref;

-- Create a deterministic source-literal identity only when no canonical identity term
-- and no evidence-backed component alias exists. This is NOT a chemical merge.
with unresolved_terms as (
  select
    cc.component_term_key,
    min(cc.source_component_text) canonical_name
  from drx_identity.combination_components_v1 cc
  left join drx_identity.identity_term_resolution_v1 ir
    on ir.term_key=cc.component_term_key and ir.candidate_count=1
  left join drx_identity.component_alias_evidence_v1 ae
    on ae.component_term_key=cc.component_term_key
  where cc.resolution_status='UNRESOLVED'
    and ir.canonical_concept_id is null
    and ae.canonical_concept_id is null
  group by cc.component_term_key
),
generated as (
  select
    component_term_key,
    canonical_name,
    extensions.uuid_generate_v5(
      extensions.uuid_ns_url(),
      'https://drx.local/component/source-literal/' || component_term_key
    ) concept_id
  from unresolved_terms
)
insert into drx_identity.canonical_concepts_v1(
  concept_id,canonical_name,normalized_name,concept_kind,source_namespace,
  public_concept_id,identity_status,publication_eligible
)
select
  concept_id,
  canonical_name,
  component_term_key,
  'INGREDIENT',
  'STAGE',
  null,
  'REVIEW',
  false
from generated
on conflict (concept_id) do update set
  canonical_name=excluded.canonical_name,
  normalized_name=excluded.normalized_name,
  identity_status='REVIEW',
  publication_eligible=false;

insert into drx_identity.canonical_terms_v1(
  term_key,canonical_concept_id,term,term_type,is_preferred,
  review_status,evidence_urls,source_ref
)
select
  c.normalized_name,
  c.concept_id,
  c.canonical_name,
  'SOURCE_TERM',
  false,
  'REVIEW',
  '{}'::text[],
  'drx_identity.source_literal_component'
from drx_identity.canonical_concepts_v1 c
where c.source_namespace='STAGE'
  and c.identity_status='REVIEW'
  and exists (
    select 1
    from drx_identity.combination_components_v1 cc
    where cc.component_term_key=c.normalized_name
  )
on conflict (term_key,canonical_concept_id) do update set
  term=excluded.term,
  term_type=excluded.term_type,
  is_preferred=excluded.is_preferred,
  review_status=excluded.review_status,
  source_ref=excluded.source_ref;

create or replace view drx_identity.component_resolution_v1 as
with identity_exact as (
  select
    term_key component_term_key,
    canonical_concept_id,
    'IDENTITY_TERM_EXACT'::text resolution_method,
    1 priority
  from drx_identity.identity_term_resolution_v1
  where candidate_count=1
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

-- Rebuild components using the dedicated resolution hierarchy.
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
  'SOURCE_COMPONENT_IDENTITY_REVIEW',
  null::uuid,
  c.concept_id,
  c.normalized_name,
  c.canonical_name
from drx_identity.canonical_concepts_v1 c
where c.source_namespace='STAGE'
  and c.identity_status='REVIEW'
  and exists (
    select 1
    from drx_identity.combination_components_v1 cc
    where cc.component_concept_id=c.concept_id
      and cc.resolution_method='SOURCE_LITERAL_IDENTITY'
  )

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
    (select count(*) from drx_identity.combination_components_v1 where resolution_method='EVIDENCED_ALIAS') evidenced_alias_components,
    (select count(*) from drx_identity.combination_components_v1 where resolution_method='SOURCE_LITERAL_IDENTITY') source_literal_components,
    (select count(*) from drx_identity.canonical_concepts_v1
      where source_namespace='STAGE' and identity_status='REVIEW') source_literal_concepts,
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
revoke all on all sequences in schema drx_identity from public,anon,authenticated;
revoke execute on all functions in schema drx_identity from public,anon,authenticated;
revoke all on schema drx_identity from public,anon,authenticated;
revoke all on function public.drx_phase4_status_v1() from public,anon,authenticated;
grant execute on function public.drx_phase4_status_v1() to service_role;

comment on table drx_identity.component_alias_evidence_v1 is
  'Evidence-backed component aliases only. Used for component resolution, not global identity merge.';
comment on view drx_identity.component_resolution_v1 is
  'Priority: preferred/exact identity term, evidence-backed component alias, source-literal identity.';
