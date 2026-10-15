# Recetat — kapitujt 1–5, 16 tetor 2026

U kontrolluan 74 skema me 329 elemente dhe 325 udhëzime S., kundrejt një
eksporti të freskët DOCX të dokumentit të recetave. Kapitujt 2 dhe 4 nuk kanë
receta në burim; ndërfaqja e shpjegon këtë veçmas nga gabimet e ngarkimit.

| Kapitulli | Skema |
| --- | ---: |
| 1 — Historia dhe ekzaminimi fizik | 1 |
| 2 — Simptomat dhe pyetësori | 0 |
| 3 — Procedurat dhe aftësitë e repartit | 14 |
| 4 — Përshkrimi i barnave dhe komunikimi | 0 |
| 5 — Sëmundjet infektive | 59 |

## Korrigjimet e importit

- Dengue Group B: kushti me `≤10,000` i përket transfuzionit të trombociteve;
  u hoq nga udhëzimi i preparatit vitaminik dhe u vendos para transfuzionit.
- COVID-19 ICU/HDU: udhëzimi i remdesivirit ishte ndarë brenda `100 mL` dhe
  pjesa e dytë ishte kthyer në një hap të rremë. U ribashkua fjalia burimore.
  Kujdesi mbështetës u nda nga signatura e enoxaparinës; u ruajtën të tri
  fortësitë e titullit të saj.
- Efuzioni pleural malinj: titulli i kapitullit vijues ishte importuar si
  shënim i bllokut. U hoq vetëm titulli i futur gabimisht.

U ruajtën ID-të, rendi burimor, lidhjet dhe statuset ekzistuese të rishikimit.
Përpara publikimit u krahasuan draftet me rezultatin e konvertimit dhe u
ruajtën blloqet e mëparshme për rikthim. Pas publikimit u lexuan dhe u
krahasuan sërish të tria skemat.

## Ndërfaqja dhe kalimi në draft

Zgjedhja e kapitullit dhe e skemës është gjithmonë e dukshme. Lista e plotë
hapet sipas nevojës; kërkimi e hap automatikisht. Butonat para/prapa ndjekin
rendin e kapitullit. Pamja në telefon ka më pak përmbajtje hyrëse dhe kontrolle
të paktën 44 px. Desktop-i ruan shfletimin e gjerë dhe tastierën.

Titulli i plotë burimor ruhet në vend që të rindërtohet nga fusha të parsimit
që mund të kenë humbur intervale, emërues ose përbërës të kombinimit. Doza,
rruga, shpeshtësia, kohëzgjatja, shënimet dhe zgjedhja e një alternative
kalojnë bashkë në draft. OSE/PLUS/DHE dhe kushtet mbeten të dallueshme.
Shënimet editoriale që ishin koduar si kushte nuk shfaqen si indikacione
klinike. Importi i skemës nuk ruan, kopjon ose printon recetë automatikisht.

Gabimi i kërkimit shfaq mundësinë e riprovimit, pa e paraqitur dështimin e
lidhjes si mungesë rezultatesh.

## Dy mospërputhje klinike në vetë burimin

1. Sepsis/profilaksia e VTE dhe COVID-19 ICU/HDU, enoxaparina: burimi ka një ekuivalencë të papajtueshme
   mes IU/kg dhe mg/kg. SmPC i Sanofi dallon këto ekuivalenca dhe regjime:
   [Clexane, seksionet 2 dhe 4.2](https://www.medicines.org.uk/emc/product/4499/smpc).
2. FFP: burimi i atribuon plazmës rritje të Hb. Referenca e shërbimit të gjakut
   e përdor FFP për zëvendësimin e faktorëve të koagulimit:
   [Australian Red Cross Lifeblood](https://www.lifeblood.com.au/health-professionals/clinical-practice/use-of-blood-components/use-of-fresh-frozen-plasma).

Për tri skemat e prekura ndërfaqja shfaq problemin dhe referencën. Kalimi i skemës
në draft ndalet edhe në funksionin e transferimit. Teksti origjinal mbetet i
lexueshëm për rishikimin klinik. Nuk është zgjedhur një regjim zëvendësues dhe
nuk është ndryshuar statusi klinik në CMS. Këto dy pika mbeten për zgjidhje
nga rishikuesi klinik i përmbajtjes.

Përputhja me dokumentin nuk është rivlerësim i pavarur i të gjitha skemave
kundrejt udhëzimeve aktuale. Mos e trajto këtë audit si certifikim të plotë
klinik të librit.

## Burimi dhe provat

- [Dokumenti kanonik i recetave](https://docs.google.com/document/d/119EyMzSHYV2SVYXLo6_P2EgkI_8Hukw_uNDvGuewyNg/edit)
- SHA-256 DOCX: `4b44f6c3f5a1f320fdf7014aac5450035aa6c0e1dcc1a232f5410444f7d81b94`.
- 325/325 signatura përputhen me paragrafët e burimit, duke normalizuar
  vetëm parashtesën S., shkronjat, hapësirat dhe pikësimin për krahasim.
  Paragrafët e ndryshuar kanë edhe pohime të veçanta për tekstin e saktë,
  përfshirë shenjën `≤` dhe udhëzimin e plotë të infuzionit.
- Provat e importuesit kontrollojnë burimin e gabuar, ndryshimin e shenjës së
  kushtit, ndarjen e kujdesit mbështetës, ruajtjen e statusit dhe idempotencën.
- Provat e transferimit kontrollojnë fushat, lidhësit, shënimet, titujt e
  plotë, mbrojtjen XSS dhe ndalimin e draftit për konfliktet e konfirmuara.
- Kontrollet e projektit: 205 skedarë testesh kaluan. Provat në Chromium dhe
  WebKit mbulojnë telefonin, desktop-in, kapitujt 1–5, draftin, kërkimin dhe
  mbrojtjen e konflikteve burimore.

Riprodhim pa shkrim në CMS:

```text
python scripts/import-medical-hub-docx.py fresh-source.docx existing-guides.json repairs.json --prescription-repairs --source-document-id 119EyMzSHYV2SVYXLo6_P2EgkI_8Hukw_uNDvGuewyNg
python tests/medical-hub-docx-import-test.py
node tests/recetat-source-transfer-test.js
```
