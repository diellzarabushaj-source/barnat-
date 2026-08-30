-- DRx strict Phase 2 migration-history parity and safe duplicate-batch cleanup.
--
-- Production needed this migration after two concurrent Phase 2 bootstrap paths
-- created the same finalized REGISTRY_RAW snapshot twice. On a clean replay the
-- duplicate does not exist, so this migration is intentionally idempotent.
--
-- Safety rules:
--   * only finalized REGISTRY_RAW batches with the same source SHA and row count
--     are considered duplicates;
--   * prefer a Google Drive (`gdrive:`) batch as canonical, then the oldest batch;
--   * never remove a batch whose raw rows are targeted by correction decisions;
--   * require the canonical batch to contain its declared full row count;
--   * preserve immutable-ledger protection outside the narrowly-scoped cleanup.

do $$
declare
  v_group record;
  v_canonical uuid;
  v_candidate record;
  v_expected integer;
  v_canonical_rows integer;
  v_refs integer;
begin
  for v_group in
    select source_sha256, source_row_count
    from drx_raw.registry_import_batches_v1
    where batch_kind='REGISTRY_RAW'
      and status='FINALIZED'
    group by source_sha256, source_row_count
    having count(*) > 1
  loop
    select b.batch_id, b.source_row_count
      into v_canonical, v_expected
    from drx_raw.registry_import_batches_v1 b
    where b.batch_kind='REGISTRY_RAW'
      and b.status='FINALIZED'
      and b.source_sha256=v_group.source_sha256
      and b.source_row_count=v_group.source_row_count
    order by
      case when b.source_ref like 'gdrive:%' then 0 else 1 end,
      b.captured_at,
      b.batch_id
    limit 1;

    select count(*) into v_canonical_rows
    from drx_raw.registry_rows_v1
    where batch_id=v_canonical;

    if v_canonical_rows <> v_expected then
      raise exception
        'Phase 2 duplicate cleanup refused: canonical batch % has % rows; expected %',
        v_canonical, v_canonical_rows, v_expected;
    end if;

    for v_candidate in
      select b.batch_id
      from drx_raw.registry_import_batches_v1 b
      where b.batch_kind='REGISTRY_RAW'
        and b.status='FINALIZED'
        and b.source_sha256=v_group.source_sha256
        and b.source_row_count=v_group.source_row_count
        and b.batch_id<>v_canonical
      order by b.captured_at,b.batch_id
    loop
      select count(*) into v_refs
      from drx_raw.registry_corrections_v1 c
      join drx_raw.registry_rows_v1 r on r.raw_row_id=c.target_raw_row_id
      where r.batch_id=v_candidate.batch_id;

      if v_refs<>0 then
        raise exception
          'Phase 2 duplicate cleanup refused: batch % is referenced by % correction rows',
          v_candidate.batch_id, v_refs;
      end if;

      delete from drx_raw.registry_anomalies_v1
      where batch_id=v_candidate.batch_id;

      alter table drx_raw.registry_rows_v1
        disable trigger registry_rows_v1_immutable;
      begin
        delete from drx_raw.registry_rows_v1
        where batch_id=v_candidate.batch_id;
      exception when others then
        alter table drx_raw.registry_rows_v1
          enable trigger registry_rows_v1_immutable;
        raise;
      end;
      alter table drx_raw.registry_rows_v1
        enable trigger registry_rows_v1_immutable;

      delete from drx_raw.registry_import_batches_v1
      where batch_id=v_candidate.batch_id;
    end loop;
  end loop;
end;
$$;
