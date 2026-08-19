# Phase 3 environment scope findings

Observed from the Vercel Preview build without printing any secret values:

- `SUPABASE_SECRET_KEY`: present in Preview.
- `SESSION_SECRET`: present in Preview.
- Vercel OIDC token: present in Preview.
- `GOOGLE_CLIENT_ID`: not present in Preview.
- `MEDINDEX_DRIVE_SYNC_SECRET`: not present in Preview.
- `MEDINDEX_WRITE_PROVIDER`: not explicitly set in Preview.
- `MEDINDEX_MEDICAL_READ_PROVIDER`: not explicitly set in Preview.
- `MEDINDEX_SUPABASE_URL` / `MEDINDEX_SUPABASE_PUBLISHABLE_KEY`: not explicitly set in Preview; code currently has the known project URL/publishable defaults.

Production `/api/auth` reports secure auth configured, including Google, session signing and password fallback. This indicates auth variables are environment-scoped and Preview should not be assumed to match Production.

Before production write cutover, make the write provider explicit and migrate/verify private state first.
