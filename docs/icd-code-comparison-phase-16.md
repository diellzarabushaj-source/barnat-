# Faza 16 — krahasimi profesional i kodeve ICD

## Qëllimi

Të lejojë krahasimin e kontrolluar të dy ose tre kategorive/nënkategorive ICD-10 përpara përzgjedhjes përfundimtare klinike.

Krahasimi është strukturor dhe terminologjik. Ai nuk vendos diagnozë dhe nuk rekomandon automatikisht një kod.

## Kufijtë

- Maksimumi: 3 kode.
- Lejohen vetëm nivelet `category` dhe `subcategory`.
- Kapitujt dhe blloqet nuk futen në krahasim.
- Kodet deduplikohen.
- Kur arrihet kufiri, kodi i katërt refuzohet; asnjë kod ekzistues nuk largohet automatikisht.
- Gjendja ruhet vetëm në `sessionStorage` dhe vetëm si listë kodesh.

## Përmbajtja e krahasimit

Për çdo kod shfaqen:

- kodi;
- titulli shqip;
- titulli zyrtar anglisht;
- niveli;
- statusi terminologjik;
- kodi prind;
- numri i nënkodeve direkte;
- specifikësia strukturore;
- hierarkia e plotë.

Përmbledhja llogarit:

- marrëdhënien kategori–nënkod;
- kodet motra me të njëjtin prind;
- paraardhësin më të afërt të përbashkët;
- nivelet e njëjta ose të përziera;
- kodet pa nënkode direkte.

## Veprimet

- Shto kodin aktiv nga Coding Workspace.
- Shto kodin nga paneli i detajeve.
- Hiq një kod ose pastro listën.
- Shiko kodin në pemë.
- Hap detajet.
- Kopjo krahasimin pa metadata teknike.
- Transfero kodin si diagnozë kryesore ose shoqëruese.
- Mbyll/hap trupin e panelit.

## Privatësia

Nuk ruhen dhe nuk kopjohen:

- emri ose identifikuesi i pacientit;
- terapia;
- tekst i lirë klinik;
- timestamp-e të zgjedhjes;
- statuset runtime;
- çelësat e storage-it;
- metadata të brendshme të burimit.

## Aksesueshmëria

- statuset përdorin `aria-live`;
- kontrolli i hapjes përdor `aria-expanded` dhe `aria-controls`;
- butonat kanë fokus të dukshëm;
- mbështeten reduced motion dhe forced colors;
- kartat bëhen një kolonë në telefon;
- nuk lejohet horizontal overflow në 390 px.

## Testet

### Statike

`tests/icd-code-comparison-test.js`

Mbulon normalizimin, deduplikimin, kufirin 3, persistencën vetëm si kode, marrëdhëniet hierarkike, clipboard-in, privatësinë dhe asset-et.

### Browser

`tests/icd-code-comparison-browser.spec.js`

Mbulon shtimin nga workspace-i dhe detajet, rikthimin pas navigimit, krahasimin kategori–nënkategori, kufirin 3, kopjimin, transferimin shoqërues dhe mobile viewport.