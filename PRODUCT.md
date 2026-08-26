# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: a physician in Kosovo — family doctor or specialist — using MedIndex **while speaking with a patient**. The session is short, interruptible, and one-handed as often as not: find the medicine, the dose, the code, or the next protocol step in seconds, then return attention to the person in the room.

The product carries accounts, registration, and an admin console, so other clinical staff can hold logins, but the consultation-time physician is the user every screen is designed around.

## Product Purpose

A fast clinical workspace for searching Kosovo's medicine registry, ATC and ICD classifications, dosing (adult and pediatric), lab analyses, treatment protocols, and prescription preparation. Success is a correct clinical answer surfaced before the pause in the conversation becomes noticeable.

## Positioning

MedIndex is anchored to **the verified Kosovo registry**: medicines, sources, and clinical content are tied to the real national registry and to official documents (Ministry of Health, Prishtina), not to a generic international drug database. A neighboring product can copy the interface; it cannot truthfully claim the same provenance chain for Kosovo.

## Operating Context

- Used during patient consultations in clinics and practices in Kosovo, on both desktop and phone.
- Network conditions are unreliable; the interface is static-first with a service worker, and private data is cached only after authentication.
- Interface language and clinical terminology are Albanian throughout.
- Pages in use: `index.html` (registry), `klasifikimi.html` (ATC), `icd.html`, `analizat.html`, `dozologjia.html`, `protokollet.html`, `recetat.html`, `urgjencat.html`, `sistemi.html`, plus login/registration/admin surfaces.
- Session flow: `auth-client.js` verifies the session against `/api/auth`; the registry page reads the local copy first, then `/api/registry`.

## Capabilities and Constraints

**Confirmed by the user as durable technical constraints:**

- **Vercel** — hosting, static delivery, and all serverless functions.
- **Supabase** — authentication and runtime database traffic. (`lib/neon-data-api.js` and other `neon-*` filenames are legacy names kept to avoid a repo-wide import rename; runtime database traffic is Supabase-only.)

**Observed in the codebase (evidence, not interview):**

- Static HTML/CSS/JS at the repository root; `app-parts/` is the shared registry source that the build compiles into `app-runtime.js`.
- Eleven serverless functions under `api/`, against a twelve-function plan ceiling with one slot deliberately reserved (`tests/hobby-deployment-budget-test.js`).
- Offline-first behavior: service worker, offline shell manifest, targeted PWA caching, and low-bandwidth resilience tests.
- Private endpoints send `Cache-Control: private, no-store`; authentication and AI responses are never cached.
- Verification for adult and pediatric dosing is **fail-closed**: `Po` requires a published dose, an administration route, and an HTTPS source; `Jo` requires an explicit documented decision; when evidence is insufficient the interface shows `Pa të dhëna`.
- Protocol content is derived from official source documents at build time. When a stored source hash is stale or mismatched, the elaborated reader is hidden and only the official source is shown.
- Node 24 and pnpm 10 are pinned for reproducible builds; `pnpm test` runs a large static, clinical, security, performance and UI suite before publishing.

**Open / undecided:** whether internationalization beyond Albanian, or audiences beyond the consultation-time physician, are ever in scope. Not established during this interview — do not assume either way.

## Brand Commitments

- Name and mark: **MedIndex**. Brand assets are governed by `official-brand-assets.json` and enforced by `tests/official-brand-policy-test.js`; only approved logo files may be referenced.
- Interface copy is Albanian.
- `.superdesign/design-system.md` (MedIndex TailAdmin Clinical Design System) is the sole approved design direction: quiet neutral surfaces, rationed teal, Inter, no gradients or glassmorphism, no runtime font or icon CDN.
- `TAILADMIN-LICENSE` and `THIRD_PARTY_NOTICES.md` record the TailAdmin Community Edition lineage and other vendored material.

## Evidence on Hand

- Real Kosovo medicine registry data, ATC classification, and ICD-10 hierarchy with Albanian terminology (`data/`, `lib/icd-sq-terms-*.json`).
- Treatment protocols derived from official Ministry of Health documents, with source URLs, document dates, and source-state tracking.
- Pediatric dosing data with provenance and readiness auditing (`lib/pediatric-*`, `tests/pediatric-*`).
- Brand assets under `brand/`, governed by the manifest above.
- **Absent — never fabricate:** testimonials, user counts, customer names, clinical endorsements, benchmark numbers, pricing, or any dose or protocol step not present in a cited source.

## Product Principles

1. **The clinical answer comes first.** Medicine identity, code, value, dose, or next protocol step precedes all secondary metadata.
2. **Provenance is explicit but secondary.** Source, freshness, verification state, and warnings are always visible and always subordinate to the answer itself.
3. **Safe before polished.** When evidence is insufficient, the interface says so; it never implies clinical certainty it cannot support.
4. **Fast under weak connectivity.** Local and system assets, no runtime font or image dependency, no layout shift while data loads.
5. **Kosovo-specific truth.** Content is tied to the national registry and official documents; generic international substitutes are not equivalent.

## Accessibility & Inclusion

- WCAG AA contrast for text and interactive states.
- Status is never communicated by color alone; color is always paired with text or an icon.
- Medicine identity, dose, warnings, protocol steps, and source provenance are never obscured or truncated without an accessible way to read them.
- Semantic table markup, labels, headings, dialogs, live regions, keyboard sorting, and focus management are preserved.
- `prefers-reduced-motion` reduces all transition durations to near zero.
