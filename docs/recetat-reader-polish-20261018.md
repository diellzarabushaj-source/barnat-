# Recetat source-reader polish

The source reader has compact numbered cards, a stronger medication accent,
separate dose/route/frequency/duration chips, and quiet supporting-care rows.
AND connectors use less space; OR, PLUS, choices and clinical conditions remain
explicit in their original position. Verified and review-required status badges
reflect the existing status and conflict checks without promoting any source.

On phones, preparation lookup has a full text label and a 44 px touch target
below the clinical fields. Desktop keeps the action beside those fields. The
search hint now identifies diagnosis, medicine and instruction search; chapter,
lesson, facet and search-scope behavior is unchanged.

Browser checks exposed an existing preparation-lookup defect: the source click
opened the picker and then bubbled to the outside-click listener, closing it.
The listener now recognizes source lookup triggers. Looking up another source
medicine also keeps an already open picker open rather than toggling it shut.
Clicking outside still closes it. Source lookup does not select a product or
save a prescription.

No clinical text, doses, groups, source order, source imports, review status,
database structures or save permissions changed. No external design upload was
performed; the user chose direct local implementation.

Validation:

- Production build passed.
- All 207 project test files passed.
- All 24 Recetat Chromium/WebKit browser cases passed, including source chapters
  1–5, filters, retry, complete draft transfer and conflict blocking.
- New cases at 320, 390, 768 and 1440 px verify complete preparation labels,
  layout boundaries, keyboard lookup, repeated lookup and outside dismissal.
- Desktop and phone layouts were also visually inspected in the local app
  using the synthetic source fixture.
