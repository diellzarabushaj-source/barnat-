# Etapa 3 — Mobile, performance dhe kontrolli final i kategorive

## Qëllimi

Ta bëjë seksionin e kategorive më të thjeshtë në telefon dhe ta izolojë rendering-un e sidebar-it nga tabela e madhe e Barnave.

## Sjellja mobile

- Kur hapet një grup ATC, grupet e tjera dhe “Të gjitha kategoritë” fshihen përkohësisht.
- Titulli i grupit të hapur bëhet komandë sticky me tekstin “Kthehu te grupet”.
- Prekja e atij titulli e mbyll grupin dhe rikthen listën e 14 grupeve.
- Nënkategoritë mbajnë touch target minimal 44 px.
- Numërimet, active state dhe dark mode ruhen.
- Sidebar-i vazhdon të mbyllet pas zgjedhjes së një nënkategorie.

## Performance

- Root panel-i dhe grupet përdorin CSS containment, kështu ndryshimet e sidebar-it nuk shkaktojnë relayout të panevojshëm të tabelës.
- Nested scrolling përdor `overscroll-behavior: contain`.
- `scrollbar-gutter: stable` shmang ndryshimin e gjerësisë gjatë scroll-it në mobile.
- Desktop-i nuk ndryshon dhe tabela/kolonat nuk preken.

## Mbrojtja nga regresionet

`tests/sidebar-atc-navigation-test.js` kontrollon:

- mobile focus mode;
- fshehjen e grupeve joaktive;
- komandën “Kthehu te grupet”;
- sticky header-in;
- dark mode;
- touch targets;
- containment dhe scroll stability;
- ruajtjen e navigimit, numërimeve dhe accessibility ekzistuese.

## Kufizimet

- Nuk ndryshohet Neon.
- Nuk krijohet serverless function i ri.
- Nuk krijohet faqe ose tabelë tjetër.
- Nuk ndryshohet struktura e kolonave të Barnave.
