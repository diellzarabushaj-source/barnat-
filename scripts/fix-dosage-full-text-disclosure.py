from pathlib import Path

# The dosage “Më shumë” button previously expanded only its inner text,
# while the table cell remained locked to the compact 92px row height.
# Route the disclosure through the canonical row controller instead.
dosage_path = Path('registry-dosage-columns-v2.js')
dosage = dosage_path.read_text(encoding='utf-8')
dosage = dosage.replace("const VERSION = 'registry-dosage-performance-v3';", "const VERSION = 'registry-dosage-performance-v4';", 1)
old_handler = """      tbody.addEventListener('click', event => {
        const trigger = event.target.closest('.registry-dosage-dose');
        if (!trigger) return;
        event.stopPropagation();
        const regimen = trigger.closest('.registry-dosage-regimen');
        const expanded = regimen?.classList.toggle('is-expanded') || false;
        trigger.setAttribute('aria-expanded', String(expanded));
        const toggle = trigger.querySelector('.registry-dosage-toggle');
        if (toggle) toggle.textContent = expanded ? 'Më pak' : 'Më shumë';
        const dose = clean(trigger.querySelector('.registry-dosage-dose-text')?.textContent);
        trigger.setAttribute('aria-label', `${expanded ? 'Mbyll' : 'Shfaq'} dozimin e plotë: ${dose}`);
      });"""
new_handler = """      tbody.addEventListener('click', event => {
        const trigger = event.target.closest('.registry-dosage-dose');
        if (!trigger) return;
        event.preventDefault();
        event.stopPropagation();

        const row = trigger.closest('tr');
        if (!row) return;

        const rowController = window.MedIndexRegistryRows;
        if (typeof rowController?.toggleRow === 'function') {
          rowController.toggleRow(row);
          return;
        }

        const expanded = !(row.classList.contains('registry-row-expanded') || row.dataset.registryRowExpanded === 'true');
        row.classList.toggle('registry-row-expanded', expanded);
        row.dataset.registryRowExpanded = String(expanded);
        row.querySelectorAll('.registry-dosage-regimen').forEach(regimen => {
          regimen.classList.toggle('is-expanded', expanded);
          const button = regimen.querySelector('.registry-dosage-dose');
          if (!button) return;
          button.setAttribute('aria-expanded', String(expanded));
          const toggle = button.querySelector('.registry-dosage-toggle');
          if (toggle) toggle.textContent = expanded ? 'Më pak' : 'Më shumë';
          const dose = clean(button.querySelector('.registry-dosage-dose-text')?.textContent);
          button.setAttribute('aria-label', `${expanded ? 'Mbyll' : 'Shfaq'} dozimin e plotë: ${dose}`);
        });
      });"""
if old_handler not in dosage:
    raise SystemExit('Dosage disclosure handler anchor was not found.')
dosage_path.write_text(dosage.replace(old_handler, new_handler, 1), encoding='utf-8')

# Keep every disclosure label and clamp state synchronized when the row
# is opened from either “Më shumë” or the square expand control.
row_path = Path('registry-row-expand.js')
row = row_path.read_text(encoding='utf-8')
row = row.replace("const VERSION = 'registry-row-expand-20260801-4';", "const VERSION = 'registry-row-expand-20260805-5';", 1)
sync_anchor = """  function syncRowState(row) {
    const key = rowKey(row);"""
sync_helper = """  function syncDosageDisclosures(row, expanded) {
    row.querySelectorAll('.registry-dosage-regimen').forEach(regimen => {
      regimen.classList.toggle('is-expanded', expanded);
      const trigger = regimen.querySelector('.registry-dosage-dose');
      if (!trigger) return;
      trigger.setAttribute('aria-expanded', String(expanded));
      const toggle = trigger.querySelector('.registry-dosage-toggle');
      if (toggle) toggle.textContent = expanded ? 'Më pak' : 'Më shumë';
      const dose = clean(trigger.querySelector('.registry-dosage-dose-text')?.textContent);
      trigger.setAttribute('aria-label', `${expanded ? 'Mbyll' : 'Shfaq'} dozimin e plotë: ${dose}`);
    });
  }

  function syncRowState(row) {
    const key = rowKey(row);"""
if sync_anchor not in row:
    raise SystemExit('Row disclosure helper anchor was not found.')
row = row.replace(sync_anchor, sync_helper, 1)
details_anchor = """    row.querySelectorAll('.registry-dosage-details').forEach(details => {
      details.open = expanded;
    });
    syncPreviewTriggers(row, expanded);"""
details_replacement = """    row.querySelectorAll('.registry-dosage-details').forEach(details => {
      details.open = expanded;
    });
    syncDosageDisclosures(row, expanded);
    syncPreviewTriggers(row, expanded);"""
if details_anchor not in row:
    raise SystemExit('Row disclosure synchronization anchor was not found.')
row_path.write_text(row.replace(details_anchor, details_replacement, 1), encoding='utf-8')

# Expanded rows must grow to the real content height; fixed 132/148px ceilings
# can still cut off long clinical instructions.
preview_path = Path('registry-cell-preview.css')
preview = preview_path.read_text(encoding='utf-8')
preview = preview.replace('  height:132px!important;\n  min-height:132px!important;\n  max-height:none!important;', '  height:auto!important;\n  min-height:132px!important;\n  max-height:none!important;', 1)
preview = preview.replace('  height:132px!important;\n  min-height:132px!important;\n  max-height:none!important;\n  padding-top:14px!important;', '  height:auto!important;\n  min-height:132px!important;\n  max-height:none!important;\n  padding-top:14px!important;', 1)
preview = preview.replace('    height:148px!important;\n    min-height:148px!important;', '    height:auto!important;\n    min-height:148px!important;', 1)
preview = preview.replace('    height:148px!important;\n    min-height:148px!important;\n    padding-top:16px!important;', '    height:auto!important;\n    min-height:148px!important;\n    padding-top:16px!important;', 1)
preview_path.write_text(preview, encoding='utf-8')

full_path = Path('registry-full-text-expansion.css')
full = full_path.read_text(encoding='utf-8')
disclosure_contract = r'''

/* Më shumë uses the same row-level reveal contract as the square icon.
   Release the dosage button itself as well as its text span so no compact
   table rule can keep the clinical instruction clipped. */
html.medindex-tailadmin[data-mi-page="barnat"] body #registryContent #dataTable tbody tr:is(
  .registry-row-expanded,
  [data-registry-row-expanded="true"]
) .registry-dosage-regimen.is-expanded,
html.medindex-tailadmin[data-mi-page="barnat"] body #registryContent #dataTable tbody tr:is(
  .registry-row-expanded,
  [data-registry-row-expanded="true"]
) .registry-dosage-regimen.is-expanded .registry-dosage-dose,
html.medindex-tailadmin[data-mi-page="barnat"] body #registryContent #dataTable tbody tr:is(
  .registry-row-expanded,
  [data-registry-row-expanded="true"]
) .registry-dosage-regimen.is-expanded .registry-dosage-dose-text {
  display:block!important;
  height:auto!important;
  min-height:0!important;
  max-height:none!important;
  overflow:visible!important;
  text-overflow:clip!important;
  white-space:normal!important;
  -webkit-box-orient:initial!important;
  -webkit-line-clamp:unset!important;
}
'''
if 'Më shumë uses the same row-level reveal contract' not in full:
    full = full.rstrip() + disclosure_contract + '\n'
full_path.write_text(full, encoding='utf-8')

# Cache-bust every changed presentation/runtime asset and bump the UI release.
index_path = Path('index.html')
index = index_path.read_text(encoding='utf-8')
replacements = {
    'data-registry-ui-release="20260801-14"':'data-registry-ui-release="20260805-15"',
    'registry-dosage-columns.css?v=20260728-2':'registry-dosage-columns.css?v=20260805-1',
    'registry-cell-preview.css?v=20260801-3':'registry-cell-preview.css?v=20260805-4',
    'registry-full-text-expansion.css?v=20260801-1':'registry-full-text-expansion.css?v=20260805-2',
    'registry-row-expand.js?v=20260801-4':'registry-row-expand.js?v=20260805-5',
    'registry-dosage-loader.js?v=20260728-2':'registry-dosage-loader.js?v=20260805-3',
    'registry-ui-release.js?v=20260801-14':'registry-ui-release.js?v=20260805-15',
}
for old, new in replacements.items():
    if old not in index:
        raise SystemExit(f'Index cache-bust anchor not found: {old}')
    index = index.replace(old, new, 1)
index_path.write_text(index, encoding='utf-8')

loader_path = Path('registry-dosage-loader.js')
loader = loader_path.read_text(encoding='utf-8')
loader = loader.replace("const VERSION = 'registry-dosage-idle-loader-v2';", "const VERSION = 'registry-dosage-idle-loader-v3';", 1)
loader = loader.replace("const SRC = '/registry-dosage-columns-v2.js?v=20260728-2';", "const SRC = '/registry-dosage-columns-v2.js?v=20260805-4';", 1)
loader_path.write_text(loader, encoding='utf-8')

release_path = Path('registry-ui-release.js')
release = release_path.read_text(encoding='utf-8')
if "const RELEASE = 'registry-ui-20260801-14';" not in release:
    raise SystemExit('Registry release anchor not found.')
release_path.write_text(release.replace("const RELEASE = 'registry-ui-20260801-14';", "const RELEASE = 'registry-ui-20260805-15';", 1), encoding='utf-8')

# Lock the regression.
test_path = Path('tests/registry-cell-preview-test.js')
test = test_path.read_text(encoding='utf-8')
test = test.replace("const rowExpand = read('registry-row-expand.js');", "const rowExpand = read('registry-row-expand.js');\nconst dosageRuntime = read('registry-dosage-columns-v2.js');", 1)
test = test.replace("registry-cell-preview.css?v=20260801-3", "registry-cell-preview.css?v=20260805-4")
test = test.replace("registry-full-text-expansion.css?v=20260801-1", "registry-full-text-expansion.css?v=20260805-2")
test = test.replace("registry-row-expand.js?v=20260801-4", "registry-row-expand.js?v=20260805-5")
test = test.replace('data-registry-ui-release="20260801-14"', 'data-registry-ui-release="20260805-15"')
assertions_anchor = """assert(rowExpand.includes('syncPreviewTriggers(row, expanded)'), 'Row expansion must synchronize every trigger in the row.');

console.log('Full-row zoom reveals every textual column without modal or clamp.');"""
assertions = """assert(rowExpand.includes('syncPreviewTriggers(row, expanded)'), 'Row expansion must synchronize every trigger in the row.');
assert(rowExpand.includes('function syncDosageDisclosures(row, expanded)'), 'Row expansion must synchronize dosage disclosure controls.');
assert(rowExpand.includes("regimen.classList.toggle('is-expanded', expanded)"), 'All dosage regimens must follow the canonical row state.');
assert(dosageRuntime.includes("rowController.toggleRow(row)"), 'The Më shumë control must release the containing table row.');
assert(!dosageRuntime.includes("regimen?.classList.toggle('is-expanded')"), 'The dosage control must not expand only a clipped inner element.');
assert(!styles.includes('height:132px!important;\\n  min-height:132px!important'), 'Expanded desktop rows must not have a fixed height ceiling.');
assert(fullTextStyles.includes('.registry-dosage-regimen.is-expanded .registry-dosage-dose-text'), 'Expanded dosage text must have an explicit unclamped contract.');

console.log('Full-row zoom and Më shumë reveal every textual column without modal or clamp.');"""
if assertions_anchor not in test:
    raise SystemExit('Cell preview regression-test anchor not found.')
test_path.write_text(test.replace(assertions_anchor, assertions, 1), encoding='utf-8')

final_test_path = Path('tests/registry-table-final-test.js')
final_test = final_test_path.read_text(encoding='utf-8')
final_test = final_test.replace('data-registry-ui-release="20260801-14"', 'data-registry-ui-release="20260805-15"')
final_test = final_test.replace('registry-full-text-expansion\\.css\\?v=20260801-1', 'registry-full-text-expansion\\.css\\?v=20260805-2')
final_test = final_test.replace('registry-ui-20260801-14', 'registry-ui-20260805-15')
final_test_path.write_text(final_test, encoding='utf-8')
