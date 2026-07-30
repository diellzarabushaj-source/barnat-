'use strict';

function setupMedIndexPerfectSync() {
  medIndexRemoveLegacySyncTriggers_();
  setupMedIndexCurrentSyncStandalone();
}

function disableMedIndexPerfectSync() {
  medIndexRemoveLegacySyncTriggers_();
  if (typeof disableMedIndexCurrentSyncStandalone === 'function') {
    disableMedIndexCurrentSyncStandalone();
  }
}

function medIndexRemoveLegacySyncTriggers_() {
  const handlers = new Set([
    'medIndexDriveOnEdit',
    'medIndexDriveReconcile',
    'medIndexEditorPull',
    'medIndexCurrentDosageOnEdit',
    'medIndexCurrentDosageReconcile',
    'medIndexCurrentDosageEditorPull',
    'medIndexStandaloneOnEdit',
    'medIndexStandaloneReconcile',
    'medIndexStandaloneEditorPull',
  ]);

  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlers.has(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  });
}
