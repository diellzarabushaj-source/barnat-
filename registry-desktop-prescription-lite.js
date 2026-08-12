(() => {
  'use strict';

  const VERSION = 'registry-desktop-prescription-lite-v1';
  const DESKTOP_QUERY = '(min-width: 768px)';
  const SELECTION_KEY = 'medindexPrescriptionSelection';
  const media = window.matchMedia?.(DESKTOP_QUERY);
  if (!media?.matches) return;

  const selected = new Map();
  let enabled = true;
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function active() {
    return enabled && Boolean(window.MEDINDEX_DESKTOP_LITE_ACTIVE)
      && document.documentElement.dataset.registryDesktopLiteState !== 'handoff';
  }

  function itemKey(item) {
    return clean(item?.drugId || item?.key || item?.drugKey)
      || [item?.substance, item?.tradeName, item?.strength, item?.form].map(clean).join('|');
  }

  function normalizeStoredItem(item) {
    if (!item || typeof item !== 'object') return null;
    const normalized = {
      drugId:clean(item.drugId || item.id),
      drugKey:clean(item.drugKey || item.key),
      key:clean(item.key || item.drugKey),
      tradeName:clean(item.tradeName),
      substance:clean(item.substance),
      strength:clean(item.strength),
      form:clean(item.form),
      atc:clean(item.atc),
      pdid:clean(item.pdid),
      qualityStatus:clean(item.qualityStatus) || 'verified',
    };
    const key = itemKey(normalized);
    if (!key || !normalized.substance) return null;
    normalized.key = normalized.key || key;
    normalized.drugKey = normalized.drugKey || normalized.key;
    return normalized;
  }

  function currentRows() {
    return Array.isArray(window.MEDINDEX_REGISTRY_ROWS) ? window.MEDINDEX_REGISTRY_ROWS : [];
  }

  function itemFromCanonical(row) {
    if (!row || typeof row !== 'object') return null;
    return normalizeStoredItem({
      drugId:row.__neonDrugId,
      drugKey:[row.PDID, row['Emri tregtar'], row['Fortësia']].map(clean).join('|'),
      tradeName:row['Emri tregtar'],
      substance:row['Substanca aktive'],
      strength:row['Fortësia'],
      form:row['Forma farmaceutike'],
      atc:row['ATC Code'],
      pdid:row.PDID,
      qualityStatus:row.__qualityStatus,
    });
  }

  function rowItem(rowElement) {
    const id = clean(rowElement?.dataset?.desktopLiteRow);
    if (!id) return null;
    const canonical = currentRows().find(row => clean(row?.__neonDrugId) === id);
    return itemFromCanonical(canonical);
  }

  function persist() {
    try {
      sessionStorage.setItem(SELECTION_KEY, JSON.stringify([...selected.values()]));
    } catch {}
    syncCount();
  }

  function restore() {
    try {
      const items = JSON.parse(sessionStorage.getItem(SELECTION_KEY) || '[]');
      if (!Array.isArray(items)) return;
      items.map(normalizeStoredItem).filter(Boolean).forEach(item => selected.set(itemKey(item), item));
    } catch {}
  }

  function syncCount() {
    const count = document.getElementById('selectedCount');
    if (count) count.textContent = String(selected.size);
  }

  function syncVisibleChecks() {
    if (!active()) return;
    const rows = [...document.querySelectorAll('#tbody > tr[data-desktop-lite-row]')];
    let checked = 0;
    rows.forEach(row => {
      const input = row.querySelector('input.drug-select');
      if (!input) return;
      const item = rowItem(row);
      const isChecked = Boolean(item && selected.has(itemKey(item)));
      input.checked = isChecked;
      if (isChecked) checked += 1;
    });
    const all = document.querySelector('#headerRow [data-desktop-lite-select-all]');
    if (all) {
      all.checked = rows.length > 0 && checked === rows.length;
      all.indeterminate = checked > 0 && checked < rows.length;
    }
    syncCount();
  }

  function selectVisible(checked) {
    document.querySelectorAll('#tbody > tr[data-desktop-lite-row]').forEach(row => {
      const item = rowItem(row);
      if (!item) return;
      const key = itemKey(item);
      if (checked) selected.set(key, item);
      else selected.delete(key);
    });
    persist();
    syncVisibleChecks();
  }

  function onChange(event) {
    if (!active()) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    if (target.matches('#tbody input.drug-select')) {
      const row = target.closest('tr[data-desktop-lite-row]');
      const item = rowItem(row);
      if (!item) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const key = itemKey(item);
      if (target.checked) selected.set(key, item);
      else selected.delete(key);
      persist();
      queueMicrotask(syncVisibleChecks);
      return;
    }

    if (target.matches('#headerRow [data-desktop-lite-select-all]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      selectVisible(Boolean(target.checked));
    }
  }

  function openPrescription(event) {
    if (!active()) return;
    const button = event.target.closest?.('#protocolsBtn,[data-nav="protocols"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    persist();
    window.location.href = 'recetat.html';
  }

  function scheduleSync() {
    queueMicrotask(() => requestAnimationFrame(syncVisibleChecks));
  }

  function init() {
    restore();
    document.addEventListener('change', onChange, true);
    document.addEventListener('click', openPrescription, true);
    ['medindex:registry-page-ready', 'medindex:desktop-lite-ready', 'medindex:registry-table-stable']
      .forEach(name => window.addEventListener(name, scheduleSync));
    window.addEventListener('medindex:full-registry-started', () => {
      enabled = false;
    }, { once:true });
    syncCount();
    scheduleSync();
    document.documentElement.dataset.registryDesktopPrescriptionLite = VERSION;
  }

  window.MedIndexDesktopPrescriptionLite = Object.freeze({
    version:VERSION,
    selectedItems:() => [...selected.values()].map(item => ({ ...item })),
    selectedCount:() => selected.size,
    clear() {
      selected.clear();
      persist();
      syncVisibleChecks();
    },
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
