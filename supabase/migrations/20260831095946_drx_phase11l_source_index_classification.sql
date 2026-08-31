
-- DRx Phase 11L: classify catalog/index URLs that are not direct posology evidence.
-- They remain useful for product/source discovery, but cannot satisfy the §4.2 gate.

insert into drx_dose.source_url_classification_v1(
  source_url,source_kind,dose_source_eligible,classification_status,
  reason_code,evidence_ref,reviewed_by,reviewed_at
) values
(
  'https://trepharm.com/rx-products/',
  'PRODUCT_PAGE',
  false,
  'VERIFIED',
  'PRODUCT_CATALOG_NOT_POSOLOGY_EVIDENCE',
  'TrePharm RX Products page lists trade name, form, INN, strength, packaging and ATC; it does not provide an SmPC section 4.2 dosing document.',
  'system:phase11l-public-source-review',
  now()
),
(
  'https://www.hemofarm.com/srb/proizvodi/lekovi-uz-lekarski-recept',
  'PRODUCT_PAGE',
  false,
  'VERIFIED',
  'PRODUCT_INDEX_REQUIRES_EXACT_SMPC_LINK',
  'Hemofarm prescription-product index links individual Sažetak karakteristika leka documents; the index itself is not the exact product SmPC/section 4.2 source.',
  'system:phase11l-public-source-review',
  now()
)
on conflict (source_url) do update set
  source_kind=excluded.source_kind,
  dose_source_eligible=excluded.dose_source_eligible,
  classification_status=excluded.classification_status,
  reason_code=excluded.reason_code,
  evidence_ref=excluded.evidence_ref,
  reviewed_by=excluded.reviewed_by,
  reviewed_at=excluded.reviewed_at,
  updated_at=now();

create or replace view drx_dose.source_discovery_queue_v1 as
select
  c.source_url as discovery_index_url,
  cls.reason_code,
  c.drug_id,
  c.registry_number,
  c.trade_name,
  c.target_kind,
  c.substance_concept_id,
  c.ingredient_set_id,
  c.patient_group,
  c.indication_text,
  c.dose_text,
  c.parser_status,
  c.parser_confidence,
  c.source_url as legacy_source_url,
  case
    when cls.reason_code='PRODUCT_INDEX_REQUIRES_EXACT_SMPC_LINK'
      then 'FIND_EXACT_PRODUCT_SMPC'
    when cls.reason_code in ('PRODUCT_CATALOG_NOT_POSOLOGY_EVIDENCE','REGISTRY_WORKBOOK_NOT_POSOLOGY_EVIDENCE')
      then 'REPLACE_WITH_OFFICIAL_SMPC_OR_LABEL'
    else 'SOURCE_REVIEW'
  end as discovery_action
from drx_dose.rule_candidate_extractions_v1 c
join drx_dose.source_url_classification_v1 cls
  on cls.source_url=c.source_url
 and cls.classification_status='VERIFIED'
 and cls.dose_source_eligible=false;

create or replace view drx_dose.source_discovery_priority_v1 as
select
  discovery_index_url,
  reason_code,
  discovery_action,
  count(*) as regimen_count,
  count(distinct drug_id) as product_count,
  count(*) filter (where parser_status='STRUCTURED_CANDIDATE') as structured_candidate_rows,
  max(parser_confidence) as max_parser_confidence,
  (
    count(*) filter (where parser_status='STRUCTURED_CANDIDATE') * 120
    + count(distinct drug_id) * 10
    + least(count(*),50)
  )::integer as priority_score
from drx_dose.source_discovery_queue_v1
group by discovery_index_url,reason_code,discovery_action;

revoke all on drx_dose.source_discovery_queue_v1 from public,anon,authenticated;
revoke all on drx_dose.source_discovery_priority_v1 from public,anon,authenticated;
grant select on drx_dose.source_discovery_queue_v1 to service_role;
grant select on drx_dose.source_discovery_priority_v1 to service_role;
