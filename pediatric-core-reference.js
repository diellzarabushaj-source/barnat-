(() => {
  'use strict';

  const SOURCES = {
    paracetamol: 'https://www.medicines.org.uk/emc/product/10240/smpc',
    ibuprofen: 'https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=dda7645f-1666-4c1f-b974-01add2ea79ac',
    diazepam: 'https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=2f799120-0d08-47cd-8183-a98f0267c845',
    urbason: 'https://cima.aemps.es/cima/dochtml/ft/50537/FichaTecnica_50537.html',
    methylprednisolone: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cd99be87-c8d9-48d6-a8e5-e081052e3f19',
    cetirizine: 'https://www.medicines.org.uk/emc/product/4132/smpc',
    amoxicillin: 'https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=c1d9749c-5d8b-4632-9368-9586f77935b0',
    gentamicin: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=5113bfad-42ca-4bb8-9343-0b08c6cd03f0',
    ceftriaxone: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=96f3fc1e-84f4-4e9b-91ac-19a1692f227a',
  };

  const CARDS = [
    {
      title: 'Paracetamol · N02BE01',
      rows: [
        ['Përdorimi tipik', 'Dhimbje e lehtë–mesatare / temperaturë'],
        ['Doza sipas peshës', '10–15 mg/kg për dozë'],
        ['Intervali', 'çdo 4–6 orë sipas nevojës'],
        ['Maksimumi i referencës', '60 mg/kg/ditë'],
        ['Shënim', 'Kontrollo të gjitha produktet që përmbajnë paracetamol; formulimi konkret mund të ketë kufizime moshe/fortësie.'],
      ],
      sources: [['eMC SmPC', SOURCES.paracetamol]],
    },
    {
      title: 'Ibuprofen · M01AE01',
      rows: [
        ['Përdorimi i referencës', 'Analgezi te fëmijët ≥6 muaj'],
        ['Doza', '10 mg/kg për dozë'],
        ['Intervali', 'çdo 6–8 orë sipas nevojës'],
        ['Maksimumi', '40 mg/kg/ditë'],
        ['Temperatura', 'Etiketa e burimit përdor 5 ose 10 mg/kg sipas temperaturës bazale.'],
        ['Kujdes', 'Vlerëso hidratimin, funksionin renal, rrezikun gastrointestinal dhe kundërindikacionet ndaj NSAID.'],
      ],
      sources: [['DailyMed', SOURCES.ibuprofen]],
    },
    {
      title: 'Diazepam · N05BA01',
      rows: [
        ['Forma e referencës', 'Tableta orale; pacientë pediatrikë ≥6 muaj'],
        ['Doza fillestare e etiketës', '1–2.5 mg, 3–4 herë/ditë'],
        ['Titrimi', 'Rritet gradualisht sipas nevojës dhe tolerancës.'],
        ['Krizat akute/statusi', 'Dozimi është specifik për formulimin, moshën, peshën dhe rrugën; nuk duhet nxjerrë nga ky regjim oral.'],
        ['Kujdes', 'Sedacion/depresion respirator; kërkon vlerësim të rrugëve të frymëmarrjes dhe barnave depresive të SNQ.'],
      ],
      sources: [['DailyMed', SOURCES.diazepam]],
    },
    {
      title: 'Urbason = methylprednisolone · H02AB04',
      rows: [
        ['Substanca aktive', 'Methylprednisolone; Urbason inj. përmban methylprednisolone hemisuccinate.'],
        ['Doza fillestare pediatrike e një etikete injektabile', '0.11–1.6 mg/kg/ditë në 3–4 doza të ndara, varësisht sëmundjes'],
        ['Astma sistemike — referencë e etiketës', '1–2 mg/kg/ditë, njëherë ose e ndarë'],
        ['Parimi', 'Nuk ka një dozë universale “Urbason”; doza individualizohet sipas sëmundjes, rëndësisë dhe përgjigjes.'],
        ['Kujdes', 'Përdor dozën më të ulët efektive për kohën më të shkurtër; trajtimi më i zgjatur kërkon plan për reduktim sipas rastit.'],
      ],
      sources: [
        ['AEMPS/CIMA — Urbason', SOURCES.urbason],
        ['DailyMed — methylprednisolone', SOURCES.methylprednisolone],
      ],
    },
    {
      title: 'Antihistaminikët · shembull: cetirizine R06AE07',
      rows: [
        ['Sqarim', '“Antihistaminikët” janë klasë; doza nuk është e njëjtë për çdo substancë.'],
        ['Cetirizine 1 mg/mL · 2–6 vjeç', '2.5 mg (2.5 mL), 2 herë/ditë'],
        ['6–12 vjeç', '5 mg (5 mL), 2 herë/ditë'],
        ['>12 vjeç', '10 mg (10 mL), 1 herë/ditë'],
        ['Indikacionet e SmPC', 'Rinit alergjik sezonal/perennial dhe urtikarie'],
        ['Kujdes', 'Në dëmtim renal doza/intervali mund të kërkojë individualizim.'],
      ],
      sources: [['eMC SmPC — cetirizine 1 mg/mL', SOURCES.cetirizine]],
    },
    {
      title: 'Amoxicillin · J01CA04',
      rows: [
        ['>3 muaj, <40 kg · infeksion i lehtë/mesatar', '25 mg/kg/ditë q12h ose 20 mg/kg/ditë q8h'],
        ['>3 muaj, <40 kg · infeksion i rëndë', '45 mg/kg/ditë q12h ose 40 mg/kg/ditë q8h'],
        ['Infeksion i traktit të poshtëm respirator', '45 mg/kg/ditë q12h ose 40 mg/kg/ditë q8h'],
        ['≤3 muaj', 'Doza e sipërme 30 mg/kg/ditë, e ndarë q12h'],
        ['≥40 kg', 'Etiketa kalon te rekomandimet e të rriturve.'],
        ['Kujdes', 'Alergjia ndaj beta-laktamëve, fokusi/rëndësia e infeksionit, kultura dhe funksioni renal ndikojnë në zgjedhjen e regjimit.'],
      ],
      sources: [['DailyMed', SOURCES.amoxicillin]],
    },
    {
      title: 'Gentamicin · J01GB03',
      rows: [
        ['Fëmijë', '6–7.5 mg/kg/ditë = 2–2.5 mg/kg q8h'],
        ['Foshnja dhe neonatë >1 javë', '7.5 mg/kg/ditë = 2.5 mg/kg q8h'],
        ['Prematurë / neonatë ≤1 javë', '5 mg/kg/ditë = 2.5 mg/kg q12h'],
        ['Rruga', 'IM ose IV sipas produktit dhe situatës klinike'],
        ['Kujdes kritik', 'Ky është regjim tradicional i ndarë nga etiketa. Rregullohet në insuficiencë renale dhe monitorohen nivelet serike kur indikohet; protokollet extended-interval mund të përdorin skema të tjera.'],
        ['Monitorimi', 'Funksioni renal; me trajtim të zgjatur edhe funksioni auditiv/vestibular.'],
      ],
      sources: [['DailyMed', SOURCES.gentamicin]],
    },
    {
      title: 'Ceftriaxone · J01DD04',
      rows: [
        ['Infeksione serioze, jo meningjit', '50–75 mg/kg/ditë; zakonisht e ndarë q12h; maks. 2 g/ditë'],
        ['Meningjit', '100 mg/kg/ditë; 1 herë/ditë ose q12h; maks. 4 g/ditë'],
        ['Otit akut bakterial', '50 mg/kg IM një dozë; maks. 1 g'],
        ['Kujdes neonatal', 'Kundërindikuar te neonatët hiperbilirubinemikë dhe te neonatët që kërkojnë/pritët të kërkojnë solucione IV me kalcium.'],
        ['Rruga', 'IV/IM sipas indikacionit dhe produktit'],
      ],
      sources: [['DailyMed', SOURCES.ceftriaxone]],
    },
  ];

  const element = (tag, className = '', text = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  function addRow(list, label, value) {
    list.append(element('dt', '', label), element('dd', '', value));
  }

  function addSourceRow(list, label, href) {
    const dt = element('dt', '', 'Burimi');
    const dd = element('dd');
    const link = element('a', '', label);
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    dd.append(link);
    list.append(dt, dd);
  }

  function buildCard(card) {
    const details = element('details', 'pediatric-explain');
    details.open = true;
    details.append(element('summary', '', card.title));
    const list = element('dl', 'pediatric-explain-list');
    card.rows.forEach(([label, value]) => addRow(list, label, value));
    card.sources.forEach(([label, href]) => addSourceRow(list, label, href));
    details.append(list);
    return details;
  }

  function render() {
    if (document.documentElement.dataset.drxApp !== 'dozologjia-v2') return;
    if (document.getElementById('pediatricCoreSubstances')) return;

    const safety = document.querySelector('.dosage-safety-note');
    const page = safety?.parentElement;
    if (!safety || !page) return;

    const article = element('article', 'dosage-calculation-panel');
    article.id = 'pediatricCoreSubstances';
    article.setAttribute('aria-labelledby', 'pediatricCoreSubstancesTitle');
    article.style.marginTop = '13px';

    const header = element('header', 'dosage-section-head');
    const heading = element('div');
    const h2 = element('h2', '', 'Substancat bazë — dozologji pediatrike e verifikuar');
    h2.id = 'pediatricCoreSubstancesTitle';
    heading.append(h2, element('p', '', 'Referencë e shpejtë sipas burimit të cituar. Regjimi duhet lidhur gjithmonë me indikacionin, formulimin, moshën/peshën dhe kufijtë klinikë të pacientit.'));
    header.append(heading, element('span', 'dosage-step-state is-ready', '8 karta'));

    const body = element('div', 'pediatric-calculation');
    const intro = element('div', 'dosage-outcome-block');
    intro.append(
      element('strong', '', 'Si të lexohet kjo pjesë'),
      element('p', '', 'Dozat më poshtë janë referenca të lidhura me etiketën/SmPC e shënuar. Ato nuk aktivizojnë automatikisht kalkulatorin server-side dhe nuk zëvendësojnë protokollin lokal ose vlerësimin klinik.')
    );
    body.append(intro);
    CARDS.forEach(card => body.append(buildCard(card)));

    const warning = element('div', 'dosage-outcome-block is-danger');
    warning.setAttribute('role', 'note');
    warning.append(
      element('strong', '', 'Jo çdo dozë mg/kg është e këmbyeshme.'),
      element('p', '', 'Para llogaritjes kontrollo gjithmonë: mg/kg/dozë apo mg/kg/ditë, indikacionin, moshën/peshën, rrugën, përqendrimin, dozën maksimale, funksionin renal/hepatik dhe burimin e regjimit.')
    );
    body.append(warning);

    article.append(header, body);
    page.insertBefore(article, safety);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render, {once: true});
  } else {
    render();
  }
})();
