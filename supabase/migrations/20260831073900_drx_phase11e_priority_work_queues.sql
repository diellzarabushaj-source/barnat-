-- DRx Phase 11E: deterministic priority queues for remaining fill work.
-- Read-only prioritization; no clinical publication or rule mutation.

create or replace view drx_dose.source_ingestion_priority_v1 as
select
  q.source_url,
  q.regimen_count,
  q.product_count,
  q.context_count,
  q.max_parser_confidence,
  count(*) filter (where c.parser_status='STRUCTURED_CANDIDATE') as structured_candidate_rows,
  count(*) filter (where c.parser_status='TEXT_ONLY') as text_only_rows,
  count(*) filter (where c.parser_status='BLOCKED') as blocked_rows,
  count(*) filter (where c.parser_status='NEEDS_REVIEW') as needs_review_rows,
  (
    count(*) filter (where c.parser_status='STRUCTURED_CANDIDATE') * 100
    + q.product_count * 10
    + q.context_count * 3
    + least(q.regimen_count,50)
  )::integer as priority_score
from drx_dose.source_ingestion_queue_v1 q
join drx_dose.rule_candidate_extractions_v1 c on c.source_url=q.source_url
group by q.source_url,q.regimen_count,q.product_count,q.context_count,q.max_parser_confidence;

create or replace view drx_dose.indication_normalization_priority_v1 as
select
  q.indication_key_candidate,
  q.indication_example,
  q.regimen_count,
  q.product_count,
  q.substance_count,
  count(*) filter (where c.parser_status='STRUCTURED_CANDIDATE') as structured_candidate_rows,
  count(*) filter (where c.parser_status='TEXT_ONLY') as text_only_rows,
  (
    count(*) filter (where c.parser_status='STRUCTURED_CANDIDATE') * 100
    + q.product_count * 10
    + q.substance_count * 5
    + least(q.regimen_count,50)
  )::integer as priority_score
from drx_dose.indication_normalization_queue_v1 q
join drx_dose.rule_candidate_extractions_v1 c
  on lower(regexp_replace(btrim(c.indication_text),'[[:space:]]+',' ','g'))=q.indication_key_candidate
group by q.indication_key_candidate,q.indication_example,q.regimen_count,q.product_count,q.substance_count;

create or replace view drx_dose.phase11_next_actions_v1 as
select
  'SOURCE_4_2'::text as action_type,
  source_url as action_key,
  priority_score,
  jsonb_build_object(
    'products',product_count,
    'contexts',context_count,
    'structuredCandidates',structured_candidate_rows,
    'regimens',regimen_count
  ) as metadata
from drx_dose.source_ingestion_priority_v1
union all
select
  'INDICATION_NORMALIZATION',
  indication_key_candidate,
  priority_score,
  jsonb_build_object(
    'example',indication_example,
    'products',product_count,
    'substances',substance_count,
    'structuredCandidates',structured_candidate_rows,
    'regimens',regimen_count
  )
from drx_dose.indication_normalization_priority_v1;

revoke all on drx_dose.source_ingestion_priority_v1 from public,anon,authenticated;
revoke all on drx_dose.indication_normalization_priority_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_next_actions_v1 from public,anon,authenticated;
grant select on drx_dose.source_ingestion_priority_v1 to service_role;
grant select on drx_dose.indication_normalization_priority_v1 to service_role;
grant select on drx_dose.phase11_next_actions_v1 to service_role;
