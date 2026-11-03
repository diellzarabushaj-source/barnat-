# Prescription builder — 3 November 2026

The builder now follows diagnosis → medicines → final review. A medicine picker
provides one search surface with keyboard navigation, focus containment, Escape
and an explicit close button. One medicine card stays expanded; the other cards
summarize their current dose, frequency, duration and dispensing quantity.
Patient instructions are shown as readable text, with a separate explicit editor
and an action to restore wording generated from the clinician-entered fields.
The existing navy/indigo shell, source library, clinical context and A4 print
renderer retain their roles.

## Correctness fixes

- Editing search invalidates pending responses immediately, including before the
  debounce or a cached-result return. Malformed responses and a bounded timeout
  produce a working retry. Retrying does not dismiss its own picker.
- A repeated product selection preserves the existing dose. A response that
  arrives after a new prescription, another saved prescription or an account
  change cannot insert a medicine into that different workspace.
- Reopening a structured saved prescription keeps its fields as the current
  source. Manual/source text is preserved until an explicit conversion; the
  prior manual text remains recoverable in the owner-scoped local draft.
  Inactive structured fields are disabled rather than silently diverging from
  the manual preview.
- Clearing the dose/frequency clears the preceding automatic patient instruction.
  Explicit manual wording can be restored to the current field-derived wording.
- AI wording belongs to the exact draft that requested it. Late replies cannot
  replace later edits or another prescription. Accepted wording stays in the
  preview and source text; changing a clinical field removes stale AI wording
  and invalidates the previous confirmation.

Publication/review status, regimen identities, automatic-dose confirmation,
owner isolation, compare-and-swap conflict handling, dosage gates and final
clinical confirmation remain enforced. No clinical source text, prescribed dose
or database schema was changed by this redesign.

## Verification

The browser regressions exercise the actual shipped runtime with synthetic
products and API responses at 320, 390, 760 and 1440 px. They cover the picker,
races, retry, duplicate selection, draft reset, manual/structured transitions,
saved edits and AI wording. The accompanying print and multi-device conflict
suites check canonical A4 text, complete long prescriptions, inert literal HTML,
draft conflicts and Undo. Runtime-manifest and source-fidelity checks run with
the complete active unit suite. Live authenticated production prescribing and
live provider credentials are not claimed as locally verified.

Local validation: all 229 active test files passed; 33 Chromium browser cases
passed across the composer, A4 printing and prescription conflict suites.
