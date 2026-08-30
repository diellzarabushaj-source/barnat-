-- DRx Dosierung V3 additive shadow schema
-- STATUS: NOT_APPLIED
-- This file is intentionally additive and fail-closed.
-- It does not DROP/ALTER dose_rules_v2, dose_products_v2, dosage_regimens or other legacy dosage tables.
-- Apply only after live Supabase baseline verification, then run security/performance advisors and smoke tests.

create schema if not exists private;
revoke all on schema private from public;

-- One-shot shadow-schema preflight: never silently inherit a partial/stale V3.
do $preflight$
declare
  existing_v3_tables integer;
begin
  select count(*)::integer
    into existing_v3_tables
  from unnest(array[
    'public.dose_source_snapshots_v3',
    'public.dose_source_sections_v3',
    'public.dose_indication_concepts_v3',
    'public.dose_indication_terms_v3',
    'public.dose_products_v3',
    'public.dose_rules_v3',
    'public.dose_renal_adjustments_v3',
    'public.dose_hepatic_adjustments_v3',
    'public.dose_rule_products_v3',
    'public.dose_legacy_comparisons_v3',
    'public.dose_review_queue_v3',
    'public.dose_publication_events_v3'
  ]) as expected_table(regclass_name)
  where to_regclass(expected_table.regclass_name) is not null;

  if existing_v3_tables <> 0 then
    raise exception 'DRX_V3_PREEXISTING_SHADOW_SCHEMA: % expected V3 tables already exist; audit/rollback before applying candidate',
      existing_v3_tables;
  end if;
end
$preflight$;

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
    check (content_length is null or content_length >= 0),
  constraint dose_source_snapshots_v3_version_check
    check (document_version is not null or document_date is not null),
  constraint dose_source_snapshots_v3_source_key_check
    check (btrim(source_key) <> ''),
  constraint dose_source_snapshots_v3_authority_check
    check (btrim(authority) <> ''),
  constraint dose_source_snapshots_v3_https_check
    check (source_url ~ '^https://' and final_url ~ '^https://'),
  constraint dose_source_snapshots_v3_tier_check
    check (source_tier in (
      'EMA','EMC','FACHINFO_DE','AEMPS_CIMA','EU_NATIONAL',
      'KOSOVO_AKPPM','NON_EU_REGULATOR','MEDIATELY','FALLBACK'
    ))
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
    check (section_code ~ '^4\.[1-9]$'),
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
  constraint dose_indication_concepts_v3_key_check check (btrim(indication_key) <> ''),
  constraint dose_indication_concepts_v3_name_check check (btrim(canonical_name) <> ''),
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
  constraint dose_indication_terms_v3_term_check check (btrim(term) <> ''),
  constraint dose_indication_terms_v3_type_check
    check (term_type in ('source_exact','reviewed_alias','canonical','translation'))
);

create table if not exists public.dose_products_v3 (
  product_id uuid primary key default gen_random_uuid(),
  drug_id uuid not null unique references public.drugs(id) on delete restrict,
  product_key text not null unique,
  registry_number text,
  pdid text,
  trade_name text not null,
  active_substance text not null,
  atc_code text,
  pharmaceutical_form text,
  route text,
  patient_group text not null,
  numerator_value numeric,
  numerator_unit text,
  denominator_value numeric,
  denominator_unit text,
  tablet_split_denominator numeric not null default 1,
  is_scored boolean not null default false,
  measurable_increment_ml numeric,
  rounding_mode text not null default 'exact',
  source_key text not null,
  source_snapshot_id text not null references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  source_evidence_hash text not null,
  source_document_version text,
  source_document_date date,
  editorial_status text not null default 'draft',
  verified_by text,
  verified_at timestamptz,
  version_no integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dose_products_v3_key_check check (btrim(product_key) <> ''),
  constraint dose_products_v3_name_check check (btrim(trade_name) <> ''),
  constraint dose_products_v3_patient_group_check
    check (patient_group in ('adult_only','pediatric_only','pediatric_and_adult','age_band','manual_review')),
  constraint dose_products_v3_source_hash_check
    check (source_evidence_hash ~ '^[0-9a-f]{64}$'),
  constraint dose_products_v3_source_identity_check
    check (source_snapshot_id = source_evidence_hash),
  constraint dose_products_v3_version_check check (version_no >= 1),
  constraint dose_products_v3_strength_check check (
    (numerator_value is null and denominator_value is null)
    or (numerator_value > 0 and denominator_value > 0 and numerator_unit is not null and denominator_unit is not null)
  ),
  constraint dose_products_v3_split_check check (tablet_split_denominator > 0),
  constraint dose_products_v3_increment_check check (measurable_increment_ml is null or measurable_increment_ml > 0),
  constraint dose_products_v3_rounding_check
    check (rounding_mode in ('exact','nearest','floor','ceiling','manual')),
  constraint dose_products_v3_editorial_check
    check (editorial_status in ('draft','in_review','verified','published','retired')),
  constraint dose_products_v3_verified_provenance_check check (
    editorial_status not in ('verified','published')
    or (
      source_snapshot_id ~ '^[0-9a-f]{64}$'
      and source_evidence_hash ~ '^[0-9a-f]{64}$'
      and source_snapshot_id = source_evidence_hash
      and (source_document_version is not null or source_document_date is not null)
      and verified_by is not null
      and btrim(verified_by) <> ''
      and verified_at is not null
    )
  )
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
  source_section_sha256 text,
  source_evidence_hash text not null,
  source_document_version text,
  source_document_date date,
  confidence_score numeric,
  review_class text,
  safety_validation_status text not null default 'pending',
  safety_validator_version text,
  safety_validated_at timestamptz,
  editorial_status text not null default 'draft',
  verified_by text,
  verified_at timestamptz,
  version_no integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint dose_rules_v3_rule_key_check check (btrim(rule_key) <> ''),
  constraint dose_rules_v3_source_section_check check (source_section = '4.2'),
  constraint dose_rules_v3_section_sha_check
    check (source_section_sha256 is null or source_section_sha256 ~ '^[0-9a-f]{64}$'),
  constraint dose_rules_v3_source_hash_check check (source_evidence_hash ~ '^[0-9a-f]{64}$'),
  constraint dose_rules_v3_source_identity_check check (source_snapshot_id = source_evidence_hash),
  constraint dose_rules_v3_version_check check (version_no >= 1),
  constraint dose_rules_v3_confidence_check
    check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  constraint dose_rules_v3_editorial_check
    check (editorial_status in ('draft','in_review','verified','published','retired')),
  constraint dose_rules_v3_safety_status_check
    check (safety_validation_status in ('pending','passed','failed','manual_review')),
  constraint dose_rules_v3_safety_pass_complete_check check (
    safety_validation_status <> 'passed'
    or (safety_validator_version is not null and btrim(safety_validator_version) <> '' and safety_validated_at is not null)
  ),
  constraint dose_rules_v3_patient_group_check
    check (patient_group in ('adult_only','pediatric_only','pediatric_and_adult','age_band','manual_review')),
  constraint dose_rules_v3_method_check
    check (calculation_method in (
      'fixed_dose','fixed_volume',
      'dose_per_kg_per_dose','dose_per_kg_per_day',
      'dose_per_m2_per_dose','dose_per_m2_per_day',
      'age_band_fixed','manual_only'
    )),
  constraint dose_rules_v3_frequency_check
    check (frequency_mode in ('interval','times_per_day','prn','single','continuous','manual')),
  constraint dose_rules_v3_duration_check
    check (duration_mode in ('none','fixed_days','range_days','review_after','manual')),
  constraint dose_rules_v3_out_of_range_check
    check (out_of_range_action in ('block','manual_review')),
  constraint dose_rules_v3_dose_basis_mode_check
    check (dose_basis_mode in ('single_active','component','total_combination','manual_review')),
  constraint dose_rules_v3_dose_range_check
    check (dose_min_value is null or dose_max_value is null or dose_min_value <= dose_max_value),
  constraint dose_rules_v3_age_range_check
    check (min_age_months is null or max_age_months is null or min_age_months <= max_age_months),
  constraint dose_rules_v3_weight_range_check
    check (min_weight_kg is null or max_weight_kg is null or min_weight_kg <= max_weight_kg),
  constraint dose_rules_v3_ceiling_check
    check (max_single_dose_mg is null or max_daily_dose_mg is null or max_single_dose_mg <= max_daily_dose_mg),
  constraint dose_rules_v3_frequency_complete_check check (
    editorial_status not in ('verified','published')
    or (
      (frequency_mode <> 'interval' or interval_min_hours is not null)
      and (frequency_mode <> 'times_per_day' or times_per_day is not null)
    )
  ),
  constraint dose_rules_v3_duration_complete_check check (
    editorial_status not in ('verified','published')
    or (
      (duration_mode <> 'fixed_days' or duration_min_days is not null)
      and (duration_mode <> 'range_days' or (duration_min_days is not null and duration_max_days is not null))
      and (duration_mode <> 'review_after' or review_after_days is not null)
    )
  ),
  constraint dose_rules_v3_prn_ceiling_check check (
    editorial_status not in ('verified','published')
    or not (prn or frequency_mode = 'prn')
    or interval_min_hours is not null
    or max_doses_24h is not null
  ),
  constraint dose_rules_v3_verified_provenance_check check (
    editorial_status not in ('verified','published')
    or (
      source_snapshot_id ~ '^[0-9a-f]{64}$'
      and source_section_sha256 ~ '^[0-9a-f]{64}$'
      and source_evidence_hash ~ '^[0-9a-f]{64}$'
      and source_snapshot_id = source_evidence_hash
      and (source_document_version is not null or source_document_date is not null)
      and verified_at is not null
      and verified_by is not null
      and btrim(verified_by) <> ''
    )
  ),
  constraint dose_rules_v3_published_not_manual_check check (
    editorial_status <> 'published'
    or (calculation_method <> 'manual_only' and review_class is distinct from 'manual_review')
  ),
  constraint dose_rules_v3_published_safety_check check (
    editorial_status <> 'published'
    or safety_validation_status = 'passed'
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
  source_section_sha256 text,
  source_evidence_hash text not null,
  source_document_version text,
  source_document_date date,
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
  constraint dose_renal_adjustments_v3_section_sha_check check (source_section_sha256 is null or source_section_sha256 ~ '^[0-9a-f]{64}$'),
  constraint dose_renal_adjustments_v3_hash_check check (source_evidence_hash ~ '^[0-9a-f]{64}$'),
  constraint dose_renal_adjustments_v3_identity_check check (source_snapshot_id = source_evidence_hash),
  constraint dose_renal_adjustments_v3_range_check
    check (min_value is null or max_value is null or min_value <= max_value),
  constraint dose_renal_adjustments_v3_review_check
    check (review_status in ('draft','in_review','verified','rejected','retired')),
  constraint dose_renal_adjustments_v3_verified_check check (
    review_status <> 'verified'
    or (
      source_snapshot_id ~ '^[0-9a-f]{64}$'
      and source_section_sha256 ~ '^[0-9a-f]{64}$'
      and source_evidence_hash ~ '^[0-9a-f]{64}$'
      and source_snapshot_id = source_evidence_hash
      and (source_document_version is not null or source_document_date is not null)
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
  source_section_sha256 text,
  source_evidence_hash text not null,
  source_document_version text,
  source_document_date date,
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
  constraint dose_hepatic_adjustments_v3_section_sha_check check (source_section_sha256 is null or source_section_sha256 ~ '^[0-9a-f]{64}$'),
  constraint dose_hepatic_adjustments_v3_hash_check check (source_evidence_hash ~ '^[0-9a-f]{64}$'),
  constraint dose_hepatic_adjustments_v3_identity_check check (source_snapshot_id = source_evidence_hash),
  constraint dose_hepatic_adjustments_v3_review_check
    check (review_status in ('draft','in_review','verified','rejected','retired')),
  constraint dose_hepatic_adjustments_v3_verified_check check (
    review_status <> 'verified'
    or (
      source_snapshot_id ~ '^[0-9a-f]{64}$'
      and source_section_sha256 ~ '^[0-9a-f]{64}$'
      and source_evidence_hash ~ '^[0-9a-f]{64}$'
      and source_snapshot_id = source_evidence_hash
      and (source_document_version is not null or source_document_date is not null)
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
  product_id uuid not null references public.dose_products_v3(product_id) on delete restrict,
  match_method text not null,
  preferred boolean not null default false,
  conversion_enabled boolean not null default false,
  tablet_split_allowed boolean not null default false,
  rounding_increment_value numeric,
  rounding_increment_unit text,
  binding_status text not null default 'candidate',
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dose_rule_products_v3_unique_binding unique (rule_id, product_id),
  constraint dose_rule_products_v3_status_check
    check (binding_status in ('candidate','verified','rejected','retired')),
  constraint dose_rule_products_v3_verified_check check (
    binding_status <> 'verified'
    or (
      verified_by is not null
      and btrim(verified_by) <> ''
      and verified_at is not null
    )
  ),
  constraint dose_rule_products_v3_rounding_check
    check (rounding_increment_value is null or rounding_increment_value > 0)
);

create table if not exists public.dose_legacy_comparisons_v3 (
  comparison_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  product_id uuid not null references public.dose_products_v3(product_id) on delete restrict,
  legacy_regimen_id uuid,
  comparison_status text not null,
  conflicts jsonb not null default '[]'::jsonb,
  missing_fields text[] not null default '{}'::text[],
  compared_at timestamptz not null default now(),
  constraint dose_legacy_comparisons_v3_unique unique (rule_id, product_id),
  constraint dose_legacy_comparisons_v3_status_check
    check (comparison_status in ('exact','compatible','conflict','missing','not_applicable'))
);

create table if not exists public.dose_review_queue_v3 (
  review_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  product_id uuid references public.dose_products_v3(product_id) on delete restrict,
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
  constraint dose_review_queue_v3_reasons_check check (cardinality(review_reason_codes) >= 1),
  constraint dose_review_queue_v3_status_check
    check (review_status in ('open','in_review','resolved','rejected')),
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
  product_id uuid references public.dose_products_v3(product_id) on delete restrict,
  from_status text,
  to_status text not null,
  gate_version text not null,
  gate_result jsonb not null,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint dose_publication_events_v3_to_status_check
    check (to_status in ('draft','in_review','verified','published','retired'))
);

-- Indexes for FK checks, review queues and product fast path.
create index if not exists dose_source_sections_v3_snapshot_idx
  on public.dose_source_sections_v3(snapshot_id);
create index if not exists dose_indication_terms_v3_indication_idx
  on public.dose_indication_terms_v3(indication_id);
create index if not exists dose_indication_terms_v3_snapshot_idx
  on public.dose_indication_terms_v3(source_snapshot_id);
create index if not exists dose_products_v3_drug_idx
  on public.dose_products_v3(drug_id);
create index if not exists dose_products_v3_published_key_idx
  on public.dose_products_v3(product_key)
  where editorial_status = 'published';
create index if not exists dose_rules_v3_substance_idx
  on public.dose_rules_v3(substance_concept_id);
create index if not exists dose_rules_v3_indication_idx
  on public.dose_rules_v3(indication_id);
create index if not exists dose_rules_v3_source_snapshot_idx
  on public.dose_rules_v3(source_snapshot_id);
create index if not exists dose_rules_v3_published_lookup_idx
  on public.dose_rules_v3(substance_concept_id, indication_id, patient_group)
  where editorial_status = 'published';
create index if not exists dose_renal_adjustments_v3_rule_idx
  on public.dose_renal_adjustments_v3(rule_id);
create index if not exists dose_renal_adjustments_v3_measure_idx
  on public.dose_renal_adjustments_v3(rule_id, measure_type)
  where review_status = 'verified';
create index if not exists dose_hepatic_adjustments_v3_rule_idx
  on public.dose_hepatic_adjustments_v3(rule_id);
create index if not exists dose_hepatic_adjustments_v3_measure_idx
  on public.dose_hepatic_adjustments_v3(rule_id, measure_type)
  where review_status = 'verified';
create index if not exists dose_rule_products_v3_rule_idx
  on public.dose_rule_products_v3(rule_id);
create index if not exists dose_rule_products_v3_product_idx
  on public.dose_rule_products_v3(product_id);
create index if not exists dose_rule_products_v3_verified_product_idx
  on public.dose_rule_products_v3(product_id, rule_id)
  where binding_status = 'verified';
create index if not exists dose_legacy_comparisons_v3_rule_product_idx
  on public.dose_legacy_comparisons_v3(rule_id, product_id);
create index if not exists dose_review_queue_v3_rule_idx
  on public.dose_review_queue_v3(rule_id);
create index if not exists dose_review_queue_v3_open_idx
  on public.dose_review_queue_v3(priority desc, opened_at)
  where review_status in ('open','in_review');
create index if not exists dose_publication_events_v3_rule_idx
  on public.dose_publication_events_v3(rule_id, created_at desc);

-- Provenance mutation locks: once a snapshot/section backs verified or published
-- clinical data, it becomes immutable. Draft-only provenance can still be reparsed/repaired.
create or replace function private.drx_lock_source_snapshot_v3()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $body$
begin
  if exists (
    select 1 from public.dose_products_v3 p
    where p.source_snapshot_id = old.snapshot_id
      and p.editorial_status in ('verified','published')
  ) or exists (
    select 1 from public.dose_rules_v3 r
    where r.source_snapshot_id = old.snapshot_id
      and r.editorial_status in ('verified','published')
  ) or exists (
    select 1 from public.dose_renal_adjustments_v3 a
    where a.source_snapshot_id = old.snapshot_id
      and a.review_status = 'verified'
  ) or exists (
    select 1 from public.dose_hepatic_adjustments_v3 a
    where a.source_snapshot_id = old.snapshot_id
      and a.review_status = 'verified'
  ) then
    raise exception 'DRX_V3_PROVENANCE_LOCKED: source snapshot backs verified/published clinical data';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$body$;

revoke all on function private.drx_lock_source_snapshot_v3()
from public, anon, authenticated;

drop trigger if exists dose_source_snapshots_v3_provenance_lock
on public.dose_source_snapshots_v3;
create trigger dose_source_snapshots_v3_provenance_lock
before update or delete on public.dose_source_snapshots_v3
for each row execute function private.drx_lock_source_snapshot_v3();

create or replace function private.drx_lock_source_section_v3()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $body$
begin
  if exists (
    select 1 from public.dose_rules_v3 r
    where r.source_snapshot_id = old.snapshot_id
      and r.source_section = old.section_code
      and r.source_section_sha256 = old.section_sha256
      and r.editorial_status in ('verified','published')
  ) or exists (
    select 1 from public.dose_renal_adjustments_v3 a
    where a.source_snapshot_id = old.snapshot_id
      and a.source_section = old.section_code
      and a.source_section_sha256 = old.section_sha256
      and a.review_status = 'verified'
  ) or exists (
    select 1 from public.dose_hepatic_adjustments_v3 a
    where a.source_snapshot_id = old.snapshot_id
      and a.source_section = old.section_code
      and a.source_section_sha256 = old.section_sha256
      and a.review_status = 'verified'
  ) then
    raise exception 'DRX_V3_PROVENANCE_LOCKED: source section backs verified/published clinical data';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$body$;

revoke all on function private.drx_lock_source_section_v3()
from public, anon, authenticated;

drop trigger if exists dose_source_sections_v3_provenance_lock
on public.dose_source_sections_v3;
create trigger dose_source_sections_v3_provenance_lock
before update or delete on public.dose_source_sections_v3
for each row execute function private.drx_lock_source_section_v3();

-- Database publication transition gates.
-- Products may be published only from source tiers allowed by the DRx publication policy.
create or replace function private.drx_enforce_product_publication_v3()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  snapshot_tier text;
  snapshot_source_key text;
  snapshot_version text;
  snapshot_date date;
begin
  if new.editorial_status <> 'published' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.editorial_status = 'published' then
      return new;
    end if;
  end if;

  select s.source_tier, s.source_key, s.document_version, s.document_date
    into snapshot_tier, snapshot_source_key, snapshot_version, snapshot_date
  from public.dose_source_snapshots_v3 s
  where s.snapshot_id = new.source_snapshot_id;

  if not found then
    raise exception 'DRX_V3_PRODUCT_PUBLICATION_BLOCKED: source snapshot missing';
  end if;

  if snapshot_tier not in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM') then
    raise exception 'DRX_V3_PRODUCT_PUBLICATION_BLOCKED: source tier is not publication eligible';
  end if;

  if snapshot_source_key is distinct from new.source_key then
    raise exception 'DRX_V3_PRODUCT_PUBLICATION_BLOCKED: source key does not match snapshot';
  end if;

  if new.source_document_version is not null
     and snapshot_version is distinct from new.source_document_version then
    raise exception 'DRX_V3_PRODUCT_PUBLICATION_BLOCKED: source version does not match snapshot';
  end if;

  if new.source_document_date is not null
     and snapshot_date is distinct from new.source_document_date then
    raise exception 'DRX_V3_PRODUCT_PUBLICATION_BLOCKED: source date does not match snapshot';
  end if;

  return new;
end
$$;

revoke all on function private.drx_enforce_product_publication_v3()
from public, anon, authenticated;

drop trigger if exists dose_products_v3_publication_guard
on public.dose_products_v3;

create trigger dose_products_v3_publication_guard
before insert or update
on public.dose_products_v3
for each row
execute function private.drx_enforce_product_publication_v3();

-- Rules require an official publication-eligible snapshot and a persisted, successfully
-- extracted SmPC section 4.2, in addition to binding/legacy/review/safety gates.
create or replace function private.drx_enforce_rule_publication_v3()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  verified_binding_count integer;
  clean_comparison_count integer;
  unresolved_review_count integer;
  valid_renal_adjustment_count integer;
  valid_hepatic_adjustment_count integer;
  snapshot_tier text;
  snapshot_source_key text;
  snapshot_version text;
  snapshot_date date;
  persisted_section_sha256 text;
begin
  if new.editorial_status <> 'published' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.editorial_status = 'published' then
      return new;
    end if;
  end if;

  if new.safety_validation_status <> 'passed' then
    raise exception 'DRX_V3_PUBLICATION_BLOCKED: safety validation has not passed';
  end if;

  if new.source_document_version is null and new.source_document_date is null then
    raise exception 'DRX_V3_PUBLICATION_BLOCKED: source version/date missing';
  end if;

  select s.source_tier, s.source_key, s.document_version, s.document_date
    into snapshot_tier, snapshot_source_key, snapshot_version, snapshot_date
  from public.dose_source_snapshots_v3 s
  where s.snapshot_id = new.source_snapshot_id;

  if not found then
    raise exception 'DRX_V3_PUBLICATION_BLOCKED: source snapshot missing';
  end if;

  if snapshot_tier not in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM') then
    raise exception 'DRX_V3_PUBLICATION_BLOCKED: source tier is not publication eligible';
  end if;

  if snapshot_source_key is distinct from new.source_key then
    raise exception 'DRX_V3_PUBLICATION_BLOCKED: source key does not match snapshot';
  end if;

  if new.source_document_version is not null
     and snapshot_version is distinct from new.source_document_version then
    raise exception 'DRX_V3_PUBLICATION_BLOCKED: source version does not match snapshot';
  end if;

  if new.source_document_date is not null
     and snapshot_date is distinct from new.source_document_date then
    raise exception 'DRX_V3_PUBLICATION_BLOCKED: source date does not match snapshot';
  end if;

  select s.section_sha256
    into persisted_section_sha256
  from public.dose_source_sections_v3 s
  where s.snapshot_id = new.source_snapshot_id
    and s.section_code = '4.2'
    and s.extraction_status = 'extracted'
    and s.section_sha256 ~ '^[0-9a-f]{64}$';

  if not found then
    raise exception 'DRX_V3_PUBLICATION_BLOCKED: verified SmPC section 4.2 artifact missing';
  end if;

  if new.source_section_sha256 is distinct from persisted_section_sha256 then
    raise exception 'DRX_V3_PUBLICATION_BLOCKED: source section hash does not match persisted artifact';
  end if;

  if new.renal_adjustment_required then
    select count(*)::integer
      into valid_renal_adjustment_count
    from public.dose_renal_adjustments_v3 a
    join public.dose_source_snapshots_v3 s
      on s.snapshot_id = a.source_snapshot_id
     and s.source_key = a.source_key
     and s.source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM')
     and (a.source_document_version is null or s.document_version is not distinct from a.source_document_version)
     and (a.source_document_date is null or s.document_date is not distinct from a.source_document_date)
    join public.dose_source_sections_v3 sec
      on sec.snapshot_id = a.source_snapshot_id
     and sec.section_code = '4.2'
     and sec.extraction_status = 'extracted'
     and sec.section_sha256 = a.source_section_sha256
    where a.rule_id = new.rule_id
      and a.review_status = 'verified'
      and a.source_section = '4.2'
      and a.source_snapshot_id = a.source_evidence_hash;

    if valid_renal_adjustment_count = 0 then
      raise exception 'DRX_V3_PUBLICATION_BLOCKED: renal adjustment required but no verified provenance-valid renal adjustment exists';
    end if;
  end if;

  if new.hepatic_adjustment_required then
    select count(*)::integer
      into valid_hepatic_adjustment_count
    from public.dose_hepatic_adjustments_v3 a
    join public.dose_source_snapshots_v3 s
      on s.snapshot_id = a.source_snapshot_id
     and s.source_key = a.source_key
     and s.source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM')
     and (a.source_document_version is null or s.document_version is not distinct from a.source_document_version)
     and (a.source_document_date is null or s.document_date is not distinct from a.source_document_date)
    join public.dose_source_sections_v3 sec
      on sec.snapshot_id = a.source_snapshot_id
     and sec.section_code = '4.2'
     and sec.extraction_status = 'extracted'
     and sec.section_sha256 = a.source_section_sha256
    where a.rule_id = new.rule_id
      and a.review_status = 'verified'
      and a.source_section = '4.2'
      and a.source_snapshot_id = a.source_evidence_hash;

    if valid_hepatic_adjustment_count = 0 then
      raise exception 'DRX_V3_PUBLICATION_BLOCKED: hepatic adjustment required but no verified provenance-valid hepatic adjustment exists';
    end if;
  end if;

  select count(*)::integer
    into verified_binding_count
  from public.dose_rule_products_v3 b
  join public.dose_products_v3 p on p.product_id = b.product_id
  where b.rule_id = new.rule_id
    and b.binding_status = 'verified'
    and p.editorial_status = 'published';

  if verified_binding_count = 0 then
    raise exception 'DRX_V3_PUBLICATION_BLOCKED: no verified product binding';
  end if;

  select count(*)::integer
    into clean_comparison_count
  from public.dose_rule_products_v3 b
  join public.dose_products_v3 p on p.product_id = b.product_id
  where b.rule_id = new.rule_id
    and b.binding_status = 'verified'
    and p.editorial_status = 'published'
    and exists (
      select 1
      from public.dose_legacy_comparisons_v3 c
      where c.rule_id = new.rule_id
        and c.product_id = b.product_id
        and c.comparison_status in ('exact','compatible','not_applicable')
    );

  if clean_comparison_count <> verified_binding_count then
    raise exception 'DRX_V3_PUBLICATION_BLOCKED: legacy comparison incomplete or conflicting';
  end if;

  select count(*)::integer
    into unresolved_review_count
  from public.dose_review_queue_v3 q
  where q.rule_id = new.rule_id
    and q.review_status in ('open','in_review');

  if unresolved_review_count <> 0 then
    raise exception 'DRX_V3_PUBLICATION_BLOCKED: clinical review remains open';
  end if;

  if new.specialist_only
     and not exists (
       select 1
       from public.dose_review_queue_v3 q
       where q.rule_id = new.rule_id
         and q.review_status = 'resolved'
         and q.decision is not null
         and q.reviewer_id is not null
         and q.reviewed_at is not null
     ) then
    raise exception 'DRX_V3_PUBLICATION_BLOCKED: specialist rule requires resolved manual review';
  end if;

  return new;
end
$$;

revoke all on function private.drx_enforce_rule_publication_v3()
from public, anon, authenticated;

drop trigger if exists dose_rules_v3_publication_guard
on public.dose_rules_v3;

create trigger dose_rules_v3_publication_guard
before insert or update
on public.dose_rules_v3
for each row
execute function private.drx_enforce_rule_publication_v3();

-- RLS on every public V3 table.
alter table public.dose_source_snapshots_v3 enable row level security;
alter table public.dose_source_sections_v3 enable row level security;
alter table public.dose_indication_concepts_v3 enable row level security;
alter table public.dose_indication_terms_v3 enable row level security;
alter table public.dose_products_v3 enable row level security;
alter table public.dose_rules_v3 enable row level security;
alter table public.dose_renal_adjustments_v3 enable row level security;
alter table public.dose_hepatic_adjustments_v3 enable row level security;
alter table public.dose_rule_products_v3 enable row level security;
alter table public.dose_legacy_comparisons_v3 enable row level security;
alter table public.dose_review_queue_v3 enable row level security;
alter table public.dose_publication_events_v3 enable row level security;

-- Fail closed first.
revoke all privileges on table
  public.dose_source_snapshots_v3,
  public.dose_source_sections_v3,
  public.dose_indication_concepts_v3,
  public.dose_indication_terms_v3,
  public.dose_products_v3,
  public.dose_rules_v3,
  public.dose_renal_adjustments_v3,
  public.dose_hepatic_adjustments_v3,
  public.dose_rule_products_v3,
  public.dose_legacy_comparisons_v3,
  public.dose_review_queue_v3,
  public.dose_publication_events_v3
from public, anon, authenticated;

-- Public application reads: published concepts/products/rules and verified bindings only.
grant select on table public.dose_indication_concepts_v3 to anon, authenticated;
grant select on table public.dose_products_v3 to anon, authenticated;
grant select on table public.dose_rules_v3 to anon, authenticated;
grant select on table public.dose_renal_adjustments_v3 to anon, authenticated;
grant select on table public.dose_hepatic_adjustments_v3 to anon, authenticated;
grant select on table public.dose_rule_products_v3 to anon, authenticated;

-- Metadata-only provenance projection required by the SECURITY INVOKER RPC.
-- Raw SmPC text and extracted JSON are deliberately not granted.
grant select (
  snapshot_id,
  source_key,
  source_tier,
  document_version,
  document_date
) on public.dose_source_snapshots_v3 to anon, authenticated;

grant select (
  snapshot_id,
  section_code,
  section_sha256,
  extraction_status
) on public.dose_source_sections_v3 to anon, authenticated;

drop policy if exists dose_source_snapshots_v3_rpc_metadata_read
  on public.dose_source_snapshots_v3;
create policy dose_source_snapshots_v3_rpc_metadata_read
  on public.dose_source_snapshots_v3
  for select to anon, authenticated
  using (source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM'));

drop policy if exists dose_source_sections_v3_rpc_metadata_read
  on public.dose_source_sections_v3;
create policy dose_source_sections_v3_rpc_metadata_read
  on public.dose_source_sections_v3
  for select to anon, authenticated
  using (
    section_code = '4.2'
    and extraction_status = 'extracted'
    and exists (
      select 1
      from public.dose_source_snapshots_v3 s
      where s.snapshot_id = dose_source_sections_v3.snapshot_id
        and s.source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM')
    )
  );

drop policy if exists dose_indication_concepts_v3_published_read
  on public.dose_indication_concepts_v3;
create policy dose_indication_concepts_v3_published_read
  on public.dose_indication_concepts_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_products_v3_published_read
  on public.dose_products_v3;
create policy dose_products_v3_published_read
  on public.dose_products_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_rules_v3_published_read
  on public.dose_rules_v3;
create policy dose_rules_v3_published_read
  on public.dose_rules_v3
  for select to anon, authenticated
  using (editorial_status = 'published');

drop policy if exists dose_renal_adjustments_v3_verified_read
  on public.dose_renal_adjustments_v3;
create policy dose_renal_adjustments_v3_verified_read
  on public.dose_renal_adjustments_v3
  for select to anon, authenticated
  using (
    review_status = 'verified'
    and source_section = '4.2'
    and source_snapshot_id = source_evidence_hash
    and exists (
      select 1 from public.dose_rules_v3 r
      where r.rule_id = dose_renal_adjustments_v3.rule_id
        and r.editorial_status = 'published'
    )
    and exists (
      select 1
      from public.dose_source_snapshots_v3 s
      where s.snapshot_id = dose_renal_adjustments_v3.source_snapshot_id
        and s.source_key = dose_renal_adjustments_v3.source_key
        and s.source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM')
        and (dose_renal_adjustments_v3.source_document_version is null or s.document_version is not distinct from dose_renal_adjustments_v3.source_document_version)
        and (dose_renal_adjustments_v3.source_document_date is null or s.document_date is not distinct from dose_renal_adjustments_v3.source_document_date)
    )
    and exists (
      select 1
      from public.dose_source_sections_v3 sec
      where sec.snapshot_id = dose_renal_adjustments_v3.source_snapshot_id
        and sec.section_code = '4.2'
        and sec.extraction_status = 'extracted'
        and sec.section_sha256 = dose_renal_adjustments_v3.source_section_sha256
    )
  );

drop policy if exists dose_hepatic_adjustments_v3_verified_read
  on public.dose_hepatic_adjustments_v3;
create policy dose_hepatic_adjustments_v3_verified_read
  on public.dose_hepatic_adjustments_v3
  for select to anon, authenticated
  using (
    review_status = 'verified'
    and source_section = '4.2'
    and source_snapshot_id = source_evidence_hash
    and exists (
      select 1 from public.dose_rules_v3 r
      where r.rule_id = dose_hepatic_adjustments_v3.rule_id
        and r.editorial_status = 'published'
    )
    and exists (
      select 1
      from public.dose_source_snapshots_v3 s
      where s.snapshot_id = dose_hepatic_adjustments_v3.source_snapshot_id
        and s.source_key = dose_hepatic_adjustments_v3.source_key
        and s.source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM')
        and (dose_hepatic_adjustments_v3.source_document_version is null or s.document_version is not distinct from dose_hepatic_adjustments_v3.source_document_version)
        and (dose_hepatic_adjustments_v3.source_document_date is null or s.document_date is not distinct from dose_hepatic_adjustments_v3.source_document_date)
    )
    and exists (
      select 1
      from public.dose_source_sections_v3 sec
      where sec.snapshot_id = dose_hepatic_adjustments_v3.source_snapshot_id
        and sec.section_code = '4.2'
        and sec.extraction_status = 'extracted'
        and sec.section_sha256 = dose_hepatic_adjustments_v3.source_section_sha256
    )
  );

drop policy if exists dose_rule_products_v3_published_read
  on public.dose_rule_products_v3;
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
    and exists (
      select 1
      from public.dose_products_v3 p
      where p.product_id = dose_rule_products_v3.product_id
        and p.editorial_status = 'published'
    )
  );

-- Single database-call product-scoped V3 runtime.
create or replace function public.medindex_dose_product_fast_path_v3(
  p_product_key text default null,
  p_drug_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with selector_guard as (
    select
      nullif(btrim(p_product_key), '') as product_key,
      p_drug_id as drug_id
    where (nullif(btrim(p_product_key), '') is null) <> (p_drug_id is null)
  ),
  selected_product as (
    select p.*
    from selector_guard s
    join public.dose_products_v3 p
      on (
        (s.product_key is not null and p.product_key = s.product_key)
        or (s.drug_id is not null and p.drug_id = s.drug_id)
      )
    join public.dose_source_snapshots_v3 ps
      on ps.snapshot_id = p.source_snapshot_id
     and ps.source_key = p.source_key
     and ps.source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM')
     and (p.source_document_version is null or ps.document_version is not distinct from p.source_document_version)
     and (p.source_document_date is null or ps.document_date is not distinct from p.source_document_date)
    where p.editorial_status = 'published'
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
      b.binding_status
    from selected_product p
    join public.dose_rule_products_v3 b
      on b.product_id = p.product_id
     and b.binding_status = 'verified'
    join public.dose_rules_v3 r
      on r.rule_id = b.rule_id
     and r.editorial_status = 'published'
    join public.dose_indication_concepts_v3 i
      on i.indication_id = r.indication_id
     and i.editorial_status = 'published'
    join public.dose_source_snapshots_v3 rs
      on rs.snapshot_id = r.source_snapshot_id
     and rs.source_key = r.source_key
     and rs.source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM')
     and (r.source_document_version is null or rs.document_version is not distinct from r.source_document_version)
     and (r.source_document_date is null or rs.document_date is not distinct from r.source_document_date)
    join public.dose_source_sections_v3 sec
      on sec.snapshot_id = r.source_snapshot_id
     and sec.section_code = '4.2'
     and sec.extraction_status = 'extracted'
     and sec.section_sha256 = r.source_section_sha256
    where r.source_section = '4.2'
      and r.source_snapshot_id ~ '^[0-9a-f]{64}$'
      and r.source_section_sha256 ~ '^[0-9a-f]{64}$'
      and r.source_evidence_hash ~ '^[0-9a-f]{64}$'
      and r.source_snapshot_id = r.source_evidence_hash
      and (r.source_document_version is not null or r.source_document_date is not null)
  ),
  renal_adjustment_rows as (
    select a.*
    from rule_rows r
    join public.dose_renal_adjustments_v3 a
      on a.rule_id = r.rule_id
     and a.review_status = 'verified'
    join public.dose_source_snapshots_v3 s
      on s.snapshot_id = a.source_snapshot_id
     and s.source_key = a.source_key
     and s.source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM')
     and (a.source_document_version is null or s.document_version is not distinct from a.source_document_version)
     and (a.source_document_date is null or s.document_date is not distinct from a.source_document_date)
    join public.dose_source_sections_v3 sec
      on sec.snapshot_id = a.source_snapshot_id
     and sec.section_code = '4.2'
     and sec.extraction_status = 'extracted'
     and sec.section_sha256 = a.source_section_sha256
    where a.source_snapshot_id = a.source_evidence_hash
      and a.source_section = '4.2'
  ),
  renal_adjustments_json as (
    select rule_id, jsonb_agg(
      jsonb_build_object(
        'adjustmentId', adjustment_id,
        'measureType', measure_type,
        'minValue', min_value,
        'maxValue', max_value,
        'acceptedValues', accepted_values,
        'minInclusive', min_inclusive,
        'maxInclusive', max_inclusive,
        'doseAction', dose_action,
        'doseFactor', dose_factor,
        'replacementDoseMin', replacement_dose_min,
        'replacementDoseMax', replacement_dose_max,
        'intervalMinHours', interval_min_hours,
        'intervalMaxHours', interval_max_hours,
        'source', jsonb_build_object(
          'sourceKey', source_key,
          'snapshotId', source_snapshot_id,
          'section', source_section,
          'sectionSha256', source_section_sha256,
          'evidenceHash', source_evidence_hash,
          'documentVersion', source_document_version,
          'documentDate', source_document_date,
          'official', true
        )
      )
      order by measure_type, min_value nulls first, max_value nulls last, adjustment_id
    ) as adjustments
    from renal_adjustment_rows
    group by rule_id
  ),
  hepatic_adjustment_rows as (
    select a.*
    from rule_rows r
    join public.dose_hepatic_adjustments_v3 a
      on a.rule_id = r.rule_id
     and a.review_status = 'verified'
    join public.dose_source_snapshots_v3 s
      on s.snapshot_id = a.source_snapshot_id
     and s.source_key = a.source_key
     and s.source_tier in ('EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM')
     and (a.source_document_version is null or s.document_version is not distinct from a.source_document_version)
     and (a.source_document_date is null or s.document_date is not distinct from a.source_document_date)
    join public.dose_source_sections_v3 sec
      on sec.snapshot_id = a.source_snapshot_id
     and sec.section_code = '4.2'
     and sec.extraction_status = 'extracted'
     and sec.section_sha256 = a.source_section_sha256
    where a.source_snapshot_id = a.source_evidence_hash
      and a.source_section = '4.2'
  ),
  hepatic_adjustments_json as (
    select rule_id, jsonb_agg(
      jsonb_build_object(
        'adjustmentId', adjustment_id,
        'measureType', measure_type,
        'severityOrClass', severity_or_class,
        'doseAction', dose_action,
        'doseFactor', dose_factor,
        'replacementDoseMin', replacement_dose_min,
        'replacementDoseMax', replacement_dose_max,
        'intervalMinHours', interval_min_hours,
        'intervalMaxHours', interval_max_hours,
        'source', jsonb_build_object(
          'sourceKey', source_key,
          'snapshotId', source_snapshot_id,
          'section', source_section,
          'sectionSha256', source_section_sha256,
          'evidenceHash', source_evidence_hash,
          'documentVersion', source_document_version,
          'documentDate', source_document_date,
          'official', true
        )
      )
      order by measure_type, adjustment_id
    ) as adjustments
    from hepatic_adjustment_rows
    group by rule_id
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
        'renalAdjustments', coalesce(raj.adjustments, '[]'::jsonb),
        'hepaticAdjustments', coalesce(haj.adjustments, '[]'::jsonb),
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
          'sectionSha256', r.source_section_sha256,
          'evidenceHash', r.source_evidence_hash,
          'documentVersion', r.source_document_version,
          'documentDate', r.source_document_date,
          'official', true
        )
      )
      order by r.indication_name, r.rule_key
    ) as rules
    from rule_rows r
    left join renal_adjustments_json raj on raj.rule_id = r.rule_id
    left join hepatic_adjustments_json haj on haj.rule_id = r.rule_id
    where (r.renal_adjustment_required is not true or raj.adjustments is not null)
      and (r.hepatic_adjustment_required is not true or haj.adjustments is not null)
  )
  select case
    when p.product_id is null or coalesce(jsonb_array_length(r.rules), 0) = 0 then null
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
  from selected_product p
  cross join rules_json r
$$;

revoke all on function public.medindex_dose_product_fast_path_v3(text, uuid)
from public;
grant execute on function public.medindex_dose_product_fast_path_v3(text, uuid)
to anon, authenticated;

comment on table public.dose_products_v3 is
  'DRx Dosierung V3 product shell with exact product/concentration provenance; independent of dose_products_v2.';
comment on table public.dose_rules_v3 is
  'DRx Dosierung V3 shadow rules. Fail-closed; do not cut over until archive, binding, legacy comparison, clinical review, API parity and rollback gates pass.';
