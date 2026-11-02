# Compact antibiotic dosing UI review — 2026-11-02

When a product/indication has no released clinical dosing model, the page shows a compact reference card with its indication and preparation status. Product, source and audit details open on demand. The page does not render patient inputs, an inactive calculation button or a large blocked-calculation panel for these entries. Indication links read “Shiko dozimin”; only a released calculator receives “Hap kalkulatorin”.

Showing a patient form requires both the dose engine's reviewed release record and an exact match to the selected product, condition, route, form, strength and source version. Source conflicts, incomplete review records and mismatches retain the reference card. Source audit details remain available. The production approval registry stays empty; this UI change creates no clinical approvals and changes no clinical source data.

Tests cover every catalog indication's lack of unapproved inputs, product/source selections isolated by indication, source access after selection, the reported Amikacin case at 320/1440 px and the Qilu/CEFIN source boundary. Isolated synthetic releases exercise the approved form, unit clearing, separate drafts and numerical path without adding a production approval. The complete suite and Chromium/WebKit results are recorded in the PR before release.
