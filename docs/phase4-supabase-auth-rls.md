# Phase 4 — Supabase Auth, roles and RLS

## Status

**IN PROGRESS — STACKED ON PHASE 3. DO NOT MERGE TO `main` BEFORE PR #160 IS COMPLETE.**

The additive database foundation has been applied to the Supabase project and recorded in:

`supabase/migrations/20260819145700_phase4_auth_roles_rls_foundation.sql`

Production frontend/auth has **not** been switched. Medical reads continue to use the already-live Supabase medical path, while the current login/Neon rollback path remains unchanged.

## Final authorization model

There are only two application roles:

- `doctor` — default for every normal MedIndex account.
- `admin` — privileged administrative role.

There is no `user`, `editor`, `super_admin`, or client-side role elevation.

Account status is separate from role:

- `active`
- `suspended`
- `disabled`

## Implemented database foundation

### `public.profiles`

`profiles.id` is a foreign key to `auth.users.id`.

The profile stores MedIndex-specific metadata only:

- `full_name`
- `avatar_url`
- `specialty`
- `license_number`
- `role`
- `status`
- timestamps

Authorization is **not** read from `raw_user_meta_data`. New Auth users are inserted into `profiles` with the database default role `doctor`.

Authenticated users can read their own profile. An active admin can read all profiles. Doctors can update only non-authorization profile columns; `role` and `status` are not granted as client-updatable columns.

### Private authorization helpers

Security-definer helpers live in the non-exposed `private` schema:

- `private.is_active_user()`
- `private.is_admin()`
- `private.handle_new_auth_user()`

All security-definer functions use an explicit empty `search_path` and fully-qualified relation names.

### Auth profile trigger

`medindex_auth_user_profile_created` runs after insertion into `auth.users` and creates the matching `profiles` row.

It copies display/avatar metadata only. It never accepts a role from user-editable Auth metadata.

### Personal data RLS

Authenticated own-row policies are prepared for:

- `user_favorites`
- `user_prescriptions`
- `user_notes`
- `user_preferences`

All personal-data policies require:

1. `user_id = auth.uid()`
2. the profile to be `active`

Legacy `protocol` rows inside `user_favorites` are not exposed to authenticated clients; Phase 4 treats `user_favorites` as drug favorites only and introduces `user_notes` as the clean note store.

### New tables

`user_notes` links a note to `auth.users` and a canonical `drugs.id`, with a unique `(user_id, drug_id)` constraint.

`user_preferences` is one JSON preferences row per Auth user.

Both have RLS and automatic `updated_at` triggers.

## Current data state

At the time Phase 4 was created:

- `auth.users`: 0
- `profiles`: 0
- `user_notes`: 0
- `user_preferences`: 0
- `user_favorites`: 82 copied Phase 3 rows
- `user_prescriptions`: 2 copied Phase 3 rows

The 82 copied favorite/note-history rows remain untouched. Their legacy user UUID must be mapped to the future `auth.users.id` before frontend personal-data cutover.

## Security properties

- `anon` gets no access to profiles or personal tables.
- The browser never receives a Supabase secret key.
- A doctor cannot update `role` or `status` through the normal client grant.
- A doctor cannot read or write another doctor's personal rows.
- Suspended/disabled profiles fail the active-user RLS check.
- Admin write actions such as role/status changes remain server-side operations for a later phase.

## Intentionally not changed yet

Phase 4 does **not** yet:

- switch the frontend login to Supabase Auth;
- configure the production Google OAuth UI flow;
- create/promote the real admin Auth account;
- remap legacy Phase 3 user UUIDs to `auth.users.id`;
- switch personal-data frontend calls to Supabase;
- remove the current custom Google/Neon auth path;
- remove Neon rollback;
- remove anonymous medical-read access needed by the current production frontend.

Those are cutover tasks and must occur only after the new Auth flow is tested.

## Gates before Phase 4 is considered complete

1. Phase 3 / PR #160 gates are green and its copied data is verified.
2. Supabase Google Auth provider and redirect URLs are configured for Preview and Production.
3. A real test doctor can sign in and receives exactly one `profiles` row with `role='doctor'`.
4. The owner/admin account signs in and is promoted to `role='admin'` through a trusted server/database operation.
5. RLS tests prove doctor A cannot read/write doctor B data.
6. RLS tests prove a doctor cannot self-promote to admin or change account status.
7. Suspended/disabled accounts cannot access personal tables.
8. Legacy favorite/prescription user IDs are mapped before personal-data frontend cutover.
9. Supabase Security Advisor has no new Phase 4 security warnings.
10. Production medical reads and the current login remain unaffected until Phase 5.
