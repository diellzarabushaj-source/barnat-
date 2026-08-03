# ICD Phase A — hierarchy integrity and Neon mirror

## Authority boundaries

- **Google Sheet full hierarchy** remains the editorial authority for the 12,542 ICD-10-WHO 2019 nodes.
- **Neon** stores immutable, validated mirrors of that hierarchy.
- **Clinical priority Sheet / `icd_codes`** remains a separate 701-code family-medicine and emergency layer.
- The clinical layer never changes hierarchy validity, parentage or specificity.

## Header resilience

The source loader scans the first 40 rows and canonicalizes required columns instead of depending on exact punctuation. It accepts:

- BOM and non-breaking spaces;
- metadata rows before the header;
- normal hyphen, en dash or em dash;
- Albanian or supported English column aliases.

Missing required columns fail closed with the precise missing-column list.

## Atomic Neon revisions

`icd_hierarchy_revisions` stores source metadata and revision state.

`icd_hierarchy_nodes` stores nodes under an immutable revision key.

A revision can become active only through `activate_icd_hierarchy_revision()` after Neon verifies:

- 12,542 total nodes;
- 22 chapters;
- 274 blocks;
- 2,050 categories;
- 10,196 subcategories;
- zero orphan parent references.

The previous active revision is superseded only inside the same database transaction.

## Read order

1. Complete active Neon revision.
2. Live public Google Sheet.
3. Last known good in-process cache, explicitly marked stale.

A partial Neon import is never exposed to the ICD browser.

## Sync isolation

`scripts/sync-icd-hierarchy-to-neon.js` imports only the full ICD hierarchy. It does not write drugs, dosage regimens, laboratory tests or the 701-code clinical priority table.

The production workflow runs after relevant changes reach `main`, supports manual execution and performs a daily revision check.

## Recovery guarantee

If Neon is absent or incomplete, the public Sheet remains available. If a source fails after a last-known-good dataset was loaded, the cached dataset remains usable and the source state is marked stale.
