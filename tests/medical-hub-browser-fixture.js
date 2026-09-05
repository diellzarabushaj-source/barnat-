'use strict';

const FIXTURE_GENERATED_AT = '2026-09-04T08:00:00.000Z';
const FIXTURE_SOURCE_URL = 'https://drive.google.com/file/d/1c1UE1EYQYOji69nyn6OB3prY96YInmFv/view';

const BOOK = Object.freeze({
  title:'Doctor on Duty',
  edition:'Botimi i 3-të',
  publicationYear:'2024–25',
  language:'sq',
  sourceType:'google-drive',
  sourceFileId:'1c1UE1EYQYOji69nyn6OB3prY96YInmFv',
  sourceRevisionId:'fixture-revision-2026-09-04',
  sourceUrl:FIXTURE_SOURCE_URL,
  sourceName:'Doctor on Duty 3rd Edition.pdf',
  reviewStatus:'verified',
});

const REVIEWED_AT = '2026-08-28T10:30:00.000Z';
const REVIEWER = 'Dr. Arta Krasniqi · QA fixture';
const VERSION = `${BOOK.title} · ${BOOK.edition} · ${BOOK.publicationYear}`;

function sourceDocument(chapterNumber, headingPath, pageStart, pageEnd = pageStart) {
  return {
    type:BOOK.sourceType,
    fileId:BOOK.sourceFileId,
    revisionId:BOOK.sourceRevisionId,
    title:BOOK.title,
    edition:BOOK.edition,
    publicationYear:BOOK.publicationYear,
    language:BOOK.language,
    chapterNumber,
    headingPath,
    pageStart,
    pageEnd,
    url:BOOK.sourceUrl,
    ingestedAt:FIXTURE_GENERATED_AT,
  };
}

function sourceCard(locator) {
  return {
    _key:`source-${locator.chapterNumber}-${locator.pageStart}`,
    title:`${BOOK.title} — ${locator.headingPath.join(' / ')}`,
    organization:'DRx QA · Google Drive fixture',
    url:locator.url,
    publishedAt:'2024-09-01',
    note:`${BOOK.edition}, ${BOOK.publicationYear}; faqet ${locator.pageStart}–${locator.pageEnd}. Të dhëna demonstrimi për QA, jo për përdorim klinik.`,
  };
}

function clinicalStep(key, title, action, extra = {}) {
  return { _key:key, title, action, ...extra };
}

function nestedSection({ id, chapterNumber, lessonNumber, sectionNumber, title, summary, steps, reviewStatus = 'verified', icdCodes = [], procedureCodes = [], redFlags = [], whenToRefer = '' }) {
  return {
    _id:id,
    question:`Seksioni ${chapterNumber}.${lessonNumber}.${sectionNumber}`,
    title,
    summary,
    contentKind:'section',
    chapterNumber,
    lessonNumber,
    sectionNumber,
    keywords:[title, summary],
    icdCodes,
    procedureCodes,
    steps,
    prescriptions:[],
    figures:[],
    redFlags,
    whenToRefer,
    reviewStatus,
    reviewedBy:REVIEWER,
    lastReviewedAt:REVIEWED_AT,
    version:VERSION,
  };
}

const topicSeeds = [
  {
    _id:'medicalhub-dod-ch01-sub01',
    question:'Kapitulli 1 · Tema 1.1',
    title:'Anamneza e strukturuar dhe historia e sëmundjes aktuale',
    slug:'anamneza-e-strukturuar-dhe-historia-e-semundjes-aktuale',
    chapterNumber:1,
    lessonNumber:1,
    summary:'Një rrjedhë e qartë për ankesën kryesore, kronologjinë, historinë mjekësore dhe verifikimin e të dhënave me pacientin.',
    keywords:['anamnezë','ankesa kryesore','SOCRATES','histori mjekësore','barna','alergji'],
    icdCodes:['Z71.1'],
    procedureCodes:[],
    reviewStatus:'verified',
    sourcePages:[12, 19],
    steps:[
      clinicalStep('history-open','Hapja e konsultës','Konfirmo identitetin, arsyen e vizitës dhe pritjet e pacientit.',{ setting:'Konsulta fillestare' }),
      clinicalStep('history-current','Historia e sëmundjes aktuale','Dokumento fillimin, ecurinë, faktorët përkeqësues dhe lehtësues, simptomat shoqëruese dhe trajtimet e provuara.',{ why:'Kronologjia e saktë ndihmon në ndërtimin e diagnozës diferenciale.' }),
      clinicalStep('history-close','Përmbledhja dhe verifikimi','Përsërit pikat kryesore me fjalë të thjeshta dhe kërko korrigjime para se të vazhdosh.'),
    ],
    contentOrder:[
      { _key:'order-h1', kind:'heading', title:'Historia e orientuar nga problemi' },
      { _key:'order-p1', kind:'paragraph', text:'Fixture-i ruan rendin e kapitullit dhe lokatorin e burimit për çdo temë.' },
      { _key:'order-s1', kind:'step', refKey:'history-open' },
      { _key:'order-s2', kind:'step', refKey:'history-current' },
      { _key:'order-w1', kind:'warning', title:'Kujdes gjatë QA-së', text:'Ky material është demonstrues dhe nuk zëvendëson burimin klinik të verifikuar.' },
      { _key:'order-s3', kind:'step', refKey:'history-close' },
    ],
    relatedTopics:[
      nestedSection({
        id:'medicalhub-dod-ch01-sub01-sec01', chapterNumber:1, lessonNumber:1, sectionNumber:1,
        title:'Ankesa kryesore dhe kronologjia',
        summary:'Nga fjalia hyrëse te një vijë kohore e verifikueshme.',
        steps:[clinicalStep('section-complaint','Pyetja hyrëse','Fillo me një pyetje të hapur dhe pastaj sqaro kohën, ashpërsinë dhe ndikimin funksional.')],
      }),
      nestedSection({
        id:'medicalhub-dod-ch01-sub01-sec02', chapterNumber:1, lessonNumber:1, sectionNumber:2,
        title:'Historia e barnave, alergjive dhe reaksioneve të mëparshme',
        summary:'Emri, doza, frekuenca, adherenca dhe lloji i reaksionit dokumentohen veçmas.',
        steps:[clinicalStep('section-medicines','Rakordimi i barnave','Krahaso deklarimin e pacientit me listën e barnave dhe regjistro pasiguritë për rishikim.')],
        reviewStatus:'review',
      }),
    ],
  },
  {
    _id:'medicalhub-dod-ch01-sub02',
    question:'Kapitulli 1 · Tema 1.2',
    title:'Ekzaminimi fizik sistematik nga vlerësimi i përgjithshëm deri te dokumentimi përfundimtar me terminologji të standardizuar',
    slug:'ekzaminimi-fizik-sistematik-dhe-dokumentimi',
    chapterNumber:1,
    lessonNumber:2,
    summary:'Përgatitja, shenjat vitale, inspektimi dhe ekzaminimi sipas sistemeve dokumentohen në një rend të ripërdorshëm.',
    keywords:['ekzaminim fizik','shenja vitale','inspektim','palpim','auskultim','dokumentim'],
    icdCodes:['Z00.0'],
    procedureCodes:[{ system:'ICHI', code:'PAA.AA.ZZ', label:'Ekzaminim i përgjithshëm' }],
    reviewStatus:'review',
    sourcePages:[20, 34],
    steps:[
      clinicalStep('exam-prepare','Përgatitja dhe pëlqimi','Shpjego ekzaminimin, siguro privatësinë dhe merr pëlqimin.'),
      clinicalStep('exam-general','Vlerësimi i përgjithshëm','Regjistro gjendjen e përgjithshme, shenjat vitale dhe gjetjet që kërkojnë përparësi.'),
      clinicalStep('exam-document','Dokumentimi përfundimtar','Ndaji gjetjet pozitive nga ato negative relevante dhe shëno kufizimet e ekzaminimit.'),
    ],
    redFlags:['Paqëndrueshmëria hemodinamike kërkon vlerësim të menjëhershëm sipas protokollit lokal.'],
    whenToRefer:'Aktivizo rrugën urgjente kur gjetjet ose shenjat vitale tregojnë përkeqësim akut.',
  },
  {
    _id:'medicalhub-dod-ch04-sub01',
    question:'Kapitulli 4 · Tema 4.1',
    title:'Parimet e përshkrimit të sigurt, rakordimit të barnave dhe dokumentimit të vendimit klinik në kujdesin ndërdisiplinor',
    slug:'parimet-e-pershkrimit-te-sigurt-dhe-dokumentimit',
    chapterNumber:4,
    lessonNumber:1,
    summary:'Një kontroll i strukturuar i indikacionit, kundërindikacioneve, ndërveprimeve, monitorimit dhe komunikimit me pacientin.',
    keywords:['përshkrim i sigurt','rakordim barnash','ndërveprime','monitorim','vendim klinik'],
    icdCodes:[],
    procedureCodes:[],
    reviewStatus:'verified',
    sourcePages:[88, 101],
    steps:[
      clinicalStep('rx-indication','Konfirmo indikacionin','Lidhe çdo bar me një problem aktiv dhe dokumento objektivin e trajtimit.'),
      clinicalStep('rx-safety','Kontrollo sigurinë','Rishiko alergjitë, funksionin renal e hepatik, shtatzëninë, ndërveprimet dhe terapitë e dyfishta.'),
      clinicalStep('rx-followup','Përcakto monitorimin','Shëno parametrin, afatin dhe përgjegjësinë për rishikim.'),
    ],
  },
  {
    _id:'medicalhub-dod-ch04-sub02',
    question:'Kapitulli 4 · Tema 4.2',
    title:'Komunikimi me pacientin, familjen dhe ekipin ndërprofesional në situata komplekse dhe gjatë transferimit të kujdesit',
    slug:'komunikimi-nderprofesional-dhe-transferimi-i-kujdesit',
    chapterNumber:4,
    lessonNumber:2,
    summary:'Strukturë për vendimmarrje të përbashkët, teach-back dhe dorëzim të sigurt të informacionit.',
    keywords:['komunikim','teach-back','SBAR','familje','transferim kujdesi'],
    icdCodes:['Z71.8'],
    procedureCodes:[],
    reviewStatus:'review',
    sourcePages:[102, 116],
    steps:[
      clinicalStep('communication-plan','Përshtat komunikimin','Përdor gjuhë të kuptueshme, adresoji nevojat gjuhësore dhe konfirmo se kush duhet të përfshihet.'),
      clinicalStep('communication-handover','Dorëzimi i strukturuar','Përmblidh situatën, sfondin, vlerësimin dhe rekomandimin; përcakto veprimin pasues.'),
    ],
  },
  {
    _id:'medicalhub-dod-ch05-sub01',
    question:'Kapitulli 5 · Tema 5.1',
    title:'Qasja fillestare ndaj pacientit me ethe dhe dyshim për sëmundje infektive',
    slug:'qasja-fillestare-ndaj-etheve-dhe-infeksionit',
    chapterNumber:5,
    lessonNumber:1,
    summary:'Vlerësimi i ashpërsisë, fokusit të mundshëm, ekspozimeve dhe nevojës për izolim ose eskalim.',
    keywords:['ethe','infeksion','ekspozim','izolim','sepsis'],
    icdCodes:['R50.9'],
    procedureCodes:[],
    reviewStatus:'verified',
    sourcePages:[121, 138],
    steps:[
      clinicalStep('fever-severity','Vlerëso ashpërsinë','Kontrollo shenjat vitale, perfuzionin, vetëdijen dhe faktorët e riskut.'),
      clinicalStep('fever-source','Kërko fokusin','Përdor historinë dhe ekzaminimin për të përcaktuar testet e synuara.'),
    ],
    redFlags:['Konfuzioni i ri, hipotensioni ose përkeqësimi i shpejtë kërkojnë eskalim urgjent.'],
  },
  {
    _id:'medicalhub-dod-ch05-sub02',
    question:'Kapitulli 5 · Tema 5.2',
    title:'Marrja, etiketimi dhe transporti i mostrave mikrobiologjike para terapisë antimikrobike',
    slug:'marrja-dhe-transporti-i-mostrave-mikrobiologjike',
    chapterNumber:5,
    lessonNumber:2,
    summary:'Hapat bazë për identifikim të saktë, teknikë aseptike dhe dokumentim të kohës së mostrës.',
    keywords:['mostër','mikrobiologji','hemokulturë','etiketim','transport'],
    icdCodes:[],
    procedureCodes:[{ system:'ICHI', code:'JAA.AA.AA', label:'Marrje e mostrës mikrobiologjike' }],
    reviewStatus:'verified',
    sourcePages:[139, 145],
    steps:[
      clinicalStep('sample-identity','Verifiko identitetin dhe kërkesën','Përputh pacientin, llojin e mostrës, vendin anatomik dhe analizën e kërkuar.'),
      clinicalStep('sample-label','Etiketo pranë pacientit','Regjistro kohën, vendin e marrjes dhe personin përgjegjës sipas procedurës lokale.'),
    ],
  },
];

function topicDetail(seed) {
  const locator = sourceDocument(
    seed.chapterNumber,
    [`Kapitulli ${seed.chapterNumber}`, seed.title],
    seed.sourcePages[0],
    seed.sourcePages[1],
  );
  return {
    ...seed,
    book:BOOK,
    contentKind:'lesson',
    sourceRxTitle:'',
    contentOrder:seed.contentOrder || [],
    figures:seed.figures || [],
    prescriptions:seed.prescriptions || [],
    sources:[sourceCard(locator)],
    redFlags:seed.redFlags || [],
    whenToRefer:seed.whenToRefer || '',
    relatedProtocols:seed.relatedProtocols || [],
    relatedTopics:seed.relatedTopics || [],
    reviewedBy:REVIEWER,
    lastReviewedAt:REVIEWED_AT,
    version:VERSION,
    sourceDocument:locator,
  };
}

const topicDetails = topicSeeds.map(topicDetail);

const chapterSeeds = [
  {
    chapterNumber:1,
    title:'Historia dhe ekzaminimi fizik',
    summary:'Nga ankesa kryesore te ekzaminimi sistematik dhe dokumentimi i qartë i gjetjeve.',
    reviewStatus:'verified',
    sourcePages:[11, 34],
    focus:['Historia e strukturuar','Ekzaminimi fizik','Dokumentimi klinik'],
  },
  {
    chapterNumber:4,
    title:'Përshkrimi i barnave, aftësitë administrative dhe komunikimi klinik ndërprofesional në kujdesin e koordinuar afatgjatë',
    summary:'Përshkrim i sigurt, komunikim i kuptueshëm dhe transferim i besueshëm i informacionit klinik.',
    reviewStatus:'review',
    sourcePages:[87, 116],
    focus:['Siguria e përshkrimit','Vendimmarrja e përbashkët','Dorëzimi i kujdesit'],
  },
  {
    chapterNumber:5,
    title:'Sëmundjet infektive',
    summary:'Qasje e strukturuar ndaj etheve, riskut infektiv dhe mostrave diagnostike.',
    reviewStatus:'verified',
    sourcePages:[117, 145],
    focus:['Vlerësimi i ashpërsisë','Kontrolli i infeksionit','Mostrat mikrobiologjike'],
  },
];

function indexProjection(item) {
  return {
    _id:item._id,
    question:item.question,
    title:item.title,
    slug:item.slug,
    keywords:item.keywords || [],
    icdCodes:item.icdCodes || [],
    procedureCodes:item.procedureCodes || [],
    summary:item.summary,
    contentKind:item.contentKind,
    chapterNumber:item.chapterNumber,
    lessonNumber:item.lessonNumber,
    reviewStatus:item.reviewStatus,
    reviewedBy:item.reviewedBy,
    lastReviewedAt:item.lastReviewedAt,
    version:item.version,
    sourceRxTitle:item.sourceRxTitle || '',
    figureCount:(item.figures || []).length,
    protocolCount:(item.relatedProtocols || []).length,
    childCount:(item.relatedTopics || []).length,
    book:item.book || BOOK,
  };
}

const chapterDetails = chapterSeeds.map(seed => {
  const number = seed.chapterNumber;
  const relatedTopics = topicDetails
    .filter(topic => topic.chapterNumber === number)
    .map(indexProjection);
  const locator = sourceDocument(number, [`Kapitulli ${number}`, seed.title], seed.sourcePages[0], seed.sourcePages[1]);
  return {
    _id:`medicalhub-dod-ch${String(number).padStart(2, '0')}`,
    question:`Kapitulli ${number}`,
    title:seed.title,
    slug:`kapitulli-${number}-${seed.title.toLocaleLowerCase('sq').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    keywords:[seed.title, ...seed.focus],
    icdCodes:[],
    procedureCodes:[],
    summary:seed.summary,
    contentKind:'chapter',
    chapterNumber:number,
    lessonNumber:0,
    sourceRxTitle:'',
    contentOrder:[],
    steps:seed.focus.map((title, index) => clinicalStep(`chapter-${number}-focus-${index + 1}`, title, `Pjesë e kapitullit ${number} në fixture-in determinist të browser QA.`)),
    figures:[],
    prescriptions:[],
    sources:[sourceCard(locator)],
    redFlags:[],
    whenToRefer:'',
    reviewStatus:seed.reviewStatus,
    reviewedBy:REVIEWER,
    lastReviewedAt:REVIEWED_AT,
    version:VERSION,
    relatedProtocols:[],
    relatedTopics,
    sourceDocument:locator,
    book:BOOK,
  };
});

const detailsById = new Map([...chapterDetails, ...topicDetails].map(item => [item._id, item]));
const indexItems = chapterDetails
  .flatMap(chapter => [chapter, ...topicDetails.filter(topic => topic.chapterNumber === chapter.chapterNumber)])
  .map(indexProjection);

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return clean(value)
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function flattenStrings(value, output = []) {
  if (value == null) return output;
  if (typeof value === 'string' || typeof value === 'number') {
    const text = clean(value);
    if (text) output.push(text);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach(entry => flattenStrings(entry, output));
    return output;
  }
  if (typeof value === 'object') Object.values(value).forEach(entry => flattenStrings(entry, output));
  return output;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function medicalHubFixtureResponse(input) {
  const url = input instanceof URL ? input : new URL(String(input), 'http://127.0.0.1');
  const id = clean(url.searchParams.get('id'));
  if (id) {
    const item = detailsById.get(id);
    return item
      ? { status:200, payload:{ ok:true, item:clone(item), source:'browser-fixture-google-drive-detail' } }
      : { status:404, payload:{ ok:false, error:'Tema nuk u gjet në browser fixture.' } };
  }

  const mode = normalize(url.searchParams.get('mode')) || 'index';
  if (mode === 'index') {
    return {
      status:200,
      payload:{
        ok:true,
        items:clone(indexItems),
        count:indexItems.length,
        generatedAt:FIXTURE_GENERATED_AT,
        source:'browser-fixture-google-drive-index',
        book:clone(BOOK),
      },
    };
  }

  if (mode === 'search') {
    const q = clean(url.searchParams.get('q')).slice(0, 120);
    const tokens = normalize(q).split(/\s+/).filter(Boolean);
    const rawChapter = clean(url.searchParams.get('chapter'));
    const chapterNumber = /^\d{1,2}$/.test(rawChapter) ? Number(rawChapter) : null;
    const items = tokens.length ? indexItems.filter(item => {
      if (chapterNumber != null && item.chapterNumber !== chapterNumber) return false;
      const detail = detailsById.get(item._id) || item;
      const haystack = normalize(flattenStrings(detail).join(' '));
      return tokens.every(token => haystack.includes(token));
    }) : [];
    return {
      status:200,
      payload:{
        ok:true,
        items:clone(items),
        count:items.length,
        query:q,
        source:'browser-fixture-google-drive-search',
      },
    };
  }

  return { status:400, payload:{ ok:false, error:'Mode i panjohur në browser fixture.' } };
}

module.exports = {
  BOOK,
  FIXTURE_GENERATED_AT,
  indexItems,
  detailsById,
  medicalHubFixtureResponse,
};
