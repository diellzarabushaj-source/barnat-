# TailAdmin eCommerce Dashboard

## Business Context
- **Type/Industry:** Admin dashboard template (SaaS/product)
- **What they do:** Provide a Tailwind CSS-based admin UI kit with pre-built components and pages
- **Target audience:** Developers, designers, agencies building admin interfaces
- **Page goal:** Showcase dashboard capabilities; drive template purchase

# Page Layout & Structure

### Header / Navigation
Fixed horizontal bar spanning full width. Left: search input (text + kbd hint "⌘ K"), center-right accent (dark mode toggle, notification icon with orange dot, user avatar dropdown "Musharof"). Navigation is sticky; no primary CTA visible in header.

### Sidebar Navigation
Vertical sidebar fixed left, 280px. Contains: TailAdmin logo (blue pill badge top), "MENU" section (Dashboard link active + light blue background, eCommerce sub-item highlighted), collapsible groups (Calendar, User Profile, Forms, Tables, Pages), "OTHERS" section (Charts, UI Elements, Authentication). Bottom promo block: "#1 Tailwind CSS Dashboard" headline, 3-line subtext, blue "Purchase Plan" button (pill-shaped). Logo uses navy accent.

### Hero / Key Metrics
Two stat cards stacked horizontally at top of main content: "Customers 3,782" + green upward arrow "11.01%"; "Orders 5,359" + red downward arrow "9.05%". Each card: white background, icon + label + large near-black number + colored delta. Arranged 2-col on desktop, equal width.

### Monthly Target Card
Right-aligned card (5-col bento span). Circular progress ring (75.55%, blue stroke on light gray), centered percentage + green "+10%" label below. Subtext: "You earn $3287 today, it's higher than last month. Keep up your good work!" Three metric rows below (Target $20K ↓, Revenue $20K ↑, Today $20K ↑), each with small icon left and colored delta arrow. White background, card border.

### Monthly Sales Chart
- **Purpose:** Bar chart showing 9-month revenue trend (Jan–Sep).
- **Layout:** White card, h3 heading top-left, three-dot menu top-right. Y-axis: 0–00 scale; X-axis: month labels. Bars: blue (Feb peak ~400, relatively uniform). No grid lines visible.

### Statistics Section with Tabs & Line Chart
- **Purpose:** Multi-tab analytics view with date picker.
- **Layout:** h3 "Statistics" + description "Target you've set for each month", three pill buttons (Overview, Sales, Revenue), date input "Jul 25 - Jul 31" on right. Below: line chart (area fill light blue, line blue stroke) showing Jan–Sep trend; two trend lines visible. Card white, rounded corners.

### Customers Demographic
- **Purpose:** Geographic distribution breakdown by country.
- **Layout:** h3 heading, map thumbnail (placeholder), two country rows (USA: 2,379 Customers, 79% badge; France: 589 Customers, 23% badge). Row layout: flag icon + country name + customer count + percentage label. White card.

### Recent Orders Table
- **Purpose:** Transaction list with filter & export.
- **Layout:** h3 heading, "Filter" button (icon + text) top-left, "See all" link top-right. Table: 4 columns (Products, Category, Price, Status), 5 rows (Macbook Pro 13, Apple Watch Ultra, iPhone 15 Pro Max, iPad Pro, AirPods Pro). Row cells: product name + variant count (left-aligned text), category, price, status badge (green "Delivered", yellow "Pending", red "Canceled"). White card, table borders subtle.

### Bento Grid Layout ×1
12-column bento: 7-col (Monthly Sales chart) + 5-col (Monthly Target card) on row 1; 12-col (Statistics chart) on row 2; 5-col (Customers Demographic) + 7-col (Recent Orders table) on row 3. Cells stack vertically on narrow viewports.

**Notable patterns:** Bento grid uses 12 cols with asymmetric cell spans. All cards: white background, rounded corners, subtle border, no shadow. Charts use light blue fill + navy stroke. Status badges: green/yellow/red on white. Metric deltas: green up, red down. No background alternation across sections; page background is muted blue. :focus-visible present on interactive elements.