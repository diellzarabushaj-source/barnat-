
-- DRx Phase 11H: refresh-state correction + indication normalization staging.
-- No clinical indication is auto-bound and no dose rule is auto-published.

create or replace function public.drx_phase11_refresh_candidates_v1()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose,drx_norm
as $$
declare
  v_rows integer;
begin
  insert into drx_dose.rule_candidate_extractions_v1 (
    legacy_regimen_id,drug_id,registry_number,trade_name,
    target_kind,substance_concept_id,ingredient_set_id,ingredient_concept_ids,
    ingredient_resolution_status,patient_group,population_raw,route_raw,
    normalized_route_keys,form_family,release_key,
    indication_text,dose_text,frequency_text,duration_text,maximum_text,warnings,
    calculation_status,source_url,source_hash,candidate_context_key,
    parser_version,parser_status,parser_confidence,parsed_rule_payload,reason_codes,
    auto_publish_allowed,review_status,updated_at
  )
  select
    p.id,p.drug_id,d.registry_number,d.trade_name,
    case
      when ir.resolution_status='RESOLVED_SINGLE' and s.ingredient_count=1 then 'SUBSTANCE'
      when ir.resolution_status='RESOLVED_MULTI' and s.ingredient_count>1 then 'INGREDIENT_SET'
      else 'UNRESOLVED'
    end,
    case when s.ingredient_count=1 then s.concept_ids[1] end,
    s.ingredient_set_id,
    coalesce(s.concept_ids,'{}'::uuid[]),
    ir.resolution_status,
    drx_dose.population_to_patient_group_v1(p.population),
    p.population,p.route,
    coalesce(n.normalized_route_keys,'{}'::text[]),
    n.form_family,n.normalized_release_key,
    p.indication_text,p.dose_text,p.frequency_text,p.duration_text,p.maximum_text,p.warnings,
    p.calculation_status,p.source_url,p.source_hash,
    md5(concat_ws('|',
      case when s.ingredient_count=1 then s.concept_ids[1]::text else coalesce(s.ingredient_set_id::text,'UNRESOLVED') end,
      drx_dose.population_to_patient_group_v1(p.population),
      coalesce(array_to_string(n.normalized_route_keys,','),coalesce(p.route,'')),
      coalesce(n.form_family,''),coalesce(n.normalized_release_key,''),
      regexp_replace(lower(coalesce(p.indication_text,'')),'[[:space:]]+',' ','g')
    )),
    'drx-legacy-dose-parser-v2',
    case
      when ir.resolution_status not in ('RESOLVED_SINGLE','RESOLVED_MULTI') then 'NEEDS_REVIEW'
      when lower(coalesce(p.calculation_status,'')) in ('contraindicated','not_recommended') then 'BLOCKED'
      when coalesce((drx_dose.parse_legacy_dose_text_v1(
        p.dose_text,p.frequency_text,p.duration_text,p.maximum_text,p.calculation_status
      )->>'classification'),'') in ('CONTRAINDICATED','NOT_RECOMMENDED','RESTRICTION_ONLY') then 'BLOCKED'
      when coalesce((drx_dose.parse_legacy_dose_text_v1(
        p.dose_text,p.frequency_text,p.duration_text,p.maximum_text,p.calculation_status
      )->>'classification'),'')='STRUCTURED_CANDIDATE' then 'STRUCTURED_CANDIDATE'
      else 'TEXT_ONLY'
    end,
    coalesce((drx_dose.parse_legacy_dose_text_v1(
      p.dose_text,p.frequency_text,p.duration_text,p.maximum_text,p.calculation_status
    )->>'confidence')::numeric,0),
    drx_dose.parse_legacy_dose_text_v1(
      p.dose_text,p.frequency_text,p.duration_text,p.maximum_text,p.calculation_status
    ),
    case
      when ir.resolution_status not in ('RESOLVED_SINGLE','RESOLVED_MULTI')
        then array['INGREDIENT_IDENTITY_REVIEW_REQUIRED']::text[]
      else coalesce(
        array(select jsonb_array_elements_text(
          coalesce(drx_dose.parse_legacy_dose_text_v1(
            p.dose_text,p.frequency_text,p.duration_text,p.maximum_text,p.calculation_status
          )->'reasonCodes','[]'::jsonb)
        )),
        '{}'::text[]
      )
    end,
    false,'PENDING',now()
  from public.product_dosage_regimens p
  join public.drugs d on d.id=p.drug_id
  left join public.product_ingredient_resolution_v1 ir on ir.source_drug_id=p.drug_id
  left join public.medindex_product_ingredient_sets_v1 s on s.source_drug_id=p.drug_id
  left join drx_norm.product_normalization_v1 n on n.drug_id=p.drug_id
  where p.editorial_status='published'
    and d.is_published=true
    and d.editorial_status='published'
  on conflict (legacy_regimen_id) do update set
    drug_id=excluded.drug_id,registry_number=excluded.registry_number,trade_name=excluded.trade_name,
    target_kind=excluded.target_kind,substance_concept_id=excluded.substance_concept_id,
    ingredient_set_id=excluded.ingredient_set_id,ingredient_concept_ids=excluded.ingredient_concept_ids,
    ingredient_resolution_status=excluded.ingredient_resolution_status,
    patient_group=excluded.patient_group,population_raw=excluded.population_raw,
    route_raw=excluded.route_raw,normalized_route_keys=excluded.normalized_route_keys,
    form_family=excluded.form_family,release_key=excluded.release_key,
    indication_text=excluded.indication_text,dose_text=excluded.dose_text,
    frequency_text=excluded.frequency_text,duration_text=excluded.duration_text,
    maximum_text=excluded.maximum_text,warnings=excluded.warnings,
    calculation_status=excluded.calculation_status,source_url=excluded.source_url,
    source_hash=excluded.source_hash,candidate_context_key=excluded.candidate_context_key,
    parser_version=excluded.parser_version,parser_status=excluded.parser_status,
    parser_confidence=excluded.parser_confidence,parsed_rule_payload=excluded.parsed_rule_payload,
    reason_codes=excluded.reason_codes,auto_publish_allowed=false,updated_at=now()
  where drx_dose.rule_candidate_extractions_v1.review_status='PENDING';

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'refreshed_rows',v_rows,
    'candidate_rows',(select count(*) from drx_dose.rule_candidate_extractions_v1),
    'structured_candidates',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='STRUCTURED_CANDIDATE'),
    'text_only',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='TEXT_ONLY'),
    'blocked',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='BLOCKED'),
    'needs_review',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='NEEDS_REVIEW'),
    'auto_publish_allowed',false
  );
end;
$$;

select public.drx_phase11_refresh_candidates_v1();

create table if not exists drx_dose.indication_phrase_candidates_v1 (
  phrase_key text primary key,
  normalized_phrase text not null unique,
  phrase_example text not null,
  regimen_count integer not null default 0,
  product_count integer not null default 0,
  substance_count integer not null default 0,
  structured_candidate_count integer not null default 0,
  text_only_count integer not null default 0,
  blocked_count integer not null default 0,
  review_status text not null default 'PENDING'
    check (review_status in ('PENDING','APPROVED','REJECTED')),
  mapped_indication_id uuid references public.dose_indication_concepts_v3(indication_id) on delete restrict,
  reviewed_by text,
  reviewed_at timestamptz,
  auto_bind_allowed boolean not null default false check (auto_bind_allowed=false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    review_status='PENDING'
    or (nullif(btrim(reviewed_by),'') is not null and reviewed_at is not null)
  ),
  check (
    review_status<>'APPROVED' or mapped_indication_id is not null
  )
);

create or replace function public.drx_phase11_refresh_indication_phrases_v1()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_rows integer;
begin
  with atoms as (
    select
      c.candidate_id,c.drug_id,c.substance_concept_id,c.parser_status,
      btrim(regexp_replace(x.phrase,'^[[:space:][:punct:]]+|[[:space:][:punct:]]+$','','g')) as phrase
    from drx_dose.rule_candidate_extractions_v1 c
    cross join lateral regexp_split_to_table(coalesce(c.indication_text,''),';') as x(phrase)
  ),
  clean as (
    select *,
      lower(regexp_replace(phrase,'[[:space:]]+',' ','g')) as normalized_phrase
    from atoms
    where length(btrim(phrase))>=3
  ),
  stats as (
    select
      md5(normalized_phrase) as phrase_key,
      normalized_phrase,
      min(phrase) as phrase_example,
      count(*)::integer as regimen_count,
      count(distinct drug_id)::integer as product_count,
      count(distinct substance_concept_id) filter (where substance_concept_id is not null)::integer as substance_count,
      count(*) filter (where parser_status='STRUCTURED_CANDIDATE')::integer as structured_candidate_count,
      count(*) filter (where parser_status='TEXT_ONLY')::integer as text_only_count,
      count(*) filter (where parser_status='BLOCKED')::integer as blocked_count
    from clean
    group by normalized_phrase
  )
  insert into drx_dose.indication_phrase_candidates_v1(
    phrase_key,normalized_phrase,phrase_example,regimen_count,product_count,substance_count,
    structured_candidate_count,text_only_count,blocked_count,updated_at
  )
  select phrase_key,normalized_phrase,phrase_example,regimen_count,product_count,substance_count,
         structured_candidate_count,text_only_count,blocked_count,now()
  from stats
  on conflict (phrase_key) do update set
    normalized_phrase=excluded.normalized_phrase,
    phrase_example=excluded.phrase_example,
    regimen_count=excluded.regimen_count,
    product_count=excluded.product_count,
    substance_count=excluded.substance_count,
    structured_candidate_count=excluded.structured_candidate_count,
    text_only_count=excluded.text_only_count,
    blocked_count=excluded.blocked_count,
    updated_at=now()
  where drx_dose.indication_phrase_candidates_v1.review_status='PENDING';

  get diagnostics v_rows=row_count;
  return jsonb_build_object(
    'refreshedRows',v_rows,
    'phraseCandidates',(select count(*) from drx_dose.indication_phrase_candidates_v1),
    'pending',(select count(*) from drx_dose.indication_phrase_candidates_v1 where review_status='PENDING'),
    'autoBindAllowed',false
  );
end;
$$;

select public.drx_phase11_refresh_indication_phrases_v1();

create or replace view drx_dose.indication_phrase_review_queue_v1 as
select
  phrase_key,normalized_phrase,phrase_example,
  regimen_count,product_count,substance_count,structured_candidate_count,text_only_count,blocked_count,
  (
    structured_candidate_count*100 + product_count*10 + substance_count*5 + least(regimen_count,50)
  )::integer as priority_score,
  review_status,mapped_indication_id,auto_bind_allowed
from drx_dose.indication_phrase_candidates_v1
where review_status='PENDING';

create table if not exists drx_dose.indication_text_bindings_v1 (
  indication_text_key text primary key,
  normalized_indication_text text not null unique,
  indication_id uuid not null references public.dose_indication_concepts_v3(indication_id) on delete restrict,
  binding_status text not null default 'IN_REVIEW'
    check (binding_status in ('IN_REVIEW','VERIFIED','REJECTED','RETIRED')),
  verified_by text,
  verified_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    binding_status<>'VERIFIED'
    or (nullif(btrim(verified_by),'') is not null and verified_at is not null)
  )
);

-- Harden indication resolution: only explicitly verified terms on published concepts,
-- or explicit VERIFIED exact-text bindings, may satisfy the promotion gate.
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
indication_candidates as (
  select c.candidate_id,t.indication_id
  from drx_dose.rule_candidate_extractions_v1 c
  join public.dose_indication_terms_v3 t
    on lower(regexp_replace(btrim(t.term),'[[:space:]]+',' ','g'))
       = lower(regexp_replace(btrim(c.indication_text),'[[:space:]]+',' ','g'))
   and t.verified_at is not null
  join public.dose_indication_concepts_v3 i
    on i.indication_id=t.indication_id
   and i.editorial_status='published'
  union
  select c.candidate_id,b.indication_id
  from drx_dose.rule_candidate_extractions_v1 c
  join drx_dose.indication_text_bindings_v1 b
    on b.normalized_indication_text=
       lower(regexp_replace(btrim(c.indication_text),'[[:space:]]+',' ','g'))
   and b.binding_status='VERIFIED'
  join public.dose_indication_concepts_v3 i
    on i.indication_id=b.indication_id
   and i.editorial_status='published'
),
indication_match as (
  select candidate_id,
         count(distinct indication_id)::integer as matching_indication_count,
         min(indication_id::text)::uuid as single_indication_id
  from indication_candidates
  group by candidate_id
)
select
  c.candidate_id,c.legacy_regimen_id,c.drug_id,c.registry_number,c.trade_name,
  c.target_kind,c.substance_concept_id,c.ingredient_set_id,c.ingredient_concept_ids,
  c.patient_group,c.normalized_route_keys,c.form_family,c.release_key,
  c.indication_text,c.dose_text,c.source_url,c.parser_status,c.parser_confidence,
  c.parsed_rule_payload,c.reason_codes,
  sm.matching_snapshot_count,sm.single_snapshot_id,sm.single_section_sha256,
  coalesce(im.matching_indication_count,0) as matching_indication_count,
  im.single_indication_id,
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
    case when coalesce(im.matching_indication_count,0)<>1 then 'VERIFIED_INDICATION_BINDING' end,
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
    and coalesce(im.matching_indication_count,0)=1
    and c.review_status='APPROVED'
  ) as promotion_ready,
  false::boolean as auto_publish_allowed
from drx_dose.rule_candidate_extractions_v1 c
join source_match sm on sm.candidate_id=c.candidate_id
left join indication_match im on im.candidate_id=c.candidate_id;

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
  p.drug_id,p.registry_number::text,
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
  q.candidate_id,q.registry_number::text||':'||q.patient_group,q.promotion_blockers
from drx_dose.rule_candidate_promotion_queue_v1 q
where not q.promotion_ready;

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

alter table drx_dose.indication_phrase_candidates_v1 enable row level security;
alter table drx_dose.indication_text_bindings_v1 enable row level security;

revoke all on drx_dose.indication_phrase_candidates_v1 from public,anon,authenticated;
revoke all on drx_dose.indication_phrase_review_queue_v1 from public,anon,authenticated;
revoke all on drx_dose.indication_text_bindings_v1 from public,anon,authenticated;
grant select,insert,update on drx_dose.indication_phrase_candidates_v1 to service_role;
grant select on drx_dose.indication_phrase_review_queue_v1 to service_role;
grant select,insert,update on drx_dose.indication_text_bindings_v1 to service_role;

revoke all on function public.drx_phase11_refresh_indication_phrases_v1() from public,anon,authenticated;
grant execute on function public.drx_phase11_refresh_indication_phrases_v1() to service_role;
