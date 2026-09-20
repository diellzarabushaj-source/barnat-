'use strict';
const {chromium,webkit,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const engine=require('../lib/dozologjia-master');
const pages=['index','klasifikimi','icd','dozologjia','antibiotiket','analizat','recetat','protokollet','medical-hub','urgjencat','sistemi'];
(async()=>{
 const browser=await (process.env.BROWSER==='webkit'?webkit:chromium).launch({headless:true});const report=[];
 const out=path.resolve(__dirname,'../../responsive-refinement');fs.mkdirSync(out,{recursive:true});
 try{
  for(const width of (process.env.WIDTHS||'320,390,768,844,1024,1440,1920').split(',').map(Number))for(const name of pages){
   const context=await browser.newContext({viewport:{width,height:width===844?390:844},hasTouch:width<=1024,serviceWorkers:'block'});
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/dosage?view=master-catalog',r=>r.fulfill({json:engine.catalog()}));
   await page.goto(`http://127.0.0.1:4190/${name}.html`);await page.waitForTimeout(300);
   await expect(page.locator('h1').first()).toBeVisible();
   const metrics=await page.evaluate(()=>{
    const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.top<innerHeight&&r.bottom>0&&r.left>=0&&r.right<=innerWidth;};
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,
     small:[...document.querySelectorAll('main button,main input:not([type=checkbox]):not([type=radio]),main select')].filter(visible).filter(e=>e.getBoundingClientRect().height<43).map(e=>({tag:e.tagName,id:e.id,cls:e.className,h:Math.round(e.getBoundingClientRect().height)})),
     zoomInputs:[...document.querySelectorAll('main input:not([type=checkbox]):not([type=radio]),main select,main textarea')].filter(visible).filter(e=>parseFloat(getComputedStyle(e).fontSize)<16).map(e=>e.id||e.className)};
   });
   report.push({name,width,...metrics,errors});
   if(name==='index'&&width<1024){
    await page.locator('#menuButton').click();
    await expect(page.locator('#menuButton')).toHaveAttribute('aria-expanded','true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#menuButton')).toHaveAttribute('aria-expanded','false');
    await expect(page.locator('#menuButton')).toBeFocused();
    await page.locator('#menuButton').click();
    await page.setViewportSize({width:1440,height:900});
    await expect(page.locator('.main-shell')).not.toHaveAttribute('inert','');
    await page.setViewportSize({width,height:width===844?390:844});
   }
   if(name==='index'&&width>=1024){
    const sidebar=await page.locator('#sidebar').boundingBox();
    if(!sidebar||sidebar.x<0)throw Error('Desktop navigation is offscreen');
   }
   if(width===320)await page.screenshot({path:path.join(out,`${process.env.PHASE||'before'}-${name}-${width}.png`)});
   await context.close();
  }
 }finally{await browser.close();fs.writeFileSync(path.join(out,`${process.env.PHASE||'before'}.json`),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({loads:report.length,issues:report.filter(r=>r.overflow||r.errors.length||(r.width<=1024&&(r.small.length||r.zoomInputs.length)))}));
 if(report.some(r=>r.overflow||r.errors.length))throw Error('Responsive page overflow or runtime failure');
 if(report.some(r=>r.width<=1024&&(r.small.length||r.zoomInputs.length)))throw Error('Touch target or input text too small');
})().catch(e=>{console.error(e);process.exitCode=1});
