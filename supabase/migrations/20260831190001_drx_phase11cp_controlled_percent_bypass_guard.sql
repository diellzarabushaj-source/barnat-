-- DRx Phase 11CP: close controlled-traffic percentage bypass.
-- Any risk-increasing CONTROLLED move above the existing 5% soak, or any move
-- into STRICT, requires the full Phase 11 publication + shadow readiness gate.
-- Risk-reducing moves remain available for rollback/de-escalation.

create or replace function drx_dose.guard_phase10_phase11_cutover_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_ready boolean;
  v_blockers text[];
  v_risk_increase boolean;
begin
  v_risk_increase :=
    (
      new.mode='CONTROLLED'
      and new.controlled_percent>5
      and (
        old.mode='SHADOW'
        or (
          old.mode='CONTROLLED'
          and new.controlled_percent>old.controlled_percent
        )
      )
    )
    or (
      new.mode='STRICT'
      and old.mode is distinct from new.mode
    );

  if v_risk_increase then
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

revoke all on function drx_dose.guard_phase10_phase11_cutover_v1()
  from public,anon,authenticated;
