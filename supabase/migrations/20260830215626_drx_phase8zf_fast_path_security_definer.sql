-- DRx Phase 8ZF: keep the V3 fast path service-only while allowing
-- the SECURITY DEFINER owner to read private Phase 8 evidence used by the RPC.
-- No browser/client role gains schema usage or RPC execute permission.

alter function public.medindex_dose_product_fast_path_v3(text,uuid)
  security definer;

revoke all on function public.medindex_dose_product_fast_path_v3(text,uuid)
  from public,anon,authenticated;
grant execute on function public.medindex_dose_product_fast_path_v3(text,uuid)
  to service_role;
