'use strict';
module.exports=({save,reference,drug,care,opt,group,one})=>{
 const R={typhoid:'https://www.cdc.gov/typhoid-fever/hcp/clinical-guidance/index.html',malaria:'https://www.who.int/publications/i/item/guidelines-for-malaria',tb:'https://www.who.int/publications/i/item/9789240046764',varicella:'https://www.cdc.gov/chickenpox/hcp/clinical-guidance/index.html',mumps:'https://www.cdc.gov/mumps/php/public-health-strategy/index.html',measles:'https://www.cdc.gov/measles/hcp/clinical-overview/index.html',hp:'https://onlinelibrary.wiley.com/doi/10.1002/jpn3.12314',uti:'https://www.nice.org.uk/guidance/ng109/chapter/Recommendations',pyelo:'https://www.nice.org.uk/guidance/ng111/chapter/Recommendations',iron:'https://www.rch.org.au/clinicalguide/guideline_index/iron_deficiency/',vitd:'https://www.rch.org.au/clinicalguide/guideline_index/Vitamin_D_deficiency/',constipation:'https://www.nice.org.uk/guidance/cg99/chapter/Recommendations',ors:'https://www.nice.org.uk/guidance/cg84/chapter/Recommendations',diarrhoea:'https://www.who.int/publications/i/item/9789240103412',shigella:'https://www.cdc.gov/shigella/hcp/clinical-care/index.html'};
 for(const [key,title,note]of [
  ['22.40','Ethe enterike pediatrike · antibiotik sipas ndjeshmërisë','Për sëmundje jo të rëndë zgjidh trajtim oral me infektologun sipas kulturës, udhëtimit dhe rezistencës. Ciprofloxacin nuk është zgjedhje empirike universale.'],
  ['22.41','Ethe enterike të rënda pediatrike · trajtim spitalor','Shtrim, kultura, hidratim i titruar dhe antibiotik parenteral sipas rezistencës. Ceftriaxone/azithromycin mund të jenë të papërshtatshme në rajone me rezistencë; eskalimi vendoset nga infektologu.']
 ])reference(key,title,[note,'Doza dhe maksimumi përcaktohen sipas peshës/veshkave dhe kursi sipas antibiotikut e komplikimeve. Të vjellat nuk kërkojnë kombinim rutinë të disa antiemetikëve.','Steroidët me doza të larta rezervohen për raste të rënda të përzgjedhura; nuk jepen në çdo temperaturë. Rivlerëso shkakun/komplikimet në mungesë përgjigjeje.'],[R.typhoid],'Heq regjimin universal dhe ndan formën e lehtë nga e komplikuara.');
 reference('22.42','Malaria e ndjeshme ndaj chloroquine · baza dhe kripa',[
  'Konfirmo specien dhe ndjeshmërinë e rajonit; shumë infeksione falciparum janë rezistente. Doza e chloroquine llogaritet si BAZË, jo pesha e kripës phosphate.',
  'Skema CDC kur chloroquine indikohet: 10 mg bazë/kg fillimisht (maksimumi 600 mg bazë), pastaj 5 mg bazë/kg në orët 6, 24 dhe 48 (maksimumi 300 mg bazë secila); gjithsej 25 mg bazë/kg.',
  'Konfirmo sa mg bazë ka tableta ose çdo mL. Malaria e rëndë kërkon trajtim parenteral; kjo skemë nuk e zëvendëson atë.'
 ],['https://www.cdc.gov/malaria/hcp/clinical-guidance/treatment-of-uncomplicated-malaria.html'],'Dallon dozën bazë nga phosphate dhe trajtimin sipas ndjeshmërisë.');
 reference('22.43','Malaria falciparum · ACT sipas peshës/formulimit',[
  'Artemether/lumefantrine 20/120 mg për ≥5 kg: 5–<15 kg 1 tabletë/dozë; 15–<25 kg 2; 25–<35 kg 3; ≥35 kg 4. Marrjet janë 0 dhe 8 orë, pastaj çdo 12 orë për dy ditë; 6 gjithsej.',
  'Merret me ushqim/qumësht kur tolerohet. Suspensioni 15/90 mg për 5 mL nuk këmbehet me tabelën e tabletave pa etiketë të verifikuar; dallohen mg për DOZË nga sasia për DITË.',
  'Nën 5 kg kërko preparatin/protokollin specifik të foshnjës sipas WHO aktuale; mos zbato tabelën e mësipërme. Sëmundja e rëndë ose mosmbajtja e terapisë orale kërkojnë spital.'
 ],[R.malaria,'https://www.cdc.gov/malaria/hcp/clinical-guidance/treatment-of-uncomplicated-malaria.html'],'Heq mbivendosjen në 15 kg dhe ndan suspensionin nga tabletat.');
 reference('22.44','Tuberkuloz pediatrik · regjim sipas rëndesës',[
  'Trajtim nga shërbimi i TB: konfirmo ndjeshmërinë, lokalizimin/rëndesën, HIV dhe peshën. Barnat e fazës së zgjedhur jepen EDHE së bashku; nuk janë alternativa njëra ndaj tjetrës.',
  'Për TB të ndjeshme, WHO përdor zakonisht isoniazid 10 mg/kg/DITË, rifampicin 15, pyrazinamide 35 dhe ethambutol 20, me intervalet/kufijtë sipas udhëzimit. Pesha rivlerësohet gjatë trajtimit.',
  'Fëmijët 3 muaj–16 vjeç me TB jo të rëndë të përzgjedhur mund të kenë regjim 4-mujor; format e tjera zakonisht 6 muaj ose më gjatë. Meningiti/osteoartikularja dhe rezistenca kërkojnë skema të veçanta. FDC-të dhe ndarja e tabletave kontrollohen sipas produktit.'
 ],[R.tb],'Përditëson kursin e përzgjedhur 4-mujor dhe ndan fazat/FDC.');
 reference('22.45','Varicelë · trajtim sipas rrezikut',[
  'Fëmija ndryshe i shëndetshëm me varicelë tipike shpesh kërkon vetëm kujdes simptomatik. Acyclovir/valacyclovir nuk jepen rutinë për të gjithë; rreziku dhe koha nga fillimi përcaktojnë indikacionin.',
  'Kur acyclovir oral indikohet në moshën 2–16 vjeç sipas etiketës: 20 mg/kg PËR DOZË, 4 herë/ditë për 5 ditë, maksimumi 800 mg PËR DOZË. Përshtat veshkat dhe hidratimin; sëmundja e rëndë/imunosupresioni mund të kërkojë IV.',
  'Shmang aspirinën; ibuprofen shmanget kur është e mundur në varicelë. Antibiotik vetëm për infeksion bakterial sekondar të vlerësuar.'
 ],[R.varicella,'https://www.cdc.gov/chickenpox/treatment/index.html','https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=2757bb30-3374-4e1b-b496-14874f7ec623'],'Korrigjon maksimumin për dozë dhe heq antiviralët/antibiotikët rutinë.');
 save('22.46','Shyta · kujdes simptomatik dhe izolim',[
  one('Kujdesi',care('Lëngje, ushqime të buta dhe analgjezi sipas moshës/peshës','Antibiotikët nuk trajtojnë virusin. Dhimbja testikulare, dhimbja e fortë e kokës, qafa e ngrirë ose dehidratimi kërkojnë kontroll.')),
  one('Parandalimi i përhapjes',care('Izolim për 5 ditë pas fillimit të parotitit','Njofto sipas rregullave të shëndetit publik dhe vlerëso vaksinimin e kontakteve për mbrojtjen e ardhshme.')),
 ],['Imunoglobulina dhe MMR nuk ofrojnë profilaksi efektive të episodit të shytave pas ekspozimit; MMR mund të plotësohet për ekspozime të ardhshme sipas programit.'],[R.mumps,'https://www.cdc.gov/mmwr/pdf/rr/rr6007.pdf'],'Heq gamma-globulinën e panevojshme pas ekspozimit.');
 reference('22.47','Fruth · izolim, kujdes dhe vitaminë A e mbikëqyrur',[
  'Izolim respirator dhe njoftim i shëndetit publik; vlerëso pneumoninë, dehidratimin, otitin dhe shenjat neurologjike. Antibiotik vetëm për komplikim bakterial.',
  'Vitamina A nën mbikëqyrje: <6 muaj 50 000 IU; 6–11 muaj 100 000 IU; ≥12 muaj 200 000 IU, nga goja një herë/ditë për 2 ditë. Mungesa e vitaminës A/shenjat okulare mund të kërkojnë dozë shtesë sipas ekipit.',
  'Verifiko përqendrimin e pikave dhe suplementet ekzistuese; dozat e larta nuk janë suplement i përditshëm. Shurupet e kombinuara me dextromethorphan/ephedrine nuk janë trajtim rutinë i fruthit.'
 ],[R.measles],'Ndan dozën e mbikëqyrur të vitaminës A nga suplementimi rutinë.');
 reference('22.48','SSPE · neurologji dhe kujdes multidisiplinar',[
  'Trajtimi është specialistik: kontroll i krizave, spasticitetit, ushqyerjes dhe mbështetje rehabilituese/paliative sipas nevojës.',
  'Antikonvulsanti dhe baclofen zgjidhen/titrohen për simptomën konkrete. Nuk ka një dozë universale për të kopjuar dhe nuk premtohet shërim nga terapia simptomatike.'
 ],['https://www.ninds.nih.gov/health-information/disorders/subacute-sclerosing-panencephalitis'],'Ruhet individualizimi pa shpikur skemë kuruese.');
 for(const [key,title]of [['22.49','H. pylori pediatrik · terapi sipas ndjeshmërisë'],['22.50','H. pylori · formulim pediatrik dhe konfirmim shërimi']])reference(key,title,[
  'Konfirmo indikacionin/diagnozën me gastroenterologun; nuk rekomandohet strategji e përgjithshme “testo dhe trajto” për çdo dhimbje barku.',
  'Regjimi zakonisht 14-ditor përcaktohet nga ndjeshmëria ndaj antibiotikëve, mosha dhe pesha. Clarithromycin nuk përdoret empirikisht kur ndjeshmëria mungon; PPI dhe dy antibiotikët e zgjedhur janë EDHE së bashku.',
  'Famotidine nuk zëvendëson automatikisht PPI në skemën e eradikimit. Planifiko test shërimi me urea breath test ose antigjen fekal monoklonal sipas afatit të udhëzimit; ndërprit PPI/antibiotikët për intervalin përkatës para testit.'
 ],[R.hp],'Korrigjon zgjedhjen empirike, acid-supresorin dhe ndjekjen.');
 reference('22.51','Cistit pediatrik · kulturë dhe kurs i saktë',[
  'Merr urinë sipas moshës para antibiotikut. Ethet/dhimbja e krahut ose gjendja e rënduar kërkojnë vlerësim për pielonefrit; nën 3 muaj referim pediatrik.',
  'Për UTI të poshtme te 3 muaj–11 vjeç, NICE: nitrofurantoin IR 750 mikrogramë/kg PËR DOZË çdo 6 orë për 3 ditë; 12–15 vjeç IR 50 mg çdo 6 orë OSE MR 100 mg çdo 12 orë për 3 ditë. eGFR zakonisht ≥45; mos përdor në mungesë G6PD.',
  'Nitrofurantoin vetëm në mbrëmje është profilaksi tjetër dhe nuk zëvendëson trajtimin akut; nuk trajton pielonefritin. Antibiotikët alternativë, dozat dhe afati zgjidhen sipas kulturës.'
 ],[R.uti,R.pyelo],'Korrigjon profilaksinë e ngatërruar me trajtimin akut.');
 reference('22.52','UTI pediatrik i komplikuar · trajtim i monitoruar',[
  'Shtrim/vlerësim pediatrik, kulturë dhe antibiotik sipas moshës, sepsisit dhe ndjeshmërisë. Aminoglikozidi kërkon nivele dhe funksion renal; nuk shtohet mbi çdo alternativë IV.',
  'Rishiko IV brenda 48 orëve dhe kalo në oral kur përshtatet; afati lidhet me pielonefritin/komplikimet. Neonati ka regjim tjetër; ceftriaxone kërkon kufizime të veçanta me bilirubinën/kalciumin.',
  'Paracetamoli IV dhe lëngjet nuk kanë dozë universale nga shishja e të rriturit; përdor kufijtë sipas peshës dhe bilancit.'
 ],[R.pyelo,'https://www.nice.org.uk/guidance/ng224/chapter/Recommendations'],'Ndan antibiotikët alternativë, aminoglikozidin dhe kufizimet neonatale.');
 reference('22.53','Anemi nga mungesa e hekurit · hekur elementar',[
  'Konfirmo mungesën e hekurit me historinë/hemogramën/ferritinën sipas rastit. Trajtimi oral zakonisht 3–6 mg/kg/DITË HEKUR ELEMENTAR sipas rëndesës dhe produktit.',
  'Shkruaj mg hekur elementar për mL, jo vetëm mg kripë ose “5–10 mL” për çdo shurup. B-complex/folate nuk shtohen pa indikacion.',
  'Kontrollo përgjigjen dhe aderencën; vazhdo zakonisht të paktën 3 muaj pas korrigjimit të anemisë për rezervat. Hekuri mund të japë feçe të errëta/kapsllëk dhe mbahet larg fëmijëve.'
 ],[R.iron],'Korrigjon dozimin me vëllim pa përmbajtje elementare.');
 save('22.54','Pica · vlerëso mungesat dhe ekspozimin',[
  one('Hetimi',care('Vlerëso hekurin, dietën dhe rrezikun nga plumbi','Hemogramë/ferritinë dhe hetime sipas materialit të gëlltitur; vlerëso zhvillimin dhe sjelljen. Dhimbja abdominale/obstruksioni ose helmimi kërkojnë urgjencë.')),
  one('Mbështetja',care('Mjedis i sigurt dhe ndërhyrje sjellore','Korrigjo mungesat e konfirmuara me produkt/dozë të përcaktuar. Shmang aksesin në materiale të rrezikshme.')),
 ],['Kalciumi dhe SSRI nuk janë shtesa rutinë për pica. Hekuri matet si hekur elementar dhe jepet kur indikohet.'],[R.iron,'https://medlineplus.gov/ency/article/001538.htm'],'Heq suplementet/SSRI pa diagnozë.');
 reference('22.55','Mungesë vitamine D · trajtim veçmas nga profilaksia',[
  'Vlerëso 25-OH vitamin D, kalciumin dhe shenjat e rakitit sipas rastit. Doza terapeutike dhe afati varen nga mosha/rëndesa; 400 IU/ditë është shpesh dozë parandaluese, jo trajtim universal i deficitit.',
  'Verifiko IU për PIKË ose mL në produktin konkret dhe të gjitha suplementet e tjera. Preparatet “400 IU/pikë” nuk janë të barabarta me “400 IU/mL”.',
  'Rakit, konvulsione, kalcium anormal ose mosreagim kërkojnë specialist; siguro kalcium adekuat dhe plan për kontrollin pas trajtimit.'
 ],[R.vitd],'Dallon profilaksinë, trajtimin dhe përqendrimin e pikave.');
 save('22.56','Kolikë infantile · qetësim dhe mbështetje',[
  one('Vlerësimi',care('Kontrollo rritjen, ushqyerjen dhe shenjat e sëmundjes','Ethet, letargjia, të vjellat biliare, gjaku në feçe ose mosrritja nuk shpjegohen me kolikë të thjeshtë.')),
  one('Qetësimi',care('Mbështet prindin dhe përdor mënyra të sigurta qetësimi','Rishiko teknikën e ushqyerjes, mbajtjen dhe gromësimën. Vendose foshnjën në shpinë për gjumë; mos e tund kurrë. Kërko ndihmë kur kujdestari është i rraskapitur.')),
 ],['Pika pa përbërje/përqendrim dhe enzimat nuk jepen si skemë universale. Mos ndrysho formulën ose elimino ushqime pa arsye të vlerësuar.'],['https://www.nhs.uk/conditions/colic/'],'Heq dozën me pika të produktit të paidentifikuar.');
 reference('22.57','Konstipacion pediatrik · zhbllokim OSE mirëmbajtje',[
  'Përjashto shenjat e alarmit dhe vlerëso impaktimin. Macrogol/PEG me elektrolite është zakonisht zgjedhja e parë; skema e zhbllokimit dhe e mirëmbajtjes kanë doza/kohë të ndryshme.',
  'Përdor qesen pediatrike dhe hollimin e saj; gramët e gjithë qeses nuk janë vetëm gramë PEG. Lactulose zakonisht 10 g/15 mL, rreth 667 mg/mL, jo 10 mg/15 mL.',
  'Titrim për jashtëqitje të butë, rutinë tualeti dhe ndjekje. Enema/antispazmodiku nuk shtohen rutinë; lactulose sipas moshës/tolerancës kur indikohet. Mos ndal trajtimin e mirëmbajtjes papritur pas tri ditësh.'
 ],[R.constipation,'https://www.medicines.org.uk/emc/product/5525/smpc'],'Korrigjon fortësinë e lactulose dhe ndan zhbllokimin nga mirëmbajtja.');
 save('22.58','Diarre pa dehidratim · zëvendëso humbjet',[
  one('Lëngjet',care('Vazhdo gjidhënien dhe lëngjet e zakonshme','Jep ORS me osmolaritet të ulët në sasi të vogla e të shpeshta kur ka rrezik dehidratimi; përgatite saktë sipas qeses. Shmang lëngjet e frutave/pijet e gazuara.')),
  one('Ndjekja',care('Monitoro urinimin dhe gjendjen','Kthehu për letargji, sy të fundosur, pak urinë, gjak në feçe, të vjella biliare ose pamundësi për të pirë.')),
 ],['Pa dehidratim nuk kërkohet automatikisht një volum i plotë rehidratimi për deficit. Mos e përziej ORS me më pak ujë sesa kërkon paketimi.'],[R.ors],'Dallon zëvendësimin e humbjeve nga trajtimi i deficitit.');
 save('22.59','Dehidratim i moderuar · ORS dhe rivlerësim',[
  one('Rehidratimi oral',care('ORS me osmolaritet të ulët, në sasi të vogla e të shpeshta','Në planin WHO B: 75 mL/kg gjatë 4 orëve, pastaj rivlerësim i plotë. Vazhdo gjidhënien dhe zëvendëso humbjet në vazhdim.')),
  one('Në mosmbajtje',care('Vlerëso rehidratimin NG ose IV','Të vjellat e vazhdueshme, përkeqësimi, shoku ose pamundësia për të pirë kërkojnë vlerësim të drejtpërdrejtë.')),
 ],['Plani WHO B nuk mbivendoset me planin NICE 50 mL/kg për deficit plus mirëmbajtje. Zgjidh një protokoll dhe rivlerëso; kequshqyerja e rëndë/hipernatremia kërkojnë plan tjetër.'],['https://iris.who.int/handle/10665/43209',R.ors],'Ndan protokollet dhe nuk mbledh dy vëllime të ndryshme.');
 for(const [key,title]of [['22.60','Dehidratim i rëndë · rehidratim IV i monitoruar'],['22.62','Diarre e rëndë · trajto perfuzionin dhe shkakun']])reference(key,title,[
  'Urgjencë pediatrike. Dallo shokun, dehidratimin pa shok, hipernatreminë dhe kequshqyerjen e rëndë; nuk trajtohen me të njëjtën shpejtësi.',
  'WHO Plan C për fëmijën e përshtatshëm me diarre: 100 mL/kg kristaloid izotonik gjithsej në faza sipas moshës, me rivlerësim. Ky volum nuk jepet si një bolus i vetëm dhe nuk mbivendoset pa llogaritje mbi boluset e dhëna.',
  'Monitoro perfuzionin, diurezën, elektrolitet dhe shenjat e mbingarkesës; ORS sapo lejohet. Antiemetikët nuk jepen të gjithë së bashku dhe nuk e zëvendësojnë rehidratimin.'
 ],['https://iris.who.int/handle/10665/43209',R.ors],'Dallon fazat e rehidratimit nga bolusi dhe nga gjendjet që kërkojnë protokoll tjetër.');
 reference('22.61','Diarre akute · ORS, ushqyerje dhe zink sipas protokollit',[
  'ORS dhe vazhdimi i gjidhënies/ushqyerjes kanë përparësi. Antibiotiku, antidiarreiku dhe probiotiku nuk janë paketë rutinë për diarrenë ujore.',
  'WHO i ri sugjeron zink elementar 5 mg/ditë deri 14 ditë te fëmijët deri 10 vjeç. Zbatimi varet nga produkti/protokolli lokal; udhëzimet kalimtare WHO/UNICEF mund të vazhdojnë dozat e disponueshme 10/20 mg. Mos i kombino të dy skemat.',
  'Konfirmo mg ZINK ELEMENTAR për mL/tabletë, jo vetëm sasinë e zinc sulfate. Rehidratimi nuk zëvendësohet me racecadotril ose Bacillus clausii.'
 ],[R.diarrhoea,'https://www.unicef.org/supply/market-update-oral-rehydration-salts-ors-and-zinc'],'Përditëson zinkun me dallimin e zbatimit dhe heq barazimin me rehidratimin.');
 for(const [key,title]of [['22.63','Dizenteri pediatrike · testim dhe antibiotik i zgjedhur'],['22.64','Dizenteri e rëndë · trajtim spitalor']])reference(key,title,[
  'Vlerëso dehidratimin dhe merr feçe për testim/kulturë sipas rastit. Shigella rezistente dhe shkaqe të tjera përfshirë STEC kërkojnë vendim sipas diagnozës; metronidazole nuk shtohet automatikisht pas 48 orësh.',
  'Antibiotiku dhe rruga zgjidhen sipas rëndesës/ndjeshmërisë. Injeksioni ciprofloxacin nuk jepet nga goja; doza orale dhe ajo IV nuk këmbehen.',
  'ORS/lëngje sipas gjendjes. Shmang barnat që ndalojnë lëvizjen e zorrës në diarre me gjak; shenjat e HUS, oliguria ose gjendja e rënduar kërkojnë spital.'
 ],[R.shigella,'https://www.cdc.gov/ecoli/treatment/index.html'],'Ndan shkaktarët, rrugët dhe trajtimin në rezistencë.');
 save('22.65','Intolerancë ndaj laktozës · përshtat ushqyerjen',[
  one('Ushqyerja',care('Vlerëso shkakun dhe tolerancën','Pas gastroenteritit mund të jetë kalimtare. Vazhdo gjidhënien; ndryshimi i formulës/dietës bëhet kur ka indikacion dhe me plan rikthimi.')),
  one('Ushqyesit',care('Ruaj kalciumin, vitaminën D dhe energjinë','Kufizimi i panevojshëm i qumështit mund të ulë marrjen ushqyese. Vlerëso rritjen dhe dietën me ekipin përkatës.')),
 ],['Metronidazole nuk trajton mungesën e lactase. Antibiotik/probiotik ose zink jepen vetëm për indikacion tjetër të përcaktuar; ORS në dehidratim.'],['https://www.niddk.nih.gov/health-information/digestive-diseases/lactose-intolerance/treatment',R.ors],'Heq antibiotikun për intolerancë enzimatike.');
 for(const [key,title,note]of [['22.66','Hipokalcemi simptomatike pediatrike · urgjencë','Tetania, krizat, aritmia ose stridori kërkojnë shtrim, ECG dhe kalcium IV të kontrolluar.'],['22.67','Hipokalcemi pa simptoma · trajto shkakun','Vlerëso kalciumin e jonizuar, Mg/fosfatin, vitaminën D dhe shkakun; rëndesa biokimike mund të kërkojë shtrim edhe pa simptoma.']])reference(key,title,[note,'Shkruaj sasinë si mmol ose mg KALCIUM ELEMENTAR: 1 mmol ≈40 mg. Calcium gluconate 10% nuk përmban 100 mg kalcium elementar/mL; konverto sipas ampulës.','Doza orale/IV, hollimi, vija dhe ritmi caktohen sipas peshës dhe matjeve të përsëritura. Kontrollo ekstravazimin dhe përputhshmërinë; mos kopjo një infuzion neonatal te fëmija i madh.'],['https://www.starship.org.nz/guidelines/hypocalcaemia/','https://pig.rch.org.au/pages/calcium-gluconate'],'Dallon kripën, elementarin dhe rrugën e trajtimit.');
};
