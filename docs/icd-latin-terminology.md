# ICD-10 Latin terminology

The Supabase `public.icd_codes` table is fully populated in `title_la`.

- Total `icd_codes`: **701**
- Latin titles populated: **701 / 701 (100%)**
- Published-source medical-Latin titles: **681**
- Explicitly curated Neo-Latin titles: **20**
- Missing Latin titles: **0**

## Provenance policy

Published Latin terminology is preferred whenever an adopted source provides a Latin field or Latin descriptor. The remaining 20 codes did not expose a Latin field in the adopted official datasets; those entries are labeled in Supabase as **DRX curated medical Latin** rather than being misrepresented as official WHO/ICD Latin.

English titles are never silently copied into `title_la`.

Primary provenance is stored in `private.icd_latin_terms_v1`. The repository snapshot is `data/icd-latin-verified-v1.json`.

## Reference datasets

The project also keeps the structured ICD-10-SE 2026 Latin-bearing export as an audit reference where the authority explicitly publishes a `Latin` column.
