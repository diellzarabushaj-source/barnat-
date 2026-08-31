begin;
revoke all on function public.drx_phase10_legacy_retirement_preflight_v1()
  from public, anon, authenticated, service_role;
drop function if exists public.drx_phase10_legacy_retirement_preflight_v1();
commit;
