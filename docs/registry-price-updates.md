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

Plotësimi klinik nga interneti mbetet në punë; ky import nuk pretendon se të dhënat e 159 barnave të reja janë verifikuar.
