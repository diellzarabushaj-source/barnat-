# Antibiotic catalog source

The canonical editing surface is the existing native Google Sheet:
https://docs.google.com/spreadsheets/d/1uBAuT7BhAGQeH3yuueeZnlMF4SeUygU1Wu4QJB9ZBFg/edit

`sheet-snapshot-2026-11-02.json` is the versioned snapshot used for this release. It contains the final read-back values of Antibiotiket, Produktet, Indikacionet, Burimet and Fjalori indikacioneve, plus the unchanged 290 legacy Mayo rows. The source export is `Products.xlsx`, SHA-256 `c1ed98433e368239f92f2c9eb35a34ab187f6a42b8c6db7571bd853ea9b4fe0e`.

Rebuild with `node scripts/build-antibiotics-catalog.js`. The browser reads the generated `antibiotiket-catalog-data.js`; it does not read the private Sheet live. Future Sheet edits require a fresh, reviewed snapshot and regeneration. Do not expose or change the Sheet's access permissions to enable browser access.

## Data contracts

- `substance_id` identifies composition + original ATC context; it is not a universal molecule identifier.
- `product_id` identifies the authorization/product/presentation. All 14 original export fields are retained. Import date is not online registry verification date.
- `condition_id` is a controlled indication name. Source wording, age/weight criteria, formulation, route and regimen variant remain separate.
- Source references are not local product approvals. Display requires compatible route/form context, with local verification still explicitly missing.
- The displayed catalog contains 135 contexts with 660 Active products in the supplied export. The 47 Suspended/Withdrawn products remain in history.
- All original Mayo values are preserved in the snapshot and bundle. Nonspecific or incompatible presentations are excluded from displayed regimens, not converted or silently relabeled.
- Every calculator flag is false. This release contains no dose calculation or conversion code.
- Personal selections are scoped to authenticated identity and composition ID, never ATC alone. They confer no clinical approval.

A future import must preserve IDs where identities are unchanged, reconcile authorization status, retain source history, and rerun the catalog tests. Clinical approval must name the exact regimen, product, route, form, concentration, clinician, date and source version; it cannot be inferred from a checkbox or from an Active registration.
