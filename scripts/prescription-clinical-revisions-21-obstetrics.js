'use strict';
module.exports=({save,reference,drug,care,opt,group,one})=>{
 const R={cough:'https://www.nice.org.uk/guidance/ng120/chapter/Recommendations',cap:'https://www.nice.org.uk/guidance/ng250/chapter/Recommendations',uti:'https://www.nice.org.uk/guidance/ng109/chapter/Recommendations',typhoid:'https://www.cdc.gov/typhoid-fever/hcp/clinical-guidance/index.html',malaria:'https://www.who.int/publications/i/item/guidelines-for-malaria',hbv:'https://www.who.int/publications/i/item/9789240090903',candida:'https://www.cdc.gov/std/treatment-guidelines/candidiasis.htm',chlam:'https://www.cdc.gov/std/treatment-guidelines/chlamydia.htm',pid:'https://www.cdc.gov/std/treatment-guidelines/pid.htm',trich:'https://www.cdc.gov/std/treatment-guidelines/trichomoniasis.htm',bv:'https://www.cdc.gov/std/treatment-guidelines/bv.htm',partner:'https://www.hivguidelines.org/guideline/sti-bv/',hmb:'https://www.nice.org.uk/guidance/ng88/chapter/Recommendations',txa:'https://www.medicines.org.uk/emc/product/14622/smpc',endo:'https://www.nice.org.uk/guidance/ng73/chapter/Recommendations',pcos:'https://prod.asrm.org/practice-guidance/practice-committee-documents/recommendations-from-the-2023-international-evidence-based-guideline-for-the-assessment-and-management-of-polycystic-ovary-syndrome/',cyst:'https://www.rcog.org.uk/for-the-public/browse-our-patient-information/ovarian-cysts-before-the-menopause/'};
 const pregnant='Kontrollo javën e shtatzënisë, alergjitë, funksionin renal/hepatik dhe barnat e tjera. Ethet e vazhdueshme, dispnea ose gjendja e rënduar kërkojnë vlerësim të shpejtë obstetrik.';
 const para=()=>drug('Paracetamol','500–1000 mg','Çdo 6–8 orë sipas nevojës','Për kohën më të shkurtër të nevojshme','Nga goja','Për të rriturën ≥50 kg pa faktorë hepatikë: jo mbi 4 g/24 orë nga të gjitha produktet. Pesha e ulët ose faktorët hepatikë kërkojnë kufi më të ulët.');
 for(const [key,title]of [['21.1','Kollë e thatë me ethe në shtatzëni'],['21.2','Kollë me sekrecione dhe ethe në shtatzëni']])save(key,title,[
  one('Kujdesi fillestar',care('Lëngje, pushim dhe vlerësim i shkakut','Lëngje sipas tolerancës; pije të ngrohta ose mjaltë mund të qetësojnë kollën. Shmang avullin përvëlues. Sekrecionet vetëm nuk provojnë infeksion bakterial.')),
  one('Ethe ose dhimbje',para(),'Vetëm nëse nevojitet; i rritur ≥50 kg dhe pa faktorë që kërkojnë ulje doze'),
 ],[pregnant,'Antibiotiku jepet për diagnozë bakteriale të përcaktuar. Antihistaminikët sedativë dhe shurupet e kombinuara nuk janë shtesa rutinë.'],[R.cough,'https://www.medicinesinpregnancy.org/leaflets-a-z/pain-relief/'],'Heq kombinimin automatik të antibiotikëve dhe shurupet pa përqendrim.');
 for(const [key,title]of [['21.3','Ethe enterike në shtatzëni · kulturë dhe antibiogram'],['21.4','Ethe enterike të rënda në shtatzëni · shtrim']])reference(key,title,[
  'Merr hemokultura pa vonuar trajtimin; regjimi varet nga rëndesa, udhëtimi dhe rezistenca. Azithromycin ose ceftriaxone mund të jenë zgjedhje në rrethana të përshtatshme; rezistenca ndaj të dyjave ndryshon sipas origjinës.',
  'Cefixime 20 mg/kg DY HERË në ditë nuk është një dozë standarde për t’u kopjuar. Vendos dozën dhe kursin për antibiotikun e zgjedhur me infektologun/obstetrin.',
  'Hidratimi, antiemetiku dhe kalimi IV–oral varen nga toleranca. Ondansetron/metoclopramide dhe PPI nuk përshkruhen automatikisht për 30 ditë.',pregnant
 ],[R.typhoid],'Ndan zgjedhjen sipas rezistencës dhe rëndesës; pengon dozën e dyfishuar dhe trajtimet shoqëruese pa indikacion.');
 reference('21.5','Malaria e pakomplikuar në shtatzëni · ACT',[
  'Për P. falciparum të pakomplikuar, WHO preferon artemether/lumefantrine edhe në tremujorin e parë; quinine/clindamycin nuk është zgjedhje universale e parë.',
  'Për peshë ≥35 kg, tableta 20/120 mg përdor 4 tableta për marrje: në orën 0, pas 8 orësh, pastaj çdo 12 orë për dy ditët pasuese; 6 marrje gjithsej. Tableta 80/480 mg nuk ka të njëjtin numër tabletash.',
  'Konfirmo specien, rëndesën, peshën dhe formulimin. Merret me ushqim/qumësht kur tolerohet; të vjellat ose shenjat e malaries së rëndë kërkojnë trajtim spitalor. Primaquine shmanget në shtatzëni.'
 ],[R.malaria,'https://www.cdc.gov/malaria/hcp/clinical-guidance/treatment-of-uncomplicated-malaria.html'],'Përditëson tremujorin e parë dhe kohën e gjashtë dozave.');
 reference('21.6','Malaria e rëndë në shtatzëni · urgjencë',[
  'Shtrim urgjent, monitorim maternal/fetal, glukozës dhe organeve. Artesunate parenteral është zgjedhja e parë në të gjithë tremujorët.',
  'Për të rriturën: artesunate 2,4 mg/kg IV ose IM në orën 0, 12 dhe 24, pastaj çdo 24 orë derisa të tolerohet terapia orale; të paktën 24 orë parenteral, pastaj kurs i plotë ACT oral sipas protokollit.',
  'Rikonstituimi dhe hollimi varen nga produkti. Artemether është alternativë kur artesunate mungon, jo bar shtesë rutinë. Ndiq aneminë hemolitike të vonuar pas artesunate.'
 ],[R.malaria,'https://www.cdc.gov/malaria/hcp/clinical-guidance/treatment-of-severe-malaria.html'],'Ndan alternativat parenterale dhe fazën pasuese orale.');
 save('21.7','Cistit në shtatzëni · zgjidh një antibiotik',[
  group('Antibiotiku sipas kulturës',[opt('Nitrofurantoin MR',drug('Nitrofurantoin · çlirim i modifikuar','100 mg','2 herë në ditë','7 ditë','Nga goja','Vetëm për UTI të poshtme, eGFR ≥45; shmang afër terminit dhe në mungesë G6PD.')),opt('Cefalexin',drug('Cefalexin','500 mg','2 herë në ditë','7 ditë')),opt('Amoxicillin · vetëm i ndjeshëm',drug('Amoxicillin','500 mg','3 herë në ditë','7 ditë','Nga goja','Vetëm kur kultura tregon ndjeshmëri.'))]),
 ],[pregnant,'Merr urinë për kulturë para antibiotikut dhe përshtate me rezultatin. Ethet, dhimbja e krahut ose të vjellat kërkojnë vlerësim për pielonefrit; nitrofurantoin nuk e trajton.','Kontroll nëse nuk përmirësohet brenda 48 orëve; planifiko kulturën pas trajtimit sipas obstetrit. Cranberry nuk zëvendëson antibiotikun.'],[R.uti],'Plotëson kursin 7-ditor dhe ndan cistitin nga pielonefriti.',{confirmation:'UTI e poshtme në shtatzëni, pa shenja pielonefriti; kultura, veshkat, alergjitë, G6PD dhe afërsia e terminit janë vlerësuar.'});
 reference('21.8','Gurë renalë në shtatzëni · vlerësim dhe analgjezi',[
  'Vlerëso me ekografi, analizë/kulturë urine dhe funksion renal. Obstruksioni me infeksion, sepsis ose dhimbja e pakontrolluar kërkojnë urolog/obstetër urgjentisht.',
  'Hidratim normal sipas gjendjes dhe analgjezi e përshtatshme për shtatzëninë. Antibiotik vetëm për infeksion, jo për gurin e painfektuar. Mos detyro lëngje në obstruksion.',
  'Tamsulosin, drotaverine dhe phenazopyridine nuk futen si paketë rutinë. NSAID-të kufizohen veçanërisht nga java 20 dhe shmangen në fund të shtatzënisë.'
 ],['https://uroweb.org/guidelines/urolithiasis/chapter/guidelines','https://www.fda.gov/drugs/drug-safety-and-availability/fda-recommends-avoiding-use-nsaids-pregnancy-20-weeks-or-later-because-they-can-result-low-amniotic'],'Heq barnat e pakushtëzuara dhe antibiotikët për gurë sterilë.');
 save('21.9','Pneumoni e lehtë në shtatzëni · trajtim oral',[
  group('Zgjidh sipas alergjisë dhe patogjenit',[opt('Amoxicillin',drug('Amoxicillin','500 mg','3 herë në ditë','5 ditë; rivlerëso stabilitetin')),opt('Erythromycin · kur amoxicillin nuk përshtatet',drug('Erythromycin','500 mg','4 herë në ditë','5 ditë','Nga goja','Vlerëso ndërveprimet, QT dhe tolerancën.'))]),
 ],[pregnant,'Konfirmo diagnozën dhe përshtatshmërinë për trajtim jashtë spitalit. Zgjerimi i spektrit, makrolidi shtesë dhe kursi më i gjatë kërkojnë arsye klinike.'],[R.cap],'Plotëson kursin dhe e bën makrolidin alternativë sipas situatës.',{confirmation:'Pneumoni e lehtë e vlerësuar, paciente stabile për trajtim oral; shtatzënia, alergjitë dhe ndërveprimet janë kontrolluar.'});
 for(const [key,title,note]of [
  ['21.10','Pneumoni në shtatzëni me rrezik shtesë','Sëmundjet shoqëruese vetëm nuk kërkojnë automatikisht cefalosporinë EDHE makrolid. Rëndesa, alergjia, patogjenët atipikë dhe rezistenca përcaktojnë regjimin.'],
  ['21.11','Pneumoni në shtatzëni · trajtim spitalor','Zgjidh një beta-laktam sipas rëndesës; makrolidi shtohet kur indikohet. Steroidi sistemik nuk është shtesë rutinë për çdo pneumoni jo të rëndë.'],
  ['21.12','Pneumoni në shtatzëni · rrezik Pseudomonas','Dokumento faktorët realë për Pseudomonas, merr kultura dhe kërko mikrobiologun. Zgjidh regjimin antipseudomonal dhe ngushtoje sipas rezultateve; nuk kombinohen të gjithë antibiotikët e listës.']
 ])reference(key,title,[note,'Oksigjeni, lëngjet dhe profilaksia trombotike varen nga hipoksemia, perfuzioni, veshkat dhe rreziku i gjakderdhjes. Enoxaparin jepet SC kur indikohet; jo IM. PPI nuk shtohet pa indikacion.',pregnant],[R.cap,'https://www.nice.org.uk/guidance/ng255/chapter/managing-suspected-sepsis'],'Ndan skemën bazë nga shtesat me indikacion dhe monitorimin spitalor.');
 reference('21.13','Hepatit B në shtatzëni · mbrojtja e nënës dhe foshnjës',[
  'Vlerëso indikacionin për trajtim të nënës veçmas nga profilaksia e transmetimit. TDF mund të përdoret në shtatzëni; nuk është ndalim universal.',
  'Për HBsAg pozitiv me HBV DNA ≥200 000 IU/mL ose HBeAg pozitiv, planifiko TDF me hepatologun/obstetrin sipas WHO. Fillimi, ndërprerja dhe ndjekja postpartum varen nga indikacioni.',
  'Foshnja duhet të marrë dozën e lindjes të vaksinës HBV brenda 24 orëve dhe serinë e plotë; HBIG sipas protokollit. Lamivudine/telbivudine nuk shtohen bashkë rutinë. Dietat për humbje peshe dhe PPI/lactulose nuk janë paketë standarde e shtatzënisë.'
 ],[R.hbv],'Dallon profilaksinë amtare, trajtimin afatgjatë dhe imunizimin neonatal.');
 save('21.14','Kandidiazë vaginale në shtatzëni · trajtim lokal',[
  group('Zgjidh një azol lokal',[opt('Clotrimazole 1%',drug('Clotrimazole · krem vaginal 1%','5 g','Në mbrëmje','7 ditë','Intravaginal','Aplikimi gjatë shtatzënisë sipas udhëzimit të produktit/obstetrit.')),opt('Miconazole 2%',drug('Miconazole · krem vaginal 2%','5 g','Në mbrëmje','7 ditë','Intravaginal'))]),
 ],['Konfirmo diagnozën; sekrecioni vetëm nuk provon kandidiazë. Në shtatzëni përdoret azol lokal për 7 ditë; shmang fluconazole oral dhe acidin borik.','Metronidazole nuk trajton Candida. Mënyra e aplikimit zgjidhet me pëlqimin e pacientes dhe produktin; statusi martesor nuk e përcakton trajtimin.'],[R.candida],'Korrigjon azolin oral në shtatzëni dhe antibiotikun pa indikacion.',{confirmation:'Kandidiazë simptomatike në shtatzëni e vlerësuar; produkti vaginal dhe mënyra e aplikimit janë të përshtatshme.'});
 save('21.15','Chlamydia · zgjidh skemën sipas shtatzënisë',[
  group('Një regjim i plotë',[opt('Jo shtatzënë',drug('Doxycycline','100 mg','2 herë në ditë','7 ditë')),opt('Shtatzënë · Azithromycin',drug('Azithromycin','1 g','Një marrje','Dozë e vetme')),opt('Shtatzënë · alternativë',drug('Amoxicillin','500 mg','3 herë në ditë','7 ditë'))]),
  one('Partnerët dhe ndjekja',care('Vlerëso dhe trajto partnerët','Pa marrëdhënie deri 7 ditë pas dozës së vetme ose përfundimit të kursit dhe trajtimit të partnerit. Ritestim pas rreth 3 muajsh; në shtatzëni NAAT për shërim rreth 4 javë pas trajtimit.')),
 ],['Testo për gonorre, HIV dhe sifiliz sipas rastit. Metronidazole shtohet vetëm për një indikacion tjetër; nuk është pjesë rutinë e chlamydia së pakomplikuar.'],[R.chlam],'Ndan shtatzëninë dhe heq metronidazolin universal.',{confirmation:'Chlamydia e pakomplikuar, pa shenja PID; është zgjedhur dega e saktë për shtatzëninë dhe janë kontrolluar alergjitë.'});
 save('21.16','Sekrecione vaginale · trajto shkakun',[
  one('Vlerësimi',care('Dallo sekrecionin normal nga infeksioni','Pa erë, prurit ose dhimbje mund të jetë fiziologjik. Në sekrecion patologjik bëj ekzaminim/testim sipas dyshimit për vaginit, cervicit ose PID.')),
  one('Kujdesi lokal',care('Higjienë e butë nga jashtë','Shmang shpëlarjet intravaginale dhe produktet që irritojnë. Mos jep kombinim antibiotikësh pa diagnozë.')),
 ],['Dhimbja pelvike, ethet, shtatzënia ose gjakderdhja kërkojnë vlerësim të drejtpërdrejtë.'],[R.candida,R.chlam,R.bv],'Heq polifarmacinë për leukorre fiziologjike.');
 for(const key of ['21.17','21.18'])save(key,'PID i lehtë–mesatar · një regjim i kombinuar',[
  one('Doza fillestare',drug('Ceftriaxone','500 mg','Një herë','Dozë e vetme','Intramuskular','Në peshë >150 kg me gonorre të dokumentuar përdoret 1 g sipas CDC.')),
  one('Kursi oral',drug('Doxycycline','100 mg','2 herë në ditë','14 ditë')),
  one('Mbulimi anaerob',drug('Metronidazole','500 mg','2 herë në ditë','14 ditë')),
 ],['Të tria jepen EDHE së bashku. Rivlerëso brenda 72 orëve; trajto partnerët dhe vlerëso IST.','Shtatzënia, abscesi, sëmundja e rëndë ose pamundësia për trajtim oral kërkojnë shtrim. Kinoloni ose clindamycin vaginal nuk e zëvendësojnë këtë regjim.'],[R.pid],'Korrigjon rrugën/dozën e ceftriaxone dhe lidhjen EDHE të kursit 14-ditor.',{confirmation:'PID i lehtë–mesatar jashtë shtatzënisë; pacientja mund të trajtohet jashtë spitalit, alergjitë dhe ndjekja brenda 72 orëve janë vlerësuar.'});
 reference('21.19','PID i rëndë ose absces tuboovarian · shtrim',[
  'Vlerësim gjinekologjik urgjent. Regjimi parenteral CDC: ceftriaxone 1 g IV çdo 24 orë EDHE doxycycline 100 mg çdo 12 orë EDHE metronidazole 500 mg çdo 12 orë; rruga orale e dy të fundit kur tolerohet.',
  'Pas përmirësimit, zakonisht 24–48 orë, kalim sipas ekipit në doxycycline/metronidazole oral për 14 ditë gjithsej. Abscesi kërkon mbulim anaerob dhe vlerësim për drenazh.',
  'Në shtatzëni kërkohet regjim specialistik tjetër. Një injeksion ceftriaxone 2 g nuk zëvendëson trajtimin spitalor të plotë.'
 ],[R.pid],'Dallon skemën spitalore të kombinuar nga një dozë ambulatore.');
 save('21.20','Trikomoniazë te gruaja · terapi orale',[
  one('Trajtimi',drug('Metronidazole','500 mg','2 herë në ditë','7 ditë')),
  one('Partnerët',care('Trajtim i njëkohshëm dhe ndjekje','Partnerët trajtohen sipas skemës së tyre; pa marrëdhënie derisa të përfundojë trajtimi dhe të qetësohen simptomat. Ritestim i gruas rreth 3 muaj më vonë.')),
 ],['Shtatzëna simptomatike mund të trajtohet në çdo tremujor pas vlerësimit. Tinidazole shmanget në shtatzëni; clindamycin dhe xheli vaginal i metronidazolit nuk trajtojnë në mënyrë adekuate Trichomonas.'],[R.trich],'Vendos kursin e rekomanduar për gratë dhe heq alternativat joefektive.',{confirmation:'Trikomoniazë e vlerësuar, jo rast rezistent; alergjitë, shtatzënia/gjidhënia dhe ndërveprimet janë kontrolluar.'});
 save('21.21','Kandidiazë vaginale e pakomplikuar · një trajtim',[
  group('Zgjidh një',[opt('Fluconazole · vetëm jo shtatzënë',drug('Fluconazole','150 mg','Një marrje','Dozë e vetme')),opt('Clotrimazole lokal',drug('Clotrimazole · krem vaginal 1%','5 g','Në mbrëmje','7–14 ditë sipas vlerësimit','Intravaginal'))]),
 ],['Në shtatzëni përdor skemën lokale 7-ditore të shtatzënisë. Forma e rëndë, rikthimet, imunosupresioni ose jo-albicans kërkojnë skemë tjetër.','Në formë të rëndë jashtë shtatzënisë, kur zgjidhet fluconazole, dy dozat ndahen 72 orë; nuk përsëritet pa rivlerësim.'],[R.candida],'Dallon episodin e thjeshtë nga format e rënda dhe shtatzënia.',{confirmation:'Kandidiazë e pakomplikuar te pacientja jo shtatzënë; ndërveprimet, faktorët hepatikë dhe kundërindikacionet janë kontrolluar.'});
 save('21.22','Vaginozë bakteriale simptomatike · zgjidh një',[
  group('Një regjim i plotë',[opt('Metronidazole oral',drug('Metronidazole','500 mg','2 herë në ditë','7 ditë')),opt('Metronidazole vaginal',drug('Metronidazole · xhel vaginal 0,75%','5 g','1 herë në ditë','5 ditë','Intravaginal')),opt('Clindamycin vaginal',drug('Clindamycin · krem vaginal 2%','5 g','Në mbrëmje','7 ditë','Intravaginal','Mund të dobësojë prezervativët/diafragmat prej lateksi gjatë përdorimit dhe 5 ditë pas tij.'))]),
 ],['Rivlerëso në rikthim. Në BV simptomatike rekurrente diskuto trajtimin e njëkohshëm të partnerit sipas udhëzimit aktual; nuk jepet i njëjti produkt vaginal partnerit.','Shtatzënia, gjidhënia dhe alergjia ndikojnë zgjedhjen. Shmang shpëlarjet vaginale.'],[R.bv,R.partner],'Plotëson afatet 5/7-ditore dhe përditëson ndjekjen e partnerit.',{confirmation:'BV simptomatike e vlerësuar; rruga e zgjedhur, shtatzënia, alergjitë dhe ndërveprimet janë kontrolluar.'});
 for(const [key,title]of [['21.23','Bartolinit · vlerëso infeksionin'],['21.24','Absces i Bartholin · drenazh']])reference(key,title,[
  'Abscesi simptomatik kërkon vlerësim për Word catheter ose marsupializim sipas rastit; antibiotiku nuk e zëvendëson drenazhin. Mos e shtrydh vetë.',
  'Antibiotiku zgjidhet në celulit, shenja sistemike ose indikacion të përcaktuar. Analgjezia përshtatet me shtatzëninë, veshkat dhe rrezikun gastrointestinal; mos kombino NSAID.',
  'Masë e re pas moshës 40 vjeç ose në menopauzë kërkon vlerësim për biopsi. Ethet ose përhapja e skuqjes kërkojnë kontroll të shpejtë.'
 ],['https://www.nhs.uk/conditions/bartholins-cyst/','https://rightdecisions.scot.nhs.uk/ggc-referral-management/womens-health/gynaecology-clinical-guidelines/management-of-bartholin-s-cyst-and-abscess-gynaecology-066/'],'Ndan drenazhin nga antibiotiku dhe shmang NSAID të shumtë.');
 reference('21.25','Absces pelvik · antibiotik EDHE kontroll burimi',[
  'Shtrim, kultura dhe vlerësim gjinekologjik/kirurgjikal për drenazh. Antibiotik me mbulim sipas burimit dhe rezistencës; mos e trajto çdo absces si PID ambulator.',
  'Një beta-laktam i gjerë si piperacillin/tazobactam nuk kërkon metronidazole shtesë automatikisht. Ceftriaxone me metronidazole është regjim tjetër sipas diagnozës, jo të gjithë bashkë.',
  'Kalimi oral, afati dhe analgjezia varen nga përgjigjja/kontrolli i vatrës. Ketorolac dhe naproxen nuk kombinohen; vlerëso veshkat dhe gjakderdhjen.'
 ],[R.pid,'https://www.nice.org.uk/guidance/ng255/chapter/managing-suspected-sepsis'],'Ruhet lidhja EDHE me drenazhin dhe ndahen regjimet alternative.');
 reference('21.26','Thatësi/atrofi vaginale · trajtim lokal',[
  'Përdor hidratues vaginal dhe lubrifikant sipas nevojës. Estrogjeni lokal vaginal mund të përdoret vetëm ose me këto masa pas vlerësimit.',
  'Zgjidh një preparat konkret, dozën e fazës fillestare dhe mirëmbajtjes sipas produktit. Estrogjeni oral ose tibolone nuk shtohen rutinë vetëm për simptoma lokale.',
  'Gjakderdhja e pashpjeguar hetohet. Historia e kancerit të gjirit kërkon vendim të përshtatur me ekipin përkatës.'
 ],['https://www.nice.org.uk/guidance/ng23/chapter/Recommendations'],'Dallon terapinë vaginale nga sistemikja dhe kërkon produkt të identifikuar.');
 for(const [key,title]of [['21.27','Dismenorre primare · lehtësim i dhimbjes'],['21.30','Dhimbje ovulatore · përjashto shkaqet urgjente']])save(key,title,[
  one('Kujdesi',care('Ngrohje lokale dhe aktivitet sipas tolerancës','Rivlerëso dhimbjen e re, të fortë, të njëanshme ose të shoqëruar me ethe/gjakderdhje. Përjashto shtatzëninë kur është e mundur.')),
  one('Analgjezi · një NSAID',drug('Naproxen · tabletë','500 mg fillimisht, pastaj 250 mg','Çdo 6–8 orë sipas nevojës','Vetëm gjatë dhimbjes, sa më shkurt','Nga goja','Maksimumi 1250 mg/24 orë sipas këtij SmPC. Merret me ushqim; mos e kombino me ibuprofen, diclofenac ose mefenamic acid.'),'Vetëm për të rriturën jo shtatzënë, pa kundërindikacion për NSAID'),
 ],['Ulçera/gjakderdhja, dëmtimi renal, alergjia ndaj NSAID dhe shtatzënia kërkojnë zgjedhje tjetër. Terapia hormonale planifikohet sipas nevojës për kontracepsion dhe rrezikut trombotik.'],['https://www.medicines.org.uk/emc/product/2639/smpc','https://www.nhs.uk/conditions/period-pain/'],'Dallon një NSAID nga alternativat dhe shmang skemën hormonale të paplotë.',{confirmation:'E rritur jo shtatzënë me diagnozë të vlerësuar; kundërindikacionet e NSAID dhe ndërveprimet janë përjashtuar.'});
 reference('21.28','Dismenorre sekondare · gjej shkakun',[
  'Vlerëso shtatzëninë, endometriozën, adenomiozën, miomat dhe infeksionin sipas paraqitjes. Dhimbja e papritur/të fikëtit ose shtatzënia e mundshme kërkojnë vlerësim urgjent.',
  'Analgjezia nuk e zëvendëson diagnostikimin. Zgjidh trajtim sipas shkakut dhe synimit për fertilitet; nuk ka një kombinim universal hormonal/antibiotik.'
 ],[R.endo,R.hmb],'Ruhet trajtimi sipas shkakut pa krijuar paketë barnash.');
 reference('21.29','PMS/PMDD · plan sipas simptomave',[
  'Regjistro simptomat për të paktën dy cikle dhe vlerëso shëndetin mendor, aktivitetin, gjumin dhe ndikimin në funksionim. Mbështetja dhe CBT janë pjesë e planit.',
  'Në simptoma të rënda, zgjidhet një SSRI, vazhdimisht ose në fazën luteale sipas vlerësimit; fluoxetine dhe sertraline janë alternativa, jo së bashku.',
  'Kontraceptivi hormonal kërkon produkt/cikël konkret dhe kontroll të rrezikut trombotik. Alprazolam nuk është shtesë rutinë; simptomat suicidale kërkojnë vlerësim të menjëhershëm.'
 ],['https://www.rcog.org.uk/for-the-public/browse-our-patient-information/managing-premenstrual-syndrome-pms/'],'Dallon alternativat SSRI nga kombinimet dhe heq benzodiazepinën rutinë.');
 save('21.31','Menorragji · pakëso gjakderdhjen dhe heto shkakun',[
  one('Gjatë menstruacioneve',drug('Tranexamic acid · tabletë 500 mg','1 g (2 tableta)','3 herë në ditë','Deri 4 ditë për cikël, vetëm gjatë gjakderdhjes','Nga goja','Fillon kur nis gjakderdhja. Dëmtimi renal kërkon ulje doze; historia/rreziku trombotik dhe kontraceptivi i kombinuar kërkojnë vlerësim.')),
  one('Vlerësimi',care('Hemogramë dhe hetim sipas shenjave','Planifiko trajtim afatgjatë sipas shkakut dhe fertilitetit: p.sh. LNG-IUS ose alternativë e përshtatshme.')),
 ],['Përjashto shtatzëninë dhe shkakun e gjakderdhjes së parregullt. Hemorragjia e rëndë me marramendje, sinkopë ose paqëndrueshmëri kërkon urgjencë.'],[R.hmb,R.txa],'Plotëson dozën/afatin dhe ndan terapinë hormonale afatgjatë.',{confirmation:'E rritur me gjakderdhje menstruale të vlerësuar, jo shtatzënë; veshkat dhe kundërindikacionet trombotike janë kontrolluar.'});
 reference('21.32','Oligomenorre · vlerësim hormonal dhe shtatzënie',[
  'Përjashto shtatzëninë dhe vlerëso TSH, prolaktinën, PCOS, ndryshimet e peshës dhe shkaqe të tjera sipas historisë.',
  'Mbrojtja endometriale me progestogjen ose kontraceptiv përcaktohet sipas diagnozës, rrezikut dhe dëshirës për fertilitet. Dydrogesterone dy herë/ditë pa ditët e ciklit dhe pa afat nuk është recetë e plotë.'
 ],[R.pcos],'Kërkon diagnozë dhe cikël të përcaktuar para progestogjenit.');
 reference('21.33','Endometriozë · dhimbje pa synim të menjëhershëm fertiliteti',[
  'Një NSAID/analgjezik dhe trajtim hormonal i zgjedhur sipas kundërindikacioneve: kontraceptiv i kombinuar OSE progestogjen. Agonistët/antagonistët GnRH kërkojnë specialist dhe plan për efektet kockore/add-back.',
  'Leuprorelin depot 11,25 mg IM çdo 3 muaj është formulim i veçantë për endometriozë, zakonisht me kufi 6 muaj sipas produktit. Depot 22,5 mg nuk zëvendësohet automatikisht; as goserelin 10,8 mg nuk merret si ekuivalent i 3,6 mg.',
  'Danazol, progestogjenë me doza të larta dhe disa hormone nuk janë kombinim rutinë. Konfirmo produktin, rrugën, afatin dhe mundësinë e shtatzënisë.'
 ],[R.endo,'https://www.medicines.org.uk/emc/product/4651/smpc'],'Korrigjon depot-in dhe ndan alternativat hormonale.');
 reference('21.34','Endometriozë me synim shtatzënie · plan fertiliteti',[
  'Referim në ekip fertiliteti: vlerëso tubat, rezervën ovariane, partnerin dhe rolin e kirurgjisë/riprodhimit të asistuar.',
  'Supresioni hormonal nuk ofrohet për të përmirësuar shtatzëninë spontane kur pacientja po përpiqet të konceptojë. Clomiphene/letrozole nuk përshkruhen automatikisht për çdo endometriozë.',
  'Induksioni i ovulimit kërkon indikacion, përjashtim shtatzënie dhe monitorim folikular; doza deri 200 mg clomiphene nuk është dozë universale fillestare.'
 ],[R.endo,R.pcos],'Dallon endometriozën nga infertiliteti anovulator dhe shmang induksionin pa vlerësim.');
 reference('21.35','Mioma uterine · trajtim sipas simptomave dhe fertilitetit',[
  'Miomat asimptomatike mund të ndiqen. Gjakderdhja, anemia, madhësia/lokalizimi dhe synimi për fertilitet përcaktojnë trajtimin medikamentoz ose procedurën.',
  'GnRH dhe terapia add-back kërkojnë preparat, afat dhe monitorim specialistik. Mifepristone 2,5–10 mg tri herë/ditë nuk aktivizohet si skemë standarde.',
  'Ulipristal acetate 5 mg për mioma (Esmya) ka autorizim të tërhequr në BE; nuk përdoret si opsion rutinë. Preparati 30 mg për kontracepsion urgjent ka indikacion tjetër. Afati i LNG-IUS varet nga produkti dhe indikacioni.'
 ],[R.hmb,'https://www.ema.europa.eu/en/medicines/human/EPAR/esmya'],'Heq skemat e pasigurta dhe dallon dy indikacionet e ulipristal.');
 for(const [key,title,note]of [
  ['21.36','Infertilitet · vlerëso çiftin dhe shkakun','Vlerëso ovulimin, tubat dhe spermogramën; trajto çrregullimin tiroid/prolaktinën vetëm kur diagnostikohet. Barnat nuk zgjidhen si listë e përbashkët për çdo paciente.'],
  ['21.37','PCOS pa synim shtatzënie · cikli dhe simptomat','Stili i jetesës dhe rreziku metabolik vlerësohen te të gjitha pacientet. Kontraceptivi i kombinuar dhe metformin kanë indikacione të ndryshme; kontrollo rrezikun trombotik dhe mbrojtjen endometriale.'],
  ['21.38','PCOS me synim shtatzënie · induksion i monitoruar','Letrozole është zgjedhja e parë për infertilitet anovulator nga PCOS pa faktorë të tjerë. Përdorimi mund të jetë off-label; përjashto shtatzëninë dhe përcakto ciklin/dozën me specialistin. Clomiphene/metformin janë alternativa ose kombinime të përzgjedhura.']
 ])reference(key,title,[note,'Doza e fillimit, titrimi, ditët e ciklit dhe monitorimi përcaktohen individualisht. Mos kombino automatikisht letrozole, clomiphene, gonadotropina dhe hormone të tjera. Inositol nuk e zëvendëson vlerësimin/trajtimin e fertilitetit.'],[R.pcos,'https://www.nice.org.uk/guidance/cg156/chapter/Recommendations'],'Ndan shkakun, qëllimin e trajtimit dhe fazat e monitoruara.');
 for(const [key,title]of [['21.39','Kist ovarian beninj · ndjekje sipas ekografisë'],['21.40','Kist folikular · vëzhgim dhe rivlerësim']])save(key,title,[
  one('Vlerësimi',care('Ekografi dhe plan ndjekjeje','Madhësia, pamja, simptomat dhe menopauza përcaktojnë ndjekjen ose referimin. Shumë kiste funksionale zhduken vetë.')),
  one('Shenjat e alarmit',care('Dhimbje e papritur ose e fortë · vlerësim urgjent','Përjashto torsionin, rupturën dhe shtatzëninë ektopike; të fikëtit, të vjellat ose gjendja e rënduar kërkojnë urgjencë.')),
 ],['Antibiotiku nuk trajton kistin e painfektuar. Kontraceptivi i kombinuar nuk e zhduk më shpejt një kist të thjeshtë ekzistues; përdoret vetëm për indikacion tjetër të përshtatshëm.'],[R.cyst],'Heq antibiotikët dhe kontraceptivin si trajtim automatik të kistit.');
};
