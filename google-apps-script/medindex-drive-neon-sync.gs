const MEDINDEX_SYNC_ENDPOINT_DEFAULT = 'https://barnat-six.vercel.app/api/drive-sync';
const MEDINDEX_MASTER_SPREADSHEET_ID = '17cuXg5qORIIWkvAxLZ7uz2FMmGvzwjr850cubUcIgLE';
const MEDINDEX_STATUS_SHEET = 'NEON_SYNC';
const MEDINDEX_STATE_SHEET = 'NEON_SYNC_STATE';
const MEDINDEX_BATCH_SIZE = 75;

const MEDINDEX_DRIVE_SOURCES = Object.freeze([
  { spreadsheetId:'1oF_92zOmTEeXyXh7daaK9onq9fZbQBlWmeU9K0ptn4U', sheetName:'Sheet1', headerRow:2, keyColumn:'Nr rendor' },
  { spreadsheetId:'17cuXg5qORIIWkvAxLZ7uz2FMmGvzwjr850cubUcIgLE', sheetName:'KARTELA_BARNAVE', headerRow:1, keyColumn:'Nr rendor' },
  { spreadsheetId:'17cuXg5qORIIWkvAxLZ7uz2FMmGvzwjr850cubUcIgLE', sheetName:'DOZA_TE_RRITUR', headerRow:1, keyColumn:'RegimenID' },
  { spreadsheetId:'17cuXg5qORIIWkvAxLZ7uz2FMmGvzwjr850cubUcIgLE', sheetName:'DOZA_PEDIATRIKE', headerRow:1, keyColumn:'RegimenID' },
  { spreadsheetId:'19ncbnrTJ_w-WQ0msWO9_dUoxjmicSUAz6Nt4sh20gFw', sheetName:'Të gjitha kodet', headerRow:5, keyColumn:'Kodi ICD-10' },
  { spreadsheetId:'1sGEWsDYnVE1VThLUpfSs2Q0UIjXZZRzxXTHXDvn7p8I', sheetName:'Analizat', headerRow:4, keyColumn:'Emri në formular' },
]);

function setupMedIndexDriveSync() {
  const ui = SpreadsheetApp.getUi();
  const properties = PropertiesService.getScriptProperties();
  let secret = String(properties.getProperty('MEDINDEX_DRIVE_SYNC_SECRET') || '').trim();

  if (secret.length < 24) {
    const response = ui.prompt(
      'MedIndex · Google Sheet ↔ Neon',
      'Ngjite çelësin privat vetëm këtë herë. Ai ruhet te Script Properties dhe nuk vendoset në Vercel.',
      ui.ButtonSet.OK_CANCEL
    );
    if (response.getSelectedButton() !== ui.Button.OK) return;
    secret = String(response.getResponseText() || '').trim();
    if (secret.length < 24) throw new Error('Çelësi privat duhet të ketë së paku 24 karaktere.');
  }

  properties.setProperties({
    MEDINDEX_DRIVE_SYNC_SECRET:secret,
    MEDINDEX_DRIVE_SYNC_ENDPOINT:MEDINDEX_SYNC_ENDPOINT_DEFAULT,
    MEDINDEX_NEXT_SOURCE_INDEX:'0',
  }, false);

  removeMedIndexTriggers_();
  [...new Set(MEDINDEX_DRIVE_SOURCES.map(source => source.spreadsheetId))].forEach(spreadsheetId => {
    ScriptApp.newTrigger('medIndexDriveOnEdit').forSpreadsheet(spreadsheetId).onEdit().create();
  });
  ScriptApp.newTrigger('medIndexDriveReconcile').timeBased().everyMinutes(5).create();

  ensureMedIndexSheets_();
  initializeMedIndexState_();
  setupMedIndexBidirectionalSync();
  recordMedIndexStatus_('SISTEMI', 'AKTIV', 'Google Sheet → Neon sinkronizohet pas editimit; Neon → Google Sheet kontrollohet çdo minutë.');
  ui.alert('Sinkronizimi dykahësh Google Sheet ↔ Neon u aktivizua.');
}

function disableMedIndexDriveSync() {
  removeMedIndexTriggers_();
  recordMedIndexStatus_('SISTEMI', 'NDALUR', 'Të gjithë trigger-at e sinkronizimit u hoqën.');
}

function removeMedIndexTriggers_() {
  const handlers = new Set(['medIndexDriveOnEdit', 'medIndexDriveReconcile', 'medIndexEditorPull']);
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlers.has(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  });
}

function medIndexDriveOnEdit(event) {
  if (!event || !event.range || !event.source) return;
  const config = findMedIndexSource_(event.source.getId(), event.range.getSheet().getName());
  if (!config) return;

  const firstRow = Math.max(event.range.getRow(), config.headerRow + 1);
  const lastRow = event.range.getLastRow();
  if (lastRow < firstRow) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return;
  try {
    const rows = readMedIndexRows_(event.range.getSheet(), config, firstRow, lastRow - firstRow + 1);
    if (!rows.length) return;
    sendMedIndexChanges_(config, rows, []);
    upsertMedIndexState_(config, rows);
    recordMedIndexStatus_(config.sheetName, 'OK', `${rows.length} rresht(a) u sinkronizuan pas editimit.`);
  } catch (error) {
    recordMedIndexStatus_(config.sheetName, 'GABIM', error.message);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function medIndexDriveReconcile() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const properties = PropertiesService.getScriptProperties();
    const currentIndex = Number(properties.getProperty('MEDINDEX_NEXT_SOURCE_INDEX') || 0) % MEDINDEX_DRIVE_SOURCES.length;
    const config = MEDINDEX_DRIVE_SOURCES[currentIndex];
    reconcileMedIndexSource_(config);
    properties.setProperty('MEDINDEX_NEXT_SOURCE_INDEX', String((currentIndex + 1) % MEDINDEX_DRIVE_SOURCES.length));
  } catch (error) {
    recordMedIndexStatus_('RECONCILE', 'GABIM', error.message);
  } finally {
    lock.releaseLock();
  }
}

function reconcileMedIndexSource_(config) {
  const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  const sheet = spreadsheet.getSheetByName(config.sheetName);
  if (!sheet) throw new Error(`Mungon tab-i ${config.sheetName}.`);

  const currentRows = readMedIndexRows_(sheet, config, config.headerRow + 1, Math.max(0, sheet.getLastRow() - config.headerRow));
  const previous = readMedIndexState_(config);
  const current = new Map(currentRows.map(row => [row.rowKey, row]));
  const changed = currentRows.filter(row => previous.get(row.rowKey)?.sourceHash !== row.sourceHash);
  const deletedKeys = [...previous.keys()].filter(key => !current.has(key));

  for (let index = 0; index < changed.length; index += MEDINDEX_BATCH_SIZE) {
    sendMedIndexChanges_(config, changed.slice(index, index + MEDINDEX_BATCH_SIZE), []);
  }
  for (let index = 0; index < deletedKeys.length; index += 200) {
    sendMedIndexChanges_(config, [], deletedKeys.slice(index, index + 200));
  }

  replaceMedIndexState_(config, currentRows);
  if (changed.length || deletedKeys.length) {
    recordMedIndexStatus_(config.sheetName, 'OK', `${changed.length} ndryshime; ${deletedKeys.length} rreshta të arkivuar.`);
  }
}

function initializeMedIndexState_() {
  MEDINDEX_DRIVE_SOURCES.forEach(config => {
    const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    const sheet = spreadsheet.getSheetByName(config.sheetName);
    if (!sheet) throw new Error(`Mungon tab-i ${config.sheetName}.`);
    const rows = readMedIndexRows_(sheet, config, config.headerRow + 1, Math.max(0, sheet.getLastRow() - config.headerRow));
    replaceMedIndexState_(config, rows);
  });
}

function readMedIndexRows_(sheet, config, startRow, rowCount) {
  if (rowCount <= 0) return [];
  const lastColumn = sheet.getLastColumn();
  if (lastColumn <= 0) return [];

  const headers = sheet.getRange(config.headerRow, 1, 1, lastColumn).getDisplayValues()[0]
    .map(value => String(value || '').trim());
  const keyIndex = headers.indexOf(config.keyColumn);
  if (keyIndex < 0) throw new Error(`Mungon kolona ${config.keyColumn} te ${config.sheetName}.`);

  return sheet.getRange(startRow, 1, rowCount, lastColumn).getDisplayValues().flatMap((cells, offset) => {
    const values = {};
    headers.forEach((header, index) => { if (header) values[header] = cells[index] || ''; });
    const rowKey = String(cells[keyIndex] || '').trim();
    if (!rowKey) return [];
    return [{
      rowKey,
      rowNumber:startRow + offset,
      values,
      sourceHash:medIndexHash_(values),
      editedAt:new Date().toISOString(),
    }];
  });
}

function sendMedIndexChanges_(config, rows, deletedKeys) {
  const properties = PropertiesService.getScriptProperties();
  const endpoint = properties.getProperty('MEDINDEX_DRIVE_SYNC_ENDPOINT') || MEDINDEX_SYNC_ENDPOINT_DEFAULT;
  const secret = properties.getProperty('MEDINDEX_DRIVE_SYNC_SECRET');
  if (!secret) throw new Error('MEDINDEX_DRIVE_SYNC_SECRET nuk është konfiguruar.');

  const response = UrlFetchApp.fetch(endpoint, {
    method:'post',
    contentType:'application/json; charset=utf-8',
    headers:{ 'X-MedIndex-Sync-Secret':secret },
    payload:JSON.stringify({
      spreadsheetId:config.spreadsheetId,
      sheetName:config.sheetName,
      rows:rows || [],
      deletedKeys:deletedKeys || [],
    }),
    muteHttpExceptions:true,
    followRedirects:true,
  });

  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status < 200 || status >= 300) throw new Error(`Neon sync ${status}: ${text.slice(0, 500)}`);
  const payload = JSON.parse(text || '{}');
  if (!payload.ok) throw new Error(payload.error || 'Sinkronizimi nuk u konfirmua.');
  return payload;
}

function findMedIndexSource_(spreadsheetId, sheetName) {
  return MEDINDEX_DRIVE_SOURCES.find(source => source.spreadsheetId === spreadsheetId && source.sheetName === sheetName) || null;
}

function medIndexHash_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(value),
    Utilities.Charset.UTF_8
  );
  return bytes.map(byte => (`0${((byte + 256) % 256).toString(16)}`).slice(-2)).join('');
}

function ensureMedIndexSheets_() {
  const spreadsheet = SpreadsheetApp.openById(MEDINDEX_MASTER_SPREADSHEET_ID);
  let status = spreadsheet.getSheetByName(MEDINDEX_STATUS_SHEET);
  if (!status) status = spreadsheet.insertSheet(MEDINDEX_STATUS_SHEET);
  if (status.getLastRow() === 0) {
    status.getRange(1, 1, 1, 4).setValues([['Koha', 'Burimi', 'Statusi', 'Detajet']]);
    status.setFrozenRows(1);
  }

  let state = spreadsheet.getSheetByName(MEDINDEX_STATE_SHEET);
  if (!state) state = spreadsheet.insertSheet(MEDINDEX_STATE_SHEET);
  if (state.getLastRow() === 0) {
    state.getRange(1, 1, 1, 6).setValues([['Spreadsheet ID', 'Tab-i', 'Row key', 'Hash', 'Rreshti', 'Përditësuar']]);
    state.setFrozenRows(1);
  }
  state.hideSheet();
  return { status, state };
}

function readMedIndexState_(config) {
  const state = ensureMedIndexSheets_().state;
  if (state.getLastRow() < 2) return new Map();
  const rows = state.getRange(2, 1, state.getLastRow() - 1, 6).getDisplayValues();
  return new Map(rows
    .filter(row => row[0] === config.spreadsheetId && row[1] === config.sheetName)
    .map(row => [row[2], { sourceHash:row[3], rowNumber:Number(row[4]) || null }]));
}

function replaceMedIndexState_(config, rows) {
  const state = ensureMedIndexSheets_().state;
  const existing = state.getLastRow() > 1
    ? state.getRange(2, 1, state.getLastRow() - 1, 6).getValues()
    : [];
  const keep = existing.filter(row => row[0] !== config.spreadsheetId || row[1] !== config.sheetName);
  const next = rows.map(row => [config.spreadsheetId, config.sheetName, row.rowKey, row.sourceHash, row.rowNumber, new Date()]);
  const combined = keep.concat(next);
  if (state.getLastRow() > 1) state.getRange(2, 1, state.getLastRow() - 1, 6).clearContent();
  if (combined.length) state.getRange(2, 1, combined.length, 6).setValues(combined);
  const excess = state.getMaxRows() - Math.max(2, combined.length + 1);
  if (excess > 500) state.deleteRows(combined.length + 2, excess);
}

function upsertMedIndexState_(config, rows) {
  const current = readMedIndexState_(config);
  rows.forEach(row => current.set(row.rowKey, row));
  replaceMedIndexState_(config, [...current.entries()].map(([rowKey, value]) => ({
    rowKey,
    sourceHash:value.sourceHash,
    rowNumber:value.rowNumber,
  })));
}

function recordMedIndexStatus_(source, status, details) {
  try {
    const sheet = ensureMedIndexSheets_().status;
    sheet.appendRow([new Date(), source, status, String(details || '').slice(0, 1000)]);
    if (sheet.getLastRow() > 500) sheet.deleteRows(2, sheet.getLastRow() - 500);
  } catch (error) {
    console.error(`Status log failed: ${error.message}`);
  }
}
