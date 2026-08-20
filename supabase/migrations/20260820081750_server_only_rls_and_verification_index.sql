-- Complete the verification FK index and make the existing server-only RLS
-- posture explicit. The service role continues to bypass RLS; browser roles get
-- a deterministic deny policy in addition to revoked table privileges.

create index if not exists verification_documents_reviewed_by_idx
  on public.verification_documents (reviewed_by);

drop policy if exists audit_logs_direct_access_denied on public.audit_logs;
create policy audit_logs_direct_access_denied on public.audit_logs
  for all to authenticated using (false) with check (false);

drop policy if exists drive_sheet_rows_direct_access_denied on public.drive_sheet_rows;
create policy drive_sheet_rows_direct_access_denied on public.drive_sheet_rows
  for all to authenticated using (false) with check (false);

drop policy if exists drive_sync_sources_direct_access_denied on public.drive_sync_sources;
create policy drive_sync_sources_direct_access_denied on public.drive_sync_sources
  for all to authenticated using (false) with check (false);

drop policy if exists medindex_users_direct_access_denied on public.medindex_users;
create policy medindex_users_direct_access_denied on public.medindex_users
  for all to authenticated using (false) with check (false);

drop policy if exists sync_outbox_direct_access_denied on public.sync_outbox;
create policy sync_outbox_direct_access_denied on public.sync_outbox
  for all to authenticated using (false) with check (false);

drop policy if exists sync_runs_direct_access_denied on public.sync_runs;
create policy sync_runs_direct_access_denied on public.sync_runs
  for all to authenticated using (false) with check (false);
