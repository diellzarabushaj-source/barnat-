// MedIndex one-click bootstrap.
// Add this as Bootstrap.gs, then run setupMedIndexBootstrap once.
'use strict';

function setupMedIndexBootstrap() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet || spreadsheet.getId() !== '1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo') {
    throw new Error('Hape Apps Script nga spreadsheet-i MedIndex dhe provo përsëri.');
  }

  const activationSheet = spreadsheet.getSheetByName('AKTIVIZO_SYNC');
  if (!activationSheet) throw new Error('Tab-i AKTIVIZO_SYNC mungon.');

  const activationCell = activationSheet.getRange('D30');
  const secret = String(activationCell.getValue() || '').trim();
  if (secret.length < 24) {
    throw new Error('Çelësi njëpërdorimësh i aktivizimit mungon.');
  }

  PropertiesService.getScriptProperties().setProperty('MEDINDEX_DRIVE_SYNC_SECRET', secret);
  activationCell.clearContent();
  SpreadsheetApp.flush();
  setupMedIndexPerfectSync();
}
