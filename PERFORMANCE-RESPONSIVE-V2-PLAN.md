# MedIndex — Performance & Responsive V2 Master Plan

## Qëllimi

MedIndex tashmë ka një rrugë lightweight për registry në mobile dhe desktop, server-side pagination të kufizuar, abortim të request-eve stale, Web Worker për fallback-in e plotë dhe një suite të gjerë auditimi. Ky plan **nuk e rindërton aplikacionin nga zero**. Qëllimi është ta çojë nga “i mirë” në një UI dukshëm më të shpejtë, më të qëndrueshme dhe më responsive, pa ndryshuar të dhënat klinike ose kontratat ekzistuese.

Prioriteti është **perceived performance**: search, filter, pagination, hapja e detajeve, tabela, scrolling, navigation, mobile interaction dhe resize duhet të ndihen sa më afër instant-it që lejon arkitektura aktuale.

---

## Kufijtë e sigurisë

Ky optimizim nuk duhet të ndryshojë:

- të dhënat e barnave;
- logjikën klinike;
- rregullat adult/pediatric;
- schema-n e Neon;
- semantikën e API-ve;
- autentikimin;
- kontratat e registry/dosage;
- sjelljen offline/PWA;
- rezultatet e search/filter/sort;
- funksionet e recetës.

Nuk duhet të përdorim më shumë Neon/API trafik për ta bërë UI-në të duket më e shpejtë. Nuk lejohen duplicated requests, polling, aggressive prefetching ose shkarkim i dataset-it të plotë vetëm për rehati të frontend-it.

`NEON-FIRST-PERFORMANCE-PLAN.md` mbetet plani për data path. Ky dokument fokusohet te **frontend runtime, main thread, DOM, CSS/layout, responsiveness dhe perceived speed**.

---

## Çfarë ekziston tashmë dhe duhet ruajtur

Nga kodi aktual:

- `registry-mobile-lite.js` aktivizohet nën 768 px;
- mobile përdor 25 rreshta default dhe maksimum 50;
- mobile search ka debounce 250 ms dhe aborton request-in e mëparshëm;
- mobile shmang exact total count gjatë typing-ut;
- `registry-desktop-lite.js` aktivizohet nga 768 px;
- desktop përdor lightweight page rendering dhe kërkon vetëm faqen e nevojshme;
- fallback runtime i plotë nuk preloadohet në startup normal;
- `registry-parser-worker-v2.js` mban parsing të rëndë jashtë main thread-it;
- `registry-dosage-loader.js` shtyn punën jo-kritike me idle scheduling;
- `registry-unified-table.js` kufizon MutationObserver te header/tbody dhe jo te gjithë `document.body`;
- ekzistojnë audit-e për fast start, interaction resilience, main-thread, table stability, mobile readiness dhe desktop lite.

Këto janë guardrails. V2 duhet t’i përmirësojë, jo t’i heqë.

---

# Fazat e punës

## Faza 0 — Baseline i matshëm para çdo ndryshimi

Para optimizimit krijohet një baseline reproducible.

### Flows që maten

1. cold initial load;
2. warm initial load;
3. registry startup;
4. search typing;
5. search clear;
6. status filter;
7. ATC/category switch;
8. sort;
9. pagination next/previous;
10. ndryshim page size;
11. hapja e “Më shumë” / detail;
12. kthimi nga detail;
13. column/form controls;
14. modal/dialog flows;
15. navigation ndërmjet faqeve;
16. vertical scrolling;
17. horizontal table scrolling;
18. resize desktop ↔ tablet;
19. mobile keyboard + search;
20. offline/warm-cache recovery.

### Viewport-et minimale

- 320 px;
- 375 px;
- 390 px;
- 430 px;
- 768 px;
- 1024 px;
- 1280 px;
- 1440 px+.

### Çfarë regjistrohet

- request count për flow;
- payload size;
- request duration;
- main-thread long tasks;
- scripting/layout/paint time;
- DOM node count në registry;
- event listener count aty ku mund të matet në browser tooling;
- layout shifts;
- forced synchronous layout/reflow;
- scroll jank;
- input latency gjatë typing-ut;
- koha deri te tabela e përdorshme;
- koha e hapjes së detail-it;
- console errors/warnings;
- memory growth pas 20 search/filter/page cycles.

**Rregull:** asnjë optimizim nuk pranohet vetëm sepse “duket më i shpejtë”. Duhet before/after evidence.

---

## Faza 1 — Search dhe controls: input instant, work i kontrolluar

### Audit i parë

- kontrollo sa punë bëhet pas çdo `input` event;
- kontrollo nëse exact count po ekzekutohet kur nuk i duhet përdoruesit;
- kontrollo duplicated/stale requests;
- kontrollo sa herë rindërtohen header, pagination dhe rows;
- kontrollo query të njëjta të përsëritura pas back/forward ose filter toggle.

### Hipoteza konkrete për t’u matur

1. **Desktop search** aktualisht thërret `loadPage({ includeTotal:true })` pas debounce-it. Mobile e shmang exact total gjatë typing-ut. Mat nëse count-i i desktop-it është pjesë reale e latency/network cost. Nëse po, desktop duhet të adoptojë të njëjtin parim si mobile: rezultatet shfaqen menjëherë, exact total merret vetëm kur është vërtet i nevojshëm.
2. Search/filter/page changes përdorin `AbortController`, gjë që duhet ruajtur dhe verifikuar për çdo path.
3. Mos shto debounce te vetë input-i vizual. Teksti duhet të shfaqet menjëherë; vetëm puna e shtrenjtë mund të debounce/defer-ohet.

### Acceptance

- typing nuk bllokon UI;
- nuk ka request të panevojshëm për çdo tast;
- stale result nuk mund ta zëvendësojë query-n më të re;
- search/filter/sort kanë rezultat identik me para optimizimit;
- zero rritje e Neon request count për të njëjtin user flow.

---

## Faza 2 — Registry rendering: më pak DOM churn

`registry-mobile-lite.js` dhe `registry-desktop-lite.js` rindërtojnë rows me `innerHTML` dhe pastaj lidhin listener-a te controls të rreshtave. Me 25–50 rreshta kjo mund të jetë plotësisht e pranueshme, prandaj **nuk ndryshohet pa profiler evidence**.

### Audit

- measure `renderRows()` duration;
- measure `buildHeader()` duration;
- measure pagination render;
- numëro listener-at e krijuar pas 20 render cycles;
- kontrollo nëse event delegation te `tbody` do të ulte punën realisht;
- kontrollo nëse header po rindërtohet edhe kur s’ka ndryshuar;
- kontrollo nëse DOM update mund të bëhet njëherë për cycle dhe jo në disa hapa të ndarë;
- kontrollo reflow të shkaktuar nga scroll/focus/layout reads pas renderit.

### Ndryshime vetëm nëse provohen me evidence

- event delegation për row actions;
- mos-rindërtim i header-it kur sort state nuk ndryshon;
- reuse i pagination nodes kur struktura është e njëjtë;
- batching i DOM writes;
- shmangie e read-after-write layout patterns;
- ruajtje e focus/scroll pa forced reflow.

### Nuk bëjmë

- virtualization vetëm sepse ekziston si teknikë;
- infinite scroll që ndryshon workflow-in klinik;
- full dataset rendering;
- framework migration.

---

## Faza 3 — Responsive V2: mobile, tablet dhe desktop pa kompromis

### 3.1 Page shell

Audit për:

- horizontal page overflow;
- nested scroll containers;
- sticky header/sidebar overlap;
- content nën navigation;
- viewport height (`100vh`) issues në mobile;
- safe-area handling;
- layout jump kur shfaqet/hiqet scrollbar;
- resize loops ose ResizeObserver loops.

### 3.2 Registry mobile

Mobile duhet të mbetet lightweight dhe clinical-content-safe.

Kontrollo:

- 320/375/390/430 px;
- card width dhe padding;
- emra shumë të gjatë të barnave/substancave;
- ATC + strength + form wrapping;
- touch targets;
- pagination në 320 px;
- search me tastierën e hapur;
- detail overlay/full-screen behavior;
- body/owner scroll lock;
- focus trap dhe kthimi i focus-it;
- orientation change;
- iOS/Android overscroll behavior.

Asnjë informacion klinik nuk humbet vetëm për ta bërë layout-in më të pastër.

### 3.3 Registry tablet

768–1024 px duhet audit i veçantë, jo vetëm “desktop i vogël”.

Kontrollo:

- nëse 768 px është breakpoint optimal për renderer handoff;
- column crowding;
- sidebar width;
- toolbar wrapping;
- search/filter/page controls;
- table scroll owner;
- touch usability në tablet.

Breakpoint-i ndryshohet vetëm nëse geometry tests tregojnë problem real.

### 3.4 Desktop

Kontrollo 1024, 1280, 1440 dhe ekrane të mëdha:

- densitetin e tabelës;
- max content width;
- column alignment;
- sticky header;
- width distribution;
- horizontal scroll vetëm kur është realisht i nevojshëm;
- modal/detail max-height;
- focus/keyboard navigation.

### Acceptance responsive

- zero horizontal overflow i faqes në viewport-et e testuara;
- tabela mund të ketë scroll container të kontrolluar kur është e nevojshme;
- asnjë control jashtë viewport-it;
- asnjë overlap;
- modal/detail i përdorshëm me mobile keyboard;
- text klinik nuk pritet pa mënyrë për ta hapur;
- touch targets të rehatshëm dhe controls të aksesueshme.

---

## Faza 4 — Main thread dhe startup

### Audit

- renditja reale e script-eve në `index.html`;
- blocking scripts;
- runtime loader handoff;
- auth-ready path;
- full-runtime fallback conditions;
- worker startup;
- dosage loader startup;
- observers;
- timers;
- idle callbacks;
- requestAnimationFrame chains;
- synchronous initialization që nuk duhet në first interaction path.

### Qëllimi

Puna jo-kritike duhet të ndodhë pas UI-së bazë, por pa krijuar delayed surprise work që e bllokon përdoruesin disa sekonda më vonë.

### Kandidatë

- lazy/deferred loading vetëm për funksione që nuk duhen në first view;
- grupim i punës në idle chunks;
- yield ndërmjet batch-eve të gjata;
- reduktim i DOM queries të përsëritura;
- cache i element references vetëm kur lifecycle-i e lejon;
- shmangie e synchronous JSON/string transforms në main thread;
- worker për CPU work që realisht matet si problem.

---

## Faza 5 — CSS performance + cleanup

Kjo fazë nuk është redesign.

### Audit

- duplicated selectors;
- `!important` chains;
- override layers;
- mobile-specific conflicts;
- selectors tepër të gjerë;
- expensive shadows/blur/backdrop-filter;
- transitions në properties që shkaktojnë layout;
- hidden elements që vazhdojnë të marrin layout cost;
- font weights që ngarkohen por nuk përdoren;
- repeated CSS nga patch phases.

### Rregulla

- së pari gjendet rregulli ekzistues;
- hiqet konflikti, jo shtohet një override i katërt;
- animacionet preferojnë `transform`/`opacity` kur ka animacion;
- `will-change` nuk përdoret globalisht;
- blur/shadow reduktohet në mobile vetëm kur profiler/paint evidence e justifikon;
- typography dhe clinical hierarchy ruhen.

---

## Faza 6 — Build/runtime patch consolidation

`package.json` aktual ka një chain shumë të gjatë `build:runtime` me patch scripts të njëpasnjëshme. Kjo është një pikë e rëndësishme për maintainability dhe mund ta bëjë source-of-truth më të vështirë për t’u audituar.

### Qëllimi

Jo të fshihen patch-et në mënyrë agresive, por të identifikohen ato që:

- materializojnë permanent changes që tashmë mund të jetojnë direkt në source;
- prekin të njëjtin runtime/file disa herë;
- kanë faza të vjetra të superseduara;
- ekzistojnë vetëm për compat të një versioni të kaluar;
- shtojnë CSS/JS të njëjtë në disa hapa.

### Procesi

1. mapo çdo patch → files/functions që ndryshon;
2. regjistro dependency/order;
3. krahaso source para build-it me artifact pas build-it;
4. identifiko patches që mund të squash-ohen në source;
5. migro **një grup të vogël në një PR**;
6. ekzekuto të gjithë regression tests;
7. krahaso runtime output;
8. vetëm pastaj hiq patch script-in e vjetër.

### Acceptance

- build identik funksionalisht;
- më pak patch layers;
- source më i lexueshëm;
- asnjë regression klinik/UI/PWA;
- build runtime më determinist.

---

## Faza 7 — Network discipline pa rritur load në Neon

### Kontrollo

- duplicate API requests;
- exact count queries;
- no-store vs cache semantics në endpoints ku kontrata e lejon;
- same-query deduplication në client vetëm nëse nuk rrezikon freshness;
- request abort behavior;
- payload fields të papërdorura në lightweight UI;
- repeated detail requests;
- page back/forward behavior;
- service worker + browser cache coherence.

### Rregull absolut

Asnjë frontend optimization nuk pranohet nëse rrit ndjeshëm numrin e database/API calls për të njëjtin flow.

---

## Faza 8 — Detail / “Më shumë” / advanced handoff

Ky është një nga momentet ku përdoruesi e vëren më së shumti lag-un.

Audit:

- click → visible feedback;
- click → detail ready;
- a po ngarkohet full runtime për funksion që mund të kryhet lightweight;
- a po bëhet replay i click-ut pa double-action;
- focus restoration;
- scroll restoration;
- data request count;
- modal/detail layout cost;
- close/reopen memory behavior.

Në desktop, full-runtime handoff ruhet për funksionet që realisht e kërkojnë. Objektivi është që funksionet e zakonshme të mos e zgjojnë runtime-in e plotë pa nevojë.

---

## Faza 9 — Observer, listener dhe lifecycle audit

Kontrollo të gjithë:

- `MutationObserver`;
- `ResizeObserver`;
- scroll listeners;
- resize listeners;
- global click listeners;
- timers;
- intervals;
- custom `medindex:*` events.

Për secilin:

- kush e krijon;
- sa herë krijohet;
- kur disconnect/remove bëhet;
- çfarë subtree observon;
- sa callbacks prodhon gjatë 1 minute përdorimi aktiv;
- a mund të zëvendësohet me event më specifik.

`registry-unified-table.js` tashmë ka bounded observer strategy; kjo duhet të mbetet standard për komponentët e tjerë.

---

## Faza 10 — Memory dhe long-session stability

MedIndex duhet të mbetet i shpejtë edhe pas përdorimit të gjatë.

Scenario:

- 20 search changes;
- 20 pagination changes;
- 10 detail open/close;
- 10 category/filter switches;
- 5 resize/orientation changes;
- navigation registry → ICD → registry;
- online → offline → online.

Kontrollo:

- detached DOM nodes;
- listener accumulation;
- controllers/timers të vjetër;
- unreleased detail state;
- duplicated custom event subscriptions;
- memory që rritet vazhdimisht pa u kthyer.

---

# Strategjia e implementimit

Nuk bëjmë një mega-commit. Ndryshimet ndahen në PR të vegjël dhe të matshëm.

### PR 1 — Baseline + instrumentation

- measurement harness;
- viewport matrix;
- request counters;
- browser performance traces;
- before report.

### PR 2 — Search/control hot path

- vetëm bottleneck-et e provuara;
- desktop count strategy nëse matja e justifikon;
- stale/duplicate request hardening;
- interaction regression tests.

### PR 3 — Registry DOM/render lifecycle

- event delegation ose render simplification vetëm nëse profiler e justifikon;
- header/pagination churn;
- focus/scroll stability.

### PR 4 — Responsive V2

- 320–1440+ geometry fixes;
- mobile/table/detail/keyboard;
- tablet-specific audit;
- zero overflow gates.

### PR 5 — CSS + patch consolidation

- conflict cleanup;
- materializim i patch-eve të superseduara në source;
- build chain simplification me regression proof.

### PR 6 — Long-session + final audit

- memory;
- observers/listeners;
- offline/online;
- final before/after report.

---

# Definition of Done

V2 quhet i përfunduar vetëm kur:

- të gjitha testet ekzistuese kalojnë;
- rezultatet klinike dhe registry contract mbeten të njëjta;
- search/filter/sort/pagination japin të njëjtën sjellje funksionale;
- nuk ka rritje të panevojshme të Neon/API traffic;
- nuk ka duplicate requests për të njëjtin state;
- nuk ka page-level horizontal overflow në viewport-et e testuara;
- nuk ka clipped/overlapping controls;
- detail/modal punon me keyboard dhe mobile keyboard;
- startup normal nuk zgjon full registry runtime pa arsye;
- main-thread traces tregojnë përmirësim ose së paku zero regression;
- request counts tregojnë zero regression;
- memory test nuk tregon accumulation progresiv;
- çdo ndryshim performance ka before/after evidence.

---

# Prioriteti real

## P0 — më së pari

1. baseline me browser traces;
2. search typing latency;
3. desktop exact-count behavior;
4. registry row render/listener cost;
5. mobile 320–430 geometry + detail scroll/focus;
6. tablet 768–1024;
7. main-thread startup;
8. duplicate requests.

## P1

1. CSS conflict cleanup;
2. observer/listener lifecycle;
3. advanced handoff latency;
4. long-session memory;
5. patch-chain consolidation.

## P2

1. micro-optimizations;
2. cosmetic animation tuning;
3. non-critical asset polish.

---

# Gjëra që nuk duhen bërë

- mos migro në React/Next vetëm për performance;
- mos e shkarko registry-n e plotë në startup;
- mos shto prefetch masiv;
- mos shto request për çdo keystroke;
- mos përdor virtualization pa profiler evidence;
- mos konverto desktop table në cards;
- mos fsheh të dhëna klinike për mobile;
- mos shto CSS override pas override;
- mos krijo patch script të ri për çdo simptomë pa provuar fillimisht ta rregullosh source-of-truth;
- mos deklaro përmirësim pa before/after measurements.

---

## Rezultati i synuar

MedIndex duhet të mbetet klinikisht identik, por të ndihet më “native”: input i menjëhershëm, scroll i qetë, tabela e qëndrueshme, mobile pa overflow, detail pa vonesë të dukshme dhe desktop pa punë të panevojshme në main thread. Përmirësimi duhet të vijë nga **më pak punë**, **më pak DOM churn**, **më pak request-e të panevojshme** dhe **layout më i pastër** — jo nga shtimi i më shumë backend load-it.
