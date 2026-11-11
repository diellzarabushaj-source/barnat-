# Medical Hub source imports

For Doctor on Duty content, the canonical source is the Google Doc supplied by
Dr. Diellza Rabushaj:
https://docs.google.com/document/d/1QN0U5sWSj9GdyNV5oZoZIobmjV0TmCwJD937xzzPgVw/edit

Volume II (chapters 22–24) was also supplied by the user:
https://docs.google.com/document/d/1QNVPfGpPp3lghWIcPf3ynT1rrFMTA5IilJuZ1tEtI_M/edit
Pass its ID with `--source-document-id` when importing that volume so source
metadata and figure links point to the actual canonical document.

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
- Preserve chapter introductions before the first lesson. Render source editorial
  annotations with a subtle highlight in their original position, retaining all
  source words, marks and list semantics; never turn them into prescription steps.
- Prescription cards must preserve source groups and OR/OSE/PLUS connectors.
  Tables and other blocks inside prescription sections must remain at their
  original position; no renderer may discard them when grouping text.
- Preserve existing document IDs, relationships and clinical review status.
  Copying a source faithfully does not confer clinical verification.
- Build changes with `scripts/import-medical-hub-docx.py` using fresh source and
  existing-document exports. It performs a read-only conversion and checks exact
  source text, table geometry and reading order before preparing any write.
- For untouched migration placeholders, use `--initialize-placeholders` to build
  source titles and Rx sections. It refuses authored content or edited notes.
- Upload source images without alteration and supply `--image-assets` with
  source SHA-256 hashes and actual Sanity asset IDs. Even an image paragraph
  without text must be imported in place or fail explicitly.
- Keep that registry in `medical-hub-imports/source-image-assets.json`. Run
  `python tests/medical-hub-docx-import-test.py` when changing the importer;
  unsupported Word numbering patterns must fail rather than lose their markers.
- Run `node tests/medical-hub-source-fidelity-test.js`, the Medical Hub tests,
  and audit the rendered source for every affected lesson. Check desktop and
  narrow-screen table scrolling and prescription cards before publishing.
- An unsupported source structure must cause an explicit import failure, never
  a silent fallback to plain text. Report any incomplete verification honestly.

Keep the current frontend design; source fidelity is a content and rendering
contract, not authorization for an unrelated redesign.

## Project continuity and verifiable progress

- At the start of **every** new coding session, read `docs/PROJECT_CONTEXT.md`,
  `README.md`, and the relevant feature documentation before planning work.
- Treat the `main` GitHub commit, current GitHub checks, GitHub Issues, and the
  actual Vercel deployment SHA as separate sources of truth. Never assume that a
  merged change was deployed or that a completed CI job proves clinical safety.
- The private admin **Project Pulse** panel is at `/project-progress.html`; its
  read-only data endpoint `/api/project-progress` requires a live admin session.
- An issue's closed/open state is only task-tracking progress. Do not claim that
  issue completion is whole-product completion, or invent percent-complete values.
- Before starting work, compare the latest changes and open issues with the
  current request. After work, report tests, exact commit/PR, any blockers and
  deployment verification separately. Update feature documentation where needed.
- Never place GitHub or Vercel API tokens in client-side assets or the repo.
