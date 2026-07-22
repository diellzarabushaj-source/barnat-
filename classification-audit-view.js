(() => {
  'use strict';

  function installStyles() {
    if (document.getElementById('classificationAuditStyles')) return;
    const style = document.createElement('style');
    style.id = 'classificationAuditStyles';
    style.textContent = `
      .atc-audit{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:8px;margin:0 0 18px;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--paper);box-shadow:0 8px 22px rgba(13,61,64,.06)}
      .atc-audit div{min-width:0;padding:9px 6px;border-radius:10px;background:rgba(21,94,99,.055);text-align:center}.atc-audit strong{display:block;color:var(--teal-dark);font:800 1rem var(--mono)}.atc-audit span{display:block;margin-top:3px;color:#6d7b7f;font-size:.62rem;line-height:1.25;text-transform:uppercase;letter-spacing:.035em}.atc-audit .warn{background:rgba(199,125,31,.11)}.atc-audit .warn strong{color:#8a550f}.atc-audit .danger{background:rgba(184,77,77,.12)}.atc-audit .danger strong{color:#9a3434}.atc-audit .ok{background:rgba(21,94,99,.1)}
      html[data-theme=dark] .atc-audit{background:#122124;border-color:#33474a}html[data-theme=dark] .atc-audit div{background:#182b2e}html[data-theme=dark] .atc-audit strong{color:#edf5f2}html[data-theme=dark] .atc-audit span{color:#aab9b7}html[data-theme=dark] .atc-audit .warn{background:#382d1e}html[data-theme=dark] .atc-audit .danger{background:#402326}
      @media(max-width:1100px){.atc-audit{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:600px){.atc-audit{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function number(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function render(summary) {
    const workspace = document.getElementById('atcWorkspace');
    if (!workspace || !summary) return;
    let panel = document.getElementById('atcDataAudit');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'atcDataAudit';
      panel.className = 'atc-audit';
      panel.setAttribute('aria-label', 'Audit i plotësisë dhe cilësisë së databazës');
      workspace.prepend(panel);
    }

    const invalidProtocolNo = number(summary.invalidProtocolNo);
    const invalidPdid = number(summary.invalidPdid);
    const affectedIdentifierRows = Math.max(invalidProtocolNo, invalidPdid);
    const missingClinical = number(summary.missingSubstance) + number(summary.missingClass) + number(summary.missingUse) + number(summary.missingForm) + number(summary.missingStrength);
    panel.innerHTML = `
      <div class="ok"><strong>${number(summary.total)}</strong><span>Rreshta të audituar</span></div>
      <div class="ok"><strong>${number(summary.productLevelAtc)}</strong><span>ATC nivel produkti</span></div>
      <div class="${number(summary.atypicalAtc) ? 'warn' : 'ok'}"><strong>${number(summary.atypicalAtc)}</strong><span>ATC jo-standard</span></div>
      <div class="${affectedIdentifierRows ? 'warn' : 'ok'}"><strong>${affectedIdentifierRows}</strong><span>Rreshta me ID jo-standard</span></div>
      <div class="${number(summary.corrected) ? 'warn' : 'ok'}"><strong>${number(summary.corrected)}</strong><span>Rreshta të korrigjuar</span></div>
      <div class="${number(summary.warning) ? 'warn' : 'ok'}"><strong>${number(summary.warning)}</strong><span>Për verifikim</span></div>
      <div class="${number(summary.blocked) ? 'danger' : 'ok'}"><strong>${number(summary.blocked)}</strong><span>Të bllokuar</span></div>
      <div class="ok"><strong>${number(summary.verified)}</strong><span>Pa alarm auditimi</span></div>`;

    const note = document.getElementById('sourceNote');
    if (note) {
      note.textContent = `${number(summary.total)} rreshta u audituan në ngarkim. ${number(summary.productLevelAtc)} kanë ATC të plotë në nivel produkti; ${number(summary.atypicalAtc)} kode janë jo-standard/placeholder; ${affectedIdentifierRows} rreshta kanë identifikues jo-standard (${invalidProtocolNo} ProtocolNo dhe ${invalidPdid} PDID); ${missingClinical} boshllëqe u gjetën në fushat klinike kryesore. ${number(summary.blocked)} rreshta janë bllokuar nga receta derisa të verifikohen.`;
    }
  }

  function init() {
    installStyles();
    if (window.MEDINDEX_REGISTRY_AUDIT) render(window.MEDINDEX_REGISTRY_AUDIT);
    window.addEventListener('medindex:registry-ready', event => render(event.detail?.summary));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();