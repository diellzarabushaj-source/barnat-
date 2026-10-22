'use strict';
module.exports=({save,reference,drug,care,opt,group,one,adult,pain})=>{
 const R={gas:'https://www.cdc.gov/group-a-strep/hcp/clinical-guidance/strep-throat.html',sinus:'https://www.nice.org.uk/guidance/ng79/chapter/Recommendations',momet:'https://www.medicines.org.uk/emc/product/5224/smpc',otic:'https://www.medicines.org.uk/emc/product/101381/smpc',wax:'https://www.nice.org.uk/guidance/ng98/chapter/Recommendations',tinnitus:'https://www.nice.org.uk/guidance/ng155/chapter/Recommendations',bppv:'https://www.entnet.org/quality-practice/quality-products/clinical-practice-guidelines/bppv/',beta:'https://www.medicines.org.uk/emc/product/7052/smpc',back:'https://www.nice.org.uk/guidance/ng59/chapter/Recommendations',tbi:'https://braintrauma.org/coma/guidelines/severe-tbi',head:'https://www.nice.org.uk/guidance/ng232/chapter/Recommendations',sah:'https://www.nice.org.uk/guidance/ng228/chapter/Recommendations',brain:'https://doi.org/10.1016/j.cmi.2023.08.016',traumaAbx:'https://tsaco.bmj.com/content/9/1/e001304',whip:'https://www.sira.nsw.gov.au/resources-library/motor-accident-resources/publications/for-professionals/whiplash-resources/quick-reference-guide-for-the-management-of-whiplash-associated-disorders/1.-do-an-examination/3.-provide-treatment'};
 const nasalCare=()=>one('Kujdesi nazal',care('Solucion fiziologjik dhe shmangie e irritantëve','Për shpëlarje përdor ujë steril/distiluar ose të zier e të ftohur dhe pajisje të pastër. Mos përdor ujë të patrajtuar ose dekonxhestant pa afat.'));
 const earScope='Otoskopi dhe vlerësim i timpanit para zgjedhjes së pikave. Dhimbja e fortë, diabeti/imunosupresioni, mastoiditi, pareza faciale ose shenjat neurologjike kërkojnë vlerësim urgjent ORL.';
 save('19.1','Faringit streptokoksik · një antibiotik',[
  group('Zgjidh vetëm një · GAS i konfirmuar',[
   opt('Penicillin V',drug('Phenoxymethylpenicillin (Penicillin V)','500 mg','2 herë në ditë','10 ditë','Nga goja','Vetëm kur nuk ka alergji ndaj penicilinës.')),
   opt('Amoxicillin',drug('Amoxicillin','500 mg','2 herë në ditë','10 ditë','Nga goja','Alternativë ndaj penicillin V, jo shtesë. Vlerëso funksionin renal dhe dyshimin për mononukleozë.')),
  ]),one('Dhimbje/ethe',pain(),'Ka nevojë për analgjezi dhe paracetamoli është i përshtatshëm'),
 ],[adult,'Për faringit viral nuk jepet antibiotik. Co-amoxiclav dhe azithromycin nuk janë zgjedhje rutinë para penicilinës për GAS joalergjik; makrolidi kërkon vlerësim të alergjisë/rezistencës.','Trizmi, jargëzimi, dispnea, dehidratimi ose dyshimi për absces kërkojnë vlerësim urgjent; jo kjo skemë ambulatore.'],[R.gas],'Zëvendëson spektrin e gjerë rutinë me një alternativë të përcaktuar për GAS.',{confirmation:'I rritur me GAS të konfirmuar; pa alergji ndaj penicilinës dhe pa shenja komplikimi.'});
 save('19.2','Rinosinusit viral · lehtësim simptomatik',[nasalCare(),one('Dhimbje/ethe',pain(),'Ka nevojë për analgjezi dhe paracetamoli është i përshtatshëm'),one('Ndjekja',care('Rivlerëso në zgjatje ose përkeqësim','Shumica përmirësohen pa antibiotik. Ënjtja rreth syrit, shikimi i prekur, cefalea e rëndë frontale ose shenjat neurologjike kërkojnë referim urgjent.'))],[adult,'Jo antibiotik rutinë. Mos jep steroid nazal me doza të larta për një muaj pa indikacion; avulli i nxehtë mund të djegë.'],[R.sinus],'Ndan infeksionin viral nga kriteret për antibiotik.');
 save('19.3','Sinusit akut · antibiotik vetëm kur indikohet',[
  group('Zgjidh sipas rrezikut dhe alergjisë',[
   opt('Pa alergji · zgjedhja e parë kur indikohet',drug('Phenoxymethylpenicillin','500 mg','4 herë në ditë','5 ditë','Nga goja')),
   opt('Rrezik i lartë / shumë i sëmurë sistemikisht · pas vlerësimit',drug('Amoxicillin + Clavulanic acid','500 mg + 125 mg','3 herë në ditë','5 ditë','Nga goja','Në gjendje të rëndë ose komplikim kërko shtrim; ky regjim nuk e zëvendëson referimin.')),
   opt('Alergji/intolerancë ndaj penicilinës · jo shtatzënë',drug('Doxycycline','200 mg ditën 1; pastaj 100 mg/ditë','1 herë në ditë','5 ditë gjithsej','Nga goja','Me ujë, në qëndrim drejt; mos u shtri menjëherë. Shtatzënia kërkon alternativë tjetër.')),
  ]),nasalCare(),
 ],[adult,'Jo për çdo sinusit. Vlerëso kohën, rëndesën, përkeqësimin dhe mundësinë e recetës së vonuar; përmirësimi spontan është i zakonshëm. Zgjidh vetëm një regjim.','Moxifloxacin 500 mg nuk është fortësia/doza standarde e tabletës; fluoroquinolone nuk është zgjedhje rutinë e parë. Komplikimi orbital/intrakranial kërkon urgjencë.'],[R.sinus,'https://www.medicines.org.uk/emc/product/6771/smpc'],'Lidh zgjedhjen me indikacionin dhe ndan qartë alternativat.',{confirmation:'I rritur me indikacion për antibiotik; alergjia, shtatzënia, rreziku dhe shenjat e komplikimit janë vlerësuar.'});
 reference('19.4','Rinosinusit kronik · cakto fenotipin',[
  'Konfirmo kohëzgjatjen, ekzaminimin dhe praninë e polipeve; trajto alergjinë kur ekziston. Shpëlarja fiziologjike dhe steroidi nazal janë baza sipas diagnozës/produktit.',
  'Antibiotiku 10–14 ditë nuk jepet për çdo rast kronik. Eksacerbimi bakterial, kulturat dhe komplikimet vlerësohen veçmas.',
  'Për polipe te të rriturit, mometasone 50 mikrogramë/spërkatje zakonisht nis me 2 spërkatje në çdo vrimë hunde një herë/ditë; rritja/rivlerësimi ka afate specifike. Kjo nuk barazohet me skemën e rinitit alergjik.'
 ],[R.momet,'https://www.nhs.uk/conditions/sinusitis-sinus-infection/'],'Ndan polipet/rinitin nga antibiotiku për infeksion aktiv.');
 reference('19.5','Rinit joalergjik · terapi sipas simptomës',[
  'Përjashto irritantët, barnat, rinitin medikamentoz dhe shkakun strukturor. Shpëlarja fiziologjike dhe shmangia e nxitësve janë masa fillestare.',
  'Antihistaminiku nazal, steroidi ose ipratropium zgjidhen sipas bllokimit/rinorresë dhe etiketës. Mos jep antihistaminik oral për çdo fenotip ose dekonxhestant pa afat.'
 ],['https://www.nhs.uk/conditions/non-allergic-rhinitis/'],'Zëvendëson paketën e njëjtë me trajtim sipas simptomës.');
 reference('19.6','Rinit kronik · shkaku para recetës',[
  'Identifiko alergjinë, irritantin, përdorimin e dekonxhestantëve, polipet dhe pengesën strukturore. Përcakto produktin, dozën dhe kontrollin pas provës së trajtimit.',
  'Dekonxhestanti i zgjatur mund ta mbajë bllokimin; ndërprerja/trajtimi i rinitit medikamentoz planifikohen. Antibiotiku dhe NSAID nuk janë terapi rutinë e rinitit të thjeshtë.'
 ],['https://www.nhs.uk/conditions/non-allergic-rhinitis/',R.momet],'Heq preparatin e paidentifikuar dhe përdorimin pa afat.');
 for(const [key,title]of [['19.7','Rinit hipertrofik · vlerësim i pengesës'],['19.9','Devijim i septumit · vlerësim funksional'],['19.12','Hipertrofi e konkave · vlerësim ORL']])save(key,title,[nasalCare(),one('Vlerësimi',care('Dallo komponentin inflamator nga pengesa strukturore','Trajto alergjinë kur është e pranishme; ORL vlerëson obstruksionin persistent dhe nevojën për procedurë. Antibiotiku, NSAID dhe PPI nuk janë paketë rutinë për pengesën anatomike.'))],['Bllokimi i njëanshëm i vazhdueshëm me gjakderdhje, dhimbje ose masë kërkon hetim të shpejtë.'],['https://www.nhs.uk/conditions/non-allergic-rhinitis/',R.momet],'Ndan trajtimin inflamator nga korrigjimi strukturor.');
 save('19.8','Rinit alergjik · Mometasone nazal',[
  nasalCare(),one('Trajtimi nazal',drug('Mometasone furoate · 50 mikrogramë/spërkatje','2 spërkatje në ÇDO vrimë hunde (200 mikrogramë/ditë gjithsej)','1 herë në ditë','Përdor rregullisht; rivlerëso kontrollin dhe vazhdo dozën më të ulët efektive','Në hundë','Pas kontrollit mund të ulet në 1 spërkatje në çdo vrimë një herë/ditë. Drejtoje larg septumit; jo 2–3 spërkatje dy herë/ditë si nisje rutinë.')),
 ],[adult,'Doza e këtij modeli është për të rriturin; fëmijët kanë kufij të tjerë. Trajto infeksionin nazal dhe vlerëso epistaksisin/shërimin pas kirurgjisë.','Një antihistaminik oral mund të zgjidhet për simptoma të tjera; nuk shtohen disa antihistaminikë automatikisht.'],[R.momet],'Shkruan mikrogramët për spërkatje dhe totalin ditor.');
 for(const [key,title]of [['19.10','Hematomë septale · drenazh urgjent'],['19.11','Absces septal · drenazh dhe antibiotik']])reference(key,title,[
  'Referim urgjent ORL; grumbullimi septal mund të dëmtojë kërcin. Mos e vono drenazhin duke provuar vetëm barna orale.',
  'Drenazh, kulturë dhe antibiotik sipas infeksionit, alergjisë dhe protokollit. Co-amoxiclav “1 g” pa përbërës/rrugë nuk është dozë e plotë; preparatet orale dhe IV nuk këmbehen nga emri.',earScope
 ],['https://www.nhs.uk/conditions/broken-nose/'],'Bën prioritet drenazhin dhe heq dozën e papërcaktuar.');
 reference('19.13','Rrjedhje nga veshi · diagnoza para pikave',[
  'Otoskopi për otitis externa, perforim/otitis media, trup të huaj ose cholesteatoma. Shëno statusin e timpanit dhe dëgjimin.',
  'Jo të gjitha pikat janë të sigurta në perforim; shmang preparatet ototoksike ose me përbërje të panjohur. Antibiotiku oral nuk shtohet për çdo rrjedhje.',earScope
 ],[R.otic,R.wax],'Dallon veshin e jashtëm nga sëmundja e veshit të mesëm.');
 reference('19.14','Otit media akut · mosha dhe timpani',[
  'Konfirmo otitis media me otoskopi; përcakto moshën, perforimin dhe rëndesën. Analgjezi dhe vendim për vëzhgim, recetë të vonuar ose antibiotik sipas rrezikut.',
  'Pikat antibiotike nuk arrijnë veshin e mesëm përmes timpanit të paprekur. Pikat analgjezike nuk përdoren me perforim/otorrhe. Doza pediatrike nuk merret nga fortësia e tabletës adulte.',earScope
 ],['https://www.nice.org.uk/guidance/ng91/chapter/Recommendations'],'Heq pikat dhe antibiotikët e shumëfishtë si paketë universale.');
 reference('19.15','Otit media kronik supurativ · timpan i perforuar',[
  'Pastrim profesional, mbajtje e veshit të thatë dhe vlerësim ORL/kulturë kur indikohet. Përjashto cholesteatoma dhe komplikimet.',
  'Pikat zgjidhen për timpan të perforuar: aminoglikozidet nuk përdoren rutinë pa vendim specialistik. Mos zëvendëso antibiotikun otik me një kombinim me lidocaine/steroid nga emri i markës.',
  'Antibiotiku sistemik rezervohet për indikacion të qartë; jo kurs oral i detyrueshëm me çdo trajtim lokal.',earScope
 ],['https://www.entnet.org/resource/clinical-practice-guideline-acute-otitis-externa/',R.otic],'Ndan formulimet për perforim dhe heq kombinimet pa përbërje.');
 save('19.16','Cholesteatoma · referim dhe mbrojtje e veshit',[one('ORL',care('Referim për vlerësim të cholesteatomës','Vlerësim i dëgjimit dhe shtrirjes; kirurgjia/procedura përcaktohen nga ekipi, jo e njëjta ndërhyrje për të gjithë.')),one('Deri në kontroll',care('Mbaje veshin të thatë dhe mos fut objekte','Trajto infeksionin aktiv sipas ekzaminimit. Vertigo, dobësi faciale, ethe ose dhimbje koke e fortë kërkojnë urgjencë.'))],[earScope],['https://www.nhs.uk/conditions/cholesteatoma/'],'Vendos referimin dhe shmang një operacion universal.');
 reference('19.17','Furunkul i kanalit të veshit · vlerësim i abscesit',[
  'Abscesi i lokalizuar kërkon vlerësim për drenazh nga profesionisti. Mos e shtrydh dhe mos fut mjete në kanal.',
  'Analgjezia dhe antibiotiku sistemik zgjidhen në infeksion të përhapur/celulit ose rrezik të lartë. Pikat ciprofloxacin/dexamethasone nuk zëvendësojnë drenazhin e një abscesi.',earScope
 ],[R.otic,'https://www.nhs.uk/conditions/ear-infections/'],'Ndan furunkulin/abscesin nga otitis externa difuz.');
 save('19.18','Otit i jashtëm akut · trajtim otik i përcaktuar',[
  one('Pikat',drug('Ciprofloxacin 3 mg/mL + Dexamethasone 1 mg/mL · suspenzion otik','4 pika në veshin/veshët e prekur','2 herë në ditë','7 ditë','Në vesh','Ngrohe shishen në duar dhe tunde. Mbaje veshin e prekur lart 5 minuta pas pikave. Vetëm në vesh; jo injeksion ose pika okulare.')),
  one('Kujdesi',care('Mbaje veshin të thatë; pastroje profesionalisht kur nevojitet','Pa shkopinj pambuku. Nëse nuk përmirësohet, rishiko diagnozën, pengesën e kanalit dhe kulturën.')),
 ],[adult,earScope,'Model për të rriturin me otitis externa bakterial të pakomplikuar, pas vlerësimit të timpanit. Jo infeksion fungal/viral. Antibiotiku oral nuk shtohet rutinë.'],[R.otic,'https://www.medicines.org.uk/emc/product/101381/pil'], 'Saktëson përbërësit, rrugën, katër pikat dhe kursin shtatëditor.',{confirmation:'Otoskopia konfirmon otitis externa të pakomplikuar; produkti/timpani dhe mungesa e infeksionit fungal/viral janë vlerësuar.'});
 reference('19.19','Otit i jashtëm kronik · shkaktari dhe lëkura',[
  'Vlerëso dermatitin, alergjinë e kontaktit, lagështinë, pajisjet e dëgjimit dhe infeksionin fungal/bakterial. Pastrim profesional dhe shmangie e irritantëve.',
  'Steroidi lokal dhe antibiotiku përzgjidhen sipas shkakut dhe statusit të timpanit; mos vazhdo automatikisht pika antibiotik/steroid për muaj.',earScope
 ],[R.otic,'https://www.nhs.uk/conditions/ear-infections/'],'Ndan trajtimin e dermatitit nga infeksioni aktiv.');
 reference('19.20','Otit i jashtëm nekrotizues · urgjencë ORL/infektive',[
  'Dhimbja e rëndë, sidomos natën, te diabetiku/imunosupresuari kërkon vlerësim urgjent për infeksion invaziv dhe osteomielit të bazës së kafkës.',
  'Kultura/imazheri dhe antibiotik sistemik me mbulim antipseudomonal sipas ndjeshmërisë; kurs i zgjatur dhe ndjekje nga ORL/infektologu. Ceftriaxone nuk jep mbulim të besueshëm ndaj Pseudomonas.',
  'Mos bashko automatikisht cefalosporinë, fluoroquinolone dhe aminoglikozid. Doza, rruga dhe afati lidhen me veshkat, kulturën dhe përgjigjen.'
 ],['https://www.rightdecisions.scot.nhs.uk/nhs-forth-valley/acute-hospital-guidance/ent/malignant-otitis-externa/'],'Heq mbulimin e gabuar dhe skemën universale me shumë antibiotikë.');
 reference('19.21','Otomikozë · pastrim dhe antimykotik i përshtatshëm',[
  'Pastrimi profesional i kanalit dhe mbajtja e veshit të thatë janë thelbësore; konfirmo kërpudhën dhe statusin e timpanit.',
  'Zgjidh antimykotikun/formulimin otik dhe kursin sipas ekzaminimit; preparati dermatologjik nuk hidhet në vesh pa vlerësim të përbërësve/timpanit.',
  'Antibiotiku/steroidi dhe itraconazole oral për pesë ditë nuk janë shtesa automatike për çdo otomikozë.'
 ],['https://www.nhs.uk/conditions/ear-infections/',R.otic],'Heq kombinimet që mund ta mbajnë infeksionin fungal.');
 reference('19.22','Herpes zoster otik / Ramsay Hunt · vlerësim urgjent',[
  'Vlerësim i hershëm ORL/neurologjik për parezë faciale, dëgjim, vertigo dhe nevojën për mbrojtje të syrit që nuk mbyllet.',
  'Acyclovir për zoster te i rrituri zakonisht është 800 mg nga goja 5 herë/ditë për 7 ditë me përshtatje renale; 400 mg pesë herë ose 800 mg tri herë nuk merren si regjim universal zoster.',
  'Steroidi dhe analgjezia neuropatike përzgjidhen sipas rastit; mos shto disa sedativë/antiepileptikë automatikisht.'
 ],['https://www.nhs.uk/medicines/aciclovir/how-and-when-to-take-or-use-aciclovir/','https://www.ninds.nih.gov/health-information/disorders/herpes-zoster-oticus'],'Saktëson skemën zoster dhe ndan komplikimin facial/okular.');
 save('19.23','Cerumen i bllokuar · zbutje dhe heqje e sigurt',[
  one('Para procedurës',care('Vlerëso timpanin dhe kundërindikacionet','Zbutësi zgjidhet sipas produktit; mund të përdoret menjëherë para ose deri 5 ditë para heqjes së planifikuar. Perforimi, kirurgjia e mëparshme ose infeksioni ndryshojnë zgjedhjen.')),
  one('Heqja',care('Mikrosuksion, instrumentim ose irrigim elektronik nga person i trajnuar','NICE nuk rekomandon shiringim manual rutinë. Jo objekte/shkopinj në kanal dhe jo përzierje peroksid/acid pas çdo procedure.')),
 ],['Refero kur heqja dështon, ka dhimbje ose dyshim për patologji tjetër.'],[R.wax],'Ndan procedurat profesionale dhe shmang pikimin me volum të papërcaktuar.');
 save('19.24','Tinnitus · dëgjimi, mbështetja dhe shkaku',[
  one('Vlerësimi',care('Audiologji dhe identifikim i shenjave të alarmit','Humbja e papritur e dëgjimit, deficit neurologjik ose tinnitus pulsatil kërkojnë rrugë hetimi/referimi sipas rastit.')),
  one('Trajtimi',care('Informim, mbështetje dhe rehabilitim i dëgjimit','Aparate dëgjimi kur ka indikacion; CBT për shqetësim të vazhdueshëm. Vlerëso gjumin dhe shëndetin mendor.')),
 ],['Betahistine, benzodiazepina dhe suplementet nuk jepen rutinë për tinnitus. Antidepresanti mund të ketë indikacion për diagnozë tjetër, jo si kurë universale e zhurmës.'],[R.tinnitus],'Heq barnat pa indikacion dhe vendos rrugën e vlerësimit.');
 reference('19.25','Vertigo · diagnoza para Betahistine',[
  'Dallo BPPV, Ménière, neuritin vestibular dhe shkaqet qendrore. Deficiti neurologjik, ataksia e rëndë ose dhimbja e re e fortë kërkojnë urgjencë.',
  'Betahistine përdoret sipas indikacionit për Ménière; produkti i referencës ka maksimum 48 mg/DITË në 2–3 marrje. 48 mg tri herë/ditë nuk është dozë standarde.',
  'Nuk trajton automatikisht çdo vertigo ose BPPV. Benzodiazepinat/antihistaminikët e zgjatur mund të pengojnë kompensimin dhe të rrisin rrëzimet; zgjidh vetëm kur indikohet.'
 ],[R.beta,R.bppv],'Korrigjon totalin ditor dhe ndan diagnozat vestibulare.');
 save('19.26','BPPV · manovër e ripozicionimit',[
  one('Konfirmimi',care('Konfirmo BPPV dhe kanalin e prekur','Test pozicional nga profesionisti; vlerëso kufizimet e qafës/shpinës dhe shenjat qendrore.')),
  one('Trajtimi',care('Manovër ripozicionimi sipas kanalit, p.sh. Epley','Kryhet ose mësohet në mënyrë të përshtatshme; vlerëso rrezikun e rrëzimit dhe rikontrollo brenda rreth një muaji nëse simptomat vazhdojnë.')),
 ],['Antihistaminiku, benzodiazepina dhe betahistine nuk janë trajtim rutinë për BPPV të konfirmuar.'],[R.bppv],'Vendos manovrën në qendër dhe heq supresorët vestibularë rutinë.');
 const red='Retencioni/inkontinenca e re urinare, anestezia në shalë, dobësia progresive, ethet, trauma ose dyshimi për kancer kërkojnë vlerësim urgjent; jo ky plan i thjeshtë.';
 const activity=()=>one('Lëvizja dhe rikthimi në aktivitet',care('Vazhdo aktivitetin e toleruar dhe ushtrimet e përshtatura','Shmang pushimin e zgjatur në shtrat. Planifiko ushtrim/rehabilitim dhe rikthim gradual në punë, me ndjekje të funksionit.'));
 for(const [key,title,sciatica]of [
  ['20.1','Sëmundje degjenerative e diskut · trajtim konservativ',false],['20.3','Radikulopati lumbosakrale · vlerësim dhe aktivitet',true],['20.4','Dhimbje lumbare · kujdes dhe ndjekje',false],['20.5','Lumbago · plan fillestar',false],['20.6','Dhimbje lumbare persistente · rehabilitim',false],['20.7','Shiatik · aktivitet dhe rivlerësim',true],['20.8','Shiatik persistent · plan i individualizuar',true],
 ])save(key,title,[activity(),one('Barnat · vetëm pas vlerësimit',care('Zgjidh analgjezinë sipas rrezikut dhe përgjigjes','Nëse zgjidhet NSAID, përdor dozën më të ulët për kohën më të shkurtër; vlerëso stomakun, veshkat, zemrën, shtatzëninë dhe ndërveprimet. Gastroproteksioni sipas rrezikut, jo automatikisht për 30 ditë.')),one('Rivlerësimi',care('Ndiq funksionin dhe shenjat neurologjike','Imazheri kur ndryshon menaxhimin ose ka shenja alarmi; specialist për deficit ose simptoma që nuk përgjigjen.'))],[adult,red,sciatica?'Për shiatik NICE nuk rekomandon gabapentinoidë/antiepileptikë të tjerë, steroid oral ose benzodiazepina; opioidët nuk rekomandohen për shiatik kronik. Evidenca për NSAID është e kufizuar.':'Mos përdor gabapentinoidë/antiepileptikë për dhimbje lumbare të thjeshtë. Paracetamoli i vetëm dhe opioidët për dhimbje kronike nuk janë zgjedhje rutinë NICE.','Vitaminat B/methylcobalamin nuk janë shtesa të detyrueshme pa mungesë/indikacion. Mos ndërprit papritur opioidin, benzodiazepinën ose gabapentinoidin e përdorur gjatë; planifiko rishikimin.'],[R.back],'Heq paketën rutinë me steroid/antiepileptikë dhe ruan rehabilitimin e ndjekjen.');
 reference('20.2','Radikulopati cervikale · veço mielopatinë',[
  'Vlerëso forcën, reflekset, ndjeshmërinë dhe ecjen. Dobësia progresive, çrregullimi i ecjes/duarve ose shenjat sfinkterike kërkojnë vlerësim për mielopati dhe referim urgjent.',
  'Ushtrimet, analgjezia dhe trajtimi i dhimbjes neuropatike përshtaten sipas diagnozës, veshkave dhe rrezikut. Nuk kopjohet automatikisht paketa e shiatikut në qafë.',
  'Steroidet orale, relaksantët, gabapentinoidët dhe vitaminat nuk janë kombinim i detyrueshëm. Përcakto një provë të arsyetuar, afat dhe kriter përgjigjeje; mos ndërprit papritur barna të përdorura gjatë.'
 ],['https://www.nice.org.uk/guidance/ng127/chapter/Recommendations-for-adults-aged-over-16','https://doi.org/10.1177/2192568217701914'],'Ndan radikulopatinë cervikale nga shiatiku dhe urgjenca mielopatike.');
 save('20.9','Stenozë spinale · funksioni dhe referimi',[activity(),one('Specialisti',care('Vlerëso deficitin dhe kufizimin e ecjes','Trajtimi konservativ ose dekompresioni zgjidhen sipas simptomave, ekzaminimit dhe imazherisë përkatëse; jo një procedurë për të gjithë.'))],[red,'Barnat nuk e korrigjojnë ngushtimin strukturor. Injektimi epidural nuk është trajtim rutinë për klaudikacion neurogjen nga stenozë qendrore.'],[R.back],'Dallon rehabilitimin nga indikacioni për dekompresion.');
 reference('20.10','Hematomë epidurale · urgjencë neurokirurgjikale',[
  'ABCD&E, mbrojtje cervikale sipas traumës, CT dhe neurokirurg urgjent. Mos vono evakuimin e indikuar për të provuar barna.',
  'Parandalo hipoksinë/hipotensionin. Osmoterapia përdoret vetëm në hipertension intrakranial/herniacion të dyshuar me monitorim; mannitol nuk është “i ndaluar për çdo hematomë epidurale”, por as dozë rutinë e pakushtëzuar.',
  'Jo hiperventilim profilaktik i zgjatur, antibiotik për çdo traumë të mbyllur ose antiepileptik për çdo pacient. Lëngjet, koagulimi dhe profilaksitë varen nga gjendja.'
 ],[R.head,R.tbi,'https://braintrauma.org/coma/guidelines/surgical'],'Ndan evakuimin urgjent nga masat e përzgjedhura për ICP.');
 reference('20.11','Hematomë subdurale · akute dhe kronike veçmas',[
  'CT, status neurologjik dhe neurokirurg urgjent. Hematoma akute dhe ajo kronike nuk kanë të njëjtën rrugë; vlerëso antikoagulantët dhe kthimin e efektit sipas protokollit.',
  'Madhësia, zhvendosja e vijës së mesme, GCS/pupilët dhe përkeqësimi përcaktojnë ndërhyrjen. Vëzhgimi është vendim specialistik me imazheri/ekzaminime të përsëritura.',
  'Mannitol 1,5 g/kg çdo 6 orë nuk është regjim rutinë për çdo hematomë. Osmoterapia, sedacioni dhe antiepileptiku kërkojnë indikacion e monitorim.'
 ],[R.head,R.tbi,'https://braintrauma.org/coma/guidelines/surgical'],'Ndan kriteret kirurgjikale dhe heq osmoterapinë fikse.');
 reference('20.12','SAH aneurizmale · stabilizim dhe sigurim i aneurizmës',[
  'Referim urgjent në qendër neurovaskulare; diagnostikim dhe mbyllje e aneurizmës me clipping/coiling sipas ekipit. Monitoro gjendjen neurologjike, presionin dhe hidrocefalinë.',
  'Nimodipine enterale te i rrituri: zakonisht 60 mg çdo 4 orë, 21 ditë; hipotensioni, mëlçia dhe ndërveprimet mund të kërkojnë ndryshim nga ekipi. Preparati oral/enteral nuk injektohet. Kjo skemë nuk transferohet te SAH traumatike.',
  'Syno euvolemi, jo hipervolemi profilaktike. Cilostazol, choline dhe antiepileptiku për çdo pacient nuk janë shtesa automatike.'
 ],[R.sah,'https://www.medicines.org.uk/emc/product/1565/smpc'],'Saktëson nimodipinën dhe dallon SAH aneurizmale nga trauma.');
 reference('20.13','Absces cerebral · drenazh dhe antibiotik i synuar',[
  'MRI/CT dhe konsultë neurokirurgjikale/infektive; aspirim ose ekscizion kur mundësohet, me kulturë. Imunosupresioni dhe ndërhyrja neurokirurgjikale e mëparshme ndryshojnë mbulimin.',
  'Për absces komunitar te imunokompetenti, ESCMID rekomandon cefalosporinë të gjeneratës së tretë EDHE metronidazole; jo secili si alternativë e vetme. Vancomycin nuk shtohet rutinë pa rrezik përkatës.',
  'Zakonisht 6–8 javë antibiotik IV pas aspirimit ose trajtimit konservativ, me përshtatje sipas shkaktarit/kontrollit; rrethana të veçanta kanë afat tjetër. Steroidi për edemë me simptoma të rënda/herniacion; jo antiepileptik profilaktik për çdo rast.'
 ],[R.brain],'Ndan kombinimin EDHE, kategorinë e pacientit dhe kohëzgjatjen spitalore.');
 reference('20.14','Hidrocefali · shkaku dhe trajtimi neurokirurgjikal',[
  'Vlerëso moshën, shkakun, imazherinë dhe shenjat e presionit; shunti ose ventrikulostomia zgjidhen sipas mekanizmit. Hidrocefalia ex vacuo nuk trajtohet automatikisht si bllokim aktiv.',
  'Acetazolamide/furosemide, punksionet seriale dhe trombolitiku nuk janë paketë universale, veçanërisht te prematuri. Punksioni lumbar mund të jetë i rrezikshëm në obstruksion/masë; vendimi është specialistik.',
  'Përgjumja, të vjellat, shikimi i ndryshuar ose shenjat e dështimit/infeksionit të shuntit kërkojnë vlerësim urgjent.'
 ],['https://www.nhs.uk/conditions/hydrocephalus/treatment/','https://www.cns.org/guidelines/pediatric-hydrocephalus/2-management-of-posthemorrhagic-hydrocephalus-in-p'],'Heq terapitë e papërshtatshme si parazgjedhje dhe veçon obstruksionin.');
 save('20.15','Whiplash · rikthim i hershëm në aktivitet',[one('Përjashto dëmtimin serioz',care('Vlerëso traumën dhe shenjat neurologjike','Imazheri kur indikohet; fraktura, instabiliteti ose deficiti kërkojnë rrugë tjetër.')),activity(),one('Simptomat dhe kontrolli',care('Analgjezi e shkurtër sipas nevojës; ndiq funksionin','Zgjidh preparatin sipas rrezikut dhe rivlerëso. Mos përdor jakë imobilizuese ose pushim të zgjatur rutinë për dëmtim të pakomplikuar.'))],['Relaksantët muskulorë, antikonvulsantët dhe antidepresantët nuk janë terapi rutinë e whiplash akut. PPI për 30 ditë nuk shtohet pa indikacion.'],[R.whip],'Heq paketën me relaksant dhe vendos aktivitetin/ushtrimet.');
 reference('20.16','Traumë e kokës · stabilizim dhe monitorim',[
  'ABCD&E, mbrojtje cervikale kur indikohet, vlerësim GCS/pupilësh dhe CT sipas rrezikut. Shmang hipoksinë dhe hipotensionin; vëzhgimi/rivlerësimi vazhdojnë pas CT.',
  'Në TBI të rëndë me monitorim, ICP >22 mmHg kërkon trajtim dhe CPP zakonisht synohet 60–70 mmHg sipas pacientit. Osmoterapia/sedacioni titrohen nga ekipi; jo mannitol ose hiperventilim rutinë për çdo traumë.',
  'Steroidi nuk përmirëson TBI; methylprednisolone në dozë të lartë është kundërindikuar. Ceftriaxone, alpha-choline dhe antiepileptiku nuk jepen automatikisht në çdo traumë të mbyllur. Metoclopramide kërkon kujdes dhe është kundërindikuar në epilepsi; injeksionet përgatiten sipas produktit.'
 ],[R.head,R.tbi,'https://www.medicines.org.uk/emc/product/1561/smpc'],'Heq trajtimet rutinë pa indikacion dhe dallon TBI të rëndë nga trauma e lehtë.');
 reference('20.17','Pneumocefali · vlerëso tensionin dhe shkakun',[
  'CT dhe vlerësim neurokirurgjikal. Pneumocefalia me tension/përkeqësim është urgjencë dhe mund të kërkojë dekompresion; oksigjeni nuk e zëvendëson.',
  'Pneumocefalia posttraumatike ose rrjedhja e LCS pa infeksion nuk kërkojnë antibiotik profilaktik rutinë. Plaga e hapur/penetruese, ndërhyrja dhe infeksioni kanë indikacione të tjera.',
  'Oksigjeni me përqendrim të lartë, kur zgjidhet, jepet me pajisje dhe monitorim të përshtatshëm; maska jo-rithithëse nuk garanton FiO2 100%. Nuk vendoset afat universal 48 orë, osmoterapi ose hiperventilim rutinë.'
 ],[R.traumaAbx,R.head],'Ndan urgjencën me tension nga masat konservative dhe heq antibiotikun rutinë.');
};
