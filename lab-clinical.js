(() => {
  'use strict';

  const VERIFIED = {
    esr: {
      why: 'Marker jo specifik që ndihmon në vlerësimin e inflamacionit, infeksionit dhe disa sëmundjeve autoimune ose hematologjike.',
      high: 'Mund të rritet nga inflamacioni, infeksioni, anemia, shtatzënia ose paraproteinemia; nuk përcakton vetë shkakun.',
      low: 'Zakonisht ka rëndësi të kufizuar; mund të shihet në policitemi ose forma jonormale të eritrociteve.',
      preparation: 'Nuk kërkon esëll. Interpretohet sipas moshës/gjinisë dhe bashkë me CRP e klinikën.',
      sourceUrl: 'https://www.gloshospitals.nhs.uk/our-services/services-we-offer/pathology/tests-and-investigations/erythrocyte-sedimentation-rate-esr/'
    },
    rbc: {
      why: 'Pjesë e hemogramit për vlerësimin e anemisë dhe eritrocitozës.',
      high: 'Dehidratim, hipoksi kronike ose policitemi; interpretohet me hemoglobinën dhe hematokritin.',
      low: 'Anemi, humbje gjaku, hemolizë ose insuficiencë medulare.',
      preparation: 'Nuk kërkon esëll. Gjendja e hidratimit mund të ndikojë.',
      sourceUrl: 'https://www.gloshospitals.nhs.uk/our-services/services-we-offer/pathology/tests-and-investigations/full-blood-count-fbc/'
    },
    hgb: {
      why: 'Vlerëson aneminë, eritrocitozën dhe kapacitetin transportues të oksigjenit.',
      high: 'Dehidratim, hipoksi kronike ose policitemi.',
      low: 'Anemi nga mungesa e hekurit/B12/folatit, humbje gjaku, sëmundje kronike ose hemolizë.',
      preparation: 'Nuk kërkon esëll. Interpretohet me HCT, RBC, MCV dhe simptomat.',
      sourceUrl: 'https://www.gloshospitals.nhs.uk/our-services/services-we-offer/pathology/tests-and-investigations/full-blood-count-fbc/'
    },
    wbc: {
      why: 'Vlerëson infeksionin, inflamacionin dhe çrregullimet hematologjike.',
      high: 'Infeksion, inflamacion, kortikosteroide, stres fiziologjik ose sëmundje mieloproliferative.',
      low: 'Infeksion viral, barna, sepsë e rëndë, sëmundje autoimune ose insuficiencë medulare.',
      preparation: 'Nuk kërkon esëll. Interpretohet me formulën leukocitare dhe trendin.',
      sourceUrl: 'https://www.gloshospitals.nhs.uk/our-services/services-we-offer/pathology/tests-and-investigations/full-blood-count-fbc/'
    },
    mcv: {
      why: 'Klasifikon aneminë si mikrocitare, normocitare ose makrocitare.',
      high: 'Mungesë B12/folati, alkool, sëmundje hepatike, hipotiroidizëm ose barna.',
      low: 'Mungesë hekuri, talasemi ose disa anemi kronike.',
      preparation: 'Interpretohet me Hb, RDW, ferritinën, B12/folatin dhe retikulocitet.',
      sourceUrl: 'https://www.gloshospitals.nhs.uk/our-services/services-we-offer/pathology/tests-and-investigations/full-blood-count-fbc/'
    },
    mch: {
      why: 'Tregon sasinë mesatare të hemoglobinës në eritrocit dhe ndihmon në klasifikimin e anemisë.',
      high: 'Shpesh shoqëron makrocitozën.',
      low: 'Shpesh shoqëron mungesën e hekurit ose talaseminë.',
      preparation: 'Interpretohet me MCV, MCHC, Hb dhe ferritinën.',
      sourceUrl: 'https://www.gloshospitals.nhs.uk/our-services/services-we-offer/pathology/tests-and-investigations/full-blood-count-fbc/'
    },
    mchc: {
      why: 'Tregon përqendrimin mesatar të hemoglobinës brenda eritrociteve.',
      high: 'Mund të shihet në sferocitozë, hemolizë ose nga interferenca analitike.',
      low: 'Hipokromi, zakonisht nga mungesa e hekurit.',
      preparation: 'Interpretohet me MCV, MCH, Hb dhe pamjen periferike.',
      sourceUrl: 'https://www.gloshospitals.nhs.uk/our-services/services-we-offer/pathology/tests-and-investigations/full-blood-count-fbc/'
    },
    hct: {
      why: 'Tregon pjesën e vëllimit të gjakut të zënë nga eritrocitet.',
      high: 'Dehidratim ose eritrocitozë.',
      low: 'Anemi, gjakderdhje ose hemodilucion.',
      preparation: 'Gjendja e hidratimit ndikon në rezultat.',
      sourceUrl: 'https://www.gloshospitals.nhs.uk/our-services/services-we-offer/pathology/tests-and-investigations/full-blood-count-fbc/'
    },
    plt: {
      why: 'Vlerëson trombocitopeninë, trombocitozën dhe rrezikun e gjakderdhjes.',
      high: 'Inflamacion, mungesë hekuri, pas splenektomisë ose sëmundje mieloproliferative.',
      low: 'Infeksione, barna, ITP, DIC, hipersplenizëm ose insuficiencë medulare.',
      preparation: 'Pseudotrombocitopenia nga grumbullimi në EDTA kërkon kontroll të mostrës.',
      sourceUrl: 'https://www.gloshospitals.nhs.uk/our-services/services-we-offer/pathology/haematology/haematology-reference-ranges/'
    },
    crp: {
      why: 'Marker i shpejtë i inflamacionit dhe infeksionit; i dobishëm edhe për monitorimin e trendit.',
      high: 'Infeksion, inflamacion, dëmtim indor ose sëmundje autoimune; nuk e përcakton vetë diagnozën.',
      low: 'Vlera e ulët nuk e përjashton gjithmonë sëmundjen, sidomos herët në proces.',
      preparation: 'Nuk kërkon esëll. Trendi është shpesh më informues se një vlerë e vetme.',
      sourceUrl: 'https://pathology.uhsussex.nhs.uk/pug/?catid=10&id=210&view=article'
    },
    urea: {
      why: 'Ndihmon në vlerësimin e funksionit renal, hidratimit dhe metabolizmit të proteinave.',
      high: 'Dehidratim, dështim renal, gjakderdhje gastrointestinale ose katabolizëm i shtuar.',
      low: 'Marrje e ulët proteinash, sëmundje e rëndë hepatike ose mbihidratim.',
      preparation: 'Interpretohet bashkë me kreatininën, eGFR dhe statusin e hidratimit.',
      sourceUrl: 'https://www.mayocliniclabs.com/test-catalog/Overview/113634'
    },
    'creatinine-serum': {
      why: 'Vlerëson filtrimin renal dhe përdoret për llogaritjen e eGFR.',
      high: 'Ulja e filtrimit renal, dehidratim, obstruksion, rabdomiolizë ose masë e madhe muskulore.',
      low: 'Masë e ulët muskulore, shtatzëni ose hemodilucion; jo domosdoshmërisht sëmundje.',
      preparation: 'Interpretohet me eGFR, moshën, masën muskulore dhe trendin.',
      sourceUrl: 'https://www.mayocliniclabs.com/test-catalog/Overview/48216'
    },
    glucose: {
      why: 'Përdoret për skriningun dhe vlerësimin e çrregullimeve të glukozës.',
      high: 'Mund të tregojë hiperglikemi nga diabeti, stresi akut, barna ose çrregullime endokrine; diagnoza varet nga koha e mostrës dhe kriteret klinike.',
      low: 'Hipoglikemia kërkon vlerësim sipas simptomave, barnave dhe kohës së mostrës.',
      preparation: 'Kur kërkohet glikemi esëll: zakonisht 8–12 orë pa ushqim, vetëm ujë; ndiq udhëzimin e laboratorit.',
      sourceUrl: 'https://www.mayocliniclabs.com/test-catalog/overview/113630'
    },
    sodium: {
      why: 'Vlerëson ekuilibrin e ujit dhe osmolalitetin.',
      high: 'Humbje uji, diabet insipid ose ngarkesë natriumi.',
      low: 'SIADH, diuretikë, insuficiencë kardiake/hepatike, humbje gastrointestinale ose mbingarkesë me ujë.',
      preparation: 'Interpretohet me glukozën, osmolalitetin dhe statusin volumor.',
      sourceUrl: 'https://www.mayocliniclabs.com/test-catalog/overview/113630'
    },
    potassium: {
      why: 'Kritik për ritmin kardiak dhe funksionin neuromuskular.',
      high: 'Dështim renal, barna, acidozë ose hemolizë e mostrës; vlerat e larta mund të jenë urgjencë.',
      low: 'Diuretikë, humbje gastrointestinale, alkalozë ose hiperaldosteronizëm.',
      preparation: 'Kontrollo hemolizën dhe përsërit urgjent kur rezultati nuk përputhet me klinikën.',
      sourceUrl: 'https://www.mayocliniclabs.com/test-catalog/overview/113630'
    },
    calcium: {
      why: 'Vlerëson metabolizmin kockor, paratiroidet dhe çrregullimet elektrolitike.',
      high: 'Hiperparatiroidizëm, malignitet, tepricë vitamine D ose barna.',
      low: 'Mungesë vitamine D, hipoparatiroidizëm, insuficiencë renale ose albuminë e ulët.',
      preparation: 'Interpretohet me albuminën ose kalciumin jonizues kur nevojitet.',
      sourceUrl: 'https://www.mayocliniclabs.com/test-catalog/overview/113631'
    },
    alt: {
      why: 'Marker relativisht specifik i dëmtimit hepatocelular.',
      high: 'Hepatit, steatohepatit, barna/toksina ose dëmtim muskulor; niveli nuk e tregon gjithmonë funksionin hepatik.',
      low: 'Zakonisht pa rëndësi klinike.',
      preparation: 'Interpretohet me AST, bilirubinën, ALP/GGT dhe historinë e barnave/alkoolit.',
      sourceUrl: 'https://www.easternpathologyalliance.nhs.uk/tests/alanine-aminotransferase-alt/'
    },
    ast: {
      why: 'Vlerëson dëmtimin hepatik, por gjendet edhe në muskuj dhe organe të tjera.',
      high: 'Dëmtim hepatik ose muskulor, hemolizë, ishemi ose alkool; krahaso me ALT dhe CK.',
      low: 'Zakonisht pa rëndësi klinike.',
      preparation: 'Hemoliza e mostrës mund ta rrisë rezultatin.',
      sourceUrl: 'https://www.nwangliaft.nhs.uk/pathology-requesting-and-reporting-updates/'
    },
    'bilirubin-total': {
      why: 'Vlerëson verdhëzën, hemolizën, konjugimin hepatik dhe obstruksionin biliar.',
      high: 'Hemolizë, hepatit, sindromë Gilbert ose kolestazë; fraksionet direkte/indirekte ndihmojnë në orientim.',
      low: 'Zakonisht pa rëndësi klinike.',
      preparation: 'Interpretohet me bilirubinën direkte, ALT/AST, ALP/GGT dhe hemogramin.',
      sourceUrl: 'https://www.mayocliniclabs.com/test-catalog/overview/113631'
    },
    albumin: {
      why: 'Vlerëson sintezën hepatike, gjendjen ushqyese dhe humbjen renale/enterale të proteinave.',
      high: 'Kryesisht dehidratim.',
      low: 'Inflamacion, sëmundje hepatike, sindromë nefrotike, kequshqyerje ose humbje enterale.',
      preparation: 'Është marker i ngadalshëm dhe ndikohet nga inflamacioni dhe statusi volumor.',
      sourceUrl: 'https://pathology.uhsussex.nhs.uk/pug/biochemistry-immunology/biochemistry-tests/107-albumin-serum'
    },
    cholesterol: {
      why: 'Pjesë e profilit lipidik dhe vlerësimit të rrezikut kardiovaskular.',
      high: 'Interpretohet me LDL, HDL, trigliceridet, moshën, tensionin dhe faktorët klinikë.',
      low: 'Zakonisht nuk interpretohet i vetëm; mund të shihet në kequshqyerje, hipertiroidizëm ose sëmundje të rënda.',
      preparation: 'Profili lipidik shpesh mund të bëhet jo esëll; laboratori mund të kërkojë esëll në raste të caktuara.',
      sourceUrl: 'https://www.nhs.uk/conditions/high-cholesterol/cholesterol-levels/'
    },
    hdl: {
      why: 'Pjesë e vlerësimit të rrezikut kardiovaskular dhe raportit total/HDL.',
      high: 'Zakonisht lidhet me rrezik më të ulët, por nuk interpretohet i izoluar.',
      low: 'Lidhet me rrezik më të lartë kardiometabolik.',
      preparation: 'Interpretohet me profilin e plotë dhe rrezikun global.',
      sourceUrl: 'https://www.nhs.uk/conditions/high-cholesterol/cholesterol-levels/'
    },
    ldl: {
      why: 'Komponent kryesor i vlerësimit dhe trajtimit të rrezikut aterosklerotik.',
      high: 'Lidhet me rrezik më të lartë aterosklerotik; objektivi varet nga rreziku individual.',
      low: 'Zakonisht i dëshirueshëm në kontekst të trajtimit, por interpretohet klinikisht.',
      preparation: 'Mund të jetë i llogaritur dhe më pak i saktë kur trigliceridet janë shumë të larta.',
      sourceUrl: 'https://www.nhs.uk/conditions/high-cholesterol/cholesterol-levels/'
    },
    triglycerides: {
      why: 'Vlerëson dislipideminë dhe rrezikun e pankreatitit kur vlerat janë shumë të larta.',
      high: 'Diabet i pakontrolluar, alkool, obezitet, barna, hipotiroidizëm ose çrregullim gjenetik.',
      low: 'Zakonisht pa rëndësi klinike.',
      preparation: 'Laboratori mund të kërkojë mostër esëll kur rezultati është i lartë ose për profil të plotë.',
      sourceUrl: 'https://www.gloshospitals.nhs.uk/our-services/services-we-offer/pathology/tests-and-investigations/lipids-cholesterol-triglycerides-hdl-ldl/'
    },
    'uric-acid': {
      why: 'Vlerëson hiperuriceminë, përdhesin dhe rrezikun nga lizimi qelizor.',
      high: 'Përdhes, insuficiencë renale, diuretikë, alkool, sindromë metabolike ose lizë tumorale.',
      low: 'Barna urikozurike, marrje e ulët purinash ose çrregullime të rralla metabolike.',
      preparation: 'Vlera gjatë sulmit akut të përdhesit mund të jetë normale; interpretohet me klinikën.',
      sourceUrl: 'https://www.mayocliniclabs.com/test-catalog/overview/113631'
    },
    'troponin-i': {
      why: 'Marker i dëmtimit të miokardit; përdoret me EKG-në, simptomat dhe matjet serike.',
      high: 'Mund të tregojë infarkt ose dëmtim tjetër miokardial; kërkon interpretim urgjent sipas metodës dhe dinamikës.',
      low: 'Një rezultat negativ shumë herët nuk e përjashton gjithmonë dëmtimin; protokollet përdorin matje serike.',
      preparation: 'Nuk kërkon esëll. Pragu është specifik për analizatorin dhe laboratorin.',
      sourceUrl: 'https://www.mayocliniclabs.com/test-catalog/overview/113631'
    },
    inr: {
      why: 'Standardizon kohën e protrombinës dhe përdoret sidomos për monitorimin e warfarinës.',
      high: 'Rritje e efektit antikoagulues, sëmundje hepatike, mungesë vitamine K ose faktorë të tjerë; rreziku i gjakderdhjes varet nga konteksti.',
      low: 'Te pacienti në warfarinë mund të tregojë antikoagulim të pamjaftueshëm.',
      preparation: 'Interpretohet sipas indikacionit dhe objektivit individual; mos ndrysho terapinë vetëm nga aplikacioni.',
      sourceUrl: 'https://www.gloshospitals.nhs.uk/our-services/services-we-offer/pathology/haematology/'
    }
  };

  const QUALITY = {
    'creatinine-serum': ['Njësia “mmol/L” është transkriptuar nga formulari dhe duhet verifikuar në raportin aktual; kreatinina serike raportohet shpesh në µmol/L.'],
    'bilirubin-total': ['Njësia “mmol/L” është transkriptuar nga formulari dhe duhet verifikuar; bilirubina zakonisht raportohet në µmol/L.'],
    'bilirubin-direct': ['Njësia “mmol/L” është transkriptuar nga formulari dhe duhet verifikuar; bilirubina zakonisht raportohet në µmol/L.'],
    iron: ['Njësia “mmol/L” në formular duhet verifikuar; hekuri serik shpesh raportohet në µmol/L.'],
    'urine-creatinine': ['Njësia “mmol/min” është jo e zakonshme për kreatininën urinare dhe duhet verifikuar me raportin origjinal.'],
    ldl: ['Intervali 3.9–4.9 mmol/L është transkriptim historik i formularit, jo objektiv universal terapeutik. Objektivi varet nga rreziku kardiovaskular.'],
    cholesterol: ['Pragu <6.5 mmol/L është transkriptim nga formulari i vjetër dhe nuk duhet përdorur si objektiv modern i vetëm.'],
    'troponin-i': ['Rezultati “Negative” është metodë-specifik; përdor pragun dhe intervalin e analizatorit aktual.'],
    'rdw-a': ['Interval aparat-specifik; verifiko modelin dhe kalibrimin e analizatorit.'],
    'pdw-a': ['Interval aparat-specifik; verifiko modelin dhe kalibrimin e analizatorit.'],
    'pdw-pct': ['Interval aparat-specifik; verifiko modelin dhe kalibrimin e analizatorit.'],
    pct: ['Ky PCT është trombocitokriti, jo prokalcitonina. Intervali është aparat-specifik.'],
    'p-lcr': ['Interval aparat-specifik; verifiko modelin dhe kalibrimin e analizatorit.'],
    'p-lcc': ['Interval aparat-specifik; verifiko modelin dhe kalibrimin e analizatorit.']
  };

  const ALIASES = {
    hgb: ['hb', 'hemoglobine', 'anemi'],
    wbc: ['leukocite', 'leukocitet'],
    plt: ['trombocite', 'trombocitet'],
    'creatinine-serum': ['kreatinine', 'egfr', 'veshka'],
    glucose: ['glikemi', 'sheqer ne gjak', 'diabet'],
    cholesterol: ['kolesterol'],
    triglycerides: ['trigliceride'],
    'bilirubin-total': ['bilirubine'],
    'uric-acid': ['urat', 'acid urik', 'perdhes'],
    'troponin-i': ['troponine', 'infarkt']
  };

  function enrichTest(test) {
    const clinical = VERIFIED[test.id];
    return {
      ...test,
      ...(clinical || {}),
      clinicalStatus: clinical ? 'verified' : 'source-only',
      qualityFlags: [...(test.qualityFlags || []), ...(QUALITY[test.id] || [])],
      searchAliases: ALIASES[test.id] || []
    };
  }

  function enrichDataset(data) {
    const tests = Array.isArray(data?.tests) ? data.tests.map(enrichTest) : [];
    return {
      ...(data || {}),
      version: `${data?.version || 'unknown'}+clinical-1`,
      tests,
      clinicalAudit: {
        verified: tests.filter(test => test.clinicalStatus === 'verified').length,
        sourceOnly: tests.filter(test => test.clinicalStatus !== 'verified').length,
        flagged: tests.filter(test => test.qualityFlags.length).length
      }
    };
  }

  window.MEDINDEX_LAB_CLINICAL = { version: '2026-07-23.1', enrichDataset };
})();
