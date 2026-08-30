-- DRx Phase 6D hardening: boundary-aware source identity candidate matching.
-- Prevents substring false positives such as "ofloxacin" inside "ciprofloxacin",
-- "salicylic acid" inside "acetylsalicylic acid", and language-stem prefixes.

delete from drx_clinical.source_identity_candidates_v1;

with comp as (
  select d.source_document_id,e.section_text
  from drx_clinical.source_documents_v1 d
  join drx_clinical.source_section_evidence_v1 e
    on e.source_document_id=d.source_document_id
   and e.section_key='qualitative_and_quantitative_composition'
),
preferred as (
  select
    t.concept_id,
    t.term,
    regexp_replace(
      lower(btrim(t.term)),
      '([\\.^$|()\[\]{}*+?])',
      '\\\1',
      'g'
    ) escaped_term
  from public.substance_terms_v1 t
  where t.term_type='CANONICAL'
    and t.is_preferred=true
    and length(btrim(t.term))>=5
),
matches as (
  select c.source_document_id,p.concept_id,p.term
  from comp c
  join preferred p
    on lower(c.section_text) ~ (
      '(^|[^[:alnum:]])' || p.escaped_term || '([^[:alnum:]]|$)'
    )
),
agg as (
  select
    c.source_document_id,
    coalesce(
      array_agg(distinct m.concept_id order by m.concept_id)
        filter(where m.concept_id is not null),
      '{}'::uuid[]
    ) ids,
    coalesce(
      array_agg(distinct m.term order by m.term)
        filter(where m.term is not null),
      '{}'::text[]
    ) terms,
    count(distinct m.concept_id) candidate_count
  from comp c
  left join matches m on m.source_document_id=c.source_document_id
  group by c.source_document_id
)
insert into drx_clinical.source_identity_candidates_v1(
  source_document_id,candidate_concept_ids,candidate_terms,candidate_count,
  resolution_status,resolution_method,variant_binding_allowed
)
select
  source_document_id,
  ids,
  terms,
  candidate_count,
  case
    when candidate_count=1 then 'UNIQUE_CANDIDATE'
    when candidate_count>1 then 'MULTIPLE_CANDIDATES'
    else 'NO_CANDIDATE'
  end,
  'SECTION2_BOUNDARY_AWARE_PREFERRED_CANONICAL_TERM_MATCH',
  false
from agg;

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

comment on table drx_clinical.source_identity_candidates_v1 is
  'Source §2 identity candidates using lexical boundaries; candidates never imply a verified source-to-variant binding.';
