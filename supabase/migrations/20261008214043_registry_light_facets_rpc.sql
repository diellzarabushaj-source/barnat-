-- Lightweight values for non-dose facets; normal pages and dose filters retain
-- the canonical verified card reader. No full source document is projected.
create or replace function public.drx_registry_light_facets_v1()
returns jsonb language sql stable security invoker
set search_path = ''
set statement_timeout = '6s'
as $function$
  with products as materialized (
    select id,registry_number,pdid,trade_name,active_substance,atc_code,
      drug_class,use_text,approved_population,strength,pharmaceutical_form,
      update_status,product_status,retail_price,editorial_status,
      source_payload->>'Si të shënohet në recetë' as prescription_notation,
      registry_search_text
    from public.drugs
    where is_published = true and editorial_status = 'published'
    order by registry_number,id limit 20001
  )
  select case when count(*) > 20000
    then jsonb_build_object('ok',false,'error','snapshot_too_large')
    else jsonb_build_object('ok',true,'version',1,'count',count(*),
      'drugs',coalesce(jsonb_agg(to_jsonb(p) order by registry_number,id),'[]'::jsonb))
    end from products p;
$function$;
revoke all on function public.drx_registry_light_facets_v1() from public;
grant execute on function public.drx_registry_light_facets_v1() to anon,authenticated,service_role;
-- The full-payload candidate failed the local latency comparison. Keep it
-- private to privileged diagnostics; production uses the existing card path.
revoke execute on function public.drx_registry_filter_snapshot_v1() from anon,authenticated;
