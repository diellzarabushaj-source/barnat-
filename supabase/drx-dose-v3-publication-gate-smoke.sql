-- DRx Dosierung V3 transactional publication-gate smoke
-- STATUS: PREPARED_NOT_EXECUTED
-- Run only after the structural post-apply smoke passes on a fresh V3 shadow schema.
-- This script intentionally writes synthetic V3 rows inside one transaction and always ROLLBACKs.

begin;

do $body$
declare
  v_drug_id uuid;
  v_substance_concept_id uuid;
  v_indication_id uuid;
  v_product_id uuid;
  v_rule_id uuid;
  v_rpc jsonb;
  v_good_snapshot text := repeat('a',64);
  v_fallback_snapshot text := repeat('b',64);
  v_missing_section_snapshot text := repeat('c',64);
  v_good_section_sha text := repeat('d',64);
begin
  if exists (
    select 1 from public.dose_source_snapshots_v3
    union all select 1 from public.dose_source_sections_v3
    union all select 1 from public.dose_indication_concepts_v3
    union all select 1 from public.dose_products_v3
    union all select 1 from public.dose_rules_v3
    limit 1
  ) then
    raise exception 'DRX_V3_PUBLICATION_SMOKE_FAILED: V3 shadow must be fresh/empty before transactional smoke';
  end if;

  select d.id into v_drug_id
  from public.drugs d
  order by d.id
  limit 1;

  if v_drug_id is null then
    raise exception 'DRX_V3_PUBLICATION_SMOKE_FAILED: no public.drugs row available for FK smoke fixture';
  end if;

  select c.concept_id into v_substance_concept_id
  from public.substance_concepts_v1 c
  order by c.concept_id
  limit 1;

  if v_substance_concept_id is null then
    raise exception 'DRX_V3_PUBLICATION_SMOKE_FAILED: no substance_concepts_v1 row available for FK smoke fixture';
  end if;

  insert into public.dose_source_snapshots_v3
    (snapshot_id,source_key,source_url,final_url,source_tier,authority,document_type,document_date,fetched_at,raw_sha256,parser_version)
  values
    (v_good_snapshot,'drx-smoke-good','https://www.medicines.org.uk/emc/product/1/smpc','https://www.medicines.org.uk/emc/product/1/smpc','EMC','DRx smoke authority','SmPC',date '2026-08-29',now(),v_good_snapshot,'drx-smoke'),
    (v_fallback_snapshot,'drx-smoke-fallback','https://example.invalid/fallback','https://example.invalid/fallback','FALLBACK','DRx smoke fallback','OTHER',date '2026-08-29',now(),v_fallback_snapshot,'drx-smoke'),
    (v_missing_section_snapshot,'drx-smoke-no-section','https://www.medicines.org.uk/emc/product/2/smpc','https://www.medicines.org.uk/emc/product/2/smpc','EMC','DRx smoke authority','SmPC',date '2026-08-29',now(),v_missing_section_snapshot,'drx-smoke');

  insert into public.dose_source_sections_v3
    (snapshot_id,section_code,section_key,heading,section_text,section_sha256,parser_version,extraction_status)
  values
    (v_good_snapshot,'4.2','4.2','Posology and method of administration','Synthetic DRx smoke section 4.2',v_good_section_sha,'drx-smoke','extracted');

  insert into public.dose_indication_concepts_v3
    (indication_key,canonical_name,editorial_status)
  values
    ('drx-smoke-indication','DRx smoke indication','published')
  returning indication_id into v_indication_id;

  -- Negative 1: a FALLBACK source can never publish a product.
  begin
    insert into public.dose_products_v3
      (drug_id,product_key,trade_name,active_substance,patient_group,source_key,source_snapshot_id,source_evidence_hash,source_document_date,editorial_status,verified_by,verified_at)
    values
      (v_drug_id,'drx-smoke-fallback-product','DRx smoke fallback product','Smoke substance','adult_only','drx-smoke-fallback',v_fallback_snapshot,v_fallback_snapshot,date '2026-08-29','published','drx-smoke',now());
    raise exception 'DRX_V3_PUBLICATION_SMOKE_FAILED: fallback product unexpectedly published';
  exception when others then
    if position('source tier is not publication eligible' in sqlerrm)=0 then
      raise;
    end if;
  end;

  -- Positive product: official-tier snapshot with matching provenance.
  insert into public.dose_products_v3
    (drug_id,product_key,trade_name,active_substance,patient_group,source_key,source_snapshot_id,source_evidence_hash,source_document_date,editorial_status,verified_by,verified_at)
  values
    (v_drug_id,'drx-smoke-good-product','DRx smoke good product','Smoke substance','adult_only','drx-smoke-good',v_good_snapshot,v_good_snapshot,date '2026-08-29','published','drx-smoke',now())
  returning product_id into v_product_id;

  -- Negative 2: even an official-tier rule cannot publish without a persisted extracted 4.2 artifact.
  begin
    insert into public.dose_rules_v3
      (rule_key,substance_concept_id,indication_id,patient_group,calculation_method,dose_min_value,dose_max_value,dose_unit,
       frequency_mode,duration_mode,source_key,source_snapshot_id,source_section,source_section_sha256,source_evidence_hash,
       source_document_date,safety_validation_status,safety_validator_version,safety_validated_at,editorial_status,verified_by,verified_at)
    values
      ('drx-smoke-missing-section-rule',v_substance_concept_id,v_indication_id,'adult_only','fixed_dose',1,1,'mg',
       'single','none','drx-smoke-no-section',v_missing_section_snapshot,'4.2',repeat('e',64),v_missing_section_snapshot,
       date '2026-08-29','passed','drx-smoke',now(),'published','drx-smoke',now());
    raise exception 'DRX_V3_PUBLICATION_SMOKE_FAILED: rule without 4.2 unexpectedly published';
  exception when others then
    if position('verified SmPC section 4.2 artifact missing' in sqlerrm)=0 then
      raise;
    end if;
  end;

  -- Negative 3: a valid source/section is still insufficient without an exact verified product binding.
  begin
    insert into public.dose_rules_v3
      (rule_key,substance_concept_id,indication_id,patient_group,calculation_method,dose_min_value,dose_max_value,dose_unit,
       frequency_mode,duration_mode,source_key,source_snapshot_id,source_section,source_section_sha256,source_evidence_hash,
       source_document_date,safety_validation_status,safety_validator_version,safety_validated_at,editorial_status,verified_by,verified_at)
    values
      ('drx-smoke-unbound-rule',v_substance_concept_id,v_indication_id,'adult_only','fixed_dose',1,1,'mg',
       'single','none','drx-smoke-good',v_good_snapshot,'4.2',v_good_section_sha,v_good_snapshot,
       date '2026-08-29','passed','drx-smoke',now(),'published','drx-smoke',now());
    raise exception 'DRX_V3_PUBLICATION_SMOKE_FAILED: unbound rule unexpectedly published';
  exception when others then
    if position('no verified product binding' in sqlerrm)=0 then
      raise;
    end if;
  end;

  -- Positive rule path: draft -> verified binding -> clean legacy comparison -> publish.
  insert into public.dose_rules_v3
    (rule_key,substance_concept_id,indication_id,patient_group,calculation_method,dose_min_value,dose_max_value,dose_unit,
     frequency_mode,duration_mode,source_key,source_snapshot_id,source_section,source_section_sha256,source_evidence_hash,
     source_document_date,safety_validation_status,safety_validator_version,safety_validated_at,editorial_status,verified_by,verified_at)
  values
    ('drx-smoke-positive-rule',v_substance_concept_id,v_indication_id,'adult_only','fixed_dose',1,1,'mg',
     'single','none','drx-smoke-good',v_good_snapshot,'4.2',v_good_section_sha,v_good_snapshot,
     date '2026-08-29','passed','drx-smoke',now(),'draft','drx-smoke',now())
  returning rule_id into v_rule_id;

  insert into public.dose_rule_products_v3
    (rule_id,product_id,match_method,preferred,binding_status,verified_by,verified_at)
  values
    (v_rule_id,v_product_id,'exact_product',true,'verified','drx-smoke',now());

  insert into public.dose_legacy_comparisons_v3
    (rule_id,product_id,comparison_status)
  values
    (v_rule_id,v_product_id,'not_applicable');

  update public.dose_rules_v3
  set editorial_status='published'
  where rule_id=v_rule_id;

  if not exists (
    select 1 from public.dose_rules_v3
    where rule_id=v_rule_id and editorial_status='published'
  ) then
    raise exception 'DRX_V3_PUBLICATION_SMOKE_FAILED: positive rule did not publish';
  end if;

  select public.medindex_dose_product_fast_path_v3('drx-smoke-good-product',null)
    into v_rpc;

  if v_rpc is null then
    raise exception 'DRX_V3_PUBLICATION_SMOKE_FAILED: published product RPC returned NULL';
  end if;

  if v_rpc->>'schemaVersion' <> 'dose-product-fast-path-v3' then
    raise exception 'DRX_V3_PUBLICATION_SMOKE_FAILED: unexpected RPC schemaVersion';
  end if;

  if coalesce(jsonb_array_length(v_rpc->'product'->'rules'),0) <> 1 then
    raise exception 'DRX_V3_PUBLICATION_SMOKE_FAILED: RPC did not return exactly one published smoke rule';
  end if;

  if v_rpc->'product'->'rules'->0->'source'->>'sectionSha256' <> v_good_section_sha then
    raise exception 'DRX_V3_PUBLICATION_SMOKE_FAILED: RPC section hash provenance mismatch';
  end if;

  -- Negative 4: once published provenance is referenced, snapshot/section mutations are locked.
  begin
    update public.dose_source_sections_v3
    set section_text='tampered smoke section'
    where snapshot_id=v_good_snapshot and section_code='4.2';
    raise exception 'DRX_V3_PUBLICATION_SMOKE_FAILED: published source section mutation was not blocked';
  exception when others then
    if position('DRX_V3_PROVENANCE_LOCKED' in sqlerrm)=0 then
      raise;
    end if;
  end;

  begin
    update public.dose_source_snapshots_v3
    set authority='tampered smoke authority'
    where snapshot_id=v_good_snapshot;
    raise exception 'DRX_V3_PUBLICATION_SMOKE_FAILED: published source snapshot mutation was not blocked';
  exception when others then
    if position('DRX_V3_PROVENANCE_LOCKED' in sqlerrm)=0 then
      raise;
    end if;
  end;
end
$body$;

rollback;
