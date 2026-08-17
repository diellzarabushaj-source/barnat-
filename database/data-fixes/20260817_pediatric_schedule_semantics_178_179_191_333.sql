-- MedIndex pediatric schedule semantics fix — registries #178, #179, #191, #333.
-- Applied to Neon main on 2026-08-17 and kept here as an idempotent audit/recovery record.
--
-- Safety rule:
-- - "up to N administrations/day" is a maximum administration count, not a routine schedule;
-- - "minimum interval X hours" is a safety interval, not an exact repeating qXh prescription;
-- - therefore these limits live in pediatric_max_doses_per_day / pediatric_min_interval_hours.

-- REGLAN tablet — pediatric metoclopramide: up to 3 administrations/day,
-- with a minimum 6-hour interval between administrations.
-- Official SmPC: https://www.medicines.org.uk/emc/product/6213/smpc
UPDATE public.drugs
SET
  pediatric_doses_per_day = NULL,
  pediatric_interval_hours = NULL,
  pediatric_max_doses_per_day = 3,
  pediatric_min_interval_hours = 6
WHERE registry_number = 178
  AND trade_name = 'REGLAN®'
  AND pediatric_verification_status = 'verified'
  AND pediatric_primary_regimen_id = 'card:178:pediatric'
  AND pediatric_source_url = 'https://www.medicines.org.uk/emc/product/6213/smpc';

-- REGLAN oral solution — same pediatric administration ceiling / minimum interval.
-- Official SmPC: https://www.medicines.org.uk/emc/product/2471/smpc
UPDATE public.drugs
SET
  pediatric_doses_per_day = NULL,
  pediatric_interval_hours = NULL,
  pediatric_max_doses_per_day = 3,
  pediatric_min_interval_hours = 6
WHERE registry_number = 179
  AND trade_name = 'REGLAN®'
  AND pediatric_verification_status = 'verified'
  AND pediatric_primary_regimen_id = 'card:179:pediatric'
  AND pediatric_source_url = 'https://www.medicines.org.uk/emc/product/2471/smpc';

-- PARACETAMOL ALKALOID tablet — every 4–6 hours as necessary, maximum 4 doses/24h.
-- The lower end of the verified interval is stored only as a minimum safety interval.
-- Official SmPC: https://www.medicines.org.uk/emc/product/100828/smpc
UPDATE public.drugs
SET
  pediatric_doses_per_day = NULL,
  pediatric_interval_hours = NULL,
  pediatric_max_doses_per_day = 4,
  pediatric_min_interval_hours = 4
WHERE registry_number = 191
  AND trade_name = 'PARACETAMOL ALKALOID'
  AND pediatric_verification_status = 'verified'
  AND pediatric_primary_regimen_id = 'card:191:pediatric'
  AND pediatric_source_url = 'https://www.medicines.org.uk/emc/product/100828/smpc';

-- Neximol paracetamol IV — minimum 4-hour interval and no more than 4 doses/24h.
-- Official SmPC: https://www.medicines.org.uk/emc/product/15148/smpc
UPDATE public.drugs
SET
  pediatric_doses_per_day = NULL,
  pediatric_interval_hours = NULL,
  pediatric_max_doses_per_day = 4,
  pediatric_min_interval_hours = 4
WHERE registry_number = 333
  AND trade_name = 'Neximol'
  AND pediatric_verification_status = 'verified'
  AND pediatric_primary_regimen_id = 'card:333:pediatric'
  AND pediatric_source_url = 'https://www.medicines.org.uk/emc/product/15148/smpc';
