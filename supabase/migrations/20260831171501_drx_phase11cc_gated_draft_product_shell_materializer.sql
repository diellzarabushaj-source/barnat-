
-- DRx Phase 11CC: gated verified-identity -> DRAFT V3 product-shell materializer.
-- Product identity only. It does not create dose rules, conversions, rule bindings,
-- verification or publication.

create table if not exists drx_dose.product_shell_materialization_events_v1 (
  event_id uuid primary key default gen_random_uuid(),
  capture_id uuid not null
    references drx_dose.exact_market_product_identity_captures_v2(capture_id) on delete restrict,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  product_id uuid not null references public.dose_products_v3(product_id) on delete restrict,
  actor text not null check (nullif(btrim(actor),'') is not null),
  created_at timestamptz not null default now()
);

create or replace function public.drx_phase11_materialize_verified_product_identity_to_draft_v1(
  p_capture_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_capture drx_dose.exact_market_product_identity_captures_v2%rowtype;
  v_target drx_dose.product_dose_moiety_targets_v1%rowtype;
  v_product_id uuid;
  v_product_key text;
  v_source_key text;
  v_patient_group text;
  v_route text;
  v_doc_version text;
begin
  if p_capture_id is null then raise exception 'capture_id is required'; end if;
  if nullif(btrim(p_actor),'') is null then raise exception 'actor is required'; end if;

  select * into v_capture
  from drx_dose.exact_market_product_identity_captures_v2
  where capture_id=p_capture_id
  for update;

  if not found then raise exception 'Identity capture not found'; end if;
  if v_capture.capture_status<>'VERIFIED' then
    raise exception 'Product identity capture must be VERIFIED before a V3 draft shell can be created';
  end if;
  if v_capture.automatic_verification_allowed then
    raise exception 'Unsafe automatic verification flag detected';
  end if;

  select * into v_target
  from drx_dose.product_dose_moiety_targets_v1
  where drug_id=v_capture.drug_id;

  if not found then raise exception 'Canonical product target not found'; end if;
  if not v_target.strict_autoinherit_ready then
    raise exception 'Product target is not strict-autoinheritance ready';
  end if;
  if cardinality(v_target.route_keys)<>1 then
    raise exception 'Exactly one normalized route is required for draft product shell';
  end if;

  v_patient_group := case v_target.population_key
    when 'ADULT_ONLY' then 'adult_only'
    when 'PEDIATRIC_ONLY' then 'pediatric_only'
    when 'ADULT_AND_PEDIATRIC' then 'pediatric_and_adult'
    else 'manual_review'
  end;
  v_route := v_target.route_keys[1];
  v_product_key := 'V3-REGISTRY-'||v_target.registry_number::text;
  v_source_key := 'PHASE11-MARKET-ID-'||replace(v_capture.capture_id::text,'-','');
  v_doc_version := 'external-registry-'||regexp_replace(v_capture.external_registry_id,'[^A-Za-z0-9._/-]+','-','g');

  insert into public.dose_source_snapshots_v3(
    snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
    document_type,document_version,document_date,fetched_at,content_type,content_length,
    raw_sha256,parser_version,archive_locator
  ) values (
    v_capture.normalized_record_sha256,
    v_source_key,
    v_capture.source_url,
    v_capture.source_url,
    v_capture.source_tier,
    v_capture.source_authority,
    v_capture.source_jurisdiction,
    'official_market_product_identity_normalized',
    v_doc_version,
    null,
    coalesce(v_capture.reviewed_at,now()),
    'text/plain; charset=utf-8; profile=drx-normalized-market-product-identity',
    octet_length(v_capture.source_record_text),
    v_capture.normalized_record_sha256,
    'drx-phase11-normalized-product-identity-v1',
    v_capture.source_url
  )
  on conflict (snapshot_id) do nothing;

  if not exists (
    select 1
    from public.dose_source_snapshots_v3 s
    where s.snapshot_id=v_capture.normalized_record_sha256
      and s.raw_sha256=v_capture.normalized_record_sha256
      and s.source_url=v_capture.source_url
  ) then
    raise exception 'Normalized identity snapshot conflicts with existing source metadata';
  end if;

  insert into public.dose_products_v3(
    drug_id,product_key,registry_number,pdid,trade_name,active_substance,atc_code,
    pharmaceutical_form,route,patient_group,
    numerator_value,numerator_unit,denominator_value,denominator_unit,
    tablet_split_denominator,is_scored,measurable_increment_ml,rounding_mode,
    source_key,source_snapshot_id,source_evidence_hash,source_document_version,
    source_document_date,editorial_status,verified_by,verified_at,version_no
  ) values (
    v_target.drug_id,
    v_product_key,
    v_target.registry_number::text,
    v_target.pdid,
    v_target.trade_name,
    v_target.active_substance,
    v_target.atc_code,
    v_target.pharmaceutical_form,
    v_route,
    v_patient_group,
    null,null,null,null,
    1,false,null,'exact',
    v_source_key,
    v_capture.normalized_record_sha256,
    v_capture.normalized_record_sha256,
    v_doc_version,
    null,
    'draft',
    null,null,1
  )
  on conflict (drug_id) do update
  set
    registry_number=excluded.registry_number,
    pdid=excluded.pdid,
    trade_name=excluded.trade_name,
    active_substance=excluded.active_substance,
    atc_code=excluded.atc_code,
    pharmaceutical_form=excluded.pharmaceutical_form,
    route=excluded.route,
    patient_group=excluded.patient_group,
    source_key=excluded.source_key,
    source_snapshot_id=excluded.source_snapshot_id,
    source_evidence_hash=excluded.source_evidence_hash,
    source_document_version=excluded.source_document_version,
    source_document_date=excluded.source_document_date,
    updated_at=now()
  where public.dose_products_v3.editorial_status='draft'
  returning product_id into v_product_id;

  if v_product_id is null then
    select product_id into v_product_id
    from public.dose_products_v3
    where drug_id=v_capture.drug_id;

    if not found then raise exception 'V3 product shell could not be materialized'; end if;
    if exists (
      select 1 from public.dose_products_v3
      where product_id=v_product_id and editorial_status<>'draft'
    ) then
      raise exception 'Existing non-draft V3 product shell cannot be overwritten';
    end if;
  end if;

  insert into drx_dose.product_shell_materialization_events_v1(
    capture_id,drug_id,product_id,actor
  ) values (
    v_capture.capture_id,v_capture.drug_id,v_product_id,btrim(p_actor)
  );

  return jsonb_build_object(
    'ok',true,
    'captureId',v_capture.capture_id,
    'drugId',v_capture.drug_id,
    'productId',v_product_id,
    'productKey',v_product_key,
    'editorialStatus','draft',
    'clinicalDoseInferred',false,
    'conversionEnabled',false,
    'ruleBindingsCreated',false,
    'autoPublished',false
  );
end;
$$;

create or replace view drx_dose.product_shell_draft_readiness_v1 as
select
  q.*,
  p.product_id,p.product_key,p.editorial_status,
  case
    when p.product_id is not null and p.editorial_status='published' then 'SHELL_PUBLISHED'
    when p.product_id is not null then 'REVIEW_DRAFT_PRODUCT_SHELL'
    when q.capture_status='VERIFIED' then 'MATERIALIZE_DRAFT_PRODUCT_SHELL'
    else q.next_action
  end as shell_next_action,
  false::boolean as auto_publish_allowed_v2
from drx_dose.product_shell_identity_capture_queue_v1 q
left join public.dose_products_v3 p on p.drug_id=q.drug_id;

alter table drx_dose.product_shell_materialization_events_v1 enable row level security;

revoke all on drx_dose.product_shell_materialization_events_v1 from public,anon,authenticated;
revoke all on drx_dose.product_shell_draft_readiness_v1 from public,anon,authenticated;
grant select on drx_dose.product_shell_materialization_events_v1 to service_role;
grant select on drx_dose.product_shell_draft_readiness_v1 to service_role;

revoke all on function public.drx_phase11_materialize_verified_product_identity_to_draft_v1(uuid,text)
  from public,anon,authenticated;
grant execute on function public.drx_phase11_materialize_verified_product_identity_to_draft_v1(uuid,text)
  to service_role;
