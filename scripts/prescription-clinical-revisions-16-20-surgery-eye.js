'use strict';
module.exports=({save,reference,drug,care,opt,group,one,adult,pain})=>{
 const R={fluid:'https://www.nice.org.uk/guidance/cg174/chapter/Recommendations',gall:'https://www.nice.org.uk/guidance/cg188/chapter/Recommendations',appendix:'https://doi.org/10.1001/jamasurg.2025.6218',cholangitis:'https://www.asge.org/home/resources/publications/guidelines/asge-guideline-on-the-management-of-cholangitis',fissure:'https://www.medicines.org.uk/emc/product/3933/smpc',hem:'https://fascrs.org/ascrs/media/files/2024-Hemorrhoids-CPG.pdf',abscess:'https://www.ascrsu.com/ascrs/view/ASCRS-Evidence-Based-Guidelines-and-Expert-Consensus/3982014/all/Management_of_Anorectal_Abscess_Fistula_in_Ano_and_Rectovaginal_Fistula__2022_',pancreas:'https://www.nice.org.uk/guidance/ng104/chapter/Recommendations',bowel:'https://pmc.ncbi.nlm.nih.gov/articles/PMC6006983/',sbp:'https://aasldpubs.onlinelibrary.wiley.com/doi/full/10.1002/hep.31884',eye:'https://www.aao.org/education/preferred-practice-pattern/conjunctivitis-ppp-2023',moxi:'https://www.medicines.org.uk/emc/product/14019/smpc',olop:'https://www.medicines.org.uk/emc/product/10890/smpc',hsv:'https://www.medicines.org.uk/emc/product/12988/smpc',bleph:'https://www.nei.nih.gov/eye-health-information/eye-conditions-and-diseases/blepharitis',trauma:'https://aci.health.nsw.gov.au/__data/assets/pdf_file/0013/155011/ACI-Eye-Emergency-Manual.pdf'};
 const hospital='Trajtim spitalor; diagnoza, kontrolli i burimit, antibiotiku dhe bilanci përcaktohen sipas gjendjes, kulturave dhe funksionit renal. Kjo nuk është paketë ambulatore barnash.';
 reference('17.1','Abdomen akut · vlerësim urgjent',[
  'ABCD&E, analgjezi e titruar, ekzaminime dhe konsultë kirurgjikale sipas dyshimit. Peritonizmi, shoku ose dyshimi për ishemi/perforim kërkojnë veprim urgjent.',
  'Për reanimim zgjidhen kristaloide izotonike me rivlerësim; glukoza 5% nuk është lëng reanimimi. Vëllimi/shpejtësia varen nga perfuzioni, zemra dhe veshkat; polygeline nuk është shtesë rutinë.',
  'Sonda NG, kateteri urinar dhe antibiotikët jepen për indikacion. Mos jep laksativ para përjashtimit të obstruksionit. Injektimet nuk përzihen në të njëjtën shiringë pa përputhshmëri të verifikuar.',hospital
 ],[R.fluid,R.bowel],'Ndan stabilizimin dhe diagnostikimin nga ndërhyrjet me indikacion.');
 reference('17.2','Apendicit akut · kirurgji ose trajtim i përzgjedhur',[
  'Konfirmo rrezikun/diagnozën me vlerësim dhe imazheri sipas rastit. Laparoskopia është trajtim standard; antibiotikët pa operacion janë alternativë vetëm për raste të zgjedhura, me ndjekje dhe diskutim të rikthimit.',
  'Antibiotiku perioperator dhe kursi pas operacionit varen nga perforimi, kontrolli i burimit dhe rreziku. Në apendicit të komplikuar me kontroll adekuat, udhëzimi WSES 2025 mbështet kurse të shkurtra 2–3 ditë; jo 7–14 ditë për çdo pacient.',
  'Jo lactulose në abdomenin akut para përjashtimit të obstruksionit. NPO, NG dhe kateterizimi kanë indikacione të veçanta.',hospital
 ],[R.appendix,R.bowel],'Ndan apendicitin e pakomplikuar nga ai i komplikuar dhe perioperativin nga kursi pas ndërhyrjes.');
 reference('17.3','Kolecistit akut · kontroll i infeksionit dhe kirurgji',[
  'Vlerëso ekografinë, analizat, sepsisin dhe rëndesën. Kolecistektomi laparoskopike e hershme kur pacienti është i përshtatshëm; NICE e rekomandon brenda një jave nga diagnoza.',
  'Antibiotiku zgjidhet sipas rëndesës dhe protokollit lokal, pastaj rivlerësohet pas kontrollit të burimit. Ceftriaxone nuk paraqitet si ndalim absolut për çdo sëmundje biliare; vendimi lidhet me pacientin dhe preparatin.',
  'Ushqyerja, hidrimi dhe analgjezia individualizohen. Jo NPO 2–3 ditë, lactulose, sonda ose disa antibiotikë si paketë e detyrueshme.',hospital
 ],[R.gall,R.fluid],'Zëvendëson paketën e pakushtëzuar me vlerësim dhe kirurgji të hershme.');
 reference('17.4','Gurë në fshikëzën e tëmthit · sipas simptomave',[
  'Gurët asimptomatikë në fshikëz/në pemë biliare ndryshe normale zakonisht nuk kërkojnë trajtim. Për gurë simptomatikë vlerëso kolecistektominë laparoskopike.',
  'Kolika e pakomplikuar nuk trajtohet rutinë me antibiotik. Zgjidh analgjezinë sipas kundërindikacioneve; ethet, verdhëza ose dhimbja e vazhdueshme kërkojnë hetim për komplikim.',
  'Nuk jepen rutinë sonda, kateter, laksativ ose disa ditë pa ushqim për çdo episod.'
 ],[R.gall],'Dallon gurët asimptomatikë, kolikën dhe infeksionin.');
 reference('17.5','Koledokolitiazë · konfirmim dhe pastrim i kanalit',[
  'Vlerëso bilirubinën/enzimat dhe ekografinë; MRCP ose EUS kur indikohen. ERCP përdoret për ndërhyrje të përshtatshme, jo si ekzaminim automatik për çdo kolikë.',
  'Pastrim i kanalit dhe plan për fshikëzën sipas ekipit. Antibiotikët kërkojnë kolangit ose indikacion procedural; nuk jepen për çdo gur të painfektuar.',hospital
 ],[R.gall,R.cholangitis],'Ndan hetimin, procedurën dhe indikacionin për antibiotik.');
 reference('17.6','Kolangit akut · antibiotik EDHE drenazh',[
  'Vlerësim urgjent për sepsis, kultura pa vonuar terapinë, kristaloide të titruara dhe antibiotik IV sipas rëndesës/rezistencës lokale.',
  'Drenazhi biliar është pjesë thelbësore e kontrollit të burimit. ASGE sugjeron dekompresion endoskopik brenda 48 orëve; shoku ose përkeqësimi kërkojnë veprim më urgjent.',
  'Antibiotikët janë EDHE me drenazhin kur indikohet, jo alternativë që e zëvendëson. Zgjatja dhe ngushtimi i spektrit varen nga kulturat dhe përgjigjja.',hospital
 ],[R.cholangitis,R.fluid],'Bën të qartë lidhjen EDHE me kontrollin e burimit.');
 save('17.7','Fisurë anale kronike · kujdes EDHE trajtim lokal',[
  one('Jashtëqitja dhe higjiena',care('Zbut jashtëqitjen dhe shmang sforcimin','Fibra, lëngje sipas gjendjes dhe zbutës jashtëqitjeje kur nevojitet; banja të vakëta dhe kontroll në persistencë.')),
  one('Pas dështimit të masave konservative',drug('Glyceryl trinitrate · pomadë rektale 4 mg/g (0,4%)','Shirit 2,5 cm ≈375 mg pomadë, që jep ≈1,5 mg GTN','Çdo 12 orë','Deri në qetësim; maksimumi 8 javë','Intra-anal','Mat shiritin sipas vijës së paketimit. Mund të japë dhimbje koke/hipotension; mos e përdor me sildenafil, tadalafil, vardenafil ose nitrate të tjera.')),
 ],[adult,'Vetëm për fisurë kronike të konfirmuar pas masave konservative. Jo në hipotension/hipovolemi, shtatzëni ose gjidhënie; vlerëso sëmundjet dhe barnat e tjera.','Përqendrimi është 0,4%, jo 2%. Antibiotiku, PPI dhe dilatimi anal i pakontrolluar nuk janë shtesa rutinë.'],[R.fissure],'Korrigjon përqendrimin pesëfish dhe shkruan dozën reale të pomadës.',{confirmation:'Fisurë kronike te i rrituri; masat konservative nuk mjaftuan dhe kundërindikacionet/ndërveprimet e nitrateve janë përjashtuar.'});
 save('17.8','Hemorroide · masa fillestare dhe vlerësim',[
  one('Zakonet',care('Fibra, lëngje dhe jashtëqitje pa sforcim','Rrit gradualisht fibrat; shmang qëndrimin e gjatë në tualet. Lëngjet përshtaten në kufizim kardiak/renal.')),
  one('Vlerësimi',care('Konfirmo shkakun e gjakderdhjes','Gjakderdhja rektale nuk i atribuohet automatikisht hemorroideve; anemia, humbja e peshës ose ndryshimi i jashtëqitjes kërkojnë hetim.')),
  one('Dhimbje · vetëm kur nevojitet',pain(),'I rritur ≥50 kg pa faktorë që kërkojnë ulje të dozës'),
 ],[adult,'Antibiotiku dhe gastroproteksioni nuk jepen rutinë. Diclofenac 100 mg dy herë/ditë tejkalon maksimumin e zakonshëm 150 mg/ditë; nuk përdoret si model.','Procedura zgjidhet sipas gradës dhe përgjigjes; nuk rekomandohet e njëjta ndërhyrje për çdo pacient.'],[R.hem,'https://www.medicines.org.uk/emc/product/7859/smpc'],'Heq dozën e tepërt të NSAID dhe terapitë pa indikacion.');
 reference('17.9','Absces anorektal · drenazh i shpejtë',[
  'Incizion dhe drenazh pa vonesë nga ekipi kirurgjikal; antibiotiku nuk e zëvendëson drenazhin.',
  'Antibiotikët rezervohen sidomos për celulit, shenja sistemike, imunosupresion ose indikacione të tjera të përcaktuara. Zgjidhet një regjim i përshtatshëm, jo ceftriaxone EDHE çdo alternativë orale.',
  'Vlerëso fistulën/Crohn dhe nevojën për ndjekje. Analgjezia dhe kujdesi i plagës përshtaten me ndërhyrjen.'
 ],[R.abscess],'Ndan drenazhin e domosdoshëm nga antibiotiku i përzgjedhur.');
 save('17.10','Sinus pilonidal · kujdes dhe referim sipas infeksionit',[
  one('Pa infeksion',care('Higjienë dhe vëzhgim','Pastroje zonën rregullisht; nuk nevojitet antibiotik për sinus asimptomatik. Mos e rruaj pa udhëzim.')),
  one('Dhimbje/ënjtje ose qelb',care('Vlerësim për drenazh të abscesit','Abscesi kërkon zakonisht incizion e drenazh po atë ditë. Antibiotiku dhe procedura për rikthimet zgjidhen sipas gjendjes; nuk janë e njëjta skemë për çdo sinus.')),
 ],['Ethet, celuliti ose përkeqësimi kërkojnë kontroll të shpejtë. Ky është plan kujdesi/referimi, jo zëvendësim i drenazhit.'],['https://www.nhs.uk/conditions/pilonidal-sinus/'],'Dallon sinusin e painfektuar nga abscesi.');
 reference('17.11','Pankreatit akut · lëngje të titruara dhe ushqyerje',[
  'Shtrim/vlerësim i rëndesës, shkakut dhe organeve. Kristaloidi izotonik titrohet me rivlerësim të shpeshtë; jo shpejtësi fikse të lartë për çdo pacient.',
  'Nuk jepen antibiotikë profilaktikë për nekrozë sterile. Infeksioni i dyshuar/konfirmuar kërkon antibiotik dhe kontroll burimi sipas ekipit.',
  'Mos e mbaj automatikisht pa ushqim. Ushqyerja orale sipas tolerancës; në sëmundje mesatarisht të rëndë/të rëndë ushqyerje enterale brenda 72 orëve kur është e mundur. Parenteralja kur enteralja dështon/kundërindikohet.',hospital
 ],[R.pancreas,R.fluid],'Heq NPO, antibiotikun dhe reanimimin agresiv universal.');
 reference('17.12','Obstruksion intestinal · përjashto isheminë/perforimin',[
  'Vlerësim urgjent kirurgjikal dhe CT sipas rastit; reanimim me kristaloide, elektrolite dhe dekompresion kur indikohet. Peritonizmi, strangulimi ose ishemia kërkojnë ndërhyrje urgjente.',
  'Në obstruksion mekanik mos jep metoclopramide ose laksativ rutinë. Prova konservative deri rreth 72 orë vlen për obstruksion adheziv të përzgjedhur pa shenja alarmi, nën monitorim kirurgjikal; jo për çdo shkak.',hospital
 ],[R.bowel,'https://www.medicines.org.uk/emc/product/1561/smpc'],'Heq prokinetikun në obstruksion mekanik dhe kushtëzon trajtimin konservativ.');
 reference('17.13','Peritonit bakterial spontan · terapi spitalore',[
  'Paracentezë diagnostike e hershme; vlerëso PMN/kulturën dhe përjashto peritonitin sekondar. Antibiotiku IV zgjidhet sipas origjinës, rëndesës dhe rezistencës; metronidazole nuk është shtesë rutinë për SBP.',
  'Albumina IV me antibiotikun: skema e referencës 1,5 g/kg në ditën 1 dhe 1 g/kg në ditën 3; ekipi vlerëson indikacionin, rrezikun renal dhe mbingarkesën. Përqendrimi i albuminës nuk është doza në gram.',
  'Shmang NSAID në cirrozë me ascit. Enoxaparin nuk injektohet IM; profilaksia përcaktohet sipas gjakderdhjes/veshkave. Glukoza 5%/10% nuk është reanimim izotonik.',hospital
 ],[R.sbp,R.fluid,'https://www.medicines.org.uk/emc/product/4499/smpc'],'Ndan SBP nga peritoniti sekondar dhe saktëson albuminën/rrugët e dhënies.');
 reference('17.14','Peritonit sekondar · antibiotik EDHE kontroll burimi',[
  'Vlerësim urgjent për perforim/iskemi/absces, reanimim të titruar dhe kontroll kirurgjikal ose drenazh. Antibiotiku nuk e zëvendëson ndërhyrjen.',
  'Regjimi duhet të mbulojë shkaktarët sipas burimit dhe rrezikut; piperacillin/tazobactam ose carbapenem nuk kërkojnë metronidazole shtesë automatikisht. Ngushto spektrin dhe afatin pas kulturave/kontrollit të burimit.',
  'Analgjezia, VTE profilaksia dhe lëngjet individualizohen. Jo enoxaparin IM, NSAID universal ose volum ditor fiks pa bilanc.',hospital
 ],[R.fluid,R.abscess,R.sbp],'Bën të qartë EDHE me kontrollin e burimit dhe shmang mbulim të dyfishtë anaerob.');
 const eyeRed='Dhimbja, fotofobia, shikimi i ulur, sekrecioni shumë i bollshëm ose lentet e kontaktit kërkojnë vlerësim për sëmundje korneale/urgjencë; nuk trajtohen si konjuktivit i thjeshtë.';
 for(const [key,title]of [['18.1','Hordeolum · kompresë dhe higjienë'],['18.2','Kalazion · kompresë dhe ndjekje']])save(key,title,[one('Kompresa',care('Kompresë e pastër e ngrohtë, jo përvëluese','Mbaje 5–10 minuta, 2–4 herë/ditë. Mos e shtrydh lezionin; pa lente ose makijazh deri në qetësim.')),one('Kontrolli',care('Rivlerëso në persistencë ose përhapje','Kalazioni i pakomplikuar është kryesisht inflamator. Antibiotiku nuk jepet rutinë; celuliti, dhimbja e fortë ose shikimi i prekur kërkojnë kontroll të shpejtë. Lezioni i përsëritur në të njëjtin vend vlerësohet nga oftalmologu.'))],[eyeRed],['https://www.nhs.uk/conditions/stye/','https://store.aao.org/media/resources/051214/Stye-Chalazion_09-19.pdf'],'Heq antibiotikët rutinë dhe ndan kujdesin nga drenazhi specialistik.');
 reference('18.3','Uveit · ekzaminim oftalmologjik urgjent',[
  'Përcakto segmentin e prekur, shkakun, presionin intraokular dhe shikimin. Dhimbja/fotofobia ose shikimi i ulur kërkojnë kontroll urgjent.',
  'Steroidi okular dhe cikloplegjiku zgjidhen pas ekzaminimit; përjashto veçanërisht keratitin herpetik epitelial. Preparati, frekuenca dhe ulja graduale varen nga aktiviteti dhe përgjigjja.',
  'Mos kalo automatikisht në NSAID oral ose steroid të fuqishëm pa afat. Monitoro presionin dhe efektet anësore.'
 ],[R.trauma,'https://www.college-optometrists.org/clinical-guidance/clinical-management-guidelines/uveitis_anterior'],'Kërkon diagnozë dhe monitorim para steroideve.');
 save('18.4','Konjuktivit bakterial · një antibiotik okular',[
  one('Kur antibiotiku indikohet',drug('Moxifloxacin · pika okulare 0,5% (5 mg/mL)','1 pikë në syrin/sytë e prekur','3 herë në ditë','Zakonisht përmirësim brenda 5 ditëve; vazhdo 2–3 ditë pas përmirësimit sipas produktit','Në sy','Në mungesë përmirësimi brenda 5 ditëve rishiko diagnozën/trajtimin. Mos prek syrin me majën e shishes; pa lente kontakti.')),
  one('Higjiena',care('Laj duart dhe mos ndaj peshqirët','Pastro sekrecionet butë; shmang ndotjen e shishes dhe kalimin mes syve.')),
 ],[adult,'Rastet e lehta mund të përmirësohen pa antibiotik. Mos shto tobramycin, antibiotik tjetër ose steroid automatikisht.',eyeRed],[R.moxi,R.eye],'Plotëson frekuencën e munguar dhe lidh afatin me etiketën konkrete.',{confirmation:'Konjuktivit bakterial i pakomplikuar; antibiotiku indikohet dhe shenjat okulare të alarmit janë përjashtuar.'});
 reference('18.5','Konjuktivit klamidial · trajtim sistemik dhe partnerët',[
  'Konfirmo diagnozën dhe vlerëso për IST. Pikat okulare vetëm nuk mjaftojnë për infeksionin klamidial.',
  'Te adoleshenti/i rrituri jo shtatzënë: doxycycline 100 mg nga goja dy herë/ditë për 7 ditë është skema CDC; azithromycin 1 g një herë është alternativë në raste të përshtatshme, pa përsëritje automatike pas një jave.',
  'Shtatzënia dhe neonati kanë skemë tjetër. Trajto partnerët, këshillo shmangie të kontaktit seksual deri në trajtimin përkatës të të dyve dhe planifiko ritestim; kërko vlerësim oftalmologjik.'
 ],['https://www.cdc.gov/std/treatment-guidelines/chlamydia.htm',R.eye],'Ndan alternativat sistemike nga trajtimi lokal dhe skemat neonatale.');
 save('18.6','Konjuktivit alergjik · Olopatadine 0,1%',[
  one('Trajtimi lokal',drug('Olopatadine · pika okulare 1 mg/mL (0,1%)','1 pikë në syrin/sytë e prekur','2 herë në ditë, rreth 8 orë larg','Gjatë simptomave; deri 4 muaj vetëm nëse nevojitet sipas produktit','Në sy','Kompresa të freskëta dhe shmangie alergjeni; mos e fërko syrin. Ndaji pikat e ndryshme të paktën 5 minuta. Jo përdorim në gjidhënie; shtatzënia kërkon vlerësim.')),
 ],[adult,'Ky interval vlen për 0,1%; përqendrimet e tjera mund të kenë frekuencë tjetër. Antihistaminiku oral zgjidhet kur ka nevojë sistemike, jo dyfishim rutinë 10 mg dy herë/ditë.',eyeRed],[R.olop,R.eye],'Specifikon përqendrimin dhe shmang antihistaminikë/NSAID shtesë pa indikacion.');
 save('18.7','Konjuktivit viral · kujdes simptomatik',[
  one('Qetësimi',care('Kompresa të freskëta dhe lubrifikant okular kur nevojitet','Higjienë e duarve; mos ndaj peshqirë ose pika. Shmang lentet gjatë sëmundjes.')),
  one('Ndjekja',care('Rivlerëso në përkeqësim ose shikim të prekur','Antibiotiku nuk vepron ndaj adenovirusit; steroidi okular përdoret vetëm për indikacion të përcaktuar nga oftalmologu.')),
 ],[eyeRed,'Lotët pa gjak dhe kontakti shoqëror i zakonshëm nuk janë rrugë transmetimi të HIV. Mos e barazo HIV me ngjitshmërinë e konjuktivitit adenoviral.'],[R.eye,'https://www.cdc.gov/hiv/about/index.html'],'Heq antibiotikun rutinë dhe saktëson shënimin e transmetimit.');
 reference('18.8','Herpes okular · cakto shtresën e prekur',[
  'Kontroll oftalmologjik po atë ditë. Keratiti epitelial, stromal dhe uveiti nuk kanë të njëjtin regjim.',
  'Për pomadën okulare aciclovir AGEPHA 30 mg/g (3%): shirit 1 cm në qesen konjuktivale të poshtme, 5 herë/ditë rreth çdo 4 orë; vazhdo të paktën 3 ditë PAS shërimit. Nuk është kurs total 3-ditor dhe kremi për lëkurë nuk e zëvendëson.',
  'Steroidi nuk fillohet në infeksion epitelial pa mbikëqyrje. Doza orale dhe nevoja për terapi sistemike përcaktohen sipas prekjes dhe veshkave.'
 ],[R.hsv,'https://www.nhs.uk/conditions/herpes-simplex-eye-infections/'],'Korrigjon kohëzgjatjen dhe ndan pomadën okulare nga kremi dermatologjik.');
 reference('18.9','Blefarit pediatrik · higjienë dhe dozë sipas fëmijës',[
  'Higjiena e qepallave dhe kompresa e ngrohtë e sigurt janë baza. Ekzaminim për tipin e blefaritit, kornenë dhe nevojën për antibiotik.',
  'Azithromycin 200 mg/5 mL është përqendrim, jo dozë për fëmijën. Kur indikohet, duhen pesha, mg/kg, mL dhe kursi i plotë.',
  'Kombinimi steroid/antibiotik për një muaj nuk zbatohet automatikisht. Steroidi kërkon kontroll oftalmologjik dhe monitorim të presionit.'
 ],[R.bleph],'Heq vëllimin pediatrik të papërcaktuar dhe steroidin shumëjavor rutinë.');
 save('18.10','Blefarit te i rrituri · higjienë e qepallave',[
  one('Kompresa dhe pastrimi',care('Kompresë e ngrohtë, masazh dhe higjienë e buzës së qepallës','Përdor material të pastër dhe temperaturë jo përvëluese; përsërite rregullisht sipas tolerancës. Lubrifikant në sy të thatë kur nevojitet.')),
  one('Ndjekja',care('Rivlerëso në persistencë ose prekje korneale','Antibiotiku lokal/oral përzgjidhet sipas nëntipit dhe rozacesë. Steroidi okular është kurs i mbikëqyrur, jo shtesë automatike për një muaj.')),
 ],[eyeRed],[R.bleph,'https://www.cuh.nhs.uk/patient-information/blepharitis/'],'Vendos higjienën si bazë dhe largon antibiotikun sistemik/steroidin pa afat.');
 reference('18.11','Abrazion korneal · ekzaminim dhe ndjekje',[
  'Përjashto penetrimin dhe trupin e huaj; vlerëso shikimin, fluoresceinën dhe përdorimin e lenteve. Infiltrati ose dhimbja/shikimi që përkeqësohen kërkojnë kontroll urgjent.',
  'Antibiotiku zgjidhet sipas rrezikut; përdoruesit e lenteve kërkojnë mbulim të përshtatshëm dhe vlerësim për keratit. Analgjezia përshtatet, pa NSAID oral EDHE okular rutinë.',
  'Nuk jepet anestezik lokal për vetëpërdorim rutinë në shtëpi dhe nuk bëhet mbulim kompresiv automatik.'
 ],[R.trauma],'Ndan dëmtimin sipërfaqësor nga penetrimi/keratiti dhe përcakton ndjekjen.');
 save('18.12','Hemorragji subkonjuktivale · vlerësim dhe vëzhgim',[
  one('Kontrolli',care('Konfirmo shikim të ruajtur dhe mungesë dhimbjeje/traume serioze','Mat presionin arterial dhe vlerëso përsëritjen, çrregullimet e koagulimit dhe barnat. Mos ndërprit vetë antikoagulantin/antiagregantin.')),
  one('Ndjekja',care('Qetësim dhe lubrifikant në irritim kur nevojitet','Zakonisht përthithet vetë. Dhimbja, ulja e shikimit ose trauma kërkojnë hetim tjetër.')),
 ],['Nuk nevojitet antibiotik ose steroid për hemorragji të thjeshtë.'],[R.trauma],'Heq trajtimin e panevojshëm dhe ruan kontrollin e shkakut.');
 reference('18.13','Djegie kimike e syrit · shpëlarje menjëherë',[
  'Nis menjëherë shpëlarjen me shumë ujë të pastër ose solucion të disponueshëm; mos e vono për anamnezë, transport ose përgatitje solucioni tjetër. Hiq lentet kur mundet pa vonesë.',
  'Shpëlaj të paktën 20 minuta dhe vazhdo deri në pH fiziologjik të qëndrueshëm, me rikontroll pas ndalimit. 2 L ose 20 minuta nuk janë kufi maksimal. Kontrollo e hiq grimcat nga profesionisti.',
  'Referim urgjent po atë ditë. Steroidi, cikloplegjiku, antibiotiku dhe preparatet e përbëra zgjidhen nga oftalmologu sipas dëmtimit dhe presionit.'
 ],['https://www.college-optometrists.org/clinical-guidance/clinical-management-guidelines/trauma_chemical',R.trauma],'Vendos shpëlarjen para gjithçkaje dhe pikën përfundimtare sipas pH.');
 reference('18.14','Trup i huaj okular · përjashto penetrimin',[
  'Vlerëso mekanizmin dhe shikimin. Dyshimi për penetrim kërkon mbrojtëse të fortë pa presion dhe referim urgjent; mos tërhiq objektin e ngulitur dhe mos bëj tonometri mbi glob të hapur.',
  'Heqja sipërfaqësore kryhet nga profesionisti me pajisje të përshtatshme; rishiko mbetjen/unazën e ndryshkut, kornenë dhe tetanozin sipas plagës.',
  'Jo mbulim kompresiv ose anestezik lokal në shtëpi si masë rutinë. Përcakto antibiotikun dhe kontrollin sipas dëmtimit/lenteve.'
 ],[R.trauma],'Ndan heqjen sipërfaqësore nga urgjenca penetruese.');
 reference('18.15','Mbyllje akute e këndit · urgjencë oftalmologjike',[
  'Trajtim i menjëhershëm me matje/rivlerësim të presionit dhe përcaktim të mekanizmit. Për bllok pupilar, iridotomia është trajtim përfundimtar kur teknikisht mundësohet.',
  'Brinzolamide 10 mg/mL = 1%, jo 0,1%. Combigan është brimonidine 0,2% + timolol 0,5%; nuk është dorzolamide. Ndaji barnat e ndryshme okulare të paktën 5 minuta dhe kontrollo astmën, bradikardinë/AV-bllokun dhe veshkat.',
  'Pilocarpine nuk përdoret verbërisht për çdo mekanizëm dhe presion. Mannitol 250–300 mL pa përqendrim/peshë nuk është dozë e plotë; osmoterapia dhe përsëritja kërkojnë monitorim spitalor.'
 ],['https://www.rcophth.ac.uk/resources-listing/management-of-angle-closure-glaucoma-guideline/','https://www.medicines.org.uk/emc/product/3819/smpc','https://www.medicines.org.uk/emc/product/3909/smpc'],'Korrigjon preparatet/përqendrimet dhe heq dozimin universal të urgjencës.');
};
