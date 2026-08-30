do $$
declare
  v_eligible integer;
begin
  select count(*) into v_eligible
  from drx_dose.exact_market_product_source_bindings_v1 b
  join drx_dose.exact_market_product_source_captures_v1 c
    on c.discovery_id=b.discovery_id
   and c.drug_id=b.drug_id
   and c.snapshot_id=b.snapshot_id
  join drx_dose.phase8_exact_source_discovery_v1 d
    on d.discovery_id=b.discovery_id
   and d.drug_id=b.drug_id
   and d.source_snapshot_id=b.snapshot_id
  where b.drug_id in (
      'c8cd0467-da73-479c-b8e8-b785af833f59'::uuid,
      '84a1cf4a-6568-41d7-8d13-0f2b7715acae'::uuid
    )
    and b.binding_status in ('REVIEW','VERIFIED')
    and c.capture_status='CAPTURED'
    and c.raw_sha256=c.snapshot_id
    and d.snapshot_status='INGESTED'
    and d.identity_match_status='EXACT_PRODUCT_CANDIDATE'
    and d.identity_match_dimensions @> '{
      "trade_name":true,
      "strength":true,
      "form":true,
      "packaging":true,
      "manufacturer_or_mah":true,
      "atc":true
    }'::jsonb;

  if v_eligible<>2 then
    raise exception 'Phase 8 exact identity review migration blocked: expected 2 eligible bindings, found %',v_eligible;
  end if;

  update drx_dose.exact_market_product_source_bindings_v1 b
  set binding_status='VERIFIED',
      reviewed_by='phase8-explicit-evidence-review',
      reviewed_at=coalesce(
        b.reviewed_at,
        timestamptz '2026-08-30 19:27:51.492287+00'
      ),
      review_note=
        'Exact market-product identity verified against immutable official MK registry capture: trade name, ATC, strength, pharmaceutical form, packaging and manufacturer/MA-holder all match. This decision verifies product identity only; it does not verify or publish dosing rules.'
  from drx_dose.exact_market_product_source_captures_v1 c,
       drx_dose.phase8_exact_source_discovery_v1 d
  where c.discovery_id=b.discovery_id
    and c.drug_id=b.drug_id
    and c.snapshot_id=b.snapshot_id
    and d.discovery_id=b.discovery_id
    and d.drug_id=b.drug_id
    and d.source_snapshot_id=b.snapshot_id
    and b.drug_id in (
      'c8cd0467-da73-479c-b8e8-b785af833f59'::uuid,
      '84a1cf4a-6568-41d7-8d13-0f2b7715acae'::uuid
    )
    and c.capture_status='CAPTURED'
    and c.raw_sha256=c.snapshot_id
    and d.snapshot_status='INGESTED'
    and d.identity_match_status='EXACT_PRODUCT_CANDIDATE'
    and d.identity_match_dimensions @> '{
      "trade_name":true,
      "strength":true,
      "form":true,
      "packaging":true,
      "manufacturer_or_mah":true,
      "atc":true
    }'::jsonb;
end
$$;
