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

// Native Event.currentTarget becomes null before clipboard promises resolve.
async function testCopy(fails) {
  const source=read('protokollet-v2.js');
  const start=source.indexOf("async event => {",source.indexOf("root.querySelector('[data-pc-copy-rx]')"));
  const end=source.indexOf("\n    });",start);
  const callback=source.slice(start,end)+'}';
  const button={textContent:'Kopjo recetën e punës',disabled:false};
  const status={textContent:''}; let resolve; let reset;
  const promise=new Promise((yes,no)=>{resolve=()=>fails?no(new Error('denied')):yes();});
  const handler=vm.runInNewContext('('+callback+')',{root:{querySelector:()=>status},rxClipboardText:()=>'Draft',navigator:{clipboard:{writeText:()=>promise}},window:{setTimeout:fn=>{reset=fn;}}});
  const event={currentTarget:button}; const pending=handler(event); event.currentTarget=null;
  assert.equal(button.disabled,true); resolve(); await pending;
  assert.match(status.textContent,fails?/nuk u lejua/:/Drafti u kopjua/);
  if(!fails) assert.equal(button.textContent,'U kopjua');
  reset(); assert.equal(button.disabled,false); assert.equal(button.textContent,'Kopjo recetën e punës');
}
(async()=>{await testCopy(false);await testCopy(true);console.log('Workspace interaction polish: drawer focus, resize recovery, clipboard success/failure passed.');})().catch(error=>{console.error(error);process.exitCode=1;});
