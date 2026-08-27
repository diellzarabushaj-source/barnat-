# Prompti standard për DRx

Kopjoje bllokun më poshtë, zëvendëso vetëm rreshtin **DETYRA**, dhe dërgoje.
Gjithçka tjetër është kontekst që nuk ka nevojë të përsëritet çdo herë.

Prompti i përmend paketat e instaluara, jo emrat e të 68 skills-ave. Një listë e
gjatë emrash nuk e përmirëson outputin — e mbush kontekstin dhe detyron zgjedhje
mes udhëzimesh që bien ndesh. Agjenti i sheh të gjitha skills-at tashmë; prompti
i thotë çfarë ka në dorë dhe e urdhëron të marrë vetëm atë që i duhet detyrës.

---

```
DETYRA: <shkruaj këtu çfarë do — një ose dy fjali, konkrete>

KONTEKSTI I PROJEKTIT
DRx është regjistër klinik barnash për mjekët në Kosovë. Përdoruesi kryesor
është mjeku gjatë vizitës, ndaj shpejtësia dhe qartësia mbizotërojnë mbi
dekorin. Stack-u: HTML/CSS/JS statik, funksione Node në Vercel, Supabase.
Pa Python, pa server që e mbajmë vetë. 4013 barna të publikuara.
Databaza është Supabase — skedat lib/neon-*.js janë vetëm emra të vjetër.

MJETET E INSTALUARA NË KËTË REPO
Skills (68 gjithsej), nga këto pakete:
  Leonxlnx/taste-skill ......... dizajn: brandkit, design-taste-frontend,
                                 high-end-visual-design, redesign-existing-projects,
                                 image-to-code, imagegen-frontend-web/mobile,
                                 minimalist-ui, industrial-brutalist-ui, gpt-taste
  impeccable ................... auditim e rindërtim UI me verifikim në shfletues
  obra/superpowers ............. cikli i punës: brainstorming, writing-plans,
                                 executing-plans, test-driven-development,
                                 systematic-debugging, requesting/receiving-code-review,
                                 subagent-driven-development, using-git-worktrees,
                                 verification-before-completion
  WorldFlowAI/everything-claude-code  coding-standards, frontend-patterns,
                                 backend-patterns, security-review,
                                 continuous-learning, strategic-compact, tdd-workflow
  wshobson/agents .............. accessibility-compliance, wcag-audit-patterns,
                                 screen-reader-testing, responsive-design,
                                 modern-javascript-patterns, javascript-testing-patterns,
                                 e2e-testing-patterns, error-handling-patterns,
                                 debugging-strategies, auth-implementation-patterns,
                                 api-design-principles, nodejs-backend-patterns,
                                 postgresql-table-design, sql-optimization-patterns,
                                 database-migration, secrets-management,
                                 gdpr-data-handling, tailwind-design-system,
                                 visual-design-foundations, ai-debt-detector,
                                 session-guard, avoid-ai-writing
  anthropics/skills ............ frontend-design, webapp-testing, skill-creator,
                                 mcp-builder, theme-factory, pdf, xlsx, pptx
  blader/humanizer ............. heq gjurmët e shkrimit AI
  swarmclawai/andrej-karpathy-skills  karpathy-guidelines
  Astro-Han/karpathy-llm-wiki .. bazë njohurish me citime
  virgiliojr94/book-to-skill ... shndërron një libër në skill

Subagjentë (24) te .claude/agents: ui-designer, ux-researcher, frontend-developer,
backend-architect, api-tester, test-writer-fixer, test-results-analyzer,
performance-benchmarker, devops-automator, ai-engineer, mobile-app-builder,
rapid-prototyper, brand-guardian, visual-storyteller, whimsy-injector,
workflow-optimizer, tool-evaluator, trend-researcher, feedback-synthesizer,
sprint-prioritizer, dhe katër impeccable-*.

Mjete të tjera: Playwright MCP (.mcp.json), `pnpm repomix`,
design-md/ me DESIGN.md për Stripe dhe dhjetëra marka të tjera.

RREGULLI PËR MJETET
Përdor vetëm ato pakete dhe skills që i duhen pikërisht kësaj detyre. Mos i
thirr të gjitha dhe mos i përmend ato që nuk i përdor. Nëse detyra është CSS,
nuk ka nevojë për postgresql-table-design; nëse është query, nuk ka nevojë për
brandkit. Subagjentët thirri vetëm kur puna ndahet vërtet në pjesë të pavarura.
Në fillim të përgjigjes thuaj me një rresht cilat zgjodhe dhe pse.

SISTEMI I DIZAJNIT — mos e shpik, përdor tokenat ekzistues nga landing.css
Marka:      --lp-brand #1f7779 · deep #155f63 · press #0d4145 · wash #eaf4f1
Teksti:     --lp-ink #0d253d · ink-2 #273951 · mute #64748d
Sipërfaqja: --lp-canvas #ffffff · canvas-soft #f6f9fc · cream #f5e9d4
Vijat:      --lp-hairline #e3e8ee · hairline-input #a8c3de
Statusi:    ok #027a48 · warn #b54708 · stop #b42318
Rrezet:     6 / 8 / 12 / 16 / 9999px (pill)
Tipografia: Inter. Titujt weight 300 me letter-spacing negativ (−1.4px @56px).
            Shifrat me font-variant-numeric: tabular-nums.
Gjuha vizuale vjen nga Stripe — referenca e plotë është design-md/stripe/DESIGN.md:
rrjetë gradient e butë, hapësirë e gjerë, vija flokëzi në vend të hijeve të
rënda, butona pill, lëvizje e përmbajtur. Faqet publike janë teal DRx; konsola
admin është indigo --stripe-*.

ÇFARË PRES NGA TI
1. Ku ka dilemë dizajni ose arkitekture, vendos ti dhe thuaj pse. Mos më pyet
   për gjëra që i zgjidh dot vetë nga kodi. Pyetmë vetëm kur dy rrugë japin
   produkt vërtet të ndryshëm dhe zgjedhja është e imja.

2. Verifiko para se të thuash se mbaroi. Hape faqen në Chromium në 1440px dhe
   390px, mat atë që pretendon, dhe trego numrat. Pa mbushje horizontale, pa
   cak prekjeje nën 44px, kontrast të paktën 4.5:1. Nëse diçka nuk u verifikua
   dot, thuaje hapur — mos e paraqit si të kryer.

3. Mos i prish kontratat ekzistuese. Testet e repos ruajnë id-të e elementeve,
   klasat dhe rrjedhat; lexoji para se të ndryshosh. Mos hiq, mos çaktivizo dhe
   mos anashkalo asnjë test për ta bërë CI-në jeshile. `pnpm test` ekzekuton
   `build:runtime`, i cili rishkruan 59 skeda në vend — mos e nis në pemën e
   punës, përdor një kopje të izoluar.

4. Në fund: commit me mesazh që shpjegon pse, push, dhe PR. Pastaj më thuaj
   shkurt çfarë ndryshoi, çfarë verifikove me numra, dhe çfarë mbeti hapur.
```

---

## Variante të shkurtra

**Ndryshim i vogël** — kur nuk ia vlen prompti i plotë:

```
<detyra>. Sistemi i dizajnit DRx si te landing.css, verifiko në Chromium
1440 dhe 390, mos prish testet ekzistuese, pastaj commit dhe push.
Merr vetëm skills-at që i duhen kësaj pune.
```

**Punë dizajni** — kur pamja është gjëja kryesore:

```
<detyra>. Përdor impeccable dhe design-taste-frontend. Tokenat nga landing.css,
gjuha vizuale e Stripe — referenca te design-md/stripe/DESIGN.md. Trego pamje
ekrani në 1440 dhe 390 para se ta quash të mbaruar. Vendos vetë detajet dhe
thuaj pse.
```

**Defekt** — kur diçka nuk punon:

```
<simptoma e saktë, çfarë sheh dhe ku>. Gjeje shkakun rrënjësor para se të
prekësh kod — systematic-debugging. Shkruaj një test që e riprodhon defektin,
pastaj rregulloje. Trego testin duke dështuar para dhe duke kaluar pas.
```

**Backend** — kur punohet me Supabase:

```
<detyra>. Databaza është Supabase, jo Neon — lib/neon-*.js janë emra të vjetër.
Kontrollo get_advisors për siguri dhe performancë para dhe pas. Mos shkruaj në
prodhim pa ma thënë çfarë do të ndryshosh.
```
