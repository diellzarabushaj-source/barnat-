# Recetat — chapters 10–15

Compared 149 published guides with a fresh DOCX export of the
[canonical prescription document](https://docs.google.com/document/d/119EyMzSHYV2SVYXLo6_P2EgkI_8Hukw_uNDvGuewyNg/edit).
Export SHA-256: `99b014c6c8d0dee4b0236dffd383483de0e3c963cf12958e42ea6ee8b238276b`.

| Chapter | Guides checked | Guides corrected |
| --- | ---: | ---: |
| 10 — Endocrinology | 32 | 0 |
| 11 — Nephrology / Urology | 13 | 11 |
| 12 — Hematology | 18 | 13 |
| 13 — Rheumatology | 24 | 20 |
| 14 — Neurology | 38 | 32 |
| 15 — Psychiatry | 24 | 19 |
| Total | 149 | 95 |

## Source repairs

All 2,418 non-Rx source paragraphs are accounted for in their original order.
Chapter 10 remains unchanged after the earlier audit. Ten fragments incorrectly
promoted to independent steps are removed; complete instructions replace their
truncated versions. These include iron-carboxymaltose weight thresholds,
prednisolone tapering, lithium titration, gabapentin/carbamazepine dose ranges,
aducanumab escalation, eculizumab maintenance and antiseizure instructions.
Eleven source-note headings containing only PËR or DHE regain their full source
wording. Separate S. paragraphs remain separate block notes.

Eight body paragraphs in Hematology were styled as Heading 4 in the DOCX.
Their exact text and multiplicity are asserted before treating them as body
content. They do not create eight false lessons. Unrecognized embedded headings,
tables, images and equations fail conversion explicitly rather than disappearing.

The read-only converter reuses the tested alignment engine through an explicit
chapter profile. It retains document IDs, item/block keys, relationships and
review statuses. Only title, sourceHeading and logicBlocks are eligible for
revision-guarded patches. Each draft must match the prepared fields before
publication; published readback must match again. Prior field values remain in
the local repair artifact for rollback. Repeating conversion produces zero edits.

This structured prescription model stores plain text. The checks establish text,
punctuation, paragraph and reading-order fidelity, not full DOCX typography.

## Clinical issues kept separate from transcription repairs

Twelve guides in this scope are blocked from source-to-draft transfer: three
already flagged in chapter 10 and nine in chapters 13–15. Original text remains
readable with references. No replacement patient regimen is selected, and no
CMS review status is promoted. These are targeted protections, not clinical
certification of every other regimen or a statement of Kosovo registration.

| Guide | Finding and reference |
| --- | --- |
| 10.3, 10.23, 10.25 | Existing insulin frequency/unit and potassium conflicts; see the [earlier audit](recetat-chapters-6-10-audit-20261019.md). |
| 13.12 | Infliximab induction and maintenance calendar differs from the standard RA schedule; [Remicade SmPC 4.2](https://www.medicines.org.uk/emc/product/3831/smpc). Individual escalation needs specialist review. |
| 13.13 | Colchicine every 2–3 hours conflicts with the current low-dose regimen, pause and course limit; [SmPC 4.2](https://www.medicines.org.uk/emc/product/100968/smpc). |
| 13.22, 14.29 | Enoxaparin 100 IU/kg is incorrectly equated to 1.5 mg/kg; [Clexane SmPC 2 / 4.2](https://www.medicines.org.uk/emc/product/4499/smpc). |
| 14.1, 14.10 | Source allows 60 mg IV ketorolac; the referenced product describes doses up to 30 mg. Route and patient limits require review; [Toradol SmPC 4.2](https://www.medicines.org.uk/emc/product/14193/smpc). IM text is not reinterpreted as IV. |
| 14.26 | Historical aducanumab regimen requires product/indication reassessment after [Biogen discontinued ADUHELM development and commercialization](https://investors.biogen.com/news-releases/news-release-details/biogen-realign-resources-alzheimers-disease-franchise). That announcement did not attribute the decision to safety or efficacy. |
| 15.2 | Diazepam dilution into 8 mL saline conflicts with the referenced injection instructions; injection and infusion must be distinguished. [Diazepam Injection BP SmPC 4.2 / 6.2](https://www.medicines.org.uk/emc/product/6274/smpc). |
| 15.13 | Lamotrigine is listed during mania treatment, whereas [NICE CG185 1.5.12](https://www.nice.org.uk/guidance/cg185/chapter/recommendations) advises against it for mania. The distinct bipolar-depression indication is not blocked by this check. |

## Validation

- Production build and the complete project test suite passed.
- All 40 Recetat Chromium/WebKit cases passed across phone and desktop sizes.
  Coverage includes chapters 6–15, full source-note headings, alternatives,
  paragraph breaks, no horizontal overflow and blocked route/indication conflicts.
- DOCX importer, chapters 6–10 and chapters 10–15 conversion regressions passed.
- Independent ordered-source coverage and repeat-conversion checks passed.
- Every rendered guide was checked: 149 guides, 865 items, 843 primary
  signaturas; additional signaturas remain in source-note paragraphs.

Reproduce the read-only conversion:

```text
python scripts/import-medical-hub-docx.py fresh-source.docx existing-guides.json repairs.json --prescription-repairs --prescription-chapters 10-15 --source-document-id 119EyMzSHYV2SVYXLo6_P2EgkI_8Hukw_uNDvGuewyNg
python tests/prescription-chapters-10-15-import-test.py
node tests/recetat-source-transfer-test.js
```
