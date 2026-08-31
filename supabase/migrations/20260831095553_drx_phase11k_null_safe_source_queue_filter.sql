
-- DRx Phase 11K: fix NULL-safe source classification filter.
-- Unclassified URLs remain in the ingestion queue; only VERIFIED ineligible URLs
-- are diverted to the replacement queue.

create or replace view drx_dose.source_ingestion_queue_v1 as
select
  c.source_url,
  count(*) as regimen_count,
  count(distinct c.drug_id) as product_count,
  count(distinct c.candidate_context_key) as context_count,
  max(c.parser_confidence) as max_parser_confidence
from drx_dose.rule_candidate_extractions_v1 c
left join drx_dose.source_url_classification_v1 cls
  on cls.source_url=c.source_url
where nullif(btrim(c.source_url),'') is not null
  and not coalesce(
    cls.classification_status='VERIFIED'
    and cls.dose_source_eligible=false,
    false
  )
  and not exists (
    select 1
    from public.dose_source_snapshots_v3 s
    join public.dose_source_sections_v3 sec
      on sec.snapshot_id=s.snapshot_id
     and sec.section_code='4.2'
     and sec.extraction_status='extracted'
    where s.source_url=c.source_url or s.final_url=c.source_url
  )
group by c.source_url;
