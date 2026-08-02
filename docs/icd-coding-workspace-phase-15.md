# Faza 15 — ICD Coding Workspace

## Qëllimi

Profesionalizimi i modulit ICD me një workspace të përhershëm për kodin aktiv, pa e zëvendësuar pemën hierarkike ose panelin e detajeve.

## Sjellja

- Paneli vendoset mes hyrjes së modulit ICD dhe pemës hierarkike.
- Përditësohet nga URL-ja, kërkimi, klikimet në pemë dhe `popstate`.
- Shfaq kodin, titullin shqip, titullin zyrtar anglisht, nivelin dhe statusin terminologjik.
- Shfaq hierarkinë e plotë: kapitull → bllok → kategori → nënkategori.
- Shfaq qartë nëse kodi ka nënkode direkte ose është niveli më specifik i disponueshëm.
- Lejon hapjen e panelit ekzistues të detajeve dhe nënkodeve në pemë.
- Lejon kopjimin e një përmbledhjeje klinike të pastër.
- Lejon transferimin si diagnozë kryesore ose shoqëruese vetëm për kategori/nënkategori.

## Kufijtë klinikë

- Kapitujt dhe blloqet janë vetëm nivele navigimi.
- Kategoria me nënkode shfaq paralajmërim që duhet zgjedhur niveli më specifik kur dokumentacioni e mbështet.
- Workspace-i nuk sugjeron dhe nuk zgjedh automatikisht diagnozë.
- Titulli shqip nuk zëvendëson kodin zyrtar ICD-10.
- Përzgjedhja përfundimtare mbetet vendim klinik.

## Privatësia

Clipboard-i përmban vetëm:

- sistemin ICD;
- kodin;
- nivelin;
- titullin shqip;
- titullin anglisht;
- statusin e termit;
- hierarkinë.

Nuk kopjohen timestamp-e, çelësa storage, emra pacientësh ose metadata teknike runtime.

## Aksesueshmëria

- Statusi i kodit dhe veprimeve përdor `aria-live`.
- Hierarkia është `nav` me kodin aktiv të shënuar me `aria-current`.
- Fokus i dukshëm për të gjitha veprimet.
- Mbështetje për reduced motion dhe forced colors.
- Layout pa overflow në viewport 390 px.

## Testet

- `tests/icd-coding-workspace-test.js`
- `tests/icd-coding-workspace-browser.spec.js`
- `pnpm run test:icd-phase15`
