# DRx Antibiotikët — UI patterns and implementation notes

**Design authority:** `.superdesign/design-system.md` and `design-md/stripe/DESIGN.md`. Preserve one navy DRx sidebar, one topbar, indigo as a single interaction accent, high contrast, compact clinical density, touch targets ≥44 px on phones, and data/source integrity.

The user requested references from Uiverse.io, Aceternity UI, Magic UI, Loading.io, Flowbite, daisyUI, HyperUI, shadcn/ui and HeroUI. These are **patterns adapted locally**, not a claim that the React component packages were installed. The Antibiotikët page is a vanilla JavaScript/CSS application. Pulling React/Framer/Tailwind into it solely for hover effects would introduce unnecessary weight and conflict with the current shell.

| Reference | Selected pattern | DRx implementation |
| --- | --- | --- |
| [Uiverse — command palette input](https://uiverse.io/uiverse-astronaut/orange-starfish-84) | Focused, high-quality search field and shortcut hint | Existing command search, strengthened focus ring and keyboard discoverability |
| [Aceternity — Card Spotlight](https://ui.aceternity.com/components/card-spotlight) | Soft pointer-following highlight | Card spotlight on pointer-fine devices only; reduced-motion and touch fallback |
| [Magic UI — Border Beam](https://magicui.design/docs/components/border-beam) | Gentle accent emphasis for an active surface | Bounded indigo accent/focus treatment around the search field, never on clinical statuses |
| [Loading.io — CSS loaders](https://loading.io/css/) | Status only when genuine async work is happening | No fake spinners during synchronous local catalog filtering; existing loading state remains authoritative |
| [Flowbite — Search Input](https://flowbite.com/docs/forms/search-input/) | Input grouping, clear action, contextual controls | Search clear button, filter group and active filter chips |
| [daisyUI — Tabs](https://daisyui.com/components/tab/) | Compact segmented navigation | Four search scopes with keyboard navigation; responsive horizontal scroll |
| [HyperUI](https://www.hyperui.dev/) | Tight dashboard row hierarchy | Clear ingredient, ATC, form and contextual match detail lines |
| [shadcn/ui — Combobox](https://ui.shadcn.com/docs/components/base/combobox) | Keyboard-first accessible suggestions | Autocomplete/listbox, ArrowDown/Enter/Escape behavior and focus states |
| [HeroUI — Autocomplete](https://heroui.com/en/docs/react/components/autocomplete) | Ranked searchable entries with type labels | Source-bound substance, brand, ATC and indication suggestions |

## New interaction patterns
- **Fast route filters** PO/IV/IM and other actual route values come from the current product registry; counts follow the existing evidence-grounded filter core. This is **not** a therapeutic recommendation.
- **Compact/normal density** only changes spacing; all clinical caveats, details, sources and approvals remain available.
- **Search domains** explicitly separate substance/ATC, commercial product and recorded indication.
- **Soft focus, card spotlight and filter motion** only enhance legibility, are not used to encode any prescribing recommendation and respect `prefers-reduced-motion`.
- **No new CDN, font, or React/Tailwind runtime**. No modifications to dose calculation, regimen authorization, source data, or stock claims.
- **Testing**: source-verified search tests, Playwright route/keyboard/320 px viewport checks, existing clinical gates and the new `antibiotics-inspired-ui-test.js` in Vercel build CI.
