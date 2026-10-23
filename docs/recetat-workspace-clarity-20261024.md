# Recetat: composer and personal library

The approved design separates diagnosis/context, medicines/instructions and final review into three numbered sections. Secondary context and writing tools are disclosed on demand. The next-action panel points to an incomplete field or the relevant clinical confirmation; it never selects doses or confirms a prescription.

The personal library now prioritises diagnosis, medicine names and the open action. Only populated folders and the active folder appear as compact filters; the full folder selector remains available. Search supports combined terms, and prescriptions can be ordered by update time or name. Duplicate, move and delete actions sit in a keyboard-accessible disclosure. Empty states offer a useful next action without clearing an existing draft.

Opening a saved prescription switches directly to the composer. Pending preview updates disable saving, copying and printing; identical input/change events no longer rebuild the preview or reset a confirmation. Real edits still invalidate review. Existing ownership, conflict, restore and encrypted persistence contracts remain in place.

Validation covers Chromium and WebKit at 320, 390, 760 and 1440 px, populated/empty libraries, sorting, combined search, folder navigation, secondary actions, keyboard focus, review gates, edit invalidation, existing drafts and multi-device conflict/Undo flows. The established clinical-source browser regressions remain separate. All examples used for browser testing are synthetic; personal prescriptions are not changed during live verification.

This is a presentation and interaction release. No clinical chapter data, medicine registry, database schema or access policy is changed.
