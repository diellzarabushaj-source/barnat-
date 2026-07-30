const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Outbox = require('../lib/sync-outbox.js');

const record = {
  drug:{
    registryNumber:4009, pdid:'REF-SOLU-MEDROL-40', tradeName:'SOLU-MEDROL',
    activeSubstance:'Methylprednisolone sodium succinate', atcCode:'H02AB04',
    strength:'40 mg/1 mL', pharmaceuticalForm:'Powder for solution for injection',
    drugClass:'Kortikosteroid parenteral', useText:'Gjendje të rënda inflamatore',
  },
  profile:{
    verificationStatus:'verified', sourceUrls:['https://dailymed.nlm.nih.gov/example'],
    indicationsText:'Astmë e rëndë', renalAdjustment:'Individualizo', editorialNotes:'Kontrolluar',
  },
  dosage:{
    adult:{ dose:'10–40 mg sipas indikacionit', route:'IV; IM', sourceUrl:'https://dailymed.nlm.nih.gov/adult', notes:'IV ngadalë', verified:true },
    pediatric:{ dose:'1–2 mg/kg/ditë', route:'IV', sourceUrl:'https://dailymed.nlm.nih.gov/ped', notes:'Kërkon zgjedhje klinike', verified:true },
  },
};

const targets = Outbox.buildTargets(record);
assert.deepEqual(targets.map(item => item.sheetName), ['KARTELA_BARNAVE', 'DOZA_TE_RRITUR', 'DOZA_PEDIATRIKE']);
assert.equal(targets[0].values['Kategoria e administrimit'], 'PARENTERAL');
assert.equal(targets[0].values['Rrugët e lejuara'], 'IV; IM');
assert.equal(targets[1].values['Auto-fill'], 'JO');
assert.equal(targets[1].values['RegimenID'], 'EDITOR-4009-ADULT');
assert.equal(targets[2].values['Auto-fill'], 'JO');
assert.match(targets[2].values['Formula e llogaritjes'], /skemë e strukturuar/);
assert.equal(Outbox._test.statusLabel('verified'), 'VERIFIKUAR');
assert.deepEqual(Outbox._test.numericIds([1, '2', 2, -1, 'x']), [1, 2]);

const root = path.resolve(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'api/drive-sync.js'), 'utf8');
const editor = fs.readFileSync(path.join(root, 'lib/clinical-editor.js'), 'utf8');
const script = fs.readFileSync(path.join(root, 'google-apps-script/medindex-current-sync-standalone.gs'), 'utf8');
const status = fs.readFileSync(path.join(root, 'api/neon-status.js'), 'utf8');
assert.match(api, /ack_editor_updates/);
assert.match(api, /fail_editor_updates/);
assert.match(api, /SyncOutbox\.pullUpdates/);
assert.match(editor, /SyncOutbox\.enqueueEditorRecord/);
assert.match(script, /ack_editor_updates/);
assert.match(script, /fail_editor_updates/);
assert.match(script, /sheet\.getLastRow\(\) \+ 1/);
assert.equal((script.match(/editorPull:true/g) || []).length, 3);
assert.match(status, /SyncOutbox\.stats/);

execFileSync(process.execPath, ['--check', path.join(root, 'lib/sync-outbox.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(root, 'api/drive-sync.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(root, 'lib/clinical-editor.js')], { stdio:'pipe' });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'medindex-outbox-'));
try {
  const appsScript = path.join(temp, 'current-sync.js');
  fs.copyFileSync(path.join(root, 'google-apps-script/medindex-current-sync-standalone.gs'), appsScript);
  execFileSync(process.execPath, ['--check', appsScript], { stdio:'pipe' });
} finally {
  fs.rmSync(temp, { recursive:true, force:true });
}
console.log('Acknowledged editor synchronization outbox contract passed.');
