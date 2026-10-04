'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../medical-hub-v2.js'), 'utf8');
const context = {window:{location:{origin:'http://localhost'}}, URL};
vm.runInNewContext(source.slice(0, source.lastIndexOf('  if (document.readyState')) +
  'this.render = medicalContentMarkup; this.rx = sourcePrescriptionMarkup; })();', context);
const block = (text, marks = [], listItem, level = 1) => ({_type:'block', style:'normal', listItem, level, children:[{_type:'span', text, marks}]});
const cell = (text, columnIndex, extra = {}) => ({_type:'medicalTableCell', columnIndex, content:[block(text)], ...extra});
const table = {_type:'medicalTable', columns:['Header A','Header B'], headerCells:[cell('Header A',0),cell('Header B',1)], rows:[
  {cells:['Dose\nMaximum','Merged'],richCells:[{...cell('',0),content:[block('Dose',['strong']),block('Maximum')]},cell('Merged',1,{rowSpan:2})]},
  {cells:['Second','Merged'],richCells:[cell('Second',0)]},
]};
const html = context.render([table]);
assert.match(html, /<thead><tr><th scope="col">/);
assert.match(html, /<strong>Dose<\/strong>/);
assert.match(html, /rowspan="2"/);
assert.equal((html.match(/Merged/g)||[]).length,1, 'Merged cells render once');
assert.ok(html.indexOf('Dose') < html.indexOf('Maximum') && html.indexOf('Maximum') < html.indexOf('Merged'));
assert.match(context.render([{_type:'medicalTable',columns:['A'],rows:[{cells:['First\nSecond']}]}]), /First<br>Second/);
assert.match(context.render([block('3. Third',['strong'],'number'),block('   • Child',[],'bullet',2),block('7. Seventh',[],'number')]), /start="3".*value="3"><strong>Third<\/strong>.*<ul.*Child.*value="7">Seventh/s);
assert.doesNotMatch(context.render([block('• Bullet',[],'bullet')]), /<li>•/);
assert.match(context.render([block('● Native bullet',[],'bullet')]), /<li class="is-source-solid-bullet">Native bullet<\/li>/);
assert.match(context.rx([block('● Native Rx bullet',[],'bullet')]), /● Native Rx bullet/);
const split = {_type:'block',style:'normal',listItem:'number',children:[{text:'4.',marks:['strong']},{text:' Label:',marks:['strong']},{text:' Body',marks:[]}]};
assert.match(context.render([split]), /value="4"><strong>Label:<\/strong> Body/);
const rx = context.rx([block('1. First'),block('• Detail',['strong']),table,block('2. Second'),block('OSE alternative')]);
assert.equal((rx.match(/<table /g)||[]).length,1, 'Prescription tables must not disappear');
assert.ok(rx.indexOf('First') < rx.indexOf('<table') && rx.indexOf('<table') < rx.indexOf('Second'));
assert.match(rx, /<strong>• Detail<\/strong>/);
assert.doesNotMatch(rx, /<strong>1\. First<\/strong>/, 'Grouping must not introduce source bold');
assert.match(rx, /OSE alternative/);
assert.doesNotMatch(context.render([{...table,rows:[{cells:[''],richCells:[cell('<script>bad</script>',0)]}]}]), /<script>/);
const editorial = {...block(''),children:[{text:'Shënim ',marks:['strong']},{text:'redaktorial:',marks:['strong']},{text:' Teksti i burimit.',marks:[]}]};
assert.match(context.render([editorial]), /ck-editorial-note" role="note"><strong>Shënim <\/strong><strong>redaktorial:<\/strong> Teksti i burimit\./);
const annotatedRx = context.rx([block('1. Hapi'),block('● Bari',[],'bullet'),editorial,block('2. Hapi tjetër')]);
assert.match(annotatedRx, /ck-source-rx-line ck-editorial-note" role="note"/);
assert.ok(annotatedRx.indexOf('● Bari') < annotatedRx.indexOf('Shënim ') && annotatedRx.indexOf('Teksti i burimit.') < annotatedRx.indexOf('2. Hapi tjetër'));
assert.equal((context.rx([block('Shënim redaktorial:'),block('Teksti i shënimit.')]).match(/<article /g)||[]).length,0,'An editorial label is not a prescription step');
assert.match(context.render([block('● Shënim redaktorial: Kujdes.',[],'bullet')]), /<li class="is-source-solid-bullet ck-editorial-note">Shënim redaktorial: Kujdes\.<\/li>/);
assert.match(context.render([block('3. Shënim redaktorial: Shpjegim.',[],'number')]), /<li class="ck-editorial-note" value="3">/);
assert.match(context.render([block('Burimi fillestar. Shënim redaktorial: Plotësim.')]), /ck-editorial-note/);
assert.doesNotMatch(context.render([block('BURIME PËR SHËNIMET REDAKTORIALE')]), /ck-editorial-note/);
assert.match(context.render([block('SHËNIME TË VERIFIKIMIT TË DOZIMIT')]), /ck-editorial-note/);
assert.match(context.render([block('SHËNIME TË VERIFIKIMIT')]), /ck-editorial-note/);
for (const note of ['Shënim sipas udhëzimeve aktuale [1]: Teksti.', 'Shënim diagnostik [7]: Teksti.', 'Shënim redaktues: Teksti.', 'Shënim klinik — përditësim: Teksti.', 'Shënim farmaceutik: Teksti.', 'Shënim [14,15]: Teksti.']) {
  assert.match(context.render([block(note)]), /ck-editorial-note/);
  assert.match(context.rx([block('1. Hapi'),block(note)]), /ck-source-rx-line ck-editorial-note/);
}
assert.doesNotMatch(context.render([block('Referencat e shënimeve klinike — kapitulli 16')]), /ck-editorial-note/);
console.log('Medical Hub source fidelity: rich tables, merged cells, line breaks, source list values, split bold spans, mixed Rx blocks and escaping passed.');
