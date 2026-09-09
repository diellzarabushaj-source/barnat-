# DRx Medical Hub Studio

Ky Studio është ambienti i ri i autorimit për librat e Medical Hub. Ai përdor të njëjtin projekt Sanity dhe dataset si aplikacioni publik, por ka një workspace të veçantë me vetëm tre dokumente kryesore:

1. `medicalBook` — libri dhe PDF-ja kryesore në Google Drive.
2. `medicalChapter` — kapitujt e librit.
3. `medicalTopic` — temat/nënkapitujt që shkruhen nga fillimi, të ndara në seksione dhe blloqe klinike.

Modeli i vjetër (`learningTopic`, `prescriptionGuide`) nuk fshihet dhe nuk shfaqet në këtë Studio. Frontendi kalon te modeli i ri sapo të ketë tema me status `I verifikuar`; publikimi i një drafti ose teme në rishikim nuk e nxjerr atë si përmbajtje klinike.

## Nisja lokale

```powershell
pnpm install
pnpm dev
```

## Rendi i punës

1. Krijo librin dhe vendos ID-në/lidhjen e PDF-së kryesore.
2. Krijo kapitujt dhe lidhi me librin.
3. Krijo temat, lidhi me kapitullin dhe shto seksionet në rendin e librit.
4. Mbaji temat si `Draft` gjatë shkrimit; kaloji në `Në rishikim`, pastaj `I verifikuar`.
5. Plotëso emrin e verifikuesit dhe datën, vendos statusin `I verifikuar`, pastaj publiko dokumentin.

Mos kopjo tekst automatikisht nga PDF-ja ose dokumentet e recetave. Këto fusha janë ndërtuar për autorim editorial nga zero, me vendndodhjen e burimit të ruajtur veçmas.

## Struktura fleksibile e mësimeve (v2)

Hap **Libër → kapitull → mësim**, zgjidh librin dhe kapitullin, pastaj krijo një mësim. Pesë pikënisjet janë: strukturë e lirë, anamnezë/ekzaminim, sëmundje, procedurë dhe urgjencë. Libri dhe kapitulli plotësohen nga vendi ku e krijon mësimin. Pikënisjet nuk përmbajnë udhëzime mjekësore të paraverifikuara; janë vetëm skelete të redaktueshme.

Çdo mësim ka seksione të lëvizshme. Rendi i listës është rendi i leximit; fusha e vjetër numerike e seksionit nuk e mbishkruan atë. Çdo seksion pranon tekst me lista të ndërthurura, tabela, figura, shënime, hapa klinikë, receta, lista kontrolli, pyetje/shpjegime dhe kushte **Nëse → Atëherë**. Nënndarjet kanë të njëjtat blloqe bazë; nuk krijojnë nënndarje rekursive. Për nivele të tjera përdor titujt brenda tekstit ose një temë më vete.

Në receta plotëso **substancën aktive**. Grupi mund të përmbajë alternativa; fusha e çdo rreshti **Lidhja me rreshtin paraardhës** lejon kombinime të qarta `+` dhe `OSE`. Ruaj veçmas formën, fuqinë, dozën, rrugën, frekuencën, kohëzgjatjen dhe sasinë. Rreshti i parë nuk ka lidhës. Emri tregtar i vjetër është vetëm për lexim.

Tabelat kontrollojnë që çdo rresht të ketë po aq qeliza sa kolona. Etiketa opsionale e rreshtit ka kolonën e vet. Titulli i asaj kolone ndryshohet me **Titulli i kolonës së etiketave**.

Shtimi i një lloji të ri blloku në të ardhmen kërkon regjistrim te `learning-blocks.ts` / `index.ts`, mbështetje në `medical-hub-v2.js`, zgjerim të query-t nëse përdor referenca/assets dhe test të renderimit. Fushat ekzistuese mbeten të lexueshme për të ruajtur dokumentet që janë tashmë në dataset.

## Materiali i dërguar për kapitullin 1

`content/medical-hub/chapter-01-draft.json` përmban **3 mësime, 15 seksione**, nga 8 faqet unike të fotografuara (një fotografi e faqes 2 ishte e përsëritur). Është përshtatje editoriale në shqip, jo kapitulli i plotë. Burimet dhe ndryshimet editoriale janë shënuar; statusi është `draft`, pa emër verifikuesi dhe pa datë verifikimi.

Ky material është përgatitur si skedar në repository; nuk është importuar në Sanity dhe nuk zëvendëson temat ekzistuese të kapitullit 1. Përgatit një skedar importi me ID-të e librit dhe kapitullit të konfirmuara:

```bash
node scripts/prepare-medical-hub-drafts.js BOOK_ID CHAPTER_ID > chapter-drafts.ndjson
```

Gjenerohen vetëm dokumente `drafts.*` me ID të reja dhe referenca te dokumentet e zgjedhura. Importoje vetëm një herë, pas vendosjes së skemës së re; riekzekutimi gjeneron kopje të reja. Rishiko përputhjen me temat ekzistuese para importit dhe publikimit. Mos përdor `--replace` për të zëvendësuar mësimet e tjera.

## Verifikimi dhe publikimi

Nga rrënja e repository-t:

```bash
pnpm run test:medical-hub
MEDICAL_HUB_COMPOSABLE_FIXTURE=1 node tests/clinical-smoke-server.js
```

Fixture-i aktivizohet vetëm në serverin lokal të testeve dhe shfaq draftet për kontroll vizual. API-ja e prodhimit ruan kushtet ekzistuese të publikimit.

Nga `studio/`:

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm exec sanity login
pnpm exec sanity deploy --yes --schema-required
```

CLI duhet të jetë e autentikuar. Kjo Studio ka burim lokal; mos përdor MCP `deploy_schema` për ta mbishkruar. Vendos fillimisht lexuesin që njeh blloqet e reja, pastaj editorin, pastaj përmbajtjen e rishikuar.
