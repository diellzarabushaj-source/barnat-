# ICD hierarchy tree — Phase 7

The ICD page now treats ICD-10 as a hierarchy rather than a flat table.

## Interaction model

- Chapter → block → category → subcategory.
- Child nodes load only when their parent is opened.
- Opening one sibling collapses the other siblings at the same level.
- Search results reveal and expand the complete ancestor path.
- The detail panel and prescription transfer remain available from every node.
- Keyboard support includes Arrow Up/Down/Left/Right, Home, End, Enter, Space and Escape in search suggestions.

## Performance and accessibility

Only the 22 chapters render initially. The browser does not create 12,542 DOM rows at page load. The tree uses ARIA tree/treeitem/group roles, visible focus, reduced-motion support, forced-colors support and responsive layouts for desktop, tablet and phone.

## Data-source note

The production Google Sheet is private. The API currently reports HTTP 401 until a server-readable source or validated snapshot is configured. The tree includes an explicit retry/error state and does not present partial data as the full hierarchy.
