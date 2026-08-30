-- DRx Phase 9D: canonical product context for the frontend.
-- Read-only identity/presentation metadata. No dosing calculations are performed.

create or replace function public.drx_phase9_product_context_v1(p_drug_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_variant,drx_identity,drx_norm
as $$
with base as (
  select
    m.product_id,
    m.composition_concept_id,
    m.clinical_variant_id,
    m.binding_status,
    m.anomaly_codes,
    m.form_key,
    m.release_key,
    m.route_key,
    c.canonical_name,
    c.concept_kind,
    c.public_concept_id,
    c.identity_status,
    n.population_key,
    n.population_status,
    n.form_status,
    n.route_status,
    n.release_status,
    (
      select count(*)::integer
      from drx_variant.market_products_v1 sibling
      where sibling.composition_concept_id=m.composition_concept_id
    ) product_count
  from drx_variant.market_products_v1 m
  left join drx_identity.canonical_concepts_v1 c
    on c.concept_id=m.composition_concept_id
  left join drx_norm.product_normalization_v1 n
    on n.drug_id=m.product_id
  where m.product_id=p_drug_id
),
v3 as (
  select
    p.drug_id,
    p.product_key,
    p.version_no,
    p.source_key,
    p.source_snapshot_id,
    s.source_tier,
    s.document_version,
    s.document_date
  from public.dose_products_v3 p
  join public.dose_source_snapshots_v3 s
    on s.snapshot_id=p.source_snapshot_id
   and s.source_key=p.source_key
  where p.drug_id=p_drug_id
    and p.editorial_status='published'
  limit 1
)
select coalesce((
  select jsonb_build_object(
    'contextVersion','drx-phase9-product-context-v1',
    'drugId',b.product_id,
    'substanceConceptId',b.composition_concept_id,
    'publicSubstanceConceptId',b.public_concept_id,
    'substanceCanonicalName',b.canonical_name,
    'conceptKind',b.concept_kind,
    'identityStatus',b.identity_status,
    'clinicalVariantId',case when b.binding_status='BOUND' then b.clinical_variant_id else null end,
    'variantStatus',case
      when b.binding_status='BOUND' then 'BOUND'
      when exists (
        select 1 from drx_dose.phase8_pilot_variant_overrides_v1 o
        where o.drug_id=b.product_id
      ) then 'REVIEWED_PILOT_OVERRIDE_NO_CANONICAL_VARIANT_ID'
      else 'UNRESOLVED'
    end,
    'anomalyCodes',coalesce(to_jsonb(b.anomaly_codes),'[]'::jsonb),
    'formKey',b.form_key,
    'releaseKey',b.release_key,
    'routeKey',b.route_key,
    'populationKey',b.population_key,
    'populationStatus',b.population_status,
    'formStatus',b.form_status,
    'routeStatus',b.route_status,
    'releaseStatus',b.release_status,
    'productCount',b.product_count,
    'v3Published',v.drug_id is not null,
    'v3ProductKey',v.product_key,
    'v3VersionNo',v.version_no,
    'source',case when v.drug_id is null then null else jsonb_build_object(
      'sourceKey',v.source_key,
      'snapshotId',v.source_snapshot_id,
      'sourceTier',v.source_tier,
      'documentVersion',v.document_version,
      'documentDate',v.document_date
    ) end
  )
  from base b
  left join v3 v on v.drug_id=b.product_id
),'null'::jsonb)
$$;

revoke all on function public.drx_phase9_product_context_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.drx_phase9_product_context_v1(uuid)
  to service_role;
