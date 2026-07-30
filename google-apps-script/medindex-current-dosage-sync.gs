'use strict';

const MEDINDEX_CURRENT_DOSAGE_SPREADSHEET_ID = '1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo';
const MEDINDEX_CURRENT_STATE_SHEET = 'NEON_SYNC_STATE_CURRENT';
const MEDINDEX_CURRENT_STATUS_SHEET = 'NEON_SYNC_CURRENT';
const MEDINDEX_CURRENT_RECONCILE_INDEX = 'MEDINDEX_CURRENT_RECONCILE_INDEX';
const MEDINDEX_CURRENT_EDITOR_CURSOR = 'MEDINDEX_CURRENT_EDITOR_CURSOR';
const MEDINDEX_CURRENT_BATCH_SIZE = 100;

const MEDINDEX_CURRENT_DOSAGE_SOURCES = Object.freeze([
  { spreadsheetId:MEDINDEX_CURRENT_DOSAGE_SPREADSHEET_ID, sheetName:'KARTELA_BARNAVE', headerRow:1, keyColumn:'Nr rendor' },
  { spreadsheetId:MEDINDEX_CURRENT_DOSAGE_SPREADSHEET_ID, sheetName:'DOZA_TE_RRITUR', headerRow:1, keyColumn:'RegimenID' },
  { spreadsheetId:MEDINDEX_CURRENT_DOSAGE_SPREADSHEET_ID, sheetName:'DOZA_PEDIATRIKE', headerRow:1, keyColumn:'RegimenID' },
]);

function setupMedIndexCurrentDosageBidirectionalSync() {
  const properties = PropertiesService.getScriptProperties();
  const secret = String(properties.getProperty('MEDINDEX_DRIVE_SYNC_SECRET') || '').trim();
  if (secret.length < 24) {
    throw new Error('Aktivizo së pari setupMedIndexDriveSync që çelësi privat të ruhet te Script Properties.');
  }

  removeMedIndexCurrentDosageTriggers_();
  properties.setProperties({
    MEDINDEX_CURRENT_RECONCILE_INDEX:'0',
    MEDINDEX_CURRENT_EDITOR_CURSOR:properties.getProperty(MEDINDEX_CURRENT_EDITOR_CURSOR) || new Date().toISOString(),
  }, false);

  ScriptApp.newTrigger('medIndexCurrentDosageOnEdit')
    .forSpreadsheet(MEDINDEX_CURRENT_DOSAGE_SPREADSHEET_ID)
    .onEdit()
    .create();
  ScriptApp.newTrigger('medIndexCurrentDosageReconcile')
    .timeBased()
    .everyMinutes(5)
    .create();
  ScriptApp.newTrigger('medIndexCurrentDosageEditorPull')
    .timeBased()
    .everyMinutes(1)
    .create();

  ensureMedIndexCurrentSheets_();
  medIndexCurrentDosageReconcile();
  medIndexCurrentDosageEditorPull();
  recordMedIndexCurrentStatus_('SISTEMI', 'AKTIV', 'Sheet → Neon pas editimit dhe çdo 5 minuta; editori Neon → Sheet çdo minutë.');
  SpreadsheetApp.getUi().alert('Sinkronizimi dykahësh i spreadsheet-it aktual u aktivizua.');
}

function disableMedIndexCurrentDosageBidirectionalSync() {
  removeMedIndexCurrentDosageTriggers_();
  recordMedIndexCurrentStatus_('SISTEMI', 'NDALUR', 'Trigger-at e spreadsheet-it aktual u hoqën.');
}

function removeMedIndexCurrentDosageTriggers_() {
  const handlers = new Set([
    'medIndexCurrentDosageOnEdit',
    'medIndexCurrentDosageReconcile',
    'medIndexCurrentDosageEditorPull',
  ]);
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlers.has(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  });
}

function medIndexCurrentDosageOnEdit(event) {
  if (!event?.range || !event?.source) return;
  const config = MEDINDEX_CURRENT_DOSAGE_SOURCES.find(source =>
    source.spreadsheetId === event.source.getId()
      && source.sheetName === event.range.getSheet().getName()
  );
  if (!config) return;

  const firstRow = Math.max(event.range.getRow(), config.headerRow + 1);
  const lastRow = event.range.getLastRow();
  if (lastRow < firstRow) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return;
  try {
    const rows = readMedIndexCurrentRows_(event.range.getSheet(), config, firstRow, lastRow - firstRow + 1);
    if (!rows.length) return;
    sendMedIndexChanges_(config, rows, []);
    upsertMedIndexCurrentState_(config, rows);
    recordMedIndexCurrentStatus_(config.sheetName, 'OK', `${rows.length} rresht(a) u sinkronizuan pas editimit.`);
  } catch (error) {
    recordMedIndexCurrentStatus_(config.sheetName, 'GABIM', error.message);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function medIndexCurrentDosageReconcile() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const properties = PropertiesService.getScriptProperties();
    const index = Number(properties.getProperty(MEDINDEX_CURRENT_RECONCILE_INDEX) || 0)
      % MEDINDEX_CURRENT_DOSAGE_SOURCES.length;
    reconcileMedIndexCurrentSource_(MEDINDEX_CURRENT_DOSAGE_SOURCES[index]);
    properties.setProperty(MEDINDEX_CURRENT_RECONCILE_INDEX, String((index + 1) % MEDINDEX_CURRENT_DOSAGE_SOURCES.length));
  } catch (error) {
    recordMedIndexCurrentStatus_('RECONCILE', 'GABIM', error.message);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function reconcileMedIndexCurrentSource_(config) {
  const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  const sheet = spreadsheet.getSheetByName(config.sheetName);
  if (!sheet) throw new Error(`Mungon tab-i ${config.sheetName}.`);

  const currentRows = readMedIndexCurrentRows_(
    sheet,
    config,
    config.headerRow + 1,
    Math.max(0, sheet.getLastRow() - config.headerRow)
  );
  const previous = readMedIndexCurrentState_(config);
  const current = new Map(currentRows.map(row => [row.rowKey, row]));
  const changed = currentRows.filter(row => previous.get(row.rowKey)?.sourceHash !== row.sourceHash);
  const deletedKeys = [...previous.keys()].filter(key => !current.has(key));

  for (let index = 0; index < changed.length; index += MEDINDEX_CURRENT_BATCH_SIZE) {
    sendMedIndexChanges_(config, changed.slice(index, index + MEDINDEX_CURRENT_BATCH_SIZE), []);
  }
  for (let index = 0; index < deletedKeys.length; index += 200) {
    sendMedIndexChanges_(config, [], deletedKeys.slice(index, index + 200));
  }

  replaceMedIndexCurrentState_(config, currentRows);
  recordMedIndexCurrentStatus_(
    config.sheetName,
    'OK',
    `${changed.length} ndryshime; ${deletedKeys.length} rreshta të arkivuar; ${currentRows.length} rreshta të kontrolluar.`
  );
}

function medIndexCurrentDosageEditorPull() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const config = MEDINDEX_CURRENT_DOSAGE_SOURCES[0];
    const properties = PropertiesService.getScriptProperties();
    const endpoint = properties.getProperty('MEDINDEX_DRIVE_SYNC_ENDPOINT') || MEDINDEX_SYNC_ENDPOINT_DEFAULT;
    const secret = properties.getProperty('MEDINDEX_DRIVE_SYNC_SECRET');
    if (!secret) throw new Error('MEDINDEX_DRIVE_SYNC_SECRET nuk është konfiguruar.');
    const cursor = properties.getProperty(MEDINDEX_CURRENT_EDITOR_CURSOR)
      || new Date(Date.now() - 60000).toISOString();

    const response = UrlFetchApp.fetch(endpoint, {
      method:'post',
      contentType:'application/json; charset=utf-8',
      headers:{ 'X-MedIndex-Sync-Secret':secret },
      payload:JSON.stringify({
        action:'pull_editor_updates',
        spreadsheetId:config.spreadsheetId,
        sheetName:config.sheetName,
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
    if (updates.length) applyMedIndexCurrentEditorUpdates_(config, updates);
    properties.setProperty(MEDINDEX_CURRENT_EDITOR_CURSOR, payload.nextCursor || cursor);
    if (updates.length) {
      recordMedIndexCurrentStatus_(config.sheetName, 'OK', `${updates.length} ndryshim(e) nga editori u shkruan në Sheet.`);
    }
  } catch (error) {
    recordMedIndexCurrentStatus_('EDITORI LIVE', 'GABIM', error.message);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function applyMedIndexCurrentEditorUpdates_(config, updates) {
  const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  const sheet = spreadsheet.getSheetByName(config.sheetName);
  if (!sheet) throw new Error(`Mungon tab-i ${config.sheetName}.`);

  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(config.headerRow, 1, 1, lastColumn).getDisplayValues()[0]
    .map(value => String(value || '').trim());
  const keyIndex = headers.indexOf(config.keyColumn);
  if (keyIndex < 0) throw new Error(`Mungon kolona ${config.keyColumn} te ${config.sheetName}.`);

  const firstDataRow = config.headerRow + 1;
  const rowCount = Math.max(0, sheet.getLastRow() - config.headerRow);
  const keys = rowCount
    ? sheet.getRange(firstDataRow, keyIndex + 1, rowCount, 1).getDisplayValues().flat()
    : [];
  const rowByKey = new Map(
    keys.map((value, index) => [String(value || '').trim(), firstDataRow + index]).filter(entry => entry[0])
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
  const stateRows = uniqueRows.flatMap(row => readMedIndexCurrentRows_(sheet, config, row, 1));
  upsertMedIndexCurrentState_(config, stateRows);
}

function readMedIndexCurrentRows_(sheet, config, startRow, rowCount) {
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

function ensureMedIndexCurrentSheets_() {
  const spreadsheet = SpreadsheetApp.openById(MEDINDEX_CURRENT_DOSAGE_SPREADSHEET_ID);
  let status = spreadsheet.getSheetByName(MEDINDEX_CURRENT_STATUS_SHEET);
  if (!status) status = spreadsheet.insertSheet(MEDINDEX_CURRENT_STATUS_SHEET);
  if (status.getLastRow() === 0) {
    status.getRange(1, 1, 1, 4).setValues([['Koha', 'Burimi', 'Statusi', 'Detajet']]);
    status.setFrozenRows(1);
  }

  let state = spreadsheet.getSheetByName(MEDINDEX_CURRENT_STATE_SHEET);
  if (!state) state = spreadsheet.insertSheet(MEDINDEX_CURRENT_STATE_SHEET);
  if (state.getLastRow() === 0) {
    state.getRange(1, 1, 1, 6).setValues([['Spreadsheet ID', 'Tab-i', 'Row key', 'Hash', 'Rreshti', 'Përditësuar']]);
    state.setFrozenRows(1);
  }
  state.hideSheet();
  return { status, state };
}

function readMedIndexCurrentState_(config) {
  const state = ensureMedIndexCurrentSheets_().state;
  if (state.getLastRow() < 2) return new Map();
  return new Map(
    state.getRange(2, 1, state.getLastRow() - 1, 6).getDisplayValues()
      .filter(row => row[0] === config.spreadsheetId && row[1] === config.sheetName)
      .map(row => [row[2], { sourceHash:row[3], rowNumber:Number(row[4]) || null }])
  );
}

function replaceMedIndexCurrentState_(config, rows) {
  const state = ensureMedIndexCurrentSheets_().state;
  const existing = state.getLastRow() > 1
    ? state.getRange(2, 1, state.getLastRow() - 1, 6).getValues()
    : [];
  const keep = existing.filter(row => row[0] !== config.spreadsheetId || row[1] !== config.sheetName);
  const next = rows.map(row => [
    config.spreadsheetId,
    config.sheetName,
    row.rowKey,
    row.sourceHash,
    row.rowNumber,
    new Date(),
  ]);
  const combined = keep.concat(next);
  if (state.getLastRow() > 1) state.getRange(2, 1, state.getLastRow() - 1, 6).clearContent();
  if (combined.length) state.getRange(2, 1, combined.length, 6).setValues(combined);
}

function upsertMedIndexCurrentState_(config, rows) {
  const current = readMedIndexCurrentState_(config);
  rows.forEach(row => current.set(row.rowKey, row));
  replaceMedIndexCurrentState_(config, [...current.entries()].map(([rowKey, value]) => ({
    rowKey,
    sourceHash:value.sourceHash,
    rowNumber:value.rowNumber,
  })));
}

function recordMedIndexCurrentStatus_(source, status, details) {
  try {
    const sheet = ensureMedIndexCurrentSheets_().status;
    sheet.appendRow([new Date(), source, status, String(details || '').slice(0, 1000)]);
    if (sheet.getLastRow() > 500) sheet.deleteRows(2, sheet.getLastRow() - 500);
  } catch (error) {
    console.error(`Current status log failed: ${error.message}`);
  }
}
