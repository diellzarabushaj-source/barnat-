create table if not exists public.lab_indications (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title_sq text not null,
  title_en text not null default '',
  summary_sq text not null default '',
  icd_codes text[] not null default '{}',
  aliases_sq text[] not null default '{}',
  catalog_gaps jsonb not null default '[]'::jsonb,
  sort_order integer not null default 100,
  editorial_status text not null default 'draft'
    check (editorial_status in ('draft','review','published','archived')),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_indication_tests (
  indication_id uuid not null references public.lab_indications(id) on delete cascade,
  lab_test_id uuid not null references public.lab_tests(id) on delete cascade,
  tier text not null check (tier in ('core','recommended','conditional')),
  rationale_sq text not null default '',
  context_note_sq text not null default '',
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (indication_id, lab_test_id)
);

create index if not exists lab_indications_published_sort_idx
  on public.lab_indications (is_published, editorial_status, sort_order, title_sq);

create index if not exists lab_indication_tests_indication_sort_idx
  on public.lab_indication_tests (indication_id, tier, sort_order);

create index if not exists lab_indication_tests_lab_test_idx
  on public.lab_indication_tests (lab_test_id);

alter table public.lab_indications enable row level security;
alter table public.lab_indication_tests enable row level security;

drop policy if exists "published lab indications are readable" on public.lab_indications;
create policy "published lab indications are readable"
  on public.lab_indications
  for select
  to anon, authenticated
  using (is_published = true and editorial_status = 'published');

drop policy if exists "published lab indication tests are readable" on public.lab_indication_tests;
create policy "published lab indication tests are readable"
  on public.lab_indication_tests
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.lab_indications i
      where i.id = indication_id
        and i.is_published = true
        and i.editorial_status = 'published'
    )
    and exists (
      select 1
      from public.lab_tests t
      where t.id = lab_test_id
        and t.is_published = true
        and t.editorial_status = 'published'
    )
  );

grant select on public.lab_indications to anon, authenticated;
grant select on public.lab_indication_tests to anon, authenticated;

insert into public.lab_indications
  (slug,title_sq,title_en,summary_sq,icd_codes,aliases_sq,catalog_gaps,sort_order,editorial_status,is_published)
values
  (
    'diabeti-tip-2',
    'Diabeti mellitus tip 2',
    'Type 2 diabetes mellitus',
    'Panel orientues për vlerësim glikemik, renal dhe rrezik kardiometabolik. Përshtate me fazën e sëmundjes dhe terapinë.',
    array['E11'],
    array['diabet','diabet tip 2','dm2','t2dm'],
    '[{"name":"HbA1c","note":"Test kyç për monitorimin glikemik; ende nuk është në katalog."},{"name":"Raporti albuminë/kreatininë në urinë (ACR)","note":"I dobishëm për skriningun e albuminurisë; ende nuk është në katalog."}]'::jsonb,
    10,'published',true
  ),
  (
    'anemia-mungese-hekurit',
    'Anemia nga mungesa e hekurit',
    'Iron deficiency anaemia',
    'Panel orientues për konfirmimin e anemisë mikrocitare dhe vlerësimin e statusit të hekurit.',
    array['D50'],
    array['anemi','anemia','mungese hekuri','hekur i ulet'],
    '[{"name":"Ferritina","note":"Test kryesor për rezervat e hekurit; ende nuk është në katalog."}]'::jsonb,
    20,'published',true
  ),
  (
    'semundja-kronike-veshkave',
    'Sëmundja kronike e veshkave',
    'Chronic kidney disease',
    'Panel orientues për funksionin renal, elektrolitet dhe dëmtimin urinar. Frekuenca varet nga stadi dhe terapia.',
    array['N18'],
    array['ckd','semundje kronike e veshkave','insuficience renale kronike'],
    '[{"name":"Raporti albuminë/kreatininë në urinë (ACR)","note":"Përdoret për stadifikim të albuminurisë; ende nuk është në katalog."},{"name":"eGFR","note":"Duhet llogaritur nga kreatinina me formulën e përshtatshme; nuk është test i veçantë në katalog."}]'::jsonb,
    30,'published',true
  ),
  (
    'dislipidemia',
    'Dislipidemia',
    'Dyslipidaemia',
    'Profil lipidik orientues për vlerësimin dhe monitorimin e çrregullimeve të lipideve.',
    array['E78'],
    array['lipide','kolesterol i larte','hiperlipidemi','dislipidemi'],
    '[]'::jsonb,
    40,'published',true
  ),
  (
    'semundje-hepatike',
    'Sëmundje hepatike',
    'Liver disease',
    'Panel orientues për dëmtimin hepatocelular, kolestazën dhe funksionin sintetik të mëlçisë.',
    array['K76'],
    array['melci','hepatopati','semundje e melcise','liver disease'],
    '[{"name":"Fosfataza alkaline (ALP)","note":"E dobishme për vlerësimin e kolestazës; verifikohet/shtohet në katalog nëse mungon."}]'::jsonb,
    50,'published',true
  ),
  (
    'infeksion-urinar',
    'Infeksion i traktit urinar',
    'Urinary tract infection',
    'Panel orientues për vlerësimin fillestar të infeksionit urinar; kultura varet nga konteksti klinik dhe rreziku.',
    array['N39'],
    array['uti','infeksion urinar','cistit','dizuri'],
    '[{"name":"Urinokultura","note":"E rëndësishme në raste të komplikuara, të përsëritura ose para antibiotikut kur indikohet; ende nuk është në katalog."}]'::jsonb,
    60,'published',true
  )
on conflict (slug) do update set
  title_sq=excluded.title_sq,
  title_en=excluded.title_en,
  summary_sq=excluded.summary_sq,
  icd_codes=excluded.icd_codes,
  aliases_sq=excluded.aliases_sq,
  catalog_gaps=excluded.catalog_gaps,
  sort_order=excluded.sort_order,
  editorial_status=excluded.editorial_status,
  is_published=excluded.is_published,
  updated_at=now();

with mappings(indication_slug, test_form_name, test_full_name_en, tier, rationale_sq, context_note_sq, sort_order) as (
  values
    ('diabeti-tip-2','Glukoza','Blood Glucose','core','Vlerëson glikeminë aktuale dhe ndihmon në zbulimin e hiperglikemisë ose hipoglikemisë.','Interpreto sipas agjërimit, simptomave dhe terapisë.',10),
    ('diabeti-tip-2','Kreatinina','Serum Creatinine','recommended','Vlerëson funksionin renal dhe ndihmon në përshtatjen e terapisë.','Përdore për llogaritjen e eGFR.',20),
    ('diabeti-tip-2','Kolesteroli','Total Cholesterol','recommended','Pjesë e vlerësimit të rrezikut kardiovaskular.','Interpreto me LDL, HDL dhe trigliceridet.',30),
    ('diabeti-tip-2','LDL kolesteroli','Low-Density Lipoprotein Cholesterol','recommended','Parametër kryesor për menaxhimin e rrezikut aterosklerotik.','Objektivi varet nga rreziku kardiovaskular.',31),
    ('diabeti-tip-2','HDL kolesteroli','High-Density Lipoprotein Cholesterol','recommended','Plotëson profilin lipidik dhe stratifikimin e rrezikut.','Interpreto në kontekst të profilit të plotë lipidik.',32),
    ('diabeti-tip-2','Trigliceridet','Triglycerides','recommended','Identifikon hipertriglicerideminë dhe plotëson profilin kardiometabolik.','Merr parasysh agjërimin dhe faktorët sekondarë.',33),
    ('diabeti-tip-2','Ekzaminimi i urinës','Urinalysis','conditional','Mund të identifikojë glukozuri, ketonuri ose gjetje urinare që kërkojnë vlerësim shtesë.','Nuk zëvendëson ACR për albuminurinë.',40),

    ('anemia-mungese-hekurit','Hemoglobina / HGB','Hemoglobin','core','Konfirmon praninë dhe shkallën e anemisë.','Interpreto bashkë me indeksat eritrocitarë.',10),
    ('anemia-mungese-hekurit','Hematokriti / HCT','Hematocrit','core','Plotëson vlerësimin e masës eritrocitare.','Ndikohet nga statusi i volumit.',11),
    ('anemia-mungese-hekurit','MCV','Mean Corpuscular Volume','core','Ndihmon në klasifikimin e anemisë si mikrocitare, normocitare ose makrocitare.','MCV i ulët mbështet mikrocitozën, por nuk përcakton etiologjinë vetëm.',12),
    ('anemia-mungese-hekurit','MCH','Mean Corpuscular Hemoglobin','recommended','Plotëson karakterizimin morfologjik të eritrociteve.','Interpreto me MCV/MCHC.',13),
    ('anemia-mungese-hekurit','MCHC','Mean Corpuscular Hemoglobin Concentration','recommended','Plotëson vlerësimin e hipokromisë.','Interpreto me hemogramën dhe statusin e hekurit.',14),
    ('anemia-mungese-hekurit','Hekuri (Fe++)','Serum Iron','recommended','Ndihmon në vlerësimin e hekurit qarkullues.','Ka variacion ditor; nuk përdoret i vetëm për diagnozë.',20),
    ('anemia-mungese-hekurit','TIBC','Total Iron-Binding Capacity','recommended','Ndihmon në vlerësimin e kapacitetit lidhës dhe llogaritjen e saturimit të transferrinës.','Interpreto bashkë me hekurin dhe, kur të shtohet, ferritinën.',21),

    ('semundja-kronike-veshkave','Kreatinina','Serum Creatinine','core','Bazë për vlerësimin e funksionit renal dhe llogaritjen e eGFR.','Trend-i është shpesh më informues se një vlerë e vetme.',10),
    ('semundja-kronike-veshkave','Urea','Urea','core','Plotëson vlerësimin e funksionit renal dhe statusit metabolik/volumik.','Ndikohet nga hidratimi, dieta dhe katabolizmi.',11),
    ('semundja-kronike-veshkave','Natriumi','Sodium','core','Vlerëson çrregullimet e natriumit dhe balancën e lëngjeve.','Interpreto me statusin klinik të volumit.',12),
    ('semundja-kronike-veshkave','Kaliumi','Potassium','core','Hiperkalemia është komplikim i rëndësishëm i CKD dhe i disa terapive.','Vlerëso urgjent nëse është dukshëm i rritur ose ka ndryshime EKG.',13),
    ('semundja-kronike-veshkave','Ekzaminimi i urinës','Urinalysis','recommended','Kërkon proteinuri, hematuri dhe gjetje të tjera që orientojnë etiologjinë.','Plotëso me ACR kur të jetë i disponueshëm.',20),
    ('semundja-kronike-veshkave','Proteinet','Urine Protein','conditional','Mund të mbështesë vlerësimin e proteinurisë kur ACR nuk është i disponueshëm.','Metoda dhe sasia varen nga konteksti klinik.',21),

    ('dislipidemia','Kolesteroli','Total Cholesterol','core','Pjesë e profilit standard lipidik.','Interpreto së bashku me fraksionet lipoproteinike.',10),
    ('dislipidemia','LDL kolesteroli','Low-Density Lipoprotein Cholesterol','core','Parametër kryesor për vlerësimin dhe trajtimin e rrezikut aterosklerotik.','Objektivi varet nga rreziku individual.',11),
    ('dislipidemia','HDL kolesteroli','High-Density Lipoprotein Cholesterol','core','Plotëson profilin lipidik dhe vlerësimin e rrezikut.','Nuk përdoret i vetëm si objektiv terapeutik.',12),
    ('dislipidemia','Trigliceridet','Triglycerides','core','Identifikon hipertriglicerideminë dhe rrezikun metabolik.','Vlera shumë të larta kërkojnë vlerësim të shpejtë.',13),

    ('semundje-hepatike','ALT','Alanine Aminotransferase','core','Marker i dëmtimit hepatocelular.','Interpreto trendin dhe kontekstin klinik.',10),
    ('semundje-hepatike','AST','Aspartate Aminotransferase','core','Plotëson vlerësimin e dëmtimit hepatocelular.','AST mund të rritet edhe nga burime johepatike.',11),
    ('semundje-hepatike','g GT','Gamma-Glutamyl Transferase','recommended','Ndihmon në vlerësimin e kolestazës dhe origjinës hepatobiliare.','Nuk është specifike kur përdoret e vetme.',12),
    ('semundje-hepatike','Bilirubina totale','Total Bilirubin','core','Vlerëson metabolizmin dhe ekskretimin e bilirubinës.','Fraksionimi mund të ndihmojë në diferencim.',13),
    ('semundje-hepatike','Bilirubina direkte','Direct Bilirubin','recommended','Ndihmon në diferencimin e hiperbilirubinemisë së konjuguar.','Interpreto me bilirubinën totale dhe profilin hepatik.',14),
    ('semundje-hepatike','Albuminet','Albumin','recommended','Ndihmon në vlerësimin e funksionit sintetik kronik të mëlçisë.','Ndikohet edhe nga inflamacioni, ushqyerja dhe humbjet renale.',15),

    ('infeksion-urinar','Ekzaminimi i urinës','Urinalysis','core','Vlerësimi fillestar për leukocite, gjak, nitrite dhe parametra të tjerë urinarë.','Interpreto së bashku me simptomat dhe kontaminimin e mostrës.',10),
    ('infeksion-urinar','Nitritet','Urine Nitrites','recommended','Nitritet pozitive mbështesin praninë e baktereve nitrat-reduktuese.','Nitritet negative nuk e përjashtojnë UTI.',11),
    ('infeksion-urinar','Sedimenti:','Urine Sediment Examination','recommended','Mikroskopia mund të identifikojë leukocite, eritrocite dhe baktere.','Rëndësia varet nga cilësia e mostrës dhe simptomat.',12)
)
insert into public.lab_indication_tests
  (indication_id,lab_test_id,tier,rationale_sq,context_note_sq,sort_order)
select i.id,t.id,m.tier,m.rationale_sq,m.context_note_sq,m.sort_order
from mappings m
join public.lab_indications i on i.slug=m.indication_slug
join public.lab_tests t
  on t.form_name=m.test_form_name
 and t.full_name_en=m.test_full_name_en
 and t.is_published=true
 and t.editorial_status='published'
on conflict (indication_id,lab_test_id) do update set
  tier=excluded.tier,
  rationale_sq=excluded.rationale_sq,
  context_note_sq=excluded.context_note_sq,
  sort_order=excluded.sort_order,
  updated_at=now();
