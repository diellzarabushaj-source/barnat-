# Recetat — chapters 6–10

Compared all 136 published guides with a fresh, format-preserving DOCX export
of the [canonical prescription document](https://docs.google.com/document/d/119EyMzSHYV2SVYXLo6_P2EgkI_8Hukw_uNDvGuewyNg/edit).
The export SHA-256 is `1f074c752fc6547175b394eada495d98711607e6c518c77433953bcf560a6b46`.

| Chapter | Guides |
| --- | ---: |
| 6 — Pulmonology | 25 |
| 7 — Cardiovascular disease | 21 |
| 8 — Gastroenterology | 37 |
| 9 — Hepatology | 21 |
| 10 — Endocrinology | 32 |

## Source corrections

Prepared corrections for 124 guides, accounting for all 2,697 source paragraphs
in their original order. The importer uses exact title alignment, explicit
assertions for known split artifacts and source-wide coverage checks. It does
not infer missing doses. Twelve fragments incorrectly promoted to items are
removed, including split heparin, bisoprolol, semaglutide and ticagrelor
instructions and incomplete combination-product names. The original full
instructions replace the truncated values.

Eleven missing structured items are restored in bronchiectasis maintenance and
fecal impaction. This includes nine medicine/procedure entries and two source
annotations; annotations with incomplete dosing remain annotations. Source
headings, thresholds, signs, combination strengths and separate support
paragraphs are restored. Multi-paragraph block notes retain their line breaks
in the reader and their content in source-to-draft transfer.

Document IDs, retained item/block keys, relationships and clinical review
status are preserved. Only `title`, `sourceHeading` and `logicBlocks` are
patched, guarded by the revision that was read. Prior field values are kept in
the local repair artifact for rollback. Draft readback must match the prepared
fields before publication. Re-running conversion produces no further changes.

A final connector audit corrects relationships and selection metadata across
33 of those guides: 19 relationship/label changes and 33 stale selection flags.
Exact
source connectors determine their semantics: DHE means conjunction, OSE means
an alternative, and NËSE/PËR/KUR introduce conditions. PASTAJ remains a
sequential step instead of inheriting an obsolete condition. Conjunctions and
conditions clear stale "choose one" flags. Regression checks cover the displayed
connector, underlying relationship and selection behavior.

The reader uses a structured prescription model with text fields. This audit
checks source text, signs, paragraph boundaries and reading order; it is not a
claim that all DOCX typographic styling is represented by that model.

## Confirmed source problems requiring clinical review

Fourteen guides contain the following confirmed conflicts or obsolete guidance.
The original remains readable with an authoritative reference; source-to-draft
transfer is blocked. Matching depends on the problematic content and group
context, so correcting the source removes the obsolete warning. No replacement
patient regimen is selected automatically and no CMS review status is promoted.

| Topic | Reference and finding |
| --- | --- |
| CAP doxycycline | [NICE NG250](https://www.nice.org.uk/guidance/NG250/chapter/recommendations): source 200 mg BD conflicts with the CAP regimen. |
| Enoxaparin | [Clexane SmPC, sections 2 and 4.2](https://www.medicines.org.uk/emc/product/4499/smpc): 100 IU/kg is not 1.5 mg/kg; treatment and prophylaxis are different indications. |
| Fondaparinux | [Arixtra SmPC](https://www.medicines.org.uk/emc/product/3335/smpc): source 5–10 mg is labelled as thromboprophylaxis although it is a treatment dose range. |
| Vancomycin | [IDSA/ASHP consensus](https://www.idsociety.org/practice-guideline/vancomycin/): historical trough units are mg/L, not mg/mL; serious MRSA monitoring now emphasizes AUC. |
| Tirofiban | [SmPC, section 4.2](https://www.medicines.org.uk/emc/product/8842/smpc): the source 0.25 mcg/kg bolus conflicts with the PCI bolus regimen. |
| Ivabradine | [SmPC, section 4.2](https://www.medicines.org.uk/emc/product/101787/smpc): source OD conflicts with twice-daily administration. |
| Endocarditis prophylaxis | [AHA prevention card](https://www.heart.org/-/media/Files/Health-Topics/Infective-Endocarditis/Infective-Endocarditis-Wallet-Card.pdf): clindamycin is no longer recommended for dental prophylaxis. |
| HAV post-exposure prophylaxis | [CDC clinical care](https://www.cdc.gov/hepatitis-a/hcp/clinical-care/): GamaSTAN guidance uses 0.1 mL/kg, whereas the source says 0.01 mL/kg. Product and patient eligibility must be checked. |
| HCV combinations | [AASLD/IDSA](https://www.hcvguidelines.org/guidance/treatment-naive-genotype-3-with-compensated-cirrhosis/): adult glecaprevir/pibrentasvir uses three 100/40 mg tablets daily; the source also overgeneralizes the restriction on sofosbuvir/velpatasvir in genotype 3. |
| Obeticholic acid | [EMA Ocaliva](https://www.ema.europa.eu/en/medicines/human/EPAR/ocaliva): the EU authorization was revoked; the source also includes advanced-cirrhosis dosing. This does not establish Kosovo registration status. |
| Insulin regular / premix | The source says BD while describing administration before three meals; this internal conflict needs resolution. |
| DKA/HHS insulin and potassium | [2024 consensus](https://doi.org/10.2337/dci24-0032): insulin is prescribed in units/kg, not mg/kg. Potassium thresholds and the whole protocol need review together. |

These checks are targeted protections, not an independent certification of all
other clinical regimens in the book. The clinical reviewer must resolve the
fourteen flagged guides against the cited references and patient context.

## Validation

- Complete production build and all 207 project test files passed.
- All 36 Recetat Chromium/WebKit cases passed, including chapters 6–10,
  paragraph preservation, alternative/condition visibility, narrow screens,
  draft handoff and blocked clinical conflicts.
- Both DOCX conversion regression suites passed; CI now runs them explicitly.
- Independent ordered source-coverage and rendering checks passed for all
  136 guides, 952 items and 936 primary signaturas. Additional signaturas
  remain in separate source-note paragraphs.

Reproduce without CMS writes:

```text
python scripts/import-medical-hub-docx.py fresh-source.docx existing-guides.json repairs.json --prescription-repairs --prescription-chapters 6-10 --source-document-id 119EyMzSHYV2SVYXLo6_P2EgkI_8Hukw_uNDvGuewyNg
python tests/prescription-chapters-6-10-import-test.py
node tests/recetat-source-transfer-test.js
```
