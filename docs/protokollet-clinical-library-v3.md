# DRx Clinical Library V3 — 2026-11-21
The protocol interface was rebuilt from scratch. The application shell and account authentication remain compatible with the rest of DRx. The data manifest \`data/protocols.json\` (55 locally indexed, source-linked documents) was deliberately **not deleted** because it contains source metadata, official document URLs and hash/provenance evidence.
## UX
- Mobile-first, system-based browsing with 12 organ/system categories and a separate emergency filter.
- Search ignoring Albanian accents, document type filters, newest/oldest/A–Z sort, local favorites, deep linking and related documents.
- Lightweight SVG icon library and motion with reduced-motion support; no external CDN dependency.
- Direct official MSh document links. No generated clinical advice, no invented dose, no automatic "in-force" claim.
## Clinical/source limitations
- "Historik" reflects pre-existing COVID-19 archive flags only, not a government revocation.
- A document's presence in the register is not proof that it is the current clinical version; clinicians must verify publication/version/approval in the MSh catalogue.
- Dataset is a curated set of 55 source-linked clinical documents, **not** a claim that the entire ministry publication catalogue is covered. Duplicate listings and non-clinical administrative materials are not silently added.
- Existing elaboration data and API remain untouched for provenance; the new lightweight reader intentionally opens originals instead of claiming that summaries are clinically reviewed.
## QA
Run \`node tests/protokollet-v2-workspace-test.js\`, \`node tests/protocols-data-test.js\`, and \`pnpm test\` before claiming clinical or deployment acceptance. Ensure a Vercel deployed SHA equals the merged main SHA.