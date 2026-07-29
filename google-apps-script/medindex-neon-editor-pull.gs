const MEDINDEX_EDITOR_PULL_HANDLER = 'medIndexEditorPull';
const MEDINDEX_EDITOR_PULL_INTERVAL_MINUTES = 1;
const MEDINDEX_EDITOR_PULL_SOURCES = Object.freeze([
  { spreadsheetId:'1oF_92zOmTEeXyXh7daaK9onq9fZbQBlWmeU9K0ptn4U', sheetName:'Sheet1', headerRow:2, keyColumn:'Nr rendor', cursorProperty:'MEDINDEX_EDITOR_CURSOR_DRUGS' },
  { spreadsheetId:'17cuXg5qORIIWkvAxLZ7uz2FMmGvzwjr850cubUcIgLE', sheetName:'KARTELA_BARNAVE', headerRow:1, keyColumn:'Nr rendor', cursorProperty:'MEDINDEX_EDITOR_CURSOR_DOSAGE_CARDS' },
]);

function setupMedIndexBidirectionalSync() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('MEDINDEX_DRIVE_SYNC_SECRET')) {
    throw new Error('Aktivizo së pari setupMedIndexDriveSync që çelësi privat të ruhet te Script Properties.');
  }

  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === MEDINDEX_EDITOR_PULL_HANDLER) ScriptApp.deleteTrigger(trigger);
  });

  const cursor = new Date().toISOString();
  MEDINDEX_EDITOR_PULL_SOURCES.forEach(source => {
    if (!properties.getProperty(source.cursorProperty)) properties.setProperty(source.cursorProperty, cursor);
  });
  ScriptApp.newTrigger(MEDINDEX_EDITOR_PULL_HANDLER)
    .timeBased()
    .everyMinutes(MEDINDEX_EDITOR_PULL_INTERVAL_MINUTES)
    .create();

  medIndexEditorPull();
  recordMedIndexStatus_('EDITORI LIVE', 'AKTIV', 'Neon → Google Sheet kontrollohet çdo minutë; Google Sheet → Neon mbetet i menjëhershëm pas editimit.');
}

function disableMedIndexEditorPull() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === MEDINDEX_EDITOR_PULL_HANDLER) ScriptApp.deleteTrigger(trigger);
  });
  recordMedIndexStatus_('EDITORI LIVE', 'NDALUR', 'Sinkronizimi Neon → Google Sheet u ndal.');
}

function medIndexEditorPull() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    MEDINDEX_EDITOR_PULL_SOURCES.forEach(source => pullMedIndexEditorSource_(source));
  } catch (error) {
    recordMedIndexStatus_('EDITORI LIVE', 'GABIM', error.message);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function pullMedIndexEditorSource_(config) {
  const properties = PropertiesService.getScriptProperties();
  const endpoint = properties.getProperty('MEDINDEX_DRIVE_SYNC_ENDPOINT') || MEDINDEX_SYNC_ENDPOINT_DEFAULT;
  const secret = properties.getProperty('MEDINDEX_DRIVE_SYNC_SECRET');
  if (!secret) throw new Error('MEDINDEX_DRIVE_SYNC_SECRET nuk është konfiguruar.');

  const cursor = properties.getProperty(config.cursorProperty) || new Date(Date.now() - 60000).toISOString();
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
  if (updates.length) applyMedIndexEditorUpdates_(config, updates);
  properties.setProperty(config.cursorProperty, payload.nextCursor || cursor);
  if (updates.length) recordMedIndexStatus_(config.sheetName, 'OK', `${updates.length} ndryshim(e) nga editori u shkruan në Google Sheet.`);
}

function applyMedIndexEditorUpdates_(config, updates) {
  const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  const sheet = spreadsheet.getSheetByName(config.sheetName);
  if (!sheet) throw new Error(`Mungon tab-i ${config.sheetName}.`);

  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(config.headerRow, 1, 1, lastColumn).getDisplayValues()[0]
    .map(value => String(value || '').trim());
  const keyIndex = headers.indexOf(config.keyColumn);
  if (keyIndex < 0) throw new Error(`Mungon kolona ${config.keyColumn} te ${config.sheetName}.`);

  const dataStart = config.headerRow + 1;
  const rowCount = Math.max(0, sheet.getLastRow() - config.headerRow);
  const keys = rowCount ? sheet.getRange(dataStart, keyIndex + 1, rowCount, 1).getDisplayValues().flat() : [];
  const rowByKey = new Map(keys.map((value, index) => [String(value || '').trim(), dataStart + index]).filter(entry => entry[0]));
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
  const stateRows = uniqueRows.flatMap(rowNumber => readMedIndexRows_(sheet, config, rowNumber, 1));
  if (stateRows.length) upsertMedIndexState_(config, stateRows);
}
