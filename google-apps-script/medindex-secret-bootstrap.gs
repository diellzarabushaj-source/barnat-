// MedIndex one-click bootstrap.
// Add this as Bootstrap.gs, then run setupMedIndexBootstrap once.
'use strict';

function setupMedIndexBootstrap() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet || spreadsheet.getId() !== '1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo') {
    throw new Error('Hape Apps Script nga spreadsheet-i MedIndex dhe provo përsëri.');
  }

  const file = DriveApp.getFileById(spreadsheet.getId());
  const ownerEmail = String(file.getOwner().getEmail() || '').trim().toLowerCase();
  if (ownerEmail !== 'diellzarabushaj@gmail.com') {
    throw new Error('Vetëm pronari i spreadsheet-it mund ta aktivizojë sinkronizimin.');
  }

  const response = UrlFetchApp.fetch('https://barnat-six.vercel.app/api/drive-sync', {
    method:'post',
    contentType:'application/json; charset=utf-8',
    headers:{ Authorization:`Bearer ${ScriptApp.getOAuthToken()}` },
    payload:JSON.stringify({
      action:'bootstrap_secret',
      spreadsheetId:spreadsheet.getId(),
      sheetName:'KARTELA_BARNAVE',
    }),
    muteHttpExceptions:true,
    followRedirects:true,
  });
  const status = response.getResponseCode();
  const body = JSON.parse(response.getContentText() || '{}');
  if (status < 200 || status >= 300 || !body.ok || !body.secret) {
    throw new Error(body.error || `Aktivizimi dështoi (${status}).`);
  }

  PropertiesService.getScriptProperties().setProperty('MEDINDEX_DRIVE_SYNC_SECRET', body.secret);
  setupMedIndexPerfectSync();
}
