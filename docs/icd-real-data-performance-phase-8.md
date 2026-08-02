# Faza 8 — Burimi real ICD dhe performanca

Data e auditimit: 2026-08-02

## Burimi

- Google Sheet: `ICD-10 WHO 2019 — Anglisht & Shqip • Hierarki e plotë`
- Spreadsheet ID: `1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0`
- Tab: `ICD-10 EN-SQ`
- GID: `329283560`
- Leja e verifikuar: `anyone / reader`, pa listim publik në kërkim.
- Eksporti CSV i audituar: 4,106,422 bytes.

## Auditimi strukturor i dataset-it real

| Niveli | Numri |
|---|---:|
| Kapituj | 22 |
| Blloqe | 274 |
| Kategori | 2,050 |
| Nënkategori | 10,196 |
| Gjithsej | 12,542 |

Kontrollet e kaluara:

- 0 kode të dyfishta;
- 0 kode bosh;
- 0 tituj zyrtarë anglisht bosh;
- 0 tituj shqip bosh në eksportin aktual;
- 0 prindër që mungojnë;
- 0 prindër të nivelit të gabuar;
- 0 mospërputhje kapitull–bllok–kategori–nënkategori;
- të gjitha kodet përputhen me formatin e nivelit të tyre.

## Ndryshimet e Fazës 8

1. `lib/icd-public-source.js` është loader-i i vetëm për CSV-në publike.
2. API-ja bazë dhe kërkimi i avancuar ndajnë të njëjtin download, parser, cache dhe fingerprint.
3. Përgjigjet HTML/login refuzohen para parser-it, edhe kur upstream kthen HTTP 200.
4. Dataset-i validohet me numrat e saktë `22 / 274 / 2050 / 10196 / 12542`.
5. Hierarkia ndërton një herë indekset:
   - kod → nyje;
   - prind → fëmijë;
   - kod → numri i fëmijëve;
   - kapitull → nyje;
   - nivel → nyje.
6. Hapja e degës dhe zgjidhja e kodit nuk skanojnë më të gjitha 12,542 nyjet në çdo kërkesë.
7. Kërkimi i avancuar ndërton vetëm një herë variantin me aliaset editoriale për çdo dataset.
8. Metadata dhe header-at e API-së ekspozojnë statusin `live/stale`, fingerprint-in, madhësinë e CSV-së dhe kohën e build-it.

## Politika e dështimit

- Nëse Google Sheet dështon pas një ngarkimi të suksesshëm, API-ja shërben cache-in e fundit me status `stale`.
- Nëse përgjigjja është HTML, bosh, mbi 6 MB ose me kolona të gabuara, dataset-i i ri nuk publikohet.
- Një dataset me numra, kode ose prindër të gabuar bllokohet plotësisht.
