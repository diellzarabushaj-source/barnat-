-- DRx Phase 8W rollback.
-- Removes only the modeled Phase 8 provenance bridge. Raw snapshots/sections remain immutable.
do $$
declare
  v_refs integer;
begin
  select count(*) into v_refs
  from drx_clinical.source_documents_v1 d
  where d.source_key in ('emc-10038-phase8-clinical-ref','emc-13494-phase8-clinical-ref')
    and (
      exists (select 1 from public.dose_products_v3 p where p.source_snapshot_id=d.snapshot_id)
      or exists (select 1 from public.dose_rules_v3 r where r.source_snapshot_id=d.snapshot_id)
      or exists (
        select 1 from drx_dose.product_source_bindings_v1 b
        where b.source_document_id=d.source_document_id
      )
    );

  if v_refs>0 then
    raise exception 'Phase 8W rollback blocked: modeled pilot provenance is already referenced by V3 evidence';
  end if;

  delete from drx_clinical.source_identity_candidates_v1 c
  using drx_clinical.source_documents_v1 d
  where c.source_document_id=d.source_document_id
    and d.source_key in ('emc-10038-phase8-clinical-ref','emc-13494-phase8-clinical-ref');

  delete from drx_clinical.source_section_evidence_v1 e
  using drx_clinical.source_documents_v1 d
  where e.source_document_id=d.source_document_id
    and d.source_key in ('emc-10038-phase8-clinical-ref','emc-13494-phase8-clinical-ref');

  delete from drx_clinical.source_documents_v1
  where source_key in ('emc-10038-phase8-clinical-ref','emc-13494-phase8-clinical-ref');
end $$;
