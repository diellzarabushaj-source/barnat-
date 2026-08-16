'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputs = [
  path.join(root, 'app-runtime.js'),
  path.join(root, 'app-runtime-performance.js'),
];

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Registry personalization runtime patch failed: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Registry personalization runtime patch is ambiguous: ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function patchRuntime(source) {
  source = replaceOnce(
    source,
    "  pageSize: 50,\n};",
    "  pageSize: 50,\n  favoritesOnly: false,\n  notesOnly: false,\n};",
    'personal view state'
  );

  source = replaceOnce(
    source,
    "const REGISTRY_DEFAULT_PAGE_SIZE = 50;\nconst REGISTRY_ALLOWED_PAGE_SIZES = new Set([50, 100, 250, 500, 4006]);",
    `const REGISTRY_DEFAULT_PAGE_SIZE = 50;\nconst REGISTRY_ALLOWED_PAGE_SIZES = new Set([50, 100, 250, 500]);\nconst REGISTRY_FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';\nconst REGISTRY_NOTES_KEY = 'regjistriBarnave_shenime_v1';\nlet registryFavoritesRevision = 0;\nlet registryFavoritesRaw = null;\nlet registryFavoritesSet = new Set();\nlet registryNotesRevision = 0;\nlet registryNotesRaw = null;\nlet registryNotesMap = Object.create(null);\n\nfunction registryFavoriteStorageRaw(){\n  try { return localStorage.getItem(REGISTRY_FAVORITES_KEY) || '[]'; }\n  catch { return '[]'; }\n}\n\nfunction registryFavoriteKeys(){\n  const raw = registryFavoriteStorageRaw();\n  if(raw === registryFavoritesRaw) return registryFavoritesSet;\n  registryFavoritesRaw = raw;\n  try {\n    const parsed = JSON.parse(raw);\n    registryFavoritesSet = new Set(Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []);\n  } catch {\n    registryFavoritesSet = new Set();\n  }\n  return registryFavoritesSet;\n}\n\nfunction registryNoteStorageRaw(){\n  try { return localStorage.getItem(REGISTRY_NOTES_KEY) || '{}'; }\n  catch { return '{}'; }\n}\n\nfunction registryNotes(){\n  const raw = registryNoteStorageRaw();\n  if(raw === registryNotesRaw) return registryNotesMap;\n  registryNotesRaw = raw;\n  try {\n    const parsed = JSON.parse(raw);\n    registryNotesMap = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : Object.create(null);\n  } catch {\n    registryNotesMap = Object.create(null);\n  }\n  return registryNotesMap;\n}\n\nfunction registryRowFavoriteCandidates(row){\n  const nr = String(row?.['Nr rendor'] ?? '').trim();\n  const name = String(row?.['Emri tregtar'] ?? '').trim();\n  const atc = String(row?.['ATC Code'] ?? '').trim().toUpperCase();\n  const values = [drugKey(row), nr, name];\n  if(nr && name) values.push(nr + '|' + name);\n  if(name && atc) values.push(name + '|' + atc);\n  return values.filter(Boolean);\n}\n\nfunction registryRowIsFavorite(row){\n  const favorites = registryFavoriteKeys();\n  return registryRowFavoriteCandidates(row).some(key => favorites.has(key));\n}\n\nfunction registryRowNoteKey(row){\n  const nr = String(row?.['Nr rendor'] ?? '').trim();\n  if(nr) return 'registry:' + nr;\n  const key = String(drugKey(row) || '').trim();\n  if(key) return ('drug:' + key).slice(0, 300);\n  const name = String(row?.['Emri tregtar'] ?? '').trim();\n  const atc = String(row?.['ATC Code'] ?? '').trim().toUpperCase();\n  return ('fallback:' + name + '|' + atc).slice(0, 300);\n}\n\nfunction registryRowHasNote(row){\n  const entry = registryNotes()[registryRowNoteKey(row)];\n  if(!entry) return false;\n  const value = typeof entry === 'string' ? entry : entry.text;\n  return Boolean(String(value ?? '').trim());\n}`,
    'personalization helpers and allowed page sizes'
  );

  const oldFilter = `currentFilterKey = function currentFilterKeyWithAtc(){\n  return [\n    String(state.activeAtc || ''),\n    normalizeSearchText(state.search),\n    state.status,\n    state.formType || '',\n    state.formValue || '',\n  ].join('|');\n};\n\ngetFiltered = function getFilteredWithAtc(){\n  const key = currentFilterKey();\n  if(key === filteredCacheKey) return filteredCacheRows;\n\n  let rows = getRegistryAtcRows();\n  const q = normalizeSearchText(state.search);\n  if(q){\n    const terms = q.split(/\\s+/).filter(Boolean);\n    rows = rows.filter(row => rowMatchesSearch(row, terms));\n  }\n  if(state.status){\n    rows = rows.filter(row => String(row['Statusi'] ?? '').trim() === state.status);\n  }\n  if(state.formType === 'form'){\n    rows = rows.filter(row => String(row['Forma farmaceutike'] ?? '').trim() === state.formValue);\n  } else if(state.formType === 'category'){\n    rows = rows.filter(row => categoryOf(row['Forma farmaceutike']) === state.formValue);\n  }\n\n  filteredCacheKey = key;\n  filteredCacheRows = rows;\n  return rows;\n};`;

  const newFilter = `currentFilterKey = function currentFilterKeyWithAtc(){\n  return [\n    String(state.activeAtc || ''),\n    normalizeSearchText(state.search),\n    state.status,\n    state.formType || '',\n    state.formValue || '',\n    state.favoritesOnly ? 'favorites:' + registryFavoritesRevision + ':' + registryFavoriteStorageRaw() : '',\n    state.notesOnly ? 'notes:' + registryNotesRevision + ':' + registryNoteStorageRaw() : '',\n  ].join('|');\n};\n\ngetFiltered = function getFilteredWithAtc(){\n  const key = currentFilterKey();\n  if(key === filteredCacheKey) return filteredCacheRows;\n\n  let rows = getRegistryAtcRows();\n  const q = normalizeSearchText(state.search);\n  if(q){\n    const terms = q.split(/\\s+/).filter(Boolean);\n    rows = rows.filter(row => rowMatchesSearch(row, terms));\n  }\n  if(state.status){\n    rows = rows.filter(row => String(row['Statusi'] ?? '').trim() === state.status);\n  }\n  if(state.formType === 'form'){\n    rows = rows.filter(row => String(row['Forma farmaceutike'] ?? '').trim() === state.formValue);\n  } else if(state.formType === 'category'){\n    rows = rows.filter(row => categoryOf(row['Forma farmaceutike']) === state.formValue);\n  }\n  if(state.favoritesOnly){\n    rows = rows.filter(registryRowIsFavorite);\n  }\n  if(state.notesOnly){\n    rows = rows.filter(registryRowHasNote);\n  }\n\n  filteredCacheKey = key;\n  filteredCacheRows = rows;\n  return rows;\n};`;

  source = replaceOnce(source, oldFilter, newFilter, 'native personal filters');

  source = replaceOnce(
    source,
    "    pageSize:state.pageSize,\n  };",
    "    pageSize:state.pageSize,\n    favoritesOnly:Boolean(state.favoritesOnly),\n    notesOnly:Boolean(state.notesOnly),\n  };",
    'render detail personal state'
  );

  source = replaceOnce(
    source,
    "  window.dispatchEvent(new CustomEvent('medindex:registry-atc-state', { detail }));\n};",
    "  window.dispatchEvent(new CustomEvent('medindex:registry-atc-state', { detail }));\n  window.dispatchEvent(new CustomEvent('medindex:registry-rendered', { detail }));\n};",
    'deterministic registry rendered event'
  );

  source = replaceOnce(
    source,
    "  state.pageSize = Math.min(requested, Math.max(50, RAW.length));",
    "  state.pageSize = sanitizeRegistryPageSize(requested);",
    'page size fail-safe'
  );

  const api = `function setRegistryFavoritesOnly(enabled){\n  const next = Boolean(enabled);\n  if(next) state.notesOnly = false;\n  if(state.favoritesOnly === next){\n    if(next){\n      registryFavoritesRevision += 1;\n      registryFavoritesRaw = null;\n      resetRegistryFilterCaches();\n      state.page = 1;\n      render();\n    }\n    return;\n  }\n  state.favoritesOnly = next;\n  state.page = 1;\n  registryFavoritesRevision += 1;\n  registryFavoritesRaw = null;\n  resetRegistryFilterCaches();\n  render();\n}\n\nfunction setRegistryNotesOnly(enabled){\n  const next = Boolean(enabled);\n  if(next) state.favoritesOnly = false;\n  if(state.notesOnly === next){\n    if(next){\n      registryNotesRevision += 1;\n      registryNotesRaw = null;\n      resetRegistryFilterCaches();\n      state.page = 1;\n      render();\n    }\n    return;\n  }\n  state.notesOnly = next;\n  state.page = 1;\n  registryNotesRevision += 1;\n  registryNotesRaw = null;\n  resetRegistryFilterCaches();\n  render();\n}\n\nfunction refreshRegistryFavorites(){\n  registryFavoritesRevision += 1;\n  registryFavoritesRaw = null;\n  resetRegistryFilterCaches();\n  if(state.favoritesOnly) state.page = 1;\n  render();\n}\n\nfunction refreshRegistryNotes(){\n  registryNotesRevision += 1;\n  registryNotesRaw = null;\n  resetRegistryFilterCaches();\n  if(state.notesOnly) state.page = 1;\n  render();\n}\n\nfunction setRegistryPersonalView(view){\n  const value = String(view || 'all').toLowerCase();\n  state.favoritesOnly = value === 'favorites';\n  state.notesOnly = value === 'notes';\n  state.page = 1;\n  registryFavoritesRevision += 1;\n  registryNotesRevision += 1;\n  registryFavoritesRaw = null;\n  registryNotesRaw = null;\n  resetRegistryFilterCaches();\n  render();\n}\n\nwindow.MedIndexRegistryRuntime = Object.freeze({\n  setPersonalView:setRegistryPersonalView,\n  setFavoritesOnly:setRegistryFavoritesOnly,\n  setNotesOnly:setRegistryNotesOnly,\n  refreshFavorites:refreshRegistryFavorites,\n  refreshNotes:refreshRegistryNotes,\n  isFavoritesOnly:() => Boolean(state.favoritesOnly),\n  isNotesOnly:() => Boolean(state.notesOnly),\n  getFilteredCount:() => getFiltered().length,\n  getPageSize:() => state.pageSize,\n});\n\n`;

  source = replaceOnce(
    source,
    'applyRegistryUrlStateFromLocation();\nsyncRegistryUrlState();',
    `${api}applyRegistryUrlStateFromLocation();\nsyncRegistryUrlState();`,
    'registry runtime personalization API'
  );

  if (!source.includes('rows = rows.filter(registryRowIsFavorite);')
      || !source.includes('rows = rows.filter(registryRowHasNote);')
      || !source.includes('setNotesOnly:setRegistryNotesOnly')
      || !source.includes('setPersonalView:setRegistryPersonalView')
      || !source.includes("new Set([50, 100, 250, 500])")
      || !source.includes('medindex:registry-rendered')
      || !source.includes('window.MedIndexRegistryRuntime = Object.freeze')
      || source.includes('state.pageSize = Math.min(requested, Math.max(50, RAW.length));')) {
    throw new Error('Registry personalization runtime patch did not satisfy the personal-view contract.');
  }
  return source;
}

for (const file of outputs) {
  if (!fs.existsSync(file)) throw new Error(`Generated registry runtime missing: ${path.basename(file)}`);
  const original = fs.readFileSync(file, 'utf8');
  const patched = patchRuntime(original);
  fs.writeFileSync(file, patched, 'utf8');
}

console.log('Native favorites + notes filtering and deterministic personalization render hook applied.');