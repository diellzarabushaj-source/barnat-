-- DRx Phase 11CN: human-reviewed legacy parity + explicit atomic rule release.
-- Fail-closed: no legacy difference is auto-accepted and no Phase 11 rule/product
-- is published without an explicit reviewer attestation.

create or replace view drx_dose.phase11_legacy_candidate_rows_v1 as
with base as (
  select
    b.binding_id,
    r3.rule_id,r3.rule_key,r3.regimen_key,r3.editorial_status as rule_status,
    p3.product_id,p3.drug_id,p3.product_key,p3.registry_number,p3.trade_name,
    p3.editorial_status as product_status,
    i3.indication_key,
    r2.rule_key as legacy_rule_key,
    jsonb_build_object(
      'patientGroup',r3.patient_group,
      'calculationMethod',r3.calculation_method,
      'doseMinValue',r3.dose_min_value,
      'doseMaxValue',r3.dose_max_value,
      'doseUnit',case when r3.dose_unit is null then null else lower(btrim(r3.dose_unit)) end,
      'doseBasis',r3.dose_basis,
      'weightBasis',r3.weight_basis,
      'frequencyMode',r3.frequency_mode,
      'intervalMinHours',r3.interval_min_hours,
      'intervalMaxHours',r3.interval_max_hours,
      'timesPerDay',r3.times_per_day,
      'maxSingleDoseMg',r3.max_single_dose_mg,
      'maxDailyDoseMg',r3.max_daily_dose_mg,
      'maxDoses24h',r3.max_doses_24h,
      'durationMode',r3.duration_mode,
      'durationMinDays',r3.duration_min_days,
      'durationMaxDays',r3.duration_max_days,
      'reviewAfterDays',r3.review_after_days,
      'minAgeMonths',r3.min_age_months,
      'maxAgeMonths',r3.max_age_months,
      'minWeightKg',r3.min_weight_kg,
      'maxWeightKg',r3.max_weight_kg,
      'route',case when r3.route is null then null else upper(btrim(r3.route)) end,
      'prn',r3.prn,
      'renalAdjustmentRequired',r3.renal_adjustment_required,
      'specialistOnly',r3.specialist_only,
      'outOfRangeAction',r3.out_of_range_action
    ) as v3_rule_json,
    case when r2.rule_key is null then null else jsonb_build_object(
      'patientGroup',r2.patient_group,
      'calculationMethod',r2.calculation_method,
      'doseMinValue',r2.dose_min_value,
      'doseMaxValue',r2.dose_max_value,
      'doseUnit',case when r2.dose_unit is null then null else lower(btrim(r2.dose_unit)) end,
      'doseBasis',r2.dose_basis,
      'weightBasis',r2.weight_basis,
      'frequencyMode',r2.frequency_mode,
      'intervalMinHours',r2.interval_min_hours,
      'intervalMaxHours',r2.interval_max_hours,
      'timesPerDay',r2.times_per_day,
      'maxSingleDoseMg',r2.max_single_dose_mg,
      'maxDailyDoseMg',r2.max_daily_dose_mg,
      'maxDoses24h',r2.max_doses_24h,
      'durationMode',r2.duration_mode,
      'durationMinDays',r2.duration_min_days,
      'durationMaxDays',r2.duration_max_days,
      'reviewAfterDays',r2.review_after_days,
      'minAgeMonths',r2.min_age_months,
      'maxAgeMonths',r2.max_age_months,
      'minWeightKg',r2.min_weight_kg,
      'maxWeightKg',r2.max_weight_kg,
      'route',upper(btrim(r2.route)),
      'prn',r2.prn,
      'renalAdjustmentRequired',r2.renal_adjustment_required,
      'specialistOnly',r2.specialist_only,
      'outOfRangeAction',r2.out_of_range_action
    ) end as legacy_rule_json
  from public.dose_rule_products_v3 b
  join public.dose_rules_v3 r3
    on r3.rule_id=b.rule_id
   and r3.regimen_key is not null
   and r3.editorial_status in ('verified','published')
  join public.dose_products_v3 p3
    on p3.product_id=b.product_id
  join public.dose_indication_concepts_v3 i3
    on i3.indication_id=r3.indication_id
  left join public.dose_products_v2 p2
    on p2.drug_id=p3.drug_id
   and p2.editorial_status='published'
   and p2.active
  left join public.dose_rule_products_v2 b2
    on b2.product_key=p2.product_key
   and b2.editorial_status='published'
   and b2.active
  left join public.dose_rules_v2 r2
    on r2.rule_key=b2.rule_key
   and r2.editorial_status='published'
   and r2.active
   and r2.indication_key=i3.indication_key
   and r2.patient_group=case
     when r3.patient_group='age_band' then 'pediatric_only'
     else r3.patient_group
   end
   and upper(btrim(r2.route))=upper(btrim(coalesce(r3.route,'')))
  where b.binding_status='verified'
),
diffed as (
  select
    b.*,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'field',v.key,
          'legacy',l.value,
          'v3',v.value
        ) order by v.key
      )
      from jsonb_each(b.v3_rule_json) v
      join jsonb_each(b.legacy_rule_json) l on l.key=v.key
      where b.legacy_rule_key is not null
        and v.value <> 'null'::jsonb
        and l.value <> 'null'::jsonb
        and v.value is distinct from l.value
    ),'[]'::jsonb) as conflicts,
    coalesce((
      select array_agg(v.key order by v.key)
      from jsonb_each(b.v3_rule_json) v
      join jsonb_each(b.legacy_rule_json) l on l.key=v.key
      where b.legacy_rule_key is not null
        and ((v.value='null'::jsonb) <> (l.value='null'::jsonb))
    ),'{}'::text[]) as missing_fields
  from base b
)
select
  d.*,
  case
    when d.legacy_rule_key is null then 'new_rule'
    when jsonb_array_length(d.conflicts)=0
     and cardinality(d.missing_fields)=0 then 'exact'
    when jsonb_array_length(d.conflicts)=0 then 'missing'
    else 'conflict'
  end as candidate_status
from diffed d;

create or replace view drx_dose.phase11_legacy_comparison_preview_v1 as
select
  binding_id,rule_id,rule_key,regimen_key,rule_status,
  product_id,drug_id,product_key,registry_number,trade_name,product_status,indication_key,
  count(legacy_rule_key) as candidate_count,
  coalesce(
    array_agg(legacy_rule_key order by legacy_rule_key)
      filter (where legacy_rule_key is not null),
    '{}'::text[]
  ) as candidate_rule_keys,
  case when count(legacy_rule_key)=1 then max(legacy_rule_key) end
    as only_legacy_rule_key,
  case when count(legacy_rule_key)=1 then max(candidate_status) end
    as only_candidate_status,
  case when count(legacy_rule_key)=1 then max(conflicts::text)::jsonb end
    as only_conflicts,
  case when count(legacy_rule_key)=1 then
    coalesce(
      string_to_array(max(array_to_string(missing_fields,'|')),'|'),
      '{}'::text[]
    )
  end as only_missing_fields,
  false::boolean as auto_accept_allowed,
  false::boolean as auto_publish_allowed
from drx_dose.phase11_legacy_candidate_rows_v1
group by
  binding_id,rule_id,rule_key,regimen_key,rule_status,
  product_id,drug_id,product_key,registry_number,trade_name,product_status,indication_key;

create table if not exists drx_dose.phase11_legacy_comparison_review_events_v1 (
  event_id uuid primary key default gen_random_uuid(),
  comparison_id uuid not null
    references public.dose_legacy_comparisons_v3(comparison_id) on delete restrict,
  rule_id uuid not null
    references public.dose_rules_v3(rule_id) on delete restrict,
  product_id uuid not null
    references public.dose_products_v3(product_id) on delete restrict,
  selected_legacy_rule_key text,
  decision text not null check (
    decision in (
      'EXACT_CONFIRMED',
      'SOURCE_CORRECTION_CONFIRMED',
      'NEW_RULE_CONFIRMED',
      'REJECTED'
    )
  ),
  reviewer text not null check (nullif(btrim(reviewer),'') is not null),
  review_note text not null check (nullif(btrim(review_note),'') is not null),
  preview_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create or replace view drx_dose.phase11_legacy_comparison_review_queue_v1 as
select
  p.*,
  c.comparison_id,
  c.comparison_status,
  c.conflicts as stored_conflicts,
  c.missing_fields as stored_missing_fields,
  c.compared_at,
  e.decision as review_decision,
  e.reviewer,
  e.review_note,
  e.created_at as reviewed_at,
  (
    c.comparison_id is not null
    and e.decision in (
      'EXACT_CONFIRMED',
      'SOURCE_CORRECTION_CONFIRMED',
      'NEW_RULE_CONFIRMED'
    )
    and c.comparison_status in ('exact','compatible','not_applicable')
  ) as legacy_gate_pass,
  case
    when e.decision='REJECTED' then 'REJECTED'
    when c.comparison_id is not null
      and e.decision in (
        'EXACT_CONFIRMED',
        'SOURCE_CORRECTION_CONFIRMED',
        'NEW_RULE_CONFIRMED'
      )
      and c.comparison_status in ('exact','compatible','not_applicable')
      then 'LEGACY_REVIEW_COMPLETE'
    when p.candidate_count=0 then 'REVIEW_NEW_RULE'
    when p.candidate_count=1 and p.only_candidate_status='exact'
      then 'CONFIRM_EXACT'
    when p.candidate_count=1 then 'REVIEW_SOURCE_DIFFERENCE'
    else 'SELECT_LEGACY_CANDIDATE'
  end as next_action
from drx_dose.phase11_legacy_comparison_preview_v1 p
left join public.dose_legacy_comparisons_v3 c
  on c.rule_id=p.rule_id
 and c.product_id=p.product_id
left join lateral (
  select x.*
  from drx_dose.phase11_legacy_comparison_review_events_v1 x
  where x.comparison_id=c.comparison_id
  order by x.created_at desc,x.event_id desc
  limit 1
) e on true;

create or replace function public.drx_phase11_review_legacy_comparison_v1(
  p_rule_id uuid,
  p_product_id uuid,
  p_legacy_rule_key text,
  p_decision text,
  p_reviewer text,
  p_attestation text,
  p_review_note text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_preview drx_dose.phase11_legacy_comparison_preview_v1%rowtype;
  v_candidate drx_dose.phase11_legacy_candidate_rows_v1%rowtype;
  v_decision text := upper(btrim(coalesce(p_decision,'')));
  v_selected text := nullif(btrim(coalesce(p_legacy_rule_key,'')),'');
  v_status text;
  v_conflicts jsonb := '[]'::jsonb;
  v_missing text[] := '{}'::text[];
  v_comparison_id uuid;
  v_snapshot jsonb;
begin
  if p_rule_id is null or p_product_id is null then
    raise exception 'rule_id and product_id are required';
  end if;

  if v_decision not in (
    'EXACT_CONFIRMED',
    'SOURCE_CORRECTION_CONFIRMED',
    'NEW_RULE_CONFIRMED',
    'REJECTED'
  ) then
    raise exception 'Unsupported legacy comparison decision';
  end if;

  if nullif(btrim(p_reviewer),'') is null then
    raise exception 'reviewer is required';
  end if;
  if nullif(btrim(p_review_note),'') is null then
    raise exception 'review_note is required';
  end if;
  if p_attestation<>'LEGACY_COMPARISON_REVIEW_ATTESTED' then
    raise exception 'Explicit legacy-comparison review attestation is required';
  end if;

  perform 1
  from public.dose_rules_v3
  where rule_id=p_rule_id
  for update;

  if not found then
    raise exception 'Unknown V3 rule';
  end if;

  select *
  into v_preview
  from drx_dose.phase11_legacy_comparison_preview_v1
  where rule_id=p_rule_id
    and product_id=p_product_id;

  if not found then
    raise exception
      'No VERIFIED Phase 11 rule-product binding is eligible for legacy review';
  end if;

  if v_preview.candidate_count=0 then
    if v_decision not in ('NEW_RULE_CONFIRMED','REJECTED') then
      raise exception
        'No legacy rule candidate exists; decision must be NEW_RULE_CONFIRMED or REJECTED';
    end if;

    v_selected := null;
    v_status := case
      when v_decision='NEW_RULE_CONFIRMED' then 'not_applicable'
      else 'conflict'
    end;
  else
    if v_selected is null then
      if v_preview.candidate_count=1 then
        v_selected := v_preview.only_legacy_rule_key;
      else
        raise exception
          'Multiple legacy candidates exist; select p_legacy_rule_key explicitly';
      end if;
    end if;

    select *
    into v_candidate
    from drx_dose.phase11_legacy_candidate_rows_v1
    where rule_id=p_rule_id
      and product_id=p_product_id
      and legacy_rule_key=v_selected;

    if not found then
      raise exception
        'Selected legacy rule is not an eligible candidate for this V3 binding';
    end if;

    v_conflicts := v_candidate.conflicts;
    v_missing := v_candidate.missing_fields;

    if v_decision='EXACT_CONFIRMED'
       and v_candidate.candidate_status<>'exact' then
      raise exception
        'EXACT_CONFIRMED requires an exact shared-field comparison';
    end if;

    if v_decision='SOURCE_CORRECTION_CONFIRMED'
       and v_candidate.candidate_status='exact' then
      raise exception
        'SOURCE_CORRECTION_CONFIRMED requires a real legacy difference';
    end if;

    if v_decision='NEW_RULE_CONFIRMED' then
      raise exception
        'NEW_RULE_CONFIRMED is invalid when a legacy candidate exists';
    end if;

    v_status := case
      when v_decision='EXACT_CONFIRMED' then 'exact'
      when v_decision='SOURCE_CORRECTION_CONFIRMED' then 'compatible'
      else 'conflict'
    end;
  end if;

  insert into public.dose_legacy_comparisons_v3(
    rule_id,
    product_id,
    legacy_regimen_id,
    comparison_status,
    conflicts,
    missing_fields,
    compared_at
  )
  values (
    p_rule_id,
    p_product_id,
    null,
    v_status,
    v_conflicts,
    v_missing,
    now()
  )
  on conflict (rule_id,product_id) do update
  set comparison_status=excluded.comparison_status,
      conflicts=excluded.conflicts,
      missing_fields=excluded.missing_fields,
      compared_at=excluded.compared_at
  returning comparison_id into v_comparison_id;

  v_snapshot := jsonb_build_object(
    'preview',to_jsonb(v_preview),
    'selectedLegacyRuleKey',v_selected,
    'selectedCandidate',
      case when v_selected is null then null else to_jsonb(v_candidate) end,
    'decision',v_decision,
    'storedComparisonStatus',v_status
  );

  insert into drx_dose.phase11_legacy_comparison_review_events_v1(
    comparison_id,
    rule_id,
    product_id,
    selected_legacy_rule_key,
    decision,
    reviewer,
    review_note,
    preview_snapshot
  )
  values (
    v_comparison_id,
    p_rule_id,
    p_product_id,
    v_selected,
    v_decision,
    btrim(p_reviewer),
    btrim(p_review_note),
    v_snapshot
  );

  return jsonb_build_object(
    'ok',true,
    'comparisonId',v_comparison_id,
    'ruleId',p_rule_id,
    'productId',p_product_id,
    'legacyRuleKey',v_selected,
    'decision',v_decision,
    'comparisonStatus',v_status,
    'autoPublished',false
  );
end;
$$;

create or replace view drx_dose.phase11_rule_release_readiness_v1 as
with binding_stats as (
  select
    r.rule_id,
    count(*) filter (where b.binding_status='verified')
      as verified_bindings,
    count(*) filter (
      where b.binding_status='verified'
        and p.editorial_status in ('verified','published')
    ) as product_ready_bindings,
    count(*) filter (
      where b.binding_status='verified'
        and q.canonical_match_current
    ) as canonical_current_bindings,
    count(*) filter (
      where b.binding_status='verified'
        and l.legacy_gate_pass
    ) as legacy_ready_bindings,
    coalesce(
      array_agg(p.product_id order by p.product_id)
        filter (where b.binding_status='verified'),
      '{}'::uuid[]
    ) as product_ids
  from public.dose_rules_v3 r
  left join public.dose_rule_products_v3 b
    on b.rule_id=r.rule_id
  left join public.dose_products_v3 p
    on p.product_id=b.product_id
  left join drx_dose.phase11_rule_product_binding_queue_v1 q
    on q.binding_id=b.binding_id
  left join drx_dose.phase11_legacy_comparison_review_queue_v1 l
    on l.rule_id=r.rule_id
   and l.product_id=p.product_id
  where r.regimen_key is not null
  group by r.rule_id
)
select
  r.rule_id,
  r.rule_key,
  r.regimen_key,
  r.editorial_status,
  r.safety_validation_status,
  r.verified_by,
  r.verified_at,
  coalesce(bs.verified_bindings,0) as verified_bindings,
  coalesce(bs.product_ready_bindings,0) as product_ready_bindings,
  coalesce(bs.canonical_current_bindings,0) as canonical_current_bindings,
  coalesce(bs.legacy_ready_bindings,0) as legacy_ready_bindings,
  coalesce(bs.product_ids,'{}'::uuid[]) as product_ids,
  exists (
    select 1
    from drx_dose.rule_targets_v1 t
    where t.rule_id=r.rule_id
      and t.binding_status='VERIFIED'
  ) as target_verified,
  exists (
    select 1
    from public.dose_indication_concepts_v3 i
    where i.indication_id=r.indication_id
      and i.editorial_status='published'
      and i.icd_verification_status='verified'
  ) as indication_published_icd_verified,
  not exists (
    select 1
    from drx_dose.source_regimen_applicable_safety_v2 s
    where s.regimen_key=r.regimen_key
      and s.review_status not in ('APPROVED','PROMOTED','REJECTED')
  ) as safety_review_complete,
  not exists (
    select 1
    from drx_dose.source_regimen_applicable_safety_v2 s
    join drx_dose.source_adjustment_candidates_v1 a
      on a.adjustment_key=s.candidate_key
     and s.candidate_type='ADJUSTMENT'
     and a.review_status='APPROVED'
     and s.source_snapshot_id=r.source_snapshot_id
    where s.regimen_key=r.regimen_key
      and not exists (
        select 1
        from public.dose_renal_adjustments_v3 x
        where a.adjustment_domain='RENAL'
          and x.rule_id=r.rule_id
          and x.phase11_source_adjustment_key=a.adjustment_key
          and x.review_status='verified'
        union all
        select 1
        from public.dose_hepatic_adjustments_v3 x
        where a.adjustment_domain='HEPATIC'
          and x.rule_id=r.rule_id
          and x.phase11_source_adjustment_key=a.adjustment_key
          and x.review_status='verified'
      )
  ) as approved_adjustments_materialized,
  array_remove(array[
    case
      when r.editorial_status<>'verified'
      then 'RULE_NOT_VERIFIED'
    end,
    case
      when r.safety_validation_status<>'passed'
      then 'SAFETY_VALIDATION_NOT_PASSED'
    end,
    case
      when nullif(btrim(r.verified_by),'') is null
        or r.verified_at is null
      then 'RULE_REVIEW_PROVENANCE_MISSING'
    end,
    case
      when not exists (
        select 1
        from drx_dose.rule_targets_v1 t
        where t.rule_id=r.rule_id
          and t.binding_status='VERIFIED'
      )
      then 'RULE_TARGET_NOT_VERIFIED'
    end,
    case
      when not exists (
        select 1
        from public.dose_indication_concepts_v3 i
        where i.indication_id=r.indication_id
          and i.editorial_status='published'
          and i.icd_verification_status='verified'
      )
      then 'INDICATION_NOT_PUBLISHED_ICD_VERIFIED'
    end,
    case
      when exists (
        select 1
        from drx_dose.source_regimen_applicable_safety_v2 s
        where s.regimen_key=r.regimen_key
          and s.review_status not in ('APPROVED','PROMOTED','REJECTED')
      )
      then 'SAFETY_REVIEW_INCOMPLETE'
    end,
    case
      when coalesce(bs.verified_bindings,0)=0
      then 'NO_VERIFIED_PRODUCT_BINDING'
    end,
    case
      when coalesce(bs.product_ready_bindings,0)
           <> coalesce(bs.verified_bindings,0)
      then 'BOUND_PRODUCT_NOT_VERIFIED'
    end,
    case
      when coalesce(bs.canonical_current_bindings,0)
           <> coalesce(bs.verified_bindings,0)
      then 'BINDING_CANONICAL_MATCH_STALE'
    end,
    case
      when coalesce(bs.legacy_ready_bindings,0)
           <> coalesce(bs.verified_bindings,0)
      then 'LEGACY_COMPARISON_REVIEW_INCOMPLETE'
    end,
    case
      when exists (
        select 1
        from drx_dose.source_regimen_applicable_safety_v2 s
        join drx_dose.source_adjustment_candidates_v1 a
          on a.adjustment_key=s.candidate_key
         and s.candidate_type='ADJUSTMENT'
         and a.review_status='APPROVED'
         and s.source_snapshot_id=r.source_snapshot_id
        where s.regimen_key=r.regimen_key
          and not exists (
            select 1
            from public.dose_renal_adjustments_v3 x
            where a.adjustment_domain='RENAL'
              and x.rule_id=r.rule_id
              and x.phase11_source_adjustment_key=a.adjustment_key
              and x.review_status='verified'
            union all
            select 1
            from public.dose_hepatic_adjustments_v3 x
            where a.adjustment_domain='HEPATIC'
              and x.rule_id=r.rule_id
              and x.phase11_source_adjustment_key=a.adjustment_key
              and x.review_status='verified'
          )
      )
      then 'APPROVED_ADJUSTMENT_NOT_MATERIALIZED'
    end
  ],null) as release_blockers,
  false::boolean as auto_publish_allowed
from public.dose_rules_v3 r
left join binding_stats bs
  on bs.rule_id=r.rule_id
where r.regimen_key is not null;

create or replace view drx_dose.phase11_publication_queue_v1 as
select
  q.*,
  cardinality(q.release_blockers)=0 as ready_for_release,
  case
    when q.editorial_status='published' then 'PUBLISHED'
    when cardinality(q.release_blockers)=0
      then 'READY_FOR_EXPLICIT_RELEASE'
    else 'BLOCKED'
  end as next_action
from drx_dose.phase11_rule_release_readiness_v1 q;

create table if not exists drx_dose.phase11_publication_events_v1 (
  event_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null
    references public.dose_rules_v3(rule_id) on delete restrict,
  product_ids uuid[] not null,
  reviewer text not null check (nullif(btrim(reviewer),'') is not null),
  review_note text not null check (nullif(btrim(review_note),'') is not null),
  readiness_snapshot jsonb not null,
  before_rule jsonb not null,
  after_rule jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function drx_dose.guard_phase11_legacy_publication_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.editorial_status<>'published'
     or new.regimen_key is null then
    return new;
  end if;

  if tg_op='UPDATE'
     and old.editorial_status='published' then
    return new;
  end if;

  if exists (
    select 1
    from public.dose_rule_products_v3 b
    where b.rule_id=new.rule_id
      and b.binding_status='verified'
      and not exists (
        select 1
        from drx_dose.phase11_legacy_comparison_review_queue_v1 l
        where l.rule_id=new.rule_id
          and l.product_id=b.product_id
          and l.legacy_gate_pass
      )
  ) then
    raise exception
      'DRx Phase 11 publication blocked: legacy comparison review is incomplete';
  end if;

  return new;
end;
$$;

drop trigger if exists dose_rules_v3_phase11_legacy_publication_guard
  on public.dose_rules_v3;

create trigger dose_rules_v3_phase11_legacy_publication_guard
before insert or update of editorial_status
on public.dose_rules_v3
for each row
execute function drx_dose.guard_phase11_legacy_publication_v1();

create or replace function public.drx_phase11_publish_verified_rule_release_v1(
  p_rule_id uuid,
  p_reviewer text,
  p_attestation text,
  p_review_note text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_ready drx_dose.phase11_publication_queue_v1%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_products uuid[];
begin
  if p_rule_id is null then
    raise exception 'rule_id is required';
  end if;
  if nullif(btrim(p_reviewer),'') is null then
    raise exception 'reviewer is required';
  end if;
  if nullif(btrim(p_review_note),'') is null then
    raise exception 'review_note is required';
  end if;
  if p_attestation<>'PHASE11_RULE_RELEASE_ATTESTED' then
    raise exception 'Explicit Phase 11 rule release attestation is required';
  end if;

  perform 1
  from public.dose_rules_v3
  where rule_id=p_rule_id
  for update;

  if not found then
    raise exception 'Unknown V3 rule';
  end if;

  select *
  into v_ready
  from drx_dose.phase11_publication_queue_v1
  where rule_id=p_rule_id;

  if not found then
    raise exception 'Rule is not a Phase 11 prepared rule';
  end if;

  if not v_ready.ready_for_release then
    raise exception
      'Phase 11 release blocked: %',
      array_to_string(v_ready.release_blockers,',');
  end if;

  v_products := v_ready.product_ids;

  select to_jsonb(r)
  into v_before
  from public.dose_rules_v3 r
  where r.rule_id=p_rule_id;

  update public.dose_products_v3 p
  set editorial_status='published',
      updated_at=now()
  where p.product_id=any(v_products)
    and p.editorial_status='verified';

  update public.dose_rules_v3
  set editorial_status='published',
      updated_at=now()
  where rule_id=p_rule_id
    and editorial_status='verified';

  select to_jsonb(r)
  into v_after
  from public.dose_rules_v3 r
  where r.rule_id=p_rule_id;

  insert into drx_dose.phase11_publication_events_v1(
    rule_id,
    product_ids,
    reviewer,
    review_note,
    readiness_snapshot,
    before_rule,
    after_rule
  )
  values (
    p_rule_id,
    v_products,
    btrim(p_reviewer),
    btrim(p_review_note),
    to_jsonb(v_ready),
    v_before,
    v_after
  );

  return jsonb_build_object(
    'ok',true,
    'ruleId',p_rule_id,
    'productIds',v_products,
    'ruleStatus','published',
    'productsPublished',true,
    'automaticPublication',false
  );
end;
$$;

create or replace function public.drx_phase11_publication_workbench_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select jsonb_build_object(
  'legacySummary',jsonb_build_object(
    'bindings',(
      select count(*)
      from drx_dose.phase11_legacy_comparison_review_queue_v1
    ),
    'reviewComplete',(
      select count(*)
      from drx_dose.phase11_legacy_comparison_review_queue_v1
      where legacy_gate_pass
    ),
    'exactCandidates',(
      select count(*)
      from drx_dose.phase11_legacy_comparison_review_queue_v1
      where candidate_count=1
        and only_candidate_status='exact'
    ),
    'differenceCandidates',(
      select count(*)
      from drx_dose.phase11_legacy_comparison_review_queue_v1
      where candidate_count=1
        and only_candidate_status in ('conflict','missing')
    ),
    'newRuleCandidates',(
      select count(*)
      from drx_dose.phase11_legacy_comparison_review_queue_v1
      where candidate_count=0
    ),
    'ambiguousCandidates',(
      select count(*)
      from drx_dose.phase11_legacy_comparison_review_queue_v1
      where candidate_count>1
    )
  ),
  'legacy',coalesce((
    select jsonb_agg(jsonb_build_object(
      'ruleId',q.rule_id,
      'ruleKey',q.rule_key,
      'regimenKey',q.regimen_key,
      'productId',q.product_id,
      'tradeName',q.trade_name,
      'registryNumber',q.registry_number,
      'candidateCount',q.candidate_count,
      'candidateRuleKeys',q.candidate_rule_keys,
      'onlyLegacyRuleKey',q.only_legacy_rule_key,
      'candidateStatus',q.only_candidate_status,
      'conflicts',q.only_conflicts,
      'missingFields',q.only_missing_fields,
      'reviewDecision',q.review_decision,
      'legacyGatePass',q.legacy_gate_pass,
      'nextAction',q.next_action
    ) order by q.regimen_key,q.rule_key,q.registry_number)
    from drx_dose.phase11_legacy_comparison_review_queue_v1 q
  ),'[]'::jsonb),
  'publicationSummary',jsonb_build_object(
    'phase11Rules',(
      select count(*)
      from drx_dose.phase11_publication_queue_v1
    ),
    'ready',(
      select count(*)
      from drx_dose.phase11_publication_queue_v1
      where ready_for_release
    ),
    'published',(
      select count(*)
      from drx_dose.phase11_publication_queue_v1
      where editorial_status='published'
    ),
    'blocked',(
      select count(*)
      from drx_dose.phase11_publication_queue_v1
      where editorial_status<>'published'
        and not ready_for_release
    )
  ),
  'publication',coalesce((
    select jsonb_agg(jsonb_build_object(
      'ruleId',q.rule_id,
      'ruleKey',q.rule_key,
      'regimenKey',q.regimen_key,
      'editorialStatus',q.editorial_status,
      'verifiedBindings',q.verified_bindings,
      'legacyReadyBindings',q.legacy_ready_bindings,
      'productIds',q.product_ids,
      'blockers',q.release_blockers,
      'readyForRelease',q.ready_for_release,
      'nextAction',q.next_action
    ) order by q.regimen_key,q.rule_key)
    from drx_dose.phase11_publication_queue_v1 q
  ),'[]'::jsonb),
  'autoPublishAllowed',false
);
$$;

alter table drx_dose.phase11_legacy_comparison_review_events_v1
  enable row level security;
alter table drx_dose.phase11_publication_events_v1
  enable row level security;

revoke all on drx_dose.phase11_legacy_candidate_rows_v1
  from public,anon,authenticated;
revoke all on drx_dose.phase11_legacy_comparison_preview_v1
  from public,anon,authenticated;
revoke all on drx_dose.phase11_legacy_comparison_review_queue_v1
  from public,anon,authenticated;
revoke all on drx_dose.phase11_rule_release_readiness_v1
  from public,anon,authenticated;
revoke all on drx_dose.phase11_publication_queue_v1
  from public,anon,authenticated;
revoke all on drx_dose.phase11_legacy_comparison_review_events_v1
  from public,anon,authenticated;
revoke all on drx_dose.phase11_publication_events_v1
  from public,anon,authenticated;

grant select on drx_dose.phase11_legacy_candidate_rows_v1
  to service_role;
grant select on drx_dose.phase11_legacy_comparison_preview_v1
  to service_role;
grant select on drx_dose.phase11_legacy_comparison_review_queue_v1
  to service_role;
grant select on drx_dose.phase11_rule_release_readiness_v1
  to service_role;
grant select on drx_dose.phase11_publication_queue_v1
  to service_role;
grant select on drx_dose.phase11_legacy_comparison_review_events_v1
  to service_role;
grant select on drx_dose.phase11_publication_events_v1
  to service_role;

revoke all on function public.drx_phase11_review_legacy_comparison_v1(
  uuid,uuid,text,text,text,text,text
) from public,anon,authenticated;
revoke all on function public.drx_phase11_publish_verified_rule_release_v1(
  uuid,text,text,text
) from public,anon,authenticated;
revoke all on function public.drx_phase11_publication_workbench_v1()
  from public,anon,authenticated;
revoke all on function drx_dose.guard_phase11_legacy_publication_v1()
  from public,anon,authenticated;

grant execute on function public.drx_phase11_review_legacy_comparison_v1(
  uuid,uuid,text,text,text,text,text
) to service_role;
grant execute on function public.drx_phase11_publish_verified_rule_release_v1(
  uuid,text,text,text
) to service_role;
grant execute on function public.drx_phase11_publication_workbench_v1()
  to service_role;
