'use strict';
const assert=require('node:assert/strict');
const {calculate,revisionOf}=require('../lib/pediatric-common-calculate-handler.js');
const reference={...require('../data/pediatric-common-drugs-reference.json'),weightAgeDefaults:require('../data/pediatric-weight-age-defaults.json'),clinicalAudit:require('../data/pediatric-clinical-audit-v1.json')};
const drugs=reference.sections.flatMap(section=>section.drugs);
function dose(name,weight,extra={}){return calculate(reference,{referenceRevision:revisionOf(reference),drugName:name,optionIndex:0,weight,...extra});}

// Weight alone is sufficient when the authoritative rule has no age gate.
const amox=dose('Amoxicillin','12');
assert.equal(amox.perDoseMin,300);assert.equal(amox.frequency,'2 herë/ditë');
assert.equal(amox.ageInfo.defaultMonths,24);assert.equal(amox.ageInfo.manual,false);
assert.equal(amox.conversions.find(c=>c.mg===125).volumeMin,12);
assert.equal(amox.conversions.find(c=>c.mg===250).volumeMin,6);
assert.equal(dose('Amoxicillin',100).perDoseMax,1000);
assert.equal(dose('Amoxicillin','12,5').perDoseMax,312.5);
// Caller-supplied formulas, maxima and concentrations never affect output.
assert.deepEqual(dose('Amoxicillin',12,{dose:9000,maxPerDose:9000,concentration:1,rules:[]}),amox);
for(const weight of ['','0','-12','0.39','150.1','0x20','1e2','Infinity','NaN','12kg'])assert.ok(dose('Amoxicillin',weight).error,weight);
assert.ok(dose('Amoxicillin',12,{optionIndex:-1}).error);
assert.ok(dose('Amoxicillin',12,{optionIndex:999}).error);

assert.ok(calculate(reference,{drugNo:4,optionIndex:0,weight:12}).error,'Repeated source row numbers cannot identify a drug');
assert.ok(dose('Amoxicillin',12,{referenceRevision:'older-source'}).error,'A different audit/reference snapshot cannot silently change the selected formula');
// Suggested age is editable, but age-dependent regimens need actual age.
assert.equal(dose('Paracetamol',12).needsAgeConfirmation,true);
assert.equal(dose('Paracetamol',12,{age:24,ageUnit:'month',ageConfirmed:false}).needsAgeConfirmation,true);
const para=dose('Paracetamol',12,{age:24,ageUnit:'month',ageConfirmed:true});
assert.equal(para.perDoseMax,180);assert.equal(para.dailyCap,720);
assert.ok(dose('Paracetamol',12,{age:'',ageUnit:'month',ageConfirmed:true}).error);
assert.ok(dose('Paracetamol',12,{age:19,ageUnit:'year',ageConfirmed:true}).error);
assert.equal(dose('Paracetamol',3.5,{age:20,ageUnit:'day',ageConfirmed:true}).perDoseMax,35);
const ibuprofen=dose('Ibuprofen',20,{optionIndex:1,age:5,ageUnit:'year',ageConfirmed:true});
assert.equal(ibuprofen.perDoseMax,150);assert.equal(ibuprofen.dailyCap,600);
assert.ok(dose('Ibuprofen',7,{age:3,ageUnit:'month',ageConfirmed:true}).error);

// Exact neonatal boundaries are server enforced; a weight estimate cannot pass.
assert.equal(dose('Gentamicin',3.5).needsAgeConfirmation,true);
assert.equal(dose('Gentamicin',3.5,{age:0.2,ageUnit:'month',ageConfirmed:true}).exactDaysRequired,true);
assert.equal(dose('Gentamicin',3.5,{age:6,ageUnit:'day',ageConfirmed:true}).perDoseMax,17.5);
assert.equal(dose('Gentamicin',3.5,{age:7,ageUnit:'day',ageConfirmed:true}).perDoseMax,26.25);
assert.ok(dose('Gentamicin',3.5,{age:60,ageUnit:'day',ageConfirmed:true}).error);
for(const drug of drugs.filter(d=>reference.clinicalAudit.drugs[d.name].calculator.disabled))assert.ok(dose(drug.name,20).error);
console.log('PASS: common pediatric server doses, validated input, actual age gates, neonatal days, caps and product concentrations');
