-- Synced from Supabase production migration history.
-- version: 20260827135130
-- name: p1_official_components_and_amino_acids

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
values
(public.medindex_stable_uuid_v1('substance','calciumcarbonate'),'calciumcarbonate','Calcium carbonate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','chlorhexidinegluconate'),'chlorhexidinegluconate','Chlorhexidine gluconate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','articainehydrochloride'),'articainehydrochloride','Articaine hydrochloride','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','dorzolamidehydrochloride'),'dorzolamidehydrochloride','Dorzolamide hydrochloride','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','drospirenone'),'drospirenone','Drospirenone','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','riboflavin'),'riboflavin','Riboflavin','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','salicylicacid'),'salicylicacid','Salicylic acid','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','valine'),'valine','Valine','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','histidine'),'histidine','Histidine','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','isoleucine'),'isoleucine','Isoleucine','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','leucine'),'leucine','Leucine','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','phenylalanine'),'phenylalanine','Phenylalanine','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','threonine'),'threonine','Threonine','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','methionine'),'methionine','Methionine','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','tryptophan'),'tryptophan','Tryptophan','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','alanine'),'alanine','Alanine','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','glycine'),'glycine','Glycine','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','arginine'),'arginine','Arginine','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','proline'),'proline','Proline','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','glutamicacid'),'glutamicacid','Glutamic acid','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','serine'),'serine','Serine','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','asparticacid'),'asparticacid','Aspartic acid','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','tyrosine'),'tyrosine','Tyrosine','INGREDIENT','OFFICIAL_REFERENCE')
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name,
    source_method=excluded.source_method,
    updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
values
('calciumcarbonate',public.medindex_stable_uuid_v1('substance','calciumcarbonate'),'Calcium carbonate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=9ff282fd-7623-4c9e-8faa-c51e33a7616e']),
('chlorhexidinegluconate',public.medindex_stable_uuid_v1('substance','chlorhexidinegluconate'),'Chlorhexidine gluconate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8c71f7a2-7c35-4897-b850-de677a34f5bd']),
('articainehydrochloride',public.medindex_stable_uuid_v1('substance','articainehydrochloride'),'Articaine hydrochloride','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=4f11bb06-c71b-4d96-9baa-2a17ad473a05']),
('dorzolamidehydrochloride',public.medindex_stable_uuid_v1('substance','dorzolamidehydrochloride'),'Dorzolamide hydrochloride','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=e4e6a5a8-f7be-4424-83f2-d6bb4d57443e&version=2']),
('drospirenone',public.medindex_stable_uuid_v1('substance','drospirenone'),'Drospirenone','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=db32bc55-f295-4d87-9dbb-0a2f45573dcf']),
('riboflavin',public.medindex_stable_uuid_v1('substance','riboflavin'),'Riboflavin','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=78f9ddab-300e-486a-ab81-23f465280e33']),
('salicylicacid',public.medindex_stable_uuid_v1('substance','salicylicacid'),'Salicylic acid','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?audience=professional&setid=31b50718-cc60-460d-aad7-b9620970d411']),
('valine',public.medindex_stable_uuid_v1('substance','valine'),'Valine','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cc2ace81-5881-43f1-ba94-41b674adc2fc']),
('histidine',public.medindex_stable_uuid_v1('substance','histidine'),'Histidine','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cc2ace81-5881-43f1-ba94-41b674adc2fc']),
('isoleucine',public.medindex_stable_uuid_v1('substance','isoleucine'),'Isoleucine','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cc2ace81-5881-43f1-ba94-41b674adc2fc']),
('leucine',public.medindex_stable_uuid_v1('substance','leucine'),'Leucine','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cc2ace81-5881-43f1-ba94-41b674adc2fc']),
('phenylalanine',public.medindex_stable_uuid_v1('substance','phenylalanine'),'Phenylalanine','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cc2ace81-5881-43f1-ba94-41b674adc2fc']),
('threonine',public.medindex_stable_uuid_v1('substance','threonine'),'Threonine','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cc2ace81-5881-43f1-ba94-41b674adc2fc']),
('methionine',public.medindex_stable_uuid_v1('substance','methionine'),'Methionine','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cc2ace81-5881-43f1-ba94-41b674adc2fc']),
('tryptophan',public.medindex_stable_uuid_v1('substance','tryptophan'),'Tryptophan','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cc2ace81-5881-43f1-ba94-41b674adc2fc']),
('alanine',public.medindex_stable_uuid_v1('substance','alanine'),'Alanine','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cc2ace81-5881-43f1-ba94-41b674adc2fc']),
('glycine',public.medindex_stable_uuid_v1('substance','glycine'),'Glycine','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cc2ace81-5881-43f1-ba94-41b674adc2fc']),
('arginine',public.medindex_stable_uuid_v1('substance','arginine'),'Arginine','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cc2ace81-5881-43f1-ba94-41b674adc2fc']),
('proline',public.medindex_stable_uuid_v1('substance','proline'),'Proline','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cc2ace81-5881-43f1-ba94-41b674adc2fc']),
('glutamicacid',public.medindex_stable_uuid_v1('substance','glutamicacid'),'Glutamic acid','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cc2ace81-5881-43f1-ba94-41b674adc2fc']),
('serine',public.medindex_stable_uuid_v1('substance','serine'),'Serine','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cc2ace81-5881-43f1-ba94-41b674adc2fc']),
('asparticacid',public.medindex_stable_uuid_v1('substance','asparticacid'),'Aspartic acid','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cc2ace81-5881-43f1-ba94-41b674adc2fc']),
('tyrosine',public.medindex_stable_uuid_v1('substance','tyrosine'),'Tyrosine','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cc2ace81-5881-43f1-ba94-41b674adc2fc'])
on conflict (term_key) do update
set concept_id=excluded.concept_id,
    term=excluded.term,
    term_type=excluded.term_type,
    is_preferred=excluded.is_preferred,
    confidence=excluded.confidence,
    review_method=excluded.review_method,
    evidence_urls=excluded.evidence_urls,
    updated_at=now();

insert into public.substance_merge_rejections
(key_a,key_b,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
select least(a,b),greatest(a,b),reason,
       'p1-component-safety-guard-2026-08-27',now(),
       'precise_ingredient_guard',1.0000,evidence
from (values
('chlorhexidinegluconate','chlorhexidinedihydrochloride','different chlorhexidine salts; no automatic merge',
 array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8c71f7a2-7c35-4897-b850-de677a34f5bd']::text[]),
('salmeterol','salmeterolxinafoate','base moiety and xinafoate salt are related but not the same precise ingredient',
 array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=43a27267-2f2b-410d-9c30-9cb95f35d9a1']::text[])
) v(a,b,reason,evidence)
on conflict (key_a,key_b) do nothing;

select public.medindex_refresh_product_ingredients_v1();

do $$
declare n bigint;
begin
  select count(*) into n
  from public.product_ingredient_resolution_v1
  where resolution_status='NEEDS_REVIEW';
  if n >= 401 then
    raise exception 'P1.6 official concepts did not improve review coverage: %',n;
  end if;
end $$;
