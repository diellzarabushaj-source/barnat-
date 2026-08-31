-- DRx Phase 11C: close the "fill it later" workflow.
-- Adds coverage, source/indication queues, immutable review events and a reviewed
-- candidate -> DRAFT V3 promotion path. Nothing is auto-published or auto-served.

create table if not exists drx_dose.candidate_review_events_v1 (
  event_id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references drx_dose.rule_candidate_extractions_v1(candidate_id) on delete restrict,
  previous_status text not null,
  new_status text not null check (new_status in ('APPROVED','REJECTED','PROMOTED')),
  reviewer text not null check (btrim(reviewer)<>''),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists drx_dose.candidate_promotions_v1 (
  promotion_id uuid primary key default gen_random_uuid(),
  candidate_context_key text not null unique,
  candidate_id uuid not null references drx_dose.rule_candidate_extractions_v1(candidate_id) on delete restrict,
  rule_id uuid not null unique references public.dose_rules_v3(rule_id) on delete restrict,
  rule_target_id uuid not null unique references drx_dose.rule_targets_v1(rule_target_id) on delete restrict,
  promoted_by text not null check (btrim(promoted_by)<>''),
  promoted_at timestamptz not null default now()
);

create or replace function drx_dose.block_phase11_review_event_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog
as $$
begin
  raise exception 'DRX_PHASE11_REVIEW_EVENT_IMMUTABLE';
end;
$$;

drop trigger if exists phase11_review_event_immutable on drx_dose.candidate_review_events_v1;
create trigger phase11_review_event_immutable
before update or delete on drx_dose.candidate_review_events_v1
for each row execute function drx_dose.block_phase11_review_event_mutation_v1();

create or replace view drx_dose.source_ingestion_queue_v1 as
select
  c.source_url,
  count(*) as regimen_count,
  count(distinct c.drug_id) as product_count,
  count(distinct c.candidate_context_key) as context_count,
  max(c.parser_confidence) as max_parser_confidence
from drx_dose.rule_candidate_extractions_v1 c
where nullif(btrim(c.source_url),'') is not null
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

create or replace view drx_dose.indication_normalization_queue_v1 as
select
  lower(regexp_replace(btrim(c.indication_text),'[[:space:]]+',' ','g')) as indication_key_candidate,
  min(c.indication_text) as indication_example,
  count(*) as regimen_count,
  count(distinct c.drug_id) as product_count,
  count(distinct c.substance_concept_id) filter (where c.substance_concept_id is not null) as substance_count
from drx_dose.rule_candidate_extractions_v1 c
where nullif(btrim(c.indication_text),'') is not null
  and not exists (
    select 1
    from public.dose_indication_terms_v3 t
    where lower(regexp_replace(btrim(t.term),'[[:space:]]+',' ','g'))
       = lower(regexp_replace(btrim(c.indication_text),'[[:space:]]+',' ','g'))
  )
group by lower(regexp_replace(btrim(c.indication_text),'[[:space:]]+',' ','g'));

create or replace view drx_dose.rule_candidate_context_conflicts_v1 as
select
  c.candidate_context_key,
  count(*) filter (where c.parser_status='STRUCTURED_CANDIDATE') as structured_rows,
  count(distinct md5(c.parsed_rule_payload::text))
    filter (where c.parser_status='STRUCTURED_CANDIDATE') as distinct_structured_payloads,
  count(distinct c.source_url) filter (where nullif(btrim(c.source_url),'') is not null) as distinct_source_urls,
  array_agg(distinct c.registry_number order by c.registry_number) as registry_numbers
from drx_dose.rule_candidate_extractions_v1 c
group by c.candidate_context_key
having count(distinct md5(c.parsed_rule_payload::text))
       filter (where c.parser_status='STRUCTURED_CANDIDATE') > 1;

drop function if exists public.drx_phase11_status_v1();
drop view if exists drx_dose.phase11_review_queue_v1;
drop view if exists drx_dose.rule_candidate_promotion_queue_v1;

create view drx_dose.rule_candidate_promotion_queue_v1 as
with source_match as (
  select
    c.candidate_id,
    count(distinct s.snapshot_id)::integer as matching_snapshot_count,
    min(s.snapshot_id) as single_snapshot_id,
    min(sec.section_sha256) as single_section_sha256
  from drx_dose.rule_candidate_extractions_v1 c
  left join public.dose_source_snapshots_v3 s
    on s.source_url=c.source_url or s.final_url=c.source_url
  left join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  group by c.candidate_id
),
indication_match as (
  select
    c.candidate_id,
    count(distinct t.indication_id)::integer as matching_indication_count,
    min(t.indication_id::text)::uuid as single_indication_id
  from drx_dose.rule_candidate_extractions_v1 c
  left join public.dose_indication_terms_v3 t
    on lower(regexp_replace(btrim(t.term),'[[:space:]]+',' ','g'))
       = lower(regexp_replace(btrim(c.indication_text),'[[:space:]]+',' ','g'))
  group by c.candidate_id
)
select
  c.candidate_id,c.legacy_regimen_id,c.drug_id,c.registry_number,c.trade_name,
  c.target_kind,c.substance_concept_id,c.ingredient_set_id,c.ingredient_concept_ids,
  c.patient_group,c.normalized_route_keys,c.form_family,c.release_key,
  c.indication_text,c.dose_text,c.source_url,c.parser_status,c.parser_confidence,
  c.parsed_rule_payload,c.reason_codes,
  sm.matching_snapshot_count,sm.single_snapshot_id,sm.single_section_sha256,
  im.matching_indication_count,im.single_indication_id,
  array_remove(array[
    case when c.target_kind='UNRESOLVED' then 'INGREDIENT_IDENTITY' end,
    case when c.target_kind='INGREDIENT_SET' then 'COMBINATION_DOSE_BASIS_COMPONENT' end,
    case when cardinality(c.normalized_route_keys)<>1 then 'ROUTE_NORMALIZATION' end,
    case when c.parser_status<>'STRUCTURED_CANDIDATE' then 'STRUCTURED_DOSE_RULE' end,
    case when coalesce(c.parsed_rule_payload->>'frequencyMode','manual')='manual'
      then 'SCHEDULE_STRUCTURE' end,
    case when cardinality(c.reason_codes)>0 then 'PARSER_COMPLEXITY_REVIEW' end,
    case when exists (
      select 1 from drx_dose.rule_candidate_context_conflicts_v1 x
      where x.candidate_context_key=c.candidate_context_key
    ) then 'CONTEXT_CONFLICT' end,
    case when sm.matching_snapshot_count<>1 or sm.single_section_sha256 is null
      then 'EXACT_SOURCE_SECTION_4_2' end,
    case when im.matching_indication_count<>1 then 'INDICATION_CONCEPT' end,
    case when c.review_status<>'APPROVED' then 'CLINICAL_REVIEW' end
  ],null) as promotion_blockers,
  (
    c.target_kind='SUBSTANCE'
    and cardinality(c.normalized_route_keys)=1
    and c.parser_status='STRUCTURED_CANDIDATE'
    and coalesce(c.parsed_rule_payload->>'frequencyMode','manual')<>'manual'
    and cardinality(c.reason_codes)=0
    and not exists (
      select 1 from drx_dose.rule_candidate_context_conflicts_v1 x
      where x.candidate_context_key=c.candidate_context_key
    )
    and sm.matching_snapshot_count=1
    and sm.single_section_sha256 is not null
    and im.matching_indication_count=1
    and c.review_status='APPROVED'
  ) as promotion_ready,
  false::boolean as auto_publish_allowed
from drx_dose.rule_candidate_extractions_v1 c
join source_match sm on sm.candidate_id=c.candidate_id
join indication_match im on im.candidate_id=c.candidate_id;

create view drx_dose.phase11_review_queue_v1 as
select
  'PRODUCT_INGREDIENT_IDENTITY'::text as issue_type,
  p.drug_id as entity_id,
  p.registry_number::text as issue_key,
  array['Resolve ingredient identity before rule inheritance']::text[] as details
from drx_dose.product_rule_targets_v1 p
where not p.ingredient_target_ready
union all
select
  'PRODUCT_COMPATIBILITY',
  p.drug_id,
  p.registry_number::text,
  array_remove(array[
    case when p.route_status<>'EXACT' then 'route='||coalesce(p.route_status,'NULL') end,
    case when p.population_status<>'EXACT' then 'population='||coalesce(p.population_status,'NULL') end,
    case when p.variant_binding_status<>'BOUND' then 'variant='||coalesce(p.variant_binding_status,'NULL') end,
    case when cardinality(p.variant_anomaly_codes)>0 then 'anomalies='||array_to_string(p.variant_anomaly_codes,',') end
  ],null)
from drx_dose.product_rule_targets_v1 p
where p.ingredient_target_ready and not p.strict_autoinherit_ready
union all
select
  'DOSE_CANDIDATE',
  q.candidate_id,
  q.registry_number::text||':'||q.patient_group,
  q.promotion_blockers
from drx_dose.rule_candidate_promotion_queue_v1 q
where not q.promotion_ready;

create or replace view drx_dose.product_calculator_coverage_v1 as
with c as (
  select
    drug_id,
    count(*) as regimen_rows,
    count(*) filter (where parser_status='STRUCTURED_CANDIDATE') as structured_candidates,
    count(*) filter (where parser_status='TEXT_ONLY') as text_only_rows,
    count(*) filter (where parser_status='BLOCKED') as blocked_rows,
    count(*) filter (where parser_status='NEEDS_REVIEW') as needs_review_rows
  from drx_dose.rule_candidate_extractions_v1
  group by drug_id
),
m as (
  select drug_id,count(*) as inherited_rules
  from drx_dose.inherited_rule_matches_v1
  group by drug_id
)
select
  p.drug_id,p.registry_number,p.trade_name,p.target_kind,p.canonical_ingredients,
  p.ingredient_target_ready,p.strict_autoinherit_ready,
  coalesce(c.regimen_rows,0) as regimen_rows,
  coalesce(c.structured_candidates,0) as structured_candidates,
  coalesce(c.text_only_rows,0) as text_only_rows,
  coalesce(c.blocked_rows,0) as blocked_rows,
  coalesce(c.needs_review_rows,0) as needs_review_rows,
  coalesce(m.inherited_rules,0) as inherited_rules,
  case
    when coalesce(m.inherited_rules,0)>0 then 'CALCULATOR_READY'
    when not p.ingredient_target_ready then 'INGREDIENT_REVIEW'
    when coalesce(c.structured_candidates,0)>0 then 'CANDIDATE_REVIEW'
    when coalesce(c.text_only_rows,0)>0 then 'TEXT_ONLY'
    when coalesce(c.blocked_rows,0)>0 then 'RESTRICTED_ONLY'
    else 'INSUFFICIENT_DATA'
  end as calculator_status
from drx_dose.product_rule_targets_v1 p
left join c on c.drug_id=p.drug_id
left join m on m.drug_id=p.drug_id;

create or replace function public.drx_phase11_review_candidate_v1(
  p_candidate_id uuid,
  p_decision text,
  p_reviewer text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_previous text;
  v_next text;
begin
  if nullif(btrim(p_reviewer),'') is null then
    raise exception 'DRX_PHASE11_REVIEWER_REQUIRED';
  end if;
  v_next := case upper(btrim(coalesce(p_decision,'')))
    when 'APPROVE' then 'APPROVED'
    when 'APPROVED' then 'APPROVED'
    when 'REJECT' then 'REJECTED'
    when 'REJECTED' then 'REJECTED'
    else null
  end;
  if v_next is null then
    raise exception 'DRX_PHASE11_INVALID_REVIEW_DECISION';
  end if;

  select review_status into v_previous
  from drx_dose.rule_candidate_extractions_v1
  where candidate_id=p_candidate_id
  for update;

  if v_previous is null then raise exception 'DRX_PHASE11_CANDIDATE_NOT_FOUND'; end if;
  if v_previous='PROMOTED' then raise exception 'DRX_PHASE11_PROMOTED_CANDIDATE_LOCKED'; end if;

  update drx_dose.rule_candidate_extractions_v1
  set review_status=v_next,reviewed_by=p_reviewer,reviewed_at=now(),updated_at=now()
  where candidate_id=p_candidate_id;

  insert into drx_dose.candidate_review_events_v1(
    candidate_id,previous_status,new_status,reviewer,note
  ) values (p_candidate_id,v_previous,v_next,p_reviewer,p_note);

  return jsonb_build_object('candidateId',p_candidate_id,'previousStatus',v_previous,'reviewStatus',v_next);
end;
$$;

create or replace function public.drx_phase11_promote_candidate_to_draft_v1(
  p_candidate_id uuid,
  p_reviewer text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  q record;
  c record;
  s record;
  v_rule_id uuid := gen_random_uuid();
  v_target_id uuid := gen_random_uuid();
  v_rule_key text;
  v_required text[] := '{}'::text[];
  v_method text;
  v_previous text;
begin
  if nullif(btrim(p_reviewer),'') is null then raise exception 'DRX_PHASE11_REVIEWER_REQUIRED'; end if;

  select * into q
  from drx_dose.rule_candidate_promotion_queue_v1
  where candidate_id=p_candidate_id;

  if q.candidate_id is null then raise exception 'DRX_PHASE11_CANDIDATE_NOT_FOUND'; end if;
  if not q.promotion_ready then
    raise exception 'DRX_PHASE11_PROMOTION_BLOCKED: %',array_to_string(q.promotion_blockers,',');
  end if;

  select * into c
  from drx_dose.rule_candidate_extractions_v1
  where candidate_id=p_candidate_id
  for update;

  if exists (
    select 1 from drx_dose.candidate_promotions_v1
    where candidate_context_key=c.candidate_context_key
  ) then
    raise exception 'DRX_PHASE11_CONTEXT_ALREADY_PROMOTED';
  end if;

  select snap.*,sec.section_sha256
  into s
  from public.dose_source_snapshots_v3 snap
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=snap.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where (snap.source_url=c.source_url or snap.final_url=c.source_url);

  v_method := c.parsed_rule_payload->>'calculationMethod';
  if v_method in ('dose_per_kg_per_dose','dose_per_kg_per_day') then
    v_required := array['weight_kg'];
  elsif v_method in ('dose_per_m2_per_dose','dose_per_m2_per_day') then
    v_required := array['weight_kg','height_cm'];
  end if;

  v_rule_key := 'RULE-CANDIDATE-'||upper(c.candidate_context_key);

  insert into public.dose_rules_v3(
    rule_id,rule_key,substance_concept_id,indication_id,patient_group,
    calculation_method,dose_min_value,dose_max_value,dose_unit,dose_basis,
    frequency_mode,interval_min_hours,interval_max_hours,
    times_per_day,times_per_day_min,times_per_day_max,
    duration_mode,duration_min_days,duration_max_days,
    route,required_inputs,dose_basis_mode,
    source_key,source_snapshot_id,source_section,source_section_sha256,
    source_evidence_hash,source_document_version,source_document_date,
    confidence_score,review_class,safety_validation_status,
    editorial_status,version_no
  ) values (
    v_rule_id,v_rule_key,c.substance_concept_id,q.single_indication_id,c.patient_group,
    v_method,
    nullif(c.parsed_rule_payload->>'doseMinValue','')::numeric,
    nullif(c.parsed_rule_payload->>'doseMaxValue','')::numeric,
    c.parsed_rule_payload->>'doseUnit',
    c.parsed_rule_payload->>'doseBasis',
    c.parsed_rule_payload->>'frequencyMode',
    nullif(c.parsed_rule_payload->>'intervalMinHours','')::numeric,
    nullif(c.parsed_rule_payload->>'intervalMaxHours','')::numeric,
    nullif(c.parsed_rule_payload->>'timesPerDay','')::numeric,
    nullif(c.parsed_rule_payload->>'timesPerDayMin','')::numeric,
    nullif(c.parsed_rule_payload->>'timesPerDayMax','')::numeric,
    coalesce(c.parsed_rule_payload->>'durationMode','manual'),
    nullif(c.parsed_rule_payload->>'durationMinDays','')::numeric,
    nullif(c.parsed_rule_payload->>'durationMaxDays','')::numeric,
    c.normalized_route_keys[1],
    v_required,'single_active',
    s.source_key,s.snapshot_id,'4.2',s.section_sha256,
    s.snapshot_id,s.document_version,s.document_date,
    c.parser_confidence,'candidate_reviewed','pending',
    'draft',1
  );

  insert into drx_dose.rule_targets_v1(
    rule_target_id,rule_id,target_kind,substance_concept_id,ingredient_concept_ids,
    form_family,release_key,route_keys,strength_match_mode,binding_status
  ) values (
    v_target_id,v_rule_id,'SUBSTANCE',c.substance_concept_id,c.ingredient_concept_ids,
    c.form_family,c.release_key,c.normalized_route_keys,'MANUAL_REVIEW','DRAFT'
  );

  v_previous := c.review_status;
  update drx_dose.rule_candidate_extractions_v1
  set review_status='PROMOTED',reviewed_by=p_reviewer,reviewed_at=now(),updated_at=now()
  where candidate_id=p_candidate_id;

  insert into drx_dose.candidate_review_events_v1(
    candidate_id,previous_status,new_status,reviewer,note
  ) values (
    p_candidate_id,v_previous,'PROMOTED',p_reviewer,
    'Promoted to DRAFT V3 rule; publication and inheritance remain blocked pending normal V3 review gates.'
  );

  insert into drx_dose.candidate_promotions_v1(
    candidate_context_key,candidate_id,rule_id,rule_target_id,promoted_by
  ) values (c.candidate_context_key,p_candidate_id,v_rule_id,v_target_id,p_reviewer);

  return jsonb_build_object(
    'candidateId',p_candidate_id,'ruleId',v_rule_id,'ruleKey',v_rule_key,
    'ruleTargetId',v_target_id,'editorialStatus','draft','targetStatus','DRAFT',
    'autoPublished',false,'runtimeServed',false
  );
end;
$$;

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
  'legacyRegimensExcludedBecauseProductNotPublished',(
    select count(*) from public.product_dosage_regimens r
    left join public.drugs d on d.id=r.drug_id
    where r.editorial_status='published'
      and (d.id is null or d.is_published is distinct from true or d.editorial_status<>'published')
  ),
  'ruleTargets',(select count(*) from drx_dose.rule_targets_v1),
  'verifiedRuleTargets',(select count(*) from drx_dose.rule_targets_v1 where binding_status='VERIFIED'),
  'candidateRows',(select count(*) from drx_dose.rule_candidate_extractions_v1),
  'candidateContexts',(select count(*) from drx_dose.rule_candidate_contexts_v1),
  'structuredCandidates',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='STRUCTURED_CANDIDATE'),
  'textOnly',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='TEXT_ONLY'),
  'blocked',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='BLOCKED'),
  'needsReview',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='NEEDS_REVIEW'),
  'promotionReady',(select count(*) from drx_dose.rule_candidate_promotion_queue_v1 where promotion_ready),
  'promotedDrafts',(select count(*) from drx_dose.candidate_promotions_v1),
  'sourceUrlsQueued',(select count(*) from drx_dose.source_ingestion_queue_v1),
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

alter table drx_dose.candidate_review_events_v1 enable row level security;
alter table drx_dose.candidate_promotions_v1 enable row level security;

revoke all on drx_dose.candidate_review_events_v1 from public,anon,authenticated;
revoke all on drx_dose.candidate_promotions_v1 from public,anon,authenticated;
revoke all on drx_dose.source_ingestion_queue_v1 from public,anon,authenticated;
revoke all on drx_dose.indication_normalization_queue_v1 from public,anon,authenticated;
revoke all on drx_dose.rule_candidate_context_conflicts_v1 from public,anon,authenticated;
revoke all on drx_dose.rule_candidate_promotion_queue_v1 from public,anon,authenticated;
revoke all on drx_dose.product_calculator_coverage_v1 from public,anon,authenticated;

grant select,insert on drx_dose.candidate_review_events_v1 to service_role;
grant select,insert on drx_dose.candidate_promotions_v1 to service_role;
grant select on drx_dose.source_ingestion_queue_v1 to service_role;
grant select on drx_dose.indication_normalization_queue_v1 to service_role;
grant select on drx_dose.rule_candidate_context_conflicts_v1 to service_role;
grant select on drx_dose.rule_candidate_promotion_queue_v1 to service_role;
grant select on drx_dose.product_calculator_coverage_v1 to service_role;

revoke all on function drx_dose.block_phase11_review_event_mutation_v1() from public,anon,authenticated;
revoke all on function public.drx_phase11_review_candidate_v1(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.drx_phase11_promote_candidate_to_draft_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.drx_phase11_review_candidate_v1(uuid,text,text,text) to service_role;
grant execute on function public.drx_phase11_promote_candidate_to_draft_v1(uuid,text) to service_role;
