-- Synced from Supabase production migration history.
-- version: 20260827135634
-- name: p1_exact_forms_and_electrolytes

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
values
(public.medindex_stable_uuid_v1('substance','caffeineanhydrous'),'caffeineanhydrous','Caffeine anhydrous','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','magnesiumcarbonate'),'magnesiumcarbonate','Magnesium carbonate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','beclometasonedipropionateanhydrous'),'beclometasonedipropionateanhydrous','Beclometasone dipropionate anhydrous','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','formoterolfumaratedihydrate'),'formoterolfumaratedihydrate','Formoterol fumarate dihydrate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','isoconazolenitrate'),'isoconazolenitrate','Isoconazole nitrate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','diflucortolonevalerate'),'diflucortolonevalerate','Diflucortolone valerate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','cetylpyridiniumchloride'),'cetylpyridiniumchloride','Cetylpyridinium chloride','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','potassiumacetate'),'potassiumacetate','Potassium acetate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','magnesiumchloridehexahydrate'),'magnesiumchloridehexahydrate','Magnesium chloride hexahydrate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','sodiumacetatetrihydrate'),'sodiumacetatetrihydrate','Sodium acetate trihydrate','INGREDIENT','OFFICIAL_REFERENCE')
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name,
    source_method=excluded.source_method,
    updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
values
('caffeineanhydrous',public.medindex_stable_uuid_v1('substance','caffeineanhydrous'),'Caffeine anhydrous','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=c6debbfe-6061-463f-8f17-fb240c6f1bab']),
('magnesiumcarbonate',public.medindex_stable_uuid_v1('substance','magnesiumcarbonate'),'Magnesium carbonate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?audience=consumer&setid=2d74e5bc-1f10-4fb6-9258-cd906e360013']),
('beclometasonedipropionateanhydrous',public.medindex_stable_uuid_v1('substance','beclometasonedipropionateanhydrous'),'Beclometasone dipropionate anhydrous','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/product/3317/smpc']),
('beclometasonedipropionateanhydrate',public.medindex_stable_uuid_v1('substance','beclometasonedipropionateanhydrous'),'Beclometasone dipropionate anhydrate','ALIAS',false,1.0000,'ORTHOGRAPHIC_STATE_EQUIVALENCE',array['https://www.medicines.org.uk/emc/product/3317/smpc']),
('formoterolfumaratedihydrate',public.medindex_stable_uuid_v1('substance','formoterolfumaratedihydrate'),'Formoterol fumarate dihydrate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/product/3317/smpc']),
('formoterolfumaratedihhydrate',public.medindex_stable_uuid_v1('substance','formoterolfumaratedihydrate'),'Formoterol fumarate dihhydrate','ALIAS',false,1.0000,'DETERMINISTIC_TYPO_REVIEW',array['https://www.medicines.org.uk/emc/product/3317/smpc']),
('formoterolfumaratedihydratemicronized',public.medindex_stable_uuid_v1('substance','formoterolfumaratedihydrate'),'Formoterol fumarate dihydrate (micronized)','ALIAS',false,1.0000,'PHYSICAL_FORM_NORMALIZATION',array['https://www.medicines.org.uk/emc/product/3317/smpc']),
('micronizedformoterolfumaratedihydrate',public.medindex_stable_uuid_v1('substance','formoterolfumaratedihydrate'),'Micronized formoterol fumarate dihydrate','ALIAS',false,1.0000,'PHYSICAL_FORM_NORMALIZATION',array['https://www.medicines.org.uk/emc/product/3317/smpc']),
('isoconazolenitrate',public.medindex_stable_uuid_v1('substance','isoconazolenitrate'),'Isoconazole nitrate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.ndf.gov.sg/about-drugs/product-information/sin04564p/']),
('isoconasolenitrate',public.medindex_stable_uuid_v1('substance','isoconazolenitrate'),'Isoconasole nitrate','ALIAS',false,0.9990,'DETERMINISTIC_TYPO_REVIEW',array['https://www.ndf.gov.sg/about-drugs/product-information/sin04564p/']),
('diflucortolonevalerate',public.medindex_stable_uuid_v1('substance','diflucortolonevalerate'),'Diflucortolone valerate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.ndf.gov.sg/about-drugs/product-information/sin04564p/']),
('cetylpyridiniumchloride',public.medindex_stable_uuid_v1('substance','cetylpyridiniumchloride'),'Cetylpyridinium chloride','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.sfda.gov.sa/ar/details_data?id=11746&nid=17582&page=7']),
('potassiumacetate',public.medindex_stable_uuid_v1('substance','potassiumacetate'),'Potassium acetate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=bf4dc488-d6f3-41f8-ac8d-37b27f25b8db']),
('potassiiumacetate',public.medindex_stable_uuid_v1('substance','potassiumacetate'),'Potassiium acetate','ALIAS',false,1.0000,'DETERMINISTIC_TYPO_REVIEW',array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=bf4dc488-d6f3-41f8-ac8d-37b27f25b8db']),
('magnesiumchloridehexahydrate',public.medindex_stable_uuid_v1('substance','magnesiumchloridehexahydrate'),'Magnesium chloride hexahydrate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=2105d1c1-54ef-4d1a-a63c-b1619e8b50db']),
('magnesiumchoridehexahydrate',public.medindex_stable_uuid_v1('substance','magnesiumchloridehexahydrate'),'Magnesium choride hexahydrate','ALIAS',false,1.0000,'DETERMINISTIC_TYPO_REVIEW',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=2105d1c1-54ef-4d1a-a63c-b1619e8b50db']),
('sodiumacetatetrihydrate',public.medindex_stable_uuid_v1('substance','sodiumacetatetrihydrate'),'Sodium acetate trihydrate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=150437b6-320e-4c69-a434-2a26a1f0b2e4']),
('sodiumacetattrihydrate',public.medindex_stable_uuid_v1('substance','sodiumacetatetrihydrate'),'Sodium acetat trihydrate','ALIAS',false,1.0000,'DETERMINISTIC_TYPO_REVIEW',array['https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=150437b6-320e-4c69-a434-2a26a1f0b2e4'])
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
('beclometasonedipropionateanhydrate','beclometasonedipropionateanhydrous','Beclometasone dipropionate anhydrous','anhydrate/anhydrous wording refers to the same water-free form','p1-exact-form-review-2026-08-27',now(),'official_state_review',1.0000,array['https://www.medicines.org.uk/emc/product/3317/smpc']),
('formoterolfumaratedihhydrate','formoterolfumaratedihydrate','Formoterol fumarate dihydrate','spelling typo only; dihydrate state unchanged','p1-exact-form-review-2026-08-27',now(),'deterministic_typo_review',1.0000,array['https://www.medicines.org.uk/emc/product/3317/smpc']),
('formoterolfumaratedihydratemicronized','formoterolfumaratedihydrate','Formoterol fumarate dihydrate','micronized describes particle size, not chemical ingredient identity','p1-exact-form-review-2026-08-27',now(),'physical_form_review',1.0000,array['https://www.medicines.org.uk/emc/product/3317/smpc']),
('micronizedformoterolfumaratedihydrate','formoterolfumaratedihydrate','Formoterol fumarate dihydrate','micronized describes particle size, not chemical ingredient identity','p1-exact-form-review-2026-08-27',now(),'physical_form_review',1.0000,array['https://www.medicines.org.uk/emc/product/3317/smpc']),
('isoconasolenitrate','isoconazolenitrate','Isoconazole nitrate','spelling typo only; nitrate salt unchanged','p1-exact-form-review-2026-08-27',now(),'deterministic_typo_review',0.9990,array['https://www.ndf.gov.sg/about-drugs/product-information/sin04564p/']),
('potassiiumacetate','potassiumacetate','Potassium acetate','spelling typo only','p1-exact-form-review-2026-08-27',now(),'deterministic_typo_review',1.0000,array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=bf4dc488-d6f3-41f8-ac8d-37b27f25b8db']),
('magnesiumchoridehexahydrate','magnesiumchloridehexahydrate','Magnesium chloride hexahydrate','spelling typo only; hexahydrate state unchanged','p1-exact-form-review-2026-08-27',now(),'deterministic_typo_review',1.0000,array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=2105d1c1-54ef-4d1a-a63c-b1619e8b50db']),
('sodiumacetattrihydrate','sodiumacetatetrihydrate','Sodium acetate trihydrate','spelling typo only; trihydrate state unchanged','p1-exact-form-review-2026-08-27',now(),'deterministic_typo_review',1.0000,array['https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=150437b6-320e-4c69-a434-2a26a1f0b2e4'])
on conflict (variant_key) do nothing;

insert into public.substance_merge_rejections
(key_a,key_b,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
select least(a,b),greatest(a,b),reason,
       'p1-component-safety-guard-2026-08-27',now(),
       'precise_ingredient_guard',1.0000,evidence
from (values
('caffeine','caffeineanhydrous','hydration state is explicit in source; keep precise ingredient concepts distinct',
 array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=c6debbfe-6061-463f-8f17-fb240c6f1bab']::text[]),
('formoterolfumaratedehydrous','formoterolfumaratedihydrate','dehydrous wording is not authoritative evidence for dihydrate; no automatic merge',
 array['https://www.medicines.org.uk/emc/product/3317/smpc']::text[])
) v(a,b,reason,evidence)
on conflict (key_a,key_b) do nothing;

select public.medindex_refresh_product_ingredients_v1();

do $$
declare n bigint;
begin
  select count(*) into n
  from public.product_ingredient_resolution_v1
  where resolution_status='NEEDS_REVIEW';
  if n >= 385 then
    raise exception 'P1.7 exact-form promotions did not improve review coverage: %',n;
  end if;
end $$;
