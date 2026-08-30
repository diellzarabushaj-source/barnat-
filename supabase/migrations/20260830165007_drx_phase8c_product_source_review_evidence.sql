-- DRx Phase 8C: refresh review-only product/source candidates and compute
-- source-exact presentation evidence. No automatic verification is allowed.

with unique_sources as (
  select
    d.source_document_id,
    c.candidate_concept_ids[1] public_concept_id
  from drx_clinical.source_documents_v1 d
  join drx_clinical.source_identity_candidates_v1 c using(source_document_id)
  where c.resolution_status='UNIQUE_CANDIDATE'
),
product_concepts as (
  select
    m.product_id drug_id,
    m.clinical_variant_id,
    c.public_concept_id
  from drx_variant.market_products_v1 m
  join drx_stage.product_registry_v1 p on p.drug_id=m.product_id
  join drx_identity.source_concept_map_v1 sm
    on sm.source_namespace='STAGE'
   and sm.source_concept_id=p.substance_concept_id
  join drx_identity.canonical_concepts_v1 c
    on c.concept_id=sm.canonical_concept_id
  where m.binding_status='BOUND'
    and c.public_concept_id is not null
),
candidates as (
  select
    p.drug_id,
    p.clinical_variant_id,
    s.source_document_id
  from product_concepts p
  join unique_sources s on s.public_concept_id=p.public_concept_id
)
insert into drx_dose.product_source_bindings_v1(
  drug_id,clinical_variant_id,source_document_id,binding_status,match_note
)
select
  drug_id,
  clinical_variant_id,
  source_document_id,
  'REVIEW',
  'AUTO_CANDIDATE_EXACT_SOURCE_IDENTITY; NOT_VERIFIED'
from candidates
on conflict (drug_id,source_document_id) do nothing;

create or replace view drx_dose.product_source_review_evidence_v1 as
with source_text as (
  select
    d.source_document_id,
    d.source_key,
    d.snapshot_id,
    d.section_2_sha256,
    d.section_4_2_sha256,
    c.candidate_concept_ids[1] source_concept_id,
    c.resolution_method source_identity_resolution_method,
    lower(regexp_replace(coalesce(s2.section_text,''),'\s+','','g')) s2_compact,
    lower(regexp_replace(coalesce(s42.section_text,''),'\s+','','g')) s42_compact,
    lower(coalesce(s2.section_text,'')) s2_lower,
    lower(coalesce(s42.section_text,'')) s42_lower
  from drx_clinical.source_documents_v1 d
  join drx_clinical.source_identity_candidates_v1 c using(source_document_id)
  join drx_clinical.source_section_evidence_v1 s2
    on s2.source_document_id=d.source_document_id
   and s2.section_key='qualitative_and_quantitative_composition'
  join drx_clinical.source_section_evidence_v1 s42
    on s42.source_document_id=d.source_document_id
   and s42.section_key='posology_and_method_of_administration'
  where c.resolution_status='UNIQUE_CANDIDATE'
),
base as (
  select
    b.binding_id,
    b.drug_id,
    b.clinical_variant_id,
    b.source_document_id,
    b.binding_status,
    b.match_note,
    b.decided_by,
    b.reviewed_at,

    st.source_key,
    st.snapshot_id,
    st.section_2_sha256,
    st.section_4_2_sha256,
    st.source_concept_id,
    st.source_identity_resolution_method,

    mv.strength_payload,
    mv.form_key,
    mv.route_key,
    d.pharmaceutical_form,
    d.approved_population,
    d.trade_name,
    d.active_substance,

    rd.display_name route_display_name,

    st.s2_compact,
    st.s42_compact,
    st.s2_lower,
    st.s42_lower
  from drx_dose.product_source_bindings_v1 b
  join source_text st on st.source_document_id=b.source_document_id
  join drx_variant.market_products_v1 mv on mv.product_id=b.drug_id
  join public.drugs d on d.id=b.drug_id
  left join drx_norm.route_dictionary_v1 rd on rd.route_key=mv.route_key
),
flags as (
  select
    b.*,

    case
      when jsonb_typeof(b.strength_payload)='object'
       and b.strength_payload->>'kind'='amount'
      then
        (
          b.s2_compact like '%' ||
            lower((b.strength_payload->>'value') || (b.strength_payload->>'unit')) || '%'
          or
          b.s42_compact like '%' ||
            lower((b.strength_payload->>'value') || (b.strength_payload->>'unit')) || '%'
        )

      when jsonb_typeof(b.strength_payload)='object'
       and b.strength_payload->>'kind'='percent'
      then
        (
          b.s2_compact like '%' ||
            lower((b.strength_payload->>'value') || '%') || '%'
          or
          b.s42_compact like '%' ||
            lower((b.strength_payload->>'value') || '%') || '%'
        )

      when jsonb_typeof(b.strength_payload)='object'
       and b.strength_payload->>'kind'='concentration'
      then
        (
          b.s2_compact like '%' ||
            lower(
              (b.strength_payload->'numerator'->>'value') ||
              (b.strength_payload->'numerator'->>'unit') || '/' ||
              (b.strength_payload->'denominator'->>'value') ||
              (b.strength_payload->'denominator'->>'unit')
            ) || '%'
          or
          b.s42_compact like '%' ||
            lower(
              (b.strength_payload->'numerator'->>'value') ||
              (b.strength_payload->'numerator'->>'unit') || '/' ||
              (b.strength_payload->'denominator'->>'value') ||
              (b.strength_payload->'denominator'->>'unit')
            ) || '%'
          or
          b.s2_compact like '%' ||
            lower(
              (b.strength_payload->'numerator'->>'value') ||
              (b.strength_payload->'numerator'->>'unit') || 'in' ||
              (b.strength_payload->'denominator'->>'value') ||
              (b.strength_payload->'denominator'->>'unit')
            ) || '%'
          or
          b.s42_compact like '%' ||
            lower(
              (b.strength_payload->'numerator'->>'value') ||
              (b.strength_payload->'numerator'->>'unit') || 'in' ||
              (b.strength_payload->'denominator'->>'value') ||
              (b.strength_payload->'denominator'->>'unit')
            ) || '%'
        )

      else false
    end strength_literal_match,

    (
      nullif(btrim(coalesce(b.route_display_name,'')),'') is not null
      and (
        b.s2_lower ~ (
          '(^|[^[:alnum:]])' ||
          lower(regexp_replace(b.route_display_name,'([\\.^$|()\[\]{}*+?])','\\\1','g')) ||
          '([^[:alnum:]]|$)'
        )
        or
        b.s42_lower ~ (
          '(^|[^[:alnum:]])' ||
          lower(regexp_replace(b.route_display_name,'([\\.^$|()\[\]{}*+?])','\\\1','g')) ||
          '([^[:alnum:]]|$)'
        )
      )
    ) route_literal_match,

    (
      nullif(btrim(coalesce(b.pharmaceutical_form,'')),'') is not null
      and (
        position(lower(btrim(b.pharmaceutical_form)) in b.s2_lower)>0
        or position(lower(btrim(b.pharmaceutical_form)) in b.s42_lower)>0
      )
    ) form_literal_match

  from base b
)
select
  f.binding_id,
  f.drug_id,
  f.clinical_variant_id,
  f.source_document_id,
  f.source_key,
  f.snapshot_id,
  f.binding_status,
  f.source_concept_id,
  f.source_identity_resolution_method,

  f.trade_name,
  f.active_substance,
  f.approved_population,
  f.strength_payload,
  f.form_key,
  f.pharmaceutical_form,
  f.route_key,
  f.route_display_name,

  f.section_2_sha256,
  f.section_4_2_sha256,

  f.strength_literal_match,
  f.route_literal_match,
  f.form_literal_match,

  case
    when f.strength_literal_match and f.route_literal_match and f.form_literal_match
      then 'SUBSTANCE_STRENGTH_ROUTE_FORM'
    when f.strength_literal_match and f.route_literal_match
      then 'SUBSTANCE_STRENGTH_ROUTE'
    when f.strength_literal_match and f.form_literal_match
      then 'SUBSTANCE_STRENGTH_FORM'
    when f.strength_literal_match
      then 'SUBSTANCE_STRENGTH'
    when f.route_literal_match and f.form_literal_match
      then 'SUBSTANCE_ROUTE_FORM'
    when f.route_literal_match
      then 'SUBSTANCE_ROUTE'
    when f.form_literal_match
      then 'SUBSTANCE_FORM'
    else 'SUBSTANCE_ONLY'
  end evidence_tier,

  false::boolean automatic_verification_allowed

from flags f;

create or replace view drx_dose.v3_product_candidates_v1 as
select
  e.drug_id,
  e.clinical_variant_id,
  e.source_document_id,
  e.source_key,
  e.snapshot_id,
  e.trade_name,
  e.active_substance,
  e.approved_population,
  e.strength_payload,
  e.form_key,
  e.pharmaceutical_form,
  e.route_key,
  e.evidence_tier,
  e.strength_literal_match,
  e.route_literal_match,
  e.form_literal_match,
  e.section_2_sha256,
  e.section_4_2_sha256,
  'REVIEW_REQUIRED'::text candidate_status,
  false::boolean automatic_insert_allowed
from drx_dose.product_source_review_evidence_v1 e
where e.binding_status='REVIEW';

revoke all on all tables in schema drx_dose from public,anon,authenticated;
revoke all on schema drx_dose from public,anon,authenticated;

comment on view drx_dose.product_source_review_evidence_v1 is
  'Review helper only: exact source substance plus literal strength/route/form evidence. No conversion, no fuzzy match, no automatic verification.';
comment on view drx_dose.v3_product_candidates_v1 is
  'Phase 8 V3 product candidates. Candidate status is always REVIEW_REQUIRED and automatic insert is disabled.';
