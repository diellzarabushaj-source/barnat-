create schema if not exists drx_security;
revoke all on schema drx_security from public,anon,authenticated;
grant usage on schema drx_security to service_role;
create table drx_security.request_budgets_v1 (
  bucket_hash text primary key check (bucket_hash ~ '^[a-f0-9]{64}$'),
  hits integer not null check (hits > 0),
  expires_at timestamptz not null
);
alter table drx_security.request_budgets_v1 enable row level security;
revoke all on drx_security.request_budgets_v1 from public,anon,authenticated;
grant select,insert,update,delete on drx_security.request_budgets_v1 to service_role;
create index request_budgets_v1_expiry on drx_security.request_budgets_v1(expires_at);

create or replace function public.drx_consume_request_budget_v1(p_bucket_hash text,p_limit integer,p_window_seconds integer)
returns jsonb language plpgsql volatile security invoker
set search_path = ''
set statement_timeout = '3s'
as $function$
declare
  stamp timestamptz := clock_timestamp();
  used integer;
  expiry timestamptz;
begin
  if p_bucket_hash !~ '^[a-f0-9]{64}$' or p_limit not between 1 and 1000
    or p_window_seconds not between 1 and 3600 or p_bucket_hash is null
    or p_limit is null or p_window_seconds is null then
    raise exception 'Invalid request budget' using errcode = '22023';
  end if;
  insert into drx_security.request_budgets_v1 as b(bucket_hash,hits,expires_at)
    values(p_bucket_hash,1,stamp + make_interval(secs => p_window_seconds))
  on conflict(bucket_hash) do update set
    hits = case when b.expires_at <= stamp then 1 else least(b.hits + 1,p_limit + 1) end,
    expires_at = case when b.expires_at <= stamp then stamp + make_interval(secs => p_window_seconds) else b.expires_at end
  returning hits,expires_at into used,expiry;
  -- Bounded cleanup, independent of instance lifetime; no raw IPs or identities.
  if random() < 0.02 then
    delete from drx_security.request_budgets_v1 where bucket_hash in (
      select bucket_hash from drx_security.request_budgets_v1 where expires_at < stamp order by expires_at limit 1000
    );
  end if;
  return jsonb_build_object('allowed',used <= p_limit,'remaining',greatest(0,p_limit-used),
    'resetSeconds',greatest(1,ceil(extract(epoch from expiry-stamp))::integer));
end;
$function$;
revoke all on function public.drx_consume_request_budget_v1(text,integer,integer) from public,anon,authenticated;
grant execute on function public.drx_consume_request_budget_v1(text,integer,integer) to service_role;
