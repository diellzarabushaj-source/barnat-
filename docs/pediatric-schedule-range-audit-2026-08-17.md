# Pediatric schedule-range audit — 2026-08-17

## Scope

This phase adds a backward-compatible distinction between:

- exact schedules: `pediatric_doses_per_day` only;
- bounded schedule ranges: `pediatric_doses_per_day` plus a larger `pediatric_max_doses_per_day`;
- PRN ceilings: `pediatric_max_doses_per_day` only.

The calculator must never choose one exact frequency when the verified source gives a range.

## Registry #95 — Mucosoft complex 500/200 mg

Official manufacturer source:

- https://adipharm.com/en/product/mukosoft-kompleks-200-mg
- patient leaflet: https://adipharm.com/storage/app/media/Products/2021/Leaflet_EN/Mucosoft%20Complex.pdf

The leaflet states one sachet 3–4 times daily at 4–6 hour intervals, but also states that 600 mg acetylcysteine/day must not be exceeded. One sachet contains 200 mg acetylcysteine, so those statements are internally inconsistent at four sachets/day.

Action:

- `pediatric_verification_status`: `verified` → `in_review`
- `pediatric_verified_at`: cleared
- no schedule was inferred or activated
- calculator remains fail-closed until the source conflict is resolved editorially

## Registry #108 — Dafurag 10 mg/mL

Official Polish medicinal-product register source:

- https://rejestrymedyczne.ezdrowie.gov.pl/api/rpl/medicinal-products/38772/characteristic

The SmPC states for children over 3 months: 5–7 mg/kg/day in 2–3 divided doses. The existing typed row already contained the verified daily dose range, concentration, normalized daily ceiling and conservative age boundary.

Action:

- `pediatric_doses_per_day = 2`
- `pediatric_max_doses_per_day = 3`
- no exact hourly interval was invented
- `pediatric_interval_hours` remains NULL
- `pediatric_min_interval_hours` remains NULL

The calculation engine evaluates both schedule endpoints and returns a per-dose envelope while preserving the verified daily total. `dosesPerDay` remains null in the public calculation result so the server does not present 2 or 3 as a single prescribed frequency.

## Guardrails

- Existing fixed schedules remain unchanged.
- Existing PRN ceilings remain ceilings only.
- A range combined with a separate exact interval is rejected.
- Continuous infusions cannot use administration-count semantics.
- Primary regimen binding remains mandatory and server-side.
