# ICD-10 precision enhancement — 24 October 2026

This is an additive change to the existing ICD page, engine and WHO ICD-10 2019 catalog. It does not import a second catalog, replace the engine, change doses or treatments, or overwrite existing Latin titles.

## Production architecture checked

The current production data transport is Supabase. The Neon-named reader and request functions are compatibility names: `medindex-data-api.js` routes them to Supabase. Production environment metadata contains Supabase configuration and the existing server-side Gemini key; it contains no Neon runtime connection configuration. The hierarchy still comes through the existing source loader, validation and snapshot fallback.

The active hierarchy had 12,542 nodes. Immediately before and after the additive migration its code/Latin-title digest was `3560e225cdd5adaa60a77f9c0d892669`. The existing publication/synchronization process remains independent of terminology memory.

## Exact changes

- `lib/icd-query-memory.js` adds normalization, canonical-code validation, owner-scoped reads, duplicate-safe submissions, reviewed Latin overlays, five-minute promise caches, and numeric process-local counters. It never owns or writes canonical ICD records.
- `lib/icd-intelligence-handler.js`, routed through the existing `api/clinical-editor.js`, exposes signed-session reads and explicit POST actions for assistance, personal terminology, global proposals and administrator review. No additional Vercel function or Gemini client is introduced.
- `lib/gemini-prescription.js` accepts optional structured schema/system-instruction arguments using its existing server transport. Its prescription defaults and wording-only safeguards remain unchanged. ICD responses use existing WHO codes and canonical titles; model-supplied titles are discarded. Unknown/ICD-10-CM-only codes and disease mappings for known symptom expressions are rejected.
- `lib/icd-advanced-handler.js` inserts the existing symptom code before its differentials and enriches unresolved suggestions from verified/global or personal aliases. Known resolved terms skip the memory database and AI. Existing differentials, hierarchy, scoped filters and guidance remain available.
- `data/icd-symptom-intents-v1.json` adds only four aliases to the existing chest-pain concept: `pom dhemb gjoksi`, `po me dhemb gjoksi`, `dhimbje kraherori`, `dhimbje kraharori`. Its existing symptom code, differential candidates and red flags are preserved.
- `icd.html`, `icd-v2.js` and `icd-v2.css` refine the existing interface: Latin first when available, Albanian below, code, verification/proposal labels, symptom-versus-clinical-concept distinction, ambiguity note, one-click copy and the existing Recetat diagnosis-context contract. A closed “Fjalori i kërkimit” disclosure contains explicit memory actions; administrator review is separate. Client aliases stay in memory, refresh after five minutes on focus, and clear when a newly checked account changes. Existing sidebar, autocomplete, keyboard navigation and local hot-search caches remain.
- `runtime-asset-manifest.json` and page asset versions advance together. `.github/workflows/medindex-validation.yml` runs the new browser cases inside the existing Chromium/WebKit workflow; `tests/test-suite.json` registers the three new server/database tests.
- The existing command-center asset contract now verifies exact page/manifest agreement rather than freezing the October 14 asset version; all its search, hierarchy and clinical assertions remain in place.
- `lib/medindex-data-api.js` adds only the two new relations to its server-private relation list.

## Persistent memory and approval

Migration `20261024124950_icd_query_memory.sql` is applied in production and mirrored in `sql/icd-query-memory.sql`. Follow-up `20261024130338_icd_verified_latin_uniqueness.sql` adds a partial unique index: a second approved Latin proposal cannot silently displace an already reviewed title. Both have CLI-created skeletons renamed to the actual connected-service versions. `supabase/migration-history.json` matches all 317 live migrations.

Only two tables are added: `icd_query_memory_v1` for personal, pending, verified and rejected terms, and `icd_query_memory_audit_v1` for append-only decisions with evidence snapshots. A classification/scope/owner/normalized-expression/code/kind uniqueness constraint prevents duplicate rows. Conflict handling preserves the existing reviewed state. The existing active ICD view validates codes at submission and approval; the existing profiles table validates active users and administrators.

Both tables have RLS. Browser roles have no table access or approval-function execution. The existing server session determines ownership; client-supplied owners, statuses and reviewers are ignored. Writes require verified Supabase sign-in, CSRF, same-origin checks, bounded input and request budgets. Administrator review rechecks the live profile and existing administrator email policy. Verification requires an explicit reference URL. The application never marks an AI proposal globally verified. Existing Latin titles are immutable through this route.

No raw query history is logged or automatically saved. Persistence and AI assistance require the user's explicit term-only confirmation. Inputs are bounded to 80 characters/12 tokens and a conservative vocabulary drawn from existing medical terminology and curated dialect words; names, identifiers, dates, email addresses, numbers and markup are rejected. This deliberately limits assistance for completely unfamiliar vocabulary. It is a preventive terminology guard, not a guarantee that arbitrary text can be de-identified. Do not enter patient data.

Reviewed missing Latin can augment the display without replacing canonical data. A proposed Latin expression remains visibly unverified until approval. Personal mappings are preferences, not shared clinical validation. Symptoms are not converted automatically into confirmed disease diagnoses, and Recetat retains its own review gate.

## Measured behavior

Before editing, `pom dhemb gjoksi` returned no suggestions, `dhimbje gjoksi` began with R07, and `dolor thoracis` began with differential disease candidates. All these expressions now put the existing R07.4 symptom concept first, as do `dhimbje kraherori`, `dhimbje kraharori` and the exact code. Differentials remain separately labelled.

Local measurements use the bundled 12,542-node dataset, not a production network latency promise:

| Measurement | Result |
| --- | --- |
| Pre-edit 50-call mixed cold/warm baseline | p50 0.0049 ms; p95 462.1024 ms |
| Controlled warm existing engine, 50 calls | p50 0.0068 ms; p95 0.0281 ms |
| Controlled warm enhanced path, same 50 calls | p50 0.0096 ms; p95 0.0428 ms |
| Known-query database/AI work | 0 database requests, 0 Gemini calls; 50 AI calls avoided |
| Controlled memory-cache reuse | 9 hits/10 loads, 90%; one database request |
| Controlled repeated submission | 1 duplicate/2 submissions, same database ID; 50% synthetic duplicate rate |

Cold and warm measurements are not directly comparable; no speedup is inferred from that comparison. The warm comparison isolates incremental overhead over the same current data. Production cache/duplicate counters are per function instance, contain only numbers, and are administrator-only. They are not durable utilization analytics. A production `EXPLAIN ANALYZE` of the initial empty memory lookup used `icd_memory_read_v1` and completed in 10.116 ms; this is not a populated-table benchmark.

Known results never wait for Gemini. Unknown expressions use the existing typo/fuzzy results and memory before explicit assistance; AI is bounded by timeout, canonical validation, pending-only persistence and a ten-minute promise cache. Previously pending proposals can be reused after server cold starts. A database or AI failure leaves standard search available.

## Verification and limits

- Production runtime build passed. The three new unit/database/security files and existing Gemini prescription safeguards passed.
- Six browser scenarios passed in both Chromium and WebKit: **12/12**, at 390 px and 1440 px where applicable. They cover Latin/dialect/code ranking, no typing-triggered AI/writes, memory reload, explicit consent, escaped review content, active filters, warm offline search, keyboard selection, copying, sidebar favorites navigation, and real local Recetat handoff with its save/review gate. Screenshots were inspected at phone and desktop widths. This is browser coverage, not physical-device certification.
- The active 214-file suite was attempted locally. **211 files passed** across the sequential run and the resumed remainder; three unchanged backup fixtures fail in this Windows environment when launching their native bash/Python helpers (`drx-phase1-backup-workflow-test.js`, `backup-archive-crypto-test.js`, `backup-retention-test.js`). The unmodified Linux CI suite remains the release gate.
- The broader historical ICD sweep contains 20 stale failures outside the active suite, principally references to retired `icd-tree.js`, `icd-detail-panel.js`, `icd-favorites.js` and `icd-fetch-capture.js`, plus old contracts for the Neon shim, worker path list and R30/R30.0 ranking. Those retired files are already absent at the base commit. This change does not restore an obsolete second UI or claim those tests passed. The current favorites sidebar route is preserved; legacy favorite CRUD is not reintroduced.
- Existing current ICD hierarchy, search, hot-search, scoped-filter, symptom-intent, primary-care, problem-list, public-source, production-health and published-immutability tests passed alongside the new checks.
- Production rollback smoke tests exercised duplicate-safe submission, approval/audit and service-role personal submission. All synthetic rows were rolled back: memory and audit tables returned to zero rows. The canonical count and digest were unchanged. Browser writes/approval and service-role audit deletion remained denied. Security advisors reported no finding for the new relations.

Global alias and Latin approval remains an explicit clinical administrator decision. This release does not certify every translation or automatically approve model output. Ordinary offline search continues; new AI assistance and persistent terminology writes require connectivity.

References used for the additive implementation: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), and the existing [WHO ICD-10 2019 browser](https://icd.who.int/browse10/2019/en). No clinical treatment schemes are added by this package.
