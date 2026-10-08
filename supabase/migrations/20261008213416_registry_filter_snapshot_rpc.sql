-- One MVCC statement replaces paged REST reads for advanced column filters.
-- SECURITY INVOKER preserves the existing published-data RLS boundary.
create or replace function public.drx_registry_filter_snapshot_v1()
returns jsonb
language sql stable security invoker
set search_path = ''
set statement_timeout = '6s'
as $function$
  with products as materialized (
    select id,registry_number,pdid,trade_name,active_substance,atc_code,
      drug_class,use_text,approved_population,strength,pharmaceutical_form,
      update_status,product_status,retail_price,editorial_status,
      source_payload->>'Si të shënohet në recetë' as prescription_notation,
      registry_search_text,pediatric_dose_summary,
      source_payload->>'Doza e plotë — Të rritur' as dose_fallback_0,
      source_payload->>'Doza — Të rritur' as dose_fallback_1,
      source_payload->>'Doza të rritur' as dose_fallback_2,
      source_payload->>'Doza e të rriturve' as dose_fallback_3,
      source_payload->>'Doza pediatrike — përmbledhje' as dose_fallback_4,
      source_payload->>'Doza e plotë — Fëmijë' as dose_fallback_5,
      source_payload->>'Doza — Fëmijë' as dose_fallback_6,
      source_payload->>'Doza pediatrike' as dose_fallback_7
    from public.drugs
    where is_published = true and editorial_status = 'published'
    order by registry_number,id limit 20001
  ), regimens as materialized (
    select id,drug_id,population,dose_text,source_key
    from public.dosage_regimens
    where editorial_status = 'published'
      and calculation_status in ('text_verified','calculable_verified')
      and source_key like 'card:%'
    order by drug_id,population,source_key,id limit 50001
  ), totals as (
    select (select count(*) from products) as drugs,
      (select count(*) from regimens) as regimens
  ), payload as (
    select jsonb_build_object(
      'drugs',coalesce((select jsonb_agg(to_jsonb(p) order by registry_number,id) from products p),'[]'::jsonb),
      'regimens',coalesce((select jsonb_agg(to_jsonb(r) - 'id' order by drug_id,population,source_key,id) from regimens r),'[]'::jsonb)
    ) as data
  )
  select case when totals.drugs > 20000 or totals.regimens > 50000
    then jsonb_build_object('ok',false,'error','snapshot_too_large')
    else payload.data || jsonb_build_object('ok',true,'version',1,
      'counts',jsonb_build_object('drugs',totals.drugs,'regimens',totals.regimens),
      'revision',md5(payload.data::text))
    end
  from totals cross join payload;
$function$;
revoke all on function public.drx_registry_filter_snapshot_v1() from public;
grant execute on function public.drx_registry_filter_snapshot_v1() to anon,authenticated,service_role;
comment on function public.drx_registry_filter_snapshot_v1() is
  'Bounded read-only published registry and verified card regimen projection. No private library data, source documents or clinical status promotion.';
