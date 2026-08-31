
-- DRx Phase 11BR: exact-phrase canonical-substance suggestions for unresolved identity batches.
-- Suggestions are reviewer aids only; they never resolve identity automatically.

create or replace view drx_dose.ingredient_identity_term_candidates_v1 as
with terms as (
  select
    t.concept_id,
    t.term,
    t.term_type,
    t.is_preferred,
    t.confidence,
    t.review_method,
    t.evidence_urls,
    btrim(regexp_replace(lower(t.term),'[^a-z0-9]+',' ','g')) as normalized_term
  from public.substance_terms_v1 t
  where char_length(btrim(regexp_replace(lower(t.term),'[^a-z0-9]+',' ','g'))) >= 4
),
batches as (
  select
    b.composition_signature,
    b.normalized_composition,
    b.product_count,
    btrim(regexp_replace(lower(b.normalized_composition),'[^a-z0-9]+',' ','g')) as normalized_composition_search
  from drx_dose.ingredient_identity_review_batches_v1 b
)
select distinct
  b.composition_signature,
  b.normalized_composition,
  b.product_count,
  t.concept_id,
  c.canonical_name,
  c.canonical_key,
  t.term as matched_term,
  t.term_type,
  t.is_preferred,
  t.confidence,
  t.review_method,
  t.evidence_urls,
  'EXACT_PHRASE_IN_COMPOSITION'::text as match_method,
  false::boolean as auto_resolve_allowed
from batches b
join terms t
  on position(' '||t.normalized_term||' ' in ' '||b.normalized_composition_search||' ') > 0
join public.substance_concepts_v1 c on c.concept_id=t.concept_id;

create or replace view drx_dose.ingredient_identity_review_queue_v2 as
select
  b.composition_signature,
  b.normalized_composition,
  b.product_count,
  b.drug_ids,
  b.registry_numbers,
  b.trade_names,
  b.review_classes,
  count(distinct c.concept_id) as suggested_concept_count,
  coalesce(array_agg(distinct c.concept_id order by c.concept_id)
    filter (where c.concept_id is not null),'{}'::uuid[]) as suggested_concept_ids,
  coalesce(jsonb_agg(distinct jsonb_build_object(
    'conceptId',c.concept_id,
    'canonicalName',c.canonical_name,
    'canonicalKey',c.canonical_key,
    'matchedTerm',c.matched_term,
    'termType',c.term_type,
    'preferred',c.is_preferred,
    'confidence',c.confidence,
    'reviewMethod',c.review_method,
    'evidenceUrls',c.evidence_urls,
    'matchMethod',c.match_method
  )) filter (where c.concept_id is not null),'[]'::jsonb) as suggestions,
  case
    when count(distinct c.concept_id)=0 then 'MANUAL_CONCEPT_DISCOVERY'
    else 'REVIEW_EXISTING_CANONICAL_TERMS'
  end as next_action,
  false::boolean as auto_resolve_allowed
from drx_dose.ingredient_identity_review_batches_v1 b
left join drx_dose.ingredient_identity_term_candidates_v1 c
  on c.composition_signature=b.composition_signature
group by
  b.composition_signature,b.normalized_composition,b.product_count,b.drug_ids,
  b.registry_numbers,b.trade_names,b.review_classes;

create or replace view drx_dose.ingredient_identity_candidate_summary_v1 as
select
  count(*) as review_batches,
  count(*) filter (where suggested_concept_count>0) as batches_with_suggestions,
  count(*) filter (where suggested_concept_count=0) as manual_discovery_batches,
  coalesce(sum(product_count),0) as review_products,
  coalesce(sum(product_count) filter (where suggested_concept_count>0),0) as products_with_suggestions,
  false::boolean as auto_resolve_allowed
from drx_dose.ingredient_identity_review_queue_v2;

create or replace function public.drx_phase11_identity_batch_packet_v2(p_composition_signature text)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_dose
as $$
select jsonb_build_object(
  'batch',to_jsonb(b),
  'products',coalesce((
    select jsonb_agg(jsonb_build_object(
      'drugId',d.id,
      'registryNumber',d.registry_number,
      'tradeName',d.trade_name,
      'activeSubstance',d.active_substance,
      'strength',d.strength,
      'form',d.pharmaceutical_form,
      'atcCode',d.atc_code,
      'sourceVersionId',d.source_version_id,
      'sourceHash',d.source_hash
    ) order by d.registry_number)
    from public.drugs d
    where d.id=any(b.drug_ids)
  ),'[]'::jsonb),
  'suggestions',b.suggestions,
  'priorDecisions',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from drx_dose.ingredient_identity_batch_decisions_v1 x
    where x.composition_signature=b.composition_signature
  ),'[]'::jsonb)
)
from drx_dose.ingredient_identity_review_queue_v2 b
where b.composition_signature=p_composition_signature;
$$;

revoke all on drx_dose.ingredient_identity_term_candidates_v1 from public,anon,authenticated;
revoke all on drx_dose.ingredient_identity_review_queue_v2 from public,anon,authenticated;
revoke all on drx_dose.ingredient_identity_candidate_summary_v1 from public,anon,authenticated;
grant select on drx_dose.ingredient_identity_term_candidates_v1 to service_role;
grant select on drx_dose.ingredient_identity_review_queue_v2 to service_role;
grant select on drx_dose.ingredient_identity_candidate_summary_v1 to service_role;

revoke all on function public.drx_phase11_identity_batch_packet_v2(text) from public,anon,authenticated;
grant execute on function public.drx_phase11_identity_batch_packet_v2(text) to service_role;
