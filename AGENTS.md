# Medical Hub source imports

For Doctor on Duty content, the canonical source is the Google Doc supplied by
Dr. Diellza Rabushaj:
https://docs.google.com/document/d/1QN0U5sWSj9GdyNV5oZoZIobmjV0TmCwJD937xzzPgVw/edit

These requirements apply to corrections and every future chapter import:

- Preserve every source word, punctuation mark, dose, unit and connector. Do not
  summarize, paraphrase, clinically revise or silently omit source content.
- Read a format-preserving export (DOCX or structured Google Docs content), never
  use plain-text extraction to import rich content.
- Preserve the order of headings, paragraphs, tables, rows, columns and lists.
  Store tables as `medicalTable`, never as paragraphs of flattened cell text.
- Preserve bold, italic, underline, hyperlinks and paragraph breaks. Keep table
  header cells and rich cells, including rowspan/colspan and empty grid cells.
- Preserve numbered-list values, restarts and nested bullets. Do not add a second
  marker when the source stores its marker as text.
- Prescription cards must preserve source groups and OR/OSE/PLUS connectors.
  Tables and other blocks inside prescription sections must remain at their
  original position; no renderer may discard them when grouping text.
- Preserve existing document IDs, relationships and clinical review status.
  Copying a source faithfully does not confer clinical verification.
- Build changes with `scripts/import-medical-hub-docx.py` using fresh source and
  existing-document exports. It performs a read-only conversion and checks exact
  source text, table geometry and reading order before preparing any write.
- Run `node tests/medical-hub-source-fidelity-test.js`, the Medical Hub tests,
  and audit the rendered source for every affected lesson. Check desktop and
  narrow-screen table scrolling and prescription cards before publishing.
- An unsupported source structure must cause an explicit import failure, never
  a silent fallback to plain text. Report any incomplete verification honestly.

Keep the current frontend design; source fidelity is a content and rendering
contract, not authorization for an unrelated redesign.
