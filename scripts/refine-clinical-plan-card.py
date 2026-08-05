from pathlib import Path

login_path = Path('login.html')
login = login_path.read_text(encoding='utf-8')
login = login.replace(
    'data-mi-login-version="20260804-premium-apple-login"',
    'data-mi-login-version="20260805-clinical-plan-card-v2"',
    1,
)

old_markup = '''            <section class="plan-block" aria-labelledby="clinicalPlusTitle">
              <span class="plan-corner" aria-hidden="true">↗</span>
              <p class="plan-eyebrow">Paketa e plotë</p>
              <h2 id="clinicalPlusTitle">MedIndex Clinical+</h2>
              <div class="plan-price" aria-label="19 euro e 99 cent në muaj">
                <strong>19.99 €</strong><span>/ muaj</span>
              </div>
              <ul class="plan-list">
                <li>Regjistri i barnave</li>
                <li>Klasifikimi ATC dhe ICD</li>
                <li>Kërkim klinik i shpejtë</li>
                <li>Receta dhe protokolle</li>
                <li>Dozologji e strukturuar</li>
                <li>Hapësirë private klinike</li>
              </ul>
              <button class="plan-cta" type="button" popovertarget="loginPanel">
                <span>Fillo tani</span><i aria-hidden="true">→</i>
              </button>
            </section>'''

new_markup = '''            <section class="plan-block" aria-labelledby="clinicalPlusTitle">
              <div class="plan-kicker">
                <span class="plan-kicker-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false"><path d="M5 12h13M13 6l6 6-6 6"/></svg>
                </span>
                <p class="plan-eyebrow">Paketa e plotë</p>
              </div>
              <h2 id="clinicalPlusTitle">MedIndex Clinical+</h2>
              <div class="plan-price" aria-label="19 euro e 99 cent në muaj">
                <strong>19.99 €</strong><span>/ muaj</span>
              </div>
              <ul class="plan-list">
                <li>Regjistri i barnave</li>
                <li>Klasifikimi ATC dhe ICD</li>
                <li>Kërkim klinik i shpejtë</li>
                <li>Receta dhe protokolle</li>
                <li>Dozologji e strukturuar</li>
                <li>Hapësirë private klinike</li>
              </ul>
              <button class="plan-cta" type="button" popovertarget="loginPanel">
                <span>Fillo tani</span>
                <i aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M5 12h13M13 6l6 6-6 6"/></svg></i>
              </button>
            </section>'''

if old_markup not in login:
    raise SystemExit('Clinical+ card markup contract was not found.')
login_path.write_text(login.replace(old_markup, new_markup, 1), encoding='utf-8')

signature_path = Path('landing-signature.css')
signature = signature_path.read_text(encoding='utf-8')
marker = '/* MedIndex Clinical+ card v2 — ordered premium pricing surface. */'
if marker not in signature:
    signature += r'''

/* MedIndex Clinical+ card v2 — ordered premium pricing surface. */
html.medindex-tailadmin-login[data-mi-page="login"] body .plan-block{
  --mx:78%;
  --my:8%;
  max-width:470px!important;
  min-height:640px!important;
  padding:40px 34px 30px!important;
  border:1px solid rgba(117,151,225,.22)!important;
  border-radius:34px!important;
  background:
    radial-gradient(circle at var(--mx) var(--my),rgba(255,255,255,.98),rgba(255,255,255,.2) 24%,transparent 44%),
    radial-gradient(circle at 96% 2%,rgba(95,137,236,.15),transparent 32%),
    linear-gradient(148deg,rgba(255,255,255,.99),rgba(244,248,255,.92))!important;
  box-shadow:
    0 34px 86px rgba(36,58,111,.16),
    0 10px 28px rgba(56,84,151,.07),
    inset 0 1px 0 rgba(255,255,255,1)!important;
}
html.medindex-tailadmin-login[data-mi-page="login"] body .plan-block::before{
  inset:0!important;
  height:auto!important;
  padding:1px!important;
  border-radius:inherit!important;
  background:linear-gradient(142deg,rgba(255,255,255,1),rgba(91,137,239,.45) 31%,rgba(255,255,255,.34) 60%,rgba(52,92,196,.18))!important;
  opacity:1!important;
  transform:none!important;
}
html.medindex-tailadmin-login[data-mi-page="login"] body .plan-block::after{
  top:-132px!important;
  right:-110px!important;
  width:310px!important;
  height:310px!important;
  background:radial-gradient(circle,rgba(255,255,255,.92) 0 9%,rgba(101,147,250,.16) 30%,transparent 68%)!important;
  opacity:.9!important;
  transform:scale(1)!important;
}
html.medindex-tailadmin-login[data-mi-page="login"] body .plan-kicker{
  display:flex!important;
  align-items:center!important;
  gap:15px!important;
  margin:0 0 28px!important;
}
html.medindex-tailadmin-login[data-mi-page="login"] body .plan-kicker-icon{
  display:grid!important;
  width:48px!important;
  height:48px!important;
  flex:0 0 48px!important;
  place-items:center!important;
  border:1px solid rgba(255,255,255,.72)!important;
  border-radius:16px!important;
  background:linear-gradient(145deg,#67a6ff 0%,#3f75e6 58%,#315dc7 100%)!important;
  color:#fff!important;
  box-shadow:0 14px 28px rgba(48,92,197,.24),inset 0 1px 0 rgba(255,255,255,.55),inset 0 -1px 0 rgba(28,65,158,.24)!important;
  transform:none!important;
  transition:transform .3s var(--sig-ease),box-shadow .3s ease!important;
}
html.medindex-tailadmin-login[data-mi-page="login"] body .plan-kicker-icon svg,
html.medindex-tailadmin-login[data-mi-page="login"] body .plan-cta i svg{
  width:22px!important;
  height:22px!important;
  fill:none!important;
  stroke:currentColor!important;
  stroke-width:1.9!important;
  stroke-linecap:round!important;
  stroke-linejoin:round!important;
}
html.medindex-tailadmin-login[data-mi-page="login"] body .plan-eyebrow{
  min-height:0!important;
  margin:0!important;
  padding:0!important;
  border:0!important;
  border-radius:0!important;
  background:transparent!important;
  box-shadow:none!important;
  color:#4773dd!important;
  font-size:9px!important;
  font-weight:720!important;
  letter-spacing:.19em!important;
  line-height:1.2!important;
}
html.medindex-tailadmin-login[data-mi-page="login"] body .plan-block h2{
  color:#14213d!important;
  font-size:35px!important;
  font-weight:680!important;
  letter-spacing:-.058em!important;
  line-height:1.03!important;
}
html.medindex-tailadmin-login[data-mi-page="login"] body .plan-price{
  gap:10px!important;
  margin:31px 0 30px!important;
  padding:0!important;
  border:0!important;
  color:#0e1b38!important;
}
html.medindex-tailadmin-login[data-mi-page="login"] body .plan-price strong{
  color:#0f1c3a!important;
  font-size:58px!important;
  font-weight:670!important;
  letter-spacing:-.078em!important;
  line-height:.88!important;
}
html.medindex-tailadmin-login[data-mi-page="login"] body .plan-price span{
  padding-bottom:5px!important;
  color:#8490a7!important;
  font-size:12px!important;
  font-weight:560!important;
}
html.medindex-tailadmin-login[data-mi-page="login"] body .plan-list{
  display:grid!important;
  gap:0!important;
  margin:0 0 25px!important;
  padding:0!important;
}
html.medindex-tailadmin-login[data-mi-page="login"] body .plan-list li{
  display:flex!important;
  min-height:49px!important;
  align-items:center!important;
  margin:0!important;
  padding:12px 0 12px 52px!important;
  border-bottom:1px solid rgba(81,104,152,.085)!important;
  color:#4b5a75!important;
  font-size:12.5px!important;
  font-weight:540!important;
  letter-spacing:-.008em!important;
  line-height:1.4!important;
  transform:none!important;
}
html.medindex-tailadmin-login[data-mi-page="login"] body .plan-list li:last-child{border-bottom:0!important}
html.medindex-tailadmin-login[data-mi-page="login"] body .plan-list li::before{
  top:50%!important;
  left:0!important;
  width:34px!important;
  height:34px!important;
  border:1px solid rgba(91,137,239,.16)!important;
  border-radius:50%!important;
  background:linear-gradient(145deg,rgba(251,253,255,.98),rgba(234,241,255,.9))!important;
  color:#3f78ec!important;
  font-size:16px!important;
  font-weight:700!important;
  box-shadow:0 8px 20px rgba(50,89,178,.08),inset 0 1px 0 rgba(255,255,255,1)!important;
  transform:translateY(-50%)!important;
}
html.medindex-tailadmin-login[data-mi-page="login"] body .plan-cta{
  min-height:68px!important;
  margin-top:auto!important;
  padding:0 12px 0 24px!important;
  border:1px solid rgba(255,255,255,.12)!important;
  border-radius:21px!important;
  background:linear-gradient(145deg,#172541 0%,#0d1830 52%,#071124 100%)!important;
  color:#fff!important;
  font-size:15px!important;
  font-weight:650!important;
  letter-spacing:-.012em!important;
  box-shadow:0 20px 42px rgba(7,16,36,.23),inset 0 1px 0 rgba(255,255,255,.13),inset 0 -1px 0 rgba(0,0,0,.2)!important;
}
html.medindex-tailadmin-login[data-mi-page="login"] body .plan-cta i{
  display:grid!important;
  width:48px!important;
  height:48px!important;
  flex:0 0 48px!important;
  place-items:center!important;
  border:1px solid rgba(151,183,255,.24)!important;
  border-radius:16px!important;
  background:linear-gradient(145deg,rgba(64,92,151,.66),rgba(26,45,84,.92))!important;
  color:#fff!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 8px 18px rgba(0,0,0,.12)!important;
}
@media(hover:hover) and (pointer:fine){
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-block:hover{
    border-color:rgba(82,127,232,.34)!important;
    box-shadow:0 45px 104px rgba(37,61,121,.2),0 13px 34px rgba(57,83,145,.08),inset 0 1px 0 #fff!important;
    transform:translateY(-9px) scale(1.006)!important;
  }
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-block:hover::after{opacity:1!important;transform:scale(1.07)!important}
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-block:hover .plan-eyebrow{color:#4773dd!important}
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-block:hover h2{color:#14213d!important}
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-block:hover .plan-price,
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-block:hover .plan-price strong{color:#0f1c3a!important}
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-block:hover .plan-price span{color:#8490a7!important}
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-block:hover .plan-list li{color:#43516c!important;transform:none!important}
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-block:hover .plan-list li::before{
    border-color:rgba(91,137,239,.22)!important;
    background:linear-gradient(145deg,#fff,#eaf1ff)!important;
    color:#3f78ec!important;
  }
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-block:hover .plan-kicker-icon{
    box-shadow:0 18px 34px rgba(48,92,197,.28),inset 0 1px 0 rgba(255,255,255,.6)!important;
    transform:translateY(-2px)!important;
  }
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-cta:hover{
    background:linear-gradient(145deg,#1b2b4b 0%,#0e1c37 58%,#08142a 100%)!important;
    color:#fff!important;
    box-shadow:0 27px 52px rgba(7,16,36,.28),inset 0 1px 0 rgba(255,255,255,.15)!important;
    transform:translateY(-3px)!important;
  }
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-cta:hover i{
    background:linear-gradient(145deg,rgba(78,112,184,.76),rgba(28,50,95,.96))!important;
    transform:translateX(3px)!important;
  }
}
@media(max-width:600px){
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-block{
    max-width:100%!important;
    min-height:0!important;
    padding:28px 22px 22px!important;
    border-radius:28px!important;
  }
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-kicker{gap:12px!important;margin-bottom:24px!important}
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-kicker-icon{
    width:42px!important;
    height:42px!important;
    flex-basis:42px!important;
    border-radius:14px!important;
  }
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-kicker-icon svg,
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-cta i svg{width:20px!important;height:20px!important}
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-block h2{font-size:28px!important}
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-price{margin:25px 0 24px!important}
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-price strong{font-size:49px!important}
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-list{margin-bottom:22px!important}
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-list li{
    min-height:47px!important;
    padding:11px 0 11px 46px!important;
    font-size:12px!important;
  }
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-list li::before{
    width:31px!important;
    height:31px!important;
    font-size:14px!important;
  }
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-cta{
    min-height:60px!important;
    padding-left:19px!important;
    border-radius:18px!important;
    font-size:13px!important;
  }
  html.medindex-tailadmin-login[data-mi-page="login"] body .plan-cta i{
    width:42px!important;
    height:42px!important;
    flex-basis:42px!important;
    border-radius:14px!important;
  }
}
'''
    signature_path.write_text(signature, encoding='utf-8')

preload_path = Path('theme-preload.js')
preload = preload_path.read_text(encoding='utf-8')
preload = preload.replace(
    "signature.href = '/landing-signature.css?v=20260805-1';",
    "signature.href = '/landing-signature.css?v=20260805-2';",
    1,
)
preload_path.write_text(preload, encoding='utf-8')
