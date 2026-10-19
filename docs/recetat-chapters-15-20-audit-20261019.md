# Recetat — chapters 15–20

Compared all 137 existing guides with the current canonical
[prescription source](https://docs.google.com/document/d/119EyMzSHYV2SVYXLo6_P2EgkI_8Hukw_uNDvGuewyNg/edit).
Drive metadata still reports modification `2026-09-03T07:58:31.293Z`, matching
the fresh DOCX export already obtained on 19 October. That format-preserving
export has SHA-256 `99b014c6c8d0dee4b0236dffd383483de0e3c963cf12958e42ea6ee8b238276b`.

| Chapter | Existing guides checked | Corrected | New references awaiting clinical review |
| --- | ---: | ---: | ---: |
| 15 — Psychiatry | 24 | 0 | 0 |
| 16 — Dermatology | 41 | 39 | 3 |
| 17 — General surgery | 14 | 14 | 0 |
| 18 — Ophthalmology | 15 | 13 | 0 |
| 19 — ENT | 26 | 26 | 0 |
| 20 — Neuro-Spine Surgery | 17 | 17 | 0 |
| Total | 137 | 109 | 3 |

## Source repairs

All 140 source sections and 3,334 non-Rx paragraphs are accounted for in their
original order. Chapter 15 needs no further transcription edits after the earlier
audit. Ten fragments incorrectly promoted to independent steps are removed;
complete source instructions replace the truncated versions. These include
scabies retreatment, antifungal durations, burn fluid instructions, chemical-eye
irrigation, mannitol administration and incomplete source annotations.

Sixteen truncated or displaced source-note headings regain their complete
wording. This also prevents a generic DHE/OSE heading from matching a later
connector and incorrectly attaching preceding instructions to another step.
The exact compound connector PLUS/MUND TË KOMBINOHET retains its wording and
additive relationship. Separate S. paragraphs remain separate notes.

The converter retains existing IDs, item/block keys, document links and review
statuses. Only title, sourceHeading and logicBlocks are patched with revision
guards. Prior field values remain in the local repair artifact for rollback.
Repeating conversion produces zero changes and zero duplicate references.
Unsupported tables, images and equations fail explicitly. This plain-text
prescription model preserves text, punctuation and paragraph order; it does not
represent every typographic property of the DOCX.

## Missing source sections

Three genuine Dermatology sections were absent from the CMS:

- 16.42 — SJS/TEN: gastroprotection and oral involvement.
- 16.43 — SJS/TEN: ocular/urogenital involvement and infection.
- 16.44 — Sunburn.

Their stable IDs are `dod-rx-source-ch16-042`, `dod-rx-source-ch16-043` and
`dod-rx-source-ch16-044`. They are prepared as source-only references with
`reviewStatus: source-imported`. No drug identity or dose field is inferred and
no clinical status is automatically promoted. Existing verified-only treatment
and search queries remain unchanged: these references await clinical approval
before appearing as approved prescriptions. Defense-in-depth also blocks an
unapproved reference from source-to-draft transfer if it is passed to the reader.

## Clinical issues requiring review

Sixteen existing guides have targeted clinical review flags; three additional
source-imported references remain unapproved. Original text remains readable,
with authoritative references, while source-to-draft transfer is blocked.
These checks are not independent clinical certification of the other regimens.

| Guide | Finding and reference |
| --- | --- |
| 15.2, 15.13 | Existing diazepam dilution and mania/lamotrigine conflicts from the [previous audit](recetat-chapters-10-15-audit-20261019.md). |
| 16.4 | The printed prednisolone range 5 mg–1 mg is ambiguous. It is not silently changed into a weight-based dose; the original document and dermatologist must resolve the intended regimen. |
| 16.31 | Oral ketoconazole for hirsutism needs specialist indication and hepatic-risk review. [Ketoconazole Esteve SmPC](https://www.medicines.org.uk/emc/product/101076/smpc) describes endogenous Cushing treatment and monitoring. This does not prohibit every off-label use or establish Kosovo registration status. |
| 16.40 | Enoxaparin 100 IU/kg is incorrectly equated to 1.5 mg/kg; [Clexane SmPC 2 / 4.2](https://www.medicines.org.uk/emc/product/4499/smpc). The matching now includes the source's parenthetical word ose. |
| 17.13, 17.14 | Enoxaparin is printed as IM; [Clexane SmPC 4.2](https://www.medicines.org.uk/emc/product/4499/smpc) prohibits intramuscular administration. |
| 18.15 | Brinzolamide 0.1% conflicts with [AZOPT SmPC](https://www.medicines.org.uk/emc/product/3819/smpc), 10 mg/mL (1%); the angle-closure indication also needs ophthalmology review. No automatic substitution occurs. |
| 19.15 | Topical tobramycin in CSOM needs ENT review of perforation and ototoxic risk. The [AAO-HNS AOE guideline](https://aao-hnsfjournals.onlinelibrary.wiley.com/doi/10.1177/0194599813517083) calls for a non-ototoxic preparation with known/suspected perforation. Applying that safety principle here is an inference, not a claim that this is a CSOM treatment guideline. |
| 19.26 | Routine diazepam in BPPV needs review against [AAO-HNS recommendations](https://www.entnet.org/resource/aao-hnsf-updated-cpg-bppv-press-release-fact-sheet/), which advise against routine vestibular suppressants. |
| 20.10–13, 20.16–17 | Diazepam dilution into 8 mL saline conflicts with the referenced injection instructions. [Diazepam Injection BP SmPC 4.2 / 6.2](https://www.medicines.org.uk/emc/product/6274/smpc) distinguishes undiluted injections from large infusions. Product-specific review is required. |

## Validation

- Production runtime build and all 207 project test files passed.
- All 40 Recetat Chromium/WebKit cases passed on phone and desktop, including
  full content through chapter 20, note headings, alternatives, paragraph breaks,
  no horizontal overflow and blocked unapproved references.
- All prescription conversion scopes passed their regression suites; the new
  scope checks stable IDs, unchanged statuses, new-reference approval gates,
  unsupported structures, exact compound connectors and repeated conversion.
- Independent ordered-source coverage passed for all 3,334 source paragraphs.
- Every guide was rendered and checked: 140 sections, 1,205 items and 1,106
  primary signaturas; additional signaturas remain in separate source notes.
- CMS publication requires exact draft readback and published readback, including
  unchanged review statuses and the three references' source-imported status.

Reproduce without CMS writes:

```text
python scripts/import-medical-hub-docx.py fresh-source.docx existing-guides.json repairs.json --prescription-repairs --prescription-chapters 15-20 --source-document-id 119EyMzSHYV2SVYXLo6_P2EgkI_8Hukw_uNDvGuewyNg
python tests/prescription-chapters-15-20-import-test.py
node tests/recetat-source-transfer-test.js
```
