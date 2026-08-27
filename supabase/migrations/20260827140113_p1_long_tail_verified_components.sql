-- Synced from Supabase production migration history.
-- version: 20260827140113
-- name: p1_long_tail_verified_components

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
values
(public.medindex_stable_uuid_v1('substance','imipenem'),'imipenem','Imipenem','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','cilastatinsodium'),'cilastatinsodium','Cilastatin sodium','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','avibactamsodium'),'avibactamsodium','Avibactam sodium','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','polymyxinbsulfate'),'polymyxinbsulfate','Polymyxin B sulfate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','pyridoxinehydrochloride'),'pyridoxinehydrochloride','Pyridoxine hydrochloride','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','piroxicam'),'piroxicam','Piroxicam','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','24dichlorobenzylalcohol'),'24dichlorobenzylalcohol','2,4-Dichlorobenzyl alcohol','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','amylmetacresol'),'amylmetacresol','Amylmetacresol','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','enoxolone'),'enoxolone','Enoxolone','INGREDIENT','MANUFACTURER_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','salmeterolxinafoate'),'salmeterolxinafoate','Salmeterol xinafoate','INGREDIENT','OFFICIAL_REFERENCE')
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name,
    source_method=excluded.source_method,
    updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
values
('imipenem',public.medindex_stable_uuid_v1('substance','imipenem'),'Imipenem','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=imipenem+and+cilastatin+sodium']),
('cilastatinsodium',public.medindex_stable_uuid_v1('substance','cilastatinsodium'),'Cilastatin sodium','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=imipenem+and+cilastatin+sodium']),
('avibactamsodium',public.medindex_stable_uuid_v1('substance','avibactamsodium'),'Avibactam sodium','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?adv=1&labeltype=human&query=INGREDIENT%3Aavibactam+sodium']),
('polymyxinbsulfate',public.medindex_stable_uuid_v1('substance','polymyxinbsulfate'),'Polymyxin B sulfate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b56f18c0-ef5e-4ed9-a5af-f79f3cd189b6']),
('pyridoxinehydrochloride',public.medindex_stable_uuid_v1('substance','pyridoxinehydrochloride'),'Pyridoxine hydrochloride','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=human&query=Pyridoxine+hydrochloride']),
('pyridoxinehcl',public.medindex_stable_uuid_v1('substance','pyridoxinehydrochloride'),'Pyridoxine HCl','ALIAS',false,1.0000,'OFFICIAL_ABBREVIATION_REVIEW',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=human&query=Pyridoxine+hydrochloride']),
('piroxicam',public.medindex_stable_uuid_v1('substance','piroxicam'),'Piroxicam','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=c2d51858-b71f-426a-8e84-2aa13c594691']),
('24dichlorobenzylalcohol',public.medindex_stable_uuid_v1('substance','24dichlorobenzylalcohol'),'2,4-Dichlorobenzyl alcohol','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/ingredient/1524']),
('amylmetacresol',public.medindex_stable_uuid_v1('substance','amylmetacresol'),'Amylmetacresol','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/ingredient/1523']),
('enoxolone',public.medindex_stable_uuid_v1('substance','enoxolone'),'Enoxolone','CANONICAL',true,0.9900,'MANUFACTURER_REFERENCE',array['https://anzibel.com/index-uz-en.html']),
('salmeterolxinafoate',public.medindex_stable_uuid_v1('substance','salmeterolxinafoate'),'Salmeterol xinafoate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=43a27267-2f2b-410d-9c30-9cb95f35d9a1']),
('salmeterolxinafoatemicronized',public.medindex_stable_uuid_v1('substance','salmeterolxinafoate'),'Salmeterol xinafoate (micronized)','ALIAS',false,1.0000,'PHYSICAL_FORM_NORMALIZATION',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=43a27267-2f2b-410d-9c30-9cb95f35d9a1']),
('riboflavine',public.medindex_stable_uuid_v1('substance','riboflavin'),'Riboflavine','ALIAS',false,0.9990,'ORTHOGRAPHIC_VARIANT_REVIEW',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=78f9ddab-300e-486a-ab81-23f465280e33']),
('salycilicacid',public.medindex_stable_uuid_v1('substance','salicylicacid'),'Salycilic acid','ALIAS',false,1.0000,'DETERMINISTIC_TYPO_REVIEW',array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?audience=professional&setid=31b50718-cc60-460d-aad7-b9620970d411']),
('isoleucin',public.medindex_stable_uuid_v1('substance','isoleucine'),'Isoleucin','ALIAS',false,0.9990,'ORTHOGRAPHIC_VARIANT_REVIEW',array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cc2ace81-5881-43f1-ba94-41b674adc2fc']),
('piperacillinassodiumsalt',public.medindex_stable_uuid_v1('substance','piperacillinsodium'),'Piperacillin (as sodium salt)','ALIAS',false,1.0000,'EXPRESSION_NORMALIZATION',array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=bc26ffd8-1a6e-4e16-91c1-ec67c928b3bf'])
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
('pyridoxinehcl','pyridoxinehydrochloride','Pyridoxine hydrochloride','HCl abbreviation expands to hydrochloride','p1-long-tail-review-2026-08-27',now(),'official_abbreviation_review',1.0000,array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=human&query=Pyridoxine+hydrochloride']),
('salmeterolxinafoatemicronized','salmeterolxinafoate','Salmeterol xinafoate','micronized describes particle size, not chemical ingredient identity','p1-long-tail-review-2026-08-27',now(),'physical_form_review',1.0000,array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=43a27267-2f2b-410d-9c30-9cb95f35d9a1']),
('riboflavine','riboflavin','Riboflavin','orthographic language variant only','p1-long-tail-review-2026-08-27',now(),'orthographic_variant_review',0.9990,array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=78f9ddab-300e-486a-ab81-23f465280e33']),
('salycilicacid','salicylicacid','Salicylic acid','spelling typo only','p1-long-tail-review-2026-08-27',now(),'deterministic_typo_review',1.0000,array['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?audience=professional&setid=31b50718-cc60-460d-aad7-b9620970d411']),
('isoleucin','isoleucine','Isoleucine','orthographic language variant only','p1-long-tail-review-2026-08-27',now(),'orthographic_variant_review',0.9990,array['https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cc2ace81-5881-43f1-ba94-41b674adc2fc']),
('piperacillinassodiumsalt','piperacillinsodium','Piperacillin sodium','same sodium salt expressed in parenthetical wording','p1-long-tail-review-2026-08-27',now(),'expression_normalization_review',1.0000,array['https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=bc26ffd8-1a6e-4e16-91c1-ec67c928b3bf'])
on conflict (variant_key) do nothing;

select public.medindex_refresh_product_ingredients_v1();

do $$
declare n bigint;
begin
  select count(*) into n
  from public.product_ingredient_resolution_v1
  where resolution_status='NEEDS_REVIEW';
  if n >= 366 then
    raise exception 'P1.8 long-tail concepts did not improve review coverage: %',n;
  end if;
end $$;
