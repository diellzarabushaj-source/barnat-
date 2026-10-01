'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {chromium,webkit,expect} = require('@playwright/test');
const ROOT = path.resolve(__dirname,'..');
const engine = process.env.ADMIN_APPROVAL_BROWSER === 'webkit' ? webkit : chromium;

(async () => {
  const server = spawn(process.execPath,['tests/clinical-smoke-server.js'],{cwd:ROOT,env:{...process.env,PORT:'4197'},stdio:['ignore','pipe','pipe']});
  let browser;
  try {
    await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw new Error('Admin preview failed');})]);
    browser = await engine.launch({headless:true});
    for (const width of [320,390,430,760,900,1440]) {
      const context = await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
      const page = await context.newPage();
      const errors=[],mutations=[];
      page.on('pageerror',error=>errors.push(error.message));
      const users = [
        {id:'no-document',email:'long-registration-email-for-mobile@example.test',fullName:'Përdoruesi testues pa dokument',professionalTitle:'mjek',role:'doctor',status:'pending',verificationStatus:'missing',verificationDocument:null},
        {id:'with-document',email:'document@example.test',fullName:'Përdoruesi me dokument',professionalTitle:'specialist',specialty:'Specialitet testues me emër të gjatë',role:'doctor',status:'pending',verificationStatus:'submitted',verificationDocument:{id:'qa-document',filename:'Dokument testues.pdf'}},
      ];
      await context.route('**/api/auth**',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.searchParams.get('scope')==='users'){
          if(request.method()==='PATCH'){
            const body=request.postDataJSON();mutations.push(body);
            assert.equal(request.headers()['x-csrf-token'],'qa-admin-csrf');
            const user=users.find(user=>user.id===body.userId);
            user.status=body.status;user.verificationStatus=user.verificationDocument?'verified':'admin_approved';
            return route.fulfill({json:{ok:true,changed:true,user}});
          }
          return route.fulfill({json:{ok:true,users}});
        }
        return route.fulfill({json:{ok:true,authenticated:true,user:{email:'qa-admin@example.test'},authUser:{adminConsole:true},csrfToken:'qa-admin-csrf'}});
      });
      await context.route('**/api/clinical-editor**',route=>route.fulfill({json:{ok:true,summary:{items:[],total:0}}}));
      await page.goto('http://127.0.0.1:4197/admin.html');
      await expect(page.locator('#adminShell')).toBeVisible();
      if(width<=1050)await page.locator('#adminMenu').click();
      await page.locator('[data-view="users"]').click();
      if(width<=1050)await expect.poll(()=>page.locator('#adminSidebar').evaluate(element=>element.getBoundingClientRect().right)).toBeLessThanOrEqual(1);
      await expect(page.locator('#adminRows tr')).toHaveCount(2);
      for(const id of ['no-document','with-document']){
        const approve=page.locator(`[data-user="${id}"][data-status="active"]`);
        await expect(approve).toHaveText('Aprovo');await expect(approve).toBeEnabled();
      }
      if(width<=900){
        const geometry=await page.locator('#adminRows').evaluate(element=>[...element.querySelectorAll('tr')].map(row=>{
          const card=row.getBoundingClientRect(),cells=[...row.cells].map(cell=>cell.getBoundingClientRect());
          return {left:card.left,right:card.right,width:card.width,cells:cells.map(cell=>({left:cell.left,right:cell.right,width:cell.width})),actions:[...row.querySelectorAll('button')].map(button=>{const b=button.getBoundingClientRect();return{left:b.left,right:b.right,height:b.height};})};
        }));
        for(const card of geometry){
          assert.ok(card.left>=0&&card.right<=width+1,'The entire user card fits the phone');
          assert.ok(card.cells.every(cell=>cell.left>=card.left&&cell.right<=card.right+1),'User information never escapes its card');
          assert.ok(card.actions.every(button=>button.left>=card.left&&button.right<=card.right+1&&button.height>=44),JSON.stringify({width,card}));
        }
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      }
      if(width===390)await page.screenshot({path:'/tmp/barnat-admin-users-mobile.png',fullPage:true});
      await page.locator('[data-user="no-document"][data-status="active"]').click();
      await expect(page.locator('#usersActive')).toHaveText('1');
      await page.locator('[data-filter="active"]').click();
      await expect(page.locator('#adminRows')).toContainText('Pa dokument · aprovuar nga administratori');
      await page.locator('[data-open-user="no-document"]').last().click();
      await expect(page.locator('#userDetail')).toContainText('Aprovuar nga administratori');
      await page.keyboard.press('Escape');
      await page.locator('[data-filter="pending"]').click();
      await page.locator('[data-user="with-document"][data-status="active"]').click();
      await expect(page.locator('#usersActive')).toHaveText('2');
      assert.deepEqual(mutations,[{userId:'no-document',status:'active'},{userId:'with-document',status:'active'}]);
      assert.deepEqual(errors,[]);
      if(width===390)await page.screenshot({path:'/tmp/barnat-admin-approved-mobile.png'});
      await context.close();
    }
    console.log(`PASS ${engine.name()}: six responsive admin viewports, visible enabled approval with/without documents, manual status, details and authenticated PATCH.`);
  }finally{await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
