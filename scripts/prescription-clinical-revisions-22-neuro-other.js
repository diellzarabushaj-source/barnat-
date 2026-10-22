'use strict';
module.exports=({save,reference,drug,care,opt,group,one})=>{
 const R={seizure:'https://www.rch.org.au/afebrile_seizures/',febrile:'https://www.rch.org.au/clinicalguide/guideline_index/Febrile_seizure/',epilepsy:'https://www.nice.org.uk/guidance/ng217/chapter/treating-epileptic-seizures-in-children-young-people-and-adults',meningitis:'https://www.nice.org.uk/guidance/ng240/chapter/Recommendations',rhf:'https://www.who.int/publications/i/item/9789240100077',autism:'https://www.nice.org.uk/guidance/cg170/chapter/Recommendations',cp:'https://www.nice.org.uk/guidance/cg145/chapter/Recommendations',psgn:'https://www.rch.org.au/clinicalguide/guideline_index/Post-streptococcal_glomerulonephritis_(PSGN)/',scabies:'https://www.cdc.gov/scabies/hcp/clinical-care/index.html',impetigo:'https://www.nice.org.uk/guidance/ng153/chapter/Recommendations',rabies:'https://www.cdc.gov/rabies/hcp/clinical-care/post-exposure-prophylaxis.html',tetanus:'https://www.cdc.gov/tetanus/hcp/clinical-care/index.html',wound:'https://www.cdc.gov/tetanus/hcp/clinical-guidance/index.html'};
 reference('22.68','Status epileptik pediatrik · trajtim me faza',[
  'Krizë ≥5 minuta ose kriza pa rikthim ndërgjegjeje: ABC, glukozë, monitorim dhe ekip urgjence. Numëro edhe dozat e benzodiazepinës të dhëna para mbërritjes; maksimumi dy doza të përshtatshme para kalimit në linjën tjetër sipas protokollit.',
  'Zgjidh një benzodiazepinë me rrugë/formulim konkret; midazolam bukal, diazepam rektal dhe preparati IV nuk ndërrohen me të njëjtin vëllim. Mos përdor ampulën IV rektalisht pa protokoll të posaçëm.',
  'Pas dështimit zgjidh një ngarkesë të linjës së dytë dhe eskalo në PICU. Phenytoin kërkon ECG/shpejtësi të kontrolluar, valproate ka kufizime hepatike/mitokondriale dhe riprodhuese; jo të gjitha bashkë rutinë.',
  'Infuzioni i glukozës shprehet mg/kg/min, JO mL/kg/min; përqendrimet 10%, 12,5% dhe 25% japin sasi të ndryshme glukoze. Anestezia/propofol nuk janë recetë ambulatore.'
 ],[R.seizure,'https://www.nice.org.uk/guidance/ng217/chapter/Treating-status-epilepticus-repeated-or-cluster-seizures-and-prolonged-seizures'],'Ndan fazat, rrugët dhe njësitë; heq eskalimin e pakushtëzuar.');
 save('22.69','Konvulsion febril i thjeshtë · vlerësim dhe këshillim',[
  one('Gjatë krizës',care('Pozicion anësor, mat kohën dhe mbroje nga dëmtimi','Mos vendos asgjë në gojë dhe mos e mbaj me forcë. Në zgjatje ≥5 minuta, vështirësi frymëmarrjeje ose mosrikthim kërko urgjencë/trajtim sipas planit.')),
  one('Pas krizës',care('Vlerëso shkakun e etheve dhe rikthimin','Antipiretik për parehati sipas produktit/moshës, jo për të parandaluar krizën. Kriza e parë, mosha jotipike ose shenjat e meningitit kërkojnë vlerësim të drejtpërdrejtë.')),
 ],['Kriza febrile e thjeshtë nuk kërkon rutinë glukozë IV, antibiotik ose antiepileptik afatgjatë. Glukoza korrigjohet kur është e ulët, me preparatin/dozën e duhur.'],[R.febrile],'Heq glukozën dhe antipiretikun IV si hapa automatikë.');
 reference('22.70','Konvulsion febril kompleks · urgjencë sipas ecurisë',[
  'Vlerëso kohëzgjatjen, fokalitetin, përsëritjen dhe rikthimin ndërgjegjes. Kriza aktive ≥5 minuta trajtohet sipas protokollit të statusit, pa pritur efektin e antipiretikut.',
  'Benzodiazepinë sipas peshës/rrugës, me monitorim dhe llogaritjen e dozave paraprake. Pas dy dozave të përshtatshme, linjë e dytë sipas ekipit; jo të gjithë antikonvulsantët si paketë.',
  'Ceftriaxone vetëm për infeksion bakterial të dyshuar/konfirmuar, jo për vetë etiketën “kompleks”. Kërko shenjat e meningitit/encefalitit.'
 ],[R.seizure,R.febrile],'Ndan krizën aktive nga antipiretikët dhe infeksioni.');
 for(const [key,title]of [['22.71','Konvulsione febrile · profilaksi vetëm në raste të zgjedhura'],['22.72','Konvulsione febrile · pa antiepileptik rutinë afatgjatë']])save(key,title,[
  one('Plani familjar',care('Edukimi dhe plani për krizë të zgjatur','Mëso ndihmën e parë, kohëmatjen dhe kur duhet urgjenca. Bar shpëtimi vetëm kur është përshkruar me dozë, rrugë dhe prag të qartë.')),
  one('Ndjekja',care('Rivlerësim pediatrik sipas rrezikut','Fokaliteti, krizat e gjata/të përsëritura ose zhvillimi i prekur kërkojnë vlerësim tjetër. Mos e ndërprit vetë një terapi antiepileptike ekzistuese.')),
 ],['Diazepam gjatë çdo episodi etheje dhe valproate/phenobarbital afatgjatë nuk rekomandohen rutinë për konvulsione febrile të thjeshta. Vendimi për përjashtime merret me specialistin.'],[R.febrile],'Heq profilaksinë universale ndërsa ruan planin e shpëtimit të individualizuar.');
 reference('22.73','Antiepileptikë pediatrikë · fillimi dhe titrimi',[
  'Zgjidh barin sipas llojit të krizës/sindromës, moshës, ndërveprimeve dhe funksionit renal/hepatik. Doza e mirëmbajtjes nuk përdoret si dozë fillestare.',
  'Lamotrigine titrohet ngadalë dhe skema ndryshon me valproate ose induktorë enzimatikë; titrimi i shpejtë rrit rrezikun e rash-it të rëndë. Valproate/topiramate kërkojnë masat përkatëse të sigurisë riprodhuese.',
  'DILANTIN-125 oral është 125 mg/5 mL =25 mg/mL, jo 125 mg/mL. Etiketa pediatrike nis zakonisht 5 mg/kg/DITË në 2–3 marrje, me maksimum fillestar sipas produktit; mos kopjo dozën IV të ngarkesës si mirëmbajtje orale.',
  'Levetiracetam 100 mg/mL është tretësirë orale vetëm kur kështu shkruan në produkt; koncentrati IV 100 mg/mL kërkon hollim/infuzion dhe nuk është i njëjti preparat.'
 ],[R.epilepsy,'https://labeling.pfizer.com/ShowLabeling.aspx?id=560'],'Korrigjon përqendrimin e phenytoin dhe ndan fillimin, mirëmbajtjen e rrugët.');
 for(const [key,title,note]of [
  ['22.74','Epilepsi fokale pediatrike · monoterapi dhe titrim','NICE vendos lamotrigine OSE levetiracetam si zgjedhje të para të përshtatshme për krizat fokale. Mos i shto të gjitha alternativat bashkë; ndërro/shto vetëm sipas përgjigjes dhe specialistit.'],
  ['22.75','Kriza toniko-klonike të gjeneralizuara · regjim i zgjedhur','Lamotrigine, levetiracetam ose valproate zgjidhen sipas sindromës/rreziqeve. Valproate nuk është zgjedhje automatike për çdo fëmijë; zbatohen kufizimet aktuale riprodhuese.'],
  ['22.76','Absenca tipike pediatrike · Ethosuximide si zgjedhje e parë','Për absenca të vetme, ethosuximide është zgjedhja e parë sipas NICE. Në dështim ose kriza të tjera bashkëshoqëruese, alternativa zgjidhet nga neurologu; levetiracetam/valproate nuk janë i njëjti regjim për të gjithë.'],
  ['22.77','Absenca, mioklonike dhe atonike · diagnoza i ndan','Këto lloje krizash nuk kanë të njëjtin trajtim. Ethosuximide trajton absencat, nuk mbulon automatikisht krizat toniko-klonike, mioklonike ose atonike.']
 ])reference(key,title,[note,'Doza fillestare/titrimi kontrollohen me moshën, peshën dhe barnat e tjera. Lamotrigine me valproate kërkon skemë shumë më të ulët/ngadaltë; doza 1–5 mg/kg dy herë/ditë nuk është fillim universal.','Mos ndërprit papritur barnat ekzistuese. Carbamazepine/oxcarbazepine/phenytoin mund të përkeqësojnë disa kriza të gjeneralizuara; vlerëso sindromën para zgjedhjes.'],[R.epilepsy],'Ndan sindromat, monoterapinë dhe titrimin nga listat e barnave.');
 reference('22.78','Meningit bakterial pediatrik · terapi urgjente',[
  'Antibiotik IV sa më shpejt; hemokulturë dhe LP kur janë të sigurta, pa vonuar trajtimin. Neonati, mosha 28 ditë–3 muaj dhe fëmija më i madh kanë regjime të ndryshme.',
  'Ceftriaxone OSE cefotaxime sipas përshtatshmërisë/produktit; amoxicillin/ampicillin për rrezikun Listeria dhe vancomycin për rezistencë vetëm kur indikohen. Ceftriaxone ka kufizime neonatale me bilirubinën/kalciumin.',
  'Dexamethasone kur indikohet: 0,15 mg/kg PËR DOZË çdo 6 orë (0,6 mg/kg/DITË), maksimumi 10 mg PËR DOZË, zakonisht 4 ditë, me ose para antibiotikut. Nën 3 muaj kërko këshillë specialistike; mos vono antibiotikun.',
  'Shoku, konvulsionet dhe glukoza trajtohen veçmas me monitorim. GIR nuk shkruhet mL/kg/min dhe omeprazole 20–40 mg nuk është dozë universale pediatrike.'
 ],[R.meningitis,'https://www.royaldevon.nhs.uk/media/mcjdb4om/antimicrobial-paediatric-summary-ukpas.pdf'],'Korrigjon totalin ditor kundrejt dozës së dexamethasone dhe ndan moshat.');
 reference('22.79','Meningit i konfirmuar · kurs sipas patogjenit',[
  'Përshtat antibiotikun me patogjenin dhe ndjeshmërinë. NICE: meningococcus zakonisht 5 ditë; pneumococcus 10 ditë; H. influenzae tip b 7 ditë me mundësi deri 10 sipas rikuperimit; GBS të paktën 14; Enterobacterales/Listeria zakonisht 21 ditë, me specialistin.',
  'Afatet vlejnë për rikuperim të përshtatshëm pa komplikime; abscesi, ventriculitis ose përgjigjja e dobët mund t’i ndryshojnë. Mos përdor kohëzgjatjen si zëvendësim të dozës/rrugës së plotë.',
  'Vancomycin/aminoglikozidi kërkojnë monitorim të ekspozimit dhe veshkave; objektivi i një trough-i të vetëm nuk vlen universalisht. Planifiko vlerësimin e dëgjimit dhe ndjekjen neurologjike.'
 ],[R.meningitis],'Përditëson afatet patogjen-specifike dhe ruan monitorimin e nevojshëm.');
 reference('22.80','Ethe reumatike · trajtim akut dhe profilaksi veçmas',[
  'Konfirmo diagnozën dhe karditin me ekip pediatrik/kardiologjik. Eradikimi i streptokokut, antiinflamatori dhe profilaksia sekondare kanë role të ndryshme.',
  'Benzathine penicillin G për profilaksi zakonisht IM çdo 3–4 javë sipas protokollit: <27 kg 600 000 njësi; ≥27 kg 1,2 milion njësi. Nuk jepet IV; alergjia e menjëhershme kërkon alternativë të përshtatshme.',
  'Afati i profilaksisë varet nga karditi dhe sëmundja valvulare, jo i njëjtë “10 vjet/21 vjeç” për të gjithë. Aspirin/NSAID/steroidi dhe trajtimi i insuficiencës kardiake individualizohen; jo doza maksimale të të rriturit te çdo fëmijë.'
 ],[R.rhf,'https://www.cdc.gov/group-a-strep/hcp/clinical-guidance/acute-rheumatic-fever.html'],'Ndan profilaksinë nga trajtimi akut dhe kushtëzon kohëzgjatjen.');
 reference('22.81','Hipotiroidizëm pediatrik · Levothyroxine dhe laboratorët',[
  'Hipotiroidizmi kongjenital kërkon fillim të shpejtë nga endokrinologu. Doza fillestare zakonisht 10–15 mikrogramë/kg/DITË për neonatin, me përshtatje sipas rëndesës dhe FT4/TSH.',
  'Fëmijët më të mëdhenj dhe hipotiroidizmi i fituar kanë doza fillestare/titrim tjetër. Shkruaj mikrogramë, jo mg; kontrollo formulimin dhe mënyrën e dhënies.',
  'Jep në mënyrë të qëndrueshme kundrejt ushqimit; hekuri/kalciumi mund të ulin përthithjen dhe ndahen sipas produktit. Kontrollet janë të shpeshta në fillim dhe pas ndryshimit të dozës.'
 ],['https://doi.org/10.1089/thy.2020.0333','https://www.nhs.uk/medicines/levothyroxine/'],'Ndan neonatin nga hipotiroidizmi i fituar dhe mikrogramët nga mg.');
 reference('22.82','Hipertiroidizëm pediatrik · antitiroid dhe monitorim',[
  'Vlerësim endokrinologjik për shkakun/rëndesën. Carbimazole/methimazole titrohet me FT4/FT3; propranolol vetëm për simptoma të përshtatshme, me kujdes në astmë/bradikardi.',
  'Doza antitiroide varet nga pesha dhe rëndesa; dozat fikse të grupmoshës nuk mbivendosen me mg/kg. PTU nuk zgjidhet rutinë te fëmija për shkak të rrezikut hepatik.',
  'Ethet/dhimbja e fytit gjatë antitiroidit kërkojnë ndërprerje dhe kontroll urgjent të neutrofileve sipas udhëzimit; verdhëza ose pruriti i rëndë kërkojnë vlerësim hepatik.'
 ],['https://doi.org/10.1530/ETJ-21-0073'],'Ndan dozën, trajtimin simptomatik dhe alarmet e agranulocitozës.');
 reference('22.83','Autizëm · trajto nevojën konkrete, jo etiketën',[
  'Mbështetja sociale/komunikuese, përshtatja e mjedisit dhe vlerësimi i dhimbjes, gjumit e shëndetit mendor kanë përparësi. SSRI, antipsikotiku dhe methylphenidate nuk trajtojnë rutinë tiparet bazë të autizmit.',
  'Për sjellje sfiduese të rënda, antipsikotiku vetëm kur ndërhyrjet e përshtatshme nuk mjaftojnë ose nuk mund të zbatohen, nga specialisti. Përcakto objektivin, monitoro peshën/metabolizmin/EPS; kontroll pas 3–4 javësh dhe ndal në mungesë përgjigjeje domethënëse deri 6 javë.',
  'ADHD, ankthi dhe depresioni kanë diagnozë/regjim të veçantë. Escitalopram 10 mg/mL nuk supozohet për çdo shurup; përqendrimi verifikohet para konvertimit.'
 ],[R.autism],'Heq paketën e barnave për autizëm dhe shton objektiv/afate monitorimi.');
 reference('22.84','Paralizë cerebrale · objektiva funksionalë dhe titrim',[
  'Fizioterapi/rehabilitim, pozicionim dhe objektiva të përcaktuar për dhimbjen, spasticitetin, ushqyerjen dhe pjesëmarrjen. Baclofen nis ulët e titrohet sipas tolerancës; nuk ndërpritet papritur.',
  'Botulinum toxin A kërkon specialist; njësitë e produkteve të ndryshme nuk janë të këmbyeshme. Sialorrea, rigiditeti dhe epilepsia trajtohen veçmas sipas indikacionit.',
  'Piracetam/citicoline dhe suplementet nuk janë paketë rutinë për çdo fëmijë me CP. Tableta 10 mg nuk është e barabartë me dozën e nevojshme; verifiko formulimin pediatrik.'
 ],[R.cp,'https://www.nice.org.uk/guidance/ng62/chapter/Recommendations'],'Ndan simptomat, titrimin dhe njësitë e toksinës botulinike.');
 save('22.85','Paralizë faciale pediatrike · mbro syrin',[
  one('Syri që nuk mbyllet',care('Lubrifikim okular dhe mbrojtje gjatë gjumit','Përdor pika/pomadë okulare të përshtatshme dhe teknikë mbylljeje të sigurt sipas ekipit. Dhimbja, skuqja ose shikimi i prekur kërkojnë oftalmolog.')),
  one('Diagnoza',care('Përjashto shkakun tjetër të dobësisë faciale','Vlerëso shenjat neurologjike, otitin, vezikulat/Ramsay Hunt dhe faktorë të tjerë. Fillimi jotipik ose deficite shtesë kërkojnë vlerësim urgjent.')),
 ],['Përfitimi i steroidit te fëmijët me Bell nuk është i qartë; vendoset pas vlerësimit. Acyclovir/valacyclovir nuk shtohen rutinë pa dyshim herpetik; doza e varicelës nuk bartet si skemë universale.'],['https://pch.health.wa.gov.au/For-health-professionals/Emergency-Department-Guidelines/Facial-weakness-and-Bells-palsy'],'Ruhet kujdesi i syrit dhe heq steroidin/antiviralët universalë.');
 reference('22.86','Glomerulonefrit post-streptokokal · bilanc dhe tension',[
  'Monitoro peshën, diurezën, tensionin sipas percentilave, kreatininën dhe elektrolitet. Lëngjet/kripa kufizohen sipas sipërfaqes trupore, perfuzionit dhe edemës; jo kufi universal 2 L te çdo fëmijë.',
  'Për mbingarkesë të përshtatshme, RCH përdor furosemide 0,5–1 mg/kg PËR DOZË, maksimumi 40 mg, oral/IV çdo 12 orë me rivlerësim; nuk përdoret maksimumi 600 mg/ditë i të rriturit.',
  'Hipertensioni i rëndë, edema pulmonare, hiperkalemia ose oliguria kërkojnë spital/nefrolog. ACE inhibitor/ARB nuk fillohen si listë universale në dëmtim akut renal; trajto infeksionin streptokokal aktiv kur indikohet.'
 ],[R.psgn],'Korrigjon dozat/kufirin e lëngjeve të të rriturit dhe individualizon antihipertensivët.');
 save('22.87','Zgjebe pediatrike · trajto edhe kontaktet',[
  one('Trajtimi lokal',drug('Permethrin · krem 5%','Shtresë e hollë në zonat e rekomanduara','Një aplikim, lahet pas 8–14 orësh','Përsëritje rreth ditës 7 sipas vlerësimit','Në lëkurë','Te fëmijët e vegjël trajto edhe kokën/qafën sipas udhëzimit, duke shmangur sytë/gojën. Riapliko në duar nëse lahen gjatë intervalit.')),
  one('Kontaktet',care('Trajtim i njëkohshëm i kontakteve të afërta','Laj/izolo veshjet dhe shtrojat sipas udhëzimit. Pruriti mund të vazhdojë disa javë; tunele të reja kërkojnë rivlerësim.')),
 ],['Për ≥2 muaj sipas CDC; nën këtë moshë kërko trajtim të përshtatur. Antihistaminiku, kur nevojitet, zgjidhet sipas produktit/moshës dhe nuk e trajton vetë parazitin.'],[R.scabies,'https://www.health.nsw.gov.au/environment/pests/parasites/Pages/scabies.aspx'],'Ndan trajtimin antiparazitar nga kruarja dhe përfshin kontaktet.',{confirmation:'Zgjebe e vlerësuar te fëmija ≥2 muaj; zona e aplikimit, produkti dhe trajtimi i kontakteve janë përcaktuar.'});
 reference('22.88','Impetigo pediatrike · lokal OSE oral sipas përhapjes',[
  'Vlerëso bullat, përhapjen dhe gjendjen sistemike. Për formë të kufizuar jo-buloze, trajtim lokal i përshtatshëm; për të përhapur/buloze ose gjendje të rënduar, antibiotik oral sipas moshës/alergjisë.',
  'NICE përdor zakonisht kurs 5-ditor me zgjatje deri 7 kur indikohet. Nuk jepet rutinë antibiotik lokal EDHE oral; përsëritjet kërkojnë kulturë/rezistencë dhe rivlerësim.',
  'MRSA kërkon këshillë mikrobiologjike. Amoxicillin/clavulanate me formulime/raporte të ndryshme nuk dozohet nga shuma e dy përbërësve pa specifikuar komponentin.'
 ],[R.impetigo],'Ndan rrugët, kohëzgjatjen dhe mbulimin MRSA.');
 reference('22.89','Kafshim kafshe · plagë, rabie dhe tetanus veçmas',[
  'Laj/shpëlaj plagën me ujë e sapun të paktën 15 minuta dhe kërko menjëherë vlerësim të rrezikut të rabies nga ekipi i shëndetit publik.',
  'CDC për të pavaksinuarin: HDCV/PCECV 1 mL IM ditët 0, 3, 7, 14; dita 28 për imunosupresion sipas protokollit. Te i vaksinuari më parë zakonisht ditët 0 dhe 3, pa HRIG. Jo injeksion gluteal.',
  'HRIG 20 IU/kg llogaritet në IU, pastaj në mL sipas produktit; infiltrim në/afër plagës dhe pjesa tjetër sipas protokollit. Nuk ndahet shiringa/vendi i dozës së parë të vaksinës. Skemat WHO ID dhe vaksinat me vëllim tjetër nuk përzihen me skemën CDC.',
  'Vlerëso tetanosin dhe indikacionin e antibiotikut të plagës veçmas. Ketorolac 15–30 mg i të rriturit nuk është dozë universale pediatrike.'
 ],[R.rabies,'https://www.cdc.gov/han/php/notices/han00533.html','https://www.nice.org.uk/guidance/ng184/chapter/Recommendations'],'Korrigjon vëllimin e vaksinës, produktin e imunoglobulinës dhe degët e vaksinimit.');
 reference('22.90','Tetanus klinik pediatrik · urgjencë intensive',[
  'Sigurimi i rrugës/frymëmarrjes, kontrolli i spazmave dhe disautonomisë, kujdesi i plagës dhe antibiotiku bëhen nga ekip spitalor intensiv.',
  'CDC rekomandon TIG 500 IU IM një herë për trajtimin e tetanosit klinik. 250 IU është dozë profilaksie plage sipas indikacionit dhe nuk është e njëjta skemë. TIG IM nuk përdoret automatikisht IV ose intratekal.',
  'Sëmundja nuk jep imunitet; planifiko vaksinimin me preparatin për moshën, në vend të veçantë. Sedativët, relaksantët dhe infuzionet kërkojnë monitorim dhe doza të titruara.'
 ],[R.tetanus,'https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-21-tetanus.html'],'Ndan trajtimin 500 IU nga profilaksia 250 IU.');
 reference('22.91','Plagë · profilaksi tetanusi sipas historisë',[
  'Pastro plagën dhe përcakto nëse është e pastër/e vogël apo e ndotur/e madhe. Verifiko dozat dhe datën e vaksinës së fundit; zgjidh formulimin sipas moshës.',
  'Me seri të plotë: për plagë të pastër/e vogël përforcues kur kanë kaluar ≥10 vjet; për plagë të ndotur/e madhe kur ≥5 vjet. Histori e panjohur/seri jo e plotë kërkon vaksinim dhe plotësim serie.',
  'TIG nuk indikohet për plagë të pastër/e vogël. Për plagë të ndotur/e madhe me histori të panjohur/jo të plotë, ose në HIV/imunodeficiencë të rëndë sipas CDC: TIG 250 IU IM kur indikohet, veçmas nga vaksina. Antibiotiku nuk jepet vetëm për parandalimin e tetanosit.'
 ],[R.wound],'Saktëson pragjet, kategoritë e plagës dhe rolin e TIG.');
};
