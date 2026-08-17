# Pediatric activation — registry #94 Faringobloc

Official product source: https://adipharm.com/en/product/faringobloc-5-mg

Verified pediatric wording for ages 4–12 years: up to 4 lozenges, taken every few hours. The product should not be used below 4 years.

MedIndex safety interpretation:

- `pediatric_max_doses_per_day = 4` is a maximum administration count only.
- `pediatric_doses_per_day` remains `NULL`; the UI must not present four routine daily doses.
- `pediatric_min_interval_hours` remains `NULL`; “every few hours” is not converted into a numeric interval.
- The existing absolute daily maximum of 4 lozenges remains the safety cap.
- The 4–12-year age range remains enforced server-side.
