# ICD source rebuild audit

## Root cause

The full ICD hierarchy uses the Google Sheet `1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0`, tab `ICD-10 EN-SQ` (`gid 329283560`). The required header is on row 6. The production failure occurred when a public Google CSV endpoint returned a shape that did not contain the required hierarchy columns, while Neon had no active hierarchy revision to serve as the primary source.

## Runtime correction

- Try the Google GViz CSV endpoint and the standard export endpoint independently.
- Validate content type, HTML/sign-in responses, size, canonical headers and the real row-6 header before accepting a response.
- Continue to prefer an active, complete Neon revision.
- Ignore incomplete `staging` or `failed` revisions and fall back to the validated Google Sheet hierarchy.
- Preserve strict counts: 22 chapters, 274 blocks, 2,050 categories, 10,196 subcategories and 12,542 nodes.

## Clinical dataset parity

The separate clinical list `19ncbnrTJ_w-WQ0msWO9_dUoxjmicSUAz6Nt4sh20gFw` was compared with `public.icd_codes` in Neon.

- total: 701
- family medicine: 701
- emergency: 622
- critical: 244
- unpublished: 0
- canonical SHA-256: `0c767740f6668f9fb9381ae875afc95ecbe7e69c7407f4f0e1022ed759bde36d`

The Sheet export and Neon rows produced the same canonical hash.

## Full hierarchy Neon status

The revision `re3nQDC_0rCcjpS5sQFH` contained correct source metadata but zero hierarchy nodes. It was marked `failed`, not `active`, so it cannot be selected by the runtime. The application therefore uses the complete, validated Google Sheet hierarchy until the repository's Neon sync credentials are configured and the atomic importer uploads and activates all 12,542 nodes.

No incomplete Neon revision is reported as synchronized or healthy.
