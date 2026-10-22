'use strict';
module.exports=({save,reference,drug,care,opt,group,one})=>{
 const R={nls:'https://cpr.heart.org/en/resuscitation-science/cpr-and-ecc-guidelines/neonatal-resuscitation',fluid:'https://www.nice.org.uk/guidance/ng29/chapter/Recommendations',neo:'https://www.nice.org.uk/guidance/ng195/chapter/Recommendations',jaundice:'https://www.nice.org.uk/guidance/cg98/chapter/Recommendations',hypo:'https://hubble-live-assets.s3.eu-west-1.amazonaws.com/bapm/file_asset/file/2864/Identification_and_Management_of_Neonatal_Hypoglycaemia_Sept_24.pdf',surfactant:'https://www.medicines.org.uk/emc/product/6450/smpc',bronch:'https://www.nice.org.uk/guidance/ng9/chapter/Recommendations',cap:'https://www.nice.org.uk/guidance/ng250/chapter/Recommendations',asthma:'https://www.rch.org.au/clinicalguide/guideline_index/Acute_asthma/',fever:'https://www.nice.org.uk/guidance/ng143/chapter/Recommendations'};
 const neonatal='Vetëm në kujdes neonatal të monitoruar. Doza/intervali përcaktohen nga pesha aktuale, mosha gestacionale/pas lindjes, veshkat dhe produkti konkret.';
 reference('22.1','Reanimim neonatal · ventilimi ka përparësi',[
  'Thirr ekipin, ruaj temperaturën dhe vlerëso frymëmarrjen/ritmin. PPV për apne/gasping ose HR <100/min. Aspirimi bëhet kur ka obstruksion, jo rutinë.',
  'Kompresione 3:1 kur HR mbetet <60/min pas ventilimit efektiv dhe korrigjimit të rrugës. Në persistencë pas ventilimit/kompresioneve, adrenaline preferohet intravaskular.',
  'Adrenaline 0,1 mg/mL: intravaskular 0,01–0,03 mg/kg = 0,1–0,3 mL/kg; endotrakeal gjatë sigurimit të aksesit 0,05–0,1 mg/kg = 0,5–1 mL/kg. Rrugët nuk kanë të njëjtën dozë/vëllim. Përsëritje sipas algoritmit çdo 3–5 minuta.',neonatal
 ],[R.nls],'Ndan dozat IV/ET dhe heq aspirimin rutinë.');
 reference('22.2','Pas reanimimit neonatal · monitorim dhe shkaku',[
  'Monitoro ventilimin, temperaturën, glukozën, perfuzionin dhe konvulsionet. Vlerëso encefalopatinë hipoksike dhe përshtatshmërinë për hipotermi terapeutike në qendrën përkatëse.',
  'Mannitol, dexamethasone, dopamine dhe produktet e gjakut nuk janë shtesa rutinë pas reanimimit; secili kërkon indikacion të përcaktuar.',neonatal
 ],[R.nls],'Ndan kujdesin pas reanimimit nga barnat me indikacion specialistik.');
 reference('22.3','Lëngje IV pediatrike · mirëmbajtje me monitorim',[
  'Mirëmbajtja nuk është reanimim. Për fëmijën përdor lëng izotonik me natrium 131–154 mmol/L sipas protokollit, me glukozë/kalium kur indikohen dhe me matje të elektroliteve/glukozës.',
  'Llogaritja ditore Holliday–Segar: 100 mL/kg për 10 kg e parë +50 mL/kg për 10 kg pasuese +20 mL/kg për çdo kg mbi 20. Rregulli orar 4–2–1 është përafrim; nuk zbatohet si volum i detyrueshëm në sëmundje akute.',
  'Neonati dhe sidomos prematuri kanë protokoll sipas ditës së jetës/peshës. NaCl 0,18% nuk zgjidhet automatikisht për çdo ditë të tretë. Përshtat humbjet, diurezën, natriumin dhe rrezikun e mbingarkesës.'
 ],[R.fluid],'Ndan mirëmbajtjen/reanimimin dhe parandalon lëngjet hipotonike universale.');
 save('22.4','Hipotermi neonatale · ngrohje e kontrolluar',[
  one('Temperatura',care('Mat dhe monitoro temperaturën','Ngrohje e përshtatur me rëndesën; skin-to-skin për foshnjën stabile, inkubator/radiant warmer kur nevojitet. Shmang djegiet dhe hiperterminë.')),
  one('Vlerësimi',care('Kontrollo glukozën, frymëmarrjen dhe infeksionin','Hipotermia mund të shoqërojë sepsisin ose hipogliceminë. Foshnja letargjike, me ushqyerje të dobët ose distres kërkon vlerësim urgjent.')),
 ],['Objektivi i temperaturës normale neonatale është rreth 36,5–37,5°C; hipotermia terapeutike për encefalopati është procedurë tjetër.'],[R.nls],'Dallon ngrohjen e sigurt nga hipotermia terapeutike.');
 reference('22.5','Gjakderdhje nga mungesa e vitaminës K · urgjencë',[
  'Gjakderdhja aktive kërkon vlerësim neonatal urgjent, koagulimin dhe mbështetje hematologjike. Trajtimi i VKDB nuk është e njëjta skemë si profilaksia rutinë në lindje.',
  'Phytonadione/fitomenadione përdoret sipas formulimit neonatal; në trajtim parenteral rruga, hollimi dhe shpejtësia verifikohen. Përsëritja vendoset nga INR/përgjigjja, jo automatikisht çdo javë.',
  'FFP ose faktorët zgjidhen në gjakderdhje të rëndë sipas ekipit; mos vono trajtimin duke pritur analizat.',neonatal
 ],['https://www.medicines.org.uk/emc/product/9754/smpc'],'Ndan profilaksinë nga trajtimi dhe heq përsëritjen javore të pakushtëzuar.');
 reference('22.6','Policitemi neonatale · konfirmo hematokritin venoz',[
  'Konfirmo hematokritin venoz, simptomat, hidratimin dhe glukozën. Vlera kapilare mund të mbivlerësojë hematokritin.',
  'Transfuzioni i pjesshëm nuk bëhet vetëm nga një rezultat kapilar. Përfitimi te neonati asimptomatik është i pasigurt; simptomat dhe hematokriti venoz kërkojnë vendim neonatologjik.',neonatal
 ],['https://medconnection.ucsfbenioffchildrens.org/polycythemia-guidelines'],'Kushtëzon transfuzionin me matje venoze dhe vlerësim klinik.');
 reference('22.7','Hipokalcemi neonatale · kalcium me monitorim',[
  'Mat kalciumin e jonizuar, magnezin dhe fosfatin; trajto shkakun. Simptomat/konvulsionet kërkojnë kujdes urgjent me ECG.',
  'Calcium gluconate 10% nuk është 10% kalcium elementar. Përshkruaj sasinë në mmol kalcium, pastaj konverto sipas ampulës; hollimi, vija dhe shpejtësia kërkojnë protokoll neonatal.',
  'Mos kopjo vëllim magnesium sulphate pa përqendrimin e ampulës. Mos përziej kalcium me bicarbonate/phosphate; kontrollo përputhshmërinë dhe rrezikun e ekstravazimit.',neonatal
 ],['https://www.starship.org.nz/guidelines/hypocalcaemia/','https://www.anmfonline.org/clinical-resources/'],'Dallon kripën nga kalciumi elementar dhe kërkon përqendrime të identifikuara.');
 reference('22.8','Hipoglicemi neonatale · sipas simptomave dhe moshës',[
  'Foshnja simptomatike ose me glukozë shumë të ulët kërkon trajtim urgjent dhe matje të përsëritura. Ushqyerja/xheli oral 40% kanë rol vetëm në grupin e përshtatshëm sipas protokollit neonatal.',
  'GIR shkruhet mg/kg/min. Shpejtësia mL/orë = GIR × pesha kg ×60 ÷ përqendrimi mg/mL; glukoza 10% =100 mg/mL. P.sh. GIR 6 mg/kg/min korrespondon me 3,6 mL/kg/orë të glukozës 10%.',
  'Bolusi, GIR fillestar dhe rritjet lidhen me glukozën, moshën dhe aksesin venoz. Diazoxide është terapi e hiperinsulinizmit me monitorim specialistik, jo bolus IV për çdo hipoglicemi.',neonatal
 ],[R.hypo,'https://www.anmfonline.org/clinical-resources/'],'Saktëson njësitë e GIR dhe ndan hiperinsulinizmin nga korrigjimi akut.');
 reference('22.9','RDS neonatal · mbështetje respiratore dhe surfaktant',[
  'CPAP/ventilimi, oksigjeni dhe surfaktanti përcaktohen sipas gestacionit, punës respiratore dhe nevojës për FiO₂. Antibiotik vetëm kur dyshohet infeksion.',
  'Poractant alfa është endotrakeal; nuk jepet IV ose nga goja. Përdor produktin dhe protokollin e administrimit të verifikuar.',
  'Betamethasone/dexamethasone antenatale i jepen NËNËS kur ka indikacion për lindje të parakohshme; nuk janë steroid rutinë për neonatin me RDS.',neonatal
 ],[R.surfactant,'https://www.nice.org.uk/guidance/ng25/chapter/Recommendations'],'Ndan trajtimin e nënës nga ai i të porsalindurit.');
 reference('22.10','Surfaktanti · preparati përcakton vëllimin',[
  'Poractant alfa 80 mg/mL: doza fillestare 100–200 mg/kg (1,25–2,5 mL/kg); sipas gjendjes mund të përsëritet 100 mg/kg rreth çdo 12 orë. Maksimumi i përgjithshëm 300–400 mg/kg sipas dozës fillestare dhe SmPC.',
  'Beractant 25 mg/mL ka dozë 100 mg/kg =4 mL/kg sipas produktit. mL/kg i një surfaktanti nuk përdoret për produktin tjetër.',
  'Vetëm nga ekip me aftësi ventilimi/reanimimi; monitoro desaturimin, bradikardinë dhe obstruksionin e tubit.',neonatal
 ],[R.surfactant,'https://www.rxabbvie.com/pdf/survanta_pi.pdf'],'Saktëson përqendrimet, përsëritjen dhe maksimumin produkt-specifik.');
 reference('22.11','LISA · surfaktant nga ekip neonatal',[
  'Zgjidhet te prematuri i përshtatshëm që merr frymë spontanisht në mbështetje jo-invazive; monitorim i plotë dhe gatishmëri për intubim.',
  'Poractant alfa jepet përmes kateterit të hollë sipas protokollit. Sedacioni/atropine nuk shtohen si paketë automatike; mund të shtypin frymëmarrjen dhe kërkojnë vendim të ekipit.',
  'Naloxone nuk është hap rutinë për frymëmarrje të dobët pas LISA; sigurimi i ventilimit ka përparësi.',neonatal
 ],[R.surfactant,R.nls],'Heq sedacionin dhe antidotin e pakushtëzuar.');
 for(const [key,title]of [['22.12','Ikter neonatal · bilirubina sipas orëve të jetës'],['22.13','Fototerapi dhe transfuzion shkëmbyes · pragje individuale']])reference(key,title,[
  'Mat bilirubinën dhe interpretoje sipas orëve të jetës, gestacionit dhe rrezikut. Verdhëza në 24 orët e para kërkon vlerësim urgjent; mos përdor një prag të vetëm 15 ose 20 mg/dL për të gjitha foshnjat.',
  'Fototerapia fillon/ndalet sipas grafikut përkatës dhe ndiqet për rikthim. Ruaj ushqyerjen dhe vlerëso dehidratimin; ndërprerja e gjidhënies nuk është hap rutinë.',
  'IVIG rezervohet për hemolizë imune të përzgjedhur; transfuzioni shkëmbyes kërkon ekip specialistik. Phenobarbital nuk është trajtim rutinë i ikterit.'
 ],[R.jaundice],'Heq pragjet universale dhe medikamentet pa indikacion.');
 reference('22.14','Konvulsione neonatale · EEG dhe trajtim i shkakut',[
  'Siguro ABC, kontrollo glukozën/Ca/Mg dhe infeksionin, me EEG kur është e mundur. Korrigjimi metabolik dhe kontrolli i krizave bëhen paralelisht.',
  'Fenobarbitali është zakonisht zgjedhja e parë sipas ILAE; linja e dytë zgjidhet sipas etiologjisë/përgjigjes. Doza e ngarkesës nuk është e njëjta me mirëmbajtjen.',
  'GIR matet mg/kg/min, JO mL/kg/min. Phenytoin IV kërkon monitorim kardiak/shpejtësi të kontrolluar; doza dhe hollimi janë produkt-specifike. Prova e pyridoxine kërkon preparat të saktë dhe mbështetje ventilimi.',neonatal
 ],['https://doi.org/10.1111/epi.17745',R.hypo],'Ndan fazat e antikonvulsantit dhe korrigjon njësinë e infuzionit.');
 reference('22.15','Sepsë neonatale · trajtim pa vonesë',[
  'Merr hemokulturë dhe mostrat e indikuara pa vonuar antibiotikun. Regjimi i hershëm/i vonshëm bazohet në moshën, meningitin dhe mikrobiologjinë lokale.',
  'Aminoglikozidi jepet EDHE me beta-laktamin kur kjo është skema e zgjedhur; alternatifat e gjera nuk shtohen të gjitha bashkë. Intervalet dhe nivelet e gentamicin/vancomycin varen nga gestacioni/veshkat.',
  'Rivlerëso nevojën në 36 orë për fillim të hershëm sipas kulturës, gjendjes dhe CRP; kulturë negative nuk do të thotë automatikisht kurs 5–7 ditë. Lëngjet/vasoaktivët titrohen, pa përsëritje automatike bolusesh deri 40 mL/kg.',neonatal
 ],[R.neo,R.fluid],'Dallon trajtimin nga profilaksia dhe vendos rivlerësim të hershëm.');
 reference('22.16','Omfalit · antibiotik IV dhe vlerësim për sepsis',[
  'Sekrecioni purulent ose celuliti periumbilikal kërkon vlerësim neonatal, kulturë gjaku/sekrecioni dhe terapi IV me mbulim stafilokokal e gram-negativ sipas protokollit.',
  'Flucloxacillin EDHE gentamicin është skemë e NICE; zgjerimi për MRSA/anaerobë lidhet me rrezikun. Dozat për foshnjën disa muajshe nuk transferohen te neonati.',
  'Skuqja që përhapet, nekroza ose gjendja e rënduar kërkojnë ekip kirurgjikal urgjent. Mbaje kërthizën të pastër e të thatë.',neonatal
 ],[R.neo],'Heq dozat e moshës së gabuar dhe dallon shtesat e indikuara.');
 reference('22.17','Tonsilit pediatrik · konfirmo streptokokun',[
  'Në shenja të qarta virale antibiotiku nuk indikohet. Për streptokok të konfirmuar: amoxicillin 50 mg/kg PËR DOZË një herë/ditë, maksimumi 1 g, për 10 ditë; alternativisht 25 mg/kg/dozë çdo 12 orë, maksimumi 500 mg/dozë, për 10 ditë.',
  'Penicillin V është alternativë e linjës së parë. Alergjia e menjëhershme dhe rezistenca lokale përcaktojnë alternativat; macrolidi nuk kombinohet rutinë me beta-laktamin.',
  'Vëllimi i shurupit llogaritet pasi konfirmohet përqendrimi. Analgjezia zgjidhet sipas moshës/peshës; shurupet e kombinuara kundër kollës nuk janë shtesë rutinë.'
 ],['https://www.cdc.gov/group-a-strep/hcp/clinical-guidance/strep-throat.html',R.fever],'Korrigjon zgjedhjen e parë, dozën/maksimumin dhe kursin.');
 reference('22.18','Epiglotit pediatrik · rruga e frymëmarrjes e para',[
  'Urgjencë me ekip anestezie/ORL/pediatrie. Mbaje fëmijën të qetë në pozicionin e tij; mos e detyro të shtrihet dhe mos ekzamino faringun në mënyrë që provokon obstruksion.',
  'Sigurimi i rrugës në ambient të kontrolluar ka përparësi; antibiotiku IV dhe lëngjet jepen sipas ekipit. Kortikosteroidi nuk zëvendëson sigurimin e rrugës.',
  'Bolusi IV jepet vetëm për perfuzion të dobët, me rivlerësim. NPO vetëm nuk është arsye për bolus 20–30 mL/kg.'
 ],['https://www.rch.org.au/clinicalguide/guideline_index/Acute_upper_airway_obstruction/',R.fluid],'Ndan stabilizimin nga trajtimet dhe heq bolusin për NPO.');
 reference('22.19','Krup · steroid dhe adrenalinë sipas rëndesës',[
  'Mbaje fëmijën të qetë; vlerëso stridorin në pushim dhe punën respiratore. Dexamethasone përdoret si dozë e vetme; në krup të rëndë 0,6 mg/kg PO/IM/IV, maksimumi 12 mg sipas RCH.',
  'Adrenaline nebulizuese për krup të rëndë: 5 mL nga tretësira 1 mg/mL sipas RCH, nën monitorim. Ky është nebulizim, jo injeksion IV. Vëzhgim të paktën 3 orë pas saj para daljes kur është e përshtatshme.',
  'Nuk nebulizohet automatikisht ampula e dexamethasone. Antibiotiku, lëngjet IV dhe dy steroidë nuk janë rutinë në krup të thjeshtë.'
 ],['https://www.rch.org.au/clinicalguide/guideline_index/Croup_Laryngotracheobronchitis/'],'Ndan rrugët, saktëson maksimumin dhe vëzhgimin pas adrenalinës.');
 save('22.20','Bronkiolit i lehtë–mesatar · kujdes mbështetës',[
  one('Ushqyerja dhe frymëmarrja',care('Ushqyerje të vogla e të shpeshta dhe monitorim','Vlerëso hidratimin dhe punën respiratore. Aspirim i butë nazal vetëm kur sekrecionet pengojnë ushqyerjen/frymëmarrjen.')),
  one('Kur kërkohet ndihmë',care('Apne, cianozë, rraskapitje ose marrje e pamjaftueshme lëngjesh','Vlerësim urgjent në këto shenja; prematuriteti, mosha e vogël dhe sëmundjet shoqëruese ulin pragun për shtrim.')),
 ],['Antibiotikët, antihistaminikët, shurupet e kollës, salbutamol/ipratropium dhe steroidet nuk përdoren rutinë për bronkiolit.'],[R.bronch],'Zëvendëson barnat e panevojshme dhe antihistaminat me kujdes mbështetës.');
 reference('22.21','Bronkiolit i rëndë · oksigjen dhe hidratim',[
  'Shtrim dhe monitorim; oksigjen në SpO₂ persistente <90% te mosha ≥6 javë, ose <92% nën 6 javë/me sëmundje bazë sipas NICE. Apnea/rraskapitja kërkojnë eskalim.',
  'Ushqyerje NG/OG ose lëngje IV izotonike kur nevojiten; CPAP në dështim respirator sipas ekipit. Nuk përdoren rutinë hypertonic saline, ipratropium ose steroid.'
 ],[R.bronch],'Korrigjon trajtimet rutinë dhe pragjet e oksigjenit.');
 for(const [key,title,note]of [
  ['22.22','Infeksion respirator i poshtëm · përcakto diagnozën','Shumë infeksione janë virale. Antibiotik për pneumoni bakteriale ose indikacion tjetër; cefuroxime oral 20–30 mg/kg PËR DOZË çdo 12 orë nuk është skema rutinë e fëmijës.'],
  ['22.23','Infeksion respirator · makrolid vetëm kur indikohet','Makrolidi përdoret kur patogjeni atipik/alergjia e përshtatshme e justifikon. Clarithromycin zakonisht ndahet në dy marrje; azithromycin ka skemë sipas indikacionit, jo kurs pa afat.'],
  ['22.24','Infeksion respirator te foshnja · vlerësim sipas moshës','Te neonati ose foshnja e vogël me ethe/distres kërkohet vlerësim urgjent. Cefaclor 30–40 mg/kg PËR DOZË nuk këmbehet me dozën e përgjithshme ditore.'],
  ['22.25','Pneumoni pediatrike e lehtë · amoxicillin kur indikohet','Amoxicillin është zgjedhja e parë për pneumoni jo të rëndë. NICE 2025 përdor kurs 3-ditor për 3 muaj–11 vjeç pa komplikime/sëmundje bazë kur janë stabile; grupet e tjera ose paqëndrueshmëria kërkojnë plan tjetër.'],
  ['22.26','Pneumoni me rrezik shtesë · regjim i përshtatur','Cefuroxime oral 150 mg/kg/DITË nuk përdoret si model. Komorbiditeti vetëm nuk do të thotë beta-laktam EDHE makrolid për të gjithë; përcakto patogjenin/rëndesën.']
 ])reference(key,title,[note,'Doza, maksimumi dhe kursi përcaktohen sipas moshës reale, peshës, veshkave dhe produktit. Cefuroxime axetil oral dhe cefuroxime sodium IV nuk janë e njëjta skemë; tableta/suspensioni axetil nuk ndërrohen mg-për-mg.','Rivlerëso në përkeqësim ose mungesë përmirësimi. Përbërësit amoxicillin/clavulanate dhe raporti i suspensionit duhet të shënohen veçmas.'],[R.cap,'https://www.medicines.org.uk/emc/product/3811/smpc','https://www.medicines.org.uk/emc/product/15784/smpc'],'Korrigjon njësitë, formulimin, kursin dhe shtesat pa indikacion.');
 reference('22.27','Pneumoni pediatrike spitalore · një regjim sipas rrezikut',[
  'Antibiotiku IV zgjidhet sipas rëndesës, patogjenit dhe rezistencës; zgjerimi për MRSA, aspirim ose spitalore ka indikacion të veçantë. Gentamicin dhe beta-laktamë të tjerë nuk shtohen rutinë mbi çdo cefalosporinë.',
  'Vancomycin IV te 1 muaj–<12 vjeç zakonisht fillon 10–15 mg/kg PËR DOZË çdo 6 orë sipas SmPC, me nivele/AUC dhe veshka; 7,5 mg/kg/DITË nuk është ekuivalente. Neonati ka skemë tjetër.',
  'Oksigjeni, lëngjet dhe paracetamoli IV individualizohen. Ipratropium nuk trajton pneumoninë pa indikacion bronkospastik.'
 ],[R.cap,'https://www.medicines.org.uk/emc/product/8759/smpc'],'Korrigjon dozën ditore të vancomycin dhe mbivendosjet empirike.');
 for(const [key,title]of [['22.28','Krizë astmatike pediatrike · sipas rëndesës'],['22.29','Status astmatik · trajtim i monitoruar dhe eskalim']])reference(key,title,[
  'Vlerëso punën respiratore, të folurit, ndërgjegjen dhe oksigjenimin. Salbutamol inhalator me spacer është i përshtatshëm për shumë raste; nebulizimi/oksigjeni varen nga rëndesa.',
  'Shto ipratropium në krizë të rëndë dhe një steroid sistemik kur indikohet. Prednisolone, dexamethasone dhe methylprednisolone janë alternativa, jo të tre bashkë.',
  'Pa përgjigje: kërko pediatrin/PICU; magnesium IV dhe salbutamol IV përdoren me monitorim. Mos kalo automatikisht në infuzion kontinu pas tre nebulizimeve; vlerëso hipokaleminë, laktatin dhe takikardinë nga salbutamol.'
 ],[R.asthma],'Ndan trajtimin fillestar, alternativat steroidike dhe eskalimin.');
 save('22.30','Ftohje/virozë te fëmija · kujdes i thjeshtë',[
  one('Kujdesi',care('Pushim, lëngje dhe pastrim nazal kur duhet','Marrje të vogla e të shpeshta lëngjesh, ushqyerje sipas tolerancës dhe monitorim të frymëmarrjes/diurezës.')),
  one('Rivlerësimi',care('Shenja alarmi ose ethe te foshnja e vogël','Vështirësia në frymëmarrje, letargjia, dehidratimi ose ethet nën 3 muaj kërkojnë vlerësim të shpejtë. Antipiretik vetëm për parehati sipas moshës/peshës.')),
 ],['Antihistaminiku përdoret për alergji, jo rutinë për virozën. Mos jep antibiotik ose kombinime të kollës/ftohjes pa indikacion të përshtatshëm për moshën.'],['https://www.nice.org.uk/guidance/ng120/chapter/Recommendations',R.fever],'Heq antihistaminat e dyfishuara për virozë.');
 reference('22.31','Rinit alergjik pediatrik · preparat dhe moshë konkrete',[
  'Larja nazale dhe shmangia e alergjenit ndihmojnë. Zgjidh një steroid nazal OSE një antihistaminik të përshtatshëm; kombinimi bëhet kur kontrolli nuk mjafton.',
  'Mometasone 50 mikrogramë/spërkatje sipas këtij SmPC: 3–11 vjeç, 1 spërkatje në secilën vrimë një herë/ditë; ≥12 vjeç, 2 në secilën vrimë një herë/ditë, pastaj ulje kur kontrollohet. Jo dy herë/ditë automatikisht.',
  'Desloratadine 0,5 mg/mL: 1–5 vjeç 1,25 mg një herë/ditë; 6–11 vjeç 2,5 mg një herë/ditë; ≥12 vjeç 5 mg një herë/ditë. Nuk është 0,5 mg/5 mL. Loratadine/levocetirizine kanë skema të tjera sipas produktit, peshës dhe veshkave.'
 ],['https://www.medicines.org.uk/emc/product/1663/smpc','https://www.ema.europa.eu/en/medicines/human/EPAR/aerius'],'Korrigjon përqendrimin dhjetëfish dhe ndan moshat/produktet.');
 for(const [key,title]of [['22.32','Infeksion dentar pediatrik · kontroll burimi'],['22.35','Absces dentar pediatrik · trajtim dentar']])reference(key,title,[
  'Vlerësim dentar dhe drenazh/trajtim i dhëmbit. Antibiotiku nuk zëvendëson procedurën dhe nuk jepet rutinë për dhimbje të lokalizuar pa përhapje.',
  'Ethet, celuliti, ënjtja progresive, trismus ose vështirësia në gëlltitje/frymëmarrje kërkojnë vlerësim urgjent. Antibiotiku zgjidhet sipas moshës/peshës/alergjisë dhe rishikohet.',
  'Një analgjezik sipas nevojës; jo dy NSAID. Clindamycin dhe metronidazole nuk shtohen automatikisht në çdo absces.'
 ],['https://www.aapd.org/globalassets/media/policies_guidelines/bp_antibiotictherapy.pdf'],'Ndan procedurën e nevojshme nga antibiotiku dhe shtesat.');
 for(const [key,title]of [['22.33','Otalgji pediatrike · ekzamino veshin'],['22.34','Rrjedhje nga veshi · përcakto burimin'],['22.36','Otit media akut · analgjezi dhe antibiotik kur duhet'],['22.37','Otit media · rivlerëso zgjedhjen e dytë']])reference(key,title,[
  'Dallo otitin e mesëm, otitin e jashtëm, perforimin dhe tubat timpanikë. Analgjezia përshtatet me moshën/peshën; shumë raste nuk kërkojnë antibiotik të menjëhershëm.',
  'Kur indikohet antibiotik për AOM, NICE përdor amoxicillin si zgjedhje të parë për 5–7 ditë, me doza sipas moshës/madhësisë; alternativa varet nga alergjia/përgjigjja. Cefixime me dozë ngarkese dhe 14 ditë nuk është model rutinë.',
  'Pikat analgjezike përdoren vetëm kur membrana është e paprekur dhe nuk ka otorre. Perforimi/tubat kërkojnë produkt otik të përshtatshëm; mos përdor aminoglikozid ose kombinim me lidocaine pa kontrolluar produktin. Ënjtja mastoide ose gjendja e rënduar kërkojnë urgjencë.'
 ],['https://www.nice.org.uk/guidance/ng91/chapter/Recommendations'],'Dallon vendin e infeksionit, sigurinë e pikave dhe kursin e antibiotikut.');
 reference('22.38','Ethe pediatrike · trajto parehatinë, vlerëso shkakun',[
  'Antipiretik kur fëmija është i parehatshëm, jo vetëm për numrin në termometër. Zgjidh paracetamol OSE ibuprofen sipas moshës, hidratimit dhe produktit; mos i jep të dy rutinë njëkohësisht.',
  '15 mg/kg paracetamol çdo 6 orë jep 60 mg/kg/24 orë në 4 marrje, jo 90. Kufiri final varet nga mosha, produkti, veshkat/mëlçia dhe të gjitha rrugët e marra.',
  'Ethe nën 3 muaj, skuqje që nuk zbardhet, letargji, vështirësi frymëmarrjeje ose dehidratim kërkojnë vlerësim urgjent. Bolusi IV nuk jepet vetëm sepse ka temperaturë.'
 ],[R.fever,'https://www.medicines.org.uk/emc/product/100803/smpc'],'Korrigjon aritmetikën ditore dhe heq kombinimin rutinë të antipiretikëve.');
 reference('22.39','Paracetamol IV pediatrik · kufij sipas peshës',[
  'Për produktin 10 mg/mL: ≤10 kg, 7,5 mg/kg/dozë =0,75 mL/kg, maksimumi 30 mg/kg/24 orë; >10–33 kg, 15 mg/kg/dozë, maksimumi 60 mg/kg/24 orë dhe ≤2 g; >33–50 kg, 15 mg/kg/dozë, maksimumi 60 mg/kg/24 orë dhe ≤3 g.',
  'Infuzion 15 minuta; të paktën 4 orë mes dozave, jo mbi 4 doza/24 orë. Në insuficiencë renale intervali përshtatet sipas SmPC. Prematuri/neonati jashtë etiketës kërkon protokoll neonatal.',
  'Përfshi paracetamolin nga çdo rrugë dhe ul kufijtë me rrezik hepatik. Nxirr vëllimin e saktë me shiringë; nuk jepet e gjithë shishja 100 mL fëmijës.'
 ],['https://www.medicines.org.uk/emc/product/100803/smpc'],'Saktëson dozën e fëmijës ≤10 kg dhe kufijtë mg/mL/ditorë.');
};
