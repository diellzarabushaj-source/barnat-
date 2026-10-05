# Përditësimi i listës së barnave

Ngarkohet një XLSX me listën e re. Përditësohen direkt çmimet ekzistuese dhe shtohet vetëm kolona `Statusi në përditësim`: `E re`, `Ka qenë`, `S’është më`.

PDID unik është përputhja kryesore. Për PDID të munguar, të ndryshuar ose të dyfishuar, përdoren identiteti i produktit, certifikata e autorizimit dhe paketimi, ose numri i protokollit. Numri rendor i sheet-it nuk zëvendëson identitetin ekzistues të databazës. Përputhjet e paqarta bllokojnë aplikimin.

Përditësimi ruan emrin, fortësinë, formën, ATC, grupin, përdorimin, dozat, lidhjet dhe shënimet ekzistuese. Edhe të dhënat me ndërhyrje editoriale marrin çmimin e ri. Barnat që mungojnë ruhen. Mungesa shënohet vetëm kur dokumenti konfirmohet si listë e plotë aprovimi.

## Përdorimi

```sh
node scripts/update-registry-prices.js --file lista.xlsx --complete-approval-list --output preview.json
node scripts/update-registry-prices.js --file lista.xlsx --complete-approval-list --output preview.json --apply
```

Komanda e parë përgatit parapamjen; e dyta e rigjeneron nga databaza aktuale dhe aplikon një transaksion të vetëm. Aplikimi kërkon kredencialin sekret të serverit në variablat ekzistuese të mjedisit. Ky kredencial nuk vendoset në shfletues ose në GitHub.

Importi ruan hash-in e dokumentit, planin dhe kopjen paraprake në një skemë private. Riimportimi i të njëjtit dokument nuk përsërit shkrimet. Ndryshimi i të dhënave gjatë kontrollit e bllokon importin. Rreshtat e arkivuar përjashtohen nga përputhjet e reja.

## Të dhënat klinike të barnave të reja

Barnat e reja ruhen `in_review`, pa publikim dhe pa doza të supozuara. Importuesi gjeneron listën lokale të punës `preview.new-products.json` pranë parapamjes.

Për çdo produkt kërkohen përdorimi, grupi/klasa, ATC dhe dozat e të rriturve e fëmijëve në SmPC ose dokumentin zyrtar të produktit. Duhet të përputhen substanca aktive, forma, fortësia, rruga dhe popullata. Ruhen URL-ja, data/versioni i burimit dhe seksionet 4.1/4.2. Dozat varen nga indikacioni, mosha dhe pesha. Mungesa e aprovimit pediatrik shënohet shprehimisht; nuk kthehet në dozë automatike.

Përdoren procesi ekzistues DRx i arkivimit të burimeve, rregullave të dozimit dhe kontrollit klinik. Vetëm pas këtij kontrolli publikohen të dhënat. Importi i çmimeve nuk jep verifikim klinik.

## Rezultati i versionit 1.3

- 4,006 barna ekzistuese; 154 me ndryshim çmimi.
- 159 barna të reja për plotësim klinik.
- 13 barna që mungojnë, të ruajtura me `S’është më`.
- Një rresht i përsëritur në dokument u bashkua me produktin identik.
- Pesë rreshta të përkohshëm të dyfishuar u ruajtën të arkivuar pas përputhjes me certifikatën dhe paketimin.
- Kontrolli në databazë vërtetoi ruajtjen e të gjitha fushave ekzistuese përveç çmimeve, statusit dhe datës së përditësimit.

Radha private e shqyrtimit përmban të gjitha 159 barnat e reja. Për 123 ka referenca nga regjistri ekzistues; për 155 janë arkivuar burime me seksionet 4.1 dhe 4.2. Përputhja me një referencë nuk është verifikim i produktit të ri. Katër produkte ende kërkojnë burim të përshtatshëm ose nxjerrje të plotë të tekstit: Sinedol, Oxycort, Fungospor dhe Bromhexine Sopharma. 150 produkte me burime presin kontrollin e përputhjes dhe plotësimin klinik.

Përdorimi, klasa dhe propozimet e dozimit për të rritur e fëmijë u plotësuan si drafte për Gluformin, Omnitus, Demetrin, Cortiazem Retard dhe Trodon, nga SmPC i prodhuesit. Të pesë mbeten të papublikuara, me profile `in_review` dhe doza `pending`. Asnjë dozë numerike për kalkulator nuk krijohet. Pjesa tjetër e plotësimeve klinike mbetet në punë.

## Përgatitja dhe ruajtja e shqyrtimit klinik

```sh
node scripts/prepare-registry-clinical-review.js --candidates candidates.json --archives archives.json --source-sha256 SHA256 --output clinical-review.json
node scripts/prepare-registry-clinical-review.js --candidates candidates.json --archives archives.json --source-sha256 SHA256 --output clinical-review.json --apply
node scripts/stage-registry-clinical-drafts.js --queue clinical-review.json --drafts product-specific-drafts.json --archives archives.json --output validated-drafts.json
node scripts/stage-registry-clinical-drafts.js --queue clinical-review.json --drafts product-specific-drafts.json --archives archives.json --output validated-drafts.json --apply
```

`candidates.json` përmban produkte të reja të papublikuara dhe referenca ekzistuese. `archives.json` referon skedarët lokalë raw, metadata dhe seksionet e arkivuara. `--discovered-sources mapping.json` lidh dokumentet e reja të gjetura me ID-të përkatëse. Kontrollohen hash-et raw/metadata/4.1/4.2 dhe riparsimi i HTML-së. PDF-të kërkojnë shqyrtim të nxjerrjes dhe të datës/versionit.

Radha ruhet vetëm në `registry_update_private.clinical_review_queue`, me qasje vetëm të serverit. Referencat dhe dozat e tyre janë propozime, pa bartje të statusit të verifikimit. Plotësimi i drafteve pranon vetëm produkte të reja të këtij importi, me fushat klinike ende të paautoruara, identitet të pandryshuar dhe burim të arkivuar që përputhet me propozimin. Nëse një përdorues i ka redaktuar të dhënat, shkrimi bllokohet. Përsëritja e të njëjtit propozim nuk e rishkruan.

Dokumenti Excel, eksportet e databazës, tekstet klinike dhe arkivat e burimeve ruhen lokalisht. Në GitHub vendoset vetëm kodi dhe dokumentimi i procesit.
