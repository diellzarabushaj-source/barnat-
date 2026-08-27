-- Synced from Supabase production migration history.
-- version: 20260827141131
-- name: p1_verified_long_tail_batch_three

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
values
(public.medindex_stable_uuid_v1('substance','azelastinehydrochloride'),'azelastinehydrochloride','Azelastine hydrochloride','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','bacitracin'),'bacitracin','Bacitracin','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','cyclobenzaprinehydrochloride'),'cyclobenzaprinehydrochloride','Cyclobenzaprine hydrochloride','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','cinchocainehydrochloride'),'cinchocainehydrochloride','Cinchocaine hydrochloride','INGREDIENT','OFFICIAL_REFERENCE')
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name,
    source_method=excluded.source_method,
    updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
values
('azelastinehydrochloride',public.medindex_stable_uuid_v1('substance','azelastinehydrochloride'),'Azelastine hydrochloride','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=8ae2aec7-329b-41bf-89d5-f189afb782ee']),
('bacitracin',public.medindex_stable_uuid_v1('substance','bacitracin'),'Bacitracin','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=3f0eb4a0-f7bf-45f7-8885-92c65a4bd899']),
('cyclobenzaprinehydrochloride',public.medindex_stable_uuid_v1('substance','cyclobenzaprinehydrochloride'),'Cyclobenzaprine hydrochloride','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=1d9e34cc-eee9-4147-abf8-c810a80e39d2']),
('cinchocainehydrochloride',public.medindex_stable_uuid_v1('substance','cinchocainehydrochloride'),'Cinchocaine hydrochloride','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/product/283/smpc'])
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
  if n >= 344 then
    raise exception 'P1.10 verified long-tail batch did not improve review coverage: %',n;
  end if;
end $$;
