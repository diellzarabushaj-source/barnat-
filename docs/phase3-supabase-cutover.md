# Phase 3 — Supabase-only runtime cutover

Status: **Supabase-only runtime active; Supabase Auth and multi-user approval are active.**

Main source cutover commit: `54d60a40992c046cf3545231eb6f55570fd3e5e0`.

## Runtime architecture

- Medical reads: Supabase.
- Private reads/writes: Supabase server-side only.
- Clinical editor writes: Supabase.
- Favorites and saved prescriptions: Supabase.
- Drive sync state, sync runs and sync outbox: Supabase.
- Supabase Auth verifies Google identity; `public.profiles` is the single source of truth for role, approval and verification state.
- Neon is no longer a runtime database provider. The old Neon project is retained only as a detached safety backup.

The legacy module name `lib/neon-data-api.js` is intentionally retained as a compatibility adapter so the cutover does not require a risky repo-wide import rename. Its runtime implementation is Supabase-only and provider environment flags cannot re-enable Neon traffic.

## Migrated live state

| Table | Supabase live rows |
|---|---:|
| `user_favorites` | 82 |
| `user_prescriptions` | 2 |
| `drive_sync_sources` | 10 |
| `drive_sheet_rows` | 31 |
| `sync_runs` | 5 |
| `sync_outbox` | 65 |

Additional state preserved:

- `user_favorites`: all 82 historical/tombstone rows retained.
- `user_prescriptions`: both tombstones retained.
- `sync_outbox`: 6 pending jobs retained.
- `sync_outbox` sequence aligned to the migrated maximum ID (66).
- `medindex_users` is rehydrated from the already-signed MedIndex session on first authenticated request, preserving the session UUID so migrated user state stays attached without transferring Google identity secrets through migration tooling.

## Audit archive

The historical Neon audit archive contains 1,417 rows. It is not required by live application state and is intentionally left in the detached Neon backup rather than transmitting the archive through an unsafe credential/payload bridge. Supabase `audit_logs` is the active runtime table for all new audit writes. Its sequence is reserved through historical Neon ID 1426, preventing ID collisions if the archive is imported offline later.

## Security boundary

All private runtime tables have RLS enabled. Direct `anon` and `authenticated` table privileges are revoked for:

- `medindex_users`
- `user_favorites`
- `user_prescriptions`
- `drive_sync_sources`
- `drive_sheet_rows`
- `sync_runs`
- `sync_outbox`
- `audit_logs`

Private reads/writes use the server-only Supabase secret key. Public medical reads use the publishable key under the existing read-only RLS boundary.

## Required production configuration

The runtime no longer needs provider-switch variables. Required database configuration is:

```env
MEDINDEX_SUPABASE_URL=https://ftuchtmolddhhsdcwnqe.supabase.co
MEDINDEX_SUPABASE_PUBLISHABLE_KEY=<publishable key>
MEDINDEX_SUPABASE_SECRET_KEY=<server secret key>
```

`SUPABASE_SECRET_KEY` remains accepted as a compatibility alias. No Neon database URL/token/password is required by runtime code.

## Identity continuity

Supabase Auth is the canonical identity provider. The signed HttpOnly MedIndex session stores the verified Auth UUID plus the approved profile role/status. Every shared write rechecks the live profile, while `medindex_users.enabled` remains an immediate private-library revocation switch. If the private row is absent, `userFromSession()` recreates it only from an already approved Supabase session and preserves `session.uid`, so existing favorites/prescriptions remain attached.

Professional registration documents are stored only in the private `professional-verifications` bucket. The metadata table denies direct browser access. A short-lived enrollment cookie can submit a document but can never become an application session; only an active admin can generate a 60-second signed document URL. Approval and rejection run through `review_medindex_registration()` as a single audited transaction.

## Regression contract

`tests/supabase-write-cutover-test.js` verifies that:

- reads always resolve to Supabase;
- writes always resolve to Supabase;
- legacy `neon`, `auto` or missing provider environment values cannot restore Neon runtime traffic;
- private reads and all writes require the privileged Supabase path;
- the compatibility `DATA_API_BASE` export points to Supabase.

## Production verification after merge

1. Build/test suite must pass.
2. `/api/neon-status` must report `provider: "supabase"` (legacy route name retained for compatibility).
3. Medical counts must remain stable.
4. Sync outbox must preserve 65 rows / 6 pending before any worker processes them.
5. Production runtime logs must show no new errors or warnings attributable to the cutover.

Neon may be deleted only in a separate deliberate cleanup after an observation/backup-retention period; it is already disconnected from the website runtime.
