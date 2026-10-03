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
const split = {_type:'block',style:'normal',listItem:'number',children:[{text:'4.',marks:['strong']},{text:' Label:',marks:['strong']},{text:' Body',marks:[]}]};
assert.match(context.render([split]), /value="4"><strong>Label:<\/strong> Body/);
const rx = context.rx([block('1. First'),block('• Detail',['strong']),table,block('2. Second'),block('OSE alternative')]);
assert.equal((rx.match(/<table /g)||[]).length,1, 'Prescription tables must not disappear');
assert.ok(rx.indexOf('First') < rx.indexOf('<table') && rx.indexOf('<table') < rx.indexOf('Second'));
assert.match(rx, /<strong>• Detail<\/strong>/);
assert.doesNotMatch(rx, /<strong>1\. First<\/strong>/, 'Grouping must not introduce source bold');
assert.match(rx, /OSE alternative/);
assert.doesNotMatch(context.render([{...table,rows:[{cells:[''],richCells:[cell('<script>bad</script>',0)]}]}]), /<script>/);
console.log('Medical Hub source fidelity: rich tables, merged cells, line breaks, source list values, split bold spans, mixed Rx blocks and escaping passed.');
