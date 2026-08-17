-- MedIndex pediatric master fields v1
-- Canonical product-level projection: Google Sheet Sheet1!U:AX -> public.drugs.
-- The normalized `Doza pediatrike` sheet / dose rule tables may hold multiple
-- indication-specific regimens. Never infer pediatric dosing from strength.

BEGIN;

ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_dose_summary text;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_indication text;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_use_status text;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_min_age_value numeric;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_min_age_unit text;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_max_age_value numeric;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_max_age_unit text;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_min_weight_kg numeric;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_max_weight_kg numeric;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_dose_min numeric;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_dose_max numeric;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_dose_unit text;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_dose_basis text;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_doses_per_day numeric;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_interval_hours numeric;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_max_single_value numeric;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_max_single_unit text;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_max_daily_value numeric;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_max_daily_unit text;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_route text;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_restriction text;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_concentration_value numeric;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_concentration_unit text;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_concentration_per_value numeric;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_concentration_per_unit text;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_source_url text;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_source_section text;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_verification_status text;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_verified_at timestamptz;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_primary_regimen_id text;

CREATE OR REPLACE FUNCTION public.medindex_numeric_or_null(value text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE v text;
BEGIN
  v := replace(btrim(coalesce(value, '')), ',', '.');
  IF v = '' OR v !~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$' THEN
    RETURN NULL;
  END IF;
  RETURN v::numeric;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.medindex_timestamp_or_null(value text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE v text;
BEGIN
  v := btrim(coalesce(value, ''));
  IF v = '' THEN
    RETURN NULL;
  ELSIF v ~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN v::timestamptz;
  ELSIF v ~ '^\d{2}[./-]\d{2}[./-]\d{4}$' THEN
    RETURN to_timestamp(replace(replace(v, '/', '.'), '-', '.'), 'DD.MM.YYYY');
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.medindex_sync_drug_pediatric_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.source_payload IS NOT DISTINCT FROM OLD.source_payload THEN
    RETURN NEW;
  END IF;

  NEW.pediatric_dose_summary := nullif(btrim(NEW.source_payload->>'Doza pediatrike — përmbledhje'), '');
  NEW.pediatric_indication := nullif(btrim(NEW.source_payload->>'Indikacioni pediatrik'), '');
  NEW.pediatric_use_status := nullif(btrim(NEW.source_payload->>'Statusi i përdorimit pediatrik'), '');
  NEW.pediatric_min_age_value := public.medindex_numeric_or_null(NEW.source_payload->>'Mosha minimale — vlerë');
  NEW.pediatric_min_age_unit := nullif(btrim(NEW.source_payload->>'Mosha minimale — njësi'), '');
  NEW.pediatric_max_age_value := public.medindex_numeric_or_null(NEW.source_payload->>'Mosha maksimale — vlerë');
  NEW.pediatric_max_age_unit := nullif(btrim(NEW.source_payload->>'Mosha maksimale — njësi'), '');
  NEW.pediatric_min_weight_kg := public.medindex_numeric_or_null(NEW.source_payload->>'Pesha minimale (kg)');
  NEW.pediatric_max_weight_kg := public.medindex_numeric_or_null(NEW.source_payload->>'Pesha maksimale (kg)');
  NEW.pediatric_dose_min := public.medindex_numeric_or_null(NEW.source_payload->>'Doza pediatrike — min');
  NEW.pediatric_dose_max := public.medindex_numeric_or_null(NEW.source_payload->>'Doza pediatrike — max');
  NEW.pediatric_dose_unit := nullif(btrim(NEW.source_payload->>'Njësia e dozës'), '');
  NEW.pediatric_dose_basis := nullif(btrim(NEW.source_payload->>'Baza e dozës'), '');
  NEW.pediatric_doses_per_day := public.medindex_numeric_or_null(NEW.source_payload->>'Nr. dozave / ditë');
  NEW.pediatric_interval_hours := public.medindex_numeric_or_null(NEW.source_payload->>'Intervali (orë)');
  NEW.pediatric_max_single_value := public.medindex_numeric_or_null(NEW.source_payload->>'Maks. për dozë — vlerë');
  NEW.pediatric_max_single_unit := nullif(btrim(NEW.source_payload->>'Maks. për dozë — njësi'), '');
  NEW.pediatric_max_daily_value := public.medindex_numeric_or_null(NEW.source_payload->>'Maks. në 24h — vlerë');
  NEW.pediatric_max_daily_unit := nullif(btrim(NEW.source_payload->>'Maks. në 24h — njësi'), '');
  NEW.pediatric_route := nullif(btrim(NEW.source_payload->>'Rruga pediatrike'), '');
  NEW.pediatric_restriction := nullif(btrim(NEW.source_payload->>'Kufizim / mos-përdorim pediatrik'), '');
  NEW.pediatric_concentration_value := public.medindex_numeric_or_null(NEW.source_payload->>'Koncentrimi — sasia');
  NEW.pediatric_concentration_unit := nullif(btrim(NEW.source_payload->>'Koncentrimi — njësi'), '');
  NEW.pediatric_concentration_per_value := public.medindex_numeric_or_null(NEW.source_payload->>'Koncentrimi për — sasia');
  NEW.pediatric_concentration_per_unit := nullif(btrim(NEW.source_payload->>'Koncentrimi për — njësi'), '');
  NEW.pediatric_source_url := nullif(btrim(NEW.source_payload->>'Burimi pediatrik'), '');
  NEW.pediatric_source_section := nullif(btrim(NEW.source_payload->>'Seksioni i burimit pediatrik'), '');
  NEW.pediatric_verification_status := nullif(btrim(NEW.source_payload->>'Statusi i verifikimit pediatrik'), '');
  NEW.pediatric_verified_at := public.medindex_timestamp_or_null(NEW.source_payload->>'Verifikuar më');
  NEW.pediatric_primary_regimen_id := nullif(btrim(NEW.source_payload->>'Regimen ID kryesor'), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS drugs_sync_pediatric_fields_from_source_payload ON public.drugs;
CREATE TRIGGER drugs_sync_pediatric_fields_from_source_payload
BEFORE INSERT OR UPDATE OF source_payload ON public.drugs
FOR EACH ROW EXECUTE FUNCTION public.medindex_sync_drug_pediatric_fields();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drugs_pediatric_nonnegative_check') THEN
    ALTER TABLE public.drugs ADD CONSTRAINT drugs_pediatric_nonnegative_check CHECK (
      COALESCE(pediatric_min_age_value, 0) >= 0 AND COALESCE(pediatric_max_age_value, 0) >= 0 AND
      COALESCE(pediatric_min_weight_kg, 0) >= 0 AND COALESCE(pediatric_max_weight_kg, 0) >= 0 AND
      COALESCE(pediatric_dose_min, 0) >= 0 AND COALESCE(pediatric_dose_max, 0) >= 0 AND
      COALESCE(pediatric_doses_per_day, 0) >= 0 AND COALESCE(pediatric_interval_hours, 0) >= 0 AND
      COALESCE(pediatric_max_single_value, 0) >= 0 AND COALESCE(pediatric_max_daily_value, 0) >= 0 AND
      COALESCE(pediatric_concentration_value, 0) >= 0 AND COALESCE(pediatric_concentration_per_value, 0) >= 0
    ) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drugs_pediatric_age_unit_check') THEN
    ALTER TABLE public.drugs ADD CONSTRAINT drugs_pediatric_age_unit_check CHECK (
      (pediatric_min_age_unit IS NULL OR pediatric_min_age_unit = ANY (ARRAY['ditë','javë','muaj','vjet'])) AND
      (pediatric_max_age_unit IS NULL OR pediatric_max_age_unit = ANY (ARRAY['ditë','javë','muaj','vjet']))
    ) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drugs_pediatric_dose_unit_check') THEN
    ALTER TABLE public.drugs ADD CONSTRAINT drugs_pediatric_dose_unit_check CHECK (
      pediatric_dose_unit IS NULL OR pediatric_dose_unit = ANY (ARRAY['mg','mcg','g','mL','unit','IU','mmol','mEq'])
    ) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drugs_pediatric_basis_check') THEN
    ALTER TABLE public.drugs ADD CONSTRAINT drugs_pediatric_basis_check CHECK (
      pediatric_dose_basis IS NULL OR pediatric_dose_basis = ANY (ARRAY['kg/dozë','kg/ditë','kg/orë','kg/min','m²/dozë','m²/ditë','bandë peshe','dozë fikse'])
    ) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drugs_pediatric_use_status_check') THEN
    ALTER TABLE public.drugs ADD CONSTRAINT drugs_pediatric_use_status_check CHECK (
      pediatric_use_status IS NULL OR pediatric_use_status = ANY (ARRAY['LEJOHET','KUFIZUAR','NUK REKOMANDOHET','KUNDËRINDIKUAR','PA TË DHËNA','NUK APLIKOHET'])
    ) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drugs_pediatric_verification_check') THEN
    ALTER TABLE public.drugs ADD CONSTRAINT drugs_pediatric_verification_check CHECK (
      pediatric_verification_status IS NULL OR pediatric_verification_status = ANY (ARRAY['needs_source','in_review','verified','not_applicable'])
    ) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drugs_pediatric_verified_source_check') THEN
    ALTER TABLE public.drugs ADD CONSTRAINT drugs_pediatric_verified_source_check CHECK (
      pediatric_verification_status <> 'verified' OR (pediatric_source_url IS NOT NULL AND pediatric_verified_at IS NOT NULL)
    ) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drugs_pediatric_range_check') THEN
    ALTER TABLE public.drugs ADD CONSTRAINT drugs_pediatric_range_check CHECK (
      (pediatric_min_weight_kg IS NULL OR pediatric_max_weight_kg IS NULL OR pediatric_max_weight_kg >= pediatric_min_weight_kg) AND
      (pediatric_dose_min IS NULL OR pediatric_dose_max IS NULL OR pediatric_dose_max >= pediatric_dose_min) AND
      (pediatric_doses_per_day IS NULL OR pediatric_doses_per_day > 0) AND
      (pediatric_interval_hours IS NULL OR pediatric_interval_hours > 0) AND
      (pediatric_concentration_value IS NULL OR pediatric_concentration_value > 0) AND
      (pediatric_concentration_per_value IS NULL OR pediatric_concentration_per_value > 0)
    ) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drugs_pediatric_verified_structure_check') THEN
    ALTER TABLE public.drugs ADD CONSTRAINT drugs_pediatric_verified_structure_check CHECK (
      pediatric_verification_status <> 'verified' OR (
        pediatric_use_status IS NOT NULL AND pediatric_source_url IS NOT NULL AND pediatric_verified_at IS NOT NULL AND
        ((pediatric_dose_min IS NULL AND pediatric_dose_max IS NULL) OR (pediatric_dose_unit IS NOT NULL AND pediatric_dose_basis IS NOT NULL))
      )
    ) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.drugs VALIDATE CONSTRAINT drugs_pediatric_nonnegative_check;
ALTER TABLE public.drugs VALIDATE CONSTRAINT drugs_pediatric_age_unit_check;
ALTER TABLE public.drugs VALIDATE CONSTRAINT drugs_pediatric_dose_unit_check;
ALTER TABLE public.drugs VALIDATE CONSTRAINT drugs_pediatric_basis_check;
ALTER TABLE public.drugs VALIDATE CONSTRAINT drugs_pediatric_use_status_check;
ALTER TABLE public.drugs VALIDATE CONSTRAINT drugs_pediatric_verification_check;
ALTER TABLE public.drugs VALIDATE CONSTRAINT drugs_pediatric_verified_source_check;
ALTER TABLE public.drugs VALIDATE CONSTRAINT drugs_pediatric_range_check;
ALTER TABLE public.drugs VALIDATE CONSTRAINT drugs_pediatric_verified_structure_check;

-- Re-project already-synced Sheet rows through the trigger without inventing data.
UPDATE public.drugs SET source_payload = source_payload WHERE source_payload IS NOT NULL;

COMMIT;
