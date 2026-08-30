-- DRx Phase 6C: indication/safety evidence and strict clinical gate.
-- Source-exact regulatory wording is preserved. Semantic coding stays review-only.

create table if not exists drx_clinical.indication_source_claims_v1 (
  indication_claim_id uuid primary key,
  source_document_id uuid not null
    references drx_clinical.source_documents_v1(source_document_id) on delete cascade,
  candidate_concept_ids uuid[] not null default '{}'::uuid[],
  source_text text not null,
  source_section_sha256 text not null check (source_section_sha256 ~ '^[0-9a-f]{64}$'),
  canonical_name_sq text,
  icd10_codes text[] not null default '{}'::text[],
  population_key text,
  approval_status text not null check (approval_status='APPROVED_SOURCE_SECTION'),
  specialist_only boolean,
  semantic_status text not null check (semantic_status='REVIEW_REQUIRED'),
  publication_eligible boolean not null default false,
  check (canonical_name_sq is null),
  check (cardinality(icd10_codes)=0),
  check (publication_eligible=false)
);

delete from drx_clinical.indication_source_claims_v1;

insert into drx_clinical.indication_source_claims_v1(
  indication_claim_id,source_document_id,candidate_concept_ids,source_text,
  source_section_sha256,canonical_name_sq,icd10_codes,population_key,
  approval_status,specialist_only,semantic_status,publication_eligible
)
select
  extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'https://drx.local/indication-source-claim/' || d.snapshot_id
  ),
  d.source_document_id,
  c.candidate_concept_ids,
  e.section_text,
  e.section_sha256,
  null,
  '{}'::text[],
  null,
  'APPROVED_SOURCE_SECTION',
  null,
  'REVIEW_REQUIRED',
  false
from drx_clinical.source_documents_v1 d
join drx_clinical.source_section_evidence_v1 e
  on e.source_document_id=d.source_document_id
 and e.section_key='therapeutic_indications'
join drx_clinical.source_identity_candidates_v1 c
  on c.source_document_id=d.source_document_id;

create table if not exists drx_clinical.safety_source_claims_v1 (
  safety_claim_id uuid primary key,
  source_document_id uuid not null
    references drx_clinical.source_documents_v1(source_document_id) on delete cascade,
  candidate_concept_ids uuid[] not null default '{}'::uuid[],
  safety_category text not null check (safety_category in (
    'CONTRAINDICATIONS',
    'WARNINGS_PRECAUTIONS',
    'INTERACTIONS',
    'PREGNANCY_LACTATION',
    'UNDESIRABLE_EFFECTS',
    'OVERDOSE'
  )),
  source_section_key text not null,
  source_text text not null,
  source_section_sha256 text not null check (source_section_sha256 ~ '^[0-9a-f]{64}$'),
  structured_payload jsonb,
  semantic_status text not null check (semantic_status='REVIEW_REQUIRED'),
  high_risk_flag boolean,
  publication_eligible boolean not null default false,
  check (structured_payload is null),
  check (publication_eligible=false),
  unique(source_document_id,safety_category)
);

delete from drx_clinical.safety_source_claims_v1;

insert into drx_clinical.safety_source_claims_v1(
  safety_claim_id,source_document_id,candidate_concept_ids,safety_category,
  source_section_key,source_text,source_section_sha256,structured_payload,
  semantic_status,high_risk_flag,publication_eligible
)
select
  extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'https://drx.local/safety-source-claim/' || d.snapshot_id || '/' || e.section_key
  ),
  d.source_document_id,
  c.candidate_concept_ids,
  case e.section_key
    when 'contraindications' then 'CONTRAINDICATIONS'
    when 'special_warnings_and_precautions' then 'WARNINGS_PRECAUTIONS'
    when 'interactions' then 'INTERACTIONS'
    when 'fertility_pregnancy_lactation' then 'PREGNANCY_LACTATION'
    when 'undesirable_effects' then 'UNDESIRABLE_EFFECTS'
    when 'overdose' then 'OVERDOSE'
  end,
  e.section_key,
  e.section_text,
  e.section_sha256,
  null,
  'REVIEW_REQUIRED',
  null,
  false
from drx_clinical.source_documents_v1 d
join drx_clinical.source_section_evidence_v1 e
  on e.source_document_id=d.source_document_id
 and e.section_key in (
   'contraindications',
   'special_warnings_and_precautions',
   'interactions',
   'fertility_pregnancy_lactation',
   'undesirable_effects',
   'overdose'
 )
join drx_clinical.source_identity_candidates_v1 c
  on c.source_document_id=d.source_document_id;

create or replace view drx_clinical.legacy_safety_review_v1 as
select
  s.safety_key,
  s.product_key,
  s.active_substance,
  s.atc_code,
  s.route,
  s.indication_key,
  s.patient_group,
  s.severity,
  s.condition_key,
  s.prompt_label,
  s.short_message,
  s.action_message,
  s.source_key,
  s.source_section,
  s.editorial_status,
  s.verified_by,
  s.verified_at,
  v.source_url,
  v.official_source,
  case
    when v.source_key is not null
     and v.official_source=true
     and s.editorial_status='published'
     and s.verified_at is not null
      then 'ELIGIBLE_FOR_MIGRATION'
    else 'REVIEW_REQUIRED'
  end migration_status
from public.dose_safety_v2 s
left join public.dose_sources_v2 v on v.source_key=s.source_key;

create or replace view drx_clinical.source_evidence_integrity_v1 as
select
  d.source_document_id,
  d.source_key,
  d.snapshot_id,
  (d.raw_sha256=s.raw_sha256) raw_hash_matches,
  (d.section_2_sha256=s2.section_sha256) section_2_hash_matches,
  (d.section_4_1_sha256=s41.section_sha256) section_4_1_hash_matches,
  (d.section_4_2_sha256=s42.section_sha256) section_4_2_hash_matches,
  (d.section_4_3_sha256 is null or d.section_4_3_sha256=s43.section_sha256) section_4_3_hash_matches,
  (d.section_4_4_sha256 is null or d.section_4_4_sha256=s44.section_sha256) section_4_4_hash_matches,
  (d.section_4_5_sha256 is null or d.section_4_5_sha256=s45.section_sha256) section_4_5_hash_matches,
  (d.section_4_6_sha256 is null or d.section_4_6_sha256=s46.section_sha256) section_4_6_hash_matches
from drx_clinical.source_documents_v1 d
join public.dose_source_snapshots_v3 s on s.snapshot_id=d.snapshot_id
join public.dose_source_sections_v3 s2
  on s2.snapshot_id=d.snapshot_id
 and s2.section_key='qualitative_and_quantitative_composition'
join public.dose_source_sections_v3 s41
  on s41.snapshot_id=d.snapshot_id
 and s41.section_key='therapeutic_indications'
join public.dose_source_sections_v3 s42
  on s42.snapshot_id=d.snapshot_id
 and s42.section_key='posology_and_method_of_administration'
left join public.dose_source_sections_v3 s43
  on s43.snapshot_id=d.snapshot_id and s43.section_key='contraindications'
left join public.dose_source_sections_v3 s44
  on s44.snapshot_id=d.snapshot_id and s44.section_key='special_warnings_and_precautions'
left join public.dose_source_sections_v3 s45
  on s45.snapshot_id=d.snapshot_id and s45.section_key='interactions'
left join public.dose_source_sections_v3 s46
  on s46.snapshot_id=d.snapshot_id and s46.section_key='fertility_pregnancy_lactation';

create or replace view drx_clinical.clinical_review_queue_v1 as
select
  'SOURCE_IDENTITY_REVIEW'::text issue_type,
  d.source_document_id entity_id,
  d.source_key issue_key,
  c.resolution_status detail
from drx_clinical.source_documents_v1 d
join drx_clinical.source_identity_candidates_v1 c
  on c.source_document_id=d.source_document_id
where c.resolution_status<>'UNIQUE_CANDIDATE'

union all

select
  'VARIANT_ATC_CONFLICT',
  v.clinical_variant_id,
  v.clinical_variant_id::text,
  array_to_string(v.atc_codes,',')
from drx_clinical.variant_classification_v1 v
where v.atc_status='CONFLICT'

union all

select
  'VARIANT_CLASS_CONFLICT',
  v.clinical_variant_id,
  v.clinical_variant_id::text,
  array_to_string(v.source_class_values,' | ')
from drx_clinical.variant_classification_v1 v
where v.class_status='CONFLICT'

union all

select
  'INDICATION_SEMANTIC_REVIEW',
  i.indication_claim_id,
  d.source_key,
  'Albanian canonical indication / ICD-10 / population / specialist-only not inferred'
from drx_clinical.indication_source_claims_v1 i
join drx_clinical.source_documents_v1 d on d.source_document_id=i.source_document_id

union all

select
  'SAFETY_SEMANTIC_REVIEW',
  s.safety_claim_id,
  d.source_key || ':' || s.source_section_key,
  'Source-exact safety section requires structured clinical review'
from drx_clinical.safety_source_claims_v1 s
join drx_clinical.source_documents_v1 d on d.source_document_id=s.source_document_id

union all

select
  'LEGACY_SAFETY_REVIEW',
  extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'https://drx.local/legacy-safety-review/' || l.safety_key
  ),
  l.safety_key,
  l.migration_status
from drx_clinical.legacy_safety_review_v1 l
where l.migration_status<>'ELIGIBLE_FOR_MIGRATION';

create or replace function public.drx_phase6_status_v1()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public,drx_clinical,drx_variant,drx_raw
as $$
with metrics as (
  select
    (select count(distinct source_key) from public.dose_source_snapshots_v3) source_keys,
    (select count(*) from drx_clinical.source_documents_v1) source_documents,
    (select count(*) from drx_clinical.source_documents_v1
      where evidence_status='CORE_AND_SAFETY_COMPLETE') full_safety_documents,
    (select count(*) from drx_clinical.source_section_evidence_v1) current_section_evidence,
    (select count(*) from drx_clinical.indication_source_claims_v1) indication_source_claims,
    (select count(*) from drx_clinical.safety_source_claims_v1) safety_source_claims,
    (select count(*) from drx_clinical.source_identity_candidates_v1
      where resolution_status='UNIQUE_CANDIDATE') unique_source_identity_candidates,
    (select count(*) from drx_clinical.source_identity_candidates_v1
      where resolution_status='MULTIPLE_CANDIDATES') ambiguous_source_identity_candidates,

    (select count(*) from drx_variant.market_products_v1) market_products,
    (select count(*) from drx_clinical.market_product_classification_v1) classified_market_products,
    (select count(*) from drx_variant.clinical_variants_v1) variants,
    (select count(*) from drx_clinical.variant_classification_v1) classified_variants,
    (select count(*) from drx_clinical.variant_classification_v1
      where atc_status='EXACT') exact_atc_variants,
    (select count(*) from drx_clinical.variant_classification_v1
      where atc_status='CONFLICT') atc_conflict_variants,

    (select count(*) from drx_clinical.source_evidence_integrity_v1
      where not (
        raw_hash_matches
        and section_2_hash_matches
        and section_4_1_hash_matches
        and section_4_2_hash_matches
        and section_4_3_hash_matches
        and section_4_4_hash_matches
        and section_4_5_hash_matches
        and section_4_6_hash_matches
      )) evidence_hash_mismatches,

    (select count(*)
     from drx_clinical.source_documents_v1 d
     join drx_clinical.source_authority_policy_v1 p using(authority_key)
     where d.authority_rank<>p.priority_rank) source_policy_rank_mismatches,

    (select count(*) from drx_clinical.indication_source_claims_v1
      where canonical_name_sq is not null or cardinality(icd10_codes)>0) inferred_indication_semantics,

    (select count(*) from drx_clinical.safety_source_claims_v1
      where structured_payload is not null or high_risk_flag is not null) inferred_safety_semantics,

    (select count(*) from drx_clinical.clinical_review_queue_v1) review_queue_open,

    (select count(*) from drx_raw.registry_reconstruction_diff_v1 where differs) reconstruction_true_diffs,
    (select count(*) from drx_raw.registry_generated_projection_diff_v1
      where active_substance_key_differs
         or global_search_text_differs
         or registry_search_text_differs) generated_true_diffs
)
select jsonb_build_object(
  'source_keys',m.source_keys,
  'current_source_documents',m.source_documents,
  'full_safety_documents',m.full_safety_documents,
  'current_section_evidence',m.current_section_evidence,
  'indication_source_claims',m.indication_source_claims,
  'safety_source_claims',m.safety_source_claims,
  'unique_source_identity_candidates',m.unique_source_identity_candidates,
  'ambiguous_source_identity_candidates',m.ambiguous_source_identity_candidates,
  'market_products',m.market_products,
  'classified_market_products',m.classified_market_products,
  'clinical_variants',m.variants,
  'classified_variants',m.classified_variants,
  'exact_atc_variants',m.exact_atc_variants,
  'atc_conflict_variants',m.atc_conflict_variants,
  'evidence_hash_mismatches',m.evidence_hash_mismatches,
  'source_policy_rank_mismatches',m.source_policy_rank_mismatches,
  'inferred_indication_semantics',m.inferred_indication_semantics,
  'inferred_safety_semantics',m.inferred_safety_semantics,
  'review_queue_open',m.review_queue_open,
  'reconstruction_true_diffs',m.reconstruction_true_diffs,
  'generated_true_diffs',m.generated_true_diffs,
  'variant_source_binding_inferred',false,
  'icd10_inferred_from_free_text',false,
  'safety_semantics_inferred_from_free_text',false,
  'publication_allowed',false,
  'gate_pass',
    m.source_documents=m.source_keys
    and m.full_safety_documents=m.source_keys
    and m.indication_source_claims=m.source_keys
    and m.classified_market_products=m.market_products
    and m.classified_variants=m.variants
    and m.evidence_hash_mismatches=0
    and m.source_policy_rank_mismatches=0
    and m.inferred_indication_semantics=0
    and m.inferred_safety_semantics=0
    and m.reconstruction_true_diffs=0
    and m.generated_true_diffs=0
)
from metrics m;
$$;

revoke all on all tables in schema drx_clinical from public,anon,authenticated;
revoke all on all sequences in schema drx_clinical from public,anon,authenticated;
revoke execute on all functions in schema drx_clinical from public,anon,authenticated;
revoke all on schema drx_clinical from public,anon,authenticated;

revoke all on function public.drx_phase6_status_v1() from public,anon,authenticated;
grant execute on function public.drx_phase6_status_v1() to service_role;

comment on schema drx_clinical is
  'DRx Phase 6 private classification/provenance/indication/safety evidence layer.';
comment on table drx_clinical.indication_source_claims_v1 is
  'Exact SmPC section 4.1 evidence. No ICD or Albanian semantic mapping is inferred.';
comment on table drx_clinical.safety_source_claims_v1 is
  'Exact regulatory safety-section evidence. Semantic structuring requires explicit clinical review.';
