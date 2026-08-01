# Etapa 2 — Perfeksionimi i sidebar-it ATC

## Qëllimi

Ta bëjë navigimin e kategorive të qartë, kompakt dhe të qëndrueshëm pa krijuar sidebar ose tabelë tjetër.

## Ndryshimet

- Numërime reale për 81 kategoritë, 14 grupet dhe totalin e produkteve të klasifikueshme.
- Endpoint privat dhe i lehtë `/api/atc-counts`, i bazuar në dataset-in kanonik të regjistrit.
- Cache privat në server dhe cache 5-minutësh në `sessionStorage`.
- `Të gjitha kategoritë` hap direkt `/index.html`, jo faqen e hequr të klasifikimit.
- Active state më i qartë për grupin dhe nënkategorinë.
- Vetëm një grup mund të jetë i hapur.
- Ruajtje dhe rikthim i pozicionit të scroll-it gjatë navigimit.
- Scroll automatik vetëm kur kategoria aktive nuk është e dukshme.
- Keyboard navigation: Arrow Up/Down, Arrow Left/Right, Home, End dhe Escape.
- Drawer-i mobile mbyllet pas zgjedhjes.
- Touch targets 44 px, dark mode dhe reduced motion.

## Kufizimet

- Tabela dhe kolonat e Barnave nuk ndryshojnë.
- Databaza Neon nuk ndryshon.
- Numërimet dështojnë në mënyrë të butë; navigimi mbetet funksional edhe pa endpoint.
