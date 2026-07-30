'use strict';

const MEDINDEX_STANDALONE_SPREADSHEET_ID = '1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo';
const MEDINDEX_STANDALONE_ENDPOINT = 'https://barnat-six.vercel.app/api/drive-sync';
const MEDINDEX_STANDALONE_SECRET_PROPERTY = 'MEDINDEX_DRIVE_SYNC_SECRET';
const MEDINDEX_STANDALONE_CURSOR_PROPERTY = 'MEDINDEX_STANDALONE_EDITOR_CURSOR';
const MEDINDEX_STANDALONE_INDEX_PROPERTY = 'MEDINDEX_STANDALONE_RECONCILE_INDEX';
const MEDINDEX_STANDALONE_STATUS_SHEET = 'NEON_SYNC';
const MEDINDEX_STANDALONE_STATE_SHEET = 'NEON_SYNC_STATE';
const MEDINDEX_STANDALONE_BATCH_SIZE = 75;

const MEDINDEX_STANDALONE_SOURCES = Object.freeze([
  { sheetName:'KARTELA_BARNAVE', headerRow:1, keyColumn:'Nr rendor', editorPull:true },
  { sheetName:'DOZA_TE_RRITUR', headerRow:1, keyColumn:'RegimenID', editorPull:false },
  { sheetName:'DOZA_PEDIATRIKE', headerRow:1, keyColumn:'RegimenID', editorPull:false },
]);

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('MedIndex Sync')
    .addItem('Aktivizo sinkronizimin', 'setupMedIndexCurrentSyncStandalone')
    .addItem('Kontrollo tani', 'medIndexStandaloneRunNow')
    .addItem('Shfaq statusin', 'medIndexStandaloneShowStatus')
    .addSeparator()
    .addItem('Ndalo sinkronizimin', 'disableMedIndexCurrentSyncStandalone')
    .addToUi();
}

function setupMedIndexCurrentSyncStandalone() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet || spreadsheet.getId() !== MEDINDEX_STANDALONE_SPREADSHEET_ID) {
    throw new Error('Ky setup duhet të ekzekutohet nga spreadsheet-i aktual i dozologjisë MedIndex.');
  }

  const properties = PropertiesService.getScriptProperties();
  let secret = String(properties.getProperty(MEDINDEX_STANDALONE_SECRET_PROPERTY) || '').trim();
  if (secret.length < 24) {
    const response = SpreadsheetApp.getUi().prompt(
      'MedIndex · Google Sheet ↔ Neon',
      'Ngjite çelësin privat të sinkronizimit. Ai ruhet vetëm te Script Properties.',
      SpreadsheetApp.getUi().ButtonSet.OK_CANCEL
    );
    if (response.getSelectedButton() !== SpreadsheetApp.getUi().Button.OK) return;
    secret = String(response.getResponseText() || '').trim();
    if (secret.length < 24) throw new Error('Çelësi privat duhet të ketë së paku 24 karaktere.');
  }

  properties.setProperties({
    [MEDINDEX_STANDALONE_SECRET_PROPERTY]:secret,
    [MEDINDEX_STANDALONE_CURSOR_PROPERTY]:properties.getProperty(MEDINDEX_STANDALONE_CURSOR_PROPERTY) || new Date().toISOString(),
    [MEDINDEX_STANDALONE_INDEX_PROPERTY]:'0',
  }, false);

  medIndexStandaloneRemoveTriggers_();
  medIndexStandaloneEnsureSheets_();
  medIndexStandaloneInitializeState_();

  ScriptApp.newTrigger('medIndexStandaloneOnEdit')
    .forSpreadsheet(MEDINDEX_STANDALONE_SPREADSHEET_ID)
    .onEdit()
    .create();
  ScriptApp.newTrigger('medIndexStandaloneReconcile')
    .timeBased()
    .everyMinutes(5)
    .create();
  ScriptApp.newTrigger('medIndexStandaloneEditorPull')
    .timeBased()
    .everyMinutes(1)
    .create();

  medIndexStandaloneEditorPull();
  medIndexStandaloneRecordStatus_(
    'SISTEMI',
    'AKTIV',
    'Sheet → Neon pas editimit dhe kontroll çdo 5 minuta; Neon/editor → Sheet çdo minutë.'
  );
  SpreadsheetApp.getUi().alert('Sinkronizimi dykahësh MedIndex u aktivizua me sukses.');
}

function disableMedIndexCurrentSyncStandalone() {
  medIndexStandaloneRemoveTriggers_();
  medIndexStandaloneRecordStatus_('SISTEMI', 'NDALUR', 'Trigger-at e sinkronizimit u hoqën.');
  SpreadsheetApp.getUi().alert('Sinkronizimi u ndal. Të dhënat nuk u fshinë.');
}

function medIndexStandaloneRunNow() {
  MEDINDEX_STANDALONE_SOURCES.forEach(source => medIndexStandaloneReconcileSource_(source));
  medIndexStandaloneEditorPull();
  SpreadsheetApp.getUi().alert('Kontrolli i plotë përfundoi. Shiko tab-in NEON_SYNC për rezultatet.');
}

function medIndexStandaloneShowStatus() {
  const spreadsheet = SpreadsheetApp.openById(MEDINDEX_STANDALONE_SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(MEDINDEX_STANDALONE_STATUS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('Ende nuk ka status të regjistruar.');
    return;
  }
  const row = sheet.getRange(sheet.getLastRow(), 1, 1, 4).getDisplayValues()[0];
  SpreadsheetApp.getUi().alert(`${row[1]} · ${row[2]}\n${row[3]}\n${row[0]}`);
}

function medIndexStandaloneRemoveTriggers_() {
  const handlers = new Set([
    'medIndexStandaloneOnEdit',
    'medIndexStandaloneReconcile',
    'medIndexStandaloneEditorPull',
  ]);
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlers.has(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  });
}

function medIndexStandaloneOnEdit(event) {
  if (!event || !event.range || !event.source) return;
  if (event.source.getId() !== MEDINDEX_STANDALONE_SPREADSHEET_ID) return;
  const source = MEDINDEX_STANDALONE_SOURCES.find(item => item.sheetName === event.range.getSheet().getName());
  if (!source) return;

  const firstRow = Math.max(event.range.getRow(), source.headerRow + 1);
  const lastRow = event.range.getLastRow();
  if (lastRow < firstRow) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return;
  try {
    const rows = medIndexStandaloneReadRows_(event.range.getSheet(), source, firstRow, lastRow - firstRow + 1);
    if (!rows.length) return;
    medIndexStandaloneSend_(source, rows, []);
    medIndexStandaloneUpsertState_(source, rows);
    medIndexStandaloneRecordStatus_(source.sheetName, 'OK', `${rows.length} rresht(a) u sinkronizuan pas editimit.`);
  } catch (error) {
    medIndexStandaloneRecordStatus_(source.sheetName, 'GABIM', error.message);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function medIndexStandaloneReconcile() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const properties = PropertiesService.getScriptProperties();
    const index = Number(properties.getProperty(MEDINDEX_STANDALONE_INDEX_PROPERTY) || 0)
      % MEDINDEX_STANDALONE_SOURCES.length;
    medIndexStandaloneReconcileSource_(MEDINDEX_STANDALONE_SOURCES[index]);
    properties.setProperty(
      MEDINDEX_STANDALONE_INDEX_PROPERTY,
      String((index + 1) % MEDINDEX_STANDALONE_SOURCES.length)
    );
  } catch (error) {
    medIndexStandaloneRecordStatus_('RECONCILE', 'GABIM', error.message);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function medIndexStandaloneReconcileSource_(source) {
  const spreadsheet = SpreadsheetApp.openById(MEDINDEX_STANDALONE_SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(source.sheetName);
  if (!sheet) throw new Error(`Mungon tab-i ${source.sheetName}.`);

  const rows = medIndexStandaloneReadRows_(
    sheet,
    source,
    source.headerRow + 1,
    Math.max(0, sheet.getLastRow() - source.headerRow)
  );
  const previous = medIndexStandaloneReadState_(source);
  const current = new Map(rows.map(row => [row.rowKey, row]));
  const changed = rows.filter(row => previous.get(row.rowKey)?.sourceHash !== row.sourceHash);
  const deletedKeys = [...previous.keys()].filter(key => !current.has(key));

  for (let index = 0; index < changed.length; index += MEDINDEX_STANDALONE_BATCH_SIZE) {
    medIndexStandaloneSend_(source, changed.slice(index, index + MEDINDEX_STANDALONE_BATCH_SIZE), []);
  }
  for (let index = 0; index < deletedKeys.length; index += 200) {
    medIndexStandaloneSend_(source, [], deletedKeys.slice(index, index + 200));
  }

  medIndexStandaloneReplaceState_(source, rows);
  medIndexStandaloneRecordStatus_(
    source.sheetName,
    'OK',
    `${changed.length} ndryshime; ${deletedKeys.length} rreshta të arkivuar; ${rows.length} rreshta të kontrolluar.`
  );
}

function medIndexStandaloneEditorPull() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const source = MEDINDEX_STANDALONE_SOURCES.find(item => item.editorPull);
    const properties = PropertiesService.getScriptProperties();
    const secret = String(properties.getProperty(MEDINDEX_STANDALONE_SECRET_PROPERTY) || '').trim();
    if (secret.length < 24) throw new Error('Çelësi privat i sinkronizimit nuk është konfiguruar.');
    const cursor = properties.getProperty(MEDINDEX_STANDALONE_CURSOR_PROPERTY)
      || new Date(Date.now() - 60000).toISOString();

    const response = UrlFetchApp.fetch(MEDINDEX_STANDALONE_ENDPOINT, {
      method:'post',
      contentType:'application/json; charset=utf-8',
      headers:{ 'X-MedIndex-Sync-Secret':secret },
      payload:JSON.stringify({
        action:'pull_editor_updates',
        spreadsheetId:MEDINDEX_STANDALONE_SPREADSHEET_ID,
        sheetName:source.sheetName,
        cursor,
      }),
      muteHttpExceptions:true,
      followRedirects:true,
    });

    const status = response.getResponseCode();
    const text = response.getContentText();
    if (status < 200 || status >= 300) throw new Error(`Editor pull ${status}: ${text.slice(0, 500)}`);
    const payload = JSON.parse(text || '{}');
    if (!payload.ok) throw new Error(payload.error || 'Neon nuk e konfirmoi editor pull.');

    const updates = Array.isArray(payload.updates) ? payload.updates : [];
    if (updates.length) medIndexStandaloneApplyEditorUpdates_(source, updates);
    properties.setProperty(MEDINDEX_STANDALONE_CURSOR_PROPERTY, payload.nextCursor || cursor);
    if (updates.length) {
      medIndexStandaloneRecordStatus_(source.sheetName, 'OK', `${updates.length} ndryshim(e) nga editori u shkruan në Sheet.`);
    }
  } catch (error) {
    medIndexStandaloneRecordStatus_('EDITORI LIVE', 'GABIM', error.message);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function medIndexStandaloneApplyEditorUpdates_(source, updates) {
  const spreadsheet = SpreadsheetApp.openById(MEDINDEX_STANDALONE_SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(source.sheetName);
  if (!sheet) throw new Error(`Mungon tab-i ${source.sheetName}.`);

  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(source.headerRow, 1, 1, lastColumn).getDisplayValues()[0]
    .map(value => String(value || '').trim());
  const keyIndex = headers.indexOf(source.keyColumn);
  if (keyIndex < 0) throw new Error(`Mungon kolona ${source.keyColumn} te ${source.sheetName}.`);

  const firstDataRow = source.headerRow + 1;
  const rowCount = Math.max(0, sheet.getLastRow() - source.headerRow);
  const keys = rowCount
    ? sheet.getRange(firstDataRow, keyIndex + 1, rowCount, 1).getDisplayValues().flat()
    : [];
  const rowByKey = new Map(
    keys.map((value, index) => [String(value || '').trim(), firstDataRow + index]).filter(item => item[0])
  );
  const touchedRows = [];

  updates.forEach(update => {
    const rowKey = String(update.rowKey || '').trim();
    const rowNumber = rowByKey.get(rowKey);
    if (!rowNumber || !update.values || typeof update.values !== 'object') return;
    Object.entries(update.values).forEach(([header, value]) => {
      const columnIndex = headers.indexOf(header);
      if (columnIndex < 0 || columnIndex === keyIndex) return;
      sheet.getRange(rowNumber, columnIndex + 1).setValue(value ?? '');
    });
    touchedRows.push(rowNumber);
  });

  const uniqueRows = [...new Set(touchedRows)];
  if (!uniqueRows.length) return;
  SpreadsheetApp.flush();
  const stateRows = uniqueRows.flatMap(row => medIndexStandaloneReadRows_(sheet, source, row, 1));
  medIndexStandaloneUpsertState_(source, stateRows);
}

function medIndexStandaloneSend_(source, rows, deletedKeys) {
  const secret = String(
    PropertiesService.getScriptProperties().getProperty(MEDINDEX_STANDALONE_SECRET_PROPERTY) || ''
  ).trim();
  if (secret.length < 24) throw new Error('Çelësi privat i sinkronizimit nuk është konfiguruar.');

  const response = UrlFetchApp.fetch(MEDINDEX_STANDALONE_ENDPOINT, {
    method:'post',
    contentType:'application/json; charset=utf-8',
    headers:{ 'X-MedIndex-Sync-Secret':secret },
    payload:JSON.stringify({
      spreadsheetId:MEDINDEX_STANDALONE_SPREADSHEET_ID,
      sheetName:source.sheetName,
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

function medIndexStandaloneReadRows_(sheet, source, startRow, rowCount) {
  if (rowCount <= 0) return [];
  const lastColumn = sheet.getLastColumn();
  if (lastColumn <= 0) return [];
  const headers = sheet.getRange(source.headerRow, 1, 1, lastColumn).getDisplayValues()[0]
    .map(value => String(value || '').trim());
  const keyIndex = headers.indexOf(source.keyColumn);
  if (keyIndex < 0) throw new Error(`Mungon kolona ${source.keyColumn} te ${source.sheetName}.`);

  return sheet.getRange(startRow, 1, rowCount, lastColumn).getDisplayValues().flatMap((cells, offset) => {
    const values = {};
    headers.forEach((header, index) => { if (header) values[header] = cells[index] || ''; });
    const rowKey = String(cells[keyIndex] || '').trim();
    if (!rowKey) return [];
    return [{
      rowKey,
      rowNumber:startRow + offset,
      values,
      sourceHash:medIndexStandaloneHash_(values),
      editedAt:new Date().toISOString(),
    }];
  });
}

function medIndexStandaloneHash_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(value),
    Utilities.Charset.UTF_8
  );
  return bytes.map(byte => (`0${((byte + 256) % 256).toString(16)}`).slice(-2)).join('');
}

function medIndexStandaloneEnsureSheets_() {
  const spreadsheet = SpreadsheetApp.openById(MEDINDEX_STANDALONE_SPREADSHEET_ID);
  let status = spreadsheet.getSheetByName(MEDINDEX_STANDALONE_STATUS_SHEET);
  if (!status) status = spreadsheet.insertSheet(MEDINDEX_STANDALONE_STATUS_SHEET);
  if (status.getLastRow() === 0) {
    status.getRange(1, 1, 1, 4).setValues([['Koha', 'Burimi', 'Statusi', 'Detajet']]);
    status.setFrozenRows(1);
  }

  let state = spreadsheet.getSheetByName(MEDINDEX_STANDALONE_STATE_SHEET);
  if (!state) state = spreadsheet.insertSheet(MEDINDEX_STANDALONE_STATE_SHEET);
  if (state.getLastRow() === 0) {
    state.getRange(1, 1, 1, 6).setValues([['Spreadsheet ID', 'Tab-i', 'Row key', 'Hash', 'Rreshti', 'Përditësuar']]);
    state.setFrozenRows(1);
  }
  state.hideSheet();
  return { status, state };
}

function medIndexStandaloneInitializeState_() {
  const spreadsheet = SpreadsheetApp.openById(MEDINDEX_STANDALONE_SPREADSHEET_ID);
  MEDINDEX_STANDALONE_SOURCES.forEach(source => {
    const sheet = spreadsheet.getSheetByName(source.sheetName);
    if (!sheet) throw new Error(`Mungon tab-i ${source.sheetName}.`);
    const rows = medIndexStandaloneReadRows_(
      sheet,
      source,
      source.headerRow + 1,
      Math.max(0, sheet.getLastRow() - source.headerRow)
    );
    medIndexStandaloneReplaceState_(source, rows);
  });
}

function medIndexStandaloneReadState_(source) {
  const state = medIndexStandaloneEnsureSheets_().state;
  if (state.getLastRow() < 2) return new Map();
  return new Map(
    state.getRange(2, 1, state.getLastRow() - 1, 6).getDisplayValues()
      .filter(row => row[0] === MEDINDEX_STANDALONE_SPREADSHEET_ID && row[1] === source.sheetName)
      .map(row => [row[2], { sourceHash:row[3], rowNumber:Number(row[4]) || null }])
  );
}

function medIndexStandaloneReplaceState_(source, rows) {
  const state = medIndexStandaloneEnsureSheets_().state;
  const existing = state.getLastRow() > 1
    ? state.getRange(2, 1, state.getLastRow() - 1, 6).getValues()
    : [];
  const keep = existing.filter(row =>
    row[0] !== MEDINDEX_STANDALONE_SPREADSHEET_ID || row[1] !== source.sheetName
  );
  const next = rows.map(row => [
    MEDINDEX_STANDALONE_SPREADSHEET_ID,
    source.sheetName,
    row.rowKey,
    row.sourceHash,
    row.rowNumber,
    new Date(),
  ]);
  const combined = keep.concat(next);
  if (state.getLastRow() > 1) state.getRange(2, 1, state.getLastRow() - 1, 6).clearContent();
  if (combined.length) state.getRange(2, 1, combined.length, 6).setValues(combined);
}

function medIndexStandaloneUpsertState_(source, rows) {
  const current = medIndexStandaloneReadState_(source);
  rows.forEach(row => current.set(row.rowKey, row));
  medIndexStandaloneReplaceState_(
    source,
    [...current.entries()].map(([rowKey, value]) => ({
      rowKey,
      sourceHash:value.sourceHash,
      rowNumber:value.rowNumber,
    }))
  );
}

function medIndexStandaloneRecordStatus_(source, status, details) {
  try {
    const sheet = medIndexStandaloneEnsureSheets_().status;
    sheet.appendRow([new Date(), source, status, String(details || '').slice(0, 1000)]);
    if (sheet.getLastRow() > 500) sheet.deleteRows(2, sheet.getLastRow() - 500);
  } catch (error) {
    console.error(`MedIndex status log failed: ${error.message}`);
  }
}
