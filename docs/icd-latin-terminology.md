# ICD-10 Latin terminology

This repository snapshot mirrors the verified Latin terminology loaded in Supabase.

- Total `icd_codes`: **701**
- Verified medical-Latin titles: **681**
- Intentional exceptions: **20**
- Policy: English titles are never copied into `title_la`.

The exceptions are the external-cause codes W/X/Y and the newer special-purpose COVID U codes for which the adopted source set does not provide a verified medical-Latin title. Those codes continue to use the official international English title through `title_en` in search and display.

Primary provenance is retained in Supabase table `private.icd_latin_terms_v1`. The data file `data/icd-latin-verified-v1.json` is the reviewable repository snapshot.
