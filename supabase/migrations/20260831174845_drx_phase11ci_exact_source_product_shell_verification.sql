
-- DRx Phase 11CI: exact-source gate for V3 product-shell verification.
-- A DRAFT product shell may become VERIFIED only when an existing source path
-- already satisfies the same exact-market conditions enforced by the V3 DB guard.
-- Identity-only normalized captures are explicitly insufficient.

create or replace view drx_dose.phase11_product_shell_exact_source_candidates_v1 as
with exact_binding as (
  select
    p.product_id,p.drug_id,p.product_key,p.registry_number,p.trade_name,
    b.snapshot_id,s.source_key,s.document_version,s.document_date,
    'EXACT_MARKET_CAPTURE'::text as source_path,
    b.binding_id::text as source_binding_key,
    b.reviewed_by as source_reviewed_by,b.reviewed_at as source_reviewed_at,
    c.source_url,
    s.source_tier
  from public.dose_products_v3 p
  join drx_dose.exact_market_product_source_bindings_v1 b
    on b.drug_id=p.drug_id
   and b.binding_status='VERIFIED'
  join drx_dose.exact_market_product_source_captures_v1 c
    on c.discovery_id=b.discovery_id
   and c.drug_id=b.drug_id
   and c.snapshot_id=b.snapshot_id
   and c.capture_status='CAPTURED'
   and c.automatic_verification_allowed=false
  join public.dose_source_snapshots_v3 s
    on s.snapshot_id=b.snapshot_id
   and s.source_tier='NON_EU_REGULATOR'
  where p.editorial_status='draft'
    and nullif(btrim(b.reviewed_by),'') is not null
    and b.reviewed_at is not null
),
variant_binding as (
  select
    p.product_id,p.drug_id,p.product_key,p.registry_number,p.trade_name,
    d.snapshot_id,d.source_key,d.document_version,d.document_date,
    'EXACT_VARIANT_DOCUMENT'::text as source_path,
    b.binding_id::text as source_binding_key,
    e.reviewed_by as source_reviewed_by,e.reviewed_at as source_reviewed_at,
    e.evidence_url as source_url,
    d.source_tier
  from public.dose_products_v3 p
  join drx_variant.market_products_v1 mp
    on mp.product_id=p.drug_id
   and mp.binding_status='BOUND'
   and mp.clinical_variant_id is not null
  join drx_dose.product_source_bindings_v1 b
    on b.drug_id=p.drug_id
   and b.clinical_variant_id=mp.clinical_variant_id
   and b.binding_status='VERIFIED'
   and b.binding_scope='EXACT_MARKET_PRODUCT'
   and nullif(btrim(b.decided_by),'') is not null
   and b.reviewed_at is not null
  join drx_clinical.source_documents_v1 d
    on d.source_document_id=b.source_document_id
  join drx_dose.product_source_exact_evidence_v1 e
    on e.binding_id=b.binding_id
   and nullif(btrim(e.reviewed_by),'') is not null
   and e.reviewed_at is not null
  where p.editorial_status='draft'
)
select * from exact_binding
union all
select * from variant_binding;

create or replace view drx_dose.phase11_product_shell_verification_queue_v1 as
select
  p.product_id,p.drug_id,p.product_key,p.registry_number,p.trade_name,
  p.pharmaceutical_form,p.route,p.patient_group,p.editorial_status,
  count(c.snapshot_id) as eligible_exact_source_count,
  coalesce(jsonb_agg(jsonb_build_object(
    'snapshotId',c.snapshot_id,
    'sourceKey',c.source_key,
    'sourcePath',c.source_path,
    'sourceBindingKey',c.source_binding_key,
    'sourceReviewedBy',c.source_reviewed_by,
    'sourceReviewedAt',c.source_reviewed_at,
    'sourceUrl',c.source_url,
    'sourceTier',c.source_tier,
    'documentVersion',c.document_version,
    'documentDate',c.document_date
  ) order by c.source_path,c.snapshot_id)
  filter (where c.snapshot_id is not null),'[]'::jsonb) as eligible_sources,
  case
    when p.editorial_status='verified' then 'PRODUCT_VERIFIED'
    when p.editorial_status='published' then 'PRODUCT_PUBLISHED'
    when p.editorial_status='draft' and count(c.snapshot_id)=0
      then 'CAPTURE_AND_VERIFY_EXACT_MARKET_SOURCE'
    when p.editorial_status='draft' and count(c.snapshot_id)>0
      then 'REVIEW_PRODUCT_SHELL'
    else 'REVIEW_PRODUCT_STATE'
  end as next_action,
  false::boolean as identity_capture_alone_sufficient,
  false::boolean as auto_verify_allowed,
  false::boolean as auto_publish_allowed
from public.dose_products_v3 p
left join drx_dose.phase11_product_shell_exact_source_candidates_v1 c
  on c.product_id=p.product_id
where p.drug_id in (
  select drug_id from drx_dose.product_shell_draft_readiness_v1
)
group by
  p.product_id,p.drug_id,p.product_key,p.registry_number,p.trade_name,
  p.pharmaceutical_form,p.route,p.patient_group,p.editorial_status;

create table if not exists drx_dose.product_shell_review_events_v1 (
  event_id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.dose_products_v3(product_id) on delete restrict,
  snapshot_id text not null references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  reviewer text not null check (nullif(btrim(reviewer),'') is not null),
  review_note text not null check (nullif(btrim(review_note),'') is not null),
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function public.drx_phase11_verify_product_shell_v1(
  p_product_id uuid,
  p_snapshot_id text,
  p_reviewer text,
  p_attestation text,
  p_review_note text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose,drx_clinical,drx_variant
as $$
declare
  v_source drx_dose.phase11_product_shell_exact_source_candidates_v1%rowtype;
  v_before jsonb;
  v_after jsonb;
begin
  if p_product_id is null then raise exception 'product_id is required'; end if;
  if nullif(btrim(p_snapshot_id),'') is null then raise exception 'snapshot_id is required'; end if;
  if nullif(btrim(p_reviewer),'') is null then raise exception 'reviewer is required'; end if;
  if nullif(btrim(p_review_note),'') is null then raise exception 'review_note is required'; end if;
  if p_attestation<>'PRODUCT_SHELL_REVIEW_ATTESTED' then
    raise exception 'Explicit product-shell review attestation is required';
  end if;

  select * into v_source
  from drx_dose.phase11_product_shell_exact_source_candidates_v1
  where product_id=p_product_id and snapshot_id=p_snapshot_id;

  if not found then
    raise exception 'Selected source does not satisfy the exact-market product verification gate';
  end if;

  select to_jsonb(p) into v_before
  from public.dose_products_v3 p
  where p.product_id=p_product_id
  for update;

  if v_before is null then raise exception 'V3 product shell not found'; end if;
  if (v_before->>'editorial_status')<>'draft' then
    raise exception 'Only a DRAFT product shell can be verified through this function';
  end if;

  update public.dose_products_v3
  set
    source_key=v_source.source_key,
    source_snapshot_id=v_source.snapshot_id,
    source_evidence_hash=v_source.snapshot_id,
    source_document_version=v_source.document_version,
    source_document_date=v_source.document_date,
    editorial_status='verified',
    verified_by=btrim(p_reviewer),
    verified_at=now(),
    updated_at=now()
  where product_id=p_product_id
    and editorial_status='draft';

  select to_jsonb(p) into v_after
  from public.dose_products_v3 p
  where p.product_id=p_product_id;

  insert into drx_dose.product_shell_review_events_v1(
    product_id,snapshot_id,reviewer,review_note,before_state,after_state
  ) values (
    p_product_id,p_snapshot_id,btrim(p_reviewer),btrim(p_review_note),v_before,v_after
  );

  return jsonb_build_object(
    'ok',true,'productId',p_product_id,'editorialStatus','verified',
    'sourcePath',v_source.source_path,'autoPublished',false
  );
end;
$$;

create or replace view drx_dose.phase11_product_shell_verification_summary_v1 as
select
  count(*) as product_shells,
  count(*) filter (where editorial_status='draft' and eligible_exact_source_count=0)
    as exact_source_missing,
  count(*) filter (where editorial_status='draft' and eligible_exact_source_count>0)
    as ready_for_review,
  count(*) filter (where editorial_status='verified') as verified,
  count(*) filter (where editorial_status='published') as published,
  false::boolean as auto_verify_allowed,
  false::boolean as auto_publish_allowed
from drx_dose.phase11_product_shell_verification_queue_v1;

alter table drx_dose.product_shell_review_events_v1 enable row level security;
revoke all on drx_dose.phase11_product_shell_exact_source_candidates_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_product_shell_verification_queue_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_product_shell_verification_summary_v1 from public,anon,authenticated;
revoke all on drx_dose.product_shell_review_events_v1 from public,anon,authenticated;
grant select on drx_dose.phase11_product_shell_exact_source_candidates_v1 to service_role;
grant select on drx_dose.phase11_product_shell_verification_queue_v1 to service_role;
grant select on drx_dose.phase11_product_shell_verification_summary_v1 to service_role;
grant select on drx_dose.product_shell_review_events_v1 to service_role;

revoke all on function public.drx_phase11_verify_product_shell_v1(uuid,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.drx_phase11_verify_product_shell_v1(uuid,text,text,text,text)
  to service_role;
