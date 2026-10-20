# Recetat · korrigjimet klinike 1–5 · 20 tetor 2026

## Rezultati

Auditi përfshiu 74 skema (329 elemente). Kjo ndryshesë shton 40 versione klinike të veçuara: 37 me përmbajtje operative të strukturuar dhe 3 vetëm për referencë. Dokumentet origjinale në Sanity, ID-të, marrëdhëniet dhe statuset ekzistuese nuk ndryshohen. 34 skemat e tjera ruajnë përmbajtjen e tyre; ky publikim nuk pretendon miratim të pavarur klinik për asnjërën skemë.

Në pamjen kryesore paraqiten substanca aktive, doza, rruga, shpeshtësia dhe kohëzgjatja. Referencat, dallimet e auditit, versionet dhe teksti origjinal hapen vetëm përmes ikonës “?”. Kushtet që përcaktojnë trajtimin mbeten të dukshme. Etiketa automatike “E verifikuar” hiqet nga pamja e recetave; statusi i dokumentit mbetet i lexueshëm në informacionin e zgjeruar.

## Logjika e zgjedhjeve

- “OSE” zgjedh një regjim të plotë. Nuk ka zgjedhje automatike të antibiotikut.
- “EDHE” mban të gjitha barnat e kombinimit në të njëjtën zgjedhje.
- Barnat ose hapat me kusht përfshihen vetëm pas përzgjedhjes së atij kushti.
- Drafti përmban vetëm alternativën e zgjedhur dhe informacionin klinik përkatës; nuk kopjon alternativat e tjera ose gabimet e tekstit historik.
- Tafenoquine nuk mund të lidhet me hydroxychloroquine; ndryshimi i barit të fazës së gjakut pastron një zgjedhje tashmë të papajtueshme.
- Dobutamine nuk mund të shtohet përpara hapit të noradrenalinës; çaktivizimi i atij hapi pastron shtesën.
- Drafti ekzistues i pacientit nuk mbishkruhet. Ndryshimi i një skeme burimore pas auditit çaktivizon versionin e mëparshëm klinik, në vend që ta zbatojë mbi përmbajtje të ndryshuar.

## Korrigjimet kryesore

Albumina llogaritet për litër asciti të hequr. FFP nuk pretendohet se rrit Hb. Doza terapeutike e trombociteve dallon nga një qese e vogël. Profilaksia e VTE ndahet nga dozat e trajtimit; enoxaparin 40 mg është 4000 IU anti-Xa. Te neurosifilisi, 18–24 milion njësi është totali për 24 orë. Korrigjohen cikli me gjashtë doza i artemether/lumefantrine, terapia kundër rikthimit, ndarja e praziquantel sipas species, chlamydia, sifilisi, herpes, gonorrea dhe epididimiti. Kohëzgjatja vendoset në çdo alternativë të veçantë, jo vetëm në rreshtin e fundit.

Kombinimi i gonorresë ceftriaxone me doxycycline vetëm kur chlamydia nuk është përjashtuar, ndahet nga alternativa gentamicin EDHE azithromycin. Procaine penicillin EDHE probenecid mbeten një alternativë e vetme për neurosifilis. Te dengue nuk përdoret një prag i vetëm trombocitesh për transfuzion profilaktik. Tocilizumab nuk përsëritet automatikisht pas 12 orësh. Regjimet COVID-19 ndajnë steroidet, imunomodulimin dhe profilaksinë nga antibiotikët dhe trajtimet historike.

Kontrolli online gjeti edhe udhëzimin WHO të korrikut 2026 për leishmaniazën në Afrikën Lindore: paromomycin + miltefosine parapëlqehet; kombinimi 17-ditor SSG + paromomycin ruhet si alternativë kur regjimi i parapëlqyer përjashtohet, me bazën/kripën të dalluar. Dozat alometrike të miltefosine nuk hamendësohen.

## Referencat dhe gjurmueshmëria

Lidhjet për CDC, WHO, SCCM 2026, IDSA, SmPC dhe MSF ruhen pranë secilit version në `data/recetat-clinical-revisions-1-5.json`. Versioni i librit u kontrollua nga DOCX i freskët: SHA-256 `fea98125ff003559688c36716cd4350fdb44bc67de1bd6cd0d4dc91d97b762e3`. Korrigjimet janë shtresë më vete dhe nuk importohen si fjalë të librit.

Përputhja kontrollohet nga hash-i i ID-së, titullit, kapitullit, rendit dhe të gjitha fushave semantike të blloqeve/elementeve. API-ja e kapitullit dhe kërkimi përdorin të njëjtën shtresë. Nuk kërkohet ndryshim i databazës ose migrim i dokumenteve.

Lexuesi aktual kërkon `reader=clinical-v1`. Lexuesve të vjetër me cache u jepet porta ekzistuese `source-imported` vetëm në përgjigjen API për skemat e korrigjuara, që të mos kopjojnë regjime të ndërlikuara me algoritmin e vjetër. Statusi i vërtetë ruhet si `authoringReviewStatus`; dokumentet në CMS nuk ndryshojnë. Lexuesi i ri ruan statusin origjinal edhe në përgjigjen API.

## Verifikimi

Kaluan 208 skedarë testesh të projektit dhe 25 prova të ndërfaqes në secilin prej Chromium dhe WebKit, përfshirë ekranet 320, 390, 768 dhe 1440 px. U verifikuan zgjedhjet e plota, kushtet, kopjimi vetëm i alternativës së zgjedhur, fshehja e detajeve, hapja e origjinalit, ruajtja e draftit ekzistues, mungesa e mbivendosjes së ikonës “?” dhe përputhja e 74 dokumenteve me versionet e audituara.

## Kufijtë e qëllimshëm

5.1 (ethe me rigor) kërkon diagnozë; nuk i bashkon automatikisht antimalarikët me antibiotikët. 5.7 (bartësi kronik i tifoides) kërkon kulturë/antibiogram dhe specialist. 5.56 ruan favipiravir vetëm si referencë historike. Preparatet me identitet të papërcaktuar nuk plotësohen me hamendje. Kushtet për shtatzëni, funksion renal/hepatik, peshë, rajon dhe rezistencë mbeten pjesë e vlerësimit mjekësor.

## Skemat e prekura

| Skema | Rezultati |
|---|---|
| 3.4 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 3.5 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 3.12 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.1 | Referencë; pa kalim automatik në draft |
| 5.2 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.4 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.5 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.6 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.7 | Referencë; pa kalim automatik në draft |
| 5.8 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.9 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.10 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.12 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.13 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.18 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.21 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.22 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.30 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.32 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.35 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.38 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.39 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.41 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.42 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.43 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.44 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.45 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.46 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.48 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.49 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.50 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.51 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.52 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.53 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.54 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.55 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.56 | Referencë; pa kalim automatik në draft |
| 5.57 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.58 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
| 5.59 | Regjim i strukturuar me doza dhe zgjedhje të veçuara |
