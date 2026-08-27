-- Synced from Supabase production migration history.
-- version: 20260827155937
-- name: p1_reviewed_equivalence_expressions

create table if not exists public.substance_equivalence_reviewed_v1 (
  source_key text primary key,
  canonical_key text not null,
  reason text not null,
  decided_by text not null,
  reviewed_at timestamptz not null default now(),
  evidence_urls text[] not null default '{}'::text[],
  constraint substance_equivalence_reviewed_not_self check (source_key <> canonical_key)
);

alter table public.substance_equivalence_reviewed_v1 enable row level security;

drop policy if exists substance_equivalence_reviewed_read on public.substance_equivalence_reviewed_v1;
create policy substance_equivalence_reviewed_read
  on public.substance_equivalence_reviewed_v1 for select
  to anon, authenticated using (true);

comment on table public.substance_equivalence_reviewed_v1 is
  'Shprehje ekuivalence të lexuara një nga një dhe të gjykuara si një substancë e vetme. Porta mbetet e mbyllur për çdo shprehje që nuk gjendet këtu.';

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
values
(public.medindex_stable_uuid_v1('substance','tamoxifencitrate'),'tamoxifencitrate','Tamoxifen citrate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','ferrichydroxidesucrosecomplex'),'ferrichydroxidesucrosecomplex','Ferric hydroxide sucrose complex','INGREDIENT','OFFICIAL_REFERENCE')
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name, source_method=excluded.source_method, updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
values
('tamoxifencitrate',public.medindex_stable_uuid_v1('substance','tamoxifencitrate'),'Tamoxifen citrate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/search?q=tamoxifen']),
('ferrichydroxidesucrosecomplex',public.medindex_stable_uuid_v1('substance','ferrichydroxidesucrosecomplex'),'Ferric hydroxide sucrose complex','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/search?q=iron+sucrose'])
on conflict (term_key) do update
set concept_id=excluded.concept_id,term=excluded.term,term_type=excluded.term_type,
    is_preferred=excluded.is_preferred,confidence=excluded.confidence,
    review_method=excluded.review_method,evidence_urls=excluded.evidence_urls,updated_at=now();

insert into public.substance_equivalence_reviewed_v1
(source_key,canonical_key,reason,decided_by,evidence_urls)
select v.source_key,v.canonical_key,v.reason,'p1-equivalence-review-2026-08-27',
       array['https://www.medicines.org.uk/emc/']::text[]
from (values
('amlodipinebesilateequivalenttoamlodipine','amlodipinebesilate','kripa është përbërësi; ekuivalenca emërton bazën'),
  ('amlodipinebesylateequivalenttoamlodipine','amlodipinebesilate','kripa është përbërësi; ekuivalenca emërton bazën'),
  ('amoxicillintrihydratecorrespondingto500mgofamoxicillin','amoxicillintrihydrate','kripa është përbërësi; forca rri te drugs.strength'),
  ('amoxicillintrihydrateequivalenttoamoxicillin','amoxicillintrihydrate','kripa është përbërësi; ekuivalenca emërton bazën'),
  ('amoxicillintrihydrateequivalenttoamoxicillin1000mg','amoxicillintrihydrate','kripa është përbërësi; forca rri te drugs.strength'),
  ('amoxicillintrihydrateequivalenttoamoxicillin500mg','amoxicillintrihydrate','kripa është përbërësi; forca rri te drugs.strength'),
  ('amoxicillintrihydrateequivalenttoamoxicillincompacted','amoxicillintrihydrate','compacted është përshkrues formulimi, jo substancë'),
  ('ampicillintrihydrateequivalenttoapicillin','ampicillintrihydrate','kripa është përbërësi; apicillin është gabim shtypi i ampicillin'),
  ('atorvastatincalciumequivalentto10mgatorvastatin','atorvastatincalcium','kripa është përbërësi; forca rri te drugs.strength'),
  ('atorvastatincalciumequivalentto40mgatorvastatin','atorvastatincalcium','kripa është përbërësi; forca rri te drugs.strength'),
  ('atorvastatincalciumequivalentto80mgatorvastatin','atorvastatincalcium','kripa është përbërësi; forca rri te drugs.strength'),
  ('atorvastatincaliumequivalentto20mgatorvastatin','atorvastatincalcium','calium është gabim shtypi i calcium; forca rri te drugs.strength'),
  ('atorvastatincalciumtrihydrateform1equivalentto200mgatorvastatin','atorvastatincalciumtrihydrate','trihidrati është përbërësi; Form1 dhe forca janë atribute produkti'),
  ('azithromycinedehydrateequivalenttoazithromycine','azithromycindihydrate','dehydrate është gabim shtypi i dihydrate'),
  ('cefaclormonohydrateequivalenttocefaclor','cefaclormonohydrate','monohidrati është përbërësi; ekuivalenca emërton bazën'),
  ('cefpodoximeproxetilequivalenttocefpodoxime','cefpodoximeproxetil','esteri është përbërësi; ekuivalenca emërton bazën'),
  ('ceftriaxonedisodiumequivalentto1gceftriaxonebase','ceftriaxonedisodium','kripa është përbërësi; ekuivalenca emërton bazën'),
  ('cefuroximeaxetilamorphousequivalenttocefuroxime','cefuroximeaxetil','esteri është përbërësi; amorf është gjendje fizike'),
  ('cefuroximeaxetilequivalentto500mgcefuroximeamorph','cefuroximeaxetil','esteri është përbërësi; forca rri te drugs.strength'),
  ('cefuroximeaxetilpotency8167with25overdoseequivalentto250mgcefuroxime','cefuroximeaxetil','potenca dhe overdose janë atribute prodhimi, jo substanca'),
  ('cefuroximesodiumequivalentto7500mgcefuroxime','cefuroximesodium','kripa është përbërësi; forca rri te drugs.strength'),
  ('sterilecefuroximesodiumequivalenttocefuroximeanhydrous','cefuroximesodium','sterile është atribut prodhimi; kripa është përbërësi'),
  ('ciprofloxacinhydrochlorideequivalenttociprofloxacin','ciprofloxacinhydrochloride','kripa është përbërësi; ekuivalenca emërton bazën'),
  ('dexamethasonesodiumphosphateequivalenttodexamethasonephospate','dexamethasonesodiumphosphate','kripa e natriumit është përbërësi; phospate është gabim shtypi'),
  ('entericcoatedlansoprazolemicropelletact857equivalentto15mglansoprazole','lansoprazole','mikropelet me veshje enterike është formulim; substanca është lansoprazoli'),
  ('ferrichydroxideincomplexwithsucroseequivalenttoelementaliron','ferrichydroxidesucrosecomplex','kompleksi hekur-sakarozë është përbërësi; hekuri elementar është ekuivalencë'),
  ('ferrichydroxidesucrosecomplexequivalenttoironiii','ferrichydroxidesucrosecomplex','kompleksi hekur-sakarozë është përbërësi; Fe(III) është ekuivalencë'),
  ('ferrouafumarateequivalentto115mgelementariron','ferrousfumarate','Ferroua është gabim shtypi i Ferrous; hekuri elementar është ekuivalencë'),
  ('fingolimodhydrochloridecorrespondingtofingolimod05mg','fingolimodhydrochloride','kripa është përbërësi; forca rri te drugs.strength'),
  ('gentamicinsulfateequivalenttogentamicin','gentamicinsulfate','kripa është përbërësi; ekuivalenca emërton bazën'),
  ('imatinibmesylateformlequivalentto10000mgofimatinib','imatinibmesilate','mesylate = mesilate; forca rri te drugs.strength'),
  ('imatinibmesylateformlequivalentto40000mgofimatinib','imatinibmesilate','mesylate = mesilate; forca rri te drugs.strength'),
  ('ketoprofenlysinesaltcorrespondingto50mgofketoprofen','ketoprofenlysinesalt','kripa e lizinës është përbërësi; forca rri te drugs.strength'),
  ('lercanidipinehcihemihydrateequivalentto10mglercanidipinehci','lercanidipinehclhemihydrate','HCI është lexim i gabuar i HCl; hemihidrati është përbërësi'),
  ('levofloxacinhemihydratecorrespondingtolevofloxacinbase','levofloxacinhemihydrate','hemihidrati është përbërësi; ekuivalenca emërton bazën'),
  ('levofloxacinhemihydrateequivalentto50mglevofloxacin','levofloxacinhemihydrate','hemihidrati është përbërësi; forca rri te drugs.strength'),
  ('lisinoprildihydratecorrespondingtooflisinopril','lisinoprildihydrate','dihidrati është përbërësi; ekuivalenca emërton bazën'),
  ('meropenemtrihydrateequivalenttomeropenem','meropenemtrihydrate','trihidrati është përbërësi; ekuivalenca emërton bazën'),
  ('mometasonefuroatemonohydrateequivalentto0050mgmometasonefuroate','mometasonefuroatemonohydrate','monohidrati është përbërësi; forca rri te drugs.strength'),
  ('montelukastsodiumequivalenttomontelukast','montelukastsodium','kripa është përbërësi; ekuivalenca emërton bazën'),
  ('moxifloxacinhclequivalentto500mgmoxifloxacin','moxifloxacinhydrochloride','kripa është përbërësi; forca rri te drugs.strength'),
  ('mupirocincalciumequivalenttomupirocin','mupirocincalcium','kripa e kalciumit është përbërësi; ekuivalenca emërton bazën'),
  ('nebivololhydrochlorideequivalentto5mgofnebivolol','nebivololhydrochloride','kripa është përbërësi; forca rri te drugs.strength'),
  ('omeprazolesodiumequivalenttoomeprazole','omeprazolesodium','kripa është përbërësi; ekuivalenca emërton bazën'),
  ('pantoprazolesodiumsesquihydrateequivalenttopantoprazole40mg','pantoprazolesodiumsesquihydrate','seskuihidrati është përbërësi; forca rri te drugs.strength'),
  ('paracetamol90granulateequivalenttoparacetamol','paracetamol','granulat 90% është formulim; substanca është paracetamoli'),
  ('rosuvastatincalciumequivalenttorosuvastatin1000mg','rosuvastatincalcium','kripa është përbërësi; forca rri te drugs.strength'),
  ('rosuvastatincalciumequivalenttorosuvastatin2000mg','rosuvastatincalcium','kripa është përbërësi; forca rri te drugs.strength'),
  ('sterileceftriaxonesodiumuspequivalenttoceftriaxoneanhydrous','ceftriaxonesodium','sterile/USP janë atribute prodhimi; kripa është përbërësi'),
  ('tamoxifencitrateequivalenttotamoxifen','tamoxifencitrate','citrati është përbërësi; ekuivalenca emërton bazën'),
  ('vitaminc97equivalenttovitaminc','ascorbicacid','97% është potencë; substanca është acidi askorbik'),
  ('vitamind3cholecalciferolequivalentto1500iu','cholecalciferol','IU është konvertim njësie, jo substancë e dytë'),
  ('zoledronicacidmonohydrateequivalentto5mgzoledronicacid','zoledronicacidmonohydrate','monohidrati është përbërësi; forca rri te drugs.strength')
) as v(source_key,canonical_key,reason)
on conflict (source_key) do update
set canonical_key=excluded.canonical_key,reason=excluded.reason,
    decided_by=excluded.decided_by,reviewed_at=now();

insert into public.substance_aliases
(variant_key,canonical_key,canonical_name,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
select e.source_key,e.canonical_key,coalesce(c.canonical_name,''),e.reason,
       'p1-equivalence-review-2026-08-27',now(),'reviewed_equivalence_expression',1.0000,
       array['https://www.medicines.org.uk/emc/']::text[]
from public.substance_equivalence_reviewed_v1 e
left join public.substance_concepts_v1 c on c.canonical_key=e.canonical_key
where e.decided_by='p1-equivalence-review-2026-08-27'
on conflict (variant_key) do nothing;

create or replace view public.medindex_p1_safe_single_v1
with (security_invoker = true) as
select d.id as source_drug_id,
       d.active_substance as source_expression,
       d.active_substance_key as component_key,
       c.canonical_key,
       c.canonical_name,
       coalesce(a.confidence,1.0000)::numeric(5,4) as confidence
from public.drugs d
join public.medindex_drug_core_map_v1 m on m.source_drug_id=d.id
join public.substance_canonical c on c.variant_key=d.active_substance_key
left join public.substance_aliases a on a.variant_key=d.active_substance_key
where coalesce(btrim(d.active_substance),'')<>''
  and d.active_substance !~ '(;|\+|&)'
  and d.active_substance !~* '\sand\s'
  and d.active_substance !~ '/'
  and (
    d.active_substance !~* '(equivalent to|corresponding to|\bas\b)'
    or exists (
      select 1 from public.substance_equivalence_reviewed_v1 e
      where e.source_key = d.active_substance_key
    )
  );

delete from public.substance_merge_rejections
where reason ilike '%forcë e ndryshme%' or reason ilike '%explicit strength differs%';

select public.medindex_refresh_product_ingredients_v1();

do $$
declare n bigint;
begin
  select count(*) into n
  from public.product_ingredient_resolution_v1
  where resolution_status='NEEDS_REVIEW';
  if n >= 250 then
    raise exception 'P1.20 equivalence review did not improve coverage: %',n;
  end if;
end $$;
