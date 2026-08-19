# Phase 4 — Supabase Auth, roles and RLS

## Status

**IN PROGRESS — BASED DIRECTLY ON MERGED `main`.**

Phase 3 / PR #160 is already merged to `main`, so this Phase 4 branch starts from the current production source of truth rather than from the old Phase 3 branch.

The additive database foundation has already been applied to Supabase and is recorded in:

- `supabase/migrations/20260819145700_phase4_auth_roles_rls_foundation.sql`
- `supabase/migrations/20260819161200_phase4_add_legacy_user_mapping.sql`
- `supabase/migrations/20260819165505_phase4_trusted_legacy_owner_claim.sql`

The server-side Auth guard foundation is recorded in:

- `lib/supabase-auth.js`
- `tests/supabase-auth-guards-test.js`

Production frontend login has not been switched yet. Phase 3 runtime remains live while Phase 4 Auth is validated.

## Authorization model

Application roles are only:

- `doctor` — default normal account
- `admin` — privileged administrative account

Account status is separate:

- `active`
- `suspended`
- `disabled`

Authorization is read from `public.profiles`, never from user-editable Auth metadata.

## Implemented foundation

- `public.profiles` keyed 1:1 to `auth.users.id`
- automatic Auth-user → profile trigger
- default role `doctor`
- `private.is_active_user()` and `private.is_admin()` security-definer helpers with explicit `search_path`
- RLS on profiles and personal-data tables
- clean `user_notes`
- `user_preferences`
- doctor own-row access only
- suspended/disabled account blocking
- no client-side role or status update privilege
- server `requireDoctor()` and `requireAdmin()` guards
- isolated Auth guard CI tests
- trusted, private owner-claim helper for the one-time legacy personal-data remap
- trusted, private pre-cutover rollback helper

## Verified security behavior

Database tests already proved:

- a user cannot self-promote through `user_metadata.role='admin'`
- Doctor A cannot read Doctor B personal data
- an active admin can read all profiles
- a suspended account cannot read personal data
- authenticated users cannot update `role`, `status`, `legacy_user_id`, or `id`
- browser roles cannot execute the one-time legacy owner claim or rollback helpers
- the owner claim rejects an unknown Auth UUID before changing any data
- a rejected claim leaves legacy personal-data counts unchanged

## Trusted owner claim

`private.claim_legacy_owner(...)` is intentionally **not an API endpoint**. It is a `SECURITY INVOKER` function in the non-exposed `private` schema and `EXECUTE` is revoked from `public`, `anon`, and `authenticated`.

It is only run after a real Google → Supabase login has created the owner `auth.users` + `profiles` rows.

The trusted call requires all of these values explicitly:

- the real Supabase Auth user UUID
- the expected owner email
- the existing Phase 3 legacy user UUID
- the exact expected Favorite count
- the exact expected Prescription count

Before moving anything it verifies:

1. the Auth UUID exists;
2. the Auth email matches exactly;
3. the profile exists and is active;
4. the profile is not mapped to a different legacy UUID;
5. the legacy UUID is not claimed by another profile;
6. legacy Favorite/Prescription counts match the expected baseline;
7. the new Auth UUID owns zero Favorite/Prescription rows before the claim.

Only then, in the same database transaction, it:

1. promotes the verified profile to `admin`;
2. attaches `profiles.legacy_user_id`;
3. remaps Favorites to the real Auth UUID;
4. remaps Prescriptions to the real Auth UUID;
5. recounts source and target rows;
6. aborts the entire statement if any post-move count differs;
7. writes the successful claim to `audit_logs`.

No owner email, Auth UUID, or legacy UUID is hardcoded into the public repository.

`private.rollback_legacy_owner_claim(...)` is the pre-Phase-5 emergency reverse path. It only runs if the profile and exact expected counts still match the freshly claimed state; otherwise it refuses to move anything.

## Google Auth configuration

Google Cloud is configured as an External production OAuth app.

Expected Google Web OAuth configuration:

- Authorized JavaScript origin: `https://barnat-six.vercel.app`
- Authorized redirect URI: `https://ftuchtmolddhhsdcwnqe.supabase.co/auth/v1/callback`

Supabase Google provider should use the matching Web Client ID and Client Secret, with nonce checks enabled and users-without-email disabled.

## Remaining Phase 4 gates

1. Verify Supabase Google provider is enabled with the correct Web client credentials.
2. Run a real Google sign-in and confirm exactly one `auth.users` row and one `profiles` row are created.
3. Confirm the first normal account receives `role='doctor'`.
4. Run the trusted owner claim with the real Auth UUID, expected email, legacy UUID and verified baseline counts.
5. Confirm the owner is `admin`, legacy source counts are zero and the Auth UUID owns the exact migrated counts.
6. Verify a real Supabase access token passes `requireDoctor()` and admin enforcement works.
7. Re-run Security Advisor and full CI.
8. Run the final Preview/browser smoke test once Vercel build capacity is available.
9. Keep the current production login path unchanged until all Phase 4 gates are green.

## Not part of this branch yet

- frontend Auth cutover
- replacing `auth-client.js`
- moving Favorites/Notes/Prescriptions browser flows to Supabase Auth sessions
- Admin Dashboard UI
- removal of legacy login/session code

Those belong to the next cutover step after Phase 4 Auth is proven with real users.
