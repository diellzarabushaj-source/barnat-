# Phase 4 — Supabase Auth, roles and RLS

## Status

**IN PROGRESS — BASED DIRECTLY ON MERGED `main`.**

Phase 3 / PR #160 is already merged to `main`, so this Phase 4 branch starts from the current production source of truth rather than from the old Phase 3 branch.

The additive database foundation has already been applied to Supabase and is recorded in:

`supabase/migrations/20260819145700_phase4_auth_roles_rls_foundation.sql`

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

## Verified security behavior

Database tests already proved:

- a user cannot self-promote through `user_metadata.role='admin'`
- Doctor A cannot read Doctor B personal data
- an active admin can read all profiles
- a suspended account cannot read personal data
- authenticated users cannot update `role` or `status`

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
4. Promote the owner/admin account only through a trusted database/server operation.
5. Verify a real Supabase access token passes `requireDoctor()` and admin enforcement works.
6. Map the legacy Phase 3 personal-data owner UUID to the new Auth user before frontend personal-data cutover.
7. Re-run Security Advisor and full CI.
8. Keep the current production login path unchanged until the Phase 4 gates are green.

## Not part of this branch yet

- frontend Auth cutover
- replacing `auth-client.js`
- moving Favorites/Notes/Prescriptions browser flows to Supabase Auth sessions
- Admin Dashboard UI
- removal of legacy login/session code

Those belong to the next cutover step after Phase 4 Auth is proven with real users.
