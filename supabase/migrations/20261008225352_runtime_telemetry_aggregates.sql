-- Technical cohorts only. No account, IP, URL, query, message or clinical text.
create schema if not exists drx_observability;
revoke all on schema drx_observability from public, anon, authenticated;
grant usage on schema drx_observability to service_role;

create table drx_observability.runtime_receipts_v1 (
  event_hash text primary key check (event_hash ~ '^[a-f0-9]{64}$'),
  module text not null,
  device text not null,
  release text not null,
  metric text not null,
  last_revision integer not null check(last_revision between 1 and 1000),
  bucket numeric not null,
  cohort_hour timestamptz not null,
  received_at timestamptz not null default now()
);
create index runtime_receipts_v1_expiry on drx_observability.runtime_receipts_v1(received_at);
alter table drx_observability.runtime_receipts_v1 enable row level security;
revoke all on drx_observability.runtime_receipts_v1 from public, anon, authenticated;
grant select, insert, update, delete on drx_observability.runtime_receipts_v1 to service_role;

create table drx_observability.runtime_buckets_v1 (
  cohort_hour timestamptz not null,
  module text not null,
  device text not null,
  release text not null,
  metric text not null,
  bucket numeric not null,
  sample_count bigint not null check (sample_count >= 0),
  primary key(cohort_hour,module,device,release,metric,bucket)
);
alter table drx_observability.runtime_buckets_v1 enable row level security;
revoke all on drx_observability.runtime_buckets_v1 from public, anon, authenticated;
grant select, insert, update, delete on drx_observability.runtime_buckets_v1 to service_role;

create or replace function public.drx_record_runtime_telemetry_v1(p_payload jsonb)
returns jsonb language plpgsql security invoker
set search_path = '' set statement_timeout = '3s'
as $$
declare
  event jsonb;
  old_receipt drx_observability.runtime_receipts_v1%rowtype;
  v_module text;
  v_device text;
  v_release text;
  v_id text;
  v_name text;
  v_value numeric;
  v_bucket numeric;
  v_revision integer;
  v_hour timestamptz := pg_catalog.date_trunc('hour',now());
  inserted_count integer;
  accepted_count integer := 0;
begin
  if pg_catalog.jsonb_typeof(p_payload) <> 'object' or pg_catalog.octet_length(p_payload::text) > 8192 then
    raise exception 'Invalid technical metrics payload' using errcode='22023';
  end if;
  if p_payload->'version' is distinct from '1'::jsonb
    or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_payload)) <> 5
    or exists(select 1 from pg_catalog.jsonb_object_keys(p_payload) k where k not in ('version','module','device','release','events'))
    or pg_catalog.jsonb_typeof(p_payload->'events') <> 'array' then
    raise exception 'Invalid technical metrics fields' using errcode='22023';
  end if;
  if pg_catalog.jsonb_array_length(p_payload->'events') < 1 or pg_catalog.jsonb_array_length(p_payload->'events') > 12 then
    raise exception 'Invalid metrics batch size' using errcode='22023';
  end if;
  v_module := p_payload->>'module'; v_device := p_payload->>'device'; v_release := p_payload->>'release';
  if pg_catalog.jsonb_typeof(p_payload->'module') <> 'string' or pg_catalog.jsonb_typeof(p_payload->'device') <> 'string'
    or pg_catalog.jsonb_typeof(p_payload->'release') <> 'string'
    or v_module not in ('registry','atc','icd','dosage','antibiotics','protocols','emergencies','favorites','notes','prescriptions','labs','medical-hub','system')
    or v_device not in ('mobile','tablet','desktop')
    or not (v_release = '20261009-rum-v1' or v_release ~ '^[a-f0-9]{7,40}$') then
    raise exception 'Invalid metrics cohort' using errcode='22023';
  end if;

  -- Validate the entire batch before any mutation; failures roll back atomically.
  for event in select value from pg_catalog.jsonb_array_elements(p_payload->'events') loop
    if pg_catalog.jsonb_typeof(event) <> 'object' then raise exception 'Invalid metric' using errcode='22023'; end if;
    if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(event)) <> 4
      or exists(select 1 from pg_catalog.jsonb_object_keys(event) k where k not in ('id','name','value','revision'))
      or pg_catalog.jsonb_typeof(event->'value') <> 'number'
      or pg_catalog.jsonb_typeof(event->'revision') <> 'number'
      or pg_catalog.jsonb_typeof(event->'id') <> 'string' or pg_catalog.jsonb_typeof(event->'name') <> 'string'
      or not (event->>'id' ~ '^[a-f0-9]{64}$')
      or event->>'name' not in ('NAV','LCP','INP','CLS','RUNTIME_ERROR','NETWORK_ERROR','SERVER_ERROR') then
      raise exception 'Invalid metric fields' using errcode='22023';
    end if;
    if (event->>'revision')::numeric < 1 or (event->>'revision')::numeric > 1000
      or (event->>'revision')::numeric <> pg_catalog.trunc((event->>'revision')::numeric) then
      raise exception 'Invalid metric revision' using errcode='22023';
    end if;
    v_value := (event->>'value')::numeric; v_name := event->>'name';
    if v_value < 0 or (v_name in ('LCP','INP') and (v_value > 60000 or v_value <> pg_catalog.trunc(v_value)))
      or (v_name='CLS' and (v_value > 10 or v_value <> pg_catalog.round(v_value,4)))
      or (v_name in ('NAV','RUNTIME_ERROR','NETWORK_ERROR','SERVER_ERROR') and v_value <> 1) then
      raise exception 'Invalid metric value' using errcode='22023';
    end if;
  end loop;

  -- Serialize only this coarse cohort before taking receipt/bucket locks. Other
  -- modules/devices/releases remain independent; revisions cannot swap bucket
  -- locks in opposite order. This advisory key contains no person identifier.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.jsonb_build_array(v_module,v_device,v_release)::text,2712));
  for event in select value from pg_catalog.jsonb_array_elements(p_payload->'events') order by value->>'id' loop
    v_id := event->>'id'; v_name := event->>'name'; v_value := (event->>'value')::numeric; v_revision := (event->>'revision')::integer;
    select pg_catalog.min(upper_bound) into v_bucket from pg_catalog.unnest(
      case v_name
        when 'LCP' then array[1000,1500,2000,2500,3000,4000,6000,10000,30000,60000]::numeric[]
        when 'INP' then array[50,100,150,200,300,500,1000,2000,10000,60000]::numeric[]
        when 'CLS' then array[0.01,0.025,0.05,0.075,0.1,0.15,0.25,0.5,1,10]::numeric[]
        else array[1]::numeric[] end
    ) upper_bound where upper_bound >= v_value;
    insert into drx_observability.runtime_receipts_v1(event_hash,module,device,release,metric,last_revision,bucket,cohort_hour)
      values(v_id,v_module,v_device,v_release,v_name,v_revision,v_bucket,v_hour)
      on conflict(event_hash) do nothing;
    get diagnostics inserted_count = row_count;
    select * into strict old_receipt from drx_observability.runtime_receipts_v1 where event_hash=v_id for update;
    if old_receipt.module <> v_module or old_receipt.device <> v_device or old_receipt.release <> v_release or old_receipt.metric <> v_name then
      raise exception 'Metric identity cannot change cohort' using errcode='22023';
    end if;
    if inserted_count=0 and old_receipt.received_at < now()-interval '26 hours' then
      accepted_count := accepted_count+1;
      continue;
    end if;
    if inserted_count=0 and old_receipt.last_revision >= v_revision then
      accepted_count := accepted_count+1;
      continue;
    end if;
    if inserted_count=1 then
      insert into drx_observability.runtime_buckets_v1(cohort_hour,module,device,release,metric,bucket,sample_count)
        values(v_hour,v_module,v_device,v_release,v_name,v_bucket,1)
        on conflict(cohort_hour,module,device,release,metric,bucket) do update
          set sample_count=drx_observability.runtime_buckets_v1.sample_count+1;
    elsif old_receipt.bucket <> v_bucket then
      -- Pre-create both buckets and lock in numeric order before moving a sample.
      insert into drx_observability.runtime_buckets_v1(cohort_hour,module,device,release,metric,bucket,sample_count)
        values(old_receipt.cohort_hour,v_module,v_device,v_release,v_name,v_bucket,0)
        on conflict do nothing;
      perform 1 from drx_observability.runtime_buckets_v1
        where cohort_hour=old_receipt.cohort_hour and module=v_module and device=v_device and release=v_release
          and metric=v_name and bucket in (old_receipt.bucket,v_bucket) order by bucket for update;
      update drx_observability.runtime_buckets_v1 set sample_count=sample_count-1
        where cohort_hour=old_receipt.cohort_hour and module=v_module and device=v_device and release=v_release
          and metric=v_name and bucket=old_receipt.bucket;
      update drx_observability.runtime_buckets_v1 set sample_count=sample_count+1
        where cohort_hour=old_receipt.cohort_hour and module=v_module and device=v_device and release=v_release
          and metric=v_name and bucket=v_bucket;
    end if;
    update drx_observability.runtime_receipts_v1 set bucket=v_bucket,last_revision=v_revision where event_hash=v_id;
    accepted_count := accepted_count+1;
  end loop;

  -- Bounded retention sweep on accepted batches; receipts outlive the read window.
  delete from drx_observability.runtime_receipts_v1 where event_hash in (
    select event_hash from drx_observability.runtime_receipts_v1 where received_at < now()-interval '26 hours'
      order by received_at limit 1000 for update skip locked);
  delete from drx_observability.runtime_buckets_v1 where (cohort_hour,module,device,release,metric,bucket) in (
    select cohort_hour,module,device,release,metric,bucket from drx_observability.runtime_buckets_v1
      where cohort_hour < v_hour-interval '14 days' order by cohort_hour limit 1000 for update skip locked);
  return pg_catalog.jsonb_build_object('accepted',accepted_count);
end;
$$;
revoke all on function public.drx_record_runtime_telemetry_v1(jsonb) from public,anon,authenticated;
grant execute on function public.drx_record_runtime_telemetry_v1(jsonb) to service_role;

create or replace function public.drx_runtime_telemetry_summary_v1()
returns jsonb language sql stable security invoker
set search_path = '' set statement_timeout = '3s'
as $$
with bins as (
  select module,device,release,metric,bucket,pg_catalog.sum(sample_count)::bigint as samples
  from drx_observability.runtime_buckets_v1
  where cohort_hour >= pg_catalog.date_trunc('hour',now())-interval '23 hours' and sample_count>0
  group by module,device,release,metric,bucket
), cohorts as (
  select module,device,release,metric,pg_catalog.sum(samples)::bigint as count,
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('upper',bucket,'count',samples) order by bucket) as buckets
  from bins group by module,device,release,metric
)
select pg_catalog.jsonb_build_object('available',true,'windowHours',24,
  'groups',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'module',module,'device',device,'release',release,'metric',metric,'count',count,'buckets',buckets
  ) order by module,device,release,metric) from cohorts),'[]'::jsonb));
$$;
revoke all on function public.drx_runtime_telemetry_summary_v1() from public,anon,authenticated;
grant execute on function public.drx_runtime_telemetry_summary_v1() to service_role;
