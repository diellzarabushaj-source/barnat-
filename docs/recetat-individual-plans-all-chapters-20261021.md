# Recetat: individual plans and whole-library reconciliation

Date: 2026-10-21

The two reported diabetes pages now present usable treatment structure. T1DM MDI separates basal glargine from mealtime aspart and requires the clinician to enter each patient's doses. T2DM dual therapy presents one additional drug at a time, with renal dosing and comorbidity context. Individualized references throughout the reader offer an empty prescription workspace with the diagnosis, rather than a disabled reference-only button.

## Scope and source fidelity

- Compared all 574 published prescription documents against the current format-preserving canonical Rx DOCX export. The overlapping chapter batches were deduplicated to 574 documents; no original source edits were required.
- Read the relevant formatted book tables and surrounding paragraphs for the diabetes regimens. Original source words, group order, doses, connectors, identifiers and editorial status remain unchanged, accessible through the question-mark disclosure.
- The source DOCX SHA-256 is `99b014c6c8d0dee4b0236dffd383483de0e3c963cf12958e42ea6ee8b238276b`. The book DOCX SHA-256 is `fea98125ff003559688c36716cd4350fdb44bc67de1bd6cd0d4dc91d97b762e3`. Fresh connected-document metadata was unchanged since these format-preserving exports. Full private sources and comparison outputs remain outside the repository.
- Source fidelity is not independent clinical approval. This release adds specific documented clinical corrections and preserves individual prescribing decisions.

## Clinical changes

1. **10.1 and 10.2, adult T1DM MDI:** glargine U100 once daily plus aspart U100 before meals. Basal, breakfast, lunch and dinner doses are separate clinician-entered values in units. No patient dose is inferred from the book's example or from weight. This model is limited to the specified SoloStar/FlexPen products and regular meals; the 80/60-unit limits and whole-unit steps are device delivery limits, not recommended doses. Pediatric, pregnancy, pump, DKA, fasting and split-injection plans require their appropriate workflow.
2. **10.3, adult T1DM premix:** a separate twice-daily human isophane/soluble 70/30 model when MDI is not possible and premix has been chosen. Morning and evening doses are entered individually. It does not append premix to three daily regular-insulin injections or to MDI.
3. **10.5, T2DM add-on therapy:** explicit empagliflozin, renal-band sitagliptin or selected glimepiride alternatives; existing metformin is a separate review step. Correct single-ingredient sitagliptin reference replaces the unrelated combination-product link. The source HbA1c threshold is not presented as a universal escalation rule. GLP-1/tirzepatide duplication, renal limits and ASCVD/HF/CKD/obesity context are stated.
4. **58 previously guarded verified guides in chapters 16–22:** fingerprint-bound clarification overlays for known product, route, unit or indication conflicts. Examples include enoxaparin SC/IU conversion, brinzolamide 1%, pregnancy candidiasis, HBV pregnancy prophylaxis, PID combination/duration, leuprorelin product/interval, neonatal GIR units, pediatric paracetamol weight bands, cefaclor daily totals, vancomycin per-dose units, phenytoin concentration, rabies product-specific volume and tetanus treatment versus wound prophylaxis. These remain individualized planning references, with no automatic source-drug transfer.
5. **All 197 individualized plans:** numbered, colored, compact cards and an enabled “Ndërto recetën” action. The action copies the diagnosis only into an empty composer. It never copies the source therapy or replaces an occupied draft.

Current full-library rendering: **133 structured plans, 197 individualized references, 244 original-source entries**. The 244 include three already-pending source imports in chapter 16; their editorial gate remains in place. No pending content was promoted by this release.

## Primary references

- [NICE NG17, adult T1DM recommendations](https://www.nice.org.uk/guidance/ng17/chapter/Recommendations)
- [NICE NG28, further T2DM treatment choices](https://www.nice.org.uk/guidance/ng28/resources/visual-summary-choosing-medicines-for-further-treatment-pdf-10956472093)
- [Lantus SmPC](https://www.medicines.org.uk/emc/product/8098/smpc), [EMA Lantus product information and SoloStar limits](https://www.ema.europa.eu/en/documents/product-information/lantus-epar-product-information_en.pdf)
- [NovoRapid SmPC](https://www.medicines.org.uk/emc/product/7920/smpc), [EMA NovoRapid product information and FlexPen limits](https://www.ema.europa.eu/en/documents/product-information/novorapid-epar-product-information_en.pdf)
- [Humulin M3 KwikPen SmPC](https://www.medicines.org.uk/emc/product/8191/smpc)
- [Sitagliptin SmPC](https://www.medicines.org.uk/emc/product/14073/smpc), [glimepiride SmPC](https://www.medicines.org.uk/emc/product/10742/smpc), [EMA Jardiance product information](https://www.ema.europa.eu/en/documents/product-information/jardiance-epar-product-information_en.pdf)
- [CDC PID](https://www.cdc.gov/std/treatment-guidelines/pid.htm), [CDC pregnancy candidiasis](https://www.cdc.gov/std/treatment-guidelines/candidiasis.htm), [CDC trichomoniasis](https://www.cdc.gov/std/treatment-guidelines/trichomoniasis.htm)
- [WHO 2024 hepatitis B pregnancy prophylaxis](https://www.ncbi.nlm.nih.gov/books/NBK615001/table/fm-ch2.tab4/)
- [Paracetamol IV SmPC](https://www.medicines.org.uk/emc/product/100803/smpc), [cefuroxime SmPC](https://www.medicines.org.uk/emc/product/3814/smpc), [cefaclor SmPC](https://www.medicines.org.uk/emc/product/15786/smpc), [vancomycin SmPC](https://www.medicines.org.uk/emc/product/15736/smpc), [NICE lower UTI dosing](https://www.nice.org.uk/guidance/ng109/chapter/Recommendations)
- [CDC rabies PEP](https://www.cdc.gov/rabies/hcp/clinical-care/post-exposure-prophylaxis.html), [CDC tetanus treatment](https://www.cdc.gov/tetanus/hcp/clinical-care/index.html)

Each new clarification includes its corresponding primary reference in the application's question-mark disclosure. Unidentified product concentrations, individualized insulin doses and specialist regimens are not replaced with guessed values.

## Verification

- Read-only source comparison: all 574 documents, zero source edits.
- Full-library render and binding audit: 574 rendered; exact expected dispositions; no source-fingerprint mismatch; only the three existing pending source imports retain unresolved legacy gates.
- All 197 individual plans render the manual action and transfer no therapy. A modified source fingerprint or pending editorial status cannot inherit the correction.
- Insulin tests cover distinct meal doses, confirmation, deletion, invalid strings, whole-unit increments, product-device limits, premix separation and cached-reader rejection. Readers older than `clinical-v3` cannot receive patient-dose templates as executable plans.
- The complete local suite passed: 211 test files. Build and deployment-contract checks passed.
- All 84 browser cases passed across Chromium and WebKit, including 320/390-pixel mobile and desktop checks. The insulin cases check live dose-card updates, focus preservation, deletion, invalid entries and exact draft units. Cross-chapter manual-plan cases check that an occupied draft and its diagnosis remain unchanged.
- Browser verification and deployment results are recorded in the release proof outside the repository.

The audit does not certify every one of the 574 source regimens as universally appropriate. Patient-specific plans remain explicit, and the three pending editorial imports remain unpublished in the verified library.
