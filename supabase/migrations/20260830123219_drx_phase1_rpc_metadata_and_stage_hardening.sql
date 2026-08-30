-- DRx Phase 1: make the public V3 SECURITY INVOKER RPC executable without
-- exposing raw SmPC text, and harden the internal staging schema.
alter table public.dose_source_snapshots_v3 enable row level security;
alter table public.dose_source_sections_v3 enable row level security;

revoke all privileges on table public.dose_source_snapshots_v3 from public, anon, authenticated;
revoke all privileges on table public.dose_source_sections_v3 from public, anon, authenticated;

grant select (snapshot_id, source_key, source_tier, document_version, document_date)
  on public.dose_source_snapshots_v3 to anon, authenticated;
grant select (snapshot_id, section_code, section_sha256, extraction_status)
  on public.dose_source_sections_v3 to anon, authenticated;

drop policy if exists dose_source_snapshots_v3_rpc_metadata_read
  on public.dose_source_snapshots_v3;
create policy dose_source_snapshots_v3_rpc_metadata_read
  on public.dose_source_snapshots_v3
  for select to anon, authenticated
  using (source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM'));

drop policy if exists dose_source_sections_v3_rpc_metadata_read
  on public.dose_source_sections_v3;
create policy dose_source_sections_v3_rpc_metadata_read
  on public.dose_source_sections_v3
  for select to anon, authenticated
  using (
    section_code = '4.2'
    and extraction_status = 'extracted'
    and exists (
      select 1
      from public.dose_source_snapshots_v3 s
      where s.snapshot_id = dose_source_sections_v3.snapshot_id
        and s.source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM')
    )
  );

revoke all on schema drx_stage from public, anon, authenticated;
revoke all privileges on all tables in schema drx_stage from public, anon, authenticated;
revoke all privileges on all sequences in schema drx_stage from public, anon, authenticated;
revoke execute on all functions in schema drx_stage from public, anon, authenticated;

alter default privileges for role postgres in schema drx_stage
  revoke all privileges on tables from public, anon, authenticated;
alter default privileges for role postgres in schema drx_stage
  revoke all privileges on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema drx_stage
  revoke execute on functions from public, anon, authenticated;

revoke all on function public.medindex_dose_product_fast_path_v3(text, uuid) from public;
grant execute on function public.medindex_dose_product_fast_path_v3(text, uuid) to anon, authenticated;

comment on policy dose_source_snapshots_v3_rpc_metadata_read
  on public.dose_source_snapshots_v3
  is 'DRx Phase 1: metadata-only RLS path for SECURITY INVOKER runtime RPC. Raw provenance content is not granted.';
comment on policy dose_source_sections_v3_rpc_metadata_read
  on public.dose_source_sections_v3
  is 'DRx Phase 1: extracted SmPC 4.2 metadata only. section_text/extracted_json remain client-inaccessible.';
