-- Roll back Phase 8M without CASCADE.
-- Keep the readiness view ABI stable for dependent functions, but restore pre-8M behavior.

create or replace view drx_dose.phase8_pilot_readiness_v1 as
select
  c.drug_id,
  c.product_key v2_product_key,
  c.trade_name,
  c.active_substance,
  c.pharmaceutical_form,
  c.route,
  c.patient_group,
  c.published_rule_bindings,
  c.published_rule_keys,
  d.discovery_id,
  d.v2_source_key,
  d.source_url,
  d.source_authority,
  d.source_jurisdiction,
  d.source_tier,
  d.external_registry_id,
  d.identity_match_status,
  d.identity_match_dimensions,
  d.snapshot_status,
  d.source_snapshot_id,
  d.clinical_evidence_status,
  exists (
    select 1 from drx_dose.exact_market_product_source_bindings_v1 b
    where b.discovery_id=d.discovery_id
      and b.drug_id=c.drug_id
      and b.snapshot_id=d.source_snapshot_id
      and b.binding_status='VERIFIED'
  ) exact_product_binding_verified,
  case
    when d.discovery_id is null then 'NO_EXACT_SOURCE_DISCOVERY'
    when d.identity_match_status<>'EXACT_PRODUCT_CANDIDATE' then 'IDENTITY_REVIEW_REQUIRED'
    when d.snapshot_status<>'INGESTED' then 'SOURCE_SNAPSHOT_MISSING'
    when not exists (
      select 1 from drx_dose.exact_market_product_source_bindings_v1 b
      where b.discovery_id=d.discovery_id
        and b.drug_id=c.drug_id
        and b.snapshot_id=d.source_snapshot_id
        and b.binding_status='VERIFIED'
    ) then 'EXACT_PRODUCT_REVIEW_PENDING'
    else 'READY_FOR_V3_BUILD'
  end pilot_status,
  false::boolean automatic_publication_allowed,
  null::uuid clinical_reference_id,
  null::text clinical_reference_source_key,
  null::text clinical_reference_source_url,
  null::text clinical_reference_source_tier,
  null::text clinical_reference_snapshot_id,
  null::text clinical_reference_source_status,
  null::text clinical_reference_presentation_status,
  null::text clinical_reference_review_status
from drx_dose.phase8_published_v2_comparator_v1 c
left join drx_dose.phase8_exact_source_discovery_v1 d
  on d.drug_id=c.drug_id and d.v2_product_key=c.product_key;

drop function if exists public.drx_phase8_register_clinical_reference_v1(jsonb);
drop trigger if exists drx_phase8_clinical_reference_review_guard
  on drx_dose.phase8_pilot_clinical_references_v1;
drop function if exists drx_dose.guard_phase8_clinical_reference_review_v1();
drop table if exists drx_dose.phase8_pilot_clinical_references_v1;
