'use strict';
// Read-only source conversion. This writes a separate, versioned clinical layer;
// it never changes Sanity source documents or their clinical review status.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const input = process.argv[2];
if (!input) throw new Error('Supply the audited, format-preserving import snapshot JSON.');
const guides = JSON.parse(fs.readFileSync(input,'utf8'));
const findings = JSON.parse(fs.readFileSync(path.resolve(path.dirname(input),'recetat-content-audit-findings-1-5-20261020.json'),'utf8')).findings;
const byKey = new Map(guides.map(guide => [`${guide.chapterNumber}.${guide.orderInChapter}`,guide]));
const result = {version:'clinical-1-5-20261020-v1',checkedAt:'2026-10-20',sourceSnapshotSha256:createHash('sha256').update(fs.readFileSync(input)).digest('hex'),guides:{}};
const clone = value => JSON.parse(JSON.stringify(value));
function fingerprint(guide) {
  const fields=['kind','title','genericName','form','strength','dose','route','frequency','duration','sig','note'];
  return createHash('sha256').update(JSON.stringify([String(guide._id),String(guide.title),String(guide.chapterNumber||''),String(guide.orderInChapter||''),guide.logicBlocks.map(b=>[
    ...['order','relation','sourceConnectorLabel','condition','selection','note'].map(k=>String(b[k]||'')),
    (b.items||[]).map(i=>['order',...fields].map(k=>String(i[k]||''))),
  ])])).digest('hex');
}
function drug(name,dose,frequency,duration,route='Nga goja',instructions='',extra={}) {
  return {kind:'active-substance',title:name,genericName:name,dose,frequency,duration,route,sig:instructions,...extra};
}
function care(title,instructions,extra={}) {return {kind:'supportive-care',title,sig:instructions,...extra};}
function option(label,...items) {return {label,items};}
function group(label,options,condition='') {return {label,options,condition};}
function one(label,item,condition='') {return group(label,[option('',item)],condition);}
function fromSource(key) {
  const source=byKey.get(key); if(!source)throw new Error(key);
  const groups=[];
  for (const block of clone(source.logicBlocks)) {
    const items=block.items||[];
    // Editorial instructions and incomplete preparations remain in original text
    // behind ?, never become an invented drug or a prescription line.
    if (items.every(i=>i.kind==='source-note')) continue;
    const usable=items.filter(i=>i.kind!=='source-note');
    if (!usable.length)continue;
    const next=option('',...usable);
    if (block.relation==='or' && groups.length)groups.at(-1).options.push(next);
    else groups.push(group('',block.selection==='choose-one'&&usable.length>1?usable.map(i=>option('',i)):[next],block.relation==='conditional'?block.condition||'Vetëm nëse indikohet':''));
  }
  return groups;
}
function save(key,groups,notes=[],extra={}) {
  const source=byKey.get(key); if(!source)throw new Error(key);
  const relevant=findings.filter(f=>f.targets.includes(key));
  const references=[...new Map(relevant.flatMap(f=>f.references).filter(r=>!['rx','book'].includes(r.key)).map(r=>[r.url,r])).values()];
  result.guides[source._id]={key,sourceFingerprint:fingerprint(source),status:'ready',groups,notes,
    changes:relevant.map(f=>({id:f.id,title:f.title,explanation:f.assessment})),references,...extra};
}
function eachItem(groups,fn) {for(const g of groups)for(const o of g.options)for(const i of o.items)fn(i,g,o);}
function patch(key,fn,notes=[],extra={}) {const groups=fromSource(key);fn(groups);save(key,groups,notes,extra);}
const paracetamol=()=>drug('Paracetamol','500–1000 mg','Çdo 6–8 orë, nëse nevojitet','Sa më shkurt; rivlerësim sipas simptomave','Nga goja','Maksimumi 4 g në 24 orë te i rrituri ≥50 kg pa faktorë rreziku; ul kufirin në sëmundje hepatike, peshë të ulët ose faktorë të tjerë rreziku.');
const cdc=(page)=>`https://www.cdc.gov/std/treatment-guidelines/${page}.htm`;

save('3.4',[one('Zëvendësimi i faktorëve të koagulimit',{kind:'blood-product',title:'Plazmë e freskët e ngrirë (FFP)',dose:'10–15 mL/kg',route:'IV',frequency:'Një dozë fillestare; rivlerësim',duration:'Sipas përgjigjes klinike dhe koagulimit',sig:'Përdor plazmë ABO-kompatibile. Rivlerëso gjakderdhjen, koagulimin dhe mbingarkesën me lëngje; administrimi dhe ruajtja sipas bankës së gjakut.'})],['Për mungesë faktorësh koagulimi me indikacion transfuzioni. FFP nuk përdoret për rritjen e hemoglobinës.']);
save('3.5',[group('Një dozë terapeutike për të rritur',[
 option('Aferezë',{kind:'blood-product',title:'Trombocite nga afereza',dose:'1 dozë terapeutike për të rritur',route:'IV',frequency:'Një transfuzion; rivlerësim',duration:'Sipas indikacionit',sig:'Rritja e pritshme: rreth 20–40 × 10⁹/L te i rrituri 70 kg pa konsumim të shtuar.'}),
 option('Paketë e bashkuar',{kind:'blood-product',title:'Trombocite të bashkuara (pooled)',dose:'1 dozë terapeutike për të rritur',route:'IV',frequency:'Një transfuzion; rivlerësim',duration:'Sipas indikacionit',sig:'Doza e të rriturit është paketa terapeutike e plotë; nuk barazohet me një qese të vetme 50–70 mL.'}),
])],['Konfirmo produktin, indikacionin dhe përputhshmërinë me bankën e gjakut.']);
save('3.12',[one('Albumina pas paracentezës',drug('Albuminë humane','8 g për çdo litër asciti të hequr','Pas përfundimit të paracentezës','Një administrim','IV','Për paracentezë >5 L te cirroza. Llogaritja bazohet në vëllimin e ascitit të drenazhuar, jo në vëllimin e albuminës.'),'Cirrozë dhe paracentezë >5 L')],['Anestezia lokale dhe përgatitja e procedurës individualizohen veçmas. Për vëllime <5 L, albumina kërkon vlerësim individual në insuficiencë hepatike akute mbi kronike ose rrezik të lartë dëmtimi renal.']);

save('5.1',[one('Vlerësimi fillestar',care('Përcakto shkakun e etheve','Vlerëso shenjat e sepsisit dhe ekspozimin ndaj malaries. Kryej testim të shpejtë/mikroskopi për malarie kur indikohet; antibiotiku dhe antimalariku nuk janë automatikisht një kombinim.'))],['Kalo te skema e diagnozës së konfirmuar. Ethet me të dridhura nuk përcaktojnë një regjim unik.'],{status:'reference'});
save('5.2',[
 one('Reanimimi fillestar',care('Kristaloid IV','Në hipoperfuzion nga sepsisi ose shok septik: fillimisht të paktën 30 mL/kg gjatë 3 orëve të para, me rivlerësim të shpeshtë dhe përshtatje për rrezikun e mbingarkesës.')),
 one('Vazopresori i parë',drug('Noradrenaline','Fillimisht 0,05–0,15 mikrogram/kg/min, si bazë','Infuzion i vazhdueshëm; titrim','Sipas përgjigjes hemodinamike','IV me pompë','Monitorim hemodinamik. Objektiv fillestar MAP rreth 65 mmHg; individualizo. Verifiko në etiketë nëse përqendrimi shpreh bazën apo kripën para programimit të pompës.'),'Hipotension që vazhdon gjatë/pas reanimimit; në shok të paqëndrueshëm mund të fillojë njëkohësisht'),
 one('Shtesë inotrope',drug('Dobutamine','2,5–20 mikrogram/kg/min','Infuzion i vazhdueshëm; titrim','Sipas perfuzionit dhe tolerancës','IV me pompë','Shtohet mbi mbështetjen vazopresore; nuk është zëvendësim i barabartë i noradrenalinës.'),'Disfunksion kardiak dhe hipoperfuzion persistent pavarësisht vëllimit dhe presionit adekuat'),
],['Menaxhim urgjent spitalor. Merr hemokultura pa vonuar antibiotikët dhe trajto burimin e infeksionit.']);
save('5.4',[group('Profilaksia VTE te pacienti mjekësor me imobilizim',[
 option('Heparinë me peshë të ulët molekulare',drug('Enoxaparin sodium','40 mg = 4000 IU anti-Xa','1 herë në ditë','Zakonisht 6–14 ditë; rivlerëso','Nënlëkurë','Regjim profilaktik i të rriturit. Në CrCl 15–30 mL/min: 20 mg një herë/ditë; në CrCl <15 mL/min nuk rekomandohet jashtë indikacionit të dializës.')),
 option('Alternativë e përzgjedhur',drug('Fondaparinux','2,5 mg','1 herë në ditë','Zakonisht 6–14 ditë; rivlerëso','Nënlëkurë','Vetëm kur indikohet. CrCl 20–50 mL/min: 1,5 mg një herë/ditë; CrCl <20 mL/min: mos e përdor. Kujdes në peshë <50 kg.')),
])],['Vlerëso gjakderdhjen, trombocitet, funksionin renal, peshën dhe historinë e HIT. Dozat e trajtimit të VTE nuk janë doza profilaksie.']);
save('5.5',[group('Një antibiotik oral',[
 option('Azithromycin',drug('Azithromycin','1 g në ditën 1, pastaj 500 mg/ditë','1 herë në ditë','7 ditë gjithsej')),
 option('Cefixime kur shtami është i ndjeshëm',drug('Cefixime','200 mg','2 herë në ditë','10–14 ditë')),
])],['I rritur me ethe enterike të pakomplikuara. Përshtat sipas udhëtimit, kulturave dhe antibiogramit; cefixime nuk përdoret në rezistencë ndaj cefalosporinave të gjeneratës III ose XDR.']);
save('5.6',[one('Antibiotik parenteral fillestar',drug('Ceftriaxone','2 g','1–2 herë në ditë','Pastaj kalo në azithromycin për të plotësuar të paktën 7 ditë gjithsej','IV','Kalo në trajtim oral kur ethet ulen, gjendja përmirësohet dhe pacienti toleron marrjen nga goja.'))],['Hospitalizim dhe monitorim. Në rezistencë të dyshuar/konfirmuar ndaj ceftriaxone ose XDR kërko meropenem dhe dozë të individualizuar nga specialisti.']);
patch('5.7',()=>{},['Bartja kronike kërkon kulturë, antibiogram dhe specialist. Mos përshkruaj fluorokinolon pa ndjeshmëri të dokumentuar.'],{status:'reference'});

const al=()=>drug('Artemether + Lumefantrine','80 mg + 480 mg për dozë (4 tableta nga 20/120 mg)','Në orët 0, 8, 24, 36, 48 dhe 60','6 doza në 3 ditë','Nga goja','Regjimi i të rriturit / peshë ≥35 kg. Merret me ushqim ose pije që përmban yndyrë. Pesha <35 kg kërkon dozë tjetër.');
const primaquine=()=>drug('Primaquine','30 mg BAZË','1 herë në ditë','14 ditë','Nga goja','Kërko G6PD sasior normal. Për peshë ≥70 kg, përshtat dozën totale në 6 mg bazë/kg pa kaluar 30 mg/ditë. Kundërindikohet në shtatzëni; në gjidhënie duhet edhe G6PD normal i foshnjës.');
save('5.8',[group('Trajtimi i fazës së gjakut',[
 option('Chloroquine',drug('Chloroquine phosphate','1000 mg kripë (=600 mg bazë), pastaj 500 mg kripë (=300 mg bazë)','Doza e parë; pastaj në 6, 24 dhe 48 orë','4 doza gjithsej','Nga goja')),
 option('Hydroxychloroquine',drug('Hydroxychloroquine sulfate','800 mg kripë (=620 mg bazë), pastaj 400 mg kripë (=310 mg bazë)','Doza e parë; pastaj në 6, 24 dhe 48 orë','4 doza gjithsej','Nga goja')),
]),group('Parandalimi i rikthimit',[
 option('Primaquine',primaquine()),
 {...option('Tafenoquine · vetëm me chloroquine',drug('Tafenoquine','300 mg','Një herë','Dozë e vetme','Nga goja','Vetëm me chloroquine, moshë ≥16 vjeç dhe aktivitet G6PD ≥70%. Jo në shtatzëni; vlerëso gjidhënien dhe historinë psikiatrike.')),requiresOption:{group:'g1',option:'o1'}},
])],['P. vivax / P. ovale i ndjeshëm ndaj chloroquine; malarie e pakomplikuar te i rrituri. Konfirmo G6PD përpara terapisë kundër rikthimit.']);
save('5.9',[one('Trajtimi i fazës së gjakut',al()),one('Parandalimi i rikthimit',primaquine())],['P. vivax / P. ovale rezistent ndaj chloroquine; i rritur ≥35 kg, pa malarie të rëndë. Tafenoquine nuk lidhet automatikisht me një ACT.']);
save('5.10',[one('Trajtimi antimalarik',al())],['P. falciparum i pakomplikuar; i rritur ≥35 kg. Malarie e rëndë, shtatzëni dhe pesha më e ulët kërkojnë rrugë të posaçme trajtimi.'],{technicalNotes:['Varianti historik dihydroartemisinin/piperaquine 2-0-2 është hequr nga zgjedhja operative. Eurartesim përdoret një herë në ditë për 3 ditë, sipas peshës, me vlerësim QT dhe kufizime ushqimi; nuk konvertohet si alternativë e barabartë këtu.']});

save('5.12',[group('Kristaloid izotonik',[
 option('NaCl',care('Sodium chloride 0,9% IV','Përshtat shpejtësinë sipas perfuzionit, hematokritit, diurezës dhe rivlerësimit të shpeshtë.')),
 option('Ringer lactate',care('Ringer lactate IV','Përshtat shpejtësinë sipas perfuzionit, hematokritit, diurezës dhe rivlerësimit të shpeshtë.')),
]),one('Ethe / dhimbje',paracetamol(),'Nëse nevojitet')],['Hospitalizim sipas shenjave paralajmëruese. Pa transfuzion profilaktik trombocitesh vetëm nga numri i ulët, kur mungon gjakderdhja aktive. Gjakderdhja, procedurat dhe shoku kërkojnë vendim specialistik. Shmang NSAID dhe aspirinën.']);
save('5.13',[one('Kombinimi antibiotik',drug('Doxycycline','100 mg','2 herë në ditë','Të paktën 6 javë')),group('EDHE një nga këto',[
 option('Rifampicin',drug('Rifampicin','600–900 mg','1 herë në ditë','Të paktën 6 javë')),
 option('Streptomycin',drug('Streptomycin','1 g','1 herë në ditë','14–21 ditë','IM')),
 option('Gentamicin',drug('Gentamicin','5 mg/kg','1 herë në ditë','7–10 ditë','IV ose IM','Monitoro funksionin renal dhe nivelet kur indikohet.')),
])],['Brucelozë e pakomplikuar te i rrituri. Shtatzënia, fëmijët dhe infeksioni fokal kërkojnë regjim tjetër; verifiko specien, rezistencën dhe ndërveprimet.']);
save('5.18',[group('Zgjidh sipas species',[
 option('S. mansoni / haematobium / intercalatum',drug('Praziquantel','20 mg/kg për dozë (40 mg/kg/ditë gjithsej)','2 doza të ndara gjatë ditës','1 ditë')),
 option('S. japonicum / mekongi',drug('Praziquantel','20 mg/kg për dozë (60 mg/kg/ditë gjithsej)','3 doza të ndara gjatë ditës','1 ditë')),
])],['Në disa infeksione të lehta mund të duhet përsëritje pas 2–4 javësh. Nëse vezët janë dokumentuar para trajtimit, kontrollo feçet/urinën pas 1–2 muajsh.']);
save('5.21',[group('Regjimi sipas zonës dhe pacientit',[
 option('Liposomal amphotericin B',drug('Liposomal amphotericin B','3 mg/kg për dozë','Ditët 1–5, 14 dhe 21','7 doza gjithsej','IV','Regjim për pacientin imunokompetent; jo i këmbyeshëm mg-për-mg me amphotericin B deoxycholate.')),
 option('Afrika Lindore · kur paromomycin + miltefosine përjashtohet',drug('Sodium stibogluconate','20 mg Sb⁵⁺/kg/ditë','1 herë në ditë','17 ditë','IV ose IM'),drug('Paromomycin sulfate','15 mg/kg/ditë (afërsisht 11 mg bazë/kg/ditë)','1 herë në ditë','17 ditë','IM')),
])],['Leishmaniaza viscerale kërkon specialist dhe zgjedhje sipas rajonit, statusit imunitar dhe rezistencës. Për Afrikën Lindore, parapëlqehet paromomycin + miltefosine; ky regjim kërkon dozimin përkatës sipas peshës dhe nuk zëvendësohet me regjimin historik 17-ditor.'],{technicalNotes:['Ribashkimi i fjalisë historike: sodium stibogluconate 20 mg Sb⁵⁺/kg/ditë IV/IM EDHE paromomycin sulfate 15 mg/kg/ditë IM, të dyja për 17 ditë. Nuk paraqitet si zgjedhja e parapëlqyer aktuale për Afrikën Lindore.']});
save('5.22',[one('Antibiotiku i parë',drug('Doxycycline','100 mg te i rrituri / fëmija ≥45 kg; 2,2 mg/kg për dozë te fëmija <45 kg','2 herë në ditë','Të paktën 3 ditë pas uljes së etheve dhe deri në përmirësim klinik','Nga goja','Përdoret në të gjitha moshat për scrub typhus. Shtatzënia ose alergjia e rëndë kërkon konsultë për alternativë.'))],['Mos e ndal vetëm për shkak të moshës pediatrike. Kursi shumë i shkurtër mund të shkaktojë rikthim.']);
save('5.30',[one('Trajtimi intestinal',drug('Praziquantel','5–10 mg/kg','Një herë','Dozë e vetme'))],['Vlerëso aneminë dhe mungesën e vitaminës B12. Simptomat neurologjike kërkojnë diagnozë tjetër të veçantë; dexamethasone dhe antikonvulsantët nuk janë shtesë rutinë për këtë infeksion intestinal.']);
save('5.32',[group('Zgjidh një antihelmintik',[
 option('Mebendazole',drug('Mebendazole','100 mg','Një herë; përsërite pas 2 javësh','2 doza gjithsej')),
 option('Pyrantel',drug('Pyrantel pamoate','11 mg/kg si bazë pyrantel; maksimumi 1 g','Një herë; përsërite pas 2 javësh','2 doza gjithsej')),
 option('Albendazole',drug('Albendazole','400 mg','Një herë; përsërite pas 2 javësh','2 doza gjithsej','Nga goja','Merret në stomak bosh.')),
])],['Higjiena dhe trajtimi i njëkohshëm i kontakteve familjare kur indikohet. Shtatzënia dhe fëmijët <2 vjeç kërkojnë vlerësim individual të përfitimit dhe rrezikut.']);
save('5.35',[one('Trajtimi individual',drug('Diethylcarbamazine (DEC)','6 mg/kg/ditë gjithsej','Në 3 doza të ndara','12 ditë','Nga goja','Para trajtimit përjashto onchocerciasis dhe vlerëso ekspozimin ndaj Loa loa.'))],['Filarioza kërkon konfirmim dhe specialist. Programi vjetor MDA nuk është i njëjtë me trajtimin individual.'],{technicalNotes:['WHO: IDA në programet e përshtatshme = ivermectin 200 mikrogram/kg + DEC 6 mg/kg + albendazole 400 mg, një dozë vjetore; varet nga bashkë-endemiciteti dhe kushtet programore. Jo DEC 2 mg/kg si dozë e vetme. CDC përmend edhe kurs 1-ditor si mundësi; nuk përzihet me kursin 12-ditor të paraqitur.']});
save('5.38',[group('Zgjidh një regjim',[
 option('Zgjedhja e parë, jo shtatzënë',drug('Doxycycline','100 mg','2 herë në ditë','7 ditë')),
 option('Alternativë / shtatzëni',drug('Azithromycin','1 g','Një herë','Dozë e vetme')),
 option('Alternativë në shtatzëni',drug('Amoxicillin','500 mg','3 herë në ditë','7 ditë')),
])],['Në shtatzëni: test shërimi rreth 4 javë pas trajtimit. Menaxho partnerët dhe ritesto pas 3 muajsh; shmang kontaktet seksuale për 7 ditë pas dozës së vetme ose deri në përfundimin e kursit dhe trajtimin e partnerëve.']);
save('5.39',[group('Zgjidh një regjim',[
 option('Azithromycin',drug('Azithromycin','1 g','1 herë në javë','Të paktën 3 javë dhe deri në shërimin e të gjitha lezioneve')),
 option('Doxycycline',drug('Doxycycline','100 mg','2 herë në ditë','Të paktën 3 javë dhe deri në shërimin e të gjitha lezioneve')),
 option('Erythromycin',drug('Erythromycin base','500 mg','4 herë në ditë','Të paktën 3 javë dhe deri në shërimin e të gjitha lezioneve')),
 option('Trimethoprim / Sulfamethoxazole',drug('Trimethoprim + Sulfamethoxazole','160 mg + 800 mg','2 herë në ditë','Të paktën 3 javë dhe deri në shërimin e të gjitha lezioneve')),
])],['Në shtatzëni ose gjidhënie zgjidh makrolid; vlerëso HIV dhe ndiq pacientin deri në shërim.']);
save('5.41',[group('Zgjidh një antiviral',[
 option('Acyclovir',drug('Acyclovir','400 mg','3 herë në ditë','7–10 ditë')),
 option('Famciclovir',drug('Famciclovir','250 mg','3 herë në ditë','7–10 ditë')),
 option('Valacyclovir',drug('Valacyclovir','1 g','2 herë në ditë','7–10 ditë')),
])],['Zgjate nëse shërimi nuk është i plotë pas 10 ditësh. Përshtat dozën për funksionin renal.']);
save('5.42',[group('Zgjidh një regjim episodik',[
 option('Acyclovir · 5 ditë',drug('Acyclovir','800 mg','2 herë në ditë','5 ditë')),
 option('Acyclovir · 2 ditë',drug('Acyclovir','800 mg','3 herë në ditë','2 ditë')),
 option('Famciclovir',drug('Famciclovir','1 g','2 herë në ditë','1 ditë')),
 option('Valacyclovir · 3 ditë',drug('Valacyclovir','500 mg','2 herë në ditë','3 ditë')),
 option('Valacyclovir · 5 ditë',drug('Valacyclovir','1 g','1 herë në ditë','5 ditë')),
])],['Fillo brenda 1 dite nga lezionet ose gjatë prodromës. Përshtat dozën për funksionin renal.']);
save('5.43',[group('Zgjidh një terapi supresive',[
 option('Acyclovir',drug('Acyclovir','400 mg','2 herë në ditë','Terapi e vazhdueshme; rivlerësim periodik')),
 option('Famciclovir',drug('Famciclovir','500 mg','2 herë në ditë','Terapi e vazhdueshme; rivlerësim periodik')),
 option('Valacyclovir',drug('Valacyclovir','500 mg','2 herë në ditë','Terapi e vazhdueshme; rivlerësim periodik')),
])],['Supresioni nuk është kurs episodik 7–10-ditor. Përshtat dozën për funksionin renal.']);
save('5.44',[group('Zgjidh një regjim episodik',[
 option('Acyclovir',drug('Acyclovir','400 mg','3 herë në ditë','5–10 ditë')),
 option('Famciclovir',drug('Famciclovir','500 mg','2 herë në ditë','5–10 ditë')),
 option('Valacyclovir',drug('Valacyclovir','1 g','2 herë në ditë','5–10 ditë')),
])],['Përshtat dozën për funksionin renal; sëmundja e rëndë kërkon trajtim IV të veçantë.']);
const cefGono=()=>drug('Ceftriaxone','500 mg në peshë <150 kg; 1 g në peshë ≥150 kg','Një herë','Dozë e vetme','IM');
save('5.45',[group('Zgjidh një regjim të plotë',[
 option('Regjimi i parë',cefGono(),drug('Doxycycline','100 mg','2 herë në ditë','7 ditë','Nga goja','Jo si zgjedhje në shtatzëni.',{condition:'Chlamydia nuk është përjashtuar'})),
 option('Alternativë në alergji ndaj cefalosporinave',drug('Gentamicin','240 mg','Një herë','Dozë e vetme','IM'),drug('Azithromycin','2 g','Një herë','Dozë e vetme')),
])],['Për gonorre urogjenitale/rektale të pakomplikuar. Për infeksion faringeal, shtatzëni ose alergji të rëndë kërko regjim/konsultë të përshtatshme. Menaxho partnerët dhe ritesto pas 3 muajsh.']);
save('5.46',[group('Zgjidh sipas shkakut të dyshuar',[
 option('Gonorre / chlamydia',cefGono(),drug('Doxycycline','100 mg','2 herë në ditë','10 ditë')),
 option('Gonorre / chlamydia dhe patogjenë enterikë',cefGono(),drug('Levofloxacin','500 mg','1 herë në ditë','10 ditë')),
 option('Vetëm patogjenë enterikë; gonorrea e përjashtuar',drug('Levofloxacin','500 mg','1 herë në ditë','10 ditë')),
])],['Përjashto torsionin testikular urgjentisht kur dyshohet. Përshtat sipas kulturave, funksionit renal dhe kundërindikacioneve; rivlerëso në mungesë përmirësimi brenda 72 orëve.']);
for(const [key,days] of [['5.48',14],['5.49',28]])save(key,[group('Zgjidh një regjim',[
 option('Penicillin',drug('Benzathine penicillin G','2,4 milion njësi','5.48'===key?'Një herë':'1 herë në javë','5.48'===key?'Dozë e vetme':'3 javë; 7,2 milion njësi gjithsej','IM')),
 option('Alergji ndaj penicilinës, jo shtatzënë',drug('Doxycycline','100 mg','2 herë në ditë',`${days} ditë`)),
])],['Shtatzënia kërkon penicillin pas desensibilizimit kur ka alergji. Simptomat neurologjike/okulare/otike kërkojnë vlerësim për neurosifilis. Metronidazole nuk është pjesë e trajtimit rutinë të sifilisit.']);
save('5.50',[group('Zgjidh një regjim të plotë',[
 option('Penicillin G IV',drug('Aqueous crystalline penicillin G','18–24 milion njësi GJITHSEJ në 24 orë','3–4 milion njësi çdo 4 orë OSE infuzion i vazhdueshëm','10–14 ditë','IV','Doza 18–24 milion njësi nuk përsëritet çdo 4 orë.')),
 option('Alternativë kur respektimi i trajtimit sigurohet',drug('Procaine penicillin G','2,4 milion njësi','1 herë në ditë','10–14 ditë','IM'),drug('Probenecid','500 mg','4 herë në ditë','10–14 ditë')),
 option('Alternativë pas vlerësimit të alergjisë / specialistit',drug('Ceftriaxone','1–2 g','1 herë në ditë','10–14 ditë','IV ose IM')),
])],['Menaxhim specialistik. Alergjia dhe shtatzënia kërkojnë vlerësim të posaçëm; në shtatzëni përdoret penicillin pas desensibilizimit kur indikohet.']);
save('5.51',[one('Rehidrimi',care('ORS','Rehidrim oral sipas humbjeve dhe gjendjes klinike.')),group('Një antibiotik kur indikohet',[
 option('Ciprofloxacin kur është i përshtatshëm',drug('Ciprofloxacin','500 mg','2 herë në ditë','3 ditë')),
 option('Rezistencë / kundërindikacion ndaj ciprofloxacin',drug('Azithromycin','500 mg në ditën 1, pastaj 250 mg/ditë','1 herë në ditë','5 ditë gjithsej')),
 option('Alternativë kur shtami është i ndjeshëm',drug('Cefixime','400 mg','1 herë në ditë','5 ditë')),
],'Infeksion që kërkon antibiotik; zgjedhje sipas antibiogramit')],['I rritur. Merr kulturë dhe antibiogram; rivlerëso pas 48 orësh në mungesë përmirësimi. Mos përdor loperamide në dizenteri.']);
save('5.52',[one('Rehidrimi dhe monitorimi',care('Kristaloid IV dhe pastaj ORS','Rivlerëso perfuzionin, elektrolitet dhe diurezën. Kalo në ORS kur tolerohet.')),one('Antibiotiku',drug('Ceftriaxone','1–2 g','1 herë në ditë','3 ditë; rivlerëso sipas kulturave','IM','Zgjedhje për infeksion të rëndë ose pamundësi të trajtimit oral.'))],['Hospitalizim. I rritur; kultura dhe antibiogrami përcaktojnë trajtimin përfundimtar. Rezistenca mund të kërkojë regjim tjetër specialistik.']);

const dex=()=>drug('Dexamethasone','6 mg','1 herë në ditë','Deri në 10 ditë ose deri në dalje nga spitali','Nga goja ose IV');
const rem=()=>drug('Remdesivir','200 mg në ditën 1, pastaj 100 mg/ditë','1 herë në ditë','5 ditë; deri në 10 në ventilim invaziv/ECMO ose pa përmirësim','IV','Infuzion 30–120 minuta; përgatitja/hollimi sipas produktit. Kontrollo funksionin hepatik dhe reaksionet e infuzionit. Mos e bashkadministro me chloroquine/hydroxychloroquine.');
const toci=()=>drug('Tocilizumab','8 mg/kg; maksimumi 800 mg','Një infuzion; rivlerësim','Dozë e vetme fillestare','IV gjatë 60 minutave','Vetëm me kortikosteroid sistemik dhe nevojë për oksigjen/ventilim. Një dozë e dytë mund të merret në konsideratë pas ≥8 orësh vetëm nëse nuk ka përmirësim ose ka përkeqësim; jo përsëritje automatike. Kontrollo infeksionet aktive, neutrofilet, trombocitet dhe transaminazat.');
save('5.53',[one('Mbështetja respiratore',care('Oksigjen','Titrim sipas oksigjenimit, rrezikut të hiperkapnisë dhe protokollit të njësisë; eskalo mbështetjen kur nevojitet.')),one('Kortikosteroid',dex(),'COVID-19 i rëndë/kritik me nevojë për oksigjen')],['Vlerëso veçmas antiviralët, rrezikun VTE dhe infeksionin bakterial. Antibiotikët dhe vëllimet fikse të lëngjeve nuk jepen automatikisht për çdo pacient.']);
save('5.54',[one('Antivirali',rem())],['Pacient i hospitalizuar i përzgjedhur sipas fazës së sëmundjes dhe nevojës për oksigjen; nuk është trajtim universal për çdo COVID-19.']);
save('5.55',[one('Imunomodulatori',toci())],['Për COVID-19 të rëndë/kritik, me vlerësim specialistik të inflamacionit dhe kundërindikacioneve.']);
save('5.56',[],['Favipiravir nuk paraqitet si recetë aktive standarde për COVID-19. Skema historike për influenza mbetet vetëm në informacionin e zgjeruar.'],{status:'reference'});
save('5.57',[one('Imunomodulatori',drug('Baricitinib','4 mg','1 herë në ditë','Deri në 14 ditë ose deri në dalje nga spitali','Nga goja ose tub enteral','Me kortikosteroid sistemik kur indikohet. eGFR 30–<60: 2 mg/ditë; 15–<30: 1 mg/ditë. Jo në eGFR <15, dializë ose dëmtim akut renal. Kontrollo citopenitë, infeksionet dhe funksionin hepatik.'))],['Pacient i hospitalizuar i përzgjedhur me COVID-19 të rëndë/kritik. Baricitinib dhe tocilizumab nuk shtohen rutinë të dyja bashkë.']);
save('5.58',[one('Ethe / dhimbje',paracetamol(),'Nëse nevojitet'),one('Kujdesi në shtëpi',care('Hidratim dhe monitorim','Monitoro frymëmarrjen dhe gjendjen e përgjithshme; kërko vlerësim urgjent në dispne, dhimbje gjoksi, konfuzion ose hipoksemi.'))],['Pa kortikosteroid sistemik ose antibiotik rutinë kur nuk ka hipoksemi apo indikacion tjetër të veçantë. Pacientët me rrezik të lartë duhen vlerësuar herët për antiviral specifik.']);
save('5.59',[
 one('Kujdes intensiv',care('Mbështetje respiratore dhe hemodinamike','Monitorim në ICU/HDU; titrim i oksigjenit dhe eskalim i mbështetjes sipas nevojës. Lëngje sipas perfuzionit dhe bilancit, jo bolus universal.')),
 group('Një kortikosteroid',[
  option('Dexamethasone',dex()),
  option('Methylprednisolone',drug('Methylprednisolone','32 mg/ditë gjithsej','1 herë në ditë ose në doza të ndara','Deri në 10 ditë ose deri në dalje nga spitali','IV ose nga goja')),
  option('Prednisone',drug('Prednisone','40 mg','1 herë në ditë','Deri në 10 ditë ose deri në dalje nga spitali')),
 ]),
 group('Një imunomodulator nëse indikohet',[
  option('Tocilizumab',toci()),
  option('Baricitinib',drug('Baricitinib','4 mg','1 herë në ditë','Deri në 14 ditë ose dalje nga spitali','Nga goja / tub enteral','eGFR 30–<60: 2 mg; 15–<30: 1 mg/ditë. Jo në eGFR <15, dializë ose dëmtim akut renal.')),
 ],'Indikacion specialistik për imunomodulim; kontrollo kundërindikacionet'),
 one('Antiviral',rem(),'Pacient i përzgjedhur sipas fazës klinike; vendim specialistik'),
 one('Profilaksi VTE',drug('Enoxaparin sodium','40 mg = 4000 IU anti-Xa','1 herë në ditë','Gjatë indikacionit spitalor; rivlerësim','Nënlëkurë','Regjim profilaktik, jo trajtim i trombozës. CrCl 15–30 mL/min: 20 mg/ditë; CrCl <15 kërkon alternativë/protokoll specialistik. Individualizo për peshë dhe rrezik gjakderdhjeje.'),'Pa kundërindikacion për profilaksi; tromboza e dokumentuar ka regjim tjetër'),
],['Antibiotik vetëm kur dyshohet ose konfirmohet bashkëinfeksion bakterial. Kontrollo funksionin renal/hepatik, gjakderdhjen dhe ndërveprimet para zgjedhjes së regjimit.']);

// Add primary references for newly completed items beyond the audit's original
// source list. These are visible only in the explicit information disclosure.
const extraRefs={
 '3.5':['https://www.lifeblood.com.au/health-professionals/clinical-practice/use-of-blood-components/use-of-platelets'],
 '5.4':['https://www.medicines.org.uk/emc/product/3335/smpc'],
 '5.13':['https://www.cdc.gov/brucellosis/hcp/clinical-overview/'],
 '5.21':['https://www.cdc.gov/leishmaniasis/hcp/clinical-care/index.html','https://www.who.int/news/item/29-07-2026-who-updates-treatment-guidelines-on-visceral-and-post-kala-azar-dermal-leishmaniasis','https://www.afro.who.int/sites/default/files/2026-08/WHO%20guidelines%20on%20leishmaniasis%20treatment-VL%20and%20PKDL-July%202026.pdf'],
 '5.2':['https://cec.health.nsw.gov.au/therapeutics-safety/continuous-infusions/adult/dobutamine'],
 '5.30':['https://www.cdc.gov/diphyllobothrium/hcp/clinical-care/index.html'],
 '5.35':['https://www.cdc.gov/filarial-worms/hcp/clinical-care/index.html'],
 '5.57':['https://www.accessdata.fda.gov/drugsatfda_docs/label/2022/207924s006lbl.pdf'],
 '5.54':['https://www.medicines.org.uk/emc/product/11597/smpc'],
 '5.5':['https://medicalguidelines.msf.org/en/viewport/CG/english/enteric-typhoid-and-paratyphoid-fevers-16689926.html'],
 '5.6':['https://medicalguidelines.msf.org/en/viewport/CG/english/enteric-typhoid-and-paratyphoid-fevers-16689926.html'],
 '5.51':['https://medicalguidelines.msf.org/en/viewport/CG/english/shigellosis-16689596.html'],
 '5.52':['https://medicalguidelines.msf.org/en/viewport/CG/english/shigellosis-16689596.html'],
};
for(const revision of Object.values(result.guides)) {
 for(const url of extraRefs[revision.key]||[])if(!revision.references.some(r=>r.url===url))revision.references.push({key:'additional-primary',url});
 // Clinical plans carry no claim of an independent medical approval.
 revision.reviewState='evidence-reconciled';
 revision.groups.forEach((g,gi)=>{g.id=`g${gi+1}`;g.options.forEach((o,oi)=>{o.id=`o${oi+1}`;o.items.forEach((i,ii)=>{i.id=`i${ii+1}`;});});});
 if (revision.key==='5.2')revision.groups[2].requiresGroup='g2';
}
const target=path.resolve(__dirname,'../data/recetat-clinical-revisions-1-5.json');
fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n');
console.log(`Prepared ${Object.keys(result.guides).length} separate clinical revisions; source unchanged.`);
