# Google authentication and persistent user library

MedIndex uses Google Identity Services for the primary sign-in flow and keeps the existing password verifier only as an optional emergency fallback.

## Production configuration

1. Create a Google OAuth 2.0 Web Client ID.
2. Add the authorized JavaScript origin `https://barnat-six.vercel.app`.
3. Store the Client ID as `GOOGLE_CLIENT_ID` in Vercel Production, Preview and Development environments.
4. Keep `SESSION_SECRET` private and at least 32 characters.
5. Keep `MEDINDEX_ALLOWED_EMAILS=diellzarabushaj@gmail.com`.
6. Optionally set a separate `MEDINDEX_USER_DATA_KEY`; otherwise a dedicated encryption key is derived from `SESSION_SECRET`.

The GIS callback flow does not use a redirect URI. The credential is verified server-side against Google's public keys, issuer, audience, expiry, nonce and verified email before MedIndex creates an HttpOnly session.

## Persistent data

- Recipes and drug favorites remain available immediately from local browser storage.
- The first authenticated online load migrates them to Supabase.
- Supabase is the durable copy; local storage remains the fast/offline copy.
- Recipe payloads are encrypted with AES-256-GCM before being stored.
- Deletions use tombstones so deleted items do not return from another device.
- The library is scoped to the authenticated MedIndex user.
