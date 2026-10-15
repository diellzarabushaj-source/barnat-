'use strict';
// Read-only inventory: a reviewed source is not proof of a local product licence.
const fs = require('node:fs');
const path = require('node:path');
const market = require('../lib/pediatric-market-catalog');
const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const rows=require('../tests/fixtures/pediatric-market-products-20261015.js');
const reference=market.withMarket({...read('data/pediatric-common-drugs-reference.json'),clinicalAudit:read('data/pediatric-clinical-audit-v1.json'),weightAgeDefaults:read('data/pediatric-weight-age-defaults.json')},rows);
const variants=reference.marketCatalog.drugs.flatMap(drug=>drug.forms.flatMap(form=>form.variants.map(v=>({drugName:drug.name,...v}))));
const active=variants.filter(v=>v.schemes.length),inactive=variants.filter(v=>!v.schemes.length);
if(inactive.some(v=>!v.review?.sources?.length))throw Error('An inactive formulation has no documented source review');
const baselineIndex=process.argv.indexOf('--baseline');
const baseline=baselineIndex<0?null:JSON.parse(fs.readFileSync(process.argv[baselineIndex+1],'utf8')).flatMap(d=>d.variants.map(v=>({drugName:d.name,...v})));
const report={
 reviewedAt:'2026-10-15',registryFixture:'2026-10-14 + 2026-10-15',routeAuditVersion:reference.marketCatalog.routeAuditVersion,
 scope:'International formulation sources reviewed; product-unconfirmed records remain unresolved. No claim of universal Kosovo product-label verification.',
 counts:{publishedProducts:rows.length,variants:variants.length,active:active.length,inactive:inactive.length},
 inactiveByStatus:Object.fromEntries([...new Set(inactive.map(v=>v.review.status))].map(status=>[status,inactive.filter(v=>v.review.status===status).length])),
 baseline:baseline?.map(v=>{const ids=new Set(v.products.map(p=>p.id));const current=variants.filter(c=>c.drugName===v.drugName&&c.products.some(p=>ids.has(p.id)));return {drugName:v.drugName,previousId:v.id,previousStrength:v.concentration.raw,products:v.products.map(p=>({id:p.id,name:p.name})),current:current.map(c=>({id:c.id,strength:c.concentration.raw,status:c.schemes.length?'active':c.review.status,schemes:c.schemes,review:c.review}))};}),
 inactive:inactive.map(v=>({drugName:v.drugName,id:v.id,strength:v.concentration.raw,form:v.form.label,route:v.form.route,products:v.products,review:v.review}))
};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
