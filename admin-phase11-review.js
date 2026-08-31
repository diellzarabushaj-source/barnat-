(() => {
  'use strict';

  const API='/api/phase11-review';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const state={loaded:false,loading:false,payload:null,currentClinicalKey:''};

  async function request(url,options={}){
    const response=await fetch(url,{
      credentials:'same-origin',
      cache:'no-store',
      headers:{Accept:'application/json','Content-Type':'application/json',...(options.headers||{})},
      ...options,
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||payload.ok===false){
      const error=new Error(payload.error||`Kërkesa dështoi (${response.status}).`);
      error.status=response.status;
      error.code=payload.code||'REQUEST_FAILED';
      throw error;
    }
    return payload;
  }

  const getJson=url=>request(url);
  const postAction=body=>request(API,{method:'POST',body:JSON.stringify(body)});

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
    const identityCoverage=data?.identitySuggestionCoverage||{};
    const icdQuality=data?.icdSuggestionQuality||{};
    const sourceDiscovery=data?.productSourceDiscovery||{};
    const shellDraft=data?.productShellDraft||{};
    const postReview=data?.postReviewPreparation||{};
    const identity=Array.isArray(data?.identityBatches)?data.identityBatches:[];
    const clinical=Array.isArray(data?.clinicalBatches)?data.clinicalBatches:[];
    const shells=Array.isArray(data?.productShells)?data.productShells:[];
    const prepared=Array.isArray(data?.preparedRules)?data.preparedRules:[];
    const productVerification=Array.isArray(data?.productShellVerification)?data.productShellVerification:[];
    const bindings=Array.isArray(data?.bindings)?data.bindings:[];

    if($('p11Foundation'))$('p11Foundation').textContent=completion.foundation_blockers??'—';
    if($('p11Clinical'))$('p11Clinical').textContent=completion.clinical_review_blockers??'—';
    if($('p11Promotion'))$('p11Promotion').textContent=completion.promotion_blockers??'—';
    if($('p11Runtime'))$('p11Runtime').textContent=runtime.ready_for_controlled_cutover?'READY':'BLOCKED';

    if($('p11IdentityBatches'))$('p11IdentityBatches').textContent=`${counts.identityBatches??identity.length} · ${identityCoverage.batches_with_suggestions??0} me sugj.`;
    if($('p11ClinicalBatches'))$('p11ClinicalBatches').textContent=counts.clinicalBatches??clinical.length;
    if($('p11DraftIndications'))$('p11DraftIndications').textContent=`${Math.max(0,Number(counts.indications||0)-Number(counts.publishedIndications||0))} · ${icdQuality.manual_search_required??0} manual`;
    if($('p11ProductShells'))$('p11ProductShells').textContent=`${shellDraft.published_shells||sourceDiscovery.published_shells||0}/${shellDraft.product_shell_candidates||sourceDiscovery.product_shell_candidates||shells.length} · ${shellDraft.identity_capture_review||0} source review`;

    if($('p11IdentityCount'))$('p11IdentityCount').textContent=`${identity.length} batches · ${counts.identityProducts||0} produkte`;
    if($('p11ClinicalCount'))$('p11ClinicalCount').textContent=`${clinical.length} batches · ${postReview.prepared_drafts_to_review||0} draft review`;
    if($('p11ShellCount'))$('p11ShellCount').textContent=`${shells.length} produkte`;
    if($('p11PreparedCount'))$('p11PreparedCount').textContent=`${prepared.length} rules`;
    if($('p11ProductVerificationCount'))$('p11ProductVerificationCount').textContent=`${productVerification.length} shells`;
    if($('p11BindingCount'))$('p11BindingCount').textContent=`${bindings.length} bindings`;

    const identityRows=$('p11IdentityRows');
    if(identityRows){
      identityRows.innerHTML=identity.length?identity.map(row=>`
        <tr>
          <td><strong>${esc(row.composition||'—')}</strong><small>${esc(compactList(row.tradeNames,2))}</small></td>
          <td>${esc(row.productCount)}</td>
          <td><span class="mi-badge is-in_review">${esc(compactList(row.reviewClasses,2))}</span></td>
          <td><button type="button" class="mi-row-btn" data-p11-identity="${esc(row.signature)}">Review</button></td>
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
          <td><button type="button" class="mi-row-btn" data-p11-clinical="${esc(row.doseMoietyKey)}">Review</button></td>
        </tr>`).join('')
        :'<tr><td colspan="5" class="is-empty">Clinical review batches janë mbyllur.</td></tr>';
    }

    const shellRows=$('p11ShellRows');
    if(shellRows){
      shellRows.innerHTML=shells.length?shells.map(row=>`
        <tr>
          <td>${esc(row.registryNumber??'—')}</td>
          <td>
            <strong>${esc(row.tradeName||'—')}</strong>
            <small>${esc(row.identityMatchStatus||'NO_DISCOVERY')} · ${esc(row.sourceTier||'—')} · ${esc(row.externalRegistryId||'—')}</small>
            ${row.sourceUrl?`<small><a href="${esc(row.sourceUrl)}" target="_blank" rel="noopener noreferrer">Burimi zyrtar ↗</a></small>`:''}
          </td>
          <td>${esc(row.form||'—')}</td>
          <td>
            <span class="mi-badge is-in_review">${esc(row.nextAction||'REVIEW')}</span>
            ${row.captureStatus==='STAGED'&&row.captureId?`
              <button type="button" class="mi-row-btn"
                data-p11-product-capture-review="${esc(row.captureId)}"
                data-p11-product-name="${esc(row.tradeName||'')}"
                data-p11-source-url="${esc(row.sourceUrl||'')}">Review source</button>`:''}
            ${row.captureStatus==='VERIFIED'&&!row.productId&&row.captureId?`
              <button type="button" class="mi-row-btn"
                data-p11-product-shell-materialize="${esc(row.captureId)}"
                data-p11-product-name="${esc(row.tradeName||'')}">Krijo DRAFT shell</button>`:''}
          </td>
        </tr>`).join('')
        :'<tr><td colspan="4" class="is-empty">Nuk ka product-shell blockers.</td></tr>';
    }

    const preparedRows=$('p11PreparedRows');
    if(preparedRows){
      preparedRows.innerHTML=prepared.length?prepared.map(row=>{
        const targets=Array.isArray(row.targets)?row.targets:[];
        const pendingTarget=targets.find(t=>t.bindingStatus!=='VERIFIED'&&t.bindingStatus!=='RETIRED');
        const targetStatus=targets.length?compactList(targets.map(t=>t.bindingStatus),3):'MISSING';
        const blockers=Array.isArray(row.validationBlockers)?row.validationBlockers:[];
        let action='<span class="mi-badge is-in_review">BLOCKED</span>';
        if(row.editorialStatus==='draft'&&row.readyForStructuralValidation&&row.safetyValidationStatus!=='passed'){
          action=`<button type="button" class="mi-row-btn" data-p11-prepared-validate="${esc(row.ruleId)}">Validate</button>`;
        }else if(row.editorialStatus==='draft'&&row.safetyValidationStatus==='passed'&&pendingTarget){
          action=`<span style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="mi-row-btn" data-p11-target-review="${esc(pendingTarget.ruleTargetId)}" data-p11-decision="VERIFIED">Verify target</button>
            <button type="button" class="mi-row-btn" data-p11-target-review="${esc(pendingTarget.ruleTargetId)}" data-p11-decision="REJECTED">Reject target</button>
          </span>`;
        }else if(row.editorialStatus==='draft'&&row.readyForRuleReview){
          action=`<button type="button" class="mi-row-btn" data-p11-prepared-review="${esc(row.ruleId)}">Verify rule</button>`;
        }else if(row.editorialStatus==='verified'){
          action=`<button type="button" class="mi-row-btn" data-p11-stage-bindings="${esc(row.ruleId)}">Stage bindings</button>`;
        }else if(row.editorialStatus==='published'){
          action='<span class="mi-badge is-verified">PUBLISHED</span>';
        }
        return `
          <tr>
            <td><strong>${esc(row.ruleKey||'—')}</strong><small>${esc(row.editorialStatus||'—')}</small></td>
            <td>${esc(row.regimenKey||'—')}<small>B${esc(row.branchNo??'—')} / S${esc(row.stepNo??'—')}</small></td>
            <td><span class="mi-badge ${row.safetyValidationStatus==='passed'?'is-verified':'is-in_review'}">${esc(row.safetyValidationStatus||'pending')}</span><small>${esc(compactList(blockers,3))}</small></td>
            <td><span class="mi-badge is-in_review">${esc(targetStatus)}</span></td>
            <td>${action}</td>
          </tr>`;
      }).join(''):'<tr><td colspan="5" class="is-empty">Nuk ka prepared Phase 11 rules.</td></tr>';
    }

    const productVerificationRows=$('p11ProductVerificationRows');
    if(productVerificationRows){
      productVerificationRows.innerHTML=productVerification.length?productVerification.map(row=>{
        const sources=Array.isArray(row.eligibleSources)?row.eligibleSources:[];
        const sourceSelect=sources.length?`
          <select class="mi-search" style="min-width:180px" data-p11-shell-source="${esc(row.productId)}">
            ${sources.map(source=>`<option value="${esc(source.snapshotId)}">${esc(source.sourcePath||source.sourceKey||'SOURCE')} · ${esc(source.documentVersion||source.documentDate||'')}</option>`).join('')}
          </select>`:'—';
        const action=row.editorialStatus==='draft'&&sources.length
          ?`<button type="button" class="mi-row-btn" data-p11-shell-verify="${esc(row.productId)}" data-p11-product-name="${esc(row.tradeName||'')}">Verify shell</button>`
          :`<span class="mi-badge is-in_review">${esc(row.nextAction||row.editorialStatus||'—')}</span>`;
        return `
          <tr>
            <td>${esc(row.registryNumber||'—')}</td>
            <td><strong>${esc(row.tradeName||'—')}</strong><small>${esc(row.form||'')} · ${esc(row.route||'')}</small></td>
            <td><span class="mi-badge ${row.editorialStatus==='verified'||row.editorialStatus==='published'?'is-verified':'is-in_review'}">${esc(row.editorialStatus||'—')}</span></td>
            <td>${sourceSelect}</td>
            <td>${action}</td>
          </tr>`;
      }).join(''):'<tr><td colspan="5" class="is-empty">Nuk ka product shells në verification queue.</td></tr>';
    }

    const bindingRows=$('p11BindingRows');
    if(bindingRows){
      bindingRows.innerHTML=bindings.length?bindings.map(row=>{
        let action=`<span class="mi-badge is-in_review">${esc(row.nextAction||row.bindingStatus||'—')}</span>`;
        if(row.bindingStatus==='candidate'){
          action=`<span style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="mi-row-btn" data-p11-binding-review="${esc(row.bindingId)}" data-p11-decision="verified">Verify</button>
            <button type="button" class="mi-row-btn" data-p11-binding-review="${esc(row.bindingId)}" data-p11-decision="rejected">Reject</button>
          </span>`;
        }
        return `
          <tr>
            <td><strong>${esc(row.ruleKey||'—')}</strong><small>${esc(row.regimenKey||'')}</small></td>
            <td><strong>${esc(row.tradeName||'—')}</strong><small>${esc(row.registryNumber||'')} · ${esc(row.form||'')}</small></td>
            <td>${esc(row.matchMethod||'—')}<small>${row.canonicalMatchCurrent?'canonical current':'STALE/MISMATCH'} · conversion ${row.conversionEnabled?'ON':'OFF'}</small></td>
            <td><span class="mi-badge ${row.bindingStatus==='verified'?'is-verified':'is-in_review'}">${esc(row.bindingStatus||'—')}</span></td>
            <td>${action}</td>
          </tr>`;
      }).join(''):'<tr><td colspan="5" class="is-empty">Nuk ka rule-product bindings.</td></tr>';
    }
  }

  async function loadWorkbench(force=false){
    if(state.loading)return;
    if(state.loaded&&!force)return;
    state.loading=true;
    const button=$('phase11Refresh');
    if(button){button.disabled=true;button.setAttribute('aria-busy','true');}
    try{
      const response=await getJson(API);
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
    if(!dialog.open)dialog.showModal();
  }

  function closeDialog(){
    const dialog=$('phase11DetailDialog');
    if(dialog?.open)dialog.close();
  }

  async function openIdentity(signature){
    openDialog('Identity review','<div class="mi-empty-state">Duke ngarkuar…</div>');
    try{
      const response=await getJson(`${API}?identitySignature=${encodeURIComponent(signature)}`);
      const data=response.payload||{};
      const batch=data.batch||{};
      const products=Array.isArray(data.products)?data.products:[];
      const suggestions=Array.isArray(data.suggestions)?data.suggestions:[];
      openDialog(
        batch.normalized_composition||'Identity review',
        `<div class="mi-editor-section-title"><div><span>Kompozimi</span><small>${esc(batch.product_count||products.length)} produkte</small></div></div>
         <div class="mi-empty-state" style="text-align:left">${esc(batch.normalized_composition||'—')}</div>
         <div class="mi-editor-section-title"><div><span>Canonical suggestions</span><small>${suggestions.length} kandidatë · reviewer vendos</small></div></div>
         <div class="mi-notification-list">${suggestions.length?suggestions.map(x=>`
           <label class="mi-notification-card" style="display:block;cursor:pointer">
             <span class="mi-notification-head"><strong><input type="checkbox" data-p11-concept value="${esc(x.conceptId)}"> ${esc(x.canonicalName||'—')}</strong><small>${esc(x.termType||'')}</small></span>
             <span class="mi-notification-text">Matched: ${esc(x.matchedTerm||'—')} · confidence ${esc(x.confidence??'—')}</span>
           </label>`).join(''):'<div class="mi-empty-state">Nuk u gjetën canonical term suggestions; kërkohet manual concept discovery.</div>'}</div>
         ${suggestions.length?`
           <label class="mi-notification-card" style="display:block;margin-top:12px"><input type="checkbox" data-p11-identity-attest> E kam verifikuar kompozimin dhe canonical concept-et e zgjedhura.</label>
           <button type="button" class="mi-btn-primary" data-p11-identity-apply="${esc(signature)}">Apliko identity mapping</button>
         `:''}
         <div class="mi-table-wrap" style="margin-top:16px"><table class="mi-table"><thead><tr><th>Nr.</th><th>Bari</th><th>Fortësia</th><th>Forma</th></tr></thead><tbody>
         ${products.map(p=>`<tr><td>${esc(p.registryNumber??'—')}</td><td><strong>${esc(p.tradeName||'—')}</strong><small>${esc(p.activeSubstance||'')}</small></td><td>${esc(p.strength||'—')}</td><td>${esc(p.form||'—')}</td></tr>`).join('')}
         </tbody></table></div>`
      );
    }catch(error){
      openDialog('Identity review',`<div class="mi-empty-state">${esc(error.message)}</div>`);
    }
  }

  function actionButtons(kind,decisionApprove,decisionReject,attrs=''){
    return `<span style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
      <button type="button" class="mi-row-btn" data-p11-review-kind="${esc(kind)}" data-p11-decision="${esc(decisionApprove)}" ${attrs}>Aprovo</button>
      <button type="button" class="mi-row-btn" data-p11-review-kind="${esc(kind)}" data-p11-decision="${esc(decisionReject)}" ${attrs}>Refuzo</button>
    </span>`;
  }

  function regimenCard(regimen,batchKey){
    const evidence=Array.isArray(regimen.supportingEvidence)?regimen.supportingEvidence:[];
    const presentation=Array.isArray(regimen.presentationRequirements)?regimen.presentationRequirements:[];
    const administration=Array.isArray(regimen.administrationRequirements)?regimen.administrationRequirements:[];
    const safety=Array.isArray(regimen.applicableSafety)?regimen.applicableSafety:[];
    const steps=Array.isArray(regimen.steps)?regimen.steps:[];
    const approval=regimen.clinicalApprovalGate||{};
    const blockers=approval.clinical_approval_blockers||[];

    const evidenceHtml=evidence.map(row=>`
      <div class="mi-notification-card" style="display:block">
        <span class="mi-notification-head"><strong>${esc(row.role||'Evidence')}</strong><small>${esc(row.reviewStatus||'PENDING')}</small></span>
        <span class="mi-notification-text">${esc(row.sourceUrl||'—')}</span>
        ${actionButtons('evidence-review','VERIFIED','REJECTED',
          `data-p11-regimen="${esc(regimen.regimenKey)}" data-p11-snapshot="${esc(row.sourceSnapshotId)}" data-p11-sha="${esc(row.sourceSectionSha256)}" data-p11-batch="${esc(batchKey)}"`)}
      </div>`).join('');

    const presentationHtml=presentation.map(row=>`
      <div class="mi-notification-card" style="display:block">
        <span class="mi-notification-head"><strong>Presentation B${esc(row.branch)} / S${esc(row.step)}</strong><small>${esc(row.reviewStatus||'PENDING')}</small></span>
        <span class="mi-notification-text">${esc(row.policy||'—')} · ${esc(row.strengthValue??'—')} ${esc(row.strengthUnit||'')} · ${esc(row.formFamily||'—')}</span>
        ${actionButtons('presentation-review','VERIFIED','REJECTED',
          `data-p11-regimen="${esc(regimen.regimenKey)}" data-p11-branch="${esc(row.branch)}" data-p11-step="${esc(row.step)}" data-p11-batch="${esc(batchKey)}"`)}
      </div>`).join('');

    const administrationHtml=administration.map(row=>`
      <div class="mi-notification-card" style="display:block">
        <span class="mi-notification-head"><strong>Administration B${esc(row.branch)} / S${esc(row.step)}</strong><small>${esc(row.reviewStatus||'PENDING')}</small></span>
        <span class="mi-notification-text">${esc(row.foodRequirement||row.timingRequirement||'—')} · ${esc(row.note||'')}</span>
        ${actionButtons('administration-review','VERIFIED','REJECTED',
          `data-p11-regimen="${esc(regimen.regimenKey)}" data-p11-branch="${esc(row.branch)}" data-p11-step="${esc(row.step)}" data-p11-batch="${esc(batchKey)}"`)}
      </div>`).join('');

    const safetyHtml=safety.map(row=>`
      <div class="mi-notification-card" style="display:block">
        <span class="mi-notification-head"><strong>${esc(row.candidateType||'SAFETY')} · ${esc(row.domainOrType||'')}</strong><small>${esc(row.reviewStatus||'PENDING')}</small></span>
        <span class="mi-notification-text">${esc(row.clinicalText||'—')} · ${esc(row.applicabilityScope||'')}</span>
        ${actionButtons('safety-review','APPROVED','REJECTED',
          `data-p11-candidate-type="${esc(row.candidateType)}" data-p11-candidate-key="${esc(row.candidateKey)}" data-p11-batch="${esc(batchKey)}"`)}
      </div>`).join('');

    const canApprove=approval.ready_for_clinical_approval===true;
    const promotion=regimen.promotionGate||{};
    const approved=regimen.reviewStatus==='APPROVED';
    const canPrepareCalculator=approved
      && promotion.intended_runtime_mode==='CALCULATOR_TARGET'
      && promotion.calculator_promotion_ready===true;
    const canFinalizeTextOnly=approved
      && promotion.intended_runtime_mode==='REVIEWED_TEXT_ONLY_TARGET'
      && promotion.text_only_review_ready===true;
    return `
      <article class="mi-notification-card" style="display:block">
        <span class="mi-notification-head"><strong>${esc(regimen.regimenKey||'Regimen')}</strong><small>${esc(regimen.reviewStatus||'PENDING')}</small></span>
        <span class="mi-notification-text">${esc(regimen.indicationLabel||'—')} · ${esc(regimen.patientGroup||'—')} · ${esc(regimen.routeKey||'—')}</span>
        <div class="mi-mini-stats" style="margin-top:12px">
          <div><span>Steps</span><strong>${steps.length}</strong></div>
          <div><span>Evidence</span><strong>${evidence.length}</strong></div>
          <div><span>Safety</span><strong>${safety.length}</strong></div>
          <div><span>Approval</span><strong>${canApprove?'READY':'BLOCKED'}</strong></div>
        </div>
        <small style="display:block;margin-top:10px">Clinical blockers: ${esc(compactList(blockers,8))}</small>

        ${evidenceHtml?'<div class="mi-editor-section-title"><div><span>Evidence review</span></div></div><div class="mi-notification-list">'+evidenceHtml+'</div>':''}
        ${presentationHtml?'<div class="mi-editor-section-title"><div><span>Presentation review</span></div></div><div class="mi-notification-list">'+presentationHtml+'</div>':''}
        ${administrationHtml?'<div class="mi-editor-section-title"><div><span>Administration review</span></div></div><div class="mi-notification-list">'+administrationHtml+'</div>':''}
        ${safetyHtml?'<div class="mi-editor-section-title"><div><span>Safety review</span></div></div><div class="mi-notification-list">'+safetyHtml+'</div>':''}

        <div class="mi-editor-section-title"><div><span>Final clinical decision</span><small>Approval kërkon të gjitha gates = READY.</small></div></div>
        <span style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="mi-btn-primary" data-p11-review-kind="regimen-review" data-p11-decision="APPROVED"
            data-p11-regimen="${esc(regimen.regimenKey)}" data-p11-batch="${esc(batchKey)}" ${canApprove?'':'disabled'}>Aprovo regimen-in</button>
          <button type="button" class="mi-btn-secondary" data-p11-review-kind="regimen-review" data-p11-decision="REJECTED"
            data-p11-regimen="${esc(regimen.regimenKey)}" data-p11-batch="${esc(batchKey)}">Refuzo regimen-in</button>
        </span>
        ${canPrepareCalculator?`
          <div class="mi-editor-section-title"><div><span>Post-review preparation</span><small>Vetëm DRAFT; nuk publikohet.</small></div></div>
          <button type="button" class="mi-btn-primary" data-p11-postreview="prepare"
            data-p11-regimen="${esc(regimen.regimenKey)}" data-p11-batch="${esc(batchKey)}">Përgatit V3 DRAFT rules</button>`:''}
        ${canFinalizeTextOnly?`
          <div class="mi-editor-section-title"><div><span>Text-only finalization</span><small>Nuk krijohen calculator rules.</small></div></div>
          <button type="button" class="mi-btn-primary" data-p11-postreview="finalize-text"
            data-p11-regimen="${esc(regimen.regimenKey)}" data-p11-batch="${esc(batchKey)}">Finalizo si TEXT ONLY</button>`:''}
      </article>`;
  }

  async function openClinical(key){
    state.currentClinicalKey=key;
    openDialog('Clinical batch','<div class="mi-empty-state">Duke ngarkuar…</div>');
    try{
      const response=await getJson(`${API}?clinicalBatchKey=${encodeURIComponent(key)}`);
      const data=response.payload||{};
      const batch=data.batch||{};
      const regimens=Array.isArray(data.regimens)?data.regimens:[];
      openDialog(
        batch.review_target_name||'Clinical batch',
        `<div class="mi-editor-section-title"><div><span>${esc(batch.review_target_name||'Clinical batch')}</span><small>${esc(batch.approved_regimens||0)}/${esc(batch.regimen_count||regimens.length)} approved · ${esc(batch.represented_product_count||0)} produkte</small></div></div>
         <div class="mi-notification-list">${regimens.map(row=>regimenCard(row,key)).join('')||'<div class="mi-empty-state">Nuk ka regimen-e.</div>'}</div>`
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
      const response=await getJson(`${API}?indications=1`);
      const data=response.payload||{};
      const summary=data.summary||{};
      const quality=data.quality||{};
      const items=Array.isArray(data.items)?data.items:[];
      box.className='mi-table-wrap';
      box.innerHTML=`<div class="mi-mini-stats"><div><span>Gjithsej</span><strong>${esc(summary.total||0)}</strong></div><div><span>High/medium</span><strong>${esc((quality.high_quality||0)+(quality.medium_quality||0))}</strong></div><div><span>Manual search</span><strong>${esc(quality.manual_search_required||0)}</strong></div><div><span>ICD verified</span><strong>${esc(summary.icdVerified||0)}</strong></div></div>
      <table class="mi-table"><thead><tr><th>Indikacioni</th><th>Best ICD match</th><th>Score</th><th>Quality</th><th></th></tr></thead><tbody>
      ${items.slice(0,100).map(item=>{
        const first=Array.isArray(item.candidates)?item.candidates[0]:null;
        return `<tr><td><strong>${esc(item.canonicalName||'—')}</strong><small>${esc(item.indicationKey||'')}</small></td><td>${esc(first?.code||'—')}<small>${esc(first?.titleEn||'')}</small></td><td>${esc(item.bestMatchScore??'—')}</td><td><span class="mi-badge is-in_review">${esc(item.suggestionQuality||'NO_CANDIDATE')}</span><small>${item.manualSearchRequired?'Manual search':''}</small></td><td><button type="button" class="mi-row-btn" data-p11-indication-id="${esc(item.indicationId)}" data-p11-indication-name="${esc(item.canonicalName||'')}" data-p11-default-icd="${esc(first?.code||'')}">Review</button></td></tr>`;
      }).join('')}
      </tbody></table>`;
    }catch(error){
      box.className='mi-empty-state';
      box.textContent=error.message;
    }finally{
      if(button)button.disabled=false;
    }
  }


  async function loadAdjustments(){
    const box=$('p11AdjustmentSummary');
    const button=$('p11LoadAdjustments');
    if(!box)return;
    box.className='mi-empty-state';
    box.textContent='Duke ngarkuar…';
    if(button)button.disabled=true;
    try{
      const response=await getJson(`${API}?adjustments=1`);
      const data=response.payload||{};
      const summary=data.summary||{};
      const rows=Array.isArray(data.rows)?data.rows:[];
      box.className='mi-table-wrap';
      box.innerHTML=`
        <div class="mi-mini-stats">
          <div><span>Source candidates</span><strong>${esc(summary.sourceCandidates??0)}</strong></div>
          <div><span>Approved</span><strong>${esc(summary.approvedSourceCandidates??0)}</strong></div>
          <div><span>Ready</span><strong>${esc(summary.readyToMaterialize??0)}</strong></div>
          <div><span>Normalization review</span><strong>${esc(summary.measureNormalizationReview??0)}</strong></div>
        </div>
        <table class="mi-table"><thead><tr><th>Regimen / rule</th><th>Adjustment</th><th>Mapping</th><th>Blockers</th><th>Veprimi</th></tr></thead><tbody>
          ${rows.length?rows.map(row=>`
            <tr>
              <td><strong>${esc(row.regimenKey||'—')}</strong><small>${esc(row.ruleKey||'V3 rule not prepared')}</small></td>
              <td>${esc(row.domain||'—')} · ${esc(row.sourceActionType||'—')}<small>${esc(row.adjustmentKey||'')}</small></td>
              <td>${esc(row.sourceMeasureType||'—')} → ${esc(row.mappedMeasureType||'REVIEW')}<small>${esc(row.mappedDoseAction||'')}</small></td>
              <td>${esc(compactList(row.blockers,4))}</td>
              <td>${row.readyToMaterialize?`<button type="button" class="mi-row-btn" data-p11-adjustment-materialize="${esc(row.adjustmentKey)}" data-p11-rule-id="${esc(row.ruleId)}">Materialize</button>`:'<span class="mi-badge is-in_review">BLOCKED</span>'}</td>
            </tr>`).join(''):'<tr><td colspan="5" class="is-empty">Asnjë adjustment i aprovuar / prepared nuk është gati për projection.</td></tr>'}
        </tbody></table>`;
    }catch(error){
      box.className='mi-empty-state';
      box.textContent=error.message;
    }finally{
      if(button)button.disabled=false;
    }
  }

  async function handlePreparedValidate(button){
    if(!confirm('Ekzekuto structural validation për këtë DRAFT rule? Kjo vetëm vendos validation status; nuk e verifikon ose publikon rule-in.'))return;
    button.disabled=true;
    try{
      await postAction({
        action:'prepared-rule-validate',
        ruleId:button.dataset.p11PreparedValidate,
        attestation:'V3_STRUCTURAL_VALIDATION_ATTESTED',
      });
      state.loaded=false;
      await loadWorkbench(true);
    }catch(error){alert(error.message);}
    finally{button.disabled=false;}
  }

  async function handleTargetReview(button){
    const decision=button.dataset.p11Decision;
    const note=prompt('Review note është i detyrueshëm për rule target:','')||'';
    if(!note.trim())return alert('Review note është i detyrueshëm.');
    if(!confirm(`Konfirmon vendimin ${decision} për canonical rule target?`))return;
    button.disabled=true;
    try{
      await postAction({
        action:'rule-target-review',
        ruleTargetId:button.dataset.p11TargetReview,
        decision,
        reviewNote:note.trim(),
        attestation:'RULE_TARGET_REVIEW_ATTESTED',
      });
      state.loaded=false;
      await loadWorkbench(true);
    }catch(error){alert(error.message);}
    finally{button.disabled=false;}
  }

  async function handlePreparedRuleReview(button){
    const note=prompt('Review note është i detyrueshëm. Konfirmo që DRAFT rule përputhet me regimen-in e aprovuar:','')||'';
    if(!note.trim())return alert('Review note është i detyrueshëm.');
    if(!confirm('Verifiko këtë prepared rule? Kjo nuk e publikon dhe nuk krijon binding automatik.'))return;
    button.disabled=true;
    try{
      await postAction({
        action:'prepared-rule-review',
        ruleId:button.dataset.p11PreparedReview,
        reviewNote:note.trim(),
        attestation:'PREPARED_RULE_REVIEW_ATTESTED',
      });
      state.loaded=false;
      await loadWorkbench(true);
    }catch(error){alert(error.message);}
    finally{button.disabled=false;}
  }

  async function handleStageBindings(button){
    if(!confirm('Stage vetëm canonical candidate product bindings për këtë VERIFIED rule? Conversion dhe publication mbeten OFF.'))return;
    button.disabled=true;
    try{
      await postAction({
        action:'stage-rule-bindings',
        ruleId:button.dataset.p11StageBindings,
        attestation:'RULE_BINDING_STAGING_ATTESTED',
      });
      state.loaded=false;
      await loadWorkbench(true);
    }catch(error){alert(error.message);}
    finally{button.disabled=false;}
  }

  async function handleBindingReview(button){
    const decision=button.dataset.p11Decision;
    const note=prompt('Review note është i detyrueshëm për product binding:','')||'';
    if(!note.trim())return alert('Review note është i detyrueshëm.');
    if(!confirm(`Konfirmon binding decision: ${decision.toUpperCase()}?`))return;
    button.disabled=true;
    try{
      await postAction({
        action:'rule-product-binding-review',
        bindingId:button.dataset.p11BindingReview,
        decision,
        reviewNote:note.trim(),
        attestation:'RULE_PRODUCT_BINDING_REVIEW_ATTESTED',
      });
      state.loaded=false;
      await loadWorkbench(true);
    }catch(error){alert(error.message);}
    finally{button.disabled=false;}
  }

  async function handleProductShellVerify(button){
    const productId=button.dataset.p11ShellVerify;
    const select=document.querySelector(`[data-p11-shell-source="${CSS.escape(productId)}"]`);
    const snapshotId=select?.value||'';
    if(!snapshotId)return alert('Zgjidh exact-market source.');
    const note=prompt('Review note është i detyrueshëm. Përshkruaj exact-market source verification:','')||'';
    if(!note.trim())return alert('Review note është i detyrueshëm.');
    if(!confirm(`Verifiko V3 product shell për "${button.dataset.p11ProductName||'produktin'}" me source-in e zgjedhur?`))return;
    button.disabled=true;
    try{
      await postAction({
        action:'product-shell-review',
        productId,
        snapshotId,
        reviewNote:note.trim(),
        attestation:'PRODUCT_SHELL_REVIEW_ATTESTED',
      });
      state.loaded=false;
      await loadWorkbench(true);
    }catch(error){alert(error.message);}
    finally{button.disabled=false;}
  }

  async function handleAdjustmentMaterialize(button){
    if(!confirm('Materializo adjustment-in e aprovuar në V3 për këtë VERIFIED rule? Kjo nuk e aplikon te pacienti dhe nuk publikon rule-in.'))return;
    button.disabled=true;
    try{
      await postAction({
        action:'materialize-adjustment',
        ruleId:button.dataset.p11RuleId,
        adjustmentKey:button.dataset.p11AdjustmentMaterialize,
        attestation:'V3_ADJUSTMENT_MATERIALIZATION_ATTESTED',
      });
      await loadAdjustments();
      state.loaded=false;
      await loadWorkbench(true);
    }catch(error){alert(error.message);}
    finally{button.disabled=false;}
  }

  async function handleIdentityApply(button){
    const body=$('phase11DetailBody');
    const conceptIds=[...body.querySelectorAll('[data-p11-concept]:checked')].map(node=>node.value);
    const attested=Boolean(body.querySelector('[data-p11-identity-attest]:checked'));
    if(!conceptIds.length)return alert('Zgjidh së paku një canonical concept.');
    if(!attested)return alert('Duhet ta konfirmosh review-in e identity mapping.');
    if(!confirm('Konfirmon se e ke verifikuar kompozimin dhe concept-et e zgjedhura?'))return;
    const note=prompt('Review note (opsionale):','')||'';
    button.disabled=true;
    try{
      await postAction({
        action:'identity-batch-apply',
        compositionSignature:button.dataset.p11IdentityApply,
        conceptIds,
        reviewNote:note,
        attestation:'IDENTITY_REVIEW_ATTESTED',
      });
      closeDialog();
      state.loaded=false;
      await loadWorkbench(true);
      alert('Identity mapping u aplikua me audit trail.');
    }catch(error){
      alert(error.message);
    }finally{button.disabled=false;}
  }

  async function handleProductCaptureReview(button){
    const name=button.dataset.p11ProductName||'produkti';
    const url=button.dataset.p11SourceUrl||'';
    if(!confirm(`Konfirmon se e ke hapur dhe verifikuar burimin zyrtar për "${name}"?\n${url}`))return;
    const note=prompt('Review note është i detyrueshëm. Përshkruaj çfarë verifikove:','')||'';
    if(!note.trim())return alert('Review note është i detyrueshëm.');
    button.disabled=true;
    try{
      await postAction({
        action:'product-identity-capture-review',
        captureId:button.dataset.p11ProductCaptureReview,
        decision:'VERIFIED',
        reviewNote:note.trim(),
        attestation:'PRODUCT_IDENTITY_SOURCE_REVIEW_ATTESTED',
      });
      state.loaded=false;
      await loadWorkbench(true);
    }catch(error){ alert(error.message); }
    finally{ button.disabled=false; }
  }

  async function handleProductShellMaterialize(button){
    const name=button.dataset.p11ProductName||'produkti';
    if(!confirm(`Krijo DRAFT V3 product shell për "${name}"? Kjo nuk publikon dozë, conversion ose binding.`))return;
    button.disabled=true;
    try{
      await postAction({
        action:'product-shell-materialize',
        captureId:button.dataset.p11ProductShellMaterialize,
        attestation:'PRODUCT_SHELL_DRAFT_PREP_ATTESTED',
      });
      state.loaded=false;
      await loadWorkbench(true);
    }catch(error){ alert(error.message); }
    finally{ button.disabled=false; }
  }

  async function handlePostReview(button){
    const kind=button.dataset.p11Postreview;
    const regimenKey=button.dataset.p11Regimen;
    const isText=kind==='finalize-text';
    if(!confirm(isText
      ? `Finalizo ${regimenKey} si TEXT ONLY pa calculator rules?`
      : `Përgatit DRAFT V3 rules/targets për ${regimenKey}? Asgjë nuk publikohet.`
    ))return;
    const note=isText?(prompt('Finalization note (opsionale):','')||''):'';
    button.disabled=true;
    try{
      await postAction({
        action:isText?'finalize-text-only-regimen':'prepare-reviewed-regimen',
        regimenKey,
        reviewNote:note,
        attestation:isText?'TEXT_ONLY_FINALIZATION_ATTESTED':'V3_DRAFT_PREPARATION_ATTESTED',
      });
      state.loaded=false;
      await loadWorkbench(true);
      const batchKey=button.dataset.p11Batch||state.currentClinicalKey;
      if(batchKey)await openClinical(batchKey);
    }catch(error){ alert(error.message); }
    finally{ button.disabled=false; }
  }

  function attestationFor(kind,decision){
    if(kind==='evidence-review'||kind==='presentation-review'||kind==='administration-review')return 'SOURCE_REVIEW_ATTESTED';
    if(kind==='safety-review')return 'SAFETY_REVIEW_ATTESTED';
    if(kind==='regimen-review'&&decision==='APPROVED')return 'CLINICAL_REGIMEN_REVIEW_ATTESTED';
    return '';
  }

  async function handleReviewButton(button){
    const kind=button.dataset.p11ReviewKind;
    const decision=button.dataset.p11Decision;
    const attestation=attestationFor(kind,decision);
    const verb=decision==='REJECTED'?'refuzosh':'aprovosh/verifikosh';
    if(!confirm(`Konfirmon se dëshiron ta ${verb} këtë item pas review-it?`))return;
    const note=prompt('Review note (opsionale):','')||'';
    const body={action:kind,decision,reviewNote:note,attestation};

    if(kind==='evidence-review'){
      Object.assign(body,{
        regimenKey:button.dataset.p11Regimen,
        sourceSnapshotId:button.dataset.p11Snapshot,
        sourceSectionSha256:button.dataset.p11Sha,
      });
    }else if(kind==='presentation-review'||kind==='administration-review'){
      Object.assign(body,{
        regimenKey:button.dataset.p11Regimen,
        branchNo:Number(button.dataset.p11Branch),
        stepNo:Number(button.dataset.p11Step),
      });
    }else if(kind==='safety-review'){
      Object.assign(body,{
        candidateType:button.dataset.p11CandidateType,
        candidateKey:button.dataset.p11CandidateKey,
      });
    }else if(kind==='regimen-review'){
      Object.assign(body,{regimenKey:button.dataset.p11Regimen});
    }

    button.disabled=true;
    try{
      await postAction(body);
      state.loaded=false;
      await loadWorkbench(true);
      const batchKey=button.dataset.p11Batch||state.currentClinicalKey;
      if(batchKey)await openClinical(batchKey);
    }catch(error){
      alert(error.message);
    }finally{button.disabled=false;}
  }

  async function handleIndicationReview(button){
    const defaultCode=button.dataset.p11DefaultIcd||'';
    const name=button.dataset.p11IndicationName||'indikacioni';
    const raw=prompt(`ICD-10 code(s) për "${name}" — ndaj me presje nëse ka më shumë se një:`,defaultCode);
    if(raw===null)return;
    const codes=[...new Set(raw.split(',').map(v=>v.trim().toUpperCase()).filter(Boolean))];
    if(!codes.length)return alert('Shkruaj së paku një ICD-10 code.');
    if(!confirm(`Konfirmon pas review-it klinik se indikacioni dhe ICD code(s) ${codes.join(', ')} janë të sakta?`))return;
    const note=prompt('Review note (opsionale):','')||'';
    button.disabled=true;
    try{
      await postAction({
        action:'indication-publish',
        indicationId:button.dataset.p11IndicationId,
        icd10Codes:codes,
        reviewNote:note,
        attestation:'ICD_AND_INDICATION_REVIEW_ATTESTED',
      });
      state.loaded=false;
      await loadWorkbench(true);
      await loadIndications();
    }catch(error){
      alert(error.message);
    }finally{button.disabled=false;}
  }

  document.addEventListener('click',event=>{
    const nav=event.target.closest('[data-view="phase11"]');
    if(nav)void loadWorkbench(false);

    const identity=event.target.closest('[data-p11-identity]');
    if(identity)void openIdentity(identity.dataset.p11Identity);

    const clinical=event.target.closest('[data-p11-clinical]');
    if(clinical)void openClinical(clinical.dataset.p11Clinical);

    const identityApply=event.target.closest('[data-p11-identity-apply]');
    if(identityApply)void handleIdentityApply(identityApply);

    const review=event.target.closest('[data-p11-review-kind]');
    if(review)void handleReviewButton(review);

    const productCapture=event.target.closest('[data-p11-product-capture-review]');
    if(productCapture)void handleProductCaptureReview(productCapture);

    const shellMaterialize=event.target.closest('[data-p11-product-shell-materialize]');
    if(shellMaterialize)void handleProductShellMaterialize(shellMaterialize);

    const postReview=event.target.closest('[data-p11-postreview]');
    if(postReview)void handlePostReview(postReview);

    const indication=event.target.closest('[data-p11-indication-id]');
    if(indication)void handleIndicationReview(indication);

    const preparedValidate=event.target.closest('[data-p11-prepared-validate]');
    if(preparedValidate)void handlePreparedValidate(preparedValidate);

    const targetReview=event.target.closest('[data-p11-target-review]');
    if(targetReview)void handleTargetReview(targetReview);

    const preparedReview=event.target.closest('[data-p11-prepared-review]');
    if(preparedReview)void handlePreparedRuleReview(preparedReview);

    const stageBindings=event.target.closest('[data-p11-stage-bindings]');
    if(stageBindings)void handleStageBindings(stageBindings);

    const bindingReview=event.target.closest('[data-p11-binding-review]');
    if(bindingReview)void handleBindingReview(bindingReview);

    const shellVerify=event.target.closest('[data-p11-shell-verify]');
    if(shellVerify)void handleProductShellVerify(shellVerify);

    const adjustment=event.target.closest('[data-p11-adjustment-materialize]');
    if(adjustment)void handleAdjustmentMaterialize(adjustment);
  });

  $('phase11Refresh')?.addEventListener('click',()=>void loadWorkbench(true));
  $('p11LoadIndications')?.addEventListener('click',()=>void loadIndications());
  $('p11LoadAdjustments')?.addEventListener('click',()=>void loadAdjustments());
})();
