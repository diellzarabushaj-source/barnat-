-- Rollback Phase 8ZF.
-- Restores SECURITY INVOKER but keeps client roles unable to execute the RPC.

alter function public.medindex_dose_product_fast_path_v3(text,uuid)
  security invoker;

revoke all on function public.medindex_dose_product_fast_path_v3(text,uuid)
  from public,anon,authenticated;
grant execute on function public.medindex_dose_product_fast_path_v3(text,uuid)
  to service_role;
