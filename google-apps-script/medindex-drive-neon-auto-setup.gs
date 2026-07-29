function setupMedIndexDriveSyncFromConfig() {
  const spreadsheet = SpreadsheetApp.openById(MEDINDEX_MASTER_SPREADSHEET_ID);
  const configSheet = spreadsheet.getSheetByName('NEON_SYNC_CONFIG');
  if (!configSheet) throw new Error('Mungon tab-i i fshehur NEON_SYNC_CONFIG.');

  const values = configSheet.getRange(1, 1, Math.max(configSheet.getLastRow(), 1), 2).getDisplayValues();
  const config = Object.fromEntries(values.slice(1).map(row => [String(row[0] || '').trim(), String(row[1] || '').trim()]).filter(row => row[0]));
  const secret = config.MEDINDEX_DRIVE_SYNC_SECRET || '';
  const endpoint = config.MEDINDEX_DRIVE_SYNC_ENDPOINT || MEDINDEX_SYNC_ENDPOINT_DEFAULT;
  if (secret.length < 24) throw new Error('Sekreti privat i sinkronizimit mungon ose është i pavlefshëm.');
  if (!/^https:\/\//i.test(endpoint)) throw new Error('Endpoint-i i sinkronizimit nuk është HTTPS.');

  PropertiesService.getScriptProperties().setProperties({
    MEDINDEX_DRIVE_SYNC_SECRET:secret,
    MEDINDEX_DRIVE_SYNC_ENDPOINT:endpoint,
    MEDINDEX_NEXT_SOURCE_INDEX:'0',
  }, false);

  removeMedIndexTriggers_();
  [...new Set(MEDINDEX_DRIVE_SOURCES.map(source => source.spreadsheetId))].forEach(spreadsheetId => {
    ScriptApp.newTrigger('medIndexDriveOnEdit').forSpreadsheet(spreadsheetId).onEdit().create();
  });
  ScriptApp.newTrigger('medIndexDriveReconcile').timeBased().everyMinutes(5).create();

  ensureMedIndexSheets_();
  initializeMedIndexState_();
  recordMedIndexStatus_('SISTEMI', 'AKTIV', 'Drive mbetet burimi kryesor; ndryshimet sinkronizohen me Neon dhe kontrollohen çdo 5 minuta.');

  const statusRow = values.findIndex(row => String(row[0] || '').trim() === 'STATUS') + 1;
  if (statusRow > 0) configSheet.getRange(statusRow, 2).setValue(`AKTIV · ${new Date().toISOString()}`);
  configSheet.hideSheet();
  SpreadsheetApp.getUi().alert('Sinkronizimi Google Drive → Neon u aktivizua.');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('MedIndex Neon')
    .addItem('Aktivizo sinkronizimin', 'setupMedIndexDriveSyncFromConfig')
    .addItem('Kontrollo tani', 'medIndexDriveReconcile')
    .addSeparator()
    .addItem('Ndalo sinkronizimin', 'disableMedIndexDriveSync')
    .addToUi();
}
