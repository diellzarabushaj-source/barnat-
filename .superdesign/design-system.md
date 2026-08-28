# MedIndex TailAdmin Clinical Design System

> **Canonical authenticated dashboard override · 2026-08-28**
>
> For every authenticated DRx dashboard surface, the Stripe-inspired shell is the final visual authority. This override supersedes older TailAdmin/teal shell geometry below wherever they conflict.
>
> - One shell only: navy sidebar `#1c1e54`, indigo interaction `#533afd`, white canvas.
> - Sidebar: **238px** desktop; mobile drawer `min(86vw, 300px)`.
> - Top bar: **58px**.
> - Content: max **1360px**, desktop padding **32px 36px 64px**.
> - Sidebar item: **40px** desktop / **44px** touch, 6px radius, Inter 14px / 300.
> - Page title: 32px / 300 / 1.1; mobile 26px.
> - Controls: 40px dense desktop / minimum 44px touch.
> - Dark-shell brand asset: `/brand/drx-horizontal-on-dark.svg`.
> - Teal is reserved for clinical semantics inside page content (verified/safe/clinical state); it is **not** a second shell accent.
> - No page may introduce a second sidebar, second topbar, or competing dashboard stylesheet after `drx-dashboard-stripe.css`.
> - Standalone V2 pages keep page-specific workspace CSS but share the same shell contract through `html.drx-unified-sidebar`.
> - TailAdmin pages keep their functional compatibility layers but `drx-dashboard-stripe.css` must remain the final static stylesheet.
>
> This contract is guarded by automated dashboard-shell tests. When the Stripe reference and older TailAdmin notes disagree, **this override and `design-md/stripe/DESIGN.md` win**.

## Direction

MedIndex is a fast, low-distraction clinical workspace for use while speaking with a patient. The visual language is a faithful TailAdmin-style data workspace adapted to MedIndex: quiet neutral surfaces, crisp borders, restrained teal interaction color, compact but comfortable controls, and strong information hierarchy. It must look deliberate and medically professional, never like an ecommerce dashboard, marketing landing page, PDF viewer, or playful consumer app.

This is the only approved design direction. Preserve the MedIndex name, mark, Albanian copy, real data, navigation, existing behaviors, URLs, and backend contracts. Design work changes presentation and interaction clarity only.

## Source DNA

- Reference: TailAdmin free dashboard at `https://free-demo.tailadmin.com/`.
- Retain: neutral-dominant canvas, fixed sidebar, compact top bar, 12-column dashboard logic, white bordered cards, small status badges, 12/24px rhythm, 8–12px radii, concise typography, restrained transitions, and accent color only at meaningful interactive states.
- Adapt: TailAdmin blue becomes MedIndex teal. Outfit becomes the existing local Inter/system stack. Ecommerce imagery and TailAdmin branding are forbidden.
- Reject: gradients, glassmorphism, excessive shadows, oversized hero sections, decorative illustrations, colorful category cards, bouncy motion, dense all-caps headers, and large accent-filled surfaces.

## Product principles

1. **Answer first:** the most likely clinical answer, medicine identity, code, value, dose, or next protocol action appears before secondary metadata.
2. **One scan path:** each screen has one obvious search/filter area, one primary content area, and one primary action.
3. **Calm density:** maximize useful data without squeezing text, duplicating labels, or forcing avoidable horizontal scanning.
4. **Source confidence:** source, freshness, verification, warnings, and archived state are explicit but visually secondary to the clinical answer.
5. **Fast under weak connectivity:** use system/local assets, inline/local SVG icons, CSS-only motion, static content, and no runtime font or image dependency.
6. **Safe before polished:** warnings and provenance use semantic color and plain language; design never implies unverified clinical certainty.

## Color

### Brand teal

| Token | Value | Use |
| --- | --- | --- |
| teal-25 | `#f7fbfa` | quiet page accents |
| teal-50 | `#eaf4f1` | active navigation and selected rows |
| teal-100 | `#d6eae5` | badge borders and subtle focus support |
| teal-200 | `#b6d8d0` | hover borders |
| teal-300 | `#83b9ae` | dark-mode accents |
| teal-400 | `#4f958d` | secondary accent |
| teal-500 | `#1f7779` | primary action and selected state |
| teal-600 | `#155f63` | primary hover and strong text |
| teal-700 | `#0d4145` | high-contrast brand text |

Teal is rationed. Use it for the primary CTA, active navigation, selection, links, focus support, verified source state, and small data accents. Do not fill large page regions with teal.

### Neutrals

- Page: `#f9fafb`; surface: `#ffffff`; subtle surface: `#f2f4f7`.
- Primary text: `#101828`; supporting text: `#475467`; muted text: `#667085`; placeholder/disabled: `#98a2b3`.
- Border: `#e4e7ec`; stronger border: `#d0d5dd`.
- Dark mode: page/surface `#101828`/`#1d2939`, text `#f9fafb`, muted `#98a2b3`, border `#344054`.

### Semantic states

- Success/verified: `#027a48` text, `#ecfdf3` surface, `#12b76a` indicator.
- Warning/clinical caution: `#b54708` text, `#fffaeb` surface, `#f79009` indicator.
- Error/blocked/stale: `#b42318` text, `#fef3f2` surface, `#f04438` indicator.
- Informational states default to teal or neutral; never introduce extra categorical rainbow colors.

## Typography

- Font: `Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.
- Codes: `ui-monospace, "SFMono-Regular", Consolas, monospace`.
- Never fetch web fonts.
- Page title: 28–30px / 650 / 1.2; mobile 24px.
- Section title: 18px / 600 / 1.35.
- Card title and important table identity: 14–16px / 600 / 1.35.
- Body: 14px / 400 / 1.5.
- Dense table and metadata: 13px / 400–500 / 1.45.
- Label/caption: 12px / 500–600 / 1.4.
- Avoid letter-spaced uppercase except short 11–12px sidebar group labels.
- Clinical prose gets 60–78 character line length. Long dose/protocol text must wrap naturally.

## Spacing and geometry

- Base rhythm: 4px; common steps: 8, 12, 16, 20, 24, 32px.
- Page gutter: 20px desktop, 16px tablet, 12px mobile; content max width 1600px.
- Sidebar: 264px; collapsed 76px. Top bar: 64px.
- Standard control: 44px high. Dense secondary control: minimum 40px. Touch target: minimum 44×44px.
- Button/control radius: 8px. Card/table radius: 12px. Dialog radius: 16px. Pills: 999px.
- Card padding: 20–24px for major cards; 12–16px for dense rows and tables.
- Primary shadow: `0 1px 2px rgba(16,24,40,.05)`. Use medium shadow only for floating menus/dialogs or an actively lifted interactive card.
- No surface should depend on a shadow for its boundary; use the neutral border.

## Shared shell

- Fixed white/dark sidebar with compact grouped navigation and one understated teal active row.
- Top bar contains menu toggle, local global search with keyboard hint, theme action, “Recetë e re”, and compact user identity.
- Page heading contains breadcrumb, title, one-sentence description, and a small data/source status when useful.
- Avoid repeating the page title in a second oversized hero. Page-owned content begins after a 20px gap.
- Desktop keeps only the workspace content scrollable. Mobile uses a drawer and overlay; no hidden horizontal page overflow.

## Controls

- Inputs/selects: white/dark surface, 1px neutral border, 8px radius, 14px type, obvious placeholder, teal border/support ring on focus.
- Primary button: solid teal-500, white text, no gradient; hover teal-600; disabled opacity plus semantic disabled behavior.
- Secondary: surface with neutral border and gray-700 text.
- Ghost: transparent with neutral text; use only in compact toolbars.
- Focus: visible 3px amber outline with 3px offset for keyboard clarity, matching the current professional layer.
- Use Albanian action verbs. Every icon-only action needs an accessible name and tooltip/title.

## Tables

- Tables are for comparison and rapid selection, not for prose walls.
- Surface is white/dark, 1px border, 12px radius, no zebra striping.
- Header is sticky, 12px medium gray-500, sentence case, 44px minimum height, subtle bottom border.
- Body cells are 13px with 11–14px vertical/horizontal padding. Rows have a clear hover and selected state.
- Medicine name/substance is the strongest anchor; ATC and identifiers use monospace/muted styling.
- Keep checkbox, identity, ATC, strength, form, and status compact. Long adult/pediatric dosage content gets purpose-built cells with clear labels and wrapping; do not fake an infinitely wide spreadsheet.
- If horizontal overflow remains necessary, keep the identity columns sticky and show a subtle edge cue. The whole page must never scroll horizontally.
- Loading, empty, error, offline, sorting, and selected states must retain stable dimensions to prevent layout jumps.
- On small screens, convert records to accessible stacked summaries only where comparison would otherwise be unusable; retain the same data and actions.

## Cards, lists, and dialogs

- Cards use white/dark surface, 1px border, 12px radius, restrained hover border, and little or no shadow.
- Prefer dense row cards for search results and 2–4 column grids for navigational categories.
- One card has one clear title, brief supporting line, compact metadata, and actions aligned consistently.
- Dialogs use a dark translucent overlay, 16px radius, strong heading, close button, focus trap, Escape behavior, and fixed footer actions when content scrolls.

## Page patterns

### Barnat

- Search and high-value filters lead. Counts, source quality, and selection summary are compact and adjacent.
- The main medicines table fills the available clinical workspace. Name and substance remain readable while dosage detail stays structured.
- Selection action should be obvious, stable, and ready for prescription handoff without covering the table.

### Klasifikimi, ICD, and Analizat

- Use the same restrained page heading and filter bar, then neutral cards/rows.
- Remove gradient heroes and multicolor chapter/category cards. Use icon, code, count, title, and one secondary line.
- Drill-down/breadcrumb state is always visible and reversible.

### Dozologjia

- Search, adult/pediatric mode, form, and patient calculator are visibly grouped.
- Put the practical dose answer before source/detail fields; warnings are adjacent and never hidden by animation.

### Recetat

- Maintain a two-column desktop composer/preview and one-column mobile flow.
- Make progress, validation, generated-content review, print/export, and save states explicit.

### Login and recovery

- Use a quiet TailAdmin split layout on wide screens and a single focused form on mobile.
- No external imagery; use MedIndex brand, short trust copy, and local CSS/SVG decoration only.

## Protocol list and reader

- Catalog rows show title, domain/type/date/source state, then exactly two main actions: **Elaboro protokollin** and **Shiko burimin**.
- “Shiko burimin” opens the official Ministry of Health URL directly. A private mirrored document may remain a tertiary fallback where it already exists.
- The reader is an HTML clinical workspace, never a PDF imitation. It uses a narrow summary/header, a two-column desktop body, and one-column mobile body.
- Main column: a vertical numbered timeline with `Hapi 1`, `Hapi 2`, `Hapi 3`…; each step has an action title, one-sentence objective, practical details, warnings, and visible section/page citations.
- Side column: sticky “Në këtë protokoll” navigation plus a verified source card with document date, official link, and source status.
- Current step uses a teal outline/marker; completed progress is not inferred unless the user explicitly interacts.
- Motion: 140–180ms opacity/translate entrance and connector progress only; no bounce, scroll hijacking, or delayed access. `prefers-reduced-motion` removes it.
- Content is source-derived at build time. Never invent missing clinical guidance. If the stored source hash is stale/mismatched, hide the elaborated reader and show only the official source with a clear blocked state.
- Archived documents are source-only unless a separately verified current elaboration exists.
- Footer language: “Përmbajtja është elaboruar 100% mbi dokumentin zyrtar të Ministrisë së Shëndetësisë, Prishtinë.” Include that the official document prevails and show the source link.

## Responsive behavior

- Breakpoints follow the current app: 1439, 1279, 1199, 1023, 767, 479px.
- At 1023px the sidebar becomes a drawer and complex filter grids become two columns.
- At 767px controls stack, page gutters become 12px, type in editable fields stays at least 16px, and multi-column content becomes one column.
- Never hide critical source, warning, current selection, or primary action information solely because the viewport is small.

## Motion and performance

- Default interaction transition: 150ms for color, border, background, opacity, and at most 1px elevation.
- Navigation/drawer: 200–250ms linear or standard ease. No decorative looping animation.
- Honor `prefers-reduced-motion` by reducing durations to near-zero.
- No runtime icon/font CDN, large decorative image, video, canvas effect, glass blur dependency, or JavaScript animation library.
- Preserve the existing service worker/offline runtime and avoid layout shifts while data loads.

## Accessibility and clinical guardrails

- Meet WCAG AA contrast for text and interactive states.
- Preserve semantic table markup, labels, headings, dialogs, live regions, keyboard sorting, focus management, and meaningful source links.
- Never communicate status by color alone; pair color with text/icon.
- Never obscure or truncate medicine identity, dose, contraindication/warning, protocol step, or source provenance without an accessible way to read it.
- Do not change business logic, API calls, authentication, clinical data, storage keys, URL structure, or prescription behavior during the visual redesign.
