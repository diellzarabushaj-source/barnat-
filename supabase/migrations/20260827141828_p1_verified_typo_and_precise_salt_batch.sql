-- Synced from Supabase production migration history.
-- version: 20260827141828
-- name: p1_verified_typo_and_precise_salt_batch

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
values
(public.medindex_stable_uuid_v1('substance','ibuprofenlysine'),'ibuprofenlysine','Ibuprofen lysine','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','oxytetracyclinehydrochloride'),'oxytetracyclinehydrochloride','Oxytetracycline hydrochloride','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','riboflavinsodiumphosphate'),'riboflavinsodiumphosphate','Riboflavin sodium phosphate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','chlorthalidone'),'chlorthalidone','Chlorthalidone','INGREDIENT','OFFICIAL_REFERENCE')
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name,
    source_method=excluded.source_method,
    updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
values
('ibuprofenlysine',public.medindex_stable_uuid_v1('substance','ibuprofenlysine'),'Ibuprofen lysine','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/product/14386/smpc']),
('oxytetracyclinehydrochloride',public.medindex_stable_uuid_v1('substance','oxytetracyclinehydrochloride'),'Oxytetracycline hydrochloride','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=oxytetracycline+hydrochloride']),
('riboflavinsodiumphosphate',public.medindex_stable_uuid_v1('substance','riboflavinsodiumphosphate'),'Riboflavin sodium phosphate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=human&query=Riboflavin+sodium+phosphate']),
('chlorthalidone',public.medindex_stable_uuid_v1('substance','chlorthalidone'),'Chlorthalidone','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=c4c1bfe5-b5c8-43c0-9428-62337095b2bd']),
('chlorthalidon',public.medindex_stable_uuid_v1('substance','chlorthalidone'),'Chlorthalidon','ALIAS',false,0.9990,'ORTHOGRAPHIC_VARIANT_REVIEW',array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=c4c1bfe5-b5c8-43c0-9428-62337095b2bd']),
('buprofen',(select concept_id from public.substance_concepts_v1 where canonical_key='ibuprofen'),'Buprofen','ALIAS',false,0.9990,'DETERMINISTIC_TYPO_REVIEW',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=human&query=ibuprofen'])
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
('chlorthalidon','chlorthalidone','Chlorthalidone','orthographic spelling variant only','p1-verified-typo-review-2026-08-27',now(),'orthographic_variant_review',0.9990,array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=c4c1bfe5-b5c8-43c0-9428-62337095b2bd']),
('buprofen','ibuprofen','Ibuprofen','missing initial i; deterministic spelling typo only','p1-verified-typo-review-2026-08-27',now(),'deterministic_typo_review',0.9990,array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=human&query=ibuprofen'])
on conflict (variant_key) do nothing;

insert into public.substance_merge_rejections
(key_a,key_b,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
select least(a,b),greatest(a,b),reason,
       'p1-component-safety-guard-2026-08-27',now(),
       'precise_ingredient_guard',1.0000,evidence
from (values
('ibuprofen','ibuprofenlysine','free acid and lysine salt are related but not the same precise ingredient',
 array['https://www.medicines.org.uk/emc/product/14386/smpc']::text[]),
('oxytetracyclinehydrochloride','tetracyclinehydrochloride','different tetracycline active substances',
 array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=oxytetracycline+hydrochloride']::text[])
) v(a,b,reason,evidence)
on conflict (key_a,key_b) do nothing;

select public.medindex_refresh_product_ingredients_v1();

do $$
declare n bigint;
begin
  select count(*) into n
  from public.product_ingredient_resolution_v1
  where resolution_status='NEEDS_REVIEW';
  if n >= 331 then
    raise exception 'P1.12 verified typo/salt batch did not improve review coverage: %',n;
  end if;
end $$;
