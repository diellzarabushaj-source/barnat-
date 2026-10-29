'use strict';
const {EXISTING,enrichLabDataset}=require('../lib/lab-symptom-guide');
const categories=Array.from({length:14},(_,i)=>({id:'category-'+(i+1),number:i+1,title:'Kategoria '+(i+1)}));
const tests=Object.entries(EXISTING).map(([key,englishName])=>({id:'existing-'+key,englishName,formName:{glucose:'Glukoza',urine:'Ekzaminimi i urinës',crp:'CRP'}[key]||englishName,categoryId:'category-1',whatItShows:'Referencë prove.'}));
tests.push({id:'hemoglobin',englishName:'Hemoglobin',formName:'Hemoglobina',categoryId:'category-1'},
  {id:'urine-glucose',englishName:'Urine Glucose',formName:'Glukoza',categoryId:'category-13'},
  {id:'urine-bilirubin',englishName:'Urine Bilirubin',formName:'Bilirubina',categoryId:'category-13'},
  {id:'creatinine-clearance',englishName:'Creatinine Clearance',formName:'Klirensi i kreatininës',categoryId:'category-5'});
const base={source:'Supabase',categories,tests,indications:[{id:'old-anemia',slug:'anemia-mungese-hekurit',title:'Anemia nga mungesa e hekurit',icdCodes:['D50'],sortOrder:1,tests:[{testId:'hemoglobin',tier:'core',rationale:'Vlerësim i anemisë.'}],catalogGaps:[{name:'Ferritina'}]},
  {id:'old-uti',slug:'infeksion-urinar',title:'Infeksion urinar',tests:[],catalogGaps:[{name:'Urinokultura'}]},
  {id:'old-ckd',slug:'semundja-kronike-veshkave',title:'Sëmundja kronike e veshkave',tests:[],catalogGaps:[{name:'eGFR'},{name:'Raporti albuminë/kreatininë në urinë (ACR)'}]}]};
module.exports={base,data:enrichLabDataset(base)};
