-- DRx Phase 1 rollback: restore the pre-Phase-1 client-deny state for
-- provenance tables. drx_stage access is not restored because the verified
-- pre-change state already had no client schema usage or object grants.
begin;

drop policy if exists dose_source_sections_v3_rpc_metadata_read
  on public.dose_source_sections_v3;
drop policy if exists dose_source_snapshots_v3_rpc_metadata_read
  on public.dose_source_snapshots_v3;

revoke select (snapshot_id, source_key, source_tier, document_version, document_date)
  on public.dose_source_snapshots_v3 from anon, authenticated;
revoke select (snapshot_id, section_code, section_sha256, extraction_status)
  on public.dose_source_sections_v3 from anon, authenticated;

-- V2 must remain the traffic fallback if this rollback is executed.
commit;
