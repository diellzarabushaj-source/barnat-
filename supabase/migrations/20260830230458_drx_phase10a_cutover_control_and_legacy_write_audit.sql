create table if not exists drx_runtime.phase10_cutover_control_v1 (
  singleton boolean primary key default true check (singleton),
  mode text not null check (mode in ('SHADOW','CONTROLLED','STRICT')),
  controlled_percent integer not null default 0 check (controlled_percent between 0 and 100),
  strict_armed boolean not null default false,
  rollback_target text not null default 'V2' check (rollback_target='V2'),
  phase10_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version_no integer not null default 1 check (version_no>0),
  note text not null,
  check (mode='CONTROLLED' or controlled_percent=0),
  check (mode<>'STRICT' or strict_armed)
);

insert into drx_runtime.phase10_cutover_control_v1(
  singleton,mode,controlled_percent,strict_armed,rollback_target,note
) values (
  true,'SHADOW',0,false,'V2',
  'Phase 10A baseline. V2 remains served; strict cutover is locked until every final gate has evidence.'
)
on conflict (singleton) do nothing;

create table if not exists drx_runtime.phase10_gate_evidence_v1 (
  evidence_id uuid primary key default gen_random_uuid(),
  gate_key text not null check (gate_key in (
    'SECURITY_P0_P1_ZERO',
    'GOLDEN_CLINICAL_100',
    'PARITY_100_PUBLISHED_V3',
    'LEGACY_WRITES_ZERO',
    'LEGACY_CONSUMERS_ZERO',
    'ROLLBACK_DRILL_PASS',
    'RESTORE_TEST_PASS'
  )),
  passed boolean not null,
  source_kind text not null check (source_kind in ('CI','GITHUB_ACTION','DB_AUDIT','RESTORE_DRILL','CUTOVER_DRILL')),
  source_ref text not null,
  evidence_sha256 text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object'),
  recorded_at timestamptz not null default now(),
  unique(gate_key,evidence_sha256)
);

create table if not exists drx_runtime.phase10_soak_windows_v1 (
  soak_id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('CONTROLLED','STRICT')),
  started_at timestamptz not null,
  ended_at timestamptz,
  critical_clinical_incidents integer not null default 0 check (critical_clinical_incidents>=0),
  critical_security_incidents integer not null default 0 check (critical_security_incidents>=0),
  completed boolean not null default false,
  evidence_sha256 text check (evidence_sha256 is null or evidence_sha256 ~ '^[0-9a-f]{64}$'),
  note text not null,
  check (ended_at is null or ended_at>=started_at),
  check (not completed or ended_at is not null)
);

create table if not exists drx_runtime.phase10_rollback_drills_v1 (
  drill_id uuid primary key default gen_random_uuid(),
  from_mode text not null check (from_mode in ('CONTROLLED','STRICT')),
  to_mode text not null check (to_mode='SHADOW'),
  passed boolean not null,
  v3_data_preserved boolean not null,
  provenance_preserved boolean not null,
  v2_service_restored boolean not null,
  evidence_sha256 text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  performed_at timestamptz not null default now(),
  note text not null
);

create table if not exists drx_runtime.phase10_legacy_write_events_v1 (
  event_id bigint generated always as identity primary key,
  table_schema text not null,
  table_name text not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE','TRUNCATE')),
  db_role text not null,
  transaction_id bigint not null,
  occurred_at timestamptz not null default statement_timestamp()
);

alter table drx_runtime.phase10_cutover_control_v1 enable row level security;
alter table drx_runtime.phase10_cutover_control_v1 force row level security;
alter table drx_runtime.phase10_gate_evidence_v1 enable row level security;
alter table drx_runtime.phase10_gate_evidence_v1 force row level security;
alter table drx_runtime.phase10_soak_windows_v1 enable row level security;
alter table drx_runtime.phase10_soak_windows_v1 force row level security;
alter table drx_runtime.phase10_rollback_drills_v1 enable row level security;
alter table drx_runtime.phase10_rollback_drills_v1 force row level security;
alter table drx_runtime.phase10_legacy_write_events_v1 enable row level security;
alter table drx_runtime.phase10_legacy_write_events_v1 force row level security;

revoke all on table drx_runtime.phase10_cutover_control_v1 from public,anon,authenticated,service_role;
revoke all on table drx_runtime.phase10_gate_evidence_v1 from public,anon,authenticated,service_role;
revoke all on table drx_runtime.phase10_soak_windows_v1 from public,anon,authenticated,service_role;
revoke all on table drx_runtime.phase10_rollback_drills_v1 from public,anon,authenticated,service_role;
revoke all on table drx_runtime.phase10_legacy_write_events_v1 from public,anon,authenticated,service_role;

create or replace function drx_runtime.phase10_append_only_guard_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,drx_runtime
as $$
begin
  raise exception 'Phase 10 evidence is append-only';
end
$$;

revoke all on function drx_runtime.phase10_append_only_guard_v1()
  from public,anon,authenticated,service_role;

drop trigger if exists phase10_gate_evidence_append_only_v1 on drx_runtime.phase10_gate_evidence_v1;
create trigger phase10_gate_evidence_append_only_v1
before update or delete on drx_runtime.phase10_gate_evidence_v1
for each row execute function drx_runtime.phase10_append_only_guard_v1();

drop trigger if exists phase10_rollback_drills_append_only_v1 on drx_runtime.phase10_rollback_drills_v1;
create trigger phase10_rollback_drills_append_only_v1
before update or delete on drx_runtime.phase10_rollback_drills_v1
for each row execute function drx_runtime.phase10_append_only_guard_v1();

drop trigger if exists phase10_legacy_write_events_append_only_v1 on drx_runtime.phase10_legacy_write_events_v1;
create trigger phase10_legacy_write_events_append_only_v1
before update or delete on drx_runtime.phase10_legacy_write_events_v1
for each row execute function drx_runtime.phase10_append_only_guard_v1();

create or replace function drx_runtime.phase10_audit_legacy_write_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,drx_runtime
as $$
begin
  insert into drx_runtime.phase10_legacy_write_events_v1(
    table_schema,table_name,operation,db_role,transaction_id,occurred_at
  )
  values(
    tg_table_schema,tg_table_name,tg_op,current_user,txid_current(),statement_timestamp()
  );
  return null;
end
$$;

revoke all on function drx_runtime.phase10_audit_legacy_write_v1()
  from public,anon,authenticated,service_role;

drop trigger if exists phase10_legacy_write_audit on public.dose_products_v2;
create trigger phase10_legacy_write_audit
after insert or update or delete or truncate on public.dose_products_v2
for each statement execute function drx_runtime.phase10_audit_legacy_write_v1();

drop trigger if exists phase10_legacy_write_audit on public.dose_rules_v2;
create trigger phase10_legacy_write_audit
after insert or update or delete or truncate on public.dose_rules_v2
for each statement execute function drx_runtime.phase10_audit_legacy_write_v1();

drop trigger if exists phase10_legacy_write_audit on public.dose_rule_products_v2;
create trigger phase10_legacy_write_audit
after insert or update or delete or truncate on public.dose_rule_products_v2
for each statement execute function drx_runtime.phase10_audit_legacy_write_v1();

drop trigger if exists phase10_legacy_write_audit on public.dose_indications_v2;
create trigger phase10_legacy_write_audit
after insert or update or delete or truncate on public.dose_indications_v2
for each statement execute function drx_runtime.phase10_audit_legacy_write_v1();

drop trigger if exists phase10_legacy_write_audit on public.dose_sources_v2;
create trigger phase10_legacy_write_audit
after insert or update or delete or truncate on public.dose_sources_v2
for each statement execute function drx_runtime.phase10_audit_legacy_write_v1();

create or replace function public.drx_phase10_status_v1()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_runtime
as $$
with p9 as materialized (
  select public.drx_phase9_status_v1() as status
),
control as materialized (
  select * from drx_runtime.phase10_cutover_control_v1 where singleton
),
latest_shadow as materialized (
  select distinct on (selector_kind,selector_sha256)
    comparison_id,comparison_status,diff_codes,v2_rule_count,v3_rule_count,created_at
  from drx_runtime.shadow_comparisons_v1
  order by selector_kind,selector_sha256,created_at desc,comparison_id desc
),
parity as (
  select
    count(*)::integer comparison_count,
    count(*) filter(where comparison_status='MATCH')::integer raw_match_count,
    count(*) filter(where comparison_status='DIFF')::integer raw_diff_count,
    count(*) filter(
      where comparison_status='MATCH'
         or (
           comparison_status='DIFF'
           and exists (
             select 1
             from drx_runtime.shadow_diff_classifications_v1 c
             where c.comparison_id=latest_shadow.comparison_id
               and c.classification_status='APPROVED_CLINICAL_CORRECTION'
           )
         )
    )::integer effective_match_count,
    coalesce(sum(v3_rule_count),0)::integer compared_v3_rule_count,
    count(*) filter(
      where comparison_status='DIFF'
        and exists (
          select 1
          from drx_runtime.shadow_diff_classifications_v1 c
          where c.comparison_id=latest_shadow.comparison_id
            and c.classification_status='APPROVED_CLINICAL_CORRECTION'
        )
    )::integer approved_correction_count
  from latest_shadow
),
published as (
  select
    (select count(*)::integer from public.dose_products_v3 where editorial_status='published') v3_products,
    (select count(*)::integer from public.dose_rules_v3 where editorial_status='published') v3_rules
),
latest_gate as (
  select distinct on (gate_key) gate_key,passed,recorded_at
  from drx_runtime.phase10_gate_evidence_v1
  order by gate_key,recorded_at desc,evidence_id desc
),
gate_flags as (
  select
    coalesce(bool_or(gate_key='SECURITY_P0_P1_ZERO' and passed),false) security_pass,
    coalesce(bool_or(gate_key='GOLDEN_CLINICAL_100' and passed),false) golden_pass,
    coalesce(bool_or(gate_key='PARITY_100_PUBLISHED_V3' and passed),false) parity_evidence_pass,
    coalesce(bool_or(gate_key='LEGACY_WRITES_ZERO' and passed),false) legacy_writes_pass,
    coalesce(bool_or(gate_key='LEGACY_CONSUMERS_ZERO' and passed),false) legacy_consumers_pass,
    coalesce(bool_or(gate_key='ROLLBACK_DRILL_PASS' and passed),false) rollback_evidence_pass,
    coalesce(bool_or(gate_key='RESTORE_TEST_PASS' and passed),false) restore_pass
  from latest_gate
),
soak as (
  select
    coalesce(bool_or(
      completed
      and ended_at-started_at>=interval '14 days'
      and critical_clinical_incidents=0
      and critical_security_incidents=0
    ),false) soak_14d_pass,
    coalesce(max(extract(epoch from (coalesce(ended_at,now())-started_at))/86400.0),0) max_soak_days
  from drx_runtime.phase10_soak_windows_v1
),
rollback as (
  select coalesce(bool_or(
    passed and v3_data_preserved and provenance_preserved and v2_service_restored
    and from_mode in ('CONTROLLED','STRICT') and to_mode='SHADOW'
  ),false) rollback_drill_pass
  from drx_runtime.phase10_rollback_drills_v1
),
metrics as (
  select
    coalesce((p9.status->>'finalExitPass')::boolean,false) phase9_closed,
    coalesce((p9.status->>'phase10Allowed')::boolean,false) phase10_allowed,
    c.mode,
    c.controlled_percent,
    c.strict_armed,
    c.rollback_target,
    c.phase10_started_at,
    p.v3_products,
    p.v3_rules,
    pa.comparison_count,
    pa.raw_match_count,
    pa.raw_diff_count,
    pa.effective_match_count,
    pa.compared_v3_rule_count,
    pa.approved_correction_count,
    (
      p.v3_rules>0
      and pa.comparison_count>0
      and pa.effective_match_count=pa.comparison_count
      and pa.compared_v3_rule_count=p.v3_rules
    ) effective_parity_current,
    (select count(*)::integer from drx_runtime.phase10_legacy_write_events_v1
      where occurred_at>=c.phase10_started_at) legacy_write_events,
    gf.security_pass,
    gf.golden_pass,
    gf.parity_evidence_pass,
    gf.legacy_writes_pass,
    gf.legacy_consumers_pass,
    gf.rollback_evidence_pass,
    gf.restore_pass,
    s.soak_14d_pass,
    s.max_soak_days,
    rb.rollback_drill_pass
  from p9
  cross join control c
  cross join published p
  cross join parity pa
  cross join gate_flags gf
  cross join soak s
  cross join rollback rb
),
finalized as (
  select
    m.*,
    (
      m.phase9_closed
      and m.phase10_allowed
      and m.mode='STRICT'
      and m.strict_armed
      and m.security_pass
      and m.golden_pass
      and m.parity_evidence_pass
      and m.effective_parity_current
      and m.legacy_writes_pass
      and m.legacy_consumers_pass
      and m.rollback_evidence_pass
      and m.rollback_drill_pass
      and m.soak_14d_pass
      and m.restore_pass
      and m.legacy_write_events=0
    ) final_gate_pass
  from metrics m
)
select jsonb_build_object(
  'statusVersion','drx-phase10-status-v1',
  'phase',10,
  'phase9Closed',f.phase9_closed,
  'phase10AllowedByPhase9',f.phase10_allowed,
  'mode',f.mode,
  'controlledTrafficPercent',f.controlled_percent,
  'strictArmed',f.strict_armed,
  'strictModeLocked',not f.strict_armed,
  'rollbackTarget',f.rollback_target,
  'v2FallbackRequired',true,
  'v3StrictActive',f.mode='STRICT' and f.strict_armed,
  'publishedV3Products',f.v3_products,
  'publishedV3Rules',f.v3_rules,
  'shadowComparisons',f.comparison_count,
  'rawShadowMatches',f.raw_match_count,
  'rawShadowDiffs',f.raw_diff_count,
  'approvedClinicalCorrections',f.approved_correction_count,
  'effectiveShadowMatches',f.effective_match_count,
  'comparedV3RuleCount',f.compared_v3_rule_count,
  'effectiveParityCurrent',f.effective_parity_current,
  'legacyWriteEventsSincePhase10Start',f.legacy_write_events,
  'securityP0P1EvidencePass',f.security_pass,
  'goldenClinicalEvidencePass',f.golden_pass,
  'parityEvidencePass',f.parity_evidence_pass,
  'legacyWritesZeroEvidencePass',f.legacy_writes_pass,
  'legacyConsumersZeroEvidencePass',f.legacy_consumers_pass,
  'rollbackEvidencePass',f.rollback_evidence_pass,
  'rollbackDrillPass',f.rollback_drill_pass,
  'restoreTestEvidencePass',f.restore_pass,
  'minimumSoakDays',14,
  'maxObservedSoakDays',round(f.max_soak_days::numeric,3),
  'soak14DaysPass',f.soak_14d_pass,
  'finalGatePass',f.final_gate_pass,
  'destructiveCleanupAllowed',f.final_gate_pass
)
from finalized f
$$;

revoke all on function public.drx_phase10_status_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase10_status_v1()
  to service_role;
