/* Administrator view of coarse technical cohorts. */
(() => {
  'use strict';
  const labels = {registry:'Barnat',atc:'Klasifikimi ATC',icd:'ICD-10',dosage:'Dozologjia',antibiotics:'Antibiotikët',protocols:'Protokollet',emergencies:'Urgjencat',favorites:'Favoritët',notes:'Shënimet',prescriptions:'Recetat',labs:'Analizat','medical-hub':'Medical Hub',system:'Sistemi'};
  const devices = {mobile:'Telefon',tablet:'Tablet',desktop:'Desktop'};
  const states = {'insufficient-data':'Po mblidhen matjet','partial-data':'Matje të pjesshme',warning:'Kërkon kontroll',healthy:'Brenda objektivave'};
  const metrics = {LCP:'Hapja e faqes',INP:'Reagimi ndaj veprimit',CLS:'Lëvizja e faqes'};
  let panel, summary, cohorts, refresh, controller, mounted = false;
  const node = (tag,text,className) => { const element=document.createElement(tag); if(text!==undefined) element.textContent=text; if(className) element.className=className; return element; };
  function metricValue(name,metric){
    if(!metric || !Number.isFinite(metric.p75Upper)) return metric?.count>0 ? `${metric.count} kampione · duhen 20` : 'Ende pa matje';
    const value=name==='LCP' ? (metric.p75Upper/1000).toLocaleString('sq',{maximumFractionDigits:2})+' s' : name==='INP' ? metric.p75Upper.toLocaleString('sq')+' ms' : metric.p75Upper.toLocaleString('sq',{maximumFractionDigits:3});
    return `deri në ${value} · ${metric.count} kampione`;
  }
  function render(payload){
    cohorts.replaceChildren();
    if(payload.available!==true || !Array.isArray(payload.cohorts)) throw new Error('unavailable');
    if(payload.enabled!==true){ summary.textContent='Mbledhja e matjeve nuk është aktivizuar për këtë publikim.'; return; }
    const current=payload.cohorts.filter(cohort=>cohort.release===payload.currentRelease && labels[cohort.module] && devices[cohort.device]).slice(0,100);
    current.sort((a,b)=>(a.state==='warning'?-1:0)-(b.state==='warning'?-1:0)||labels[a.module].localeCompare(labels[b.module]));
    summary.textContent=current.length ? `Versioni aktual · 24 orët e fundit · ${current.length} grupe sipas modulit dhe pajisjes` : 'Ende nuk ka kampione për këtë version. Matjet shfaqen pasi përdoruesit e vizitojnë website-in.';
    for(const cohort of current){
      const article=node('article',undefined,'runtime-metric-card');
      const header=node('header'); header.append(node('h3',`${labels[cohort.module]} · ${devices[cohort.device]}`));
      const state=node('span',states[cohort.state]||'Matje të pjesshme','runtime-metric-state'); state.dataset.state=cohort.state; header.append(state); article.append(header);
      article.append(node('p',`${Number(cohort.navigations)||0} hapje në kampion`));
      const list=node('dl');
      for(const [name,label] of Object.entries(metrics)){
        const pair=node('div'); pair.append(node('dt',label),node('dd',metricValue(name,cohort.metrics?.[name]))); list.append(pair);
      }
      article.append(list);
      const errorCount=Object.values(cohort.errors||{}).reduce((total,error)=>total+(Number(error.count)||0),0);
      const alarm=Object.values(cohort.errors||{}).some(error=>error.alarm===true);
      // One navigation can have several classes; never present this sum as an error rate.
      article.append(node('p',`${errorCount} raste gabimesh të vërejtura${alarm?' · kërkojnë kontroll':''}`,alarm?'runtime-metric-alert':'runtime-metric-errors'));
      cohorts.append(article);
    }
  }
  async function load(){
    controller?.abort(); controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),8000);
    refresh.disabled=true; summary.textContent='Duke ngarkuar matjet…';
    try{
      const response=await fetch('/api/neon-status?view=telemetry',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
      if(response.status===401 || response.status===403){ panel.hidden=true; cohorts.replaceChildren(); return; }
      if(!response.ok) throw new Error('unavailable'); render(await response.json());
    }catch{
      cohorts.replaceChildren(); summary.textContent='Matjet nuk u lexuan. Provo përsëri pas pak.';
    }finally{clearTimeout(timeout); refresh.disabled=false;}
  }
  function mount(payload){
    if(payload?.authenticated!==true || payload.authUser?.adminConsole!==true) return;
    panel=document.getElementById('systemTelemetryPanel'); if(!panel) return;
    summary=document.getElementById('systemTelemetrySummary'); cohorts=document.getElementById('systemTelemetryCohorts'); refresh=document.getElementById('systemTelemetryRefresh');
    if(!mounted){ refresh.addEventListener('click',load); mounted=true; }
    panel.hidden=false; void load();
  }
  function hide(){controller?.abort(); if(panel) panel.hidden=true; cohorts?.replaceChildren();}
  window.addEventListener('medindex:auth-failed',hide);
  window.addEventListener('medindex:auth-ready',event=>{if(event.detail?.authenticated!==true || event.detail.authUser?.adminConsole!==true) hide();});
  window.DRxRuntimeMetrics=Object.freeze({mount});
})();
