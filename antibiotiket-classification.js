(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DRX_ANTIBIOTIC_ATC=api;})(typeof window==='object'?window:globalThis,()=>{
'use strict';
// ATC classifications describe substances; they are not dosing rules.
const source='https://atcddd.fhi.no/atc_ddd_index/?code=J01&showdescription=yes';
const scopes={
  "Amoxicillin": [
    "J01CA04"
  ],
  "Amoxicillin / clavulanate": [
    "J01CR02"
  ],
  "Ampicillin": [
    "J01CA01"
  ],
  "Ampicillin / sulbactam": [
    "J01CR01"
  ],
  "Penicillin V": [
    "J01CE02"
  ],
  "Penicillin G": [
    "J01CE01"
  ],
  "Benzathine penicillin G": [
    "J01CE08"
  ],
  "Flucloxacillin": [
    "J01CF05"
  ],
  "Cloxacillin": [
    "J01CF02"
  ],
  "Piperacillin + Tazobactam": [
    "J01CR05"
  ],
  "Meropenem": [
    "J01DH02"
  ],
  "Cephalexin": [
    "J01DB01"
  ],
  "Cefazolin": [
    "J01DB04"
  ],
  "Cefuroxime": [
    "J01DC02"
  ],
  "Cefprozil": [
    "J01DC10"
  ],
  "Cefotaxime": [
    "J01DD01"
  ],
  "Ceftazidime": [
    "J01DD02"
  ],
  "Ceftriaxone": [
    "J01DD04"
  ],
  "Cefixime": [
    "J01DD08"
  ],
  "Cefpodoxime": [
    "J01DD13"
  ],
  "Cefdinir": [
    "J01DD15"
  ],
  "Azithromycin": [
    "J01FA10"
  ],
  "Clarithromycin": [
    "J01FA09"
  ],
  "Clindamycin": [
    "J01FF01"
  ],
  "Trimethoprim / sulfamethoxazole": [
    "J01EE01"
  ],
  "Amikacin": [
    "J01GB06"
  ],
  "Gentamicin": [
    "J01GB03"
  ],
  "Ciprofloxacin": [
    "J01MA02"
  ],
  "Levofloxacin": [
    "J01MA12"
  ],
  "Nitrofurantoin": [
    "J01XE01"
  ],
  "Vancomycin": [
    "J01XA01"
  ],
  "Colistin": [
    "J01XB01"
  ],
  "Doxycycline": [
    "J01AA02"
  ],
  "Linezolid": [
    "J01XX08"
  ],
  "Fosfomycin": [
    "J01XX01"
  ],
  "Erythromycin": [
    "J01FA01"
  ],
  "Metronidazole": [
    "J01XD01"
  ],
  "Mupirocin": [
    "D06AX09"
  ]
};
const groups={
  "J01A": "Tetraciklina",
  "J01C": "Penicilina",
  "J01D": "Cefalosporina dhe beta-laktamë të tjerë",
  "J01E": "Sulfonamide / trimethoprim",
  "J01F": "Makrolide, linkosamide dhe streptogramina",
  "J01G": "Aminoglikozide",
  "J01M": "Kinolone",
  "J01X": "Antibakterialë të tjerë",
  "D06A": "Antibiotikë për lëkurën"
};
const subgroups={
  "J01AA": "Tetraciklina",
  "J01CA": "Penicilina me spektër të zgjeruar",
  "J01CE": "Penicilina të ndjeshme ndaj beta-laktamazave",
  "J01CF": "Penicilina rezistente ndaj beta-laktamazave",
  "J01CR": "Penicilina me inhibitorë të beta-laktamazave",
  "J01DB": "Cefalosporina · gjenerata I",
  "J01DC": "Cefalosporina · gjenerata II",
  "J01DD": "Cefalosporina · gjenerata III",
  "J01DH": "Karbapeneme",
  "J01EE": "Sulfonamide me trimethoprim",
  "J01FA": "Makrolide",
  "J01FF": "Linkosamide",
  "J01GB": "Aminoglikozide",
  "J01MA": "Fluorokinolone",
  "J01XA": "Glikopeptide",
  "J01XB": "Polimiksina",
  "J01XD": "Derivate të imidazolit",
  "J01XE": "Nitrofurane",
  "J01XX": "Antibakterialë të tjerë",
  "D06AX": "Antibiotikë topikë të tjerë"
};
Object.values(scopes).forEach(Object.freeze);Object.freeze(scopes);Object.freeze(groups);Object.freeze(subgroups);
const normalize=value=>String(value||'').toLowerCase().replace(/\s+/g,'').replace(/\+/g,'/').replace(/sulphamethoxazole/g,'sulfamethoxazole');
function forCode(code){const value=String(code||'').toUpperCase();if(!/^[A-Z]\d{2}[A-Z]{2}\d{2}$/.test(value))return null;const groupCode=value.slice(0,4),subgroupCode=value.slice(0,5);return groups[groupCode]?{code:value,groupCode,group:groups[groupCode],subgroupCode,subgroup:subgroups[subgroupCode]||groups[groupCode]}:null;}
function forDrug(name){const key=Object.keys(scopes).find(key=>normalize(key)===normalize(name));return (scopes[key]||[]).map(forCode).filter(Boolean);}
return Object.freeze({source,scopes,forCode,forDrug});
});
