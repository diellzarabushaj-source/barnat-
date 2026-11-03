# Registry search and filter recovery

The medicine registry now separates cancelled requests, timed-out requests,
valid empty results and malformed server responses. Column-value timeouts expose
a retry instead of leaving the filter stuck in its loading state. Editing facet
search temporarily disables obsolete checkbox choices, while preserving the
committed filter and its draft. Selecting more than the supported 100 values
explains how to narrow the search or use a column condition.

Starting a page/filter action clears pending text debounce work. Page navigation
is disabled while its response is pending, and repeating the same form selection
does not request the same page again. Explicit refresh clears stale search cache
entries and stores the fresh result under the reusable query key. A failed refresh
may retain rows only when they belong to the same query and filter context.

Unknown totals remain unknown; `hasNext`/`hasPrevious` still allow navigation.
A short unfinished search removes old selectable products, while a one-digit
registry search remains supported. Mobile loading uses read-only list placeholders
instead of exposing the preceding products alongside table placeholders. A real
zero price remains distinct from a missing price. Successful empty searches reset
earlier network-error headings.

The additions to `tests/registry-filter-usability-browser.spec.js` exercise these
cases using controlled failures, response timing and the actual filtering helpers.
The existing registry browser suite also checks ATC hierarchy, combined column
conditions, substance variants, selection, detail drawers, published dosage
identity and responsive table/list flows. Both suites already run in Chromium and
WebKit in the repository's browser workflows.

The ICD stale-response regression now checks the visible error state rather than
the browser-specific English wording of a fetch failure. Chromium reports
“Failed to fetch”; WebKit reports “Load failed”. The functional requirements remain
the same: the failure is visible and no preceding diagnosis remains selectable.

The work changes frontend request/state handling and versioned assets. It does
not change database schemas, publication status, medicine identities, source
clinical text or dosage rules. Local tests use synthetic catalog fixtures; an
authenticated production user journey is not claimed as locally verified.
