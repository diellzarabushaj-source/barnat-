# Prompti standard për DRx

Kopjoje bllokun më poshtë, zëvendëso vetëm rreshtin **DETYRA**, dhe dërgoje.
Gjithçka tjetër është kontekst që nuk duhet përsëritur çdo herë.

Një paralajmërim para se ta përdorësh: mos i shkruaj emrat e të 68 skills-ave në
prompt. Një listë e gjatë emrash nuk e bën outputin më të mirë — e mbush
kontekstin me zhurmë dhe e detyron agjentin të zgjedhë mes udhëzimesh që bien
ndesh. Prompti më poshtë i grupon sipas punës dhe e lë zgjedhjen te agjenti,
sepse ai i sheh të gjitha tashmë në sistem.

---

```
DETYRA: <shkruaj këtu çfarë do — një ose dy fjali, konkrete>

KONTEKSTI I PROJEKTIT
DRx është regjistër klinik barnash për mjekët në Kosovë. Përdoruesi kryesor
është mjeku gjatë vizitës, ndaj shpejtësia dhe qartësia mbizotërojnë mbi
dekorin. Stack-u: HTML/CSS/JS statik, funksione Node në Vercel, Supabase.
Pa Python, pa server që e mbajmë vetë. 4013 barna të publikuara.

SISTEMI I DIZAJNIT — mos e shpik, përdor tokenat ekzistues nga landing.css
Marka:      --lp-brand #1f7779 · deep #155f63 · press #0d4145 · wash #eaf4f1
Teksti:     --lp-ink #0d253d · ink-2 #273951 · mute #64748d
Sipërfaqja: --lp-canvas #ffffff · canvas-soft #f6f9fc · cream #f5e9d4
Vijat:      --lp-hairline #e3e8ee · hairline-input #a8c3de
Statusi:    ok #027a48 · warn #b54708 · stop #b42318
Rrezet:     6 / 8 / 12 / 16 / 9999px (pill)
Tipografia: Inter. Titujt weight 300 me letter-spacing negativ (−1.4px @56px).
            Shifrat me font-variant-numeric: tabular-nums.
Gjuha vizuale vjen nga Stripe: rrjetë gradient e butë, hapësirë e gjerë,
vija flokëzi në vend të hijeve të rënda, butona pill, lëvizje e përmbajtur.
Faqet publike janë teal DRx; konsola admin është indigo --stripe-*.

ÇFARË PRES NGA TI
1. Zgjidh vetë mjetet e duhura. I ke 68 skills dhe 24 subagjentë të instaluar.
   Mos i thirr të gjitha — zgjidh ato që i takojnë kësaj detyre. Për orientim:
   - dizajn dhe pamje: impeccable, design-taste-frontend, frontend-design,
     high-end-visual-design, redesign-existing-projects, visual-design-foundations,
     brandkit, theme-factory, imagegen-frontend-web/mobile, image-to-code
   - qasshmëri: accessibility-compliance, wcag-audit-patterns, screen-reader-testing,
     responsive-design
   - kod dhe cilësi: karpathy-guidelines, coding-standards, frontend-patterns,
     backend-patterns, modern-javascript-patterns, error-handling-patterns,
     ai-debt-detector
   - baza e të dhënave: postgresql-table-design, sql-optimization-patterns,
     database-migration, secrets-management, gdpr-data-handling
   - testim: test-driven-development, javascript-testing-patterns,
     e2e-testing-patterns, webapp-testing
   - proces: brainstorming, writing-plans, systematic-debugging,
     verification-before-completion, requesting-code-review
   - shkrim: humanizer, avoid-ai-writing
   Subagjentët (ui-designer, frontend-developer, backend-architect, api-tester,
   test-writer-fixer, performance-benchmarker) thirri vetëm kur puna ndahet
   vërtet në pjesë të pavarura.

2. Ku ka dilemë dizajni ose arkitekture, vendos ti dhe thuaj pse. Mos më pyet
   për gjëra që i zgjidh dot vetë nga kodi. Pyetmë vetëm kur dy rrugë japin
   produkt vërtet të ndryshëm dhe zgjedhja është e imja.

3. Verifiko para se të thuash se mbaroi. Hape faqen në Chromium në 1440px dhe
   390px, mat atë që pretendon, dhe trego numrat. Pa mbushje horizontale, pa
   cak prekjeje nën 44px, kontrast të paktën 4.5:1. Nëse diçka nuk u verifikua
   dot, thuaje hapur — mos e paraqit si të kryer.

4. Mos i prish kontratat ekzistuese. Testet e repos ruajnë id-të e elementeve,
   klasat dhe rrjedhat; lexoji para se të ndryshosh. Mos hiq, mos çaktivizo dhe
   mos anashkalo asnjë test për ta bërë CI-në jeshile. `pnpm test` ekzekuton
   `build:runtime`, i cili rishkruan 59 skeda në vend — mos e nis në pemën e
   punës, përdor një kopje të izoluar.

5. Në fund: commit me mesazh që shpjegon pse, push, dhe PR. Pastaj më thuaj
   shkurt çfarë ndryshoi, çfarë verifikove me numra, dhe çfarë mbeti hapur.
```

---

## Variante të shkurtra

**Për një ndryshim të vogël** — kur nuk ia vlen prompti i plotë:

```
<detyra>. Sistemi i dizajnit DRx si te landing.css, verifiko në Chromium
1440 dhe 390, mos prish testet ekzistuese, pastaj commit dhe push.
```

**Për punë dizajni** — kur pamja është gjëja kryesore:

```
<detyra>. Përdor impeccable dhe design-taste-frontend. Tokenat nga landing.css,
gjuha vizuale e Stripe si te faqja hyrëse. Trego pamje ekrani në 1440 dhe 390
para se ta quash të mbaruar. Vendos vetë detajet e dizajnit dhe thuaj pse.
```

**Për një defekt** — kur diçka nuk punon:

```
<simptoma e saktë, çfarë sheh dhe ku>. Gjeje shkakun rrënjësor para se të
prekësh kod — përdor systematic-debugging. Shkruaj një test që e riprodhon
defektin, pastaj rregulloje. Trego testin duke dështuar para dhe duke kaluar pas.
```

**Për backend** — kur punohet me Supabase:

```
<detyra>. Databaza është Supabase, jo Neon — skedat lib/neon-*.js janë vetëm
emra të vjetër. Kontrollo get_advisors për siguri dhe performancë para dhe pas.
Mos shkruaj në prodhim pa ma thënë çfarë do të ndryshosh.
```
