-- Synced from Supabase production migration history.
-- version: 20260827133920
-- name: p1_official_component_batch_two

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
values
(public.medindex_stable_uuid_v1('substance','caffeine'),'caffeine','Caffeine','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','calciumchloridedihydrate'),'calciumchloridedihydrate','Calcium chloride dihydrate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','carbidopa'),'carbidopa','Carbidopa','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','levodopa'),'levodopa','Levodopa','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','phenylephrinehydrochloride'),'phenylephrinehydrochloride','Phenylephrine hydrochloride','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','sacubitril'),'sacubitril','Sacubitril','INGREDIENT','OFFICIAL_REFERENCE')
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name,
    source_method=excluded.source_method,
    updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
values
('caffeine',public.medindex_stable_uuid_v1('substance','caffeine'),'Caffeine','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=e8ba7003-9d0f-90ac-e053-2995a90aa7de']),
('calciumchloridedihydrate',public.medindex_stable_uuid_v1('substance','calciumchloridedihydrate'),'Calcium chloride dihydrate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=8f22eef7-cb4b-41c9-9fe4-7010aadf2164']),
('carbidopa',public.medindex_stable_uuid_v1('substance','carbidopa'),'Carbidopa','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=87ab55c9-203d-d595-3e3e-0e38f2f6d9c4']),
('levodopa',public.medindex_stable_uuid_v1('substance','levodopa'),'Levodopa','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=87ab55c9-203d-d595-3e3e-0e38f2f6d9c4']),
('phenylephrinehydrochloride',public.medindex_stable_uuid_v1('substance','phenylephrinehydrochloride'),'Phenylephrine hydrochloride','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=5d8b980f-0011-41e3-a881-ad10fe399079&version=2']),
('phenylephrinehcl',public.medindex_stable_uuid_v1('substance','phenylephrinehydrochloride'),'Phenylephrine HCl','ALIAS',false,1.0000,'OFFICIAL_ABBREVIATION_REVIEW',array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=5d8b980f-0011-41e3-a881-ad10fe399079&version=2']),
('sacubitril',public.medindex_stable_uuid_v1('substance','sacubitril'),'Sacubitril','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?audience=consumer&setid=59b7a07a-96ee-44b1-8dae-2b42169aa2c5'])
on conflict (term_key) do update
set concept_id=excluded.concept_id,
    term=excluded.term,
    term_type=excluded.term_type,
    is_preferred=excluded.is_preferred,
    confidence=excluded.confidence,
    review_method=excluded.review_method,
    evidence_urls=excluded.evidence_urls,
    updated_at=now();

insert into public.substance_aliases
(variant_key,canonical_key,canonical_name,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
values
('phenylephrinehcl','phenylephrinehydrochloride','Phenylephrine hydrochloride','HCl abbreviation expands to hydrochloride','p1-official-component-batch2-2026-08-27',now(),'official_abbreviation_review',1.0000,array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=5d8b980f-0011-41e3-a881-ad10fe399079&version=2'])
on conflict (variant_key) do nothing;

select public.medindex_refresh_product_ingredients_v1();

do $$
declare n bigint;
begin
  select count(*) into n
  from public.product_ingredient_resolution_v1
  where resolution_status='NEEDS_REVIEW';
  if n >= 416 then
    raise exception 'P1.5 official concepts did not improve review coverage: %',n;
  end if;
end $$;
