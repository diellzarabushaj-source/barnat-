---
version: "ui2web-website-clone"
name: "eCommerce Dashboard | TailAdmin - Tailwind CSS Admin Dashboard Template"
description: "A neutral-dominant interface with strategic primary-blue accent moments. Outfit typography creates a geometric, engineered aesthetic. Spacing is generous (24px rhythm dominates); cards and controls use 8px radius for softness without playfulness. Motion is subtle and linear. The palette reserves vivid blue for interactive states (CTAs, active nav, chart fills) and positive indicators, while the vast majority of screen real estate remains white or near-white to maximize data legibility."
colors:
  primary: "#465FFF"
  secondary: "#667085"
  accent: "#FD853A"
  background: "#FFFFFF"
  surface: "#F9FAFB"
  text-primary: "#000000"
  text-secondary: "#667085"
  border: "#E4E7EC"
  success: "#667085"
  danger: "#FD853A"
components:
  card:
    background: "surface (#F9FAFB)"
    radius: "8px"
    border: "1px solid border (#E4E7EC)"
  button:
    background: "primary (#465FFF)"
    radius: "8px"
    text: "text-primary (#000000) or #FFFFFF depending on context"
typography:
  body-md:
    fontFamily: "Outfit"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "1.43"
  label-md:
    fontFamily: "Outfit"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: "1.27"
spacing:
  base: "24px"
  gap: "12px"
  card-padding: "24px"
  section-padding: "24px"
rounded:
  control: "8px"
  card: "8px"
  pill: "9999px"
---
# eCommerce Dashboard | TailAdmin - Tailwind CSS Admin Dashboard Template

Source: https://free-demo.tailadmin.com/

## Overview

This dashboard establishes a data-forward, low-distraction visual system. The palette is almost entirely neutral (white and grays dominating ~99% of the canvas), with a small, intentional injection of primary blue (#465FFF, ~0.3% coverage) reserved for interactive affordances—active navigation, primary buttons, chart fills, and positive metrics. A secondary orange accent (#FD853A) appears sparingly for calls to action. Outfit's geometric, medium-weight structure creates a sense of technical precision and modernity without ornamentation. Spacing is abundant and consistent; cards and controls use gentle 8px radius to soften geometry while maintaining clarity. Motion is restrained (linear, short-duration) to preserve the focused, professional tone.

## Composition

**First screen:** Left sidebar (fixed, dark-neutral nav with primary-blue active state) + top search/notification bar (white background, subtle input styling) + a two-column main canvas: left column holds three single-metric cards (with change indicators: green for up, red for down) and a large bar chart; right column contains a radial progress visualization and a smaller tabbed overview grid.

**Section rhythm:** Cards and charts are arranged in a loose grid, not uniform rows. The sidebar-aware margin creates asymmetry that favors the main data area over secondary content.

**Deliberate choice:** A flexible, data-dense grid (not a centered hero, not a strict 2-up/3-up layout) that allows metric cards to breathe independently while chart containers consume available width. This rejects a uniform card-only rhythm in favor of mixed aspect-ratio containers that accommodate both summary numbers and visualizations.

**Typography roles:** Section headings (e.g., above chart and statistics areas) use label-md (30px, 700 weight) for visual dominance; supporting descriptors and body text use body-md (14px, 400) for legibility in data-dense contexts.

## Colors

**Primary (#465FFF, ~0.3% coverage):** Reserves the vivid blue for the active nav item (left sidebar), primary button (bottom CTA), chart bar fills, and accent strokes. The extreme restraint (less than 1% of screen area) makes each blue moment read as *intentional interaction* rather than background decoration.

**Secondary (#667085, ~35% coverage):** Muted mid-tone gray dominates descriptive labels, secondary text, disabled states, and tertiary nav items. Provides hierarchy without contrast shock.

**Text primary (#000000, ~36% coverage):** All metric numbers, section headings, and key data values. Pure black for maximum readability on white.

**Background & Surface (#FFFFFF at 81.5%, #F9FAFB at 7.1%):** Almost the entire canvas is white; light gray surfaces (#F9FAFB) subtly separate card containers from the base background without harsh borders.

**Border (#E4E7EC, ~0.1% coverage):** Hairline gray dividers between cards and in table rows—so minimal they almost disappear, keeping the focus on data.

**Accent indicators:** Inline positive trends use an observed bright green (not a candidate hex—an approximate #10B981 visual); negative trends use an observed red (approximate #EF4444). These are tiny (inline text indicators, 12–14px) and do not appear in the candidates, so they remain noted as observed approximations. They provide immediate +/– scanning without overwhelming the neutral base.

**Rationing logic:** Blue appears only where the interface asks for interaction or emphasizes a key state. Orange appears nowhere in this dashboard view (but would be reserved for primary CTAs in other page contexts). The vast majority of cognitive load shifts to grayscale typography and data content, making the few blue moments *navigationally significant*.

## Typography

**Pairing:** Outfit (geometric, modern, medium-weight baseline) for both display and body. No serif or script faces; consistency reinforces the technical, dashboard-native aesthetic.

**Hierarchy:**
- **30px / 700 weight (label-md):** Section headings ("Monthly Sales," "Statistics," "Monthly Target"). Bold and large enough to anchor a data section without distraction.
- **14px / 400 weight (body-md):** All body text, metric descriptions, legend labels, and supporting copy. Lightweight (400) keeps it scannable; the metric numbers themselves remain pure black at the same size for prominence through color and position, not weight.

No italic, no decorative caps. Pure functional clarity.

## Layout

**Spacing rhythm:** 24px is the dominant unit (gutters between sections, card padding, top/bottom margins). Tighter 12px gaps appear between grouped elements (metric card trio, chart subtitle to title). 8px only appears as internal control padding (button text offset, input borders).

**Grid type & direction:** Flexible bento (not masonry, not uniform). The left column stacks vertically (three metric cards, then a large chart). The right column contains a full-height radial visualization plus a bottom tabbed grid—both right-aligned but not forced into a rigid 2-up structure. This asymmetry accommodates chart aspect ratios and avoids forced-square card syndrome.

**Max-width:** No visible constraint on the main canvas; the sidebar acts as a left anchor, and the content spreads to fill the right edge.

**Card density:** Moderate. Metric cards are ~280px wide × ~140px tall; charts are ~500–600px × ~300px. Plenty of whitespace between containers; no cramping.

**Responsive:** Not visible in this single desktop screenshot, but the layout suggests sidebar collapses, cards stack vertically, and charts become full-width on smaller viewports (standard dashboard pattern).

## Components

**Card (metric/chart containers):**
- background: surface (#F9FAFB)
- border: 1px solid border (#E4E7EC)
- radius: 8px
- padding: 24px
- Shadow: a light, barely-visible drop shadow (pixel-perfect metrics not visible in screenshot, but consistent with card-elevation pattern)

**Button (primary CTA, "Purchase Plan"):**
- background: primary (#465FFF)
- radius: 8px
- text: #FFFFFF (white text on blue)
- padding: likely 12–16px vertical × 24px horizontal (standard CTA proportions)
- No border; solid fill

**Input / Search bar:**
- background: #FFFFFF
- border: 1px solid border (#E4E7EC)
- radius: 8px
- placeholder text: secondary (#667085)
- Focus state: border shifts to primary (#465FFF) with 0.15s transition

**Nav items (sidebar):**
- Inactive: icon + label in secondary gray
- Active: icon + label in primary blue, light blue background (#ECF3FF, ~0.6% coverage), radius 8px
- Hover: slight background shift (not visible in static screenshot, but assumed light-blue lighten on interaction)

## Motion

**Transitions (preserved from design system intent):**
- **all · 0.3s linear:** General UI state changes (hover, focus, collapse/expand nav items). Linear easing keeps motion predictable and "instant" feeling; no easing curve softness that would feel playful.
- **color 0.15s cubic-bezier(0.4, 0, 0.2, 1):** Text and icon color shifts (e.g., nav item on hover, status indicator states). Slightly faster (0.15s) than motion.all, keeping text readable during transition.
- **background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1):** Card and button background shifts (e.g., button hover darken, card focus state). Same easing and duration as color; cohesive motion language.
- **border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1):** Input focus ring, border-accent shifts.

No spring, bounce, or ease-out elasticity. Motion is brief and purpose-driven (affords state change, not delight).

## Effects

**Chart visualization:**
- Bar chart: primary blue (#465FFF) bars with 8px radius on corners. Background grid lines in a very light gray (barely perceptible). No drop shadow on bars.
- Radial progress ring: primary blue (#465FFF) stroke (~8–10px thickness) on a light gray background ring. Inner percentage text in black (text-primary). No glow, no gradient overlay.
- Area chart (statistics section): primary blue fill with a pale blue gradient fade-to-transparent toward the bottom. A thin blue stroke traces the line. No animation on load (assumed static).

**Shadows:** Cards use a soft, consistent drop shadow (likely `0 1px 3px rgba(0, 0, 0, 0.1)` or similar). No harsh shadows; no layered depth dramatics. Subtle enough to separate cards from background without drawing attention.

**No gradient or glassmorphism overlays.** The interface is clean, opaque, and content-forward.

## Guardrails

- **Do not use warm colors (reds, oranges, yellows) outside of inline status indicators (metric deltas) and warning/danger states.** Orange is reserved for secondary CTAs on non-dashboard pages; the dashboard itself does not display it.
- **Keep all body text and metric descriptions in secondary gray (#667085) or text-primary black (#000000).** Do not introduce tertiary text colors; the two-tier hierarchy is intentional.
- **Maintain the 24px spacing grid.** Do not compress gutters below 12px in normal layouts; tight spacing reads cluttered in data-heavy contexts.
- **Never use accent blue (primary #465FFF) for background fills on body text or large surface areas.** Blue is *only* for interactive states (buttons, active nav, chart fills, progress rings) and must remain below 1% of total screen area.
- **Card radius must stay at 8px.** Do not inflate to 12px or 16px; the subtlety of 8px preserves the engineered, technical tone without softness.