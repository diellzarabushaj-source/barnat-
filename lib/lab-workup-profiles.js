'use strict';

const nice = (label, path) => ['NICE · ' + label, 'https://www.nice.org.uk/guidance/' + path];
const SOURCES = {
  kosovoUti: ['MSH Kosovë 2024 · infeksionet urinare të pakomplikuara', 'https://msh.rks-gov.net/Documents/DownloadDocument?fileName=Udh%C3%ABr36065782.5785.pdf'],
  kosovoAsthma: ['MSH Kosovë · menaxhimi i astmës', 'https://msh.rks-gov.net/Documents/DownloadDocument?fileName=Menaxhimi+i+Astm%C3%ABs+46019544.7593.pdf'],
  kosovoBp: ['MSH Kosovë · hipertensioni arterial', 'https://msh.rks-gov.net/Documents/DownloadDocument?fileName=Menaxhimi+i+hipertensionit+arterial46146825.7972.pdf'],
  pe: nice('NG158 · tromboembolia venoze, §1.1', 'ng158/chapter/recommendations#diagnosis-and-initial-management'),
  sync: nice('CG109 · humbja kalimtare e vetëdijes', 'cg109/chapter/recommendations'),
  af: nice('NG196 · fibrilacioni atrial, §1.1', 'ng196/chapter/recommendations#detection-and-diagnosis'),
  pneumonia: nice('NG250 · pneumonia, §1.2–1.4', 'ng250/chapter/recommendations'),
  asthma: nice('NG245 · testet objektive për astmën, §1.2', 'ng245/chapter/recommendations#objective-tests-for-diagnosing-asthma-in-adults-young-people-and-children-aged-5-to-16'),
  copd: nice('NG115 · SPOK, §1.1–1.3', 'ng115/chapter/recommendations'),
  stroke: nice('NG128 · insult/TIA, §1.1–1.3', 'ng128/chapter/recommendations'),
  seizures: nice('NG217 · kriza e parë dhe epilepsia, §1', 'ng217/chapter/diagnosis-and-assessment-of-epilepsy'),
  delirium: nice('CG103 · deliri, §1.3–1.6', 'cg103/chapter/recommendations'),
  feverChild: nice('NG143 · ethet te fëmijët nën 5 vjeç, §1.2–1.5', 'ng143/chapter/recommendations'),
  meningitis: nice('NG240 · meningjiti bakterial, §1.4', 'ng240/chapter/recommendations'),
  bp: nice('NG136 · hipertensioni, §1.2–1.5', 'ng136/chapter/recommendations'),
  gyn: nice('NG126 · shtatzënia ektopike dhe vendndodhja e panjohur', 'ng126/chapter/recommendations'),
  gallstone: nice('CG188 · kolelitiaza, §1.1', 'cg188/chapter/recommendations#diagnosing-gallstone-disease'),
  urolithiasis: nice('NG118 · kolika renale, §1.1', 'ng118/chapter/recommendations#diagnostic-imaging'),
  pyelo: nice('NG111 · pielonefriti akut, §1.1', 'ng111/chapter/recommendations'),
  pediatricUti: nice('NG224 · infeksioni urinar te fëmijët, §1.1', 'ng224/chapter/recommendations'),
  aki: nice('NG148 · dëmtimi akut renal, §1.3–1.4', 'ng148/chapter/recommendations'),
  upperGi: nice('CG141 · hemorragjia e sipërme gastrointestinale, §1.1–1.3', 'cg141/chapter/recommendations'),
  gout: nice('NG219 · gihti, §1.1', 'ng219/chapter/recommendations#diagnosis-and-assessment'),
  cancer: nice('NG12 · simptomat për referim të dyshimit për kancer', 'ng12/chapter/recommendations-organised-by-symptom-and-findings-of-primary-care-investigations'),
  lipids: nice('NG238 · profili lipidik dhe rreziku kardiovaskular', 'ng238/chapter/recommendations'),
  sepsisWorkup: nice('NG253 · analizat në dyshim për sepsë', 'ng253/chapter/managing-suspected-sepsis'),
  back: nice('NG59 · dhimbja e mesit dhe shiatiku, §1.1', 'ng59/chapter/recommendations'),
  cauda: nice('NG127 · dyshimi për cauda equina, §1.7', 'ng127/chapter/recommendations-for-adults-aged-over-16'),
  sinus: nice('NG79 · sinuziti akut, §1.1', 'ng79/chapter/recommendations'),
  ear: ['AAP 2013 · diagnoza e otitit të mesëm akut', 'https://doi.org/10.1542/peds.2012-3488'],
  lowerGi: ['ACG 2023 · hemorragjia e poshtme gastrointestinale, CTA dhe kolonoskopia', 'https://doi.org/10.14309/ajg.0000000000002130'],
  preeclampsia: nice('NG133 · hipertensioni në shtatzëni, §1.2 dhe §1.5', 'ng133/chapter/recommendations'),
  anaphylaxis: nice('NG258 · anafilaksia dhe triptaza', 'ng258/chapter/recommendations'),
  afWorkup: ['ACC/AHA 2023 · fibrilacioni atrial, vlerësimi bazë', 'https://doi.org/10.1016/j.jacc.2023.08.017'],
  panic: nice('CG113 · vlerësimi i sulmit të panikut', 'cg113/chapter/recommendations'),
  crises: ['ADA/EASD et al. 2024 · DKA dhe HHS, kriteret diagnostike', 'https://doi.org/10.2337/dci24-0032'],
  anemia: ['BSG 2021 · anemia nga mungesa e hekurit te të rriturit', 'https://www.bsg.org.uk/clinical-resource/guidelines-iron-deficiency-anaemia-in-adults'],
  appendicitis: ['ACR 2022 · dhimbja në kuadrantin e poshtëm të djathtë', 'https://acsearch.acr.org/docs/69357/narrative/'],
  ebvClinical: ['CDC · interpretimi i serologjisë EBV', 'https://www.cdc.gov/epstein-barr/php/laboratories/index.html'],
  hemoptysis: ['ACR · hemoptizia, kriteret për imazheri', 'https://acsearch.acr.org/docs/69449/Narrative/'],
  tb: ['ATS/IDSA/CDC · diagnostikimi i tuberkulozit', 'https://stacks.cdc.gov/view/cdc/46690'],
  septicJoint: ['EBJIS 2023 · artriti septik i nyjës natyrore (SANJO)', 'https://doi.org/10.5194/jbji-8-29-2023'],
  diabetesCare: ['ADA 2026 · vlerësimi gjithëpërfshirës i diabetit', 'https://doi.org/10.2337/dc26-S004'],
};

const ADDITIONS = [
  ['tryptase','Triptaza serike','Serum Tryptase',10,'Matje e kohëzuar pas fillimit të trajtimit në anafilaksi të dyshuar, sipas moshës dhe shkakut.','anaphylaxis'],
  ['pcrUrine','Raporti proteinë/kreatininë në urinë (PCR)','Urine Protein-Creatinine Ratio',5,'Për sasinë e proteinurisë. Përdor njësitë dhe pragun e specifikuar në protokoll.','preeclampsia'],
  ['dDimer','D-dimeri','D-Dimer',4,'Për përjashtim të tromboembolisë venoze vetëm në algoritmin dhe probabilitetin përkatës.','pe'],
  ['osmolality','Osmolaliteti serik','Serum Osmolality',17,'Në dyshim për hiperosmolaritet, sipas rrugës së HHS ose vlerësimit metabolik.','crises'],
  ['ft3','FT3','Free Triiodothyronine',15,'Në TSH të ulët, bashkë me FT4 sipas rrugës diagnostike për tireotoksikozë.','thyroid'],
];

const conditional = (key, rationale, findings) => ({key,tier:'conditional',rationale,findings});
const core = (key, rationale, findings) => ({key,tier:'core',rationale,findings});

function workup(slug, title, titleEn, group, summary, tests, exams, sourceIds, urgentNote = '') {
  return {id:'workup-'+slug,slug,title,titleEn,group,summary,tests,exams,sourceIds,urgentNote,
    kind:group==='presentations'?'symptom':'diagnosis'};
}

const PROFILES = [
  workup('sinkopa','Sinkopa dhe humbja kalimtare e vetëdijes','Syncope and transient loss of consciousness','presentations',
    'Te pacienti i stabilizuar, pyet edhe dëshmitarët për pozicionin, prodromën, kohëzgjatjen, lëvizjet dhe rikthimin e vetëdijes.',[
      conditional('glucose','Kur hipoglikemia është e mundshme.'),
      conditional('cbc','Kur dyshohet anemi ose gjakderdhje.'),
      conditional('k','Në përdorim diuretikësh, humbje lëngjesh ose dyshim për aritmi.'),
    ],[
      ['EKG me 12 derivacione','Në vlerësimin fillestar.','Blloku i përçimit, QT jonormale ose gjetjet ishemike kërkojnë vlerësim kardiak.'],
      ['Tensioni shtrirë dhe në këmbë','Kur historia sugjeron hipotension ortostatik dhe matja është e sigurt.'],
      ['Monitorim ambulator i ritmit','Kur dyshohet aritmi dhe EKG-ja fillestare s’e dokumenton. Zgjidhe sipas shpeshtësisë së episodeve.'],
    ],['sync'],'Sinkopa gjatë sforcimit, EKG-ja jonormale, dispnea e pashpjeguar ose histori familjare e vdekjes së papritur nën 40 vjeç kërkojnë vlerësim urgjent.'),
  workup('konfuzioni','Konfuzioni akut dhe deliri','Acute confusion and delirium','presentations',
    'Përcakto ndryshimin nga gjendja bazë dhe kërko shkaqe të kthyeshme, përfshirë barna, hipoksi, dehidrim dhe infeksion.',[
      conditional('glucose','Kontroll pranë pacientit në ndryshim akut të vetëdijes.'),
      conditional('na','Kur dyshohet çrregullim metabolik.'),
      conditional('creatinine','Kur dyshohet dehidrim ose dëmtim renal.'),
      conditional('cbc','Kur dyshohet anemi ose infeksion.'),
    ],[
      ['Parametrat vitalë, SpO₂ dhe ekzaminimi neurologjik','Vlerësimi fillestar dhe krahasimi me funksionin bazë.'],
      ['4AT','Në shenja të delirit. Në kujdes intensiv përdoren instrumentet përkatëse si CAM-ICU.'],
      ['Imazheri cerebrale urgjente','Në deficit të ri fokal, traumë ose dyshim për patologji akute intrakraniale.'],
    ],['delirium','stroke'],'Ulja e vetëdijes, shenjat fokale ose parametrat e paqëndrueshëm kërkojnë vlerësim të menjëhershëm.'),
  workup('hemoptizia','Hemoptizia','Hemoptysis','presentations',
    'Verifiko burimin e gjakut dhe ndikimin në frymëmarrje. Pyet për antikoagulantë, duhan, kontakt me TB dhe rrezik tromboembolik.',[
      conditional('cbc','Kur gjakderdhja është domethënëse, përsëritet ose ka dyshim për anemi.'),
      conditional('inr','Sipas historisë së antikoagulimit ose koagulopatisë.'),
      conditional('creatinine','Kur planifikohet kontrast dhe kërkohet vlerësim renal.'),
    ],[
      ['SpO₂ dhe vlerësimi i rrugëve të frymëmarrjes','Vlerëso menjëherë efektin respirator dhe hemodinamik.'],
      ['Radiografi torakale','Imazheri fillestare sipas gjendjes. Radiografia normale nuk e mbyll hetimin në hemoptizi persistente.'],
      ['CT torakale me kontrast / angio-CT','Sipas rëndesës, përsëritjes dhe shkakut të dyshuar. Për TB të dyshuar organizo mostrat e sputumit sipas rrugës lokale.'],
    ],['hemoptysis','tb','cancer'],'Hemoptizia që komprometon rrugët e frymëmarrjes, oksigjenimin ose hemodinamikën kërkon urgjencë.'),
  workup('dhimbja-flankut','Dhimbja e ijes / kolika renale','Flank pain and suspected renal colic','presentations',
    'Vlerëso obstruksionin, infeksionin, shtatzëninë dhe diagnozat alternative sipas simptomave.',[
      conditional('urine','Për hematuri ose shenja infeksioni.', ['Mungesa e hematurisë nuk përjashton gurin ureteral.','Hematuria mbështet gurin në pasqyrë tipike. Piuria/nitritet me temperaturë ngrenë dyshimin për infeksion.']),
      conditional('creatinine','Kur dyshohet obstruksion, dëmtim renal ose dehidrim.'),
      conditional('urineculture','Kur dyshohet infeksion.'),
      conditional('hcg','Kur shtatzënia është e mundshme.'),
    ],[
      ['CT me dozë të ulët pa kontrast','Te të rriturit me dyshim për kolikë renale. Sipas NICE, syno imazheri brenda 24 orëve.'],
      ['Ekografi','Imazheri fillestare në shtatzëni dhe te fëmijët. Hidronefroza mund të mbështesë obstruksionin.'],
    ],['urolithiasis','aki'],'Temperatura me obstruksion të dyshuar, anuria ose dëmtimi renal akut kërkon vlerësim urgjent.'),
  workup('hematuria','Gjaku në urinë','Hematuria','presentations',
    'Përcakto nëse hematuria është e dukshme apo e zbuluar në dipstick. Pyet për simptoma urinare, gurë, menstruacione dhe faktorë rreziku urologjik.',[
      conditional('urine','Dipstick për gjak dhe gjetje shoqëruese.', ['Rezultati negativ mes episodeve nuk shpjegon hematurinë e dukshme të raportuar.','Gjaku në dipstick mund të pasqyrojë eritrocite, hemoglobinë ose mioglobinë. Vlerëso me kontekstin dhe metodën.']),
      conditional('urineculture','Kur ka dyshim për ITU.'),
      conditional('acr','Në hematuri me proteinuri ose dyshim për shkak glomerular.'),
      conditional('creatinine','Për vlerësimin e funksionit renal sipas rastit.'),
    ],[
      ['Vlerësim urologjik dhe imazheri/cistoskopi','Në hematuri të dukshme të pashpjeguar ose që vazhdon pas trajtimit të ITU, sipas moshës dhe faktorëve të rrezikut.'],
      ['Vlerësim nefrologjik','Kur hematuria shoqërohet me albuminuri, hipertension ose rënie të funksionit renal.'],
    ],['renal','cancer','kosovoUti'],'Retencioni me koagula, gjakderdhja me paqëndrueshmëri ose oliguria akute kërkon vlerësim urgjent.'),
  workup('gjakderdhja-siperme-gi','Hematemeza dhe melena','Haematemesis and melaena','presentations',
    'Vlerëso stabilitetin dhe mundësinë e hemorragjisë së sipërme gastrointestinale.',[
      conditional('cbc','Mat vlerën fillestare dhe ndiq trendin.', ['Hb e ulët mbështet aneminë. Në hemorragji akute Hb e parë mund të mbetet normale.','Hb/Hct të larta mund të shoqërojnë hemokoncentrimin. Krahasoji me gjendjen hemodinamike.']),
      conditional('urea','Ndihmon stratifikimin dhe vlerësimin e hipovolemisë.'),
      conditional('creatinine','Për funksionin renal dhe ndikimin e hipovolemisë.'),
      conditional('inr','Kur ka antikoagulim, sëmundje hepatike ose dyshim për koagulopati.'),
    ],[
      ['Vlerësimi hemodinamik dhe Glasgow-Blatchford','Në paraqitje, sipas rrugës spitalore.'],
      ['Endoskopi e sipërme','Pas reanimimit menjëherë te pacienti i paqëndrueshëm me hemorragji të rëndë. Te pacientët e tjerë të hospitalizuar, brenda 24 orëve sipas NICE.'],
    ],['upperGi'],'Hematemeza/melena me sinkopë, hipotension ose shenja shoku kërkon vlerësim të menjëhershëm.'),
  workup('dhimbja-djathtas-poshte','Dhimbja djathtas poshtë / apendiciti','Right lower quadrant pain and appendicitis','presentations',
    'Vlerëso shenjat peritoneale dhe shkaqet gjinekologjike, urinare ose gastrointestinale.',[
      conditional('cbc','Kur dyshohet apendicit ose inflamacion tjetër.', ['Leukocitet normale në fillim nuk e përjashtojnë apendicitin.','Neutrofilia mbështet inflamacionin në kontekstin e duhur.']),
      conditional('crp','Plotëson vlerësimin sipas kohëzgjatjes.'),
      conditional('urine','Në diagnozë diferenciale urinare.'),
      conditional('hcg','Kur shtatzënia është e mundshme.'),
    ],[
      ['Ekzaminim abdominal dhe rivlerësim','Në dhimbje persistente ose diagnozë të paqartë.'],
      ['Imazheri e drejtuar','CT me kontrast IV zakonisht është e përshtatshme te të rriturit jo shtatzënë. Në shtatzëni përdoren ekografia dhe/ose MRI pa kontrast sipas rastit.'],
    ],['appendicitis','gyn'],'Shenjat peritoneale, shoku ose dyshimi për shtatzëni ektopike kërkojnë vlerësim urgjent.'),
  workup('dhimbja-djathtas-lart','Dhimbja djathtas lart / sëmundja biliare','Right upper quadrant pain and gallstone disease','presentations',
    'Mendo për kolikë biliare, kolecistit, obstruksion biliar dhe pankreatit sipas pasqyrës klinike.',[
      conditional('alt','Pjesë e profilit hepatik.'),
      conditional('alp','Pjesë e vlerësimit për kolestazë.'),
      conditional('bilirubin','Kur dyshohet obstruksion i rrugëve biliare.'),
      conditional('cbc','Kur ka ethe ose shenja inflamacioni.'),
      conditional('lipase','Kur dhimbja sugjeron pankreatit.'),
    ],[
      ['Ekografi hepatobiliare','Imazheria fillestare kur dyshohet sëmundje biliare. Kërko gurë, dilatim të rrugëve biliare dhe gjetje inflamatore.'],
      ['MRCP','Kur ekografia nuk gjen gur në koledok, por ka dilatim të kanalit ose analiza hepatike jonormale.'],
    ],['gallstone','pancreas'],'Dhimbja me verdhëz dhe ethe ose shenja sepsë kërkon vlerësim urgjent për kolangit.'),
  workup('gjakderdhja-shtatzenise','Dhimbja pelvike / gjakderdhja në shtatzëni të hershme','Pelvic pain and bleeding in early pregnancy','presentations',
    'Kur shtatzënia është e mundshme, vlerëso vendndodhjen dhe stabilitetin hemodinamik.',[
      conditional('hcg','Testo shtatzëninë. Në shtatzëni me vendndodhje të panjohur përdor β-hCG serik sipas rrugës lokale.'),
      conditional('cbc','Në gjakderdhje ose shenja anemie/paqëndrueshmërie.'),
    ],[
      ['Ekografi transvaginale','Për vendndodhjen dhe vitalitetin. Nëse vendndodhja mbetet e panjohur, ndiq simptomat dhe planifiko rivlerësimin.'],
      ['Ekzaminim gjinekologjik dhe vlerësim hemodinamik','Sipas situatës dhe rrugës së shtatzënisë së hershme.'],
    ],['gyn'],'Sinkopa, hipotensioni, dhimbja e fortë njëanësore ose dhimbja në majë të shpatullës kërkon urgjencë.'),
  workup('ethe-femije','Ethet te fëmija nën 5 vjeç','Fever in children under five','presentations',
    'Vlerëso moshën, pamjen klinike, hidratimin, shenjat vitale dhe praninë e një fokusi. Analizat udhëhiqen nga rreziku.',[
      conditional('urine','Në ethe pa fokus ose dyshim për ITU sipas moshës.'),
      conditional('urineculture','Kur indikohet sipas moshës, rrezikut dhe dipstick-ut.'),
      conditional('cbc','Në foshnja <3 muaj me temperaturë ose te fëmijët me rrezik të shtuar sipas rrugës pediatrike.'),
      conditional('crp','Sipas moshës dhe rrezikut.'),
      conditional('bloodculture','Në foshnjat e vogla ose kur dyshohet infeksion invaziv, sipas rrugës pediatrike.'),
    ],[
      ['Parametrat vitalë dhe vlerësimi pediatrik i rrezikut','Përfshi frekuencën respiratore, SpO₂ sipas rastit, perfuzionin dhe hidratimin.'],
      ['Radiografi torakale ose punksion lumbar','Vetëm sipas shenjave respiratore, moshës dhe kriterit të rrugës pediatrike.'],
    ],['feverChild','pediatricUti'],'Temperatura ≥38 °C te foshnja nën 3 muaj konsiderohet rrezik i lartë dhe kërkon vlerësim të shpejtë pediatrik.'),
  workup('kriza-e-pare','Kriza e parë konvulsive','First suspected seizure','presentations',
    'Verifiko përshkrimin e dëshmitarit, rikthimin në gjendjen bazë dhe mundësinë e sinkopës ose shkakut akut metabolik.',[
      conditional('glucose','Kontrollo hipoglikeminë në vlerësim akut.'),
      conditional('na','Kur dyshohet çrregullim elektrolitik.'),
      conditional('ca','Kur dyshohet shkak metabolik.'),
    ],[
      ['EKG me 12 derivacione','Pas krizës së parë të dyshuar për shkaqe kardiake që mund të imitojnë krizën.'],
      ['EEG','Kur historia mbështet krizë epileptike. EEG normale nuk e përjashton epilepsinë.'],
      ['Imazheri cerebrale','Kur dyshohet shkak strukturor. Imazheria urgjente varet nga deficiti, trauma dhe rikthimi i vetëdijes.'],
    ],['seizures'],'Kriza në vazhdim për ≥5 minuta, krizat pa rikthim të vetëdijes ose deficiti i ri kërkojnë rrugë urgjente.'),
  workup('paniku','Sulmi i panikut / hiperventilimi','Panic attack and hyperventilation','presentations',
    'Në paraqitjen akute vlerëso fillimin, simptomat kardiopulmonare, barnat/substancat dhe episodet e mëparshme.',[
      conditional('glucose','Kur simptomat ose terapia sugjerojnë hipoglikemi.'),
      conditional('tsh','Kur historia sugjeron sëmundje tiroide, p.sh. takikardi persistente me dridhje ose humbje peshe.'),
    ],[
      ['Parametrat vitalë dhe ekzaminimi kardiopulmonar','Në paraqitjen fillestare. Hetimet drejtohen nga mundësia e problemit akut fizik.'],
      ['EKG','Kur ka dhimbje gjoksi, palpitacione, sinkopë ose dyshim për aritmi/ishemi.'],
    ],['panic','chest','thyroid'],'Hipoksemia, sinkopa, dhimbja e dyshimtë e gjoksit ose deficiti i ri fokal kërkon vlerësim urgjent për shkak fizik.'),
  workup('pneumonia','Pneumonia e fituar në komunitet','Community-acquired pneumonia','respiratoryDiagnosis',
    'Vlerëso rëndesën dhe oksigjenimin. Hetimet mikrobiologjike varen nga vendi i trajtimit, rëndesa dhe rreziku për patogjen specifik.',[
      conditional('crp','Mund të merret si vlerë bazë te të rriturit e hospitalizuar kur indikohet.'),
      conditional('urea','Në spital, kur përdoret CURB-65.'),
      conditional('bloodculture','Kur ka indikacion, p.sh. dyshim për sepsë.'),
    ],[
      ['SpO₂ dhe frekuenca respiratore','Vlerësimi fillestar i rëndesës.'],
      ['Radiografi torakale','Në spital, pjesë e konfirmimit diagnostik. Ekografia pulmonare mund të përdoret në situata të përshtatshme.'],
      ['CRB65 në kujdesin parësor / CURB65 në spital','Te të rriturit, bashkë me gjykimin klinik.'],
    ],['pneumonia','sepsisWorkup'],'Hipoksemia, shenjat e sepsës ose paqëndrueshmëria kërkojnë vlerësim urgjent.'),
  workup('astma','Astma','Asthma','respiratoryDiagnosis',
    'Me simptoma variabile respiratore, kërko evidencë objektive. Në krizë akute vlerëso dhe stabilizo pacientin para testeve të konfirmimit.',[
      conditional('cbc','Nëse rruga diagnostike përdor numrin e eozinofileve.', ['Eozinofilet normale nuk e përjashtojnë astmën. Kortikosteroidet mund ta ulin numrin.', 'Eozinofilia mbështet astmën e tipit 2 në historinë e duhur. Ka edhe shkaqe të tjera.']),
    ],[
      ['FeNO','Sipas moshës dhe rrugës diagnostike. Vlera e rritur mbështet inflamacionin e tipit 2. Steroidet inhalatore mund ta ulin.'],
      ['Spirometri me bronkodilatator','Reversibiliteti mbështet astmën. Një spirometri normale ndërmjet episodeve nuk e përjashton.'],
      ['Variabiliteti i PEF ose provokimi bronkial','Kur testet fillestare s’e konfirmojnë dhe dyshimi vazhdon, sipas moshës dhe disponueshmërisë.'],
    ],['kosovoAsthma','asthma'],'Pamundësia për të folur normalisht, toraksi i heshtur, lodhja ose hipoksemia kërkojnë vlerësim urgjent.'),
  workup('spok','SPOK dhe përkeqësimi akut','COPD and acute exacerbation','respiratoryDiagnosis',
    'Dallo konfirmimin në gjendje të qëndrueshme nga vlerësimi i përkeqësimit akut.',[
      conditional('cbc','Në diagnozë ose përkeqësim, për anemi, policitemi ose shenja infeksioni sipas rastit.'),
      conditional('bloodgas','Gazometri arteriale te përkeqësimi që paraqitet në spital, sipas protokollit.'),
    ],[
      ['Spirometri pas bronkodilatatorit','Në gjendje të qëndrueshme, obstruksioni persistent mbështet SPOK në kontekstin klinik.'],
      ['SpO₂ dhe radiografi torakale','Në përkeqësim sipas rëndesës. Në spital radiografia ndihmon të identifikohen diagnoza alternative.'],
    ],['copd'],'Gjendja e ndryshuar mendore, lodhja respiratore ose acidoza respiratore kërkon urgjencë.'),
  workup('embolia-pulmonare','Embolia pulmonare (EP)','Suspected pulmonary embolism','cardiacDiagnosis',
    'Te pacienti stabil, përdor probabilitetin klinik para zgjedhjes së testit. Rruga më poshtë vlen për të rritur jo shtatzënë.',[
      conditional('dDimer','Vetëm kur algoritmi e lejon, p.sh. EP e pamundshme sipas Wells. Mbi 50 vjeç mund të përdoret pragu i përshtatur për moshë sipas metodës.'),
    ],[
      ['SpO₂, EKG dhe radiografi torakale','Ndihmojnë për rëndesën dhe diagnozat alternative. Gjetjet normale nuk e përjashtojnë EP.'],
      ['Angio-CT pulmonare ose V/Q','Kur probabiliteti është i lartë ose D-dimeri është pozitiv sipas algoritmit. V/Q sipas indikacionit dhe kundërindikacioneve.'],
    ],['pe'],'Hipotensioni, sinkopa me dyshim për EP ose distresi respirator kërkon vlerësim urgjent.'),
  workup('tromboza-venoze','Tromboza e venave të thella (TVT)','Suspected deep vein thrombosis','cardiacDiagnosis',
    'Te të rriturit jo shtatzënë, vlerëso ënjtjen e njëanshme dhe probabilitetin sipas Wells.',[
      conditional('dDimer','Përdore sipas rrugës së TVT-së. Kur e mundshme, ekografia ka përparësi.'),
    ],[
      ['Ekografi kompresive e venave proksimale','Mungesa e kompresibilitetit mbështet trombozën. Në ekografi negative me D-dimer pozitiv, përsëritja varet nga algoritmi.'],
    ],['pe'],'Dispnea e re, dhimbja e gjoksit ose sinkopa krahas dyshimit për TVT kërkon vlerësim urgjent për EP.'),
  workup('insuficienca-kardiake','Insuficienca kardiake','Heart failure','cardiacDiagnosis',
    'Te pacienti ambulator me dispne, ortopne ose edemë, vlerëso kongjestionin dhe nevojën për ekokardiografi.',[
      core('ntprobnp','Në dyshim për insuficiencë kardiake kronike. Pragjet ambulatore dhe ato akute ndryshojnë.'),
      conditional('creatinine','Për funksionin renal dhe vlerën bazë.'),
      conditional('na','Për çrregullime elektrolitike në kongjestion ose terapi me diuretikë.'),
      conditional('k','Për rrezik aritmie dhe terapi që ndikon kaliumin.'),
      conditional('cbc','Kur kërkohet të vlerësohet anemia ose diagnoza alternative.'),
    ],[
      ['Ekokardiografi transtorakale','Vlerëson fraksionin e ejeksionit, funksionin diastolik dhe patologjinë valvulare. FE e ruajtur nuk e përjashton insuficiencën kardiake.'],
      ['EKG dhe radiografi torakale','Sipas kontekstit, për ritmin, kongjestionin dhe shkaqe alternative.'],
    ],['heart'],'Dispnea akute e rëndë, hipoksemia ose shoku kërkon rrugën e urgjencës.'),
  workup('hipertensioni','Hipertensioni arterial','Arterial hypertension','cardiacDiagnosis',
    'Konfirmo presionin me teknikë të saktë dhe vlerëso dëmtimin e organeve shënjestër te të rriturit jo shtatzënë.',[
      core('acr','Vlerësim për albuminuri.'),
      core('creatinine','Me eGFR për dëmtim renal.'),
      core('k','Si pjesë e elektroliteve dhe për shkaqe të mundshme sekondare.'),
      core('a1c','Vlerëson diabetin si faktor shoqërues rreziku.'),
      conditional('cholesterol','Si pjesë e profilit lipidik për rrezik kardiovaskular.'),
      conditional('hdl','Për vlerësimin e rrezikut bashkë me kolesterolin total.'),
    ],[
      ['Matje në ambulancë dhe ABPM/HBPM','Matjet jashtë ordinancës ndihmojnë të dallohen hipertensioni i qëndrueshëm dhe efekti i mantelit të bardhë.'],
      ['EKG dhe ekzaminim i fundusit','Për hipertrofi ventrikulare, çrregullime ritmi dhe retinopati.'],
    ],['kosovoBp','bp'],'TA shumë i lartë me deficit neurologjik, dhimbje gjoksi, edemë pulmonare ose dëmtim akut renal kërkon vlerësim të menjëhershëm.'),
  workup('insulti-tia','Insulti cerebral dhe TIA','Stroke and transient ischaemic attack','acuteDiagnosis',
    'Përcakto kohën e fillimit ose kur pacienti u pa për herë të fundit pa deficit. Aktivizo rrugën e insultit kur dyshohet.',[
      conditional('glucose','Kontroll i shpejtë për hipoglikemi si imituese e insultit.', ['Mund të imitojë deficit neurologjik akut. Vlerëso rikthimin e deficitit pas korrigjimit sipas rrugës urgjente.','Mund të shoqërojë stresin akut ose diabetin. Deficiti fokal vazhdon të kërkojë vlerësim për insult.']),
    ],[
      ['FAST dhe ekzaminimi neurologjik','Për deficit fokal. Përcakto kohën dhe rëndesën sipas rrugës së insultit.'],
      ['CT cerebrale pa kontrast ± angio-CT','Në insult akut të dyshuar, sipas kriterit të urgjencës dhe kandidaturës për reperfuzion. CT e hershme normale nuk përjashton isheminë.'],
      ['EKG dhe monitorim i ritmit','Për fibrilacion atrial ose burim tjetër të mundshëm embolik.'],
    ],['stroke','af'],'Deficiti fokal i ri kërkon aktivizim të menjëhershëm të rrugës së insultit. Edhe simptomat e zhdukura kërkojnë referim urgjent për TIA.'),
  workup('sepsa','Sepsa e dyshuar te të rriturit','Suspected sepsis in adults','acuteDiagnosis',
    'Vlerëso perfuzionin, gjendjen mendore dhe fokusin infektiv. Përdor rrugën e posaçme për shtatzëninë dhe periudhën e fundit pas saj.',[
      conditional('lactate','Në dyshim me rrezik të moderuar/lartë sipas kontekstit.'),
      conditional('bloodculture','Para antibiotikut kur mostrat nuk vonojnë trajtimin.'),
      conditional('cbc','Për leukocitet, Hb dhe trombocitet.'),
      conditional('crp','Si pjesë e panelit të drejtuar sipas rrezikut.'),
      conditional('creatinine','Për dëmtim të organeve.'),
      conditional('bloodgas','Për status acidobazik sipas rëndesës.'),
      conditional('inr','Kur indikohet vlerësimi i koagulimit.'),
    ],[
      ['Parametrat vitalë, perfuzioni dhe NEWS2','Për të rriturit kur instrumenti zbatohet në atë mjedis. Rivlerëso në mënyrë serike.'],
      ['Ekzaminim dhe imazheri sipas fokusit','P.sh. radiografia torakale ose imazheria abdominale kur gjetjet e orientojnë.'],
    ],['sepsisWorkup'],'Sepsa me hipoperfuzion, ndryshim të vetëdijes ose hipotension kërkon ndërhyrje urgjente pa pritur rezultatet.'),
  workup('meningjiti','Meningjiti bakterial i dyshuar','Suspected bacterial meningitis','acuteDiagnosis',
    'Vlerëso ethet, cefalenë, ngurtësinë e qafës dhe ndryshimin e vetëdijes. Pasqyra mund të jetë jo e plotë.',[
      conditional('bloodculture','Merre para antibiotikut kur kjo s’e vonon trajtimin.'),
      conditional('cbc','Pjesë e analizave në dyshim klinik.'),
      conditional('crp','Vlera normale e izoluar nuk përjashton meningjitin.'),
      conditional('glucose','Glukoza në gjak afër punksionit për raportin LCS/gjak.'),
    ],[
      ['Punksion lumbar dhe analiza të LCS','Kur është e sigurt dhe nuk sjell vonesë domethënëse. Qelizat, proteina, raporti LCS/gjak i glukozës dhe mikrobiologjia ndihmojnë në interpretim.'],
      ['Imazheri para punksionit vetëm sipas indikacionit','P.sh. shenja të presionit intrakranial të rritur ose deficit neurologjik fokal sipas rrugës urgjente.'],
    ],['meningitis'],'Dyshimi për meningjit bakterial kërkon transferim urgjent. Punksioni ose imazheria nuk duhet të vonojnë antibiotikun e indikuar.'),
  workup('dka-hhs','Ketoacidoza diabetike dhe HHS','Diabetic ketoacidosis and hyperosmolar hyperglycaemic state','acuteDiagnosis',
    'Te të rriturit me dehidrim, të vjella, frymëmarrje të thellë ose konfuzion vlerëso së bashku glikeminë, ketozën, acidozën dhe osmolalitetin.',[
      conditional('glucose','Matje e shpejtë fillestare, me konfirmim sipas rrugës urgjente.', ['Glikemia jo shumë e lartë nuk e përjashton DKA, p.sh. me SGLT2, agjërim ose në shtatzëni.', 'Hiperglicemia e rëndë me osmolalitet të lartë favorizon HHS. DKA dhe HHS mund të mbivendosen.']),
      conditional('bloodketones','β-hidroksibutirati për ketozë. Në DKA te të rriturit pragu diagnostik është ≥3,0 mmol/L, bashkë me kriteret e tjera.'),
      conditional('bloodgas','Gazometria venoze për pH dhe bikarbonat kur vlerësohet DKA.'),
      conditional('k','Mat para dhe gjatë terapisë sipas protokollit.', ['Tregon deficit. Kaliumi mund të bjerë më tej gjatë terapisë.', 'Edhe kaliumi fillestar normal/i rritur mund të bashkëjetojë me deficit total trupor.']),
      conditional('na','Për vlerësimin e ujit, tonicititetit dhe osmolalitetit.'),
      conditional('creatinine','Për hipovolemi dhe funksion renal.'),
      conditional('osmolality','Kur dyshohet HHS. Mund të përdoren edhe llogaritjet me formulën dhe njësitë përkatëse.'),
    ],[
      ['Parametrat vitalë, statusi neurologjik dhe diureza','Në paraqitje dhe gjatë monitorimit sipas rrugës spitalore.'],
      ['EKG dhe vlerësim i shkaktarit','Për ndryshime nga kaliumi, ishemi dhe shkaqe precipituese sipas gjetjeve.'],
    ],['crises'],'Dyshimi për DKA/HHS kërkon vlerësim spitalor urgjent. Fëmijët dhe shtatzënat ndiqen me rrugët përkatëse.'),
  workup('demtimi-akut-renal','Dëmtimi akut renal (AKI)','Acute kidney injury','acuteDiagnosis',
    'Krahaso kreatininën me bazën dhe vlerëso diurezën, volumin, barnat dhe mundësinë e obstruksionit.',[
      core('creatinine','Krahaso matjet serike. eGFR është më pak i besueshëm kur kreatinina po ndryshon shpejt.'),
      core('k','Vlerëson komplikimin kryesor elektrolitik.'),
      conditional('urine','Gjak/proteinë mund të orientojë drejt sëmundjes glomerulare.'),
      conditional('bloodgas','Kur dyshohet acidozë ose ka sëmundje të rëndë.'),
    ],[
      ['Diureza dhe bilanci i lëngjeve','Diureza në rënie mund ta identifikojë AKI edhe para rritjes së qartë të kreatininës.'],
      ['Ekografi urinare','Urgjente në dyshim për obstruksion ose kur shkaku nuk identifikohet, sipas rrugës renale.'],
      ['EKG','Në hiperkalemi të dyshuar ose të dokumentuar.'],
    ],['aki'],'Hiperkalemia, edema pulmonare, acidoza e rëndë ose dyshimi për veshkë të infektuar e të obstruktuar kërkon urgjencë.'),
  workup('pielonefriti','Pielonefriti akut','Acute pyelonephritis','systemicDiagnosis',
    'Temperatura, dhimbja e flankut dhe simptomat urinare mbështesin infeksionin e sipërm. Vlerëso sepsën, shtatzëninë dhe obstruksionin.',[
      core('urineculture','Merre para antibiotikut kur është e mundur pa vonuar trajtimin e pacientit me rrezik.'),
      conditional('urine','Mbështet burimin urinar në kontekstin e duhur.'),
      conditional('creatinine','Kur ka sëmundje sistemike, dehidrim ose obstruksion të dyshuar.'),
      conditional('cbc','Kur ka sëmundje sistemike ose dyshim për komplikime.'),
    ],[
      ['Parametrat vitalë dhe ndjeshmëria kostovertebrale','Për fokusin dhe vlerësimin e rëndesës.'],
      ['Ekografi / imazheri urinare','Kur dyshohet obstruksion, dëmtim renal ose komplikim.'],
    ],['pyelo','aki','kosovoUti'],'Shenjat e sepsës, obstruksioni i dyshuar ose pamundësia për të marrë lëngje kërkojnë vlerësim të shpejtë.'),
  workup('hipotiroidizmi','Hipotiroidizmi','Hypothyroidism','systemicDiagnosis',
    'Interpreto TSH me FT4 sipas dyshimit për sëmundje primare apo qendrore. Sëmundja akute dhe biotina mund të ndikojnë rezultatet.',[
      core('tsh','Vlerësim fillestar te shumica e të rriturve ambulantë.'),
      conditional('ft4','Me TSH jonormale ose bashkë me TSH në dyshim për shkak qendror.'),
    ],[
      ['Ekzaminim i tiroides, pulsit dhe shenjave sistemike','Në strumë/nodul ose simptoma kompresive, ndiq rrugën për imazheri strukturore.'],
    ],['thyroid'],'Konfuzioni ose ulja e vetëdijes me hipotermi dhe bradikardi të theksuar kërkon vlerësim urgjent.'),
  workup('hipertiroidizmi','Hipertiroidizmi dhe tireotoksikoza','Hyperthyroidism and thyrotoxicosis','systemicDiagnosis',
    'Kërko simptoma të tepricës hormonale dhe vlerëso ritmin kardiak. Në shtatzëni përdor intervalet dhe rrugën përkatëse.',[
      core('tsh','Hapi fillestar kur dyshohet çrregullim primar.'),
      conditional('ft4','Kur TSH është e ulët.'),
      conditional('ft3','Kur TSH është e ulët, bashkë me FT4 sipas algoritmit.'),
    ],[
      ['EKG','Në palpitacione ose puls të parregullt, për fibrilacion atrial dhe aritmi të tjera.'],
      ['TRAb dhe skanim i drejtuar sipas rastit','Pas konfirmimit biokimik, për të dalluar Graves nga shkaqe të tjera.'],
    ],['thyroid','af'],'Ethet me takikardi të rëndë, konfuzion ose dekompensim kardiak në tireotoksikozë kërkojnë urgjencë.'),
  workup('gihti','Gihti dhe monoartriti akut','Gout and acute monoarthritis','systemicDiagnosis',
    'Në nyje të nxehtë dhe të ënjtur, vlerëso edhe artritin septik, pseudogihtin dhe shkaqet e tjera.',[
      conditional('urate','Mbështet gihtin në pasqyrë tipike. Kur është nën prag gjatë krizës dhe dyshimi vazhdon, përsërite ≥2 javë pas qetësimit.'),
      conditional('crp','Nëse dyshohet inflamacion ose infeksion.'),
      conditional('cbc','Kur dyshohet infeksion ose sëmundje sistemike.'),
    ],[
      ['Aspirim sinovial','Në dyshim për infeksion ose diagnozë të pasigurt. Kërko kulturë, qeliza dhe kristale sipas rastit. Kristalet nuk përjashtojnë infeksionin bashkëshoqërues.'],
      ['Ekografi ose imazheri e drejtuar','Kur aspirimi është i pamundur ose diagnoza mbetet e paqartë.'],
    ],['gout','septicJoint'],'Artriti septik i dyshuar kërkon referim urgjent, edhe me temperaturë ose CRP normale.'),
  workup('gjak-ne-fece','Gjak i kuq në feçe / hematokezia','Rectal bleeding and haematochezia','presentations',
    'Përcakto sasinë, kohëzgjatjen, stabilitetin, terapinë antitrombotike dhe shenjat e alarmit.',[
      conditional('cbc','Në gjakderdhje akute, të përsëritur ose lodhje/zbehje.'),
      conditional('ferritin','Në dyshim për humbje kronike dhe mungesë hekuri.'),
      conditional('inr','Në përdorim të antagonistëve të vitaminës K ose dyshim për koagulopati.'),
    ],[
      ['Ekzaminim abdominal dhe rektal','Sipas rastit. Pamja hemorroidale nuk e përjashton patologjinë proksimale.'],
      ['Kolonoskopi ose angio-CT','Sipas stabilitetit dhe vazhdimit të gjakderdhjes. Angio-CT mund të indikohet kur gjakderdhja aktive është hemodinamikisht domethënëse.'],
    ],['lowerGi','cancer','anemia'],'Hematokezia e bollshme me hipotension ose sinkopë kërkon urgjencë. Mund të ketë edhe burim të sipërm gastrointestinal.'),
  workup('dhimbja-mesit','Dhimbja e mesit dhe shiatiku','Low back pain and sciatica','presentations',
    'Në dhimbje mekanike tipike, analizat laboratorike dhe imazheria zakonisht nuk kërkohen rutinë.',[
      conditional('crp','Vetëm kur dyshohet infeksion ose shkak inflamator.'),
      conditional('cbc','Kur ka shenja sistemike ose dyshim për infeksion.'),
    ],[
      ['Ekzaminim neurologjik i këmbëve','Kontrollo forcën, ndjeshmërinë dhe reflekset kur ka dhimbje radikulare.'],
      ['Imazheri e drejtuar ose MRI urgjente','Kur dyshohet patologji serioze ose kur rezultati pritet të ndryshojë menaxhimin.'],
    ],['back','cauda'],'Retencioni urinar i ri, humbja e ndjeshmërisë perineale ose çrregullimet e reja të fshikëzës/zorrës me dhimbje mesi kërkojnë vlerësim të menjëhershëm për cauda equina.'),
  workup('otiti-akut','Otiti i mesëm akut','Acute otitis media','systemicDiagnosis',
    'Diagnoza zakonisht vendoset klinikisht dhe me otoskopi. Hemogrami dhe CRP nuk duhen rutinë në ecuri të pakomplikuar.',[],[
      ['Otoskopi','Vlerëso fryrjen e membranës timpanike, efuzionin e veshit të mesëm ose otorrenë e re me origjinë nga veshi i mesëm. Skuqja e izoluar ka specificitet të ulët.'],
      ['Otoskopi pneumatike ose timpanometri','Kur prania e lëngut të veshit të mesëm mbetet e paqartë dhe metoda është e disponueshme.'],
    ],['ear'],'Ënjtja prapa veshit, zhvendosja e llapës, dobësia faciale ose gjendja e rëndë sistemike kërkon vlerësim urgjent.'),
  workup('sinuziti-akut','Sinuziti akut','Acute sinusitis','respiratoryDiagnosis',
    'Në paraqitje të pakomplikuar, vlerësimi klinik drejtohet nga kohëzgjatja, përkeqësimi pas përmirësimit dhe shenjat fokale. Analizat nuk duhen rutinë.',[],[
      ['Ekzaminim ORL i drejtuar','Vlerëso simptomat nazale, dhimbjen e fytyrës, dhëmbët dhe shenjat okulare kur ka dyshim.'],
      ['Vlerësim spitalor dhe imazheri e drejtuar','Kur dyshohet komplikim orbital ose intrakranial.'],
    ],['sinus'],'Diplopia, ulja e shikimit, edema periorbitale ose shenjat neurologjike kërkojnë vlerësim urgjent.'),
  workup('fibrilacioni-atrial','Fibrilacioni atrial','Atrial fibrillation','cardiacDiagnosis',
    'Te pulsi i parregullt ose palpitacionet, konfirmo ritmin me EKG dhe vlerëso shkaktarët dhe komorbiditetet.',[
      conditional('tsh','Për sëmundje tiroide që mund të kontribuojë në aritmi.'),
      conditional('cbc','Për anemi dhe numrin e trombociteve në vlerësimin bazë.'),
      conditional('k','Për çrregullime elektrolitike që mund të kontribuojnë në aritmi.'),
      conditional('creatinine','Për funksionin renal dhe zgjedhjet terapeutike.'),
    ],[
      ['EKG me 12 derivacione','Për konfirmim kur pulsi është i parregullt.'],
      ['Monitorim ambulator','Kur dyshohet fibrilacion paroksizmal dhe EKG-ja fillestare nuk e kap episodin.'],
      ['Ekokardiografi','Për funksionin dhe patologjinë strukturore sipas indikacionit.'],
    ],['af','afWorkup'],'Hipotensioni, ishemia, sinkopa ose edema pulmonare me aritmi kërkojnë vlerësim urgjent.'),
  workup('preeklampsia','Preeklampsia e dyshuar','Suspected pre-eclampsia','acuteDiagnosis',
    'Në hipertension të ri pas javës 20 ose me shenja pas lindjes, vlerëso proteinurinë, mosfunksionimin e organeve dhe gjendjen fetale sipas rastit.',[
      conditional('cbc','Për numrin dhe trendin e trombociteve.', ['Trombocitet e ulëta ose në rënie rrisin dyshimin për përfshirje sistemike ose HELLP.','Hb/Hct të larta mund të shoqërojnë hemokoncentrimin. Vlerësoje së bashku me pasqyrën obstetrike.']),
      conditional('creatinine','Për mosfunksionim renal. Interpreto sipas shtatzënisë dhe trendit.'),
      conditional('alt','Për dëmtim hepatik.'),
      conditional('ast','Për vlerësimin e përfshirjes hepatike dhe dyshimit për HELLP.'),
      conditional('pcrUrine','Për proteinuri kur indikohet vlerësim sasior pas dipstick-ut.'),
    ],[
      ['Matje e tensionit dhe vlerësim obstetrik','Matja korrekte dhe prania e shenjave neurologjike, hepatike ose respiratore përcaktojnë urgjencën.'],
      ['Vlerësim fetal','Sipas javës dhe gjendjes, përfshin ekografi dhe/ose kardiotokografi.'],
    ],['preeclampsia'],'TA ≥160 sistolik ose ≥110 mmHg diastolik, cefale e rëndë, simptoma vizuale, dhimbje epigastrike, dispne ose konvulsione kërkojnë vlerësim të menjëhershëm obstetrik.'),
  workup('anafilaksia','Anafilaksia','Anaphylaxis','acuteDiagnosis',
    'Diagnoza është klinike. Manifestimet e rrugëve të frymëmarrjes, frymëmarrjes ose qarkullimit pas një ekspozimi të mundshëm kërkojnë veprim të menjëhershëm.',[
      conditional('tryptase','Merret pas fillimit të trajtimit sipas kohës dhe rrugës së udhëzimit. Te fëmijët nën 16 vjeç përdor indikacionin pediatrik të përcaktuar nga shkaku i dyshuar.'),
    ],[
      ['Vlerësim dhe monitorim ABCDE','Për komprometim respirator ose hemodinamik. Shenjat e lëkurës mund të mungojnë.'],
      ['Vlerësim specialistik alergologjik','Pas ngjarjes, për shkaktarin dhe interpretimin e triptazës bazale kur indikohet.'],
    ],['anaphylaxis'],'Anafilaksia e dyshuar kërkon trajtim urgjent. Triptaza s’duhet ta vonojë adrenalinën IM.'),

];

const PROFILE_UPDATES = {
  'simptoma-lodhja': {
    exams:[['Parametrat vitalë dhe ekzaminim i drejtuar','Vlerëso zbehjen, pulsin, peshën, gjumin, shëndetin mendor dhe barnat sipas anamnezës.']],
    sourceIds:['anemia'],
    findings:{cbc:['Hb e ulët orienton lodhjen drejt anemisë. MCV dhe ferritina ndihmojnë për etiologjinë.','Hb/Hct të larta mund të pasqyrojnë hemokoncentrim. Leukocitoza drejton vlerësimin sipas historisë.']},
  },
  'simptoma-marramendja': {
    exams:[['Dix–Hallpike','Kur episodet janë të shkurtra dhe nxiten nga pozicioni. Nistagmusi tipik mbështet BPPV.'],
      ['HINTS','Vetëm në sindromë vestibulare akute me nistagmus, nga klinicist i trajnuar. Gjetjet qendrore ose të paqarta kërkojnë vlerësim për insult.']],
    findings:{glucose:['Me simptoma të njëkohshme mund të shpjegojë marramendjen, sidomos në terapi hipoglikemike.','Me poliuri ose dehidrim mund të kontribuojë në marramendje.']},
  },
  'simptoma-temperatura': {sourceIds:['sepsisWorkup','feverChild']},
  'simptoma-cefaleja': {findings:{crp:['CRP normale e vetme nuk e mbyll vlerësimin kur dyshohet arterit me qeliza gjigante.','Mbështet inflamacionin në prani të simptomave të përputhshme. Shiko edhe SE dhe vlerësimin klinik.']}},
  'simptoma-humbja-peshes': {sourceIds:['cancer']},
  'simptoma-palpitacionet': {sourceIds:['af']},
  'simptoma-dhimbja-gjoksit': {
    exams:[['Imazheri sipas diagnozës së dyshuar','Radiografi torakale kur duhet për shkak tjetër. Vlerësimi për diseksion aorte ose emboli pulmonare ndjek rrugën specifike.']],
    sourceIds:['pe'],
  },
  'simptoma-dispnea': {sourceIds:['pneumonia','pe']},
  'simptoma-kolla': {sourceIds:['pneumonia','tb']},
  'simptoma-dhimbja-fytit': {sourceIds:['ebvClinical']},
  'simptoma-dhimbja-barkut': {sourceIds:['appendicitis','gallstone','gyn']},
  'simptoma-te-vjellat': {sourceIds:['crises'],exams:[['Ekzaminimi abdominal dhe vlerësimi i hidratimit','Kontrollo diurezën, perfuzionin, distensionin dhe shenjat peritoneale. Imazheria varet nga dyshimi për obstruksion ose shkak tjetër akut.']]},
  'simptoma-dizuria': {sourceIds:['kosovoUti','pediatricUti']},
  'simptoma-edema': {sourceIds:['pe']},
  'simptoma-nyjet': {sourceIds:['septicJoint']},
  'simptoma-menstruacionet': {sourceIds:['gyn','anemia']},
  'diabeti-tip-2': {
    sourceIds:['diabetes','diabetesCare','renal'],
    exams:[['Ekzaminimi i këmbëve','Inspekto lëkurën, pulset dhe ndjeshmërinë mbrojtëse.'],
      ['Ekzaminimi retinal','Sipas rrugës së skriningut të retinopatisë dhe gjetjeve.']],
    findings:{a1c:['Hipoglikemitë ose ndryshimet në jetëgjatësinë e eritrociteve mund të shoqërojnë një HbA1c më të ulët nga sa pritej.','Tregon glikemi mesatare më të lartë. Krahasoje me objektivin individual dhe matjet e glukozës.']},
  },
  'anemia-mungese-hekurit': {
    sourceIds:['anemia'],
    exams:[['Anamneza e humbjes së gjakut dhe vlerësim i drejtuar','Vlerëso gjakderdhjen menstruale dhe gastrointestinale, dietën dhe faktorët e malabsorbimit.'],
      ['Endoskopi e sipërme dhe e poshtme sipas rrezikut','Veçanërisht te burrat dhe gratë pas menopauzës me anemi të re nga mungesa e hekurit pa shpjegim.']],
  },
  'semundja-kronike-veshkave': {
    sourceIds:['renal','aki'],
    exams:[['Tensioni arterial dhe eGFR në seri','Konfirmo kronikën në kontekstin përkatës dhe vlerëso trendin e funksionit renal.'],
      ['Ekografi renale','Kur dyshohet obstruksion, ka hematuri persistente, progresion të shpejtë ose indikacion tjetër sipas rrugës renale.']],
  },
  dislipidemia:{
    sourceIds:['lipids'],
    exams:[['Vlerësim i rrezikut kardiovaskular','Përfshi tensionin, duhanin, diabetin, historinë personale/familjare dhe shkaqet sekondare të dyshuara.']],
  },
  'semundje-hepatike': {
    sourceIds:['liver','gallstone'],
    exams:[['Ekografi hepatobiliare','Kur modeli është kolestatik ose dyshohet shkak strukturor.'],
      ['Vlerësim i fibrozës','Në sëmundje kronike, sipas etiologjisë dhe rrugës lokale.']],
  },
  'infeksion-urinar': {
    sourceIds:['kosovoUti','urine','pediatricUti'],
    exams:[['Vlerësim klinik i fokusit urinar','Dallo dizurinë e pakomplikuar nga ethet me dhimbje të flankut, shtatzënia ose dyshimi për obstruksion. Imazheria varet nga komplikimet.']],
  },
};

module.exports = { SOURCES, ADDITIONS, PROFILES, PROFILE_UPDATES };
