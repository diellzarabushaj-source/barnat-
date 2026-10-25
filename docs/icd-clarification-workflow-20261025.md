# ICD description search: answer and refine

The existing description search asked questions but had no reply control. The new
clarification panel sits outside the result listbox and contains the current
question, a labelled reply field and an explicit update action. Existing
description text remains in the search bar. Previous Q/A turns are available in a
compact disclosure, and all context clears on a different query, Clear, account
change or reload. No conversation is persisted in browser storage or the database.

Phone controls use 16px reply text, minimum 44px touch targets and a stacked action;
desktop uses the same compact panel with the action beside the reply. Input focus
is preserved while typing. Ctrl/Cmd+Enter submits the reply. During a request the
reply is disabled and the existing cancellation action remains available. Failed
requests keep the draft; a retry does not duplicate the answer. A cancelled or
late response cannot replace a different query.

## Server contract

`interpret` optionally accepts `clarifications: [{question, answer}]`. The signed
owner, existing CSRF/origin checks, anonymous-content attestation and explicit
Gemini/Groq recipient disclosure still govern the request. There are at most four
turns, each question is at most 260 characters and each answer at most 220. The
original description plus actual answers remain subject to the existing 600
character / 90 word input limit. Identifying-content filters apply to both fields.
The existing whole-request limit remains unchanged.

Questions are kept separate from actual findings. The source description contains
only the original description and user answers; generated candidate excerpts must
occur in that source, including punctuation when crossing a sentence boundary.
A question listing swelling, redness or a disease does not establish any of them.
A vague yes/no to a compound question requires clarification rather than treating
every listed finding as present. A later explicit current denial supersedes an
earlier mention of a known symptom or repeated condition word. Family/history
mentions cannot override a current patient finding.

All existing canonical code/title, source excerpt, anatomy, qualifier, negation and
conditional-differential checks apply to the refined result. The cache key hashes
the complete bounded context, is isolated by owner and provider consent, and uses
revision `description-v6-clarification`. Answers never become aliases, confirmed
diagnoses or automatic prescription selections.

This remains an assistive retrieval workflow. Complex corrections, ambiguous
coordination, unusual wording and clinical distinctions outside the finite
vocabulary can require another clarification; the implementation does not certify
a diagnosis or guarantee clinical accuracy.

## Checks

- `tests/icd-description-clarification-test.js`: actual-answer source grounding,
  separation of question examples from findings, sentence-spanning excerpts,
  later denial, conditional causes, malformed/identifying/oversized context,
  cache identity and no writes.
- `tests/icd-query-memory-security-test.js`: Q/A is forwarded through the existing
  authenticated/CSRF-protected interpretation path; client-supplied owner/review
  state is ignored.
- `tests/icd-query-memory-browser.spec.js`: actual refined validator, phone and
  desktop replies, consent, keyboard, draft retention, retry without duplication,
  cancellation, stale-response protection, clearing and no automatic selection in
  Chromium and WebKit. Existing blood and general evidence cases remain covered.
