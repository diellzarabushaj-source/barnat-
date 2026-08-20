# Backend production-readiness audit — 2026-08-20

## Final architecture

1. Google credential is verified server-side and exchanged with Supabase Auth.
2. `public.profiles` owns role, account status and professional-verification status.
3. A signed HttpOnly MedIndex session is created only for an `active` profile.
4. Vercel Functions enforce origin, CSRF, rate, role and live account checks.
5. Supabase is the only runtime database. Public clinical reads use the publishable key; private reads and every write use the server secret.
6. RLS, revoked grants, explicit owner predicates and server-side ownership filters protect private rows.

The access model intentionally has two functional roles: `admin` and `doctor`. `doctor` includes both licensed doctors and medical students; they have the same private-user permissions and neither can mutate the global registry.

Neon is detached. `lib/neon-data-api.js` is a compatibility filename only: its base URL, reads, writes and provider flags resolve unconditionally to Supabase. No direct Neon client, OIDC database path, Neon secret in the scheduled workflow, or Neon sync command remains. Vercel's own packages may still carry `@vercel/oidc` transitively for Vercel platform features; MedIndex neither imports nor uses it for database access.

## Findings and remediation

### Critical — resolved

- New accounts could reach `pending` without a professional document and admins could activate them. Registration now requires a validated private upload before the transactional approval function can set `active`.
- Verification storage did not exist. A non-public bucket, private metadata table, unpredictable paths, size/type/magic-byte checks and compensating object deletion are now implemented.
- Admin approval updated profile, private user and audit rows in separate requests. `review_medindex_registration()` now locks and changes them atomically.
- A pending identity needed a safe way to upload without receiving application access. A 15-minute, purpose-bound HttpOnly enrollment proof is now separate from the 8-hour application session.

### High — resolved

- Admin document access now requires a live active-admin check, returns a 60-second signed URL and writes an audit event before returning it.
- Private/server-only tables now have explicit deny policies in addition to RLS and revoked browser grants.
- The obsolete direct Vercel OIDC dependency and the remaining Neon sync command were removed; Supabase is non-switchable at runtime.
- The legacy environment email allowlist can no longer authorize normal users. Approved Supabase profiles are the only multi-user authorization source; the hardcoded owner fallback remains emergency-only.

### Medium — resolved

- Runtime drift between local Node 22 and Vercel Node 24 was removed by standardizing on Node 24.
- Windows-only line-ending and ESM path failures in the regression harness were made cross-platform.
- The verification reviewer foreign key received a covering index; private verification lookup uses `(user_id, created_at desc)`.

### Remaining operational setting

- Supabase reports leaked-password protection disabled. Normal users sign in with Google, and the fallback password is verified by MedIndex rather than Supabase Auth, so this does not open the protected app. Enable the dashboard setting before adding Supabase email/password sign-in.
- The retired Phase 1–3 Neon bridge migrations remain in Supabase's immutable remote migration history but are absent from Git. The bridge objects were removed by the recorded cleanup migration and no runtime path can use them. Phase 4 onward filenames are aligned with the live versions. An authenticated `supabase migration fetch` is required before reconstructing the older files; they must be secret-reviewed before any commit.

## Locked security invariants

- `pending`, `suspended` and `disabled` profiles never receive a Supabase-backed application session.
- Enrollment proof is purpose-bound, expires after 15 minutes and is rejected by the session decoder.
- `active` cannot be assigned to any unverified profile; rejected users must return to `pending`, submit a new document and pass review.
- Only live admins can mutate global drugs or review registrations.
- Personal drugs, favorites, prescriptions, notes and preferences retain an explicit owner and never become global automatically.
- Verification objects are never served by public URLs and direct metadata access is denied.
- Important registration, review and signed-document actions are auditable.
