# AKKPM additions · 15 October 2026

This change adds the requested medicines and every published vitamin record returned by the registry scopes, without changing the original 50-drug source or database snapshots. The read-only live registry query found 91 products for the six medicines and 69 vitamin/combination products. Their exact public rows are captured in the dated test fixtures; runtime choices continue to load from the published registry.

## Groups

- Antihistamines: Loratadine and Chloropyramine hydrochloride.
- Steroids: Dexamethasone and Methylprednisolone.
- Analgesics: Ketoprofen and Ketorolac.
- Të tjerat: 13 vitamin entries spanning multivitamins/minerals; D3; active D/calcitriol; B1; B1+B6+B12; B complex; C; B6; calcium+D3; K1; cyanocobalamin; hydroxocobalamin; folic acid/B9.

Published scopes are A11*, B03BA*, B03BB* and B02BA*, plus the current vitamin-containing A12AX products. Each current product appears exactly once in its corresponding entry. Combinations remain separate. This is a dated inventory, not a claim about sales or stock.

## Clinical formulation rules

Loratadine has separate oral-liquid and whole-tablet rules. The child syrup cohort through age 12 uses the 30-kg boundary; older patients use the older-age dose. Tablets require age 6+ and >30 kg. Severe hepatic impairment is excluded from the standard regimen. [Liquid SmPC](https://www.medicines.org.uk/emc/product/4567/smpc), [tablet SmPC](https://www.medicines.org.uk/emc/product/14580/smpc).

Dexamethasone options are restricted to croup and the conservative usual 6-month to 6-year cohort; mild/moderate oral and severe oral/parenteral single-dose regimens are separate. Whole tablets cannot be split or rounded into the prescribed dose. [RCH guideline](https://www.rch.org.au/clinicalguide/guideline_index/Croup_Laryngotracheobronchitis/).

Injection concentrations are normalized only for exact source-matched products: Kern Pharma 4 mg phosphate/mL equals 3.33 mg base/mL; Dexason 4 mg phosphate/mL equals 3.32 mg base/mL. The label strength stays visible alongside the base concentration. Other ampoules do not inherit these equivalences. [Kern AEMPS SmPC](https://cima.aemps.es/cima/dochtml/ft/67455/FT_67455.html), [Dexason ALIMS information, December 2024](https://www.alims.gov.rs/doc_file/lekovi/pil/000010495%202024%2059010%20007%20000%20515%20002%2004%20001.pdf). The base-expression convention is explicit in the [NHS presentation guidance](https://www.leedsformulary.nhs.uk/docs/Dexamethasone%20Medusa%20Poster%20-%20paediatric%20oncology.pdf).

Methylprednisolone has an oral short-course asthma option from age 1, with separate younger-child and 12+ rules. The initial IV option is for severe asthma in children over 1 year, only sodium-succinate powder formulations, with an 80-mg automated ceiling (the lower ceiling in the CPS 80–125-mg range). It does not schedule automatic six-hour repeats or infer reconstitution mL. Depot/acetate and unidentified salts do not inherit the IV scheme. [NHLBI EPR-3](https://www.nhlbi.nih.gov/sites/default/files/media/docs/asthgdln_1.pdf), [CPS Table 2](https://cps.ca/uploads/documents/Table_2._Medications_and_dosages_for_acute_asthma_treatments_by_health_care_providers_in_children_older_than_1_year_.docx_.pdf), [product precautions](https://labeling.pfizer.com/showlabeling.aspx?id=648).

Chloropyramine is distinct from chlorphenamine/CPM. Suprastin has exact-product, age-band initial IM doses from 1 month through age 14; conservative weight bands prevent a single dose exceeding the 2-mg/kg total ceiling. Synopen has its own 0.2-mg/kg single-administration option, capped at 20 mg, conservatively automated only from age 1. Repeat schedules are not inferred. Allergosan does not inherit either brand audit. Antihistamines must not delay IM adrenaline in anaphylaxis. [NNGYK/Egis January 2024 SmPC](https://ogyei.gov.hu/kiseroirat/ah/ah_0000010622_20240129155938.doc), [HALMED Synopen](https://halmed.hr/upl/lijekovi/SPC/SPC_UP-I-530-09-17-02-197.pdf).

Ketoprofen is included with an exact Ketonal forte 100-mg adult-labelled option, available only at age 18 within this pediatric interface. No routine younger-child formula is invented; lysine salt strengths are not silently treated as ketoprofen base. [HALMED](https://halmed.hr/upl/lijekovi/SPC/Ketonal-forte-SPC.pdf).

Ketorolac has an initial parenteral postoperative option from 16 years, using the injectable product information, with distinct <50-kg / ≥50-kg daily ceilings. It is restricted to published pediatric-population records, hospital supervision and normal renal function. Oral drops/tablets and unknown/adult-only product records do not inherit it; redosing remains a clinical decision. [Injectable product information](https://www.medicines.org.uk/emc/files/pil.11547.pdf).

## Vitamins

All 69 registry products are visible. This does not make all 69 suitable for weight-only dosing. Vitamin K injections, calcitriol, B12 treatment and combination products remain reference choices with specific reasons and sources when a complete product/indication regimen is unavailable. NIH nutrition fact sheets are identified as contextual references, not product SmPCs or therapeutic dosing authorities.

Only the exact Oleovit product/pipette gets a drop conversion: 400 IU/drop. Its restricted prophylaxis option starts on day 7 and ends before age 4, requires actual age plus contraindication/other-D3 confirmation, and never transfers its calibration to another D3 product. It does not calculate high-dose deficiency therapy or injectable D3. [BASG product information](https://medikamente.basg.gv.at/documents/10989__DOTC_GEBR_INFO.pdf).

Folic acid 5-mg whole tablets have a separate confirmed folate-deficiency option over age 1; B12 assessment/treatment and relevant interactions are required. This is not a general supplement dose. [SmPC](https://www.medicines.org.uk/emc/product/6998/smpc).

## UI and verification

Group headings now have a darker foreground, tinted background, visible borders and sticky position. The live browser test measures text/background contrast above 7:1. Searches include canonical names, the requested “loratidine” spelling and registry brand names. Choosing a result closes the popup; the enclosing label can no longer reopen it through a synthetic click.

The entire catalog revision includes the additions package, so a clinical-rule edit invalidates stale calculation requests. Source review never grants a calculation permission. Tests exercise every added product's grouping, every exact product fingerprint field, oral/parenteral isolation, age and weight boundaries, daily ceilings, the phosphate/base distinction and the product-specific drop calibration.

Local build and all 204 test files passed. All 20 AKKPM browser scenarios passed in each of Chromium and WebKit. Existing immutable source, original-rule parity, publication rechecks and legacy-client protection remain covered. Repository CI is required before merge.
