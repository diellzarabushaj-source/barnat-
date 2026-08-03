# Theme

## Compact token summary

- **CSS system:** vanilla CSS custom properties plus page-specific selectors. **No `tailwind.config.*` exists; this project does not use Tailwind.**
- **Primary brand ramp:** `--mi-brand-25 #f7fbfa`, `50 #eaf4f1`, `100 #d6eae5`, `200 #b6d8d0`, `300 #83b9ae`, `400 #4f958d`, `500 #1f7779`, `600 #155f63`, `700 #0d4145`.
- **Neutral ramp:** `--mi-gray-25 #fcfcfd`, `50 #f9fafb`, `100 #f2f4f7`, `200 #e4e7ec`, `300 #d0d5dd`, `400 #98a2b3`, `500 #667085`, `600 #475467`, `700 #344054`, `800 #1d2939`, `900 #101828`, `950 #0c111d`.
- **Semantic colors:** success `#ecfdf3/#12b76a/#027a48`; warning `#fffaeb/#f79009/#b54708`; error `#fef3f2/#f04438/#b42318`. Legacy accent tokens are teal `#155e63`, dark teal `#0d3d40`, amber `#c77d1f`, amber-soft `#f4e3cb`.
- **Light surfaces:** surface `#fff`, soft/page `#f9fafb`, text `#101828`, muted `#667085`, border `#e4e7ec`. Legacy paper is `#f7f8f6`; medical-hub surface is `#f4f7f5`.
- **Dark surfaces (`html[data-theme="dark"]`):** surface/page `#101828`, soft/panel `#1d2939`, text `#f9fafb`, muted `#98a2b3`, border `#344054`; dark accent teal `#66b7ad`, amber `#e2ad5a`. Clinical dark uses background `#0d1b1d`, surface `#142629`, text `#edf7f5`, accent `#70c9c6`.
- **Fonts:** primary `Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`; legacy sans uses Inter/system UI, serif uses Source Serif 4/Georgia, mono uses JetBrains Mono/SF Mono/Consolas.
- **Type:** no named type-scale tokens. Repeated sizes are `11, 12, 13, 14, 15, 16, 18, 20, 24, 25, 30px`; major headings use responsive clamps around `24–30px` and `28–38px`.
- **Spacing:** no named spacing-scale tokens. Common steps are `2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36px`; shell tokens set page gutter `20px` (`12px` under 768px), section gap `18px`, control height `44px`, sidebar `264px` (`76px` collapsed), and top bar `64px`.
- **Radius:** `--mi-radius-sm 8px`, `--mi-radius 12px`, `--mi-radius-lg 16px`; professional card radius `12px`; additional UI values `6/7/9/10/14/18px`, pill `999px`, circle `50%`.
- **Shadows/focus:** xs `0 1px 2px rgba(16,24,40,.05)`; sm `0 1px 3px rgba(16,24,40,.10), 0 1px 2px rgba(16,24,40,.06)`; md `0 4px 8px -2px rgba(16,24,40,.10), 0 2px 4px -2px rgba(16,24,40,.06)`; lg `0 12px 16px -4px rgba(16,24,40,.08), 0 4px 6px -2px rgba(16,24,40,.03)`; focus ring `0 0 0 4px rgba(21,95,99,.18)`.
- **Responsive breakpoints:** max-width `1439, 1279, 1199, 1023, 767, 479px`; desktop compact modes at min-width `1024px` with max-height `820px` or `760px`; reduced-motion and print rules are present.

## Raw source: `tailadmin-medindex.css` (complete)

```css
/* External font import removed during audited build. */

:root {
  --mi-font: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --mi-brand-25: #f7fbfa;
  --mi-brand-50: #eaf4f1;
  --mi-brand-100: #d6eae5;
  --mi-brand-200: #b6d8d0;
  --mi-brand-300: #83b9ae;
  --mi-brand-400: #4f958d;
  --mi-brand-500: #1f7779;
  --mi-brand-600: #155f63;
  --mi-brand-700: #0d4145;
  --mi-gray-25: #fcfcfd;
  --mi-gray-50: #f9fafb;
  --mi-gray-100: #f2f4f7;
  --mi-gray-200: #e4e7ec;
  --mi-gray-300: #d0d5dd;
  --mi-gray-400: #98a2b3;
  --mi-gray-500: #667085;
  --mi-gray-600: #475467;
  --mi-gray-700: #344054;
  --mi-gray-800: #1d2939;
  --mi-gray-900: #101828;
  --mi-gray-950: #0c111d;
  --mi-success-50: #ecfdf3;
  --mi-success-500: #12b76a;
  --mi-success-700: #027a48;
  --mi-warning-50: #fffaeb;
  --mi-warning-500: #f79009;
  --mi-warning-700: #b54708;
  --mi-error-50: #fef3f2;
  --mi-error-500: #f04438;
  --mi-error-700: #b42318;
  --mi-surface: #ffffff;
  --mi-surface-soft: #f9fafb;
  --mi-page: #f9fafb;
  --mi-text: #101828;
  --mi-muted: #667085;
  --mi-border: #e4e7ec;
  --mi-sidebar-width: 290px;
  --mi-sidebar-collapsed: 90px;
  --mi-topbar-height: 80px;
  --mi-radius-sm: 8px;
  --mi-radius: 12px;
  --mi-radius-lg: 16px;
  --mi-shadow-xs: 0 1px 2px rgba(16, 24, 40, .05);
  --mi-shadow-sm: 0 1px 3px rgba(16, 24, 40, .10), 0 1px 2px rgba(16, 24, 40, .06);
  --mi-shadow-md: 0 4px 8px -2px rgba(16, 24, 40, .10), 0 2px 4px -2px rgba(16, 24, 40, .06);
  --mi-shadow-lg: 0 12px 16px -4px rgba(16, 24, 40, .08), 0 4px 6px -2px rgba(16, 24, 40, .03);
  --mi-focus: 0 0 0 4px rgba(21, 95, 99, .18);
}

html[data-theme="dark"] {
  color-scheme: dark;
  --mi-surface: #101828;
  --mi-surface-soft: #1d2939;
  --mi-page: #101828;
  --mi-text: #f9fafb;
  --mi-muted: #98a2b3;
  --mi-border: #344054;
  --ink: #f9fafb;
  --paper: #101828;
  --panel: #1d2939;
  --line: #344054;
  --muted: #98a2b3;
  --teal: #66b7ad;
  --teal-dark: #f9fafb;
  --amber: #e2ad5a;
  --amber-soft: rgba(226,173,90,.14);
  --surface: #1d2939;
  --surface-soft: #101828;
  --text: #f9fafb;
}

html.medindex-tailadmin,
html.medindex-tailadmin body {
  min-height: 100%;
  margin: 0 !important;
  background: var(--mi-page) !important;
  color: var(--mi-text) !important;
  font-family: var(--mi-font) !important;
  font-feature-settings: "liga" 1, "kern" 1;
  -webkit-font-smoothing: antialiased;
}

html.medindex-tailadmin * { box-sizing: border-box; }
html.medindex-tailadmin button,
html.medindex-tailadmin input,
html.medindex-tailadmin select,
html.medindex-tailadmin textarea { font: inherit; }
html.medindex-tailadmin a { color: inherit; }
html.medindex-tailadmin svg { display: block; }
html.medindex-tailadmin [hidden] { display: none !important; }
html.medindex-tailadmin body.has-app-nav { padding: 0 !important; }
html.medindex-tailadmin body.mi-body { overflow: hidden !important; }
html.medindex-tailadmin .skip-link { z-index: 1000000 !important; }

.mi-app-shell {
  display: flex;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--mi-page);
}

.mi-sidebar {
  position: relative;
  z-index: 100;
  display: flex;
  width: var(--mi-sidebar-width);
  min-width: var(--mi-sidebar-width);
  height: 100%;
  flex: 0 0 var(--mi-sidebar-width);
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--mi-border);
  background: var(--mi-surface);
  transition: width .2s ease, min-width .2s ease, transform .25s ease;
}

.mi-sidebar-header {
  display: flex;
  min-height: 102px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 24px 20px 20px;
}

.mi-brand {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  text-decoration: none;
}

.mi-brand-mark {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  place-items: center;
  border-radius: 12px;
  background: linear-gradient(145deg, var(--mi-brand-600), var(--mi-brand-500));
  color: #fff;
  box-shadow: 0 8px 20px rgba(31, 119, 121, .22);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -.03em;
}
.mi-brand-mark span { color: #d6eae5; }
.mi-brand-copy { display: grid; min-width: 0; line-height: 1.1; }
.mi-brand-copy strong { color: var(--mi-text); font-size: 20px; font-weight: 650; letter-spacing: -.025em; }
.mi-brand-copy small { margin-top: 4px; color: var(--mi-muted); font-size: 11px; font-weight: 500; }

.mi-sidebar-close {
  display: none;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid var(--mi-border);
  border-radius: 10px;
  background: var(--mi-surface);
  color: var(--mi-muted);
}
.mi-sidebar-close svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; }

.mi-sidebar-scroll {
  min-height: 0;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0 20px 20px;
  overscroll-behavior: contain;
  overflow-anchor: none;
  scroll-behavior: auto;
  scrollbar-width: none;
}
.mi-sidebar-scroll::-webkit-scrollbar { display: none; }

#appMenu.mi-sidebar-nav {
  position: static !important;
  inset: auto !important;
  display: flex !important;
  width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  flex-direction: column !important;
  justify-content: flex-start !important;
  gap: 22px !important;
  overflow: visible !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.mi-menu-group { display: flex; flex-direction: column; gap: 4px; }
.mi-menu-group-tools { margin-top: 0; }
.mi-menu-heading {
  margin: 0 0 8px;
  color: var(--mi-gray-400);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .08em;
  line-height: 20px;
}

#appMenu .app-menu-link,
#appMenu .auth-logout {
  position: relative !important;
  display: flex !important;
  flex-direction: row !important;
  width: 100% !important;
  min-width: 0 !important;
  min-height: 44px !important;
  flex: 0 0 auto !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 12px !important;
  margin: 0 !important;
  padding: 10px 12px !important;
  border: 0 !important;
  border-radius: 8px !important;
  background: transparent !important;
  color: var(--mi-gray-700) !important;
  box-shadow: none !important;
  cursor: pointer !important;
  text-align: left !important;
  text-decoration: none !important;
  transform: none !important;
  transition: background .15s ease, color .15s ease !important;
}
html[data-theme="dark"] #appMenu .app-menu-link,
html[data-theme="dark"] #appMenu .auth-logout { color: var(--mi-gray-300) !important; }
#appMenu .app-menu-link:hover,
#appMenu .auth-logout:hover {
  background: var(--mi-gray-100) !important;
  color: var(--mi-gray-700) !important;
}
html[data-theme="dark"] #appMenu .app-menu-link:hover,
html[data-theme="dark"] #appMenu .auth-logout:hover { background: rgba(255,255,255,.05) !important; color: var(--mi-gray-300) !important; }
#appMenu .app-menu-link.active,
#appMenu .app-menu-link[aria-current="page"] {
  background: var(--mi-brand-50) !important;
  color: var(--mi-brand-500) !important;
}
html[data-theme="dark"] #appMenu .app-menu-link.active,
html[data-theme="dark"] #appMenu .app-menu-link[aria-current="page"] {
  background: rgba(31,119,121,.12) !important;
  color: var(--mi-brand-400) !important;
}
#appMenu .app-menu-link:focus-visible,
#appMenu .auth-logout:focus-visible { outline: none !important; box-shadow: var(--mi-focus) !important; }

#appMenu .app-menu-icon,
#appMenu .mi-menu-icon {
  display: grid !important;
  width: 24px !important;
  height: 24px !important;
  flex: 0 0 24px !important;
  place-items: center !important;
}
#appMenu .app-menu-icon svg,
#appMenu .mi-menu-icon svg,
#appMenu .auth-logout svg {
  width: 22px !important;
  height: 22px !important;
  fill: none !important;
  stroke: currentColor !important;
  stroke-width: 1.7 !important;
  stroke-linecap: round !important;
  stroke-linejoin: round !important;
}
#appMenu .app-menu-title,
#appMenu .mi-menu-label {
  display: block !important;
  min-width: 0 !important;
  max-width: none !important;
  color: inherit !important;
  font-family: var(--mi-font) !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  letter-spacing: 0 !important;
  line-height: 20px !important;
  text-align: left !important;
}
#appMenu .mi-menu-badge,
#appMenu .nav-mini-count {
  position: static !important;
  display: grid !important;
  min-width: 22px !important;
  height: 22px !important;
  margin-left: auto !important;
  padding: 0 6px !important;
  place-items: center !important;
  border: 0 !important;
  border-radius: 999px !important;
  background: var(--mi-brand-100) !important;
  color: var(--mi-brand-600) !important;
  font-size: 11px !important;
  font-weight: 600 !important;
}

.mi-theme-control {
  display: block !important;
  width: 100% !important;
  flex: 0 0 auto !important;
  margin-top: 0 !important;
  color: inherit !important;
  align-items: stretch !important;
  gap: 0 !important;
}
.mi-theme-row {
  display: flex;
  width: 100%;
  min-height: 44px;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--mi-gray-700);
}
html[data-theme="dark"] .mi-theme-row { color: var(--mi-gray-300); }
.mi-theme-row:hover { background: var(--mi-gray-100); }
html[data-theme="dark"] .mi-theme-row:hover { background: rgba(255,255,255,.05); }
.mi-theme-row-icon { display: grid; width: 24px; height: 24px; place-items: center; }
.mi-theme-row-icon svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; }
.mi-theme-row-text { font-size: 14px; font-weight: 500; }

.mi-sidebar-footer { padding: 18px 20px 24px; border-top: 1px solid var(--mi-border); }
.mi-user-card,
.mi-profile-chip {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}
.mi-user-avatar {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  place-items: center;
  border-radius: 50%;
  background: linear-gradient(145deg, var(--mi-brand-100), var(--mi-brand-200));
  color: var(--mi-brand-700);
  font-size: 12px;
  font-weight: 700;
}
.mi-user-copy,
.mi-profile-chip > span:last-child { display: grid; min-width: 0; }
.mi-user-copy strong,
.mi-profile-chip strong { overflow: hidden; color: var(--mi-text); font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.mi-user-copy small,
.mi-profile-chip small { margin-top: 2px; color: var(--mi-muted); font-size: 11px; }
.mi-user-arrow { margin-left: auto; color: var(--mi-gray-400); }
.mi-user-arrow svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.8; }

.mi-workspace {
  position: relative;
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  background: var(--mi-page);
}

.mi-topbar {
  position: relative;
  z-index: 70;
  display: flex;
  min-height: var(--mi-topbar-height);
  flex: 0 0 var(--mi-topbar-height);
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--mi-border);
  background: var(--mi-surface);
}
.mi-topbar-leading,
.mi-topbar-actions { display: flex; min-width: 0; align-items: center; gap: 12px; }
.mi-topbar-leading { flex: 1; }
.mi-icon-button {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  place-items: center;
  border: 1px solid var(--mi-border);
  border-radius: 10px;
  background: var(--mi-surface);
  color: var(--mi-gray-500);
  transition: background .15s ease, color .15s ease, border-color .15s ease;
}
.mi-icon-button:hover { border-color: var(--mi-gray-300); background: var(--mi-gray-50); color: var(--mi-gray-700); }
html[data-theme="dark"] .mi-icon-button:hover { background: var(--mi-gray-800); color: #fff; }
.mi-icon-button:focus-visible { outline: none; box-shadow: var(--mi-focus); }
.mi-icon-button svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.mi-global-search { position: relative; width: min(430px, 100%); }
.mi-global-search > span { position: absolute; top: 50%; left: 16px; color: var(--mi-gray-500); transform: translateY(-50%); pointer-events: none; }
.mi-global-search > span svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.7; }
.mi-global-search input {
  width: 100%;
  height: 44px;
  padding: 10px 58px 10px 46px;
  border: 1px solid var(--mi-border);
  border-radius: 10px;
  background: transparent;
  color: var(--mi-text);
  font-size: 14px;
  outline: none;
  box-shadow: var(--mi-shadow-xs);
}
.mi-global-search input::placeholder { color: var(--mi-gray-400); }
.mi-global-search input:focus { border-color: var(--mi-brand-300); box-shadow: var(--mi-focus); }
.mi-global-search kbd {
  position: absolute;
  top: 50%;
  right: 10px;
  padding: 4px 7px;
  border: 1px solid var(--mi-border);
  border-radius: 6px;
  background: var(--mi-gray-50);
  color: var(--mi-gray-500);
  font-family: var(--mi-font);
  font-size: 11px;
  transform: translateY(-50%);
}
html[data-theme="dark"] .mi-global-search kbd { background: rgba(255,255,255,.03); }
.mi-primary-action {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 9px;
  background: var(--mi-brand-500);
  color: #fff;
  box-shadow: var(--mi-shadow-xs);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
}
.mi-primary-action:hover { background: var(--mi-brand-600); }
.mi-primary-action:focus-visible { outline: none; box-shadow: var(--mi-focus); }
.mi-primary-action svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
.mi-profile-chip { padding-left: 4px; }
.mi-mobile-brand { display: none; align-items: center; gap: 8px; text-decoration: none; }
.mi-mobile-brand .mi-brand-mark { width: 36px; height: 36px; flex-basis: 36px; border-radius: 10px; font-size: 15px; }
.mi-mobile-brand strong { color: var(--mi-text); font-size: 16px; font-weight: 650; }

.mi-main { min-width: 0; flex: 1; overflow-x: hidden; overflow-y: auto; scroll-behavior: smooth; }
.mi-content-container { width: 100%; max-width: 1536px; margin: 0 auto; padding: 28px 24px 52px; }
.mi-page-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 24px; }
.mi-breadcrumb { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; color: var(--mi-gray-500); font-size: 13px; }
.mi-breadcrumb a { color: var(--mi-gray-500); text-decoration: none; }
.mi-breadcrumb a:hover { color: var(--mi-brand-500); }
.mi-breadcrumb span { color: var(--mi-gray-300); }
.mi-breadcrumb strong { color: var(--mi-gray-700); font-weight: 500; }
html[data-theme="dark"] .mi-breadcrumb strong { color: var(--mi-gray-300); }
.mi-page-heading h1 { margin: 0; color: var(--mi-text); font-family: var(--mi-font); font-size: clamp(24px, 2.4vw, 30px); font-weight: 600; letter-spacing: -.025em; line-height: 1.25; }
.mi-page-heading p { margin: 5px 0 0; color: var(--mi-muted); font-size: 14px; line-height: 1.5; }
.mi-heading-badge { display: inline-flex; align-items: center; gap: 8px; padding: 7px 10px; border: 1px solid #abefc6; border-radius: 999px; background: var(--mi-success-50); color: var(--mi-success-700); font-size: 12px; font-weight: 500; white-space: nowrap; }
html[data-theme="dark"] .mi-heading-badge { border-color: rgba(18,183,106,.35); background: rgba(18,183,106,.12); color: #6ce9a6; }
.mi-status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--mi-success-500); box-shadow: 0 0 0 3px rgba(18,183,106,.12); }
.mi-page-slot { min-width: 0; }
.mi-mobile-overlay { display: none; }

body.mi-sidebar-collapsed .mi-sidebar { width: var(--mi-sidebar-collapsed); min-width: var(--mi-sidebar-collapsed); flex-basis: var(--mi-sidebar-collapsed); }
body.mi-sidebar-collapsed .mi-sidebar-header { justify-content: center; padding-inline: 14px; }
body.mi-sidebar-collapsed .mi-brand-copy,
body.mi-sidebar-collapsed .mi-menu-heading,
body.mi-sidebar-collapsed #appMenu .app-menu-title,
body.mi-sidebar-collapsed #appMenu .mi-menu-label,
body.mi-sidebar-collapsed .mi-theme-row-text,
body.mi-sidebar-collapsed .mi-user-copy,
body.mi-sidebar-collapsed .mi-user-arrow { display: none !important; }
body.mi-sidebar-collapsed .mi-sidebar-scroll { padding-inline: 14px; }
body.mi-sidebar-collapsed #appMenu .app-menu-link,
body.mi-sidebar-collapsed #appMenu .auth-logout,
body.mi-sidebar-collapsed .mi-theme-row { justify-content: center !important; padding-inline: 10px !important; }
body.mi-sidebar-collapsed .mi-sidebar-footer { padding-inline: 14px; }
body.mi-sidebar-collapsed .mi-user-card { justify-content: center; }
body.mi-sidebar-collapsed #appMenu .mi-menu-badge { position: absolute !important; top: 3px !important; right: 2px !important; }

/* Legacy layout reset */
html.medindex-tailadmin .mi-legacy-shell { display: none !important; }
html.medindex-tailadmin #miLegacyNavigation,
html.medindex-tailadmin .mi-legacy-navigation { display: none !important; }
html.medindex-tailadmin .mi-legacy-main,
html.medindex-tailadmin .atc-main.mi-legacy-main,
html.medindex-tailadmin .med-main.mi-legacy-main {
  display: block !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: none !important;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
  color: var(--mi-text) !important;
}
html.medindex-tailadmin .mi-index-content { display: block; min-width: 0; }

/* Shared TailAdmin page surfaces */
html.medindex-tailadmin :where(.atc-header,.med-hero,.clinical-hero,.rx-hero,.mi-index-content > header) {
  position: relative !important;
  display: flex !important;
  min-height: 0 !important;
  align-items: center !important;
  gap: 18px !important;
  margin: 0 0 20px !important;
  padding: 20px 22px !important;
  border: 1px solid var(--mi-border) !important;
  border-radius: 14px !important;
  background: var(--mi-surface) !important;
  color: var(--mi-text) !important;
  box-shadow: var(--mi-shadow-xs) !important;
}
html.medindex-tailadmin :where(.atc-header,.med-hero,.clinical-hero,.rx-hero,.mi-index-content > header)::before { display: none !important; }
html.medindex-tailadmin :where(.atc-header,.med-hero,.clinical-hero,.rx-hero,.mi-index-content > header) h1 {
  margin: 0 !important;
  color: var(--mi-text) !important;
  font-family: var(--mi-font) !important;
  font-size: 20px !important;
  font-weight: 600 !important;
  letter-spacing: -.015em !important;
  line-height: 1.35 !important;
}
html.medindex-tailadmin :where(.atc-header,.med-hero,.clinical-hero,.rx-hero,.mi-index-content > header) p,
html.medindex-tailadmin .mi-index-content > header .sub {
  max-width: 980px !important;
  margin: 5px 0 0 !important;
  color: var(--mi-muted) !important;
  font-family: var(--mi-font) !important;
  font-size: 13px !important;
  line-height: 1.55 !important;
  opacity: 1 !important;
}
html.medindex-tailadmin :where(.atc-kicker,.med-kicker,.clinical-kicker) { color: var(--mi-brand-500) !important; font-family: var(--mi-font) !important; font-size: 11px !important; font-weight: 600 !important; letter-spacing: .08em !important; }
html.medindex-tailadmin :where(.rx-hero-icon,.lab-hero-stat,.rx-hero-count,.clinical-summary) {
  border: 1px solid var(--mi-border) !important;
  border-radius: 12px !important;
  background: var(--mi-gray-50) !important;
  color: var(--mi-text) !important;
  box-shadow: none !important;
}
html[data-theme="dark"] :where(.rx-hero-icon,.lab-hero-stat,.rx-hero-count,.clinical-summary) { background: rgba(255,255,255,.03) !important; }

html.medindex-tailadmin :where(.toolbar,.atc-toolbar,.med-toolbar,.clinical-toolbar,.lab-quickbar) {
  position: relative !important;
  top: auto !important;
  z-index: 20 !important;
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  flex-wrap: wrap !important;
  margin: 0 0 20px !important;
  padding: 16px !important;
  border: 1px solid var(--mi-border) !important;
  border-radius: 14px !important;
  background: var(--mi-surface) !important;
  box-shadow: var(--mi-shadow-xs) !important;
  backdrop-filter: none !important;
}
html.medindex-tailadmin :where(.toolbar,.atc-toolbar,.med-toolbar,.clinical-toolbar,.lab-quickbar) > * { min-width: 0; }

html.medindex-tailadmin :where(input[type="text"],input[type="search"],input[type="password"],input[type="number"],select,textarea) {
  min-height: 44px;
  border: 1px solid var(--mi-border) !important;
  border-radius: 9px !important;
  background: var(--mi-surface) !important;
  color: var(--mi-text) !important;
  outline: none !important;
  box-shadow: var(--mi-shadow-xs) !important;
  font-family: var(--mi-font) !important;
  font-size: 14px !important;
  transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
}
html.medindex-tailadmin :where(input[type="text"],input[type="search"],input[type="password"],input[type="number"],select) { height: 44px; padding: 10px 12px !important; }
html.medindex-tailadmin textarea { padding: 12px !important; line-height: 1.55 !important; }
html.medindex-tailadmin :where(input,textarea)::placeholder { color: var(--mi-gray-400) !important; }
html.medindex-tailadmin :where(input,select,textarea):focus { border-color: var(--mi-brand-300) !important; box-shadow: var(--mi-focus) !important; }

html.medindex-tailadmin :where(button,.atc-back,.atc-reset,.icd-clear,.rx-secondary,.rx-ghost,.rx-text-button) { font-family: var(--mi-font) !important; }
html.medindex-tailadmin :where(.atc-back,.atc-reset,.icd-clear,.rx-secondary,.rx-ghost,.rx-text-button,.pagination button,.col-picker > button,.form-picker > button) {
  min-height: 40px !important;
  padding: 9px 13px !important;
  border: 1px solid var(--mi-border) !important;
  border-radius: 8px !important;
  background: var(--mi-surface) !important;
  color: var(--mi-gray-700) !important;
  box-shadow: var(--mi-shadow-xs) !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  transform: none !important;
}
html[data-theme="dark"] :where(.atc-back,.atc-reset,.icd-clear,.rx-secondary,.rx-ghost,.rx-text-button,.pagination button,.col-picker > button,.form-picker > button) { color: var(--mi-gray-300) !important; }
html.medindex-tailadmin :where(.atc-back,.atc-reset,.icd-clear,.rx-secondary,.rx-ghost,.rx-text-button,.pagination button,.col-picker > button,.form-picker > button):hover { border-color: var(--mi-gray-300) !important; background: var(--mi-gray-50) !important; color: var(--mi-gray-900) !important; }
html[data-theme="dark"] :where(.atc-back,.atc-reset,.icd-clear,.rx-secondary,.rx-ghost,.rx-text-button,.pagination button,.col-picker > button,.form-picker > button):hover { background: var(--mi-gray-800) !important; color: #fff !important; }

html.medindex-tailadmin :where(.rx-primary,.protocol-toolbar-btn,.clinical-toolbar .primary,.lab-sheet-link,.icd-who-link) {
  min-height: 42px !important;
  padding: 10px 15px !important;
  border: 1px solid var(--mi-brand-500) !important;
  border-radius: 8px !important;
  background: var(--mi-brand-500) !important;
  color: #fff !important;
  box-shadow: var(--mi-shadow-xs) !important;
  font-family: var(--mi-font) !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  text-decoration: none !important;
  transform: none !important;
}
html.medindex-tailadmin :where(.rx-primary,.protocol-toolbar-btn,.clinical-toolbar .primary,.lab-sheet-link,.icd-who-link):hover { background: var(--mi-brand-600) !important; border-color: var(--mi-brand-600) !important; }
html.medindex-tailadmin button:focus-visible,
html.medindex-tailadmin a:focus-visible { outline: none !important; box-shadow: var(--mi-focus) !important; }

html.medindex-tailadmin :where(.count-badge,.selection-badge,.atc-count,.med-count,.clinical-status,.lab-status,.rx-state,.badge,.atc-card-code,.icd-code-badge) {
  display: inline-flex !important;
  min-height: 28px !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 5px 9px !important;
  border: 1px solid var(--mi-brand-100) !important;
  border-radius: 999px !important;
  background: var(--mi-brand-50) !important;
  color: var(--mi-brand-600) !important;
  font-family: var(--mi-font) !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  line-height: 18px !important;
  white-space: nowrap !important;
}
html[data-theme="dark"] :where(.count-badge,.selection-badge,.atc-count,.med-count,.clinical-status,.lab-status,.rx-state,.badge,.atc-card-code,.icd-code-badge) { border-color: rgba(31,119,121,.25) !important; background: rgba(31,119,121,.12) !important; color: var(--mi-brand-300) !important; }

/* Tables */
html.medindex-tailadmin :where(.table-wrap,.atc-table-wrap,.med-table-wrap,.clinical-table-wrap) {
  max-height: none !important;
  overflow: auto !important;
  margin: 0 !important;
  border: 1px solid var(--mi-border) !important;
  border-radius: 14px !important;
  background: var(--mi-surface) !important;
  box-shadow: var(--mi-shadow-xs) !important;
}
html.medindex-tailadmin :where(table,.atc-table,.med-table) {
  width: 100% !important;
  border-collapse: separate !important;
  border-spacing: 0 !important;
  background: var(--mi-surface) !important;
  color: var(--mi-text) !important;
  font-family: var(--mi-font) !important;
  font-size: 13px !important;
}
html.medindex-tailadmin :where(thead th,.atc-table th,.med-table th) {
  position: sticky !important;
  top: 0 !important;
  z-index: 4 !important;
  padding: 12px 16px !important;
  border-right: 0 !important;
  border-bottom: 1px solid var(--mi-border) !important;
  background: var(--mi-gray-50) !important;
  color: var(--mi-gray-500) !important;
  font-family: var(--mi-font) !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  letter-spacing: 0 !important;
  line-height: 18px !important;
  text-align: left !important;
  text-transform: none !important;
}
html[data-theme="dark"] :where(thead th,.atc-table th,.med-table th) { background: var(--mi-gray-900) !important; color: var(--mi-gray-400) !important; }
html.medindex-tailadmin :where(tbody td,.atc-table td,.med-table td) {
  padding: 13px 16px !important;
  border-bottom: 1px solid var(--mi-border) !important;
  background: transparent !important;
  color: var(--mi-gray-600) !important;
  font-family: var(--mi-font) !important;
  font-size: 13px !important;
  line-height: 19px !important;
}
html[data-theme="dark"] :where(tbody td,.atc-table td,.med-table td) { color: var(--mi-gray-300) !important; }
html.medindex-tailadmin :where(tbody tr:nth-child(even),tbody tr:hover,.atc-table tbody tr:hover) { background: transparent !important; }
html.medindex-tailadmin :where(tbody tr:hover,.atc-table tbody tr:hover) td { background: var(--mi-gray-50) !important; }
html[data-theme="dark"] :where(tbody tr:hover,.atc-table tbody tr:hover) td { background: rgba(255,255,255,.025) !important; }
html.medindex-tailadmin :where(td.name,.drug-title,.atc-table .drug-title) { color: var(--mi-gray-900) !important; font-weight: 500 !important; }
html[data-theme="dark"] :where(td.name,.drug-title,.atc-table .drug-title) { color: #fff !important; }
html.medindex-tailadmin :where(td.code,.atc-table .code) { color: var(--mi-gray-500) !important; font-family: ui-monospace, SFMono-Regular, Consolas, monospace !important; }

html.medindex-tailadmin .pagination {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  margin-top: 14px !important;
  padding: 14px !important;
  border: 1px solid var(--mi-border) !important;
  border-radius: 12px !important;
  background: var(--mi-surface) !important;
  box-shadow: var(--mi-shadow-xs) !important;
}
html.medindex-tailadmin .pagination button.active { border-color: var(--mi-brand-500) !important; background: var(--mi-brand-500) !important; color: #fff !important; }

/* Menus and popovers */
html.medindex-tailadmin :where(.col-panel,.form-panel,.rx-popover,.drug-action-card) {
  border: 1px solid var(--mi-border) !important;
  border-radius: 12px !important;
  background: var(--mi-surface) !important;
  color: var(--mi-text) !important;
  box-shadow: var(--mi-shadow-lg) !important;
}
html.medindex-tailadmin :where(.col-panel,.form-panel) { padding: 10px !important; }
html.medindex-tailadmin :where(.col-panel label,#formList .form-item,.drug-action-item) { border-radius: 7px !important; color: var(--mi-gray-700) !important; }
html[data-theme="dark"] :where(.col-panel label,#formList .form-item,.drug-action-item) { color: var(--mi-gray-300) !important; }
html.medindex-tailadmin :where(.col-panel label,#formList .form-item,.drug-action-item):hover { background: var(--mi-gray-50) !important; }
html[data-theme="dark"] :where(.col-panel label,#formList .form-item,.drug-action-item):hover { background: rgba(255,255,255,.05) !important; }

/* Cards and grids */
html.medindex-tailadmin :where(.atc-grid,.med-grid,.clinical-list,.rx-saved-grid) { gap: 16px !important; }
html.medindex-tailadmin :where(.atc-card,.icd-chapter-card,.icd-code-card,.lab-card,.clinical-card,.protocol-card,.rx-saved-card,.saved-protocol,.protocol-dashboard-card) {
  border: 1px solid var(--mi-border) !important;
  border-radius: 14px !important;
  background: var(--mi-surface) !important;
  color: var(--mi-text) !important;
  box-shadow: var(--mi-shadow-xs) !important;
  transform: none !important;
  transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease !important;
}
html.medindex-tailadmin :where(.atc-card,.icd-chapter-card,.icd-code-card,.lab-card,.clinical-card,.protocol-card,.rx-saved-card,.saved-protocol,.protocol-dashboard-card):hover {
  border-color: var(--mi-brand-200) !important;
  box-shadow: var(--mi-shadow-md) !important;
  transform: translateY(-1px) !important;
}
html.medindex-tailadmin :where(.atc-card h3,.icd-chapter-card h3,.icd-code-card h3,.lab-card h3,.clinical-card h3,.protocol-card h3,.rx-saved-card h3,.saved-protocol h3) { color: var(--mi-gray-900) !important; font-family: var(--mi-font) !important; font-weight: 600 !important; }
html[data-theme="dark"] :where(.atc-card h3,.icd-chapter-card h3,.icd-code-card h3,.lab-card h3,.clinical-card h3,.protocol-card h3,.rx-saved-card h3,.saved-protocol h3) { color: #fff !important; }
html.medindex-tailadmin :where(.atc-card p,.icd-chapter-card p,.icd-code-card p,.lab-card p,.clinical-card p,.protocol-card p,.rx-saved-card p,.saved-protocol p) { color: var(--mi-muted) !important; font-family: var(--mi-font) !important; }
html.medindex-tailadmin :where(.atc-card-arrow,.protocol-card-arrow) { background: var(--mi-brand-500) !important; }
html.medindex-tailadmin :where(.atc-card-arrow,.protocol-card-arrow):hover { background: var(--mi-brand-600) !important; }

/* Section headings */
html.medindex-tailadmin :where(.atc-section-head,.med-section-head,.lab-main-head) { margin-bottom: 16px !important; }
html.medindex-tailadmin :where(.atc-section-head h2,.med-section-head h2,.lab-main-head h2) { margin: 0 !important; color: var(--mi-text) !important; font-family: var(--mi-font) !important; font-size: 18px !important; font-weight: 600 !important; letter-spacing: -.015em !important; }
html.medindex-tailadmin :where(.atc-section-head p,.med-section-head p,.lab-main-head p,.atc-breadcrumb) { color: var(--mi-muted) !important; font-family: var(--mi-font) !important; font-size: 13px !important; }

/* Page spacing resets */
html.medindex-tailadmin :where(.atc-content,.clinical-main,.rx-main) { width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
html.medindex-tailadmin :where(.icd-section,.lab-section,.rx-saved-section) { margin-top: 24px !important; }
html.medindex-tailadmin .atc-source-note,
html.medindex-tailadmin :where(.med-notice,.clinical-note,.rx-safety,.lab-sheet-note) {
  margin: 16px 0 !important;
  padding: 12px 14px !important;
  border: 1px solid var(--mi-warning-500) !important;
  border-left-width: 4px !important;
  border-radius: 9px !important;
  background: var(--mi-warning-50) !important;
  color: var(--mi-warning-700) !important;
  font-family: var(--mi-font) !important;
  font-size: 13px !important;
  line-height: 1.5 !important;
}
html[data-theme="dark"] .atc-source-note,
html[data-theme="dark"] :where(.med-notice,.clinical-note,.rx-safety,.lab-sheet-note) { background: rgba(247,144,9,.1) !important; color: #fec84b !important; }

/* Prescription page */
html.medindex-tailadmin .rx-dashboard { gap: 18px !important; }
html.medindex-tailadmin :where(.rx-compose-card,.rx-preview-card,.rx-saved-section) {
  border: 1px solid var(--mi-border) !important;
  border-radius: 14px !important;
  background: var(--mi-surface) !important;
  box-shadow: var(--mi-shadow-xs) !important;
}
html.medindex-tailadmin .rx-compose-card { padding: 20px !important; }
html.medindex-tailadmin .rx-preview-card { overflow: hidden !important; }
html.medindex-tailadmin .rx-card-head h2 { color: var(--mi-text) !important; font-family: var(--mi-font) !important; font-size: 16px !important; font-weight: 600 !important; }
html.medindex-tailadmin .rx-step { background: var(--mi-brand-50) !important; color: var(--mi-brand-600) !important; }
html[data-theme="dark"] .rx-step { background: rgba(31,119,121,.12) !important; color: var(--mi-brand-300) !important; }
html.medindex-tailadmin .rx-command-bar { border: 1px solid var(--mi-border) !important; border-radius: 10px !important; background: var(--mi-gray-50) !important; }
html[data-theme="dark"] .rx-command-bar { background: rgba(255,255,255,.03) !important; }
html.medindex-tailadmin .rx-command-bar button { border: 1px solid var(--mi-border) !important; border-radius: 7px !important; background: var(--mi-surface) !important; color: var(--mi-brand-600) !important; }
html.medindex-tailadmin .rx-editor-wrap textarea { min-height: 330px !important; border-radius: 10px !important; background: var(--mi-surface) !important; font-family: ui-monospace, SFMono-Regular, Consolas, monospace !important; font-size: 13px !important; }
html.medindex-tailadmin .rx-preview { background: var(--mi-surface) !important; }
html.medindex-tailadmin .rx-preview-empty { border: 1px dashed var(--mi-gray-300) !important; border-radius: 12px !important; color: var(--mi-muted) !important; }
html.medindex-tailadmin .rx-generated-review { border: 1px solid var(--mi-border) !important; border-radius: 9px !important; background: var(--mi-gray-50) !important; }
html[data-theme="dark"] .rx-generated-review { background: rgba(255,255,255,.03) !important; }
html.medindex-tailadmin .rx-saved-section { padding: 20px !important; }

/* Panels and dialogs */
html.medindex-tailadmin :where(.med-panel,.rx-dialog) {
  border: 1px solid var(--mi-border) !important;
  border-radius: 16px !important;
  background: var(--mi-surface) !important;
  color: var(--mi-text) !important;
  box-shadow: 0 24px 64px rgba(16,24,40,.22) !important;
}
html.medindex-tailadmin :where(.med-panel-head,.med-panel-foot) { border-color: var(--mi-border) !important; background: var(--mi-surface) !important; }
html.medindex-tailadmin .med-panel-overlay,
html.medindex-tailadmin .rx-dialog-overlay { background: rgba(16,24,40,.55) !important; backdrop-filter: blur(4px); }
html.medindex-tailadmin .med-panel-close { border: 1px solid var(--mi-border) !important; border-radius: 9px !important; background: var(--mi-surface) !important; color: var(--mi-muted) !important; }

/* Loaders and empty states */
html.medindex-tailadmin :where(.atc-loader,.clinical-loader,.empty-state,.atc-empty,.rx-saved-empty) { color: var(--mi-muted) !important; }
html.medindex-tailadmin .atc-loader-dots span { background: var(--mi-brand-500) !important; }
html.medindex-tailadmin .page-loader { background: rgba(249,250,251,.94) !important; }
html[data-theme="dark"] .page-loader { background: rgba(16,24,40,.94) !important; }
html.medindex-tailadmin .loader-content { color: var(--mi-brand-500) !important; }

/* Login — TailAdmin authentication layout */
html.medindex-tailadmin-login,
html.medindex-tailadmin-login body { min-height: 100%; margin: 0; background: var(--mi-surface); color: var(--mi-text); font-family: var(--mi-font); }
html.medindex-tailadmin-login * { box-sizing: border-box; }
html.medindex-tailadmin-login .login-shell {
  display: grid;
  min-height: 100vh;
  min-height: 100dvh;
  grid-template-columns: minmax(0, 1fr) minmax(420px, .9fr);
  padding: 0 !important;
  background: var(--mi-surface) !important;
}
html.medindex-tailadmin-login .login-card {
  position: relative;
  display: flex;
  width: min(520px, calc(100% - 48px));
  align-self: center;
  justify-self: center;
  flex-direction: column;
  padding: 42px 38px !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}
html.medindex-tailadmin-login .login-brand { display: grid; width: 48px !important; height: 48px !important; margin-bottom: 26px !important; place-items: center; border: 0 !important; border-radius: 12px !important; background: var(--mi-brand-500) !important; color: #fff !important; box-shadow: var(--mi-shadow-md) !important; }
html.medindex-tailadmin-login .login-kicker { margin: 0 0 6px !important; color: var(--mi-brand-500) !important; font-size: 12px !important; font-weight: 600 !important; letter-spacing: .06em !important; }
html.medindex-tailadmin-login .login-card h1 { margin: 0 !important; color: var(--mi-text) !important; font-family: var(--mi-font) !important; font-size: 30px !important; font-weight: 600 !important; letter-spacing: -.025em !important; }
html.medindex-tailadmin-login .login-copy { margin: 10px 0 28px !important; color: var(--mi-muted) !important; font-size: 14px !important; line-height: 1.55 !important; }
html.medindex-tailadmin-login .login-card label { margin-bottom: 7px !important; color: var(--mi-gray-700) !important; font-size: 13px !important; font-weight: 500 !important; }
html[data-theme="dark"].medindex-tailadmin-login .login-card label { color: var(--mi-gray-300) !important; }
html.medindex-tailadmin-login .password-row { gap: 10px !important; }
html.medindex-tailadmin-login .password-row input { height: 46px !important; border-radius: 9px !important; }
html.medindex-tailadmin-login .password-row button { min-width: 76px !important; height: 46px !important; border: 1px solid var(--mi-border) !important; border-radius: 9px !important; background: var(--mi-surface) !important; color: var(--mi-gray-700) !important; }
html.medindex-tailadmin-login .login-submit { height: 46px !important; margin-top: 16px !important; border-radius: 9px !important; background: var(--mi-brand-500) !important; box-shadow: var(--mi-shadow-xs) !important; font-size: 14px !important; font-weight: 500 !important; }
html.medindex-tailadmin-login .login-submit:hover { background: var(--mi-brand-600) !important; transform: none !important; }
html.medindex-tailadmin-login .login-meta { margin-top: 22px !important; padding-top: 18px !important; border-color: var(--mi-border) !important; }
html.medindex-tailadmin-login .login-meta span { background: var(--mi-gray-50) !important; color: var(--mi-gray-500) !important; }
html[data-theme="dark"].medindex-tailadmin-login .login-meta span { background: rgba(255,255,255,.03) !important; }
.login-side-panel {
  position: relative;
  display: flex;
  min-height: 100%;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 48px;
  background: #101828;
  color: #fff;
}
.login-side-panel::before,
.login-side-panel::after { content: ""; position: absolute; border-radius: 50%; filter: blur(1px); }
.login-side-panel::before { width: 420px; height: 420px; top: -180px; right: -130px; background: rgba(31,119,121,.35); }
.login-side-panel::after { width: 360px; height: 360px; bottom: -170px; left: -130px; background: rgba(11,165,236,.22); }
.login-side-inner { position: relative; z-index: 1; width: min(430px, 100%); text-align: center; }
.login-side-mark { display: grid; width: 72px; height: 72px; margin: 0 auto 24px; place-items: center; border: 1px solid rgba(255,255,255,.16); border-radius: 18px; background: rgba(255,255,255,.08); font-size: 25px; font-weight: 700; backdrop-filter: blur(8px); }
.login-side-mark span { color: #9cb9ff; }
.login-side-inner h2 { margin: 0; font-size: 30px; font-weight: 600; letter-spacing: -.025em; }
.login-side-inner p { margin: 12px auto 0; color: #98a2b3; font-size: 14px; line-height: 1.6; }
.login-side-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-top: 30px; }
.login-side-grid span { padding: 12px 8px; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; background: rgba(255,255,255,.04); color: #d0d5dd; font-size: 11px; }

@media (min-width: 1024px) and (max-height: 820px) {
  .mi-sidebar-header { min-height: 84px; padding-block: 18px 14px; }
  #appMenu.mi-sidebar-nav { gap: 14px !important; }
  #appMenu .app-menu-link,
  #appMenu .auth-logout,
  .mi-theme-row { min-height: 40px !important; padding-block: 8px !important; }
  .mi-sidebar-footer { padding-block: 12px 16px; }
}

@media (max-width: 1279px) {
  .mi-profile-chip > span:last-child { display: none; }
  .mi-content-container { padding-inline: 20px; }
}

@media (max-width: 1023px) {
  .mi-sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: var(--mi-sidebar-width) !important;
    min-width: var(--mi-sidebar-width) !important;
    transform: translateX(-100%);
    box-shadow: 20px 0 40px rgba(16,24,40,.15);
  }
  body.mi-sidebar-open .mi-sidebar { transform: translateX(0); }
  body.mi-sidebar-open .mi-main { overflow: hidden; }
  .mi-sidebar-close { display: grid; }
  .mi-mobile-overlay {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: block;
    background: rgba(16,24,40,.46);
    opacity: 0;
    visibility: hidden;
    transition: opacity .2s ease, visibility .2s ease;
    backdrop-filter: blur(2px);
  }
  body.mi-sidebar-open .mi-mobile-overlay { opacity: 1; visibility: visible; }
  .mi-topbar { padding-inline: 16px; }
  .mi-mobile-brand { display: inline-flex; }
  .mi-global-search { display: none; }
  .mi-heading-badge { display: none; }
  .mi-page-heading { align-items: flex-start; }
}

@media (max-width: 767px) {
  .mi-topbar { min-height: 70px; flex-basis: 70px; padding: 12px; }
  .mi-topbar-actions { gap: 8px; }
  .mi-topbar-actions .mi-icon-button { display: none; }
  .mi-primary-action { width: 44px; height: 44px; padding: 0; }
  .mi-primary-action span { display: none; }
  .mi-profile-chip { display: none; }
  .mi-content-container { padding: 20px 12px 36px; }
  .mi-page-heading { margin-bottom: 18px; }
  .mi-page-heading h1 { font-size: 24px; }
  .mi-page-heading p { font-size: 13px; }
  html.medindex-tailadmin :where(.atc-header,.med-hero,.clinical-hero,.rx-hero,.mi-index-content > header) { align-items: flex-start !important; flex-direction: column !important; padding: 16px !important; border-radius: 12px !important; }
  html.medindex-tailadmin :where(.toolbar,.atc-toolbar,.med-toolbar,.clinical-toolbar,.lab-quickbar) { align-items: stretch !important; padding: 12px !important; border-radius: 12px !important; }
  html.medindex-tailadmin :where(.toolbar,.atc-toolbar,.med-toolbar,.clinical-toolbar,.lab-quickbar) :where(input,select,.form-picker,.col-picker) { width: 100% !important; flex: 1 1 100% !important; }
  html.medindex-tailadmin :where(.table-wrap,.atc-table-wrap,.med-table-wrap) { border-radius: 10px !important; }
  html.medindex-tailadmin :where(thead th,.atc-table th,.med-table th) { padding: 11px 12px !important; }
  html.medindex-tailadmin :where(tbody td,.atc-table td,.med-table td) { padding: 12px !important; }
  html.medindex-tailadmin-login .login-shell { grid-template-columns: 1fr; }
  html.medindex-tailadmin-login .login-card { width: min(100% - 24px, 520px); padding: 32px 18px !important; }
  .login-side-panel { display: none; }
}

@media (max-width: 479px) {
  .mi-mobile-brand strong { display: none; }
  .mi-page-heading p { max-width: 300px; }
  html.medindex-tailadmin .rx-compose-actions { display: grid !important; grid-template-columns: 1fr !important; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
}

@media print {
  .mi-sidebar,.mi-topbar,.mi-mobile-overlay,.mi-page-heading { display: none !important; }
  .mi-app-shell,.mi-workspace,.mi-main { display: block !important; height: auto !important; overflow: visible !important; }
  .mi-content-container { max-width: none !important; padding: 0 !important; }
  html.medindex-tailadmin body { background: #fff !important; color: #000 !important; }
}
```

## Raw source: `tailadmin-professional.css` (complete)

```css
/*
 * MedIndex professional UI layer
 * Loaded after tailadmin-medindex.css. This file owns the final shell geometry
 * and section-level density without changing clinical data or behaviour.
 */

:root {
  --mi-sidebar-width: 264px;
  --mi-sidebar-collapsed: 76px;
  --mi-topbar-height: 64px;
  --mi-content-max: 1600px;
  --mi-page-gutter: 20px;
  --mi-control-height: 44px;
  --mi-card-radius: 12px;
  --mi-section-gap: 18px;
}

html.medindex-tailadmin,
html.medindex-tailadmin body {
  width: 100%;
  max-width: 100%;
  height: 100%;
  overflow: hidden !important;
}

html.medindex-tailadmin body.mi-body {
  position: fixed !important;
  inset: 0 !important;
  min-width: 0 !important;
  max-width: 100vw !important;
  overscroll-behavior: none;
}

html.medindex-tailadmin .mi-app-shell {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  max-width: 100vw !important;
  height: 100vh !important;
  height: 100dvh !important;
  overflow: hidden !important;
  isolation: isolate;
}

/* Stable shared sidebar */
html.medindex-tailadmin .mi-sidebar {
  position: relative !important;
  inset: auto !important;
  width: var(--mi-sidebar-width) !important;
  min-width: var(--mi-sidebar-width) !important;
  max-width: var(--mi-sidebar-width) !important;
  height: 100% !important;
  flex: 0 0 var(--mi-sidebar-width) !important;
  overflow: hidden !important;
  transform: none;
  border-right: 1px solid var(--mi-border) !important;
  background: var(--mi-surface) !important;
  box-shadow: none !important;
}

html.medindex-tailadmin .mi-sidebar-header {
  min-height: 76px !important;
  flex: 0 0 76px !important;
  padding: 14px 16px 12px !important;
}

html.medindex-tailadmin .mi-brand { width: 100%; gap: 12px !important; }
html.medindex-tailadmin .mi-brand-mark { width: 40px !important; height: 40px !important; flex: 0 0 40px !important; }
html.medindex-tailadmin .mi-brand-copy strong { font-size: 18px !important; line-height: 22px !important; }
html.medindex-tailadmin .mi-brand-copy small { margin-top: 2px !important; font-size: 12px !important; line-height: 16px !important; }

html.medindex-tailadmin .mi-sidebar-scroll {
  min-height: 0 !important;
  flex: 1 1 auto !important;
  padding: 2px 16px 14px !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  overscroll-behavior: contain;
  overflow-anchor: none;
  scroll-behavior: auto !important;
  scrollbar-gutter: stable;
}

html.medindex-tailadmin #appMenu.mi-sidebar-nav {
  position: static !important;
  inset: auto !important;
  display: flex !important;
  width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  flex: 0 0 auto !important;
  flex-direction: column !important;
  justify-content: flex-start !important;
  align-items: stretch !important;
  gap: 16px !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: visible !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

html.medindex-tailadmin #appMenu > .mi-menu-group {
  display: flex !important;
  width: 100% !important;
  flex: 0 0 auto !important;
  flex-direction: column !important;
  gap: 2px !important;
  margin: 0 !important;
  padding: 0 !important;
}
html.medindex-tailadmin #appMenu > .mi-menu-group-tools { margin-top: 0 !important; }
html.medindex-tailadmin #appMenu .mi-menu-heading {
  margin: 0 8px 6px !important;
  color: var(--mi-gray-400) !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  line-height: 18px !important;
  letter-spacing: .08em !important;
}

html.medindex-tailadmin #appMenu .app-menu-link,
html.medindex-tailadmin #appMenu .auth-logout,
html.medindex-tailadmin #appMenu .mi-menu-item {
  position: relative !important;
  display: flex !important;
  width: 100% !important;
  min-width: 0 !important;
  min-height: 42px !important;
  max-height: none !important;
  flex: 0 0 auto !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 12px !important;
  margin: 0 !important;
  padding: 9px 10px !important;
  overflow: hidden !important;
  border: 0 !important;
  border-radius: 8px !important;
  background: transparent !important;
  color: var(--mi-gray-700) !important;
  box-shadow: none !important;
  text-align: left !important;
  text-decoration: none !important;
  white-space: nowrap !important;
  transform: none !important;
}

html[data-theme="dark"].medindex-tailadmin #appMenu .app-menu-link,
html[data-theme="dark"].medindex-tailadmin #appMenu .auth-logout { color: var(--mi-gray-300) !important; }
html.medindex-tailadmin #appMenu .app-menu-link:hover,
html.medindex-tailadmin #appMenu .auth-logout:hover { background: var(--mi-gray-100) !important; color: var(--mi-gray-800) !important; transform: none !important; }
html[data-theme="dark"].medindex-tailadmin #appMenu .app-menu-link:hover,
html[data-theme="dark"].medindex-tailadmin #appMenu .auth-logout:hover { background: rgba(255,255,255,.055) !important; color: #fff !important; }
html.medindex-tailadmin #appMenu .app-menu-link.active,
html.medindex-tailadmin #appMenu .app-menu-link[aria-current="page"] { background: var(--mi-brand-50) !important; color: var(--mi-brand-600) !important; }
html[data-theme="dark"].medindex-tailadmin #appMenu .app-menu-link.active,
html[data-theme="dark"].medindex-tailadmin #appMenu .app-menu-link[aria-current="page"] { background: rgba(31,119,121,.14) !important; color: var(--mi-brand-300) !important; }

html.medindex-tailadmin #appMenu .app-menu-icon,
html.medindex-tailadmin #appMenu .mi-menu-icon,
html.medindex-tailadmin #appMenu .auth-logout .app-menu-icon {
  display: grid !important;
  width: 22px !important;
  height: 22px !important;
  flex: 0 0 22px !important;
  place-items: center !important;
  margin: 0 !important;
}
html.medindex-tailadmin #appMenu .app-menu-icon svg,
html.medindex-tailadmin #appMenu .mi-menu-icon svg,
html.medindex-tailadmin #appMenu .auth-logout svg { width: 20px !important; height: 20px !important; fill: none !important; stroke: currentColor !important; stroke-width: 1.7 !important; }
html.medindex-tailadmin #appMenu .app-menu-title,
html.medindex-tailadmin #appMenu .mi-menu-label {
  display: block !important;
  min-width: 0 !important;
  flex: 1 1 auto !important;
  overflow: hidden !important;
  color: inherit !important;
  font-family: var(--mi-font) !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  line-height: 20px !important;
  letter-spacing: 0 !important;
  text-align: left !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
html.medindex-tailadmin #appMenu .mi-menu-badge,
html.medindex-tailadmin #appMenu .nav-mini-count { position: static !important; min-width: 22px !important; height: 22px !important; flex: 0 0 auto !important; margin: 0 0 0 auto !important; padding: 0 6px !important; border-radius: 999px !important; }
html.medindex-tailadmin #appMenu .mi-theme-control { display: none !important; }

html.medindex-tailadmin .mi-sidebar-footer {
  min-height: 70px !important;
  flex: 0 0 70px !important;
  padding: 12px 16px !important;
  overflow: hidden !important;
  border-top: 1px solid var(--mi-border) !important;
  background: var(--mi-surface) !important;
}
html.medindex-tailadmin .mi-user-card { min-height: 44px; padding: 2px 0; }
html.medindex-tailadmin .mi-user-avatar { width: 38px !important; height: 38px !important; flex: 0 0 38px !important; }
html.medindex-tailadmin .mi-user-copy strong { font-size: 13px !important; }
html.medindex-tailadmin .mi-user-copy small { font-size: 11px !important; }

html.medindex-tailadmin body.mi-sidebar-collapsed .mi-sidebar { width: var(--mi-sidebar-collapsed) !important; min-width: var(--mi-sidebar-collapsed) !important; max-width: var(--mi-sidebar-collapsed) !important; flex-basis: var(--mi-sidebar-collapsed) !important; }
html.medindex-tailadmin body.mi-sidebar-collapsed .mi-sidebar-header,
html.medindex-tailadmin body.mi-sidebar-collapsed .mi-sidebar-footer { padding-inline: 14px !important; }
html.medindex-tailadmin body.mi-sidebar-collapsed .mi-sidebar-scroll { padding-inline: 14px !important; }
html.medindex-tailadmin body.mi-sidebar-collapsed #appMenu { gap: 12px !important; }
html.medindex-tailadmin body.mi-sidebar-collapsed #appMenu .app-menu-link,
html.medindex-tailadmin body.mi-sidebar-collapsed #appMenu .auth-logout { justify-content: center !important; padding-inline: 9px !important; }
html.medindex-tailadmin body.mi-sidebar-collapsed #appMenu .app-menu-title,
html.medindex-tailadmin body.mi-sidebar-collapsed #appMenu .mi-menu-label,
html.medindex-tailadmin body.mi-sidebar-collapsed #appMenu .mi-menu-heading,
html.medindex-tailadmin body.mi-sidebar-collapsed .mi-brand-copy,
html.medindex-tailadmin body.mi-sidebar-collapsed .mi-user-copy,
html.medindex-tailadmin body.mi-sidebar-collapsed .mi-user-arrow { display: none !important; }
html.medindex-tailadmin body.mi-sidebar-collapsed #appMenu .mi-menu-badge { position: absolute !important; top: 2px !important; right: 2px !important; }

/* Stable workspace and topbar */
html.medindex-tailadmin .mi-workspace { width: 0 !important; min-width: 0 !important; max-width: none !important; flex: 1 1 auto !important; overflow: hidden !important; }
html.medindex-tailadmin .mi-topbar { min-height: var(--mi-topbar-height) !important; height: var(--mi-topbar-height) !important; flex: 0 0 var(--mi-topbar-height) !important; padding: 14px var(--mi-page-gutter) !important; gap: 16px !important; }
html.medindex-tailadmin .mi-global-search { width: min(520px, 100%) !important; }
html.medindex-tailadmin .mi-global-search input,
html.medindex-tailadmin .mi-icon-button,
html.medindex-tailadmin .mi-primary-action { height: 44px !important; min-height: 44px !important; }
html.medindex-tailadmin .mi-topbar-actions { flex: 0 0 auto !important; }
html.medindex-tailadmin .mi-main { width: 100% !important; min-width: 0 !important; max-width: 100% !important; flex: 1 1 auto !important; overflow-x: hidden !important; overflow-y: auto !important; overscroll-behavior: contain; scrollbar-gutter: stable; }
html.medindex-tailadmin .mi-content-container { width: 100% !important; max-width: var(--mi-content-max) !important; margin: 0 auto !important; padding: 20px var(--mi-page-gutter) 44px !important; }
html.medindex-tailadmin .mi-page-heading { align-items: center !important; margin-bottom: 20px !important; }
html.medindex-tailadmin .mi-page-heading h1 { font-size: clamp(25px, 2vw, 30px) !important; line-height: 1.2 !important; }
html.medindex-tailadmin .mi-page-heading p { margin-top: 4px !important; }
html.medindex-tailadmin .mi-page-heading .mi-page-heading-title {
  margin: 0 !important;
  color: var(--mi-text) !important;
  font-family: var(--mi-font);
  font-size: clamp(25px,2vw,30px) !important;
  font-weight: 650 !important;
  letter-spacing: -.025em;
  line-height: 1.2 !important;
}
html.medindex-tailadmin .mi-heading-badge {
  border-color: var(--mi-border) !important;
  background: var(--mi-gray-50) !important;
  color: var(--mi-muted) !important;
}
html.medindex-tailadmin .mi-heading-badge .mi-status-dot { background: #155f63 !important; }
html.medindex-tailadmin :where(button,a,input,select,textarea,[tabindex]):focus-visible {
  outline: 3px solid #d48b20 !important;
  outline-offset: 3px !important;
}
html.medindex-tailadmin .mi-page-slot,
html.medindex-tailadmin .mi-index-content,
html.medindex-tailadmin .mi-legacy-main { width: 100% !important; min-width: 0 !important; max-width: 100% !important; }
html.medindex-tailadmin .mi-page-slot > *,
html.medindex-tailadmin .mi-index-content > * { max-width: 100%; }

/* Shared compact surfaces */
html.medindex-tailadmin :where(.toolbar,.atc-toolbar,.med-toolbar,.clinical-toolbar,.lab-quickbar,.rx-compose-card,.rx-preview-card,.rx-saved-section,.table-wrap,.atc-table-wrap,.med-table-wrap) { min-width: 0 !important; max-width: 100% !important; }
html.medindex-tailadmin :where(.toolbar,.atc-toolbar,.med-toolbar,.clinical-toolbar,.lab-quickbar) { gap: 8px !important; padding: 10px !important; border-radius: 12px !important; box-shadow: var(--mi-shadow-xs) !important; }
html.medindex-tailadmin :where(.toolbar input,.toolbar select,.toolbar button,.atc-toolbar input,.atc-toolbar select,.atc-toolbar button,.med-toolbar input,.med-toolbar select,.med-toolbar button,.clinical-toolbar input,.clinical-toolbar select,.clinical-toolbar button,.lab-quickbar input,.lab-quickbar select,.lab-quickbar button) { min-height: var(--mi-control-height) !important; }
html.medindex-tailadmin :where(.table-wrap,.atc-table-wrap,.med-table-wrap) { width: 100% !important; overflow-x: auto !important; overflow-y: auto !important; overscroll-behavior: contain; scrollbar-gutter: stable both-edges; border-radius: 12px !important; }
html.medindex-tailadmin :where(.table-wrap table,.atc-table-wrap table,.med-table-wrap table) { width: 100% !important; min-width: 980px; table-layout: auto; }
html.medindex-tailadmin :where(thead th,.atc-table th,.med-table th) { padding: 11px 14px !important; white-space: nowrap; }
html.medindex-tailadmin :where(tbody td,.atc-table td,.med-table td) { padding: 11px 14px !important; vertical-align: top; }
html.medindex-tailadmin :where(.med-grid,.atc-grid,.lab-grid,.clinical-list,.rx-saved-grid) { min-width: 0 !important; }

/* Barnat */
html.medindex-tailadmin[data-mi-page="barnat"] .mi-index-content > header:not(.registry-overview) { display: grid !important; grid-template-columns: minmax(280px, 1fr) auto !important; align-items: center !important; gap: 14px 24px !important; padding: 18px 22px !important; }
html.medindex-tailadmin[data-mi-page="barnat"] .mi-index-content > header:not(.registry-overview) h1 { font-size: 20px !important; }
html.medindex-tailadmin[data-mi-page="barnat"] .mi-index-content > header:not(.registry-overview) .sub { margin: 0 !important; text-align: right; }
html.medindex-tailadmin[data-mi-page="barnat"] .toolbar { position: sticky !important; top: 8px !important; z-index: 28 !important; display: grid !important; grid-template-columns: minmax(280px, 2.4fr) minmax(145px, .85fr) minmax(145px, .85fr) minmax(105px, .55fr) auto auto auto !important; align-items: center !important; margin: 0 0 18px !important; background: color-mix(in srgb, var(--mi-surface) 94%, transparent) !important; backdrop-filter: blur(16px); }
html.medindex-tailadmin[data-mi-page="barnat"] .toolbar > input[type="search"] { width: 100% !important; min-width: 0 !important; }
html.medindex-tailadmin[data-mi-page="barnat"] .toolbar .count-badge { grid-column: 1 / -1; justify-self: start; margin: 0 !important; }
html.medindex-tailadmin[data-mi-page="barnat"] .table-wrap { max-height: calc(100dvh - 330px); }
html.medindex-tailadmin[data-mi-page="barnat"] #dataTable { min-width: 960px !important; }
html.medindex-tailadmin[data-mi-page="barnat"] #dataTable td.name { min-width: 280px; color: var(--mi-gray-900) !important; font-weight: 600 !important; }
html[data-theme="dark"].medindex-tailadmin[data-mi-page="barnat"] #dataTable td.name { color: #fff !important; }
html.medindex-tailadmin[data-mi-page="barnat"] .selection-badge,
html.medindex-tailadmin[data-mi-page="barnat"] .count-badge { white-space: nowrap; }

/* Klasifikimi */
html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-header { display: grid !important; grid-template-columns: minmax(190px, .75fr) minmax(300px, 1.25fr) minmax(260px, 1fr) !important; align-items: center !important; gap: 24px 36px !important; min-height: 132px !important; padding: 26px 32px !important; overflow: hidden !important; border: 0 !important; border-radius: 14px !important; background: linear-gradient(120deg, #0d4d50, #176b6d) !important; color: #fff !important; box-shadow: var(--mi-shadow-sm) !important; }
html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-header > * { min-width: 0; max-width: 100%; }
html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-header .atc-kicker { margin: 0 !important; color: #d0d5dd !important; line-height: 1.45 !important; }
html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-header h1 { color: #fff !important; font-size: clamp(28px, 3vw, 38px) !important; line-height: 1.06 !important; }
html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-header > p:last-child { margin: 0 !important; color: #d5e7e5 !important; font-size: 13px !important; line-height: 1.55 !important; overflow-wrap: anywhere; }
html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-toolbar { display: grid !important; grid-template-columns: auto minmax(280px, 1fr) auto auto !important; align-items: center !important; margin: 16px 0 18px !important; }
html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-search-wrap { min-width: 0 !important; }
html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-audit { grid-template-columns: repeat(8, minmax(105px, 1fr)) !important; gap: 8px !important; overflow-x: auto; padding: 10px !important; }
html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-audit > div { min-width: 105px !important; }
html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-grid { grid-template-columns: repeat(3, minmax(230px, 1fr)) !important; gap: 12px !important; }

/* ICD and Analizat */
html.medindex-tailadmin[data-mi-page="icd"] .med-hero,
html.medindex-tailadmin[data-mi-page="analizat"] .med-hero { min-height: 128px !important; padding: 24px 28px !important; overflow: hidden !important; border: 0 !important; background: linear-gradient(120deg, #0d4d50, #176b6d) !important; color: #fff !important; }
html.medindex-tailadmin[data-mi-page="icd"] .med-hero h1,
html.medindex-tailadmin[data-mi-page="analizat"] .med-hero h1,
html.medindex-tailadmin[data-mi-page="icd"] .med-hero p,
html.medindex-tailadmin[data-mi-page="analizat"] .med-hero p { color: #fff !important; }
html.medindex-tailadmin[data-mi-page="icd"] .icd-toolbar { display: grid !important; grid-template-columns: minmax(300px, 1fr) minmax(150px, 210px) minmax(150px, 210px) auto !important; align-items: center !important; }
html.medindex-tailadmin[data-mi-page="icd"] .icd-smart-wrap { min-width: 0 !important; }
html.medindex-tailadmin[data-mi-page="icd"] .icd-chapter-grid { grid-template-columns: repeat(3, minmax(240px, 1fr)) !important; gap: 10px !important; }
html.medindex-tailadmin[data-mi-page="icd"] .icd-code-grid { grid-template-columns: repeat(3, minmax(260px, 1fr)) !important; gap: 12px !important; }
html.medindex-tailadmin[data-mi-page="analizat"] .lab-quickbar { display: grid !important; grid-template-columns: minmax(300px, 1fr) minmax(190px, 280px) auto !important; align-items: center !important; }
html.medindex-tailadmin[data-mi-page="analizat"] .lab-grid { grid-template-columns: repeat(4, minmax(210px, 1fr)) !important; gap: 10px !important; }
html.medindex-tailadmin[data-mi-page="analizat"] .lab-card-open { min-height: 170px !important; padding: 12px !important; }

/* Dozologjia and Protokollet */
html.medindex-tailadmin[data-mi-page="dozologjia"] .clinical-hero,
html.medindex-tailadmin[data-mi-page="protokollet"] .clinical-hero { display: grid !important; grid-template-columns: minmax(0, 1fr) auto !important; align-items: center !important; gap: 18px !important; padding: 20px 22px !important; }
html.medindex-tailadmin[data-mi-page="dozologjia"] .clinical-toolbar,
html.medindex-tailadmin[data-mi-page="protokollet"] .clinical-toolbar { position: sticky !important; top: 8px !important; z-index: 24 !important; display: grid !important; grid-template-columns: minmax(280px, 2fr) repeat(3, minmax(150px, 1fr)) !important; background: color-mix(in srgb, var(--mi-surface) 94%, transparent) !important; backdrop-filter: blur(16px); }
html.medindex-tailadmin[data-mi-page="dozologjia"] .clinical-row,
html.medindex-tailadmin[data-mi-page="protokollet"] .clinical-row { grid-template-columns: minmax(0, 1fr) auto !important; gap: 14px !important; padding: 14px 16px !important; border-radius: 12px !important; box-shadow: var(--mi-shadow-xs) !important; }
html.medindex-tailadmin[data-mi-page="dozologjia"] .clinical-details { grid-template-columns: repeat(4, minmax(130px, 1fr)) !important; gap: 8px !important; }
html.medindex-tailadmin[data-mi-page="protokollet"] .clinical-actions { min-width: 150px; }

/* Recetat */
html.medindex-tailadmin[data-mi-page="recetat"] .rx-hero { display: grid !important; grid-template-columns: auto minmax(0, 1fr) auto !important; align-items: center !important; gap: 16px !important; padding: 20px 22px !important; }
html.medindex-tailadmin[data-mi-page="recetat"] .rx-dashboard { display: grid !important; grid-template-columns: minmax(0, 1.08fr) minmax(360px, .92fr) !important; align-items: start !important; gap: 16px !important; }
html.medindex-tailadmin[data-mi-page="recetat"] .rx-compose-card,
html.medindex-tailadmin[data-mi-page="recetat"] .rx-preview-card,
html.medindex-tailadmin[data-mi-page="recetat"] .rx-saved-section { border-radius: 12px !important; }
html.medindex-tailadmin[data-mi-page="recetat"] .rx-command-bar { display: flex !important; flex-wrap: wrap !important; gap: 6px !important; padding: 8px !important; }
html.medindex-tailadmin[data-mi-page="recetat"] .rx-editor-wrap textarea { min-height: 300px !important; resize: vertical; }
html.medindex-tailadmin[data-mi-page="recetat"] .rx-preview-card { position: sticky; top: 8px; }
html.medindex-tailadmin[data-mi-page="recetat"] .rx-preview-actions,
html.medindex-tailadmin[data-mi-page="recetat"] .rx-compose-actions { display: flex !important; flex-wrap: wrap !important; gap: 8px !important; }

@media (max-width: 1439px) {
  :root { --mi-page-gutter: 20px; }
  html.medindex-tailadmin .mi-profile-chip > span:last-child { display: none !important; }
  html.medindex-tailadmin[data-mi-page="barnat"] .toolbar { grid-template-columns: minmax(260px, 2fr) repeat(3, minmax(120px, .75fr)) auto auto !important; }
  html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-header { grid-template-columns: minmax(190px, .75fr) minmax(300px, 1.25fr) !important; }
  html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-header > p:last-child { grid-column: 1 / -1; }
  html.medindex-tailadmin[data-mi-page="analizat"] .lab-grid { grid-template-columns: repeat(3, minmax(210px, 1fr)) !important; }
}

@media (max-width: 1199px) {
  html.medindex-tailadmin[data-mi-page="barnat"] .toolbar { grid-template-columns: minmax(260px, 1fr) repeat(2, minmax(140px, .7fr)) auto !important; }
  html.medindex-tailadmin[data-mi-page="barnat"] .toolbar .col-picker,
  html.medindex-tailadmin[data-mi-page="barnat"] .toolbar .selection-badge,
  html.medindex-tailadmin[data-mi-page="barnat"] .toolbar .protocol-toolbar-btn { grid-row: 2; }
  html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-grid,
  html.medindex-tailadmin[data-mi-page="icd"] .icd-chapter-grid,
  html.medindex-tailadmin[data-mi-page="icd"] .icd-code-grid { grid-template-columns: repeat(2, minmax(240px, 1fr)) !important; }
  html.medindex-tailadmin[data-mi-page="dozologjia"] .clinical-toolbar,
  html.medindex-tailadmin[data-mi-page="protokollet"] .clinical-toolbar { grid-template-columns: minmax(260px, 1fr) 1fr 1fr !important; }
  html.medindex-tailadmin[data-mi-page="recetat"] .rx-dashboard { grid-template-columns: 1fr !important; }
  html.medindex-tailadmin[data-mi-page="recetat"] .rx-preview-card { position: static; }
}

@media (max-width: 1023px) {
  html.medindex-tailadmin .mi-sidebar { position: fixed !important; inset: 0 auto 0 0 !important; z-index: 100 !important; width: var(--mi-sidebar-width) !important; min-width: var(--mi-sidebar-width) !important; max-width: var(--mi-sidebar-width) !important; flex-basis: var(--mi-sidebar-width) !important; transform: translateX(-100%) !important; box-shadow: 20px 0 44px rgba(16,24,40,.18) !important; }
  html.medindex-tailadmin body.mi-sidebar-open .mi-sidebar { transform: translateX(0) !important; }
  html.medindex-tailadmin .mi-workspace { width: 100% !important; }
  html.medindex-tailadmin .mi-content-container { padding-inline: 16px !important; }
  html.medindex-tailadmin[data-mi-page="barnat"] .toolbar,
  html.medindex-tailadmin[data-mi-page="icd"] .icd-toolbar,
  html.medindex-tailadmin[data-mi-page="analizat"] .lab-quickbar,
  html.medindex-tailadmin[data-mi-page="dozologjia"] .clinical-toolbar,
  html.medindex-tailadmin[data-mi-page="protokollet"] .clinical-toolbar { position: static !important; grid-template-columns: 1fr 1fr !important; }
  html.medindex-tailadmin[data-mi-page="barnat"] .toolbar > input[type="search"],
  html.medindex-tailadmin[data-mi-page="icd"] .icd-smart-wrap,
  html.medindex-tailadmin[data-mi-page="analizat"] .lab-search-wrap,
  html.medindex-tailadmin[data-mi-page="dozologjia"] .clinical-toolbar > input,
  html.medindex-tailadmin[data-mi-page="protokollet"] .clinical-toolbar > input { grid-column: 1 / -1; }
  html.medindex-tailadmin[data-mi-page="barnat"] .toolbar .count-badge { grid-column: 1 / -1; }
  html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-header { grid-template-columns: 1fr !important; gap: 12px !important; }
  html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-header > p:last-child { grid-column: auto; }
  html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-toolbar { grid-template-columns: auto minmax(0, 1fr) !important; }
  html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-reset,
  html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-count { grid-row: 2; }
  html.medindex-tailadmin[data-mi-page="analizat"] .lab-grid { grid-template-columns: repeat(2, minmax(210px, 1fr)) !important; }
}

@media (max-width: 767px) {
  :root { --mi-page-gutter: 12px; --mi-topbar-height: 64px; }
  html.medindex-tailadmin .mi-topbar { padding: 10px 12px !important; }
  html.medindex-tailadmin .mi-content-container { padding: 18px 12px 34px !important; }
  html.medindex-tailadmin :where(input,select,textarea) { font-size: 16px !important; }
  html.medindex-tailadmin .mi-page-heading { margin-bottom: 16px !important; }
  html.medindex-tailadmin[data-mi-page="barnat"] .mi-index-content > header:not(.registry-overview) { grid-template-columns: 1fr !important; padding: 16px !important; }
  html.medindex-tailadmin[data-mi-page="barnat"] .mi-index-content > header:not(.registry-overview) .sub { text-align: left; }
  html.medindex-tailadmin[data-mi-page="barnat"] .toolbar,
  html.medindex-tailadmin[data-mi-page="icd"] .icd-toolbar,
  html.medindex-tailadmin[data-mi-page="analizat"] .lab-quickbar,
  html.medindex-tailadmin[data-mi-page="dozologjia"] .clinical-toolbar,
  html.medindex-tailadmin[data-mi-page="protokollet"] .clinical-toolbar { grid-template-columns: 1fr !important; }
  html.medindex-tailadmin[data-mi-page="barnat"] .toolbar > *,
  html.medindex-tailadmin[data-mi-page="icd"] .icd-toolbar > *,
  html.medindex-tailadmin[data-mi-page="analizat"] .lab-quickbar > *,
  html.medindex-tailadmin[data-mi-page="dozologjia"] .clinical-toolbar > *,
  html.medindex-tailadmin[data-mi-page="protokollet"] .clinical-toolbar > * { grid-column: auto !important; grid-row: auto !important; width: 100% !important; }
  html.medindex-tailadmin[data-mi-page="barnat"] .table-wrap { max-height: none; }
  html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-toolbar { grid-template-columns: 1fr !important; }
  html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-grid,
  html.medindex-tailadmin[data-mi-page="icd"] .icd-chapter-grid,
  html.medindex-tailadmin[data-mi-page="icd"] .icd-code-grid,
  html.medindex-tailadmin[data-mi-page="analizat"] .lab-grid { grid-template-columns: 1fr !important; }
  html.medindex-tailadmin[data-mi-page="icd"] .med-hero,
  html.medindex-tailadmin[data-mi-page="analizat"] .med-hero,
  html.medindex-tailadmin[data-mi-page="klasifikimi"] .atc-header { padding: 20px 18px !important; }
  html.medindex-tailadmin[data-mi-page="dozologjia"] .clinical-hero,
  html.medindex-tailadmin[data-mi-page="protokollet"] .clinical-hero,
  html.medindex-tailadmin[data-mi-page="recetat"] .rx-hero { grid-template-columns: 1fr !important; }
  html.medindex-tailadmin[data-mi-page="dozologjia"] .clinical-summary,
  html.medindex-tailadmin[data-mi-page="protokollet"] .clinical-summary,
  html.medindex-tailadmin[data-mi-page="recetat"] .rx-hero-count,
  html.medindex-tailadmin[data-mi-page="recetat"] .rx-hero-icon { display: none !important; }
  html.medindex-tailadmin[data-mi-page="dozologjia"] .clinical-row,
  html.medindex-tailadmin[data-mi-page="protokollet"] .clinical-row { grid-template-columns: 1fr !important; }
  html.medindex-tailadmin[data-mi-page="dozologjia"] .clinical-details { grid-template-columns: 1fr !important; }
  html.medindex-tailadmin[data-mi-page="recetat"] .rx-compose-card { padding: 16px !important; }
}

@media (max-height: 760px) and (min-width: 1024px) {
  html.medindex-tailadmin .mi-sidebar-header { min-height: 74px !important; flex-basis: 74px !important; padding-block: 12px 8px !important; }
  html.medindex-tailadmin .mi-brand-mark { width: 40px !important; height: 40px !important; flex-basis: 40px !important; }
  html.medindex-tailadmin .mi-sidebar-scroll { padding-bottom: 8px !important; }
  html.medindex-tailadmin #appMenu { gap: 10px !important; }
  html.medindex-tailadmin #appMenu .mi-menu-heading { margin-bottom: 2px !important; line-height: 16px !important; }
  html.medindex-tailadmin #appMenu .app-menu-link,
  html.medindex-tailadmin #appMenu .auth-logout { min-height: 36px !important; padding-block: 7px !important; }
  html.medindex-tailadmin .mi-sidebar-footer { min-height: 58px !important; flex-basis: 58px !important; padding-block: 8px !important; }
  html.medindex-tailadmin .mi-user-avatar { width: 34px !important; height: 34px !important; flex-basis: 34px !important; }
}

@media (prefers-reduced-motion: reduce) {
  html.medindex-tailadmin *,
  html.medindex-tailadmin *::before,
  html.medindex-tailadmin *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
```

## Raw source: `theme-preload.js` (complete)

```js
(() => {
  'use strict';
  try {
    const saved = localStorage.getItem('regjistriBarnave_theme_v1');
    document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light';
  } catch {
    document.documentElement.dataset.theme = 'light';
  }
})();
```

## Token block: `styles.css` (bounded)

```css
:root{
    --ink:#12222a;
    --paper:#f7f8f6;
    --line:#d7dcd6;
    --teal:#155e63;
    --teal-dark:#0d3d40;
    --amber:#c77d1f;
    --amber-soft:#f4e3cb;
    --mono: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
    --sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --serif: 'Source Serif 4', Georgia, serif;
  }
```

## Token blocks: `medical-hub.css` (bounded)

```css
:root{--teal-dark:#0d3d40;--teal:#155e63;--amber:#c77d1f;--amber-soft:#f4e3cb;--ink:#12222a;--muted:#68777b;--paper:#fff;--surface:#f4f7f5;--line:#d7ded9;--shadow:0 18px 50px rgba(13,61,64,.11);--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--serif:Georgia,'Times New Roman',serif;--sans:Inter,system-ui,-apple-system,Segoe UI,sans-serif;color-scheme:light}

html[data-theme=dark]{--ink:#e9f1ef;--muted:#a7b6b4;--paper:#132326;--surface:#0b1719;--line:#314548;--shadow:0 18px 55px rgba(0,0,0,.3);color-scheme:dark}
```

## Token blocks: `clinical-reference.css` (bounded)

```css
:root{
  --clinical-bg:#f3f7f5;--clinical-surface:#fff;--clinical-text:#173235;--clinical-muted:#637476;
  --clinical-line:#d7e2de;--clinical-accent:#0d6668;--clinical-accent-soft:#e4f2ef;--clinical-warning:#8d5d14;
  --clinical-shadow:0 10px 28px rgba(20,61,62,.08)
}

[data-theme="dark"]{
  --clinical-bg:#0d1b1d;--clinical-surface:#142629;--clinical-text:#edf7f5;--clinical-muted:#abc0bd;
  --clinical-line:#2e4648;--clinical-accent:#70c9c6;--clinical-accent-soft:#17393a;--clinical-warning:#f1bd68;
  --clinical-shadow:0 12px 32px rgba(0,0,0,.28)
}
```

