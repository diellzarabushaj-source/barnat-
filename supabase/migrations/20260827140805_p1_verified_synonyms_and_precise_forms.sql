-- Synced from Supabase production migration history.
-- version: 20260827140805
-- name: p1_verified_synonyms_and_precise_forms

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
values
(public.medindex_stable_uuid_v1('substance','nicotinamide'),'nicotinamide','Nicotinamide','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','sodiumlactate'),'sodiumlactate','Sodium lactate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','lysinehydrochloride'),'lysinehydrochloride','Lysine hydrochloride','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','betamethasonesodiumphosphate'),'betamethasonesodiumphosphate','Betamethasone sodium phosphate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','codeinephosphatehemihydrate'),'codeinephosphatehemihydrate','Codeine phosphate hemihydrate','INGREDIENT','OFFICIAL_REFERENCE')
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name,
    source_method=excluded.source_method,
    updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
values
('nicotinamide',public.medindex_stable_uuid_v1('substance','nicotinamide'),'Nicotinamide','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=NICOTINAMIDE']),
('niacinamide',public.medindex_stable_uuid_v1('substance','nicotinamide'),'Niacinamide','ALIAS',false,1.0000,'OFFICIAL_SYNONYM_REVIEW',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=23bffdce-39e4-d6b5-e063-6394a90a5b9b']),
('sodiumlactate',public.medindex_stable_uuid_v1('substance','sodiumlactate'),'Sodium lactate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=human&query=Sodium+lactate']),
('lysinehydrochloride',public.medindex_stable_uuid_v1('substance','lysinehydrochloride'),'Lysine hydrochloride','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/getFile.cfm?setid=e51eff15-e67a-4bfd-a13b-44b52eb2d367&type=pdf']),
('betamethasonesodiumphosphate',public.medindex_stable_uuid_v1('substance','betamethasonesodiumphosphate'),'Betamethasone sodium phosphate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=a363b861-4873-465e-8009-0e9690666224']),
('codeinephosphatehemihydrate',public.medindex_stable_uuid_v1('substance','codeinephosphatehemihydrate'),'Codeine phosphate hemihydrate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/product/1402/smpc']),
('codeinphosphatehemihydrate',public.medindex_stable_uuid_v1('substance','codeinephosphatehemihydrate'),'Codein phosphate hemihydrate','ALIAS',false,0.9990,'ORTHOGRAPHIC_VARIANT_REVIEW',array['https://www.medicines.org.uk/emc/product/1402/smpc'])
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
('niacinamide','nicotinamide','Nicotinamide','niacinamide is the accepted synonym of nicotinamide','p1-synonym-and-salt-review-2026-08-27',now(),'official_synonym_review',1.0000,array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=NICOTINAMIDE','https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=23bffdce-39e4-d6b5-e063-6394a90a5b9b']),
('codeinphosphatehemihydrate','codeinephosphatehemihydrate','Codeine phosphate hemihydrate','orthographic spelling variant; phosphate hemihydrate unchanged','p1-synonym-and-salt-review-2026-08-27',now(),'orthographic_variant_review',0.9990,array['https://www.medicines.org.uk/emc/product/1402/smpc'])
on conflict (variant_key) do nothing;

insert into public.substance_merge_rejections
(key_a,key_b,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
select least(a,b),greatest(a,b),reason,
       'p1-component-safety-guard-2026-08-27',now(),
       'precise_ingredient_guard',1.0000,evidence
from (values
('betamethasonesodiumphosphate','dexamethasonesodiumphosphate','different corticosteroids despite similar salt naming',
 array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=a363b861-4873-465e-8009-0e9690666224']::text[]),
('codeinephosphatehemihydrate','codeinephosphate','hemihydrate state is explicit in source; no automatic collapse to unspecified phosphate',
 array['https://www.medicines.org.uk/emc/product/1402/smpc']::text[])
) v(a,b,reason,evidence)
on conflict (key_a,key_b) do nothing;

select public.medindex_refresh_product_ingredients_v1();

do $$
declare n bigint;
begin
  select count(*) into n
  from public.product_ingredient_resolution_v1
  where resolution_status='NEEDS_REVIEW';
  if n >= 357 then
    raise exception 'P1.9 verified synonyms/forms did not improve review coverage: %',n;
  end if;
end $$;
