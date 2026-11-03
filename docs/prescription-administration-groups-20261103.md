# Automatic prescription administration groups — v43

The structured composer groups independent medicine cards by administration
route with small inline headings and counts. The canonical prescription uses
the same headings in preview, clipboard, text export and A4 printing. The
first occurrence of a group sets its position; products keep their relative
order within a group. Stored product identities and clinician instructions
are retained.

PO products are labelled “Barna nga goja (PO)”. Parenteral products are labelled
“Barna parenterale”, including an injectable whose individual route still needs
selection. Other enteral routes, local/topical routes and inhaled routes have
their own labels. Rectal products are not labelled as oral. Unresolved metadata
has an explicit unresolved group rather than a guessed route.

Generated group headings round-trip as section metadata, not medications.
Existing manual/source text without these reserved headings retains its
canonical output and order. Shared administration blocks keep their medicines
and shared instruction together. A route edit or removal updates both the
medicine list and the canonical prescription; empty groups disappear.
AI wording results and reopened structured prescriptions retain the grouping.
No dose, indication, source prescription, approval state or schema is changed.

Validation adds parser/serializer round-trip, unknown metadata, uppercase
heading, stable product identity and shared-infusion checks. Browser cases at
320, 390 and 1440 px cover grouped cards, individual instructions, save/reopen,
clipboard and A4 parity. Route edits, empty-group removal and rectal separation
are exercised separately. All browser fixtures use synthetic products and
instructions; live authenticated prescribing is not claimed as locally tested.
