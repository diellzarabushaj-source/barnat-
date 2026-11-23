'use strict';

// Each pair describes clinically meaningful directions or positive/negative
// findings. A null direction has no useful interpretation for that test.
const FINDINGS = {
  pcrUrine: ['Vlera nën prag nuk e përjashton preeklampsinë kur ka mosfunksionim organesh ose gjetje të tjera të përputhshme.', 'Mbështet proteinurinë në kontekstin obstetrik. Interpreto pragun dhe njësitë sipas metodës dhe protokollit.'],
  tryptase: ['Vlera normale nuk e përjashton anafilaksinë. Koha e marrjes dhe lloji i reaksionit ndikojnë rezultatin.', 'Mbështet aktivizimin mastocitar kur interpretohet me kohën e marrjes dhe nivelin bazal.'],
  cbc: ['Hb e ulët tregon anemi. Leukopenia dhe trombocitopenia vlerësohen sipas secilës linjë dhe trendit.', 'Leukocitoza mund të shoqërojë infeksionin, inflamacionin ose stresin. Hb/Hct të larta mund të pasqyrojnë hemokoncentrim.'],
  hemoglobin: ['Mbështet aneminë. Në gjakderdhje akute Hb fillestare mund të jetë ende normale.', 'Mund të pasqyrojë hemokoncentrim ose eritrocitozë. Krahasoje me Hct dhe hidratimin.'],
  hematocrit: ['Në anemi ose hemodilucion. Interpretoje me Hb.', 'Në hemokoncentrim ose eritrocitozë.'],
  mcv: ['Mikrocitozë, p.sh. në mungesë hekuri ose talasemi.', 'Makrocitozë. Vlerëso B12, folatin dhe shkaqet e tjera sipas kontekstit.'],
  mch: ['Hemoglobinë e reduktuar për eritrocit, shpesh bashkë me mikrocitozën.', 'Shpesh shoqëron makrocitozën. Interpretoje me MCV.'],
  mchc: ['Hipokromi, e mundshme në mungesë hekuri.', 'Rritja kërkon verifikim të mostrës dhe interpretim me morfologjinë eritrocitare.'],
  iron: ['Mund të ulet në mungesë hekuri ose inflamacion. Kontrollo ferritinën dhe saturimin e transferrinës.', 'Ndikohet nga suplementet dhe koha e mostrës. Interpretoje me saturimin e transferrinës.'],
  tibc: ['Mund të ulet në inflamacion ose sëmundje hepatike.', 'Me hekur të ulët e mbështet mungesën e hekurit.'],
  ferritin: ['Mbështet mungesën e hekurit, edhe para rënies së Hb.', 'Mund të rritet nga inflamacioni ose sëmundja hepatike. Ferritina normale/e rritur mund ta maskojë mungesën e hekurit.'],
  b12: ['Mbështet mungesën e B12, që mund të japë neuropati edhe me hemogram normal.', 'Vlerëso suplementet dhe kontekstin. Rritja vetë nuk shpjegon neuropatinë.'],
  folate: ['Mund të kontribuojë në makrocitozë. Vlerëso edhe B12.', 'Shpesh pasqyron marrje ose suplementim të fundit.'],
  glucose: ['Me simptoma të përputhshme sugjeron hipoglikemi. Te pacienti simptomatik vepro sipas rrugës urgjente.', 'Sugjeron hiperglikemi. Interpretoje sipas kohës së vaktit, sëmundjes akute dhe simptomave.'],
  a1c: ['Mund të nënvlerësojë glikeminë kur jetëgjatësia e eritrociteve është e shkurtuar.', 'Mbështet hiperglikeminë kronike. Interpretoje me glikeminë dhe faktorët që ndikojnë eritrocitet.'],
  tsh: ['Me FT4/FT3 të rritur mbështet hipertiroidizëm primar. Me FT4 të ulët merre parasysh sëmundjen qendrore ose akute.', 'Me FT4 të ulët mbështet hipotiroidizëm primar. Me FT4 normale mund të jetë hipotiroidizëm subklinik.'],
  ft4: ['Me TSH të rritur mbështet hipotiroidizëm primar. TSH normale/e ulët kërkon vlerësim për shkaqe qendrore ose sëmundje akute.', 'Me TSH të suprimuar mbështet tireotoksikozën.'],
  ft3: ['Mund të ulet në sëmundje akute. Vlera e izoluar ka interpretim të kufizuar.', 'Me TSH të suprimuar mbështet tireotoksikozën, edhe nëse FT4 është normale.'],
  creatinine: ['Mund të pasqyrojë masë të ulët muskulore. Krahasoje me vlerën bazë.', 'Rritja e re sugjeron dëmtim akut renal, hipovolemi ose obstruksion sipas rastit. Vlerëso trendin dhe diurezën.'],
  urea: ['Mund të pasqyrojë marrje të ulët proteinash ose sintezë të reduktuar hepatike.', 'Mund të rritet në hipovolemi, dëmtim renal, katabolizëm ose gjakderdhje të sipërme gastrointestinale.'],
  na: ['Hiponatremi. Vlerëso glikeminë, tonicitetin, statusin e volumit dhe simptomat neurologjike.', 'Hipernatremi. Shpesh tregon deficit të ujit në raport me natriumin.'],
  k: ['Humbje gastrointestinale/renale ose zhvendosje brendaqelizore. Me palpitacione ose dobësi kontrollo EKG-në.', 'Mund të shoqërojë dëmtim renal, barna ose acidozë. Kontrollo hemolizën e mostrës dhe urgjencën sipas nivelit, EKG-së dhe simptomave.'],
  cl: ['Mund të pasojë të vjellat ose përdorimin e diuretikëve dhe të shoqërojë alkalozën metabolike.', 'Mund të shoqërojë acidozë metabolike hiperkloremike, p.sh. nga humbjet me diarre.'],
  ca: ['Mund të japë parestezi ose spazma. Kalciumi total ndikohet nga albumina, ndaj interpreto sipas metodës.', 'Mund të japë kapsllëk, poliuri ose konfuzion. Konfirmoje me matje të përshtatshme.'],
  mg: ['Mund të kontribuojë në aritmi dhe hipokalemi refraktare.', 'Më shpesh me insuficiencë renale ose ngarkesë me magnez. Vlerëso simptomat.'],
  crp: ['Vlera e ulët ose normale në fillim nuk përjashton inflamacionin apo infeksionin serioz.', 'Mbështet inflamacionin. Vlera e vetme nuk dallon me siguri shkakun bakterial nga ai viral.'],
  esr: ['SE normale nuk e përjashton sëmundjen inflamatore kur dyshimi klinik mbetet i lartë.', 'Mbështet inflamacionin, me ndikim edhe nga mosha, anemia dhe faktorë të tjerë.'],
  urine: ['Rezultati negativ nuk përjashton çdo infeksion urinar ose gur ureteral.', 'Nitritet/leukocitet mund të mbështesin infeksionin te pacienti simptomatik. Hematuria dhe proteinuria kanë edhe shkaqe të tjera.'],
  nitrites: ['Nuk përjashton ITU. Disa patogjenë nuk prodhojnë nitrite.', 'Mbështet bakteriurinë me mikrobe që reduktojnë nitratin në pacientin simptomatik.'],
  urineSediment: ['Sedimenti pa gjetje nuk e përjashton infeksionin në çdo pacient.', 'Piuria mbështet inflamacionin urinar. Eritrocitet dhe cilindrat orientojnë hetim tjetër sipas modelit.'],
  urineProtein: ['Dipstick negativ mund të humbasë albuminurinë e nivelit të ulët. Për vlerësim sasior përdor ACR.', 'Proteina në urinë mund të jetë tranzitore. Konfirmo dhe karakterizoje sipas rrugës renale.'],
  acr: ['Vlera normale nuk e përjashton CKD nëse eGFR është i ulët ose ka shenja të tjera dëmtimi renal.', 'Albuminuri. Vlerëso persistencën dhe shkaqet tranzitore, p.sh. infeksionin urinar.'],
  alt: [null, 'Mbështet dëmtim hepatocelular. Vlerëso madhësinë e rritjes dhe modelin me AST, ALP dhe bilirubinën.'],
  ast: [null, 'Mund të rritet në dëmtim hepatik ose muskulor. Interpretoje me ALT dhe kontekstin.'],
  alp: ['Nuk mbështet model kolestatik. Një vlerë e vetme nuk përjashton obstruksionin e hershëm.', 'Me GGT të rritur sugjeron origjinë hepatobiliare. ALP mund të rritet edhe nga kockat ose shtatzënia.'],
  ggt: [null, 'Me ALP të rritur mbështet origjinën hepatobiliare. GGT e izoluar është jospecifike.'],
  bilirubin: [null, 'Fraksioni direkt orienton drejt kolestazës ose dëmtimit hepatocelular. Indirekti drejt hemolizës ose çrregullimit të konjugimit.'],
  direct: [null, 'Dominimi i bilirubinës direkte orienton drejt kolestazës ose dëmtimit hepatocelular.'],
  albumin: ['Mund të pasqyrojë humbje renale, inflamacion, sintezë hepatike të reduktuar ose kequshqyerje. Mund të kontribuojë në edemë.', 'Mund të pasqyrojë hemokoncentrim.'],
  pt: [null, 'PT e zgjatur mund të pasqyrojë mungesë faktorësh, antikoagulim ose sintezë hepatike të reduktuar.'],
  inr: ['Te përdoruesit e antagonistëve të vitaminës K krahasoje me objektivin individual.', 'Merr parasysh antikoagulimin, mungesën e vitaminës K dhe disfunksionin hepatik.'],
  aptt: ['aPTT normale nuk përjashton sëmundjen von Willebrand ose çrregullim trombocitar.', 'Zgjatja kërkon vlerësim për heparinë, deficit faktorësh ose inhibitorë sipas rastit.'],
  retic: ['Përgjigje e pamjaftueshme e palcës në prani të anemisë.', 'Përgjigje ndaj hemolizës ose humbjes së gjakut, nëse vlerësohet në raport me shkallën e anemisë.'],
  ldh: [null, 'Mund të mbështesë hemolizën me retikulocitozë, bilirubinë indirekte të rritur dhe haptoglobinë të ulët. E izoluar është jospecifike.'],
  haptoglobin: ['Mbështet hemolizën në kombinim me markerët e tjerë. Mund të ulet edhe në sëmundje hepatike.', 'Inflamacioni mund ta rrisë dhe ta maskojë hemolizën.'],
  hsctn: ['Një rezultat i hershëm nën prag nuk e përjashton infarktin. Ndiq kohën e simptomave, EKG-në dhe algoritmin serik të metodës.', 'Tregon dëmtim miokardial. Ndryshimi serik dhe evidenca e ishemisë ndihmojnë të dallohet infarkti nga shkaqe të tjera.'],
  ntprobnp: ['E bën insuficiencën kardiake më pak të mundshme. Obeziteti dhe terapia mund ta ulin vlerën.', 'Mbështet dyshimin për insuficiencë kardiake. Mund të rritet edhe nga fibrilacioni atrial, dëmtimi renal ose embolia pulmonare.'],
  bnp: ['Mund ta bëjë insuficiencën kardiake më pak të mundshme sipas pragut të rrugës diagnostike.', 'Mbështet vlerësimin për insuficiencë kardiake, bashkë me ekzaminimin dhe ekon. Funksioni renal dhe aritmitë mund ta ndikojnë.'],
  lipase: ['Rezultati normal nuk e mbyll hetimin nëse dyshimi klinik është i fortë.', '≥3 herë mbi kufirin e sipërm është një kriter i pankreatitit akut. Duhet edhe dhimbje tipike ose imazheri karakteristike.'],
  hcg: ['Testi shumë i hershëm mund të jetë negativ. Kur dyshimi vazhdon, vlerëso kohën dhe nevojën për matje serike.', 'Mbështet praninë e shtatzënisë. As niveli dhe as dinamika e β-hCG-së e vetme nuk përcaktojnë vendndodhjen.'],
  bloodketones: ['E bën DKA më pak të mundshme nëse pH/bikarbonati janë normalë. Hiperosmolariteti mund të jetë i pranishëm me ketozë të pakët.', 'Tregon ketozë. DKA kërkon edhe acidozë metabolike dhe kriterin glikemik ose diabet të njohur.'],
  bloodgas: ['pH i ulët me bikarbonat të ulët mbështet acidozën metabolike. PaCO₂ i ulët mund të pasqyrojë kompensim ose alkalozë respiratore.', 'pH i rritur tregon alkalemi. PaCO₂ i rritur mund të tregojë hipoventilim. Lloji i mostrës ka rëndësi, sidomos për oksigjenimin.'],
  lactate: ['Vlera normale nuk përjashton sepsën, shokun e hershëm ose isheminë.', 'Mund të sinjalizojë hipoperfuzion ose stres metabolik. Vlerëso edhe konvulsionet, barnat dhe pastrimin hepatik.'],
  dDimer: ['Mund ta përjashtojë tromboembolizmin vetëm brenda algoritmit të validuar, me probabilitet të përshtatshëm dhe prag të metodës.', 'Ka specificitet të ulët. Në algoritmin përkatës çon në imazheri, pa konfirmuar trombozën apo embolinë.'],
  osmolality: ['Osmolaliteti i ulët me natrium të ulët mbështet hiponatreminë hipotonike.', 'Me hiperglikemi të theksuar dhe dehidrim mbështet dyshimin për HHS. Interpreto osmolalitetin efektiv ose total sipas kriterit.'],
  urineculture: ['Kultura negative, sidomos pas antibiotikut, nuk përjashton gjithmonë infeksionin.', 'Identifikon patogjenin dhe ndjeshmërinë. Interpreto simptomat, metodën e marrjes dhe kontaminimin.'],
  bloodculture: ['Hemokulturat negative nuk e përjashtojnë sepsën.', 'Patogjeni i vërtetë orienton burimin dhe përshtatjen e terapisë. Vlerëso mundësinë e kontaminimit.'],
  respiratory: ['Rezultati negativ varet nga koha, mostra dhe patogjenët e përfshirë.', 'Dokumenton patogjenin e testuar. Interpretoje me kohën dhe pasqyrën klinike.'],
  gas: ['Te fëmijët simptomatikë ≥3 vjeç konfirmoje me kulturë sipas CDC. Te të rriturit konfirmimi zakonisht nuk kërkohet rutinë.', 'Mbështet faringjitin streptokoksik në pacientin e përzgjedhur klinikisht.'],
  throatculture: ['E bën GAS më pak të mundshëm me mostër adekuate.', 'Identifikon GAS. Te pacienti me simptoma qartësisht virale merr parasysh bartjen.'],
  ebv: ['Mungesa e VCA IgM mund të kërkojë interpretim sipas kohës dhe profilit të plotë.', 'VCA IgM pozitive me EBNA negative mbështet infeksionin primar. VCA IgG dhe EBNA pozitive zakonisht sugjerojnë infeksion të kaluar.'],
  stoolmicro: ['Panelet negative nuk i përfshijnë domosdoshmërisht të gjithë patogjenët.', 'Identifikimi i një patogjeni vlerësohet me simptomat, epidemiologjinë dhe metodën.'],
  cdiff: ['Me mostër të përshtatshme e bën infeksionin më pak të mundshëm.', 'NAAT pozitiv mund të tregojë kolonizim. Vlerëso diarrenë, toksinën dhe algoritmin e laboratorit.'],
  rf: ['Nuk e përjashton artritin reumatoid te pacienti me sinovit.', 'Mund të mbështesë artritin reumatoid, por shihet edhe në sëmundje të tjera.'],
  ccp: ['Nuk e përjashton artritin reumatoid te pacienti me sinovit.', 'Me sinovit klinik e mbështet artritin reumatoid.'],
  vwf: ['Antigjeni/aktiviteti i ulët mund të mbështesë sëmundjen von Willebrand. Interpreto panelin me hematologjinë.', 'Stresi, inflamacioni dhe shtatzënia mund ta rrisin vWF dhe ta maskojnë deficitin.'],
  urate: ['Urati normal/i ulët gjatë krizës nuk e përjashton gihtin. Në dyshim, përsërite pas qetësimit të krizës.', 'Hiperuricemia mbështet gihtin në kontekst tipik. Vlera e vetme nuk vendos diagnozën.'],
  cholesterol: ['Interpretoje me fraksionet dhe gjendjen ushqyese ose sëmundjen akute.', 'Vlerëso LDL, HDL, trigliceridet dhe rrezikun e përgjithshëm kardiovaskular.'],
  ldl: ['Krahasoje me objektivin individual dhe terapinë e përdorur.', 'Rrit rrezikun aterosklerotik. Objektivi varet nga rreziku dhe parandalimi primar/sekondar.'],
  hdl: ['Shpesh shoqëron rrezik më të lartë kardiometabolik.', 'Interpretoje në profilin e plotë. HDL i lartë nuk e anulon rrezikun nga LDL.'],
  triglycerides: [null, 'Vlerëso agjërimin, glikeminë, alkoolin dhe barnat. Vlerat shumë të rritura shoqërohen me rrezik pankreatiti.'],
};

const QUALITATIVE = new Set(['urine','nitrites','urineSediment','urineProtein','urineculture','bloodculture','respiratory','gas','throatculture','ebv','stoolmicro','cdiff','rf','ccp']);

function labFindings(key, override) {
  const [low, high] = override || FINDINGS[key] || [];
  const [lowLabel, highLabel] = QUALITATIVE.has(key)
    ? ['Negativ / pa gjetje', 'Pozitiv / me gjetje']
    : ['I ulët / nën prag', 'I lartë / mbi prag'];
  return [
    low && {label:lowLabel, text:low, direction:'low'},
    high && {label:highLabel, text:high, direction:'high'},
  ].filter(Boolean);
}

module.exports = { labFindings };
