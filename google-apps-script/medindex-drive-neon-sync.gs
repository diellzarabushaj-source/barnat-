const MEDINDEX_SYNC_ENDPOINT_DEFAULT = 'https://barnat-six.vercel.app/api/drive-sync';
const MEDINDEX_SYNC_STATUS_SPREADSHEET_ID = '17cuXg5qORIIWkvAxLZ7uz2FMmGvzwjr850cubUcIgLE';
const MEDINDEX_SYNC_STATUS_SHEET = 'NEON_SYNC';
const MEDINDEX_SYNC_BATCH_SIZE = 50;
const MEDINDEX_SNAPSHOT_CHUNK_SIZE = 80;

const MEDINDEX_DRIVE_SOURCES = Object.freeze([
  {
    spreadsheetId:'1oF_92zOmTEeXyXh7daaK9onq9fZbQBlWmeU9K0ptn4U',
    sheetName:'Sheet1',
    headerRow:2,
    keyColumn:'Nr rendor',
  },
  {
    spreadsheetId:'17cuXg5qORIIWkvAxLZ7uz2FMmGvzwjr850cubUcIgLE',
    sheetName:'KARTELA_BARNAVE',
    headerRow:1,
    keyColumn:'Nr rendor',
  },
  {
    spreadsheetId:'17cuXg5qORIIWkvAxLZ7uz2FMmGvzwjr850cubUcIgLE',
    sheetName:'DOZA_TE_RRITUR',
    headerRow:1,
    keyColumn:'RegimenID',
  },
  {
    spreadsheetId:'17cuXg5qORIIWkvAxLZ7uz2FMmGvzwjr850cubUcIgLE',
    sheetName:'DOZA_PEDIATRIKE',
    headerRow:1,
    keyColumn:'RegimenID',
  },
  {
    spreadsheetId:'19ncbnrTJ_w-WQ0msWO9_dUoxjmicSUAz6Nt4sh20gFw',
    sheetName:'Të gjitha kodet',
    headerRow:5,
    keyColumn:'Kodi ICD-10',
  },
  {
    spreadsheetId:'1sGEWsDYnVE1VThLUpfSs2Q0UIjXZZRzxXTHXDvn7p8I',
    sheetName:'Analizat',
    headerRow:4,
    keyColumn:'Emri në formular',
  },
]);

function setupMedIndexDriveSync() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'MedIndex · Drive → Neon',
    'Ngjite çelësin privat MEDINDEX_DRIVE_SYNC_SECRET. Ai ruhet vetëm te Script Properties.',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const secret = String(response.getResponseText() || '').trim();
  if (secret.length < 24) throw new Error('Çelësi duhet të ketë së paku 24 karaktere.');

  const properties = PropertiesService.getScriptProperties();
  properties.setProperties({
    MEDINDEX_DRIVE_SYNC_SECRET:secret,
    MEDINDEX_DRIVE_SYNC_ENDPOINT:MEDINDEX_SYNC_ENDPOINT_DEFAULT,
  }, false);

  const managedHandlers = new Set(['medIndexDriveOnEdit', 'medIndexDriveReconcile']);
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (managedHandlers.has(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  });

  const spreadsheetIds = [...new Set(MEDINDEX_DRIVE_SOURCES.map(source => source.spreadsheetId))];
  spreadsheetIds.forEach(spreadsheetId => {
    ScriptApp.newTrigger('medIndexDriveOnEdit')
      .forSpreadsheet(spreadsheetId)
      .onEdit()
      .create();
  });
  ScriptApp.newTrigger('medIndexDriveReconcile')
    .timeBased()
    .everyMinutes(5)
    .create();

  ensureMedIndexSyncStatusSheet_();
  recordMedIndexSyncStatus_('SISTEMI', 'AKTIV', 'Trigger-at u instaluan; sinkronizimi kontrollohet çdo 5 minuta.');
  medIndexDriveReconcile();
  ui.alert('Sinkronizimi Drive → Neon u aktivizua.');
}

function disableMedIndexDriveSync() {
  const managedHandlers = new Set(['medIndexDriveOnEdit', 'medIndexDriveReconcile']);
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (managedHandlers.has(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  });
  recordMedIndexSyncStatus_('SISTEMI', 'NDALUR', 'Trigger-at e sinkronizimit u hoqën.');
}

function medIndexDriveOnEdit(event) {
  if (!event || !event.range || !event.source) return;
  const spreadsheetId = event.source.getId();
  const sheet = event.range.getSheet();
  const config = findMedIndexSource_(spreadsheetId, sheet.getName());
  if (!config) return;

  const firstRow = Math.max(event.range.getRow(), config.headerRow + 1);
  const lastRow = event.range.getLastRow();
  if (lastRow < firstRow) return;

  const rows = readMedIndexRows_(sheet, config, firstRow, lastRow - firstRow + 1);
  if (!rows.length) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return;
  try {
    sendMedIndexChanges_(config, rows, []);
  } catch (error) {
    recordMedIndexSyncStatus_(config.sheetName, 'GABIM', error.message);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function medIndexDriveReconcile() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    MEDINDEX_DRIVE_SOURCES.forEach(config => {
      try {
        reconcileMedIndexSource_(config);
      } catch (error) {
        recordMedIndexSyncStatus_(config.sheetName, 'GABIM', error.message);
      }
    });
  } finally {
    lock.releaseLock();
  }
}

function reconcileMedIndexSource_(config) {
  const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  const sheet = spreadsheet.getSheetByName(config.sheetName);
  if (!sheet) throw new Error(`Mungon tab-i ${config.sheetName}.`);

  const currentRows = readMedIndexRows_(
    sheet,
    config,
    config.headerRow + 1,
    Math.max(0, sheet.getLastRow() - config.headerRow)
  );
  const currentHashes = {};
  currentRows.forEach(row => { currentHashes[row.rowKey] = row.sourceHash; });

  const previousHashes = loadMedIndexSnapshot_(config);
  const changedRows = currentRows.filter(row => previousHashes[row.rowKey] !== row.sourceHash);
  const deletedKeys = Object.keys(previousHashes).filter(key => !Object.prototype.hasOwnProperty.call(currentHashes, key));

  if (!changedRows.length && !deletedKeys.length) return;

  for (let index = 0; index < changedRows.length; index += MEDINDEX_SYNC_BATCH_SIZE) {
    sendMedIndexChanges_(config, changedRows.slice(index, index + MEDINDEX_SYNC_BATCH_SIZE), []);
  }
  for (let index = 0; index < deletedKeys.length; index += 200) {
    sendMedIndexChanges_(config, [], deletedKeys.slice(index, index + 200));
  }

  saveMedIndexSnapshot_(config, currentHashes);
  recordMedIndexSyncStatus_(
    config.sheetName,
    'OK',
    `${changedRows.length} rreshta u përditësuan; ${deletedKeys.length} u arkivuan.`
  );
}

function readMedIndexRows_(sheet, config, startRow, rowCount) {
  if (rowCount <= 0) return [];
  const lastColumn = sheet.getLastColumn();
  if (lastColumn <= 0) return [];
  const headers = sheet.getRange(config.headerRow, 1, 1, lastColumn).getDisplayValues()[0]
    .map(value => String(value || '').trim());
  const keyIndex = headers.indexOf(config.keyColumn);
  if (keyIndex < 0) throw new Error(`Mungon kolona kyçe ${config.keyColumn} te ${config.sheetName}.`);

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
  return MEDINDEX_DRIVE_SOURCES.find(source =>
    source.spreadsheetId === spreadsheetId && source.sheetName === sheetName
  ) || null;
}

function medIndexHash_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(value),
    Utilities.Charset.UTF_8
  );
  return bytes.map(byte => (`0${(byte + 256) % 256 .toString(16)}`).slice(-2)).join('');
}

function medIndexSnapshotPrefix_(config) {
  const safeSheet = config.sheetName.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40);
  return `MEDINDEX_SNAPSHOT_${config.spreadsheetId.slice(0, 12)}_${safeSheet}`;
}

function loadMedIndexSnapshot_(config) {
  const properties = PropertiesService.getScriptProperties();
  const prefix = medIndexSnapshotPrefix_(config);
  const count = Number(properties.getProperty(`${prefix}_COUNT`) || 0);
  const output = {};
  for (let index = 0; index < count; index += 1) {
    const raw = properties.getProperty(`${prefix}_${index}`);
    if (!raw) continue;
    Object.assign(output, JSON.parse(raw));
  }
  return output;
}

function saveMedIndexSnapshot_(config, hashes) {
  const properties = PropertiesService.getScriptProperties();
  const prefix = medIndexSnapshotPrefix_(config);
  const previousCount = Number(properties.getProperty(`${prefix}_COUNT`) || 0);
  const entries = Object.entries(hashes);
  const chunks = [];
  for (let index = 0; index < entries.length; index += MEDINDEX_SNAPSHOT_CHUNK_SIZE) {
    chunks.push(Object.fromEntries(entries.slice(index, index + MEDINDEX_SNAPSHOT_CHUNK_SIZE)));
  }
  const updates = { [`${prefix}_COUNT`]:String(chunks.length) };
  chunks.forEach((chunk, index) => { updates[`${prefix}_${index}`] = JSON.stringify(chunk); });
  properties.setProperties(updates, false);
  for (let index = chunks.length; index < previousCount; index += 1) {
    properties.deleteProperty(`${prefix}_${index}`);
  }
}

function ensureMedIndexSyncStatusSheet_() {
  const spreadsheet = SpreadsheetApp.openById(MEDINDEX_SYNC_STATUS_SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(MEDINDEX_SYNC_STATUS_SHEET);
  if (!sheet) sheet = spreadsheet.insertSheet(MEDINDEX_SYNC_STATUS_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 4).setValues([['Koha', 'Burimi', 'Statusi', 'Detajet']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function recordMedIndexSyncStatus_(source, status, details) {
  try {
    const sheet = ensureMedIndexSyncStatusSheet_();
    sheet.appendRow([new Date(), source, status, String(details || '').slice(0, 1000)]);
    if (sheet.getLastRow() > 500) sheet.deleteRows(2, sheet.getLastRow() - 500);
  } catch (error) {
    console.error(`Status log failed: ${error.message}`);
  }
}
