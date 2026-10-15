# Recetat: compact flow and useful filters

The clinical source browser now uses high-contrast numbered rails, tighter card padding, an inline Signatura label, and compact connectors. Source annotations remain distinct; alternatives and conditions remain visible. On phones, preparation lookup uses a 44 px action with the complete accessible medicine label.

The discovery controls support medication, alternative and conditional facets, plus search across all chapters or the current chapter. The API applies both filters before ranking/limiting results. Editorial annotations do not qualify as clinical conditions. Browse navigation, lesson choices and counters follow the filtered set. Changing the query or filter invalidates older search responses; clearing restores the normal chapter view.

Validation:

- All 206 test files passed, including API/browser facet parity, scope, limit ordering, editorial exclusions, empty states, filtered navigation and stale response rejection.
- All 16 Chromium/WebKit browser cases passed at phone and desktop widths; connector density, inline Signatura, touch targets, search recovery and source-conflict guards were exercised.
- The production build passed.
- The first five chapters retain all 74 guides, 329 items and 325 Signaturas in the render audit. The three guides with previously identified source conflicts still cannot start a draft.
- Source fidelity and full source-to-draft transfer checks passed. No source document or clinical regimen was edited for this UI change.
