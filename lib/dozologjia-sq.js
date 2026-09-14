'use strict';
/*
 * Dozologjia — the Albanian layer.
 *
 * Master v2.7 stores its clinical text in English shorthand ("q8h", "Renal
 * context must be checked", "PONV prevention/treatment"). None of that is
 * readable at the bedside here, so every string a clinician sees is mapped
 * once, in this file, and the mapping is fail-closed: a published regimen that
 * reaches a string with no Albanian rendering stops the module from loading
 * rather than leaking English into the page.
 *
 * Nothing here changes a dose. Numbers, limits and gates stay exactly as the
 * source recorded them; only their wording is translated.
 */

const INDICATIONS = {
  IND001:'Arrest kardiak',
  IND002:'Anafilaksë',
  IND003:'Bradikardi me shenja të rënda',
  IND006:'Fibrilacion ventrikular që s’përgjigjet pas goditjeve',
  IND008:'Urgjencë hipertensive',
  IND014:'Dhimbje pas operacionit — kur jepet rektal',
  IND016:'Dhimbje e mesme deri e fortë',
  IND018:'Temperaturë ose dhimbje e lehtë',
  IND019:'Temperaturë ose dhimbje',
  IND022:'Të përziera dhe të vjella',
  IND025:'Spazëm i barkut, veshkave ose tëmthit',
  IND026:'Të vjella pas operacionit',
  IND027:'Të vjella pas operacionit te fëmijët',
  IND028:'Edemë ose ascit nga zemra apo mëlçia',
  IND029:'Edemë akute e mushkërive',
  IND031:'Rimbushje me lëngje në venë',
  IND033:'Hipoglikemi e rëndë',
  IND036:'Sinuzit bakterial akut',
  IND037:'Otit i mesëm akut',
  IND038:'Bajame streptokoksike, bronkit i acaruar ose pneumoni e komunitetit',
  IND039:'Infeksione të zakonshme — doza standarde',
  IND040:'Infeksione që kërkojnë dozë më të lartë (otit, sinuzit, mushkëri, urinare)',
  IND043:'Infeksione të frymëmarrjes, ORL ose të lëkurës',
  IND045:'Infeksion anaerob',
  IND048:'Bajame/faringjit ose sinuzit bakterial',
  IND049:'Otit i mesëm ose infeksion më i rëndë',
  IND050:'Cistit — infeksion i fshikëzës',
  IND051:'Pielonefrit — infeksion i veshkës',
  IND053:'Keratit nga herpes simplex',
  IND054:'Infeksion mykotik i lëkurës',
  IND055:'Kandidiazë e gojës',
  IND058:'Konjunktivit bakterial akut',
  IND060:'Mungesë e vitaminës C (skorbut)',
  IND061:'Mungesë e vitaminës B6',
  IND062:'Neurit periferik nga izoniazidi',
};

/* short = what fits on a chip, long = what the prescription line says. */
const ROUTES = {
  PO:{ short:'Nga goja', long:'nga goja' },
  IV:{ short:'Në venë', long:'në venë' },
  IM:{ short:'Në muskul', long:'në muskul' },
  IV_IO:{ short:'Në venë / intraoseal', long:'në venë ose intraoseal' },
  RECTAL:{ short:'Rektal', long:'rektal' },
  OPHTHALMIC:{ short:'Në sy', long:'në sy' },
  TOPICAL:{ short:'Në lëkurë', long:'në lëkurë' },
  ORAL_LOCAL:{ short:'Në gojë, lokalisht', long:'në gojë, lokalisht' },
};

const POPULATIONS = {
  'Adult':'I rritur',
  'Adult / >12y':'I rritur / mbi 12 vjeç',
  'Adult / ≥12y in referenced label':'I rritur / 12 vjeç e lart sipas etiketës së burimit',
  'Adult/Pediatric product age':'I rritur / fëmijë sipas moshës së produktit',
  'Adult/adolescent >12':'I rritur / adoleshent mbi 12 vjeç',
  'Adult/selected pediatric by specialist':'I rritur / fëmijë vetëm me specialist',
  'Adult/≥40 kg':'I rritur / mbi 40 kg',
  'Adult/≥45 kg':'I rritur / mbi 45 kg',
  'Age per product (commonly ≥2y)':'Mosha sipas produktit — zakonisht 2 vjeç e lart',
  'Age ≥2y/adult':'2 vjeç e lart / i rritur',
  'Pediatric':'Fëmijë',
  'Pediatric 1mo–17y':'Fëmijë 1 muajsh–17 vjeç',
  'Pediatric 6–12y':'Fëmijë 6–12 vjeç',
  'Pediatric <40 kg':'Fëmijë nën 40 kg',
  'Pediatric >3 mo':'Fëmijë mbi 3 muajsh',
};

const FREQUENCIES = {
  '2–3 divided doses':'e ndarë në 2–3 doza',
  '3–4x/day if ointment alone':'3–4 herë në ditë nëse përdoret vetëm pomada',
  '5x/day about q4h':'5 herë në ditë, rreth çdo 4 orë',
  'After 3 shocks; additional 150 mg after 5 shocks':'pas 3 goditjeve; edhe 150 mg pas 5 goditjeve',
  'BID':'2 herë në ditë',
  'Divided doses — exact split not specified by SmPC':'e ndarë në disa doza — burimi nuk e cakton ndarjen',
  'If inadequate, repeat after 30–60 min; may double':'nëse s’mjafton, përsërit pas 30–60 min; doza mund të dyfishohet',
  'May repeat after 30 min':'mund të përsëritet pas 30 min',
  'Once; repeat according to glucose/clinical response':'një herë; përsërit sipas glikemisë dhe gjendjes',
  'Over <15 min; reassess':'për më pak se 15 min, pastaj rivlerëso',
  'QID after meals':'4 herë në ditë, pas ushqimit',
  'Repeat after 5 min if no improvement':'përsërit pas 5 min nëse s’ka përmirësim',
  'Repeat at appropriate interval if needed':'përsërit në interval të përshtatshëm nëse duhet',
  'Single dose':'një dozë e vetme',
  'Single slow IV dose':'një dozë e vetme, ngadalë në venë',
  'TID':'3 herë në ditë',
  'Then 40–80 mg q10 min as needed':'pastaj 40–80 mg çdo 10 min sipas nevojës',
  'Up to TID; ≥6 h between doses':'deri 3 herë në ditë, së paku 6 orë mes dozave',
  'q12h':'çdo 12 orë',
  'q24h':'çdo 24 orë',
  'q24h in referenced injection product':'çdo 24 orë sipas produktit të injeksionit të referuar',
  'q3–5 min':'çdo 3–5 minuta',
  'q4–6h':'çdo 4–6 orë',
  'q4–6h PRN':'çdo 4–6 orë sipas nevojës',
  'q6–8h PRN':'çdo 6–8 orë sipas nevojës',
  'q8h':'çdo 8 orë',
};

const DURATIONS = {
  '10–14 days':'10–14 ditë',
  '2–6 weeks; continue ≥1 week after signs/symptoms disappear':'2–6 javë; vazhdo së paku 1 javë pasi shenjat të zhduken',
  '3 days':'3 ditë',
  '5 days':'5 ditë',
  '5 days in referenced products':'5 ditë sipas produkteve të referuara',
  'Acute':'akute',
  'Acute/response-based':'akute — sipas përgjigjes',
  'As clinically required':'sa të kërkojë gjendja klinike',
  'Cardiac arrest':'gjatë arrestit kardiak',
  'Continue at least 3 days after healing':'vazhdo së paku 3 ditë pas shërimit',
  'Continue ≥1 week after symptoms disappear':'vazhdo së paku 1 javë pasi simptomat të zhduken',
  'Guideline/response-based':'sipas udhërrëfyesit dhe përgjigjes',
  'Indication guideline-dependent':'sipas udhërrëfyesit për indikacionin',
  'Indication-dependent':'varet nga indikacioni',
  'Indication/response dependent':'varet nga indikacioni dhe përgjigja',
  'Max 4 days':'maksimumi 4 ditë',
  'Response/indication; review if >14 days':'sipas përgjigjes; rivlerëso nëse kalon 14 ditë',
  'Severe infection example: 10 days in SmPC':'shembull për infeksion të rëndë: 10 ditë sipas SmPC-së',
  'Short course':'kurs i shkurtër',
  'Shortest necessary':'sa më shkurt që të jetë e mundur',
  'Single dose':'një dozë e vetme',
  'Until ROSC / resuscitation termination':'deri në rikthim të qarkullimit ose ndalim të reanimimit',
  'Until response / escalation':'deri në përgjigje ose përshkallëzim',
  'Until response / source-specific':'deri në përgjigje — sipas burimit',
  'Usually 7 days; may extend based on clinical/bacteriological assessment':'zakonisht 7 ditë; mund të zgjatet sipas vlerësimit klinik dhe bakteriologjik',
  'Usually max 5 days':'zakonisht maksimumi 5 ditë',
};

const SAFETY = {
  'Alcohol/interactions; neuropathy with prolonged use':'Alkooli dhe ndërveprimet; neuropati me përdorim të zgjatur.',
  'Avoid asthma/bronchospasm, bradycardia, AV block, decompensated HF, shock':'Shmang te astma ose bronkospazma, bradikardia, blloku AV, insuficienca e dekompensuar e zemrës dhe shoku.',
  'Avoid duplicate paracetamol-containing products':'Mos jep njëkohësisht produkte të tjera që përmbajnë paracetamol.',
  'Avoid fluid overload':'Ruaju nga mbingarkesa me lëngje.',
  'Avoid in high-degree AV block with wide QRS; not for transplant bradycardia':'Shmang te blloku AV i shkallës së lartë me QRS të gjerë; nuk vlen për bradikardi pas transplantit të zemrës.',
  'Avoid in significant dehydration/renal disease/NSAID contraindications':'Shmang te dehidrimi i theksuar, sëmundjet e veshkave dhe kundërindikacionet e NSAID-ve.',
  'Balanced fluid may be preferred in many contexts':'Në shumë situata preferohet tretësira e balancuar.',
  'Deficiency indication only':'Vetëm për mungesë të vërtetuar.',
  'Do not automatically co-prescribe potassium':'Mos shto kalium automatikisht.',
  'Do not use for non-bacterial/red-flag eye disease':'Mos e përdor për sëmundje jobakteriale të syrit ose me shenja alarmi.',
  'EPS/dystonia risk; slow IV ≥3 min':'Rrezik për distoni dhe simptoma ekstrapiramidale; në venë jepe ngadalë, së paku 3 minuta.',
  'Exact 2% product':'Vetëm produkti 2%.',
  'Exact formulation required':'Kërkohet pikërisht ai formulim.',
  'Exact ratio required':'Kërkohet pikërisht ai raport.',
  'Give IV slowly':'Jepe ngadalë në venë.',
  'History of co-amox cholestatic jaundice/hepatic dysfunction':'Kujdes nëse ka pasur verdhëz kolestatike ose dëmtim të mëlçisë nga co-amoxiclav.',
  'Hypertonic tissue-injury risk':'Tretësirë hipertonike — rrezik dëmtimi i indeve.',
  'IM first-line; IV adrenaline only by experienced specialists':'Në muskul si zgjedhje e parë; adrenalina në venë vetëm nga specialistë me përvojë.',
  'Keep gel in mouth before swallowing':'Mbaje xhelin në gojë para se ta gëlltitësh.',
  'No diazepam-withdrawal indication':'Nuk ka indikacion për tërheqje nga diazepami.',
  'Penicillin allergy':'Alergjia ndaj penicilinës.',
  'Respiratory depression, seizures, serotonin syndrome':'Depresion i frymëmarrjes, konvulsione, sindromë serotoninergjike.',
  'Resuscitation algorithm':'Sipas algoritmit të reanimimit.',
  'Resuscitation algorithm only':'Vetëm sipas algoritmit të reanimimit.',
  'Slow IV if IV':'Nëse jepet në venë, jepe ngadalë.',
  'Stewardship and susceptibility':'Përdorim racional dhe ndjeshmëria e mikrobit.',
  'Stewardship/resistance':'Përdorim racional dhe rezistenca.',
  'Tablet/suspension not mg-for-mg substitutable':'Tableta dhe suspensioni nuk zëvendësohen mg për mg.',
  'Use child-appropriate suppository strength':'Përdor supozitor me fuqi të përshtatshme për fëmijë.',
  'Use exact eye ointment product':'Përdor pikërisht atë pomadë për sy.',
};

/* A gate is a yes/no the clinician confirms, so it reads as a short statement. */
const GATES = {
  'Renal context must be checked before adjustment/output.':'Funksioni i veshkave është kontrolluar.',
  'Hepatic context applies.':'Funksioni i mëlçisë është marrë parasysh.',
  'QT-risk review/monitoring applies.':'Rreziku për zgjatje të QT-së është vlerësuar.',
  'Specialist/protocol context required.':'Ka specialist ose protokoll përkatës.',
  'Exact product/formulation must be selected.':'Është zgjedhur produkti i saktë.',
  'ECG/BP':'Ka monitorim të EKG-së dhe tensionit.',
  'BP/HR monitoring':'Ka monitorim të tensionit dhe pulsit.',
  'Renal/electrolytes/volume':'Ka monitorim të veshkave, elektroliteve dhe volumit.',
  'Glucose monitoring':'Ka monitorim të glikemisë.',
  'For patients ≥12 years use a central vein or large peripheral vein; for 2–11 years the referenced D50 label specifies central venous administration. Consider a lower-concentration dextrose product if appropriate access is unavailable.':
    'Rruga venoze është e përshtatshme: te 12 vjeç e lart venë qendrore ose venë e madhe periferike, te 2–11 vjeç etiketa e referuar kërkon venë qendrore. Nëse s’ka qasje të tillë, përdor dekstrozë me përqendrim më të ulët.',
  'Referenced D50 label: infuse slowly; maximum dextrose administration rate without hyperglycaemia is 0.5 g/kg/hour.':
    'Jepet ngadalë: etiketa e referuar cakton maksimumi 0,5 g/kg në orë.',
  'Do not release oral miconazole gel when liver dysfunction is present; the referenced SmPC lists liver dysfunction as a contraindication.':
    'Nuk ka dëmtim të mëlçisë — SmPC-ja e referuar e liston si kundërindikacion për xhelin oral të mikonazolit.',
  'Run product interaction review before oral miconazole: the referenced SmPC contraindicates several CYP3A4/QT-sensitive medicines and certain statins/ergot agents.':
    'Ndërveprimet janë kontrolluar: SmPC-ja e referuar kundërindikon disa barna që ndikojnë CYP3A4-në ose QT-në, statina të caktuara dhe preparatet e ergotit.',
  'Do not release if there is prior chloramphenicol-associated myelosuppression or a personal/family history of blood dyscrasia per the referenced ophthalmic SmPC.':
    'S’ka pasur mielosupresion nga kloramfenikoli dhe s’ka histori personale apo familjare të diskrazive të gjakut.',
  'Use caution in underlying renal failure/hyperoxaluria because of oxalate stone risk.':
    'Është marrë parasysh rreziku për gurë oksalati te insuficienca renale ose hiperoksaluria.',
  'High doses of ascorbic acid have caused haemolysis in G6PD deficiency; assess risk before parenteral high-dose use.':
    'Rreziku i hemolizës te mungesa e G6PD është vlerësuar para dozës së lartë parenterale.',
  'Long-term administration of large pyridoxine doses is associated with severe peripheral neuritis; do not exceed the source-defined regimen/duration without review.':
    'Doza të mëdha piridoksine për kohë të gjatë japin neurit periferik të rëndë — skema dhe kohëzgjatja e burimit nuk tejkalohen pa rivlerësim.',
  'Pyridoxine may reduce levodopa effect unless a dopa-decarboxylase inhibitor is also given; review concomitant therapy.':
    'Terapia shoqëruese është shqyrtuar: piridoksina e dobëson levodopën nëse nuk jepet edhe një frenues i dopa-dekarboksilazës.',
};

/* INN names stay as the source wrote them; only what genuinely reads as
   English rather than as a substance name is rendered in Albanian. */
const DRUGS = {
  D025:'Natrium klorid 0,9%',
  D027:'Dekstrozë 50%',
  D028:'Kristaloid i balancuar / Ringer laktat',
  D042:'Kloramfenikol për sy',
};

/* Ceilings, sequence steps and parenteral preparation notes are stored as
   free text by the source, so each stored string is mapped exactly once. */
const MAXIMA = {
  '100 mg/day':'100 mg në ditë',
  '125 mg/dose in referenced pediatric table':'125 mg për dozë sipas tabelës pediatrike të referuar',
  '150 mg/day in referenced tablet row':'150 mg në ditë sipas rreshtit të tabletës së referuar',
  '150 mg/day in source row':'150 mg në ditë sipas rreshtit të burimit',
  '1500 mg/day typical':'zakonisht 1500 mg në ditë',
  '250 mg/dose':'250 mg për dozë',
  '3 mg total':'3 mg gjithsej',
  '30 mg/day':'30 mg në ditë',
  '30 mg/kg/day':'30 mg/kg në ditë',
  '300 mg total':'300 mg gjithsej',
  '4 mg':'4 mg',
  '400 mg/day':'400 mg në ditë',
  '500 mg/day':'500 mg në ditë',
};

const STEPS = {
  'After 3 shocks':'Pas 3 goditjeve',
  'After 5 shocks':'Pas 5 goditjeve',
  'As needed':'Sipas nevojës',
  'Day 1':'Dita 1',
  'Days 2–5':'Ditët 2–5',
  'If inadequate response':'Nëse përgjigja s’mjafton',
  'Initial bolus':'Bolusi i parë',
  'Initial dose':'Doza e parë',
};

const STEP_NOTES = {
  'May double per clinical response/source.':'Doza mund të dyfishohet sipas përgjigjes klinike dhe burimit.',
  'Over 2 min.':'Jepe brenda 2 minutave.',
  'q10 min; respect total max 300 mg.':'Çdo 10 minuta; mos e kalo totalin 300 mg.',
  'q24h':'Çdo 24 orë.',
};

const PREPARATIONS = {
  '50% dextrose = 500 mg/mL; infuse slowly.':'Dekstroza 50% = 500 mg/mL; jepe ngadalë.',
  'Bolus stock 5 mg/mL; 20 mg = 4 mL.':'Ampula 5 mg/mL; 20 mg = 4 mL.',
  'Exact 0.1 mg/mL product; volume = dose ÷ 0.1 mg/mL.':'Produkt 0,1 mg/mL; vëllimi = doza ÷ 0,1 mg/mL.',
  'Exact product concentration: 500 mg/5 mL = 100 mg/mL.':'Përqendrimi i produktit: 500 mg/5 mL = 100 mg/mL.',
  'Prefilled 0.1 mg/mL product.':'Shiringë e mbushur 0,1 mg/mL.',
  'Ready 20 mg/mL IM solution.':'Tretësirë e gatshme 20 mg/mL për në muskul.',
  'Ready 20 mg/mL; IV injection slowly.':'Tretësirë e gatshme 20 mg/mL; në venë ngadalë.',
  'Ready 500 mg/100 mL infusion (5 mg/mL); infuse over 20–60 min.':'Infuzion i gatshëm 500 mg/100 mL (5 mg/mL); jepe për 20–60 minuta.',
  'Use exact 1 mg/mL product undiluted IM.':'Përdor produktin 1 mg/mL të paholluar, në muskul.',
};

const PREPARATION_NOTES = {
  'Anaphylaxis IM; never substitute for CPR concentration.':'Për anafilaksë, në muskul; kurrë mos e ndërro me përqendrimin e reanimimit.',
  'CPR: 1 mg = 10 mL; not for IM anaphylaxis.':'Për reanimim: 1 mg = 10 mL; nuk përdoret për anafilaksë në muskul.',
  'Current SmPC says not less than 20 min, normally about 1 hour.':'SmPC-ja aktuale kërkon jo më pak se 20 minuta, zakonisht rreth 1 orë.',
  'Hypertonic IV product; exact vascular-access rules apply. Referenced label maximum dextrose rate: 0.5 g/kg/h.':'Produkt hipertonik për në venë; rregullat e qasjes vaskulare vlejnë pikë për pikë. Etiketa e referuar cakton maksimumi 0,5 g/kg në orë.',
  'IV/IO route is controlled by the resuscitation regimen; concentration by exact product label.':'Rruga në venë ose intraoseale caktohet nga skema e reanimimit; përqendrimi nga etiketa e produktit.',
  'No universal administration time is invented; apply product/clinical context and safety gates.':'Nuk shpiket kohë universale e dhënies; zbato kontekstin e produktit, atë klinik dhe kushtet e sigurisë.',
  'Same stock supports 40/80 mg escalation.':'E njëjta ampulë mbulon edhe përshkallëzimin 40/80 mg.',
};

/* Units and dosage forms as a clinician says them. A product's own name is
   left exactly as the source recorded it — it identifies a real product, and
   renaming it would be a provenance error — but its form is read, not cited. */
const UNITS = {
  mg:'mg', mcg:'mcg', g:'g', mL:'mL',
  'tabletë':'tabletë',
  application:'aplikim',
  cm_ribbon:'cm shirit',
};

const FORMS = {
  'Solution for injection':'Tretësirë për injeksion',
  'Solution for infusion':'Tretësirë për infuzion',
  'Concentrate for injection/infusion':'Koncentrat për injeksion ose infuzion',
  'Prefilled syringe':'Shiringë e mbushur',
  'Eye ointment':'Pomadë për sy',
  'Oral gel':'Xhel oral',
  'Cream':'Krem',
  'Tablet':'Tabletë',
  'Film-coated tablet':'Tabletë e veshur me film',
};

/* A local application has no number to compute, so the source's own sentence
   is the whole answer and has to read as one. */
const LOCAL_DOSES = {
  'Apply enough cream to cover the lesion; rub in':'Shtro krem sa të mbulojë vendin e prekur dhe fërkoje lehtë.',
};

module.exports = { INDICATIONS, ROUTES, POPULATIONS, FREQUENCIES, DURATIONS, SAFETY, GATES, DRUGS, MAXIMA, STEPS, STEP_NOTES, PREPARATIONS, PREPARATION_NOTES, UNITS, FORMS, LOCAL_DOSES };
