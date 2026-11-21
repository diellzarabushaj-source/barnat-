'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

// Exercise the shared drawer lifecycle without starting authentication or APIs.
const source = read('sidebar-taxonomy-v3.js');
const code = source.slice(source.indexOf('  function initMobileSidebar()'), source.indexOf('  function init()'));
const listeners = {};
let observer;
const attrs = {};
const document = {activeElement:null, body:{style:{overflow:'auto'}}, addEventListener:(name,fn)=>{listeners[name]=fn;}};
const focusNode = () => ({disabled:false, tabIndex:0, isConnected:true, closest:()=>null, getClientRects:()=>[{}], focus(){document.activeElement=this;}});
const first = focusNode(); const last = focusNode(); const trigger = {...focusNode(),setAttribute:(k,v)=>{attrs[k]=v;}};
const classes = new Set();
const sidebar = {id:'sidebar',inert:false,classList:{contains:k=>classes.has(k),remove:k=>classes.delete(k)},querySelectorAll:()=>[first,last],contains:node=>[first,last].includes(node),addEventListener:()=>{}};
const main = {inert:false,querySelectorAll:()=>[first]};
const backdrop = {hidden:true};
const desktop = {matches:false,addEventListener:(name,fn)=>{listeners.resize=fn;}};
document.getElementById = id => ({sidebar, menuButton:trigger, sidebarBackdrop:backdrop})[id];
document.querySelector = () => main;
const context = {document,window:{matchMedia:()=>desktop,addEventListener:()=>{}},MutationObserver:class{constructor(fn){observer=fn;}observe(){}}};
vm.runInNewContext(code+'initMobileSidebar();',context);
assert.equal(sidebar.inert,true);
assert.equal(attrs['aria-expanded'],'false');
document.activeElement=trigger; classes.add('is-open'); observer();
assert.equal(main.inert,true); assert.equal(sidebar.inert,false); assert.equal(backdrop.hidden,false);
assert.equal(document.activeElement,first); assert.equal(document.body.style.overflow,'hidden');
let prevented=false;
document.activeElement=last;
listeners.keydown({key:'Tab',shiftKey:false,preventDefault(){prevented=true;}});
assert.equal(prevented,true); assert.equal(document.activeElement,first);
listeners.keydown({key:'Escape',preventDefault(){},stopImmediatePropagation(){}});
assert.equal(document.activeElement,trigger); assert.equal(main.inert,false);
assert.equal(document.body.style.overflow,'auto'); assert.equal(backdrop.hidden,true);
classes.add('is-open'); observer(); desktop.matches=true; listeners.resize();
assert.equal(sidebar.inert,false); assert.equal(main.inert,false); assert.equal(classes.has('is-open'),false);

// Invalidate an in-flight search immediately, including the debounce window.
{
  const source = read('pediatric-calculator-client.js');
  const start = source.indexOf("elements.search.addEventListener('input', () => {");
  const end = source.indexOf("\n    });", start) + 8;
  let input; let pending; let aborted = false; let skeleton = false; let immediate;
  const state = {searchToken:7,query:'old',results:[{id:'old'}],searchController:{abort(){aborted=true;}}};
  const search = {value:'new',addEventListener:(name,fn)=>{input=fn;}};
  vm.runInNewContext('let searchTimer=0;'+source.slice(start,end), {
    elements:{search}, state, text:value=>value.trim(), MIN_QUERY:2, SEARCH_DEBOUNCE_MS:180,
    window:{clearTimeout(){pending=null;},setTimeout:fn=>{pending=fn;return 1;}},
    updateSearchChrome(){},renderSearchSkeleton(){skeleton=true;},setStatus(){},runSearch:q=>{immediate=q;}
  });
  input();
  assert.equal(state.searchToken,8); assert.equal(aborted,true);
  assert.equal(state.results.length,0); assert.equal(skeleton,true); assert.equal(immediate,undefined);
  pending(); assert.equal(immediate,'new');
  search.value=''; input(); assert.equal(immediate,''); assert.equal(pending,null);
}

// V3 protocols copy an official deep link, not the removed V2 draft-prescription workspace.
// Exercise the actual delegated clipboard handler, including async success/failure.
async function testCopy(fails) {
  const source=read('protokollet-v2.js');
  const line=source.split('\n').find(value=>value.includes("if(e.target.closest('#plCopyLink'))"));
  assert.ok(line, 'The V3 protocol reader must expose its source-link clipboard action');
  const expected='https://barnat-six.vercel.app/protokollet.html#protokoll/upk-01';
  const copied=[]; let message='';
  const handler=vm.runInNewContext('(function(e){'+line+'})',{
    location:{href:expected},
    navigator:{clipboard:{writeText:href=>{
      copied.push(href);
      return fails?Promise.reject(new Error('denied')):Promise.resolve();
    }}},
    showToast:status=>{message=status;},
  });
  handler({target:{closest:selector=>selector==='#plCopyLink'}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(copied,[expected]);
  assert.match(message,fails?/nuk u kopjua/:/Lidhja u kopjua/);
}
(async()=>{await testCopy(false);await testCopy(true);console.log('Workspace interaction polish: drawer focus, resize recovery and V3 protocol-link clipboard success/failure passed.');})().catch(error=>{console.error(error);process.exitCode=1;});
