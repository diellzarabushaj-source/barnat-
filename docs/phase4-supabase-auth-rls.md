# Phase 4 — Supabase Auth, roles, RLS and safe legacy identity mapping

Status: **in progress on top of merged Phase 3 / PR #160**.

Phase 3 already moved the private runtime database to Supabase. Phase 4 adds Supabase Auth identity, profiles, roles, RLS and a safe bridge from the historical MedIndex owner UUID to the future Supabase Auth UUID.

## Database foundation

Applied/recorded migrations:

- `supabase/migrations/20260819145700_phase4_auth_roles_rls_foundation.sql`
- `supabase/migrations/20260819161200_phase4_add_legacy_user_mapping.sql`
- `supabase/migrations/20260819165505_phase4_trusted_legacy_owner_claim.sql` — historical first implementation
- `supabase/migrations/20260819193000_phase4_safe_owner_claim_mapping_only.sql` — **required safety override and current source of truth**

The server-side Auth guard foundation is implemented in `lib/supabase-auth.js`.

The Google ID-token bootstrap is implemented through the existing `/api/auth` function using:

- `lib/supabase-auth-bootstrap.js`
- `lib/phase4-auth-bootstrap-route.js`
- `phase4-auth-test.html`
- `phase4-auth-test.js`

No extra Vercel Function is created for Phase 4.

## Identity model

`public.profiles.id` is the canonical Supabase Auth UUID and references `auth.users(id)`.

Roles:

- `doctor`
- `admin`

Statuses:

- `active`
- `suspended`
- `disabled`

The default profile created after a new Auth user is `doctor + active`.

Authorization is read from `public.profiles`, never from user-editable Auth metadata.

`profiles.legacy_user_id` is nullable and trusted-only. It exists to bridge the historical private-data owner UUID without changing encrypted data prematurely.

## RLS and privileges

Phase 4 includes:

- RLS on `profiles`
- RLS on `user_favorites`
- RLS on `user_prescriptions`
- RLS on `user_notes`
- RLS on `user_preferences`
- own-row isolation for authenticated users
- admin profile visibility
- active-user checks
- no client-side role, status, legacy mapping or id update privilege
- server `requireDoctor()` and `requireAdmin()` guards
- isolated Auth guard CI tests
- trusted private owner mapping helper
- trusted private pre-cutover rollback helper

## Verified security behavior

Database tests already proved:

- Doctor A cannot read Doctor B personal data
- an active admin can read all profiles
- a suspended account cannot read personal data
- authenticated users cannot update `role`, `status`, `legacy_user_id`, or `id`
- browser roles cannot execute the trusted owner mapping or rollback helpers
- an unknown Auth UUID is rejected before changing profile state
- rejected mapping attempts leave private-data counts unchanged

## Critical encryption safety rule

`user_prescriptions.payload` is encrypted with AES-256-GCM. Its AAD context includes the user UUID:

`<userId>:prescription:<clientId>`

Therefore **changing only `user_prescriptions.user_id` would make existing ciphertext unreadable**.

For this reason the historical migration `20260819165505_phase4_trusted_legacy_owner_claim.sql` is superseded by `20260819193000_phase4_safe_owner_claim_mapping_only.sql` before any real owner claim is executed.

The current `private.claim_legacy_owner(...)` function:

1. verifies the real Supabase Auth UUID exists;
2. verifies the exact expected owner email;
3. verifies the profile exists and is active;
4. rejects conflicting legacy mappings;
5. verifies the exact legacy Favorite and Prescription counts;
6. verifies the new Auth UUID owns zero legacy private rows;
7. promotes the verified owner profile to `admin`;
8. attaches `profiles.legacy_user_id`;
9. verifies the private rows **did not move**;
10. writes an audit event.

It deliberately does **not** update `user_favorites.user_id` or `user_prescriptions.user_id`.

The current `private.rollback_legacy_owner_claim(...)` clears only the trusted profile mapping/admin promotion after proving the same exact no-move count state.

Any future physical owner-ID migration of prescriptions must be **encryption-aware**: decrypt with the legacy AAD, re-encrypt with the new Auth UUID AAD, verify every payload, then move ownership transactionally. Phase 4 does not perform that operation.

## Google Auth configuration

Expected Web origin(s) include the production domain and any explicit Preview alias used for the real browser test.

Supabase Google provider must be enabled with the matching Web Client ID and Client Secret.

The bootstrap keeps nonce validation enabled. The client sends the SHA-256 hexadecimal nonce to Google and the raw nonce to Supabase Auth.

## Final Phase 4 gates

1. Run a real Google → Supabase sign-in with the owner account.
2. Confirm exactly one matching `auth.users` row and one `profiles` row are created.
3. Confirm the new profile starts as `doctor + active`.
4. Run the trusted mapping-only owner claim with the real Auth UUID, exact owner email, legacy UUID and verified baseline counts.
5. Confirm the profile is now `admin + active` with the expected `legacy_user_id`.
6. Confirm the legacy private-data counts are unchanged and the Auth UUID still owns zero migrated legacy rows.
7. Verify a real Supabase access token passes `requireDoctor()` and admin enforcement works.
8. Re-run Security Advisor and full CI.
9. Run final Preview/browser smoke tests.
10. Merge Phase 4 only after all gates are green.

## Not part of Phase 4

Phase 4 does not yet:

- replace the normal MedIndex frontend login/session everywhere
- move Favorites/Notes/Prescriptions browser flows to a new identity contract
- re-encrypt prescriptions under a new Auth UUID
- remove the legacy session/login compatibility path
- retire rollback support

Those are handled incrementally in the following cutover phases so production remains recoverable.
