'use strict';

// Versioned clinical reference additions. These are not statements about the
// availability, method or reference interval of a particular laboratory.
const VERSION = 'lab-symptoms-20261029-v1';
const SOURCES = Object.freeze({
  fatigue:['CDC · vlerësimi i lodhjes','https://www.cdc.gov/me-cfs/hcp/diagnosis-testing/evaluation-of-me-cfs.html'],
  dizziness:['SAEM · GRACE-3','https://www.saem.org/publications/grace/grace-3'],
  sepsis:['NICE · sepsa te të rriturit','https://www.nice.org.uk/guidance/ng253'],
  headache:['NICE · cefaleja','https://www.nice.org.uk/guidance/cg150/chapter/Recommendations'],
  thyroid:['NICE · tiroidja','https://www.nice.org.uk/guidance/ng145/chapter/Recommendations'],
  chest:['ACC · dhimbja akute e gjoksit','https://www.acc.org/latest-in-cardiology/ten-points-to-remember/2022/10/10/23/15/2022-acc-expert-consensus-on-chest-pain'],
  heart:['NICE · insuficienca kardiake','https://www.nice.org.uk/guidance/ng106/chapter/recommendations'],
  cough:['NICE · kolla akute','https://www.nice.org.uk/guidance/ng120/chapter/Recommendations'],
  throat:['CDC · faringjiti streptokoksik','https://www.cdc.gov/group-a-strep/hcp/clinical-guidance/strep-throat.html'],
  pancreas:['IAP · pankreatiti akut 2025','https://doi.org/10.1016/j.pan.2025.04.020'],
  diarrhea:['IDSA · diarreja infektive','https://www.idsociety.org/practice-guideline/infectious-diarrhea'],
  constipation:['AGA · shkaqet e kapsllëkut refraktar 2026','https://gastro.org/clinical-guidance/evaluation-and-management-of-refractory-constipation/'],
  constipationTests:['AGA · vlerësimi laboratorik 2013 (udhëzim i arkivuar)','https://gastro.org/clinical-guidance/evaluation-and-management-of-constipation/'],
  liver:['ACG · analizat hepatike','https://gi.org/guideline/evaluation-of-abnormal-liver-chemistries/'],
  urine:['NICE · infeksionet urinare','https://www.nice.org.uk/guidance/ng109/chapter/Recommendations'],
  diabetes:['ADA · kriteret diagnostike 2026','https://doi.org/10.2337/dc26-s002'],
  renal:['NICE · sëmundja kronike e veshkave','https://www.nice.org.uk/guidance/ng203/chapter/Recommendations'],
  joints:['NICE · artriti reumatoid','https://www.nice.org.uk/guidance/ng100/chapter/Recommendations'],
  bleeding:['NICE · menstruacionet e shumta','https://www.nice.org.uk/guidance/ng88/chapter/Recommendations'],
});
const GROUPS = Object.freeze([
  {id:'general',label:'Simptoma të përgjithshme'},
  {id:'cardiorespiratory',label:'Zemra dhe frymëmarrja'},
  {id:'digestive',label:'Sistemi tretës'},
  {id:'other',label:'Urinare, endokrine dhe të tjera'},
]);
const EXISTING = Object.freeze({
  glucose:'Blood Glucose',creatinine:'Serum Creatinine',urea:'Urea',na:'Sodium',k:'Potassium',cl:'Chloride',
  ca:'Total Serum Calcium',mg:'Magnesium',crp:'C-Reactive Protein',esr:'Erythrocyte Sedimentation Rate',
  urine:'Urinalysis',alt:'Alanine Aminotransferase',ast:'Aspartate Aminotransferase',alp:'Alkaline Phosphatase',
  ggt:'Gamma-Glutamyl Transferase',bilirubin:'Total Bilirubin',direct:'Direct Bilirubin',albumin:'Albumin',
  pt:'Prothrombin Time',inr:'International Normalized Ratio',aptt:'Activated Partial Thromboplastin Time',
  retic:'Reticulocyte Count',ldh:'Lactate Dehydrogenase',rf:'Latex Rheumatoid Factor Test',
});
// key, clinical name, exact English identity, category, purpose, source
const ADDITIONS = [
  ['cbc','Hemogrami komplet (CBC)','Complete Blood Count',16,'Vlerëson hemoglobinën, eritrocitet, leukocitet, trombocitet dhe indekset eritrocitare.','fatigue'],
  ['ferritin','Ferritina','Serum Ferritin',9,'Vlerëson rezervat e hekurit. Inflamacioni mund ta rrisë; vlera normale nuk e përjashton gjithmonë mungesën e hekurit.','fatigue'],
  ['tsh','TSH','Thyroid Stimulating Hormone',15,'Vlerësim fillestar i funksionit tiroide sipas kontekstit; interpretohet me FT4 kur indikohet.','thyroid'],
  ['ft4','FT4','Free Thyroxine',15,'Plotëson interpretimin e TSH-së; nevojitet edhe kur dyshohet çrregullim qendror i tiroides.','thyroid'],
  ['b12','Vitamina B12','Vitamin B12',9,'Në dyshim për mungesë, makrocitozë ose simptoma neurologjike.','fatigue'],
  ['folate','Folati','Serum Folate',9,'Vlerëson mungesën e folatit në kontekstin klinik dhe hematologjik.','fatigue'],
  ['a1c','HbA1c','Glycated Hemoglobin A1c',6,'Vlerëson glikeminë afatmesme; anemia, hemoglobinopatitë dhe qarkullimi i ndryshuar i eritrociteve mund ta shtrembërojnë.','diabetes'],
  ['hsctn','Troponina me sensitivitet të lartë (hs-cTn)','High-Sensitivity Cardiac Troponin',8,'Marker i dëmtimit miokardial. Kërkon metodën përkatëse, matje serike, EKG dhe kontekst klinik; nuk barazohet automatikisht me infarkt.','chest'],
  ['ntprobnp','NT-proBNP','N-Terminal Pro-B-Type Natriuretic Peptide',8,'Në dyshim për insuficiencë kardiake; interpretohet me ekzaminimin dhe ekokardiografinë.','heart'],
  ['bnp','BNP','B-Type Natriuretic Peptide',8,'Alternativë ndaj NT-proBNP sipas rrugës diagnostike dhe metodës së laboratorit; jo të dyja rutinë.','heart'],
  ['lipase','Lipaza','Serum Lipase',8,'Në dyshim për pankreatit. Rritja e izoluar nuk e konfirmon diagnozën.','pancreas'],
  ['hcg','β-hCG','Beta Human Chorionic Gonadotropin',15,'Testim për shtatzëni kur shtatzënia është e mundshme; rezultati interpretohet me kohën dhe simptomat.','bleeding'],
  ['bloodketones','Ketonet në gjak (β-hidroksibutirati)','Blood Beta-Hydroxybutyrate',17,'Vlerësim i ketozës; në dyshim për ketoacidozë kërkohet edhe vlerësimi acidobazik.','diabetes'],
  ['bloodgas','Gazometria','Blood Gas Analysis',17,'Vlerëson pH, gazrat dhe çrregullimet acidobazike; tipi arterial/venoz përcaktohet nga pyetja klinike.','sepsis'],
  ['lactate','Laktati','Blood Lactate',17,'Në sëmundje të rëndë/hipoperfuzion; nuk është test i vetëm konfirmues ose përjashtues për sepsë.','sepsis'],
  ['urineculture','Urinokultura me antibiogram','Urine Culture and Susceptibility',11,'Identifikon shkaktarin urinar dhe ndjeshmërinë kur indikohet kultura.','urine'],
  ['bloodculture','Hemokulturat','Blood Cultures',11,'Në dyshim për bakteremi/sepsë; merret para antibiotikut kur kjo nuk vonon trajtimin urgjent.','sepsis'],
  ['respiratory','Test respirator i drejtuar','Targeted Respiratory Pathogen Test',11,'Zgjedhja e patogjenit dhe metodës varet nga simptomat, ekspozimi dhe ndikimi në menaxhim.','cough'],
  ['gas','Testi i shpejtë për streptokokun A','Group A Streptococcus Rapid Antigen Test',11,'Në faringjit me indikacion për testim; jo rutinë kur shenjat janë qartësisht virale.','throat'],
  ['throatculture','Kultura e fytit','Throat Culture',11,'Konfirmim për streptokokun A sipas moshës dhe rezultatit të testit të shpejtë.','throat'],
  ['ebv','Serologjia EBV','Epstein-Barr Virus Serology',11,'Kur dyshohet mononukleozë; interpretohet sipas profilit serologjik dhe kohës së sëmundjes.','throat'],
  ['stoolmicro','Mikrobiologjia e feçeve (kulturë/PCR)','Stool Pathogen Culture or PCR',14,'Në diarre të rëndë, me gjak, temperaturë ose kontekst epidemiologjik të përshtatshëm. Nuk është ekzaminimi i zakonshëm i feçeve.','diarrhea'],
  ['cdiff','C. difficile — toksinë/NAAT','Clostridioides difficile Toxin or NAAT',14,'Vetëm në diarre me kontekst të përshtatshëm; jo skrining pa simptoma dhe jo test shërimi rutinë.','diarrhea'],
  ['haptoglobin','Haptoglobina','Serum Haptoglobin',16,'Pjesë e vlerësimit të hemolizës me hemogram, retikulocite, LDH dhe bilirubinë.','liver'],
  ['acr','Raporti albuminë/kreatininë në urinë (ACR)','Urine Albumin-Creatinine Ratio',5,'Vlerëson albuminurinë. Nuk është i njëjtë me albuminën serike, proteinurinë e përgjithshme ose klirensin e kreatininës.','renal'],
  ['ccp','Anti-CCP','Anti-Cyclic Citrullinated Peptide Antibodies',10,'Mbështet vlerësimin e artritit reumatoid kur ka sinovit; negativiteti nuk e përjashton sëmundjen.','joints'],
  ['vwf','Paneli von Willebrand','Von Willebrand Disease Panel',4,'Vlerësim i drejtuar i antigjenit/aktivitetit vWF dhe faktorit VIII; PT/aPTT normale nuk e përjashtojnë çrregullimin.','bleeding'],
];
const link=(key,tier,rationale,contextNote='')=>({key,tier,rationale,contextNote});
const conditional=(keys,why)=>keys.map(key=>link(key,'conditional',why));
const profile=(slug,title,titleEn,group,summary,tests,interpretation,assessments=[],urgentNote='',sourceIds=[])=>({
  id:'symptom-'+slug,slug:'simptoma-'+slug,title,titleEn,group,summary,tests,interpretation,assessments,urgentNote,sourceIds,
});
const PROFILES = [
  profile('lodhja','Lodhja dhe dobësia','Fatigue and weakness','general','Vlerësim i drejtuar kur lodhja persiston ose mbetet e pashpjeguar.',[
    link('cbc','core','Vlerësim për anemi dhe ndryshime hematologjike.'),...conditional(['ferritin'],'Kur dyshohet mungesë hekuri.'),...conditional(['glucose','tsh'],'Sipas anamnezës dhe ekzaminimit.'),...conditional(['b12','folate'],'Në makrocitozë ose shenja të mungesës; B12 edhe me simptoma neurologjike.'),
  ],'Hb e ulët sugjeron anemi; ferritina e ulët mbështet mungesën e hekurit. TSH e rritur me FT4 të ulët përputhet me hipotiroidizëm primar.',[], '',['fatigue','thyroid']),
  profile('marramendja','Marramendja','Dizziness and vertigo','general','Anamneza, koha dhe shkaktarët e simptomave e drejtojnë vlerësimin.',[
    ...conditional(['glucose'],'Kur dyshohet hipoglikemi.'),...conditional(['cbc'],'Në dyshim për anemi ose gjakderdhje.'),...conditional(['na','k','creatinine'],'Kur ka dehidrim ose dyshim për çrregullim metabolik.'),
  ],'Glukoza e ulët mund të shpjegojë simptomat; Hb e ulët sugjeron anemi. Vertigoja pozicionale tipike shpesh nuk kërkon analiza laboratorike.',['TA ortostatike dhe ekzaminim neurologjik/vestibular.','EKG kur dyshohet shkak kardiak.'],'Deficiti neurologjik i ri ose pamundësia për të ecur kërkon vlerësim urgjent.',['dizziness']),
  profile('temperatura','Temperatura','Fever','general','Analizat zgjidhen sipas fokusit dhe rëndesës; jo panel rutinë për çdo temperaturë.',[
    ...conditional(['cbc','crp'],'Kur vlerësimi klinik kërkon hetim.'),...conditional(['urine','urineculture','respiratory'],'Sipas fokusit të dyshuar dhe indikacionit.'),...conditional(['bloodculture','lactate','glucose','bloodgas','na','k','creatinine','alt','ast','pt','inr','aptt'],'Në infeksion të rëndë ose dyshim për sepsë; sipas rrugës urgjente.'),
  ],'CRP është marker jospecifik inflamacioni. Leukocitoza ose leukopenia mund të shfaqen në infeksione; asnjëra nuk e konfirmon vetë shkaktarin bakterial.',['Vlerëso parametrat vitalë, fokusin dhe rrezikun sipas moshës.'],'Dyshimi për sepsë ose paqëndrueshmëria kërkon vlerësim urgjent; analizat nuk duhet të vonojnë trajtimin.',['sepsis']),
  profile('cefaleja','Dhimbja e kokës','Headache','general','Migrena ose cefaleja tipike pa shenja alarmi zakonisht nuk kërkon analiza rutinë.',conditional(['crp','esr'],'Kur dyshohet arterit me qeliza gjigante.'),'CRP/SE të rritura mund të mbështesin inflamacionin, por nuk konfirmojnë diagnozën.',['Neuroimazheri vetëm sipas indikacionit klinik.'],'Dhimbja e papritur shumë e fortë ose deficiti neurologjik kërkon vlerësim urgjent.',['headache']),
  profile('humbja-peshes','Humbja e pashpjeguar e peshës','Unintentional weight loss','general','Zgjidh hetimet sipas historisë, ekzaminimit dhe ritmit të humbjes së peshës.',conditional(['cbc','glucose','a1c','tsh','crp','esr','creatinine','alt','ast','urine'],'Sipas gjetjeve klinike dhe diagnozës së dyshuar.'),'Hiperglicemia kërkon vlerësim për diabet; TSH e ulët me FT4 të rritur sugjeron hipertiroidizëm. Anemia kërkon sqarim të shkakut.',['Hetim i drejtuar për infeksione kronike, malabsorbim ose malignitet; jo panel universal.'],'',['fatigue','thyroid','diabetes']),
  profile('palpitacionet','Palpitacionet','Palpitations','cardiorespiratory','EKG-ja është pjesë qendrore e vlerësimit; analizat varen nga dyshimi klinik.',[
    ...conditional(['cbc','tsh','k','mg','ca','glucose'],'Në dyshim për anemi, çrregullime tiroide ose metabolike.'),link('ft4','conditional','Kur TSH është jonormale ose dyshohet sëmundje tiroide qendrore.'),
  ],'Anemia, hipertiroidizmi dhe K/Mg të ulëta mund të kontribuojnë në takikardi ose aritmi.',['EKG; Holter ose monitorim tjetër sipas shpeshtësisë dhe rrezikut.'],'Sinkopa, dhimbja e gjoksit ose paqëndrueshmëria me palpitacione kërkon vlerësim urgjent.',['thyroid','chest']),
  profile('dhimbja-gjoksit','Dhimbja e gjoksit','Chest pain','cardiorespiratory','Vlerëso menjëherë mundësinë e sindromës koronare akute.',[
    link('hsctn','conditional','Në dyshim për sindromë koronare akute; matje serike sipas algoritmit të metodës.'),...conditional(['cbc','creatinine','na','k'],'Sipas gjendjes dhe rrugës klinike.'),
  ],'Troponina e rritur tregon dëmtim miokardial, jo domosdoshmërisht infarkt; duhen konteksti, EKG-ja dhe dinamika.',['Në dyshim për ACS: EKG sa më shpejt, me objektiv brenda 10 minutave nga paraqitja në urgjencë.'],'Dhimbja akute e dyshimtë për ACS kërkon rrugë urgjente; mos prit panelin laboratorik.',['chest']),
  profile('dispnea','Vështirësia në frymëmarrje','Dyspnea','cardiorespiratory','Hetimet drejtohen nga shkaku i mundshëm dhe rëndesa.',[
    ...conditional(['cbc'],'Kur dyshohet anemi.'),link('ntprobnp','conditional','Kur dyshohet insuficiencë kardiake.','BNP mund të përdoret si alternativë sipas protokollit; jo të dyja rutinë.'),link('hsctn','conditional','Kur dyshohet ishemi miokardiale.'),link('crp','conditional','Kur dyshohet infeksion.'),link('bloodgas','conditional','Në raste të rënda ose kur kërkohet vlerësim acidobazik.'),
  ],'NT-proBNP i rritur nuk e konfirmon i vetëm insuficiencën kardiake; duhen vlerësimi klinik dhe ekokardiografia.',['SpO₂, EKG, radiografi torakale sipas rastit; ekokardiografi kur indikohet.'],'Dispnea e rëndë, hipoksemia ose paqëndrueshmëria kërkon vlerësim urgjent.',['heart','chest']),
  profile('kolla','Kolla','Cough','cardiorespiratory','Kolla akute e lehtë shpesh nuk ka nevojë për analiza.',[
    ...conditional(['cbc','crp'],'Kur dyshohet pneumoni ose sëmundje serioze.'),link('respiratory','conditional','Testim viral i drejtuar kur rezultati ndryshon menaxhimin.'),
  ],'CRP dhe neutrofilia mund të mbështesin inflamacionin, por nuk identifikojnë vetë patogjenin.',['Radiografi torakale kur dyshohet pneumoni; testim për tuberkuloz sipas ekspozimit, kohëzgjatjes dhe simptomave.'],'Hemoptizia e rëndësishme ose vështirësia në frymëmarrje kërkon vlerësim të shpejtë.',['cough']),
  profile('dhimbja-fytit','Dhimbja e fytit','Sore throat','cardiorespiratory','Hemogrami dhe CRP zakonisht nuk nevojiten rutinë.',[
    link('gas','conditional','Kur indikohet testim për streptokokun A sipas vlerësimit klinik.'),link('throatculture','conditional','Konfirmim sipas moshës/testit të shpejtë.','Te fëmijët simptomatikë ≥3 vjeç, RADT negativ konfirmohet me kulturë sipas CDC; jo rutinë te të rriturit.'),link('ebv','conditional','Kur dyshohet mononukleozë.'),
  ],'Testi pozitiv për streptokokun A mbështet diagnozën në kontekstin e përshtatshëm.',['Vlerësim klinik; Centor/FeverPAIN sipas protokollit lokal.'],'Stridori, pamundësia për të gëlltitur sekrecionet ose komprometimi i rrugëve të frymëmarrjes kërkon urgjencë.',['throat']),
  profile('dhimbja-barkut','Dhimbja e barkut','Abdominal pain','digestive','Zgjedhja varet nga lokalizimi, kohëzgjatja dhe ashpërsia.',[
    ...conditional(['cbc','crp','urine'],'Sipas diagnozës së dyshuar.'),link('hcg','conditional','Kur shtatzënia është e mundshme.'),...conditional(['alt','ast','alp','ggt','bilirubin'],'Kur dyshohet shkak hepatobiliar.'),link('lipase','conditional','Kur dyshohet pankreatit.'),
  ],'Pankreatiti akut kërkon dy nga tri: dhimbje tipike, enzima pankreatike rreth ≥3 herë kufiri i sipërm ose imazheri karakteristike. Lipaza e izoluar nuk mjafton.',['Imazheri dhe ekzaminim i drejtuar sipas gjetjeve.'],'Dhimbja e fortë, shenjat peritoneale, shoku ose dyshimi për shtatzëni ektopike kërkon vlerësim urgjent.',['pancreas']),
  profile('te-vjellat','Nauzeja dhe të vjellat','Nausea and vomiting','digestive','Hetim kur të vjellat persistojnë, ka dehidrim ose dyshim për shkak serioz.',[
    ...conditional(['na','k','cl','creatinine','urea','glucose'],'Në të vjella të vazhdueshme ose dehidrim.'),link('hcg','conditional','Kur shtatzënia është e mundshme.'),link('lipase','conditional','Kur dyshohet pankreatit.'),...conditional(['bloodketones','bloodgas'],'Kur dyshohet ketoacidozë.'),
  ],'Humbjet e K/Cl dhe çrregullimet acidobazike mund të shfaqen pas të vjellave. Kreatinina e rritur mund të pasqyrojë hipovolemi ose dëmtim renal.',[],'Hematemeza, shoku, dehidrimi i rëndë ose dyshimi për ketoacidozë kërkon vlerësim urgjent.',['diabetes','pancreas']),
  profile('diarreja','Diarreja','Diarrhea','digestive','Diarreja e lehtë akute zakonisht nuk kërkon analiza.',[
    ...conditional(['na','k','urea','creatinine'],'Në dehidrim ose sëmundje të rëndë.'),link('stoolmicro','conditional','Në diarre me gjak, temperaturë, dhimbje të rënda ose shenja sepsë.'),link('cdiff','conditional','Në diarre me kontekst të përshtatshëm, përfshirë ekspozimin ndaj antibiotikëve/shërbimeve shëndetësore.'),
  ],'Mikrobiologjia mund të identifikojë shkaktarin. Ekzaminimi i zakonshëm i feçeve nuk e zëvendëson kulturën/PCR-në.',['Vlerëso hidratimin dhe faktorët epidemiologjikë.'],'Gjakderdhja e rëndësishme, dehidrimi i rëndë ose shenjat sepsë kërkojnë vlerësim urgjent.',['diarrhea']),
  profile('kapslleku','Kapsllëku','Constipation','digestive','Kapsllëku i thjeshtë nuk kërkon panel metabolik ose endokrin rutinë.',conditional(['cbc','tsh','ca'],'Vetëm sipas simptomave, historisë dhe shenjave të tjera.'),'Hipotiroidizmi dhe hiperkalcemia mund të kontribuojnë, por analizat zgjidhen sipas dyshimit.',['Gjakderdhja, anemia ose humbja e peshës kërkon hetim gastrointestinal sipas rastit.'],'Dhimbja e fortë, distensioni me të vjella ose dyshimi për obstruksion kërkon vlerësim urgjent.',['constipation','constipationTests']),
  profile('verdheza','Verdhëza','Jaundice','digestive','Dallo modelin hepatocelular, kolestatik dhe hemolitik.',[
    ...['bilirubin','direct','alt','ast','alp','ggt','albumin','pt','inr'].map(key=>link(key,'core','Vlerësimi fillestar hepatobiliar dhe i funksionit sintetik.')),...conditional(['cbc','retic','ldh','haptoglobin'],'Kur dyshohet hemolizë.'),
  ],'ALT/AST dominuese sugjerojnë dëmtim hepatocelular; ALP/GGT dominuese model kolestatik. Bilirubina indirekte vlerësohet me fraksionet dhe shenjat e hemolizës.',['Ekografi/hetime etiologjike sipas modelit.'],'Verdhëza me temperaturë/dhimbje të fortë, konfuzion ose koagulopati kërkon vlerësim urgjent.',['liver']),
  profile('dizuria','Djegia gjatë urinimit','Dysuria','other','Vlerëso simptomat urinare dhe mundësinë e shkaqeve të tjera.',[
    link('urine','recommended','Dipstick/urinalizë sipas profilit klinik dhe protokollit.'),link('urineculture','conditional','Te shtatzënat, burrat dhe fëmijët sipas udhëzimit; gjithashtu në infeksion të komplikuar/rekurent ose dyshim për pielonefrit.'),...conditional(['cbc','crp','creatinine'],'Në temperaturë, dhimbje të flankut ose sëmundje të rëndë.'),
  ],'Nitritet/leukocit-esteraza mbështesin UTI në pacientin simptomatik; kultura identifikon bakterin dhe ndjeshmërinë.',['Merr parasysh uretritin/IST dhe shkaqe të tjera kur historia e sugjeron.'],'Temperatura me dhimbje të flankut, sepsa ose përkeqësimi kërkon vlerësim të shpejtë.',['urine']),
  profile('etje-urinim','Etje e shtuar dhe urinim i shpeshtë','Polydipsia and polyuria','other','Vlerëso glikeminë dhe nëse ka shenja të çrregullimit akut metabolik.',[
    link('glucose','core','Vlerësim i glikemisë plazmatike.'),link('a1c','recommended','Ndihmon vlerësimin afatmesëm; nuk vonon diagnostikimin/trajtimin e gjendjes akute.'),link('urine','recommended','Vlerësim urinar sipas kontekstit.'),...conditional(['bloodketones','na','k','creatinine','bloodgas'],'Në hiperglicemi të rëndë ose simptoma akute; vlerësim për DKA/HHS.'),
  ],'Te personat jo shtatzënë, glikemia esëll ≥7,0 mmol/L ose HbA1c ≥6,5% plotëson kriter diagnostik; zakonisht duhen dy rezultate jonormale pa hiperglicemi të qartë.',['Vlerëso shkaqe të tjera të poliurisë nëse glikemia nuk e shpjegon.'],'Ketonet me të vjella, dhimbje barku, frymëmarrje të thellë ose dehidrim kërkojnë vlerësim urgjent.',['diabetes']),
  profile('edema','Ënjtja e këmbëve','Leg edema','other','Analizat varen nga shkaku renal, kardiak, hepatik ose lokal.',[
    ...conditional(['creatinine','na','k','albumin','urine','acr','alt','ast'],'Sipas anamnezës dhe ekzaminimit.'),link('ntprobnp','conditional','Kur dyshohet insuficiencë kardiake.'),
  ],'ACR i rritur tregon albuminuri; albumina e ulët mund të kontribuojë në edemë. NT-proBNP kërkon interpretim klinik dhe ekokardiografik.',['eGFR vlerësohet nga kreatinina me formulën e përshtatshme; nuk është klirensi i matur i kreatininës.','Ekokardiografi kur dyshohet shkak kardiak; vlerësim për trombozë sipas shenjave lokale.'],'Ënjtja e papritur e njëanshme me dhimbje, sidomos me dispne, kërkon vlerësim urgjent.',['renal','heart']),
  profile('nyjet','Dhimbja dhe ënjtja e nyjeve','Arthralgia and arthritis','other','Hetimi drejtohet nga sinoviti dhe dyshimi inflamator ose infektiv.',[
    ...conditional(['crp','esr','cbc'],'Në dyshim për proces inflamator/infektiv.'),link('rf','conditional','Në dyshim për artrit reumatoid me sinovit klinik.'),link('ccp','conditional','Kur dyshohet artrit reumatoid, veçanërisht nëse RF është negativ.'),
  ],'CRP/SE janë jospecifike. Anti-CCP pozitiv mund të mbështesë artritin reumatoid; rezultatet negative nuk e përjashtojnë.',['Në nyje akute të nxehtë/ënjtur: aspirim sinovial për qeliza, kristale dhe mikrobiologji.','Hetimet nuk duhet të vonojnë referimin për sinovit persistent.'],'Nyja akute e nxehtë dhe e ënjtur kërkon përjashtim urgjent të artritit septik.',['joints']),
  profile('menstruacionet','Menstruacionet e shumta','Heavy menstrual bleeding','other','Vlerëso aneminë, mungesën e hekurit dhe historinë e gjakderdhjes.',[
    link('cbc','core','Vlerësim i anemisë.'),link('ferritin','conditional','Vlerësim i rezervave të hekurit kur indikohet.'),link('hcg','conditional','Kur shtatzënia është e mundshme.'),...conditional(['pt','inr','aptt','vwf'],'Kur historia sugjeron çrregullim hemorragjik, p.sh. që nga menarka dhe histori personale/familjare.'),link('tsh','conditional','Vetëm me shenja ose simptoma të sëmundjes tiroide.'),
  ],'Hb e ulët sugjeron anemi; ferritina e ulët mungesë hekuri. PT/aPTT normale nuk e përjashtojnë sëmundjen von Willebrand.',['Vlerësim gjinekologjik dhe imazheri sipas historisë dhe ekzaminimit.'],'Gjakderdhja e rëndë me sinkopë/paqëndrueshmëri ose shtatzëni të mundshme kërkon vlerësim urgjent.',['bleeding']),
];

const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function enrichLabDataset(data) {
  const categories=[...data.categories],tests=[...data.tests],resolved=new Map();
  for(const [n,title] of [[15,'Endokrinologjia'],[16,'Hematologjia — panele'],[17,'Gazometria dhe metabolizmi']]){
    if(!categories.some(c=>c.id==='category-'+n))categories.push({id:'category-'+n,number:n,label:'Kategoria '+n,title,count:0});
  }
  const findEnglish=name=>{const matches=tests.filter(t=>norm(t.englishName)===norm(name));return matches.length===1?matches[0]:null;};
  for(const [key,en] of Object.entries(EXISTING)){const t=findEnglish(en);if(t)resolved.set(key,t);}
  for(const [key,title,en,cat,purpose,source] of ADDITIONS){
    let test=findEnglish(en);
    if(!test){test={id:'lab-ref-'+key,categoryId:'category-'+cat,category:categories.find(c=>c.id==='category-'+cat).title,formName:title,albanianName:title,englishName:en,whatItShows:purpose,highPositiveAbnormal:'Interpretohet sipas metodës, intervalit të laboratorit dhe kontekstit klinik.',lowNegativeNormal:'Rezultati negativ/normal nuk e përjashton çdo diagnozë; varet nga testi dhe koha e marrjes.',sourceUrl:SOURCES[source][1],referenceOnly:true};tests.push(test);}
    resolved.set(key,test);
  }
  const componentNames=['Hemoglobin','Hematocrit','Red Blood Cell Count','White Blood Cell Count','Platelet Count','Mean Corpuscular Volume','Mean Corpuscular Hemoglobin','Mean Corpuscular Hemoglobin Concentration','Red Cell Distribution Width – Coefficient of Variation','Red Cell Distribution Width – Standard Deviation'];
  // Metadata only: individual components remain visible whenever CBC is not selected.
  const cbc=resolved.get('cbc');
  const enrichedTests=tests.map(t=>t.id===cbc.id?{...t,containsTestIds:componentNames.map(findEnglish).filter(Boolean).map(t=>t.id)}:t);
  const gapKeys={'diabeti-tip-2':[['a1c','core'],['acr','recommended']],'anemia-mungese-hekurit':[['ferritin','core']],'semundja-kronike-veshkave':[['acr','core']],'infeksion-urinar':[['urineculture','conditional']]};
  const baseIndications=data.indications.filter(i=>!i.id.startsWith('symptom-')).map(i=>{
    const links=[...(i.tests||[])],replaced=new Set();
    for(const [key,tier] of gapKeys[i.slug]||[]){const test=resolved.get(key);if(!test)continue;if(!links.some(l=>l.testId===test.id))links.push({testId:test.id,tier,rationale:test.whatItShows,contextNote:'',sortOrder:links.length+1});replaced.add(norm(test.formName));if(key==='urineculture')replaced.add(norm('Urinokultura'));}
    return {...i,group:'diagnoses',tests:links,catalogGaps:(i.catalogGaps||[]).filter(g=>!replaced.has(norm(g.name))&&!(i.slug==='semundja-kronike-veshkave'&&norm(g.name)==='egfr')),assessments:[...new Set([...(i.assessments||[]),...(i.slug==='semundja-kronike-veshkave'?['eGFR raportohet/llogaritet nga kreatinina me formulën e përshtatshme; nuk është test i veçantë ose klirensi i matur i kreatininës.']:[])])]};
  });
  const symptomProfiles=PROFILES.map((p,index)=>({...p,kind:'symptom',sortOrder:index+1,icdCodes:[],aliases:[p.titleEn,p.slug,...({lodhja:['lodhje','dobesi'],kolla:['kolle'],temperatura:['temperature','ethe'],'humbja-peshes':['humbje peshe','renie peshe'],'dhimbja-fytit':['dhimbje fyti','dhimbje fyt','fyt i dhembshem'],verdheza:['verdheze','ikter'],dizuria:['dizuri','djegie urinimi'],'dhimbja-barkut':['dhimbje barku'],'dhimbja-gjoksit':['dhimbje gjoksi'],'te-vjellat':['vjellje','nauze'],edema:['enjtje','enjtje kembesh'],marramendja:['marramendje','vertigo'],cefaleja:['dhimbje koke','migrene'],dispnea:['frymemarrje','marrje fryme'],nyjet:['nyje','artikulacione','dhimbje nyjesh','dhimbje nyje','enjtje nyjesh'],menstruacionet:['perioda','gjakderdhje menstruale']}[p.slug.replace(/^simptoma-/,'')]||[])],tests:p.tests.filter(l=>resolved.has(l.key)).map((l,n)=>({...l,testId:resolved.get(l.key).id,sortOrder:n+1})),catalogGaps:p.tests.filter(l=>!resolved.has(l.key)).map(l=>({name:EXISTING[l.key]||l.key,note:l.rationale})),sources:p.sourceIds.map(id=>({title:SOURCES[id][0],url:SOURCES[id][1]})),reviewedAt:'2026-10-29'}));
  return {...data,version:VERSION,symptomGuideVersion:VERSION,profileGroups:[...GROUPS,{id:'diagnoses',label:'Diagnozat ekzistuese'}],categories:categories.map(c=>({...c,count:enrichedTests.filter(t=>t.categoryId===c.id).length})),tests:enrichedTests,indications:[...symptomProfiles,...baseIndications],sourceNote:'Katalogu ekzistues lexohet nga Supabase dhe plotësohet me referenca klinike të versionuara. Përzgjedhja nuk garanton disponueshmëri ose metodë në një laborator të caktuar.'};
}
module.exports={VERSION,SOURCES,GROUPS,EXISTING,ADDITIONS,PROFILES,enrichLabDataset};
