-- Synced from Supabase production migration history.
-- version: 20260827163438
-- name: p1_long_tail_component_identities

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
select public.medindex_stable_uuid_v1('substance',k),k,n,'INGREDIENT','OFFICIAL_REFERENCE'
from (values
('chlortalidone','Chlortalidone'),('chlorzoxazone','Chlorzoxazone'),('alverinecitrate','Alverine citrate'),
('calcipotriol','Calcipotriol'),('carbazochrome','Carbazochrome'),('chlorquinaldol','Chlorquinaldol'),
('doxylaminesuccinate','Doxylamine succinate'),('entacapone','Entacapone'),
('fluprednideneacetate','Fluprednidene acetate'),('calciumchloride','Calcium chloride'),
('amoxicillinsodium','Amoxicillin sodium'),('magnesiumhydroxide','Magnesium hydroxide'),
('metamizolesodiummonohydrate','Metamizole sodium monohydrate'),('methocarbamol','Methocarbamol'),
('nifuratel','Nifuratel'),('norflurane','Norflurane'),('perphenazine','Perphenazine'),
('phenylbutazonesodium','Phenylbutazone sodium'),('polidocanol','Polidocanol'),
('potassiumbicarbonate','Potassium bicarbonate'),('prilocaine','Prilocaine'),('relatlimab','Relatlimab'),
('sorbitol','Sorbitol'),('triamterene','Triamterene'),('tyrothricin','Tyrothricin'),
('valproicacid','Valproic acid'),('zincoxide','Zinc oxide'),('neomycin','Neomycin'),
('lidocainehydrochloridemonohydrate','Lidocaine hydrochloride monohydrate'),
('triacetonamine4toluensulfonate','Triacetonamine 4-toluenesulfonate'),
('sitagliptinhydrochloride','Sitagliptin hydrochloride'),('ferroussulfate','Ferrous sulfate'),
('guaifenesin','Guaifenesin'),('ceftazidime','Ceftazidime'),
('hydroxypropylmethylcellulose','Hydroxypropyl methylcellulose'),
('ipratropiumbromidemonohydrate','Ipratropium bromide monohydrate'),
('hexamidinediisetionate','Hexamidine diisetionate'),('glaucinehydrobromide','Glaucine hydrobromide'),
('humanvonwillebrandfactor','Human von Willebrand factor')
) as v(k,n)
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name,source_method=excluded.source_method,updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
select c.canonical_key,c.concept_id,c.canonical_name,'CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',
       array['https://www.medicines.org.uk/emc/']::text[]
from public.substance_concepts_v1 c
where c.canonical_key in (
 'chlortalidone','chlorzoxazone','alverinecitrate','calcipotriol','carbazochrome','chlorquinaldol',
 'doxylaminesuccinate','entacapone','fluprednideneacetate','calciumchloride','amoxicillinsodium',
 'magnesiumhydroxide','metamizolesodiummonohydrate','methocarbamol','nifuratel','norflurane',
 'perphenazine','phenylbutazonesodium','polidocanol','potassiumbicarbonate','prilocaine','relatlimab',
 'sorbitol','triamterene','tyrothricin','valproicacid','zincoxide','neomycin',
 'lidocainehydrochloridemonohydrate','triacetonamine4toluensulfonate','sitagliptinhydrochloride',
 'ferroussulfate','guaifenesin','ceftazidime','hydroxypropylmethylcellulose',
 'ipratropiumbromidemonohydrate','hexamidinediisetionate','glaucinehydrobromide','humanvonwillebrandfactor'
)
on conflict (term_key) do update
set concept_id=excluded.concept_id,term=excluded.term,term_type=excluded.term_type,
    is_preferred=excluded.is_preferred,confidence=excluded.confidence,
    review_method=excluded.review_method,evidence_urls=excluded.evidence_urls,updated_at=now();

insert into public.substance_aliases
(variant_key,canonical_key,canonical_name,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
select v.variant_key,v.canonical_key,coalesce(c.canonical_name,''),v.reason,
       'p1-long-tail-identity-2026-08-27',now(),'verified_component_identity',1.0000,
       array['https://www.medicines.org.uk/emc/']::text[]
from (values
('adrenaline','adrenalineepinephrine','adrenalinë = adrenaline (epinephrine)'),
('epinephrinebase','adrenalineepinephrine','baza është e njëjta substancë'),
('adrenalineepinephrinetartrate','adrenalineacidtartrate','tartrati i adrenalinës'),
('adrenalineepinephrinetartarate','adrenalineacidtartrate','tartarate është gabim shtypi i tartrate'),
('epinephrineastartrate','adrenalineacidtartrate','shprehje burimore për tartratin e adrenalinës'),
('betamthasonediporpionate','betamethasonedipropionate','gabim shtypi i dyfishtë'),
('cinchocainhydrochlorid','cinchocainehydrochloride','mbaresë e ndryshme'),
('cetylpiridiniumchloride','cetylpyridiniumchloride','piridinium = pyridinium'),
('cetylpyridinumchloride','cetylpyridiniumchloride','pyridinum është gabim shtypi'),
('fluoxetinehcl','fluoxetinehydrochloride','HCl = hydrochloride'),
('diphenhydraminehcl','diphenhydraminehydrochloride','HCl = hydrochloride'),
('thiaminehcl','thiaminehydrochloride','HCl = hydrochloride'),
('sitagliptinhcl','sitagliptinhydrochloride','HCl = hydrochloride'),
('lizinopril','lisinopril','gabim shtypi'),
('vasartan','valsartan','gabim shtypi'),
('phentylalanine','phenylalanine','gabim shtypi'),
('pseudoephrdrinehydrochloride','pseudoephedrinehydrochloride','gabim shtypi'),
('polydocanol','polidocanol','mbaresë e ndryshme'),
('clavulanicacidaspotassiumsalt','clavulanatepotassium','burimi e thotë shprehimisht kripën e kaliumit'),
('calciumchloride2h20','calciumchloridedihydrate','2H2O = dihidrat'),
('neomycinassulfate','neomycinsulfate','burimi e thotë shprehimisht sulfatin'),
('neomycinintheformofneomycinsulphate','neomycinsulfate','burimi e thotë shprehimisht sulfatin'),
('ceftroaxonedisodiumhemiheptahydrate','ceftriaxonedisodium','ceftroaxone është gabim shtypi i ceftriaxone'),
('lidocainehydrochlorideintheformoflidocainehydrochloridemonohydrate','lidocainehydrochloridemonohydrate','burimi e thotë shprehimisht monohidratin'),
('perindoprilerbumine','perindopriltertbutylamine','erbumine = tert-butylamine'),
('chlorhexidinegluconate012','chlorhexidinegluconate','0.12% është përqendrim, jo substancë'),
('dpanthenol','dexpanthenol','D-panthenol = dexpanthenol'),
('guaifenesine','guaifenesin','mbaresë e ndryshme'),
('formoterolfumaratedehydrate','formoterolfumaratedihydrate','dehydrate është gabim shtypi i dihydrate'),
('gentamicinasgentamicinsulfate','gentamicinsulfate','burimi e thotë shprehimisht sulfatin'),
('hydroclorothyazide','hydrochlorothiazide','gabim shtypi'),
('hydroclotiazide','hydrochlorothiazide','gabim shtypi'),
('ferroussulfate90mgofiron','ferroussulfate','hekuri elementar është ekuivalencë, jo substancë e dytë'),
('ironferroussulfate','ferroussulfate','tekst i cunguar i sulfatit ferroz'),
('lidocainebase','lidocaine','baza është e njëjta substancë'),
('ceftazidimewithsodiumcarbonateusp','ceftazidime','karbonati i natriumit është tampon formulimi'),
('hydroxypropylmethylcellulose3550mpas','hydroxypropylmethylcellulose','3550 mPa.s është viskozitet, jo substancë')
) as v(variant_key,canonical_key,reason)
left join public.substance_concepts_v1 c on c.canonical_key=v.canonical_key
on conflict (variant_key) do nothing;

insert into public.substance_merge_rejections
(key_a,key_b,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
select least(a,b),greatest(a,b),reason,'p1-long-tail-guard-2026-08-27',now(),
       'precise_ingredient_guard',1.0000,array['https://www.medicines.org.uk/emc/']::text[]
from (values
('neomycin','neomycinsulfate','base and sulfate salt are separate ingredient identities'),
('calciumchloride','calciumchloridedihydrate','anhydrous and dihydrate are separate ingredient identities'),
('ferroussulfate','ferrousfumarate','different iron salts; no automatic merge'),
('sitagliptinhydrochloride','sitagliptinphosphatemonohydrate','different sitagliptin salts; no automatic merge'),
('lidocaine','lidocainehydrochloridemonohydrate','base and hydrochloride monohydrate are separate identities')
) as v(a,b,reason)
on conflict (key_a,key_b) do nothing;

select public.medindex_refresh_product_ingredients_v1();

do $$
declare n bigint;
begin
  select count(*) into n
  from public.product_ingredient_resolution_v1
  where resolution_status='NEEDS_REVIEW';
  if n >= 188 then
    raise exception 'P1.21 long-tail identity batch did not improve coverage: %',n;
  end if;
end $$;
