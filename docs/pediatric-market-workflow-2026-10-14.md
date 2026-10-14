# Pediatric market workflow — 14 October 2026

The active calculator uses the published AKKPM registry already used by Barnat. This is a registry snapshot, not stock, sales, or an assertion that every formulation has a local pediatric license. No production database rows or original source tables were rewritten.

## Behavior and data

Drug → actual registered form → actual registered strength → indication, when needed → weight. Age is suggested and editable. Age-dependent rules require confirmation of actual age; exact neonatal day boundaries require days. Clearing weight clears age, confirmations and numerical results; the next weight starts automatic suggestion again.

Age cohorts with the same clinical indication are grouped by a fingerprinted policy. Original rules are preserved and source changes fail closed for that drug. Disjoint groups retain every original dose, frequency and cap across 8,394 exercised eligibility points. Different indications remain explicit choices. Co-amoxiclav ≥40 kg remains separate because its source eligibility overlaps the neonatal rule at physiologically implausible weights.

Supplemental reviewed routes include product-bound NORMON/Nolpaza gastro-resistant pantoprazole, oral ampicillin, IV amoxicillin infusion, IV cefuroxime and acyclovir. Domperidone's older <35 kg regimen is replaced in the active workspace with the MHRA ≥12 years AND ≥35 kg restriction. Sulcef is exclusively the selected 1 g + 1 g product, expressed as TOTAL combination mass; its neonatal cap is preserved. HEMAFER elemental iron is bound to the exact registered identity and declared Iron(III) content; volumes are daily totals. Polinoksid's repeated concentration and bag total are accepted only when the two statements and declared package volume agree; IV linezolid includes an infusion instruction and safety confirmation.

Oral, rectal, nebulized and parenteral selections cannot borrow another route's option. Modified release remains blocked unless a product/form-specific whole-tablet exception is recorded. Montelukast granules and chewable tablets have distinct age eligibility. Diclofenac's cited pediatric rectal schemes apply only to 12.5/25 mg, not 50/100 mg. No vial reconstitution volume is guessed and no tablet/suppository is automatically split or rounded.

Only the selected result's relevant warning appears in the main card; complete drug warnings and references remain in clinical details. The cetirizine infant escalation warning no longer appears as the main warning for a four-year-old. Whole-unit results show the mass of the actual whole units. The mobile age unit has enough width for its full label.

## Coverage

42/50 reference medicines have at least one registered variant with an active matching scheme; 170/269 grouped variants across 117 forms, from 737 published product rows. A supported molecule does not imply every brand, route, strength or indication is supported.

| Medicine | Published products | Variants with a scheme |
| --- | ---: | ---: |
| Amoxicillin | 36 | 10 |
| Amoxicillin + Clavulanic | 48 | 4 |
| Ampicillin | 12 | 7 |
| Cloxacillin | 0 | 0 |
| Penicillin G | 5 | 1 |
| Piperacillin + Tazobactam | 10 | 4 |
| Meropenem | 16 | 8 |
| Cotrimoxazole (TMP + SMZ) | 9 | 3 |
| Azithromycin | 31 | 6 |
| Clarithromycin | 15 | 3 |
| Levofloxacin | 35 | 2 |
| Amikacin | 5 | 3 |
| Gentamicin | 12 | 8 |
| Cefixime | 22 | 3 |
| Cefpodoxime | 6 | 3 |
| Cefoperazone | 1 | 1 |
| Cefotaxime | 2 | 1 |
| Ceftazidime | 2 | 2 |
| Ceftriaxone | 49 | 12 |
| Cefuroxime | 13 | 6 |
| Cephalexin | 6 | 4 |
| Colistin | 5 | 1 |
| Doxycycline | 6 | 2 |
| Linezolid | 3 | 1 |
| Vancomycin | 6 | 3 |
| Albendazole | 4 | 3 |
| DEC | 0 | 0 |
| Ivermectin | 0 | 0 |
| Diclofenac | 56 | 2 |
| Ibuprofen | 61 | 9 |
| Mefenamic acid | 4 | 3 |
| Paracetamol | 86 | 16 |
| Domperidone | 4 | 1 |
| Ondansetron | 11 | 7 |
| Cetirizine | 9 | 3 |
| CPM | 2 | 1 |
| Fexofenadine | 2 | 1 |
| Levocetirizine | 5 | 1 |
| Hydroxyzine | 1 | 1 |
| Acyclovir | 8 | 4 |
| Oseltamivir | 0 | 0 |
| Salbutamol | 22 | 4 |
| Levo salbutamol | 0 | 0 |
| Montelukast | 20 | 4 |
| Prednisolone | 13 | 7 |
| Pantoprazole | 55 | 4 |
| Lansoprazole | 10 | 0 |
| Ranitidine | 0 | 0 |
| Iron | 6 | 1 |
| Calcium | 3 | 0 |

## Deliberate gaps

Cloxacillin, DEC, ivermectin, oseltamivir and levo-salbutamol have no matching published registry product in this snapshot. Ranitidine remains disabled under its EMA safety audit and has no published product. The registered lansoprazole products are marked adult-only; a foreign pediatric schedule does not change that registry status. Calcium remains blocked because product-specific elemental calcium, indication and monitoring requirements are unresolved. Other unsupported variants show the relevant reason rather than an invented dose. Severe organ impairment, prematurity/PMA-dependent neonatal schedules and unverified reconstitution protocols require individual clinical review.

Clinical references support the bounded schedules; this software verification is not a documented physician acceptance of every local product. Actual patient age, indication, contraindications, local product instructions and clinical judgment remain necessary.

## Validation

Production build and the full 203-file suite passed during implementation; focused affected tests were rerun after the final presentation changes. Five AKKPM browser flows passed at 320/390/1440 px. Ninety route/viewport checks passed in each of Chromium and WebKit at 320–1920 px. Release CI must pass for the exact published commit. Browser checks use test data; physical iPhone/Android acceptance is distinct from browser-engine emulation.

## Primary sources used by supplemental policy

- https://www.medicines.org.uk/emc/product/15385/smpc
- https://www.medicines.org.uk/emc/product/15148/smpc
- https://www.medicines.org.uk/emc/product/101465/smpc
- https://cima.aemps.es/cima/dochtml/ft/71299/FichaTecnica_71299.html
- https://cima.aemps.es/cima/dochtml/ft/69548/FT_69548.html
- https://www.halmed.hr/upl/lijekovi/SPC/Nolpaza-20-mg-SPC.pdf
- https://www.krka-farma.hr/_assets/Nolpaza_40_mg_uputa_17_02_2022.cleaned.pdf
- https://www.gov.uk/drug-safety-update/domperidone-for-nausea-and-vomiting-lack-of-efficacy-in-children-reminder-of-contraindications-in-adults-and-adolescents
- https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=116d482a-f6e8-6130-e054-00144ff88e88
- https://www.medicines.org.uk/emc/product/9423/smpc
- https://www.medicines.org.uk/emc/product/102596/smpc
- https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cb64dfab-52ee-4312-bc9c-c3d04efe9109
- https://www.anm.ro/_/_PRO/PRO_8729_21.03.16.pdf
- https://www.rch.org.au/clinicalguide/guideline_index/Iron_deficiency/
- https://www.uni-pharma.gr/en/nonprescriptive/hemafer-6/
- https://www.ndf.gov.sg/about-drugs/active-ingredient/m00471/
- https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=50630775-7f76-413e-9278-ba298dd7f187

## Live reference permission repair

Production verification exposed missing SELECT privileges for the existing server-only service role on the reference snapshot and weight-age tables. Migration `20261014210426_pediatric_reference_server_read_grants.sql` grants only SELECT on those two tables. It preserves RLS and keeps anon/authenticated without SELECT; no write privilege or clinical data was changed. A real service_role read returned exactly one expected row from each of the three datasets, and the authenticated live page then loaded all 737 products. The security-advisor output was unchanged (72 informational private-table/no-policy notices and the existing password-protection warning). `scripts/verify-pediatric-reference-access.sql` repeats the read-only operational proof. See the [Supabase grants/RLS documentation](https://supabase.com/docs/guides/api/securing-your-api).

The live browser also exposed an older catalog retained under the same service-worker query key. The active reference request now includes the client build and an explicit no-cache header, so an online refresh cannot silently reuse another release’s option catalog. This was diagnosed by comparing the ordinary live response with a fresh build-specific query.
