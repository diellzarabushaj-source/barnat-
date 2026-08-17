-- MedIndex pediatric PRN safety extension — applied to Neon main on 2026-08-17.
--
-- These fields intentionally remain outside the original 30-field Sheet1!U:AX
-- projection. They model safety limits (maximum administrations / minimum
-- interval), not a routine administration schedule. Do not map them onto
-- pediatric_doses_per_day or pediatric_interval_hours.

ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_max_doses_per_day numeric;
ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS pediatric_min_interval_hours numeric;

ALTER TABLE public.drugs ADD CONSTRAINT drugs_pediatric_max_doses_per_day_positive
  CHECK (pediatric_max_doses_per_day IS NULL OR pediatric_max_doses_per_day > 0) NOT VALID;
ALTER TABLE public.drugs ADD CONSTRAINT drugs_pediatric_min_interval_hours_positive
  CHECK (pediatric_min_interval_hours IS NULL OR pediatric_min_interval_hours > 0) NOT VALID;

ALTER TABLE public.drugs VALIDATE CONSTRAINT drugs_pediatric_max_doses_per_day_positive;
ALTER TABLE public.drugs VALIDATE CONSTRAINT drugs_pediatric_min_interval_hours_positive;
