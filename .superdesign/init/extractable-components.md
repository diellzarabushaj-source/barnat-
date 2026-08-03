# Extractable Components

The app is vanilla HTML/CSS/JS. These stable DOM/CSS/runtime patterns can become reusable Superdesign `DraftComponent` entities without changing application logic.

## Layout components

### TailAdminAppShell

- Sources: `tailadmin-shell.js`, `tailadmin-shell-legacy.js`, `tailadmin-medindex.css`.
- Category: layout.
- Purpose: responsive shell containing sidebar, top bar, page heading, and workspace.
- Props: `activePath`, `sidebarCollapsed`, `sidebarOpen`, `theme`, `offlineState`.
- Hardcoded: MedIndex brand, Albanian navigation, local icons, class names, and breakpoints.

### SidebarNavigation

- Sources: `tailadmin-shell-legacy.js`, `tailadmin-medindex.css`.
- Category: layout.
- Purpose: grouped desktop/mobile navigation with active state and favorites count.
- Props: `activeItem`, `homeHref`, `favoriteCount`, `collapsed`, `mobileOpen`.
- Hardcoded: KRYESORE, REFERENCA KLINIKE, MJETET; Barnat, Klasifikimi, ICD, Analizat, Dozologjia, Protokollet, Recetat, Favoritet, and Kërko.

### TopBar

- Sources: `tailadmin-shell-legacy.js`, `tailadmin-medindex.css`.
- Category: layout.
- Purpose: sidebar toggle, global search, theme switch, new-prescription action, profile, and connection feedback.
- Props: `sidebarOpen`, `theme`, `offlineState`, `showPrimaryAction`, `primaryActionHref`.

### PageHeading

- Sources: `tailadmin-shell-legacy.js`, `tailadmin-medindex.css`, `tailadmin-professional.css`.
- Category: layout.
- Purpose: route-aware title and concise subtitle before page-owned content.
- Props: `currentPage`, `showSubtitle`, optional page action.

### ClinicalReferencePage

- Sources: `clinical-reference.css`, `dozologjia.html`, `protokollet.html`.
- Category: layout.
- Purpose: hero, sticky filters, live status, responsive results, source/safety notice.
- Props: `showSummary`, `summaryCount`, `filterMode`, `hasWarning`.

### ProtocolReaderLayout

- Sources: future protocol reader built on `protokollet.html`, `protokollet.js`, and verified `data/protocols.json` metadata.
- Category: layout.
- Purpose: source-backed clinical protocol overview with a navigable vertical timeline and an always-visible source panel.
- Props: `protocolId`, `activeStep`, `archived`, `sourceVerified`, `reducedMotion`.
- Hardcoded: Ministry of Health provenance notice, official-source CTA, source/hash safety rules.

## Basic components

### TailAdminFormControl

- Source: `tailadmin-medindex.css`.
- Props: `disabled`, `invalid`, `focused`, `controlType`.
- Hardcoded: 44px height, typography, border, radius, placeholder, and focus ring.

### TailAdminButton

- Source: `tailadmin-medindex.css`.
- Props: `variant` (`primary`, `secondary`, `ghost`), `disabled`, `loading`.
- Hardcoded: geometry, font, brand colors, hover, pressed, and focus treatment.

### TailAdminStatusBadge

- Sources: `tailadmin-medindex.css`, `clinical-reference.css`.
- Props: `variant` (`brand`, `success`, `warning`, `error`, `neutral`), `count`, `visible`.
- Hardcoded: pill geometry, typography, semantic palette, and dark mode.

### TailAdminSurfaceCard

- Source: `tailadmin-medindex.css`.
- Props: `interactive`, `selected`, `disabled`.
- Hardcoded: surface, radius, border, shadow, text hierarchy, and restrained hover.

### TailAdminDataTable

- Sources: `tailadmin-medindex.css`, `first-page-clinical.css`, `registry-dosage-columns.css`.
- Props: `sortKey`, `sortDirection`, `selectedCount`, `loading`, `density`.
- Hardcoded: sticky header, row height, typography, selection cues, responsive overflow, code font.

### ClinicalHero

- Source: `clinical-reference.css`.
- Props: `showSummary`, `summaryCount`, `title`, `description`, `kicker`.

### ClinicalToolbar

- Source: `clinical-reference.css`.
- Props: `query`, `activeCategory`, `activeType`, `archiveMode`, `sticky`.
- Hardcoded: responsive grid, control geometry, focus ring, and sticky offset.

### ClinicalRowCard

- Sources: `clinical-reference.css`, `dozologjia.js`, `protokollet.js`.
- Props: `selected`, `archived`, `mirrored`, `expanded`.
- Hardcoded: row grid, title/body hierarchy, metadata, actions, border, and radius.

### ClinicalChip

- Source: `clinical-reference.css`.
- Props: `variant`, `warning`, `active`.

### ClinicalActionGroup

- Source: `clinical-reference.css`.
- Props: `primaryDisabled`, `showSecondary`, `busy`.

### ClinicalNotice

- Source: `clinical-reference.css`.
- Props: `visible`, `severity` (`info`, `warning`).

### ClinicalEmptyState

- Sources: `clinical-reference.css`, `protokollet.js`.
- Props: `loading`, `error`, `showRetry`.

### ProtocolTimeline

- Source: future protocol reader component.
- Props: `steps`, `activeStep`, `completedSteps`, `sourceVerified`, `reducedMotion`.
- Behavior: numbered Hapi 1/Hapi 2/Hapi 3 progression, clear title and one-line objective per step, expandable evidence/details, visible section/page citations, and brief purposeful entrance/selection animation.
- Safety: never infer missing clinical content; hide stale elaboration when the stored official-source hash does not match.

### ProtocolSourcePanel

- Source: future protocol reader component.
- Props: `officialUrl`, `documentDate`, `sourceHash`, `verified`, `archived`.
- Behavior: primary “Shiko burimin” action opens the official Ministry source directly; provenance and verification state remain legible without opening a PDF.

### MedicalIcon

- Source: `medical-icons.js`.
- Props: `iconName`, `className`, `active`.
- Hardcoded: paths, viewBox, stroke, accessibility behavior, and fallback.

### AccessibleDialogBehavior

- Source: `clinical-dialog.js`.
- Props: `open`, `closeOnEscape`, `trapFocus`.
- Hardcoded: focusable selector and existing close hooks.
