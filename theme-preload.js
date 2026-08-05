(() => {
  'use strict';

  try {
    const saved = localStorage.getItem('regjistriBarnave_theme_v1');
    document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light';
  } catch {
    document.documentElement.dataset.theme = 'light';
  }

  if (document.documentElement.dataset.miPage !== 'login') return;

  /* Resolve public assets relative to the current page instead of the domain
     root. This keeps the landing page working both on a custom domain and
     when it is deployed below a project path such as /barnat-/. */
  const assetUrl = path => new URL(String(path || '').replace(/^\/+/, ''), document.baseURI).href;

  /* Critical, fail-safe icon geometry. The Clinical+ card stylesheet remains
     the visual source of truth; these rules only prevent an unstyled inline
     SVG from using the browser's default 300 × 150 size while CSS is loading
     or when an older cached page points at the wrong asset root. */
  const planIconGuard = document.createElement('style');
  planIconGuard.id = 'medindexPlanIconGuard';
  planIconGuard.textContent = `
    html[data-mi-page="login"] .plan-kicker{
      display:flex!important;
      min-width:0!important;
      align-items:center!important;
      justify-content:flex-start!important;
      gap:12px!important;
      margin:0 0 18px!important;
    }
    html[data-mi-page="login"] .plan-kicker .plan-eyebrow{
      margin:0!important;
    }
    html[data-mi-page="login"] .plan-kicker-icon{
      position:relative!important;
      display:block!important;
      width:34px!important;
      height:34px!important;
      min-width:34px!important;
      min-height:34px!important;
      max-width:34px!important;
      max-height:34px!important;
      flex:0 0 34px!important;
      overflow:hidden!important;
      border-radius:11px!important;
      background:linear-gradient(145deg,#6c9bf2 0%,#4779df 48%,#315fc8 100%)!important;
      color:#fff!important;
    }
    html[data-mi-page="login"] .plan-kicker-icon>svg,
    html[data-mi-page="login"] .plan-cta i>svg{
      position:absolute!important;
      width:0!important;
      height:0!important;
      overflow:hidden!important;
      opacity:0!important;
      fill:none!important;
      pointer-events:none!important;
    }
    html[data-mi-page="login"] .plan-kicker-icon::before{
      content:"→";
      position:absolute;
      inset:0;
      display:grid;
      place-items:center;
      color:#fff;
      font-size:18px;
      font-weight:700;
      line-height:1;
    }
    html[data-mi-page="login"] .plan-cta i::before{
      content:"→";
      display:grid;
      width:100%;
      height:100%;
      place-items:center;
      color:currentColor;
      font-size:17px;
      line-height:1;
    }
  `;
  document.head.appendChild(planIconGuard);

  const landingEffects = document.createElement('link');
  landingEffects.rel = 'stylesheet';
  landingEffects.href = assetUrl('landing-effects.css?v=20260805-3');
  landingEffects.dataset.miLandingEffects = 'true';
  document.head.appendChild(landingEffects);

  const soundUiOverride = document.createElement('style');
  soundUiOverride.textContent = 'html[data-mi-page="login"] .ecg-sound-hint{display:none!important}';
  soundUiOverride.dataset.miEcgSoundUi = 'hidden';
  document.head.appendChild(soundUiOverride);

  const soundScript = document.createElement('script');
  soundScript.src = assetUrl('ecg-sound.js?v=20260804-4');
  soundScript.async = true;
  soundScript.dataset.miEcgSound = 'true';
  document.head.appendChild(soundScript);

  function normalizePlanIcons() {
    document.querySelectorAll('.plan-kicker-icon > svg, .plan-cta i > svg').forEach(svg => svg.remove());
  }

  function installSignatureLayer() {
    normalizePlanIcons();

    if (!document.querySelector('link[data-mi-signature-style]')) {
      const signature = document.createElement('link');
      signature.rel = 'stylesheet';
      signature.href = assetUrl('landing-signature.css?v=20260805-3');
      signature.dataset.miSignatureStyle = 'true';
      document.head.appendChild(signature);
    }

    /* Keep the Clinical+ card as the final visual layer. Loading it after the
       signature stylesheet prevents earlier landing rules from resizing or
       recoloring the card arrows and hover states. */
    if (!document.querySelector('link[data-mi-clinical-plan-final]')) {
      const planCard = document.createElement('link');
      planCard.rel = 'stylesheet';
      planCard.href = assetUrl('clinical-plan-card.css?v=20260805-3');
      planCard.dataset.miClinicalPlanFinal = 'true';
      document.head.appendChild(planCard);
    }

    document.documentElement.dataset.miSignature = '20260805-3';
    document.documentElement.dataset.miClinicalPlan = '20260805-3';

    if (!window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;

    const targets = document.querySelectorAll('.plan-block,.artwork,.login-card');
    targets.forEach(target => {
      let frame = 0;
      let nextX = 50;
      let nextY = 50;

      const render = () => {
        frame = 0;
        target.style.setProperty('--mx', `${nextX.toFixed(2)}%`);
        target.style.setProperty('--my', `${nextY.toFixed(2)}%`);
      };

      const schedule = event => {
        const bounds = target.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        nextX = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100));
        nextY = Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100));
        if (!frame) frame = requestAnimationFrame(render);
      };

      const reset = () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        if (target.classList.contains('plan-block')) {
          target.style.setProperty('--mx', '72%');
          target.style.setProperty('--my', '12%');
        } else if (target.classList.contains('login-card')) {
          target.style.setProperty('--mx', '78%');
          target.style.setProperty('--my', '3%');
        } else {
          target.style.setProperty('--mx', '50%');
          target.style.setProperty('--my', '50%');
        }
      };

      target.addEventListener('pointermove', schedule, { passive: true });
      target.addEventListener('pointerleave', reset, { passive: true });
    });
  }

  const scheduleSignatureLayer = () => window.setTimeout(installSignatureLayer, 0);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleSignatureLayer, { once: true });
  } else {
    scheduleSignatureLayer();
  }
})();
