-- DRx Phase 8P: service-only pilot build preflight.
-- This migration reports blockers; it never performs clinical review or publication.

create or replace function public.drx_phase8_pilot_build_preflight_v1()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_dose
as $$
with pilot as (
  select
    r.drug_id,
    r.v2_product_key,
    r.trade_name,
    r.pilot_status,
    r.snapshot_status='INGESTED' and r.source_snapshot_id is not null
      as exact_source_snapshot_ready,
    r.exact_product_binding_verified,
    r.clinical_reference_source_status='INGESTED'
      and r.clinical_reference_snapshot_id is not null
      as clinical_reference_ingested,
    r.clinical_reference_presentation_status='MATCHED'
      as clinical_reference_presentation_matched,
    r.clinical_reference_review_status='VERIFIED'
      as clinical_reference_reviewed,
    (select count(*)
       from public.dose_products_v3 p
      where p.drug_id=r.drug_id
        and p.editorial_status='published') as v3_published_product_count,
    (select count(distinct b.rule_id)
       from public.dose_products_v3 p
       join public.dose_rule_products_v3 b on b.product_id=p.product_id
       join public.dose_rules_v3 dr on dr.rule_id=b.rule_id
      where p.drug_id=r.drug_id
        and p.editorial_status='published'
        and b.binding_status='verified'
        and dr.editorial_status='published') as v3_published_rule_count,
    (select count(*)
       from public.dose_products_v3 p
       join public.dose_rule_products_v3 b on b.product_id=p.product_id
      where p.drug_id=r.drug_id
        and p.editorial_status='published'
        and b.binding_status='verified') as v3_verified_binding_count
  from drx_dose.phase8_pilot_readiness_v1 r
), annotated as (
  select
    p.*,
    array_remove(array[
      case when not p.exact_source_snapshot_ready
        then 'EXACT_SOURCE_SNAPSHOT_MISSING' end,
      case when not p.exact_product_binding_verified
        then 'EXACT_PRODUCT_REVIEW_PENDING' end,
      case when not p.clinical_reference_ingested
        then 'CLINICAL_REFERENCE_SNAPSHOT_MISSING' end,
      case when not p.clinical_reference_presentation_matched
        then 'CLINICAL_REFERENCE_PRESENTATION_UNMATCHED' end,
      case when not p.clinical_reference_reviewed
        then 'CLINICAL_REFERENCE_REVIEW_PENDING' end,
      case when p.v3_published_product_count=0
        then 'V3_PRODUCT_NOT_PUBLISHED' end,
      case when p.v3_published_rule_count=0
        then 'V3_RULES_NOT_PUBLISHED' end,
      case when p.v3_verified_binding_count=0
        then 'V3_PRODUCT_RULE_BINDINGS_NOT_VERIFIED' end
    ],null)::text[] as blocker_codes
  from pilot p
)
select jsonb_build_object(
  'preflightVersion','drx-phase8-pilot-build-preflight-v1',
  'generatedAt',clock_timestamp(),
  'requiredPilotCount',2,
  'pilotCount',(select count(*) from annotated),
  'clinicalReviewsVerified',(
    select count(*) from annotated where clinical_reference_reviewed
  ),
  'pilotsReadyForV3Build',(
    select count(*)
    from annotated
    where exact_source_snapshot_ready
      and exact_product_binding_verified
      and clinical_reference_ingested
      and clinical_reference_presentation_matched
      and clinical_reference_reviewed
  ),
  'pilotsPublishedInV3',(
    select count(*)
    from annotated
    where v3_published_product_count=1
      and v3_published_rule_count>0
      and v3_verified_binding_count=v3_published_rule_count
  ),
  'pilots',coalesce((
    select jsonb_agg(jsonb_build_object(
      'drugId',a.drug_id,
      'productKey',a.v2_product_key,
      'tradeName',a.trade_name,
      'pilotStatus',a.pilot_status,
      'exactSourceSnapshotReady',a.exact_source_snapshot_ready,
      'exactProductIdentityVerified',a.exact_product_binding_verified,
      'clinicalReferenceIngested',a.clinical_reference_ingested,
      'clinicalReferencePresentationMatched',a.clinical_reference_presentation_matched,
      'clinicalReferenceReviewed',a.clinical_reference_reviewed,
      'v3PublishedProductCount',a.v3_published_product_count,
      'v3PublishedRuleCount',a.v3_published_rule_count,
      'v3VerifiedBindingCount',a.v3_verified_binding_count,
      'blockerCodes',to_jsonb(a.blocker_codes)
    ) order by a.trade_name)
    from annotated a
  ),'[]'::jsonb),
  'humanClinicalReviewRequired',true,
  'automaticClinicalReviewEnabled',false,
  'automaticPublicationEnabled',false,
  'preflightPass',(
    select count(*)=2
       and count(*) filter (
         where cardinality(blocker_codes)=0
       )=2
    from annotated
  )
);
$$;

revoke all on function public.drx_phase8_pilot_build_preflight_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase8_pilot_build_preflight_v1()
  to service_role;

comment on function public.drx_phase8_pilot_build_preflight_v1() is
  'Service-only Phase 8 pilot preflight. Reports exact-source, human-review and V3 publication blockers without mutating clinical state.';
