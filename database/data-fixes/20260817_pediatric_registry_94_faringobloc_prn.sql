-- MedIndex pediatric activation — registry #94 Faringobloc.
-- Official source: https://adipharm.com/en/product/faringobloc-5-mg
-- Children 4–12 years: up to 4 lozenges, every few hours.
-- Safety rule: 4/day is a maximum administration count, not a routine schedule.
-- The source does not provide a numeric interval, so no interval is inferred.

UPDATE public.drugs
SET
  pediatric_max_doses_per_day = 4,
  pediatric_min_interval_hours = NULL,
  pediatric_doses_per_day = NULL,
  pediatric_interval_hours = NULL
WHERE registry_number = 94
  AND trade_name = 'Faringobloc'
  AND pediatric_verification_status = 'verified'
  AND pediatric_primary_regimen_id = 'card:94:pediatric'
  AND pediatric_source_url = 'https://adipharm.com/en/product/faringobloc-5-mg'
  AND pediatric_min_age_value = 4
  AND pediatric_min_age_unit = 'vjet'
  AND pediatric_max_age_value = 12
  AND pediatric_max_age_unit = 'vjet'
  AND pediatric_max_daily_value = 4
  AND pediatric_max_daily_unit = 'pastila';
