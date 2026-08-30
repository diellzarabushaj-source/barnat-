'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const Capture=require('../scripts/drx-phase8-exact-source-capture.js');

const fixture=`
<html><body>
<div>Име на лекот (латиница):</div><div>CO-ALMACIN</div>
<div>Генеричко име</div><div>amoxicillin, clavulanic acid</div>
<div>АТЦ</div><div>J01CR02</div>
<div>Фармацевтска форма</div><div>прашок за перорална суспензија</div>
<div>Јачина</div><div>(400 mg/57 mg)/5 ml</div>
<div>Пакување</div><div>1 темно саклено шише х 17,5 g за припрема на 70 ml</div>
<div>Состав</div><div>амоксицилин трихидрат 6,271 g еквивалентен на 5 600 mg амоксицилин и клавуланска киселина</div>
<div>Начин на издавање</div><div>Р</div>
<div>Производители:</div><div>АЛКАЛОИД АД, Скопје, Р. Северна Македонија</div>
<div>Местa на производство</div><div>Скопје</div>
<div>Носител на одобрение</div><div>АЛКАЛОИД АД СКОПЈЕ</div>
<div>Број на решение</div><div>15-3626/13</div>
<div>Датум на решение</div><div>12.09.2013</div>
<div>Дозирање</div><div>Благи и умерени инфекции: 25 mg /3,6 mg/kg/ден. Дозата се дели на два дела на 12 часа.</div>
<div>Браилово писмо</div><div>Да</div>
</body></html>`;

const parsed=Capture.parseRegistryHtml(fixture);
assert.equal(parsed.tradeName,'CO-ALMACIN');
assert.equal(parsed.genericName,'amoxicillin, clavulanic acid');
assert.equal(parsed.atcCode,'J01CR02');
assert.equal(parsed.strength,'(400 mg/57 mg)/5 ml');
assert.equal(parsed.authorizationNumber,'15-3626/13');
assert.equal(parsed.authorizationDate,'2013-09-12');
assert.ok(parsed.compositionText.includes('амоксицилин'));
assert.ok(parsed.dosageText.includes('25 mg'));
assert.equal(Capture.validateParsed(Capture.SOURCES[0],parsed),true);

assert.equal(Capture.parseDateMk('03.04.2013'),'2013-04-03');
assert.equal(Capture.compact('500 mg'),'500mg');

const migration=fs.readFileSync(
  'supabase/migrations/20260830174925_drx_phase8j_exact_source_capture_pipeline.sql','utf8'
);
const workflow=fs.readFileSync(
  '.github/workflows/drx-phase8-exact-source-capture.yml','utf8'
);

assert.match(migration,/exact_market_product_source_captures_v1/);
assert.match(migration,/exact_market_product_source_bindings_v1/);
assert.match(migration,/drx_phase8_ingest_exact_source_v1\(p_capture jsonb\)/);
assert.match(migration,/NON_EU_REGULATOR/);
assert.match(migration,/automatic_verification_allowed=false/);
assert.match(migration,/grant execute on function public\.drx_phase8_ingest_exact_source_v1\(jsonb\)\s+to service_role/i);
assert.doesNotMatch(migration,/grant execute on function public\.drx_phase8_ingest_exact_source_v1\(jsonb\)\s+to authenticated/i);

assert.match(workflow,/SUPABASE_SECRET_KEY/);
assert.doesNotMatch(workflow,/SUPABASE_DB_URL/);
assert.match(workflow,/drx-phase8-exact-source-archive/);
assert.match(workflow,/drx-phase8-exact-source-capture-evidence/);

console.log('DRx Phase 8 exact-source capture contract: PASS');
