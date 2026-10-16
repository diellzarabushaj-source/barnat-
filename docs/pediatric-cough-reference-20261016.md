> Historical release record. Current coverage and follow-up decisions: [17 October source review](pediatric-cough-source-review-20261017.md).

# Cough references — 16 October 2026

The additive market overlay includes every **published** registry row with an R05 ATC code, plus the theophylline/guaifenesin combination R03DA54 and the paracetamol/guaifenesin cold combination N02BE51. The read-only production inventory returned 80 distinct products. Each belongs to exactly one of 32 entries in five separate groups. The snapshot is `tests/fixtures/pediatric-cough-akkpm-products-20261016.json`; unpublished products and supplements outside this registry are outside this coverage claim.

The original 50-drug source and audit are unchanged. These references use published AKKPM forms and strengths plus separately reviewed official SmPCs and manufacturer leaflets. An international reference is not a claim that the same pediatric indication is licensed for every Kosovo brand. Actual age, relevant clinical conditions and the exact product leaflet must be confirmed in the existing workflow. Weight-derived age remains a suggestion.

## Automatic schemes

| Entry | Scoped presentation | Reference and limits |
| --- | --- | --- |
| Acetylcysteine | Oral 20 mg/mL after preparation | AEMPS Fluimucil pediátrico; age 2–7 inclusive and over 7 have separate fixed doses. No transfer to 40 mg/mL. |
| Acetylcysteine | Normon 600 mg dispersible tablet | Exact product fingerprint; over 7 only; whole tablet. No transfer to capsules, sachets or 1200 mg tablets. |
| Ambroxol hydrochloride | Oral 3 and 6 mg/mL | Separate AEMPS Mucibrón / Mucibrón forte schemes from age 2. The over-12 schedule differs between concentrations. Ambiguous salt identities and the dual oral/nebulizer presentation have no automatic scheme. |
| Bromhexine | Syrup 0.8 mg/mL | AEMPS Bisolvon Infantil, ages 2–12 inclusive. No drops or injection transfer. |
| Carbocisteine | Oral 50 mg/mL | Product 13091 SmPC/PIL; ages 6–12 and initial dose over 12. Preschool boundary wording differs between the SmPC and PIL, so no automatic scheme below 6. Lysine salt remains separate. |
| Butamirate citrate | Syrup 1.5 mg/mL | HALMED Sinecod SmPC from age 3. |
| Butamirate citrate | Omnitus syrup 0.8 mg/mL | Exact product; ALIMS January 2025 PIL/SmPC. Frequency changes at age 9. The older 2019 schedule is not used. No modified-release tablet transfer. |
| Levodropropizine | Oral 6 mg/mL | AEMPS Angituss; at least 2 years and 10 kg, 1 mg/kg/dose, at most 60 mg per dose and 3 doses/24 hours, interval at least 6 hours. Ages 2–6 require medical supervision. |
| Hedera helix | Herbion Ivy 7 mg/mL syrup | Exact product/extract fingerprint; Krka leaflet. From age 2, separate 2–5, 6–11 and 12+ bands. |
| Hedera helix | Prospan 0.7 g/100 mL syrup | Exact product/extract fingerprint; Engelhard leaflet. From age 2 under the stricter EMA restriction; frequency differs from Herbion at age 12. No transfer to other extracts or effervescent tablets. |

There are 11 presentation-specific options across seven substances. Full source links, eligibility notes, daily ceilings and required confirmations are stored with each option in `data/pediatric-cough-reference-v1.json`. Product fingerprints cover registry number, brand, substance, ATC, strength, form, packaging and population. A changed identity revokes the product-specific option.

## Entries without automatic dosing

All registered presentations remain discoverable by substance, category or brand. Dextromethorphan, oxolamine, cloperastine, other herbal extracts and multi-ingredient cold products require their own complete current product regimen; no dose is inferred from a percentage, a salt mass, a different extract or one component. The Maltese Diacol record is an identity reference only and does not determine Kosovo authorization status. General MHRA cough/cold advice is context, not a product dosing authority.

Codeine-containing products do not offer an automatic pediatric cough dose. Dornase alfa is clearly identified as specialist cystic-fibrosis therapy. Viburcol is identified as homeopathic and has no validated automatic cough regimen. Their presence in the registry does not imply routine cough treatment or efficacy.

Granules and dry powder sachets are not presented as ready-to-use syrup. The dual oral/nebulizer solution, injections, rectal products, oral drops and modified-release tablets keep separate route/form gates. No reconstitution volume or drop calibration is guessed.

## Verification

`tests/pediatric-cough-reference-test.js` checks inventory coverage, ATC partitions, age boundaries, concentration conversions, dose ceilings, product identity changes, route separation, reference-only exclusions, required confirmations, legacy-client protection and source immutability. `tests/pediatric-cough-browser.spec.js` exercises brand/category search, all five groups, calculations, cleared/re-entered weight, under-age blocking and route isolation at 320, 390 and 1440 px in Chromium and WebKit.
