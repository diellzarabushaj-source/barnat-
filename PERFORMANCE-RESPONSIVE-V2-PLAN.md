# MedIndex — Performance & Responsive V2 Master Plan

**Status:** Plan pune / audit para implementimit  
**Scope:** Frontend performance, perceived speed, responsiveness, runtime cleanup  
**Nuk prek pa arsye të provuar:** Neon schema, clinical data, API contracts, auth, dosage logic, prescription logic, offline semantics

---

# 1. Qëllimi kryesor

MedIndex tashmë ka një arkitekturë të mirë performance me lightweight registry për mobile dhe desktop, pagination të kufizuar, request cancellation, worker/fallback runtime dhe audit tests. Qëllimi i V2 nuk është redesign apo rewrite.

Qëllimi është që aplikacioni të ndihet **dukshëm më i shpejtë, më i qetë dhe më profesional në çdo ekran**, sidomos në këto momente:

- hapja e faqes;
- shfaqja e parë e tabelës;
- typing në search;
- filters;
- ATC/category switching;
- sorting;
- pagination;
- hapja e “Më shumë” / drug detail;
- kthimi nga detail;
- modals/dialogs;
- scrolling;
- mobile keyboard interaction;
- navigation;
- resize/orientation change;
- përdorimi i gjatë pa memory growth.

**Parimi kryesor:** optimizojmë atë që përdoruesi e ndjen, jo vetëm benchmark-un.

---

# 2. Guardrails — gjërat që nuk duhet të thyhen

Çdo optimizim duhet të ruajë 100%:

- të dhënat ekzistuese të barnave;
- adult/pediatric population logic;
- dosage content dhe safety rules;
- clinical source fidelity;
- ATC/category semantics;
- search/filter/sort rezultatet;
- prescription functionality;
- authentication;
- offline/PWA behavior;
- API contracts;
- Neon schema dhe backend semantics;
- current clinical workflow.

## Ndalohet si “performance fix”

- shkarkimi i gjithë dataset-it vetëm që frontend-i të duket më i shpejtë;
- polling;
- duplicate requests;
- aggressive prefetching pa benefit të matur;
- rritja e Neon/API traffic për të maskuar frontend lag;
- infinite scroll nëse ndryshon workflow-in e registry;
- framework rewrite pa evidence;
- redesign që heq informacion klinik;
- CSS overrides të reja pa kontrolluar konfliktin ekzistues;
- virtualization vetëm sepse është teknikë moderne.

---

# 3. Objektivat e matshme

Këto janë **targets**, jo pretendime për gjendjen aktuale.

## Interaction targets

| Fusha | Target |
|---|---:|
| Visual response pas click/tap | < 100 ms |
| Input/typing main-thread blocking | ideal < 50 ms |
| Search request scheduling pas debounce | pa work shtesë të panevojshëm |
| Filter/sort UI feedback | < 100 ms |
| Detail open feedback | < 100 ms |
| Long tasks gjatë interaction | sa më afër zero > 50 ms |
| Stale request overwrites | 0 |
| Duplicate requests për të njëjtin action | 0 |
| Horizontal page overflow | 0 në viewport-et e testuara |
| Console runtime errors | 0 |
| Clinical regression | 0 |

## Web performance targets

- INP: synim **≤ 200 ms**;
- CLS: synim **< 0.10**;
- first usable registry UI të mos presë full registry runtime;
- main thread të mbetet responsive gjatë parsing/loading;
- scrolling pa jank të dukshëm;
- memory pas interaction loops të stabilizohet, jo të rritet vazhdimisht.

---

# 4. Prioritetet

## P0 — duhet bërë së pari

1. Baseline me evidence.
2. Search/filter latency.
3. Registry render + DOM/listener lifecycle.
4. Mobile 320–430 px.
5. Tablet 768–1024 px.
6. Main-thread startup.
7. Duplicate/stale request audit.
8. Detail / “Më shumë” latency.

## P1 — pas P0

9. CSS/layout cleanup.
10. Observer/timer/listener cleanup.
11. Long-session memory stability.
12. Navigation and modal polish.
13. Desktop large-screen polish.

## P2 — maintainability

14. Runtime patch consolidation.
15. Bundle/asset cleanup.
16. Automated performance budgets.
17. Documentation dhe final regression matrix.

---

# 5. Faza 0 — Baseline para çdo ndryshimi

**Asnjë optimization PR nuk fillon pa baseline.**

## 5.1 Viewport matrix

Testo minimalisht:

- 320 × 568;
- 375 × 667;
- 390 × 844;
- 430 × 932;
- 768 × 1024;
- 1024 × 768;
- 1280 × 800;
- 1440 × 900;
- 1920 × 1080 kur është e mundur.

## 5.2 Network modes

- normal broadband;
- Fast 4G / mobile-like throttling;
- slow connection;
- warm cache;
- cold cache;
- offline recovery për flows që suportohen.

## 5.3 Flows që maten

1. cold page load;
2. warm page load;
3. auth-ready → registry usable;
4. search: 1 karakter;
5. search: 2–5 karaktere;
6. rapid typing + deletion;
7. clear search;
8. status filter;
9. category/ATC switch;
10. sort asc/desc;
11. pagination next/previous;
12. page-size change;
13. “Më shumë” / detail;
14. close detail;
15. return focus;
16. prescription/advanced handoff;
17. modal open/close;
18. horizontal table scroll;
19. long vertical scroll;
20. mobile keyboard open/close;
21. orientation change;
22. desktop resize;
23. 20-cycle search/filter/page stress test.

## 5.4 Evidenca që ruhet

Për çdo flow:

- network request count;
- endpoint;
- payload size;
- request duration;
- main-thread trace;
- long tasks;
- scripting time;
- style/layout time;
- paint time;
- DOM node count;
- listener/observer behavior;
- layout shifts;
- memory before/after;
- screenshots kur ka responsive issue;
- console warnings/errors.

## Definition of Done — Faza 0

- baseline i dokumentuar;
- bottlenecks të renditura sipas user impact;
- secili bottleneck ka evidence;
- nuk bëhen ndryshime “me hamendje”.

---

# 6. Faza 1 — Search, filter, sort dhe pagination

Search është interaction kritik dhe duhet të ndihet instant edhe kur request-i merr kohë.

## Audit

Kontrollo:

- work brenda çdo `input` event;
- debounce path;
- `includeTotal` / exact count queries;
- stale requests;
- aborted requests;
- duplicated queries;
- DOM reconstruction pas response;
- pagination reconstruction;
- count badge updates;
- filter → search interaction;
- rapid query changes;
- back/forward behavior.

## Hipoteza prioritare

### H1 — exact total gjatë desktop search

Mobile lightweight tashmë mund të shmangë exact count gjatë typing-ut. Mat nëse desktop exact total po shton latency ose Neon work.

Nëse po:

- shfaq rezultatet pa pritur exact total;
- exact total merret vetëm kur UX realisht e kërkon;
- clear search mund të rikthejë totalin e plotë;
- mos rrit numrin total të requests.

### H2 — stale response race

Verifiko që request-i i vjetër:

- abortohet;
- nuk mund të overwrite query-n e re;
- nuk ndryshon pagination/count pas query change.

### H3 — repeated query

Nëse i njëjti state kërkohet disa herë menjëherë, mat nëse client dedupe do të ndihmonte pa cenuar freshness.

## Acceptance criteria

- typing nuk ngrin UI;
- input value shfaqet menjëherë;
- zero stale overwrite;
- zero duplicate request për një action normal;
- search/filter/sort rezultatet mbeten identike;
- Neon/API traffic nuk rritet.

---

# 7. Faza 2 — Registry render dhe DOM lifecycle

Qëllimi është të ulim DOM churn pa komplikuar kodin kot.

## Audit targets

- `renderRows()`;
- header rendering;
- pagination rendering;
- count badge;
- row actions;
- checkbox/select listeners;
- detail listeners;
- table geometry reconciliation;
- dosage cell updates;
- focus/scroll restoration.

## Mat

- render duration për 25 rows;
- render duration për 50 rows;
- DOM nodes para/pas;
- listeners pas 1, 10 dhe 20 render cycles;
- layout/paint cost;
- forced reflow;
- GC/memory behavior.

## Kandidatë për optimization vetëm pas evidence

- event delegation në `tbody`;
- one-time listeners në stable parent nodes;
- mos-rindërtim i header-it kur nuk ka state change;
- partial update i pagination/count;
- batching i DOM writes;
- shmangie read-after-write;
- reuse i stable DOM nodes;
- `DocumentFragment` kur matja tregon benefit;
- idempotent geometry updates.

## Mos bëj

- 4,000+ rows në DOM;
- framework migration;
- virtualization pa nevojë;
- nested observers në gjithë document tree.

## Definition of Done

- render cost i dokumentuar before/after;
- zero listener accumulation;
- zero table alignment regression;
- zero clinical cell loss;
- pagination/search functionality identike.

---

# 8. Faza 3 — Responsive V2

Responsive nuk është “desktop i zvogëluar”. Çdo klasë ekrani testohet si workflow real.

## 8.1 Mobile — 320 / 375 / 390 / 430 px

Kontrollo:

- page shell;
- top navigation;
- search;
- filters;
- registry cards/rows;
- long trade names;
- long active substances;
- ATC/strength/form wrapping;
- pagination;
- “Më shumë” button;
- detail screen/dialog;
- keyboard open;
- focus;
- scroll lock;
- orientation change;
- bottom safe area;
- sticky controls;
- touch target size;
- overscroll.

### Mobile acceptance

- zero page-level horizontal overflow;
- asnjë clipped control;
- asnjë overlap;
- search usable me keyboard të hapur;
- detail nuk kalon viewport-in në mënyrë të pakontrolluar;
- user mund të kthehet te row i njëjtë;
- nuk humbet informacion klinik.

---

## 8.2 Tablet — 768 / 820 / 1024 px

Tablet duhet trajtuar si kategori më vete.

Audit:

- renderer breakpoint;
- sidebar width;
- toolbar wrapping;
- table column crowding;
- touch targets;
- horizontal scroll owner;
- filter layout;
- modal width;
- landscape vs portrait;
- sticky header.

**Breakpoint ndryshohet vetëm me geometry evidence.**

---

## 8.3 Desktop — 1024 / 1280 / 1440 / 1920 px

Audit:

- content max-width;
- whitespace;
- table density;
- column widths;
- sticky table header;
- horizontal overflow;
- filter row alignment;
- pagination position;
- detail/modal max-width/max-height;
- keyboard navigation;
- focus indicator.

## Definition of Done — Responsive

- zero accidental horizontal page overflow;
- asnjë control jashtë viewport-it;
- asnjë overlap;
- controlled table scrolling kur duhet;
- clinical text accessible;
- touch + keyboard workflows të plota.

---

# 9. Faza 4 — Main-thread startup dhe initial load

Qëllimi: UI bazë të bëhet interactive para punës jo-kritike.

## Audit

Kontrollo:

- script order;
- blocking JS;
- auth-ready path;
- mobile/desktop lightweight owner selection;
- registry runtime loader;
- fallback runtime conditions;
- worker creation;
- dosage loader;
- idle callbacks;
- timers;
- requestAnimationFrame chains;
- synchronous storage reads;
- JSON transformations;
- DOM queries në startup;
- font/image work.

## Optimization rules

- critical UI first;
- optional features later;
- CPU-heavy parsing jashtë main thread kur ka evidence;
- chunk long synchronous work;
- yield mes batch-eve;
- mos preload full registry runtime në normal lightweight startup;
- mos krijo delayed heavy task që godet user-in pas 2–5 sekondash.

## Definition of Done

- no avoidable long task në critical startup;
- registry shell responsive;
- full fallback runtime ngarkohet vetëm kur duhet;
- first interaction nuk bllokohet nga dosage/advanced features.

---

# 10. Faza 5 — “Më shumë”, detail dhe advanced handoff

Ky interaction duhet të ketë feedback të menjëhershëm.

## Audit

- click → visual feedback;
- click → request start;
- click → detail visible;
- detail data source;
- repeated detail request;
- full runtime handoff;
- replay behavior;
- double activation;
- scroll position;
- focus trap;
- focus restoration;
- close latency;
- Escape/back behavior;
- mobile scroll owner.

## Qëllimi

Mos zgjo full runtime për një action lightweight nëse funksionaliteti i njëjtë mund të bëhet sigurt me payload të vogël — **por vetëm nëse kontrata klinike dhe testet e lejojnë**.

## Acceptance

- feedback <100 ms target;
- zero double action;
- zero lost focus;
- zero stuck body scroll;
- zero duplicate detail fetch;
- detail content identik klinikisht.

---

# 11. Faza 6 — CSS dhe layout cleanup

Nuk është redesign. Është reduktim konfliktesh dhe paint/layout cost.

## Audit

- duplicated selectors;
- multiple overrides për të njëjtin component;
- `!important` chains;
- deep selectors;
- global selectors;
- large shadows;
- blur/backdrop-filter;
- transitions që prekin layout;
- hidden elements që ende marrin layout space;
- duplicate responsive rules;
- dead CSS;
- font families/weights;
- repeated style patches.

## Rregull pune

Para se të shtohet CSS i ri:

1. gjej existing rule;
2. identifiko konfliktin;
3. hiq redundancy kur është safe;
4. konsolido shared pattern;
5. vetëm pastaj shto rregull të ri.

## Animation policy

Prefero:

- `transform`;
- `opacity`.

Shmang animimin e panevojshëm të:

- width;
- height;
- top/left;
- expensive shadows/filters.

## Definition of Done

- më pak override layers;
- responsive styles më të parashikueshme;
- paint/layout cost jo më i keq;
- zero visual regression serioz.

---

# 12. Faza 7 — Observers, listeners, timers dhe memory

## Audit

- `MutationObserver`;
- `ResizeObserver`;
- scroll handlers;
- resize handlers;
- document-level click handlers;
- media-query listeners;
- timers;
- intervals;
- custom event listeners;
- abort controllers;
- modal/detail listeners;
- listeners të rreshtave pas rerender.

## Kontrollo lifecycle

Çdo listener/observer duhet të ketë:

- owner të qartë;
- reason për ekzistencë;
- bounded scope;
- cleanup kur component/runtime largohet;
- idempotent initialization.

## Stress test

Bëj 20–50 cikle:

- search;
- filter;
- pagination;
- detail open/close;
- resize;
- navigation back/forward.

Pastaj krahaso memory dhe active listeners.

## Definition of Done

- zero obvious listener leak;
- zero observer loop;
- memory stabilizohet pas GC;
- interactions nuk bëhen gradualisht më të ngadalta.

---

# 13. Faza 8 — Network discipline dhe Neon efficiency

Frontend speed nuk duhet të blihet me database load.

## Audit

- request waterfall;
- duplicate endpoint calls;
- exact count calls;
- payload fields;
- repeated detail requests;
- page navigation requests;
- cache headers;
- service worker behavior;
- browser cache behavior;
- ETag/304 aty ku kontrata e lejon;
- canceled requests;
- request retry behavior.

## Kontroll i detyrueshëm

Për çdo optimization:

`requests_after <= requests_before`

për të njëjtin normal user flow, përveç nëse ka arsye funksionale të dokumentuar.

## Definition of Done

- zero accidental duplicate requests;
- payload minimal për lightweight views;
- no polling;
- no unnecessary full dataset request;
- Neon transfer nuk rritet për shkak të frontend optimization.

---

# 14. Faza 9 — Build/runtime patch consolidation

Build chain aktual ka shumë patch scripts. Kjo duhet trajtuar si maintainability/performance-risk work, jo si delete spree.

## Audit map

Krijo tabelë:

| Patch | File që prek | Function/selector | Arsye | Ende nevojitet? | Mund të integrohet në source? |
|---|---|---|---|---|---|

## Procesi i konsolidimit

1. mapo çdo patch;
2. identifiko patches që prekin të njëjtin file;
3. identifiko superseded phases;
4. krahaso source me final generated runtime;
5. integro vetëm një grup të vogël në source;
6. build;
7. full tests;
8. compare generated artifacts;
9. hiq patch vetëm kur output-i mbetet korrekt.

## Nuk lejohet

- heqje masive e patches në një commit;
- ndryshim i runtime behavior pa regression tests;
- manual edits vetëm në generated artifact kur source mbetet gabim.

## Definition of Done

- chain më i shkurtër;
- source-of-truth më i qartë;
- build determinist;
- zero regression.

---

# 15. Faza 10 — Assets, fonts dhe page weight

## Audit

- JS files që ngarkohen në registry page;
- CSS files;
- fonts;
- unused weights;
- duplicate icons;
- images;
- preload/prefetch hints;
- service worker precache list;
- cache-busting versions;
- dead legacy assets.

## Qëllimi

- mos ngarko asset para se të nevojitet;
- mos preload heavy fallback runtime;
- mbaj critical CSS/JS të vogël;
- prefero browser-native capabilities kur janë të mjaftueshme.

---

# 16. Regression matrix e detyrueshme

Pas çdo faze testohen përsëri:

## Registry

- page load;
- table load;
- search;
- search clear;
- filter;
- ATC category;
- sort;
- pagination;
- page size;
- row detail;
- dosage columns;
- personal note;
- prescription selection;
- column picker;
- form picker.

## Responsive

- 320;
- 375;
- 390;
- 430;
- 768;
- 1024;
- 1280;
- 1440+.

## Navigation/PWA

- authenticated load;
- refresh;
- back/forward;
- offline supported path;
- online recovery;
- cache revision;
- session expiry.

## Clinical safety

- adult dose;
- pediatric dose;
- population label;
- source links;
- verification state;
- prescription notation;
- ATC mapping;
- drug identity.

---

# 17. Standardi për çdo performance fix

Asnjë fix nuk merge-ohet pa këto 7 pika:

1. **Problem** — çfarë lag-u po ndodh?
2. **Evidence** — trace, timing, request count, screenshot ose test.
3. **Root cause** — pse po ndodh?
4. **Smallest safe fix** — ndryshimi minimal.
5. **Before/after** — çfarë u përmirësua?
6. **Regression verification** — çfarë testuam?
7. **Network/clinical check** — traffic dhe data behavior të pandryshuara.

Template:

```md
### Problem
...

### Evidence before
...

### Root cause
...

### Change
...

### Evidence after
...

### Regression tests
...

### Neon/API impact
No increase / ...

### Clinical impact
None / ...
```

---

# 18. Rend implementimi i rekomanduar

## Sprint A — Measure + fastest wins

1. baseline;
2. desktop search exact-count audit;
3. duplicate/stale request audit;
4. row listener/render audit;
5. mobile 320–430 geometry fixes;
6. tablet geometry audit.

## Sprint B — Interaction performance

7. search/filter optimization;
8. table render optimization;
9. detail open/close optimization;
10. pagination/sort optimization;
11. focus/scroll fixes.

## Sprint C — Main thread + CSS

12. startup trace;
13. defer/chunk non-critical work;
14. CSS conflict cleanup;
15. observers/listeners cleanup;
16. memory stress test.

## Sprint D — Maintainability

17. patch map;
18. patch consolidation small batches;
19. asset cleanup;
20. automated budgets;
21. full regression.

---

# 19. Performance budget për CI

Pas baseline-it, shto thresholds që kapin regresionet.

Candidates:

- lightweight registry normal path nuk duhet të preload full runtime;
- page API size duhet të mbetet bounded;
- mobile page size maksimum 50;
- desktop server request cap maksimum 50;
- no body-wide MutationObserver;
- no full registry parse në normal lightweight startup;
- no duplicate listener initialization;
- no accidental new registry API call gjatë typing për çdo keystroke;
- no new page-level horizontal overflow në test viewports.

Threshold-et numerike finale caktohen **pas baseline**, jo arbitrarisht.

---

# 20. Definition of Done — V2 i plotë

Performance & Responsive V2 konsiderohet i përfunduar vetëm kur:

- [ ] baseline ekziston;
- [ ] P0 bottlenecks janë matur dhe adresuar;
- [ ] search typing është responsive;
- [ ] stale/duplicate requests janë eliminuar;
- [ ] table rendering nuk ka unnecessary churn të provuar;
- [ ] detail open/close ndihet i menjëhershëm;
- [ ] mobile 320–430 px kalon;
- [ ] tablet 768–1024 px kalon;
- [ ] desktop 1280–1440+ kalon;
- [ ] zero accidental page overflow;
- [ ] zero modal clipping;
- [ ] zero observer/listener leak i njohur;
- [ ] main-thread startup është audituar;
- [ ] CSS conflicts kryesore janë konsoliduar;
- [ ] patch chain është mapuar dhe reduktuar vetëm kur safe;
- [ ] Neon/API traffic nuk është rritur;
- [ ] clinical behavior është identik;
- [ ] full test suite kalon;
- [ ] before/after evidence është dokumentuar.

---

# 21. Rregulli final

**Mos optimizo atë që nuk është matur. Mos ndrysho backend-in për të fshehur frontend lag. Mos sakrifiko clinical correctness për performance.**

Rendi i punës është gjithmonë:

> Measure → identify root cause → smallest safe fix → verify → measure again → regression test.

Ky është master plan-i që duhet ndjekur për Performance & Responsive V2.