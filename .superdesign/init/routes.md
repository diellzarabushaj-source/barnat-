# Routes

## Routing model

- Framework/router: none. This is a flat, static vanilla HTML/CSS/JavaScript app deployed from the repository root.
- Route resolution: Vercel serves the matching `.html` file. `/` and `/index.html` are the same medicines-registry page.
- Authentication gate: `middleware.ts` redirects unauthenticated document requests to `/login.html?return=...`; it is middleware, not a client router.
- Protected layout: `tailadmin-shell.js` loads `tailadmin-shell-legacy.js`, which creates the shared TailAdmin-style sidebar/topbar and reparents the page content into `.mi-page-slot`. Final layout normalization is in `tailadmin-professional.js`.
- Public/auth layout: `/login.html` and `/recovery.html` use the standalone split-card layout in `login.css` plus the auth section of `tailadmin-medindex.css`.
- There is no router config file to include.

## Route map

| URL path | Entry file | Layout | Summary |
| --- | --- | --- | --- |
| `/` | `index.html` | Shared protected TailAdmin application shell | Alias of `/index.html`; opens the main medicines registry. |
| `/index.html` | `index.html` | Shared protected TailAdmin application shell | Search/filter toolbar, selectable medicines table, dosage columns, pagination, favorites, and prescription handoff. |
| `/klasifikimi.html` | `klasifikimi.html` | Shared protected TailAdmin application shell | ATC group cards, drill-down navigation, registry-backed drug results, audit/source information. |
| `/icd.html` | `icd.html` | Shared protected TailAdmin application shell | ICD-10 chapter and code grids, clinical filters, quick navigation, and code-detail dialog. |
| `/analizat.html` | `analizat.html` | Shared protected TailAdmin application shell | Laboratory-test search, categories, source status, result cards, and test-detail dialog. |
| `/dozologjia.html` | `dozologjia.html` | Shared protected TailAdmin application shell | Searchable dosage cards, adult/pediatric filters, patient calculator, source and safety information. |
| `/protokollet.html` | `protokollet.html` | Shared protected TailAdmin application shell | Filterable catalog of 55 official protocols with official-source and mirrored-document actions. |
| `/recetat.html` | `recetat.html` | Shared protected TailAdmin application shell | Prescription composer, local/AI formatting actions, live preview, review gates, and saved prescription library. |
| `/login.html` | `login.html` | Standalone TailAdmin-style authentication layout | Password sign-in form and private-access information panel; accepts a safe `return` query parameter. |
| `/recovery.html` | `recovery.html` | Standalone TailAdmin-style authentication layout | Clears stale caches/service workers and returns the user to a safe application route. |

## In-page navigation and document destinations

- `/index.html#favoritet` and `/index.html#kerko` are shell navigation intents handled on the registry page; they are not separate route entries or components.
- ICD and laboratory details open in dialogs on their current pages; there are no per-record URLs.
- Protocol originals open through `/api/protocol-document?id=<protocol-id>` or the external official Ministry URL. The API response is a PDF/DOCX stream, not an HTML page.
- All `/api/*` paths are server endpoints and are intentionally excluded from the page-route table.
