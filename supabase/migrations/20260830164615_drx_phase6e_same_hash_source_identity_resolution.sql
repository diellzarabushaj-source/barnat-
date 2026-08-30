-- DRx Phase 6E: resolve remaining source identity candidates using historical metadata
-- only when the current §4.2 hash is byte-identical to a prior snapshot and the prior
-- canonicalKey resolves to exactly one current candidate concept.
-- This is provenance continuity, not fuzzy identity inference.

create table if not exists drx_clinical.source_identity_resolution_evidence_v1 (
  source_document_id uuid primary key
    references drx_clinical.source_documents_v1(source_document_id) on delete cascade,
  current_snapshot_id text not null,
  current_section_4_2_sha256 text not null check (current_section_4_2_sha256 ~ '^[0-9a-f]{64}$'),
  prior_snapshot_id text not null,
  prior_section_4_2_sha256 text not null check (prior_section_4_2_sha256 ~ '^[0-9a-f]{64}$'),
  prior_canonical_key text not null,
  prior_canonical_name text,
  resolved_concept_id uuid not null
    references public.substance_concepts_v1(concept_id) on delete restrict,
  resolution_method text not null check (
    resolution_method='SAME_SECTION42_HASH_PRIOR_CANONICAL_KEY'
  ),
  publication_eligible boolean not null default false,
  created_at timestamptz not null default now(),
  check (current_section_4_2_sha256=prior_section_4_2_sha256),
  check (publication_eligible=false)
);

with prior_meta as (
  select distinct on (s.source_key)
    s.source_key,
    s.snapshot_id prior_snapshot_id,
    sec.section_sha256 prior_section_4_2_sha256,
    sec.extracted_json->>'canonicalKey' canonical_key,
    sec.extracted_json->>'canonicalName' canonical_name,
    s.created_at
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_key='posology_and_method_of_administration'
  where nullif(sec.extracted_json->>'canonicalKey','') is not null
  order by s.source_key,s.created_at desc
),
eligible as (
  select
    d.source_document_id,
    d.snapshot_id current_snapshot_id,
    d.section_4_2_sha256 current_section_4_2_sha256,
    p.prior_snapshot_id,
    p.prior_section_4_2_sha256,
    p.canonical_key,
    p.canonical_name,
    pc.concept_id resolved_concept_id,
    c.candidate_concept_ids
  from drx_clinical.source_documents_v1 d
  join drx_clinical.source_identity_candidates_v1 c using(source_document_id)
  join prior_meta p
    on p.source_key=d.source_key
   and p.prior_snapshot_id<>d.snapshot_id
   and p.prior_section_4_2_sha256=d.section_4_2_sha256
  join public.substance_concepts_v1 pc
    on pc.canonical_key=p.canonical_key
  where c.resolution_status='MULTIPLE_CANDIDATES'
    and pc.concept_id=any(c.candidate_concept_ids)
)
insert into drx_clinical.source_identity_resolution_evidence_v1(
  source_document_id,current_snapshot_id,current_section_4_2_sha256,
  prior_snapshot_id,prior_section_4_2_sha256,prior_canonical_key,prior_canonical_name,
  resolved_concept_id,resolution_method,publication_eligible
)
select
  source_document_id,current_snapshot_id,current_section_4_2_sha256,
  prior_snapshot_id,prior_section_4_2_sha256,canonical_key,canonical_name,
  resolved_concept_id,'SAME_SECTION42_HASH_PRIOR_CANONICAL_KEY',false
from eligible
on conflict (source_document_id) do update set
  current_snapshot_id=excluded.current_snapshot_id,
  current_section_4_2_sha256=excluded.current_section_4_2_sha256,
  prior_snapshot_id=excluded.prior_snapshot_id,
  prior_section_4_2_sha256=excluded.prior_section_4_2_sha256,
  prior_canonical_key=excluded.prior_canonical_key,
  prior_canonical_name=excluded.prior_canonical_name,
  resolved_concept_id=excluded.resolved_concept_id,
  resolution_method=excluded.resolution_method,
  publication_eligible=false;

update drx_clinical.source_identity_candidates_v1 c
set
  candidate_concept_ids=array[e.resolved_concept_id]::uuid[],
  candidate_terms=array[
    coalesce(
      (select sc.canonical_name from public.substance_concepts_v1 sc where sc.concept_id=e.resolved_concept_id),
      e.prior_canonical_name,
      e.prior_canonical_key
    )
  ]::text[],
  candidate_count=1,
  resolution_status='UNIQUE_CANDIDATE',
  resolution_method='SAME_SECTION42_HASH_PRIOR_CANONICAL_KEY',
  variant_binding_allowed=false
from drx_clinical.source_identity_resolution_evidence_v1 e
where e.source_document_id=c.source_document_id
  and c.resolution_status='MULTIPLE_CANDIDATES';

update drx_clinical.indication_source_claims_v1 i
set candidate_concept_ids=c.candidate_concept_ids
from drx_clinical.source_identity_candidates_v1 c
where c.source_document_id=i.source_document_id;

update drx_clinical.safety_source_claims_v1 s
set candidate_concept_ids=c.candidate_concept_ids
from drx_clinical.source_identity_candidates_v1 c
where c.source_document_id=s.source_document_id;

update drx_dose.source_posology_claims_v1 p
set candidate_concept_ids=c.candidate_concept_ids
from drx_clinical.source_identity_candidates_v1 c
where c.source_document_id=p.source_document_id;

revoke all on drx_clinical.source_identity_resolution_evidence_v1 from public,anon,authenticated;

comment on table drx_clinical.source_identity_resolution_evidence_v1 is
  'Resolves a source identity only when current §4.2 is byte-identical to a prior snapshot carrying a unique canonicalKey candidate. Never merges base/salt by similarity.';
