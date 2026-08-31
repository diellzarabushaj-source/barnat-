
-- DRx Phase 11CA: normalized official market-product identity captures.
-- These records preserve exact source identity evidence without pretending a
-- price-list/registry identity record is clinical dosage evidence.
-- Captures are staged only; human review is mandatory and auto-verification is forbidden.

create table if not exists drx_dose.exact_market_product_identity_captures_v2 (
  capture_id uuid primary key default gen_random_uuid(),
  discovery_id uuid not null unique
    references drx_dose.phase8_exact_source_discovery_v1(discovery_id) on delete restrict,
  drug_id uuid not null
    references public.drugs(id) on delete restrict,
  source_url text not null check (source_url ~ '^https://'),
  source_authority text not null check (nullif(btrim(source_authority),'') is not null),
  source_jurisdiction text not null check (nullif(btrim(source_jurisdiction),'') is not null),
  source_tier text not null check (
    source_tier in ('EU_NATIONAL','KOSOVO_AKPPM','NON_EU_REGULATOR','FALLBACK')
  ),
  external_registry_id text not null check (nullif(btrim(external_registry_id),'') is not null),
  observed_trade_name text not null,
  observed_strength text not null,
  observed_form text not null,
  observed_packaging text not null,
  observed_manufacturer text,
  observed_ma_holder text,
  identity_match_dimensions jsonb not null default '{}'::jsonb,
  source_record_text text not null check (nullif(btrim(source_record_text),'') is not null),
  normalized_record_sha256 text not null check (normalized_record_sha256 ~ '^[0-9a-f]{64}$'),
  capture_status text not null default 'STAGED'
    check (capture_status in ('STAGED','VERIFIED','REJECTED')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  automatic_verification_allowed boolean not null default false
    check (automatic_verification_allowed=false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    capture_status='STAGED'
    or (
      nullif(btrim(reviewed_by),'') is not null
      and reviewed_at is not null
      and nullif(btrim(review_note),'') is not null
    )
  )
);

create unique index if not exists exact_market_product_identity_captures_v2_drug_source_uidx
  on drx_dose.exact_market_product_identity_captures_v2(drug_id,source_url);

with exact as (
  select
    d.discovery_id,d.drug_id,d.source_url,d.source_authority,d.source_jurisdiction,
    d.source_tier,d.external_registry_id,d.observed_trade_name,d.observed_strength,
    d.observed_form,d.observed_packaging,d.observed_manufacturer,d.observed_ma_holder,
    d.identity_match_dimensions,
    concat_ws(E'\n',
      'authority='||d.source_authority,
      'jurisdiction='||d.source_jurisdiction,
      'source_tier='||d.source_tier,
      'external_registry_id='||d.external_registry_id,
      'trade_name='||d.observed_trade_name,
      'strength='||d.observed_strength,
      'form='||d.observed_form,
      'packaging='||d.observed_packaging,
      'manufacturer='||coalesce(d.observed_manufacturer,''),
      'ma_holder='||coalesce(d.observed_ma_holder,''),
      'source_url='||d.source_url
    ) as source_record_text
  from drx_dose.phase8_exact_source_discovery_v1 d
  where d.identity_match_status='EXACT_PRODUCT_CANDIDATE'
    and d.drug_id in (select drug_id from drx_dose.product_shell_provisioning_queue_v1)
)
insert into drx_dose.exact_market_product_identity_captures_v2(
  discovery_id,drug_id,source_url,source_authority,source_jurisdiction,source_tier,
  external_registry_id,observed_trade_name,observed_strength,observed_form,
  observed_packaging,observed_manufacturer,observed_ma_holder,identity_match_dimensions,
  source_record_text,normalized_record_sha256,capture_status,
  automatic_verification_allowed
)
select
  e.discovery_id,e.drug_id,e.source_url,e.source_authority,e.source_jurisdiction,e.source_tier,
  e.external_registry_id,e.observed_trade_name,e.observed_strength,e.observed_form,
  e.observed_packaging,e.observed_manufacturer,e.observed_ma_holder,e.identity_match_dimensions,
  e.source_record_text,encode(digest(e.source_record_text,'sha256'),'hex'),
  'STAGED',false
from exact e
on conflict (discovery_id) do nothing;

create or replace view drx_dose.product_shell_identity_capture_queue_v1 as
select
  q.drug_id,q.registry_number,q.trade_name,q.pharmaceutical_form,
  q.identity_match_status,q.source_tier,q.source_authority,q.source_jurisdiction,
  q.external_registry_id,q.source_url,q.next_action as discovery_next_action,
  c.capture_id,c.capture_status,c.normalized_record_sha256,
  c.reviewed_by,c.reviewed_at,c.review_note,
  case
    when q.product_id is not null and q.product_shell_status='published'
      then 'SHELL_PUBLISHED'
    when q.product_id is not null
      then 'REVIEW_EXISTING_SHELL'
    when c.capture_status='VERIFIED'
      then 'READY_FOR_DRAFT_PRODUCT_SHELL'
    when c.capture_status='STAGED'
      then 'REVIEW_IDENTITY_CAPTURE'
    when c.capture_status='REJECTED'
      then 'DISCOVER_REPLACEMENT_EXACT_SOURCE'
    when q.identity_match_status='PARTIAL_PRODUCT_CANDIDATE'
      then 'RESOLVE_SOURCE_IDENTITY'
    when q.identity_match_status='EXACT_PRODUCT_CANDIDATE'
      then 'STAGE_IDENTITY_CAPTURE'
    else 'DISCOVER_EXACT_MARKET_PRODUCT_SOURCE'
  end as next_action,
  false::boolean as auto_verify_allowed,
  false::boolean as auto_publish_allowed
from drx_dose.product_shell_source_discovery_v2 q
left join drx_dose.exact_market_product_identity_captures_v2 c
  on c.discovery_id=q.discovery_id;

create or replace view drx_dose.product_shell_identity_capture_summary_v1 as
select
  count(*) as product_shell_candidates,
  count(*) filter (where capture_status='STAGED') as staged_identity_captures,
  count(*) filter (where capture_status='VERIFIED') as verified_identity_captures,
  count(*) filter (where capture_status='REJECTED') as rejected_identity_captures,
  count(*) filter (where next_action='RESOLVE_SOURCE_IDENTITY') as partial_identity_sources,
  count(*) filter (where next_action='READY_FOR_DRAFT_PRODUCT_SHELL') as ready_for_draft_shell,
  count(*) filter (where next_action='SHELL_PUBLISHED') as published_shells,
  false::boolean as auto_publish_allowed
from drx_dose.product_shell_identity_capture_queue_v1;

create or replace function public.drx_phase11_review_product_identity_capture_v1(
  p_capture_id uuid,
  p_decision text,
  p_reviewer text,
  p_attestation text,
  p_review_note text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_decision text := upper(btrim(coalesce(p_decision,'')));
  v_before jsonb;
  v_after jsonb;
begin
  if p_capture_id is null then raise exception 'capture_id is required'; end if;
  if v_decision not in ('VERIFIED','REJECTED') then
    raise exception 'Identity capture decision must be VERIFIED or REJECTED';
  end if;
  if nullif(btrim(p_reviewer),'') is null then raise exception 'reviewer is required'; end if;
  if nullif(btrim(p_review_note),'') is null then raise exception 'review_note is required'; end if;
  if p_attestation <> 'PRODUCT_IDENTITY_SOURCE_REVIEW_ATTESTED' then
    raise exception 'Explicit product-identity source attestation is required';
  end if;

  select to_jsonb(c) into v_before
  from drx_dose.exact_market_product_identity_captures_v2 c
  where c.capture_id=p_capture_id
  for update;

  if v_before is null then raise exception 'Identity capture not found'; end if;

  update drx_dose.exact_market_product_identity_captures_v2 c
  set capture_status=v_decision,
      reviewed_by=btrim(p_reviewer),
      reviewed_at=now(),
      review_note=btrim(p_review_note),
      updated_at=now()
  where c.capture_id=p_capture_id;

  select to_jsonb(c) into v_after
  from drx_dose.exact_market_product_identity_captures_v2 c
  where c.capture_id=p_capture_id;

  return jsonb_build_object(
    'ok',true,
    'captureId',p_capture_id,
    'decision',v_decision,
    'row',v_after,
    'autoPublished',false
  );
end;
$$;

alter table drx_dose.exact_market_product_identity_captures_v2 enable row level security;

revoke all on drx_dose.exact_market_product_identity_captures_v2 from public,anon,authenticated;
revoke all on drx_dose.product_shell_identity_capture_queue_v1 from public,anon,authenticated;
revoke all on drx_dose.product_shell_identity_capture_summary_v1 from public,anon,authenticated;
grant select on drx_dose.exact_market_product_identity_captures_v2 to service_role;
grant select on drx_dose.product_shell_identity_capture_queue_v1 to service_role;
grant select on drx_dose.product_shell_identity_capture_summary_v1 to service_role;

revoke all on function public.drx_phase11_review_product_identity_capture_v1(uuid,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.drx_phase11_review_product_identity_capture_v1(uuid,text,text,text,text)
  to service_role;
