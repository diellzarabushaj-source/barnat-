-- Phase 8ZE fast-path service grant rollback.
revoke execute on function public.medindex_dose_product_fast_path_v3(text,uuid)
  from service_role;
