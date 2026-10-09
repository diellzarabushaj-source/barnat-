# Private runtime measurements

The clinical pages use the official `web-vitals` 6.2.3 standard build, installed
at an exact version and copied without modification to `vendor/web-vitals.js`.
`scripts/build-runtime-telemetry.js` verifies the version and copies its Apache
2.0 license and SHA-256 provenance. The build is idempotent. No external analytics
service or CDN receives measurements.

Collection samples 10% of documents with a random, memory-only draw, honors Global
Privacy Control and Do Not Track, and sends only after confirmed online Supabase
authentication. It never sends a full metric object, source element, attribution,
query, patient text, URL, email, IP, user-agent, exception message or stack.
Allowed fields are the module enum, initial viewport device bucket, release,
metric enum, rounded numeric value, random metric token and monotonic revision.
There are no telemetry cookies, persistent client IDs or browser storage queues.
The server replaces the release with its deployment commit and HMACs every
random token before storage. Account identity is used for live authorization and
the separate private request budget; it is excluded from metric storage.

`POST /api/auth?scope=telemetry` requires an active Supabase session, a fresh live
doctor/admin profile, same-origin HTTPS and the existing custom-header CSRF
token. It accepts at most 8 KiB and 12 strictly validated events. Telemetry always
consumes the shared 12-request/minute account budget, regardless of the separate
auth/AI rollout flag. A failure remains silent in the clinical interface. Sending
uses `fetch(..., {keepalive:true})` because the authenticated endpoint requires a
custom CSRF header; `sendBeacon` cannot provide that header.

Ingestion is enabled only with server configuration
`MEDINDEX_RUNTIME_TELEMETRY=1`. It can be disabled independently of clinical
actions. A new deployment is required after changing the flag.

The client calls `onLCP`, `onINP` and `onCLS` once. Missing APIs, background-only
loads and visits with no INP interaction do not become zero-valued samples. The
same library metric ID receives a stable random token and increasing revisions;
later reports replace its histogram bucket. BFCache metrics receive new tokens.
Observers use official reportAllChanges updates so navigation without a final
hidden event still has the latest measurement queued. Hidden/pagehide delivery
flushes those values. Updates arriving during
an in-flight request remain queued, and SQL ignores stale/out-of-order revisions.
Delivery is best effort; offline and exhausted requests are not persisted/retried
indefinitely. CSRF expiry pauses capture transport until another confirmed auth
event supplies a valid token, without renewing or rotating cookies for analytics.

Only fixed error classes are recorded, at most once per navigation and class:
runtime exceptions/unhandled rejections, SCRIPT/LINK resource load failures, and
fetch responses with a supported numeric Resource Timing status of 500 or above.
Custom `drx:telemetry-error` events accept exactly `{kind:'runtime'|'network'|'server'}`.
There is no error-string inspection, request interception or guessed status for
browsers that do not expose response status. These counts represent observed
classes in the sample, not an exhaustive API error rate.

The service-only database RPCs deduplicate receipts for the 24-hour read window.
Accepted batches sweep up to 1,000 receipts older than 26 hours and up to 1,000
hourly buckets older than 14 days. Cleanup is opportunistic: inactivity or a
backlog can extend storage past those ages. It is not a guaranteed deletion
deadline. Admin-only
`GET /api/neon-status?view=telemetry` verifies current live admin standing before
reading a 24-hour summary. It reports a conservative p75 histogram upper bound,
explicit sample counts, unavailable/insufficient data and per-cohort alarm state.
It requires at least 20 samples: LCP <=2500 ms, INP <=200 ms, CLS <=0.1 are the
good thresholds. Observed error classes alarm at >=3 affected navigation samples
and >=5% of at least 20 sampled navigations. The thresholds are an initial
operational policy; no email/Slack notification is configured.

The actual field result needs real traffic and enough samples. Browser fixtures
validate collection and privacy; they are not a production Web Vitals result.
Histogram bounds are not exact percentiles. Unsupported metrics remain
unavailable and prevent a complete healthy assessment.

Primary references:

- [Official web-vitals library and lifecycle](https://github.com/GoogleChrome/web-vitals)
- [Core Web Vitals thresholds and field/lab distinction](https://web.dev/articles/vitals)
- [Field measurement timing, deduplication and distributions](https://web.dev/articles/vitals-field-measurement-best-practices)
