'use strict';

(() => {
  const STRIP_COUNT = 128;
  const ACTIVE_RADIUS = 10;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function buildBeatPath(startX, baseline = 100) {
    return [
      `M${startX} ${baseline}`,
      `L${startX + 30} ${baseline}`,
      `C${startX + 38} ${baseline} ${startX + 42} ${baseline - 12} ${startX + 52} ${baseline - 12}`,
      `C${startX + 62} ${baseline - 12} ${startX + 66} ${baseline} ${startX + 78} ${baseline}`,
      `L${startX + 104} ${baseline}`,
      `L${startX + 112} ${baseline + 5}`,
      `L${startX + 120} ${baseline - 56}`,
      `L${startX + 130} ${baseline + 50}`,
      `L${startX + 143} ${baseline - 16}`,
      `L${startX + 156} ${baseline}`,
      `L${startX + 185} ${baseline}`,
      `C${startX + 197} ${baseline} ${startX + 201} ${baseline - 20} ${startX + 219} ${baseline - 20}`,
      `C${startX + 239} ${baseline - 20} ${startX + 247} ${baseline} ${startX + 268} ${baseline}`,
      `L${startX + 300} ${baseline}`,
    ].join(' ');
  }

  function ensureClinicalPulseStyles() {
    if (document.getElementById('medindexClinicalPulseStyles')) return;
    const style = document.createElement('style');
    style.id = 'medindexClinicalPulseStyles';
    style.textContent = `
      html[data-mi-page="login"] .clinical-pulse{position:absolute;z-index:5;top:50%;left:7.5%;width:88.5%;height:118px;pointer-events:none;overflow:hidden;opacity:.82;transform:translateY(-50%);filter:drop-shadow(0 7px 18px rgba(27,76,184,.18));-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 4%,#000 95%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 4%,#000 95%,transparent 100%);transition:opacity .38s ease,transform .55s cubic-bezier(.2,.8,.2,1),filter .38s ease}
      html[data-mi-page="login"] .ekg-track{transform-box:view-box;transform-origin:0 50%;will-change:transform;animation:medindexEkgStrip 3.2s linear infinite}
      html[data-mi-page="login"] .ekg-glow,html[data-mi-page="login"] .ekg-line{fill:none;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round}
      html[data-mi-page="login"] .ekg-glow{stroke:rgba(68,134,255,.42);stroke-width:10;filter:blur(5px)}
      html[data-mi-page="login"] .ekg-line{stroke:rgba(255,255,255,.97);stroke-width:2.45}
      html[data-mi-page="login"] .ekg-sweep{position:absolute;z-index:6;top:22%;bottom:22%;left:8%;width:2px;pointer-events:none;opacity:.52;background:linear-gradient(180deg,transparent,rgba(255,255,255,.92),transparent);box-shadow:0 0 10px rgba(255,255,255,.78),0 0 25px rgba(52,118,247,.56);animation:medindexEkgSweep 3.2s linear infinite}
      html[data-mi-page="login"] .heart-beacon{position:absolute;z-index:7;top:50%;left:2.2%;display:grid;width:58px;height:58px;place-items:center;pointer-events:none;border:1px solid rgba(255,255,255,.62);border-radius:18px;background:linear-gradient(145deg,rgba(255,255,255,.3),rgba(112,159,255,.18));box-shadow:0 14px 34px rgba(35,74,164,.22),inset 0 1px 0 rgba(255,255,255,.78);transform:translateY(-50%);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transition:transform .45s cubic-bezier(.2,.8,.2,1),box-shadow .35s ease,background .35s ease}
      html[data-mi-page="login"] .heart-beacon::after{content:"";position:absolute;inset:8px;border:1px solid rgba(255,255,255,.24);border-radius:13px}
      html[data-mi-page="login"] .heart-icon{width:29px;height:29px;overflow:visible;filter:drop-shadow(0 5px 12px rgba(24,78,199,.3));animation:medindexHeartBeat .8s cubic-bezier(.2,.7,.25,1) infinite}
      html[data-mi-page="login"] .heart-icon path{fill:rgba(35,108,238,.92);stroke:rgba(255,255,255,.96);stroke-width:1.8;vector-effect:non-scaling-stroke}
      html[data-mi-page="login"] .heart-pulse-ring{position:absolute;inset:12px;border:1px solid rgba(255,255,255,.7);border-radius:50%;opacity:0;animation:medindexHeartRing .8s ease-out infinite}
      html[data-mi-page="login"] .artwork-label{z-index:8!important}
      @media(hover:hover) and (pointer:fine){html[data-mi-page="login"] .visual-login:hover .clinical-pulse{opacity:1;transform:translateY(-50%) scaleY(1.035);filter:drop-shadow(0 11px 26px rgba(26,81,205,.3))}html[data-mi-page="login"] .visual-login:hover .heart-beacon{background:linear-gradient(145deg,rgba(255,255,255,.4),rgba(94,147,255,.27));box-shadow:0 18px 44px rgba(35,74,164,.3),inset 0 1px 0 rgba(255,255,255,.88);transform:translateY(-50%) scale(1.06) rotate(-2deg)}}
      @media(max-width:600px){html[data-mi-page="login"] .clinical-pulse{left:12%;width:84%;height:74px;opacity:.88}html[data-mi-page="login"] .ekg-sweep{left:12%}html[data-mi-page="login"] .heart-beacon{left:2.5%;width:42px;height:42px;border-radius:13px}html[data-mi-page="login"] .heart-beacon::after{inset:6px;border-radius:9px}html[data-mi-page="login"] .heart-icon{width:22px;height:22px}html[data-mi-page="login"] .heart-pulse-ring{inset:8px}}
      @media(prefers-reduced-motion:reduce){html[data-mi-page="login"] .ekg-track,html[data-mi-page="login"] .ekg-sweep,html[data-mi-page="login"] .heart-icon,html[data-mi-page="login"] .heart-pulse-ring{animation:none!important}html[data-mi-page="login"] .clinical-pulse,html[data-mi-page="login"] .heart-beacon{transition:none!important}}
      @keyframes medindexEkgStrip{to{transform:translateX(-1200px)}}
      @keyframes medindexEkgSweep{from{transform:translateX(0);opacity:0}8%{opacity:.72}92%{opacity:.72}to{transform:translateX(80vw);opacity:0}}
      @keyframes medindexHeartBeat{0%,100%{transform:scale(1)}12%{transform:scale(1.17)}24%{transform:scale(1.02)}34%{transform:scale(1.1)}46%,86%{transform:scale(1)}}
      @keyframes medindexHeartRing{0%,8%{opacity:0;transform:scale(.72)}16%{opacity:.64}48%,100%{opacity:0;transform:scale(1.55)}}
    `;
    document.head.appendChild(style);
  }

  function ensureLoginPolishStyles() {
    if (document.getElementById('medindexLoginPolishStyles')) return;
    const style = document.createElement('style');
    style.id = 'medindexLoginPolishStyles';
    style.textContent = `
      html[data-mi-page="login"] .login-modal::backdrop{background:radial-gradient(circle at 50% 100%,rgba(54,95,210,.28),transparent 38%),rgba(18,23,32,.6)!important;backdrop-filter:blur(22px) saturate(.85)!important;-webkit-backdrop-filter:blur(22px) saturate(.85)!important}
      html[data-mi-page="login"] .login-stage{width:min(520px,100%)!important}
      html[data-mi-page="login"] .login-card{position:relative;isolation:isolate;overflow:hidden;padding:34px 34px 27px!important;border:1px solid rgba(255,255,255,.96)!important;border-radius:30px!important;background:radial-gradient(circle at 100% 0,rgba(102,145,255,.13),transparent 34%),linear-gradient(145deg,rgba(255,255,255,.995),rgba(248,250,255,.975))!important;box-shadow:0 44px 120px rgba(11,20,40,.34),0 3px 0 rgba(255,255,255,.9) inset!important;backdrop-filter:blur(24px)!important;-webkit-backdrop-filter:blur(24px)!important}
      html[data-mi-page="login"] .login-card::before{content:"";position:absolute;z-index:-1;top:0;right:0;left:0;height:5px;background:linear-gradient(90deg,#82c8f2,#4777e5 55%,#234aa9);box-shadow:0 7px 24px rgba(71,119,229,.2)}
      html[data-mi-page="login"] .login-card::after{content:"";position:absolute;z-index:-1;top:-105px;right:-85px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.88),rgba(107,151,255,.13) 34%,transparent 68%);pointer-events:none}
      html[data-mi-page="login"] .login-modal-close{top:-15px!important;right:-15px!important;width:48px!important;height:48px!important;border:1px solid rgba(255,255,255,.9)!important;background:linear-gradient(145deg,#20232a,#090a0c)!important;box-shadow:0 16px 38px rgba(9,13,24,.32),inset 0 1px 0 rgba(255,255,255,.18)!important;font-size:25px!important;transition:transform .3s cubic-bezier(.2,.8,.2,1),box-shadow .3s ease,background .3s ease}
      html[data-mi-page="login"] .login-card-brand{gap:12px!important;margin-bottom:20px!important}
      html[data-mi-page="login"] .login-card-brand img{width:42px!important;height:42px!important;flex-basis:42px!important}
      html[data-mi-page="login"] .login-card-brand strong{color:#151923;font-size:14px!important;font-weight:850;letter-spacing:-.025em}
      html[data-mi-page="login"] .login-card-brand small{color:#8f97a7!important;font-size:7.5px!important;letter-spacing:.145em!important}
      html[data-mi-page="login"] .status{min-height:30px!important;margin-bottom:23px!important;padding:0 12px!important;border-color:rgba(20,125,120,.13)!important;background:rgba(239,248,246,.88)!important;color:#506e6c!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.95)}
      html[data-mi-page="login"] .status::before{width:8px!important;height:8px!important;box-shadow:0 0 0 5px rgba(22,134,127,.1),0 0 18px rgba(22,134,127,.24)!important}
      html[data-mi-page="login"] .login-card header{max-width:420px}
      html[data-mi-page="login"] .login-card h2{font-size:40px!important;font-weight:840!important;letter-spacing:-.062em!important;line-height:.98!important}
      html[data-mi-page="login"] .login-copy{max-width:410px;margin-top:13px!important;color:#7b8290!important;font-size:12px!important;line-height:1.62!important}
      html[data-mi-page="login"] .google-login-panel{gap:10px!important;margin-top:25px!important}
      html[data-mi-page="login"] .google-login-heading{color:#343a47!important;font-size:10px!important;font-weight:850!important;letter-spacing:.025em}
      html[data-mi-page="login"] .google-login-button{position:relative;min-height:62px!important;padding:5px 12px!important;overflow:hidden!important;border:1.5px solid #e1e5ec!important;border-radius:15px!important;background:rgba(255,255,255,.96)!important;box-shadow:0 9px 24px rgba(33,45,76,.055),inset 0 1px 0 rgba(255,255,255,.95);transition:border-color .25s ease,box-shadow .25s ease,transform .28s cubic-bezier(.2,.8,.2,1),background .25s ease}
      html[data-mi-page="login"] .google-login-button::before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(105deg,transparent 32%,rgba(82,122,245,.07) 49%,transparent 66%);transform:translateX(-120%);transition:transform .65s ease}
      html[data-mi-page="login"] .google-login-button>div,html[data-mi-page="login"] .google-login-button iframe{position:relative;z-index:1;max-width:100%!important;margin-inline:auto!important}
      html[data-mi-page="login"] .google-login-status{min-height:15px!important;color:#8b92a0!important;font-size:8.5px!important}
      html[data-mi-page="login"] .account{min-height:50px!important;gap:11px!important;margin-top:14px!important;padding:11px 13px!important;border-color:rgba(20,125,120,.14)!important;border-radius:14px!important;background:linear-gradient(135deg,rgba(238,248,246,.96),rgba(244,250,250,.82))!important;color:#315e5d!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.92)}
      html[data-mi-page="login"] .account::before{width:24px!important;height:24px!important;flex-basis:24px!important;box-shadow:0 7px 16px rgba(15,119,121,.18)}
      html[data-mi-page="login"] .password-fallback{margin-top:17px!important;padding-top:16px!important;border-top-color:rgba(111,120,141,.13)!important}
      html[data-mi-page="login"] .password-fallback summary{min-height:49px!important;padding:0 13px;border:1px solid rgba(102,112,136,.11);border-radius:14px;background:rgba(255,255,255,.72);color:#687083!important;box-shadow:0 7px 20px rgba(36,47,76,.045),inset 0 1px 0 rgba(255,255,255,.92);transition:border-color .25s ease,background .25s ease,color .25s ease,transform .28s cubic-bezier(.2,.8,.2,1),box-shadow .25s ease}
      html[data-mi-page="login"] .password-fallback summary::after{width:8px!important;height:8px!important;margin-left:auto!important;border-color:#4777e5!important;transition:transform .28s ease}
      html[data-mi-page="login"] .password-fallback[open] summary{border-color:rgba(71,119,229,.18);background:#f5f8ff;color:#3659a6!important;box-shadow:0 9px 24px rgba(47,72,132,.07),inset 0 1px 0 #fff}
      html[data-mi-page="login"] .login-divider{margin:13px 0 15px!important;color:#939aa8!important;letter-spacing:.11em}
      html[data-mi-page="login"] .floating-password{position:relative;display:flex!important;min-height:58px;align-items:center;gap:0!important;overflow:hidden;border:1.5px solid #e1e5ec;border-radius:14px;background:#fff;box-shadow:0 7px 20px rgba(39,51,82,.045),inset 0 1px 0 rgba(255,255,255,.96);transition:border-color .24s ease,box-shadow .24s ease,transform .28s cubic-bezier(.2,.8,.2,1)}
      html[data-mi-page="login"] .floating-password:focus-within{border-color:#4777e5;box-shadow:0 0 0 4px rgba(71,119,229,.11),0 13px 28px rgba(48,72,132,.1);transform:translateY(-1px)}
      html[data-mi-page="login"] .password-field-icon{position:absolute;z-index:2;left:15px;top:50%;display:grid;width:20px;height:20px;place-items:center;color:#74809a;transform:translateY(-50%);pointer-events:none;transition:color .22s ease,transform .24s ease}
      html[data-mi-page="login"] .password-field-icon svg{display:block;width:19px;height:19px;fill:currentColor}
      html[data-mi-page="login"] .floating-password:focus-within .password-field-icon{color:#4777e5;transform:translateY(-50%) scale(1.05)}
      html[data-mi-page="login"] .floating-password input{min-height:56px!important;flex:1;padding:21px 72px 7px 45px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;outline:none!important;font-size:14px!important}
      html[data-mi-page="login"] .floating-password label{position:absolute;z-index:1;top:18px;left:45px;margin:0!important;color:#8a91a0!important;font-size:12px!important;font-weight:600!important;line-height:1;pointer-events:none;transform-origin:left top;transition:transform .2s ease,color .2s ease,font-size .2s ease}
      html[data-mi-page="login"] .floating-password input:focus~label,html[data-mi-page="login"] .floating-password input:not(:placeholder-shown)~label{color:#4777e5!important;font-size:9px!important;transform:translateY(-9px)}
      html[data-mi-page="login"] .floating-password #togglePassword{position:absolute;z-index:3;top:7px;right:7px;min-width:58px;min-height:42px!important;padding:0 11px!important;border:0!important;border-radius:10px!important;background:#f2f5fb!important;color:#4d5a73!important;box-shadow:none!important;transition:background .22s ease,color .22s ease,transform .22s ease}
      html[data-mi-page="login"] .password-focus-bar{position:absolute;right:0;bottom:0;left:0;height:2px;background:linear-gradient(90deg,#7fc8ef,#4777e5,#294eaf);transform:scaleX(0);transform-origin:center;transition:transform .25s ease}
      html[data-mi-page="login"] .floating-password:focus-within .password-focus-bar{transform:scaleX(1)}
      html[data-mi-page="login"] .login-submit{min-height:52px!important;margin-top:12px!important;padding:0 17px!important;border-radius:13px!important;background:linear-gradient(135deg,#161922,#08090c)!important;box-shadow:0 13px 28px rgba(14,18,29,.2);letter-spacing:.01em;transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s ease,background .25s ease,opacity .25s ease}
      html[data-mi-page="login"] .login-submit span:last-child{display:grid;width:28px;height:28px;place-items:center;border-radius:9px;background:rgba(255,255,255,.11)}
      html[data-mi-page="login"] .login-submit:disabled{cursor:not-allowed;opacity:.56}
      html[data-mi-page="login"] .login-meta{flex-wrap:wrap;gap:6px!important;margin-top:17px!important;white-space:normal!important}
      html[data-mi-page="login"] .login-meta span{display:inline-flex;min-height:25px;align-items:center;padding:0 9px;border:1px solid rgba(94,105,131,.09);border-radius:999px;background:rgba(246,248,252,.86);color:#8a91a0}
      html[data-mi-page="login"] .login-meta span+span::before{display:none!important}
      @media(hover:hover) and (pointer:fine){html[data-mi-page="login"] .login-modal-close:hover{background:linear-gradient(145deg,#2a2f3a,#111318)!important;box-shadow:0 20px 44px rgba(9,13,24,.4),inset 0 1px 0 rgba(255,255,255,.2)!important;transform:rotate(90deg) scale(1.04)}html[data-mi-page="login"] .google-login-button:hover{border-color:rgba(71,119,229,.42)!important;background:#fff!important;box-shadow:0 0 0 4px rgba(71,119,229,.075),0 15px 32px rgba(45,67,121,.1);transform:translateY(-2px)}html[data-mi-page="login"] .google-login-button:hover::before{transform:translateX(120%)}html[data-mi-page="login"] .password-fallback summary:hover{border-color:rgba(71,119,229,.22);background:#f8faff;color:#405f9f!important;box-shadow:0 11px 26px rgba(47,67,118,.075),inset 0 1px 0 #fff;transform:translateY(-1px)}html[data-mi-page="login"] .floating-password #togglePassword:hover{background:#e8eefb!important;color:#3159ad!important;transform:translateY(-1px)}html[data-mi-page="login"] .login-submit:hover:not(:disabled){background:linear-gradient(135deg,#222938,#0f131b)!important;box-shadow:0 18px 35px rgba(14,18,29,.27);transform:translateY(-2px)}}
      @media(max-width:600px){html[data-mi-page="login"] .login-stage{width:min(410px,100%)!important}html[data-mi-page="login"] .login-card{padding:27px 19px 22px!important;border-radius:26px!important}html[data-mi-page="login"] .login-card h2{font-size:33px!important;text-align:center}html[data-mi-page="login"] .login-copy{text-align:center}html[data-mi-page="login"] .login-card header{margin-inline:auto}html[data-mi-page="login"] .status{margin-inline:auto!important}html[data-mi-page="login"] .google-login-panel{margin-top:21px!important}html[data-mi-page="login"] .google-login-button{min-height:58px!important;padding-inline:6px!important}html[data-mi-page="login"] .account{font-size:8.5px!important}html[data-mi-page="login"] .login-modal-close{top:-10px!important;right:-6px!important;width:44px!important;height:44px!important}}
      @media(prefers-reduced-motion:reduce){html[data-mi-page="login"] .login-modal-close,html[data-mi-page="login"] .google-login-button,html[data-mi-page="login"] .password-fallback summary,html[data-mi-page="login"] .floating-password,html[data-mi-page="login"] .password-field-icon,html[data-mi-page="login"] .floating-password label,html[data-mi-page="login"] .floating-password #togglePassword,html[data-mi-page="login"] .password-focus-bar,html[data-mi-page="login"] .login-submit{transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function enhanceLoginModal() {
    const card = document.querySelector('.login-card');
    if (!card || card.dataset.polished === 'true') return;
    card.dataset.polished = 'true';
    const row = card.querySelector('.password-row');
    const input = document.getElementById('password');
    const toggle = document.getElementById('togglePassword');
    const label = card.querySelector('label[for="password"]');
    if (row && input && toggle && label) {
      row.classList.add('floating-password');
      input.setAttribute('placeholder', ' ');
      const icon = document.createElement('span');
      icon.className = 'password-field-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-6a3 3 0 0 0-3-3Zm-7-2a2 2 0 1 1 4 0v2h-4V7Zm3 9.73V18h-2v-1.27a2 2 0 1 1 2 0Z"/></svg>';
      const focusBar = document.createElement('span');
      focusBar.className = 'password-focus-bar';
      focusBar.setAttribute('aria-hidden', 'true');
      row.prepend(icon);
      row.insertBefore(label, toggle);
      row.appendChild(focusBar);
    }
  }

  function ensureClinicalPulse(artwork) {
    if (artwork.querySelector('.clinical-pulse')) return;
    const heart = document.createElement('span');
    heart.className = 'heart-beacon';
    heart.setAttribute('aria-hidden', 'true');
    const heartRing = document.createElement('span');
    heartRing.className = 'heart-pulse-ring';
    const heartSvg = document.createElementNS(SVG_NS, 'svg');
    heartSvg.setAttribute('class', 'heart-icon');
    heartSvg.setAttribute('viewBox', '0 0 32 29');
    heartSvg.setAttribute('focusable', 'false');
    heartSvg.setAttribute('aria-hidden', 'true');
    const heartPath = document.createElementNS(SVG_NS, 'path');
    heartPath.setAttribute('d', 'M16 27.2 3.1 15.1C-2.7 9.7.8.2 8.8.2c3.1 0 5.8 1.7 7.2 4.2C17.4 1.9 20.1.2 23.2.2c8 0 11.5 9.5 5.7 14.9L16 27.2Z');
    heartSvg.appendChild(heartPath);
    heart.append(heartRing, heartSvg);
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'clinical-pulse');
    svg.setAttribute('viewBox', '0 0 1200 200');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'ekg-track');
    const pathData = Array.from({ length: 8 }, (_, index) => buildBeatPath(index * 300)).join(' ');
    const glow = document.createElementNS(SVG_NS, 'path');
    glow.setAttribute('class', 'ekg-glow');
    glow.setAttribute('d', pathData);
    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('class', 'ekg-line');
    line.setAttribute('d', pathData);
    group.append(glow, line);
    svg.appendChild(group);
    const sweep = document.createElement('span');
    sweep.className = 'ekg-sweep';
    sweep.setAttribute('aria-hidden', 'true');
    artwork.append(heart, svg, sweep);
  }

  function initClinicalRibbon() {
    ensureLoginPolishStyles();
    enhanceLoginModal();
    const stripLayer = document.querySelector('.micro-strips');
    const artwork = stripLayer?.closest('.artwork');
    if (!stripLayer || !artwork) return;
    ensureClinicalPulseStyles();
    ensureClinicalPulse(artwork);
    if (stripLayer.childElementCount) return;
    const fragment = document.createDocumentFragment();
    const strips = [];
    for (let index = 0; index < STRIP_COUNT; index += 1) {
      const strip = document.createElement('span');
      strip.className = 'micro-strip';
      strip.setAttribute('aria-hidden', 'true');
      strip.style.setProperty('--pos', `${(index / (STRIP_COUNT - 1)) * 100}%`);
      strip.style.setProperty('--delay', `${(index % 12) * 4}ms`);
      fragment.appendChild(strip);
      strips.push(strip);
    }
    stripLayer.appendChild(fragment);
    let activeIndexes = new Set();
    let pointerClientX = null;
    let frame = 0;
    let releaseTimer = 0;
    function clearStrip(strip) {
      strip.style.setProperty('--lift', '0px');
      strip.style.setProperty('--scale-x', '1');
      strip.style.setProperty('--scale-y', '1');
      strip.style.setProperty('--tilt', '0deg');
      strip.style.setProperty('--brightness', '1');
      strip.style.setProperty('--saturation', '1');
      strip.style.setProperty('--shadow-alpha', '0');
      strip.classList.remove('is-near-pointer');
    }
    function resetActive() {
      activeIndexes.forEach(index => clearStrip(strips[index]));
      activeIndexes = new Set();
    }
    function renderPointerEffect(extraStrength = 0) {
      frame = 0;
      if (pointerClientX === null) return;
      const bounds = artwork.getBoundingClientRect();
      if (!bounds.width) return;
      const relativeX = Math.min(bounds.width, Math.max(0, pointerClientX - bounds.left));
      const centerIndex = Math.round((relativeX / bounds.width) * (STRIP_COUNT - 1));
      const nextActive = new Set();
      const mobileFactor = window.matchMedia('(max-width: 600px)').matches ? 0.68 : 1;
      for (let index = Math.max(0, centerIndex - ACTIVE_RADIUS); index <= Math.min(STRIP_COUNT - 1, centerIndex + ACTIVE_RADIUS); index += 1) {
        const distance = Math.abs(index - centerIndex);
        const intensity = Math.max(0, 1 - distance / (ACTIVE_RADIUS + 1));
        const strength = Math.min(1.25, intensity + extraStrength);
        const direction = index === centerIndex ? 0 : Math.sign(index - centerIndex);
        const strip = strips[index];
        strip.style.setProperty('--lift', `${(-4 - strength * 20) * mobileFactor}px`);
        strip.style.setProperty('--scale-x', `${1 + strength * 0.42}`);
        strip.style.setProperty('--scale-y', `${1 + strength * 0.055}`);
        strip.style.setProperty('--tilt', `${direction * strength * 2.2}deg`);
        strip.style.setProperty('--brightness', `${1 + strength * 0.2}`);
        strip.style.setProperty('--saturation', `${1 + strength * 0.25}`);
        strip.style.setProperty('--shadow-alpha', `${0.08 + strength * 0.28}`);
        strip.classList.add('is-near-pointer');
        nextActive.add(index);
      }
      activeIndexes.forEach(index => { if (!nextActive.has(index)) clearStrip(strips[index]); });
      activeIndexes = nextActive;
    }
    function schedulePointerEffect() {
      if (frame) return;
      frame = requestAnimationFrame(() => renderPointerEffect(0));
    }
    artwork.addEventListener('pointermove', event => { pointerClientX = event.clientX; schedulePointerEffect(); }, { passive: true });
    artwork.addEventListener('pointerenter', event => { pointerClientX = event.clientX; schedulePointerEffect(); }, { passive: true });
    artwork.addEventListener('pointerleave', () => {
      pointerClientX = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      window.clearTimeout(releaseTimer);
      resetActive();
    }, { passive: true });
    artwork.addEventListener('pointerdown', event => {
      pointerClientX = event.clientX;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      renderPointerEffect(0.28);
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => renderPointerEffect(0), 260);
    }, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initClinicalRibbon, { once: true });
  else initClinicalRibbon();
})();