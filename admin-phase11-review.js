(() => {
  'use strict';

  const API='/api/phase11-review';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  const state={loaded:false,loading:false,payload:null};

  async function json(url){
    const response=await fetch(url,{
      credentials:'same-origin',
      cache:'no-store',
      headers:{Accept:'application/json'},
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||payload.ok===false){
      const error=new Error(payload.error||`Kërkesa dështoi (${response.status}).`);
      error.status=response.status;
      throw error;
    }
    return payload;
  }

  function boolLabel(value){
    return value===true?'Po':value===false?'Jo':'—';
  }

  function compactList(items,max=3){
    const values=Array.isArray(items)?items.filter(Boolean):[];
    if(!values.length)return '—';
    const shown=values.slice(0,max).join(', ');
    return values.length>max?`${shown} +${values.length-max}`:shown;
  }

  function renderWorkbench(data){
    state.payload=data;
    const completion=data?.completion||{};
    const runtime=data?.runtime||{};
    const counts=data?.counts||{};
    const identity=Array.isArray(data?.identityBatches)?data.identityBatches:[];
    const clinical=Array.isArray(data?.clinicalBatches)?data.clinicalBatches:[];
    const shells=Array.isArray(data?.productShells)?data.productShells:[];

    if($('p11Foundation'))$('p11Foundation').textContent=completion.foundation_blockers??'—';
    if($('p11Clinical'))$('p11Clinical').textContent=completion.clinical_review_blockers??'—';
    if($('p11Promotion'))$('p11Promotion').textContent=completion.promotion_blockers??'—';
    if($('p11Runtime'))$('p11Runtime').textContent=runtime.ready_for_controlled_cutover?'READY':'BLOCKED';

    if($('p11IdentityBatches'))$('p11IdentityBatches').textContent=counts.identityBatches??identity.length;
    if($('p11ClinicalBatches'))$('p11ClinicalBatches').textContent=counts.clinicalBatches??clinical.length;
    if($('p11DraftIndications'))$('p11DraftIndications').textContent=Math.max(0,Number(counts.indications||0)-Number(counts.publishedIndications||0));
    if($('p11ProductShells'))$('p11ProductShells').textContent=`${counts.publishedProductShells||0}/${counts.productShellItems||shells.length}`;

    if($('p11IdentityCount'))$('p11IdentityCount').textContent=`${identity.length} batches · ${counts.identityProducts||0} produkte`;
    if($('p11ClinicalCount'))$('p11ClinicalCount').textContent=`${clinical.length} batches`;
    if($('p11ShellCount'))$('p11ShellCount').textContent=`${shells.length} produkte`;

    const identityRows=$('p11IdentityRows');
    if(identityRows){
      identityRows.innerHTML=identity.length?identity.map(row=>`
        <tr>
          <td><strong>${esc(row.composition||'—')}</strong><small>${esc(compactList(row.tradeNames,2))}</small></td>
          <td>${esc(row.productCount)}</td>
          <td><span class="mi-badge is-in_review">${esc(compactList(row.reviewClasses,2))}</span></td>
          <td><button type="button" class="mi-row-btn" data-p11-identity="${esc(row.signature)}">Detaje</button></td>
        </tr>`).join('')
        :'<tr><td colspan="4" class="is-empty">Identity review është mbyllur.</td></tr>';
    }

    const clinicalRows=$('p11ClinicalRows');
    if(clinicalRows){
      clinicalRows.innerHTML=clinical.length?clinical.map(row=>`
        <tr>
          <td><strong>${esc(row.name||row.doseMoietyKey||'—')}</strong><small>${esc(row.targetKind||'')}</small></td>
          <td><strong>${esc(row.approvedRegimens||0)}/${esc(row.regimenCount||0)}</strong><small>approved</small></td>
          <td>${esc(row.representedProducts||0)}</td>
          <td><span class="mi-badge is-in_review">${esc(row.nextAction||'REVIEW')}</span></td>
          <td><button type="button" class="mi-row-btn" data-p11-clinical="${esc(row.doseMoietyKey)}">Detaje</button></td>
        </tr>`).join('')
        :'<tr><td colspan="5" class="is-empty">Clinical review batches janë mbyllur.</td></tr>';
    }

    const shellRows=$('p11ShellRows');
    if(shellRows){
      shellRows.innerHTML=shells.length?shells.map(row=>`
        <tr>
          <td>${esc(row.registryNumber??'—')}</td>
          <td><strong>${esc(row.tradeName||'—')}</strong><small>${esc(row.exactMarketSourceKey||'Pa exact-market source')}</small></td>
          <td>${esc(row.form||'—')}</td>
          <td><span class="mi-badge is-in_review">${esc(row.nextAction||'REVIEW')}</span></td>
        </tr>`).join('')
        :'<tr><td colspan="4" class="is-empty">Nuk ka product-shell blockers.</td></tr>';
    }
  }

  async function loadWorkbench(force=false){
    if(state.loading)return;
    if(state.loaded&&!force)return;
    state.loading=true;
    const button=$('phase11Refresh');
    if(button){button.disabled=true;button.setAttribute('aria-busy','true');}
    try{
      const response=await json(API);
      renderWorkbench(response.payload||{});
      state.loaded=true;
    }catch(error){
      for(const id of ['p11IdentityRows','p11ClinicalRows','p11ShellRows']){
        const node=$(id);
        if(node)node.innerHTML=`<tr><td colspan="5" class="is-empty">${esc(error.message)}</td></tr>`;
      }
    }finally{
      state.loading=false;
      if(button){button.disabled=false;button.setAttribute('aria-busy','false');}
    }
  }

  function openDialog(title,html){
    const dialog=$('phase11DetailDialog');
    if(!dialog)return;
    $('phase11DetailTitle').textContent=title;
    $('phase11DetailBody').innerHTML=html;
    dialog.showModal();
  }

  async function openIdentity(signature){
    openDialog('Identity review','<div class="mi-empty-state">Duke ngarkuar…</div>');
    try{
      const response=await json(`${API}?identitySignature=${encodeURIComponent(signature)}`);
      const data=response.payload||{};
      const batch=data.batch||{};
      const products=Array.isArray(data.products)?data.products:[];
      openDialog(
        batch.normalized_composition||'Identity review',
        `<div class="mi-editor-section-title"><div><span>Kompozimi</span><small>${esc(batch.product_count||products.length)} produkte · read-only</small></div></div>
         <div class="mi-empty-state" style="text-align:left">${esc(batch.normalized_composition||'—')}</div>
         <div class="mi-table-wrap"><table class="mi-table"><thead><tr><th>Nr.</th><th>Bari</th><th>Fortësia</th><th>Forma</th></tr></thead><tbody>
         ${products.map(p=>`<tr><td>${esc(p.registryNumber??'—')}</td><td><strong>${esc(p.tradeName||'—')}</strong><small>${esc(p.activeSubstance||'')}</small></td><td>${esc(p.strength||'—')}</td><td>${esc(p.form||'—')}</td></tr>`).join('')}
         </tbody></table></div>`
      );
    }catch(error){
      openDialog('Identity review',`<div class="mi-empty-state">${esc(error.message)}</div>`);
    }
  }

  function regimenCard(regimen){
    const evidence=Array.isArray(regimen.supportingEvidence)?regimen.supportingEvidence:[];
    const presentation=Array.isArray(regimen.presentationRequirements)?regimen.presentationRequirements:[];
    const administration=Array.isArray(regimen.administrationRequirements)?regimen.administrationRequirements:[];
    const steps=Array.isArray(regimen.steps)?regimen.steps:[];
    const gate=regimen.promotionGate||{};
    return `
      <article class="mi-notification-card" style="display:block">
        <span class="mi-notification-head"><strong>${esc(regimen.regimenKey||'Regimen')}</strong><small>${esc(regimen.reviewStatus||'PENDING')}</small></span>
        <span class="mi-notification-text">${esc(regimen.indicationLabel||'—')} · ${esc(regimen.patientGroup||'—')} · ${esc(regimen.routeKey||'—')}</span>
        <div class="mi-mini-stats" style="margin-top:12px">
          <div><span>Steps</span><strong>${steps.length}</strong></div>
          <div><span>Evidence</span><strong>${evidence.length}</strong></div>
          <div><span>Presentation</span><strong>${presentation.length}</strong></div>
          <div><span>Administration</span><strong>${administration.length}</strong></div>
        </div>
        <small style="display:block;margin-top:10px">Promotion blockers: ${esc(compactList(gate.promotion_blockers_v6||gate.promotion_blockers||[],6))}</small>
      </article>`;
  }

  async function openClinical(key){
    openDialog('Clinical batch','<div class="mi-empty-state">Duke ngarkuar…</div>');
    try{
      const response=await json(`${API}?clinicalBatchKey=${encodeURIComponent(key)}`);
      const data=response.payload||{};
      const batch=data.batch||{};
      const regimens=Array.isArray(data.regimens)?data.regimens:[];
      openDialog(
        batch.review_target_name||'Clinical batch',
        `<div class="mi-editor-section-title"><div><span>${esc(batch.review_target_name||'Clinical batch')}</span><small>${esc(batch.approved_regimens||0)}/${esc(batch.regimen_count||regimens.length)} approved · ${esc(batch.represented_product_count||0)} produkte</small></div></div>
         <div class="mi-notification-list">${regimens.map(regimenCard).join('')||'<div class="mi-empty-state">Nuk ka regimen-e.</div>'}</div>`
      );
    }catch(error){
      openDialog('Clinical batch',`<div class="mi-empty-state">${esc(error.message)}</div>`);
    }
  }

  async function loadIndications(){
    const box=$('p11IndicationSummary');
    const button=$('p11LoadIndications');
    if(!box)return;
    box.className='mi-empty-state';
    box.textContent='Duke ngarkuar…';
    if(button)button.disabled=true;
    try{
      const response=await json(`${API}?indications=1`);
      const data=response.payload||{};
      const summary=data.summary||{};
      const items=Array.isArray(data.items)?data.items:[];
      box.className='mi-table-wrap';
      box.innerHTML=`<div class="mi-mini-stats"><div><span>Gjithsej</span><strong>${esc(summary.total||0)}</strong></div><div><span>Published</span><strong>${esc(summary.published||0)}</strong></div><div><span>Draft</span><strong>${esc(summary.draft||0)}</strong></div><div><span>ICD verified</span><strong>${esc(summary.icdVerified||0)}</strong></div></div>
      <table class="mi-table"><thead><tr><th>Indikacioni</th><th>Best ICD match</th><th>Score</th><th>Statusi</th></tr></thead><tbody>
      ${items.slice(0,100).map(item=>{
        const first=Array.isArray(item.candidates)?item.candidates[0]:null;
        return `<tr><td><strong>${esc(item.canonicalName||'—')}</strong><small>${esc(item.indicationKey||'')}</small></td><td>${esc(first?.code||'—')}<small>${esc(first?.titleEn||'')}</small></td><td>${esc(item.bestMatchScore??'—')}</td><td><span class="mi-badge is-in_review">${esc(item.editorialStatus||'draft')}</span></td></tr>`;
      }).join('')}
      </tbody></table>`;
    }catch(error){
      box.className='mi-empty-state';
      box.textContent=error.message;
    }finally{
      if(button)button.disabled=false;
    }
  }

  document.addEventListener('click',event=>{
    const nav=event.target.closest('[data-view="phase11"]');
    if(nav)void loadWorkbench(false);
    const identity=event.target.closest('[data-p11-identity]');
    if(identity)void openIdentity(identity.dataset.p11Identity);
    const clinical=event.target.closest('[data-p11-clinical]');
    if(clinical)void openClinical(clinical.dataset.p11Clinical);
  });

  $('phase11Refresh')?.addEventListener('click',()=>void loadWorkbench(true));
  $('p11LoadIndications')?.addEventListener('click',()=>void loadIndications());
})();
