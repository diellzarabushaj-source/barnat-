'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'medical-hub-v2.js'), 'utf8');
const context = {window: {location: {origin: 'http://localhost'}}, URL};
// Exercise the actual renderer without starting auth or fetching remote content.
const instrumented = source.slice(0, source.lastIndexOf("  if (document.readyState")) +
  'this.render = medicalContentMarkup; })();';
vm.runInNewContext(instrumented, context);
const block = (text, listItem, level = 1) => ({_type:'block', children:[{text}], listItem, level});
const render = context.render;
assert.equal(render([block('Parent','number'),block('Child','bullet',2),block('Next','number')]),
  '<ol class="ck-source-list-block"><li>Parent<ul class="ck-source-list-block"><li>Child</li></ul></li><li>Next</li></ol>');
assert.match(render([block('A','number'),block('B','bullet'),block('C')]), /<\/ol><ul.*<\/ul><p/);
assert.match(render([{_type:'newFutureBlock'}]), /nuk mund të shfaqet/);
assert.doesNotMatch(render([{_type:'medicalChecklist',title:'<script>x</script>',items:[{label:'<img src=x>',detail:'<b>x</b>'}]}]), /<script>|<img|<b>/);
assert.doesNotMatch(render([{_type:'block',children:[{text:'link',marks:['x']}],markDefs:[{_key:'x',href:'javascript:alert(1)'}]}]), /href=/);
const rx = name => ({genericName:name,medicine:'Hidden brand',dose:'example',patientGroup:'QA only'});
const alternatives = render([{_type:'prescriptionGroup',relation:'alternative',lines:[rx('A'),rx('B'),rx('C')]}]);
assert.equal((alternatives.match(/aria-label="alternativë"/g)||[]).length,2);
assert.doesNotMatch(alternatives,/Hidden brand/);
assert.match(alternatives,/QA only/);
assert.match(render([{_type:'prescriptionGroup',relation:'all',lines:[rx('A'),{...rx('B'),instructions:'OR'}]}]), /aria-label="alternativë"/);
const mixed = render([{_type:'prescriptionGroup',relation:'all',lines:[rx('A'),{...rx('B'),relationToPrevious:'or'},rx('C')]}]);
assert.equal((mixed.match(/aria-label="alternativë"/g)||[]).length,1);
assert.equal((mixed.match(/aria-label="së bashku"/g)||[]).length,1);
assert.match(render([{_type:'medicalDecision',title:'Decision',branches:[{condition:'Condition',action:[block('Action')]}]}]),/Nëse.*Condition[\s\S]*Atëherë[\s\S]*Action/);
const draft = require('../content/medical-hub/chapter-01-draft.json');
for (const topic of draft.topics) {
  assert.equal(topic.reviewStatus,'draft');
  assert.ok(!topic.reviewedBy && !topic.lastReviewedAt);
  for (const section of topic.sections) {
    const html = render(section.content);
    assert.ok(html.length > 0);
    assert.doesNotMatch(html,/nuk mund të shfaqet/);
  }
}
function validateArrays(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    const objects=value.filter(v=>v && typeof v==='object' && !v.sections);
    assert.equal(new Set(objects.map(v=>v._key)).size,objects.length,'array keys must be unique');
    objects.forEach(v=>assert.ok(v._key));
    value.forEach(validateArrays);
  } else {
    if(value._type==='medicalTable') value.rows.forEach(row=>assert.equal(row.cells.length,value.columns.length));
    Object.values(value).forEach(validateArrays);
  }
}
validateArrays(draft);
console.log('Composable reader: nested lists, Rx alternatives, XSS, future blocks and draft integrity passed.');
