# Phase 5 — Supabase session cutover with legacy data bridge

Status: **implementation branch** after merged Phase 4.

## Goal

Move the normal MedIndex Google login and protected-page session contract onto Supabase Auth without changing the owner UUID used by the existing personal-data rows or prescription encryption AAD.

## Identity contract

Phase 5 deliberately separates two identifiers:

- `authUid` — canonical Supabase Auth UUID from `auth.users.id`.
- `uid` — private storage/AAD UUID used by the existing `medindex_users`, Favorites and encrypted Prescriptions rows.

For the verified owner these values are intentionally different during Phase 5. The signed HttpOnly MedIndex session is upgraded to version 3 and carries both identities.

The browser never chooses either UUID. Both are produced and verified by the server.

## Normal Google login flow

1. Browser obtains the MedIndex CSRF/raw nonce.
2. Browser sends `SHA-256(raw nonce)` to Google Identity Services.
3. Google returns the ID token.
4. `/api/auth` verifies that Google token against the same SHA-256 nonce.
5. Server exchanges the Google ID token with Supabase Auth using the raw nonce.
6. Server verifies the returned Supabase access token.
7. Server loads the caller's own `profiles` row through RLS and requires `doctor|admin + active`.
8. Server checks that Google, Supabase Auth and the MedIndex profile resolve to the same email/user.
9. If `profiles.legacy_user_id` exists, the private storage user must match it exactly.
10. The owner login fails closed if the trusted legacy mapping is missing or mismatched.
11. Server mints the version-3 HttpOnly MedIndex session with both `authUid` and storage `uid`.

## Session v3

A normal Google session is marked `provider=supabase-google` and includes:

- canonical `authUid`
- storage `uid`
- Supabase `authRole`
- Supabase `authStatus=active`
- legacy compatibility role/name fields used by current UI/API code

The old v1/v2 cookies can still be decoded long enough to route the browser through a clean re-authentication, but protected pages no longer accept them as the current online identity contract.

The emergency password path remains available only as an explicit `legacy-password` rollback session inside the new v3 signed envelope. It does not pretend to be Supabase-authenticated.

## Offline auth lease

The offline lease is rotated from `medindex_offline_lease_v2` to `medindex_offline_lease_v3`.

Old v1/v2 leases are removed. A v3 lease is created only from a valid v3 Supabase session or the explicit rollback session, preventing stale browser storage from bypassing the Phase 5 cutover.

## Encryption invariant

Phase 5 does **not** update `user_prescriptions.user_id` and does **not** change prescription AAD.

Prescription AAD remains:

`<storage uid>:prescription:<clientId>`

Therefore the existing 2 encrypted prescriptions remain decryptable under the legacy owner UUID while the authenticated account is already canonicalized in Supabase Auth.

The same bridge preserves the existing 82 Favorites.

## Rollback

Rollback remains possible because:

- encrypted/private rows are not moved;
- the legacy storage UUID is still present in the v3 session;
- the password path remains a clearly marked rollback session;
- old session versions are read only to force re-authentication, not trusted as the Phase 5 contract;
- Phase 4 trusted mapping rollback support is not removed.

## Phase 5 gates

- normal Google login must exchange through Supabase Auth;
- active doctor/admin profile guard must pass;
- owner `legacy_user_id` must exist and match the private storage user;
- signed session must be v3;
- `authUid` and storage `uid` must remain independently represented;
- protected pages must reject old online v1/v2 sessions and rotate old offline leases;
- Phase 4 auth tests must remain green;
- Favorites and Prescriptions counts must remain 82 / 2 on the legacy UUID and 0 / 0 on the Auth UUID;
- no prescription re-encryption or owner-ID move is allowed in this phase.

## Not part of Phase 5

- physically moving Favorites/Prescriptions to `auth.users.id`;
- decrypting/re-encrypting prescription ciphertext under the Auth UUID AAD;
- removing the legacy storage bridge;
- removing emergency rollback support;
- fixing unrelated pre-existing Mobile WebKit / CLS audit debt.

Those belong to later migration/cleanup phases and must not be mixed into the authentication cutover.