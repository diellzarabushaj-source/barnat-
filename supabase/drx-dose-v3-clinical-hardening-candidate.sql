-- DRx Dosierung V3 clinical hardening candidate
-- STATUS: NOT_APPLIED
-- Apply only AFTER supabase/drx-dose-v3-additive-candidate.sql in an isolated/staging environment.
-- This migration is additive: it does not modify legacy V2 dosage tables or publish clinical data.

DO $preflight$
BEGIN
  IF to_regclass('public.dose_rules_v3') IS NULL
     OR to_regclass('public.dose_source_snapshots_v3') IS NULL
     OR to_regclass('public.dose_renal_adjustments_v3') IS NULL
     OR to_regclass('public.dose_hepatic_adjustments_v3') IS NULL THEN
    RAISE EXCEPTION 'DRX_V3_CLINICAL_HARDENING_REQUIRES_BASE_SCHEMA';
  END IF;
END
$preflight$;

-- Source metadata: provenance remains immutable; these fields improve regulatory traceability.
ALTER TABLE public.dose_source_snapshots_v3
  ADD COLUMN IF NOT EXISTS source_language text,
  ADD COLUMN IF NOT EXISTS source_document_id text,
  ADD COLUMN IF NOT EXISTS retrieval_method text;

-- Structured regimen semantics. Nullable fields intentionally avoid inferring meaning for existing rows.
ALTER TABLE public.dose_rules_v3
  ADD COLUMN IF NOT EXISTS regimen_role text,
  ADD COLUMN IF NOT EXISTS phase_sequence integer,
  ADD COLUMN IF NOT EXISTS parent_rule_id uuid REFERENCES public.dose_rules_v3(rule_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS supersedes_rule_id uuid REFERENCES public.dose_rules_v3(rule_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS change_reason text,
  ADD COLUMN IF NOT EXISTS dose_unit_ucum text,
  ADD COLUMN IF NOT EXISTS dose_rate_min numeric,
  ADD COLUMN IF NOT EXISTS dose_rate_max numeric,
  ADD COLUMN IF NOT EXISTS dose_rate_unit_ucum text,
  ADD COLUMN IF NOT EXISTS infusion_duration_min_minutes numeric,
  ADD COLUMN IF NOT EXISTS infusion_duration_max_minutes numeric,
  ADD COLUMN IF NOT EXISTS cycle_length_days numeric,
  ADD COLUMN IF NOT EXISTS cycle_days_on numeric,
  ADD COLUMN IF NOT EXISTS cycle_days_off numeric,
  ADD COLUMN IF NOT EXISTS gestational_age_min_weeks numeric,
  ADD COLUMN IF NOT EXISTS gestational_age_max_weeks numeric,
  ADD COLUMN IF NOT EXISTS postmenstrual_age_min_weeks numeric,
  ADD COLUMN IF NOT EXISTS postmenstrual_age_max_weeks numeric,
  ADD COLUMN IF NOT EXISTS route_code_system text,
  ADD COLUMN IF NOT EXISTS route_code text,
  ADD COLUMN IF NOT EXISTS pharmaceutical_form_code_system text,
  ADD COLUMN IF NOT EXISTS pharmaceutical_form_code text,
  ADD COLUMN IF NOT EXISTS source_section_code_system text,
  ADD COLUMN IF NOT EXISTS source_section_term_code text;

-- Keep exact product-shell coding separate from the clinical rule while allowing interoperable identifiers.
ALTER TABLE public.dose_products_v3
  ADD COLUMN IF NOT EXISTS route_code_system text,
  ADD COLUMN IF NOT EXISTS route_code text,
  ADD COLUMN IF NOT EXISTS pharmaceutical_form_code_system text,
  ADD COLUMN IF NOT EXISTS pharmaceutical_form_code text,
  ADD COLUMN IF NOT EXISTS numerator_unit_ucum text,
  ADD COLUMN IF NOT EXISTS denominator_unit_ucum text;

-- Renal dosing: calculation method and dialysis modality/timing must be explicit, never inferred.
ALTER TABLE public.dose_renal_adjustments_v3
  ADD COLUMN IF NOT EXISTS measure_method text,
  ADD COLUMN IF NOT EXISTS dialysis_modality text,
  ADD COLUMN IF NOT EXISTS dialysis_timing text;

-- Hepatic criteria remain source-defined; this field records whether the source was explicit or textual.
ALTER TABLE public.dose_hepatic_adjustments_v3
  ADD COLUMN IF NOT EXISTS criteria_mode text;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dose_rules_v3_regimen_role_check') THEN
    ALTER TABLE public.dose_rules_v3 ADD CONSTRAINT dose_rules_v3_regimen_role_check
      CHECK (regimen_role IS NULL OR regimen_role IN (
        'single','loading','maintenance','titration','taper','rescue',
        'prophylaxis','cycle','continuous','manual_review'
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dose_rules_v3_phase_sequence_check') THEN
    ALTER TABLE public.dose_rules_v3 ADD CONSTRAINT dose_rules_v3_phase_sequence_check
      CHECK (phase_sequence IS NULL OR phase_sequence >= 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dose_rules_v3_parent_not_self_check') THEN
    ALTER TABLE public.dose_rules_v3 ADD CONSTRAINT dose_rules_v3_parent_not_self_check
      CHECK (parent_rule_id IS NULL OR parent_rule_id <> rule_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dose_rules_v3_supersedes_not_self_check') THEN
    ALTER TABLE public.dose_rules_v3 ADD CONSTRAINT dose_rules_v3_supersedes_not_self_check
      CHECK (supersedes_rule_id IS NULL OR supersedes_rule_id <> rule_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dose_rules_v3_dose_rate_range_check') THEN
    ALTER TABLE public.dose_rules_v3 ADD CONSTRAINT dose_rules_v3_dose_rate_range_check
      CHECK (dose_rate_min IS NULL OR dose_rate_max IS NULL OR dose_rate_min <= dose_rate_max);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dose_rules_v3_infusion_duration_range_check') THEN
    ALTER TABLE public.dose_rules_v3 ADD CONSTRAINT dose_rules_v3_infusion_duration_range_check
      CHECK (
        (infusion_duration_min_minutes IS NULL OR infusion_duration_min_minutes > 0)
        AND (infusion_duration_max_minutes IS NULL OR infusion_duration_max_minutes > 0)
        AND (infusion_duration_min_minutes IS NULL OR infusion_duration_max_minutes IS NULL
             OR infusion_duration_min_minutes <= infusion_duration_max_minutes)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dose_rules_v3_cycle_check') THEN
    ALTER TABLE public.dose_rules_v3 ADD CONSTRAINT dose_rules_v3_cycle_check
      CHECK (
        (cycle_length_days IS NULL OR cycle_length_days > 0)
        AND (cycle_days_on IS NULL OR cycle_days_on > 0)
        AND (cycle_days_off IS NULL OR cycle_days_off >= 0)
        AND (cycle_length_days IS NULL OR cycle_days_on IS NULL OR cycle_days_on <= cycle_length_days)
        AND (cycle_length_days IS NULL OR cycle_days_off IS NULL OR cycle_days_off <= cycle_length_days)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dose_rules_v3_gestational_age_range_check') THEN
    ALTER TABLE public.dose_rules_v3 ADD CONSTRAINT dose_rules_v3_gestational_age_range_check
      CHECK (gestational_age_min_weeks IS NULL OR gestational_age_max_weeks IS NULL
             OR gestational_age_min_weeks <= gestational_age_max_weeks);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dose_rules_v3_postmenstrual_age_range_check') THEN
    ALTER TABLE public.dose_rules_v3 ADD CONSTRAINT dose_rules_v3_postmenstrual_age_range_check
      CHECK (postmenstrual_age_min_weeks IS NULL OR postmenstrual_age_max_weeks IS NULL
             OR postmenstrual_age_min_weeks <= postmenstrual_age_max_weeks);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dose_rules_v3_ucum_nonempty_check') THEN
    ALTER TABLE public.dose_rules_v3 ADD CONSTRAINT dose_rules_v3_ucum_nonempty_check
      CHECK (
        (dose_unit_ucum IS NULL OR btrim(dose_unit_ucum) <> '')
        AND (dose_rate_unit_ucum IS NULL OR btrim(dose_rate_unit_ucum) <> '')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dose_renal_adjustments_v3_method_check') THEN
    ALTER TABLE public.dose_renal_adjustments_v3 ADD CONSTRAINT dose_renal_adjustments_v3_method_check
      CHECK (measure_method IS NULL OR measure_method IN (
        'Cockcroft_Gault','CKD_EPI','source_stated_unspecified','not_applicable'
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dose_renal_adjustments_v3_dialysis_modality_check') THEN
    ALTER TABLE public.dose_renal_adjustments_v3 ADD CONSTRAINT dose_renal_adjustments_v3_dialysis_modality_check
      CHECK (dialysis_modality IS NULL OR dialysis_modality IN ('HD','PD','CRRT','other_source_defined'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dose_renal_adjustments_v3_dialysis_timing_check') THEN
    ALTER TABLE public.dose_renal_adjustments_v3 ADD CONSTRAINT dose_renal_adjustments_v3_dialysis_timing_check
      CHECK (dialysis_timing IS NULL OR dialysis_timing IN (
        'before_dialysis','after_dialysis','during_dialysis',
        'independent_of_dialysis','source_defined','not_stated'
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dose_renal_adjustments_v3_dialysis_context_check') THEN
    ALTER TABLE public.dose_renal_adjustments_v3 ADD CONSTRAINT dose_renal_adjustments_v3_dialysis_context_check
      CHECK (
        (dialysis_modality IS NULL AND dialysis_timing IS NULL)
        OR measure_type = 'dialysis_status'
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dose_hepatic_adjustments_v3_criteria_mode_check') THEN
    ALTER TABLE public.dose_hepatic_adjustments_v3 ADD CONSTRAINT dose_hepatic_adjustments_v3_criteria_mode_check
      CHECK (criteria_mode IS NULL OR criteria_mode IN ('explicit_child_pugh','source_textual','not_stated'));
  END IF;
END
$constraints$;

CREATE INDEX IF NOT EXISTS dose_rules_v3_parent_rule_idx
  ON public.dose_rules_v3(parent_rule_id)
  WHERE parent_rule_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS dose_rules_v3_supersedes_idx
  ON public.dose_rules_v3(supersedes_rule_id)
  WHERE supersedes_rule_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS dose_rules_v3_regimen_lookup_idx
  ON public.dose_rules_v3(substance_concept_id, indication_id, regimen_role, phase_sequence)
  WHERE editorial_status = 'published';

-- Deliberately no GRANT, no publication status mutation and no legacy-table write occurs here.
-- Runtime exposure of new fields must be added only after staging validation of the V3 RPC contract.
