'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const exists = file => fs.existsSync(path.join(ROOT, file));

function matchAll(source, regex) {
  return [...source.matchAll(regex)].map(match => match[1] ?? match[0]);
}

function finding(id, severity, title, evidence, consequence, nextGate) {
  return { id, severity, title, evidence, consequence, nextGate };
}

const index = read('index.html');
const lite = read('registry-mobile-lite.js');
const loader = read('registry-runtime-loader.js');
const appPerformance = read('app-performance.js');
const liteCss = read('registry-mobile-lite.css');
const phase8Css = exists('registry-mobile-phase8.css') ? read('registry-mobile-phase8.css') : '';
const designCss = read('registry-mobile-design-audit.css');
const criticalCss = read('registry-mobile-critical.css');
const shell = read('tailadmin-shell.js');
const mobileExperience = read('mobile-experience.js');
const sidebarHardening = read('mobile-sidebar-hardening.js');
const vercel = read('vercel.json');
const packageJson = JSON.parse(read('package.json'));
const phase8Patch = read('scripts/patch-registry-phase8-personalization.js');

const mobileStylesInIndex = matchAll(index, /href="([^"]*registry-mobile[^"?]*\.css)[^"]*"/g);
const registryScriptsInIndex = matchAll(index, /src="([^"]*registry-[^"?]*\.js)[^"]*"/g);
const shellBreakpoint = Number((shell.match(/const MOBILE_BREAKPOINT = (\d+)/) || [])[1] || 0);
const liteBreakpoint = Number((lite.match(/max-width:\s*(\d+)px/) || [])[1] || 0);
const graceMs = Number((loader.match(/const MOBILE_LITE_GRACE_MS = (\d+)/) || [])[1] || 0);

const findings = [];

if (graceMs > 0 && /scheduleRuntime\('mobile-lite-timeout'\)/.test(loader) && /loadRegistrySource\(\)/.test(appPerformance)) {
  findings.push(finding(
    'P0-RACE-001',
    'critical',
    'Mobile-lite can lose ownership after a fixed timeout',
    `registry-runtime-loader starts the full registry after ${graceMs} ms unless mobile-lite is already ready; the full runtime can then load the complete registry source.`,
    'On a cold/slow mobile request, both lightweight and full registry paths can become active, allowing the full renderer to replace or mutate the compact mobile list.',
    'Phase 1 must give mobile-lite durable list ownership; timeout fallback may recover data but must not replace the list renderer.'
  ));
}

const liteHandoffReasons = matchAll(lite, /\['(?:protocolsBtn|colPickerBtn|formPickerBtn)',\s*'([^']+)'\]/g);
if (/requestFullRegistry\('mobile-lite-error'\)/.test(lite) || liteHandoffReasons.length) {
  findings.push(finding(
    'P0-OWNER-002',
    'critical',
    'Feature clicks and initial-load failure can hand the phone to the full registry',
    `Detected advanced-feature handoff reasons: ${liteHandoffReasons.join(', ') || 'none parsed'}; initial load also hands off on mobile-lite-error.`,
    'The renderer can switch architecture mid-session, producing desktop/full-table DOM under mobile CSS and increasing network/main-thread work.',
    'Phase 1 must keep the mobile list owner stable and route advanced features into mobile sheets/modules instead of a whole-registry handoff.'
  ));
}

if (/grid-template-columns:minmax\(0,1fr\) auto/.test(liteCss)
    && /position:absolute/.test(phase8Css)
    && /right:8px/.test(phase8Css)
    && /\.mobile-lite-more/.test(designCss)) {
  findings.push(finding(
    'P0-GEOMETRY-003',
    'high',
    'Favorite control can occupy the same right-side geometry as “Më shumë”',
    'The base card uses a 1fr/auto grid while Phase 8 places the 44px favorite control absolutely at top/right; the design layer also gives “Më shumë” its own fixed right-side width.',
    'This allows the star and “Më shumë” to overlap on narrow cards, matching the supplied iPhone screenshot.',
    'Phase 2 must use one explicit action column/row and forbid absolute controls from occupying another action hitbox.'
  ));
}

const buildAddsPhase8 = /registry-mobile-phase8\.css/.test(phase8Patch) && /registry-mobile-phase8\.js/.test(phase8Patch);
const sourceHasPhase8 = /registry-mobile-phase8\.css/.test(index) || /registry-mobile-phase8\.js/.test(index);
if (buildAddsPhase8 && !sourceHasPhase8) {
  findings.push(finding(
    'P0-BUILD-004',
    'high',
    'Repository source and deployed build artifact are intentionally different',
    'The Phase 8 build patch mutates index.html and registry-mobile-lite.js during build, while the checked-in index does not yet contain those Phase 8 tags.',
    'A source-only review can miss the actual production cascade/order, and build residue can make debugging non-obvious.',
    'Before UI refactors, production-facing tests must run after build:runtime and inspect the built artifact, not only checked-in source.'
  ));
}

const effectiveMobileLayerCount = mobileStylesInIndex.length + (buildAddsPhase8 && !sourceHasPhase8 ? 1 : 0);
if (effectiveMobileLayerCount >= 6) {
  findings.push(finding(
    'P0-CASCADE-005',
    'high',
    'Too many independent mobile registry style owners',
    `Checked-in index references ${mobileStylesInIndex.length} registry-mobile CSS files; build-time Phase 8 raises the effective production stack to at least ${effectiveMobileLayerCount}.`,
    'Later layers can override geometry from earlier layers, making screenshot-level regressions possible even when each file is locally correct.',
    'Phase 7 should consolidate only after behavior is stable; Phase 1/2 tests must identify the winning selectors for critical geometry.'
  ));
}

if (shellBreakpoint && liteBreakpoint && shellBreakpoint !== liteBreakpoint) {
  findings.push(finding(
    'P0-BREAKPOINT-006',
    'medium',
    'Shell and registry use different mobile breakpoints',
    `Shell/mobile experience breakpoint: <${shellBreakpoint}px; registry mobile-lite breakpoint: <=${liteBreakpoint}px.`,
    'Widths between the two breakpoints can receive a mobile shell with a non-mobile registry renderer, increasing state/cascade complexity.',
    'Define one registry ownership breakpoint contract and test 767/768/1023/1024 boundaries explicitly.'
  ));
}

if (/private, no-store, max-age=0/.test(vercel) && /public, max-age=0, must-revalidate/.test(vercel)) {
  findings.push(finding(
    'P0-NETWORK-007',
    'medium',
    'Static JS/CSS revalidate on every navigation while APIs are no-store',
    'Vercel headers set API responses to private/no-store and JS/CSS to max-age=0,must-revalidate.',
    `The page references ${registryScriptsInIndex.length} registry scripts before counting shell/runtime modules, so repeated validation overhead can be noticeable on mobile even when payloads are cached locally.`,
    'Phase 5/6 should measure requests first, then version immutable static assets and preserve strict freshness only where clinically required.'
  ));
}

if (/body\.mi-body[\s\S]*position:fixed!important/.test(criticalCss)
    && /visualViewport/.test(mobileExperience)
    && /MutationObserver/.test(sidebarHardening)) {
  findings.push(finding(
    'P0-SHELL-008',
    'medium',
    'Mobile shell state is governed by multiple runtime/layout systems',
    'Critical CSS fixes the body/app shell to the viewport; mobile-experience tracks visualViewport; sidebar-hardening adds body/sidebar observers and focus state.',
    'This is workable but makes Safari keyboard, drawer and scroll bugs sensitive to event ordering and selector precedence.',
    'Phase 4 must test keyboard-open, drawer-open, detail-open and rotation as explicit state combinations.'
  ));
}

const severityRank = { critical:4, high:3, medium:2, low:1 };
findings.sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || a.id.localeCompare(b.id));

const summary = {
  generatedAt:new Date().toISOString(),
  scope:'MedIndex mobile Phase 0 forensic source/build audit',
  noProductionBehaviorChanged:true,
  metrics:{
    checkedInMobileRegistryStyles:mobileStylesInIndex.length,
    effectiveProductionMobileRegistryStylesAtLeast:effectiveMobileLayerCount,
    checkedInRegistryScripts:registryScriptsInIndex.length,
    shellMobileBreakpoint:shellBreakpoint,
    registryLiteBreakpoint:liteBreakpoint,
    mobileLiteGraceMs:graceMs,
    buildRuntimePatchCount:(packageJson.scripts?.['build:runtime']?.match(/node scripts\//g) || []).length,
  },
  findings,
};

console.log(JSON.stringify(summary, null, 2));

if (!findings.some(item => item.severity === 'critical')) {
  console.error('Phase 0 expected at least one critical ownership/race finding but none was detected. Re-audit the source assumptions.');
  process.exitCode = 2;
}
