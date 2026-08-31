-- DRx Phase 11CO: Phase 11 shadow evidence + cutover guard.
-- Uses existing privacy-preserving selector hashes. No clinical payload is stored here.
-- MATCH can pass automatically; DIFF/V3_ONLY require explicit reviewer disposition.

create table if not exists drx_dose.phase11_shadow_diff_review_events_v1 (
  event_id uuid primary key default gen_random_uuid(),
  comparison_id uuid not null
    references drx_runtime.shadow_comparisons_v1(comparison_id) on delete restrict,
  product_id uuid not null
    references public.dose_products_v3(product_id) on delete restrict,
  decision text not null check (
    decision in (
      'EXPLAINED_BY_REVIEWED_V3_CHANGE',
      'EXPECTED_V3_ONLY',
      'REJECTED'
    )
  ),
  reviewer text not null check (nullif(btrim(reviewer),'') is not null),
  review_note text not null check (nullif(btrim(review_note),'') is not null),
  evidence_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create or replace view drx_dose.phase11_published_product_release_v1 as
select
  p.product_id,
  p.drug_id,
  p.product_key,
  p.registry_number,
  p.trade_name,
  max(e.created_at) as latest_release_at,
  count(distinct e.rule_id) as released_rule_events
from drx_dose.phase11_publication_events_v1 e
join public.dose_products_v3 p
  on p.product_id=any(e.product_ids)
where p.editorial_status='published'
group by
  p.product_id,p.drug_id,p.product_key,p.registry_number,p.trade_name;

create or replace view drx_dose.phase11_shadow_evidence_v1 as
with products as (
  select
    p.*,
    encode(
      extensions.digest(
        convert_to('drug_id:' || p.drug_id::text,'UTF8'),
        'sha256'
      ),
      'hex'
    ) as drug_id_selector_sha256,
    encode(
      extensions.digest(
        convert_to('product_key:' || p.product_key,'UTF8'),
        'sha256'
      ),
      'hex'
    ) as product_key_selector_sha256,
    case when nullif(btrim(coalesce(p.registry_number,'')),'') is null
      then null
      else encode(
        extensions.digest(
          convert_to('registry_number:' || btrim(p.registry_number),'UTF8'),
          'sha256'
        ),
        'hex'
      )
    end as registry_selector_sha256
  from drx_dose.phase11_published_product_release_v1 p
)
select
  p.product_id,p.drug_id,p.product_key,p.registry_number,p.trade_name,
  p.latest_release_at,p.released_rule_events,
  s.comparison_id,s.selector_kind,s.comparison_status,s.diff_codes,
  s.v2_payload_sha256,s.v3_payload_sha256,s.v2_rule_count,s.v3_rule_count,
  s.duration_ms,s.created_at as shadow_compared_at,
  r.decision as review_decision,
  r.reviewer,r.review_note,r.created_at as shadow_reviewed_at,
  not exists (
    select 1
    from public.dose_rule_products_v3 b
    join public.dose_rules_v3 rule on rule.rule_id=b.rule_id
    where b.product_id=p.product_id
      and b.binding_status='verified'
      and rule.regimen_key is not null
      and rule.editorial_status='published'
      and not exists (
        select 1
        from drx_dose.phase11_legacy_comparison_review_queue_v1 l
        where l.rule_id=rule.rule_id
          and l.product_id=p.product_id
          and l.legacy_gate_pass
      )
  ) as all_published_rules_legacy_reviewed,
  (
    exists (
      select 1
      from public.dose_rule_products_v3 b
      join public.dose_rules_v3 rule on rule.rule_id=b.rule_id
      where b.product_id=p.product_id
        and b.binding_status='verified'
        and rule.regimen_key is not null
        and rule.editorial_status='published'
    )
    and not exists (
      select 1
      from public.dose_rule_products_v3 b
      join public.dose_rules_v3 rule on rule.rule_id=b.rule_id
      left join drx_dose.phase11_legacy_comparison_review_queue_v1 l
        on l.rule_id=rule.rule_id
       and l.product_id=p.product_id
      where b.product_id=p.product_id
        and b.binding_status='verified'
        and rule.regimen_key is not null
        and rule.editorial_status='published'
        and coalesce(l.review_decision,'')<>'NEW_RULE_CONFIRMED'
    )
  ) as all_published_rules_new_rule_confirmed,
  case
    when s.comparison_status='MATCH' then true
    when s.comparison_status='DIFF'
      and r.decision='EXPLAINED_BY_REVIEWED_V3_CHANGE'
      and not exists (
        select 1
        from public.dose_rule_products_v3 b
        join public.dose_rules_v3 rule on rule.rule_id=b.rule_id
        where b.product_id=p.product_id
          and b.binding_status='verified'
          and rule.regimen_key is not null
          and rule.editorial_status='published'
          and not exists (
            select 1
            from drx_dose.phase11_legacy_comparison_review_queue_v1 l
            where l.rule_id=rule.rule_id
              and l.product_id=p.product_id
              and l.legacy_gate_pass
          )
      )
      then true
    when s.comparison_status='V3_ONLY'
      and r.decision='EXPECTED_V3_ONLY'
      and (
        exists (
          select 1
          from public.dose_rule_products_v3 b
          join public.dose_rules_v3 rule on rule.rule_id=b.rule_id
          where b.product_id=p.product_id
            and b.binding_status='verified'
            and rule.regimen_key is not null
            and rule.editorial_status='published'
        )
        and not exists (
          select 1
          from public.dose_rule_products_v3 b
          join public.dose_rules_v3 rule on rule.rule_id=b.rule_id
          left join drx_dose.phase11_legacy_comparison_review_queue_v1 l
            on l.rule_id=rule.rule_id
           and l.product_id=p.product_id
          where b.product_id=p.product_id
            and b.binding_status='verified'
            and rule.regimen_key is not null
            and rule.editorial_status='published'
            and coalesce(l.review_decision,'')<>'NEW_RULE_CONFIRMED'
        )
      )
      then true
    else false
  end as shadow_gate_pass,
  case
    when s.comparison_id is null then 'SHADOW_COMPARISON_MISSING'
    when s.comparison_status='MATCH' then 'MATCH'
    when s.comparison_status='DIFF'
      and r.decision='EXPLAINED_BY_REVIEWED_V3_CHANGE'
      then 'REVIEWED_DIFF'
    when s.comparison_status='V3_ONLY'
      and r.decision='EXPECTED_V3_ONLY'
      then 'REVIEWED_V3_ONLY'
    when r.decision='REJECTED' then 'REJECTED'
    when s.comparison_status in ('DIFF','V3_ONLY') then 'HUMAN_REVIEW_REQUIRED'
    else 'BLOCKED_' || coalesce(s.comparison_status,'UNKNOWN')
  end as next_action,
  false::boolean as auto_diff_accept_allowed,
  false::boolean as auto_cutover_allowed
from products p
left join lateral (
  select x.*
  from drx_runtime.shadow_comparisons_v1 x
  where x.created_at>=p.latest_release_at
    and (
      (x.selector_kind='drug_id'
        and x.selector_sha256=p.drug_id_selector_sha256)
      or
      (x.selector_kind='product_key'
        and x.selector_sha256=p.product_key_selector_sha256)
      or
      (x.selector_kind='registry_number'
        and p.registry_selector_sha256 is not null
        and x.selector_sha256=p.registry_selector_sha256)
    )
  order by x.created_at desc,x.comparison_id desc
  limit 1
) s on true
left join lateral (
  select e.*
  from drx_dose.phase11_shadow_diff_review_events_v1 e
  where e.comparison_id=s.comparison_id
    and e.product_id=p.product_id
  order by e.created_at desc,e.event_id desc
  limit 1
) r on true;

create or replace function public.drx_phase11_review_shadow_diff_v1(
  p_product_id uuid,
  p_comparison_id uuid,
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
  v_evidence drx_dose.phase11_shadow_evidence_v1%rowtype;
  v_decision text := upper(btrim(coalesce(p_decision,'')));
begin
  if p_product_id is null or p_comparison_id is null then
    raise exception 'product_id and comparison_id are required';
  end if;
  if v_decision not in (
    'EXPLAINED_BY_REVIEWED_V3_CHANGE',
    'EXPECTED_V3_ONLY',
    'REJECTED'
  ) then
    raise exception 'Unsupported Phase 11 shadow review decision';
  end if;
  if nullif(btrim(p_reviewer),'') is null then
    raise exception 'reviewer is required';
  end if;
  if nullif(btrim(p_review_note),'') is null then
    raise exception 'review_note is required';
  end if;
  if p_attestation<>'PHASE11_SHADOW_DIFF_REVIEW_ATTESTED' then
    raise exception 'Explicit Phase 11 shadow review attestation is required';
  end if;

  select *
  into v_evidence
  from drx_dose.phase11_shadow_evidence_v1
  where product_id=p_product_id
    and comparison_id=p_comparison_id;

  if not found then
    raise exception
      'Shadow comparison is not the latest post-release comparison for this Phase 11 product';
  end if;

  if v_decision='EXPLAINED_BY_REVIEWED_V3_CHANGE' then
    if v_evidence.comparison_status<>'DIFF' then
      raise exception
        'EXPLAINED_BY_REVIEWED_V3_CHANGE requires comparison_status=DIFF';
    end if;
    if v_evidence.all_published_rules_legacy_reviewed is not true then
      raise exception
        'Phase 11 shadow DIFF cannot be accepted until all published rules pass legacy review';
    end if;
  end if;

  if v_decision='EXPECTED_V3_ONLY' then
    if v_evidence.comparison_status<>'V3_ONLY' then
      raise exception 'EXPECTED_V3_ONLY requires comparison_status=V3_ONLY';
    end if;
    if v_evidence.all_published_rules_new_rule_confirmed is not true then
      raise exception
        'V3_ONLY cannot be accepted unless all published Phase 11 rules are confirmed new rules';
    end if;
  end if;

  insert into drx_dose.phase11_shadow_diff_review_events_v1(
    comparison_id,product_id,decision,reviewer,review_note,evidence_snapshot
  ) values (
    p_comparison_id,p_product_id,v_decision,btrim(p_reviewer),btrim(p_review_note),
    to_jsonb(v_evidence)
  );

  return jsonb_build_object(
    'ok',true,
    'productId',p_product_id,
    'comparisonId',p_comparison_id,
    'decision',v_decision,
    'automaticAcceptance',false
  );
end;
$$;

create or replace view drx_dose.phase11_shadow_summary_v1 as
select
  count(*) as published_products,
  count(*) filter (where comparison_id is not null) as compared_products,
  count(*) filter (where comparison_status='MATCH') as exact_matches,
  count(*) filter (
    where comparison_status='DIFF'
      and review_decision='EXPLAINED_BY_REVIEWED_V3_CHANGE'
  ) as reviewed_diffs,
  count(*) filter (
    where comparison_status='V3_ONLY'
      and review_decision='EXPECTED_V3_ONLY'
  ) as reviewed_v3_only,
  count(*) filter (where shadow_gate_pass) as shadow_gate_pass_products,
  count(*) filter (where not shadow_gate_pass) as shadow_gate_blocked_products,
  (count(*)=count(*) filter (where shadow_gate_pass)) as shadow_gate_complete,
  false::boolean as auto_cutover_allowed
from drx_dose.phase11_shadow_evidence_v1;

create or replace view drx_dose.phase11_runtime_cutover_readiness_v2 as
with base as (
  select *
  from drx_dose.phase11_runtime_cutover_readiness_v1
),
publication as (
  select
    count(*) as phase11_rules,
    count(*) filter (where editorial_status='published') as published_rules,
    count(*) filter (where editorial_status<>'published') as unpublished_rules
  from drx_dose.phase11_publication_queue_v1
),
shadow as (
  select *
  from drx_dose.phase11_shadow_summary_v1
)
select
  base.*,
  publication.phase11_rules,
  publication.published_rules,
  publication.unpublished_rules,
  shadow.published_products as phase11_published_products,
  shadow.compared_products as phase11_shadow_compared_products,
  shadow.shadow_gate_pass_products,
  shadow.shadow_gate_blocked_products,
  shadow.shadow_gate_complete,
  array_cat(
    base.cutover_blockers,
    array_remove(array[
      case
        when publication.unpublished_rules<>0
        then 'PHASE11_PUBLICATION_INCOMPLETE'
      end,
      case
        when shadow.shadow_gate_complete is not true
        then 'PHASE11_SHADOW_EVIDENCE_INCOMPLETE'
      end
    ],null)
  ) as cutover_blockers_v2,
  (
    base.ready_for_controlled_cutover
    and publication.unpublished_rules=0
    and shadow.shadow_gate_complete
  ) as ready_for_controlled_cutover_v2,
  false::boolean as auto_strict_activation_allowed_v2
from base
cross join publication
cross join shadow;

create or replace function drx_dose.guard_phase10_phase11_cutover_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_ready boolean;
  v_blockers text[];
begin
  if (
    new.mode='CONTROLLED'
    and new.controlled_percent=10
    and (
      old.mode is distinct from new.mode
      or old.controlled_percent is distinct from new.controlled_percent
    )
  ) or (
    new.mode='STRICT'
    and old.mode is distinct from new.mode
  ) then
    select
      ready_for_controlled_cutover_v2,
      cutover_blockers_v2
    into v_ready,v_blockers
    from drx_dose.phase11_runtime_cutover_readiness_v2;

    if coalesce(v_ready,false) is not true then
      raise exception
        'Phase 10 cutover blocked by Phase 11 readiness: %',
        array_to_string(coalesce(v_blockers,'{}'::text[]),',');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists phase10_phase11_cutover_guard
  on drx_runtime.phase10_cutover_control_v1;

create trigger phase10_phase11_cutover_guard
before update of mode,controlled_percent
on drx_runtime.phase10_cutover_control_v1
for each row
execute function drx_dose.guard_phase10_phase11_cutover_v1();

create or replace function public.drx_phase11_shadow_workbench_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select jsonb_build_object(
  'summary',
    (select to_jsonb(x) from drx_dose.phase11_shadow_summary_v1 x),
  'readiness',
    (select to_jsonb(x) from drx_dose.phase11_runtime_cutover_readiness_v2 x),
  'rows',coalesce((
    select jsonb_agg(jsonb_build_object(
      'productId',q.product_id,
      'drugId',q.drug_id,
      'productKey',q.product_key,
      'registryNumber',q.registry_number,
      'tradeName',q.trade_name,
      'latestReleaseAt',q.latest_release_at,
      'comparisonId',q.comparison_id,
      'selectorKind',q.selector_kind,
      'comparisonStatus',q.comparison_status,
      'diffCodes',q.diff_codes,
      'v2RuleCount',q.v2_rule_count,
      'v3RuleCount',q.v3_rule_count,
      'shadowComparedAt',q.shadow_compared_at,
      'reviewDecision',q.review_decision,
      'legacyReviewed',q.all_published_rules_legacy_reviewed,
      'allNewRules',q.all_published_rules_new_rule_confirmed,
      'shadowGatePass',q.shadow_gate_pass,
      'nextAction',q.next_action
    ) order by q.trade_name,q.registry_number)
    from drx_dose.phase11_shadow_evidence_v1 q
  ),'[]'::jsonb),
  'autoCutoverAllowed',false
);
$$;

alter table drx_dose.phase11_shadow_diff_review_events_v1
  enable row level security;

revoke all on drx_dose.phase11_shadow_diff_review_events_v1
  from public,anon,authenticated;
revoke all on drx_dose.phase11_published_product_release_v1
  from public,anon,authenticated;
revoke all on drx_dose.phase11_shadow_evidence_v1
  from public,anon,authenticated;
revoke all on drx_dose.phase11_shadow_summary_v1
  from public,anon,authenticated;
revoke all on drx_dose.phase11_runtime_cutover_readiness_v2
  from public,anon,authenticated;

grant select on drx_dose.phase11_shadow_diff_review_events_v1
  to service_role;
grant select on drx_dose.phase11_published_product_release_v1
  to service_role;
grant select on drx_dose.phase11_shadow_evidence_v1
  to service_role;
grant select on drx_dose.phase11_shadow_summary_v1
  to service_role;
grant select on drx_dose.phase11_runtime_cutover_readiness_v2
  to service_role;

revoke all on function public.drx_phase11_review_shadow_diff_v1(
  uuid,uuid,text,text,text,text
) from public,anon,authenticated;
revoke all on function public.drx_phase11_shadow_workbench_v1()
  from public,anon,authenticated;
revoke all on function drx_dose.guard_phase10_phase11_cutover_v1()
  from public,anon,authenticated;

grant execute on function public.drx_phase11_review_shadow_diff_v1(
  uuid,uuid,text,text,text,text
) to service_role;
grant execute on function public.drx_phase11_shadow_workbench_v1()
  to service_role;
