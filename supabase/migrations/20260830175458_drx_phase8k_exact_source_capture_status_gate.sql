create or replace function public.drx_phase8_capture_status_v1()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
with m as (
  select
    (select count(*) from drx_dose.phase8_published_v2_comparator_v1)
      published_v2_comparator_products,
    (select count(*) from drx_dose.phase8_exact_source_discovery_v1
      where identity_match_status='EXACT_PRODUCT_CANDIDATE')
      exact_source_discovery_candidates,
    (select count(*) from drx_dose.phase8_exact_source_discovery_v1
      where snapshot_status='INGESTED' and source_snapshot_id is not null)
      exact_source_snapshot_ready,
    (select count(*) from drx_dose.exact_market_product_source_captures_v1
      where capture_status='CAPTURED')
      exact_source_capture_rows,
    (select count(*) from drx_dose.exact_market_product_source_bindings_v1
      where binding_status='REVIEW')
      exact_source_review_bindings,
    (select count(*) from drx_dose.exact_market_product_source_bindings_v1
      where binding_status='VERIFIED')
      exact_source_verified_bindings,
    (select count(*) from drx_dose.exact_market_product_source_bindings_v1
      where binding_status='REJECTED')
      exact_source_rejected_bindings,
    (select count(*) from drx_dose.phase8_pilot_readiness_v1
      where pilot_status='EXACT_PRODUCT_REVIEW_PENDING')
      pilot_review_pending,
    (select count(*) from drx_dose.phase8_pilot_readiness_v1
      where pilot_status='READY_FOR_V3_BUILD')
      pilot_ready_for_v3_build,
    (select count(*) from drx_dose.phase8_pilot_readiness_v1
      where pilot_status='SOURCE_SNAPSHOT_MISSING')
      pilot_source_snapshot_missing,
    (select count(*)
      from drx_dose.phase8_exact_source_discovery_v1 d
      where d.snapshot_status='INGESTED'
        and not exists (
          select 1
          from drx_dose.exact_market_product_source_captures_v1 c
          where c.discovery_id=d.discovery_id
            and c.drug_id=d.drug_id
            and c.snapshot_id=d.source_snapshot_id
            and c.capture_status='CAPTURED'
            and c.raw_sha256=d.source_snapshot_id
        )
    ) invalid_ingested_discovery_rows,
    (select count(*)
      from drx_dose.exact_market_product_source_bindings_v1 b
      where not exists (
        select 1
        from drx_dose.exact_market_product_source_captures_v1 c
        where c.discovery_id=b.discovery_id
          and c.drug_id=b.drug_id
          and c.snapshot_id=b.snapshot_id
          and c.capture_status='CAPTURED'
      )
    ) orphan_exact_source_bindings
),
g as (
  select
    m.*,
    (
      m.published_v2_comparator_products>0
      and m.exact_source_discovery_candidates=m.published_v2_comparator_products
      and m.exact_source_snapshot_ready=m.exact_source_discovery_candidates
      and m.exact_source_capture_rows=m.exact_source_snapshot_ready
      and (
        m.exact_source_review_bindings
        + m.exact_source_verified_bindings
        + m.exact_source_rejected_bindings
      )=m.exact_source_capture_rows
      and m.pilot_source_snapshot_missing=0
      and m.invalid_ingested_discovery_rows=0
      and m.orphan_exact_source_bindings=0
    ) source_capture_gate_pass
  from m
)
select jsonb_build_object(
  'published_v2_comparator_products',g.published_v2_comparator_products,
  'exact_source_discovery_candidates',g.exact_source_discovery_candidates,
  'exact_source_snapshot_ready',g.exact_source_snapshot_ready,
  'exact_source_capture_rows',g.exact_source_capture_rows,
  'exact_source_review_bindings',g.exact_source_review_bindings,
  'exact_source_verified_bindings',g.exact_source_verified_bindings,
  'exact_source_rejected_bindings',g.exact_source_rejected_bindings,
  'pilot_review_pending',g.pilot_review_pending,
  'pilot_ready_for_v3_build',g.pilot_ready_for_v3_build,
  'pilot_source_snapshot_missing',g.pilot_source_snapshot_missing,
  'invalid_ingested_discovery_rows',g.invalid_ingested_discovery_rows,
  'orphan_exact_source_bindings',g.orphan_exact_source_bindings,
  'source_capture_gate_pass',g.source_capture_gate_pass,
  'human_review_required',true,
  'automatic_verification_enabled',false,
  'publication_allowed',false
)
from g;
$$;

revoke all on function public.drx_phase8_capture_status_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase8_capture_status_v1()
  to service_role;

comment on function public.drx_phase8_capture_status_v1() is
  'Service-only Phase 8 exact-source capture integrity gate. Capture PASS does not imply clinical/product review or publication.';
