-- Synced from Supabase production migration history.
-- version: 20260827142058
-- name: p1_verified_exact_identity_batch_five

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
values
(public.medindex_stable_uuid_v1('substance','sofosbuvir'),'sofosbuvir','Sofosbuvir','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','sodiumalginate'),'sodiumalginate','Sodium alginate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','levomenthol'),'levomenthol','Levomenthol','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','sodiumdihydrogenphosphatedihydrate'),'sodiumdihydrogenphosphatedihydrate','Sodium dihydrogen phosphate dihydrate','INGREDIENT','OFFICIAL_REFERENCE')
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name,
    source_method=excluded.source_method,
    updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
values
('sofosbuvir',public.medindex_stable_uuid_v1('substance','sofosbuvir'),'Sofosbuvir','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=sofosbuvir']),
('sodiumalginate',public.medindex_stable_uuid_v1('substance','sodiumalginate'),'Sodium alginate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/product/73/smpc']),
('levomenthol',public.medindex_stable_uuid_v1('substance','levomenthol'),'Levomenthol','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/product/305/smpc']),
('sodiumdihydrogenphosphatedihydrate',public.medindex_stable_uuid_v1('substance','sodiumdihydrogenphosphatedihydrate'),'Sodium dihydrogen phosphate dihydrate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=58160-821&searchdb=ndc'])
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
  if n >= 322 then
    raise exception 'P1.13 verified exact-identity batch did not improve review coverage: %',n;
  end if;
end $$;
