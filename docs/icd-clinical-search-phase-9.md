# Faza 9 — Kërkimi klinik dhe navigimi inteligjent ICD

Data: 2026-08-02

## Qëllimi

Kërkimi mbi 12,542 nyjet reale duhet të pranojë mënyrën si mjeku e shkruan kodin ose diagnozën, pa humbur hierarkinë dhe pa bërë inferencë diagnostike.

## Sjellja e re

### Kodet

- `A00.1` → përputhje e saktë;
- `A001` → normalizohet në `A00.1`;
- `A00 1` → normalizohet në `A00.1`;
- `I10I15` → normalizohet në `I10-I15`;
- vijat Unicode normalizohen në `-`;
- prefikset e kodeve vazhdojnë të punojnë.

Kur kodi normalizohet, UI-ja e tregon qartë para rezultateve dhe badge-i shënohet `Kodi i normalizuar`.

### Terminologjia klinike

- aliaset editoriale kërkohen drejtpërdrejt, pa klonuar tërë dataset-in për çdo tast;
- një alias editorial i saktë shënohet `Term klinik i saktë`;
- sinonimet, titujt shqip/anglisht, wildcard-et dhe korrigjimi i gabimeve të vogla ruhen;
- një kërkim simptomatik nuk inferon diagnozë më të rëndë, p.sh. `dhimbje gjoksi` nuk sugjeron automatikisht infarkt.

### Hierarkia në rezultate

Çdo rezultat bart breadcrumb-in real me emrin dhe kodin e kapitullit, bllokut dhe kategorisë prind. Kjo ndihmon dallimin mes kodeve me tituj të ngjashëm.

### Empty state

Kur nuk ka rezultat, paneli nuk zhduket. Shfaq:

- `Nuk u gjet asnjë kod ICD-10`;
- udhëzim për kod me/pa pikë, shqip, anglisht ose sinonim;
- shënimin e sigurisë se sugjerimet nuk vendosin diagnozë.

### Performanca

- motori `clinical-ranking-v3` punon mbi dataset-in e indeksuar;
- nuk krijohet kopje e 12,542 nyjeve për çdo query;
- payload-et e përsëritura ruhen në LRU cache me maksimum 120 hyrje për revision të dataset-it;
- cache key përfshin query, filtrat, faqen, revision-in dhe statusin `live/stale`;
- nuk shtohet Vercel function i ri.

## Aksesueshmëria

- combobox/listbox ekzistues ruhen;
- Arrow Up/Down dhe Enter vazhdojnë të zgjedhin e hapin kodin;
- empty state përdor `role=status`;
- breadcrumb-i mbështillet në maksimum 2–3 rreshta;
- desktop, tablet, mobile, dark mode dhe forced colors mbështeten.
