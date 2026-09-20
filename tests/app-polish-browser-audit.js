'use strict';
const {chromium}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const engine=require('../lib/dozologjia-master');
const pages=['index','klasifikimi','icd','dozologjia','antibiotiket','analizat','recetat','protokollet','medical-hub','urgjencat','sistemi'];
const output=process.env.APP_AUDIT_OUTPUT || path.resolve(__dirname,'../../app-audit');
const phase=process.env.APP_AUDIT_PHASE || 'baseline';
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true});const report=[];
 try {
  for(const width of [1440,390])for(const name of pages){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
   const page=await context.newPage();const requests=[],errors=[];
   page.on('request',r=>requests.push(new URL(r.url()).pathname+new URL(r.url()).search));
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/dosage?view=master-catalog',r=>r.fulfill({json:engine.catalog()}));
   await page.addInitScript(()=>{
    window.auditTasks=[];window.auditCLS=0;
    new PerformanceObserver(l=>l.getEntries().forEach(e=>window.auditTasks.push(e.duration))).observe({type:'longtask',buffered:true});
    new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.auditCLS+=e.value;})).observe({type:'layout-shift',buffered:true});
   });
   await page.goto(`http://127.0.0.1:4190/${name}.html`,{waitUntil:'load'});
   await page.waitForTimeout(600);
   const metrics=await page.evaluate(()=>({
    title:document.title,heading:document.querySelector('h1')?.textContent,
    overflow:document.documentElement.scrollWidth>innerWidth+1,
    dcl:Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd),
    longTasks:window.auditTasks.length,blockingMs:Math.round(window.auditTasks.reduce((a,b)=>a+Math.max(0,b-50),0)),
    cls:Math.round(window.auditCLS*1000)/1000,
    bytes:performance.getEntriesByType('resource').reduce((sum,e)=>sum+e.decodedBodySize,0),
    sidebar:!!document.querySelector('.sidebar .nav-stack'),
   }));
   if(['index','antibiotiket','medical-hub','recetat'].includes(name))await page.screenshot({path:path.join(output,`${phase}-${name}-${width}.png`),fullPage:false});
   report.push({page:name,width,...metrics,requests:requests.length,icdNavRequests:requests.filter(s=>s==='/api/icd?view=nav').length,classificationDataRequests:requests.filter(s=>s.startsWith('/classification-data.js')).length,errors});
   console.log(JSON.stringify(report.at(-1)));
   await context.close();
  }
 } finally {await browser.close();fs.writeFileSync(path.join(output,`${phase}.json`),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1});
