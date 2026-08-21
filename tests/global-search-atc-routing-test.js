const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const shell = read('tailadmin-shell.js');
const search = read('atc-global-search.js');
const styles = read('atc-global-search.css');
const index = read('index.html');

// Release-pinned by the build, unpinned in source: both spellings satisfy the
// contract, which is the canonical path and version.
assert.match(shell, /ATC_SEARCH_SRC = '\/atc-global-search\.js\?v=atc-global-search-v1(?:&build=[^']+)?'/, 'TailAdmin must expose the ATC-aware global search runtime');
assert.match(shell, /loadRuntime\(ATC_SEARCH_SRC, 'data-medindex-atc-global-search'/, 'Global search must still use the canonical shell loader');
assert.match(shell, /if \(!isMobileLayout\(\)\) assets\.push\(ATC_NAV_SRC, ATC_SEARCH_SRC\)/, 'ATC global search must not be warmed during phone startup');
assert.match(shell, /data-mi-mobile-search.*data-mi-registry-nav="search"/, 'Phone ATC search must start loading from explicit search intent');
assert.match(shell, /medindex:mobile-search-opened/, 'Phone ATC search needs a semantic open-event fallback');
assert.doesNotMatch(index, /<script[^>]+src="(?:classification-data|atc-shared)\.js/i, 'Phone startup must leave shared ATC data to the intent-loaded navigation/search runtimes');

assert.match(search, /document\.getElementById\('miGlobalSearch'\)/, 'The existing header search input must be enhanced');
assert.doesNotMatch(search, /createElement\(['"]input['"]\)/, 'Global ATC search must not create a duplicate search input');
assert.match(search, /ENDPOINT = '\/api\/drug-search'/, 'Global search must use the authenticated medicine search API');
assert.match(search, /DEBOUNCE_MS = 220/, 'Global search needs a controlled debounce');
assert.match(search, /new AbortController\(\)/, 'Stale medicine searches must be cancelled');
assert.match(search, /resolveCategoryCode\(value\)/, 'Full product ATC codes must resolve to current sidebar categories');
assert.match(search, /registryUrl\(\{ atc, query:group\.label \}\)/, 'Substance results must open the matching ATC category and preserve the query');
assert.match(search, /registryUrl\(\{ atc, query:productQuery \}\)/, 'Product results must open the matching category in the main registry');
assert.match(search, /group\.categories\.size !== 1/, 'Ambiguous substances must not be auto-routed to a guessed category');
assert.match(search, /exactCategoriesSet\.size === 1/, 'Automatic Enter routing is allowed only for one exact ATC category');
assert.match(search, /registryUrl\(\{ query \}\)/, 'Ambiguous Enter searches must fall back to the full registry without an ATC guess');
assert.match(search, /role', 'combobox'/, 'The header search must expose the combobox role');
assert.match(search, /role', 'listbox'/, 'The result popup must expose the listbox role');
assert.match(search, /role="option"/, 'Every suggestion must be a selectable option');
assert.match(search, /ArrowDown','ArrowUp','Enter','Escape/, 'Keyboard navigation keys are missing');
assert.match(search, /addEventListener\('keydown', onKeydown, true\)/, 'The ATC search must intercept Enter before the legacy page-search handler');
assert.match(search, /stopImmediatePropagation\(\)/, 'Handled keyboard commands must not trigger the legacy search action too');
assert.match(search, /Substancë aktive/, 'Substance suggestions must be labeled clearly');
assert.match(search, /Kategori ATC/, 'Category suggestions must be labeled clearly');

assert.match(styles, /\.mi-atc-global-search-results/, 'Global search result popup styles are missing');
assert.match(styles, /\.mi-atc-search-option\.is-active/, 'Active keyboard option styling is missing');
assert.match(styles, /html\[data-theme="dark"\]/, 'Dark mode support is missing');
assert.match(styles, /@media \(max-width:1023px\)/, 'Mobile result layout is missing');
assert.match(styles, /100dvh/, 'Mobile result height must account for the dynamic viewport');
assert.match(styles, /:focus-visible/, 'Keyboard focus visibility is missing');

execFileSync(process.execPath, ['--check', path.join(ROOT, 'atc-global-search.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'tailadmin-shell.js')], { stdio:'pipe' });

console.log('ATC-aware global search routing tests passed.');
