-- Phase 5: snapshot the database-backed system health dashboard.
-- Pending production apply while the Supabase SQL connector is unavailable.
-- version: 20260829012500
-- name: phase5_system_health_snapshot

create table if not exists public.medindex_system_health_snapshot_v1 (
  snapshot_key text primary key
    default 'system'
    check (snapshot_key = 'system'),
  snapshot_version integer not null
    default 1
    check (snapshot_version = 1),
  counts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(counts) = 'object'),
  sync_sources jsonb not null default '[]'::jsonb
    check (jsonb_typeof(sync_sources) = 'array'),
  editor_events jsonb not null default '[]'::jsonb
    check (jsonb_typeof(editor_events) = 'array'),
  recent_runs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(recent_runs) = 'array'),
  outbox jsonb not null default '{}'::jsonb
    check (jsonb_typeof(outbox) = 'object'),
  dirty_revision bigint not null default 1
    check (dirty_revision >= 0),
  refreshed_revision bigint not null default 0
    check (refreshed_revision >= 0),
  dirty_at timestamptz not null default now(),
  refreshed_at timestamptz,
  refresh_duration_ms numeric(12,3),
  updated_at timestamptz not null default now()
);

alter table public.medindex_system_health_snapshot_v1 enable row level security;

revoke all on table public.medindex_system_health_snapshot_v1
from public, anon, authenticated;

grant select on table public.medindex_system_health_snapshot_v1
to service_role;

insert into public.medindex_system_health_snapshot_v1 (
  snapshot_key, snapshot_version, dirty_revision, refreshed_revision
)
values ('system', 1, 1, 0)
on conflict (snapshot_key) do nothing;

create or replace function private.medindex_mark_system_health_snapshot_dirty_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.medindex_system_health_snapshot_v1 (
    snapshot_key,
    snapshot_version,
    dirty_revision,
    refreshed_revision,
    dirty_at,
    updated_at
  )
  values (
    'system',
    1,
    1,
    0,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (snapshot_key) do update
  set dirty_revision = public.medindex_system_health_snapshot_v1.dirty_revision + 1,
      dirty_at = clock_timestamp(),
      updated_at = clock_timestamp();

  return null;
end
$$;

revoke all on function private.medindex_mark_system_health_snapshot_dirty_v1()
from public, anon, authenticated, service_role;

do $$
declare
  relation_name text;
  trigger_name text;
begin
  foreach relation_name in array array[
    'drugs',
    'dosage_regimens',
    'icd_codes',
    'lab_tests',
    'drive_sync_sources',
    'audit_logs',
    'sync_runs',
    'sync_outbox'
  ]::text[]
  loop
    trigger_name := 'medindex_health_dirty_' || relation_name;
    execute format(
      'drop trigger if exists %I on public.%I',
      trigger_name,
      relation_name
    );
    execute format(
      'create trigger %I after insert or update or delete or truncate on public.%I for each statement execute function private.medindex_mark_system_health_snapshot_dirty_v1()',
      trigger_name,
      relation_name
    );
  end loop;
end
$$;

create or replace function public.medindex_refresh_system_health_snapshot_v1()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  started_at timestamptz := clock_timestamp();
  target_revision bigint;
  counts_payload jsonb;
  sources_payload jsonb;
  editor_payload jsonb;
  runs_payload jsonb;
  outbox_payload jsonb;
  refreshed_at_value timestamptz;
  duration_ms numeric(12,3);
begin
  select dirty_revision
  into target_revision
  from public.medindex_system_health_snapshot_v1
  where snapshot_key = 'system';

  if target_revision is null then
    insert into public.medindex_system_health_snapshot_v1 (
      snapshot_key, snapshot_version, dirty_revision, refreshed_revision
    )
    values ('system', 1, 1, 0)
    on conflict (snapshot_key) do nothing;

    select dirty_revision
    into target_revision
    from public.medindex_system_health_snapshot_v1
    where snapshot_key = 'system';
  end if;

  select jsonb_build_object(
    'drugs', (select count(*) from public.drugs),
    'dosageRegimens', (select count(*) from public.dosage_regimens),
    'icdCodes', (select count(*) from public.icd_codes),
    'labTests', (select count(*) from public.lab_tests)
  )
  into counts_payload;

  select coalesce(
    jsonb_agg(to_jsonb(s) order by s.spreadsheet_id, s.sheet_name),
    '[]'::jsonb
  )
  into sources_payload
  from (
    select
      spreadsheet_id,
      sheet_name,
      entity_scope,
      enabled,
      last_status,
      last_error,
      last_synced_at,
      updated_at
    from public.drive_sync_sources
    order by spreadsheet_id, sheet_name
  ) s;

  select coalesce(
    jsonb_agg(to_jsonb(e) order by e.changed_at desc, e.id desc),
    '[]'::jsonb
  )
  into editor_payload
  from (
    select
      id,
      entity_type,
      entity_id,
      action,
      changed_by,
      changed_at
    from public.audit_logs
    where source = 'clinical_editor'
    order by changed_at desc, id desc
    limit 8
  ) e;

  select coalesce(
    jsonb_agg(to_jsonb(r) order by r.started_at desc),
    '[]'::jsonb
  )
  into runs_payload
  from (
    select
      source_type,
      target_scope,
      status,
      rows_read,
      rows_inserted,
      rows_updated,
      rows_skipped,
      error_summary,
      started_at,
      completed_at
    from public.sync_runs
    order by started_at desc
    limit 5
  ) r;

  select jsonb_build_object(
    'available', true,
    'counts', coalesce(
      (
        select jsonb_object_agg(status, n order by status)
        from (
          select status, count(*)::bigint as n
          from public.sync_outbox
          group by status
        ) grouped
      ),
      '{}'::jsonb
    ),
    'pending', (
      select count(*)
      from public.sync_outbox
      where status in ('pending', 'processing', 'failed')
    ),
    'deadLetter', (
      select count(*)
      from public.sync_outbox
      where status = 'dead_letter'
    ),
    'lastAppliedAt', (
      select max(applied_at)
      from public.sync_outbox
    ),
    'lastError', (
      select last_error
      from public.sync_outbox
      where status in ('failed', 'dead_letter')
        and nullif(btrim(last_error), '') is not null
      order by updated_at desc, id desc
      limit 1
    )
  )
  into outbox_payload;

  refreshed_at_value := clock_timestamp();
  duration_ms := round(
    (extract(epoch from (refreshed_at_value - started_at)) * 1000)::numeric,
    3
  );

  update public.medindex_system_health_snapshot_v1
  set snapshot_version = 1,
      counts = counts_payload,
      sync_sources = sources_payload,
      editor_events = editor_payload,
      recent_runs = runs_payload,
      outbox = outbox_payload,
      refreshed_revision = target_revision,
      refreshed_at = refreshed_at_value,
      refresh_duration_ms = duration_ms,
      updated_at = refreshed_at_value
  where snapshot_key = 'system';

  return jsonb_build_object(
    'snapshotKey', 'system',
    'snapshotVersion', 1,
    'counts', counts_payload,
    'syncSources', sources_payload,
    'editorEvents', editor_payload,
    'recentRuns', runs_payload,
    'outbox', outbox_payload,
    'dirtyRevision', (
      select dirty_revision
      from public.medindex_system_health_snapshot_v1
      where snapshot_key = 'system'
    ),
    'refreshedRevision', target_revision,
    'refreshedAt', refreshed_at_value,
    'refreshDurationMs', duration_ms
  );
end
$$;

revoke all on function public.medindex_refresh_system_health_snapshot_v1()
from public, anon, authenticated;

grant execute on function public.medindex_refresh_system_health_snapshot_v1()
to service_role;

comment on table public.medindex_system_health_snapshot_v1 is
  'Server-only singleton snapshot for the system health dashboard. Reads are cheap; statement triggers only mark revisions dirty.';

comment on function public.medindex_refresh_system_health_snapshot_v1() is
  'Recomputes the server-only health snapshot from canonical tables. service_role only. dirty/refreshed revisions prevent lost updates during concurrent writes.';

select public.medindex_refresh_system_health_snapshot_v1();
