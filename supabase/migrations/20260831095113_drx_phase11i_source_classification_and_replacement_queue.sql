
-- DRx Phase 11I: classify source URLs and separate true SmPC ingestion from source replacement.
-- Prevent registry/product-list files from being treated as section 4.2 dosing evidence.

create table if not exists drx_dose.source_url_classification_v1 (
  source_url text primary key,
  source_kind text not null
    check (source_kind in ('OFFICIAL_SMPC','OFFICIAL_LABEL','REGISTRY_DATASET','PRODUCT_PAGE','SECONDARY','UNKNOWN')),
  dose_source_eligible boolean not null,
  classification_status text not null default 'IN_REVIEW'
    check (classification_status in ('IN_REVIEW','VERIFIED','REJECTED')),
  reason_code text not null,
  evidence_ref text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    classification_status<>'VERIFIED'
    or (nullif(btrim(reviewed_by),'') is not null and reviewed_at is not null)
  )
);

insert into drx_dose.source_url_classification_v1(
  source_url,source_kind,dose_source_eligible,classification_status,
  reason_code,evidence_ref,reviewed_by,reviewed_at
) values (
  'https://drive.google.com/file/d/1SY2rb2Eqo3fVkRhgQ8ltJHCRrWyAUDvd/view',
  'REGISTRY_DATASET',
  false,
  'VERIFIED',
  'REGISTRY_WORKBOOK_NOT_POSOLOGY_EVIDENCE',
  'Google Drive file 1SY2rb2Eqo3fVkRhgQ8ltJHCRrWyAUDvd; title Regjistri-i-Barnave-me-Klase-dhe-Perdorime.xlsx; XLSX registry rows, not an SmPC/label section 4.2 document',
  'system:phase11i-connected-drive-review',
  now()
)
on conflict (source_url) do update set
  source_kind=excluded.source_kind,
  dose_source_eligible=excluded.dose_source_eligible,
  classification_status=excluded.classification_status,
  reason_code=excluded.reason_code,
  evidence_ref=excluded.evidence_ref,
  reviewed_by=excluded.reviewed_by,
  reviewed_at=excluded.reviewed_at,
  updated_at=now();

create or replace view drx_dose.source_ingestion_queue_v1 as
select
  c.source_url,
  count(*) as regimen_count,
  count(distinct c.drug_id) as product_count,
  count(distinct c.candidate_context_key) as context_count,
  max(c.parser_confidence) as max_parser_confidence
from drx_dose.rule_candidate_extractions_v1 c
left join drx_dose.source_url_classification_v1 cls
  on cls.source_url=c.source_url
where nullif(btrim(c.source_url),'') is not null
  and not (
    cls.classification_status='VERIFIED'
    and cls.dose_source_eligible=false
  )
  and not exists (
    select 1
    from public.dose_source_snapshots_v3 s
    join public.dose_source_sections_v3 sec
      on sec.snapshot_id=s.snapshot_id
     and sec.section_code='4.2'
     and sec.extraction_status='extracted'
    where s.source_url=c.source_url or s.final_url=c.source_url
  )
group by c.source_url;

create or replace view drx_dose.source_replacement_queue_v1 as
select
  c.source_url,
  cls.source_kind,
  cls.reason_code,
  cls.evidence_ref,
  count(*) as regimen_count,
  count(distinct c.drug_id) as product_count,
  count(distinct c.candidate_context_key) as context_count,
  count(*) filter (where c.parser_status='STRUCTURED_CANDIDATE') as structured_candidate_rows,
  array_agg(distinct c.registry_number order by c.registry_number) as registry_numbers
from drx_dose.rule_candidate_extractions_v1 c
join drx_dose.source_url_classification_v1 cls
  on cls.source_url=c.source_url
 and cls.classification_status='VERIFIED'
 and cls.dose_source_eligible=false
group by c.source_url,cls.source_kind,cls.reason_code,cls.evidence_ref;

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
  'SOURCE_REPLACEMENT',
  source_url,
  (
    structured_candidate_rows*120
    + product_count*10
    + context_count*3
    + least(regimen_count,50)
  )::integer,
  jsonb_build_object(
    'sourceKind',source_kind,
    'reasonCode',reason_code,
    'products',product_count,
    'contexts',context_count,
    'structuredCandidates',structured_candidate_rows,
    'regimens',regimen_count
  )
from drx_dose.source_replacement_queue_v1

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

create or replace function public.drx_phase11_status_v1()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
select jsonb_build_object(
  'publishedProducts',(select count(*) from public.drugs where is_published and editorial_status='published'),
  'productTargets',(select count(*) from drx_dose.product_rule_targets_v1),
  'ingredientTargetReady',(select count(*) from drx_dose.product_rule_targets_v1 where ingredient_target_ready),
  'strictAutoInheritReady',(select count(*) from drx_dose.product_rule_targets_v1 where strict_autoinherit_ready),
  'legacyPublishedRegimensAll',(select count(*) from public.product_dosage_regimens where editorial_status='published'),
  'ruleTargets',(select count(*) from drx_dose.rule_targets_v1),
  'verifiedRuleTargets',(select count(*) from drx_dose.rule_targets_v1 where binding_status='VERIFIED'),
  'candidateRows',(select count(*) from drx_dose.rule_candidate_extractions_v1),
  'candidateContexts',(select count(*) from drx_dose.rule_candidate_contexts_v1),
  'structuredCandidates',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='STRUCTURED_CANDIDATE'),
  'textOnly',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='TEXT_ONLY'),
  'blocked',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='BLOCKED'),
  'needsReview',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='NEEDS_REVIEW'),
  'presentationSpecific',(select count(*) from drx_dose.rule_candidate_extractions_v1 where reason_codes @> array['PRODUCT_PRESENTATION_SPECIFIC']::text[]),
  'restrictionOnly',(select count(*) from drx_dose.rule_candidate_extractions_v1 where reason_codes @> array['RESTRICTION_ONLY_NO_DOSE_RULE']::text[]),
  'indicationPhraseCandidates',(select count(*) from drx_dose.indication_phrase_candidates_v1),
  'verifiedIndicationTextBindings',(select count(*) from drx_dose.indication_text_bindings_v1 where binding_status='VERIFIED'),
  'promotionReady',(select count(*) from drx_dose.rule_candidate_promotion_queue_v1 where promotion_ready),
  'sourceUrlsQueued',(select count(*) from drx_dose.source_ingestion_queue_v1),
  'sourceUrlsIneligible',(select count(*) from drx_dose.source_url_classification_v1 where classification_status='VERIFIED' and dose_source_eligible=false),
  'sourceReplacementRows',(select coalesce(sum(regimen_count),0) from drx_dose.source_replacement_queue_v1),
  'sourceReplacementProducts',(select coalesce(sum(product_count),0) from drx_dose.source_replacement_queue_v1),
  'indicationsQueued',(select count(*) from drx_dose.indication_normalization_queue_v1),
  'contextConflicts',(select count(*) from drx_dose.rule_candidate_context_conflicts_v1),
  'coverageProducts',(select count(*) from drx_dose.product_calculator_coverage_v1),
  'inheritedRuleMatches',(select count(*) from drx_dose.inherited_rule_matches_v1),
  'reviewQueueItems',(select count(*) from drx_dose.phase11_review_queue_v1),
  'autoPublishAllowed',false,
  'runtimeServeEnabled',false,
  'model','substance_or_ingredient_set -> reviewed_verified_rule -> compatible_product'
);
$$;

alter table drx_dose.source_url_classification_v1 enable row level security;
revoke all on drx_dose.source_url_classification_v1 from public,anon,authenticated;
revoke all on drx_dose.source_replacement_queue_v1 from public,anon,authenticated;
grant select,insert,update on drx_dose.source_url_classification_v1 to service_role;
grant select on drx_dose.source_replacement_queue_v1 to service_role;
