-- Phase B: enable only after the API and every active client are verified LIVE.
-- SELECT/RLS and service-role DML remain available to the protected CAS RPC.
update prescription_write_private.control set fence_enabled=true where singleton;
revoke insert,update,delete on public.user_prescriptions from public,anon,authenticated;
-- TRUNCATE would bypass prescription versions, tombstones and receipts.
revoke truncate on public.user_prescriptions from public,anon,authenticated,service_role;
