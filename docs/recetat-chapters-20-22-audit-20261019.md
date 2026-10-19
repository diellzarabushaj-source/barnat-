# Recetat — kapitujt 20–22

Burimi i Recetave përfundon te kapitulli 22. U krahasuan të 148 skemat ekzistuese me [dokumentin kanonik](https://docs.google.com/document/d/119EyMzSHYV2SVYXLo6_P2EgkI_8Hukw_uNDvGuewyNg/edit). Metadata e Drive konfirmoi se burimi mbetet i pandryshuar që nga 2026-09-03T07:58:31.293Z; u përdor eksporti DOCX i marrë më 19 tetor, me SHA-256 `99b014c6c8d0dee4b0236dffd383483de0e3c963cf12958e42ea6ee8b238276b`.

| Kapitulli | Skema të kontrolluara | Skema të korrigjuara | Me vërejtje klinike |
| --- | ---: | ---: | ---: |
| 20 — Neuro-Spine Surgery | 17 | 0 | 6 (nga kontrolli i mëparshëm) |
| 21 — Gjinekologjia & Obstetrika | 40 | 37 | 8 |
| 22 — Pediatria & Neonatologjia | 91 | 88 | 36 |
| Gjithsej | 148 | 125 | 50 |

## Përmbajtja dhe ndarja e hapave

Të 2,938 paragrafët jo-Rx u ruajtën në rendin e burimit. U hoqën 14 fragmente të ngritura gabimisht si hapa të pavarur dhe u rikthyen pesë tituj shënimesh. Këtu përfshihen kohëzgjatja e terapisë së kisteve, udhëzimet e lëngjeve/rehidratimit, tabela e vëllimeve të paracetamolit, dozat referuese të meningitit dhe shenjat ≥ në profilaksinë e tetanusit.

Fragmenti PLUS i pneumonisë pediatrike ribashkohet me signaturën e plotë të Amoxicillin/Clavulanic acid + Clindamycin; paragrafi vijues mbetet shënim më vete. Titujt e shënimeve të cerebral palsy rikthehen të plotë.

Kapitulli 20 ishte korrigjuar në publikimin e mëparshëm dhe nuk merr shkrime të përsëritura. Nuk shtohen dokumente të reja në këtë fazë. Identitetet e dokumenteve, çelësat e hapave/elementeve dhe statuset e shqyrtimit mbeten të pandryshuara. Vetëm title, sourceHeading dhe logicBlocks përgatiten për patch, me kontroll të revisionit dhe vlera të mëparshme për rollback në artefaktin lokal.

Konvertimi i përsëritur prodhon zero ndryshime. Tabelat, figurat dhe ekuacionet e pambështetura refuzohen shprehimisht. Modeli aktual i Recetave ruan fjalët, shenjat dhe paragrafët; nuk përfaqëson çdo tipar tipografik të DOCX.

## Kontrolli klinik

50 skema kanë vërejtje të synuara: 44 në kapitujt 21–22 dhe gjashtë ekzistuese në kapitullin 20. Këto përfshijnë edhe mungesë konteksti/përqendrimi; nuk janë të gjitha gabime dozimi të konfirmuara. Teksti burimor mbetet i dukshëm me lidhje referimi. Kalimi i skemës në draft bllokohet deri në sqarim. Asnjë regjim zëvendësues, dozë ose status klinik nuk caktohet automatikisht.

Këto kontrolle të synuara nuk përbëjnë certifikim klinik të skemave të tjera. Duhen verifikuar produkti konkret, mosha, pesha, rruga, indikacioni, ndërveprimet dhe funksioni renal/hepatik nga përgjegjësi klinik. Regjistrimi në Kosovë nuk nxirret nga autorizimet britanike, amerikane ose të BE-së.

| Skemat | Gjetja | Referenca |
| --- | --- | --- |
| 20.10, 20.11, 20.12, 20.13, 20.17, 20.16, 22.68, 22.70, 22.78 | Diazepam: hollimi në 8 mL NaCl për injeksion kërkon verifikim të produktit. SmPC i Diazepam Injection BP ndalon hollimin për injeksion IV/IM dhe e dallon nga hollimi për infuzion të madh. | [SmPC Diazepam Injection BP · hollimi](https://www.medicines.org.uk/emc/product/6274/smpc) |
| 21.1, 21.2, 21.13, 22.17, 22.20, 22.47, 22.53, 22.54, 22.55, 22.57, 22.65, 22.84 | Burimi jep vëllim ose lugë pa përqendrim të mjaftueshëm të preparatit. Duhet identifikuar produkti dhe sasia e substancës aktive para draftit; vëllimi nuk shndërrohet automatikisht në dozë. | [Dokumenti burimor · përqendrimi mungon](https://docs.google.com/document/d/119EyMzSHYV2SVYXLo6_P2EgkI_8Hukw_uNDvGuewyNg/edit) |
| 21.13 | HBV në shtatzëni: burimi liston tenofovir dhe më poshtë e quan të kundërindikuar. Ky konflikt kërkon rishikim; WHO e rekomandon TDF për profilaksi kur plotësohen kriteret. | [WHO 2024 · HBV dhe shtatzënia](https://www.who.int/publications/i/item/9789240090903) |
| 21.14 | Kandidiazë në shtatzëni: burimi përfshin fluconazole oral. CDC rekomandon azole topike dhe këshillon kundër fluconazole oral në këtë situatë; skema kërkon rishikim obstetrik. | [CDC · kandidiaza në shtatzëni](https://www.cdc.gov/std/treatment-guidelines/candidiasis.htm) |
| 21.17 | Burimi shkruan njëkohësisht 1-0-1 dhe TDS. Numri i administrimeve nuk përputhet dhe duhet sqaruar para draftit. | [Dokumenti burimor · shpeshtësia](https://docs.google.com/document/d/119EyMzSHYV2SVYXLo6_P2EgkI_8Hukw_uNDvGuewyNg/edit) |
| 21.20 | Trichomoniasis: alternativat e burimit me clindamycin ose metronidazole vaginal kërkojnë rishikim. CDC rekomandon nitroimidazole sistemike dhe nuk rekomandon gel metronidazole për këtë infeksion. | [CDC · trichomoniasis](https://www.cdc.gov/std/treatment-guidelines/trichomoniasis.htm) |
| 21.33 | Leuprorelin/leuprolide: burimi liston depot 22,5 mg për endometriozë. SmPC i PROSTAP 3 për këtë indikacion përshkruan formulim tjetër; duhet verifikuar produkti dhe intervali, pa zëvendësim automatik. | [SmPC PROSTAP 3 · endometrioza](https://www.medicines.org.uk/emc/product/4651/smpc) |
| 21.35 | Ulipristal për fibroidet: EMA ka tërhequr autorizimin e Esmya në BE me kërkesë të mbajtësit. Produkti, indikacioni dhe monitorimi hepatik kërkojnë rishikim; kjo nuk përcakton regjistrimin në Kosovë ose përdorimin për kontracepsion emergjent. | [EMA · Esmya](https://www.ema.europa.eu/en/medicines/human/EPAR/esmya) |
| 22.1 | Adrenalina në reanimimin neonatal: burimi bashkon dozën IV me rrugën endotrakeale. AHA/AAP i dallon këto doza; protokolli dhe rruga kërkojnë rishikim neonatal para draftit. | [AHA/AAP · reanimimi neonatal](https://cpr.heart.org/en/resuscitation-science/cpr-and-ecc-guidelines/neonatal-resuscitation) |
| 22.14, 22.69, 22.68, 22.78 | Glukoza: burimi shtyp 6–8 mL/kg/minutë për mirëmbajtje. GIR shprehet në mg/kg/min; njësia dhe shpejtësia kërkojnë korrigjim të dokumentuar. Nuk bëhet konvertim automatik. | [RCH · njësitë e GIR](https://www.rch.org.au/rchcpg/hospital_clinical_guideline_index/Neonatal_hypoglycaemia/) |
| 22.16, 22.64 | Burimi ka rrugë të paqartë ose udhëzim oral pranë një forme injektabile. Preparati dhe rruga duhen sqaruar para draftit; rrugët nuk këmbehen automatikisht. | [Dokumenti burimor · forma dhe rruga](https://docs.google.com/document/d/119EyMzSHYV2SVYXLo6_P2EgkI_8Hukw_uNDvGuewyNg/edit) |
| 22.16, 22.18, 22.19, 22.27, 22.39, 22.41, 22.52, 22.64, 22.69 | Paracetamol IV: skema nuk dallon grupin ≤10 kg nga fëmijët me peshë më të madhe. Doza, vëllimi dhe maksimumi ditor varen nga pesha dhe preparati; kjo skemë nuk zbatohet njësoj për çdo fëmijë. | [SmPC Paracetamol IV · grupet e peshës](https://www.medicines.org.uk/emc/product/100803/smpc) |
| 22.20, 22.31 | Antihistaminat: burimi përsërit të njëjtën dozë për substanca të ndryshme dhe grupmosha pediatrike. Këto skema nuk janë të këmbyeshme; doza dhe përqendrimi kërkojnë kontroll sipas produktit. | [EMA · desloratadine; kontroll sipas produktit](https://www.ema.europa.eu/en/medicines/human/EPAR/neoclarityn) |
| 22.24 | Cefaclor: burimi jep 30–40 mg/kg për dozë, ndërsa SmPC i referencës e përshkruan dozën pediatrike si total ditor të ndarë. Njësia për dozë/ditë dhe mosha kërkojnë verifikim. | [SmPC Cefaclor · doza ditore](https://www.medicines.org.uk/emc/product/15786/smpc) |
| 22.22, 22.26 | Cefuroxime: doza e shurupit në burim kërkon rishikim kundrejt cefuroxime axetil oral. Regjimet orale dhe IV nuk këmbehen; duhet kontrolluar doza për administrim, kufiri dhe pesha. | [SmPC Zinnat suspension · rruga orale](https://www.medicines.org.uk/emc/product/3814/smpc) |
| 22.27 | Vancomycin: burimi shtyp 7,5 mg/kg/ditë në pneumoni. Kjo duhet dalluar nga mg/kg për dozë dhe përshtatur sipas moshës, veshkave dhe monitorimit; kërkohet rishikim specialistik. | [SmPC Vancomycin · pediatria](https://www.medicines.org.uk/emc/product/15736/smpc) |
| 22.38 | Paracetamol: kufiri 90 mg/kg/ditë i shtypur nuk përputhet me katër doza nga 15 mg/kg çdo 6 orë. Duhet sqaruar kufiri sipas moshës, peshës dhe produktit para draftit. | [Dokumenti burimor · kufiri ditor](https://docs.google.com/document/d/119EyMzSHYV2SVYXLo6_P2EgkI_8Hukw_uNDvGuewyNg/edit) |
| 22.51 | Nitrofurantoin: skema e burimit jep një administrim në mbrëmje për trajtim të UTI akute. Trajtimi duhet dalluar nga profilaksia; kontrollohen formulimi, funksioni renal dhe shpeshtësia. | [NICE NG109 · UTI te fëmijët](https://www.nice.org.uk/guidance/ng109/chapter/Recommendations) |
| 22.57 | Lactulose: burimi shtyp 10 mg/15 mL, ndërsa produkti i referencës përmban 10 g/15 mL. Njësia dhe preparati duhen verifikuar para draftit; nuk bëhet korrigjim i heshtur. | [SmPC Lactulose · përqendrimi](https://www.medicines.org.uk/emc/product/2796/smpc) |
| 22.73 | Phenytoin: burimi shtyp shurup 125 mg/mL. DILANTIN-125 i referencës është 125 mg/5 mL; produkti dhe doza fillestare kërkojnë verifikim. Përqendrimet nuk këmbehen automatikisht. | [DailyMed · DILANTIN-125](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=f339f9e4-b289-4efe-82b9-46c57d1dc277) |
| 22.74, 22.75, 22.77 | Lamotrigine: doza fillestare e burimit duhet dalluar nga mirëmbajtja. SmPC kërkon titrim të ngadaltë sipas moshës dhe barnave shoqëruese, veçanërisht valproate, për shkak të rrezikut të reaksioneve të rënda të lëkurës. | [SmPC Lamictal · titrimi pediatrik](https://www.medicines.org.uk/emc/product/1286/smpc) |
| 22.86 | Furosemide: në kapitullin pediatrik janë shtypur doza fikse dhe kufi 600 mg/ditë. Skema duhet përshtatur sipas peshës, moshës dhe funksionit renal nga pediatri; nuk bartet regjimi i të rriturit. | [SmPC Furosemide · pediatria](https://www.medicines.org.uk/emc/product/100580/smpc) |
| 22.90 | TIG: trajtimi i tetanusit duhet dalluar nga profilaksia e plagës. Burimi liston 250 IU për trajtim, ndërsa CDC rekomandon regjim tjetër; kërkohet rishikim infektologjik. | [CDC · trajtimi i tetanusit](https://www.cdc.gov/tetanus/hcp/clinical-care/index.html) |
| 22.89 | Vaksina rabies: ACIP në burim lidhet me 0,5 mL, ndërsa CDC për HDCV/PCECV përdor vëllim tjetër. Duhet verifikuar vaksina konkrete dhe rruga; produktet WHO/ACIP nuk këmbehen nga vëllimi. | [CDC · rabies PEP](https://www.cdc.gov/rabies/hcp/clinical-care/post-exposure-prophylaxis.html) |

Për levocetirizine është kontrolluar gjithashtu [SmPC Xyzal](https://www.medicines.org.uk/emc/product/348/smpc); dozat pediatrike nuk merren nga desloratadine. Vërejtja për Esmya dallon tërheqjen tregtare të autorizimit nga kufizimet e mëparshme hepatike dhe nga kontracepsioni emergjent.

## Verifikimi teknik

- Ndërtimi i versionit të prodhimit dhe të 207 skedarët e provave kaluan.
- Kaluan 20 prova Chromium dhe 20 WebKit për telefon/desktop, duke përfshirë kapitujt 21–22, ndarjen e paragrafëve, alternativat dhe bllokimet e shtatzënisë/njësive pediatrike.
- Kaluan prova e importuesit DOCX dhe prova e re e kapitujve 20–22: identitete/statuset, 14 fragmentet, titujt e plotë, burimi i gabuar dhe strukturat e pambështetura.
- Kontrolli i pavarur përputhi të 2,938 paragrafët në rend; konvertimi i përsëritur prodhoi zero ndryshime.
- U kontrollua rezultati i shfaqjes për të 148 skemat: 1,020 elemente dhe 961 signatura kryesore; signaturat shtesë ruhen si shënime të ndara.
- Publikimi kërkon rilexim të saktë të drafteve dhe të të 148 dokumenteve të publikuara, pa promovim statusesh.

Riprodhim pa shkrime në CMS:

```text
python scripts/import-medical-hub-docx.py source.docx existing.json repairs.json --prescription-repairs --prescription-chapters 20-22 --source-document-id 119EyMzSHYV2SVYXLo6_P2EgkI_8Hukw_uNDvGuewyNg
python tests/prescription-chapters-20-22-import-test.py
node tests/recetat-source-transfer-test.js
```
