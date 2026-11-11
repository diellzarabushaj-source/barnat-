# DRx / Barnat — shared context for coding assistants

This document is the stable entry point for new AI sessions. It deliberately
contains **no hard-coded percentage or purportedly current release status**;
those become stale as soon as the repository changes.

## Product and architecture

- **Repository:** https://github.com/diellzarabushaj-source/barnat-
- **Production domain:** https://barnat-six.vercel.app
- **Audience:** physicians in Kosovo; clinical accuracy and source fidelity
  matter more than cosmetic release speed.
- **Runtime:** static HTML/CSS/JavaScript with small Vercel Node.js functions
  in `api/`; `lib/` contains shared logic; Supabase is the data provider.
- **Major workspaces:** registry of medicines, dosology, ICD-10, prescriptions,
  antibiotics, labs, protocols, emergencies, Medical Hub and MedLex.
- **Tests/build:** `package.json` is authoritative. Relevant clinical and
  security tests must be used in addition to the broad `pnpm test` gate.
- **Specific source contracts:** see `AGENTS.md`, especially Doctor on Duty
  imports and prohibition on silent changes to medical source content.

## Retrieve the current project state every session

1. Read `AGENTS.md`, this file, `README.md`, and the relevant feature docs.
2. Inspect the actual `main` commit, recent merged/open PRs, open GitHub Issues
   and the GitHub checks for the current head SHA.
3. Compare the deployed SHA with main. The administrator can inspect the
   production instance's SHA on `/project-progress.html`; do not assume that
   the current repository is already serving in production.
4. Inspect the specific module code and its tests before saying it is done.
5. Track four separate states: **implemented**, **tested**, **merged**, and
   **deployed**; clinical/source validation is a further independent gate.
6. If a source is unavailable, write **UNKNOWN** with a reason, never 100%.

## Source of progress data

`/api/project-progress` is admin-authenticated and read-only. It fetches:

- GitHub's current `main` commit;
- the commit's reported check-runs;
- GitHub Issues (closed/open task counts); and
- recent commits.

It compares `main` with `VERCEL_GIT_COMMIT_SHA` of the Vercel Function serving
the current request. This tells us about code publication, **not** about
untracked runtime content changes, patient data, database synchronization, or
clinical approval. A missing deployment SHA is reported as unknown.

The dashboard separately reads `/api/neon-status` for Supabase dataset counts
and sync health. Those figures come from the running site and are not taken as
proof that the clinical content is correct or reviewed.

GitHub Issues are the measurable task denominator. To keep the chart useful,
create or maintain an Issue for substantial work; close it only when its
acceptance criteria are actually met. Avoid treating missing issues as done.

## AI handoff

Project Pulse has a **Kopjo kontekstin për AI** button to copy a live snapshot
into a new chat if that model cannot directly read the repository. Agents with
repository access should fetch current evidence themselves; this file is the
orientation, not a replacement for fresh verification.

## Operational notes

- The panel is `/project-progress.html`, linked from the Admin Console.
- The API is protected with the same live Supabase admin-session policy as
  other private admin functionality.
- `PROJECT_PROGRESS_GITHUB_TOKEN` is an **optional server-only** Vercel secret
  for higher GitHub API request limits. Public GitHub requests work without it,
  but refresh is throttled to five minutes per visible browser session.
- No tokens, service keys or private patient data belong in project summaries.
