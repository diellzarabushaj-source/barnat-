-- DRx Phase 11DB: lean source-first indication packet v3.
-- v3 delegates to the already-gated v2 packet, removes the duplicated flat
-- items array, and remains service-role only.

create or replace function public.drx_phase11_indication_review_packet_v3()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
select
  (public.drx_phase11_indication_review_packet_v2() - 'items')
  || jsonb_build_object('packetVersion',3);
$$;

revoke all on function public.drx_phase11_indication_review_packet_v3()
  from public,anon,authenticated;
grant execute on function public.drx_phase11_indication_review_packet_v3()
  to service_role;
