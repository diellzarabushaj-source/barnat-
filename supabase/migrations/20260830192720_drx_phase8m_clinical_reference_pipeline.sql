create table if not exists drx_dose.phase8_pilot_clinical_references_v1 (
  clinical_reference_id uuid primary key default gen_random_uuid(),
  drug_id uuid not null references public.drugs(id) on delete restrict,
  exact_discovery_id uuid not null
    references drx_dose.phase8_exact_source_discovery_v1(discovery_id) on delete restrict,
  source_key text not null check (nullif(btrim(source_key),'') is not null),
  source_url text not null check (source_url ~ '^https://'),
  expected_source_tier text not null
    check (expected_source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM')),
  reference_role text not null default 'CLINICAL_REFERENCE_ONLY'
    check (reference_role='CLINICAL_REFERENCE_ONLY'),
  source_snapshot_id text references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  source_status text not null default 'MISSING'
    check (source_status in ('MISSING','INGESTED','REJECTED')),
  presentation_match_status text not null default 'PENDING'
    check (presentation_match_status in ('PENDING','MATCHED','REJECTED')),
  evidence_review_status text not null default 'PENDING'
    check (evidence_review_status in ('PENDING','READY_FOR_REVIEW','VERIFIED','REJECTED')),
  section_2_sha256 text,
  section_4_1_sha256 text,
  section_4_2_sha256 text,
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  automatic_product_identity_allowed boolean not null default false
    check (automatic_product_identity_allowed=false),
  automatic_rule_publication_allowed boolean not null default false
    check (automatic_rule_publication_allowed=false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(drug_id,source_url),
  unique(source_key),
  check (
    (source_status='INGESTED' and source_snapshot_id is not null)
    or (source_status<>'INGESTED' and source_snapshot_id is null)
  ),
  check (
    evidence_review_status<>'VERIFIED'
    or (
      source_status='INGESTED'
      and presentation_match_status='MATCHED'
      and nullif(btrim(reviewed_by),'') is not null
      and reviewed_at is not null
      and nullif(btrim(review_note),'') is not null
    )
  )
);

create index if not exists drx_phase8_clinical_reference_snapshot_idx
  on drx_dose.phase8_pilot_clinical_references_v1(source_snapshot_id)
  where source_snapshot_id is not null;

insert into drx_dose.phase8_pilot_clinical_references_v1(
  drug_id,exact_discovery_id,source_key,source_url,expected_source_tier,
  reference_role,source_status,presentation_match_status,evidence_review_status,
  automatic_product_identity_allowed,automatic_rule_publication_allowed
)
select
  d.drug_id,d.discovery_id,x.source_key,x.source_url,'EMC',
  'CLINICAL_REFERENCE_ONLY','MISSING','PENDING','PENDING',false,false
from drx_dose.phase8_exact_source_discovery_v1 d
join (
  values
    ('c8cd0467-da73-479c-b8e8-b785af833f59'::uuid,
     'emc-10038-phase8-clinical-ref'::text,
     'https://www.medicines.org.uk/emc/product/10038/smpc'::text),
    ('84a1cf4a-6568-41d7-8d13-0f2b7715acae'::uuid,
     'emc-13495-phase8-clinical-ref'::text,
     'https://www.medicines.org.uk/emc/product/13495/smpc'::text)
) x(drug_id,source_key,source_url)
  on x.drug_id=d.drug_id
where d.identity_match_status='EXACT_PRODUCT_CANDIDATE'
on conflict (drug_id,source_url) do update set
  source_key=excluded.source_key,
  expected_source_tier=excluded.expected_source_tier,
  reference_role='CLINICAL_REFERENCE_ONLY',
  automatic_product_identity_allowed=false,
  automatic_rule_publication_allowed=false,
  updated_at=now();

create or replace function drx_dose.guard_phase8_clinical_reference_review_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
begin
  new.updated_at := now();

  if new.evidence_review_status<>'VERIFIED' then
    return new;
  end if;

  if new.source_status<>'INGESTED'
     or new.presentation_match_status<>'MATCHED'
     or new.source_snapshot_id is null then
    raise exception 'Phase 8 clinical reference verification blocked: source is not ingested and presentation-matched';
  end if;

  if not exists (
    select 1
    from public.dose_source_snapshots_v3 s
    where s.snapshot_id=new.source_snapshot_id
      and s.source_key=new.source_key
      and s.source_tier=new.expected_source_tier
      and s.raw_sha256=new.source_snapshot_id
  ) then
    raise exception 'Phase 8 clinical reference verification blocked: snapshot provenance mismatch';
  end if;

  if not exists (
    select 1
    from public.dose_source_sections_v3 s2
    join public.dose_source_sections_v3 s41
      on s41.snapshot_id=s2.snapshot_id and s41.section_code='4.1'
    join public.dose_source_sections_v3 s42
      on s42.snapshot_id=s2.snapshot_id and s42.section_code='4.2'
    where s2.snapshot_id=new.source_snapshot_id
      and s2.section_code='2'
      and s2.extraction_status='extracted'
      and s41.extraction_status='extracted'
      and s42.extraction_status='extracted'
      and s2.section_sha256=new.section_2_sha256
      and s41.section_sha256=new.section_4_1_sha256
      and s42.section_sha256=new.section_4_2_sha256
  ) then
    raise exception 'Phase 8 clinical reference verification blocked: required extracted section hashes are missing or mismatched';
  end if;

  if nullif(btrim(new.reviewed_by),'') is null
     or new.reviewed_at is null
     or nullif(btrim(new.review_note),'') is null then
    raise exception 'Phase 8 clinical reference verification blocked: explicit reviewer decision is incomplete';
  end if;

  return new;
end;
$$;

drop trigger if exists drx_phase8_clinical_reference_review_guard
  on drx_dose.phase8_pilot_clinical_references_v1;

create trigger drx_phase8_clinical_reference_review_guard
before insert or update
on drx_dose.phase8_pilot_clinical_references_v1
for each row execute function drx_dose.guard_phase8_clinical_reference_review_v1();

create or replace function public.drx_phase8_register_clinical_reference_v1(p_reference jsonb)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_row drx_dose.phase8_pilot_clinical_references_v1%rowtype;
  v_snapshot_id text := lower(p_reference->>'snapshotId');
  v_drug_id uuid := (p_reference->>'drugId')::uuid;
  v_source_url text := p_reference->>'sourceUrl';
  v_presentation_status text := p_reference->>'presentationMatchStatus';
  v_s2 text;
  v_s41 text;
  v_s42 text;
begin
  if coalesce(p_reference->>'registrationVersion','')<>'drx-phase8-clinical-reference-v1' then
    raise exception 'Phase 8 clinical reference registration blocked: unsupported payload version';
  end if;
  if v_snapshot_id is null or v_snapshot_id !~ '^[0-9a-f]{64}$' then
    raise exception 'Phase 8 clinical reference registration blocked: invalid snapshot digest';
  end if;
  if v_presentation_status<>'MATCHED' then
    raise exception 'Phase 8 clinical reference registration blocked: presentation has not been matched';
  end if;

  select *
  into v_row
  from drx_dose.phase8_pilot_clinical_references_v1
  where drug_id=v_drug_id
    and lower(btrim(source_url))=lower(btrim(v_source_url))
  for update;

  if not found then
    raise exception 'Phase 8 clinical reference registration blocked: seeded reference row not found';
  end if;

  if not exists (
    select 1
    from public.dose_source_snapshots_v3 s
    where s.snapshot_id=v_snapshot_id
      and s.raw_sha256=v_snapshot_id
      and s.source_key=v_row.source_key
      and s.source_tier=v_row.expected_source_tier
      and lower(btrim(s.source_url))=lower(btrim(v_row.source_url))
  ) then
    raise exception 'Phase 8 clinical reference registration blocked: snapshot provenance does not match seeded reference';
  end if;

  select section_sha256 into v_s2
  from public.dose_source_sections_v3
  where snapshot_id=v_snapshot_id and section_code='2' and extraction_status='extracted';
  select section_sha256 into v_s41
  from public.dose_source_sections_v3
  where snapshot_id=v_snapshot_id and section_code='4.1' and extraction_status='extracted';
  select section_sha256 into v_s42
  from public.dose_source_sections_v3
  where snapshot_id=v_snapshot_id and section_code='4.2' and extraction_status='extracted';

  if v_s2 is null or v_s41 is null or v_s42 is null then
    raise exception 'Phase 8 clinical reference registration blocked: sections 2, 4.1 and 4.2 must all be extracted';
  end if;

  update drx_dose.phase8_pilot_clinical_references_v1
  set source_snapshot_id=v_snapshot_id,
      source_status='INGESTED',
      presentation_match_status='MATCHED',
      evidence_review_status='READY_FOR_REVIEW',
      section_2_sha256=v_s2,
      section_4_1_sha256=v_s41,
      section_4_2_sha256=v_s42,
      reviewed_by=null,reviewed_at=null,review_note=null,
      automatic_product_identity_allowed=false,
      automatic_rule_publication_allowed=false,
      updated_at=now()
  where clinical_reference_id=v_row.clinical_reference_id;

  return jsonb_build_object(
    'clinicalReferenceId',v_row.clinical_reference_id,
    'drugId',v_drug_id,
    'snapshotId',v_snapshot_id,
    'sourceKey',v_row.source_key,
    'sourceStatus','INGESTED',
    'presentationMatchStatus','MATCHED',
    'evidenceReviewStatus','READY_FOR_REVIEW',
    'automaticProductIdentityAllowed',false,
    'automaticRulePublicationAllowed',false
  );
end;
$$;

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
    when cr.clinical_reference_id is null then 'CLINICAL_REFERENCE_MISSING'
    when cr.source_status<>'INGESTED' then 'CLINICAL_REFERENCE_SNAPSHOT_MISSING'
    when cr.presentation_match_status<>'MATCHED' then 'CLINICAL_REFERENCE_PRESENTATION_REVIEW'
    when cr.evidence_review_status<>'VERIFIED' then 'CLINICAL_REFERENCE_REVIEW_PENDING'
    else 'READY_FOR_V3_BUILD'
  end pilot_status,
  false::boolean automatic_publication_allowed,
  cr.clinical_reference_id,
  cr.source_key clinical_reference_source_key,
  cr.source_url clinical_reference_source_url,
  cr.expected_source_tier clinical_reference_source_tier,
  cr.source_snapshot_id clinical_reference_snapshot_id,
  cr.source_status clinical_reference_source_status,
  cr.presentation_match_status clinical_reference_presentation_status,
  cr.evidence_review_status clinical_reference_review_status
from drx_dose.phase8_published_v2_comparator_v1 c
left join drx_dose.phase8_exact_source_discovery_v1 d
  on d.drug_id=c.drug_id and d.v2_product_key=c.product_key
left join drx_dose.phase8_pilot_clinical_references_v1 cr
  on cr.drug_id=c.drug_id and cr.exact_discovery_id=d.discovery_id;

revoke all on all tables in schema drx_dose from public,anon,authenticated;
revoke execute on all functions in schema drx_dose from public,anon,authenticated;
revoke all on schema drx_dose from public,anon,authenticated;

revoke all on function public.drx_phase8_register_clinical_reference_v1(jsonb)
  from public,anon,authenticated;
grant execute on function public.drx_phase8_register_clinical_reference_v1(jsonb)
  to service_role;
