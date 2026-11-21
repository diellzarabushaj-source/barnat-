'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/clinical-catalog-78.json'),'utf8'));
const originals=JSON.parse(fs.readFileSync(path.join(root,'data/protocols.json'),'utf8'));
const html=fs.readFileSync(path.join(root,'protokollet.html'),'utf8');
const js=fs.readFileSync(path.join(root,'protokollet-v2.js'),'utf8');
const manifest=new Map(originals.documents.map(d=>[d.id,d]));
const official='https://msh.rks-gov.net/udherrefyesit-dhe-protokollet-klinike-upk/';
assert.equal(catalog.schemaVersion,4,'unsafe source links must be quarantined in v4');
assert.equal(catalog.documents.length,61);
assert.equal(catalog.documents.filter(d=>d.kind==='protocol').length,13);
assert.ok(catalog.documents.every(d=>d.catalogUrl===official),'all fallback links must open the official catalog');
assert.ok(catalog.documents.every(d=>!d.sourceUrl),'the UI must never expose legacy download links');
assert.ok(catalog.documents.every(d=>d.currentOfficialDocumentUrlVerified===false));
assert.ok(catalog.documents.every(d=>d.pdfTitleVerified===false),'do not pretend PDF title has been checked');
assert.ok(catalog.documents.some(d=>d.title==='Transporti neonatal'&&d.id==='msh-075'));
let local=0,quarantined=0,onlyCatalog=0;
for(const doc of catalog.documents){
 if(doc.legacySourceUrl){
   const url=new URL(doc.legacySourceUrl);
   assert.equal(url.hostname,'msh.rks-gov.net');
   quarantined++;
 }
 if(doc.documentAccess==='archived_private_mirror'){
   assert.match(doc.cachedPath,/^\/api\/protocol-document\?id=upk-\d{2}$/);
   assert.equal(doc.cachedPath,'/api/protocol-document?id='+doc.sourceId);
   const mirror=manifest.get(doc.sourceId);
   assert.ok(mirror,'archived copy requires an existing protocol');
   assert.equal(doc.archivedContentHash,mirror.contentSha256);
   assert.match(doc.archivedContentHash,/^[a-f0-9]{64}$/);
   assert.ok(mirror.blobUrl&&mirror.blobPath,'archived copy must have private storage location');
   local++;
 }else{
   assert.equal(doc.documentAccess,'official_catalog_only');
   assert.ok(!doc.cachedPath,'catalog-only entries cannot claim a PDF');
   onlyCatalog++;
 }
}
assert.equal(quarantined,58);
assert.equal(local,51);
assert.equal(onlyCatalog,10);
assert.match(js,/var mainLink=d\.mirrorUrl\|\|d\.catalogUrl\|\|OFFICIAL_CATALOG/);
assert.doesNotMatch(js,/PDF origjinal në MSh/);
assert.doesNotMatch(js,/d\.mirrorUrl&&d\.isDirect/);
assert.match(html,/\/protokollet-v2\.js\?v=3\.3-safe-document-links/);
assert.ok(!html.includes('https://msh.rks-gov.net/Documents/Index/273'));
console.log('Clinical catalog link safety passed: 58 legacy redirects quarantined; 51 private snapshots; 10 catalog-only.');
