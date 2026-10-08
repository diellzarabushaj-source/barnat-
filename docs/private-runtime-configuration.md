# Private runtime configuration after the P2 changes

## Shared request limits

The database migration `shared_request_budget` must be applied first. Its RPC is
accessible only to `service_role`, uses an atomic upsert and stores HMAC hashes,
counts and expiry timestamps. It stores no raw IP, email or clinical content.

Set `MEDINDEX_SHARED_RATE_LIMIT=1` in the intended Vercel environment only after
verifying the existing privileged Supabase credential and a secret of at least
32 characters in `MEDINDEX_RATE_LIMIT_KEY` or the existing session secret. Never
put these values in source control, browser configuration, reports or chat.

Password login consumes an IP budget of 60 requests per 15 minutes and an email
budget of 10. AI wording requests require a verified session and consume 40 per
IP and 8 per account per minute. A denied budget returns 429 with Retry-After.
An unavailable budget returns 503 before the downstream provider is called.
Existing local limits remain active. The shared limiter is opt-in; this change
does not silently enable an unverified credential dependency on live login.

Verify on an isolated preview with synthetic accounts, including two server
instances, expiry, 429, and unavailable-RPC behavior, then enable production.

## Library key rotation

The existing encrypted v1 records remain readable. To use v2 envelopes, set a
dedicated `MEDINDEX_USER_DATA_KEY` and a unique `MEDINDEX_USER_DATA_KEY_ID`.
Keep historical keys in the server-only `MEDINDEX_USER_DATA_PREVIOUS_KEYS` JSON
map, keyed by their previous ID. Include the previous session-derived key under
an explicit legacy ID when rotating away from it; v1 has no stored key ID.
At most eight previous keys are accepted. Never reuse a key ID for new material.

Before changing keys, retain an encrypted backup and the corresponding keys in
separate restricted storage. In an isolated environment, restore the backup and
verify v1 and v2 reads with the original owner context. The synthetic regression
checks rotation, backup serialization, authenticated envelopes, altered key IDs
and refusal under another owner context. It is not a production backup drill.

Enable `MEDINDEX_USER_DATA_REQUIRE_DEDICATED=1` only after the dedicated key and
ID have been verified. Retain old keys until every dependent record and retained
backup has been migrated or expired. For rollback, retain the new key in the
previous-key map so records written during rotation remain readable.

Production rotation and a restore drill remain configuration work; no live user
library, prescription or key was changed by this implementation.
