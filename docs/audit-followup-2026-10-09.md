# DRx — vazhdimi i auditit, 9 tetor 2026

Kjo paketë përmirëson lexueshmërinë në modulet e tjera, lehtëson kërkimin e barnave dhe shton matje private të përvojës së përdorimit. Burimet klinike, dozat, alternativat dhe tabelat e burimit mbeten të ruajtura.

## Ndryshimet

- Teksti dytësor, etiketat dhe statuset në ICD, ATC, Analizat, Dozologjia, Protokollet, Recetat, Sistemi dhe Urgjencat kanë kontrast më të qartë. Kontrolli i pamjeve të hapura të 10 moduleve kaloi në të dy temat; 8 modulet e korrigjuara u kontrolluan edhe në 390px. Kjo mbulon gjendjet e testuara, jo çdo dokument e dritare të aplikacionit.
- Kërkimi dhe renditja që nuk varen nga dozat përdorin projeksionin e lehtë. Dozat e produkteve të dukshme ngarkohen veçmas dhe paraqesin gjendjen e ngarkimit. Një përgjigje e vjetër ose një kartelë me identitet tjetër nuk mund të mbushë produktin aktual. Filtrimi dhe renditja sipas dozës ruajnë lexuesin e plotë.
- Matjet përdorin bibliotekën zyrtare web-vitals, një kampion prej 10% dhe vetëm përdorues të autentikuar. Nuk dërgojnë tekst klinik, kërkime, URL, email, IP ose përmbajtje gabimesh. GPC dhe Do Not Track respektohen. Kampionët e përditësuar zëvendësojnë matjen e mëparshme; nuk numërojnë një vizitë të re.
- Administratori ka panelin e matjeve te Sistemi. Telefon dhe desktop tregohen veçmas. Matjet e pambështetura mungojnë dhe duhen të paktën 20 kampione për një vlerësim p75. Alarmet shfaqen në panel; nuk janë konfiguruar njoftime me email.
- Migrimi i matjeve është në një skemë private, me RLS dhe dy RPC vetëm për service_role. Verifikimi sintetik real në databazë u kthye mbrapsht me ROLLBACK. Pas DDL, këshilluesit nuk gjetën paralajmërime të reja për këtë skemë; RLS pa policy është mbyllje e qëllimshme për klientët publikë.

## Evidenca

178 skedarët e suitës aktive kaluan. Pariteti real krahasoi 4,177 produkte dhe 2,340 kombinime kërkimi/renditjeje/faqeje. Në një provë të ftohtë, leximi i plotë bëri 13 kërkesa në 2,488ms; leximi i lehtë një kërkesë në 959ms. Ky kampion nuk është p95 i prodhimit.

Chromium dhe WebKit kontrolluan ngarkimin e dozave, ndryshimin e faqes, refuzimin e kartelës së gabuar dhe panelin privat në 390/1440px. Prova me bibliotekën reale verifikoi LCP/INP/CLS në Chromium dhe mungesën e matjeve të pambështetura në WebKit-in e instaluar. Importi i bibliotekës dhe paneli janë në shell-in offline. Rikthimi offline, revokimi dhe dalja kaluan në të dy shfletuesit. Provat sintetike nuk janë matje reale të trafikut të prodhimit.

## Çfarë mbetet

| Fusha | Puna e mbetur |
|---|---|
| Main | Konfirmimi i identitetit në GitHub për mbrojtjen e main mbetet detyrë e pronarit. |
| Siguria e fjalëkalimeve | Mbrojtja e fjalëkalimeve të rrjedhura kërkon planin përkatës të Supabase; nuk u ble plan i ri. |
| Backup dhe çelësat | Rotacioni i çelësit në prodhim dhe rikthimi nga një backup real në mjedis të izoluar mbeten për t'u kryer. Provat sintetike kanë kaluar. |
| Shënimet | Zhbëj trajton konfliktet e lexuara, por çdo shkrues duhet të përdorë versionim atomik për garanci ndaj redaktimeve njëkohësisht. |
| Substancat | Aliaset e miratuara normalizohen; duhen proces i qëndrueshëm miratimi, burim dhe historik për bashkimet e ardhshme. |
| Shkallëzimi | Rrugët sipas dozës ruajnë lexuesin e plotë. Cache global dhe konsolidimi i legacy/stileve kërkojnë verifikim të veçantë, përfshirë printimin dhe offline. |
| Matjet reale | Duhet trafik dhe kampionë të mjaftueshëm. Nuk deklarohet një p75/p95 real ose përvojë e shëndetshme pa të dhëna. Pastrimi i matjeve është oportunistik; 26h/14d janë pragje pastrimi, jo afate të garantuara fshirjeje. |

[Mbrojtja e fjalëkalimeve](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [RLS pa policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Kontrollet e vazhdimësisë

Dy prova që ekzekutoheshin vetëm pas bashkimit në main kishin fixtures nga ndërfaqja para v27. Kontratat e pilotit historik tani lexojnë arkivin përkatës dhe mbajnë të gjitha pohimet e burimeve/dozave. Kontrolli i kalkulatorit aktual verifikon veçmas indikacionin, CrCl, eGFR, dializën, Child-Pugh dhe gjendjen hepatike. Favoritët/shënimet e produktit provojnë UUID kanonik dhe refuzimin e identitetit të pavlefshëm. Prova e vjetër e shfletuesit mbetet për pilotin historik; workflow provon edhe Favoritët dhe Shënimet aktuale në 320–1440px.

Këto porta tani kontrollohen edhe para bashkimit. Çelësi privat dhe kontrollet në databazën reale lejohen vetëm në main/manual, ndërsa pull requests përdorin prova pa sekret. Importi ICD përdor sekretin ekzistues SUPABASE_SECRET_KEY si alternativë të emrit MEDINDEX_SUPABASE_SECRET_KEY; importi real duhet të përfundojë në workflow para se kjo të quhet e verifikuar.

## Aktivizimi ICD

Importi real ngarkoi 12,542 rreshta, por zbuloi RPC-në e munguar të aktivizimit. Migrimi `20261009221820_restore_icd_hierarchy_atomic_activation.sql` e rikthen vetëm për service_role, me SECURITY INVOKER dhe search_path bosh. Aktivizimet serializohen; gjatë verifikimit bllokohen shkruesit e versioneve dhe nyjeve, ndërsa lexuesit vazhdojnë. Numrat e plotë, metadata, publikimi dhe lidhjet kapitull/bllok/kategori/nënkategori verifikohen para ndërrimit atomik të versionit të dukshëm.

Prova reale me service_role dhe ROLLBACK refuzoi versionin failed, numrat e gabuar, rreshtin e munguar, prindin e munguar, nivelin e gabuar, kapitullin e gabuar, prindin e papublikuar dhe titullin zyrtar bosh. Refuzimet ruajtën versionin e vjetër aktiv; aktivizimi i vlefshëm dha vetëm një version aktiv dhe 12,542 nyje. Fingerprint-i i çdo fushe të nyjeve mbeti identik. Prova nuk la ndryshime sintetike në databazë.

Të dy hyrjet e importuesit e shënojnë failed vetëm versionin ende staging. Humbja e përgjigjes pas një aktivizimi të kryer nuk mund ta çaktivizojë atë; kjo provohet në testin e importit. SQL-ja e bootstrap-it përdor të njëjtin funksion. Përputhja lokale me historikun real tani përmban 304 migrime.

Kufijtë: workflow serializon importet e zakonshme, por shkrues të pavarur kërkojnë gardh të veçantë për pandryshueshmërinë e versioneve aktive. Lexuesi me faqe dhe cache deri në gjashtë orë nuk garanton freskim të menjëhershëm të çdo instance; validimi i plotë dhe alternativa nga burimi mbeten aktive. Importi/aktivizimi i workflow në main duhet të kalojë pas këtij riparimi.
