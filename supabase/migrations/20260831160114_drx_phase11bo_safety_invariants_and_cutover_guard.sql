
-- DRx Phase 11BO: final safety invariants + guarded runtime cutover readiness.
-- This migration does not change phase10 runtime traffic and cannot arm STRICT mode.

create table if not exists drx_dose.phase11_runtime_approval_v1 (
  singleton boolean primary key default true check (singleton),
  approved boolean not null default false,
  approved_by text,
  approved_at timestamptz,
  approval_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phase11_runtime_approval_provenance_check check (
    approved = false
    or (
      nullif(btrim(approved_by),'') is not null
      and approved_at is not null
    )
  )
);

insert into drx_dose.phase11_runtime_approval_v1(singleton,approved)
values (true,false)
on conflict (singleton) do nothing;

create or replace view drx_dose.phase11_safety_invariant_audit_v1 as
with product_disp as (
  select
    count(*) as all_products,
    count(*) filter (
      where identity_disposition in (
        'STANDARD_DOSE_MODEL_READY',
        'STANDARD_IDENTITY_REVIEW',
        'SPECIAL_MODEL_ROUTED',
        'EXCLUDED_FROM_STANDARD_DOSE_MODEL'
      )
    ) as dispositioned_products,
    count(*) filter (where identity_disposition='STANDARD_IDENTITY_REVIEW') as standard_identity_review_remaining
  from drx_dose.product_identity_disposition_v3
),
unsafe_flags as (
  select
    (select count(*) from drx_dose.source_regimen_candidates_v1 where auto_publish_allowed) as source_regimen_auto_publish_true,
    (select count(*) from drx_dose.source_regimen_step_presentation_requirements_v1 where auto_bind_allowed) as presentation_auto_bind_true,
    (select count(*) from drx_dose.source_regimen_step_administration_v1 where auto_apply_allowed) as administration_auto_apply_true,
    (select count(*) from drx_dose.source_adjustment_candidates_v1 where auto_apply_allowed) as adjustment_auto_apply_true,
    (select count(*) from drx_dose.source_restriction_candidates_v1 where auto_apply_allowed) as restriction_auto_apply_true
),
target_flags as (
  select
    count(*) filter (where binding_status='VERIFIED' and nullif(btrim(verified_by),'') is null) as verified_target_without_reviewer,
    count(*) filter (where binding_status='VERIFIED' and verified_at is null) as verified_target_without_timestamp
  from drx_dose.rule_targets_v1
),
binding_flags as (
  select
    count(*) filter (where binding_status='verified' and nullif(btrim(verified_by),'') is null) as verified_binding_without_reviewer,
    count(*) filter (where binding_status='verified' and verified_at is null) as verified_binding_without_timestamp
  from public.dose_rule_products_v3
),
safety_scope as (
  select
    count(*) filter (where applicability_scope not in ('DIRECT_REGIMEN','SAME_SOURCE_MOIETY')) as unsafe_scope_rows
  from drx_dose.source_regimen_applicable_safety_v2
)
select
  p.all_products,
  p.dispositioned_products,
  p.standard_identity_review_remaining,
  u.source_regimen_auto_publish_true,
  u.presentation_auto_bind_true,
  u.administration_auto_apply_true,
  u.adjustment_auto_apply_true,
  u.restriction_auto_apply_true,
  t.verified_target_without_reviewer,
  t.verified_target_without_timestamp,
  b.verified_binding_without_reviewer,
  b.verified_binding_without_timestamp,
  s.unsafe_scope_rows,
  (
    p.all_products=p.dispositioned_products
    and u.source_regimen_auto_publish_true=0
    and u.presentation_auto_bind_true=0
    and u.administration_auto_apply_true=0
    and u.adjustment_auto_apply_true=0
    and u.restriction_auto_apply_true=0
    and t.verified_target_without_reviewer=0
    and t.verified_target_without_timestamp=0
    and b.verified_binding_without_reviewer=0
    and b.verified_binding_without_timestamp=0
    and s.unsafe_scope_rows=0
  ) as invariants_hold
from product_disp p
cross join unsafe_flags u
cross join target_flags t
cross join binding_flags b
cross join safety_scope s;

create or replace view drx_dose.phase11_runtime_cutover_readiness_v1 as
with c as (
  select * from drx_dose.phase11_completion_summary_v3
),
i as (
  select * from drx_dose.phase11_safety_invariant_audit_v1
),
a as (
  select * from drx_dose.phase11_runtime_approval_v1 where singleton
),
r as (
  select
    mode,controlled_percent,strict_armed,rollback_target,version_no,updated_at
  from drx_runtime.phase10_cutover_control_v1
  where singleton
)
select
  c.foundation_complete,
  c.clinical_review_complete,
  c.promotion_complete,
  c.runtime_complete as legacy_runtime_completion,
  i.invariants_hold,
  a.approved as manual_runtime_approval,
  a.approved_by,
  a.approved_at,
  r.mode as current_runtime_mode,
  r.controlled_percent,
  r.strict_armed,
  r.rollback_target,
  r.version_no as runtime_control_version,
  array_remove(array[
    case when c.foundation_complete is not true then 'FOUNDATION_INCOMPLETE' end,
    case when c.clinical_review_complete is not true then 'CLINICAL_REVIEW_INCOMPLETE' end,
    case when c.promotion_complete is not true then 'PROMOTION_INCOMPLETE' end,
    case when i.invariants_hold is not true then 'SAFETY_INVARIANT_FAILURE' end,
    case when a.approved is not true then 'MANUAL_RUNTIME_APPROVAL_REQUIRED' end,
    case when r.rollback_target <> 'V2' then 'ROLLBACK_TARGET_NOT_V2' end
  ],null) as cutover_blockers,
  (
    c.foundation_complete
    and c.clinical_review_complete
    and c.promotion_complete
    and i.invariants_hold
    and a.approved
    and r.rollback_target='V2'
  ) as ready_for_controlled_cutover,
  false::boolean as auto_strict_activation_allowed
from c
cross join i
cross join a
cross join r;

create or replace function public.drx_phase11_runtime_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_dose,drx_runtime
as $$
select jsonb_build_object(
  'readyForControlledCutover',ready_for_controlled_cutover,
  'blockers',cutover_blockers,
  'foundationComplete',foundation_complete,
  'clinicalReviewComplete',clinical_review_complete,
  'promotionComplete',promotion_complete,
  'safetyInvariantsHold',invariants_hold,
  'manualRuntimeApproval',manual_runtime_approval,
  'currentRuntimeMode',current_runtime_mode,
  'controlledPercent',controlled_percent,
  'strictArmed',strict_armed,
  'rollbackTarget',rollback_target,
  'autoStrictActivationAllowed',false
)
from drx_dose.phase11_runtime_cutover_readiness_v1
$$;

alter table drx_dose.phase11_runtime_approval_v1 enable row level security;

revoke all on drx_dose.phase11_runtime_approval_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_safety_invariant_audit_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_runtime_cutover_readiness_v1 from public,anon,authenticated;
grant select on drx_dose.phase11_runtime_approval_v1 to service_role;
grant select on drx_dose.phase11_safety_invariant_audit_v1 to service_role;
grant select on drx_dose.phase11_runtime_cutover_readiness_v1 to service_role;

revoke all on function public.drx_phase11_runtime_readiness_v1() from public,anon,authenticated;
grant execute on function public.drx_phase11_runtime_readiness_v1() to service_role;
