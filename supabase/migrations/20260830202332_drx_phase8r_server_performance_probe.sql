-- DRx Phase 8R: server-side performance probe.
-- Measures database execution p95 separately from CI/network round-trip latency.

create or replace function public.drx_phase8_performance_probe_v1(
  p_samples integer default 20,
  p_warm_samples integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_runtime
as $$
declare
  v_samples integer := greatest(5,least(coalesce(p_samples,20),100));
  v_warm integer := greatest(1,least(coalesce(p_warm_samples,5),20));
  v_i integer;
  v_started timestamptz;
  v_search_samples double precision[] := '{}'::double precision[];
  v_detail_samples double precision[] := '{}'::double precision[];
  v_search_p95 double precision;
  v_detail_p95 double precision;
  v_preflight jsonb;
  v_pilot jsonb;
  v_payload jsonb;
  v_query text;
  v_detail_calls integer := 0;
begin
  v_preflight := public.drx_phase8_pilot_build_preflight_v1();

  for v_i in 1..v_warm loop
    v_query := case when mod(v_i,2)=0 then 'am' else 'pa' end;
    perform public.drx_dose_search_v3_shadow_v1(v_query,50);
  end loop;

  for v_i in 1..v_samples loop
    v_query := case when mod(v_i,2)=0 then 'am' else 'pa' end;
    v_started := clock_timestamp();
    perform public.drx_dose_search_v3_shadow_v1(v_query,50);
    v_search_samples := array_append(
      v_search_samples,
      extract(epoch from (clock_timestamp()-v_started))*1000.0
    );
  end loop;

  select percentile_disc(0.95) within group(order by x)
    into v_search_p95
  from unnest(v_search_samples) as t(x);

  if coalesce((v_preflight->>'preflightPass')::boolean,false) then
    for v_pilot in
      select value from jsonb_array_elements(coalesce(v_preflight->'pilots','[]'::jsonb))
    loop
      for v_i in 1..v_warm loop
        perform public.medindex_dose_product_fast_path_v3(
          null::text,
          (v_pilot->>'drugId')::uuid
        );
      end loop;

      for v_i in 1..v_samples loop
        v_started := clock_timestamp();
        v_payload := public.medindex_dose_product_fast_path_v3(
          null::text,
          (v_pilot->>'drugId')::uuid
        );
        v_detail_samples := array_append(
          v_detail_samples,
          extract(epoch from (clock_timestamp()-v_started))*1000.0
        );
        if v_payload is not null then
          v_detail_calls := v_detail_calls + 1;
        end if;
      end loop;
    end loop;

    select percentile_disc(0.95) within group(order by x)
      into v_detail_p95
    from unnest(v_detail_samples) as t(x);
  end if;

  return jsonb_build_object(
    'probeVersion','drx-phase8-performance-probe-v1',
    'measurementScope','database-server-execution',
    'networkLatencyExcluded',true,
    'sampleCount',v_samples,
    'warmSampleCount',v_warm,
    'thresholds',jsonb_build_object(
      'searchP95MaxMs',300,
      'productDetailP95MaxMs',400,
      'searchPageLimit',50
    ),
    'stage',jsonb_build_object(
      'preflightPass',coalesce((v_preflight->>'preflightPass')::boolean,false),
      'clinicalReviewsVerified',coalesce((v_preflight->>'clinicalReviewsVerified')::integer,0),
      'pilotsPublishedInV3',coalesce((v_preflight->>'pilotsPublishedInV3')::integer,0)
    ),
    'searchServerP95Ms',v_search_p95,
    'productDetailServerP95Ms',v_detail_p95,
    'detailPayloadCalls',v_detail_calls,
    'searchPass',coalesce(v_search_p95<=300,false),
    'productDetailPass',
      case
        when coalesce((v_preflight->>'preflightPass')::boolean,false)
          then coalesce(v_detail_p95<=400,false)
               and v_detail_calls=2*v_samples
        else false
      end,
    'finalPerformancePass',
      case
        when coalesce((v_preflight->>'preflightPass')::boolean,false)
          then coalesce(v_search_p95<=300,false)
               and coalesce(v_detail_p95<=400,false)
               and v_detail_calls=2*v_samples
        else false
      end
  );
end;
$$;

revoke all on function public.drx_phase8_performance_probe_v1(integer,integer)
  from public,anon,authenticated;
grant execute on function public.drx_phase8_performance_probe_v1(integer,integer)
  to service_role;
