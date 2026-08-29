-- DRx Dosierung V3 additive schema candidate
-- STATUS: NOT_APPLIED
-- Purpose: fail-closed shadow schema. Preserves dose_rules_v2/dosage_regimens until verified cutover.
-- Generated from data/drx-dose-v3-schema-proposal.json and current Supabase security guidance.
--
-- IMPORTANT:
-- 1) Apply only after live baseline verification of referenced PK types/constraints.
-- 2) Use Supabase apply_migration, then run security + performance advisors.
-- 3) No DROP/ALTER of legacy dosage tables is permitted in this phase.

create table if not exists public.dose_source_snapshots_v3 (
  snapshot_id text primary key,
  source_key text not null,
  source_url text not null,
  final_url text not null,
  source_tier text not null,
  authority text not null,
  jurisdiction text,
  document_type text,
  document_version text,
  document_date date,
  fetched_at timestamptz not null,
  content_type text,
  content_length bigint,
  raw_sha256 text not null unique,
  etag text,
  last_modified text,
  parser_version text,
  archive_locator text,
  created_at timestamptz not null default now(),
  constraint dose_source_snapshots_v3_snapshot_sha_check
    check (snapshot_id ~ '^[0-9a-f]{64}$'),
  constraint dose_source_snapshots_v3_raw_sha_check
    check (raw_sha256 ~ '^[0-9a-f]{64}$'),
  constraint dose_source_snapshots_v3_hash_identity_check
    check (snapshot_id = raw_sha256),
  constraint dose_source_snapshots_v3_length_check
    check (content_length is null or content_length >= 0)
);

create table if not exists public.dose_source_sections_v3 (
  snapshot_id text not null references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  section_code text not null,
  section_key text not null,
  heading text,
  section_text text not null,
  section_sha256 text not null,
  extracted_json jsonb not null default '{}'::jsonb,
  parser_version text not null,
  extraction_status text not null,
  created_at timestamptz not null default now(),
  primary key (snapshot_id, section_code),
  constraint dose_source_sections_v3_section_code_check
    check (section_code ~ '^4\\.[1-9]$'),
  constraint dose_source_sections_v3_sha_check
    check (section_sha256 ~ '^[0-9a-f]{64}$'),
  constraint dose_source_sections_v3_status_check
    check (extraction_status in ('extracted','partial','failed','manual_review'))
);

create table if not exists public.dose_indication_concepts_v3 (
  indication_id uuid primary key default gen_random_uuid(),
  indication_key text not null unique,
  canonical_name text not null,
  icd10_codes text[] not null default '{}'::text[],
  icd_verification_status text not null default 'unverified',
  editorial_status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dose_indication_concepts_v3_key_check
    check (btrim(indication_key) <> ''),
  constraint dose_indication_concepts_v3_editorial_check
    check (editorial_status in ('draft','in_review','verified','published','retired'))
);

create table if not exists public.dose_indication_terms_v3 (
  term_key text primary key,
  indication_id uuid not null references public.dose_indication_concepts_v3(indication_id) on delete restrict,
  term text not null,
  language text,
  term_type text not null,
  source_snapshot_id text references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dose_indication_terms_v3_term_check
    check (btrim(term) <> ''),
  constraint dose_indication_terms_v3_type_check
    check (term_type in ('source_exact','reviewed_alias','canonical','translation'))
);

create table if not exists public.dose_rules_v3 (
  rule_id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  substance_concept_id uuid not null references public.substance_concepts_v1(concept_id) on delete restrict,
  indication_id uuid not null references public.dose_indication_concepts_v3(indication_id) on delete restrict,
  patient_group text not null,
  calculation_method text not null,
  dose_min_value numeric,
  dose_max_value numeric,
  dose_unit text,
  dose_basis text,
  weight_basis text,
  frequency_mode text not null,
  interval_min_hours numeric,
  interval_max_hours numeric,
  times_per_day numeric,
  times_per_day_min numeric,
  times_per_day_max numeric,
  max_single_dose_mg numeric,
  max_daily_dose_mg numeric,
  max_doses_24h numeric,
  duration_mode text not null,
  duration_min_days numeric,
  duration_max_days numeric,
  review_after_days numeric,
  min_age_months numeric,
  max_age_months numeric,
  min_weight_kg numeric,
  max_weight_kg numeric,
  route text,
  pharmaceutical_form text,
  prn boolean not null default false,
  renal_adjustment_required boolean not null default false,
  hepatic_adjustment_required boolean not null default false,
  cardiac_adjustment_required boolean not null default false,
  specialist_only boolean not null default false,
  out_of_range_action text not null default 'block',
  required_inputs text[] not null default '{}'::text[],
  dose_basis_mode text not null default 'single_active',
  dose_basis_component_concept_id uuid references public.substance_concepts_v1(concept_id) on delete restrict,
  source_key text not null,
  source_snapshot_id text not null references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  source_section text not null default '4.2',
  source_evidence_hash text not null,
  confidence_score numeric,
  review_class text,
  editorial_status text not null default 'draft',
  verified_by text,
  verified_at timestamptz,
  version_no integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint dose_rules_v3_rule_key_check check (btrim(rule_key) <> ''),
  constraint dose_rules_v3_source_section_check check (source_section = '4.2'),
  constraint dose_rules_v3_source_hash_check check (source_evidence_hash ~ '^[0-9a-f]{64}$'),
  constraint dose_rules_v3_version_check check (version_no >= 1),
  constraint dose_rules_v3_confidence_check check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  constraint dose_rules_v3_editorial_check check (editorial_status in ('draft','in_review','verified','published','retired')),
  constraint dose_rules_v3_patient_group_check check (patient_group in ('adult_only','pediatric_only','pediatric_and_adult','age_band','manual_review')),
  constraint dose_rules_v3_method_check check (calculation_method in ('fixed_dose','fixed_volume','dose_per_kg_per_dose','dose_per_kg_per_day','dose_per_m2_per_dose','dose_per_m2_per_day','age_band_fixed','manual_only')),
  constraint dose_rules_v3_frequency_check check (frequency_mode in ('interval','times_per_day','prn','single','continuous','manual')),
  constraint dose_rules_v3_duration_check check (duration_mode in ('none','fixed_days','range_days','review_after','manual')),
  constraint dose_rules_v3_out_of_range_check check (out_of_range_action in ('block','manual_review')),
  constraint dose_rules_v3_dose_range_check check (dose_min_value is null or dose_max_value is null or dose_min_value <= dose_max_value),
  constraint dose_rules_v3_age_range_check check (min_age_months is null or max_age_months is null or min_age_months <= max_age_months),
  constraint dose_rules_v3_weight_range_check check (min_weight_kg is null or max_weight_kg is null or min_weight_kg <= max_weight_kg),
  constraint dose_rules_v3_ceiling_check check (max_single_dose_mg is null or max_daily_dose_mg is null or max_single_dose_mg <= max_daily_dose_mg),
  constraint dose_rules_v3_verified_provenance_check check (
    editorial_status not in ('verified','published')
    or (
      source_snapshot_id is not null
      and source_evidence_hash ~ '^[0-9a-f]{64}$'
      and verified_at is not null
      and verified_by is not null
    )
  ),
  constraint dose_rules_v3_verified_frequency_check check (
    editorial_status not in ('verified','published')
    or (
      (frequency_mode <> 'interval' or interval_min_hours is not null)
      and (frequency_mode <> 'times_per_day' or times_per_day is not null)
    )
  ),
  constraint dose_rules_v3_verified_duration_check check (
    editorial_status not in ('verified','published')
    or (
      (duration_mode <> 'fixed_days' or duration_min_days is not null)
      and (duration_mode <> 'range_days' or (duration_min_days is not null and duration_max_days is not null))
      and (duration_mode <> 'review_after' or review_after_days is not null)
    )
  ),
  constraint dose_rules_v3_published_not_manual_check check (
    editorial_status <> 'published'
    or (calculation_method <> 'manual_only' and review_class is distinct from 'manual_review')
  )
);

create table if not exists public.dose_renal_adjustments_v3 (
  adjustment_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  measure_type text not null,
  min_value numeric,
  max_value numeric,
  accepted_values text[] not null default '{}'::text[],
  min_inclusive boolean not null default true,
  max_inclusive boolean not null default true,
  dose_action text not null,
  dose_factor numeric,
  replacement_dose_min numeric,
  replacement_dose_max numeric,
  interval_min_hours numeric,
  interval_max_hours numeric,
  source_key text not null,
  source_snapshot_id text not null references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  source_section text not null default '4.2',
  source_evidence_hash text not null,
  review_status text not null default 'draft',
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dose_renal_adjustments_v3_measure_check
    check (measure_type in ('CrCl_mL_min','eGFR_mL_min_1_73m2','dialysis_status')),
  constraint dose_renal_adjustments_v3_action_check
    check (dose_action in ('no_adjustment','reduce_dose','extend_interval','avoid','contraindicated','specialist_review')),
  constraint dose_renal_adjustments_v3_section_check check (source_section = '4.2'),
  constraint dose_renal_adjustments_v3_source_hash_check check (source_evidence_hash ~ '^[0-9a-f]{64}
  binding_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  product_key text,
  match_method text not null,
  preferred boolean not null default false,
  conversion_enabled boolean not null default false,
  tablet_split_allowed boolean not null default false,
  rounding_increment_value numeric,
  rounding_increment_unit text,
  binding_status text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dose_rule_products_v3_unique_binding unique (rule_id, drug_id),
  constraint dose_rule_products_v3_status_check check (binding_status in ('candidate','verified','rejected','retired')),
  constraint dose_rule_products_v3_verified_check check (binding_status <> 'verified' or verified_at is not null),
  constraint dose_rule_products_v3_rounding_check check (rounding_increment_value is null or rounding_increment_value > 0)
);

create table if not exists public.dose_legacy_comparisons_v3 (
  comparison_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  legacy_regimen_id uuid,
  comparison_status text not null,
  conflicts jsonb not null default '[]'::jsonb,
  missing_fields text[] not null default '{}'::text[],
  compared_at timestamptz not null default now(),
  constraint dose_legacy_comparisons_v3_status_check check (comparison_status in ('exact','compatible','conflict','missing','not_applicable'))
);

create table if not exists public.dose_review_queue_v3 (
  review_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  priority integer not null,
  review_reason_codes text[] not null,
  review_status text not null default 'open',
  assigned_to uuid,
  reviewer_id uuid,
  source_version text,
  decision text,
  decision_reason text,
  decision_notes text,
  opened_at timestamptz not null default now(),
  reviewed_at timestamptz,
  decided_at timestamptz,
  constraint dose_review_queue_v3_priority_check check (priority between 1 and 100),
  constraint dose_review_queue_v3_status_check check (review_status in ('open','in_review','resolved','rejected')),
  constraint dose_review_queue_v3_decision_check check (
    review_status not in ('resolved','rejected')
    or (
      decision is not null
      and decision_reason is not null
      and btrim(decision_reason) <> ''
      and reviewer_id is not null
      and reviewed_at is not null
      and decided_at is not null
      and source_version is not null
      and btrim(source_version) <> ''
    )
  )
);

create table if not exists public.dose_publication_events_v3 (
  event_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  from_status text,
  to_status text not null,
  gate_version text not null,
  gate_result jsonb not null,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint dose_publication_events_v3_to_status_check check (to_status in ('draft','in_review','verified','published','retired'))
);

-- Foreign-key and fast-path indexes.
create index if not exists dose_source_sections_v3_snapshot_idx on public.dose_source_sections_v3(snapshot_id);
create index if not exists dose_indication_terms_v3_indication_idx on public.dose_indication_terms_v3(indication_id);
create index if not exists dose_indication_terms_v3_snapshot_idx on public.dose_indication_terms_v3(source_snapshot_id);
create index if not exists dose_rules_v3_substance_idx on public.dose_rules_v3(substance_concept_id);
create index if not exists dose_rules_v3_indication_idx on public.dose_rules_v3(indication_id);
create index if not exists dose_rules_v3_source_snapshot_idx on public.dose_rules_v3(source_snapshot_id);
create index if not exists dose_rules_v3_published_lookup_idx
  on public.dose_rules_v3(substance_concept_id, indication_id, patient_group)
  where editorial_status = 'published';
create index if not exists dose_renal_adjustments_v3_rule_idx on public.dose_renal_adjustments_v3(rule_id);
create index if not exists dose_renal_adjustments_v3_measure_idx on public.dose_renal_adjustments_v3(rule_id, measure_type) where review_status = 'verified';
create index if not exists dose_hepatic_adjustments_v3_rule_idx on public.dose_hepatic_adjustments_v3(rule_id);
create index if not exists dose_hepatic_adjustments_v3_measure_idx on public.dose_hepatic_adjustments_v3(rule_id, measure_type) where review_status = 'verified';
create index if not exists dose_rule_products_v3_rule_idx on public.dose_rule_products_v3(rule_id);
create index if not exists dose_rule_products_v3_drug_idx on public.dose_rule_products_v3(drug_id);
create index if not exists dose_rule_products_v3_verified_drug_idx
  on public.dose_rule_products_v3(drug_id, rule_id)
  where binding_status = 'verified';
create index if not exists dose_legacy_comparisons_v3_rule_idx on public.dose_legacy_comparisons_v3(rule_id);
create index if not exists dose_review_queue_v3_rule_idx on public.dose_review_queue_v3(rule_id);
create index if not exists dose_review_queue_v3_open_idx
  on public.dose_review_queue_v3(priority desc, opened_at)
  where review_status in ('open','in_review');
create index if not exists dose_publication_events_v3_rule_idx on public.dose_publication_events_v3(rule_id, created_at desc);

-- RLS: every V3 table in public is explicitly protected.
alter table public.dose_source_snapshots_v3 enable row level security;
alter table public.dose_source_sections_v3 enable row level security;
alter table public.dose_indication_concepts_v3 enable row level security;
alter table public.dose_indication_terms_v3 enable row level security;
alter table public.dose_rules_v3 enable row level security;
alter table public.dose_renal_adjustments_v3 enable row level security;
alter table public.dose_hepatic_adjustments_v3 enable row level security;
alter table public.dose_rule_products_v3 enable row level security;
alter table public.dose_legacy_comparisons_v3 enable row level security;
alter table public.dose_review_queue_v3 enable row level security;
alter table public.dose_publication_events_v3 enable row level security;

-- Fail closed first: no implicit client access.
revoke all privileges on table
  public.dose_source_snapshots_v3,
  public.dose_source_sections_v3,
  public.dose_indication_concepts_v3,
  public.dose_indication_terms_v3,
  public.dose_rules_v3,
  public.dose_renal_adjustments_v3,
  public.dose_hepatic_adjustments_v3,
  public.dose_rule_products_v3,
  public.dose_legacy_comparisons_v3,
  public.dose_review_queue_v3,
  public.dose_publication_events_v3
from anon, authenticated;

-- Published-read tables: SELECT only, filtered by RLS.
grant select on table public.dose_indication_concepts_v3 to anon, authenticated;
grant select on table public.dose_rules_v3 to anon, authenticated;
grant select on table public.dose_rule_products_v3 to anon, authenticated;

drop policy if exists dose_indication_concepts_v3_published_read on public.dose_indication_concepts_v3;
create policy dose_indication_concepts_v3_published_read
  on public.dose_indication_concepts_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rules_v3_published_read on public.dose_rules_v3;
create policy dose_rules_v3_published_read
  on public.dose_rules_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rule_products_v3_published_read on public.dose_rule_products_v3;
create policy dose_rule_products_v3_published_read
  on public.dose_rule_products_v3
  for select to anon, authenticated
  using (
    binding_status = 'verified'
    and exists (
      select 1
      from public.dose_rules_v3 r
      where r.rule_id = dose_rule_products_v3.rule_id
        and r.editorial_status = 'published'
    )
  );

-- Single-read public fast path for an already-authenticated application route.
-- The function itself only exposes published rules + verified bindings.
create or replace function public.medindex_dose_product_fast_path_v3(
  p_product_key text default null,
  p_drug_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $
  with selector_guard as (
    select
      nullif(btrim(p_product_key), '') as product_key,
      p_drug_id as drug_id
    where (nullif(btrim(p_product_key), '') is null) <> (p_drug_id is null)
  ),
  selected_bindings as (
    select b.*
    from selector_guard s
    join public.dose_rule_products_v3 b
      on (
        (s.product_key is not null and b.product_key = s.product_key)
        or (s.drug_id is not null and b.drug_id = s.drug_id)
      )
    join public.dose_rules_v3 r
      on r.rule_id = b.rule_id
     and r.editorial_status = 'published'
    where b.binding_status = 'verified'
  ),
  product_row as (
    select p.*
    from public.dose_products_v2 p
    join (select distinct drug_id from selected_bindings limit 1) b
      on b.drug_id = p.drug_id
    where p.active = true
      and p.editorial_status = 'published'
    limit 1
  ),
  rule_rows as (
    select
      r.*,
      i.indication_key,
      i.canonical_name as indication_name,
      b.preferred,
      b.conversion_enabled,
      b.tablet_split_allowed,
      b.rounding_increment_value,
      b.rounding_increment_unit,
      b.binding_status,
      s.document_version,
      s.document_date
    from selected_bindings b
    join public.dose_rules_v3 r on r.rule_id = b.rule_id
    join public.dose_indication_concepts_v3 i
      on i.indication_id = r.indication_id
     and i.editorial_status = 'published'
    join public.dose_source_snapshots_v3 s
      on s.snapshot_id = r.source_snapshot_id
     and s.snapshot_id = r.source_evidence_hash
    where r.source_section = '4.2'
      and r.source_snapshot_id ~ '^[0-9a-f]{64}
comment on table public.dose_rules_v3 is
  'DRx Dosierung V3 shadow rules. Fail-closed; do not cut over runtime until review/binding/safety/API parity gates pass.';
),
  constraint dose_renal_adjustments_v3_range_check check (min_value is null or max_value is null or min_value <= max_value),
  constraint dose_renal_adjustments_v3_review_check
    check (review_status in ('draft','in_review','verified','rejected','retired')),
  constraint dose_renal_adjustments_v3_verified_provenance_check check (
    review_status <> 'verified'
    or (
      source_snapshot_id is not null
      and source_evidence_hash ~ '^[0-9a-f]{64}
  binding_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  product_key text,
  match_method text not null,
  preferred boolean not null default false,
  conversion_enabled boolean not null default false,
  tablet_split_allowed boolean not null default false,
  rounding_increment_value numeric,
  rounding_increment_unit text,
  binding_status text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dose_rule_products_v3_unique_binding unique (rule_id, drug_id),
  constraint dose_rule_products_v3_status_check check (binding_status in ('candidate','verified','rejected','retired')),
  constraint dose_rule_products_v3_verified_check check (binding_status <> 'verified' or verified_at is not null),
  constraint dose_rule_products_v3_rounding_check check (rounding_increment_value is null or rounding_increment_value > 0)
);

create table if not exists public.dose_legacy_comparisons_v3 (
  comparison_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  legacy_regimen_id uuid,
  comparison_status text not null,
  conflicts jsonb not null default '[]'::jsonb,
  missing_fields text[] not null default '{}'::text[],
  compared_at timestamptz not null default now(),
  constraint dose_legacy_comparisons_v3_status_check check (comparison_status in ('exact','compatible','conflict','missing','not_applicable'))
);

create table if not exists public.dose_review_queue_v3 (
  review_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  priority integer not null,
  review_reason_codes text[] not null,
  review_status text not null default 'open',
  assigned_to uuid,
  decision text,
  decision_notes text,
  opened_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint dose_review_queue_v3_priority_check check (priority between 1 and 100),
  constraint dose_review_queue_v3_status_check check (review_status in ('open','in_review','resolved','rejected')),
  constraint dose_review_queue_v3_decision_check check (
    review_status not in ('resolved','rejected')
    or (decision is not null and decided_at is not null)
  )
);

create table if not exists public.dose_publication_events_v3 (
  event_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  from_status text,
  to_status text not null,
  gate_version text not null,
  gate_result jsonb not null,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint dose_publication_events_v3_to_status_check check (to_status in ('draft','in_review','verified','published','retired'))
);

-- Foreign-key and fast-path indexes.
create index if not exists dose_source_sections_v3_snapshot_idx on public.dose_source_sections_v3(snapshot_id);
create index if not exists dose_indication_terms_v3_indication_idx on public.dose_indication_terms_v3(indication_id);
create index if not exists dose_indication_terms_v3_snapshot_idx on public.dose_indication_terms_v3(source_snapshot_id);
create index if not exists dose_rules_v3_substance_idx on public.dose_rules_v3(substance_concept_id);
create index if not exists dose_rules_v3_indication_idx on public.dose_rules_v3(indication_id);
create index if not exists dose_rules_v3_source_snapshot_idx on public.dose_rules_v3(source_snapshot_id);
create index if not exists dose_rules_v3_published_lookup_idx
  on public.dose_rules_v3(substance_concept_id, indication_id, patient_group)
  where editorial_status = 'published';
create index if not exists dose_rule_products_v3_rule_idx on public.dose_rule_products_v3(rule_id);
create index if not exists dose_rule_products_v3_drug_idx on public.dose_rule_products_v3(drug_id);
create index if not exists dose_rule_products_v3_verified_drug_idx
  on public.dose_rule_products_v3(drug_id, rule_id)
  where binding_status = 'verified';
create index if not exists dose_legacy_comparisons_v3_rule_idx on public.dose_legacy_comparisons_v3(rule_id);
create index if not exists dose_review_queue_v3_rule_idx on public.dose_review_queue_v3(rule_id);
create index if not exists dose_review_queue_v3_open_idx
  on public.dose_review_queue_v3(priority desc, opened_at)
  where review_status in ('open','in_review');
create index if not exists dose_publication_events_v3_rule_idx on public.dose_publication_events_v3(rule_id, created_at desc);

-- RLS: every V3 table in public is explicitly protected.
alter table public.dose_source_snapshots_v3 enable row level security;
alter table public.dose_source_sections_v3 enable row level security;
alter table public.dose_indication_concepts_v3 enable row level security;
alter table public.dose_indication_terms_v3 enable row level security;
alter table public.dose_rules_v3 enable row level security;
alter table public.dose_rule_products_v3 enable row level security;
alter table public.dose_legacy_comparisons_v3 enable row level security;
alter table public.dose_review_queue_v3 enable row level security;
alter table public.dose_publication_events_v3 enable row level security;

-- Fail closed first: no implicit client access.
revoke all privileges on table
  public.dose_source_snapshots_v3,
  public.dose_source_sections_v3,
  public.dose_indication_concepts_v3,
  public.dose_indication_terms_v3,
  public.dose_rules_v3,
  public.dose_rule_products_v3,
  public.dose_legacy_comparisons_v3,
  public.dose_review_queue_v3,
  public.dose_publication_events_v3
from anon, authenticated;

-- Published-read tables: SELECT only, filtered by RLS.
grant select on table public.dose_indication_concepts_v3 to anon, authenticated;
grant select on table public.dose_rules_v3 to anon, authenticated;
grant select on table public.dose_rule_products_v3 to anon, authenticated;

drop policy if exists dose_indication_concepts_v3_published_read on public.dose_indication_concepts_v3;
create policy dose_indication_concepts_v3_published_read
  on public.dose_indication_concepts_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rules_v3_published_read on public.dose_rules_v3;
create policy dose_rules_v3_published_read
  on public.dose_rules_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rule_products_v3_published_read on public.dose_rule_products_v3;
create policy dose_rule_products_v3_published_read
  on public.dose_rule_products_v3
  for select to anon, authenticated
  using (
    binding_status = 'verified'
    and exists (
      select 1
      from public.dose_rules_v3 r
      where r.rule_id = dose_rule_products_v3.rule_id
        and r.editorial_status = 'published'
    )
  );

-- service_role remains able to manage shadow V3 through its elevated server-side role.
comment on table public.dose_rules_v3 is
  'DRx Dosierung V3 shadow rules. Fail-closed; do not cut over runtime until review/binding/safety/API parity gates pass.';

      and verified_by is not null
      and btrim(verified_by) <> ''
      and verified_at is not null
    )
  ),
  constraint dose_renal_adjustments_v3_reduction_check check (
    dose_action <> 'reduce_dose'
    or (
      (dose_factor is not null and dose_factor > 0 and dose_factor < 1)
      or replacement_dose_min is not null
      or replacement_dose_max is not null
    )
  ),
  constraint dose_renal_adjustments_v3_interval_check check (
    dose_action <> 'extend_interval'
    or interval_min_hours is not null
    or interval_max_hours is not null
  )
);

create table if not exists public.dose_hepatic_adjustments_v3 (
  adjustment_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  measure_type text not null,
  severity_or_class text[] not null,
  dose_action text not null,
  dose_factor numeric,
  replacement_dose_min numeric,
  replacement_dose_max numeric,
  interval_min_hours numeric,
  interval_max_hours numeric,
  source_key text not null,
  source_snapshot_id text not null references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  source_section text not null default '4.2',
  source_evidence_hash text not null,
  review_status text not null default 'draft',
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dose_hepatic_adjustments_v3_measure_check
    check (measure_type in ('Child_Pugh_class','hepatic_impairment_textual')),
  constraint dose_hepatic_adjustments_v3_action_check
    check (dose_action in ('no_adjustment','reduce_dose','extend_interval','avoid','contraindicated','specialist_review')),
  constraint dose_hepatic_adjustments_v3_class_check check (cardinality(severity_or_class) >= 1),
  constraint dose_hepatic_adjustments_v3_section_check check (source_section = '4.2'),
  constraint dose_hepatic_adjustments_v3_source_hash_check check (source_evidence_hash ~ '^[0-9a-f]{64}
  binding_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  product_key text,
  match_method text not null,
  preferred boolean not null default false,
  conversion_enabled boolean not null default false,
  tablet_split_allowed boolean not null default false,
  rounding_increment_value numeric,
  rounding_increment_unit text,
  binding_status text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dose_rule_products_v3_unique_binding unique (rule_id, drug_id),
  constraint dose_rule_products_v3_status_check check (binding_status in ('candidate','verified','rejected','retired')),
  constraint dose_rule_products_v3_verified_check check (binding_status <> 'verified' or verified_at is not null),
  constraint dose_rule_products_v3_rounding_check check (rounding_increment_value is null or rounding_increment_value > 0)
);

create table if not exists public.dose_legacy_comparisons_v3 (
  comparison_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  legacy_regimen_id uuid,
  comparison_status text not null,
  conflicts jsonb not null default '[]'::jsonb,
  missing_fields text[] not null default '{}'::text[],
  compared_at timestamptz not null default now(),
  constraint dose_legacy_comparisons_v3_status_check check (comparison_status in ('exact','compatible','conflict','missing','not_applicable'))
);

create table if not exists public.dose_review_queue_v3 (
  review_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  priority integer not null,
  review_reason_codes text[] not null,
  review_status text not null default 'open',
  assigned_to uuid,
  decision text,
  decision_notes text,
  opened_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint dose_review_queue_v3_priority_check check (priority between 1 and 100),
  constraint dose_review_queue_v3_status_check check (review_status in ('open','in_review','resolved','rejected')),
  constraint dose_review_queue_v3_decision_check check (
    review_status not in ('resolved','rejected')
    or (decision is not null and decided_at is not null)
  )
);

create table if not exists public.dose_publication_events_v3 (
  event_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  from_status text,
  to_status text not null,
  gate_version text not null,
  gate_result jsonb not null,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint dose_publication_events_v3_to_status_check check (to_status in ('draft','in_review','verified','published','retired'))
);

-- Foreign-key and fast-path indexes.
create index if not exists dose_source_sections_v3_snapshot_idx on public.dose_source_sections_v3(snapshot_id);
create index if not exists dose_indication_terms_v3_indication_idx on public.dose_indication_terms_v3(indication_id);
create index if not exists dose_indication_terms_v3_snapshot_idx on public.dose_indication_terms_v3(source_snapshot_id);
create index if not exists dose_rules_v3_substance_idx on public.dose_rules_v3(substance_concept_id);
create index if not exists dose_rules_v3_indication_idx on public.dose_rules_v3(indication_id);
create index if not exists dose_rules_v3_source_snapshot_idx on public.dose_rules_v3(source_snapshot_id);
create index if not exists dose_rules_v3_published_lookup_idx
  on public.dose_rules_v3(substance_concept_id, indication_id, patient_group)
  where editorial_status = 'published';
create index if not exists dose_rule_products_v3_rule_idx on public.dose_rule_products_v3(rule_id);
create index if not exists dose_rule_products_v3_drug_idx on public.dose_rule_products_v3(drug_id);
create index if not exists dose_rule_products_v3_verified_drug_idx
  on public.dose_rule_products_v3(drug_id, rule_id)
  where binding_status = 'verified';
create index if not exists dose_legacy_comparisons_v3_rule_idx on public.dose_legacy_comparisons_v3(rule_id);
create index if not exists dose_review_queue_v3_rule_idx on public.dose_review_queue_v3(rule_id);
create index if not exists dose_review_queue_v3_open_idx
  on public.dose_review_queue_v3(priority desc, opened_at)
  where review_status in ('open','in_review');
create index if not exists dose_publication_events_v3_rule_idx on public.dose_publication_events_v3(rule_id, created_at desc);

-- RLS: every V3 table in public is explicitly protected.
alter table public.dose_source_snapshots_v3 enable row level security;
alter table public.dose_source_sections_v3 enable row level security;
alter table public.dose_indication_concepts_v3 enable row level security;
alter table public.dose_indication_terms_v3 enable row level security;
alter table public.dose_rules_v3 enable row level security;
alter table public.dose_rule_products_v3 enable row level security;
alter table public.dose_legacy_comparisons_v3 enable row level security;
alter table public.dose_review_queue_v3 enable row level security;
alter table public.dose_publication_events_v3 enable row level security;

-- Fail closed first: no implicit client access.
revoke all privileges on table
  public.dose_source_snapshots_v3,
  public.dose_source_sections_v3,
  public.dose_indication_concepts_v3,
  public.dose_indication_terms_v3,
  public.dose_rules_v3,
  public.dose_rule_products_v3,
  public.dose_legacy_comparisons_v3,
  public.dose_review_queue_v3,
  public.dose_publication_events_v3
from anon, authenticated;

-- Published-read tables: SELECT only, filtered by RLS.
grant select on table public.dose_indication_concepts_v3 to anon, authenticated;
grant select on table public.dose_rules_v3 to anon, authenticated;
grant select on table public.dose_rule_products_v3 to anon, authenticated;

drop policy if exists dose_indication_concepts_v3_published_read on public.dose_indication_concepts_v3;
create policy dose_indication_concepts_v3_published_read
  on public.dose_indication_concepts_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rules_v3_published_read on public.dose_rules_v3;
create policy dose_rules_v3_published_read
  on public.dose_rules_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rule_products_v3_published_read on public.dose_rule_products_v3;
create policy dose_rule_products_v3_published_read
  on public.dose_rule_products_v3
  for select to anon, authenticated
  using (
    binding_status = 'verified'
    and exists (
      select 1
      from public.dose_rules_v3 r
      where r.rule_id = dose_rule_products_v3.rule_id
        and r.editorial_status = 'published'
    )
  );

-- service_role remains able to manage shadow V3 through its elevated server-side role.
comment on table public.dose_rules_v3 is
  'DRx Dosierung V3 shadow rules. Fail-closed; do not cut over runtime until review/binding/safety/API parity gates pass.';
),
  constraint dose_hepatic_adjustments_v3_review_check
    check (review_status in ('draft','in_review','verified','rejected','retired')),
  constraint dose_hepatic_adjustments_v3_verified_provenance_check check (
    review_status <> 'verified'
    or (
      source_snapshot_id is not null
      and source_evidence_hash ~ '^[0-9a-f]{64}
  binding_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  product_key text,
  match_method text not null,
  preferred boolean not null default false,
  conversion_enabled boolean not null default false,
  tablet_split_allowed boolean not null default false,
  rounding_increment_value numeric,
  rounding_increment_unit text,
  binding_status text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dose_rule_products_v3_unique_binding unique (rule_id, drug_id),
  constraint dose_rule_products_v3_status_check check (binding_status in ('candidate','verified','rejected','retired')),
  constraint dose_rule_products_v3_verified_check check (binding_status <> 'verified' or verified_at is not null),
  constraint dose_rule_products_v3_rounding_check check (rounding_increment_value is null or rounding_increment_value > 0)
);

create table if not exists public.dose_legacy_comparisons_v3 (
  comparison_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  legacy_regimen_id uuid,
  comparison_status text not null,
  conflicts jsonb not null default '[]'::jsonb,
  missing_fields text[] not null default '{}'::text[],
  compared_at timestamptz not null default now(),
  constraint dose_legacy_comparisons_v3_status_check check (comparison_status in ('exact','compatible','conflict','missing','not_applicable'))
);

create table if not exists public.dose_review_queue_v3 (
  review_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  priority integer not null,
  review_reason_codes text[] not null,
  review_status text not null default 'open',
  assigned_to uuid,
  decision text,
  decision_notes text,
  opened_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint dose_review_queue_v3_priority_check check (priority between 1 and 100),
  constraint dose_review_queue_v3_status_check check (review_status in ('open','in_review','resolved','rejected')),
  constraint dose_review_queue_v3_decision_check check (
    review_status not in ('resolved','rejected')
    or (decision is not null and decided_at is not null)
  )
);

create table if not exists public.dose_publication_events_v3 (
  event_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  from_status text,
  to_status text not null,
  gate_version text not null,
  gate_result jsonb not null,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint dose_publication_events_v3_to_status_check check (to_status in ('draft','in_review','verified','published','retired'))
);

-- Foreign-key and fast-path indexes.
create index if not exists dose_source_sections_v3_snapshot_idx on public.dose_source_sections_v3(snapshot_id);
create index if not exists dose_indication_terms_v3_indication_idx on public.dose_indication_terms_v3(indication_id);
create index if not exists dose_indication_terms_v3_snapshot_idx on public.dose_indication_terms_v3(source_snapshot_id);
create index if not exists dose_rules_v3_substance_idx on public.dose_rules_v3(substance_concept_id);
create index if not exists dose_rules_v3_indication_idx on public.dose_rules_v3(indication_id);
create index if not exists dose_rules_v3_source_snapshot_idx on public.dose_rules_v3(source_snapshot_id);
create index if not exists dose_rules_v3_published_lookup_idx
  on public.dose_rules_v3(substance_concept_id, indication_id, patient_group)
  where editorial_status = 'published';
create index if not exists dose_rule_products_v3_rule_idx on public.dose_rule_products_v3(rule_id);
create index if not exists dose_rule_products_v3_drug_idx on public.dose_rule_products_v3(drug_id);
create index if not exists dose_rule_products_v3_verified_drug_idx
  on public.dose_rule_products_v3(drug_id, rule_id)
  where binding_status = 'verified';
create index if not exists dose_legacy_comparisons_v3_rule_idx on public.dose_legacy_comparisons_v3(rule_id);
create index if not exists dose_review_queue_v3_rule_idx on public.dose_review_queue_v3(rule_id);
create index if not exists dose_review_queue_v3_open_idx
  on public.dose_review_queue_v3(priority desc, opened_at)
  where review_status in ('open','in_review');
create index if not exists dose_publication_events_v3_rule_idx on public.dose_publication_events_v3(rule_id, created_at desc);

-- RLS: every V3 table in public is explicitly protected.
alter table public.dose_source_snapshots_v3 enable row level security;
alter table public.dose_source_sections_v3 enable row level security;
alter table public.dose_indication_concepts_v3 enable row level security;
alter table public.dose_indication_terms_v3 enable row level security;
alter table public.dose_rules_v3 enable row level security;
alter table public.dose_rule_products_v3 enable row level security;
alter table public.dose_legacy_comparisons_v3 enable row level security;
alter table public.dose_review_queue_v3 enable row level security;
alter table public.dose_publication_events_v3 enable row level security;

-- Fail closed first: no implicit client access.
revoke all privileges on table
  public.dose_source_snapshots_v3,
  public.dose_source_sections_v3,
  public.dose_indication_concepts_v3,
  public.dose_indication_terms_v3,
  public.dose_rules_v3,
  public.dose_rule_products_v3,
  public.dose_legacy_comparisons_v3,
  public.dose_review_queue_v3,
  public.dose_publication_events_v3
from anon, authenticated;

-- Published-read tables: SELECT only, filtered by RLS.
grant select on table public.dose_indication_concepts_v3 to anon, authenticated;
grant select on table public.dose_rules_v3 to anon, authenticated;
grant select on table public.dose_rule_products_v3 to anon, authenticated;

drop policy if exists dose_indication_concepts_v3_published_read on public.dose_indication_concepts_v3;
create policy dose_indication_concepts_v3_published_read
  on public.dose_indication_concepts_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rules_v3_published_read on public.dose_rules_v3;
create policy dose_rules_v3_published_read
  on public.dose_rules_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rule_products_v3_published_read on public.dose_rule_products_v3;
create policy dose_rule_products_v3_published_read
  on public.dose_rule_products_v3
  for select to anon, authenticated
  using (
    binding_status = 'verified'
    and exists (
      select 1
      from public.dose_rules_v3 r
      where r.rule_id = dose_rule_products_v3.rule_id
        and r.editorial_status = 'published'
    )
  );

-- service_role remains able to manage shadow V3 through its elevated server-side role.
comment on table public.dose_rules_v3 is
  'DRx Dosierung V3 shadow rules. Fail-closed; do not cut over runtime until review/binding/safety/API parity gates pass.';

      and verified_by is not null
      and btrim(verified_by) <> ''
      and verified_at is not null
    )
  ),
  constraint dose_hepatic_adjustments_v3_reduction_check check (
    dose_action <> 'reduce_dose'
    or (
      (dose_factor is not null and dose_factor > 0 and dose_factor < 1)
      or replacement_dose_min is not null
      or replacement_dose_max is not null
    )
  ),
  constraint dose_hepatic_adjustments_v3_interval_check check (
    dose_action <> 'extend_interval'
    or interval_min_hours is not null
    or interval_max_hours is not null
  )
);

create table if not exists public.dose_rule_products_v3 (
  binding_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  product_key text,
  match_method text not null,
  preferred boolean not null default false,
  conversion_enabled boolean not null default false,
  tablet_split_allowed boolean not null default false,
  rounding_increment_value numeric,
  rounding_increment_unit text,
  binding_status text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dose_rule_products_v3_unique_binding unique (rule_id, drug_id),
  constraint dose_rule_products_v3_status_check check (binding_status in ('candidate','verified','rejected','retired')),
  constraint dose_rule_products_v3_verified_check check (binding_status <> 'verified' or verified_at is not null),
  constraint dose_rule_products_v3_rounding_check check (rounding_increment_value is null or rounding_increment_value > 0)
);

create table if not exists public.dose_legacy_comparisons_v3 (
  comparison_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  legacy_regimen_id uuid,
  comparison_status text not null,
  conflicts jsonb not null default '[]'::jsonb,
  missing_fields text[] not null default '{}'::text[],
  compared_at timestamptz not null default now(),
  constraint dose_legacy_comparisons_v3_status_check check (comparison_status in ('exact','compatible','conflict','missing','not_applicable'))
);

create table if not exists public.dose_review_queue_v3 (
  review_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  priority integer not null,
  review_reason_codes text[] not null,
  review_status text not null default 'open',
  assigned_to uuid,
  decision text,
  decision_notes text,
  opened_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint dose_review_queue_v3_priority_check check (priority between 1 and 100),
  constraint dose_review_queue_v3_status_check check (review_status in ('open','in_review','resolved','rejected')),
  constraint dose_review_queue_v3_decision_check check (
    review_status not in ('resolved','rejected')
    or (decision is not null and decided_at is not null)
  )
);

create table if not exists public.dose_publication_events_v3 (
  event_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  from_status text,
  to_status text not null,
  gate_version text not null,
  gate_result jsonb not null,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint dose_publication_events_v3_to_status_check check (to_status in ('draft','in_review','verified','published','retired'))
);

-- Foreign-key and fast-path indexes.
create index if not exists dose_source_sections_v3_snapshot_idx on public.dose_source_sections_v3(snapshot_id);
create index if not exists dose_indication_terms_v3_indication_idx on public.dose_indication_terms_v3(indication_id);
create index if not exists dose_indication_terms_v3_snapshot_idx on public.dose_indication_terms_v3(source_snapshot_id);
create index if not exists dose_rules_v3_substance_idx on public.dose_rules_v3(substance_concept_id);
create index if not exists dose_rules_v3_indication_idx on public.dose_rules_v3(indication_id);
create index if not exists dose_rules_v3_source_snapshot_idx on public.dose_rules_v3(source_snapshot_id);
create index if not exists dose_rules_v3_published_lookup_idx
  on public.dose_rules_v3(substance_concept_id, indication_id, patient_group)
  where editorial_status = 'published';
create index if not exists dose_rule_products_v3_rule_idx on public.dose_rule_products_v3(rule_id);
create index if not exists dose_rule_products_v3_drug_idx on public.dose_rule_products_v3(drug_id);
create index if not exists dose_rule_products_v3_verified_drug_idx
  on public.dose_rule_products_v3(drug_id, rule_id)
  where binding_status = 'verified';
create index if not exists dose_legacy_comparisons_v3_rule_idx on public.dose_legacy_comparisons_v3(rule_id);
create index if not exists dose_review_queue_v3_rule_idx on public.dose_review_queue_v3(rule_id);
create index if not exists dose_review_queue_v3_open_idx
  on public.dose_review_queue_v3(priority desc, opened_at)
  where review_status in ('open','in_review');
create index if not exists dose_publication_events_v3_rule_idx on public.dose_publication_events_v3(rule_id, created_at desc);

-- RLS: every V3 table in public is explicitly protected.
alter table public.dose_source_snapshots_v3 enable row level security;
alter table public.dose_source_sections_v3 enable row level security;
alter table public.dose_indication_concepts_v3 enable row level security;
alter table public.dose_indication_terms_v3 enable row level security;
alter table public.dose_rules_v3 enable row level security;
alter table public.dose_rule_products_v3 enable row level security;
alter table public.dose_legacy_comparisons_v3 enable row level security;
alter table public.dose_review_queue_v3 enable row level security;
alter table public.dose_publication_events_v3 enable row level security;

-- Fail closed first: no implicit client access.
revoke all privileges on table
  public.dose_source_snapshots_v3,
  public.dose_source_sections_v3,
  public.dose_indication_concepts_v3,
  public.dose_indication_terms_v3,
  public.dose_rules_v3,
  public.dose_rule_products_v3,
  public.dose_legacy_comparisons_v3,
  public.dose_review_queue_v3,
  public.dose_publication_events_v3
from anon, authenticated;

-- Published-read tables: SELECT only, filtered by RLS.
grant select on table public.dose_indication_concepts_v3 to anon, authenticated;
grant select on table public.dose_rules_v3 to anon, authenticated;
grant select on table public.dose_rule_products_v3 to anon, authenticated;

drop policy if exists dose_indication_concepts_v3_published_read on public.dose_indication_concepts_v3;
create policy dose_indication_concepts_v3_published_read
  on public.dose_indication_concepts_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rules_v3_published_read on public.dose_rules_v3;
create policy dose_rules_v3_published_read
  on public.dose_rules_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rule_products_v3_published_read on public.dose_rule_products_v3;
create policy dose_rule_products_v3_published_read
  on public.dose_rule_products_v3
  for select to anon, authenticated
  using (
    binding_status = 'verified'
    and exists (
      select 1
      from public.dose_rules_v3 r
      where r.rule_id = dose_rule_products_v3.rule_id
        and r.editorial_status = 'published'
    )
  );

-- service_role remains able to manage shadow V3 through its elevated server-side role.
comment on table public.dose_rules_v3 is
  'DRx Dosierung V3 shadow rules. Fail-closed; do not cut over runtime until review/binding/safety/API parity gates pass.';

      and r.source_evidence_hash ~ '^[0-9a-f]{64}
comment on table public.dose_rules_v3 is
  'DRx Dosierung V3 shadow rules. Fail-closed; do not cut over runtime until review/binding/safety/API parity gates pass.';
),
  constraint dose_renal_adjustments_v3_range_check check (min_value is null or max_value is null or min_value <= max_value),
  constraint dose_renal_adjustments_v3_review_check
    check (review_status in ('draft','in_review','verified','rejected','retired')),
  constraint dose_renal_adjustments_v3_verified_provenance_check check (
    review_status <> 'verified'
    or (
      source_snapshot_id is not null
      and source_evidence_hash ~ '^[0-9a-f]{64}
  binding_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  product_key text,
  match_method text not null,
  preferred boolean not null default false,
  conversion_enabled boolean not null default false,
  tablet_split_allowed boolean not null default false,
  rounding_increment_value numeric,
  rounding_increment_unit text,
  binding_status text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dose_rule_products_v3_unique_binding unique (rule_id, drug_id),
  constraint dose_rule_products_v3_status_check check (binding_status in ('candidate','verified','rejected','retired')),
  constraint dose_rule_products_v3_verified_check check (binding_status <> 'verified' or verified_at is not null),
  constraint dose_rule_products_v3_rounding_check check (rounding_increment_value is null or rounding_increment_value > 0)
);

create table if not exists public.dose_legacy_comparisons_v3 (
  comparison_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  legacy_regimen_id uuid,
  comparison_status text not null,
  conflicts jsonb not null default '[]'::jsonb,
  missing_fields text[] not null default '{}'::text[],
  compared_at timestamptz not null default now(),
  constraint dose_legacy_comparisons_v3_status_check check (comparison_status in ('exact','compatible','conflict','missing','not_applicable'))
);

create table if not exists public.dose_review_queue_v3 (
  review_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  priority integer not null,
  review_reason_codes text[] not null,
  review_status text not null default 'open',
  assigned_to uuid,
  decision text,
  decision_notes text,
  opened_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint dose_review_queue_v3_priority_check check (priority between 1 and 100),
  constraint dose_review_queue_v3_status_check check (review_status in ('open','in_review','resolved','rejected')),
  constraint dose_review_queue_v3_decision_check check (
    review_status not in ('resolved','rejected')
    or (decision is not null and decided_at is not null)
  )
);

create table if not exists public.dose_publication_events_v3 (
  event_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  from_status text,
  to_status text not null,
  gate_version text not null,
  gate_result jsonb not null,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint dose_publication_events_v3_to_status_check check (to_status in ('draft','in_review','verified','published','retired'))
);

-- Foreign-key and fast-path indexes.
create index if not exists dose_source_sections_v3_snapshot_idx on public.dose_source_sections_v3(snapshot_id);
create index if not exists dose_indication_terms_v3_indication_idx on public.dose_indication_terms_v3(indication_id);
create index if not exists dose_indication_terms_v3_snapshot_idx on public.dose_indication_terms_v3(source_snapshot_id);
create index if not exists dose_rules_v3_substance_idx on public.dose_rules_v3(substance_concept_id);
create index if not exists dose_rules_v3_indication_idx on public.dose_rules_v3(indication_id);
create index if not exists dose_rules_v3_source_snapshot_idx on public.dose_rules_v3(source_snapshot_id);
create index if not exists dose_rules_v3_published_lookup_idx
  on public.dose_rules_v3(substance_concept_id, indication_id, patient_group)
  where editorial_status = 'published';
create index if not exists dose_rule_products_v3_rule_idx on public.dose_rule_products_v3(rule_id);
create index if not exists dose_rule_products_v3_drug_idx on public.dose_rule_products_v3(drug_id);
create index if not exists dose_rule_products_v3_verified_drug_idx
  on public.dose_rule_products_v3(drug_id, rule_id)
  where binding_status = 'verified';
create index if not exists dose_legacy_comparisons_v3_rule_idx on public.dose_legacy_comparisons_v3(rule_id);
create index if not exists dose_review_queue_v3_rule_idx on public.dose_review_queue_v3(rule_id);
create index if not exists dose_review_queue_v3_open_idx
  on public.dose_review_queue_v3(priority desc, opened_at)
  where review_status in ('open','in_review');
create index if not exists dose_publication_events_v3_rule_idx on public.dose_publication_events_v3(rule_id, created_at desc);

-- RLS: every V3 table in public is explicitly protected.
alter table public.dose_source_snapshots_v3 enable row level security;
alter table public.dose_source_sections_v3 enable row level security;
alter table public.dose_indication_concepts_v3 enable row level security;
alter table public.dose_indication_terms_v3 enable row level security;
alter table public.dose_rules_v3 enable row level security;
alter table public.dose_rule_products_v3 enable row level security;
alter table public.dose_legacy_comparisons_v3 enable row level security;
alter table public.dose_review_queue_v3 enable row level security;
alter table public.dose_publication_events_v3 enable row level security;

-- Fail closed first: no implicit client access.
revoke all privileges on table
  public.dose_source_snapshots_v3,
  public.dose_source_sections_v3,
  public.dose_indication_concepts_v3,
  public.dose_indication_terms_v3,
  public.dose_rules_v3,
  public.dose_rule_products_v3,
  public.dose_legacy_comparisons_v3,
  public.dose_review_queue_v3,
  public.dose_publication_events_v3
from anon, authenticated;

-- Published-read tables: SELECT only, filtered by RLS.
grant select on table public.dose_indication_concepts_v3 to anon, authenticated;
grant select on table public.dose_rules_v3 to anon, authenticated;
grant select on table public.dose_rule_products_v3 to anon, authenticated;

drop policy if exists dose_indication_concepts_v3_published_read on public.dose_indication_concepts_v3;
create policy dose_indication_concepts_v3_published_read
  on public.dose_indication_concepts_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rules_v3_published_read on public.dose_rules_v3;
create policy dose_rules_v3_published_read
  on public.dose_rules_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rule_products_v3_published_read on public.dose_rule_products_v3;
create policy dose_rule_products_v3_published_read
  on public.dose_rule_products_v3
  for select to anon, authenticated
  using (
    binding_status = 'verified'
    and exists (
      select 1
      from public.dose_rules_v3 r
      where r.rule_id = dose_rule_products_v3.rule_id
        and r.editorial_status = 'published'
    )
  );

-- service_role remains able to manage shadow V3 through its elevated server-side role.
comment on table public.dose_rules_v3 is
  'DRx Dosierung V3 shadow rules. Fail-closed; do not cut over runtime until review/binding/safety/API parity gates pass.';

      and verified_by is not null
      and btrim(verified_by) <> ''
      and verified_at is not null
    )
  ),
  constraint dose_renal_adjustments_v3_reduction_check check (
    dose_action <> 'reduce_dose'
    or (
      (dose_factor is not null and dose_factor > 0 and dose_factor < 1)
      or replacement_dose_min is not null
      or replacement_dose_max is not null
    )
  ),
  constraint dose_renal_adjustments_v3_interval_check check (
    dose_action <> 'extend_interval'
    or interval_min_hours is not null
    or interval_max_hours is not null
  )
);

create table if not exists public.dose_hepatic_adjustments_v3 (
  adjustment_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  measure_type text not null,
  severity_or_class text[] not null,
  dose_action text not null,
  dose_factor numeric,
  replacement_dose_min numeric,
  replacement_dose_max numeric,
  interval_min_hours numeric,
  interval_max_hours numeric,
  source_key text not null,
  source_snapshot_id text not null references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  source_section text not null default '4.2',
  source_evidence_hash text not null,
  review_status text not null default 'draft',
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dose_hepatic_adjustments_v3_measure_check
    check (measure_type in ('Child_Pugh_class','hepatic_impairment_textual')),
  constraint dose_hepatic_adjustments_v3_action_check
    check (dose_action in ('no_adjustment','reduce_dose','extend_interval','avoid','contraindicated','specialist_review')),
  constraint dose_hepatic_adjustments_v3_class_check check (cardinality(severity_or_class) >= 1),
  constraint dose_hepatic_adjustments_v3_section_check check (source_section = '4.2'),
  constraint dose_hepatic_adjustments_v3_source_hash_check check (source_evidence_hash ~ '^[0-9a-f]{64}
  binding_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  product_key text,
  match_method text not null,
  preferred boolean not null default false,
  conversion_enabled boolean not null default false,
  tablet_split_allowed boolean not null default false,
  rounding_increment_value numeric,
  rounding_increment_unit text,
  binding_status text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dose_rule_products_v3_unique_binding unique (rule_id, drug_id),
  constraint dose_rule_products_v3_status_check check (binding_status in ('candidate','verified','rejected','retired')),
  constraint dose_rule_products_v3_verified_check check (binding_status <> 'verified' or verified_at is not null),
  constraint dose_rule_products_v3_rounding_check check (rounding_increment_value is null or rounding_increment_value > 0)
);

create table if not exists public.dose_legacy_comparisons_v3 (
  comparison_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  legacy_regimen_id uuid,
  comparison_status text not null,
  conflicts jsonb not null default '[]'::jsonb,
  missing_fields text[] not null default '{}'::text[],
  compared_at timestamptz not null default now(),
  constraint dose_legacy_comparisons_v3_status_check check (comparison_status in ('exact','compatible','conflict','missing','not_applicable'))
);

create table if not exists public.dose_review_queue_v3 (
  review_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  priority integer not null,
  review_reason_codes text[] not null,
  review_status text not null default 'open',
  assigned_to uuid,
  decision text,
  decision_notes text,
  opened_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint dose_review_queue_v3_priority_check check (priority between 1 and 100),
  constraint dose_review_queue_v3_status_check check (review_status in ('open','in_review','resolved','rejected')),
  constraint dose_review_queue_v3_decision_check check (
    review_status not in ('resolved','rejected')
    or (decision is not null and decided_at is not null)
  )
);

create table if not exists public.dose_publication_events_v3 (
  event_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  from_status text,
  to_status text not null,
  gate_version text not null,
  gate_result jsonb not null,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint dose_publication_events_v3_to_status_check check (to_status in ('draft','in_review','verified','published','retired'))
);

-- Foreign-key and fast-path indexes.
create index if not exists dose_source_sections_v3_snapshot_idx on public.dose_source_sections_v3(snapshot_id);
create index if not exists dose_indication_terms_v3_indication_idx on public.dose_indication_terms_v3(indication_id);
create index if not exists dose_indication_terms_v3_snapshot_idx on public.dose_indication_terms_v3(source_snapshot_id);
create index if not exists dose_rules_v3_substance_idx on public.dose_rules_v3(substance_concept_id);
create index if not exists dose_rules_v3_indication_idx on public.dose_rules_v3(indication_id);
create index if not exists dose_rules_v3_source_snapshot_idx on public.dose_rules_v3(source_snapshot_id);
create index if not exists dose_rules_v3_published_lookup_idx
  on public.dose_rules_v3(substance_concept_id, indication_id, patient_group)
  where editorial_status = 'published';
create index if not exists dose_rule_products_v3_rule_idx on public.dose_rule_products_v3(rule_id);
create index if not exists dose_rule_products_v3_drug_idx on public.dose_rule_products_v3(drug_id);
create index if not exists dose_rule_products_v3_verified_drug_idx
  on public.dose_rule_products_v3(drug_id, rule_id)
  where binding_status = 'verified';
create index if not exists dose_legacy_comparisons_v3_rule_idx on public.dose_legacy_comparisons_v3(rule_id);
create index if not exists dose_review_queue_v3_rule_idx on public.dose_review_queue_v3(rule_id);
create index if not exists dose_review_queue_v3_open_idx
  on public.dose_review_queue_v3(priority desc, opened_at)
  where review_status in ('open','in_review');
create index if not exists dose_publication_events_v3_rule_idx on public.dose_publication_events_v3(rule_id, created_at desc);

-- RLS: every V3 table in public is explicitly protected.
alter table public.dose_source_snapshots_v3 enable row level security;
alter table public.dose_source_sections_v3 enable row level security;
alter table public.dose_indication_concepts_v3 enable row level security;
alter table public.dose_indication_terms_v3 enable row level security;
alter table public.dose_rules_v3 enable row level security;
alter table public.dose_rule_products_v3 enable row level security;
alter table public.dose_legacy_comparisons_v3 enable row level security;
alter table public.dose_review_queue_v3 enable row level security;
alter table public.dose_publication_events_v3 enable row level security;

-- Fail closed first: no implicit client access.
revoke all privileges on table
  public.dose_source_snapshots_v3,
  public.dose_source_sections_v3,
  public.dose_indication_concepts_v3,
  public.dose_indication_terms_v3,
  public.dose_rules_v3,
  public.dose_rule_products_v3,
  public.dose_legacy_comparisons_v3,
  public.dose_review_queue_v3,
  public.dose_publication_events_v3
from anon, authenticated;

-- Published-read tables: SELECT only, filtered by RLS.
grant select on table public.dose_indication_concepts_v3 to anon, authenticated;
grant select on table public.dose_rules_v3 to anon, authenticated;
grant select on table public.dose_rule_products_v3 to anon, authenticated;

drop policy if exists dose_indication_concepts_v3_published_read on public.dose_indication_concepts_v3;
create policy dose_indication_concepts_v3_published_read
  on public.dose_indication_concepts_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rules_v3_published_read on public.dose_rules_v3;
create policy dose_rules_v3_published_read
  on public.dose_rules_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rule_products_v3_published_read on public.dose_rule_products_v3;
create policy dose_rule_products_v3_published_read
  on public.dose_rule_products_v3
  for select to anon, authenticated
  using (
    binding_status = 'verified'
    and exists (
      select 1
      from public.dose_rules_v3 r
      where r.rule_id = dose_rule_products_v3.rule_id
        and r.editorial_status = 'published'
    )
  );

-- service_role remains able to manage shadow V3 through its elevated server-side role.
comment on table public.dose_rules_v3 is
  'DRx Dosierung V3 shadow rules. Fail-closed; do not cut over runtime until review/binding/safety/API parity gates pass.';
),
  constraint dose_hepatic_adjustments_v3_review_check
    check (review_status in ('draft','in_review','verified','rejected','retired')),
  constraint dose_hepatic_adjustments_v3_verified_provenance_check check (
    review_status <> 'verified'
    or (
      source_snapshot_id is not null
      and source_evidence_hash ~ '^[0-9a-f]{64}
  binding_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  product_key text,
  match_method text not null,
  preferred boolean not null default false,
  conversion_enabled boolean not null default false,
  tablet_split_allowed boolean not null default false,
  rounding_increment_value numeric,
  rounding_increment_unit text,
  binding_status text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dose_rule_products_v3_unique_binding unique (rule_id, drug_id),
  constraint dose_rule_products_v3_status_check check (binding_status in ('candidate','verified','rejected','retired')),
  constraint dose_rule_products_v3_verified_check check (binding_status <> 'verified' or verified_at is not null),
  constraint dose_rule_products_v3_rounding_check check (rounding_increment_value is null or rounding_increment_value > 0)
);

create table if not exists public.dose_legacy_comparisons_v3 (
  comparison_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  legacy_regimen_id uuid,
  comparison_status text not null,
  conflicts jsonb not null default '[]'::jsonb,
  missing_fields text[] not null default '{}'::text[],
  compared_at timestamptz not null default now(),
  constraint dose_legacy_comparisons_v3_status_check check (comparison_status in ('exact','compatible','conflict','missing','not_applicable'))
);

create table if not exists public.dose_review_queue_v3 (
  review_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  priority integer not null,
  review_reason_codes text[] not null,
  review_status text not null default 'open',
  assigned_to uuid,
  decision text,
  decision_notes text,
  opened_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint dose_review_queue_v3_priority_check check (priority between 1 and 100),
  constraint dose_review_queue_v3_status_check check (review_status in ('open','in_review','resolved','rejected')),
  constraint dose_review_queue_v3_decision_check check (
    review_status not in ('resolved','rejected')
    or (decision is not null and decided_at is not null)
  )
);

create table if not exists public.dose_publication_events_v3 (
  event_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  from_status text,
  to_status text not null,
  gate_version text not null,
  gate_result jsonb not null,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint dose_publication_events_v3_to_status_check check (to_status in ('draft','in_review','verified','published','retired'))
);

-- Foreign-key and fast-path indexes.
create index if not exists dose_source_sections_v3_snapshot_idx on public.dose_source_sections_v3(snapshot_id);
create index if not exists dose_indication_terms_v3_indication_idx on public.dose_indication_terms_v3(indication_id);
create index if not exists dose_indication_terms_v3_snapshot_idx on public.dose_indication_terms_v3(source_snapshot_id);
create index if not exists dose_rules_v3_substance_idx on public.dose_rules_v3(substance_concept_id);
create index if not exists dose_rules_v3_indication_idx on public.dose_rules_v3(indication_id);
create index if not exists dose_rules_v3_source_snapshot_idx on public.dose_rules_v3(source_snapshot_id);
create index if not exists dose_rules_v3_published_lookup_idx
  on public.dose_rules_v3(substance_concept_id, indication_id, patient_group)
  where editorial_status = 'published';
create index if not exists dose_rule_products_v3_rule_idx on public.dose_rule_products_v3(rule_id);
create index if not exists dose_rule_products_v3_drug_idx on public.dose_rule_products_v3(drug_id);
create index if not exists dose_rule_products_v3_verified_drug_idx
  on public.dose_rule_products_v3(drug_id, rule_id)
  where binding_status = 'verified';
create index if not exists dose_legacy_comparisons_v3_rule_idx on public.dose_legacy_comparisons_v3(rule_id);
create index if not exists dose_review_queue_v3_rule_idx on public.dose_review_queue_v3(rule_id);
create index if not exists dose_review_queue_v3_open_idx
  on public.dose_review_queue_v3(priority desc, opened_at)
  where review_status in ('open','in_review');
create index if not exists dose_publication_events_v3_rule_idx on public.dose_publication_events_v3(rule_id, created_at desc);

-- RLS: every V3 table in public is explicitly protected.
alter table public.dose_source_snapshots_v3 enable row level security;
alter table public.dose_source_sections_v3 enable row level security;
alter table public.dose_indication_concepts_v3 enable row level security;
alter table public.dose_indication_terms_v3 enable row level security;
alter table public.dose_rules_v3 enable row level security;
alter table public.dose_rule_products_v3 enable row level security;
alter table public.dose_legacy_comparisons_v3 enable row level security;
alter table public.dose_review_queue_v3 enable row level security;
alter table public.dose_publication_events_v3 enable row level security;

-- Fail closed first: no implicit client access.
revoke all privileges on table
  public.dose_source_snapshots_v3,
  public.dose_source_sections_v3,
  public.dose_indication_concepts_v3,
  public.dose_indication_terms_v3,
  public.dose_rules_v3,
  public.dose_rule_products_v3,
  public.dose_legacy_comparisons_v3,
  public.dose_review_queue_v3,
  public.dose_publication_events_v3
from anon, authenticated;

-- Published-read tables: SELECT only, filtered by RLS.
grant select on table public.dose_indication_concepts_v3 to anon, authenticated;
grant select on table public.dose_rules_v3 to anon, authenticated;
grant select on table public.dose_rule_products_v3 to anon, authenticated;

drop policy if exists dose_indication_concepts_v3_published_read on public.dose_indication_concepts_v3;
create policy dose_indication_concepts_v3_published_read
  on public.dose_indication_concepts_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rules_v3_published_read on public.dose_rules_v3;
create policy dose_rules_v3_published_read
  on public.dose_rules_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rule_products_v3_published_read on public.dose_rule_products_v3;
create policy dose_rule_products_v3_published_read
  on public.dose_rule_products_v3
  for select to anon, authenticated
  using (
    binding_status = 'verified'
    and exists (
      select 1
      from public.dose_rules_v3 r
      where r.rule_id = dose_rule_products_v3.rule_id
        and r.editorial_status = 'published'
    )
  );

-- service_role remains able to manage shadow V3 through its elevated server-side role.
comment on table public.dose_rules_v3 is
  'DRx Dosierung V3 shadow rules. Fail-closed; do not cut over runtime until review/binding/safety/API parity gates pass.';

      and verified_by is not null
      and btrim(verified_by) <> ''
      and verified_at is not null
    )
  ),
  constraint dose_hepatic_adjustments_v3_reduction_check check (
    dose_action <> 'reduce_dose'
    or (
      (dose_factor is not null and dose_factor > 0 and dose_factor < 1)
      or replacement_dose_min is not null
      or replacement_dose_max is not null
    )
  ),
  constraint dose_hepatic_adjustments_v3_interval_check check (
    dose_action <> 'extend_interval'
    or interval_min_hours is not null
    or interval_max_hours is not null
  )
);

create table if not exists public.dose_rule_products_v3 (
  binding_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  product_key text,
  match_method text not null,
  preferred boolean not null default false,
  conversion_enabled boolean not null default false,
  tablet_split_allowed boolean not null default false,
  rounding_increment_value numeric,
  rounding_increment_unit text,
  binding_status text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dose_rule_products_v3_unique_binding unique (rule_id, drug_id),
  constraint dose_rule_products_v3_status_check check (binding_status in ('candidate','verified','rejected','retired')),
  constraint dose_rule_products_v3_verified_check check (binding_status <> 'verified' or verified_at is not null),
  constraint dose_rule_products_v3_rounding_check check (rounding_increment_value is null or rounding_increment_value > 0)
);

create table if not exists public.dose_legacy_comparisons_v3 (
  comparison_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  legacy_regimen_id uuid,
  comparison_status text not null,
  conflicts jsonb not null default '[]'::jsonb,
  missing_fields text[] not null default '{}'::text[],
  compared_at timestamptz not null default now(),
  constraint dose_legacy_comparisons_v3_status_check check (comparison_status in ('exact','compatible','conflict','missing','not_applicable'))
);

create table if not exists public.dose_review_queue_v3 (
  review_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  priority integer not null,
  review_reason_codes text[] not null,
  review_status text not null default 'open',
  assigned_to uuid,
  decision text,
  decision_notes text,
  opened_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint dose_review_queue_v3_priority_check check (priority between 1 and 100),
  constraint dose_review_queue_v3_status_check check (review_status in ('open','in_review','resolved','rejected')),
  constraint dose_review_queue_v3_decision_check check (
    review_status not in ('resolved','rejected')
    or (decision is not null and decided_at is not null)
  )
);

create table if not exists public.dose_publication_events_v3 (
  event_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  from_status text,
  to_status text not null,
  gate_version text not null,
  gate_result jsonb not null,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint dose_publication_events_v3_to_status_check check (to_status in ('draft','in_review','verified','published','retired'))
);

-- Foreign-key and fast-path indexes.
create index if not exists dose_source_sections_v3_snapshot_idx on public.dose_source_sections_v3(snapshot_id);
create index if not exists dose_indication_terms_v3_indication_idx on public.dose_indication_terms_v3(indication_id);
create index if not exists dose_indication_terms_v3_snapshot_idx on public.dose_indication_terms_v3(source_snapshot_id);
create index if not exists dose_rules_v3_substance_idx on public.dose_rules_v3(substance_concept_id);
create index if not exists dose_rules_v3_indication_idx on public.dose_rules_v3(indication_id);
create index if not exists dose_rules_v3_source_snapshot_idx on public.dose_rules_v3(source_snapshot_id);
create index if not exists dose_rules_v3_published_lookup_idx
  on public.dose_rules_v3(substance_concept_id, indication_id, patient_group)
  where editorial_status = 'published';
create index if not exists dose_rule_products_v3_rule_idx on public.dose_rule_products_v3(rule_id);
create index if not exists dose_rule_products_v3_drug_idx on public.dose_rule_products_v3(drug_id);
create index if not exists dose_rule_products_v3_verified_drug_idx
  on public.dose_rule_products_v3(drug_id, rule_id)
  where binding_status = 'verified';
create index if not exists dose_legacy_comparisons_v3_rule_idx on public.dose_legacy_comparisons_v3(rule_id);
create index if not exists dose_review_queue_v3_rule_idx on public.dose_review_queue_v3(rule_id);
create index if not exists dose_review_queue_v3_open_idx
  on public.dose_review_queue_v3(priority desc, opened_at)
  where review_status in ('open','in_review');
create index if not exists dose_publication_events_v3_rule_idx on public.dose_publication_events_v3(rule_id, created_at desc);

-- RLS: every V3 table in public is explicitly protected.
alter table public.dose_source_snapshots_v3 enable row level security;
alter table public.dose_source_sections_v3 enable row level security;
alter table public.dose_indication_concepts_v3 enable row level security;
alter table public.dose_indication_terms_v3 enable row level security;
alter table public.dose_rules_v3 enable row level security;
alter table public.dose_rule_products_v3 enable row level security;
alter table public.dose_legacy_comparisons_v3 enable row level security;
alter table public.dose_review_queue_v3 enable row level security;
alter table public.dose_publication_events_v3 enable row level security;

-- Fail closed first: no implicit client access.
revoke all privileges on table
  public.dose_source_snapshots_v3,
  public.dose_source_sections_v3,
  public.dose_indication_concepts_v3,
  public.dose_indication_terms_v3,
  public.dose_rules_v3,
  public.dose_rule_products_v3,
  public.dose_legacy_comparisons_v3,
  public.dose_review_queue_v3,
  public.dose_publication_events_v3
from anon, authenticated;

-- Published-read tables: SELECT only, filtered by RLS.
grant select on table public.dose_indication_concepts_v3 to anon, authenticated;
grant select on table public.dose_rules_v3 to anon, authenticated;
grant select on table public.dose_rule_products_v3 to anon, authenticated;

drop policy if exists dose_indication_concepts_v3_published_read on public.dose_indication_concepts_v3;
create policy dose_indication_concepts_v3_published_read
  on public.dose_indication_concepts_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rules_v3_published_read on public.dose_rules_v3;
create policy dose_rules_v3_published_read
  on public.dose_rules_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rule_products_v3_published_read on public.dose_rule_products_v3;
create policy dose_rule_products_v3_published_read
  on public.dose_rule_products_v3
  for select to anon, authenticated
  using (
    binding_status = 'verified'
    and exists (
      select 1
      from public.dose_rules_v3 r
      where r.rule_id = dose_rule_products_v3.rule_id
        and r.editorial_status = 'published'
    )
  );

-- service_role remains able to manage shadow V3 through its elevated server-side role.
comment on table public.dose_rules_v3 is
  'DRx Dosierung V3 shadow rules. Fail-closed; do not cut over runtime until review/binding/safety/API parity gates pass.';

      and (s.document_version is not null or s.document_date is not null)
      and r.verified_by is not null
      and r.verified_at is not null
  ),
  rules_json as (
    select jsonb_agg(
      jsonb_build_object(
        'ruleId', r.rule_id,
        'ruleKey', r.rule_key,
        'indicationId', r.indication_id,
        'indicationKey', r.indication_key,
        'indicationName', r.indication_name,
        'patientGroup', r.patient_group,
        'calculationMethod', r.calculation_method,
        'doseMinValue', r.dose_min_value,
        'doseMaxValue', r.dose_max_value,
        'doseUnit', r.dose_unit,
        'doseBasis', r.dose_basis,
        'weightBasis', r.weight_basis,
        'frequencyMode', r.frequency_mode,
        'intervalMinHours', r.interval_min_hours,
        'intervalMaxHours', r.interval_max_hours,
        'timesPerDay', r.times_per_day,
        'timesPerDayMin', r.times_per_day_min,
        'timesPerDayMax', r.times_per_day_max,
        'maxSingleDoseMg', r.max_single_dose_mg,
        'maxDailyDoseMg', r.max_daily_dose_mg,
        'maxDoses24h', r.max_doses_24h,
        'durationMode', r.duration_mode,
        'durationMinDays', r.duration_min_days,
        'durationMaxDays', r.duration_max_days,
        'reviewAfterDays', r.review_after_days,
        'minAgeMonths', r.min_age_months,
        'maxAgeMonths', r.max_age_months,
        'minWeightKg', r.min_weight_kg,
        'maxWeightKg', r.max_weight_kg,
        'route', r.route,
        'pharmaceuticalForm', r.pharmaceutical_form,
        'prn', r.prn,
        'renalAdjustmentRequired', r.renal_adjustment_required,
        'hepaticAdjustmentRequired', r.hepatic_adjustment_required,
        'cardiacAdjustmentRequired', r.cardiac_adjustment_required,
        'specialistOnly', r.specialist_only,
        'outOfRangeAction', r.out_of_range_action,
        'requiredInputs', r.required_inputs,
        'versionNo', r.version_no,
        'preferred', r.preferred,
        'conversion', jsonb_build_object(
          'enabled', r.conversion_enabled,
          'tabletSplitAllowed', r.tablet_split_allowed,
          'roundingIncrementValue', r.rounding_increment_value,
          'roundingIncrementUnit', r.rounding_increment_unit,
          'status', r.binding_status
        ),
        'source', jsonb_build_object(
          'sourceKey', r.source_key,
          'snapshotId', r.source_snapshot_id,
          'section', r.source_section,
          'evidenceHash', r.source_evidence_hash,
          'documentVersion', r.document_version,
          'documentDate', r.document_date,
          'official', true
        )
      )
      order by r.indication_name, r.rule_key
    ) as rules
    from rule_rows r
  )
  select case
    when p.product_key is null or coalesce(jsonb_array_length(r.rules), 0) = 0 then null
    else jsonb_build_object(
      'schemaVersion', 'dose-product-fast-path-v3',
      'product', jsonb_build_object(
        'productKey', p.product_key,
        'drugId', p.drug_id,
        'registryNumber', p.registry_number,
        'pdid', p.pdid,
        'tradeName', p.trade_name,
        'activeSubstance', p.active_substance,
        'atcCode', p.atc_code,
        'pharmaceuticalForm', p.pharmaceutical_form,
        'route', p.route,
        'patientGroup', p.patient_group,
        'numeratorValue', p.numerator_value,
        'numeratorUnit', p.numerator_unit,
        'denominatorValue', p.denominator_value,
        'denominatorUnit', p.denominator_unit,
        'tabletSplitDenominator', p.tablet_split_denominator,
        'isScored', p.is_scored,
        'measurableIncrementMl', p.measurable_increment_ml,
        'roundingMode', p.rounding_mode,
        'versionNo', p.version_no,
        'rules', r.rules
      ),
      'meta', jsonb_build_object(
        'dataSource', 'supabase-v3-rpc',
        'failClosed', true,
        'publishedOnly', true,
        'officialVerifiedOnly', true,
        'dbReads', 1,
        'runtimeModel', 'v3-rpc'
      )
    )
  end
  from product_row p
  cross join rules_json r
$;

revoke all on function public.medindex_dose_product_fast_path_v3(text, uuid) from public;
grant execute on function public.medindex_dose_product_fast_path_v3(text, uuid) to anon, authenticated;

-- service_role remains able to manage shadow V3 through its elevated server-side role.
comment on table public.dose_rules_v3 is
  'DRx Dosierung V3 shadow rules. Fail-closed; do not cut over runtime until review/binding/safety/API parity gates pass.';
),
  constraint dose_renal_adjustments_v3_range_check check (min_value is null or max_value is null or min_value <= max_value),
  constraint dose_renal_adjustments_v3_review_check
    check (review_status in ('draft','in_review','verified','rejected','retired')),
  constraint dose_renal_adjustments_v3_verified_provenance_check check (
    review_status <> 'verified'
    or (
      source_snapshot_id is not null
      and source_evidence_hash ~ '^[0-9a-f]{64}
  binding_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  product_key text,
  match_method text not null,
  preferred boolean not null default false,
  conversion_enabled boolean not null default false,
  tablet_split_allowed boolean not null default false,
  rounding_increment_value numeric,
  rounding_increment_unit text,
  binding_status text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dose_rule_products_v3_unique_binding unique (rule_id, drug_id),
  constraint dose_rule_products_v3_status_check check (binding_status in ('candidate','verified','rejected','retired')),
  constraint dose_rule_products_v3_verified_check check (binding_status <> 'verified' or verified_at is not null),
  constraint dose_rule_products_v3_rounding_check check (rounding_increment_value is null or rounding_increment_value > 0)
);

create table if not exists public.dose_legacy_comparisons_v3 (
  comparison_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  legacy_regimen_id uuid,
  comparison_status text not null,
  conflicts jsonb not null default '[]'::jsonb,
  missing_fields text[] not null default '{}'::text[],
  compared_at timestamptz not null default now(),
  constraint dose_legacy_comparisons_v3_status_check check (comparison_status in ('exact','compatible','conflict','missing','not_applicable'))
);

create table if not exists public.dose_review_queue_v3 (
  review_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  priority integer not null,
  review_reason_codes text[] not null,
  review_status text not null default 'open',
  assigned_to uuid,
  decision text,
  decision_notes text,
  opened_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint dose_review_queue_v3_priority_check check (priority between 1 and 100),
  constraint dose_review_queue_v3_status_check check (review_status in ('open','in_review','resolved','rejected')),
  constraint dose_review_queue_v3_decision_check check (
    review_status not in ('resolved','rejected')
    or (decision is not null and decided_at is not null)
  )
);

create table if not exists public.dose_publication_events_v3 (
  event_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  from_status text,
  to_status text not null,
  gate_version text not null,
  gate_result jsonb not null,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint dose_publication_events_v3_to_status_check check (to_status in ('draft','in_review','verified','published','retired'))
);

-- Foreign-key and fast-path indexes.
create index if not exists dose_source_sections_v3_snapshot_idx on public.dose_source_sections_v3(snapshot_id);
create index if not exists dose_indication_terms_v3_indication_idx on public.dose_indication_terms_v3(indication_id);
create index if not exists dose_indication_terms_v3_snapshot_idx on public.dose_indication_terms_v3(source_snapshot_id);
create index if not exists dose_rules_v3_substance_idx on public.dose_rules_v3(substance_concept_id);
create index if not exists dose_rules_v3_indication_idx on public.dose_rules_v3(indication_id);
create index if not exists dose_rules_v3_source_snapshot_idx on public.dose_rules_v3(source_snapshot_id);
create index if not exists dose_rules_v3_published_lookup_idx
  on public.dose_rules_v3(substance_concept_id, indication_id, patient_group)
  where editorial_status = 'published';
create index if not exists dose_rule_products_v3_rule_idx on public.dose_rule_products_v3(rule_id);
create index if not exists dose_rule_products_v3_drug_idx on public.dose_rule_products_v3(drug_id);
create index if not exists dose_rule_products_v3_verified_drug_idx
  on public.dose_rule_products_v3(drug_id, rule_id)
  where binding_status = 'verified';
create index if not exists dose_legacy_comparisons_v3_rule_idx on public.dose_legacy_comparisons_v3(rule_id);
create index if not exists dose_review_queue_v3_rule_idx on public.dose_review_queue_v3(rule_id);
create index if not exists dose_review_queue_v3_open_idx
  on public.dose_review_queue_v3(priority desc, opened_at)
  where review_status in ('open','in_review');
create index if not exists dose_publication_events_v3_rule_idx on public.dose_publication_events_v3(rule_id, created_at desc);

-- RLS: every V3 table in public is explicitly protected.
alter table public.dose_source_snapshots_v3 enable row level security;
alter table public.dose_source_sections_v3 enable row level security;
alter table public.dose_indication_concepts_v3 enable row level security;
alter table public.dose_indication_terms_v3 enable row level security;
alter table public.dose_rules_v3 enable row level security;
alter table public.dose_rule_products_v3 enable row level security;
alter table public.dose_legacy_comparisons_v3 enable row level security;
alter table public.dose_review_queue_v3 enable row level security;
alter table public.dose_publication_events_v3 enable row level security;

-- Fail closed first: no implicit client access.
revoke all privileges on table
  public.dose_source_snapshots_v3,
  public.dose_source_sections_v3,
  public.dose_indication_concepts_v3,
  public.dose_indication_terms_v3,
  public.dose_rules_v3,
  public.dose_rule_products_v3,
  public.dose_legacy_comparisons_v3,
  public.dose_review_queue_v3,
  public.dose_publication_events_v3
from anon, authenticated;

-- Published-read tables: SELECT only, filtered by RLS.
grant select on table public.dose_indication_concepts_v3 to anon, authenticated;
grant select on table public.dose_rules_v3 to anon, authenticated;
grant select on table public.dose_rule_products_v3 to anon, authenticated;

drop policy if exists dose_indication_concepts_v3_published_read on public.dose_indication_concepts_v3;
create policy dose_indication_concepts_v3_published_read
  on public.dose_indication_concepts_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rules_v3_published_read on public.dose_rules_v3;
create policy dose_rules_v3_published_read
  on public.dose_rules_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rule_products_v3_published_read on public.dose_rule_products_v3;
create policy dose_rule_products_v3_published_read
  on public.dose_rule_products_v3
  for select to anon, authenticated
  using (
    binding_status = 'verified'
    and exists (
      select 1
      from public.dose_rules_v3 r
      where r.rule_id = dose_rule_products_v3.rule_id
        and r.editorial_status = 'published'
    )
  );

-- service_role remains able to manage shadow V3 through its elevated server-side role.
comment on table public.dose_rules_v3 is
  'DRx Dosierung V3 shadow rules. Fail-closed; do not cut over runtime until review/binding/safety/API parity gates pass.';

      and verified_by is not null
      and btrim(verified_by) <> ''
      and verified_at is not null
    )
  ),
  constraint dose_renal_adjustments_v3_reduction_check check (
    dose_action <> 'reduce_dose'
    or (
      (dose_factor is not null and dose_factor > 0 and dose_factor < 1)
      or replacement_dose_min is not null
      or replacement_dose_max is not null
    )
  ),
  constraint dose_renal_adjustments_v3_interval_check check (
    dose_action <> 'extend_interval'
    or interval_min_hours is not null
    or interval_max_hours is not null
  )
);

create table if not exists public.dose_hepatic_adjustments_v3 (
  adjustment_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  measure_type text not null,
  severity_or_class text[] not null,
  dose_action text not null,
  dose_factor numeric,
  replacement_dose_min numeric,
  replacement_dose_max numeric,
  interval_min_hours numeric,
  interval_max_hours numeric,
  source_key text not null,
  source_snapshot_id text not null references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  source_section text not null default '4.2',
  source_evidence_hash text not null,
  review_status text not null default 'draft',
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dose_hepatic_adjustments_v3_measure_check
    check (measure_type in ('Child_Pugh_class','hepatic_impairment_textual')),
  constraint dose_hepatic_adjustments_v3_action_check
    check (dose_action in ('no_adjustment','reduce_dose','extend_interval','avoid','contraindicated','specialist_review')),
  constraint dose_hepatic_adjustments_v3_class_check check (cardinality(severity_or_class) >= 1),
  constraint dose_hepatic_adjustments_v3_section_check check (source_section = '4.2'),
  constraint dose_hepatic_adjustments_v3_source_hash_check check (source_evidence_hash ~ '^[0-9a-f]{64}
  binding_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  product_key text,
  match_method text not null,
  preferred boolean not null default false,
  conversion_enabled boolean not null default false,
  tablet_split_allowed boolean not null default false,
  rounding_increment_value numeric,
  rounding_increment_unit text,
  binding_status text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dose_rule_products_v3_unique_binding unique (rule_id, drug_id),
  constraint dose_rule_products_v3_status_check check (binding_status in ('candidate','verified','rejected','retired')),
  constraint dose_rule_products_v3_verified_check check (binding_status <> 'verified' or verified_at is not null),
  constraint dose_rule_products_v3_rounding_check check (rounding_increment_value is null or rounding_increment_value > 0)
);

create table if not exists public.dose_legacy_comparisons_v3 (
  comparison_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  legacy_regimen_id uuid,
  comparison_status text not null,
  conflicts jsonb not null default '[]'::jsonb,
  missing_fields text[] not null default '{}'::text[],
  compared_at timestamptz not null default now(),
  constraint dose_legacy_comparisons_v3_status_check check (comparison_status in ('exact','compatible','conflict','missing','not_applicable'))
);

create table if not exists public.dose_review_queue_v3 (
  review_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  priority integer not null,
  review_reason_codes text[] not null,
  review_status text not null default 'open',
  assigned_to uuid,
  decision text,
  decision_notes text,
  opened_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint dose_review_queue_v3_priority_check check (priority between 1 and 100),
  constraint dose_review_queue_v3_status_check check (review_status in ('open','in_review','resolved','rejected')),
  constraint dose_review_queue_v3_decision_check check (
    review_status not in ('resolved','rejected')
    or (decision is not null and decided_at is not null)
  )
);

create table if not exists public.dose_publication_events_v3 (
  event_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  from_status text,
  to_status text not null,
  gate_version text not null,
  gate_result jsonb not null,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint dose_publication_events_v3_to_status_check check (to_status in ('draft','in_review','verified','published','retired'))
);

-- Foreign-key and fast-path indexes.
create index if not exists dose_source_sections_v3_snapshot_idx on public.dose_source_sections_v3(snapshot_id);
create index if not exists dose_indication_terms_v3_indication_idx on public.dose_indication_terms_v3(indication_id);
create index if not exists dose_indication_terms_v3_snapshot_idx on public.dose_indication_terms_v3(source_snapshot_id);
create index if not exists dose_rules_v3_substance_idx on public.dose_rules_v3(substance_concept_id);
create index if not exists dose_rules_v3_indication_idx on public.dose_rules_v3(indication_id);
create index if not exists dose_rules_v3_source_snapshot_idx on public.dose_rules_v3(source_snapshot_id);
create index if not exists dose_rules_v3_published_lookup_idx
  on public.dose_rules_v3(substance_concept_id, indication_id, patient_group)
  where editorial_status = 'published';
create index if not exists dose_rule_products_v3_rule_idx on public.dose_rule_products_v3(rule_id);
create index if not exists dose_rule_products_v3_drug_idx on public.dose_rule_products_v3(drug_id);
create index if not exists dose_rule_products_v3_verified_drug_idx
  on public.dose_rule_products_v3(drug_id, rule_id)
  where binding_status = 'verified';
create index if not exists dose_legacy_comparisons_v3_rule_idx on public.dose_legacy_comparisons_v3(rule_id);
create index if not exists dose_review_queue_v3_rule_idx on public.dose_review_queue_v3(rule_id);
create index if not exists dose_review_queue_v3_open_idx
  on public.dose_review_queue_v3(priority desc, opened_at)
  where review_status in ('open','in_review');
create index if not exists dose_publication_events_v3_rule_idx on public.dose_publication_events_v3(rule_id, created_at desc);

-- RLS: every V3 table in public is explicitly protected.
alter table public.dose_source_snapshots_v3 enable row level security;
alter table public.dose_source_sections_v3 enable row level security;
alter table public.dose_indication_concepts_v3 enable row level security;
alter table public.dose_indication_terms_v3 enable row level security;
alter table public.dose_rules_v3 enable row level security;
alter table public.dose_rule_products_v3 enable row level security;
alter table public.dose_legacy_comparisons_v3 enable row level security;
alter table public.dose_review_queue_v3 enable row level security;
alter table public.dose_publication_events_v3 enable row level security;

-- Fail closed first: no implicit client access.
revoke all privileges on table
  public.dose_source_snapshots_v3,
  public.dose_source_sections_v3,
  public.dose_indication_concepts_v3,
  public.dose_indication_terms_v3,
  public.dose_rules_v3,
  public.dose_rule_products_v3,
  public.dose_legacy_comparisons_v3,
  public.dose_review_queue_v3,
  public.dose_publication_events_v3
from anon, authenticated;

-- Published-read tables: SELECT only, filtered by RLS.
grant select on table public.dose_indication_concepts_v3 to anon, authenticated;
grant select on table public.dose_rules_v3 to anon, authenticated;
grant select on table public.dose_rule_products_v3 to anon, authenticated;

drop policy if exists dose_indication_concepts_v3_published_read on public.dose_indication_concepts_v3;
create policy dose_indication_concepts_v3_published_read
  on public.dose_indication_concepts_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rules_v3_published_read on public.dose_rules_v3;
create policy dose_rules_v3_published_read
  on public.dose_rules_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rule_products_v3_published_read on public.dose_rule_products_v3;
create policy dose_rule_products_v3_published_read
  on public.dose_rule_products_v3
  for select to anon, authenticated
  using (
    binding_status = 'verified'
    and exists (
      select 1
      from public.dose_rules_v3 r
      where r.rule_id = dose_rule_products_v3.rule_id
        and r.editorial_status = 'published'
    )
  );

-- service_role remains able to manage shadow V3 through its elevated server-side role.
comment on table public.dose_rules_v3 is
  'DRx Dosierung V3 shadow rules. Fail-closed; do not cut over runtime until review/binding/safety/API parity gates pass.';
),
  constraint dose_hepatic_adjustments_v3_review_check
    check (review_status in ('draft','in_review','verified','rejected','retired')),
  constraint dose_hepatic_adjustments_v3_verified_provenance_check check (
    review_status <> 'verified'
    or (
      source_snapshot_id is not null
      and source_evidence_hash ~ '^[0-9a-f]{64}
  binding_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  product_key text,
  match_method text not null,
  preferred boolean not null default false,
  conversion_enabled boolean not null default false,
  tablet_split_allowed boolean not null default false,
  rounding_increment_value numeric,
  rounding_increment_unit text,
  binding_status text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dose_rule_products_v3_unique_binding unique (rule_id, drug_id),
  constraint dose_rule_products_v3_status_check check (binding_status in ('candidate','verified','rejected','retired')),
  constraint dose_rule_products_v3_verified_check check (binding_status <> 'verified' or verified_at is not null),
  constraint dose_rule_products_v3_rounding_check check (rounding_increment_value is null or rounding_increment_value > 0)
);

create table if not exists public.dose_legacy_comparisons_v3 (
  comparison_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  legacy_regimen_id uuid,
  comparison_status text not null,
  conflicts jsonb not null default '[]'::jsonb,
  missing_fields text[] not null default '{}'::text[],
  compared_at timestamptz not null default now(),
  constraint dose_legacy_comparisons_v3_status_check check (comparison_status in ('exact','compatible','conflict','missing','not_applicable'))
);

create table if not exists public.dose_review_queue_v3 (
  review_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  priority integer not null,
  review_reason_codes text[] not null,
  review_status text not null default 'open',
  assigned_to uuid,
  decision text,
  decision_notes text,
  opened_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint dose_review_queue_v3_priority_check check (priority between 1 and 100),
  constraint dose_review_queue_v3_status_check check (review_status in ('open','in_review','resolved','rejected')),
  constraint dose_review_queue_v3_decision_check check (
    review_status not in ('resolved','rejected')
    or (decision is not null and decided_at is not null)
  )
);

create table if not exists public.dose_publication_events_v3 (
  event_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  from_status text,
  to_status text not null,
  gate_version text not null,
  gate_result jsonb not null,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint dose_publication_events_v3_to_status_check check (to_status in ('draft','in_review','verified','published','retired'))
);

-- Foreign-key and fast-path indexes.
create index if not exists dose_source_sections_v3_snapshot_idx on public.dose_source_sections_v3(snapshot_id);
create index if not exists dose_indication_terms_v3_indication_idx on public.dose_indication_terms_v3(indication_id);
create index if not exists dose_indication_terms_v3_snapshot_idx on public.dose_indication_terms_v3(source_snapshot_id);
create index if not exists dose_rules_v3_substance_idx on public.dose_rules_v3(substance_concept_id);
create index if not exists dose_rules_v3_indication_idx on public.dose_rules_v3(indication_id);
create index if not exists dose_rules_v3_source_snapshot_idx on public.dose_rules_v3(source_snapshot_id);
create index if not exists dose_rules_v3_published_lookup_idx
  on public.dose_rules_v3(substance_concept_id, indication_id, patient_group)
  where editorial_status = 'published';
create index if not exists dose_rule_products_v3_rule_idx on public.dose_rule_products_v3(rule_id);
create index if not exists dose_rule_products_v3_drug_idx on public.dose_rule_products_v3(drug_id);
create index if not exists dose_rule_products_v3_verified_drug_idx
  on public.dose_rule_products_v3(drug_id, rule_id)
  where binding_status = 'verified';
create index if not exists dose_legacy_comparisons_v3_rule_idx on public.dose_legacy_comparisons_v3(rule_id);
create index if not exists dose_review_queue_v3_rule_idx on public.dose_review_queue_v3(rule_id);
create index if not exists dose_review_queue_v3_open_idx
  on public.dose_review_queue_v3(priority desc, opened_at)
  where review_status in ('open','in_review');
create index if not exists dose_publication_events_v3_rule_idx on public.dose_publication_events_v3(rule_id, created_at desc);

-- RLS: every V3 table in public is explicitly protected.
alter table public.dose_source_snapshots_v3 enable row level security;
alter table public.dose_source_sections_v3 enable row level security;
alter table public.dose_indication_concepts_v3 enable row level security;
alter table public.dose_indication_terms_v3 enable row level security;
alter table public.dose_rules_v3 enable row level security;
alter table public.dose_rule_products_v3 enable row level security;
alter table public.dose_legacy_comparisons_v3 enable row level security;
alter table public.dose_review_queue_v3 enable row level security;
alter table public.dose_publication_events_v3 enable row level security;

-- Fail closed first: no implicit client access.
revoke all privileges on table
  public.dose_source_snapshots_v3,
  public.dose_source_sections_v3,
  public.dose_indication_concepts_v3,
  public.dose_indication_terms_v3,
  public.dose_rules_v3,
  public.dose_rule_products_v3,
  public.dose_legacy_comparisons_v3,
  public.dose_review_queue_v3,
  public.dose_publication_events_v3
from anon, authenticated;

-- Published-read tables: SELECT only, filtered by RLS.
grant select on table public.dose_indication_concepts_v3 to anon, authenticated;
grant select on table public.dose_rules_v3 to anon, authenticated;
grant select on table public.dose_rule_products_v3 to anon, authenticated;

drop policy if exists dose_indication_concepts_v3_published_read on public.dose_indication_concepts_v3;
create policy dose_indication_concepts_v3_published_read
  on public.dose_indication_concepts_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rules_v3_published_read on public.dose_rules_v3;
create policy dose_rules_v3_published_read
  on public.dose_rules_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rule_products_v3_published_read on public.dose_rule_products_v3;
create policy dose_rule_products_v3_published_read
  on public.dose_rule_products_v3
  for select to anon, authenticated
  using (
    binding_status = 'verified'
    and exists (
      select 1
      from public.dose_rules_v3 r
      where r.rule_id = dose_rule_products_v3.rule_id
        and r.editorial_status = 'published'
    )
  );

-- service_role remains able to manage shadow V3 through its elevated server-side role.
comment on table public.dose_rules_v3 is
  'DRx Dosierung V3 shadow rules. Fail-closed; do not cut over runtime until review/binding/safety/API parity gates pass.';

      and verified_by is not null
      and btrim(verified_by) <> ''
      and verified_at is not null
    )
  ),
  constraint dose_hepatic_adjustments_v3_reduction_check check (
    dose_action <> 'reduce_dose'
    or (
      (dose_factor is not null and dose_factor > 0 and dose_factor < 1)
      or replacement_dose_min is not null
      or replacement_dose_max is not null
    )
  ),
  constraint dose_hepatic_adjustments_v3_interval_check check (
    dose_action <> 'extend_interval'
    or interval_min_hours is not null
    or interval_max_hours is not null
  )
);

create table if not exists public.dose_rule_products_v3 (
  binding_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  product_key text,
  match_method text not null,
  preferred boolean not null default false,
  conversion_enabled boolean not null default false,
  tablet_split_allowed boolean not null default false,
  rounding_increment_value numeric,
  rounding_increment_unit text,
  binding_status text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dose_rule_products_v3_unique_binding unique (rule_id, drug_id),
  constraint dose_rule_products_v3_status_check check (binding_status in ('candidate','verified','rejected','retired')),
  constraint dose_rule_products_v3_verified_check check (binding_status <> 'verified' or verified_at is not null),
  constraint dose_rule_products_v3_rounding_check check (rounding_increment_value is null or rounding_increment_value > 0)
);

create table if not exists public.dose_legacy_comparisons_v3 (
  comparison_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  legacy_regimen_id uuid,
  comparison_status text not null,
  conflicts jsonb not null default '[]'::jsonb,
  missing_fields text[] not null default '{}'::text[],
  compared_at timestamptz not null default now(),
  constraint dose_legacy_comparisons_v3_status_check check (comparison_status in ('exact','compatible','conflict','missing','not_applicable'))
);

create table if not exists public.dose_review_queue_v3 (
  review_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  priority integer not null,
  review_reason_codes text[] not null,
  review_status text not null default 'open',
  assigned_to uuid,
  decision text,
  decision_notes text,
  opened_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint dose_review_queue_v3_priority_check check (priority between 1 and 100),
  constraint dose_review_queue_v3_status_check check (review_status in ('open','in_review','resolved','rejected')),
  constraint dose_review_queue_v3_decision_check check (
    review_status not in ('resolved','rejected')
    or (decision is not null and decided_at is not null)
  )
);

create table if not exists public.dose_publication_events_v3 (
  event_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  drug_id uuid references public.drugs(id) on delete restrict,
  from_status text,
  to_status text not null,
  gate_version text not null,
  gate_result jsonb not null,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint dose_publication_events_v3_to_status_check check (to_status in ('draft','in_review','verified','published','retired'))
);

-- Foreign-key and fast-path indexes.
create index if not exists dose_source_sections_v3_snapshot_idx on public.dose_source_sections_v3(snapshot_id);
create index if not exists dose_indication_terms_v3_indication_idx on public.dose_indication_terms_v3(indication_id);
create index if not exists dose_indication_terms_v3_snapshot_idx on public.dose_indication_terms_v3(source_snapshot_id);
create index if not exists dose_rules_v3_substance_idx on public.dose_rules_v3(substance_concept_id);
create index if not exists dose_rules_v3_indication_idx on public.dose_rules_v3(indication_id);
create index if not exists dose_rules_v3_source_snapshot_idx on public.dose_rules_v3(source_snapshot_id);
create index if not exists dose_rules_v3_published_lookup_idx
  on public.dose_rules_v3(substance_concept_id, indication_id, patient_group)
  where editorial_status = 'published';
create index if not exists dose_rule_products_v3_rule_idx on public.dose_rule_products_v3(rule_id);
create index if not exists dose_rule_products_v3_drug_idx on public.dose_rule_products_v3(drug_id);
create index if not exists dose_rule_products_v3_verified_drug_idx
  on public.dose_rule_products_v3(drug_id, rule_id)
  where binding_status = 'verified';
create index if not exists dose_legacy_comparisons_v3_rule_idx on public.dose_legacy_comparisons_v3(rule_id);
create index if not exists dose_review_queue_v3_rule_idx on public.dose_review_queue_v3(rule_id);
create index if not exists dose_review_queue_v3_open_idx
  on public.dose_review_queue_v3(priority desc, opened_at)
  where review_status in ('open','in_review');
create index if not exists dose_publication_events_v3_rule_idx on public.dose_publication_events_v3(rule_id, created_at desc);

-- RLS: every V3 table in public is explicitly protected.
alter table public.dose_source_snapshots_v3 enable row level security;
alter table public.dose_source_sections_v3 enable row level security;
alter table public.dose_indication_concepts_v3 enable row level security;
alter table public.dose_indication_terms_v3 enable row level security;
alter table public.dose_rules_v3 enable row level security;
alter table public.dose_rule_products_v3 enable row level security;
alter table public.dose_legacy_comparisons_v3 enable row level security;
alter table public.dose_review_queue_v3 enable row level security;
alter table public.dose_publication_events_v3 enable row level security;

-- Fail closed first: no implicit client access.
revoke all privileges on table
  public.dose_source_snapshots_v3,
  public.dose_source_sections_v3,
  public.dose_indication_concepts_v3,
  public.dose_indication_terms_v3,
  public.dose_rules_v3,
  public.dose_rule_products_v3,
  public.dose_legacy_comparisons_v3,
  public.dose_review_queue_v3,
  public.dose_publication_events_v3
from anon, authenticated;

-- Published-read tables: SELECT only, filtered by RLS.
grant select on table public.dose_indication_concepts_v3 to anon, authenticated;
grant select on table public.dose_rules_v3 to anon, authenticated;
grant select on table public.dose_rule_products_v3 to anon, authenticated;

drop policy if exists dose_indication_concepts_v3_published_read on public.dose_indication_concepts_v3;
create policy dose_indication_concepts_v3_published_read
  on public.dose_indication_concepts_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rules_v3_published_read on public.dose_rules_v3;
create policy dose_rules_v3_published_read
  on public.dose_rules_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rule_products_v3_published_read on public.dose_rule_products_v3;
create policy dose_rule_products_v3_published_read
  on public.dose_rule_products_v3
  for select to anon, authenticated
  using (
    binding_status = 'verified'
    and exists (
      select 1
      from public.dose_rules_v3 r
      where r.rule_id = dose_rule_products_v3.rule_id
        and r.editorial_status = 'published'
    )
  );

-- service_role remains able to manage shadow V3 through its elevated server-side role.
comment on table public.dose_rules_v3 is
  'DRx Dosierung V3 shadow rules. Fail-closed; do not cut over runtime until review/binding/safety/API parity gates pass.';
