revoke all on function public.medindex_dose_product_fast_path_v3(text,uuid)
  from public,anon,authenticated;
grant execute on function public.medindex_dose_product_fast_path_v3(text,uuid)
  to service_role;
