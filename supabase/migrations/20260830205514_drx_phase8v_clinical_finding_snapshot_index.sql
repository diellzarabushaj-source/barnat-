-- DRx Phase 8V: cover clinical finding snapshot foreign key.
create index if not exists drx_phase8_clinical_finding_snapshot_idx
  on drx_dose.phase8_clinical_rule_findings_v1(source_snapshot_id);
