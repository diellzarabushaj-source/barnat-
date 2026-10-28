'use strict';
const {buildCatalog}=require('../lib/antibiotic-market-catalog');
const row=(id,active_substance,atc_code,strength,pharmaceutical_form,extra={})=>({id,registry_number:'TEST-'+id,trade_name:'Produkt prove '+id,active_substance,atc_code,strength,pharmaceutical_form,packaging:'Paketim prove',approved_population:'Pediatric and adult both',...extra});
const rows=[
  row('amox-liquid','Amoxicillin trihydrate','J01CA04','250 mg/5 ml','Powder for oral suspension'),
  row('amox-cap','Amoxicillin','J01CA04','500 mg','Capsule'),
  row('amox-iv','Amoxicillin sodium','J01CA04','1 g','Powder for solution for injection'),
  row('amox-adult','Amoxicillin','J01CA04','1000 mg','Tablet',{approved_population:'Adult only'}),
  row('clav-7','Amoxicillin; Clavulanic acid','J01CR02','(400 mg+57 mg)/5 ml','Powder for oral suspension'),
  row('clav-7-200','Amoxicillin; Clavulanic acid','J01CR02','(200 mg+28.5 mg)/5 ml','Powder for oral suspension'),
  row('clav-14','Amoxicillin; Clavulanic acid','J01CR02','(600 mg+42.9 mg)/5 ml','Powder for oral suspension'),
  row('tmp','Sulfamethoxazole; Trimethoprim','J01EE01','(200 mg+40 mg)/5 ml','Oral suspension'),
  row('cephalexin','Cephalexin','J01DB01','250 mg/5 ml','Powder for oral suspension'),
];
module.exports={row,rows,catalog:buildCatalog(rows)};
