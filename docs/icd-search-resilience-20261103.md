# ICD search resilience — 2026-11-03

ICD description search could time out, reject ordinary medical inflections, or
leave an error after an upstream outage. Changing the query while a request was
pending could also retain another query's suggestions.

## Behavior

- Complete catalog titles, reviewed quick-search aliases and normalized existing
  codes resolve without an AI request. Examples include `Morbus Hashimoto`,
  `I 10`, `pom dhem kryt` and `me merret koka`.
- Quick-search aliases participate in server ranking as well as the browser's
  offline index. The bounded lexical matcher also handles their inflections and
  misspellings; it does not modify canonical codes or titles.
- Single and multiple Gemini credentials have bounded attempts within an
  18-second Gemini phase. Each key is tried at most once. Capacity, compatibility,
  malformed-output and network failures can use the existing consented Groq
  reserve. Groq can operate when no Gemini credential is configured.
- Missing credentials and provider failures return a visibly labeled catalog
  result. Symptoms still use the existing positive-evidence and context checks.
  Short named-term spelling results remain ordinary search matches requiring an
  explicit choice. Unclear text produces a clarification, not a fabricated code.
- Degraded responses are evicted from the in-memory response cache immediately,
  allowing recovery on the next attempt. Concurrent requests still share work.
- Editing immediately cancels and invalidates the preceding search. Proxy HTML
  errors produce a readable message and restore catalog search. Failed follow-up
  requests preserve the answer draft without duplicating conversation turns.

Explicit recipient consent, authentication, CSRF checks, input size and identifier
checks, canonical WHO code/title validation, owner isolation and the prohibition
on saving inferred description-to-diagnosis aliases remain in effect.

## Sources for added retrieval terms

- Hashimoto thyroiditis is an inclusion under E06.3 in the
  [NHS ICD-10 tabular browser](https://classbrowser.nhs.uk/ICD-10-5TH-Edition/vol1/block-e00-e07.htm).
- M47 includes arthrosis/osteoarthritis of the spine in the
  [NHS ICD-10 tabular browser](https://classbrowser.nhs.uk/ICD-10-5TH-Edition/vol1/block-m45-m49.htm).
- Provider behavior was checked against the
  [Gemini Interactions API](https://ai.google.dev/api/interactions-api-v1)
  and [structured-output documentation](https://ai.google.dev/gemini-api/docs/structured-output).

These additions are retrieval aliases; they do not change the authoritative
WHO ICD-10 2019 catalog, treatment content or clinical review status.

## Verification

`npm test` rebuilds the runtime and runs the complete 229-file active suite. The
dedicated ICD workflow additionally runs the evidence, clarification, provider,
spelling, outage and retry regressions. The browser suite exercises 38 cases,
including mobile/desktop rendering, offline lookup, explicit consent, account
isolation, stale-response rejection, failure recovery and clarification retries.

Provider failures and successes are simulated against the real bundled catalog.
Local verification does not prove that production credentials or live upstream
capacity are available. No system can establish a diagnosis from arbitrary text;
the clinician must confirm the selected concept and code.
