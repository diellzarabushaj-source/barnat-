-- DRx Phase 7A: source-backed dosing evidence staging + fail-closed V3 publication guards.
-- No dosing rule is inferred from prose and no legacy regimen is auto-migrated.

create schema if not exists drx_dose;
revoke all on schema drx_dose from public,anon,authenticated;

create table if not exists drx_dose.source_posology_claims_v1 (
  posology_claim_id uuid primary key,
  source_document_id uuid not null unique
    references drx_clinical.source_documents_v1(source_document_id) on delete cascade,
  candidate_concept_ids uuid[] not null default '{}'::uuid[],
  source_text text not null,
  source_section_sha256 text not null check (source_section_sha256 ~ '^[0-9a-f]{64}$'),
  structured_rule_payload jsonb,
  semantic_status text not null check (semantic_status='REVIEW_REQUIRED'),
  automatic_migration_allowed boolean not null default false,
  publication_eligible boolean not null default false,
  created_at timestamptz not null default now(),
  check (structured_rule_payload is null),
  check (automatic_migration_allowed=false),
  check (publication_eligible=false)
);

delete from drx_dose.source_posology_claims_v1;

insert into drx_dose.source_posology_claims_v1(
  posology_claim_id,source_document_id,candidate_concept_ids,source_text,
  source_section_sha256,structured_rule_payload,semantic_status,
  automatic_migration_allowed,publication_eligible
)
select
  extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'https://drx.local/posology-source-claim/' || d.snapshot_id
  ),
  d.source_document_id,
  c.candidate_concept_ids,
  e.section_text,
  e.section_sha256,
  null,
  'REVIEW_REQUIRED',
  false,
  false
from drx_clinical.source_documents_v1 d
join drx_clinical.source_section_evidence_v1 e
  on e.source_document_id=d.source_document_id
 and e.section_key='posology_and_method_of_administration'
join drx_clinical.source_identity_candidates_v1 c
  on c.source_document_id=d.source_document_id;

-- Manual bridge required before a market product can become a verified V3 dosing product.
create table if not exists drx_dose.product_source_bindings_v1 (
  binding_id uuid primary key default gen_random_uuid(),
  drug_id uuid not null references public.drugs(id) on delete restrict,
  clinical_variant_id uuid
    references drx_variant.clinical_variants_v1(clinical_variant_id) on delete restrict,
  source_document_id uuid not null
    references drx_clinical.source_documents_v1(source_document_id) on delete restrict,
  binding_status text not null check (binding_status in ('REVIEW','VERIFIED','REJECTED')),
  match_note text,
  decided_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(drug_id,source_document_id),
  check (
    binding_status<>'VERIFIED'
    or (
      clinical_variant_id is not null
      and nullif(btrim(decided_by),'') is not null
      and reviewed_at is not null
      and nullif(btrim(match_note),'') is not null
    )
  )
);

create or replace view drx_dose.legacy_regimen_candidates_v1 as
with source_unique as (
  select
    d.source_document_id,
    d.source_key,
    d.snapshot_id,
    c.candidate_concept_ids[1] public_concept_id
  from drx_clinical.source_documents_v1 d
  join drx_clinical.source_identity_candidates_v1 c
    on c.source_document_id=d.source_document_id
  where c.resolution_status='UNIQUE_CANDIDATE'
),
product_concepts as (
  select
    p.drug_id,
    c.public_concept_id
  from drx_stage.product_registry_v1 p
  join drx_identity.source_concept_map_v1 m
    on m.source_namespace='STAGE'
   and m.source_concept_id=p.substance_concept_id
  join drx_identity.canonical_concepts_v1 c
    on c.concept_id=m.canonical_concept_id
  where c.public_concept_id is not null
)
select
  s.source_document_id,
  s.source_key,
  s.snapshot_id,
  s.public_concept_id,
  r.id legacy_regimen_id,
  r.drug_id,
  r.population,
  r.route,
  r.dose_text,
  r.frequency_text,
  r.duration_text,
  r.maximum_text,
  r.warnings,
  r.calculation_status,
  r.calculation_type,
  r.editorial_status,
  r.reviewed_by,
  r.reviewed_at,
  r.source_url legacy_source_url,
  r.source_hash legacy_source_hash,
  'UNCOMPARED'::text comparison_status,
  false::boolean automatic_migration_allowed
from source_unique s
join product_concepts p on p.public_concept_id=s.public_concept_id
join public.product_dosage_regimens r on r.drug_id=p.drug_id;

create or replace view drx_dose.phase7_review_queue_v1 as
select
  'SOURCE_POSOLOGY_SEMANTIC_REVIEW'::text issue_type,
  p.posology_claim_id entity_id,
  d.source_key issue_key,
  '§4.2 source text requires structured dosing review'::text detail
from drx_dose.source_posology_claims_v1 p
join drx_clinical.source_documents_v1 d on d.source_document_id=p.source_document_id

union all

select
  'SOURCE_IDENTITY_REVIEW',
  d.source_document_id,
  d.source_key,
  c.resolution_status
from drx_clinical.source_documents_v1 d
join drx_clinical.source_identity_candidates_v1 c
  on c.source_document_id=d.source_document_id
where c.resolution_status<>'UNIQUE_CANDIDATE'

union all

select
  'LEGACY_REGIMEN_COMPARISON',
  extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'https://drx.local/legacy-regimen-comparison/' ||
    l.source_document_id::text || '/' || l.legacy_regimen_id::text
  ),
  l.source_key || ':' || l.legacy_regimen_id::text,
  l.editorial_status || '/' || l.calculation_status
from drx_dose.legacy_regimen_candidates_v1 l;

-- Fail-closed guard: a V3 product cannot be verified/published without an explicit
-- reviewed product-to-regulatory-source binding.
create or replace function drx_dose.guard_v3_product_publication_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose,drx_clinical,drx_variant
as $$
declare
  v_source_document_id uuid;
  v_expected_variant uuid;
begin
  if new.editorial_status not in ('verified','published') then
    return new;
  end if;

  select d.source_document_id
  into v_source_document_id
  from drx_clinical.source_documents_v1 d
  where d.snapshot_id=new.source_snapshot_id
    and d.source_key=new.source_key
  limit 1;

  if v_source_document_id is null then
    raise exception 'DRx V3 product publication blocked: source snapshot is not in current regulatory provenance';
  end if;

  select m.clinical_variant_id
  into v_expected_variant
  from drx_variant.market_products_v1 m
  where m.product_id=new.drug_id
    and m.binding_status='BOUND'
  limit 1;

  if v_expected_variant is null then
    raise exception 'DRx V3 product publication blocked: market product is not bound to a strict clinical variant';
  end if;

  if not exists (
    select 1
    from drx_dose.product_source_bindings_v1 b
    where b.drug_id=new.drug_id
      and b.source_document_id=v_source_document_id
      and b.clinical_variant_id=v_expected_variant
      and b.binding_status='VERIFIED'
      and nullif(btrim(b.decided_by),'') is not null
      and b.reviewed_at is not null
  ) then
    raise exception 'DRx V3 product publication blocked: no verified product-source binding';
  end if;

  return new;
end;
$$;

drop trigger if exists drx_v3_product_publication_guard on public.dose_products_v3;
create trigger drx_v3_product_publication_guard
before insert or update of editorial_status,source_snapshot_id,source_key,drug_id
on public.dose_products_v3
for each row execute function drx_dose.guard_v3_product_publication_v1();

-- A rule may become VERIFIED only with exact §4.2 provenance, one unambiguous public
-- substance identity candidate, a reviewed indication concept, and passed safety.
-- PUBLISHED additionally requires at least one verified rule-product binding.
create or replace function drx_dose.guard_v3_rule_publication_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose,drx_clinical
as $$
declare
  v_source_document_id uuid;
  v_candidate_count integer;
  v_candidate_id uuid;
  v_indication_status text;
begin
  if new.editorial_status not in ('verified','published') then
    return new;
  end if;

  select
    d.source_document_id,
    c.candidate_count,
    case when c.candidate_count=1 then c.candidate_concept_ids[1] end
  into v_source_document_id,v_candidate_count,v_candidate_id
  from drx_clinical.source_documents_v1 d
  join drx_clinical.source_identity_candidates_v1 c
    on c.source_document_id=d.source_document_id
  where d.snapshot_id=new.source_snapshot_id
    and d.source_key=new.source_key
    and d.section_4_2_sha256=new.source_section_sha256
  limit 1;

  if v_source_document_id is null then
    raise exception 'DRx V3 rule publication blocked: exact §4.2 provenance not found';
  end if;

  if v_candidate_count<>1 or v_candidate_id is distinct from new.substance_concept_id then
    raise exception 'DRx V3 rule publication blocked: source substance identity is ambiguous or mismatched';
  end if;

  select i.editorial_status
  into v_indication_status
  from public.dose_indication_concepts_v3 i
  where i.indication_id=new.indication_id;

  if v_indication_status not in ('verified','published') then
    raise exception 'DRx V3 rule publication blocked: indication is not verified';
  end if;

  if new.safety_validation_status<>'passed'
     or nullif(btrim(new.verified_by),'') is null
     or new.verified_at is null then
    raise exception 'DRx V3 rule publication blocked: safety/reviewer gate not complete';
  end if;

  if new.editorial_status='published' and not exists (
    select 1
    from public.dose_rule_products_v3 rp
    join public.dose_products_v3 p on p.product_id=rp.product_id
    where rp.rule_id=new.rule_id
      and rp.binding_status='verified'
      and p.editorial_status in ('verified','published')
  ) then
    raise exception 'DRx V3 rule publication blocked: no verified product binding';
  end if;

  return new;
end;
$$;

drop trigger if exists drx_v3_rule_publication_guard on public.dose_rules_v3;
create trigger drx_v3_rule_publication_guard
before insert or update of editorial_status,source_snapshot_id,source_key,
  source_section_sha256,substance_concept_id,indication_id,safety_validation_status
on public.dose_rules_v3
for each row execute function drx_dose.guard_v3_rule_publication_v1();

create or replace function drx_dose.guard_v3_binding_verification_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_rule_status text;
  v_product_status text;
begin
  if new.binding_status<>'verified' then
    return new;
  end if;

  select editorial_status into v_rule_status
  from public.dose_rules_v3 where rule_id=new.rule_id;

  select editorial_status into v_product_status
  from public.dose_products_v3 where product_id=new.product_id;

  if v_rule_status not in ('verified','published') then
    raise exception 'DRx V3 binding verification blocked: rule is not verified';
  end if;

  if v_product_status not in ('verified','published') then
    raise exception 'DRx V3 binding verification blocked: product is not verified';
  end if;

  if nullif(btrim(new.verified_by),'') is null or new.verified_at is null then
    raise exception 'DRx V3 binding verification blocked: reviewer evidence missing';
  end if;

  return new;
end;
$$;

drop trigger if exists drx_v3_binding_verification_guard on public.dose_rule_products_v3;
create trigger drx_v3_binding_verification_guard
before insert or update of binding_status,rule_id,product_id
on public.dose_rule_products_v3
for each row execute function drx_dose.guard_v3_binding_verification_v1();

create or replace function public.drx_phase7_status_v1()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public,drx_dose,drx_clinical,drx_raw
as $$
with metrics as (
  select
    (select count(*) from drx_clinical.source_documents_v1) source_documents,
    (select count(*) from drx_dose.source_posology_claims_v1) posology_claims,
    (select count(*) from drx_clinical.source_identity_candidates_v1
      where resolution_status='UNIQUE_CANDIDATE') unique_source_identities,
    (select count(*) from drx_clinical.source_identity_candidates_v1
      where resolution_status<>'UNIQUE_CANDIDATE') unresolved_source_identities,
    (select count(*) from drx_dose.legacy_regimen_candidates_v1) legacy_regimen_candidates,
    (select count(distinct drug_id) from drx_dose.legacy_regimen_candidates_v1) legacy_candidate_products,
    (select count(*) from drx_dose.product_source_bindings_v1
      where binding_status='VERIFIED') verified_product_source_bindings,

    (select count(*) from public.dose_products_v3) v3_products,
    (select count(*) from public.dose_rules_v3) v3_rules,
    (select count(*) from public.dose_rule_products_v3) v3_bindings,
    (select count(*) from public.dose_rules_v3 where editorial_status='published') published_rules,
    (select count(*) from public.dose_products_v3 where editorial_status='published') published_products,

    (select count(*) from pg_trigger t
      join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace
      where not t.tgisinternal
        and n.nspname='public'
        and (
          (c.relname='dose_products_v3' and t.tgname='drx_v3_product_publication_guard')
          or (c.relname='dose_rules_v3' and t.tgname='drx_v3_rule_publication_guard')
          or (c.relname='dose_rule_products_v3' and t.tgname='drx_v3_binding_verification_guard')
        )
    ) guard_triggers,

    (select count(*) from drx_dose.source_posology_claims_v1
      where structured_rule_payload is not null
         or automatic_migration_allowed
         or publication_eligible) inferred_or_auto_posology_rows,

    (select count(*) from drx_raw.registry_reconstruction_diff_v1 where differs) reconstruction_true_diffs,
    (select count(*) from drx_raw.registry_generated_projection_diff_v1
      where active_substance_key_differs
         or global_search_text_differs
         or registry_search_text_differs) generated_true_diffs
)
select jsonb_build_object(
  'source_documents',m.source_documents,
  'posology_source_claims',m.posology_claims,
  'unique_source_identities',m.unique_source_identities,
  'unresolved_source_identities',m.unresolved_source_identities,
  'legacy_regimen_candidates',m.legacy_regimen_candidates,
  'legacy_candidate_products',m.legacy_candidate_products,
  'verified_product_source_bindings',m.verified_product_source_bindings,
  'v3_products',m.v3_products,
  'v3_rules',m.v3_rules,
  'v3_bindings',m.v3_bindings,
  'published_rules',m.published_rules,
  'published_products',m.published_products,
  'publication_guard_triggers',m.guard_triggers,
  'inferred_or_auto_posology_rows',m.inferred_or_auto_posology_rows,
  'reconstruction_true_diffs',m.reconstruction_true_diffs,
  'generated_true_diffs',m.generated_true_diffs,
  'free_text_rule_inference_enabled',false,
  'legacy_auto_migration_enabled',false,
  'publication_allowed',false,
  'gate_pass',
    m.posology_claims=m.source_documents
    and m.guard_triggers=3
    and m.inferred_or_auto_posology_rows=0
    and m.published_rules=0
    and m.published_products=0
    and m.reconstruction_true_diffs=0
    and m.generated_true_diffs=0
)
from metrics m;
$$;

revoke all on all tables in schema drx_dose from public,anon,authenticated;
revoke all on all sequences in schema drx_dose from public,anon,authenticated;
revoke execute on all functions in schema drx_dose from public,anon,authenticated;
revoke all on schema drx_dose from public,anon,authenticated;

alter default privileges for role postgres in schema drx_dose
  revoke all on tables from public,anon,authenticated;
alter default privileges for role postgres in schema drx_dose
  revoke all on sequences from public,anon,authenticated;
alter default privileges for role postgres in schema drx_dose
  revoke execute on functions from public,anon,authenticated;

revoke all on function public.drx_phase7_status_v1() from public,anon,authenticated;
grant execute on function public.drx_phase7_status_v1() to service_role;

comment on schema drx_dose is
  'DRx Phase 7 private source-backed dosing staging. No free-text rule inference or legacy auto-migration.';
comment on table drx_dose.source_posology_claims_v1 is
  'Exact SmPC §4.2 evidence. Structured dosing semantics require explicit clinical review.';
