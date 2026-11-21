'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const core=require('../antibiotiket-catalog-core');
const smart=require('../antibiotiket-smart-search');
require('../antibiotiket-catalog-data');
const data=globalThis.DRX_ANTIBIOTIC_CATALOG;
const all=data.antibiotics;
const byName=name=>all.find(a=>a.name===name);
test('ranked exact name wins, preserving the actual registry items',()=>{
 const hits=smart.filterAntibiotics(all,{search:'amoxicillin'},[],core);
 assert(hits.length>0);
 assert.equal(hits[0].name,'Amoxicillin');
 assert(hits.every(a=>all.includes(a)));
});
test('Albanian accent and transliteration spelling, mild typo tolerance',()=>{
 assert.equal(smart.fold('Infeksionet e fytit në Pejë'),'infeksionet e fytit ne peje');
 assert.equal(smart.filterAntibiotics(all,{search:'amoksicilin'},[],core)[0]?.name,'Amoxicillin');
 assert.equal(smart.filterAntibiotics(all,{search:'amoxcillin'},[],core)[0]?.name,'Amoxicillin');
 assert(smart.filterAntibiotics(all,{search:'ceftriakson'},[],core).some(a=>a.name==='Ceftriaxone'));
});
test('product name, ATC and AND-of-tokens search only indexed fields',()=>{
 assert.deepEqual(smart.filterAntibiotics(all,{search:'ALMACIN'},[],core).map(x=>x.name),['Amoxicillin','Amoxicillin + Clavulanic acid']);
 const c=byName('Ceftriaxone');
 assert(c&&smart.filterAntibiotics(all,{search:c.atc},[],core).includes(c));
 assert(smart.filterAntibiotics(all,{search:'amoxicillin cistit'},[],core).every(x=>x.name.toLowerCase().includes('amoxicillin')));
 assert.equal(smart.filterAntibiotics(all,{search:'amoxicillin completely-invented-diagnosis'},[],core).length,0);
});
test('clinical group, indication, route, form, population and personal selection still use core',()=>{
 const filters={search:'amoxicillin',group:'Beta-Laktamët',subgroup:'Penicilinat',route:'PO',form:'Tabletë'};
 const hits=smart.filterAntibiotics(all,filters,[],core);
 assert(hits.length>0);
 assert(hits.every(a=>core.filterAntibiotics(all,{...filters,search:''},[]).includes(a)));
 const synthetic={id:'test',name:'Example',group:'X',subgroup:'Y',atc:'J99',conditionIds:['c'],indications:['Cistit'],populations:['Të rritur'],products:[
  {status:'Active',route:'PO',formLabel:'Tabletë',brand:'Example'},
  {status:'Active',route:'IV',formLabel:'Solucion për infuzion',brand:'Example'}
 ]};
 assert.equal(smart.filterAntibiotics([synthetic],{search:'example',route:'PO',form:'Solucion për infuzion'},[],core).length,0);
 assert.deepEqual(smart.filterAntibiotics([synthetic],{search:'example',selectedOnly:true},['test'],core).map(a=>a.id),['test']);
});
test('suggestions are sourced exclusively from real records',()=>{
 const s=smart.suggestions(all,{search:'ceftri'},[],core);
 assert(s.some(x=>x.value==='Ceftriaxone'));
 assert(s.every(x=>['Substancë','ATC','Produkt','Indikacion në burim'].includes(x.kind)));
 assert(s.length<=6);
});
test('facet counts derive from the same filter core, without changing any recommendation',()=>{
 const list=smart.optionCounts(all,{search:'amoxicillin'},[],core,'group',['Beta-Laktamët','Jo-Beta-Laktamët']);
 assert.equal(list.length,2);
 assert(list[0].count>0);
 assert.equal(list[0].count,core.filterAntibiotics(smart.filterAntibiotics(all,{search:'amoxicillin'},[],core),{group:'Beta-Laktamët'},[]).length);
});
test('UI uses approved local Stripe shell and is accessible without third-party CDNs',()=>{
 const html=fs.readFileSync(path.join(root,'antibiotiket.html'),'utf8');
 const js=fs.readFileSync(path.join(root,'antibiotiket-smart-ui.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'antibiotiket-smart-ui.css'),'utf8');
 assert.match(html,/\/antibiotiket-smart-search\.js\?v=/);
 assert.match(html,/\/antibiotiket-smart-ui\.js\?v=/);
 assert.match(html,/\/antibiotiket-smart-ui\.css\?v=/);
 assert(html.indexOf('/antibiotiket-smart-search.js')<html.indexOf('/antibiotiket-catalog.js'));
 assert(html.indexOf('/antibiotiket-catalog.js')<html.indexOf('/antibiotiket-smart-ui.js'));
 assert(html.indexOf('/antibiotiket-smart-ui.css')<html.indexOf('/drx-dashboard-stripe.css'));
 assert.match(js,/abxSmartSuggestions/);
 assert.match(js,/aria-autocomplete/);
 assert.match(js,/abxActiveFilterChips/);
 assert.match(js,/addEventListener\('keydown'/);
 assert.match(js,/requestAnimationFrame/);
 assert.match(css,/@media\(max-width:460px\)/);
 assert.doesNotMatch(html,/https:\/\/fonts\.googleapis\.com|cdn\.tailwindcss\.com/);
 assert.doesNotThrow(()=>new Function(js));
});
