# Shared UI Components

## Runtime profile

- Framework: vanilla HTML, CSS, and browser JavaScript.
- Meta-framework and component package: none.
- Styling: global vanilla CSS with local design tokens and TailAdmin-derived class contracts; there is no Tailwind compiler in the production app.
- Shared primitives are CSS/DOM/runtime contracts rather than imported framework components.

## TailAdmin application shell

- Sources: `tailadmin-shell-legacy.js`, `tailadmin-shell.js`, `tailadmin-medindex.css`, `tailadmin-professional.css`.
- Builds the fixed sidebar, mobile drawer, top bar, global search, page heading, theme controls, prescription action, profile chip, offline indicator, and content slot.
- Responsive state is represented by root classes/data attributes. Theme is persisted in local storage.
- Navigation labels and routes are Albanian and route-aware; MedIndex branding and icons are local.

## Form controls

- Source: `tailadmin-medindex.css`.
- Shared text/search/password/number inputs, selects, and textareas use a 44px control height, a restrained 8–9px radius, neutral border/surface, 14px local Inter/system typography, and teal focus ring.
- Native `disabled`, `required`, placeholder, invalid, hover, and keyboard-focus behavior must remain intact.

## Buttons and links

- Source: `tailadmin-medindex.css`.
- Primary actions use MedIndex teal with white text; secondary and ghost actions use white/neutral surfaces and thin gray borders.
- Controls are 40–44px high, use an 8px radius and 13px medium text, and retain native disabled, loading, hover, active, and `:focus-visible` states.
- Existing APIs include `.rx-primary`, `.rx-secondary`, `.rx-ghost`, `.rx-text-button`, `.protocol-toolbar-btn`, `.clinical-toolbar .primary`, `.atc-back`, `.atc-reset`, `.icd-clear`, `.lab-sheet-link`, and `.icd-who-link`.

## Status badges and chips

- Sources: `tailadmin-medindex.css`, `clinical-reference.css`.
- Shared count, code, selection, warning, archive, and status pills use compact 24–28px geometry.
- Brand badges use the teal 50/100/600 palette; warnings use amber only for caution/status communication.
- Existing APIs include `.count-badge`, `.selection-badge`, `.clinical-status`, `.lab-status`, `.rx-state`, `.badge`, `.atc-card-code`, `.icd-code-badge`, and `.clinical-chip`.

## Surface cards

- Source: `tailadmin-medindex.css`.
- Bordered white/dark surfaces with 12–14px radius, subtle `xs` shadow, neutral text, and a restrained interactive hover state.
- Existing APIs include `.atc-card`, `.icd-chapter-card`, `.icd-code-card`, `.lab-card`, `.clinical-card`, `.protocol-card`, `.rx-saved-card`, `.saved-protocol`, and `.protocol-dashboard-card`.

## Data table

- Sources: `tailadmin-medindex.css`, `first-page-clinical.css`, `registry-dosage-columns.css`.
- Scrollable, data-dense medicine registry with sticky 12px headers, 13px body cells, sortable columns, row selection, filter-aware states, keyboard focus, and responsive fallback.
- The medicine name remains the strongest row anchor; codes use a local monospace stack; warning/status fields are compact and scan-friendly.
- Existing wrappers include `.table-wrap`, `.atc-table-wrap`, `.med-table-wrap`, and `.clinical-table-wrap`.

## Clinical reference primitives

- Source: `clinical-reference.css`.
- Shared by dosage and protocol pages: `.clinical-main`, `.clinical-hero`, `.clinical-summary`, `.clinical-toolbar`, `.clinical-patient`, `.clinical-status`, `.clinical-list`, `.clinical-row`, `.clinical-details`, `.clinical-chip`, `.clinical-actions`, `.clinical-empty`, and `.clinical-note`.
- Supports a sticky filter toolbar, patient inputs, live result count, responsive result cards, warnings, and reduced-motion behavior.

## Medical icons

- Source: `medical-icons.js`.
- Dependency-free inline SVG renderer exported as `window.MedIndexIcons.svg(name, className)` with a frozen local medical icon vocabulary.
- Uses a 24×24 viewBox, currentColor stroke, rounded caps/joins, `aria-hidden`, and a stethoscope fallback.

## Accessible dialogs

- Source: `clinical-dialog.js`.
- Shared Escape-to-close and Tab focus-loop behavior for visible modal dialogs.
- Close hooks include `[data-close-dialog]`, `.med-panel-close`, `[data-close-signature]`, and `[data-close-more]`.

## Non-negotiable component behavior

- Do not replace native semantics, current IDs, data attributes, storage keys, events, URLs, or backend calls.
- Preserve Albanian labels and the current route contract.
- Preserve dark theme, keyboard focus, reduced motion, offline/limited-network feedback, and mobile drawer behavior.
- Visual changes may refine hierarchy, density, spacing, borders, typography, icons, and responsive layout only.
