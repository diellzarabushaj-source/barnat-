-- Synced from Supabase production migration history.
-- version: 20260827141454
-- name: p1_official_long_tail_batch_four

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
values
(public.medindex_stable_uuid_v1('substance','benserazidehydrochloride'),'benserazidehydrochloride','Benserazide hydrochloride','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','linagliptin'),'linagliptin','Linagliptin','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','dextran70'),'dextran70','Dextran 70','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','ferrousfumarate'),'ferrousfumarate','Ferrous fumarate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','calciumpantothenate'),'calciumpantothenate','Calcium pantothenate','INGREDIENT','OFFICIAL_REFERENCE')
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name,
    source_method=excluded.source_method,
    updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
values
('benserazidehydrochloride',public.medindex_stable_uuid_v1('substance','benserazidehydrochloride'),'Benserazide hydrochloride','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/product/1111/smpc']),
('linagliptin',public.medindex_stable_uuid_v1('substance','linagliptin'),'Linagliptin','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cbdbd4b2-c07b-00e1-e053-2995a90a5fc9']),
('dextran70',public.medindex_stable_uuid_v1('substance','dextran70'),'Dextran 70','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=f18bebf2-1936-658f-e053-2a95a90a5012']),
('ferrousfumarate',public.medindex_stable_uuid_v1('substance','ferrousfumarate'),'Ferrous fumarate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?audience=professional&labeltype=all&page=1&pagesize=20&query=FERROUS+FUMARATE&searchdb=all&sortby=rel']),
('calciumpantothenate',public.medindex_stable_uuid_v1('substance','calciumpantothenate'),'Calcium pantothenate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?adv=1&labeltype=human&query=CALCIUM+PANTOTHENATE'])
on conflict (term_key) do update
set concept_id=excluded.concept_id,
    term=excluded.term,
    term_type=excluded.term_type,
    is_preferred=excluded.is_preferred,
    confidence=excluded.confidence,
    review_method=excluded.review_method,
    evidence_urls=excluded.evidence_urls,
    updated_at=now();

select public.medindex_refresh_product_ingredients_v1();

do $$
declare n bigint;
begin
  select count(*) into n
  from public.product_ingredient_resolution_v1
  where resolution_status='NEEDS_REVIEW';
  if n >= 338 then
    raise exception 'P1.11 official long-tail batch did not improve review coverage: %',n;
  end if;
end $$;
