'use strict';
const {test,expect} = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
let server,base;
test.use({serviceWorkers:'block'});
test.beforeAll(async()=>{
  server=http.createServer((req,res)=>{
    const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async()=>{await new Promise(resolve=>server.close(resolve));});
const release='a'.repeat(40);
const payload={available:true,enabled:true,currentRelease:release,cohorts:[
  {module:'registry',device:'mobile',release,state:'warning',navigations:40,metrics:{LCP:{count:40,p75Upper:4000},INP:{count:21,p75Upper:300},CLS:{count:40,p75Upper:0.05}},errors:{RUNTIME_ERROR:{count:3,alarm:true}}},
  {module:'prescriptions',device:'desktop',release,state:'partial-data',navigations:25,metrics:{LCP:{count:25,p75Upper:2000},INP:{count:4,p75Upper:null},CLS:{count:0,p75Upper:null}},errors:{}},
  {module:'registry',device:'desktop',release:'b'.repeat(40),state:'healthy',navigations:200,metrics:{},errors:{}},
]};
for(const width of [390,1440]){
  test(`Admin metrics stay private, honest and contained at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900});
    let denied=false;
    await page.route('**/api/**',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/api/auth') return route.fulfill({json:{authenticated:true,supabaseAuthenticated:true,csrfToken:'fixture',user:{email:'admin@example.test',name:'Test'},authUser:{status:'active',adminConsole:true}}});
      if(url.searchParams.get('view')==='telemetry') return route.fulfill(denied?{status:403,json:{error:'forbidden'}}:{json:payload});
      return route.fulfill({json:{ok:true,items:[],chapters:[],groups:[],available:true}});
    });
    await page.goto(base+'/sistemi.html');
    const panel=page.locator('#systemTelemetryPanel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.runtime-metric-card')).toHaveCount(2);
    await expect(panel).toContainText('Kërkon kontroll');
    await expect(panel).toContainText('4 kampione · duhen 20');
    await expect(panel).toContainText('Ende pa matje');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const geometry=await panel.locator('.runtime-metric-card').evaluateAll(nodes=>nodes.map(n=>({left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,overflow:n.scrollWidth>n.clientWidth})));
    expect(geometry.every(g=>g.left>=0&&g.right<=width&&!g.overflow)).toBe(true);
    expect(await panel.locator('#systemTelemetryRefresh').evaluate(n=>n.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    // Check the actual rendered text against each card's white background.
    const ratios=await panel.locator('.runtime-metric-card h3,.runtime-metric-card p,.runtime-metric-card dt,.runtime-metric-card dd,.runtime-metric-state').evaluateAll(nodes=>{
      const luminance=rgb=>rgb.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
      return nodes.map(n=>{const c=getComputedStyle(n).color.match(/[\d.]+/g).slice(0,3).map(Number);return 1.05/(luminance(c)+.05);});
    });
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5);
    await panel.scrollIntoViewIfNeeded();
    fs.mkdirSync(path.resolve(root,'../../outputs'),{recursive:true});
    await page.screenshot({path:path.resolve(root,`../../outputs/runtime-panel-${width}-${test.info().project.name}.png`)});
    denied=true;await panel.locator('#systemTelemetryRefresh').click();
    await expect(panel).toBeHidden();
    await expect(panel.locator('.runtime-metric-card')).toHaveCount(0);
  });
}
test('A doctor does not request or expose admin metrics',async({page})=>{
  let metricsRequests=0;
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.searchParams.get('view')==='telemetry')metricsRequests++;
    await route.fulfill({json:url.pathname==='/api/auth'?{authenticated:true,user:{name:'Doctor'},authUser:{status:'active',adminConsole:false}}:{ok:true,items:[]}});
  });
  await page.goto(base+'/sistemi.html');
  await expect(page.locator('#appShell')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#systemTelemetryPanel')).toBeHidden();
  expect(metricsRequests).toBe(0);
});
