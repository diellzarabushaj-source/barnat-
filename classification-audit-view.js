(() => {
  'use strict';

  function installStyles() {
    if (document.getElementById('classificationAuditStyles')) return;
    const style = document.createElement('style');
    style.id = 'classificationAuditStyles';
    style.textContent = `
      .atc-audit{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:0 0 18px;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--paper);box-shadow:0 8px 22px rgba(13,61,64,.06)}
      .atc-audit div{min-width:0;padding:9px;border-radius:10px;background:rgba(21,94,99,.055);text-align:center}.atc-audit strong{display:block;color:var(--teal-dark);font:800 1rem var(--mono)}.atc-audit span{display:block;margin-top:3px;color:#6d7b7f;font-size:.65rem;line-height:1.25;text-transform:uppercase;letter-spacing:.04em}.atc-audit .warn{background:rgba(199,125,31,.11)}.atc-audit .warn strong{color:#8a550f}
      html[data-theme=dark] .atc-audit{background:#122124;border-color:#33474a}html[data-theme=dark] .atc-audit div{background:#182b2e}html[data-theme=dark] .atc-audit strong{color:#edf5f2}html[data-theme=dark] .atc-audit span{color:#aab9b7}
      @media(max-width:800px){.atc-audit{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:480px){.atc-audit{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function render(summary) {
    const workspace = document.getElementById('atcWorkspace');
    if (!workspace || !summary) return;
    let panel = document.getElementById('atcDataAudit');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'atcDataAudit';
      panel.className = 'atc-audit';
      panel.setAttribute('aria-label', 'Audit i plotësisë së databazës');
      workspace.prepend(panel);
    }
    const warningTotal = Number(summary.missingSubstance || 0) + Number(summary.missingClass || 0) + Number(summary.missingUse || 0) + Number(summary.missingForm || 0);
    panel.innerHTML = `
      <div><strong>${summary.total ?? 0}</strong><span>Rreshta</span></div>
      <div><strong>${summary.validAtc ?? 0}</strong><span>ATC të lexueshme</span></div>
      <div class="${summary.missingSubstance ? 'warn' : ''}"><strong>${summary.missingSubstance ?? 0}</strong><span>Pa substancë</span></div>
      <div class="${summary.missingClass ? 'warn' : ''}"><strong>${summary.missingClass ?? 0}</strong><span>Pa klasë</span></div>
      <div class="${summary.missingUse ? 'warn' : ''}"><strong>${summary.missingUse ?? 0}</strong><span>Pa përdorim</span></div>
      <div class="${warningTotal ? 'warn' : ''}"><strong>${summary.corrected ?? 0} / ${summary.blocked ?? 0}</strong><span>Korrigjuar / bllokuar</span></div>`;

    const note = document.getElementById('sourceNote');
    if (note) {
      note.textContent = `${summary.total ?? 0} rreshta u audituan në ngarkim. ${summary.validAtc ?? 0} kanë kod ATC të lexueshëm; ${warningTotal} mungesa u gjetën në fushat klinike kryesore. Rreshtat e bllokuar nuk lejohen në recetë.`;
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